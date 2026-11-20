# lndf-comment CHANGELOG

## v0.2 — 2026-09-30 (commit trailers)

Reason: after confirming that what LNDF points at moved from "a compressed representation of state" to "a record of judgment",
the place for judgment was split in two, "place (comment)" and "change (commit)". Both use the same four-kind vocabulary; no separate skill is made.

Added:
- SKILL.md: the table dividing the two places, the "Commit trailers" section (format, example, lookup), step 4, the section on distributing to other agents
- validate.py: `--commit-msg FILE` mode (format check of LNDF-<kind>: trailers, check that they sit in the final paragraph, secret detection), `--require` (makes a trailer mandatory, exempting types that carry no judgment)
- hooks/commit-msg: the git gate. The location of validate.py can be overridden with LNDF_VALIDATE; otherwise it searches .agent/skills/
- hooks/prepare-commit-msg: optional. Only shows a trailer template as comment lines (git discards them, so there is no side effect)
- AGENTS.snippet.md: text to append to AGENTS.md for Codex-family agents

Unchanged:
- The format, the four kinds and the checks of `@lndf:` comments stay as in v0.1. Existing PASS/FAIL results do not change

Install:
- Claude Code: replace `~/.claude/skills/lndf-comment/` with this folder (a CLAUDE.md that points at the skill needs no change)
- Shared repo: the same folder in `.agent/skills/lndf-comment/`, the snippet in AGENTS.md, hooks/commit-msg in `.git/hooks/commit-msg`

## v0.2.1 — 2026-10-03
- hooks/commit-msg: the Python lookup now tries python → py → python3 in that order and takes the first one on which "import sys" succeeds (against the Microsoft Store stub on Windows). Nothing else changed

## v0.2.2 — 2026-10-03
- hooks/commit-msg: messages with no LNDF line pass without calling Python (except with --require). So that a global install does not stop unrelated commits in environments without Python
- SKILL.md: added pinning the line endings (eol=lf for .agent/** in .gitattributes) and the executable bit when distributing in a repo

## v0.2.3 — 2026-10-03
- validate.py: control characters (C0 except tab, and DEL) inside the values of @lndf lines and LNDF trailers now FAIL. --commit-msg reads without treating CR as a newline (Python's default newline translation split lines at a lone CR, cutting a broken trailer into two lines that both PASSed). It started while e07264e was being made: a trailer in which printf had expanded "\\r" into a real CR passed every check
- SKILL.md: added "write the commit message to a file and pass it with git commit -F"

## v0.2.4 — 2026-10-03
- The location moved from `.agent/skills` (singular) to `.agents/skills` (plural) to match Codex's official docs. Global is `~/.agents/skills/`, and the global AGENTS.md is `~/.codex/AGENTS.md` (official: learn.chatgpt.com/docs/build-skills, /docs/agent-configuration/agents-md). The old path came from the 2026-03 compatibility map and was not on Codex's skill search path (it was read only through direct instructions in AGENTS.md)
- hooks/commit-msg: the validate.py lookup order is now LNDF_VALIDATE → ~/.claude/skills → ~/.agents/skills → <repo>/.agents/skills
- AGENTS.snippet.md: the same text is now pasted in two places, global and repo. Added using git commit -F and forbidding --no-verify
- SKILL.md: the table of locations (Claude Code / Codex × global / repo); the .gitattributes and chmod examples now use .agents

## v0.2.5 — 2026-10-03
- SKILL.md only. Two points from the results of the trial in lndf-trial (aa7d418)
  - Stated that heuristic has its home on the place side (comment). Write LNDF-heuristic in a trailer only when changing an existing number. In the trial the same 100ms was written twice, in the comment and in the trailer
  - A number that was not measured gets unmeasured; at the start of the right side. Agents cannot measure things like wait times, and were left to either invent a basis or write the purpose. Numbers placed on a guess can be found later with grep
- validate.py and hooks unchanged

## v0.2.6 — 2026-10-03
- validate.py: .md is removed from directory scans. This keeps example text in docs (temporal dates) from FAILing once it expires. Judgments are assumed to live in code. A file named directly is checked as before

## v0.2.7 — 2026-11-20
- SKILL.md: added the "Public repositories" section. Comments and trailers in a public repo carry only reasons a reader can check. The values of `see memory:NNN` and `LNDF-ref` are limited to public targets too
- AGENTS.snippet.md: the same rule added as one item
- Why: a pre-push hook that matches strings can stop an ID or a path, but not a reason written as a sentence, so the rule has to reach the writer
- validate.py unchanged (it cannot tell whether a repo is public)

## v0.2.8 — 2026-11-20
- SKILL.md, CHANGELOG.md and AGENTS.snippet.md are now in English. SKILL.ja.md is the Japanese version of SKILL.md, with the same sections, tables and lists
- The "Public repositories" section of v0.2.7 is in both SKILL.md and SKILL.ja.md
- Fit for a public repo: examples cite a public target (an example.com URL) instead of a numbered record ID, the example deadline names a generic reader and store, the validate.py path is written with `$HOME`, and References point at the LNDF README instead of internal records and an unpublished sibling skill
- validate.py: the two Japanese comments are now in English. The checks do not change

## v0.2.9 — 2026-11-20
- SKILL.ja.md: the front matter `description` value is now in double quotes. Its `(@lndf: 4種)` has a colon followed by a space, which YAML reads as a key separator in an unquoted value, so the front matter did not parse

## v0.2.10 — 2026-11-21
- AGENTS.snippet.md: "Decision records (LNDF)" gains one item: before planning a change in a git repository, read the last 20 commits with their `LNDF-why-not` trailers. A rejected alternative recorded in a trailer sits in history, below later commits, where an agent planning a change does not look on its own
- AGENTS.snippet.md (the part above `---`, which is not pasted) and README "Distribution": Claude Code v2.1.277 and later reads the repo's `AGENTS.md` only from the working directory and above it, and by default not when a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` is there. For Claude Code the same text also goes into `~/.claude/CLAUDE.md` and into the `CLAUDE.md` of a repo that has one, with the skill paths under `.claude/skills/`
- Measured only with the reading line in Claude Code's `CLAUDE.md`. Not measured through `AGENTS.md`, for Codex or for Claude Code
- SKILL.md and SKILL.ja.md are unchanged. Their "Distributing to other agents" section still names only `AGENTS.md`
