// Differential tests: validate.py is the source of truth. Each case runs it and
// the lndf CLI on the same input and requires the same exit status, stdout,
// stderr and --index file. Build first (npm test does this through pretest).
//
// Set LNDF_PYTHON to choose the Python interpreter.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pyRepr, pyStrip } from "../dist/commands/validate.js";

const CLI_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(CLI_DIR);
const CLI = join(CLI_DIR, "dist", "cli.js");
const VALIDATE_PY = join(REPO, "skills", "lndf-comment", "validate.py");
const FIXTURES = join(REPO, "tests", "fixtures");
const TODAY = "2026-10-03";

const WORK = mkdtempSync(join(tmpdir(), "lndf-parity-"));
const DATA = join(WORK, "data"); // files the validators read; cases run here
const OUT = join(WORK, "out"); // --index files, kept outside DATA
mkdirSync(DATA);
mkdirSync(OUT);
after(() => rmSync(WORK, { recursive: true, force: true }));

function findPython() {
  const env = process.env.LNDF_PYTHON;
  const names = env ? [env] : process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
  for (const name of names) {
    const r = spawnSync(name, ["-c", "import sys; sys.exit(sys.version_info < (3, 9))"]);
    if (r.status === 0) return name;
  }
  throw new Error("Python 3.9 or later not found; set LNDF_PYTHON");
}
const PY = findPython();

function spawn(cmd, args, cwd, input) {
  const r = spawnSync(cmd, args, { cwd, input, encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// @lndf:constraint fold CRLF to LF in Python's output only | Python text streams write CRLF on Windows; the CLI writes LF everywhere, and its own output is compared unchanged
const lf = (s) => s.replace(/\r\n/g, "\n");

let indexCount = 0;

/** Run both validators. With index, each gets its own --index file in OUT. */
function both(args, { cwd = DATA, index = false } = {}) {
  let pyIndex = null;
  let jsIndex = null;
  let pyArgs = args;
  let jsArgs = args;
  if (index) {
    indexCount++;
    pyIndex = join(OUT, `py-${indexCount}.json`);
    jsIndex = join(OUT, `js-${indexCount}.json`);
    pyArgs = [...args, "--index", pyIndex];
    jsArgs = [...args, "--index", jsIndex];
  }
  const py = spawn(PY, [VALIDATE_PY, ...pyArgs], cwd);
  const js = spawn(process.execPath, [CLI, "validate", ...jsArgs], cwd);
  return { py: { ...py, stdout: lf(py.stdout), stderr: lf(py.stderr) }, js, pyIndex, jsIndex };
}

function assertSame(args, opts = {}) {
  const r = both(args, opts);
  assert.equal(r.js.stderr, r.py.stderr, "stderr");
  assert.equal(r.js.stdout, r.py.stdout, "stdout");
  assert.equal(r.js.status, r.py.status, "exit status");
  if (opts.index) {
    assert.equal(existsSync(r.jsIndex), existsSync(r.pyIndex), "index written");
    if (existsSync(r.pyIndex)) {
      assert.equal(readFileSync(r.jsIndex, "utf8"), lf(readFileSync(r.pyIndex, "utf8")), "index text");
    }
  }
  return r;
}

/** The argparse message after "error: " on the last stderr line. */
function errorText(stderr) {
  const last = stderr.split("\n").filter((l) => l.trim()).at(-1) ?? "";
  const at = last.indexOf("error: ");
  return at < 0 ? last : last.slice(at + "error: ".length);
}

function assertSameUsageError(args) {
  const r = both(args);
  assert.equal(r.py.status, 2, `validate.py exit for ${JSON.stringify(args)}: ${r.py.stderr}`);
  assert.equal(r.js.status, 2, "CLI exit");
  assert.equal(r.js.stdout, "");
  assert.equal(errorText(r.js.stderr), errorText(r.py.stderr));
}

function put(rel, content) {
  const p = join(DATA, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return rel;
}

// @lndf:why-not writing the marker and fake secrets as literals | the repo's own validator and secret scanners would read these test inputs as real records and keys
const L = "@lndf" + ":";
const lndf = (kind, rest) => `// ${L}${kind} ${rest}\n`;
const fakeSk = "sk" + "-" + "x".repeat(16);
const fakeAkia = "AKIA" + "X".repeat(16);
const eight = "x".repeat(8);

function localDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n, w) => String(n).padStart(w, "0");
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
}

let caseCount = 0;
function sourceCase(content, args = ["--today", TODAY], ext = ".js") {
  caseCount++;
  const rel = put(`s${caseCount}${ext}`, content);
  return assertSame([rel, ...args], { index: true });
}
function commitCase(content) {
  caseCount++;
  const rel = put(`c${caseCount}.txt`, content);
  assertSame(["--commit-msg", rel, "--today", TODAY]);
  assertSame(["--commit-msg", rel, "--today", TODAY, "--require"]);
}

// ---------------------------------------------------------------- fixtures

const SOURCE_FIXTURES = readdirSync(join(FIXTURES, "source")).sort();
const COMMIT_FIXTURES = readdirSync(join(FIXTURES, "commit")).sort();

test("the fixture folders are not empty", () => {
  assert.ok(SOURCE_FIXTURES.length >= 6, SOURCE_FIXTURES.join(", "));
  assert.ok(COMMIT_FIXTURES.length >= 12, COMMIT_FIXTURES.join(", "));
});

for (const name of SOURCE_FIXTURES) {
  test(`source fixture ${name}: same output and same --index entries`, () => {
    const r = assertSame([`tests/fixtures/source/${name}`, "--today", TODAY], { cwd: REPO, index: true });
    const py = JSON.parse(readFileSync(r.pyIndex, "utf8"));
    const js = JSON.parse(readFileSync(r.jsIndex, "utf8"));
    assert.ok(py.length > 0, "the fixture has lndf lines");
    for (const e of js) assert.deepEqual(Object.keys(e), ["path", "line", "kind", "value", "reason"]);
    assert.deepEqual(js, py);
  });
}

test("the source fixture folder as a directory, index in walk order", () => {
  const r = assertSame(["tests/fixtures/source", "--today", TODAY], { cwd: REPO, index: true });
  assert.deepEqual(JSON.parse(readFileSync(r.jsIndex, "utf8")), JSON.parse(readFileSync(r.pyIndex, "utf8")));
});

for (const name of COMMIT_FIXTURES) {
  test(`commit fixture ${name}`, () => {
    const rel = `tests/fixtures/commit/${name}`;
    assertSame(["--commit-msg", rel, "--today", TODAY], { cwd: REPO });
    assertSame(["--commit-msg", rel, "--today", TODAY, "--require"], { cwd: REPO });
  });
}

test("a .lndf file given as a path is read as source", () => {
  assertSame(["tests/fixtures/commit/pass-dot-lndf-file.lndf", "--today", TODAY], { cwd: REPO, index: true });
});

// ---------------------------------------------------------------- source mode

test("source: Python whitespace at the ends of a line", () => {
  sourceCase(lndf("why-not", "a | b\x1f"));
  sourceCase(lndf("why-not", "a | b\x85"));
  sourceCase(lndf("why-not", "\x1ca | b\x1d\x1e"));
  sourceCase(lndf("why-not", "a | b\u3000\u2028"));
});

test("source: characters inside a line", () => {
  sourceCase(lndf("why-not", "a\x1f | b"));
  sourceCase(lndf("why-not", "a\u2028b | c"));
  sourceCase(lndf("why-not", "a\x85b | c\x0bd"));
  sourceCase(lndf("why-not", "a\ufeff | b\ufeff"));
});

test("source: a leading BOM stays in the first line", () => {
  sourceCase("\ufeff" + lndf("heuristic", "x | y"));
  sourceCase(`\ufeff${L}why-not a | b\n`);
  sourceCase("\ufeff");
});

test("source: line breaks", () => {
  sourceCase(lndf("why-not", "a | b").trimEnd() + "\r" + lndf("why-not", "c | d"));
  sourceCase(lndf("why-not", "a | b").replace("\n", "\r\n") + lndf("why-not", "c"));
  sourceCase(lndf("why-not", "a | b").trimEnd());
  sourceCase("");
  sourceCase("\n\n");
  sourceCase("\r");
});

test("source: kinds, pipes and empty sides", () => {
  sourceCase(lndf("rationale", "a | b") + lndf("why-not", "a | b | c") + lndf("why-not", "a b"));
  sourceCase(lndf("why-not", " | b") + lndf("why-not", "a | ") + lndf("why-not", "|") + `// ${L}why-not\n`);
  sourceCase(`// ${L}\u212aey a | b\n// ${L}heuristic\u017f a | b\n// ${L}WHY-NOT a | b\n`);
  sourceCase(`// ${L}why-not a | b ${L}heuristic c | d\n`);
});

test("source: comment closers", () => {
  sourceCase(`/* ${L}why-not a | b */\n<!-- ${L}why-not a | b -->\n`);
  sourceCase(`/* ${L}why-not a | b\x1c*/\n/* ${L}why-not a | b */ */\n/* ${L}why-not a | b */x\n`);
});

test("source: possible secrets", () => {
  sourceCase(lndf("why-not", `${fakeSk} | r`) + lndf("why-not", `r | ${fakeAkia}`));
  sourceCase(lndf("why-not", `api_\u212aey=${eight} | r`) + lndf("why-not", `pa\u017fsword: ${eight} | r`));
  sourceCase(lndf("why-not", `ap\u0130key="${"\u212a".repeat(8)}" | r`) + lndf("why-not", `token = ${"x".repeat(7)} | r`));
  sourceCase(lndf("rationale", `${fakeSk} | r`));
});

test("source: temporal dates", () => {
  for (const d of ["2026-02-30", "2026-13-01", "0000-01-01", "2026-00-10", "2100-02-29", "2024-02-29", "2026-10-03", "2026-10-02"]) {
    sourceCase(lndf("temporal", `${d} | r`));
  }
  sourceCase(lndf("temporal", "\uff12\uff10\uff12\uff16-\uff11\uff10-\uff10\uff13 | r"));
  sourceCase(lndf("temporal", "\u0662\u0660\u0662\u0666-\u0661\u0660-\u0660\u0663 | r"));
  sourceCase(lndf("temporal", "2026/10/03 | r") + lndf("temporal", "soon | r") + lndf("temporal", "2026-10-03"));
});

test("source: temporal dates against the local date (no --today)", () => {
  sourceCase(lndf("temporal", `${localDate(-1)} | r`) + lndf("temporal", `${localDate(0)} | r`) + lndf("temporal", `${localDate(1)} | r`), []);
});

test("source: bytes that are not UTF-8", () => {
  sourceCase(Buffer.concat([Buffer.from(`// ${L}why-not a`), Buffer.from([0xff, 0xfe, 0xe3, 0x81]), Buffer.from(" | b\n")]));
  sourceCase(Buffer.concat([Buffer.from(`// ${L}why-not a | b`), Buffer.from([0xed, 0xa0, 0x80, 0xc0, 0xaf]), Buffer.from("\n")]));
});

test("source: unreadable paths", () => {
  assertSame(["missing.js", "--today", TODAY], { index: true });
  assertSame(["it's.js", "a\u00a0b.js", "--today", TODAY]);
  assertSame(["no-dir/x.js", "--today", TODAY]);
});

// ---------------------------------------------------------------- directories

test("directories: extensions, skipped folders and path forms", () => {
  put("tree/a.js", lndf("why-not", "a | b"));
  put("tree/.js", lndf("why-not", "dot | file"));
  put("tree/..js", lndf("why-not", "dots | file"));
  put("tree/x.JS", lndf("why-not", "upper | case"));
  put("tree/\u65e5\u672c.js", lndf("heuristic", "non-ascii | name"));
  put("tree/notes.txt", lndf("why-not", "not | source"));
  put("tree/sub/b.py", `# ${L}temporal 2020-01-01 | old\n`);
  put("tree/sub/deeper/c.ts", lndf("constraint", "deep | file"));
  put("tree/node_modules/d.js", lndf("rationale", "skipped | folder"));
  put("tree/dist/e.js", lndf("rationale", "skipped | folder"));
  put("tree/.git/f.js", lndf("rationale", "skipped | folder"));
  for (const form of ["tree", "tree/", "./tree", "tree/sub", "tree/sub/"]) {
    assertSame([form, "--today", TODAY], { index: true });
  }
  assertSame(["tree", "tree/a.js", "tree/notes.txt", "--today", TODAY], { index: true });
});

test("directories: a symlinked folder is not entered, a broken link is read", (t) => {
  put("links/real/a.js", lndf("why-not", "a | b"));
  try {
    symlinkSync("real", join(DATA, "links", "link"), "dir");
    symlinkSync("missing.js", join(DATA, "links", "broken.js"), "file");
  } catch (e) {
    if (e.code === "EPERM") return t.skip("this account cannot create symlinks");
    throw e;
  }
  assertSame(["links", "--today", TODAY], { index: true });
});

// ---------------------------------------------------------------- commit-msg mode

test("commit: Python whitespace and BOM", () => {
  commitCase("subject\n\nLNDF-why-not: a | b\x1f\n");
  commitCase("subject\n\nLNDF-why-not: a | b\x85\n");
  commitCase("subject\n\n\x1cLNDF-why-not: a | b\n");
  commitCase("\ufeffsubject\n\nLNDF-why-not: a | b\n");
  commitCase("\ufeff# comment\nsubject\n\nLNDF-why-not: a | b\n");
  commitCase("\ufeffLNDF-why-not: a | b\n");
  commitCase("\ufeff");
  commitCase("subject\n\nLNDF-why-not: a\ufeff | b\n");
});

test("commit: a .lndf file with a BOM", () => {
  caseCount++;
  const rel = put(`c${caseCount}.lndf`, "\ufeffLNDF-heuristic: a | b\nLNDF-ref: spec\n");
  assertSame(["--commit-msg", rel, "--today", TODAY]);
});

test("commit: kinds and case folding", () => {
  commitCase("subject\n\nlndf-WHY-NOT: a | b\nLNDF-REF: x\n");
  commitCase("subject\n\nLNDF-\u212aind: a | b\n");
  commitCase("subject\n\nLNDF-heuri\u017ftic: a | b\n");
  commitCase("subject\n\nLNDF-\u0130: a | b\nLNDF-\u0131: a | b\n");
  commitCase("subject\n\nLNDF-why-not : a | b\nLNDF-rationale: a | b\n");
});

test("commit: control characters and line breaks", () => {
  commitCase("subject\n\nLNDF-why-not: a\rb | c\n");
  commitCase("subject\r\n\r\nLNDF-why-not: a | b\r\n\r\n");
  commitCase("subject\n\nLNDF-why-not: a\x1fb | c\n");
  commitCase("subject\n\nLNDF-why-not: a\u2028b | c\n");
});

test("commit: empty messages", () => {
  commitCase("");
  commitCase("# only\n# comments\n");
  commitCase("  \n\t\n");
  commitCase("\n\n");
});

test("commit: --require and exempt subjects", () => {
  for (const subject of ["Merge branch x", "Merge\u00e9 x", "Merge2 x", "Merge", "Revert \"x\"", "Reverted x",
    "chore: x", "CHORE: x", "\u017ftyle: x", "docs(x)!: y", "chore(a)(b): y", "chore x", "docs: x", "fix: x",
    "  chore: x", "Merge_x", "Merge\u0301 x"]) {
    commitCase(`${subject}\n\nbody\n`);
  }
});

test("commit: trailers outside the final paragraph", () => {
  commitCase("subject\n\nLNDF-why-not: a | b\n\nbody\n");
  commitCase("LNDF-why-not: a | b\n\nLNDF-rationale: c\n");
  commitCase("subject\n\nLNDF-why-not: a | b\nSigned-off-by: x\n# comment\n\n\n");
});

test("commit: values", () => {
  commitCase("subject\n\nLNDF-ref:\nLNDF-ref: a | b\nLNDF-ref: issue:1\n");
  commitCase("subject\n\nLNDF-temporal: 2026-02-30 | x\nLNDF-temporal: \uff12\uff10\uff12\uff16-\uff11\uff10-\uff10\uff13 | x\n");
  commitCase("subject\n\nLNDF-temporal: 2026-10-02 | x\nLNDF-temporal: 2026-10-03 | x\nLNDF-temporal: x\n");
  commitCase(`subject\n\nLNDF-why-not: api_\u212aey=${eight} | r\nLNDF-ref: ${fakeSk}\n`);
  commitCase(`subject\n\nLNDF-why-not: a | ${fakeAkia}\nLNDF-rationale: a | b\n`);
});

test("commit: unreadable files", () => {
  assertSame(["--commit-msg", "missing.txt", "--today", TODAY]);
  mkdirSync(join(DATA, "a-dir"), { recursive: true });
  assertSame(["--commit-msg", "a-dir", "--today", TODAY]);
});

test("commit: --index is ignored", () => {
  caseCount++;
  const rel = put(`c${caseCount}.txt`, "subject\n\nLNDF-why-not: a | b\n");
  const r = assertSame(["--commit-msg", rel, "--today", TODAY], { index: true });
  assert.equal(existsSync(r.jsIndex), false);
});

// ---------------------------------------------------------------- arguments

test("arguments: usage errors", () => {
  put("a.js", lndf("why-not", "a | b"));
  put("b.js", lndf("why-not", "c | d"));
  put("m.txt", "subject\n");
  for (const args of [
    [],
    ["--today"],
    ["--today", "--", "a.js"],
    ["--today", "-x", "a.js"],
    ["--today", "-h"],
    ["--index"],
    ["--commit-msg"],
    ["--bogus", "a.js"],
    ["a.js", "--bogus"],
    ["-1e5", "a.js"],
    ["-x", "a.js"],
    ["a.js", "--today", TODAY, "b.js"],
    ["a.js", "--today", TODAY, "--", "b.js"],
    ["--commit-msg", "m.txt", "a.js"],
    ["a.js", "--commit-msg", "m.txt"],
    ["--require=1", "a.js"],
    ["--require=", "a.js"],
    ["-h=x"],
    ["--help=x"],
    ["--today="],
    ["--require"],
  ]) {
    assertSameUsageError(args);
  }
});

test("arguments: accepted forms", () => {
  put("a.js", lndf("why-not", "a | b"));
  put("b.js", lndf("temporal", "2026-10-02 | late"));
  put("m.txt", "subject\n");
  for (const args of [
    [`--today=${TODAY}`, "a.js", "b.js"],
    ["--today", TODAY, "a.js", "b.js"],
    ["a.js", "b.js", "--today", TODAY],
    ["a.js", "--", "b.js", "--today", TODAY],
    ["--today", TODAY, "a.js", "--", "b.js"],
    ["--today", TODAY, "a.js", "--", "b.js", "--"],
    ["--today", TODAY, "--", "--today", "b.js"],
    ["--today", TODAY, "-1", "a.js"],
    ["--today", TODAY, "-.5", "a.js"],
    ["--today", TODAY, "a.js", "-"],
    ["--today", TODAY, "a.js", ""],
    ["--today", TODAY, "--x=a b", "a.js"],
    ["--today", "2000-01-01", "--today", TODAY, "b.js"],
    ["--today", TODAY, "--commit-msg", "", "a.js"],
    ["--today", TODAY, "--commit-msg", "m.txt", "--require"],
    ["--today", TODAY, "--commit-msg=m.txt", "--commit-msg", "a.js"],
    ["--today", TODAY, "--index=", "a.js"],
    ["--today", TODAY, "--index", "", "a.js"],
  ]) {
    assertSame(args);
  }
});

test("arguments: help wins over other errors", () => {
  for (const args of [["-h"], ["--help"], ["-h", "--bogus"], ["--bogus", "-h"], ["a.js", "--help"]]) {
    const r = both(args);
    assert.equal(r.py.status, 0);
    assert.equal(r.js.status, 0);
    assert.equal(r.js.stderr, "");
  }
});

// ---------------------------------------------------------------- helpers against Python

test("pyStrip removes exactly what str.strip() removes", () => {
  const py = spawn(PY, ["-c", "import json; print(json.dumps([c for c in range(0x110000) if chr(c).strip() == '']))"], REPO);
  const expected = JSON.parse(py.stdout);
  const actual = [];
  for (let c = 0; c < 0x110000; c++) {
    if (c >= 0xd800 && c <= 0xdfff) continue;
    if (pyStrip(String.fromCodePoint(c)) === "") actual.push(c);
  }
  assert.deepEqual(actual, expected);
});

test("pyRepr matches repr()", () => {
  const samples = ["", "a.js", "it's.js", "say \"hi\"", "it's \"both\"", "back\\slash", "\t\n\r", "\x00\x1f\x7f",
    "\x85\xa0\xad\xff", "\u0378\u2028\u200b\ufeff\u3000", "\u65e5\u672c", "\u{1f600}", "\u{e0001}", "\u{10ffff}", "\ud800"];
  const py = spawn(PY, ["-c", "import json, sys; print(json.dumps([repr(s) for s in json.load(sys.stdin)]))"], REPO, JSON.stringify(samples));
  assert.deepEqual(samples.map(pyRepr), JSON.parse(py.stdout));
});
