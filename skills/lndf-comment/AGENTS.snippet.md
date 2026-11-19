# Text to paste into AGENTS.md (for Codex / Luna / Sol)

Paste everything below the `---` as it is. It goes in two places, with the same text.

- Global: `AGENTS.md` in Codex's home (`$CODEX_HOME`, default `~/.codex`). Applies to every repo and every worktree on this machine
- repo: `AGENTS.md` at the repo root. Travels with the repo for when an agent runs on another machine

The skill itself is at `~/.agents/skills/lndf-comment/` for global use and at `.agents/skills/lndf-comment/` for a repo.

---

## Decision records (LNDF)

Read the lndf-comment skill before editing code or committing: `.agents/skills/lndf-comment/SKILL.md` in this repo if present, otherwise `~/.agents/skills/lndf-comment/SKILL.md`.

- In code: put `@lndf:<kind> <value> | <reason>` directly above a line where a judgment was made (kinds: why-not, constraint, heuristic, temporal). Only at judgment points, never as a file banner.
- In commits: put the reasons for the change as trailers in the final paragraph: `LNDF-why-not:`, `LNDF-constraint:`, `LNDF-heuristic:`, `LNDF-temporal:`, `LNDF-ref:`. Same `<value> | <reason>` shape, English. Commits with no judgment (typo, formatting, dependency bump) get no trailer.
- Write the commit message to a file and commit with `git commit -F <file>`. Do not build it with printf, echo or `-m` escapes.
- Never use `git commit --no-verify`. If the commit-msg hook fails, fix the trailer; a FAIL means the trailer shape is wrong, not that the change is.
- Do not restate the diff. Do not invent a reason you do not have; ask instead.
- In a public repository, write only reasons a reader can check from the code or public sources: no internal ticket or record IDs, no business, contract or review details, no names, no plans. To link an internal record, write the commit SHA in the record instead.
