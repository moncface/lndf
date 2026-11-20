// lndf parse: the records it prints, the lines it leaves out, and its exit
// status. Source mode is held to validate.py --index; the trailer modes are held
// to the commit fixtures and to temporary git repositories. Build first (npm test
// does this through pretest).

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { splitGitLog } from "../dist/commands/parse.js";

const CLI_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(CLI_DIR);
const CLI = join(CLI_DIR, "dist", "cli.js");
const VALIDATE_PY = join(REPO, "skills", "lndf-comment", "validate.py");
const COMMIT = "tests/fixtures/commit";
const SOURCE = "tests/fixtures/source";

const WORK = realpathSync.native(mkdtempSync(join(tmpdir(), "lndf-parse-")));
after(() => rmSync(WORK, { recursive: true, force: true }));

// @lndf:why-not writing the marker and fake secrets as literals | the repo's own validator and secret scanners would read these test inputs as real records and keys
const L = "@lndf" + ":";
const fakeSk = "sk" + "-" + "x".repeat(16);

let dirCount = 0;
function newDir(name) {
  dirCount++;
  const d = join(WORK, `${dirCount}-${name}`);
  mkdirSync(d);
  return d;
}

function lndf(args, { cwd = REPO, env = process.env } = {}) {
  const r = spawnSync(process.execPath, [CLI, "parse", ...args], { cwd, env, encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

/** Run lndf parse and require exit 0; returns the records and the stderr lines. */
function records(args, opts) {
  const r = lndf(args, opts);
  assert.equal(r.status, 0, r.stderr);
  const recs = JSON.parse(r.stdout);
  assert.equal(r.stdout, JSON.stringify(recs, null, 2) + "\n", "stdout is the indented array and one LF");
  return { recs, stderr: r.stderr ? r.stderr.replace(/\n$/, "").split("\n") : [] };
}

// ---------------------------------------------------------------- source files

function findPython() {
  const env = process.env.LNDF_PYTHON;
  const names = env ? [env] : process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
  for (const name of names) {
    const r = spawnSync(name, ["-c", "import sys; sys.exit(sys.version_info < (3, 9))"]);
    if (r.status === 0) return name;
  }
  throw new Error("Python 3.9 or later not found; set LNDF_PYTHON");
}

/** The entries of validate.py --index for these paths, read from the repository root. */
function pyIndex(paths) {
  const index = join(newDir("index"), "index.json");
  const r = spawnSync(findPython(), [VALIDATE_PY, ...paths, "--index", index, "--today", "2026-10-03"], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  if (r.error) throw r.error;
  return JSON.parse(readFileSync(index, "utf8"));
}

const MALFORMED_SOURCE = ["fail-control-char.js", "fail-two-pipes.js", "fail-unknown-kind.js"];

test("source files: the records equal validate.py --index without the malformed lines", () => {
  for (const paths of [[`${SOURCE}/pass-ahk-heuristic.ahk2`], [`${SOURCE}/pass-js-two-kinds.js`], [SOURCE]]) {
    const expected = pyIndex(paths).filter((e) => !MALFORMED_SOURCE.some((name) => e.path.endsWith(name)));
    const { recs, stderr } = records(paths);
    assert.deepEqual(recs, expected, paths.join(" "));
    if (paths[0] !== SOURCE) assert.deepEqual(stderr, [], paths.join(" "));
  }
});

test("source folder: 4 of the 7 index entries are printed, each malformed line is named once", () => {
  assert.equal(pyIndex([SOURCE]).length, 7);
  const { recs, stderr } = records([SOURCE]);
  assert.equal(recs.length, 4);
  // An expired temporal date is a record, not a skipped line.
  assert.ok(recs.some((e) => e.kind === "temporal" && e.value === "2020-01-01"));
  assert.equal(stderr.length, 3);
  const messages = {
    "fail-control-char.js": "control character U+0007 inside the line; an escape was probably expanded by the shell",
    "fail-two-pipes.js": "expected exactly one '|', found 2",
    "fail-unknown-kind.js": "unknown kind 'rationale' (allowed: why-not, constraint, heuristic, temporal)",
  };
  for (const [name, msg] of Object.entries(messages)) {
    const sep = process.platform === "win32" ? "\\" : "/";
    assert.ok(stderr.includes(`${SOURCE}${sep}${name}:1: skipped: ${msg}`), name);
  }
});

test("source files: a secret is [REDACTED] when the line is well formed, and left out unnamed when it is not", () => {
  const dir = newDir("secret-source");
  writeFileSync(join(dir, "a.js"), `// ${L}why-not ${fakeSk} | a key\n// ${L}why-not ${fakeSk}\n`);
  const { recs, stderr } = records(["a.js"], { cwd: dir });
  assert.deepEqual(recs, [{ path: "a.js", line: 1, kind: "why-not", value: "[REDACTED]", reason: "[REDACTED]" }]);
  assert.deepEqual(stderr, ["a.js:2: skipped: possible secret (sk-*) in a malformed line; value not shown"]);
});

test("source files: an unreadable file prints nothing on stdout and exits 1, after reading the rest", () => {
  const dir = newDir("unreadable");
  writeFileSync(join(dir, "a.js"), `// ${L}why-not A | B | C\n`);
  const r = lndf(["missing.js", "a.js"], { cwd: dir });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.equal(
    r.stderr,
    "missing.js: cannot read ([Errno 2] No such file or directory: 'missing.js')\n" +
      "a.js:1: skipped: expected exactly one '|', found 2\n",
  );
  const m = lndf(["--commit-msg", "missing.txt"], { cwd: dir });
  assert.equal(m.status, 1);
  assert.equal(m.stdout, "");
  assert.equal(m.stderr, "missing.txt: cannot read ([Errno 2] No such file or directory: 'missing.txt')\n");
});

// ---------------------------------------------------------------- --commit-msg

const ref = (n) => `https://example.com/decisions/${n}`;
const rec = (file, line, kind, value, reason) => ({ path: `${COMMIT}/${file}`, line, kind, value, reason });

const COMMIT_CASES = {
  "pass-three-trailers.txt": [
    [
      rec("pass-three-trailers.txt", 5, "why-not", "parse JSONL only", "Codex has no JSONL; git log is shared"),
      rec("pass-three-trailers.txt", 6, "temporal", "2099-01-31", "drop legacy reader after new store verified"),
      rec("pass-three-trailers.txt", 7, "ref", ref(7), ""),
    ],
    [],
  ],
  "pass-no-trailer.txt": [[], []],
  "pass-crlf.txt": [[rec("pass-crlf.txt", 5, "why-not", "a", "b")], []],
  "pass-dot-lndf-file.lndf": [
    [
      rec("pass-dot-lndf-file.lndf", 1, "why-not", "SetTimer polling", "WM_CLIPBOARDUPDATE fires only on change, no idle cost"),
      rec("pass-dot-lndf-file.lndf", 3, "ref", ref(7), ""),
    ],
    [],
  ],
  "pass-literal-backslash-r.txt": [
    [
      rec("pass-literal-backslash-r.txt", 3, "constraint", "core.autocrlf=true on Windows",
        'a CRLF checkout turns the shebang into "#!/bin/sh\\r" and the hook stops running'),
      rec("pass-literal-backslash-r.txt", 4, "ref", ref(571), ""),
    ],
    [],
  ],
  "fail-outside-final-paragraph.txt": [[], ["3: skipped: LNDF trailer outside the final paragraph; git will not parse it. Move it to the end"]],
  "fail-expired-temporal.txt": [[rec("fail-expired-temporal.txt", 3, "temporal", "2020-01-01", "old")], []],
  "fail-secret.txt": [[rec("fail-secret.txt", 3, "constraint", "[REDACTED]", "[REDACTED]")], []],
  "fail-embedded-cr.txt": [
    [rec("fail-embedded-cr.txt", 4, "ref", ref(571), "")],
    ["3: skipped: control character U+000D inside the trailer; a shell escape was probably expanded. Write the message to a file and use git commit -F"],
  ],
  "fail-missing-pipe.txt": [[], ["3: skipped: expected exactly one '|', found 0"]],
  "fail-ref-with-pipe.txt": [[], ["3: skipped: LNDF-ref takes a bare id, not 'value | reason'"]],
  "fail-unknown-kind.txt": [[], ["3: skipped: unknown trailer kind 'bogus' (allowed: why-not, constraint, heuristic, temporal, ref)"]],
};

test("--commit-msg: the expected records and skipped lines of each commit fixture", () => {
  for (const [file, [expected, skipped]] of Object.entries(COMMIT_CASES)) {
    const path = `${COMMIT}/${file}`;
    const { recs, stderr } = records(["--commit-msg", path]);
    assert.deepEqual(recs, expected, file);
    assert.deepEqual(stderr, skipped.map((s) => `${path}:${s}`), file);
  }
});

function messageFile(text) {
  const file = join(newDir("msg"), "msg.txt");
  writeFileSync(file, text);
  return file;
}

// Git reads neither of the next two messages as having trailers; parse reads
// them as validate does, which .lndf files rely on.
test("--commit-msg: a one-paragraph message is its own final paragraph", () => {
  const file = messageFile("LNDF-why-not: a | b\n");
  const { recs, stderr } = records(["--commit-msg", file]);
  assert.deepEqual(recs, [{ path: file, line: 1, kind: "why-not", value: "a", reason: "b" }]);
  assert.deepEqual(stderr, []);
});

test("--commit-msg: an LNDF- line is read in a final paragraph that also holds other lines", () => {
  const file = messageFile("subject\n\nbody line\nLNDF-why-not: a | b\n");
  const { recs, stderr } = records(["--commit-msg", file]);
  assert.deepEqual(recs, [{ path: file, line: 4, kind: "why-not", value: "a", reason: "b" }]);
  assert.deepEqual(stderr, []);
});

test("--commit-msg: an empty message prints [], and a malformed line with a secret is not shown", () => {
  for (const text of ["", "\n\n", "# only a comment\n"]) {
    assert.deepEqual(records(["--commit-msg", messageFile(text)]), { recs: [], stderr: [] }, JSON.stringify(text));
  }
  const file = messageFile(`subject\n\nLNDF-why-not: ${fakeSk} without a reason\n`);
  const r = lndf(["--commit-msg", file]);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "[]\n");
  assert.equal(r.stderr, `${file}:3: skipped: possible secret (sk-*) in a malformed line; value not shown\n`);
});

// ---------------------------------------------------------------- --git

const GIT_HOME = newDir("git");
const EMPTY_CONFIG = join(GIT_HOME, "gitconfig");
writeFileSync(EMPTY_CONFIG, "");

// @lndf:constraint drop the caller's GIT_* variables and config | a hook or a user config (GIT_DIR, log.showSignature, commit.gpgSign) would change what the temporary repositories hold
const GIT_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith("GIT_")));
Object.assign(GIT_ENV, {
  GIT_CONFIG_GLOBAL: EMPTY_CONFIG,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CEILING_DIRECTORIES: WORK,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
});

let clock = 0;

function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, env: GIT_ENV, encoding: "utf8" });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

function newRepo(name) {
  const dir = newDir(name);
  git(dir, "init", "-q", "-b", "main");
  return dir;
}

/** Commit an empty change with this message; returns the SHA and the committer date git prints. */
function commit(repo, message, extra = []) {
  clock++;
  const date = `2026-01-02T03:${String(Math.floor(clock / 60)).padStart(2, "0")}:${String(clock % 60).padStart(2, "0")}+09:00`;
  const file = join(GIT_HOME, "message.txt");
  writeFileSync(file, message);
  const env = { ...GIT_ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  const args = extra.length ? extra : ["commit", "-q", "--allow-empty"];
  const r = spawnSync("git", [...args, "-F", file], { cwd: repo, env, encoding: "utf8" });
  if (r.error) throw r.error;
  assert.equal(r.status, 0, r.stderr);
  return { sha: git(repo, "rev-parse", "HEAD"), date };
}

const parseGit = (repo, ...args) => lndf(["--git", ...args], { cwd: repo, env: GIT_ENV });
const gitRecords = (repo, ...args) => records(["--git", ...args], { cwd: repo, env: GIT_ENV });
const gitRec = (c, subject, line, kind, value, reason) => ({ commit: c.sha, date: c.date, subject, line, kind, value, reason });

test("--git: trailers of each commit, newest first; no trailer and a malformed one", () => {
  const repo = newRepo("basic");
  const first = commit(repo, `first\n\nbody\n\nLNDF-why-not: polling | events are pushed\nLNDF-ref: ${ref(1)}\n`);
  const second = commit(repo, "second, no trailer\n");
  const third = commit(repo, "third\n\nLNDF-heuristic: 300ms\nLNDF-constraint: one writer | the file has no lock\n");
  const all = [
    gitRec(third, "third", 4, "constraint", "one writer", "the file has no lock"),
    gitRec(first, "first", 5, "why-not", "polling", "events are pushed"),
    gitRec(first, "first", 6, "ref", ref(1), ""),
  ];
  const skip = `${third.sha}:3: skipped: expected exactly one '|', found 0`;
  assert.deepEqual(gitRecords(repo), { recs: all, stderr: [skip] });
  assert.deepEqual(gitRecords(repo, "--max-count", "1"), { recs: all.slice(0, 1), stderr: [skip] });
  assert.deepEqual(gitRecords(repo, "--max-count=2"), { recs: all.slice(0, 1), stderr: [skip] });
  assert.deepEqual(gitRecords(repo, "--range", first.sha), { recs: all.slice(1), stderr: [] });
  assert.deepEqual(gitRecords(repo, `--range=${first.sha}..${second.sha}`), { recs: [], stderr: [] });
});

test("--git: a commit below 25 newer commits is read; --max-count stops before it", () => {
  const repo = newRepo("buried");
  const old = commit(repo, "old\n\nLNDF-temporal: 2020-01-01 | an expired date is kept\n");
  for (let i = 0; i < 25; i++) commit(repo, `newer ${i}\n`);
  const expected = [gitRec(old, "old", 3, "temporal", "2020-01-01", "an expired date is kept")];
  assert.deepEqual(gitRecords(repo), { recs: expected, stderr: [] });
  assert.deepEqual(gitRecords(repo, "--max-count", "25"), { recs: [], stderr: [] });
  assert.deepEqual(gitRecords(repo, "--max-count", "26"), { recs: expected, stderr: [] });
});

test("--git: a merge commit and the commit it brings in are both read", () => {
  const repo = newRepo("merge");
  commit(repo, "base\n");
  git(repo, "checkout", "-q", "-b", "side");
  const side = commit(repo, "side\n\nLNDF-constraint: a | b\n");
  git(repo, "checkout", "-q", "main");
  commit(repo, "main\n");
  const merge = commit(repo, "Merge branch 'side'\n\nLNDF-why-not: rebase | the side history stays visible\n", ["merge", "-q", "--no-ff", "side"]);
  assert.deepEqual(gitRecords(repo), {
    recs: [
      gitRec(merge, "Merge branch 'side'", 3, "why-not", "rebase", "the side history stays visible"),
      gitRec(side, "side", 3, "constraint", "a", "b"),
    ],
    stderr: [],
  });
  assert.deepEqual(gitRecords(repo, "--range", "side..main"), {
    recs: [gitRec(merge, "Merge branch 'side'", 3, "why-not", "rebase", "the side history stays visible")],
    stderr: [],
  });
});

test("--git: an unborn HEAD prints [], unless --range names something", () => {
  const repo = newRepo("unborn");
  const r = parseGit(repo);
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "[]\n");
  assert.equal(r.stderr, "");
  const bad = parseGit(repo, "--range", "main");
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, "");
  assert.notEqual(bad.stderr, "");
});

test("--git: a shallow clone prints its records and a note", () => {
  const repo = newRepo("deep");
  commit(repo, "one\n\nLNDF-why-not: a | b\n");
  const two = commit(repo, "two\n\nLNDF-why-not: c | d\n");
  const shallow = join(newDir("shallow"), "clone");
  git(GIT_HOME, "clone", "-q", "--depth", "1", pathToFileURL(repo).href, shallow);
  assert.deepEqual(gitRecords(shallow), {
    recs: [gitRec(two, "two", 3, "why-not", "c", "d")],
    stderr: ["lndf parse: note: shallow clone; commits beyond the shallow boundary are not read"],
  });
});

test("--git: outside a repository, and without git, exit 1 with nothing on stdout", () => {
  const plain = newDir("not-a-repo");
  const r = parseGit(plain);
  assert.equal(r.status, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /not a git repository/i);

  const emptyBin = newDir("empty-bin");
  const env = Object.fromEntries(Object.entries(GIT_ENV).filter(([k]) => k.toUpperCase() !== "PATH"));
  env.PATH = emptyBin;
  const n = lndf(["--git"], { cwd: plain, env });
  assert.equal(n.status, 1);
  assert.equal(n.stdout, "");
  assert.equal(n.stderr, "lndf parse: error: git not found\n");
});

test("splitGitLog: four fields per commit, else null", () => {
  const nul = "\0";
  assert.deepEqual(splitGitLog(new Uint8Array()), []);
  assert.deepEqual(splitGitLog(Buffer.from(["a", "d", "s", "s\n\nbody\n", ""].join(nul))), [
    { commit: "a", date: "d", subject: "s", message: "s\n\nbody\n" },
  ]);
  assert.equal(splitGitLog(Buffer.from(["a", "d", "s", ""].join(nul))), null);
  assert.equal(splitGitLog(Buffer.from(["a", "d", "s", "m"].join(nul))), null);
});

// ---------------------------------------------------------------- arguments

const PARSE_USAGE =
  "usage: lndf validate <file-or-dir>... [--index out.json] [--today YYYY-MM-DD]\n" +
  "       lndf validate --commit-msg <file> [--require] [--today YYYY-MM-DD]\n" +
  "       lndf parse <file-or-dir>...\n" +
  "       lndf parse --commit-msg <file>\n" +
  "       lndf parse --git [--range RANGE] [--max-count N]\n";

test("usage errors: exit 2, the usage of both commands, then the reason", () => {
  const cases = [
    [[], "give source paths, --commit-msg FILE or --git"],
    [["--git", "a.js"], "source paths, --commit-msg and --git cannot be combined"],
    [["--commit-msg", "m.txt", "a.js"], "source paths, --commit-msg and --git cannot be combined"],
    [["--commit-msg", "m.txt", "--git"], "source paths, --commit-msg and --git cannot be combined"],
    [["a.js", "--range", "main"], "--range and --max-count need --git"],
    [["--commit-msg", "m.txt", "--max-count", "3"], "--range and --max-count need --git"],
    [["--git", "--max-count", "0"], "argument --max-count: expected a positive integer, got '0'"],
    [["--git", "--max-count", "1.5"], "argument --max-count: expected a positive integer, got '1.5'"],
    [["--git", "--max-count", "-1"], "argument --max-count: expected one argument"],
    [["--git", "--range", ""], "argument --range: expected a revision range, got ''"],
    [["--git", "--range=-x"], "argument --range: expected a revision range, got '-x'"],
    [["--git", "--range"], "argument --range: expected one argument"],
    [["--commit-msg="], "argument --commit-msg: empty file name"],
    [["a.js", "--today", "2026-10-03"], "--today is an option of lndf validate, not of lndf parse"],
    [["a.js", "--index", "x.json"], "--index is an option of lndf validate, not of lndf parse"],
    [["--commit-msg", "m.txt", "--require"], "--require is an option of lndf validate, not of lndf parse"],
    [["--git=yes"], "argument --git: ignored explicit argument 'yes'"],
    [["a.js", "--rang", "x"], "unrecognized arguments: --rang"],
  ];
  for (const [args, message] of cases) {
    const r = lndf(args);
    assert.equal(r.status, 2, args.join(" "));
    assert.equal(r.stdout, "", args.join(" "));
    assert.equal(r.stderr, `${PARSE_USAGE}lndf parse: error: ${message}\n`, args.join(" "));
  }
});

test("an unknown command lists both commands; validate keeps its own usage", () => {
  const r = spawnSync(process.execPath, [CLI, "bogus"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, `${PARSE_USAGE}lndf validate: error: unknown command 'bogus' (see lndf --help)\n`);
  const v = spawnSync(process.execPath, [CLI, "validate"], { encoding: "utf8" });
  assert.equal(v.status, 2);
  assert.doesNotMatch(v.stderr, /lndf parse/);
});

test("parse --help prints the full help", () => {
  for (const args of [["--help"], ["-h"], ["--git", "--help"]]) {
    const r = lndf(args);
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
    assert.match(r.stdout, /^lndf: check and read LNDF judgment records\n/);
    assert.match(r.stdout, /Parse options:\n {2}--git/);
    assert.match(r.stdout, /lndf parse: 0 = printed \(possibly \[\]\)/);
  }
});
