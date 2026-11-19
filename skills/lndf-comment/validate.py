#!/usr/bin/env python3
"""lndf-comment validator.

Usage:
    python3 validate.py <file-or-dir> [...] [--index out.json] [--today YYYY-MM-DD]
    python3 validate.py --commit-msg <COMMIT_EDITMSG> [--require] [--today YYYY-MM-DD]

Source mode checks every `@lndf:` line:
  1. kind is one of why-not / constraint / heuristic / temporal
  2. exactly one `|` separating value and reason, both non-empty
  3. temporal: value is ISO date (YYYY-MM-DD) and not in the past

Commit-msg mode checks `LNDF-<kind>:` trailers in a commit message:
  1. same kind set, same `<value> | <reason>` rule, plus `LNDF-ref: <id>` (no `|`)
  2. trailers must sit in the final paragraph (git only parses trailers there)
  3. --require: at least one LNDF trailer unless the commit is merge / revert /
     chore / style / docs

Exit 0 = PASS, 1 = FAIL. With --index, writes all @lndf: lines as JSON
(path, line, kind, value, reason) regardless of pass/fail.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

KINDS = ("why-not", "constraint", "heuristic", "temporal")

# Prefix match only; the comment marker before it (//, #, ;, --) is ignored
LINE_RE = re.compile(r"@lndf:(?P<kind>[a-z-]+)(?P<rest>.*)$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# @lndf:constraint target extensions | an allowlist so that binaries and dependencies are not read
# @lndf:why-not include .md | docs carry example lines whose temporal dates expire; judgments live in code, not in prose
EXTS = {
    ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".sql", ".sh",
    ".ahk", ".ahk2", ".ah2", ".css", ".html", ".yml", ".yaml", ".toml", ".json",
    ".kt", ".java", ".go", ".rs", ".c", ".h", ".cpp", ".cs", ".swift",
}
SKIP_DIRS = {".git", "node_modules", "dist", "build", ".venv", "__pycache__"}

# @lndf:constraint credential prefixes and field names | a key or token value must never reach a comment or a commit message
# @lndf:heuristic 12 chars after prefix | a bare prefix like "sk-ant-" may be discussed, a real key is far longer
SECRET_PATTERNS = [
    ("sk-*", re.compile(r"(?<![A-Za-z0-9])sk-(?:ant-)?[A-Za-z0-9_\-]{12,}")),
    ("xai-*", re.compile(r"(?<![A-Za-z0-9])xai-[A-Za-z0-9]{12,}")),
    ("pplx-*", re.compile(r"(?<![A-Za-z0-9])pplx-[A-Za-z0-9]{12,}")),
    ("ghp_*", re.compile(r"(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{12,}")),
    ("github_pat_*", re.compile(r"github_pat_[A-Za-z0-9_]{12,}")),
    ("xox*-*", re.compile(r"(?<![A-Za-z0-9])xox[bpa]-[A-Za-z0-9\-]{12,}")),
    ("xapp-*", re.compile(r"(?<![A-Za-z0-9])xapp-[A-Za-z0-9\-]{12,}")),
    ("AKIA*", re.compile(r"(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}")),
    ("JWT eyJ*", re.compile(r"(?<![A-Za-z0-9])eyJ[A-Za-z0-9_\-]{12,}")),
    ("key/token/secret/password = value", re.compile(
        r"(?i)(?:api[_-]?key|apikey|[a-z_]*_key|[a-z_]*token|secret|password|authorization)"
        r"\s*[:=]\s*['\"]?[A-Za-z0-9_\-./+]{8,}")),
]


# @lndf:heuristic C0 controls except tab, plus DEL | 2026-10-03 e07264e: a shell printf turned "\r" into a real CR inside a trailer and every check still passed
CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")


def find_control(text):
    m = CONTROL_RE.search(text)
    return f"U+{ord(m.group()):04X}" if m else None


def find_secret(text):
    for label, rx in SECRET_PATTERNS:
        if rx.search(text):
            return label
    return None


def iter_files(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, files in os.walk(p):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                for f in files:
                    if os.path.splitext(f)[1] in EXTS:
                        yield os.path.join(root, f)
        else:
            yield p


def check_line(path, lineno, text, today):
    m = LINE_RE.search(text)
    if not m:
        return None, []
    kind = m.group("kind")
    rest = m.group("rest").strip()
    # strip a closing comment marker (*/ --> )
    rest = re.sub(r"\s*(\*/|-->)\s*$", "", rest)
    # @lndf:why-not report other errors too | their messages echo the value, which would print the secret
    label = find_secret(rest)
    if label:
        entry = {"path": path, "line": lineno, "kind": kind, "value": "[REDACTED]", "reason": "[REDACTED]"}
        return entry, [f"possible secret ({label}) in @lndf line; value not shown. Remove it from the comment"]
    errors = []
    ctrl = find_control(rest)
    if ctrl:
        errors.append(f"control character {ctrl} inside the line; an escape was probably expanded by the shell")
    if kind not in KINDS:
        errors.append(f"unknown kind '{kind}' (allowed: {', '.join(KINDS)})")
    parts = rest.split("|")
    if len(parts) != 2:
        errors.append(f"expected exactly one '|', found {len(parts) - 1}")
        value, reason = rest, ""
    else:
        value, reason = parts[0].strip(), parts[1].strip()
        if not value:
            errors.append("empty value (left of '|')")
        if not reason:
            errors.append("empty reason (right of '|')")
    if kind == "temporal" and len(parts) == 2:
        if not DATE_RE.match(value):
            errors.append(f"temporal value must be YYYY-MM-DD, got '{value}'")
        else:
            try:
                d = dt.date.fromisoformat(value)
                if d < today:
                    errors.append(f"temporal deadline {value} has passed")
            except ValueError:
                errors.append(f"invalid date '{value}'")
    entry = {"path": path, "line": lineno, "kind": kind, "value": value, "reason": reason}
    return entry, errors


# ---------------------------------------------------------------- commit-msg mode

# @lndf:constraint git trailer syntax | key = token without spaces, one trailer per line, block = last paragraph
# @lndf:why-not a single "LNDF:" key with the kind inside | per-kind keys let `git log --format=%(trailers:key=LNDF-temporal)` filter without grep
TRAILER_RE = re.compile(r"^(?P<key>LNDF-(?P<kind>[a-z-]+))\s*:\s*(?P<rest>.*)$", re.IGNORECASE)
# @lndf:constraint git commit template | lines starting with '#' are comments and are stripped before the message is stored
COMMENT_CHAR = "#"
# @lndf:heuristic merge/revert/chore/style/docs exempt | these commit shapes carry no design judgment by construction (Conventional Commits types)
EXEMPT_SUBJECT_RE = re.compile(r"^(?:Merge\b|Revert\b|(?:chore|style|docs)(?:\(.*?\))?!?:)", re.IGNORECASE)


def check_trailer_line(lineno, kind, rest, today):
    """Validate one LNDF-<kind>: line. Returns (entry, errors)."""
    rest = rest.strip()
    label = find_secret(rest)
    if label:
        entry = {"path": "<commit-msg>", "line": lineno, "kind": kind, "value": "[REDACTED]", "reason": "[REDACTED]"}
        return entry, [f"possible secret ({label}) in LNDF trailer; value not shown. Remove it"]
    errors = []
    ctrl = find_control(rest)
    if ctrl:
        errors.append(f"control character {ctrl} inside the trailer; a shell escape was probably expanded. Write the message to a file and use git commit -F")
    if kind == "ref":
        # @lndf:why-not require memory:NNN only | refs may point at spec ids, URLs or commit SHAs; only emptiness and a pipe are wrong here
        if not rest:
            errors.append("empty LNDF-ref value (expected memory:NNN, spec id, URL or SHA)")
        if "|" in rest:
            errors.append("LNDF-ref takes a bare id, not 'value | reason'")
        return {"path": "<commit-msg>", "line": lineno, "kind": kind, "value": rest, "reason": ""}, errors
    if kind not in KINDS:
        errors.append(f"unknown trailer kind '{kind}' (allowed: {', '.join(KINDS)}, ref)")
    parts = rest.split("|")
    if len(parts) != 2:
        errors.append(f"expected exactly one '|', found {len(parts) - 1}")
        value, reason = rest, ""
    else:
        value, reason = parts[0].strip(), parts[1].strip()
        if not value:
            errors.append("empty value (left of '|')")
        if not reason:
            errors.append("empty reason (right of '|')")
    if kind == "temporal" and len(parts) == 2:
        if not DATE_RE.match(value):
            errors.append(f"temporal value must be YYYY-MM-DD, got '{value}'")
        else:
            try:
                if dt.date.fromisoformat(value) < today:
                    errors.append(f"temporal deadline {value} has passed")
            except ValueError:
                errors.append(f"invalid date '{value}'")
    return {"path": "<commit-msg>", "line": lineno, "kind": kind, "value": value, "reason": reason}, errors


def check_commit_msg(text, today, require):
    """Return (entries, failures) for a whole commit message."""
    # @lndf:why-not splitlines() | it also breaks on a lone CR, which cuts a corrupted trailer in two and lets both halves pass
    raw_lines = [l[:-1] if l.endswith("\r") else l for l in text.split("\n")]
    # drop git comment lines and trailing blank lines, keep line numbers of what remains
    lines = [(i, l) for i, l in enumerate(raw_lines, 1) if not l.startswith(COMMENT_CHAR)]
    while lines and not lines[-1][1].strip():
        lines.pop()
    if not lines:
        return [], ["empty commit message"]

    # locate the final paragraph (git's trailer block candidate)
    last_start = len(lines)
    for idx in range(len(lines) - 1, -1, -1):
        if not lines[idx][1].strip():
            break
        last_start = idx
    final_block = lines[last_start:]
    body = lines[:last_start]

    entries, failures = [], []
    for lineno, l in final_block:
        m = TRAILER_RE.match(l.strip())
        if not m:
            continue
        entry, errs = check_trailer_line(lineno, m.group("kind").lower(), m.group("rest"), today)
        entries.append(entry)
        failures += [f"<commit-msg>:{lineno}: {e}" for e in errs]

    # LNDF lines outside the final paragraph are invisible to git's trailer parser
    for lineno, l in body:
        if TRAILER_RE.match(l.strip()):
            failures.append(f"<commit-msg>:{lineno}: LNDF trailer outside the final paragraph; git will not parse it. Move it to the end")

    # @lndf:why-not treat the subject line as the whole paragraph | a one-line message is both subject and final block; a trailer there is still valid git, so no special case
    if require and not entries:
        subject = lines[0][1].strip()
        if not EXEMPT_SUBJECT_RE.match(subject):
            failures.append("<commit-msg>: --require: no LNDF-* trailer (add one, or use an exempt type: merge/revert/chore/style/docs)")
    return entries, failures


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--index", help="write all @lndf: lines to this JSON file")
    ap.add_argument("--today", help="override today's date (YYYY-MM-DD)")
    ap.add_argument("--commit-msg", metavar="FILE", help="validate LNDF trailers in a commit message file (git commit-msg hook)")
    ap.add_argument("--require", action="store_true", help="with --commit-msg: fail when no LNDF trailer is present (exempt: merge/revert/chore/style/docs)")
    args = ap.parse_args(argv)

    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()

    if args.commit_msg:
        if args.paths:
            ap.error("--commit-msg takes no source paths")
        try:
            # @lndf:constraint Python universal newlines | the default open() turns a lone CR into a line break, hiding it from the control-character check
            with open(args.commit_msg, encoding="utf-8", errors="replace", newline="") as fh:
                text = fh.read()
        except OSError as ex:
            print(f"{args.commit_msg}: cannot read ({ex})", file=sys.stderr)
            return 1
        entries, failures = check_commit_msg(text, today, args.require)
        for f in failures:
            print(f, file=sys.stderr)
        kinds = sorted({e["kind"] for e in entries})
        if failures:
            print(f"FAIL ({len(failures)} issue(s); {len(entries)} LNDF trailer(s): {', '.join(kinds) or '-'})")
            return 1
        print(f"PASS ({len(entries)} LNDF trailer(s): {', '.join(kinds) or '-'})")
        return 0

    if not args.paths:
        ap.error("give source paths, or --commit-msg FILE")
    entries, failures = [], []

    for path in iter_files(args.paths):
        try:
            with open(path, encoding="utf-8", errors="replace") as fh:
                for i, line in enumerate(fh, 1):
                    entry, errs = check_line(path, i, line.rstrip("\n"), today)
                    if entry is None:
                        continue
                    entries.append(entry)
                    for e in errs:
                        failures.append(f"{path}:{i}: {e}")
        except OSError as ex:
            failures.append(f"{path}: cannot read ({ex})")

    if args.index:
        with open(args.index, "w", encoding="utf-8") as fh:
            json.dump(entries, fh, ensure_ascii=False, indent=2)

    for f in failures:
        print(f, file=sys.stderr)
    counts = {k: sum(1 for e in entries if e["kind"] == k) for k in KINDS}
    summary = ", ".join(f"{k}={v}" for k, v in counts.items())
    if failures:
        print(f"FAIL ({len(failures)} issue(s); {len(entries)} lndf line(s): {summary})")
        return 1
    print(f"PASS ({len(entries)} lndf line(s): {summary})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
