# LNDF — LLM-Native Data Format

**A new paradigm for structured data in the age of AI.**

---

## What is LNDF?

LNDF (LLM-Native Data Format) is a design philosophy for structured data formats that treat Large Language Models as the primary parser.

Traditional data formats (JSON, XML, YAML, Protocol Buffers) are designed for deterministic parsers that have zero world knowledge. Every value must be explicitly stated. Every relationship must be formally declared. Ambiguity is an error.

LNDF inverts this assumption. The parser — an LLM — possesses vast world knowledge. Therefore, **any information the LLM already knows does not need to be in the data**. The format carries only what the LLM cannot infer: **human intent**.

LNDF is the first implementation of [Shared Context Reduction (SCR)](https://github.com/moncface/scr) — the general principle of eliminating mutually known information between communicating agents. The Five Communication Safety Principles documented below are formally defined in the SCR specification and apply to all SCR implementations.

---

## The Core Insight

Every existing data format answers the question:
*"How do I give a machine all the information it needs?"*

LNDF answers a different question:
*"What is the minimum I need to say for an intelligent parser to understand my intent?"*

This is not syntactic compression. Syntactic compression preserves all information in a smaller encoding. LNDF performs **semantic compression** — it omits information entirely, using the parser's world knowledge as a decompression dictionary. The distinction is fundamental: syntactic compression reduces the size of the message; semantic compression reduces the message itself.

As a consequence, LNDF is a philosophy, not an implementation. There is no schema to validate against, no parser to install, no test suite to pass. The "specification" is a set of principles. The implementation is the LLM itself.

---

## Principles

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

A human reads this in 10 seconds and knows: four features complete, one in progress, one bug fixed. An LLM receives 35 tokens and fully restores project context. No other format achieves this simultaneously.

| Metric | Conventional (logs/specs) | LNDF |
|--------|--------------------------|------|
| Human review time | 10–20 minutes | 10 seconds |
| LLM injection tokens | 800–5,000 | 30–50 |
| As sessions accumulate | Context explodes | Size stays constant (overwrite) |

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

---

## Token Economics

The practical consequence of the intent-over-data principle is dramatic token reduction. Structured data sent to LLMs via API carries a direct cost per token.

| Approach | Relative Token Count | Relative Cost |
|----------|---------------------|---------------|
| Standard JSON (full specification) | 100% | 100% |
| Minified JSON | ~80% | ~80% |
| TOON (Token-Oriented Object Notation) | ~40-70% | ~40-70% |
| LNDF (intent only) | ~4-16% (estimated) | ~4-16% (estimated) |

*Note: LNDF figures are theoretical projections based on intent-based omission applied to UI specification payloads. Actual reduction depends on domain complexity, LLM context availability, and how much knowledge the LLM reliably holds for the target domain. Empirical benchmarks will follow as implementations mature.*

The gap between LNDF and existing optimization approaches (TOON, Morph Compact, LLMLingua) is not incremental. It is structural. Existing approaches compress the same information. LNDF transmits less information.

---

## Reference Implementation: Mon CLI

[Mon CLI](https://github.com/moncface/mon-tab) (`npm install -g mon-tab`) is the first tooling implementation of LNDF principles, applied to project state distillation for AI coding sessions.

### Project State Distillation

`mon ld` generates a `.lndf` file from git metadata, package.json, and test results:

```
---
mon-tab
branch:main
last:feat: add test result distillation to mon ld
changed:commands/ld.js,package.json
stack:chrome-ext
test:pass
status:active development
---
```

Format: key:value, one per line. No quotes, no braces. First line = project name. Absent fields = defaults (the LLM infers).

### Debug Distillation (v0.5.2)

`mon ld` automatically runs `npm test` if `scripts.test` exists:

| Field | Meaning |
|-------|---------|
| `test:pass` | All tests passing (exit 0) |
| `test:fail` | Tests failing (exit 1) |
| `test:timeout` | Tests exceeded 30s |
| `error:...` | stderr tail, last 3 lines (only when test:fail) |

- No `scripts.test` in package.json → `test:` and `error:` fields omitted (Defaults Are Silence)
- `test:fail` or `test:timeout` overrides status to `debugging`

### Commands

| Command | Action |
|---------|--------|
| `mon ld` | Distill project state → .lndf/current.lndf |
| `mon lv` | View current distillation |
| `mon lv --reindex` | Build SQLite index from hako/ frontmatter |
| `mon lv --tag <tag>` | Search hako by tag |
| `mon lv --after <date>` | Search hako by date |
| `mon lv --stats` | Show hako index statistics |
| `mon lc` | Distill + copy to clipboard |
| `mon lp create <name>` | Create cross-project collection |
| `mon lp add <name> <path>` | Add hako to project |
| `mon lp dump <name>` | Concatenate all hako for LLM context |
| `mon lp list` | List all projects |

### File Locations

```
Project-local:
  {project-root}/.lndf/
    ├── current.lndf
    └── history/YYYY-MM-DDTHHMMSS.lndf

User-global:
  ~/.mon/
    ├── hako/        ← individual distillations / notes
    └── projects/    ← project files (lists of hako paths)
```

### AI Coding Session Workflow

```bash
mon lv                    # load project state
mon lp list               # check active cross-project work
mon lp dump <name>        # load full project context
# ... work with AI coding tool ...
mon ld                    # save project state
```

---

## Broader Applicability

While Mon CLI targets project state distillation, the LNDF philosophy applies wherever LLMs consume structured data:

- Infrastructure definitions (cloud configuration, deployment specs)
- API contract descriptions
- Test case specifications
- Data transformation rules
- Content structure definitions
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

These principles are inherently satisfied by LNDF's existing design: key-value structure prevents implicature, technical domain scope prevents cultural ambiguity, and the "Defaults Are Silence" principle ensures precision-critical values are always explicit.

Theoretical foundations: Grice's Cooperative Principle (1975), Austin/Searle's Speech Act Theory (1962/1969), Brown & Levinson's Politeness Theory (1987), Sperber & Wilson's Relevance Theory (1986).

---

## Status

LNDF is a design philosophy in active development. Mon CLI v0.5.2 implements project state distillation with debug awareness. 47 commands available.

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
- Versioning: Semantic versioning (current: v0.1)
- Canonical URL: This README is the authoritative specification

---

## Author

Hiroaki Tachibana (pen name) / moncface
Real name available upon request.
March 2026

---

## License

- Specification and documentation: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Code and implementation: [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)

The concepts described are freely available for use, adaptation, and extension.
