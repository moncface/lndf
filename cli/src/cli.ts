#!/usr/bin/env node
// The lndf command line. This adapter owns everything that touches the
// platform: arguments, files, the directory walk, output and the exit status.
// The rules themselves live in ./commands/validate.ts.

import { lstatSync, opendirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import {
  checkCommitMsg,
  checkSourceText,
  commitSummary,
  isSourceName,
  parseValidateArgs,
  pyRepr,
  SKIP_DIRS,
  sourceSummary,
} from "./commands/validate.js";
import type { Entry } from "./commands/validate.js";

const USAGE =
  "usage: lndf validate <file-or-dir>... [--index out.json] [--today YYYY-MM-DD]\n" +
  "       lndf validate --commit-msg <file> [--require] [--today YYYY-MM-DD]";

const HELP = `lndf: check LNDF judgment records

Usage:
  lndf validate <file-or-dir>... [--index out.json] [--today YYYY-MM-DD]
  lndf validate --commit-msg <file> [--require] [--today YYYY-MM-DD]
  lndf --help | --version

Source files: every line that contains @lndf:<kind> is checked for a known
kind (why-not, constraint, heuristic, temporal), exactly one "|" between value
and reason, and a temporal date that has not passed. A directory is searched
for files with a known source extension; a path given directly is read as
source whatever its extension.

Commit messages: the "LNDF-<kind>: <value> | <reason>" and "LNDF-ref: <id>"
trailers in the final paragraph are checked. .lndf files use the trailer
grammar, so pass them with --commit-msg, not as a path.

Options:
  --index FILE         write every @lndf: line as JSON (path, line, kind,
                       value, reason), whether or not the check passes
  --today YYYY-MM-DD   compare temporal dates with this day instead of
                       today's local date
  --commit-msg FILE    check a commit message or a .lndf file
  --require            with --commit-msg, fail when there is no trailer,
                       unless the subject starts with Merge, Revert, chore:,
                       style: or docs:
  -h, --help           show this help

lndf --version prints the version.

Exit status: 0 = PASS, 1 = FAIL, 2 = usage error.
`;

function out(line: string): void {
  process.stdout.write(line + "\n");
}

function err(line: string): void {
  process.stderr.write(line + "\n");
}

function usageError(message: string): number {
  err(`${USAGE}\nlndf validate: error: ${message}`);
  return 2;
}

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

// @lndf:constraint today is the local calendar date | validate.py uses date.today(), which is local time, not UTC
function localToday(): string {
  const d = new Date();
  const pad = (n: number, w: number): string => String(n).padStart(w, "0");
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

// ---------------------------------------------------------------- files

// @lndf:constraint keep a leading BOM | validate.py reads with encoding utf-8, which leaves U+FEFF in the first line
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

function readText(path: string): string {
  return decoder.decode(readFileSync(path));
}

const ERRNO: Readonly<Record<string, string>> = {
  ENOENT: "[Errno 2] No such file or directory",
  EACCES: "[Errno 13] Permission denied",
  EPERM: "[Errno 1] Operation not permitted",
  ENOTDIR: "[Errno 20] Not a directory",
  EINVAL: "[Errno 22] Invalid argument",
  EISDIR: "[Errno 21] Is a directory",
};

// @lndf:heuristic map Node error codes to the text of Python's OSError | messages stay identical for the common cases; any other code falls back to Node's own message
function osError(e: unknown, path: string): string {
  let code = (e as { code?: unknown } | null)?.code;
  if (process.platform === "win32" && (code === "EISDIR" || code === "EPERM" || code === "EBUSY")) {
    // On Windows, Python reports a directory, a denied file and a locked file all as EACCES.
    code = "EACCES";
  }
  const text = typeof code === "string" ? ERRNO[code] : undefined;
  if (text) return `${text}: ${pyRepr(path)}`;
  return e instanceof Error ? e.message : String(e);
}

// @lndf:constraint join the way os.path.join does | reported paths and the index must match validate.py byte for byte
function pyJoin(a: string, b: string): string {
  if (process.platform === "win32") {
    if (a.endsWith("/") || a.endsWith("\\") || /^[A-Za-z]:$/.test(a)) return a + b;
    return a + "\\" + b;
  }
  return a.endsWith("/") ? a + b : a + "/" + b;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// @lndf:constraint mimic os.walk: files of a directory first, then its subdirectories, in the order the file system lists them | the index lists entries in the same order as validate.py's
function* walk(root: string): Generator<string> {
  const files: string[] = [];
  const dirs: string[] = [];
  try {
    // @lndf:why-not readdirSync | it sorts names on some platforms, and os.walk keeps the raw listing order
    const dir = opendirSync(root);
    try {
      for (let ent = dir.readSync(); ent; ent = dir.readSync()) {
        if (isDir(pyJoin(root, ent.name))) dirs.push(ent.name);
        else files.push(ent.name);
      }
    } finally {
      dir.closeSync();
    }
  } catch {
    // @lndf:constraint a directory that cannot be listed is skipped without a message | os.walk without onerror does the same
    return;
  }
  for (const f of files) {
    if (isSourceName(f)) yield pyJoin(root, f);
  }
  for (const d of dirs) {
    if (SKIP_DIRS.has(d)) continue;
    const p = pyJoin(root, d);
    // @lndf:constraint do not descend into symlinked directories | os.walk defaults to followlinks=False; Node also reports a Windows junction as a link, where os.walk would enter it
    if (isSymlink(p)) continue;
    yield* walk(p);
  }
}

function* iterFiles(paths: readonly string[]): Generator<string> {
  for (const p of paths) {
    if (isDir(p)) yield* walk(p);
    else yield p;
  }
}

// ---------------------------------------------------------------- validate

function runCommitMsg(file: string, today: string, require: boolean): number {
  let text: string;
  try {
    text = readText(file);
  } catch (e) {
    err(`${file}: cannot read (${osError(e, file)})`);
    return 1;
  }
  const r = checkCommitMsg(text, today, require);
  for (const f of r.failures) err(f);
  out(commitSummary(r));
  return r.failures.length ? 1 : 0;
}

function runSource(paths: readonly string[], index: string, today: string): number {
  const entries: Entry[] = [];
  const failures: string[] = [];
  for (const p of iterFiles(paths)) {
    let text: string;
    try {
      text = readText(p);
    } catch (e) {
      failures.push(`${p}: cannot read (${osError(e, p)})`);
      continue;
    }
    const r = checkSourceText(p, text, today);
    entries.push(...r.entries);
    failures.push(...r.failures);
  }
  if (index) {
    try {
      // @lndf:constraint the index is written with LF and no final newline | json.dump with indent=2 writes no final newline; only its CRLF on Windows is not copied
      writeFileSync(index, JSON.stringify(entries, null, 2), "utf8");
    } catch (e) {
      // @lndf:why-not a stack trace when the index cannot be written | validate.py crashes here; a one-line message with exit 1 says the same
      err(`${index}: cannot write (${osError(e, index)})`);
      return 1;
    }
  }
  for (const f of failures) err(f);
  const r = { entries, failures };
  out(sourceSummary(r));
  return failures.length ? 1 : 0;
}

function runValidate(args: readonly string[]): number {
  const parsed = parseValidateArgs(args);
  if (parsed.kind === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (parsed.kind === "error") return usageError(parsed.message);
  const today = parsed.today || localToday();
  return parsed.commitMsg
    ? runCommitMsg(parsed.commitMsg, today, parsed.require)
    : runSource(parsed.paths, parsed.index, today);
}

function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  if (command === "--version") {
    out(version());
    return 0;
  }
  if (command === "-h" || command === "--help") {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === "validate") return runValidate(rest);
  return usageError(command === undefined ? "no command given (see lndf --help)" : `unknown command ${pyRepr(command)} (see lndf --help)`);
}

// @lndf:why-not process.exit() | it can cut off output still buffered for a pipe; setting exitCode lets Node flush first
process.exitCode = main(process.argv.slice(2));
