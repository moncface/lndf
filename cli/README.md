# lndf CLI

`lndf` checks and reads LNDF judgment records. `lndf validate` checks LNDF judgment records: `@lndf:` comments in source files, and `LNDF-*` trailers in a commit message or a `.lndf` file. It is a TypeScript port of [`skills/lndf-comment/validate.py`](https://github.com/moncface/lndf/blob/main/skills/lndf-comment/validate.py) with the same rules, messages and exit codes, and both are held to the same fixtures. The record format is described in the [specification](https://github.com/moncface/lndf/blob/main/README.md). `lndf parse` (0.2.0 and later) prints them as JSON; see Parse below.

## Install

Run it without installing, or install the `lndf` command globally:

```
npx lndf validate <file-or-dir>
npm install -g lndf
```

## Usage

```
lndf validate <file-or-dir>... [--index out.json] [--today YYYY-MM-DD]
lndf validate --commit-msg <file> [--require] [--today YYYY-MM-DD]
lndf parse <file-or-dir>...
lndf parse --commit-msg <file>
lndf parse --git [--range <revision-range>] [--max-count <n>]
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

## Parse (0.2.0 and later)

`lndf parse` prints the same records as a JSON array on stdout. It does not
check them; `lndf validate` does.

    lndf parse <file-or-dir>...
    lndf parse --commit-msg <file>
    lndf parse --git [--range <revision-range>] [--max-count <n>]

`npx lndf` runs the version published on npm, and 0.1.0 has no `parse`.
`lndf --version` shows which version you run.

- Paths are read as `lndf validate` reads them. Each record has `path`,
  `line`, `kind`, `value` and `reason`, the fields of `--index`.
- `--commit-msg` reads one commit message or `.lndf` file. `path` is the file
  as given, and `line` counts every line of the file, `#` lines included.
- `--git` reads the commits reachable from `HEAD`, or from `--range`, newest
  first in `git log` order. `--max-count` limits the number of commits. Each
  record has `commit` (40 hex digits), `date` (the committer date, ISO 8601
  with the offset stored in the commit), `subject`, `line` (in the message),
  `kind`, `value` and `reason`. In a shallow clone, a note on stderr says
  that older commits are not read.
- `LNDF-ref` is a record of kind `ref`, with the id as `value` and an empty
  `reason`.
- A malformed line is left out and named on stderr:
  `<path or commit>:<line>: skipped: <reason>`, with the messages of
  `lndf validate`. An expired `temporal` date is kept. A value that looks
  like a secret is printed as `[REDACTED]`.

For example, `lndf parse --commit-msg tests/fixtures/commit/pass-three-trailers.txt` prints:

```json
[
  {
    "path": "tests/fixtures/commit/pass-three-trailers.txt",
    "line": 5,
    "kind": "why-not",
    "value": "parse JSONL only",
    "reason": "Codex has no JSONL; git log is shared"
  },
  {
    "path": "tests/fixtures/commit/pass-three-trailers.txt",
    "line": 6,
    "kind": "temporal",
    "value": "2099-01-31",
    "reason": "drop legacy reader after new store verified"
  },
  {
    "path": "tests/fixtures/commit/pass-three-trailers.txt",
    "line": 7,
    "kind": "ref",
    "value": "https://example.com/decisions/7",
    "reason": ""
  }
]
```

Exit status: 0 when the records were printed (an empty array included);
1 when a file cannot be read, the directory is not in a git repository, or
git is missing or fails, with nothing on stdout; 2 on a usage error.

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
