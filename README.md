# LNDF — LLM-Native Data Format

[![License](https://img.shields.io/github/license/moncface/lndf)](https://github.com/moncface/lndf/blob/main/LICENSE)

**Write only what the LLM cannot infer.**

Specification v0.2 (written 2026-10, published 2026-11). v0.1 (2026-03) is preserved in the git history and summarised in [CHANGELOG.md](CHANGELOG.md).

---

## What is LNDF?

LNDF (LLM-Native Data Format) is a format discipline for text that a Large Language Model will read. Its single rule: **the text carries only what the reader cannot infer.** Everything an LLM already knows — language syntax, platform conventions, the contents of the files it can open, the state of the repository it can query — is left out.

v0.1 applied this rule to data: describe a UI by intent instead of pixel values, describe a project by a dozen key:value lines instead of a log. Six months of daily use with coding agents changed what the rule points at. Once an agent can read the repository itself, most *data* is inferable. What it cannot infer is the **judgment** behind the data: which alternative was rejected and why, which external constraint forced a shape, why a threshold is 300 and not 100, which workaround is temporary and until when.

So v0.2 makes judgment the primary payload. LNDF records are short lines, placed where the judgment happened, in four closed kinds:

| kind | records | example |
|---|---|---|
| `why-not` | a rejected alternative and the reason | `why-not Promise.all \| one failure must not reject the whole batch` |
| `constraint` | an external source and what it forces | `constraint Chrome MV3 \| service worker cannot stay alive; use alarms` |
| `heuristic` | a number and its basis | `heuristic 300ms \| perceived flicker threshold (n=5, 2026-04-12)` |
| `temporal` | a deadline and what to do after it | `temporal 2026-12-01 \| remove this branch after Auth v3 migration` |

The same four kinds appear on three surfaces — a comment above the line, a trailer at the end of a commit message, and a standalone `.lndf` file — with one grammar and one validator. See [Reference Implementation](#reference-implementation-lndf-comment).

The first purpose is **continuity**: the next session, the next agent, or the next model picks up the judgment without re-deriving it. Token reduction follows, but it is a by-product, not the goal.

LNDF is an implementation of [Shared Context Reduction (SCR)](https://github.com/moncface/scr) — the general principle of not transmitting what both parties already know. The Five Communication Safety Principles below are defined in the SCR specification and apply to every SCR implementation.

---

## The Core Insight

Every existing data format answers the question:
*"How do I give a machine all the information it needs?"*

LNDF answers a different question:
*"What is the minimum I need to say for an intelligent reader to understand my intent?"*

This is not syntactic compression. Syntactic compression preserves all information in a smaller encoding. LNDF performs **semantic compression** — it omits information entirely, using the reader's world knowledge and its access to the environment as the decompression dictionary. The distinction is fundamental: syntactic compression reduces the size of the message; semantic compression reduces the message itself.

The consequence that took six months to see: when the reader can look at the code, the git history and the test output on its own, the part of the message that survives semantic compression is almost entirely *why*. LNDF v0.2 is the format of that residue.

---

## Principles

The six principles of v0.1 stand. Principle 2 — omit what the reader already knows — is the governing one; the others are its consequences for particular cases. The v0.1 examples below describe data (UI intent, project state); v0.2 applies the same principles to judgment, where "what the reader already knows" now includes everything it can read from the repository.

### 1. Intent over Data

The format carries the creator's intent, not the implementation details. The LLM resolves intent into specifics using its training knowledge.

```
Traditional (explicit):
{"device": "iPhone 15 Pro Max", "screen_width": 430, "screen_height": 932,
 "safe_area_top": 59, "safe_area_bottom": 34, "status_bar_height": 47,
 "corner_radius": 55, "ppi": 460}

LNDF (intent):
{"class": "mobile-tall", "safe": "notch", "density": "high"}
```

The LLM knows every device specification. Sending those numbers is redundant.

### 2. Omit What the Parser Knows

If the LLM's training data contains the information, it does not belong in the format. This applies to:

- Device specifications (screen sizes, safe areas, densities)
- Framework syntax (React, SwiftUI, Flutter, Jetpack Compose)
- Design pattern conventions (navigation patterns, layout paradigms)
- Platform guidelines (Human Interface Guidelines, Material Design)
- Programming language idioms

### 3. Defaults Are Silence

Unspecified values are not errors — they are delegations. The LLM applies contextually appropriate defaults. Only deviations from the expected require explicit statement.

```
LNDF:
{"t": "btn", "y": 100, "h": 48, "bg": "#007AFF"}
```

Width, border radius, font size, padding — all absent. The LLM applies platform-appropriate defaults. Only the position, height, and non-standard color are stated.

### 4. Differential Expression

When modifying an existing design, only the delta is transmitted. The base state exists in the LLM's context (via prior conversation, skill files, or cached definitions).

```
{"$": "base-preset-id", "+": ["input@200"], "-": ["footer"], "~": {"header.h": 80}}
```

`$` = base reference, `+` = additions, `-` = removals, `~` = modifications.

### 5. Timelessness Through Abstraction

Because LNDF does not encode device-specific or framework-specific values, the format does not require updates when new devices or frameworks emerge. The LLM's knowledge updates; the format does not.

A file written today describing `{"class": "mobile-tall", "safe": "notch"}` will be correctly interpreted for a device released in 2030, because the LLM of 2030 will know that device's specifications.

### 6. Human-LLM Dual Readability

Data compressed to the intent level becomes optimal not only for LLMs but also for humans. This is not a side effect — it is an inherent property of intent-based description.

Existing formats force a choice. Specification documents (.md) are readable for humans but verbose for LLMs. Configuration files (JSON/YAML) are precise for machines but cognitively expensive for humans. Conversation logs contain every detour and correction when both parties only need the conclusion.

LNDF contains only intent. Because details are omitted, humans grasp the full picture at a glance. Because structure is preserved, LLMs parse it exactly. The same file, at the same granularity, serves both readers.

```
{"done":["basic-timer","statusbar","settings","notice"],
 "wip":"daily-note-log",
 "bug-fixed":"notice not firing at timer=0"}
```

A human reads this in 10 seconds and knows: four features complete, one in progress, one bug fixed. An LLM receives about 35 tokens and can continue the work from there.

The same holds for a judgment line. `why-not Promise.all | one failure must not reject the whole batch` is read by a maintainer in two seconds and by an agent as a constraint it must not undo. Neither reader needs the discussion that produced it.

| Metric | Conventional (logs/specs) | LNDF |
|--------|--------------------------|------|
| Human review time | 10–20 minutes | 10 seconds |
| LLM injection tokens | 800–5,000 | 30–50 |

*These figures are illustrative, not measured. They compare the 35-token example above with the kind of log or specification it would replace.*

"Intent" is the abstraction level that humans and intelligent parsers share. Formats that describe details inevitably optimize for one side or the other. Formats that describe intent transcend this dichotomy.

This extends the cultural root of 以心伝心 described in the Name section. LNDF is not "human-to-LLM ishin-denshin." It is ishin-denshin **between** human and LLM — a shared language of intent where both parties read the same silence with the same understanding.

---

## Why Now?

Before LLMs, this was impossible. Parsers had no world knowledge. `JSON.parse()` cannot infer that `"mobile-tall"` means a 9:19.5 aspect ratio with approximately 430 logical pixels of width. Every value had to be explicit.

LLMs changed the fundamental capability of the parser. For the first time in computing history, the consumer of structured data understands context, convention, and domain knowledge. Data formats designed before this capability shift carry unnecessary information by structural necessity.

LNDF is the first format philosophy designed for this new reality.

### The Three-Stage Architecture

```
Specification (input quality)  →  .lndf (intent conduit)  →  LLM (meaning expansion)
```

The specification layer (skill files, presets, session history) ensures input quality and controls variance. The .lndf file carries only the minimal intent. The LLM expands intent into full output using its world knowledge. Each layer has a single responsibility. .lndf does not control variance — the specification does. .lndf does not interpret meaning — the LLM does. .lndf is a transparent pipe between the two.

In v0.2 the three stages read: the skill (`SKILL.md`) says what counts as a judgment and how to write it; the record (comment, trailer or `.lndf` file) carries only that judgment; the agent that reads it restores the reasoning and acts. The validator sits between the second and third stage and lets through only well-formed records.

---

## Token Economics

Reduction is a by-product. The first purpose of LNDF is continuity — carrying judgment across the boundary of a session, an agent or a model without re-deriving it. That said, a practical consequence of the intent-over-data principle is that fewer tokens are sent. Structured data sent to LLMs via API carries a direct cost per token.

| Approach | Relative Token Count | Relative Cost |
|----------|---------------------|---------------|
| Standard JSON (full specification) | 100% | 100% |
| Minified JSON | ~80% | ~80% |
| TOON (Token-Oriented Object Notation) | ~40-70% | ~40-70% |
| LNDF (intent only) | ~4-16% (projected, not measured) | ~4-16% (projected, not measured) |

*Note: the LNDF row is not a measurement. It is a projection from the v0.1 work on UI specification payloads, where most fields could be left out because the model already knew them. It has not been benchmarked, and it does not describe the v0.2 judgment records.*

TOON, Morph Compact and LLMLingua compress the same information. LNDF sends less information: it leaves out what the reader can infer. These are different operations, so the rows above do not rank one against the other.

In the v0.2 setting the saving has a different shape: an agent that receives a handful of judgment lines does not re-explore the history to reconstruct them. The amount saved scales with the number of hand-offs between agents, which is why it was invisible while agents were used one at a time.

The same holds for work that runs without a person: scheduled jobs, maintenance runs, long agent tasks. Each run starts without the context of the one before it, and usually nobody reads more than its report. What the last run decided against has to be in the repository, or the next run spends tokens reaching the same decision again, or undoes it. This has not been measured.

---


---

## Reference Implementation: lndf-comment

The reference implementation of v0.2 is the `lndf-comment` agent skill in [`skills/lndf-comment/`](skills/lndf-comment/). It consists of the rules an agent reads before writing code or committing (`SKILL.md`), a deterministic validator (`validate.py`), a `commit-msg` git hook, and the text to paste into `AGENTS.md`. Nothing in it calls an LLM; the skill tells the writer what to record, and the validator refuses what is malformed. The writer is usually a coding agent (Claude Code, Codex, or any agent that reads `AGENTS.md`), so the recording cost falls on the agent, not on the human.

### One grammar, three surfaces

```
<kind> <value> | <reason>
```

Exactly one `|`. Left of it the value, right of it the reason. One judgment per line. Reasons are written in English. The four kinds are a closed set; if none fits, it is not a judgment but an explanation, and it is not written.

| surface | form | what it records | lifetime |
|---|---|---|---|
| in-code comment | `// @lndf:<kind> <value> \| <reason>` directly above the line | why **this place** is the way it is | with the code |
| commit trailer | `LNDF-<kind>: <value> \| <reason>` in the final paragraph of the commit message | why **this change** happened, what it rejected | with the history, even after the code is gone |
| `.lndf` file | the same trailer lines, standalone | judgment in transit between agents or stores | until consumed |

`constraint` and `heuristic` belong to the place (the comment). `why-not` and `temporal` belong to the change (the trailer). A trailer `LNDF-heuristic` is written only when an existing number changes (`100ms -> 250ms | reason`). The same judgment is never written on both surfaces.

A fifth trailer key, `LNDF-ref: <id>`, points at the decision a commit executes (a memory record, a spec id, a URL or a commit SHA). It takes a bare id, no `|`.

### Example

```js
// @lndf:constraint Chrome MV3 | service worker cannot stay alive; use alarms
chrome.alarms.create("tick", { periodInMinutes: 1 });

// @lndf:heuristic 100ms | unmeasured; most apps read the clipboard within one paste event, raise it if a paste comes out formatted
await sleep(100);
```

```
feat(collect): read decisions from git trailers

LNDF-why-not: parse JSONL transcripts only | Codex workers have no JSONL; git log is the one source all agents share
LNDF-temporal: 2026-12-31 | drop the legacy reader once the new store is verified
LNDF-ref: https://example.com/decisions/7
```

Because trailers are a git-native structure, git itself can query them:

```
git log --format='%h %(trailers:key=LNDF-temporal,valueonly)' | grep .     # every deadline
git log --format='%(trailers:key=LNDF-why-not,valueonly)' | grep .         # every rejected alternative
```

### What is not written

- what the code does (that is what the code is for), docstrings, parameter lists
- defaults taken as they are, obvious choices
- a reason the writer does not have (write nothing and ask; never invent one)
- a `TODO` without a date (if it has a date it is `temporal`; if not, it is not LNDF)
- secret values; the validator refuses lines that look like keys or tokens
- numbers the writer never measured, unless the reason starts with `unmeasured;` so the guess can be found later

### Validation

`validate.py` checks the grammar on all three surfaces and exits non-zero on the first malformed line: unknown kind, missing or doubled `|`, empty value or reason, an expired `temporal` date, a control character inside a line (a shell-expanded escape), or a probable secret. For commit messages it also refuses LNDF lines placed outside the final paragraph, which git would not parse as trailers.

The `commit-msg` hook runs the validator on every commit. It passes messages that contain no LNDF line without starting Python, so installing it globally costs nothing on commits that record no judgment. Validation checks shape, not truth: a well-formed reason can still be wrong, and reviewing reasons is a job for a reviewer, human or agent, not for the validator.

### Distribution

The skill is plain files. Agents discover it through their own documented paths:

| agent | global | per repository |
|---|---|---|
| Claude Code | `~/.claude/skills/lndf-comment/` | `.claude/skills/lndf-comment/` |
| Codex | `~/.agents/skills/lndf-comment/` | `.agents/skills/lndf-comment/` |

The `AGENTS.md` text in `skills/lndf-comment/AGENTS.snippet.md` goes into the global `AGENTS.md` of the agent's home and into the repository's `AGENTS.md`.

Claude Code v2.1.277 and later reads the repository's `AGENTS.md` only when there is no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the working directory or above it; when one of them is there, it reads only the `CLAUDE.md` files by default. It reads `AGENTS.md` only from the working directory and the directories above it, so another agent's global `AGENTS.md` does not reach it ([Claude Code docs](https://code.claude.com/docs/en/memory#agents-md)). For Claude Code, the same text therefore also goes into the global `~/.claude/CLAUDE.md` and into the `CLAUDE.md` of a repository that has one, with the skill paths changed to `~/.claude/skills/lndf-comment/` and `.claude/skills/lndf-comment/`.

The git hook goes into the global hooks directory (`core.hooksPath`), so every agent's commits on the machine pass through the same gate. Repository copies are pinned to LF line endings and executable mode with `.gitattributes` and `git update-index --chmod=+x`; see `SKILL.md`.

---

## The `.lndf` File

A `.lndf` file is the trailer paragraph of a commit, standing alone:

```
LNDF-why-not: SetTimer polling | WM_CLIPBOARDUPDATE fires only on change, no idle cost
LNDF-constraint: Windows core.autocrlf=true | a CRLF checkout breaks the hook shebang
LNDF-ref: https://example.com/decisions/7
```

One judgment per line, the same five keys, the same validator (`validate.py --commit-msg file.lndf`). Lines starting with `#` are comments.

The file is a **transport**, not a ledger. It carries judgment between agents (an orchestrator's task result, a message board post, a hand-off to a machine that cannot reach the shared store). Inside a repository the ledger is the git history; across repositories it is whatever store the team uses. A `.lndf` file is not committed as a running log — v0.1's `.lndf/history/` is retired for that reason: it duplicated what git already keeps, and it grew without bound.

### Conversational surface

The same discipline runs in the author's chat sessions as a one- or two-line footer on every reply (intent, topic, tier, turn count; and for decisions, the reference, the rejected option, the next step and the deadline), with tiered records in a database for hand-off between sessions. That layer has been in daily operation since early 2026 and is the origin of the four kinds. Its public specification will be published separately; this repository documents the code-side surfaces.

---

## Broader Applicability

The reference implementation targets code and commits, but the discipline applies wherever an LLM consumes text written by someone who knows more than it does:

- Infrastructure definitions (cloud configuration, deployment specs)
- API contract descriptions
- Test case specifications
- Data transformation rules
- Content structure definitions
- Agent-to-agent hand-offs (task results, review verdicts, message boards)
- Robotics and physical AI feedback monitoring (status distillation, anomaly reporting)

Any domain where the LLM possesses deep knowledge is a candidate for LNDF-style format design.

---

## Limitations and Prerequisites

LNDF assumes the parser (LLM) has:

1. **Sufficient world knowledge** in the relevant domain
2. **Consistent interpretation** — the same intent should produce equivalent results across invocations
3. **Contextual awareness** — access to skill files, prior conversation, or system prompts that establish conventions

### Known Challenges

**Reproducibility.** LLMs are non-deterministic. The same .lndf file may produce slightly different outputs across invocations, even with the same model. This is acceptable in domains where visual verification is part of the workflow (e.g., UI design), but may be unacceptable in domains requiring exact reproducibility. Mitigation strategies include fixing temperature to 0, pinning model versions, and using LNDF in combination with explicit fallback values for critical attributes.

**Cross-LLM portability.** Different LLMs may resolve the same intent differently. `"mobile-tall"` might map to 430px width in one model and 390px in another. LNDF files are most reliable when used with a consistent LLM provider. Cross-provider portability improves as the format includes more explicit constraints and fewer implicit delegations.

**Domain boundaries.** LNDF is safest in domains where LLM misinterpretation has low consequences — UI layout, visual design, content structure. It should not be applied without extreme caution to safety-critical domains (medical, financial, legal) where misinterpretation carries material risk.

When LLM interpretation is unreliable for a specific domain, explicit specification remains necessary. LNDF is not a universal replacement for traditional formats — it is an additional paradigm for contexts where an LLM is the consumer.

The recommended approach is **hybrid**: use LNDF for LLM communication, maintain traditional formats (JSON, etc.) for machine-to-machine and human-readable contexts. Conversion between layers is handled by tooling, not by the user.

---

## Communication Safety Principles

> These principles are formally defined in [SCR (Shared Context Reduction)](https://github.com/moncface/scr). They apply to all SCR implementations, including LNDF.

LNDF operates under five communication principles that govern what an LLM may and may not infer from omitted information:

### 1. Boundary of Omission
The LLM may only infer universally known facts from its training data (programming language syntax, framework conventions, mathematical facts, physical laws). It must not infer culture-dependent implicit knowledge, time-dependent information, personal experience, or emotional nuance.

### 2. Prohibition of Implicature
The LLM must not generate implied meaning beyond what is explicitly written. "test:pass" means "tests passed" — not "code quality is high" or "ready to deploy."

### 3. Verification of Presupposition
When the LLM encounters uncertain presuppositions in the input, it must pause inference and request clarification from the human rather than guess.

### 4. Safe Interpretation Selection
When input permits multiple interpretations, the LLM must select the lowest-risk interpretation. "status:debugging" is read as a status report, not as a request for help or a warning.

### 5. Precision Guarantee
Numbers, negations, conditions, and exceptions are never inferred. If a value requires precision, it must be explicitly stated. "timeout:long" must not be resolved by the LLM — it must ask for a specific value.

These principles are inherently satisfied by LNDF's design: the `value | reason` structure prevents implicature, the closed set of kinds prevents cultural ambiguity, and the `heuristic` kind with its `unmeasured;` marker ensures a precision-critical number is never silently a guess.

Theoretical foundations: Grice's Cooperative Principle (1975), Austin/Searle's Speech Act Theory (1962/1969), Brown & Levinson's Politeness Theory (1987), Sperber & Wilson's Relevance Theory (1986).

---

---

## Status

v0.2. The reference implementation (`skills/lndf-comment`) is in daily use by the author's coding agents. The command-line tool in [`cli/`](cli/) has two commands. `lndf validate` is a TypeScript port of `validate.py` with the same rules and exit codes, held to the same fixtures (`python3 tests/run.py --validator tests/lndf_cli.py`). `lndf parse` (0.2.0 and later) prints the well-formed records of source comments, a commit message or `.lndf` file, or the trailers in the git history as a JSON array; it does not check them. The tool is on npm as `lndf`: run it with `npx lndf validate <file-or-dir>`, or install it with `npm install -g lndf`; `lndf --version` shows which version you have. `validate.py` remains the `commit-msg` gate. `distill` and `collect` are not written yet. The v0.1 implementation in Mon CLI (`mon ld` / `lv` / `lc` / `lp` / `lt`) is retired: it recorded repository state the agents can now read for themselves, which is exactly what the governing principle says not to write.

---

## Name

`.lndf` stands for LLM-Native Data Format. The file extension is the philosophy itself — a format native to LLM consumption, not adapted from legacy machine-to-machine formats.

### Cultural Root

In Japanese communication, the concept of 以心伝心 (ishin-denshin, "heart-to-heart") describes understanding without explicit words — meaning is conveyed through shared context rather than exhaustive specification. LNDF applies this from the first session: because the parser already possesses world knowledge, intent is understood without stating what the parser knows. A related concept, 暗黙の了解 (anmoku-no-ryōkai, "tacit understanding"), refers to agreements that need not be spoken because both parties already share the knowledge.

A distinct but complementary concept is 阿吽の呼吸 (aun-no-kokyū, "breathing in unison") — the effortless synchronization that emerges only after extended collaboration. Two parties who have worked together long enough no longer need to coordinate explicitly; their rhythm aligns naturally. In LNDF terms, this is what happens as sessions accumulate: the first session requires 35 tokens; the tenth requires 12; the fiftieth requires 3. The format does not change. The shared context deepens, and the breathing synchronizes.

Ishin-denshin is why LNDF works at all. Aun-no-kokyū is why it gets better over time.

---

## Specification Governance

This specification is maintained by Hiroaki Tachibana (moncface).

- Change proposals: Submit via GitHub Issues on this repository
- Final decision authority: The maintainer (BDFL model)
- Versioning: Semantic versioning (current: v0.2, see CHANGELOG.md)
- Canonical URL: This README is the authoritative specification

---

## Author

Hiroaki Tachibana (pen name) / moncface
Real name available upon request.
v0.1 March 2026 · v0.2 written October 2026, published November 2026

---

## License

- Specification and documentation: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Code and implementation: [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)

The concepts described are freely available for use, adaptation, and extension.
