# lndf CLI changelog

## 0.2.0 — 2026-11-22

- `lndf parse`: prints LNDF judgment records as a JSON array on stdout. It reads `@lndf:` comments in source files (the five fields of `validate --index`), the `LNDF-*` trailers of a commit message or `.lndf` file (`--commit-msg`), or the trailers of the commits reachable from HEAD (`--git`, with `--range` and `--max-count`). It does not check them: a malformed line is left out and named on stderr, an expired `temporal` date is kept, and a value that looks like a secret is printed as `[REDACTED]`. Exit status: 0 = printed, 1 = a file cannot be read or git is missing or fails, 2 = usage error.
- `lndf validate` is unchanged.

## 0.1.0 — 2026-11-20

- `lndf validate`: checks `@lndf:` comments in source files, and `LNDF-*` trailers in a commit message or a `.lndf` file (`--commit-msg`), with `--require`, `--today` and `--index`. Same rules, messages and exit codes as `skills/lndf-comment/validate.py` (0 = PASS, 1 = FAIL, 2 = usage error); both pass the shared fixtures in `tests/fixtures/`.
- No runtime dependencies. Requires Node.js 22 or later.

Version 0.0.1 (2026-03) contained no command.
