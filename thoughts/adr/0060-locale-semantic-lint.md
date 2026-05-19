# ADR 0060: Locale Semantic Lint

**Status:** Proposed
**Date:** 2026-05-19

## Context

### The problem

Locale Documents are first-class authoring artifacts, but the Rust lint pipeline
does not currently recognize them as first-class documents. The root schema
exists at `schemas/locale.schema.json`, and the lint crate carries a matching
embedded copy at `crates/formspec-lint/schemas/locale.schema.json`. Both schemas
define a closed Locale Document with required `$formspecLocale`, `version`,
`locale`, `targetDefinition`, and `strings` properties.

The current Rust document-type surface does not include `DocumentType::Locale`.
`schema_validator.rs` comments list `$formspecLocale` as a marker, but the enum,
`schema_key`, `from_schema_key`, and marker table do not include Locale.
`formspec-lint` also omits `locale.schema.json` from `schema_validation.rs`, so a
document with `$formspecLocale` is not detected and cannot reach baseline E101
schema validation. The TypeScript engine already exposes `locale` in its public
document type union, so the gap is concentrated in the Rust/WASM lint path.

That leaves Locale correctness to runtime string lookup. Runtime lookup is the
wrong layer for stale translation keys, target Definition mismatches,
unparseable interpolation expressions, and fallback cycles.

### Existing raw materials

The repo already contains most of what Locale lint needs:

- `locale.schema.json` defines the Locale envelope, `$formspecLocale: "1.0"`,
  BCP-47-like `locale` and `fallback` tags, `targetDefinition`, string-key
  patterns, and x-prefixed `extensions`.
- `targetDefinition` reuses the component schema's `TargetDefinition`, with a
  required `url` and optional `compatibleVersions` range.
- `strings` is a typed map of string values. Its key pattern admits item keys and
  the reserved `$form.`, `$shape.`, `$page.`, `$optionSet.`, and `$component.`
  namespaces.
- The engine already resolves Locale strings for item labels, hints,
  descriptions, validation messages, option labels, option-set labels, and FEL
  interpolation.
- `formspec-lint` already has Definition item indexing, option-set validation,
  shape target resolution, FEL parsing, structured diagnostics, and
  `LintOptions.definition_document` for paired Definition context.

## Decision

### D-1. Locale becomes a recognized document type

The Rust document-type model MUST add `DocumentType::Locale`. Detection MUST use
the `$formspecLocale` marker. `DocumentType::schema_key()` and
`DocumentType::from_schema_key()` MUST use the public key `locale`.

`formspec-lint` MUST embed and dispatch `locale.schema.json` through the normal
schema validation pass. Schema validation remains E101. This closes the current
baseline gap where a structurally invalid Locale Document cannot be diagnosed by
the Rust lint pipeline.

### D-2. Locale gets semantic lint after E101

`formspec-lint` MUST route `DocumentType::Locale` through a Locale semantic pass
after JSON Schema validation. The pass validates what JSON Schema cannot express:

- the Locale's `targetDefinition` matches a supplied Definition;
- string keys resolve to localizable targets;
- interpolation segments parse as FEL;
- fallback chains terminate when multiple Locale Documents are supplied;
- reserved key namespaces are known and presentation-only.

Single-document lint still works. Without companion context, the pass performs
Locale-only checks: namespace parsing, terminal-property validation,
interpolation parsing, self-fallback detection, and schema-level validation. When
the caller supplies `LintOptions.definition_document`, the pass also performs
Definition-aware checks.

### D-3. Definition-aware checks use the existing paired Definition option

The Locale pass MUST use the existing `LintOptions.definition_document` for
Definition context. It should not add a second Definition option or fetch the
target Definition by URL.

When a Definition is supplied:

- `targetDefinition.url` MUST match the Definition's `url`;
- `targetDefinition.compatibleVersions`, when present, SHOULD be checked against
  the Definition's `version`;
- item string keys such as `contact.label`, `contact.hint`,
  `contact.description`, and context variants such as `contact.label@short` MUST
  resolve to Definition item paths;
- field option keys such as `status.options.approved.label` MUST resolve to an
  existing item and option value;
- option-set keys such as `$optionSet.status.approved.label` MUST resolve to a
  Definition `optionSets` entry and option value;
- shape keys such as `$shape.balance-check.message` MUST resolve to a Definition
  shape `id`;
- validation-message keys such as `email.errors.REQUIRED`,
  `email.requiredMessage`, and `email.constraintMessage` MUST resolve to an
  existing item and a localizable validation-message slot.

Version-range mismatch follows the schema's runtime guidance: it is a warning,
not a hard failure. A URL mismatch is an error because the Locale targets a
different Definition.

### D-4. Theme and Component checks are optional companion checks

`$page.` and `$component.` keys cannot be fully resolved from a Definition alone.
Page checks require a Theme Document, and component-node checks require one or
more Component Documents or a resolved component tree.

The Locale pass SHOULD add optional lint context for these companion documents,
for example:

- `LintOptions.theme_document: Option<Value>` for `$page.<pageId>.*` keys;
- `LintOptions.component_documents: Vec<Value>` for `$component.<nodeId>.*` keys;
- `LintOptions.locale_documents: Vec<Value>` for fallback-chain checks across
  more than one Locale Document.

When the companion document is absent, lint MUST still validate the reserved
namespace and terminal property shape. It MUST NOT claim that a page or component
target is unresolved unless the caller supplied the companion document needed to
resolve it.

### D-5. Locale remains presentation-only

Locale semantic lint MUST preserve the Locale invariant: a Locale Document
changes display strings only. It MUST NOT let Locale re-constrain data,
validation logic, item structure, binds, option values, page membership, or
component behavior.

The pass validates that a string key points at a known localizable string slot.
It does not compare localized text with Definition constraints, and it does not
participate in ADR 0054 companion narrowing semantics. A key that attempts to
address a non-presentation property, such as an item `dataType`, bind
expression, option value mutation, or component behavior property, is a Locale
semantic error.

### D-6. Interpolation is parsed, not evaluated

Locale string values may contain `{{ ... }}` interpolation. Lint MUST scan each
string value using the same delimiter rules as runtime interpolation and parse
each inner expression as FEL.

The lint pass MUST NOT evaluate interpolation expressions. Runtime context such
as the current item index, locale, and reactive values is not available during
static lint. Lint only proves that the expression is syntactically valid FEL.

### D-7. Fallback cycles are diagnosed when enough documents are supplied

A single Locale Document can diagnose self-fallback, such as `locale: "fr-CA"`
with `fallback: "fr-CA"`. Multi-document cycles require multiple Locale
Documents in lint context. When `LintOptions.locale_documents` or an equivalent
batch API supplies the set, lint MUST detect cycles such as:

```text
fr-CA -> fr -> fr-CA
```

Missing fallback targets should be warnings, not errors. A runtime may still
fall back to implicit language fallback or inline defaults.

## Proposed diagnostics

Locale uses the E1400/W1400 code block. This avoids ADR 0057 Mapping E1100,
Ontology E1200, and References E1300 ranges.

```text
E1400 Locale targetDefinition URL does not match the paired Definition URL.
W1400 Locale targetDefinition compatibleVersions excludes the paired Definition version.
E1401 Locale string key uses an unknown reserved namespace or unsupported terminal property.
E1402 Locale item string key does not resolve to a Definition item path.
E1403 Locale option or optionSet string key does not resolve to a Definition option value.
E1404 Locale shape string key does not resolve to a Definition shape id.
E1405 Locale interpolation segment is not valid FEL.
E1406 Locale fallback chain contains a cycle.
E1407 Locale string key targets a non-presentation property.
E1410 Locale page string key does not resolve to a supplied Theme page id.
E1411 Locale component string key does not resolve to a supplied Component node id.
W1401 Locale fallback target was not supplied in the lint context.
```

These codes should be registered in `specs/lint-codes.json` and regenerated into
`crates/formspec-lint/src/generated/lint_code.rs` when the implementation lands.

## Consequences

### Spec changes

1. Locale spec gains a "Static Semantics and Lint" section that distinguishes
   schema validity, Locale semantic validity, optional companion resolution, and
   runtime string lookup.
2. Locale spec states that `$formspecLocale` is the authoritative document-type
   marker.
3. Locale spec lists the supported string-key namespaces and terminal properties.
4. Locale spec states that interpolation is statically parsed as FEL but not
   evaluated by lint.
5. Locale spec states that fallback cycles are lint errors when the cycle is
   observable from the supplied document set.

### Schema changes

No structural Locale schema change is required. The existing schema already
defines a closed root object, the required Locale marker, the `targetDefinition`
binding, string-key syntax, and x-prefixed extensions.

The implementation must wire the already-present schema into Rust document type
detection and `formspec-lint` E101 dispatch.

### formspec-lint changes

- Add `DocumentType::Locale` in `formspec-core`.
- Add `$formspecLocale` to the Rust marker table.
- Add `locale` to `schema_key()` and `from_schema_key()`.
- Include `../schemas/locale.schema.json` in `schema_validation.rs`.
- Add Locale to the compiled schema set and validation dispatch.
- Add a Locale semantic pass, likely `pass_locale`.
- Route `DocumentType::Locale` to `pass_locale::lint_locale`.
- Extend `LintOptions` only for companion documents that Locale cannot resolve
  through the existing `definition_document`.
- Add fixtures for Locale-only, Definition-aware, Theme-aware, Component-aware,
  and multi-Locale fallback cases.

### Runtime changes

No runtime behavior change is required. Runtime Locale lookup can keep resolving
strings through the current cascade. Lint catches static authoring mistakes
before runtime lookup.

## Rollout

1. Wire `DocumentType::Locale`, `$formspecLocale`, schema key parsing, and E101
   schema validation.
2. Register E1400/W1400 codes and regenerate lint-code bindings.
3. Implement Locale-only semantic lint: namespace parsing, terminal-property
   checks, interpolation FEL parsing, presentation-only checks, and self-fallback
   detection.
4. Implement Definition-aware checks using `LintOptions.definition_document`.
5. Add optional Theme, Component, and multi-Locale context for `$page.`,
   `$component.`, and fallback-chain checks.
6. Update docs and README pass tables to list Locale semantic lint.
7. Add focused fixtures and tests for each diagnostic class.

## Acceptance criteria

- `lint(locale_doc)` detects `DocumentType::Locale`.
- `lint(locale_doc)` validates against `locale.schema.json` and emits E101 for
  structural schema violations.
- `lint(locale_doc, definition_document=definition)` emits E1400 when
  `targetDefinition.url` does not match the Definition `url`.
- `lint(locale_doc, definition_document=definition)` emits W1400 when
  `compatibleVersions` excludes the Definition `version`.
- `lint(locale_doc, definition_document=definition)` resolves item label, hint,
  description, option, option-set, validation-message, and shape keys.
- `lint(locale_doc)` emits E1405 for malformed FEL inside `{{ ... }}`.
- `lint(locale_docs=[a, b])` emits E1406 for a fallback cycle.
- `$page.` keys are resolved only when a Theme Document is supplied.
- `$component.` keys are resolved only when Component Documents are supplied.
- Locale lint never treats localized strings as data constraints or business
  logic.

## Open questions

1. **Version range parser:** Should Locale reuse an existing semver-range parser
   from another crate, or should the first implementation support only exact
   and simple comparator ranges? Recommendation: reuse an existing parser if one
   is already in the workspace; otherwise keep the first check conservative and
   warn only when the range can be parsed confidently.

2. **Batch API shape:** Should fallback-chain checks live in `LintOptions`, or in
   a separate batch lint API that accepts multiple documents at once?
   Recommendation: start with `LintOptions.locale_documents` because it matches
   existing companion-context style.

3. **Component identity:** Component schemas and runtime code may use different
   names for node identity. The implementation should document the exact
   component node id field before enforcing E1411.

## Related ADRs

- ADR 0048: Internationalization as a Locale Artifact
- ADR 0054: Companion Constraint Intersection Semantics
- ADR 0056: Closed-by-Default JSON Schemas with the Extension Registry as the
  Sole Named Open Seam
- ADR 0057: Mapping Semantic Lint and Contract Projection Analysis

## Evidence

- `schemas/locale.schema.json` and
  `crates/formspec-lint/schemas/locale.schema.json` define the same Locale
  schema, including `$formspecLocale`, `targetDefinition`, `strings`,
  `fallback`, and `extensions`.
- `crates/formspec-core/src/schema_validator.rs` has no `DocumentType::Locale`,
  no `locale` schema key, and no `$formspecLocale` marker entry, even though the
  marker comment names Locale.
- `crates/formspec-lint/src/schema_validation.rs` embeds and dispatches schemas
  for Definition, Component, Theme, Response, IntakeHandoff, Mapping,
  Changelog, Registry, ValidationReport, ValidationResult, Screener, and
  Determination, but not Locale.
- `crates/formspec-lint/src/lib.rs` routes semantic passes for Definition,
  Screener, Theme, Component, and Response, but not Locale.
- `packages/formspec-engine/src/interfaces.ts` already exposes `locale` as a
  public document type, and `packages/formspec-engine/src/locale.ts` plus
  `field-view-model.ts` implement runtime Locale string lookup.
