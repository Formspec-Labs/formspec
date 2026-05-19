# ADR 0058: Ontology Semantic Lint and Document Routing

**Status:** Proposed
**Date:** 2026-05-19

## Context

### The problem

Ontology Documents are first-class Formspec companion artifacts, but
`formspec-lint` does not currently recognize them as lintable documents.

The repo already has an Ontology JSON Schema in both schema locations:

- `schemas/ontology.schema.json`
- `crates/formspec-lint/schemas/ontology.schema.json`

Those copies define a closed Formspec Ontology Document with required
`$formspecOntology`, `version`, and `targetDefinition` fields. The schema also
defines `concepts`, `vocabularies`, `alignments`, `defaultSystem`, and
`VocabularyBinding.valueMap`. Its top-level description states that Ontology
metadata must not alter behavioral semantics and that Ontology values are static:
FEL expressions must not appear in any Ontology property.

The lint pipeline has a different shape. `formspec_core::DocumentType` does not
include `Ontology`, `detect_document_type` does not recognize
`$formspecOntology`, and `formspec-lint` does not embed or dispatch
`ontology.schema.json` in the E101 schema-validation pass. A valid Ontology
Document therefore fails at document-type detection instead of receiving baseline
E101 validation, and no Ontology-specific semantic pass can run.

### Why this surfaced now

ADR 0057 adds first-class semantic lint for Mapping Documents after the
data-contract projector spike showed that downstream tooling should not duplicate
Mapping path parsing and Definition-aware resolution.

Ontology has the same authoring-tool risk. Assist, extraction, profile reuse,
JSON-LD export, and cross-form alignment tools rely on Ontology metadata as a
static semantic overlay. If an Ontology Document points at a stale item path,
unknown option set, wrong Definition URL, unsupported Definition version, or
FEL-looking dynamic value, the error should surface in lint before downstream
tools interpret the metadata.

### Existing raw materials

The repo already contains most of the primitives:

- `ontology.schema.json` defines the Ontology document envelope and structural
  shape.
- `formspec-lint` already has E100 document detection and E101 schema
  validation against embedded schemas.
- `LintOptions.definition_document` already supplies the paired Definition
  context used by Theme and Component semantic passes.
- The Definition item index and option-set reference checks already provide the
  shape needed for Ontology path and vocabulary resolution.
- `formspec-assist` already has an `OntologyDocument` type and performs
  lightweight `targetDefinition` validation, which confirms that Ontology is a
  real authoring surface rather than a purely speculative schema.

## Decision

### D-1. Ontology Documents get document-type routing and E101 support

`formspec_core::DocumentType` MUST add `Ontology`, and
`detect_document_type` MUST recognize `$formspecOntology`.

`formspec-lint` MUST embed `crates/formspec-lint/schemas/ontology.schema.json`
and route `DocumentType::Ontology` through E101 schema validation against that
schema. Host-facing TypeScript, Python, and WASM document-type surfaces should
expose the same public schema key, `ontology`, so schema validation plans and
lint JSON remain consistent across runtimes.

This is baseline support. Before this change, an Ontology Document cannot even
reach E101 because the marker field is unknown.

### D-2. Ontology Documents get a semantic lint pass

`formspec-lint` MUST route `DocumentType::Ontology` through an Ontology semantic
pass after JSON Schema validation. The pass validates static semantics that JSON
Schema cannot express:

- compatibility with a paired Definition
- Definition item-path resolution
- option-set and option-value resolution
- static-only value discipline
- `defaultSystem` fallback behavior

If `LintOptions.definition_document` is absent, the pass still runs
Ontology-only checks such as static-value checks and local path syntax checks.
If a paired Definition is present, the pass also performs Definition-aware
resolution.

### D-3. Target Definition compatibility is linted when paired

When `LintOptions.definition_document` is present, the Ontology semantic pass
MUST compare `targetDefinition` with the paired Definition:

- `targetDefinition.url` must match the Definition `url`.
- `targetDefinition.compatibleVersions`, when present, should include the
  Definition `version`.

URL mismatch is an error because the Ontology bindings target a different
Definition. Version mismatch is a warning because the Ontology specification
allows warn-and-continue behavior for compatible-version mismatches.

### D-4. Ontology path resolution uses Definition item paths

Ontology path-bearing fields MUST be parsed and resolved with the same item-path
model used for Definition bind paths:

- `concepts` map keys resolve to Definition item paths. The special `#` key is
  allowed only for form-level concept binding.
- `alignments[*].field` resolves to Definition item paths. The special `#` key
  is not valid here because alignments apply to fields.

Invalid path syntax is an error. Syntactically valid paths that do not resolve
against the paired Definition are warnings in this pass, matching current
Ontology conformance language for unknown paths. A stricter future mode may
promote unresolved paths, but the first pass should preserve the current
metadata-sidecar semantics.

### D-5. Vocabulary bindings resolve against Definition option sets

When a paired Definition is present:

- each `vocabularies` key resolves to a Definition `optionSets` key;
- each `vocabularies[*].valueMap` key resolves to an actual option value inside
  that option set.

This pass owns the Ontology-specific lookup and diagnostic location. ADR 0054
owns Companion Narrowing Semantics and any stricter contradiction or
option-set-value severity rules. Implementations should expose the resolved
Ontology vocabulary facts so the ADR 0054 pass can consume them without
re-parsing the Ontology document.

### D-6. Ontology values remain static

Ontology metadata is static. The semantic pass MUST reject FEL-looking
expressions in Ontology values.

The implementation should use a conservative detector rather than treating every
string as a FEL program. It should catch expression-shaped strings such as field
references, variable references, operator expressions, and interpolation
fragments while avoiding false positives for ordinary URIs, codes, and display
strings.

The pass must not evaluate FEL. It only rejects dynamic expression syntax in a
document type whose values are defined as static metadata.

### D-7. `defaultSystem` fallback behavior is visible

Concept bindings may omit `system`. When they do, processors resolve the system
from the document-level `defaultSystem`.

The semantic pass SHOULD warn when a concept binding omits `system` and
`defaultSystem` is present, because the effective system is inherited and should
be visible to authors. It MUST warn when a concept binding omits `system` and no
`defaultSystem` exists, because downstream tooling cannot materialize an
explicit concept-system binding even though the `concept` URI remains usable.

### D-8. Diagnostic allocation uses the E1200/W1200 class

ADR 0057 allocates E1100/W1100-class diagnostics for Mapping semantic lint. This
ADR allocates E1200/W1200-class diagnostics for Ontology semantic lint.

```text
E1200 error   Invalid Ontology item path syntax in a concepts key or alignments[*].field.
E1201 error   Ontology targetDefinition.url does not match the paired Definition url.
E1202 error   FEL-looking expression appears in an Ontology static value.
W1200 warning Ontology targetDefinition.compatibleVersions does not include the paired Definition version, or the range cannot be evaluated.
W1201 warning Ontology concepts key does not resolve to a Definition item path.
W1202 warning Ontology alignments[*].field does not resolve to a Definition item path.
W1203 warning Ontology vocabularies key does not resolve to a Definition optionSets key.
W1204 warning Ontology vocabularies[*].valueMap key does not resolve to an option value in the referenced option set.
W1205 warning Ontology concept binding omits system and uses defaultSystem fallback.
W1206 warning Ontology concept binding omits system and no defaultSystem fallback is available.
```

`W1204` is the standalone Ontology resolution diagnostic. When ADR 0054
Companion Narrowing is active, the same unresolved value-map fact may be promoted
or reclassified by the E1000/W1000-class companion pass. Implementations must
deduplicate so authors do not receive two diagnostics for the same unresolved
`valueMap` key.

### D-9. Lint exposes reusable Ontology analysis facts

The Ontology semantic pass should produce or call a reusable static-analysis
model rather than only emit diagnostics.

Required facts:

- normalized `concepts` paths
- normalized `alignments[*].field` paths
- resolved Definition item for each concept or alignment path, when paired
- resolved option set for each vocabulary binding, when paired
- resolved option values for each `valueMap` key, when paired
- effective concept system for each concept binding after `defaultSystem`
  fallback
- static-value findings and diagnostic locations

The first implementation may live inside `formspec-lint`. If Assist, extraction,
or contract-projection tooling later needs the same facts, extract the analysis
to a dependency-neutral module or crate rather than duplicating Ontology parsing.

## Consequences

### Spec changes

1. The Ontology specification gains a "Static Semantics and Lint" section that
   distinguishes JSON Schema validity from Ontology semantic validity.
2. The conformance section references E1200/W1200-class lint diagnostics for
   path resolution, target compatibility, static-value checks, vocabulary
   resolution, and `defaultSystem` fallback behavior.
3. `specs/lint-codes.json` gains E1200/W1200-class registry rows.

### Schema changes

No structural schema changes are required. `ontology.schema.json` already
contains the required marker, `targetDefinition`, `concepts`, `vocabularies`,
`valueMap`, `alignments`, `defaultSystem`, and closed object structure needed
for E101 validation.

The implementation must keep `schemas/ontology.schema.json` and
`crates/formspec-lint/schemas/ontology.schema.json` in sync.

### formspec-core changes

- Add `DocumentType::Ontology`.
- Add `ontology` to `DocumentType::schema_key` and
  `DocumentType::from_schema_key`.
- Add `$formspecOntology` to document-type marker detection.
- Update WASM/Python/TypeScript document-type surfaces that mirror the core
  enum.

### formspec-lint changes

- Embed `ONTOLOGY_SCHEMA` in `schema_validation.rs`.
- Add `ontology` to the schema set and `DocumentType` dispatch.
- Add `pass_ontology` and route `DocumentType::Ontology` from `lib.rs`.
- Update crate docs and README pass table.
- Add tests for Ontology E101 routing, Ontology-only static-value checks, and
  paired-Definition resolution checks.
- Regenerate `crates/formspec-lint/src/generated/lint_code.rs` from
  `specs/lint-codes.json`.

### Tooling changes

Assist, extraction, profile-reuse, and JSON-LD export tooling should consume the
Ontology analysis facts or equivalent lint results instead of resolving paths
and vocabularies independently.

The Ontology pass must not dereference concept URIs, system URIs, or alignment
targets. URI resolution and trust policy remain host-tooling concerns.

## Rollout

1. Add `DocumentType::Ontology` and `$formspecOntology` marker detection in
   `formspec-core`.
2. Embed `ontology.schema.json` in `formspec-lint` and prove that E101 runs for
   Ontology Documents.
3. Add E1200/W1200 lint-code registry rows and generated Rust code.
4. Implement Ontology-only semantic lint: local path syntax, static-value
   detection, and `defaultSystem` fallback diagnostics.
5. Implement Definition-aware checks using `LintOptions.definition_document`:
   target URL/version compatibility, item-path resolution, option-set
   resolution, and value-map option-value resolution.
6. Expose an internal `OntologyStaticAnalysis` model and let ADR 0054 consume
   its vocabulary facts when Companion Narrowing runs.
7. Update README, API docs, fixtures, and host wrapper tests after the Rust pass
   behavior is stable.

## Acceptance criteria

- `lint(ontology_doc)` detects `DocumentType::Ontology` instead of emitting
  E100.
- `lint(ontology_doc)` validates against `ontology.schema.json` and emits E101
  for schema violations.
- `lint(ontology_doc, definition_document=definition)` emits E1201 when
  `targetDefinition.url` differs from the Definition `url`.
- `lint(ontology_doc, definition_document=definition)` emits W1200 when
  `compatibleVersions` does not include the Definition `version`.
- `lint(ontology_doc, definition_document=definition)` emits W1201 for an
  unresolved `concepts` path and W1202 for an unresolved `alignments[*].field`.
- `lint(ontology_doc, definition_document=definition)` emits W1203 for an
  unknown vocabulary option-set key.
- `lint(ontology_doc, definition_document=definition)` emits W1204 for a
  `valueMap` key that is not an option value in the referenced option set.
- `lint(ontology_doc)` emits E1202 for FEL-looking dynamic values in Ontology
  static metadata.
- `lint(ontology_doc)` emits W1205 when a concept binding omits `system` and
  inherits `defaultSystem`.
- `lint(ontology_doc)` emits W1206 when a concept binding omits `system` and no
  `defaultSystem` is available.
- ADR 0054 Companion Narrowing can consume Ontology vocabulary facts without
  reimplementing Ontology path or value-map resolution.

## Open questions

1. **Warning severity for inherited `defaultSystem`:** W1205 is useful in
   authoring tools because inherited systems are easy to miss. Runtime mode may
   eventually suppress W1205 while keeping W1206.

2. **Strict path mode:** Current Ontology conformance treats unknown item paths
   as warnings. A future strict mode may promote W1201 and W1202, but this ADR
   keeps the first implementation aligned with the current metadata-sidecar
   semantics.

3. **Analysis crate boundary:** `OntologyStaticAnalysis` should start inside
   `formspec-lint`. Extract only when a second production consumer needs the
   same facts.

## Related ADRs

- ADR 0054: Companion Constraint Intersection Semantics
- ADR 0056: Closed-by-Default JSON Schemas with the Extension Registry as the
  Sole Named Open Seam
- ADR 0057: Mapping Semantic Lint and Contract Projection Analysis

## Evidence

- `schemas/ontology.schema.json` and
  `crates/formspec-lint/schemas/ontology.schema.json` both define
  `$formspecOntology`, `targetDefinition`, `concepts`, `vocabularies`,
  `valueMap`, `alignments`, and `defaultSystem`.
- The two Ontology schema copies are currently byte-identical.
- `crates/formspec-core/src/schema_validator.rs` lists recognized document
  types and marker fields, but does not include `Ontology` or
  `$formspecOntology`.
- `crates/formspec-lint/src/schema_validation.rs` embeds and dispatches schemas
  for Definition, Component, Theme, Response, Intake Handoff, Mapping,
  Changelog, Registry, Validation Report, Validation Result, Screener, and
  Determination, but not Ontology.
- `crates/formspec-lint/src/lib.rs` routes semantic passes for Definition,
  Screener, Theme, Component, and Response only.
- `packages/formspec-engine/src/interfaces.ts` exposes a public `DocumentType`
  union with no `ontology` member.
- `specs/ontology/ontology-spec.md` requires static Ontology values, defines
  `concepts` keys and `alignments[*].field` as Definition item paths, defines
  `vocabularies` keys as Definition `optionSets` names, defines `valueMap` keys
  as Definition option values, and specifies target Definition and
  `defaultSystem` handling for ontology-aware processors.
