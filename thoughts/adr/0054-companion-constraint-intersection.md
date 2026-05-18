# ADR 0054: Companion Constraint Intersection Semantics

**Status:** Proposed
**Date:** 2026-05-17

## Context

### The architectural invariant

Formspec's companion-document model separates concerns across independent sidecar artifacts. The invariant is explicit: **`definition.json` is the sole source of business logic; companion documents are additive, not authoritative.** Core spec §1.2 (AD-01 through AD-07), SKILL.md Cross-Tier Interaction Points, and every companion spec's conformance section repeat this. Locale MUST NOT alter validation logic (Locale spec §1.2). Ontology MUST NOT affect behavioral semantics (Ontology §8.1). References are pure metadata (References §1.1).

Theme and Component documents handle rendering; their cascade uses "later wins" (Theme spec §5; Component spec §10). That is correct: cosmetic conflicts have no correctness consequence. A token override cannot produce an invalid form.

### Where "later wins" is wrong

The Mapping DSL is the one companion specification that does re-operate on Definition-side data at the field level — and it does so silently. Mapping spec §3.4 codifies **last-write-wins** for the same `targetPath`; §5.6 codifies **last-rule-wins** in reverse. When a Mapping Document:

- coerces a `money` field to `string` (losing currency information — Mapping §4.5, lossy),
- value-maps a constrained enum to a narrower external code set (Mapping §4.6), or
- drops a `required` Definition field (`transform: "drop"`, Mapping §4.3),

no spec text requires the processor to check whether the transform is consistent with the Definition's bind constraints (`required`, `constraint`, `dataType`, `minimum`, `maximum`, option set membership). A transform that renders a required field unrepresentable in the target schema, or that maps an out-of-range value silently, is today a valid Mapping Document. The contradiction is invisible to static analysis.

Two secondary seams exist with weaker but still real risk:

**Ontology vocabulary bindings** (Ontology §4) carry an optional `valueMap` from Definition option values to external codes. Ontology §4.3 is explicit that vocabulary bindings do not replace option set values. But there is no check that every Definition option value that appears in the Ontology `valueMap` actually exists in the Definition's `optionSets`. A stale or misaligned `valueMap` produces silent incorrect cross-system mapping.

**Locale validation messages** (Locale §3.1.4) override per-code constraint messages without verifying that the referenced constraint code (`REQUIRED`, `CONSTRAINT_FAILED`, etc.) corresponds to an active bind. Locale spec §7.2 defines cross-reference checks (L200–L401) that include orphaned key warnings, but no check that a `constraintMessage` override is consistent with the bind's actual FEL constraint expression.

### No current contradiction detection

Searching the Core spec, Mapping spec, Locale spec, Ontology spec, and all JSON schemas (`definition.schema.json`, `mapping.schema.json`, `locale.schema.json`, `ontology.schema.json`) reveals zero normative text mandating contradiction detection across companion documents. The lint pipeline (8 passes, E100–E902, `formspec/crates/formspec-lint/src/lib.rs`) has no pass that cross-references companion-document constraints against the Definition's bind invariants. The Extension Registry (Pass 3b, E600–E602) checks extension identity but not semantic compatibility. This is a genuine gap, not an oversight already handled elsewhere.

### Why CUE-style unification is the right framing

CUE (Configuration Language) addresses this with **unification**: layered constraints are intersected rather than overridden. A constraint added by a later layer must be satisfiable within the space defined by earlier layers. An intersection that is empty — no value can satisfy all layers simultaneously — is an error, not a silent override. Applied to Formspec's companion-document model: when a companion document re-constrains a Definition field (through type coercion, value mapping, or option set subsetting), the resulting constraint set must have a non-empty solution space. An empty intersection is a static error detectable at lint time.

This is not CUE's full open-world unification. Formspec's invariant that the Definition is the sole source of business logic means the direction is clear: companion constraints must be satisfiable within, never outside, the Definition's constraints. This is one-directional narrowing, not symmetric lattice intersection.

## Decision

### The rule: Companion constraints must narrow, never contradict

Formally: for each field `f` in a Definition, the effective constraint set `C(f)` is the intersection of the Definition's constraints with any constraints implied by companion documents targeting `f`. The intersection must be non-empty. If it is empty, the companion document is in contradiction with the Definition and MUST be rejected by a conformant lint processor.

Named: **Companion Narrowing Semantics**. The word "narrowing" signals the permitted direction (companion can tighten but not violate) and distinguishes this from full CUE unification (which is symmetric).

### Scope: what changes and what does not

**What changes — Mapping DSL seam (primary):**

A Mapping Document is in contradiction with its target Definition when:

1. **Type contradiction**: a `coerce` transform on `sourcePath` `f` targets a type that is incompatible with `f`'s `dataType` in a way that loses information the Definition's bind `constraint` depends on (e.g., `money → string` when the Definition bind has a `constraint` comparing against money values), AND the mapping is forward-and-reverse (`bidirectional: true`). Forward-only lossy coercion (`bidirectional: false`) is already normatively required to be explicit (Mapping §5.4); the intersection check here addresses the reverse case and the semantic consistency of the coerced type.

2. **Required field drop**: a `drop` transform targeting `sourcePath` `f` when `f` has `required: "true"` in a Definition bind (Core §2.1.4) and the mapping direction includes reverse (a reverse mapping that omits a required field would produce an invalid Response).

3. **Value set contradiction**: a `valueMap` `forward` map on `sourcePath` `f` that does not cover all option values defined in the Definition's `optionSets` for `f`, when `unmapped` strategy is `"error"` (Mapping §4.6 — this is already an error per-rule, but not flagged as a contradiction between documents). More precisely: the domain of the `valueMap.forward` map must be a subset of the Definition's option set values; values in the map that do not appear in the Definition option set are unreachable contradictions.

**What changes — Ontology seam (secondary):**

An Ontology Document's vocabulary binding `valueMap` (Ontology §4) must be checkable against the Definition's `optionSets`. Every key in the ontology `valueMap` that does not correspond to a Definition option set value is a dangling reference. This is currently only warned on as an orphaned path (Ontology §8.2); this ADR elevates unreachable `valueMap` entries to lint errors.

**What does NOT change:**

- **Theme cascade**: "later wins" is correct for cosmetic tokens. No intersection semantics. Theme has no access to Definition bind constraints and must not acquire it.
- **Component cascade**: "later wins" for rendering is correct. Component `when` vs bind `relevant` is already normatively distinct (SKILL.md §5).
- **Locale**: Locale documents MUST NOT alter non-string properties (Locale §1.2). Locale validation message overrides (`constraintMessage`, `errors.<CODE>`) remain presentation-layer overlays. They do not re-constrain the bind's logic. No intersection semantics added; the existing cross-reference warnings (L200–L401) are sufficient.
- **References**: Pure metadata. Out of scope.
- **Ontology concept bindings** (not vocabulary bindings): concept IRIs are identifiers, not constraints. Out of scope.
- **Core processing model**: Phases Rebuild → Recalculate → Revalidate → Notify are unchanged. Intersection checks are static (lint-time), not runtime.

## Consequences

### Spec changes

1. **Mapping spec §3.3 / §5.4**: Add normative text: a Mapping Document MUST NOT produce a contradiction with the target Definition's bind constraints as defined in this section. Add a reference to the lint-time intersection check. Clarify that `drop` on a required field is a mapping-level error detectable statically.

2. **Mapping spec §4.6 (valueMap)**: Add: a `valueMap.forward` key that does not correspond to any option value in the Definition's `optionSets` for the `sourcePath` field is a definition error; the lint processor MUST report it.

3. **Ontology spec §4 / §8.2**: Elevate orphaned `valueMap` keys from warnings to errors in Extended processor conformance. Add: vocabulary binding `valueMap` keys MUST correspond to values present in the Definition's `optionSets`. Mismatch is a document error.

4. **Core spec §1.2 / §8.4**: Add a note to the extension points and design principles sections that companion documents imposing field-level constraints must satisfy Companion Narrowing Semantics.

### Schema changes

No structural schema changes required. The intersection check is a cross-document semantic constraint, not a JSON Schema structural constraint (JSON Schema cannot express cross-document field relationships). The `lint-codes.json` registry gains new entries.

### formspec-lint changes

A new **Pass 9: Companion Constraint Intersection** is added (`E1000` block). This pass runs only when a companion document is linted alongside its target Definition (supplied via `LintOptions`). It does not affect single-document linting.

Pass 9 inserts after Pass 8 (Response, E900–E902). The `LintOptions` struct gains `mapping_document: Option<Value>` and `ontology_document: Option<Value>` fields alongside the existing `definition_document`.

**New lint codes:**

| Code | Severity | Condition |
|------|----------|-----------|
| `E1000` | Error | Mapping `coerce` transform reverse-direction type contradiction with Definition bind constraint |
| `E1001` | Error | Mapping `drop` on a `required: true` Definition field in a reverse-capable mapping |
| `E1002` | Error | Mapping `valueMap.forward` key not in Definition `optionSets` for the source field |
| `E1003` | Error | Mapping `valueMap.forward` missing a Definition option set value when `unmapped: "error"` |
| `W1000` | Warning | Ontology vocabulary `valueMap` key not found in Definition `optionSets` |

**Example diagnostic output:**

```
E1001: mapping drop contradiction at items "contact_email"
  definition  → bind required=true                   [intake.json:42]
  mapping     → transform=drop, bidirectional=true    [intake-to-api.mapping.json:17]
  → reverse mapping cannot produce a valid Response: required field dropped

E1002: mapping valueMap key not in definition option set at items "status"
  definition  → optionSets.statusCodes = ["pending","active","closed"]   [intake.json:88]
  mapping     → valueMap.forward key "archived"                          [intake-to-api.mapping.json:55]
  → "archived" is not a valid source value; forward mapping is unreachable

W1000: ontology valueMap key not in definition option set at items "gender"
  definition  → optionSets.genderCodes = ["M","F","X","U"]     [intake.json:31]
  ontology    → vocabularies.genderCodes.valueMap key "O"      [clinical.ontology.json:19]
  → "O" has no corresponding Definition option value; binding is unreachable
```

### Migration / rollout notes

- Pass 9 is **opt-in** via `LintOptions` companion document fields. No existing single-document lint invocations are affected.
- The CLI gains `--mapping <path>` and `--ontology <path>` flags. Absent these flags, Pass 9 does not run.
- Existing Mapping Documents that have `valueMap` keys misaligned with their Definition option sets will produce new `E1002`/`E1003` diagnostics. This is a breaking change for those documents. Rollout recommendation: run with `--mode authoring` (warnings, not errors) for a grace period before promoting to `--mode runtime` (errors).
- The `E1001` case (drop required field, reverse mapping) is a genuine correctness bug in existing documents. It SHOULD be treated as an immediate error with no grace period, since the reverse mapping would silently produce invalid Responses.

## Open questions

1. **Coerce type contradiction (E1000) scope**: The interaction between `coerce` target types and FEL bind `constraint` expressions is complex (a `constraint` expression may test `$.amount` on a money field; if money is coerced to string, the constraint expression is no longer meaningful). Defining "contradiction" precisely for arbitrary FEL constraints requires either syntactic analysis (detect money-specific function calls in constraint FEL) or a simpler type-level check (if coerce target type is incompatible with the field's `dataType`). The initial implementation SHOULD use the simpler type-level check; E1000 can be refined in a follow-up once the syntactic analysis is available.

2. **Multiple Mapping Documents**: If a Definition has two Mapping Documents targeting different downstream systems, each is checked independently against the Definition. No cross-mapping intersection is needed (companions do not constrain each other, only the Definition constrains companions).

3. **Locale format constraint interaction**: Locale `formatDate` and `formatNumber` (Locale Extended, §5.3–5.4) format values for presentation but do not constrain the Definition's `dataType`. This is currently out of scope. If a future locale feature introduces format-pattern constraints on field values (e.g., a locale-specific date format that narrows acceptable input patterns), this ADR should be extended to cover it.

4. **Conformance matrix**: Should TR-CORE include a new row for "Companion Narrowing Semantics"? Recommendation: yes. Add one row to Appendix A (Requirements Traceability, Core spec §App A) under a new prefix `CN-` (Companion Narrowing), with CN-01 through CN-03 mapping to the three Mapping seams and CN-04 mapping to the Ontology seam. This does not require a separate conformance tier — it is part of Extended processor conformance (alongside extension resolution, mapping, and ontology handling).

## Citations

**Specs:**
- Core spec §1.2 (AD-01–AD-07, design principles), §2.1.4 (Bind, required/constraint MIPs), §4.3 (Bind Schema), §8.1 (Custom Data Types — extension resolution)
- Mapping spec §3.3 (Field Rule Structure), §3.4 (Field Rule Ordering and Precedence — last-write-wins), §4.3 (`drop` — bidirectional constraint), §4.5 (`coerce` — lossy table), §4.6 (`valueMap` — bijective forward, unmapped), §5.4 (Lossy Transforms and Non-Reversibility), §5.6 (Conflict Resolution in Reverse Mapping — last-rule-wins)
- Locale spec §1.2 (Scope — MUST NOT alter non-string properties), §3.1.4 (Validation Messages — cascade precedence), §7.2 (Cross-Reference Validation — L200–L401)
- Ontology spec §4 (Vocabulary Bindings), §4.3 (Vocabulary bindings do not replace option set values), §8.2 (Extended Processor — last-loaded wins, warnings on unknown paths)
- References spec §1.1 (pure metadata invariant)

**Schemas:**
- `definition.schema.json` → Bind → `required`, `constraint`, `dataType`; Item → `optionSets`
- `mapping.schema.json` → FieldRule → `transform`, `coerce`, `valueMap`, `bidirectional`
- `ontology.schema.json` → VocabularyBinding → `valueMap`

**Related ADRs:**
- ADR 0048: Internationalization as a Locale Artifact — establishes Locale as presentation-only sidecar
- ADR 0029–0031: Schema Parity — establishes schemas as co-authoritative with specs

**SKILL.md cross-tier interaction points:** 3 (Widget Config), 4 (Bind Compatibility), 9 (Mapping ↔ Core Versioning)
