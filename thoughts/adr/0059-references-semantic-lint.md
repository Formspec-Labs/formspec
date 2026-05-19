# ADR 0059: References Semantic Lint

**Status:** Proposed
**Date:** 2026-05-19

## Context

### The problem

References Documents are first-class Formspec companion artifacts, but
`formspec-lint` does not currently recognize them as lintable document types.
The repo contains `schemas/references.schema.json`, and the lint crate contains a
matching `crates/formspec-lint/schemas/references.schema.json` copy, but the
Rust document-type enum, marker-field routing, embedded schema set, and lint
pipeline do not include References.

That means a document with `$formspecReferences` cannot receive the baseline
E101 schema check. It is detected as an unknown document instead of being
validated against `references.schema.json`.

### Why schema validation is not enough

The References schema already captures the structural envelope:

- required `$formspecReferences`, `version`, `targetDefinition`, and
  `references`
- `$formspecReferences` const `"1.0"`
- `targetDefinition` shared from the Component schema's `TargetDefinition`
- ordered `references` entries with a required `target`
- reusable `referenceDefs`
- `Reference` objects requiring `type`, `audience`, and either `uri` or
  `content`
- closed objects with `extensions` containers whose keys must use `x-`

But several References rules are processing-time or cross-document semantics,
not JSON Schema constraints:

- `targetDefinition.url` must match the paired Definition URL.
- `targetDefinition.compatibleVersions` must be checked against the paired
  Definition version.
- `references[*].target` must be `"#"` or resolve to a Definition item path.
- `$ref` pointers under `references[*]` must resolve to `referenceDefs` entries.
- `referenceDefs` keys must match explicit `id` values when both are present.
- duplicate reference ids must be rejected.
- custom `Reference.type` and relationship values must use the `x-` prefix.
- Reference property values are static; FEL expressions must not appear.

Leaving these to renderers, agents, or downstream consumers creates divergent
Reference behavior. A stale target path, broken `$ref`, or dynamic-looking
reference string should be caught before an agent uses the document as context.

### The metadata invariant

References remain pure metadata. The References spec says they MUST NOT affect
data capture, validation, or the processing model. Semantic lint must protect
that boundary: it validates identity, target resolution, reference reuse, and
static metadata shape, but it must not make Reference `rel` values into
Definition constraints or evaluate any Reference field as FEL.

## Decision

### D-1. References Documents get first-class document-type support

`formspec-core::DocumentType` MUST add `References`. Document detection MUST
recognize `$formspecReferences` as the marker field, and `schema_key()` /
`from_schema_key()` MUST expose the public key `references`.

`formspec-lint` MUST embed `references.schema.json`, include it in the compiled
schema set, register any required cross-file `$ref` resources, and route
`DocumentType::References` through E101 JSON Schema validation.

This is required before semantic lint can exist. Without it, References
Documents fail at E100 and never reach schema or semantic checks.

### D-2. References Documents get semantic linting

`formspec-lint` MUST route `DocumentType::References` through a References
semantic pass after E101. The pass validates what JSON Schema cannot express:
paired Definition compatibility, path resolution, `$ref` resolution,
identity consistency, recognized vocabulary values, and static field behavior.

If `LintOptions.definition_document` is absent, the pass runs
References-document-only checks. If it is present, the pass also validates the
document's `targetDefinition` and resolves `references[*].target` against the
Definition item tree.

The implementation should avoid overloading the existing
`crates/formspec-lint/src/references.rs` module name, which currently owns
Definition reference checks for bind paths, shape targets, and option sets. A
new module such as `pass_references_doc` keeps the two meanings distinct.

### D-3. References-only semantic checks

These checks run even without a paired Definition.

| Code | Severity | Condition |
|------|----------|-----------|
| `E1300` | Error | A `references[*].$ref` JSON Pointer does not resolve to an entry in `referenceDefs`. |
| `E1301` | Error | A `referenceDefs` entry has an explicit `id` that does not match its map key. |
| `E1302` | Error | Duplicate authored reference ids appear in inline references, `referenceDefs`, or both. Repeated use of the same `$ref` key is reuse, not a duplicate definition. |
| `E1303` | Error | A `references[*].target` value is neither `"#"` nor valid Formspec item-path syntax. |
| `E1304` | Error | A static Reference field contains a whole-value FEL expression or otherwise attempts dynamic field/reference evaluation. |
| `W1300` | Warning | A `type` value is not one of the References spec's known values and does not start with `x-`. |
| `W1301` | Warning | A `rel` value is not one of the References spec's known relationship values and does not start with `x-`. |

`W1300` and `W1301` preserve the References spec's forward-compatibility rule:
processors should warn on unrecognized non-`x-` values but not reject the
document. Strict lint may later promote these warnings if the vocabulary is
closed by a separate ADR.

The FEL check must be conservative. It should reject values that parse as a
complete FEL expression or begin with unambiguous FEL reference markers in
non-prose fields. It must not flag incidental prose such as dollar amounts or
quoted examples inside long-form `content`.

### D-4. Definition-aware References checks

These checks run only when the caller supplies `LintOptions.definition_document`.

| Code | Severity | Condition |
|------|----------|-----------|
| `E1310` | Error | `targetDefinition.url` does not equal the paired Definition's `url`. |
| `W1310` | Warning | The paired Definition's `version` does not satisfy `targetDefinition.compatibleVersions`. |
| `W1311` | Warning | A syntactically valid `references[*].target` path does not resolve to `"#"` or an item path in the paired Definition. |

The target-path diagnostic remains a warning because References are metadata.
A missing target means the reference cannot be applied, but it must not make the
Definition invalid or imply a behavioral constraint.

### D-5. References semantic lint must not alter behavior

The pass MUST NOT:

- evaluate Reference fields as FEL
- create, remove, or modify Definition items, binds, shapes, variables, or
  responses
- treat `rel: "constrains"` as a validation rule
- infer requiredness, relevance, readonly, calculate, or constraint behavior
  from Reference content
- inherit group references onto child items during lint

The pass MAY expose a resolved-reference view for consumers, but that view is
metadata-only: resolved `$ref` entries, normalized target paths, vocabulary
classification, and diagnostics. It is not part of the core form processing
model.

### D-6. Code block allocation

References semantic lint uses the E1300/W1300 block. ADR 0057 reserves E1100
and W1100 for Mapping semantic lint. Ontology semantic lint owns the E1200 and
W1200 block. The References block therefore does not collide with either.

## Consequences

### Spec changes

1. References spec gains a "Static Semantics and Lint" section that
   distinguishes:
   - JSON Schema structural validity.
   - References semantic validity.
   - Paired Definition compatibility.
   - Metadata-only non-behavioral guarantees.

2. References spec clarifies that unresolved targets are lint warnings when a
   paired Definition is available, while malformed targets and broken `$ref`
   pointers are document errors.

3. References spec clarifies duplicate id handling for `referenceDefs` reuse:
   duplicate authored ids are errors, but multiple bound references may point to
   the same `referenceDefs` key.

4. `specs/lint-codes.json` gains the E1300 and W1300 code blocks.

### Schema changes

No structural schema changes are required for the first implementation.
`references.schema.json` already defines the root marker, target binding,
Reference object shape, `$ref` branch, `referenceDefs`, extension containers,
and static/reference metadata descriptions.

If root-level `x-*` properties are still desired, that is a separate closedness
and extension-seam question owned by ADR 0056. This ADR only requires the
current schema to be embedded and routed by lint.

### formspec-core changes

- Add `DocumentType::References`.
- Add `$formspecReferences` to marker-field detection.
- Add `references` to `schema_key()` and `from_schema_key()`.
- Add tests for marker detection and schema-key round trip.

### formspec-lint changes

- Embed `crates/formspec-lint/schemas/references.schema.json`.
- Add a References validator to `SchemaSet`.
- Route `DocumentType::References` to the References schema for E101.
- Add a References semantic pass, preferably `pass_references_doc`.
- Reuse the Definition item index/path-resolution helpers for
  Definition-aware target checks.
- Reuse the FEL parser only as a conservative detector for whole-value FEL
  expressions in static Reference fields.
- Update README pass tables and generated lint-code Rust from
  `specs/lint-codes.json`.

## Rollout

1. Add `DocumentType::References` and `$formspecReferences` marker detection in
   `formspec-core`.
2. Embed and route `references.schema.json` in `formspec-lint` so E101 works.
3. Add References-only semantic lint for `$ref`, `referenceDefs` id matching,
   duplicate authored ids, malformed targets, non-`x-` custom vocabulary
   values, and static FEL-looking fields.
4. Add Definition-aware checks for `targetDefinition.url`,
   `targetDefinition.compatibleVersions`, and target path resolution.
5. Register E1300/W1300 codes and regenerate generated lint-code bindings.
6. Add focused fixtures for each code and one valid References Document that
   exercises `referenceDefs` reuse.
7. Update the References spec lint section and lint README pass table.

## Acceptance criteria

- `lint(references_doc)` detects `DocumentType::References` from
  `$formspecReferences`.
- `lint(references_doc)` runs E101 against `references.schema.json`.
- `lint(references_doc)` emits `E1300` for
  `"$ref": "#/referenceDefs/missing"`.
- `lint(references_doc)` emits `E1301` when `referenceDefs.foo.id` is `"bar"`.
- `lint(references_doc)` emits `E1302` for duplicate authored reference ids.
- `lint(references_doc)` emits `E1303` for a malformed target path.
- `lint(references_doc)` emits `E1304` for a whole-value FEL expression in a
  static Reference field.
- `lint(references_doc)` emits `W1300` for an unknown non-`x-` `type`.
- `lint(references_doc)` emits `W1301` for an unknown non-`x-` `rel`.
- `lint(references_doc, definition_document=definition)` emits `E1310` when
  `targetDefinition.url` does not match the Definition URL.
- `lint(references_doc, definition_document=definition)` emits `W1310` when the
  Definition version is outside `targetDefinition.compatibleVersions`.
- `lint(references_doc, definition_document=definition)` emits `W1311` when a
  target path does not resolve to a Definition item path.
- Repeated references to the same `referenceDefs` key pass duplicate-id lint.
- No References lint pass mutates or constrains Definition behavior.

## Open questions

1. **Semver implementation:** Should `compatibleVersions` reuse an existing
   semver range parser from the Mapping stack, or should lint add a small
   dependency for npm-style range evaluation? Recommendation: reuse the same
   implementation Mapping uses or will use, so companion version checks do not
   diverge.

2. **Strict vocabulary behavior:** Should unrecognized non-`x-` `type` and
   `rel` values ever become errors in strict mode? Recommendation: not until the
   References spec explicitly closes the vocabulary or publishes a standard
   vocabulary registry.

3. **FEL-looking prose:** How aggressively should long-form `content` strings
   be scanned? Recommendation: only flag whole-value expressions and
   unambiguous dynamic forms. Do not grep for `$` or `@` inside prose.

## Related ADRs

- ADR 0054: Companion Constraint Intersection Semantics
- ADR 0056: Closed-by-Default JSON Schemas with the Extension Registry as the
  Sole Named Open Seam
- ADR 0057: Mapping Semantic Lint and Contract Projection Analysis

## Evidence

- `schemas/references.schema.json` and
  `crates/formspec-lint/schemas/references.schema.json` are identical and
  define the References document envelope, target binding, Reference object,
  `$ref` branch, and `referenceDefs`.
- `crates/formspec-core/src/schema_validator.rs` comments list
  `$formspecReferences`, but `DocumentType`, `schema_key()`,
  `from_schema_key()`, and `MARKER_FIELDS` do not include References.
- `crates/formspec-lint/src/schema_validation.rs` embeds schemas for existing
  document types, including Mapping, Screener, and Determination, but not
  References.
- `crates/formspec-lint/src/lib.rs` routes semantic passes only for Definition,
  Screener, Theme, Component, and Response documents.
- `crates/formspec-lint/README.md` describes the current eight-pass lint
  pipeline and has no References document pass.
- `specs/core/references-spec.md` states that References are pure metadata,
  target Definition items by path or `"#"`, validate `referenceDefs` at
  processing time, require static property values, and warn on unrecognized
  non-`x-` `type` / `rel` values.
