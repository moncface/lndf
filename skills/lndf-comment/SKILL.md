---
name: lndf-comment
description: Convention for placing LNDF comments (@lndf:, four kinds) where a judgment was made, when writing or changing code. Applies whenever source code is handled with Write/Edit.
---

# lndf-comment — carrying judgment in code

An LNDF comment leaves in the code why it came out this way. It does not say what the code does (reading the code tells you that).
Place it **only on the line directly above where the judgment was made**. Do not gather them at the top of the file.

Judgment has two places, and both use the same vocabulary of four kinds.

| Place | What it keeps | Lifetime |
|---|---|---|
| In-code comment `@lndf:` | why **this place** is the way it is | lives with the code (gone when the code is gone) |
| Commit trailer `LNDF-<kind>:` | why **this change** happened, and what it discarded | lives with the history (stays after the code is gone) |

Constraints (constraint) and numbers (heuristic) have their home on the place side; rejected alternatives and provisional decisions (why-not / temporal) have their home on the change side. Do not write the same thing in both. Write `LNDF-heuristic` in a trailer only when you change an existing number (`LNDF-heuristic: 100ms -> 250ms | <reason for the change>`). A newly placed number needs only the comment.

## Format

```
// @lndf:<kind> <value> | <reason>
```

- The prefix `@lndf:` is fixed. Only the comment marker changes with the language (`;` AHK, `#` Python, `--` SQL, `<!-- -->` HTML, `/* */`)
- Exactly one `|`. The value on the left, the reason on the right
- One judgment per line. If the reason grows long, shorten the right side, put the details in a spec or memory, and write its ID (`see memory:NNN`). In a public repo, do not write the ID (the "Public repositories" section)
- **Write the text in English**

## kind (four kinds, closed set)

| kind | Left side (value) | Right side (reason) | When to place it |
|---|---|---|---|
| `why-not` | the option not taken | why it was not taken | when you chose among several options. Items dropped from an existing asset also go here |
| `constraint` | where the constraint comes from | what the constraint is | when an external factor (platform, review, law, contract, physics) fixed the shape |
| `heuristic` | number or threshold | basis (measurement, n, date). For a value you did not measure, start with `unmeasured;` and write why that number should be enough | when you put in a magic number |
| `temporal` | deadline `YYYY-MM-DD` | what to do after the deadline | when you put in a workaround or provisional code |

Do not create kinds outside these four. If none fits, it is an explanation, not a judgment, so do not write it.

## Examples

```js
// @lndf:why-not Promise.all | one failure must not reject the whole batch
const results = await Promise.allSettled(tasks);

// @lndf:constraint Chrome MV3 | service worker cannot stay alive; use alarms
chrome.alarms.create("tick", { periodInMinutes: 1 });

// @lndf:heuristic 300ms | perceived flicker threshold (n=5, 2026-04-12)
await sleep(300);

// @lndf:heuristic 100ms | unmeasured; most apps read the clipboard within one paste event, raise it if a paste comes out formatted
await sleep(100);

// @lndf:temporal 2026-12-01 | remove this branch after Supabase Auth v3 migration
const auth = legacyAuth();
```

```ahk
; @lndf:why-not SetTimer polling | WM_CLIPBOARDUPDATE fires only on change, no idle cost
OnClipboardChange(ClipChanged)
```

```python
# @lndf:why-not re.findall | need duplicate counts, Counter is direct
```

```sql
-- @lndf:constraint Supabase Data API 2026-10-30 | explicit GRANT required on new tables
```

## What not to place

- The purpose, arguments and return value of a function (that is the job of docstring / JSDoc)
- Places that just use the default, and obvious choices
- Values with no reason. Do not make up a reason afterwards. When you do not know the reason, do not write it; ask a person
- Secrets (API keys, tokens, passwords, JWTs). A prefix alone (`sk-ant-` etc.) may be written. When validate.py detects a value that looks real, it masks the value and FAILs
- A substitute for "TODO" / "FIXME" (if there is a deadline, use `temporal`; if not, it is not LNDF)
- The name of a source repository (write it in an ordinary comment; it is none of the four kinds)
- A banner at the top of the file. Only distributed sources (artifacts etc.) get `/*! LNDF */`. Not needed inside a repo

## Commit trailers

Put them in the last paragraph of the commit message as git trailers (`Key: value` lines, the same mechanism as `Signed-off-by:`).

```
<type>(<scope>): <subject>            ← the subject stays Conventional Commits

<body. optional. telegraphic style is fine>

LNDF-why-not: <value> | <reason>
LNDF-constraint: <value> | <reason>
LNDF-heuristic: <value> | <reason>
LNDF-temporal: YYYY-MM-DD | <reason>
LNDF-ref: memory:NNN
```

- The key is `LNDF-` + kind. The kind is spelled the same as in comments (no conversion). git does not distinguish upper and lower case
- The right side has the same `<value> | <reason>` format as comments, the text in English, one judgment per line. Separate judgments go on separate lines
- Only `LNDF-ref` has no `|`. Its value is `memory:NNN`, a spec ID, a URL or a commit SHA. It points at the decision this change executed (for checking afterwards). In a public repo, only a public target (a URL or a commit SHA)
- **Keep the trailers together in the last paragraph.** Placed in the middle of the body, git does not treat them as trailers (they can no longer be pulled with `git log --format='%(trailers:key=LNDF-temporal)'`)
- Do not write what the diff tells. Do not restate the subject either. Commits with no judgment (typo, formatting, dependency bump) get no trailer. Do not create a trailer that means "none"
- Secrets are handled the same as in comments. validate.py FAILs when it detects one
- **Write the message to a file and pass it with `git commit -F <file>`.** Do not use escapes with `printf` / `echo` / `-m`. The shell expands `\r` and `\n` into real control characters, and the record breaks even when it looks right. validate.py FAILs on control characters inside values

Example:

```
feat(collect): read decisions from git trailers

LNDF-why-not: parse JSONL transcripts only | Codex workers have no JSONL; git log is the one source all agents share
LNDF-temporal: 2026-12-31 | drop the legacy reader once the new store is verified
LNDF-ref: https://example.com/decisions/7
```

### Looking them up

- List of deadlines: `git log --format='%h %(trailers:key=LNDF-temporal,valueonly)' | grep .`
- List of discarded options: `git log --format='%(trailers:key=LNDF-why-not,valueonly)' | grep .`
- Commits that executed a given decision: `git log --format='%h %s' --grep='LNDF-ref: https://example.com/decisions/7'`

## Public repositories

The readers of comments and trailers are everyone who can read the repo. A reason says "why", so the writer's internal circumstances get into it easily. In a public repo, write only reasons a reader can check against the code or public sources.

- Do not write: IDs of internal records (ticket numbers, `memory:NNN`), the particulars of business, contracts or reviews, names of people or handles, plans or aims, who decided
- A constraint whose source is public (a platform's specification, a law, published review criteria) is written as it is. One whose source is not public (a contract, an internal decision, a particular person's request) is rewritten as the technical constraint the code is under

  ```
  # Not allowed (the source is not public)
  # @lndf:temporal 2026-12-31 | drop once the contract with the vendor ends
  # @lndf:constraint contract with <client> | responses must stay under 200 ms
  # Allowed (the technical form)
  # @lndf:temporal 2026-12-31 | drop the v1 endpoint fallback
  # @lndf:constraint latency budget | responses must stay under 200 ms
  ```

- To tie a change to an internal record, reverse the direction: do not point from a public commit at an internal ID; write the commit SHA in the internal record
- A reason that cannot be put in a technical form is not written. Keep that judgment in the internal record
- A private repo may be made public later. When in doubt, write as if it were public

## Steps

1. Before writing: when any of these happens — you compared options / bent to an external constraint / chose a number / took a provisional way out — keep that line in mind
2. When writing: one line directly above that line
3. Before committing: run `validate.py` from this skill folder as `python <skill-folder>/validate.py <path...>`, and commit only on PASS. `--index out.json` writes out a list of the `@lndf:` lines. **Write the `--index` output outside the repo** (it gathers every judgment into one file; do not commit it)
   - Claude Code on the PC: `python "$HOME/.claude/skills/lndf-comment/validate.py" <path...>`
   - Elsewhere (cloud etc.): `validate.py` in the Base directory shown when the skill is loaded
4. When committing: if the change has reasons (discarded options, provisional decisions, a decision it executes), write them as trailers. The format check is `validate.py --commit-msg <file>`; placed in git's `commit-msg` hook it becomes an automatic gate (copy `hooks/commit-msg` to `.git/hooks/`, or `git config core.hooksPath hooks`). The skill is the side that teaches how to write, the hook is the side every commit has to pass; place both
   - By default `--commit-msg` checks **only the format** (a commit with no trailer passes). Add `--require` only when you want to require, across the repo, that every commit with a judgment has a trailer. `--require` exempts merge / revert / `chore:` / `style:` / `docs:`

## Distributing to other agents (Codex etc.)

This SKILL.md can be read outside Claude Code too. Each agent has a fixed location (Codex's official docs: https://learn.chatgpt.com/docs/build-skills ).

| Agent | Global (every repo on this machine) | Per repo |
|---|---|---|
| Claude Code | `~/.claude/skills/lndf-comment/` | `.claude/skills/lndf-comment/` |
| Codex | `~/.agents/skills/lndf-comment/` | `.agents/skills/lndf-comment/` (plural; searched from the working directory up to the repo root) |

Paste the text of `AGENTS.snippet.md` into AGENTS.md. For global use, the `AGENTS.md` in Codex's home (`$CODEX_HOME`, default `~/.codex`); for a repo, the `AGENTS.md` at the repo root. The commit-msg hook is on the git side, so the same gate applies to commits from any agent.

The skill is also placed in the repo because, when an agent runs on another machine (an Orca SSH worktree etc.), this copy is the only one that travels with the repo. When placing it in a repo, pin the line endings and the executable bit. If Windows `core.autocrlf=true` converts it to CRLF, the first line of the hook becomes `#!/bin/sh\r` and the hook stops working.

- `.agents/** text eol=lf` in `.gitattributes`
- `git update-index --chmod=+x .agents/skills/lndf-comment/hooks/*`

The hook passes messages that have no LNDF line without calling Python (except with `--require`). Even when installed globally, it does not stop unrelated commits in environments without Python.

## References

- The convention in full: the "Reference Implementation: lndf-comment" section of the LNDF README (https://github.com/moncface/lndf#reference-implementation-lndf-comment) and "The .lndf File" section after it
