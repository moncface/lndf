# lndf CLI changelog

## 0.1.0 — 2026-11-20

- `lndf validate`: checks `@lndf:` comments in source files, and `LNDF-*` trailers in a commit message or a `.lndf` file (`--commit-msg`), with `--require`, `--today` and `--index`. Same rules, messages and exit codes as `skills/lndf-comment/validate.py` (0 = PASS, 1 = FAIL, 2 = usage error); both pass the shared fixtures in `tests/fixtures/`.
- No runtime dependencies. Requires Node.js 22 or later.

Version 0.0.1 (2026-03) contained no command.
