# LNDF — LLM-Native Data Format

**A new paradigm for structured data in the age of AI.**

---

## What is LNDF?

LNDF (LLM-Native Data Format) is a design philosophy for structured data formats that treat Large Language Models as the primary parser.

Traditional data formats (JSON, XML, YAML, Protocol Buffers) are designed for deterministic parsers that have zero world knowledge. Every value must be explicitly stated. Every relationship must be formally declared. Ambiguity is an error.

LNDF inverts this assumption. The parser — an LLM — possesses vast world knowledge. Therefore, **any information the LLM already knows does not need to be in the data**. The format carries only what the LLM cannot infer: **human intent**.

---

## The Core Insight

Every existing data format answers the question:  
*"How do I give a machine all the information it needs?"*

LNDF answers a different question:  
*"What is the minimum I need to say for an intelligent parser to understand my intent?"*

This is not syntactic compression. Syntactic compression preserves all information in a smaller encoding. LNDF performs **semantic compression** — it omits information entirely, using the parser's world knowledge as a decompression dictionary. The distinction is fundamental: syntactic compression reduces the size of the message; semantic compression reduces the message itself.

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

---

## Why Now?

Before LLMs, this was impossible. Parsers had no world knowledge. `JSON.parse()` cannot infer that `"mobile-tall"` means a 9:19.5 aspect ratio with approximately 430 logical pixels of width. Every value had to be explicit.

LLMs changed the fundamental capability of the parser. For the first time in computing history, the consumer of structured data understands context, convention, and domain knowledge. Data formats designed before this capability shift carry unnecessary information by structural necessity.

LNDF is the first format philosophy designed for this new reality.

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

## Reference Implementation: .lndf

`.lndf` is the first concrete implementation of LNDF principles, applied to UI specification for LLM-assisted development.

### Type System

.lndf files use a `_type` field to distinguish content categories:

- `device` — Device class definitions (abstracted, not device-specific)
- `layout` — UI structure and element placement
- `flow` — Screen navigation and transitions
- `token` — Design tokens (colors, typography, spacing)
- `diff` — Differential updates to existing designs
- `project` — Project state and metadata

### Compression Techniques

.lndf combines LNDF's intent-based omission with established compression algorithms adapted for structured data:

- **Dictionary tables** (database normalization) — Shared style definitions referenced by ID
- **Run-length encoding** (image compression) — Repeated UI elements expressed as pattern + count
- **Relative coordinates** (vector graphics) — Child positions relative to parent, not absolute
- **Bit flags** (network protocols) — Boolean attributes as compact flag strings
- **Default omission** (Protocol Buffers) — Platform defaults are never transmitted

### Example

A Chrome extension popup with header, search input, result list, and action button:

```json
{"_type":"layout","class":"chrome-ext-popup",
 "layout":"header,content,footer",
 "content":[
   {"t":"input","role":"search"},
   {"t":"list","role":"results","f":1},
   {"t":"btn","label":"Action","bg":"#007AFF"}
 ],
 "style":"minimal"}
```

Estimated tokens: ~30.  
Equivalent standard JSON with full specification: ~250+ tokens.  
Equivalent natural language description: ~100+ tokens.

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

## Broader Applicability

While .lndf targets UI specification, the LNDF philosophy applies wherever LLMs consume structured data:

- Infrastructure definitions (cloud configuration, deployment specs)
- API contract descriptions
- Test case specifications
- Data transformation rules
- Content structure definitions

Any domain where the LLM possesses deep knowledge is a candidate for LNDF-style format design.

---

## Status

LNDF is a design philosophy in active development. The .lndf reference implementation is used internally as part of a personal development environment.

This document establishes the concept and core principles. Specification details and tooling may follow.

---

## Name

`.lndf` stands for LLM-Native Data Format. The file extension is the philosophy itself — a format native to LLM consumption, not adapted from legacy machine-to-machine formats. The internal project codename "DAM" (DevAsset Manager) remains as the tooling layer that produces .lndf files. In Japanese, ダム (damu) means "dam" — a structure that stores resources and releases only what is needed, in controlled amounts. The analogy holds: the system stores design intent and releases only the minimum tokens required for the LLM to act.

### Cultural Root

In Japanese communication, the concept of 以心伝心 (ishin-denshin, "heart-to-heart") describes understanding without explicit words — meaning is conveyed through shared context rather than exhaustive specification. Similarly, 暗黙の了解 (anmoku-no-ryōkai, "tacit understanding") refers to agreements that need not be spoken because both parties already share the knowledge. LNDF applies these principles to structured data: when the parser shares sufficient knowledge with the author, what is left unsaid carries as much meaning as what is written. This is not ambiguity — it is precision through shared context.

---

## Author

Hiroaki Tachibana / moncface  
March 2026

---

## License

This document is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).  
The concepts described are freely available for use, adaptation, and extension.
