# ADR 0057: Mapping Semantic Lint and Contract Projection Analysis

**Status:** Proposed
**Date:** 2026-05-19

## Context

### The problem

Mapping Documents are first-class Formspec companion artifacts, but `formspec-lint`
currently treats them mostly as schema-shaped JSON. The lint pipeline detects the
document type, validates the document against `mapping.schema.json`, and then
runs deeper semantic passes only for Definition, Screener, Theme, Component, and
Response documents.

That leaves Mapping-specific correctness to runtime execution or downstream
tools. Runtime execution is the wrong layer for static mistakes, and downstream
tools have started to duplicate path parsing, source resolution, requiredness
logic, and projection-hint interpretation.

### Why this surfaced now

The data-contract projector spike used Mapping Documents as a static projection
source: Definition plus Mapping plus projection hints emitted JSON Schema,
SHACL, and TypeScript target contracts. Red-team cases showed that the projector
could produce invalid or misleading contracts when it implemented Mapping
semantics ad hoc.

The failures split into two groups:

- Mapping document problems that lint should diagnose before projection.
- Projector output problems that lint should not own directly, but that a shared
  Mapping analysis layer should prevent.

### Existing raw materials

The repo already contains most of the primitives:

- `formspec-lint` has schema validation, Definition item indexing, bind path
  resolution, expression parsing, and structured diagnostics.
- `formspec-core::runtime_mapping` has Mapping rule parsing, runtime execution,
  array descriptors, transforms, and JSON get/set path behavior.
- `formspec-core::path_utils::Path` parses dot/bracket paths, but it is tolerant:
  malformed inputs are normalized rather than rejected. Lint needs strict path
  diagnostics, so a strict parser or strict validation wrapper is required.
- `LintOptions.definition_document` already provides the paired Definition
  context needed for cross-artifact checks.

## Decision

### D-1. Mapping Documents get semantic linting

`formspec-lint` MUST route `DocumentType::Mapping` through a Mapping semantic
lint pass after JSON Schema validation. Schema validation remains E101. The new
pass validates what JSON Schema cannot express: path resolution, transform
semantics, projection-hint consistency, target write conflicts, and optional
Definition-aware checks.

If `LintOptions.definition_document` is absent, the pass runs Mapping-only
checks. If it is present, the pass also resolves Mapping source paths against the
Definition.

### D-2. Lint must use strict Mapping path validation

Mapping path validation must not use a lossy split on `"."`, and it must not
silently normalize malformed paths. The implementation MUST define a strict
path-validation API that covers:

- rule `sourcePath`
- rule `targetPath`
- `defaults` keys
- `projection.sourcePaths`
- `array.innerRules[*].sourcePath`
- `array.innerRules[*].targetPath`

The API may wrap `formspec-core::path_utils::Path`, but lint must reject
malformed input instead of silently normalizing it.

Path grammar is target-format-sensitive:

| Target format | Target path rule |
|---------------|------------------|
| `json` | Dot notation plus bracket indexing and wildcards where Mapping permits them. |
| `xml` | Dot notation for elements, `@` prefix for attributes, namespace prefixes where declared. |
| `csv` | Simple identifiers only. Dots and brackets are invalid. |
| `x-*` | Validated by the extension/adaptor that owns the custom format. Core lint only checks that the path is a non-empty string. |

### D-3. Mapping-only semantic checks

These checks run even without a paired Definition.

| Code | Severity | Condition |
|------|----------|-----------|
| `E1100` | Error | Invalid Mapping path syntax or target-format path violation. |
| `E1101` | Error | FEL parse error in `expression`, `condition`, or `reverse.expression`. |
| `E1102` | Error | Target write conflict that makes the target tree unsatisfiable, such as a default on `payload` and a rule on `payload.name`. |
| `E1103` | Error | `projection.targetType` contradicts `projection.targetEnum` values. |
| `E1104` | Error | `projection.required` contradicts an unconditional static omission, such as `transform: "drop"` or `projection.emit: false`. |
| `E1105` | Error | Bidirectional lossy transform lacks an explicit `reverse` block or `bidirectional: false`. |
| `E1106` | Error | Bidirectional non-injective `valueMap.forward` lacks explicit reverse mapping. |
| `W1100` | Warning | Multiple rules write the same exact `targetPath` and rely on last-write-wins. |
| `W1101` | Warning | Non-static transform lacks projection hints and will be omitted from static contract projection. Suppressed when `projection.emit: false`. |

`projection.emit: false` is explicit author intent. Lint MUST NOT warn that such a
rule lacks a static projection type or enum.

### D-4. Definition-aware Mapping checks

These checks run only when the caller supplies `LintOptions.definition_document`.

| Code | Severity | Condition |
|------|----------|-----------|
| `E1110` | Error | Rule `sourcePath` does not resolve against the Definition item tree. |
| `E1111` | Error | `array.innerRules[*].sourcePath` does not resolve relative to the array item scope. |
| `E1112` | Error | `projection.sourcePaths[*]` does not resolve against the Definition item tree or the active array item scope. |
| `E1113` | Error | `projection.required` contradicts Definition-derived requiredness for an unconditional rule. |
| `W1110` | Warning | Requiredness cannot be inferred statically because the rule is conditional, source paths are mixed required/optional, or the transform is non-static. |

ADR 0054 owns broader companion constraint intersection, including Definition
option-set coverage and required-field drop contradictions. This ADR supplies the
Mapping graph, path resolution, and projection facts that ADR 0054 can consume.

### D-5. Lint exposes a reusable Mapping static-analysis result

The Mapping semantic pass must not be only a diagnostic emitter. It must produce
or call a reusable static-analysis model that projectors can share.

Required facts per rule:

- normalized source path segments
- normalized target path segments
- resolved Definition item, when a Definition is provided
- array scope and inner-rule scope
- transform class: `static`, `static_with_hint`, `non_static`, or `omitted`
- source type and requiredness, when known
- projected target type and enum, when known
- target write footprint
- diagnostics produced while deriving the facts

The first implementation may live inside `formspec-lint`, but the API boundary
must not force future projectors to reimplement the same analysis. If a Rust
contract projector lands, the analysis should move to a dependency-neutral
module or crate that both lint and projector can consume without a dependency
cycle.

### D-6. Lint validates Mapping semantics, not final projected contracts

`formspec-lint` should not become the JSON Schema, SHACL, TypeScript, or OpenAPI
projector. It should validate the Mapping document and expose facts projectors
need.

Projectors remain responsible for:

- lowering FEL literals to target-language constants
- producing JSON Schema, SHACL, TypeScript, OpenAPI, Rego, or other outputs
- validating that emitted artifacts are syntactically valid
- testing that emitted contracts preserve requiredness and array shape
- checking generated-schema satisfiability when the target format supports it

An optional future `lint_projected_contract` helper may validate emitted
artifacts, but that is a projector-output lint step, not Mapping document lint.

## Red-team case disposition

| Spike case | Lint disposition | Owner |
|------------|------------------|-------|
| `unresolved_source_path` | `E1110` when a Definition is provided. | Lint |
| `array_inner_requiredness` | No diagnostic if paths resolve. Static analysis must expose inner requiredness so the projector can preserve it. | Shared analysis plus projector tests |
| `bracket_target_path` | No diagnostic for valid JSON target paths like `contacts[0].email`. Strict normalized target segments prevent ad hoc projector parsing. | Shared analysis plus projector |
| `numeric_constant` | `E1101` only if the FEL expression is invalid. Numeric literal lowering belongs to the projector. | Projector |
| `projection_emit_false` | No warning for missing static projection; omitted by author intent. | Lint |
| `inconsistent_projection_hint` | `E1103`. | Lint |
| `required_source_paths_for_concat` | `E1112` if paths do not resolve; otherwise analysis computes source requiredness and may emit `W1110` if target requiredness is ambiguous. | Shared analysis plus projector |
| `target_path_collision` | `E1102`. | Lint |

## Consequences

### Spec changes

1. Mapping spec gains a "Static Semantics and Lint" section that distinguishes:
   - JSON Schema structural validity.
   - Mapping semantic validity.
   - Static projection hints.
   - Projector output validation.

2. Mapping spec clarifies that `projection` is ignored at runtime but validated
   by static tooling.

3. Mapping spec normatively defines target-format path constraints for JSON,
   XML, CSV, and custom `x-*` adapters.

4. `specs/lint-codes.json` gains the E1100 and W1100 code blocks.

### Schema changes

No required structural schema changes. `mapping.schema.json` already admits
`projection`, `sourcePaths`, `targetType`, `targetEnum`, `required`, `lossy`,
`emit`, `notes`, and `x-*` extension keys. The new checks are semantic.

### formspec-lint changes

- Add a Mapping semantic pass module, likely `pass_mapping`.
- Route `DocumentType::Mapping` to `pass_mapping::lint_mapping`.
- Update crate docs and README pass table.
- Add tests for Mapping-only checks and Definition-aware checks.
- Regenerate `formspec/crates/formspec-lint/src/generated/lint_code.rs` from
  `specs/lint-codes.json`.
- Python and WASM lint wrappers need no new option for paired Definition checks;
  they already expose `definition_document`.

### formspec-core changes

- Add strict Mapping path validation or expose enough path parser metadata for
  lint to reject malformed paths.
- Keep runtime path behavior backward-compatible unless a separate Mapping spec
  change says runtime should also reject malformed paths before execution.
- Do not add a dependency from `formspec-core` to `formspec-lint`.

### Projector changes

The contract projector should consume the Mapping static-analysis facts rather
than parse Mapping rules independently. The spike's Python implementation may
remain as a test oracle or design sketch, but production projection should not
own independent source resolution, target path parsing, or requiredness logic.

## Rollout

1. Add E1100/W1100 lint-code registry rows and generated Rust code.
2. Implement Mapping-only semantic lint: strict target paths, FEL parse, target
   write conflicts, projection-hint contradictions, lossy bidirectional checks.
3. Implement Definition-aware source resolution using the existing item-tree
   index and bind path logic.
4. Expose an internal `MappingStaticAnalysis` model and route diagnostics through
   lint.
5. Update the projector spike to consume or mirror that model.
6. Add fixtures for the eight red-team cases and assert which ones lint catches
   and which ones remain projector-output tests.

## Acceptance criteria

- `lint(mapping_doc)` runs Mapping semantic checks after E101.
- `lint(mapping_doc, definition_document=definition)` emits `E1110` for unknown
  `sourcePath`.
- `lint(mapping_doc)` emits `E1103` for `targetType: "string"` with numeric
  `targetEnum` values.
- `lint(mapping_doc)` emits `E1102` for parent/child target write conflicts
  between `defaults` and rules.
- `lint(mapping_doc)` parses all Mapping FEL slots and emits `E1101` on parse
  errors.
- `projection.emit: false` suppresses missing-static-projection warnings.
- JSON target path `contacts[0].email` is parsed into normalized path segments,
  not treated as the literal property `contacts[0]`.
- CSV target path `contacts[0].email` emits `E1100`.
- Array `innerRules` resolve relative to the array element scope.
- Projector tests prove that requiredness and array item shape survive projection.

## Open questions

1. **Crate boundary:** Should `MappingStaticAnalysis` live in `formspec-lint`,
   `formspec-core`, or a new small analysis crate? Recommendation: start in
   `formspec-lint`; extract only when a production projector needs the API.

2. **Pass numbering:** ADR 0054 and ADR 0055 both discuss Pass 9 and E1000-class
   codes. This ADR allocates E1100-class codes and treats Mapping Semantic Lint
   as the next coordinated semantic pass. If ADR 0054 or 0055 lands first, keep
   E1100-class codes unchanged and update only the pass label.

3. **Mode behavior:** Should `W1101` be suppressed in authoring mode? Initial
   recommendation: yes, because authors may write Mapping rules before adding
   projection hints.

4. **Runtime malformed paths:** Should runtime execution reject malformed paths
   the same way lint does? Initial recommendation: lint should be strict first;
   runtime can keep compatibility until Mapping spec text requires rejection.

## Related ADRs

- ADR 0054: Companion Constraint Intersection Semantics
- ADR 0055: Single Ownership Per Concern Role Purity
- ADR 0056: Closed-by-Default JSON Schemas with Extension Registry as Sole Open Seam

## Evidence

- `formspec-lint` currently lists Mapping schema validation in
  `schema_validation.rs`, but `lib.rs` routes semantic passes only for
  Definition, Screener, Theme, Component, and Response.
- `mapping.schema.json` defines `projection` as runtime-ignored static
  contract-projection metadata.
- `runtime_mapping::types::MappingRule` does not carry projection metadata,
  which is correct for runtime execution and confirms that static projection
  belongs in lint/projector analysis, not runtime mapping.
- `runtime_mapping::path` already parses dot/bracket paths for execution.
- The data-contract projector spike red-team report recorded eight cases that
  distinguish Mapping semantic lint responsibilities from projector-output
  responsibilities.
