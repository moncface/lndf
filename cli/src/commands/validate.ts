// `lndf validate`: a port of skills/lndf-comment/validate.py, which stays the
// source of truth. Same rules, same messages, same exit codes. This file is the
// pure core; reading files, walking directories and printing live in ../cli.ts.

export const KINDS = ["why-not", "constraint", "heuristic", "temporal"] as const;

// @lndf:constraint EXTS and SKIP_DIRS copied from validate.py | a directory run must pick the same files as the reference validator
export const EXTS: ReadonlySet<string> = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".sql", ".sh",
  ".ahk", ".ahk2", ".ah2", ".css", ".html", ".yml", ".yaml", ".toml", ".json",
  ".kt", ".java", ".go", ".rs", ".c", ".h", ".cpp", ".cs", ".swift",
]);
export const SKIP_DIRS: ReadonlySet<string> = new Set([".git", "node_modules", "dist", "build", ".venv", "__pycache__"]);

export interface Entry {
  path: string;
  line: number;
  kind: string;
  value: string;
  reason: string;
}

export interface CheckResult {
  entries: Entry[];
  failures: string[];
}

// ---------------------------------------------------------------- Python regex semantics

// @lndf:constraint the whitespace set of Python's \s and str.strip() | JS \s and trim() differ: they remove U+FEFF and keep U+001C-U+001F and U+0085
const WS = "[\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]";
const LEAD_WS = new RegExp(`^${WS}+`, "u");
const TRAIL_WS = new RegExp(`${WS}+$`, "u");

export function pyStrip(s: string): string {
  return s.replace(LEAD_WS, "").replace(TRAIL_WS, "");
}

// @lndf:constraint extra matches of Python re.IGNORECASE | i also matches U+0130 and U+0131, k matches U+212A, s matches U+017F; the JS i flag does not
const FOLDS: Readonly<Record<string, string>> = { i: "iI\\u0130\\u0131", k: "kK\\u212a", s: "sS\\u017f" };
const LETTERS_I = "A-Za-z\\u0130\\u0131\\u017f\\u212a";

function ci(word: string): string {
  return [...word].map((c) => (/[a-z]/.test(c) ? `[${FOLDS[c] ?? c + c.toUpperCase()}]` : c)).join("");
}

// @lndf:why-not the JS dot | it stops at CR, U+2028 and U+2029, where Python's dot stops only at LF
const DOT = "[^\\n]";
// @lndf:constraint Python \b is Unicode-aware | after Merge or Revert a letter, digit or underscore means no word boundary
const WORD_END = "(?![\\p{L}\\p{N}_])";

const LINE_RE = new RegExp(`@lndf:([a-z-]+)(${DOT}*)$`, "u");
// @lndf:constraint Python \d is Unicode Nd | a date in fullwidth digits passes this check and then fails as an invalid date, as in validate.py
const DATE_RE = /^\p{Nd}{4}-\p{Nd}{2}-\p{Nd}{2}$/u;
const COMMENT_CLOSE_RE = new RegExp(`${WS}*(?:\\*/|-->)${WS}*$`, "u");
const CONTROL_RE = /[\x00-\x08\x0b-\x1f\x7f]/u;

const NO_ALNUM_BEFORE = "(?<![A-Za-z0-9])";
const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["sk-*", new RegExp(`${NO_ALNUM_BEFORE}sk-(?:ant-)?[A-Za-z0-9_\\-]{12,}`, "u")],
  ["xai-*", new RegExp(`${NO_ALNUM_BEFORE}xai-[A-Za-z0-9]{12,}`, "u")],
  ["pplx-*", new RegExp(`${NO_ALNUM_BEFORE}pplx-[A-Za-z0-9]{12,}`, "u")],
  ["ghp_*", new RegExp(`${NO_ALNUM_BEFORE}ghp_[A-Za-z0-9]{12,}`, "u")],
  ["github_pat_*", new RegExp("github_pat_[A-Za-z0-9_]{12,}", "u")],
  ["xox*-*", new RegExp(`${NO_ALNUM_BEFORE}xox[bpa]-[A-Za-z0-9\\-]{12,}`, "u")],
  ["xapp-*", new RegExp(`${NO_ALNUM_BEFORE}xapp-[A-Za-z0-9\\-]{12,}`, "u")],
  ["AKIA*", new RegExp(`${NO_ALNUM_BEFORE}AKIA[0-9A-Z]{16}`, "u")],
  ["JWT eyJ*", new RegExp(`${NO_ALNUM_BEFORE}eyJ[A-Za-z0-9_\\-]{12,}`, "u")],
  ["key/token/secret/password = value", new RegExp(
    "(?:" + [
      `${ci("api")}[_-]?${ci("key")}`,
      ci("apikey"),
      `[${LETTERS_I}_]*_${ci("key")}`,
      `[${LETTERS_I}_]*${ci("token")}`,
      ci("secret"),
      ci("password"),
      ci("authorization"),
    ].join("|") + ")" +
    `${WS}*[:=]${WS}*['"]?[${LETTERS_I}0-9_\\-./+]{8,}`, "u")],
];

const TRAILER_RE = new RegExp(`^(${ci("lndf")}-([${LETTERS_I}-]+))${WS}*:${WS}*(${DOT}*)$`, "u");
const COMMENT_CHAR = "#";
const EXEMPT_SUBJECT_RE = new RegExp(
  `^(?:${ci("merge")}${WORD_END}|${ci("revert")}${WORD_END}|(?:${ci("chore")}|${ci("style")}|${ci("docs")})(?:\\(${DOT}*?\\))?!?:)`, "u");

function findControl(text: string): string | null {
  const m = CONTROL_RE.exec(text);
  if (!m) return null;
  return "U+" + m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
}

function findSecret(text: string): string | null {
  for (const [label, rx] of SECRET_PATTERNS) {
    if (rx.test(text)) return label;
  }
  return null;
}

// ---------------------------------------------------------------- dates

/** True for YYYY-MM-DD in ASCII digits naming a real day from 0001-01-01 on. */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1] ?? 0;
  return d <= days;
}

// ---------------------------------------------------------------- shared line checks

function checkValueReason(kind: string, rest: string, today: string, errors: string[]): [string, string] {
  const parts = rest.split("|");
  if (parts.length !== 2) {
    errors.push(`expected exactly one '|', found ${parts.length - 1}`);
    return [rest, ""];
  }
  const value = pyStrip(parts[0] ?? "");
  const reason = pyStrip(parts[1] ?? "");
  if (!value) errors.push("empty value (left of '|')");
  if (!reason) errors.push("empty reason (right of '|')");
  if (kind === "temporal") {
    if (!DATE_RE.test(value)) {
      errors.push(`temporal value must be YYYY-MM-DD, got '${value}'`);
    } else if (!isIsoDate(value)) {
      errors.push(`invalid date '${value}'`);
    } else if (value < today) {
      errors.push(`temporal deadline ${value} has passed`);
    }
  }
  return [value, reason];
}

function isKind(kind: string): boolean {
  return (KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------- source mode

export function checkLine(path: string, lineno: number, text: string, today: string): { entry: Entry; errors: string[] } | null {
  const m = LINE_RE.exec(text);
  if (!m) return null;
  const kind = m[1] ?? "";
  const rest = pyStrip(m[2] ?? "").replace(COMMENT_CLOSE_RE, "");
  const label = findSecret(rest);
  if (label) {
    return {
      entry: { path, line: lineno, kind, value: "[REDACTED]", reason: "[REDACTED]" },
      errors: [`possible secret (${label}) in @lndf line; value not shown. Remove it from the comment`],
    };
  }
  const errors: string[] = [];
  const ctrl = findControl(rest);
  if (ctrl) errors.push(`control character ${ctrl} inside the line; an escape was probably expanded by the shell`);
  if (!isKind(kind)) errors.push(`unknown kind '${kind}' (allowed: ${KINDS.join(", ")})`);
  const [value, reason] = checkValueReason(kind, rest, today, errors);
  return { entry: { path, line: lineno, kind, value, reason }, errors };
}

/** Lines as Python's universal-newline reader yields them, without the line break. */
export function splitSourceLines(text: string): string[] {
  if (text === "") return [];
  // @lndf:why-not splitting on U+2028, U+0085 or U+001C-U+001E | Python's file reader breaks lines only at CR, LF and CRLF
  const lines = text.split(/\r\n|\r|\n/);
  if (text.endsWith("\n") || text.endsWith("\r")) lines.pop();
  return lines;
}

export function checkSourceText(path: string, text: string, today: string): CheckResult {
  const entries: Entry[] = [];
  const failures: string[] = [];
  splitSourceLines(text).forEach((line, i) => {
    const r = checkLine(path, i + 1, line, today);
    if (!r) return;
    entries.push(r.entry);
    for (const e of r.errors) failures.push(`${path}:${i + 1}: ${e}`);
  });
  return { entries, failures };
}

export function sourceSummary(r: CheckResult): string {
  const counts = KINDS.map((k) => `${k}=${r.entries.filter((e) => e.kind === k).length}`).join(", ");
  return r.failures.length
    ? `FAIL (${r.failures.length} issue(s); ${r.entries.length} lndf line(s): ${counts})`
    : `PASS (${r.entries.length} lndf line(s): ${counts})`;
}

/** True when a directory walk should read a file of this name. */
export function isSourceName(name: string): boolean {
  return EXTS.has(pySplitExt(name));
}

// @lndf:constraint os.path.splitext on a bare file name | leading dots do not start an extension, so ".js" and "..js" have none
function pySplitExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "";
  for (let i = 0; i < dot; i++) {
    if (name[i] !== ".") return name.slice(dot);
  }
  return "";
}

// ---------------------------------------------------------------- commit-msg mode

const COMMIT_PATH = "<commit-msg>";

function checkTrailerLine(lineno: number, kind: string, restRaw: string, today: string): { entry: Entry; errors: string[] } {
  const rest = pyStrip(restRaw);
  const label = findSecret(rest);
  if (label) {
    return {
      entry: { path: COMMIT_PATH, line: lineno, kind, value: "[REDACTED]", reason: "[REDACTED]" },
      errors: [`possible secret (${label}) in LNDF trailer; value not shown. Remove it`],
    };
  }
  const errors: string[] = [];
  const ctrl = findControl(rest);
  if (ctrl) {
    errors.push(`control character ${ctrl} inside the trailer; a shell escape was probably expanded. Write the message to a file and use git commit -F`);
  }
  if (kind === "ref") {
    if (!rest) errors.push("empty LNDF-ref value (expected memory:NNN, spec id, URL or SHA)");
    if (rest.includes("|")) errors.push("LNDF-ref takes a bare id, not 'value | reason'");
    return { entry: { path: COMMIT_PATH, line: lineno, kind, value: rest, reason: "" }, errors };
  }
  if (!isKind(kind)) errors.push(`unknown trailer kind '${kind}' (allowed: ${KINDS.join(", ")}, ref)`);
  const [value, reason] = checkValueReason(kind, rest, today, errors);
  return { entry: { path: COMMIT_PATH, line: lineno, kind, value, reason }, errors };
}

export function checkCommitMsg(text: string, today: string, require: boolean): CheckResult {
  // @lndf:why-not splitting on every line break | a lone CR inside a trailer must stay in the line so the control-character check sees it
  const raw = text.split("\n").map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  const lines: Array<[number, string]> = [];
  raw.forEach((l, i) => {
    if (!l.startsWith(COMMENT_CHAR)) lines.push([i + 1, l]);
  });
  while (lines.length && !pyStrip(lines[lines.length - 1]?.[1] ?? "")) lines.pop();
  if (!lines.length) return { entries: [], failures: ["empty commit message"] };

  let lastStart = lines.length;
  for (let idx = lines.length - 1; idx >= 0; idx--) {
    if (!pyStrip(lines[idx]?.[1] ?? "")) break;
    lastStart = idx;
  }

  const entries: Entry[] = [];
  const failures: string[] = [];
  for (const [lineno, l] of lines.slice(lastStart)) {
    const m = TRAILER_RE.exec(pyStrip(l));
    if (!m) continue;
    const r = checkTrailerLine(lineno, (m[2] ?? "").toLowerCase(), m[3] ?? "", today);
    entries.push(r.entry);
    for (const e of r.errors) failures.push(`${COMMIT_PATH}:${lineno}: ${e}`);
  }
  for (const [lineno, l] of lines.slice(0, lastStart)) {
    if (TRAILER_RE.test(pyStrip(l))) {
      failures.push(`${COMMIT_PATH}:${lineno}: LNDF trailer outside the final paragraph; git will not parse it. Move it to the end`);
    }
  }
  if (require && !entries.length) {
    const subject = pyStrip(lines[0]?.[1] ?? "");
    if (!EXEMPT_SUBJECT_RE.test(subject)) {
      failures.push(`${COMMIT_PATH}: --require: no LNDF-* trailer (add one, or use an exempt type: merge/revert/chore/style/docs)`);
    }
  }
  return { entries, failures };
}

export function commitSummary(r: CheckResult): string {
  const kinds = [...new Set(r.entries.map((e) => e.kind))].sort().join(", ") || "-";
  return r.failures.length
    ? `FAIL (${r.failures.length} issue(s); ${r.entries.length} LNDF trailer(s): ${kinds})`
    : `PASS (${r.entries.length} LNDF trailer(s): ${kinds})`;
}

// ---------------------------------------------------------------- Python repr()

const NON_PRINTABLE_RE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u;

function hex(cp: number, width: number): string {
  return cp.toString(16).padStart(width, "0");
}

/** repr() of a Python str, as it appears in OSError and argparse messages. */
export function pyRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === quote || ch === "\\") out += "\\" + ch;
    else if (ch === "\t") out += "\\t";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (cp < 0x20 || cp === 0x7f) out += "\\x" + hex(cp, 2);
    else if (cp < 0x7f || !NON_PRINTABLE_RE.test(ch)) out += ch;
    else if (cp <= 0xff) out += "\\x" + hex(cp, 2);
    else if (cp <= 0xffff) out += "\\u" + hex(cp, 4);
    else out += "\\U" + hex(cp, 8);
  }
  return out + quote;
}

// ---------------------------------------------------------------- arguments

export type ValidateArgs =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "run"; paths: string[]; index: string; today: string; commitMsg: string; require: boolean };

type ValueOption = "index" | "today" | "commitMsg";
const VALUE_OPTIONS: ReadonlyMap<string, ValueOption> = new Map([
  ["--index", "index"], ["--today", "today"], ["--commit-msg", "commitMsg"],
]);
const FLAG_NAMES: ReadonlyMap<string, string> = new Map([
  ["--require", "--require"], ["-h", "-h/--help"], ["--help", "-h/--help"],
]);
// @lndf:constraint argparse negative-number test | "-1" and "-.5" are read as paths, not as unknown options
const NEGATIVE_NUMBER_RE = /^-\p{Nd}+\n?$|^-\p{Nd}*\.\p{Nd}+\n?$/u;

interface OptionToken {
  name: string; // "" for an unknown option
  explicit: string | undefined; // the value after "=", if any
}

function isKnownOption(name: string): boolean {
  return VALUE_OPTIONS.has(name) || FLAG_NAMES.has(name);
}

// @lndf:why-not argparse prefix abbreviations such as --tod | only the full option names are documented
function classify(tok: string): OptionToken | null {
  if (tok === "" || tok[0] !== "-") return null;
  if (isKnownOption(tok)) return { name: tok, explicit: undefined };
  if (tok.length === 1) return null;
  const eq = tok.indexOf("=");
  if (eq >= 0 && isKnownOption(tok.slice(0, eq))) return { name: tok.slice(0, eq), explicit: tok.slice(eq + 1) };
  if (NEGATIVE_NUMBER_RE.test(tok)) return null;
  if (tok.includes(" ")) return null;
  return { name: "", explicit: undefined };
}

/**
 * Parse `lndf validate` arguments the way validate.py's argparse setup does:
 * one run of positional paths, options before or after it, "--" ending options,
 * the last repeated option winning, and the same error messages.
 */
export function parseValidateArgs(argv: readonly string[]): ValidateArgs {
  const opts: (OptionToken | null)[] = [];
  let dashIndex = -1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--" && dashIndex < 0) {
      dashIndex = i;
      for (let j = i; j < argv.length; j++) opts.push(null);
      break;
    }
    opts.push(classify(argv[i] ?? ""));
  }

  const values: Record<ValueOption, string> = { index: "", today: "", commitMsg: "" };
  let require = false;
  let paths: string[] | null = null;
  const extras: string[] = [];

  const positionalRun = (from: number, to: number): string[] => {
    const run = argv.slice(from, to);
    if (dashIndex >= from && dashIndex < to) run.splice(dashIndex - from, 1);
    return run;
  };

  let maxOption = -1;
  opts.forEach((o, i) => {
    if (o) maxOption = i;
  });

  let i = 0;
  while (i <= maxOption) {
    let next = i;
    while (!opts[next]) next++;
    if (i !== next) {
      if (paths === null) {
        paths = positionalRun(i, next);
      } else {
        extras.push(...argv.slice(i, next));
      }
      i = next;
      continue;
    }
    const opt = opts[i] as OptionToken;
    if (!opt.name) {
      extras.push(argv[i] ?? "");
      i++;
      continue;
    }
    const valueKey = VALUE_OPTIONS.get(opt.name);
    if (valueKey) {
      if (opt.explicit !== undefined) {
        values[valueKey] = opt.explicit;
        i++;
      } else if (i + 1 < argv.length && opts[i + 1] === null && i + 1 !== dashIndex) {
        values[valueKey] = argv[i + 1] ?? "";
        i += 2;
      } else {
        return { kind: "error", message: `argument ${opt.name}: expected one argument` };
      }
      continue;
    }
    const flagName = FLAG_NAMES.get(opt.name) ?? opt.name;
    if (opt.explicit !== undefined) {
      return { kind: "error", message: `argument ${flagName}: ignored explicit argument ${pyRepr(opt.explicit)}` };
    }
    if (flagName === "-h/--help") return { kind: "help" };
    require = true;
    i++;
  }
  if (paths === null) {
    paths = positionalRun(i, argv.length);
  } else {
    extras.push(...argv.slice(i));
  }
  if (extras.length) return { kind: "error", message: `unrecognized arguments: ${extras.join(" ")}` };

  // @lndf:why-not accepting every date.fromisoformat form for --today | only YYYY-MM-DD is documented, and a bad value is a usage error (exit 2) rather than validate.py's traceback (exit 1)
  if (values.today && !isIsoDate(values.today)) {
    return { kind: "error", message: `argument --today: invalid date ${pyRepr(values.today)} (expected YYYY-MM-DD)` };
  }
  const found: string[] = paths;
  if (values.commitMsg && found.length) return { kind: "error", message: "--commit-msg takes no source paths" };
  if (!values.commitMsg && !found.length) return { kind: "error", message: "give source paths, or --commit-msg FILE" };
  return { kind: "run", paths: found, index: values.index, today: values.today, commitMsg: values.commitMsg, require };
}
