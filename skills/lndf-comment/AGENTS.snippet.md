# Text to paste into AGENTS.md and CLAUDE.md

Paste everything below the `---` as it is. The same text goes in each place below.

For Codex / Luna / Sol, in `AGENTS.md`:

- Global: `AGENTS.md` in Codex's home (`$CODEX_HOME`, default `~/.codex`). Applies to every repo and every worktree on this machine
- repo: `AGENTS.md` at the repo root. Travels with the repo for when an agent runs on another machine

The skill itself is at `~/.agents/skills/lndf-comment/` for global use and at `.agents/skills/lndf-comment/` for a repo.

For Claude Code: from v2.1.277, Claude Code reads the repo's `AGENTS.md` when there is no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the working directory or above it. When one of them is there, it reads only the `CLAUDE.md` files by default. It reads `AGENTS.md` only from the working directory and the directories above it, so the global `AGENTS.md` in Codex's home does not reach it. Source: https://code.claude.com/docs/en/memory#agents-md

So paste the same text into `CLAUDE.md` too:

- Global: `~/.claude/CLAUDE.md`
- repo: the repo's `CLAUDE.md`, when the repo has one

In `CLAUDE.md`, change `.agents/` to `.claude/` in the two skill paths of the text: `.claude/skills/lndf-comment/SKILL.md` in the repo, otherwise `~/.claude/skills/lndf-comment/SKILL.md`.

---

## Decision records (LNDF)

Read the lndf-comment skill before editing code or committing: `.agents/skills/lndf-comment/SKILL.md` in this repo if present, otherwise `~/.agents/skills/lndf-comment/SKILL.md`.

- Before planning a change in a git repository, read `git log -20 --format='%h %s%n%(trailers:key=LNDF-why-not,valueonly)'`. It lists the alternatives already rejected and the reasons.
- In code: put `@lndf:<kind> <value> | <reason>` directly above a line where a judgment was made (kinds: why-not, constraint, heuristic, temporal). Only at judgment points, never as a file banner.
- In commits: put the reasons for the change as trailers in the final paragraph: `LNDF-why-not:`, `LNDF-constraint:`, `LNDF-heuristic:`, `LNDF-temporal:`, `LNDF-ref:`. Same `<value> | <reason>` shape, English. Commits with no judgment (typo, formatting, dependency bump) get no trailer.
- Write the commit message to a file and commit with `git commit -F <file>`. Do not build it with printf, echo or `-m` escapes.
- Never use `git commit --no-verify`. If the commit-msg hook fails, fix the trailer; a FAIL means the trailer shape is wrong, not that the change is.
- Do not restate the diff. Do not invent a reason you do not have; ask instead.
- In a public repository, write only reasons a reader can check from the code or public sources: no internal ticket or record IDs, no business, contract or review details, no names, no plans. To link an internal record, write the commit SHA in the record instead.
