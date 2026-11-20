// `lndf parse`: print LNDF judgment records as JSON without checking them.
// It reads lines with the same parts as validate.ts, so a line validate accepts
// is a line parse prints. This file is the pure core; reading files, running
// git and printing live in ../cli.ts.

import { checkLine, OUTSIDE_FINAL_PARAGRAPH, scanCommitMsg, splitSourceLines } from "./validate.js";
import type { Entry, LineResult } from "./validate.js";

export interface GitRecord {
  commit: string;
  date: string;
  subject: string;
  line: number;
  kind: string;
  value: string;
  reason: string;
}

export interface ParseResult<T> {
  records: T[];
  /** One stderr line per line left out. */
  skipped: string[];
}

// @lndf:constraint today is the empty string | every date compares greater than "", so no deadline check runs and an expired temporal is kept
const NO_DEADLINE = "";

/** Why a line is left out, or null when it is printed. */
function skipReason(r: LineResult): string | null {
  if (r.secret) {
    // @lndf:why-not the shape messages for a line with a secret | a temporal message quotes the value, which may be the secret
    return r.shape.length ? `possible secret (${r.secret}) in a malformed line; value not shown` : null;
  }
  return r.shape.length ? r.shape.join("; ") : null;
}

export function skipLine(where: string, line: number, message: string): string {
  return `${where}:${line}: skipped: ${message}`;
}

/** The well-formed `@lndf:` lines of a source file, with the fields of validate --index. */
export function parseSource(path: string, text: string): ParseResult<Entry> {
  const records: Entry[] = [];
  const skipped: string[] = [];
  splitSourceLines(text).forEach((line, i) => {
    const r = checkLine(path, i + 1, line, NO_DEADLINE);
    if (!r) return;
    const why = skipReason(r);
    if (why === null) records.push(r.entry);
    else skipped.push(skipLine(path, i + 1, why));
  });
  return { records, skipped };
}

/**
 * The well-formed LNDF- trailers of one commit message or .lndf file, in the
 * order validate reads them. `where` names the message on stderr.
 */
function readTrailers(where: string, text: string): ParseResult<Entry> {
  const scan = scanCommitMsg(text, NO_DEADLINE);
  const records: Entry[] = [];
  const skipped: string[] = [];
  for (const r of scan.trailers) {
    const why = skipReason(r);
    if (why === null) records.push(r.entry);
    else skipped.push(skipLine(where, r.entry.line, why));
  }
  for (const lineno of scan.outside) skipped.push(skipLine(where, lineno, OUTSIDE_FINAL_PARAGRAPH));
  return { records, skipped };
}

/** --commit-msg: `path` is the file name as given, `line` its line number. */
export function parseCommitMsg(path: string, text: string): ParseResult<Entry> {
  const r = readTrailers(path, text);
  return { records: r.records.map((e) => ({ ...e, path })), skipped: r.skipped };
}

// ---------------------------------------------------------------- git

/** The four fields git log prints for each commit, in this order. */
const LOG_FORMAT = "--format=%H%x00%cI%x00%s%x00%B";

/** Arguments for git: committer date, subject and raw message of each commit, NUL-separated. */
export function gitLogArgs(range: string | null, maxCount: number | null): string[] {
  return [
    "--no-pager",
    // @lndf:constraint log.showSignature=false | with it set in the user's config, git log prints signature checks among the fields
    "-c", "log.showSignature=false",
    "log", "-z", "--no-color", "--no-notes", "--encoding=UTF-8", LOG_FORMAT,
    ...(maxCount === null ? [] : [`--max-count=${maxCount}`]),
    // @lndf:constraint --end-of-options before the range | a range that starts with "-" must not be read as an option (git 2.24 and later)
    "--end-of-options", range ?? "HEAD", "--",
  ];
}

export interface GitCommit {
  commit: string;
  date: string;
  subject: string;
  message: string;
}

const utf8 = new TextDecoder("utf-8");

/**
 * Split the output of git log -z with LOG_FORMAT into commits. Returns null
 * when the output does not have four fields per commit.
 */
export function splitGitLog(bytes: Uint8Array): GitCommit[] | null {
  // @lndf:constraint split the bytes on NUL before decoding | git refuses NUL inside a commit message, so NUL only separates fields, and no single string of the whole log is built
  const fields: string[] = [];
  let start = 0;
  for (let i = bytes.indexOf(0); i >= 0; i = bytes.indexOf(0, start)) {
    fields.push(utf8.decode(bytes.subarray(start, i)));
    start = i + 1;
  }
  fields.push(utf8.decode(bytes.subarray(start)));
  // Each commit ends with NUL, so a complete log has 4n fields and an empty last one.
  if (fields.length % 4 !== 1 || fields[fields.length - 1] !== "") return null;
  const commits: GitCommit[] = [];
  for (let i = 0; i + 4 < fields.length; i += 4) {
    commits.push({ commit: fields[i] ?? "", date: fields[i + 1] ?? "", subject: fields[i + 2] ?? "", message: fields[i + 3] ?? "" });
  }
  return commits;
}

/** --git: the well-formed trailers of each commit, newest commit first. Null when the log cannot be split. */
export function parseGitLog(bytes: Uint8Array): ParseResult<GitRecord> | null {
  const commits = splitGitLog(bytes);
  if (!commits) return null;
  const records: GitRecord[] = [];
  const skipped: string[] = [];
  for (const c of commits) {
    const r = readTrailers(c.commit, c.message);
    for (const e of r.records) {
      records.push({ commit: c.commit, date: c.date, subject: c.subject, line: e.line, kind: e.kind, value: e.value, reason: e.reason });
    }
    skipped.push(...r.skipped);
  }
  return { records, skipped };
}

// ---------------------------------------------------------------- arguments

export type ParseArgs =
  | { kind: "help" }
  | { kind: "error"; message: string }
  | { kind: "source"; paths: string[] }
  | { kind: "commit-msg"; file: string }
  | { kind: "git"; range: string | null; maxCount: number | null };

type ValueOption = "--commit-msg" | "--range" | "--max-count";
const VALUE_OPTIONS: ReadonlySet<string> = new Set<ValueOption>(["--commit-msg", "--range", "--max-count"]);
const FLAGS: ReadonlySet<string> = new Set(["--git", "-h", "--help"]);
const VALIDATE_ONLY: ReadonlySet<string> = new Set(["--index", "--today", "--require"]);

/**
 * Parse `lndf parse` arguments: `--x v` or `--x=v`, full option names only,
 * "--" ending the options.
 */
export function parseParseArgs(argv: readonly string[]): ParseArgs {
  const values = new Map<ValueOption, string>();
  const paths: string[] = [];
  let git = false;
  let help = false;
  let error: string | null = null;
  const fail = (message: string): void => {
    error ??= message;
  };

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i] ?? "";
    if (tok === "--") {
      paths.push(...argv.slice(i + 1));
      break;
    }
    // @lndf:constraint "-" and other tokens not starting with "-" are paths | validate reads them the same way
    if (tok.length < 2 || tok[0] !== "-") {
      paths.push(tok);
      continue;
    }
    const eq = tok.indexOf("=");
    const name = eq >= 0 ? tok.slice(0, eq) : tok;
    const explicit = eq >= 0 ? tok.slice(eq + 1) : undefined;
    if (VALUE_OPTIONS.has(name)) {
      const key = name as ValueOption;
      let value = explicit;
      if (value === undefined) {
        const next = argv[i + 1];
        if (next === undefined || (next.length > 1 && next[0] === "-")) {
          fail(`argument ${name}: expected one argument`);
          continue;
        }
        value = next;
        i++;
      }
      // @lndf:constraint the last of a repeated option wins | validate reads a repeated option the same way
      values.set(key, value);
      continue;
    }
    if (FLAGS.has(name)) {
      if (explicit !== undefined) fail(`argument ${name}: ignored explicit argument '${explicit}'`);
      else if (name === "--git") git = true;
      else help = true;
      continue;
    }
    if (VALIDATE_ONLY.has(name)) fail(`${name} is an option of lndf validate, not of lndf parse`);
    else fail(`unrecognized arguments: ${tok}`);
  }

  if (help) return { kind: "help" };
  if (error !== null) return { kind: "error", message: error };

  const commitMsg = values.get("--commit-msg");
  const range = values.get("--range");
  const maxCount = values.get("--max-count");
  const modes = [paths.length > 0, commitMsg !== undefined, git].filter(Boolean).length;
  if (modes === 0) return { kind: "error", message: "give source paths, --commit-msg FILE or --git" };
  if (modes > 1) return { kind: "error", message: "source paths, --commit-msg and --git cannot be combined" };
  if (!git && (range !== undefined || maxCount !== undefined)) {
    return { kind: "error", message: "--range and --max-count need --git" };
  }
  if (commitMsg !== undefined) {
    if (!commitMsg) return { kind: "error", message: "argument --commit-msg: empty file name" };
    return { kind: "commit-msg", file: commitMsg };
  }
  if (git) {
    if (range !== undefined && (!range || range.startsWith("-"))) {
      return { kind: "error", message: `argument --range: expected a revision range, got '${range}'` };
    }
    let count: number | null = null;
    if (maxCount !== undefined) {
      count = /^[0-9]+$/.test(maxCount) ? Number(maxCount) : NaN;
      if (!Number.isSafeInteger(count) || count < 1) {
        return { kind: "error", message: `argument --max-count: expected a positive integer, got '${maxCount}'` };
      }
    }
    return { kind: "git", range: range ?? null, maxCount: count };
  }
  return { kind: "source", paths };
}
