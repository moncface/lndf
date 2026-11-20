// Behavior of the lndf command itself, where it is not a copy of validate.py.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(CLI_DIR, "dist", "cli.js");

function lndf(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  if (r.error) throw r.error;
  return r;
}

test("--help says that .lndf files go through --commit-msg", () => {
  for (const args of [["--help"], ["-h"], ["validate", "--help"]]) {
    const r = lndf(...args);
    assert.equal(r.status, 0);
    assert.equal(r.stderr, "");
    assert.match(r.stdout, /\.lndf files use the trailer\s+grammar, so pass them with --commit-msg/);
    assert.match(r.stdout, /Exit status: 0 = PASS, 1 = FAIL, 2 = usage error\./);
  }
});

test("--version prints the package version", () => {
  const pkg = JSON.parse(readFileSync(join(CLI_DIR, "package.json"), "utf8"));
  const r = lndf("--version");
  assert.equal(r.status, 0);
  assert.equal(r.stdout, `${pkg.version}\n`);
});

test("a missing or unknown command is a usage error", () => {
  for (const args of [[], ["parse"], ["--bogus"]]) {
    const r = lndf(...args);
    assert.equal(r.status, 2);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^usage: lndf validate/);
  }
});

test("--today takes only a real YYYY-MM-DD date, else exit 2", () => {
  for (const bad of ["2026-02-30", "20261003", "2026-W40-6", "-1", "2026-10-03T00:00"]) {
    const r = lndf("validate", "x.js", "--today", bad);
    assert.equal(r.status, 2, bad);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /error: argument --today: invalid date .* \(expected YYYY-MM-DD\)$/m);
  }
});

test("an index that cannot be written: one message, exit 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "lndf-cli-"));
  try {
    const src = join(dir, "a.js");
    writeFileSync(src, "// no records\n");
    const index = join(dir, "no-such-dir", "index.json");
    const r = lndf("validate", src, "--index", index);
    assert.equal(r.status, 1);
    assert.equal(r.stdout, "");
    assert.match(r.stderr, /^.*index\.json: cannot write \(\[Errno 2\] No such file or directory: .*\)\n$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
