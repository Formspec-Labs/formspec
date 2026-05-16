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

Formspec Linter — 8-pass static analysis and validation pipeline.

Pass 1 (E100): Document type detection
Pass 1b (E101): JSON Schema validation against embedded schemas
Pass 2 (E200/E201): Tree indexing, duplicate key/path detection
Pass 3 (E300/E301/E302/W300): Reference validation — bind paths, shape targets, optionSets
Pass 3b (E600/E601/E602): Extension resolution against registry documents
Pass 4 (E400): FEL expression compilation
Pass 5 (E500): Dependency cycle detection
Pass 6 (W700-W711/E710): Theme — token validation, reference integrity, page semantics
Pass 7 (E800-E807/W800-W804): Components — tree validation, type compatibility, bind resolution
Pass 8 (E900-E902): Response — cross-field signed-payload pin invariants

## Documentation

- Human overview: crate `README.md` (pass map, options, module layout).
- API reference: `cargo doc -p formspec-lint --no-deps --open`.
- Markdown API export: `docs/rustdoc-md/API.md` (see README; regenerate with `npm run docs:formspec-lint`).

## Modules

### [`formspec_lint`](formspec_lint.md)

*2 functions, 9 modules*

### [`component_matrix`](component_matrix.md)

*1 constant, 1 enum, 3 functions*

### [`dependencies`](dependencies.md)

*1 function*

### [`expressions`](expressions.md)

*2 functions, 2 structs*

### [`extensions`](extensions.md)

*1 function*

### [`lint_json`](lint_json.md)

*1 function*

### [`pass_component`](pass_component.md)

*1 function*

### [`pass_response`](pass_response.md)

*1 function*

### [`pass_theme`](pass_theme.md)

*1 function*

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

- [`component_matrix`](#component_matrix) - Component/dataType compatibility matrix for the 12 built-in input components.
- [`dependencies`](#dependencies) - Pass 5: Dependency analysis — builds a dependency graph from compiled expressions and detects cycles via DFS.
- [`expressions`](#expressions) - Pass 4: Expression compilation — parses all FEL expression slots in a definition,
- [`extensions`](#extensions) - Pass 3b: Extension validation (E600/E601/E602).
- [`pass_component`](#pass_component) - Pass 7: Component document semantic checks (E800-E807, W800-W804).
- [`pass_response`](#pass_response) - Pass 8 — Response cross-field invariants.
- [`pass_theme`](#pass_theme) - Pass 6: Theme document semantic checks (W700-W711, E710).
- [`references`](#references) - Pass 3: Reference validation — checks bind paths and shape targets resolve against the item tree.
- [`tree`](#tree) - Pass 2: Tree indexing — flattens the item tree into a lookup index.

**Functions**

- [`lint`](#lint) - Run the full lint pipeline on a Formspec document with default options.
- [`lint_with_options`](#lint_with_options) - Run the full lint pipeline with explicit options.

---

## Module: component_matrix

Component/dataType compatibility matrix for the 12 built-in input components.

Pure data module — no tree walking, no diagnostics. Consumed by `pass_component.rs`.

Static `COMPAT_RULES` and `CompatRule` rows back the public classifiers; keep matrix tables maintainable.



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

Pass 7: Component document semantic checks (E800-E807, W800-W804).

Validates root layout, component references, type compatibility, bind resolution,
custom component cycles, and duplicate binds.

Layout lists, subtree walks, and compatibility checks beyond [`lint_component`] are internal.



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

Pass 6: Theme document semantic checks (W700-W711, E710).

Validates token values against the embedded Token Registry, checks token
reference integrity, cross-artifact consistency (when a definition is
provided), and page semantics.

The registry maps every platform token key to its semantic type (color,
dimension, fontFamily, etc.) so validation uses authoritative type info
instead of naming-convention heuristics.



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

## Source: formspec_lint/component_matrix.md

**formspec_lint > component_matrix**

# Module: component_matrix

## Contents

**Enums**

- [`Compatibility`](#compatibility) - Result of checking a component against a dataType.

**Functions**

- [`classify_compatibility`](#classify_compatibility) - Classify how compatible a component is with a given dataType.
- [`is_input_component`](#is_input_component) - Whether this component is one of the 12 built-in input components.
- [`requires_options_source`](#requires_options_source) - Whether this component requires an optionSet or inline options.

**Constants**

- [`INPUT_COMPONENTS`](#input_components) - The 12 built-in input components.

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



## formspec_lint::component_matrix::INPUT_COMPONENTS

*Constant*: `&[&str]`

The 12 built-in input components.



## formspec_lint::component_matrix::classify_compatibility

*Function*

Classify how compatible a component is with a given dataType.

Returns `NotApplicable` if the component is not one of the 12 input components.

```rust
fn classify_compatibility(component: &str, data_type: &str) -> Compatibility
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
When `definition` is provided, cross-artifact checks (W705-W707) are enabled.

```rust
fn lint_theme(theme: &serde_json::Value, definition: Option<&serde_json::Value>) -> Vec<crate::types::LintDiagnostic>
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

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> ItemRef`



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
- `code: String` - Error/warning code (e.g., "E100", "E201", "W300").
- `pass: u8` - Pass number (1-8).
- `severity: LintSeverity` - Severity: error, warning, info.
- `path: String` - JSONPath to the problematic element.
- `message: String` - Human-readable message.
- `suggested_fix: Option<String>` - Machine-readable repair hint for the authoring loop.
- `spec_ref: Option<String>` - Pointer to the normative spec clause that motivates this rule

**Methods:**

- `fn error<impl Into<String>, impl Into<String>>(code: &str, pass: u8, path: impl Trait, message: impl Trait) -> Self` - Create an error diagnostic.
- `fn warning<impl Into<String>, impl Into<String>>(code: &str, pass: u8, path: impl Trait, message: impl Trait) -> Self` - Create a warning diagnostic.
- `fn info<impl Into<String>, impl Into<String>>(code: &str, pass: u8, path: impl Trait, message: impl Trait) -> Self` - Create an info diagnostic.
- `fn with_suggested_fix<impl Into<String>>(self: Self, fix: impl Trait) -> Self` - Attach a machine-readable repair hint (e.g., `"rename 'amount' to 'quantity'"`).
- `fn with_spec_ref<impl Into<String>>(self: Self, spec_ref: impl Trait) -> Self` - Attach a pointer to the normative spec clause that motivates this rule
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
- `schema_only: bool` - When `true`, run only pass 1 (document type detection) and return early.
- `no_fel: bool` - When `true`, skip FEL-related passes (pass 4: expression compilation,

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Default**
  - `fn default() -> LintOptions`
- **Clone**
  - `fn clone(self: &Self) -> LintOptions`



## formspec_lint::types::LintResult

*Struct*

Result of linting.

**Fields:**
- `document_type: Option<formspec_core::DocumentType>` - Document type (if detected).
- `diagnostics: Vec<LintDiagnostic>` - All diagnostics from all passes (sorted).
- `valid: bool` - Whether the document is valid (no errors).

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> LintResult`



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

- **Ord**
  - `fn cmp(self: &Self, other: &Self) -> Ordering`
- **PartialOrd**
  - `fn partial_cmp(self: &Self, other: &Self) -> Option<Ordering>`
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

