#!/usr/bin/env python3
"""Run every fixture through a validator and check PASS/FAIL against the file name.

    python3 tests/run.py                       # uses skills/lndf-comment/validate.py
    python3 tests/run.py --validator <path>    # any validator with the same CLI contract

Contract: fixtures/commit/* are validated with `--commit-msg <file>`, fixtures/source/* as source
paths. A file whose name starts with `pass-` must exit 0, `fail-` must exit non-zero. Any
future implementation of the validator (the planned lndf CLI included) must pass this runner
unchanged; that is what keeps two implementations honest with each other.
"""
import argparse
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_VALIDATOR = os.path.join(HERE, "..", "skills", "lndf-comment", "validate.py")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--validator", default=DEFAULT_VALIDATOR)
    # @lndf:constraint fixtures contain expired temporal dates on purpose | pin "today" so fail-expired stays a failure and pass-* with 2099 dates stay passes
    ap.add_argument("--today", default="2026-10-03")
    args = ap.parse_args()

    failures = 0
    total = 0
    for surface, flag in (("commit", ["--commit-msg"]), ("source", [])):
        d = os.path.join(HERE, "fixtures", surface)
        for name in sorted(os.listdir(d)):
            path = os.path.join(d, name)
            expect_pass = name.startswith("pass-")
            cmd = [sys.executable, args.validator] + flag + [path, "--today", args.today]
            rc = subprocess.run(cmd, capture_output=True).returncode
            ok = (rc == 0) == expect_pass
            total += 1
            if not ok:
                failures += 1
            print(f"{'ok  ' if ok else 'BAD '} {surface}/{name} (exit={rc}, expected {'0' if expect_pass else 'non-zero'})")
    print(f"{total - failures}/{total} fixtures behave as named")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
