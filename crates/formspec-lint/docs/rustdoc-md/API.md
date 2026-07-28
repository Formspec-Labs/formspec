# formspec-lint — generated API (Markdown)

> Do not edit by hand; regenerate via npm script / cargo doc-md + this bundler.

Bundled from [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md). Nested module paths are preserved in headings. Relative links may not resolve; search by heading.

---

## doc-md index

# Documentation Index

Generated markdown documentation for this project.

## Dependencies (1)

- [`formspec-lint`](formspec_lint/index.md)

---

Generated with [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md)

---

## Source: formspec_lint/index.md

# formspec_lint

Formspec Linter — 9-pass static analysis and validation pipeline.

Pass 1 (E100): Document type detection
Pass 1b (E101): JSON Schema validation against embedded schemas
Pass 2 (E200/E201): Tree indexing, duplicate key/path detection
Pass 3 (E300/E301/E302/W300): Reference validation — bind paths, shape targets, optionSets
Pass 3b (E600/E601/E602): Extension resolution against registry documents
Pass 3c (E603/E604): Module contribution resolution + payload-schema validation (ADR 0150 §4.2/§4.3)
Pass 3e (E608/E609): Posture admission — module field-equality + actor URN scan (ADR 0150 §4.4/§5.4)
Pass 4 (E400): FEL expression compilation
Pass 5 (E500): Dependency cycle detection
Pass 6 (W700-W712/E710): Theme — token validation, reference integrity, page semantics
Pass 7 (E800-E807/W800-W807): Components — tree validation, type compatibility, bind resolution
Pass 8 (E606-E607/E610, E900-E902): Surface route graph and Response
cross-field invariants (ADR 0150 §6)
Registry-only E611 is emitted by the TypeScript AppGraphValidator, not this crate.
Pass 9 (E1100-E1802/W1100-W1800): Companion document semantic lint

## Documentation

- Human overview: crate `README.md` (pass map, options, module layout).
- API reference: `cargo doc -p formspec-lint --no-deps --open`.
- Markdown API export: `docs/rustdoc-md/API.md` (see README; regenerate with `npm run docs:formspec-lint`).

## Modules

### [`formspec_lint`](formspec_lint.md)

*14 modules, 2 functions*

### [`app_graph_report`](app_graph_report.md)

*2 functions, 3 structs*

### [`component_matrix`](component_matrix.md)

*1 enum, 4 functions*

### [`dependencies`](dependencies.md)

*1 function*

### [`expressions`](expressions.md)

*2 functions, 2 structs*

### [`extensions`](extensions.md)

*1 function*

### [`generated::lint_code`](generated/lint_code.md)

*1 enum*

### [`lint_json`](lint_json.md)

*1 function*

### [`pass_component`](pass_component.md)

*1 function*

### [`pass_mapping`](pass_mapping.md)

*1 enum, 2 functions, 2 structs*

### [`pass_modules`](pass_modules.md)

*2 functions*

### [`pass_ontology`](pass_ontology.md)

*2 functions, 4 structs*

### [`pass_response`](pass_response.md)

*1 function*

### [`pass_theme`](pass_theme.md)

*1 function*

### [`posture_admission`](posture_admission.md)

*1 enum, 1 struct, 5 functions*

### [`references`](references.md)

*1 function*

### [`tree`](tree.md)

*1 function, 2 structs*

### [`types`](types.md)

*1 function, 2 enums, 3 structs*

---

## Source: formspec_lint/formspec_lint.md

**formspec_lint**

# Module: formspec_lint

## Contents

**Modules**

- [`app_graph_report`](#app_graph_report) - Bridges completed AppGraph reports into lint-facing diagnostics.
- [`component_matrix`](#component_matrix) - Component/dataType compatibility accessors for built-in input components.
- [`dependencies`](#dependencies) - Pass 5: Dependency analysis — builds a dependency graph from compiled expressions and detects cycles via DFS.
- [`expressions`](#expressions) - Pass 4: Expression compilation — parses all FEL expression slots in a definition,
- [`extensions`](#extensions) - Pass 3b: Extension validation (E600/E601/E602).
- [`pass_component`](#pass_component) - Pass 7: Component document semantic checks (E800-E807, W800-W807).
- [`pass_mapping`](#pass_mapping) - Pass 9: Mapping document semantic checks and static-analysis facts.
- [`pass_modules`](#pass_modules) - Pass 3c: Module contribution resolution (E603 / E604) and bundle-graph
- [`pass_ontology`](#pass_ontology) - Pass 9: Ontology document semantic checks and static-analysis facts.
- [`pass_response`](#pass_response) - Pass 8 — Response cross-field invariants.
- [`pass_theme`](#pass_theme) - Pass 6: Theme document semantic checks (W700-W712, E710).
- [`posture_admission`](#posture_admission) - ADR 0150 §4.4/§5.4 posture admission matchers — Rust authority for lint;
- [`references`](#references) - Pass 3: Reference validation — checks bind paths and shape targets resolve against the item tree.
- [`tree`](#tree) - Pass 2: Tree indexing — flattens the item tree into a lookup index.

**Functions**

- [`lint`](#lint) - Run the full lint pipeline on a Formspec document with default options.
- [`lint_with_options`](#lint_with_options) - Run the full lint pipeline with explicit options.

---

## Module: app_graph_report

Bridges completed AppGraph reports into lint-facing diagnostics.

This module validates `AppGraphValidationReport` JSON produced by the shared
app-graph package, then exposes diagnostics without mapping their codes into
the legacy lint-code enum. It does not load artifacts, run the TypeScript
resolver kernels, or reinterpret app-graph ownership.



## Module: component_matrix

Component/dataType compatibility accessors for built-in input components.

Pure data module — no tree walking, no diagnostics. Consumed by
`pass_component.rs` and `pass_theme.rs`.

The matrix is loaded from `specs/ui-policy.json` so TypeScript helpers and
Rust lint consume the same policy artifact.



## Module: dependencies

Pass 5: Dependency analysis — builds a dependency graph from compiled expressions and detects cycles via DFS.

Only dataflow expressions (`bind_target = Some(key)`) create graph edges.
Constraint expressions are excluded since they allow self-reference without
creating a dataflow dependency.

Graph building, DFS cycle detection, and diagnostic emission are internal.



## Module: expressions

Pass 4: Expression compilation — parses all FEL expression slots in a definition,
producing `CompiledExpression` structs for downstream dependency analysis (pass 5)
and E400 diagnostics for parse errors.

`walk_*` helpers traverse binds, shapes, variables, and screener slots.



## Module: extensions

Pass 3b: Extension validation (E600/E601/E602).

Validates extension declarations on definition items against loaded registry
documents. Builds a [`MapRegistry`] from raw JSON registry documents, then
walks the item tree emitting diagnostics for unresolved, retired, or
deprecated extensions.

## Diagnostic paths (key-based vs index-based)

Item locations use the shared `formspec_core::visit_definition_items_from_document` walker
(same skip rules as other lint passes) plus
`formspec_core::extension_item_diagnostic_path_from_dotted` to format **semantic** prefixes
(`$.items[key=foo]`, `$.items[key=foo].bar`). Those strings are **not** interchangeable with the
index-based `json_path` values on `formspec_core::DefinitionItemVisitCtx` (for example
`$.items\[0\]`). Key-based
prefixes stay stable when sibling order changes. Switching extension diagnostics to indexed JSON
paths would be a **user-visible** behavior change, not a refactor.

## Spec cross-references (`specs/*.llm.md`)

- `specs/registry/extension-registry.llm.md` — registry entry lifecycle, compatibility, and
  **UNRESOLVED_EXTENSION** when an enabled item extension has no registry match; item-level
  `extensions` use `x-` property names.
- `specs/core/spec.llm.md` — **§3 Item** (`key` identifies nodes in the structural tree); binds
  and instance data use the same dot-separated key paths. Key-based diagnostic paths here follow
  that **semantic** naming surface; indexed `$.items\[n\]` paths follow JSON array order instead
  (see `formspec_core::visit_definition_items_json`).
- `specs/core/definition-spec.llm.md` — items declare structure with stable keys as the primary
  binding surface across tiers.

## Code naming convention

The E-prefix on E600/E601/E602 stands for "Extensions pass" following the
pass-numbering convention (E100=pass1, E200=pass2, E600=pass3b), NOT the
severity. Actual severities:
- **E600**: Error — extension not found in any registry
- **E601**: Warning — extension found but retired
- **E602**: Info — extension found but deprecated

Registry construction and item walks beyond [`check_extensions`] are internal.



## formspec_lint::lint

*Function*

Run the full lint pipeline on a Formspec document with default options.

```rust
fn lint(doc: &serde_json::Value) -> LintResult
```



## formspec_lint::lint_with_options

*Function*

Run the full lint pipeline with explicit options.

```rust
fn lint_with_options(doc: &serde_json::Value, options: &LintOptions) -> LintResult
```



## Module: pass_component

Pass 7: Component document semantic checks (E800-E807, W800-W807).



## Module: pass_mapping

Pass 9: Mapping document semantic checks and static-analysis facts.



## Module: pass_modules

Pass 3c: Module contribution resolution (E603 / E604) and bundle-graph
Component-id uniqueness (E605) — ADR 0150 §4.2/§4.3/§4.5/§5.3.

Three cross-document invariants land here:

- **E603** — every module-extensible enum value matching the `^x-` lane
  (per ADR §4.5's uniform `oneOf [closed-core, x-pattern]` convention)
  MUST resolve against a `contributes[]` entry of a module declared in
  the document's `modules[]`. Closed-core values bypass this pass —
  schema-level validation already accepts them.

- **E604** — when a consuming-document field carries a value owned by a
  contributing module's payload shape (e.g. Theme `widgetConfig` against
  the contributing widget's `widgetShape.props`), the value MUST validate
  against that schema. P0 scope: Theme `defaults.widgetConfig` keyed by
  `widget: x-...`. Surface `module-widget` slot configs are checked against
  the bound module widget's `widgetShape.props`. The remaining sites
  (Experience unit payloads, validation-mapping-row, token-category) light up
  as the consuming schemas land in P1+. Future module-contributed
  `Component.component: x-...` widget admittance gates through this same
  pass per ADR §4.5 (deferred from Task 5).

- **E605** (COMP-BUNDLE-ID-COLLISION) — every authored `ComponentBase.id`
  reachable from a single App Manifest MUST be unique across all
  referenced Component documents (not merely within a single document).
  The binding consumes `LintOptions.bundle_component_documents` — when ≥2
  documents are present it builds an id-index keyed on every `id` string
  field at any depth and emits one diagnostic per colliding id citing all
  occurrences. JSON Schema cannot enforce this graph-level invariant; the
  lint is the substrate enforcement. Load-bearing for ADR 0151 cross-doc
  move (CRDT bidirectional map relies on no-collision in the target doc).

The pass is permissive when inputs are missing: no `modules[]` and/or no
registry documents → no diagnostics. This preserves the default-module-set
behavior per ADR §4.9 for form-only documents.

## E605 walker semantics — Rust analogue of Python audit v3

The id-walker matches the reference implementation at
`tests/conformance/tools/comp_bundle_id_audit.py::walk_deep()` (v3). That
script's v2 walker had a false-negative bug on non-standard nesting because
it only recursed under known structural keys; v3 is the conservative
posture — recurse through EVERY dict/list value at any depth and collect
every `id` string field encountered. The Rust binding MUST preserve v3
semantics; widening the walker to skip non-standard keys re-opens the
false-negative.

Excluded subtrees (e.g. `tests/conformance/fixtures/regeneration-merge/`
— three-way merge fixtures whose four revisions of one Component reuse
ids by design) are the caller's concern. The Python audit applies
`EXCLUDED_TREES` at the bundle-resolution layer; this lint binding sees
only what the caller hands it. See
`tests/conformance/COMP-BUNDLE-ID-MIGRATION.md` §1 Exclusion.



## Module: pass_ontology

Pass 9: Ontology document semantic checks and static-analysis facts.



## Module: pass_response

Pass 8 — Response cross-field invariants.

Validates the `authoredSignatures[*].signedPayload` pin triple against the
top-level Response pins. JSON Schema cannot encode the equality constraint;
Core spec §2.1.6 ("When `authoredSignatures` is present") lists it MUST.

Emits:
- E900: `signedPayload.responseId` != top-level `id`
- E901: `signedPayload.definitionUrl` != top-level `definitionUrl`
- E902: `signedPayload.definitionVersion` != top-level `definitionVersion`

Parity target: Python `_pass_signed_payload_validation` in
`src/formspec/validate.py` (SIGNED_PAYLOAD_RESPONSE_ID_MISMATCH and
siblings). Diagnostic shapes differ — Rust emits per-pass codes; Python
emits SIGNED_PAYLOAD_* codes through `validate_all`. Both reject the same
fixtures with the same root cause.



## Module: pass_theme

Pass 6: Theme document semantic checks (W700-W712, E710).



## Module: posture_admission

ADR 0150 §4.4/§5.4 posture admission matchers — Rust authority for lint;
semantics mirrored in `packages/formspec-app-graph/src/posture-admission.ts`.



## Module: references

Pass 3: Reference validation — checks bind paths and shape targets resolve against the item tree.

Uses [`ItemTreeIndex`] from pass 2 for path resolution. Emits:
- **E300**: Bind path references an unknown item
- **E301**: Shape target references an unknown item
- **E302**: Item's `optionSet` references an undefined option set
- **W300**: Item's `dataType` is incompatible with `optionSet`

Private helpers validate bind paths, shapes, and option sets against the item index.



## Module: tree

Pass 2: Tree indexing — flattens the item tree into a lookup index.

Walks `document["items"]` recursively, building an `ItemTreeIndex` that maps
keys and full dotted paths to `ItemRef` metadata. Emits E200 (duplicate key)
and E201 (duplicate full path) diagnostics during indexing.

---

## Source: formspec_lint/app_graph_report.md

**formspec_lint > app_graph_report**

# Module: app_graph_report

## Contents

**Structs**

- [`AppGraphLintDiagnostic`](#appgraphlintdiagnostic) - An app-graph diagnostic preserved for lint consumers.
- [`AppGraphLintReport`](#appgraphlintreport) - A lint-facing view of a completed app-graph validation report.
- [`AppGraphReportSchemaError`](#appgraphreportschemaerror) - Schema validation errors for an app-graph report bridge input.

**Functions**

- [`app_graph_lint_report_to_json_value`](#app_graph_lint_report_to_json_value) - Serializes a lint-facing app-graph report bridge result.
- [`bridge_app_graph_report`](#bridge_app_graph_report) - Bridges a completed app-graph validation report for lint consumers.

---

## formspec_lint::app_graph_report::AppGraphLintDiagnostic

*Struct*

An app-graph diagnostic preserved for lint consumers.

**Fields:**
- `code: String` - Stable app-graph diagnostic code.
- `severity: String` - Diagnostic severity from the app-graph report.
- `phase: String` - AppGraph report phase that produced or imported the diagnostic.
- `origin: String` - Producer origin from the app-graph report.
- `message: String` - Human-readable diagnostic message.
- `primary_source: Option<serde_json::Value>` - Primary source pointer preserved from the app-graph report.
- `related_sources: Vec<serde_json::Value>` - Related source pointers preserved from the app-graph report.
- `details: Option<serde_json::Value>` - Stable machine-readable details preserved from the app-graph report.

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &AppGraphLintDiagnostic) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> AppGraphLintDiagnostic`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::app_graph_report::AppGraphLintReport

*Struct*

A lint-facing view of a completed app-graph validation report.

**Fields:**
- `ok: bool` - Whether the source app-graph report was valid.
- `diagnostics: Vec<AppGraphLintDiagnostic>` - Diagnostics preserved from the source app-graph report.

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &AppGraphLintReport) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> AppGraphLintReport`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::app_graph_report::AppGraphReportSchemaError

*Struct*

Schema validation errors for an app-graph report bridge input.

**Fields:**
- `errors: Vec<String>` - Schema-validation error messages.

**Traits:** Error, Eq

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &AppGraphReportSchemaError) -> bool`
- **Display**
  - `fn fmt(self: &Self, formatter: & mut std::fmt::Formatter) -> std::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> AppGraphReportSchemaError`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::app_graph_report::app_graph_lint_report_to_json_value

*Function*

Serializes a lint-facing app-graph report bridge result.

```rust
fn app_graph_lint_report_to_json_value(report: &AppGraphLintReport) -> serde_json::Value
```



## formspec_lint::app_graph_report::bridge_app_graph_report

*Function*

Bridges a completed app-graph validation report for lint consumers.

The function validates `report` against
`schemas/app-graph-validation-report.schema.json`, then copies diagnostics
into lint-facing structures without recoding app-graph diagnostic identity.

# Errors

Returns [`AppGraphReportSchemaError`] when `report` is not a valid
`AppGraphValidationReport`.

```rust
fn bridge_app_graph_report(report: &serde_json::Value) -> Result<AppGraphLintReport, AppGraphReportSchemaError>
```

---

## Source: formspec_lint/component_matrix.md

**formspec_lint > component_matrix**

# Module: component_matrix

## Contents

**Enums**

- [`Compatibility`](#compatibility) - Result of checking a component against a dataType.

**Functions**

- [`classify_compatibility`](#classify_compatibility) - Classify how compatible a component is with a given dataType.
- [`input_components`](#input_components) - The built-in input components declared by the shared UI policy.
- [`is_input_component`](#is_input_component) - Whether this component is one of the 12 built-in input components.
- [`requires_options_source`](#requires_options_source) - Whether this component requires an optionSet or inline options.

---

## formspec_lint::component_matrix::Compatibility

*Enum*

Result of checking a component against a dataType.

**Variants:**
- `Compatible` - Fully compatible — no diagnostic needed.
- `CompatibleWithWarning` - Compatible in authoring mode only — emit warning in runtime mode.
- `Incompatible` - Incompatible — always an error.
- `NotApplicable` - Not an input component (layout, display, etc.) — skip check.

**Traits:** Eq, Copy

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &Compatibility) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> Compatibility`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::component_matrix::classify_compatibility

*Function*

Classify how compatible a component is with a given dataType.

Returns `NotApplicable` if the component is not one of the 12 input components.

```rust
fn classify_compatibility(component: &str, data_type: &str) -> Compatibility
```



## formspec_lint::component_matrix::input_components

*Function*

The built-in input components declared by the shared UI policy.

```rust
fn input_components() -> Vec<&'static str>
```



## formspec_lint::component_matrix::is_input_component

*Function*

Whether this component is one of the 12 built-in input components.

```rust
fn is_input_component(component: &str) -> bool
```



## formspec_lint::component_matrix::requires_options_source

*Function*

Whether this component requires an optionSet or inline options.

Returns `false` for non-input components.

```rust
fn requires_options_source(component: &str) -> bool
```

---

## Source: formspec_lint/dependencies.md

**formspec_lint > dependencies**

# Module: dependencies

## Contents

**Functions**

- [`analyze_dependencies`](#analyze_dependencies) - Analyze compiled expressions for dependency cycles.

---

## formspec_lint::dependencies::analyze_dependencies

*Function*

Analyze compiled expressions for dependency cycles.

Builds a directed graph where each bind key points to the set of bind keys
its expression references. Runs DFS cycle detection and emits one E500
diagnostic per unique cycle (canonically deduplicated).

```rust
fn analyze_dependencies(compiled: &[crate::expressions::CompiledExpression]) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/expressions.md

**formspec_lint > expressions**

# Module: expressions

## Contents

**Structs**

- [`CompiledExpression`](#compiledexpression) - A successfully parsed FEL expression with its location metadata.
- [`ExpressionCompilationResult`](#expressioncompilationresult) - Result of compiling all FEL expression slots in a definition document.

**Functions**

- [`compile_expressions`](#compile_expressions) - Walk all FEL expression slots in a definition document, parse each,
- [`compile_screener_expressions`](#compile_screener_expressions) - Walk all FEL expression slots in a standalone Screener Document.

---

## formspec_lint::expressions::CompiledExpression

*Struct*

A successfully parsed FEL expression with its location metadata.

**Fields:**
- `expression: String` - The original FEL source text.
- `expression_path: String` - JSONPath to the expression slot, e.g. `$.binds.name.calculate`.
- `bind_target: Option<String>` - The bind key this expression targets for dependency graph edges.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> CompiledExpression`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::expressions::ExpressionCompilationResult

*Struct*

Result of compiling all FEL expression slots in a definition document.

**Fields:**
- `compiled: Vec<CompiledExpression>` - Successfully parsed expressions.
- `diagnostics: Vec<crate::types::LintDiagnostic>` - E400 diagnostics for unparseable expressions.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::expressions::compile_expressions

*Function*

Walk all FEL expression slots in a definition document, parse each,
and return compiled expressions plus E400 diagnostics for parse failures.

```rust
fn compile_expressions(document: &serde_json::Value) -> ExpressionCompilationResult
```



## formspec_lint::expressions::compile_screener_expressions

*Function*

Walk all FEL expression slots in a standalone Screener Document.
Paths: $.evaluation[N].routes[M].condition, $.evaluation[N].routes[M].score,
$.evaluation[N].activeWhen, $.binds (screener-scoped).

```rust
fn compile_screener_expressions(document: &serde_json::Value) -> ExpressionCompilationResult
```

---

## Source: formspec_lint/extensions.md

**formspec_lint > extensions**

# Module: extensions

## Contents

**Functions**

- [`check_extensions`](#check_extensions) - Validate extension declarations in a definition document against registry

---

## formspec_lint::extensions::check_extensions

*Function*

Validate extension declarations in a definition document against registry
documents.

Returns diagnostics for:
- **E600** (Error) — extension not found in any registry
- **E601** (Warning) — extension found but retired
- **E602** (Info) — extension found but deprecated

When no registries are loaded, every enabled extension is unresolved (E600).

```rust
fn check_extensions(document: &serde_json::Value, registry_documents: &[serde_json::Value]) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/generated/lint_code.md

**formspec_lint > generated > lint_code**

# Module: generated::lint_code

## Contents

**Enums**

- [`LintCode`](#lintcode) - Canonical lint diagnostic code (registry-driven).

---

## formspec_lint::generated::lint_code::LintCode

*Enum*

Canonical lint diagnostic code (registry-driven).

**Variants:**
- `E100` - Registry code `E100`.
- `E101` - Registry code `E101`.
- `E200` - Registry code `E200`.
- `E201` - Registry code `E201`.
- `E300` - Registry code `E300`.
- `E301` - Registry code `E301`.
- `E302` - Registry code `E302`.
- `W300` - Registry code `W300`.
- `E400` - Registry code `E400`.
- `E500` - Registry code `E500`.
- `E600` - Registry code `E600`.
- `E601` - Registry code `E601`.
- `E602` - Registry code `E602`.
- `E603` - Registry code `E603`.
- `E604` - Registry code `E604`.
- `E605` - Registry code `E605`.
- `E608` - Registry code `E608`.
- `E609` - Registry code `E609`.
- `E606` - Registry code `E606`.
- `E607` - Registry code `E607`.
- `E610` - Registry code `E610`.
- `E611` - Registry code `E611`.
- `W700` - Registry code `W700`.
- `W701` - Registry code `W701`.
- `W702` - Registry code `W702`.
- `W703` - Registry code `W703`.
- `W704` - Registry code `W704`.
- `W705` - Registry code `W705`.
- `W706` - Registry code `W706`.
- `W707` - Registry code `W707`.
- `W708` - Registry code `W708`.
- `W709` - Registry code `W709`.
- `E710` - Registry code `E710`.
- `W711` - Registry code `W711`.
- `W712` - Registry code `W712`.
- `E800` - Registry code `E800`.
- `E801` - Registry code `E801`.
- `E802` - Registry code `E802`.
- `E803` - Registry code `E803`.
- `E804` - Registry code `E804`.
- `E805` - Registry code `E805`.
- `E806` - Registry code `E806`.
- `E807` - Registry code `E807`.
- `W805` - Registry code `W805`.
- `W806` - Registry code `W806`.
- `W807` - Registry code `W807`.
- `W800` - Registry code `W800`.
- `W801` - Registry code `W801`.
- `W802` - Registry code `W802`.
- `W803` - Registry code `W803`.
- `W804` - Registry code `W804`.
- `E900` - Registry code `E900`.
- `E901` - Registry code `E901`.
- `E902` - Registry code `E902`.
- `E1100` - Registry code `E1100`.
- `E1101` - Registry code `E1101`.
- `E1102` - Registry code `E1102`.
- `E1103` - Registry code `E1103`.
- `E1104` - Registry code `E1104`.
- `E1105` - Registry code `E1105`.
- `E1106` - Registry code `E1106`.
- `W1100` - Registry code `W1100`.
- `W1101` - Registry code `W1101`.
- `E1110` - Registry code `E1110`.
- `E1111` - Registry code `E1111`.
- `E1112` - Registry code `E1112`.
- `E1113` - Registry code `E1113`.
- `W1110` - Registry code `W1110`.
- `E1200` - Registry code `E1200`.
- `E1201` - Registry code `E1201`.
- `E1202` - Registry code `E1202`.
- `W1200` - Registry code `W1200`.
- `W1201` - Registry code `W1201`.
- `W1202` - Registry code `W1202`.
- `W1203` - Registry code `W1203`.
- `W1204` - Registry code `W1204`.
- `W1205` - Registry code `W1205`.
- `W1206` - Registry code `W1206`.
- `E1300` - Registry code `E1300`.
- `E1301` - Registry code `E1301`.
- `E1302` - Registry code `E1302`.
- `E1303` - Registry code `E1303`.
- `E1304` - Registry code `E1304`.
- `W1300` - Registry code `W1300`.
- `W1301` - Registry code `W1301`.
- `E1310` - Registry code `E1310`.
- `W1310` - Registry code `W1310`.
- `W1311` - Registry code `W1311`.
- `E1400` - Registry code `E1400`.
- `W1400` - Registry code `W1400`.
- `E1401` - Registry code `E1401`.
- `E1402` - Registry code `E1402`.
- `E1403` - Registry code `E1403`.
- `E1404` - Registry code `E1404`.
- `E1405` - Registry code `E1405`.
- `E1406` - Registry code `E1406`.
- `E1407` - Registry code `E1407`.
- `E1410` - Registry code `E1410`.
- `E1411` - Registry code `E1411`.
- `W1401` - Registry code `W1401`.
- `E1500` - Registry code `E1500`.
- `E1501` - Registry code `E1501`.
- `E1502` - Registry code `E1502`.
- `E1503` - Registry code `E1503`.
- `E1504` - Registry code `E1504`.
- `E1505` - Registry code `E1505`.
- `E1506` - Registry code `E1506`.
- `E1507` - Registry code `E1507`.
- `W1500` - Registry code `W1500`.
- `W1600` - Registry code `W1600`.
- `E1700` - Registry code `E1700`.
- `W1700` - Registry code `W1700`.
- `W1701` - Registry code `W1701`.
- `W1702` - Registry code `W1702`.
- `W1703` - Registry code `W1703`.
- `E1800` - Registry code `E1800`.
- `W1800` - Registry code `W1800`.
- `E1801` - Registry code `E1801`.
- `E1802` - Registry code `E1802`.
- `E1803` - Registry code `E1803`.
- `E1804` - Registry code `E1804`.
- `W1802` - Registry code `W1802`.

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str` - JSON / diagnostic wire string (e.g. `"E300"`).
- `fn pass(self: Self) -> u8` - Lint pass number from the registry.
- `fn parse_wire(s: &str) -> Option<Self>` - Parse a wire code; returns `None` for unknown values.

**Traits:** Eq, Copy

**Trait Implementations:**

- **FromStr**
  - `fn from_str(s: &str) -> Result<Self, <Self as >::Err>`
- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **PartialEq**
  - `fn eq(self: &Self, other: &LintCode) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> LintCode`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Display**
  - `fn fmt(self: &Self, f: & mut fmt::Formatter) -> fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`

---

## Source: formspec_lint/lint_json.md

**formspec_lint > lint_json**

# Module: lint_json

## Contents

**Functions**

- [`lint_result_to_json_value`](#lint_result_to_json_value) - Serialize a [`LintResult`] for host bindings.

---

## formspec_lint::lint_json::lint_result_to_json_value

*Function*

Serialize a [`LintResult`] for host bindings.

```rust
fn lint_result_to_json_value(result: &crate::LintResult, style: formspec_core::JsonWireStyle) -> serde_json::Value
```

---

## Source: formspec_lint/pass_component.md

**formspec_lint > pass_component**

# Module: pass_component

## Contents

**Functions**

- [`lint_component`](#lint_component) - Validate a component document and return all diagnostics.

---

## formspec_lint::pass_component::lint_component

*Function*

Validate a component document and return all diagnostics.
When `definition` is provided, cross-artifact checks (W800, E802-E803) are enabled.

```rust
fn lint_component(component: &serde_json::Value, definition: Option<&serde_json::Value>) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/pass_mapping.md

**formspec_lint > pass_mapping**

# Module: pass_mapping

## Contents

**Structs**

- [`MappingRuleAnalysis`](#mappingruleanalysis)
- [`MappingStaticAnalysis`](#mappingstaticanalysis)

**Enums**

- [`TransformClass`](#transformclass)

**Functions**

- [`analyze_mapping`](#analyze_mapping)
- [`lint_mapping`](#lint_mapping)

---

## formspec_lint::pass_mapping::MappingRuleAnalysis

*Struct*

**Fields:**
- `rule_index: usize`
- `source_path: Option<String>`
- `normalized_source_segments: Vec<String>`
- `target_path: Option<String>`
- `normalized_target_segments: Vec<String>`
- `resolved_definition_item: Option<String>`
- `transform_class: TransformClass`
- `projected_target_type: Option<String>`
- `projected_target_enum: Vec<String>`
- `derived_required: Option<bool>`
- `target_write_footprint: Vec<String>`

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingRuleAnalysis`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::pass_mapping::MappingStaticAnalysis

*Struct*

**Fields:**
- `rules: Vec<MappingRuleAnalysis>`
- `diagnostics: Vec<crate::types::LintDiagnostic>`

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> MappingStaticAnalysis`



## formspec_lint::pass_mapping::TransformClass

*Enum*

**Variants:**
- `Static`
- `StaticWithHint`
- `NonStatic`
- `Omitted`

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> TransformClass`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &TransformClass) -> bool`



## formspec_lint::pass_mapping::analyze_mapping

*Function*

```rust
fn analyze_mapping(mapping: &serde_json::Value, definition: Option<&serde_json::Value>) -> MappingStaticAnalysis
```



## formspec_lint::pass_mapping::lint_mapping

*Function*

```rust
fn lint_mapping(mapping: &serde_json::Value, definition: Option<&serde_json::Value>) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/pass_modules.md

**formspec_lint > pass_modules**

# Module: pass_modules

## Contents

**Functions**

- [`check_bundle_component_ids`](#check_bundle_component_ids) - E605 binding entry: walk every supplied Component document, build an
- [`check_module_contributions`](#check_module_contributions) - Run E603 + E604 for the given document. Always safe to call — emits

---

## formspec_lint::pass_modules::check_bundle_component_ids

*Function*

E605 binding entry: walk every supplied Component document, build an
id→occurrences index keyed only on cross-document collisions (intra-doc
duplicates are the schema's concern), emit one diagnostic per colliding id.

Returns no diagnostics when fewer than 2 documents are supplied; a single
document's local uniqueness is enforced by the schema pattern and the
per-document component walker.

```rust
fn check_bundle_component_ids(bundle_component_documents: &[serde_json::Value]) -> Vec<crate::types::LintDiagnostic>
```



## formspec_lint::pass_modules::check_module_contributions

*Function*

Run E603 + E604 for the given document. Always safe to call — emits
nothing when registry_documents is empty or the document declares no
modules[].

```rust
fn check_module_contributions(doc: &serde_json::Value, doc_type_name: &str, registry_documents: &[serde_json::Value]) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/pass_ontology.md

**formspec_lint > pass_ontology**

# Module: pass_ontology

## Contents

**Structs**

- [`OntologyConceptSystemFact`](#ontologyconceptsystemfact)
- [`OntologyPathFact`](#ontologypathfact)
- [`OntologyStaticAnalysis`](#ontologystaticanalysis)
- [`OntologyVocabularyFact`](#ontologyvocabularyfact)

**Functions**

- [`analyze_ontology`](#analyze_ontology)
- [`lint_ontology`](#lint_ontology)

---

## formspec_lint::pass_ontology::OntologyConceptSystemFact

*Struct*

**Fields:**
- `path: String`
- `declared_system: Option<String>`
- `effective_system: Option<String>`
- `uses_default_system: bool`

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> OntologyConceptSystemFact`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::pass_ontology::OntologyPathFact

*Struct*

**Fields:**
- `path: String`
- `normalized_segments: Vec<String>`
- `resolved_item_path: Option<String>`

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> OntologyPathFact`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::pass_ontology::OntologyStaticAnalysis

*Struct*

**Fields:**
- `default_system: Option<String>`
- `concept_paths: Vec<OntologyPathFact>`
- `alignment_paths: Vec<OntologyPathFact>`
- `concept_systems: Vec<OntologyConceptSystemFact>`
- `vocabularies: Vec<OntologyVocabularyFact>`
- `diagnostics: Vec<crate::types::LintDiagnostic>`

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> OntologyStaticAnalysis`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::pass_ontology::OntologyVocabularyFact

*Struct*

**Fields:**
- `option_set: String`
- `resolved: bool`
- `resolved_values: Vec<String>`

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> OntologyVocabularyFact`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::pass_ontology::analyze_ontology

*Function*

```rust
fn analyze_ontology(ontology: &serde_json::Value, definition: Option<&serde_json::Value>) -> OntologyStaticAnalysis
```



## formspec_lint::pass_ontology::lint_ontology

*Function*

```rust
fn lint_ontology(ontology: &serde_json::Value, definition: Option<&serde_json::Value>) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/pass_response.md

**formspec_lint > pass_response**

# Module: pass_response

## Contents

**Functions**

- [`lint_response`](#lint_response) - Run the Response pass: cross-field signature pin invariants.

---

## formspec_lint::pass_response::lint_response

*Function*

Run the Response pass: cross-field signature pin invariants.

Returns no diagnostics for Response documents that omit `authoredSignatures`.

```rust
fn lint_response(doc: &serde_json::Value) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/pass_theme.md

**formspec_lint > pass_theme**

# Module: pass_theme

## Contents

**Functions**

- [`lint_theme`](#lint_theme) - Validate a theme document and return all diagnostics.

---

## formspec_lint::pass_theme::lint_theme

*Function*

Validate a theme document and return all diagnostics.

When `definition` is provided AND the theme is Definition-scoped, cross-artifact checks
(W705-W707) are enabled. A theme declaring no `targetDefinition` is bundle-scoped
(theme-spec §2.2.1) and names no Definition, so all three are suspended — not W707 alone.
W705 / W706 resolve `items` keys and `pages[].regions[].key` against the paired Definition;
running them under bundle scope would resolve item keys against a Definition the pass has
just declined to bind, manufacturing findings the author never claimed. See theme-spec
§7.2, which is the single normative statement of what bundle scope suspends.

```rust
fn lint_theme(theme: &serde_json::Value, definition: Option<&serde_json::Value>) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/posture_admission.md

**formspec_lint > posture_admission**

# Module: posture_admission

## Contents

**Structs**

- [`ModuleRefFields`](#modulereffields) - Parsed module reference fields used by posture admission.

**Enums**

- [`ModulePostureAdmissionFailure`](#modulepostureadmissionfailure) - Why a document module failed posture admission.

**Functions**

- [`allowed_actors_from_posture`](#allowed_actors_from_posture) - Parse posture `allowedActors[]` URNs.
- [`allowed_modules_from_posture`](#allowed_modules_from_posture) - Parse posture `allowedModules[]` from a posture-declaration document.
- [`evaluate_actor_posture_admission`](#evaluate_actor_posture_admission) - Binary actor URN admission per ADR 0150 §5.4.
- [`evaluate_module_posture_admission`](#evaluate_module_posture_admission) - Evaluate whether `document_module` is admitted by posture `allowed_modules`.
- [`module_ref_fields_from_value`](#module_ref_fields_from_value) - Parse a JSON `ModuleRef` object for posture checks.

---

## formspec_lint::posture_admission::ModulePostureAdmissionFailure

*Enum*

Why a document module failed posture admission.

**Variants:**
- `NotListed` - No posture entry matched the document module id.
- `FieldMismatch(&'static str)` - Id matched an entry but a populated posture field differed.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ModulePostureAdmissionFailure`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &ModulePostureAdmissionFailure) -> bool`



## formspec_lint::posture_admission::ModuleRefFields

*Struct*

Parsed module reference fields used by posture admission.

**Fields:**
- `id: String` - Module URN id.
- `version: String` - Semver string on the document/posture entry.
- `publisher: Option<String>` - Optional publisher URI asserted on the document side.
- `lock_hash: Option<String>` - Optional digest pin asserted on the document side.

**Traits:** Eq

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &ModuleRefFields) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> ModuleRefFields`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::posture_admission::allowed_actors_from_posture

*Function*

Parse posture `allowedActors[]` URNs.

```rust
fn allowed_actors_from_posture(posture: &serde_json::Value) -> Vec<String>
```



## formspec_lint::posture_admission::allowed_modules_from_posture

*Function*

Parse posture `allowedModules[]` from a posture-declaration document.

```rust
fn allowed_modules_from_posture(posture: &serde_json::Value) -> Vec<ModuleRefFields>
```



## formspec_lint::posture_admission::evaluate_actor_posture_admission

*Function*

Binary actor URN admission per ADR 0150 §5.4.

```rust
fn evaluate_actor_posture_admission(actor_urn: &str, allowed_actors: &[String]) -> bool
```



## formspec_lint::posture_admission::evaluate_module_posture_admission

*Function*

Evaluate whether `document_module` is admitted by posture `allowed_modules`.

When `allowed_modules` is empty, admission is permissive (no posture constraint).

```rust
fn evaluate_module_posture_admission(document_module: &ModuleRefFields, allowed_modules: &[ModuleRefFields]) -> Result<(), ModulePostureAdmissionFailure>
```



## formspec_lint::posture_admission::module_ref_fields_from_value

*Function*

Parse a JSON `ModuleRef` object for posture checks.

```rust
fn module_ref_fields_from_value(value: &serde_json::Value) -> Option<ModuleRefFields>
```

---

## Source: formspec_lint/references.md

**formspec_lint > references**

# Module: references

## Contents

**Functions**

- [`check_references`](#check_references) - Run pass 3 reference checks against an already-built item tree index.

---

## formspec_lint::references::check_references

*Function*

Run pass 3 reference checks against an already-built item tree index.

```rust
fn check_references(document: &serde_json::Value, index: &crate::tree::ItemTreeIndex) -> Vec<crate::types::LintDiagnostic>
```

---

## Source: formspec_lint/tree.md

**formspec_lint > tree**

# Module: tree

## Contents

**Structs**

- [`ItemRef`](#itemref) - Metadata for one item in the definition tree.
- [`ItemTreeIndex`](#itemtreeindex) - Index built by walking the item tree. Consumed by downstream lint passes.

**Functions**

- [`build_item_index`](#build_item_index) - Build an `ItemTreeIndex` from a definition document.

---

## formspec_lint::tree::ItemRef

*Struct*

Metadata for one item in the definition tree.

**Fields:**
- `key: String` - The item's key.
- `full_path: String` - Dotted path from root (e.g., "address.street").
- `json_path: String` - JSONPath for diagnostics (e.g., `$.items[0].children[1]`).
- `parent_full_path: Option<String>` - The parent's full dotted path, if nested.
- `data_type: Option<String>` - The item's `dataType` value, if present.
- `is_repeatable: bool` - Whether this item is a repeatable group (`"repeatable": true` or legacy `"repeat": {…}`).

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ItemRef`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::tree::ItemTreeIndex

*Struct*

Index built by walking the item tree. Consumed by downstream lint passes.

**Fields:**
- `by_key: std::collections::HashMap<String, ItemRef>` - First item encountered with each key.
- `by_full_path: std::collections::HashMap<String, ItemRef>` - All items by full dotted path.
- `repeatable_groups: std::collections::HashSet<String>` - Full paths of repeatable group items.
- `ambiguous_keys: std::collections::HashSet<String>` - Keys that appear more than once anywhere in the tree.
- `diagnostics: Vec<crate::types::LintDiagnostic>` - E200/E201 diagnostics emitted during indexing.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::tree::build_item_index

*Function*

Build an `ItemTreeIndex` from a definition document.

Walks `document["items"]` recursively. Items without a `key` field are skipped.

```rust
fn build_item_index(document: &serde_json::Value) -> ItemTreeIndex
```

---

## Source: formspec_lint/types.md

**formspec_lint > types**

# Module: types

## Contents

**Structs**

- [`LintDiagnostic`](#lintdiagnostic) - A lint diagnostic.
- [`LintOptions`](#lintoptions) - Options for the lint pipeline.
- [`LintResult`](#lintresult) - Result of linting.

**Enums**

- [`LintMode`](#lintmode) - Controls which diagnostics are emitted.
- [`LintSeverity`](#lintseverity) - Severity of a lint diagnostic (sorting, validity, and JSON wire values).

**Functions**

- [`sort_diagnostics`](#sort_diagnostics) - Sort diagnostics: pass ASC, severity (error > warning > info), path ASC.

---

## formspec_lint::types::LintDiagnostic

*Struct*

A lint diagnostic.

**Fields:**
- `code: crate::generated::LintCode` - Error/warning code (e.g., `E100`, `E201`, `W300`).
- `pass: u8` - Pass number (1-9).
- `severity: LintSeverity` - Severity: error, warning, info.
- `path: String` - JSONPath to the problematic element.
- `message: String` - Human-readable message.
- `suggested_fix: Option<String>` - Machine-readable repair hint for the authoring loop.
- `spec_ref: Option<String>` - Pointer to the normative spec clause that motivates this rule

**Methods:**

- `fn error<impl Into<String>, impl Into<String>>(code: LintCode, pass: u8, path: impl Trait, message: impl Trait) -> Self` - Create an error diagnostic.
- `fn warning<impl Into<String>, impl Into<String>>(code: LintCode, pass: u8, path: impl Trait, message: impl Trait) -> Self` - Create a warning diagnostic.
- `fn info<impl Into<String>, impl Into<String>>(code: LintCode, pass: u8, path: impl Trait, message: impl Trait) -> Self` - Create an info diagnostic.
- `fn with_suggested_fix<impl Into<String>>(self: Self, fix: impl Trait) -> Self` - Attach a machine-readable repair hint (e.g., `"rename 'amount' to 'quantity'"`).
- `fn with_spec_ref<impl Into<String>>(self: Self, spec_ref: impl Trait) -> Self` - Attach a pointer to the normative spec clause that motivates this rule
- `fn promote_in_strict_mode(self: & mut Self, mode: LintMode)` - Promote component compatibility warnings to errors when `mode` is [`LintMode::Strict`].
- `fn suppressed_in(self: &Self, mode: LintMode) -> bool` - Whether this diagnostic should be suppressed in the given lint mode.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> LintDiagnostic`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::types::LintMode

*Enum*

Controls which diagnostics are emitted.

**Variants:**
- `Runtime` - Full checking — all diagnostics emitted. Used for CI/publishing.
- `Authoring` - Authoring mode — suppresses certain warnings that are noisy during editing
- `Strict` - Strict mode — all diagnostics emitted, and component compatibility warnings

**Methods:**

- `fn is_authoring(self: Self) -> bool` - Whether this mode is the relaxed authoring mode.
- `fn from_host_option_str(mode: Option<&str>) -> Self` - Map host option strings (`authoring` / `strict` / default) to a lint mode.

**Traits:** Eq, Copy

**Trait Implementations:**

- **Default**
  - `fn default() -> LintMode`
- **PartialEq**
  - `fn eq(self: &Self, other: &LintMode) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> LintMode`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::types::LintOptions

*Struct*

Options for the lint pipeline.

**Fields:**
- `mode: LintMode` - Lint mode (Runtime, Authoring, or Strict).
- `registry_documents: Vec<serde_json::Value>` - Optional registry documents for extension resolution (E600).
- `definition_document: Option<serde_json::Value>` - Optional paired definition document for cross-artifact validation.
- `theme_document: Option<serde_json::Value>` - Optional paired Theme document for Locale `$page.*` string-key checks.
- `component_documents: Vec<serde_json::Value>` - Optional paired Component documents for Locale `$component.*` string-key checks.
- `locale_documents: Vec<serde_json::Value>` - Optional peer Locale documents for fallback-chain checks.
- `bundle_component_documents: Vec<serde_json::Value>` - Optional sibling Component documents reachable from a single App Manifest,
- `app_graph_validation_report: Option<serde_json::Value>` - Optional completed AppGraphValidator report for lint-side consumption.
- `posture_declaration: Option<serde_json::Value>` - Optional posture-declaration document for cross-document admission (E608/E609).
- `schema_only: bool` - When `true`, run only pass 1 (document type detection) and return early.
- `no_fel: bool` - When `true`, skip FEL-related passes (pass 4: expression compilation,

**Trait Implementations:**

- **Default**
  - `fn default() -> LintOptions`
- **Clone**
  - `fn clone(self: &Self) -> LintOptions`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::types::LintResult

*Struct*

Result of linting.

**Fields:**
- `document_type: Option<formspec_core::DocumentType>` - Document type (if detected).
- `diagnostics: Vec<LintDiagnostic>` - All diagnostics from all passes (sorted).
- `app_graph_report: Option<crate::app_graph_report::AppGraphLintReport>` - Completed app-graph report diagnostics preserved for lint consumers.
- `valid: bool` - Whether the document is valid (no errors).

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> LintResult`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::types::LintSeverity

*Enum*

Severity of a lint diagnostic (sorting, validity, and JSON wire values).

**Variants:**
- `Error` - Fails [`LintResult::valid`]; blocks publishing in strict pipelines.
- `Warning` - Should be fixed but does not alone invalidate the document in runtime mode.
- `Info` - Informational (least severe; sorted after errors and warnings).

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str` - Wire string for JSON diagnostics (`error` / `warning` / `info`).

**Traits:** Eq, Copy

**Trait Implementations:**

- **PartialOrd**
  - `fn partial_cmp(self: &Self, other: &Self) -> Option<Ordering>`
- **Ord**
  - `fn cmp(self: &Self, other: &Self) -> Ordering`
- **PartialEq**
  - `fn eq(self: &Self, other: &LintSeverity) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> LintSeverity`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_lint::types::sort_diagnostics

*Function*

Sort diagnostics: pass ASC, severity (error > warning > info), path ASC.

```rust
fn sort_diagnostics(diags: & mut [LintDiagnostic])
```

---
