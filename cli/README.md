# lndf CLI

`lndf validate` checks LNDF judgment records: `@lndf:` comments in source files, and `LNDF-*` trailers in a commit message or a `.lndf` file. It is a TypeScript port of [`skills/lndf-comment/validate.py`](../skills/lndf-comment/validate.py) with the same rules, messages and exit codes, and both are held to the same fixtures. The record format is described in the [specification](../README.md).

## Usage

```
lndf validate <file-or-dir>... [--index out.json] [--today YYYY-MM-DD]
lndf validate --commit-msg <file> [--require] [--today YYYY-MM-DD]
lndf --help | --version
```

### Source files

Every line that contains `@lndf:<kind>` is checked:

- the kind is one of `why-not`, `constraint`, `heuristic`, `temporal`;
- value and reason are separated by exactly one `|`, and neither side is empty;
- a `temporal` value is a `YYYY-MM-DD` date that has not passed;
- the line holds no control character and nothing that looks like a key or token.

A directory is searched recursively for files with these extensions (case-sensitive): `.js .mjs .cjs .ts .tsx .jsx .py .sql .sh .ahk .ahk2 .ah2 .css .html .yml .yaml .toml .json .kt .java .go .rs .c .h .cpp .cs .swift`. Folders named `.git`, `node_modules`, `dist`, `build`, `.venv` and `__pycache__` are skipped, and symlinked folders are not entered. A path given directly is read as source whatever its extension.

### Commit messages and .lndf files

`--commit-msg FILE` checks the `LNDF-<kind>: <value> | <reason>` and `LNDF-ref: <id>` trailers in the final paragraph of a commit message. Lines that start with `#` are ignored, as git ignores them. A trailer above the final paragraph is an error, because git will not parse it there. With `--require`, a message with no trailer fails unless its subject starts with `Merge`, `Revert`, `chore:`, `style:` or `docs:`.

`.lndf` files use the trailer grammar, so pass them with `--commit-msg`, not as a path. Given as a path, a `.lndf` file is read as source and its trailers are not checked.

### Index

`--index out.json` writes every `@lndf:` line found in source files to a JSON array, whether or not the check passes:

```json
[
  {
    "path": "src/app.js",
    "line": 12,
    "kind": "why-not",
    "value": "polling",
    "reason": "the API pushes events"
  }
]
```

A line that looks like it holds a key or token is written with `[REDACTED]` as value and reason. The file is UTF-8 with LF line endings and no final newline. `--index` is ignored with `--commit-msg`.

### Dates

`temporal` dates are compared with today's local date, or with the date given by `--today YYYY-MM-DD`.

### Exit status

| Status | Meaning |
| --- | --- |
| 0 | PASS |
| 1 | FAIL: at least one issue, each printed on stderr |
| 2 | usage error |

The summary line (`PASS (...)` or `FAIL (...)`) goes to stdout.

### Byte order mark

A leading UTF-8 byte order mark is not removed; it stays part of the first line, as it does in `validate.py`. In a source file the records are still found. In a commit message or a `.lndf` file, the first line then does not start with `LNDF-` or `#`, so a trailer there is not recognised and a comment there is not ignored.

## Differences from validate.py

For the same input the output is the same, except:

- `--today` accepts only `YYYY-MM-DD`. Any other value is a usage error (exit 2), where `validate.py` stops with a traceback.
- Options must be written in full. `validate.py` also accepts prefixes such as `--tod`, and joined short options such as `-hx`.
- The index has LF line endings on every platform.
- If the index cannot be written, the CLI prints one line and exits 1, where `validate.py` stops with a traceback.
- Messages for unreadable files copy Python's for a missing file, a denied file and a directory. Other errors use the Node.js message.
- On Windows, a directory junction is treated as a symlink and not entered.

## Requirements

Node.js 22 or later. No runtime dependencies.

## Development

```
cd cli
npm ci
npm test
python3 ../tests/run.py --validator ../tests/lndf_cli.py
```

`npm test` builds the CLI, then runs its tests. Most of them are differential: they run `validate.py` and the CLI on the same input and compare exit status, stdout, stderr and the index. They need Python 3.9 or later; `LNDF_PYTHON` chooses the interpreter.

## License

Apache-2.0
