# LNDF specification changelog

## v0.2 — written 2026-10, published 2026-11

The rule did not change: write only what the reader cannot infer. What it points at did.

- **Payload: judgment, not state.** v0.1's reference implementation (`mon ld`) wrote branch, last commit, changed files, stack and test result — all of which a coding agent now reads from the repository by itself. v0.2 records the four things it cannot read: `why-not`, `constraint`, `heuristic`, `temporal`.
- **Three surfaces, one grammar.** In-code comment (`@lndf:`), commit trailer (`LNDF-<kind>:`), standalone `.lndf` file. Same `<value> | <reason>` line, same validator.
- **The `.lndf` file is a transport.** It is the trailer paragraph standing alone. It is not a running log inside the repository; `.lndf/current.lndf` and `.lndf/history/` are retired.
- **Reference implementation moved** from Mon CLI (`ld` / `lv` / `lc` / `lp` / `lt`) to the `lndf-comment` skill in `skills/lndf-comment/`. Mon CLI's LNDF commands are retired but not yet removed from that project.
- **Continuity first.** Token reduction is stated as a by-product; the stated purpose is carrying judgment across sessions, agents and models.
- `unmeasured;` marker for numbers the writer did not measure.
- `LNDF-ref:` trailer for the decision a commit executes.

Unchanged: the six principles, the Five Communication Safety Principles (defined in SCR), the name and its cultural root, licensing.

## v0.1 — 2026-03

Initial specification: intent over data, six principles, Mon CLI as reference implementation (project state distillation).
