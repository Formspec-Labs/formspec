# formspec-core — generated API (Markdown)

> Do not edit by hand; regenerate via npm script / cargo doc-md + this bundler.

Bundled from [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md). Nested module paths are preserved in headings. Relative links may not resolve; search by heading.

---

## doc-md index

# Documentation Index

Generated markdown documentation for this project.

## Dependencies (1)

- [`formspec-core`](formspec_core/index.md)

---

Generated with [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md)

---

## Source: formspec_core/index.md

# formspec_core

Formspec core processing — FEL, paths, schemas, assembly, mappings, extensions.

Depends on the `fel_core` crate and holds the non-reactive processing layer used by WASM,
Python, and batch evaluators. Human overview: crate `README.md`. Markdown API export:
`docs/rustdoc-md/API.md` (regenerate with `npm run docs:formspec-core`).

## Modules

### [`formspec_core`](formspec_core.md)

*29 modules*

### [`assembler`](assembler.md)

*1 enum, 1 trait, 3 functions, 3 structs*

### [`assembly_fel_rewrite`](assembly_fel_rewrite.md)

*1 struct, 3 functions*

### [`bind_targets`](bind_targets.md)

*1 struct, 1 type alias*

### [`changelog`](changelog.md)

*2 functions, 2 structs, 4 enums*

### [`compatible_versions`](compatible_versions.md)

*1 function*

### [`component_tree`](component_tree.md)

*1 function*

### [`definition_expressions`](definition_expressions.md)

*3 enums, 6 functions*

### [`definition_items`](definition_items.md)

*1 enum, 1 struct, 8 functions*

### [`extension_analysis`](extension_analysis.md)

*2 traits, 3 enums, 3 functions, 4 structs*

### [`fel_analysis`](fel_analysis.md)

*6 functions, 6 structs*

### [`fel_condition_group_lift`](fel_condition_group_lift.md)

*1 function*

### [`fel_rewrite_exact`](fel_rewrite_exact.md)

*3 functions*

### [`instance_projection`](instance_projection.md)

*1 function, 1 struct, 2 enums*

### [`instance_resolution`](instance_resolution.md)

*4 structs*

### [`json_artifacts`](json_artifacts.md)

*2 functions*

### [`json_util`](json_util.md)

*1 function*

### [`jsonld_context`](jsonld_context.md)

*1 constant, 1 enum, 2 functions, 2 structs*

### [`option_sets`](option_sets.md)

*2 functions*

### [`parser_recovery`](parser_recovery.md)

*1 function, 3 structs*

### [`path_utils`](path_utils.md)

*1 enum, 1 trait, 10 functions, 2 structs*

### [`registry_client`](registry_client.md)

*5 functions*

### [`registry_client::types`](registry_client/types.md)

*3 enums, 5 structs*

### [`registry_client::version`](registry_client/version.md)

*1 function*

### [`registry_client::wire_json`](registry_client/wire_json.md)

*4 functions*

### [`repeat_references`](repeat_references.md)

*4 functions*

### [`response_migration`](response_migration.md)

*1 function*

### [`response_selection`](response_selection.md)

*1 function, 10 structs, 9 enums*

### [`response_selection::candidates`](response_selection/candidates.md)

*1 function*

### [`response_selection::wire`](response_selection/wire.md)

*3 functions*

### [`runtime_mapping::document`](runtime_mapping/document.md)

*2 functions*

### [`runtime_mapping::engine_helpers`](runtime_mapping/engine_helpers.md)

*1 function*

### [`runtime_mapping::parse`](runtime_mapping/parse.md)

*4 functions*

### [`runtime_mapping::types`](runtime_mapping/types.md)

*6 enums, 7 structs*

### [`runtime_mapping::wire_json`](runtime_mapping/wire_json.md)

*3 functions*

### [`schema_validator`](schema_validator.md)

*1 enum, 1 trait, 4 functions, 4 structs*

### [`subject_key`](subject_key.md)

*1 enum*

### [`validation_report`](validation_report.md)

*1 struct, 2 functions*

### [`value_coerce`](value_coerce.md)

*1 function*

### [`wire_keys`](wire_keys.md)

*1 struct, 2 constants, 9 functions*

---

## Source: formspec_core/formspec_core.md

**formspec_core**

# Module: formspec_core

## Contents

**Modules**

- [`assembler`](#assembler) - Resolves $ref inclusions and assembles self-contained definitions with FEL rewriting.
- [`assembly_fel_rewrite`](#assembly_fel_rewrite) - FEL path rewriting for definition assembly (fragment `$ref` / `keyPrefix` semantics).
- [`bind_targets`](#bind_targets) - Bind entries grouped by the Item they target, for document-order merging (Core §4.3.1).
- [`changelog`](#changelog) - Changelog — diffs two definition versions into a structured changelog.
- [`component_tree`](#component_tree) - Pre-order traversal for component/theme JSON nodes (`component` + `children`).
- [`definition_expressions`](#definition_expressions) - Authored FEL expression sites in Definition documents.
- [`definition_items`](#definition_items) - Depth-first traversal of definition `items` / `children` JSON arrays.
- [`extension_analysis`](#extension_analysis) - Validates extension usage in item trees against a registry catalog.
- [`fel_analysis`](#fel_analysis) - FEL static analysis and expression rewriting for field references and variables.
- [`fel_condition_group_lift`](#fel_condition_group_lift) - Lift parsed FEL into the structured condition-group shape used by Studio (`fel-condition-builder`).
- [`fel_rewrite_exact`](#fel_rewrite_exact) - Exact-text rewriting using locations from the FEL parser.
- [`instance_projection`](#instance_projection) - Cross-Definition validation for response-backed instance projections.
- [`instance_resolution`](#instance_resolution) - Delivered values and evidence shared by Response selection and candidate assembly.
- [`json_artifacts`](#json_artifacts) - `serde_json::Value` projections for WASM and Python FFI (use with `json_to_python` on the Py side).
- [`json_util`](#json_util) - Small JSON helpers shared across bindings.
- [`jsonld_context`](#jsonld_context) - JSON-LD `@context` derivation from a Definition and an Ontology document's concept bindings.
- [`option_sets`](#option_sets) - Resolve `options` from `optionSets` in a Formspec Definition.
- [`parser_recovery`](#parser_recovery) - JSON parser error recovery and diagnostic repair.
- [`path_utils`](#path_utils) - Dotted path normalization and tree item navigation by path.
- [`registry_client`](#registry_client) - Registry client — parses registry documents, resolves extensions, validates lifecycle.
- [`repeat_references`](#repeat_references) - Detect authored field paths that cross a repeat without a subscript.
- [`response_migration`](#response_migration) - Apply a Definition's `migrations` (core spec §6.7) to Response data pinned to an earlier version.
- [`response_selection`](#response_selection) - Subject-keyed Response selection and exact delivered-value commitments (Core §2.1.6).
- [`runtime_mapping`](#runtime_mapping) - Bidirectional mapping engine for transforming data between formats.
- [`schema_validator`](#schema_validator) - Schema validation with document type detection and validation dispatch.
- [`subject_key`](#subject_key) - Typed keys for Formspec filing units.
- [`validation_report`](#validation_report) - Assemble validation-report candidates from qualified public findings.
- [`value_coerce`](#value_coerce) - Inbound field coercion (parity with TS `coerceFieldValue` in `formspec-engine` helpers).
- [`wire_keys`](#wire_keys) - Centralized JSON field names for host bindings (`JsonWireStyle`).

---

## Module: assembler

Resolves $ref inclusions and assembles self-contained definitions with FEL rewriting.

## Internal helpers
Private functions walk `items`, merge referenced fragments (`resolve_*`, `perform_assembly`),
hoist binds/shapes/variables (`import_*`), and rewrite FEL via [`crate::assembly_fel_rewrite`].



## Module: assembly_fel_rewrite

FEL path rewriting for definition assembly (fragment `$ref` / `keyPrefix` semantics).

Shared by the assembler and the WASM `rewriteFelForAssembly` entry point.



## Module: bind_targets

Bind entries grouped by the Item they target, for document-order merging (Core §4.3.1).



## Module: changelog

Changelog — diffs two definition versions into a structured changelog.

Compares two Formspec definition JSON documents section-by-section and
produces an ordered list of `Change` records with impact classification.

Private `diff_*` / `merge_*` / `classify_*` helpers implement the section-by-section comparison.



## Module: component_tree

Pre-order traversal for component/theme JSON nodes (`component` + `children`).



## Module: definition_expressions

Authored FEL expression sites in Definition documents.



## Module: definition_items

Depth-first traversal of definition `items` / `children` JSON arrays.

Call sites choose [`DefinitionItemKeyPolicy`]:
- **Lint / static analysis** use [`DefinitionItemKeyPolicy::RequireStringKey`]: only visit nodes
  whose `key` is a JSON string (including `""`). Skip other elements and **do not** recurse into
  their `children`.
- **Runtime eval item-tree rebuild** uses [`visit_definition_items_json_shallow`] with
  [`DefinitionItemKeyPolicy::CoerceNonStringKeyToEmpty`] at each `items` / `children` array, then
  recurses into `children` with the same policy (see `formspec-eval` `rebuild_item_tree`).
  [`coerce_definition_item_key_segment`] implements the coerce key segment for that policy.
- **Extension diagnostic prefixes** (lint pass 3b): map [`DefinitionItemVisitCtx::dotted_path`] via
  [`extension_item_diagnostic_path_from_dotted`] to stable `$.items[key=…]`-style paths.

## Spec cross-references (`specs/*.llm.md`)

Normative shape and behavior for items and paths:

- `specs/core/spec.llm.md` — **§3 Item** (structural tree nodes identified by `key`), **§4 Bind**
  (dot-separated paths onto those keys), **Processing model · Phase 1: Rebuild** (re-index items
  / dependency structure after definition change).
- `specs/core/definition-spec.llm.md` — *Semantic capsule*: stable `key` identifiers as the
  binding surface across rendering, validation, and mapping.
- `specs/component/component-spec.llm.md` — slot `bind` resolves by item `key` (not arbitrary
  FEL paths).

Conformant definitions: Item `key` is required with pattern `^[a-zA-Z][a-zA-Z0-9_]*$` in
`schemas/definition.schema.json`. The two policies here are **tooling/runtime** choices for
walking JSON before or aside from full schema validation: skip ill-formed nodes vs coerce and
keep descending.



## Module: extension_analysis

Validates extension usage in item trees against a registry catalog.

Checks for unresolved, retired, and deprecated extensions on definition items.

`walk_items` recurses the [`ExtensionItem`] tree; [`JsonDefinitionItem`] is the JSON-backed adapter.



## Module: fel_analysis

FEL static analysis and expression rewriting for field references and variables.

Parses FEL to extract field references, variables, and function calls, and declares the
rename callbacks ([`RewriteOptions`]) that `fel_rewrite_exact` applies to authored text.

The private walker `collect_info` implements AST traversal; the public API wraps it.



## Module: fel_condition_group_lift

Lift parsed FEL into the structured condition-group shape used by Studio (`fel-condition-builder`).

Conservative: only homogeneous `and` / `or` chains and leaf patterns supported by the TS builder.



## Module: fel_rewrite_exact

Exact-text rewriting using locations from the FEL parser.

[`target`] is the one place that decides what a rename can reach: rewriting edits those
sites, and [`collect_fel_rewrite_targets`] reports exactly the names the rewrite callbacks
will be asked about (the WASM bridge turns JavaScript callbacks into a map over them).



## Module: instance_projection

Cross-Definition validation for response-backed instance projections.



## Module: instance_resolution

Delivered values and evidence shared by Response selection and candidate assembly.



## Module: json_artifacts

`serde_json::Value` projections for WASM and Python FFI (use with `json_to_python` on the Py side).

Private `*_str` helpers stringify changelog enums; `change_to_object` builds each change row.



## Module: json_util

Small JSON helpers shared across bindings.



## Module: jsonld_context

JSON-LD `@context` derivation from a Definition and an Ontology document's concept bindings.

Ontology spec §6.2: tooling generates the context from bindings; an authored `context` overrides
term by term (the lint pass diffs the two). The derivation is total — it never fails; what it
cannot honor it reports as a [`JsonLdDiagnostic`]. Rules, in Definition item order:

- The context opens with `"@version": 1.1` and the `xsd` prefix.
- A bound **field** becomes `key: { "@id": <concept>, "@type": <xsd> }` typed by `dataType`:
  `integer`, `boolean`, `date`, `dateTime`, `time`, `uri` → the matching `xsd:` type;
  `decimal` (a JSON number: an `xsd:decimal` coercion would yield an invalid lexical form) and
  `string`, `text`, `choice`, `multiChoice` → plain; `money` → a scoped node whose `amount` and
  `currency` map to `schema:value` (`xsd:decimal`) and `schema:currency`; `attachment` → omitted
  with an `unsupported-type` diagnostic. Unbound fields, display items, and unknown item types
  are omitted.
- A bound **repeatable group** becomes `key: { "@id", "@container": "@set", "@context": … }`. An
  unbound repeatable group is skipped with its children; each bound descendant is reported as
  `unbound-repeatable`.
- A bound **structural group** becomes `key: { "@id", "@context": … }`; an unbound one becomes
  `key: "@nest"` and its children hoist into the enclosing scope.
- Scoped contexts (repeatable groups, bound structural groups, money) are property-scoped, so a
  key reused across them cannot collide.
- Bindings are looked up by the `[*]` path (`items[*].amount`) first, then by the dotted path
  (`items.amount`) for documents written before the wildcard syntax.
- Within one scope a key holds one term. Same key, same definition: deduplicated. Different
  definition: the earlier term stays, the later one is omitted, and a `collision` diagnostic is
  recorded — never silently. An unbound leaf never wins a key; inside a scoped context an unbound
  child whose key is bound in an enclosing scope is set to `null`, so the leaf is not lifted
  under a term it was never bound to.

Key order relies on `serde_json`'s `preserve_order` feature (enabled workspace-wide).



## Module: option_sets

Resolve `options` from `optionSets` in a Formspec Definition.



## Module: parser_recovery

JSON parser error recovery and diagnostic repair.

Provides resilient JSON parsing that captures precise syntax diagnostics
and recovers from common authoring flaws (trailing commas, comments,
unquoted keys, single quotes, unclosed delimiters) to return valid `serde_json::Value` trees.



## Module: path_utils

Dotted path normalization and tree item navigation by path.

Paths use dot notation: `group.field`, `parent.child.leaf`.
Indices `[N]` and wildcards `[*]` are supported.



## Module: registry_client

Registry client — parses registry documents, resolves extensions, validates lifecycle.



## Module: repeat_references

Detect authored field paths that cross a repeat without a subscript.



## Module: response_migration

Apply a Definition's `migrations` (core spec §6.7) to Response data pinned to an earlier version.

`migrations.from[<version>]` names the descriptor for Responses pinned to that version: an ordered
`fieldMap` of `preserve` / `drop` / `expression` rules plus `defaults` for new fields. A source field the
map does not name is carried forward when its path (indices aside) is an item of this Definition, and
dropped when it is not. An `expression` rule evaluates FEL with `$` bound to the source field's value and
`@source` bound to the whole source data. The result is new data; the source is left as it was.

One implementation for every host: TS (`migrateResponseData`) and Python
(`apply_migrations_to_response_data`) call this through WASM / PyO3.



## Module: response_selection

Subject-keyed Response selection and exact delivered-value commitments (Core §2.1.6).



## Module: runtime_mapping

Bidirectional mapping engine for transforming data between formats.

Executes mapping rules to transform data between Formspec response format and external formats
(forward: Formspec → external, reverse: external → Formspec). Implementation is split across
`types`, `path`, `env`, `transforms`, `engine`, and `document`.



## Module: schema_validator

Schema validation with document type detection and validation dispatch.

Uses dependency inversion: JSON Schema validation is provided by the host via
[`JsonSchemaValidator`]. This module detects document types, translates paths, and
plans per-component validation for component trees.



## Module: subject_key

Typed keys for Formspec filing units.



## Module: validation_report

Assemble validation-report candidates from qualified public findings.

This pure helper assembles metadata and counts without rewriting findings.
Callers own evaluation, result tagging, clocks, Definition pins, and canonical
schema admission. An assembled candidate must pass that admission before use.



## Module: value_coerce

Inbound field coercion (parity with TS `coerceFieldValue` in `formspec-engine` helpers).



## Module: wire_keys

Centralized JSON field names for host bindings (`JsonWireStyle`).

---

## Source: formspec_core/assembler.md

**formspec_core > assembler**

# Module: assembler

## Contents

**Structs**

- [`AssemblyProvenance`](#assemblyprovenance) - Source record for one merged definition fragment (URL, version, optional key prefix).
- [`AssemblyResult`](#assemblyresult) - Output of [`assemble_definition`]: merged definition plus warnings, errors, provenance.
- [`MapResolver`](#mapresolver) - In-memory [`RefResolver`] backed by a URI → JSON map.

**Enums**

- [`AssemblyError`](#assemblyerror) - Failure while resolving `$ref` or merging assembled fragments.

**Functions**

- [`assemble_definition`](#assemble_definition) - Walk `definition["items"]`, expand `$ref` objects using `resolver`, and merge fragments.
- [`assembly_result_to_json_value`](#assembly_result_to_json_value) - Assembly output for host bindings (camelCase vs snake_case provenance keys).
- [`unassembled_definition_references`](#unassembled_definition_references) - Locate Group inclusions that still need assembly (Core §6.6.2).

**Traits**

- [`RefResolver`](#refresolver) - Resolves a `$ref` URI string to a JSON fragment.

---

## formspec_core::assembler::AssemblyError

*Enum*

Failure while resolving `$ref` or merging assembled fragments.

**Variants:**
- `CircularRef(String)` - A `$ref` cycle was detected.
- `KeyCollision{ key: String, source: String }` - Two sources contributed the same item `key`.
- `RefNotFound(String)` - `$ref` target was not found in the resolver.
- `ResolutionError(String)` - Resolver or merge failed with a message.

**Traits:** Error

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> AssemblyError`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Display**
  - `fn fmt(self: &Self, f: & mut std::fmt::Formatter) -> std::fmt::Result`



## formspec_core::assembler::AssemblyProvenance

*Struct*

Source record for one merged definition fragment (URL, version, optional key prefix).

**Fields:**
- `url: String` - Source document URL or identifier.
- `version: String` - Version string from the source document.
- `key_prefix: Option<String>` - Optional key prefix applied when merging items from this fragment.
- `fragment: Option<String>` - Optional JSON Pointer–style fragment path within the resolved document.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> AssemblyProvenance`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &AssemblyProvenance) -> bool`



## formspec_core::assembler::AssemblyResult

*Struct*

Output of [`assemble_definition`]: merged definition plus warnings, errors, provenance.

**Fields:**
- `definition: serde_json::Value` - Assembled definition JSON (typically includes merged `items`).
- `warnings: Vec<String>` - Non-fatal issues (e.g. skipped optional refs).
- `errors: Vec<AssemblyError>` - Fatal assembly problems.
- `assembled_from: Vec<AssemblyProvenance>` - Ordered list of fragments that contributed to the result.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> AssemblyResult`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::assembler::MapResolver

*Struct*

In-memory [`RefResolver`] backed by a URI → JSON map.

**Methods:**

- `fn new() -> Self` - Empty resolver.
- `fn add(self: & mut Self, uri: &str, fragment: Value)` - Insert or replace a resolved fragment for `uri`.
- `fn merge_from_json_object(self: & mut Self, fragments: &Value)` - Load URI → fragment entries from a JSON object (non-objects yield no inserts).

**Trait Implementations:**

- **Default**
  - `fn default() -> Self`
- **RefResolver**
  - `fn resolve(self: &Self, ref_uri: &str) -> Option<Value>`



## formspec_core::assembler::RefResolver

*Trait*

Resolves a `$ref` URI string to a JSON fragment.

**Methods:**

- `resolve`: Return the resolved JSON value, or `None` if unknown.



## formspec_core::assembler::assemble_definition

*Function*

Walk `definition["items"]`, expand `$ref` objects using `resolver`, and merge fragments.

Item keys are rewritten when fragments supply `keyPrefix`. FEL in binds and message
templates is rewritten to match merged keys (see `rewrite_fel_source_references`).

```rust
fn assemble_definition(definition: &serde_json::Value, resolver: &dyn RefResolver) -> AssemblyResult
```



## formspec_core::assembler::assembly_result_to_json_value

*Function*

Assembly output for host bindings (camelCase vs snake_case provenance keys).

```rust
fn assembly_result_to_json_value(result: &AssemblyResult, style: crate::JsonWireStyle) -> serde_json::Value
```



## formspec_core::assembler::unassembled_definition_references

*Function*

Locate Group inclusions that still need assembly (Core §6.6.2).

Each pair contains the authored `$ref` JSONPath and its diagnostic message.

```rust
fn unassembled_definition_references<V>(definition: &V) -> Vec<(String, String)>
```

---

## Source: formspec_core/assembly_fel_rewrite.md

**formspec_core > assembly_fel_rewrite**

# Module: assembly_fel_rewrite

## Contents

**Structs**

- [`AssemblyFelRewriteMap`](#assemblyfelrewritemap) - Maps fragment item keys to host paths during `$ref` assembly (see TS `RewriteMap`).

**Functions**

- [`assembly_fel_rewrite_map_from_value`](#assembly_fel_rewrite_map_from_value) - Parse a JSON object into [`AssemblyFelRewriteMap`] (camelCase keys only).
- [`rewrite_fel_for_assembly`](#rewrite_fel_for_assembly) - Rewrite a FEL expression using assembly fragment/host key rules (TS `rewriteFEL`).
- [`rewrite_message_template_for_assembly`](#rewrite_message_template_for_assembly) - Rewrite `{{...}}` FEL segments in a message using the same assembly map.

---

## formspec_core::assembly_fel_rewrite::AssemblyFelRewriteMap

*Struct*

Maps fragment item keys to host paths during `$ref` assembly (see TS `RewriteMap`).

**Fields:**
- `fragment_root_key: String` - Selected fragment root item key, or empty when the whole definition is imported.
- `host_group_key: String` - Host group key that replaces the fragment root in `$` field references.
- `imported_keys: std::collections::HashSet<String>` - All item keys in the imported subtree (for `keyPrefix` decisions).
- `key_prefix: String` - Prefix applied to imported keys (e.g. `proj_`).

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> AssemblyFelRewriteMap`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::assembly_fel_rewrite::assembly_fel_rewrite_map_from_value

*Function*

Parse a JSON object into [`AssemblyFelRewriteMap`] (camelCase keys only).

```rust
fn assembly_fel_rewrite_map_from_value(v: &serde_json::Value) -> Result<AssemblyFelRewriteMap, String>
```



## formspec_core::assembly_fel_rewrite::rewrite_fel_for_assembly

*Function*

Rewrite a FEL expression using assembly fragment/host key rules (TS `rewriteFEL`).

```rust
fn rewrite_fel_for_assembly(expression: &str, map: &AssemblyFelRewriteMap) -> String
```



## formspec_core::assembly_fel_rewrite::rewrite_message_template_for_assembly

*Function*

Rewrite `{{...}}` FEL segments in a message using the same assembly map.

```rust
fn rewrite_message_template_for_assembly(message: &str, map: &AssemblyFelRewriteMap) -> String
```

---

## Source: formspec_core/bind_targets.md

**formspec_core > bind_targets**

# Module: bind_targets

## Contents

**Structs**

- [`BindTargets`](#bindtargets) - Bind entries by target Item path, each list in document order.

**Type Aliases**

- [`BindEntry`](#bindentry) - One Bind entry: its `path` spelling and its properties.

---

## formspec_core::bind_targets::BindEntry

*Type Alias*: `(&'a str, &'a V)`

One Bind entry: its `path` spelling and its properties.



## formspec_core::bind_targets::BindTargets

*Struct*

Bind entries by target Item path, each list in document order.

Core §4.3.3: a `[*]` path targets the Item whose path is the Bind path with every
`[*]` removed, so `jobs[*].hours` and `jobs.hours` share one list. Array-style and
object-style `binds` are both read; object keys keep document order.

**Generic Parameters:**
- 'a
- V

**Methods:**

- `fn new(binds: Option<&'a V>) -> Self` - Group the Definition's `binds` value by target Item path.
- `fn entries(self: &Self, item_path: &str) -> &[BindEntry<'a, V>]` - Entries targeting the Item at `item_path`, in document order.
- `fn merged(self: &Self, item_path: &str) -> <V as >::Object` - The effective Bind: properties merged in document order, later values winning.
- `fn winning_path(self: &Self, item_path: &str, property: &str) -> Option<&'a str>` - The `path` spelling of the entry whose `property` wins for `item_path`.

---

## Source: formspec_core/changelog.md

**formspec_core > changelog**

# Module: changelog

## Contents

**Structs**

- [`Change`](#change) - A single atomic change between two definition versions.
- [`Changelog`](#changelog) - Structured diff between two definition versions.

**Enums**

- [`ChangeImpact`](#changeimpact) - Severity classification of a single change.
- [`ChangeTarget`](#changetarget) - Definition subsystem affected by a change.
- [`ChangeType`](#changetype) - Kind of change between two definition versions.
- [`SemverImpact`](#semverimpact) - Semantic version bump implied by the aggregate impact.

**Functions**

- [`generate_changelog`](#generate_changelog) - Diff two Formspec definition JSON documents and produce a changelog.
- [`generate_screener_changelog`](#generate_screener_changelog) - Diff two standalone Screener Documents and produce a changelog.

---

## formspec_core::changelog::Change

*Struct*

A single atomic change between two definition versions.

**Fields:**
- `change_type: ChangeType` - Type of atomic change (added, removed, modified).
- `target: ChangeTarget` - Target subsystem within the definition.
- `path: String` - JSON Pointer or logical path to the affected element.
- `impact: ChangeImpact` - Severity classification of this change.
- `key: Option<String>` - Property key or identifier affected within the target element.
- `description: Option<String>` - Human-readable description of the change.
- `before: Option<serde_json::Value>` - Previous value before the change (if any).
- `after: Option<serde_json::Value>` - New value after the change (if any).
- `migration_hint: Option<String>` - Migration recommendation or hint for downstream consumers.



## formspec_core::changelog::ChangeImpact

*Enum*

Severity classification of a single change.

**Variants:**
- `Cosmetic` - Presentational change that does not affect semantics or validation.
- `Compatible` - Additive or non-breaking semantic change.
- `Breaking` - Breaking semantic change requiring downstream attention or data migration.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ChangeImpact`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Ord**
  - `fn cmp(self: &Self, other: &ChangeImpact) -> $crate::cmp::Ordering`
- **PartialEq**
  - `fn eq(self: &Self, other: &ChangeImpact) -> bool`
- **PartialOrd**
  - `fn partial_cmp(self: &Self, other: &ChangeImpact) -> $crate::option::Option<$crate::cmp::Ordering>`



## formspec_core::changelog::ChangeTarget

*Enum*

Definition subsystem affected by a change.

**Variants:**
- `Item` - An item (field, group, etc.) was affected.
- `Bind` - A bind expression or property was affected.
- `Shape` - A validation shape was affected.
- `OptionSet` - An option set was affected.
- `DataSource` - A data source declaration was affected.
- `Screener` - A screener rule was affected.
- `Migration` - A data migration rule was affected.
- `Metadata` - Form metadata was affected.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ChangeTarget`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Ord**
  - `fn cmp(self: &Self, other: &ChangeTarget) -> $crate::cmp::Ordering`
- **PartialEq**
  - `fn eq(self: &Self, other: &ChangeTarget) -> bool`
- **PartialOrd**
  - `fn partial_cmp(self: &Self, other: &ChangeTarget) -> $crate::option::Option<$crate::cmp::Ordering>`



## formspec_core::changelog::ChangeType

*Enum*

Kind of change between two definition versions.

**Variants:**
- `Added` - An element was added in the target version.
- `Removed` - An element was removed in the target version.
- `Modified` - An element was modified between versions.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ChangeType`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &ChangeType) -> bool`



## formspec_core::changelog::Changelog

*Struct*

Structured diff between two definition versions.

**Fields:**
- `definition_url: String` - Canonical URL of the definition that was compared.
- `from_version: String` - Base version string being migrated from.
- `to_version: String` - Target version string being migrated to.
- `semver_impact: SemverImpact` - Recommended semantic version increment based on aggregate impact.
- `changes: Vec<Change>` - Ordered list of atomic changes.



## formspec_core::changelog::SemverImpact

*Enum*

Semantic version bump implied by the aggregate impact.

**Variants:**
- `Patch` - Backward-compatible bug fixes or cosmetic adjustments.
- `Minor` - Backward-compatible new functionality or additions.
- `Major` - Incompatible API, schema, or semantic changes.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SemverImpact`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &SemverImpact) -> bool`



## formspec_core::changelog::generate_changelog

*Function*

Diff two Formspec definition JSON documents and produce a changelog.

Walks items, binds, shapes, optionSets, dataSources, screener, migrations,
and metadata sections. Each difference produces a `Change` with an impact
classification. The aggregate `semver_impact` is the maximum across all changes.

```rust
fn generate_changelog(old_def: &serde_json::Value, new_def: &serde_json::Value, definition_url: &str) -> Changelog
```



## formspec_core::changelog::generate_screener_changelog

*Function*

Diff two standalone Screener Documents and produce a changelog.

Walks items, binds, evaluation phases, routes, availability, and metadata.

```rust
fn generate_screener_changelog(old_doc: &serde_json::Value, new_doc: &serde_json::Value, screener_url: &str) -> Changelog
```

---

## Source: formspec_core/compatible_versions.md

**formspec_core > compatible_versions**

# Module: compatible_versions

## Contents

**Functions**

- [`compatible_version_satisfied`](#compatible_version_satisfied) - Reports whether a Definition version satisfies a range, including prereleases.

---

## formspec_core::compatible_versions::compatible_version_satisfied

*Function*

Reports whether a Definition version satisfies a range, including prereleases.

Returns `None` if the range or version cannot be parsed.

# Examples

```
use formspec_core::compatible_version_satisfied;

assert_eq!(compatible_version_satisfied(">=1.0.0 <2.0.0", "2.0.0-rc.1"), Some(true));
assert_eq!(compatible_version_satisfied(">=1.0.0 <2.0.0", "2.0.0"), Some(false));
assert_eq!(compatible_version_satisfied("*", "1.0"), None);
```

```rust
fn compatible_version_satisfied(range: &str, version: &str) -> Option<bool>
```

---

## Source: formspec_core/component_tree.md

**formspec_core > component_tree**

# Module: component_tree

## Contents

**Functions**

- [`visit_component_subtree`](#visit_component_subtree) - Visit each object node that has a string `component` field, then recurse into `children`.

---

## formspec_core::component_tree::visit_component_subtree

*Function*

Visit each object node that has a string `component` field, then recurse into `children`.

`child_path(parent, index)` selects JSON Pointer (`/tree/children/0`) vs JSONPath-style
(`$.tree.children[0]`) paths for diagnostics.

```rust
fn visit_component_subtree<F, impl FnMut(&Value, &str)>(node: &serde_json::Value, path: &str, child_path: &F, visit: & mut impl Trait)
```

---

## Source: formspec_core/definition_expressions.md

**formspec_core > definition_expressions**

# Module: definition_expressions

## Contents

**Enums**

- [`BindProperty`](#bindproperty) - A Bind property that holds a FEL expression.
- [`ExpressionSite`](#expressionsite) - Location and role of an authored FEL expression.
- [`ShapeMember`](#shapemember) - A composition member resolved according to Core §5.2.2.

**Functions**

- [`shape_members`](#shape_members) - Resolve composition members as Shape ids first, otherwise inline FEL.
- [`visit_bind_expressions`](#visit_bind_expressions) - Visit authored Bind expressions in a Definition or standalone Screener.
- [`visit_binds`](#visit_binds) - Visit Bind objects in either supported syntax with their target and JSONPath.
- [`visit_expressions`](#visit_expressions) - Visit every Bind, Shape, and variable expression with its authored JSONPath.
- [`visit_initial_value_expressions`](#visit_initial_value_expressions) - Visit Item creation expressions with their Item paths and authored JSONPaths.
- [`visit_template_expressions`](#visit_template_expressions) - Visit each FEL interpolation in Definition text slots with its JSONPath.

---

## formspec_core::definition_expressions::BindProperty

*Enum*

A Bind property that holds a FEL expression.

Core §3.6.1 defines which Bind properties write the targeted Item's value.

**Variants:**
- `Calculate` - `calculate`: computes the Item's value.
- `Relevant` - `relevant`: decides whether the Item is relevant.
- `Required` - `required`: decides whether the Item needs an answer.
- `Readonly` - `readonly`: decides whether the Item can be edited.
- `Constraint` - `constraint`: validates the Item's value.
- `Default` - `default` written as `=expr`: the value restored when the Item becomes relevant again.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> BindProperty`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **Ord**
  - `fn cmp(self: &Self, other: &BindProperty) -> $crate::cmp::Ordering`
- **PartialEq**
  - `fn eq(self: &Self, other: &BindProperty) -> bool`
- **PartialOrd**
  - `fn partial_cmp(self: &Self, other: &BindProperty) -> $crate::option::Option<$crate::cmp::Ordering>`



## formspec_core::definition_expressions::ExpressionSite

*Enum*

Location and role of an authored FEL expression.

**Generic Parameters:**
- 'a

**Variants:**
- `Bind(&'a str, BindProperty)` - An expression-bearing Bind property.
- `Shape(usize, Option<&'a str>)` - A Shape expression that decides validity.
- `ShapeContext(Option<&'a str>)` - A Shape context value.
- `Variable(Option<&'a str>, &'a str)` - A Definition variable. The name can be missing on an invalid declaration.

**Methods:**

- `fn target(self: Self) -> Option<&'a str>` - The Item path or variable scope used to resolve field references.

**Traits:** Copy

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ExpressionSite<'a>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::definition_expressions::ShapeMember

*Enum*

A composition member resolved according to Core §5.2.2.

**Generic Parameters:**
- 'a

**Variants:**
- `Reference(usize)` - Index of the declared Shape.
- `Expression{ operator: &'static str, index: Option<usize>, source: &'a str }` - An inline expression in a composition.



## formspec_core::definition_expressions::shape_members

*Function*

Resolve composition members as Shape ids first, otherwise inline FEL.

```rust
fn shape_members<'a, V>(shape: &'a V, ids: &'a std::collections::HashMap<&'a str, usize>) -> impl Trait
```



## formspec_core::definition_expressions::visit_bind_expressions

*Function*

Visit authored Bind expressions in a Definition or standalone Screener.

```rust
fn visit_bind_expressions<V, impl FnMut(&str, String, ExpressionSite<'_>)>(document: &V, visit: impl Trait)
```



## formspec_core::definition_expressions::visit_binds

*Function*

Visit Bind objects in either supported syntax with their target and JSONPath.

```rust
fn visit_binds<V, impl FnMut(&V, &str, String)>(document: &V, visit: impl Trait)
```



## formspec_core::definition_expressions::visit_expressions

*Function*

Visit every Bind, Shape, and variable expression with its authored JSONPath.

```rust
fn visit_expressions<V, impl FnMut(&str, String, ExpressionSite<'_>)>(definition: &V, visit: impl Trait)
```



## formspec_core::definition_expressions::visit_initial_value_expressions

*Function*

Visit Item creation expressions with their Item paths and authored JSONPaths.

A string starting with `=` supplies FEL source. Literal initial values are skipped.

```rust
fn visit_initial_value_expressions<V, impl FnMut(&str, &str, &str)>(definition: &V, visit: impl Trait)
```



## formspec_core::definition_expressions::visit_template_expressions

*Function*

Visit each FEL interpolation in Definition text slots with its JSONPath.

```rust
fn visit_template_expressions<V, impl FnMut(&str, Option<&str>, &str)>(document: &V, visit: impl Trait)
```

---

## Source: formspec_core/definition_items.md

**formspec_core > definition_items**

# Module: definition_items

## Contents

**Structs**

- [`DefinitionItemVisitCtx`](#definitionitemvisitctx) - One definition item with canonical paths for diagnostics and binds.

**Enums**

- [`DefinitionItemKeyPolicy`](#definitionitemkeypolicy) - How to interpret `item["key"]` when walking definition `items` / `children`.

**Functions**

- [`coerce_definition_item_key_segment`](#coerce_definition_item_key_segment) - Key segment for runtime item-tree rebuild: missing or non-string `key` → `""`.
- [`definition_item_dotted_path`](#definition_item_dotted_path) - Dotted bind path from an optional parent prefix and this node's key segment (may be `""`).
- [`definition_item_key_segment`](#definition_item_key_segment) - Resolve the key segment for `item` under `policy`.
- [`extension_item_diagnostic_path_from_dotted`](#extension_item_diagnostic_path_from_dotted) - Map a bind-style dotted item path to the extensions-pass diagnostic prefix.
- [`visit_definition_items_from_document`](#visit_definition_items_from_document) - Walk `document["items"]` when present; no-op if missing or not an array.
- [`visit_definition_items_json`](#visit_definition_items_json) - Visit every object with a string `key` under `items`, depth-first ([`DefinitionItemKeyPolicy::RequireStringKey`]).
- [`visit_definition_items_json_shallow`](#visit_definition_items_json_shallow) - Visit each element of a definition `items` or `children` array **once** (no recursion).
- [`visit_definition_items_json_with_policy`](#visit_definition_items_json_with_policy) - Visit definition items under a JSON array with an explicit key policy.

---

## formspec_core::definition_items::DefinitionItemKeyPolicy

*Enum*

How to interpret `item["key"]` when walking definition `items` / `children`.

**Variants:**
- `RequireStringKey` - Only visit objects whose `key` is a JSON string (including `""`).
- `CoerceNonStringKeyToEmpty` - Missing or non-string `key` is treated as `""`.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> DefinitionItemKeyPolicy`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &DefinitionItemKeyPolicy) -> bool`



## formspec_core::definition_items::DefinitionItemVisitCtx

*Struct*

One definition item with canonical paths for diagnostics and binds.

**Generic Parameters:**
- 'a
- V

**Fields:**
- `item: &'a V` - Raw JSON object for this definition item.
- `key: &'a str` - Resolved key segment (may be `""` when policy coerces).
- `index: usize` - Index of this node within its parent's `items` or `children` array.
- `json_path: String` - JSONPath-style location, e.g. `$.items[0]` or `$.items[0].children[1]`.
- `dotted_path: String` - Dotted field path (`name`, `address.street`).
- `parent_dotted: Option<String>` - Parent dotted path; `None` for top-level items under `document.items`.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> DefinitionItemVisitCtx<'a, V>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::definition_items::coerce_definition_item_key_segment

*Function*

Key segment for runtime item-tree rebuild: missing or non-string `key` → `""`.

```rust
fn coerce_definition_item_key_segment<V>(item: &V) -> &str
```



## formspec_core::definition_items::definition_item_dotted_path

*Function*

Dotted bind path from an optional parent prefix and this node's key segment (may be `""`).

```rust
fn definition_item_dotted_path(parent_dotted: Option<&str>, key_segment: &str) -> String
```



## formspec_core::definition_items::definition_item_key_segment

*Function*

Resolve the key segment for `item` under `policy`.

Returns `None` only for [`DefinitionItemKeyPolicy::RequireStringKey`] when `key` is not a JSON
string.

```rust
fn definition_item_key_segment<V>(item: &V, policy: DefinitionItemKeyPolicy) -> Option<&str>
```



## formspec_core::definition_items::extension_item_diagnostic_path_from_dotted

*Function*

Map a bind-style dotted item path to the extensions-pass diagnostic prefix.

The lint extensions pass reports locations like `$.items[key=rootKey].nestedKey` (key-stable,
not `$.items[0]`). That string is derived from the same dotted paths as
[`visit_definition_items_json`] / [`DefinitionItemVisitCtx::dotted_path`]: the first segment is
wrapped as `$.items[key=…]`; further segments are appended with dots.

```rust
fn extension_item_diagnostic_path_from_dotted(dotted: &str) -> String
```



## formspec_core::definition_items::visit_definition_items_from_document

*Function*

Walk `document["items"]` when present; no-op if missing or not an array.

```rust
fn visit_definition_items_from_document<V, impl FnMut(&DefinitionItemVisitCtx<'_, V>)>(document: &V, visitor: & mut impl Trait)
```



## formspec_core::definition_items::visit_definition_items_json

*Function*

Visit every object with a string `key` under `items`, depth-first ([`DefinitionItemKeyPolicy::RequireStringKey`]).

```rust
fn visit_definition_items_json<V, impl FnMut(&DefinitionItemVisitCtx<'_, V>)>(items: &[V], json_array_parent: &str, parent_dotted: Option<&str>, visitor: & mut impl Trait)
```



## formspec_core::definition_items::visit_definition_items_json_shallow

*Function*

Visit each element of a definition `items` or `children` array **once** (no recursion).

For each index `i`, builds the same [`DefinitionItemVisitCtx`] as the depth-first visitor:
`json_path` is `{json_array_parent}[{i}]`, `dotted_path` from [`definition_item_dotted_path`].

Used by `formspec-eval` to rebuild the eval `ItemInfo` tree: recurse by walking
`ctx.item["children"]` and calling this again with `json_array_parent =
format!("{}.children", ctx.json_path)`.

```rust
fn visit_definition_items_json_shallow<V, impl FnMut(&DefinitionItemVisitCtx<'_, V>)>(items: &[V], json_array_parent: &str, parent_dotted: Option<&str>, policy: DefinitionItemKeyPolicy, visitor: & mut impl Trait)
```



## formspec_core::definition_items::visit_definition_items_json_with_policy

*Function*

Visit definition items under a JSON array with an explicit key policy.

`json_array_parent` is the path to the **array** (no `[i]` suffix), e.g. `$.items` or
`$.items[0].children`.

```rust
fn visit_definition_items_json_with_policy<V, impl FnMut(&DefinitionItemVisitCtx<'_, V>)>(items: &[V], json_array_parent: &str, parent_dotted: Option<&str>, policy: DefinitionItemKeyPolicy, visitor: & mut impl Trait)
```

---

## Source: formspec_core/extension_analysis.md

**formspec_core > extension_analysis**

# Module: extension_analysis

## Contents

**Structs**

- [`ExtensionUsageIssue`](#extensionusageissue) - A single extension usage validation issue.
- [`JsonDefinitionItem`](#jsondefinitionitem) - Definition item node parsed from JSON (`key`, `children`, `extensions`, top-level `x-*` flags).
- [`MapRegistry`](#mapregistry) - Simple HashMap-based registry for testing.
- [`RegistryEntryInfo`](#registryentryinfo) - Minimal registry entry info needed for extension validation.

**Enums**

- [`ExtensionErrorCode`](#extensionerrorcode) - Error codes for extension validation.
- [`ExtensionSeverity`](#extensionseverity) - Severity levels for extension validation issues.
- [`RegistryEntryStatus`](#registryentrystatus) - Lifecycle status of a registry entry.

**Functions**

- [`json_definition_items_tree_from_value`](#json_definition_items_tree_from_value) - Parse a JSON value as a root `items` array for extension validation.
- [`map_registry_from_extension_entry_map`](#map_registry_from_extension_entry_map) - Build a [`MapRegistry`] from a JSON object mapping extension name → partial entry objects
- [`validate_extension_usage`](#validate_extension_usage) - Validate extension usage in an item tree against a registry.

**Traits**

- [`ExtensionItem`](#extensionitem) - Minimal item interface for extension validation.
- [`RegistryLookup`](#registrylookup) - Callback trait for looking up registry entries.

---

## formspec_core::extension_analysis::ExtensionErrorCode

*Enum*

Error codes for extension validation.

**Variants:**
- `UnresolvedExtension`
- `ExtensionRetired`
- `ExtensionDeprecated`

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str` - Uppercase wire token for JSON (`UNRESOLVED_EXTENSION`, etc.).

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ExtensionErrorCode`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &ExtensionErrorCode) -> bool`



## formspec_core::extension_analysis::ExtensionItem

*Trait*

Minimal item interface for extension validation.

**Methods:**

- `key`: The item's key.
- `declared_extensions`: Extensions declared on this item (extension name → enabled).
- `children`: Child items.



## formspec_core::extension_analysis::ExtensionSeverity

*Enum*

Severity levels for extension validation issues.

**Variants:**
- `Error`
- `Warning`
- `Info`

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str` - Wire string for JSON output (`error` / `warning` / `info`).

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ExtensionSeverity`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &ExtensionSeverity) -> bool`



## formspec_core::extension_analysis::ExtensionUsageIssue

*Struct*

A single extension usage validation issue.

**Fields:**
- `path: String` - Dotted path to the item declaring the extension.
- `extension: String` - The extension name (e.g., "x-formspec-url").
- `severity: ExtensionSeverity` - Severity level.
- `code: ExtensionErrorCode` - Error code for programmatic handling.
- `message: String` - Human-readable message.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ExtensionUsageIssue`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::extension_analysis::JsonDefinitionItem

*Struct*

Definition item node parsed from JSON (`key`, `children`, `extensions`, top-level `x-*` flags).

**Methods:**

- `fn from_json(value: &Value) -> Option<Self>` - Parse a single item object; returns `None` if `key` is missing or not a string.
- `fn tree_from_items_json(items: &[Value]) -> Vec<JsonDefinitionItem>` - Parse a root items array (definition `items` tree).

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **ExtensionItem**
  - `fn key(self: &Self) -> &str`
  - `fn declared_extensions(self: &Self) -> Vec<String>`
  - `fn children(self: &Self) -> &[Self]`



## formspec_core::extension_analysis::MapRegistry

*Struct*

Simple HashMap-based registry for testing.

**Methods:**

- `fn new() -> Self` - Empty registry.
- `fn add(self: & mut Self, entry: RegistryEntryInfo)` - Insert or replace an entry keyed by [`RegistryEntryInfo::name`].

**Trait Implementations:**

- **Default**
  - `fn default() -> Self`
- **RegistryLookup**
  - `fn lookup(self: &Self, extension_name: &str) -> Option<RegistryEntryInfo>`



## formspec_core::extension_analysis::RegistryEntryInfo

*Struct*

Minimal registry entry info needed for extension validation.

**Fields:**
- `name: String` - Extension name (e.g. `x-formspec-url`).
- `status: RegistryEntryStatus` - Lifecycle state from the registry document.
- `display_name: Option<String>` - Optional human-readable title from the registry.
- `deprecation_notice: Option<String>` - Optional deprecation message when status is deprecated.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> RegistryEntryInfo`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::extension_analysis::RegistryEntryStatus

*Enum*

Lifecycle status of a registry entry.

**Variants:**
- `Draft`
- `Active`
- `Deprecated`
- `Retired`

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> RegistryEntryStatus`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &RegistryEntryStatus) -> bool`



## formspec_core::extension_analysis::RegistryLookup

*Trait*

Callback trait for looking up registry entries.

**Methods:**

- `lookup`: Return registry metadata for `extension_name`, or `None` if unknown.



## formspec_core::extension_analysis::json_definition_items_tree_from_value

*Function*

Parse a JSON value as a root `items` array for extension validation.

```rust
fn json_definition_items_tree_from_value(val: &serde_json::Value) -> Result<Vec<JsonDefinitionItem>, String>
```



## formspec_core::extension_analysis::map_registry_from_extension_entry_map

*Function*

Build a [`MapRegistry`] from a JSON object mapping extension name → partial entry objects
(`status`, `displayName`, `deprecationNotice`, …) as produced by WASM callers.

```rust
fn map_registry_from_extension_entry_map(entries: &std::collections::HashMap<String, serde_json::Value>) -> MapRegistry
```



## formspec_core::extension_analysis::validate_extension_usage

*Function*

Validate extension usage in an item tree against a registry.

```rust
fn validate_extension_usage<I>(items: &[I], registry: &dyn RegistryLookup) -> Vec<ExtensionUsageIssue>
```

---

## Source: formspec_core/fel_analysis.md

**formspec_core > fel_analysis**

# Module: fel_analysis

## Contents

**Structs**

- [`FelAnalysis`](#felanalysis) - Result of statically analyzing a FEL expression.
- [`FelAnalysisError`](#felanalysiserror) - A parse/analysis error with a human-readable message.
- [`FelAnalysisWarning`](#felanalysiswarning) - A non-fatal analysis warning.
- [`FelRewriteTargets`](#felrewritetargets) - Field/variable/navigation targets that can be rewritten in a FEL expression.
- [`NavigationTarget`](#navigationtarget) - A literal navigation target passed to `prev` / `next` / `parent`.
- [`RewriteOptions`](#rewriteoptions) - Options for rewriting references in a FEL expression.

**Functions**

- [`analyze_fel`](#analyze_fel) - Analyze a FEL expression string, extracting structural information.
- [`analyze_fel_with_field_types`](#analyze_fel_with_field_types) - Analyze a FEL expression with field data type context for type-aware warnings.
- [`fel_analysis_to_json_value`](#fel_analysis_to_json_value) - Static analysis result as JSON (`valid`, `errors`, `warnings`, `references`, `variables`, `functions`).
- [`fel_rewrite_targets_to_json_value`](#fel_rewrite_targets_to_json_value) - [`FelRewriteTargets`] as sorted JSON (camelCase keys) for `collectFelRewriteTargets`.
- [`get_fel_dependencies`](#get_fel_dependencies) - Extract field dependencies from an expression (safe on parse failure).
- [`rewrite_options_from_camel_case_json`](#rewrite_options_from_camel_case_json) - Build [`RewriteOptions`] from the camelCase JSON map used by `rewriteFelReferences` / `rewriteMessageTemplate`.

---

## formspec_core::fel_analysis::FelAnalysis

*Struct*

Result of statically analyzing a FEL expression.

**Fields:**
- `valid: bool` - Whether the expression parsed successfully.
- `errors: Vec<FelAnalysisError>` - Parse errors, if any.
- `warnings: Vec<FelAnalysisWarning>` - Non-fatal warnings (arity mismatches, etc.).
- `references: std::collections::HashSet<String>` - Field path references (e.g., `$name`, `$address.city`).
- `variables: std::collections::HashSet<String>` - Variable references via `@name` (excluding reserved: current, index, count, instance).
- `functions: std::collections::HashSet<String>` - Function names called in the expression.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> FelAnalysis`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::fel_analysis::FelAnalysisError

*Struct*

A parse/analysis error with a human-readable message.

**Fields:**
- `message: String` - Error text from the FEL parser or evaluator.
- `span: Option<std::ops::Range<usize>>` - Unicode scalar (char) index range in the expression when the parser reported a span.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> FelAnalysisError`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::fel_analysis::FelAnalysisWarning

*Struct*

A non-fatal analysis warning.

**Fields:**
- `message: String` - Warning text.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> FelAnalysisWarning`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::fel_analysis::FelRewriteTargets

*Struct*

Field/variable/navigation targets that can be rewritten in a FEL expression.

**Fields:**
- `field_paths: std::collections::HashSet<String>`
- `current_paths: std::collections::HashSet<String>`
- `variables: std::collections::HashSet<String>`
- `instance_names: std::collections::HashSet<String>`
- `navigation_targets: Vec<NavigationTarget>`

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> FelRewriteTargets`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Default**
  - `fn default() -> FelRewriteTargets`



## formspec_core::fel_analysis::NavigationTarget

*Struct*

A literal navigation target passed to `prev` / `next` / `parent`.

**Fields:**
- `function_name: String`
- `name: String`

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> NavigationTarget`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **PartialEq**
  - `fn eq(self: &Self, other: &NavigationTarget) -> bool`



## formspec_core::fel_analysis::RewriteOptions

*Struct*

Options for rewriting references in a FEL expression.

Each callback receives the current value and returns the replacement.
Return `None` to keep the original.

**Fields:**
- `rewrite_field_path: Option<Box<dyn Fn>>` - Rewrite `$field.path` references.
- `rewrite_current_path: Option<Box<dyn Fn>>` - Rewrite the dotted tail of `@current.foo.bar`.
- `rewrite_variable: Option<Box<dyn Fn>>` - Rewrite `@variable` names.
- `rewrite_instance_name: Option<Box<dyn Fn>>` - Rewrite `@instance('name')` names.
- `rewrite_navigation_target: Option<Box<dyn Fn>>` - Rewrite literal field-name arguments to prev()/next()/parent().



## formspec_core::fel_analysis::analyze_fel

*Function*

Analyze a FEL expression string, extracting structural information.

```rust
fn analyze_fel(expression: &str) -> FelAnalysis
```



## formspec_core::fel_analysis::analyze_fel_with_field_types

*Function*

Analyze a FEL expression with field data type context for type-aware warnings.

`field_types` maps field path (e.g. "revenue") to data type (e.g. "money").
Produces the same output as [`analyze_fel`] plus additional warnings for
type-mismatched comparisons (money vs number, date vs string) and
type-mismatched function arguments.

```rust
fn analyze_fel_with_field_types(expression: &str, field_types: &std::collections::HashMap<String, String>) -> FelAnalysis
```



## formspec_core::fel_analysis::fel_analysis_to_json_value

*Function*

Static analysis result as JSON (`valid`, `errors`, `warnings`, `references`, `variables`, `functions`).

Each `errors` element is `{"message": string, "span": object | null}` with `start`/`end` character (Unicode scalar) offsets when known.

```rust
fn fel_analysis_to_json_value(result: &FelAnalysis) -> serde_json::Value
```



## formspec_core::fel_analysis::fel_rewrite_targets_to_json_value

*Function*

[`FelRewriteTargets`] as sorted JSON (camelCase keys) for `collectFelRewriteTargets`.

```rust
fn fel_rewrite_targets_to_json_value(targets: &FelRewriteTargets) -> serde_json::Value
```



## formspec_core::fel_analysis::get_fel_dependencies

*Function*

Extract field dependencies from an expression (safe on parse failure).

```rust
fn get_fel_dependencies(expression: &str) -> std::collections::HashSet<String>
```



## formspec_core::fel_analysis::rewrite_options_from_camel_case_json

*Function*

Build [`RewriteOptions`] from the camelCase JSON map used by `rewriteFelReferences` / `rewriteMessageTemplate`.

```rust
fn rewrite_options_from_camel_case_json(rewrites: &serde_json::Value) -> RewriteOptions
```

---

## Source: formspec_core/fel_condition_group_lift.md

**formspec_core > fel_condition_group_lift**

# Module: fel_condition_group_lift

## Contents

**Functions**

- [`try_lift_condition_group`](#try_lift_condition_group) - JSON result for [`try_lift_condition_group`]: `lifted` with `logic` + `conditions`, or `unlifted`.

---

## formspec_core::fel_condition_group_lift::try_lift_condition_group

*Function*

JSON result for [`try_lift_condition_group`]: `lifted` with `logic` + `conditions`, or `unlifted`.

```rust
fn try_lift_condition_group(expression: &str) -> serde_json::Value
```

---

## Source: formspec_core/fel_rewrite_exact.md

**formspec_core > fel_rewrite_exact**

# Module: fel_rewrite_exact

## Contents

**Functions**

- [`collect_fel_rewrite_targets`](#collect_fel_rewrite_targets) - Collect every rewriteable target referenced by a FEL expression (empty when it does not parse).
- [`rewrite_fel_source_references`](#rewrite_fel_source_references) - Rewrite reference spans, preserving other source text and returning invalid input verbatim.
- [`rewrite_message_template`](#rewrite_message_template) - Rewrite each `{{ ... }}` FEL substring in a message template via [`rewrite_fel_source_references`].

---

## formspec_core::fel_rewrite_exact::collect_fel_rewrite_targets

*Function*

Collect every rewriteable target referenced by a FEL expression (empty when it does not parse).

```rust
fn collect_fel_rewrite_targets(expression: &str) -> crate::fel_analysis::FelRewriteTargets
```



## formspec_core::fel_rewrite_exact::rewrite_fel_source_references

*Function*

Rewrite reference spans, preserving other source text and returning invalid input verbatim.

```rust
fn rewrite_fel_source_references(expression: &str, options: &crate::fel_analysis::RewriteOptions) -> String
```



## formspec_core::fel_rewrite_exact::rewrite_message_template

*Function*

Rewrite each `{{ ... }}` FEL substring in a message template via [`rewrite_fel_source_references`].

```rust
fn rewrite_message_template(message: &str, options: &crate::fel_analysis::RewriteOptions) -> String
```

---

## Source: formspec_core/instance_projection.md

**formspec_core > instance_projection**

# Module: instance_projection

## Contents

**Structs**

- [`InstanceProjectionDiagnostic`](#instanceprojectiondiagnostic) - One error in a response instance's projection or subject predicates.

**Enums**

- [`InstanceProjectionCode`](#instanceprojectioncode) - Machine-readable reason a response instance fails projection validation.
- [`ProjectionConsumer`](#projectionconsumer) - The authored link from a response source to a consuming form.

**Functions**

- [`check_instance_projection`](#check_instance_projection) - Checks a response projection against every eligible upstream Definition version.

---

## formspec_core::instance_projection::InstanceProjectionCode

*Enum*

Machine-readable reason a response instance fails projection validation.

**Variants:**
- `DefinitionMismatch` - The supplied Definition has a different URL from the selection.
- `VersionInvalid` - The selected version range or upstream version cannot be interpreted.
- `VersionAmbiguous` - More than one supplied Definition matches the same eligible version.
- `NoEligibleVersion` - No published version matches the selection's range.
- `SchemaUnsupported` - A catalog schema or mapped output cannot be compared statically.
- `PathMissing` - A projected path has no corresponding upstream data field.
- `FieldTypeMismatch` - A projected field declares a different type from the upstream field.
- `OptionValuesMismatch` - Directly carried choices have different sets of stored option values.
- `SubjectMissing` - The upstream Definition lacks a subject declaration.
- `SubjectTypeMismatch` - Eligible upstream versions declare different subject types.
- `SubjectKeyTypeDrift` - Eligible upstream versions declare different sets of subject keys or key types.
- `SubjectKeyMissing` - A predicate names an undeclared upstream or consuming subject key.
- `SubjectKeyTypeMismatch` - A predicate compares keys with incompatible declared types.
- `SubjectIntegerRequired` - A predicate uses an integer-only operation on a non-integer key.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> InstanceProjectionCode`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &InstanceProjectionCode) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::instance_projection::InstanceProjectionDiagnostic

*Struct*

One error in a response instance's projection or subject predicates.

**Fields:**
- `code: InstanceProjectionCode` - Stable reason for rejecting the instance.
- `json_pointer: String` - JSON Pointer relative to the instance document.
- `upstream_version: Option<String>` - The associated upstream version, when the finding identifies one.
- `message: String` - Description of the incompatible declaration.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> InstanceProjectionDiagnostic`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &InstanceProjectionDiagnostic) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::instance_projection::ProjectionConsumer

*Enum*

The authored link from a response source to a consuming form.

**Variants:**
- `Instance{ definition: serde_json::Value, name: String }` - Named secondary instance in this Definition.
- `Prefill{ definition: serde_json::Value, mapped: bool }` - A Surface form slot bound to this source through initialData.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`



## formspec_core::instance_projection::check_instance_projection

*Function*

Checks a response projection against every eligible upstream Definition version.

Pass every published Definition for the URL in `response.definition`. This function
filters the list by `compatibleVersions` when declared and reports an error if no
version is eligible. It checks the fields and predicates against each eligible
version. For subject drift, it uses the first version with a subject in semantic
version order when ranged and in byte order of the version text otherwise.

Pass the consuming Definition and its authored instance or prefill binding.
Pass `None` for catalog reads without a receiving form.
The Definition schema and document lint check the local response instance declaration.
Inline and URI-backed instances return no findings.
A `definition-response` catalog source uses its own `responseSelection` and
JSON Schema. For session drafts, pass the one resolved Definition for `definitionRef`.

On consumer publish, pass all upstream versions for each response instance. On
upstream publish, include the candidate in that list and recheck each dependent
instance before admitting the version. Publish must refuse on any finding.

# Examples

```
use formspec_core::check_instance_projection;
use serde_json::json;

let instance = json!({"data": {"rate": 5}});
assert!(check_instance_projection(&instance, None, &[]).is_empty());
```

```rust
fn check_instance_projection(instance: &serde_json::Value, consumer: Option<&ProjectionConsumer>, upstream_definitions: &[serde_json::Value]) -> Vec<InstanceProjectionDiagnostic>
```

---

## Source: formspec_core/instance_resolution.md

**formspec_core > instance_resolution**

# Module: instance_resolution

## Contents

**Structs**

- [`DeliveredSelection`](#deliveredselection) - An available value together with the evidence needed to keep a pin.
- [`MappingReference`](#mappingreference) - Identity and digest of the Mapping used to produce the delivered value.
- [`SelectedRecord`](#selectedrecord) - Evidence identifying one selected Response.
- [`Sha256Digest`](#sha256digest) - Lowercase hexadecimal SHA-256 with the Core wire prefix.

---

## formspec_core::instance_resolution::DeliveredSelection

*Struct*

An available value together with the evidence needed to keep a pin.

**Fields:**
- `records: Vec<SelectedRecord>` - Selected records in selection order.
- `value: Box<serde_json::value::RawValue>` - The exact JSON value read by the consumer.
- `value_digest: Sha256Digest` - The digest of the delivered value.
- `none: bool` - Whether the delivery came from a successful empty match.
- `pinned: bool` - Whether this delivery is pinned at open.
- `mapping: Option<MappingReference>` - Identity of the Mapping applied at delivery.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> DeliveredSelection`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::instance_resolution::MappingReference

*Struct*

Identity and digest of the Mapping used to produce the delivered value.

**Fields:**
- `url: String` - Declared Mapping URL.
- `digest: Sha256Digest` - Caller-verified digest of the resolved Mapping.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingReference`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &MappingReference) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::instance_resolution::SelectedRecord

*Struct*

Evidence identifying one selected Response.

**Fields:**
- `response_id: String` - Response id.
- `definition_version: String` - Version of the selected Response's Definition.
- `response_hash: Option<Sha256Digest>` - Handoff hash of a completed Response. Drafts omit this.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SelectedRecord`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &SelectedRecord) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::instance_resolution::Sha256Digest

*Struct*

Lowercase hexadecimal SHA-256 with the Core wire prefix.

**Tuple Struct**: `()`

**Methods:**

- `fn as_str(self: &Self) -> &str` - Returns the digest in its wire format.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> Sha256Digest`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Display**
  - `fn fmt(self: &Self, formatter: & mut fmt::Formatter) -> fmt::Result`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **PartialEq**
  - `fn eq(self: &Self, other: &Sha256Digest) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **TryFrom**
  - `fn try_from(value: String) -> Result<Self, <Self as >::Error>`

---

## Source: formspec_core/json_artifacts.md

**formspec_core > json_artifacts**

# Module: json_artifacts

## Contents

**Functions**

- [`changelog_to_json_value`](#changelog_to_json_value) - Serialize a generated changelog for FFI consumers.
- [`extension_usage_issues_to_json_value`](#extension_usage_issues_to_json_value) - Serialize extension usage validation issues (camelCase keys for JS).

---

## formspec_core::json_artifacts::changelog_to_json_value

*Function*

Serialize a generated changelog for FFI consumers.

Emits `$formspecChangelog: "1.0"` as the first key so
`detect_document_type` can classify the output and the linter can
validate it against `changelog.schema.json` without tripping E100.
The marker field name is identical across wire styles — JSON envelope
markers are schema-level discriminators, not translated identifiers.

```rust
fn changelog_to_json_value(result: &crate::changelog::Changelog, style: crate::wire_keys::JsonWireStyle) -> serde_json::Value
```



## formspec_core::json_artifacts::extension_usage_issues_to_json_value

*Function*

Serialize extension usage validation issues (camelCase keys for JS).

```rust
fn extension_usage_issues_to_json_value(issues: &[crate::extension_analysis::ExtensionUsageIssue]) -> serde_json::Value
```

---

## Source: formspec_core/json_util.md

**formspec_core > json_util**

# Module: json_util

## Contents

**Functions**

- [`json_object_to_string_map`](#json_object_to_string_map) - Clone a JSON object into a `String` → `Value` map; non-objects yield an empty map.

---

## formspec_core::json_util::json_object_to_string_map

*Function*

Clone a JSON object into a `String` → `Value` map; non-objects yield an empty map.

```rust
fn json_object_to_string_map<V>(val: &V) -> std::collections::HashMap<String, V>
```

---

## Source: formspec_core/jsonld_context.md

**formspec_core > jsonld_context**

# Module: jsonld_context

## Contents

**Structs**

- [`JsonLdDerivation`](#jsonldderivation) - A derived JSON-LD context plus everything the derivation could not honor.
- [`JsonLdDiagnostic`](#jsonlddiagnostic) - One thing the derivation could not honor.

**Enums**

- [`JsonLdDiagnosticKind`](#jsonlddiagnostickind) - Why a binding did not produce the term it named.

**Functions**

- [`derive_json_ld_context`](#derive_json_ld_context) - Derive the JSON-LD `@context` for `definition` from `ontology["concepts"]`.
- [`json_ld_derivation_to_json_value`](#json_ld_derivation_to_json_value) - Wire shape for hosts: `{ "context": …, "diagnostics": [{ kind, path, key, existingId?, newId? }] }`.

**Constants**

- [`XSD_NAMESPACE`](#xsd_namespace) - XSD namespace bound to the `xsd` prefix in every derived context.

---

## formspec_core::jsonld_context::JsonLdDerivation

*Struct*

A derived JSON-LD context plus everything the derivation could not honor.

**Fields:**
- `context: serde_json::Value` - The `@context` object (not wrapped in `{ "@context": … }`).
- `diagnostics: Vec<JsonLdDiagnostic>` - Diagnostics in Definition order; empty when every binding produced its term.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> JsonLdDerivation`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &JsonLdDerivation) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::jsonld_context::JsonLdDiagnostic

*Struct*

One thing the derivation could not honor.

For a `Collision`, `existing_id` describes the term that stays in the context and `new_id` the
definition the item at `path` needed. Either is the concept IRI, `"@nest"` for an unbound
structural group, or `None` for an unbound leaf that would be lifted under the existing term.
For the other kinds `new_id` carries the lost binding's concept.

**Fields:**
- `kind: JsonLdDiagnosticKind` - What went wrong.
- `path: String` - Dotted Definition path of the item that could not be honored.
- `key: String` - The item's JSON key.
- `existing_id: Option<String>` - Term definition that stays in the context (collisions only).
- `new_id: Option<String>` - Term definition the item needed.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> JsonLdDiagnostic`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &JsonLdDiagnostic) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::jsonld_context::JsonLdDiagnosticKind

*Enum*

Why a binding did not produce the term it named.

**Variants:**
- `Collision` - Two items need different definitions for one key in one scope; the later is omitted.
- `UnboundRepeatable` - A bound item under an unbound repeatable group: nothing names the group's instances.
- `UnsupportedType` - A bound field whose `dataType` has no JSON-LD representation (`attachment`).

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> JsonLdDiagnosticKind`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &JsonLdDiagnosticKind) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::jsonld_context::XSD_NAMESPACE

*Constant*: `&str`

XSD namespace bound to the `xsd` prefix in every derived context.



## formspec_core::jsonld_context::derive_json_ld_context

*Function*

Derive the JSON-LD `@context` for `definition` from `ontology["concepts"]`.

Missing or malformed `items` / `concepts` yield a header-only context and no diagnostics.

# Examples
```
use serde_json::json;
use formspec_core::jsonld_context::derive_json_ld_context;

let definition = json!({ "items": [
    { "key": "dob", "type": "field", "dataType": "date" }
]});
let ontology = json!({ "concepts": {
    "dob": { "concept": "https://schema.org/birthDate" }
}});
let derived = derive_json_ld_context(&definition, &ontology);
assert_eq!(derived.context["dob"]["@type"], "xsd:date");
assert!(derived.diagnostics.is_empty());
```

```rust
fn derive_json_ld_context(definition: &serde_json::Value, ontology: &serde_json::Value) -> JsonLdDerivation
```



## formspec_core::jsonld_context::json_ld_derivation_to_json_value

*Function*

Wire shape for hosts: `{ "context": …, "diagnostics": [{ kind, path, key, existingId?, newId? }] }`.

```rust
fn json_ld_derivation_to_json_value(derivation: &JsonLdDerivation) -> serde_json::Value
```

---

## Source: formspec_core/option_sets.md

**formspec_core > option_sets**

# Module: option_sets

## Contents

**Functions**

- [`effective_item_options`](#effective_item_options) - Return the Item's effective options, with a defined named set taking precedence.
- [`resolve_option_sets_on_definition`](#resolve_option_sets_on_definition) - Walk `definition.items` (recursively) and set `options` from `optionSets`.

---

## formspec_core::option_sets::effective_item_options

*Function*

Return the Item's effective options, with a defined named set taking precedence.
Source-only named sets supply no inline options.

```rust
fn effective_item_options<'a>(item: &'a fel_core::exact_json::Value, sets: Option<&'a fel_core::exact_json::Map<String, fel_core::exact_json::Value>>) -> Option<&'a fel_core::exact_json::Value>
```



## formspec_core::option_sets::resolve_option_sets_on_definition

*Function*

Walk `definition.items` (recursively) and set `options` from `optionSets`.

Matches `resolveOptionSetsOnDefinition` in `packages/formspec-engine/src/engine/definition-setup.ts`.

```rust
fn resolve_option_sets_on_definition(definition: & mut fel_core::exact_json::Value)
```

---

## Source: formspec_core/parser_recovery.md

**formspec_core > parser_recovery**

# Module: parser_recovery

## Contents

**Structs**

- [`JsonParseDiagnostic`](#jsonparsediagnostic) - Diagnostic issue discovered during JSON parsing or recovery.
- [`JsonRecoveryError`](#jsonrecoveryerror) - Error returned when JSON cannot be parsed or recovered.
- [`ParsedJsonResult`](#parsedjsonresult) - The outcome of parsing JSON with error recovery.

**Functions**

- [`parse_json_with_recovery`](#parse_json_with_recovery) - Parse JSON text, falling back to structural recovery when syntax flaws are encountered.

---

## formspec_core::parser_recovery::JsonParseDiagnostic

*Struct*

Diagnostic issue discovered during JSON parsing or recovery.

**Fields:**
- `line: usize` - Line number (1-based) where the flaw was detected.
- `column: usize` - Column number (1-based) where the flaw was detected.
- `message: String` - Human-readable explanation of the syntax flaw.
- `recovery_action: Option<String>` - Action taken to recover (e.g., "removed trailing comma", "closed unmatched delimiter").

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> JsonParseDiagnostic`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &JsonParseDiagnostic) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::parser_recovery::JsonRecoveryError

*Struct*

Error returned when JSON cannot be parsed or recovered.

**Fields:**
- `line: usize` - Line number where parse failed.
- `column: usize` - Column number where parse failed.
- `message: String` - Failure message.

**Traits:** Eq, Error

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> JsonRecoveryError`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Display**
  - `fn fmt(self: &Self, f: & mut std::fmt::Formatter) -> std::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &JsonRecoveryError) -> bool`



## formspec_core::parser_recovery::ParsedJsonResult

*Struct*

The outcome of parsing JSON with error recovery.

**Fields:**
- `value: serde_json::Value` - Parsed JSON value.
- `diagnostics: Vec<JsonParseDiagnostic>` - Any diagnostics emitted during parsing or repair.
- `recovered: bool` - Whether recovery modifications were needed to produce valid JSON.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ParsedJsonResult`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::parser_recovery::parse_json_with_recovery

*Function*

Parse JSON text, falling back to structural recovery when syntax flaws are encountered.

```rust
fn parse_json_with_recovery(input: &str) -> Result<ParsedJsonResult, JsonRecoveryError>
```

---

## Source: formspec_core/path_utils.md

**formspec_core > path_utils**

# Module: path_utils

## Contents

**Structs**

- [`ItemLocation`](#itemlocation) - A resolved position in a tree: the parent slice, index within it, and the item itself.
- [`Path`](#path) - A parsed dotted path.

**Enums**

- [`PathSegment`](#pathsegment) - A single segment in a dotted path.

**Functions**

- [`definition_item_location_to_json_value`](#definition_item_location_to_json_value) - `itemLocationAtPath` JSON (`parentPath` / `parent_path`, …) or null.
- [`item_at_path`](#item_at_path) - Find an item by normalized dotted path, walking children at each segment.
- [`item_location_at_path`](#item_location_at_path) - Resolve the location triple (parent, index, item) for a dotted path.
- [`json_definition_item_at_path`](#json_definition_item_at_path) - Resolve an item in a JSON `items` array by dotted path (`key` / `children` shape).
- [`json_definition_item_location_at_path`](#json_definition_item_location_at_path) - `(index, item)` within its parent `children` slice for a dotted path.
- [`leaf_key`](#leaf_key) - Extract the last segment from a dotted path.
- [`normalize_indexed_path`](#normalize_indexed_path) - Strip all repeat indices from a dotted path.
- [`normalize_path_segment`](#normalize_path_segment) - Strip repeat indices from a single path segment: `lineItems[0]` → `lineItems`.
- [`parent_path`](#parent_path) - Extract the parent path from a dotted path.
- [`split_normalized_path`](#split_normalized_path) - Split a normalized dotted path into segments, filtering empties.

**Traits**

- [`TreeItem`](#treeitem) - A generic tree node shape for path traversal.

---

## formspec_core::path_utils::ItemLocation

*Struct*

A resolved position in a tree: the parent slice, index within it, and the item itself.

**Generic Parameters:**
- 'a
- T

**Fields:**
- `parent: &'a [T]` - Sibling slice containing [`Self::item`].
- `index: usize` - Index of [`Self::item`] within `parent`.
- `item: &'a T` - The resolved node.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::path_utils::Path

*Struct*

A parsed dotted path.

**Fields:**
- `segments: Vec<PathSegment>` - The constituent segments of the path.

**Methods:**

- `fn new() -> Self` - Create a new empty path.
- `fn parse(s: &str) -> Self` - Parse a dotted path string into a Path object.
- `fn strip_indices(self: &Self) -> String` - Returns the "base" path string with all indices and wildcards removed.
- `fn to_wildcard_string(self: &Self) -> String` - Returns a path string where all numeric indices are replaced with wildcards.
- `fn to_fel_string(self: &Self) -> String` - Returns a path string suitable for FEL (1-based indexing for display).
- `fn parent_string(self: &Self) -> String` - Returns the parent path as a string.
- `fn leaf_key(self: &Self) -> String` - Returns the last segment as a string (the "leaf key").

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> Path`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Default**
  - `fn default() -> Path`
- **Display**
  - `fn fmt(self: &Self, f: & mut fmt::Formatter) -> fmt::Result`
- **FromStr**
  - `fn from_str(s: &str) -> Result<Self, <Self as >::Err>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **PartialEq**
  - `fn eq(self: &Self, other: &Path) -> bool`



## formspec_core::path_utils::PathSegment

*Enum*

A single segment in a dotted path.

**Variants:**
- `Exact(String)` - Exact key: `name`
- `Wildcard` - Wildcard: `[*]`
- `Indexed(usize)` - Numeric index: `[0]`
- `Special(String)` - Special index or property (e.g., `[@index]`).

**Methods:**

- `fn as_str(self: &Self) -> Option<&str>` - Returns the key part of the segment if it's an Exact segment.
- `fn flat_key(self: &Self) -> String` - Returns the segment's content as a bracket-free flat key fragment.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> PathSegment`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Display**
  - `fn fmt(self: &Self, f: & mut fmt::Formatter) -> fmt::Result`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **PartialEq**
  - `fn eq(self: &Self, other: &PathSegment) -> bool`



## formspec_core::path_utils::TreeItem

*Trait*

A generic tree node shape for path traversal.

**Methods:**

- `key`: Stable segment key for this node (matches one dotted path segment).
- `children`: Child nodes for the next path segment.



## formspec_core::path_utils::definition_item_location_to_json_value

*Function*

`itemLocationAtPath` JSON (`parentPath` / `parent_path`, …) or null.

```rust
fn definition_item_location_to_json_value(items: &[serde_json::Value], path: &str, style: crate::JsonWireStyle) -> serde_json::Value
```



## formspec_core::path_utils::item_at_path

*Function*

Find an item by normalized dotted path, walking children at each segment.

```rust
fn item_at_path<'a, T>(items: &'a [T], path: &str) -> Option<&'a T>
```



## formspec_core::path_utils::item_location_at_path

*Function*

Resolve the location triple (parent, index, item) for a dotted path.

```rust
fn item_location_at_path<'a, T>(items: &'a [T], path: &str) -> Option<ItemLocation<'a, T>>
```



## formspec_core::path_utils::json_definition_item_at_path

*Function*

Resolve an item in a JSON `items` array by dotted path (`key` / `children` shape).

```rust
fn json_definition_item_at_path<'a>(items: &'a [serde_json::Value], path: &str) -> Option<&'a serde_json::Value>
```



## formspec_core::path_utils::json_definition_item_location_at_path

*Function*

`(index, item)` within its parent `children` slice for a dotted path.

```rust
fn json_definition_item_location_at_path<'a>(items: &'a [serde_json::Value], path: &str) -> Option<(usize, &'a serde_json::Value)>
```



## formspec_core::path_utils::leaf_key

*Function*

Extract the last segment from a dotted path.
`group.child.field` → `field`
`field` → `field`

```rust
fn leaf_key(path: &str) -> String
```



## formspec_core::path_utils::normalize_indexed_path

*Function*

Strip all repeat indices from a dotted path.
`group[0].items[1].field` → `group.items.field`

```rust
fn normalize_indexed_path(path: &str) -> String
```



## formspec_core::path_utils::normalize_path_segment

*Function*

Strip repeat indices from a single path segment: `lineItems[0]` → `lineItems`.

```rust
fn normalize_path_segment(segment: &str) -> &str
```



## formspec_core::path_utils::parent_path

*Function*

Extract the parent path from a dotted path.
`group.child.field` → `group.child`
`field` → `""`

```rust
fn parent_path(path: &str) -> String
```



## formspec_core::path_utils::split_normalized_path

*Function*

Split a normalized dotted path into segments, filtering empties.

```rust
fn split_normalized_path(path: &str) -> Vec<String>
```

---

## Source: formspec_core/registry_client.md

**formspec_core > registry_client**

# Module: registry_client

## Contents

**Functions**

- [`extension_category_to_wire`](#extension_category_to_wire) - Serialize extension category for JSON / FFI consumers.
- [`parse_registry_entry_status`](#parse_registry_entry_status) - Parse registry entry status strings (`draft`, `stable`, `active`, …).
- [`registry_entry_status_to_wire`](#registry_entry_status_to_wire) - Serialize status for JSON / FFI consumers (`active` → `"stable"`).
- [`validate_lifecycle_transition`](#validate_lifecycle_transition) - Check whether a lifecycle transition is valid per the spec.
- [`well_known_url`](#well_known_url) - Construct the well-known registry URL for a base URL.

---

## formspec_core::registry_client::extension_category_to_wire

*Function*

Serialize extension category for JSON / FFI consumers.

```rust
fn extension_category_to_wire(category: ExtensionCategory) -> &'static str
```



## formspec_core::registry_client::parse_registry_entry_status

*Function*

Parse registry entry status strings (`draft`, `stable`, `active`, …).

```rust
fn parse_registry_entry_status(s: &str) -> Option<crate::extension_analysis::RegistryEntryStatus>
```



## formspec_core::registry_client::registry_entry_status_to_wire

*Function*

Serialize status for JSON / FFI consumers (`active` → `"stable"`).

```rust
fn registry_entry_status_to_wire(status: crate::extension_analysis::RegistryEntryStatus) -> &'static str
```



## formspec_core::registry_client::validate_lifecycle_transition

*Function*

Check whether a lifecycle transition is valid per the spec.

```text
draft      → {draft, stable}
stable     → {stable, deprecated}
deprecated → {deprecated, retired, stable}  // un-deprecation allowed
retired    → {}  // terminal
```

```rust
fn validate_lifecycle_transition(from: crate::extension_analysis::RegistryEntryStatus, to: crate::extension_analysis::RegistryEntryStatus) -> bool
```



## formspec_core::registry_client::well_known_url

*Function*

Construct the well-known registry URL for a base URL.

```rust
fn well_known_url(base_url: &str) -> String
```

---

## Source: formspec_core/registry_client/types.md

**formspec_core > registry_client > types**

# Module: registry_client::types

## Contents

**Structs**

- [`ContactPoint`](#contactpoint) - Structured publisher contact information.
- [`Parameter`](#parameter) - Function/constraint parameter declaration.
- [`Publisher`](#publisher) - Organization publishing a registry document.
- [`Registry`](#registry) - A parsed registry document with indexed entries.
- [`RegistryEntry`](#registryentry) - A single extension record with full metadata.

**Enums**

- [`ExtensionCategory`](#extensioncategory) - Extension mechanism category.
- [`RegistryError`](#registryerror) - Errors from registry parsing and validation.
- [`RegistryWarning`](#registrywarning) - Non-fatal registry parse warning.

---

## formspec_core::registry_client::types::ContactPoint

*Struct*

Structured publisher contact information.

**Fields:**
- `contact_type: Option<String>` - Type of contact (e.g. "technical", "customer-service").
- `email: Option<String>` - Support or contact email address.
- `telephone: Option<String>` - Telephone contact number.
- `url: Option<String>` - Web contact or support form URL.
- `available_language: Vec<String>` - Languages supported by this contact point.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ContactPoint`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::registry_client::types::ExtensionCategory

*Enum*

Extension mechanism category.

Per ADR 0150 §4.1/§4.2: `Namespace` was renamed to `Module` (greenfield,
no alias) and six new contribution categories were added. The Rust parser
surface tracks all categories the schema admits — the originals
(`DataType` / `Function` / `Constraint` / `Property`), the rename target
(`Module`), the two schema-first-class categories that pre-dated the
substrate refactor but weren't yet surfaced (`Concept` / `Vocabulary`),
and the six new contribution categories the substrate refactor added
(`UnitKind` / `Widget` / `ActionIntent` / `SlotType` /
`ValidationMappingRow` / `TokenCategory`). Adding parser surface for the
six is required by P1 because P1 republishes core vocabularies as
modules and the first published contribution category (`UnitKind` from
`x-formspec-core-task`) would otherwise parse-reject.

**Variants:**
- `DataType` - Data type extension defining value shape and validation rules.
- `Function` - Custom evaluation function callable in FEL expressions.
- `Constraint` - Custom constraint validator for field validation.
- `Property` - Schema property extension for custom field/item properties.
- `Module` - Module bundling a collection of related extensions.
- `Concept` - Semantic concept binding identifying cross-form field concepts.
- `Vocabulary` - Domain-specific vocabulary definition.
- `UnitKind` - Unit of measure kind specification (ADR 0150 §4.1).
- `Widget` - Visual widget descriptor for custom renderers.
- `ActionIntent` - Action intent definition for button and workflow triggers.
- `SlotType` - Layout slot type descriptor for layout planners.
- `ValidationMappingRow` - Validation mapping row descriptor for schema translations.
- `TokenCategory` - Token category specification for design tokens.
- `AccessClass` - Access-Class Registry token or deployment prefix (extension-registry.md §3.2.3).

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ExtensionCategory`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &ExtensionCategory) -> bool`



## formspec_core::registry_client::types::Parameter

*Struct*

Function/constraint parameter declaration.

**Fields:**
- `name: String` - Parameter identifier name.
- `param_type: String` - Declared data type of the parameter.
- `description: Option<String>` - Optional human-readable description of the parameter.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> Parameter`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::registry_client::types::Publisher

*Struct*

Organization publishing a registry document.

**Fields:**
- `name: serde_json::Value` - Organization or publisher name (string or localized object).
- `identifier: Option<String>` - Unique publisher identifier (e.g. URN or domain).
- `homepage: Option<String>` - Organization homepage URL.
- `contact_points: Vec<ContactPoint>` - Contact points for support or governance inquiries.
- `legacy_url: Option<String>` - Legacy URL field for backward compatibility.
- `legacy_contact: Option<String>` - Legacy contact field for backward compatibility.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> Publisher`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::registry_client::types::Registry

*Struct*

A parsed registry document with indexed entries.

**Fields:**
- `publisher: Publisher` - Publishing authority or organization.
- `published: String` - Publication timestamp or date string.
- `warnings: Vec<RegistryWarning>` - Non-fatal warnings encountered during registry parsing.

**Methods:**

- `fn from_json(value: &Value) -> Result<Self, RegistryError>` - Parse a registry document from a JSON value.
- `fn entries(self: &Self) -> &[RegistryEntry]` - Return a slice of all parsed entries in document order.
- `fn find(self: &Self, name: &str, version_constraint: Option<&str>) -> Vec<&RegistryEntry>` - Find all entries matching `name`, optionally filtered by a version constraint.
- `fn find_one(self: &Self, name: &str, version_constraint: Option<&str>) -> Option<&RegistryEntry>` - Find the highest-version entry matching `name` and optional constraint.
- `fn list_by_category(self: &Self, category: ExtensionCategory) -> Vec<&RegistryEntry>` - List all entries in a given category.
- `fn list_by_status(self: &Self, status: RegistryEntryStatus) -> Vec<&RegistryEntry>` - List all entries with a given lifecycle status.
- `fn validate(self: &Self) -> Vec<String>` - Validate registry entries against structural rules.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **RegistryLookup**
  - `fn lookup(self: &Self, extension_name: &str) -> Option<RegistryEntryInfo>`



## formspec_core::registry_client::types::RegistryEntry

*Struct*

A single extension record with full metadata.

Carries the registry-shape payloads for ADR 0150 §4.1/§4.2 module
aggregator + contribution categories: `contributes[]` for module entries,
and the typed payload slots for `unit-kind` (`semantics`), `widget`
(`widget_shape`), `action-intent` (`validation`), `validation-mapping-row`
(`row`), `slot-type` (`slot_shape`), `token-category`
(`category_shape`), and `access-class` (`class_shape`). The `extensions` slot holds `^x-` keys (the
substrate uses `x-formspec-kind-value` here for `property` contributions
that republish closed-core enum values without a typed payload — see
`specs/registry/extension-registry.md` §4.1 Rule 1 dotted-translation
convention).

Payload fields are typed as `serde_json::Value` at the parse boundary;
callers that need typed access ship their own typed-shape deserializers
(parity with how JSON Schema treats these fields per `registry.schema.json`).

**Fields:**
- `name: String` - Unique extension entry name (e.g. `currencyCode`, `x-formspec-core-task`).
- `category: ExtensionCategory` - Category of this extension.
- `version: String` - Version string of this extension definition.
- `status: crate::extension_analysis::RegistryEntryStatus` - Lifecycle status (`draft`, `stable`, `deprecated`, `retired`).
- `description: String` - Human-readable summary of the extension purpose.
- `deprecation_notice: Option<String>` - Guidance for migration when deprecated or retired.
- `base_type: Option<String>` - Underlying primitive data type for `dataType` extensions.
- `parameters: Option<Vec<Parameter>>` - Declared parameters for `function` and `constraint` extensions.
- `returns: Option<String>` - Return data type for `function` extensions.
- `contributes: Option<Vec<String>>` - `module` aggregator: names of Registry entries this module bundles.
- `extensions: Option<serde_json::Value>` - Top-level `extensions` slot (admits `^x-` keys per `registry.schema.json`).
- `semantics: Option<serde_json::Value>` - `unit-kind` contribution payload: REQUIRED on `unit-kind` entries.
- `widget_shape: Option<serde_json::Value>` - `widget` contribution payload: REQUIRED on `widget` entries.
- `validation: Option<serde_json::Value>` - `action-intent` contribution payload: REQUIRED on `action-intent` entries.
- `slot_shape: Option<serde_json::Value>` - `slot-type` contribution payload: REQUIRED on `slot-type` entries.
- `row: Option<serde_json::Value>` - `validation-mapping-row` contribution payload: REQUIRED on
- `category_shape: Option<serde_json::Value>` - `token-category` contribution payload: REQUIRED on `token-category` entries.
- `class_shape: Option<serde_json::Value>` - `access-class` payload (`token` or `prefix`, plus `maps`): REQUIRED on

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> RegistryEntry`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::registry_client::types::RegistryError

*Enum*

Errors from registry parsing and validation.

**Variants:**
- `MissingField(String)` - Missing required top-level field.
- `InvalidField(String)` - Field has wrong type.
- `InvalidEntry(usize, String)` - Entry-level parse error (index, message).

**Traits:** Eq, Error

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> RegistryError`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Display**
  - `fn fmt(self: &Self, f: & mut std::fmt::Formatter) -> std::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &RegistryError) -> bool`



## formspec_core::registry_client::types::RegistryWarning

*Enum*

Non-fatal registry parse warning.

**Variants:**
- `DeprecatedField{ field: String, replacement: String }` - A deprecated field was present.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> RegistryWarning`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &RegistryWarning) -> bool`

---

## Source: formspec_core/registry_client/version.md

**formspec_core > registry_client > version**

# Module: registry_client::version

## Contents

**Functions**

- [`version_satisfies`](#version_satisfies) - Check if `version` satisfies a space-separated constraint string.

---

## formspec_core::registry_client::version::version_satisfies

*Function*

Check if `version` satisfies a space-separated constraint string.
Each token is an operator+version (e.g. `>=1.0.0`) or an exact version.
All tokens must match (AND semantics).

```rust
fn version_satisfies(version: &str, constraint: &str) -> bool
```

---

## Source: formspec_core/registry_client/wire_json.md

**formspec_core > registry_client > wire_json**

# Module: registry_client::wire_json

## Contents

**Functions**

- [`registry_entry_count_from_raw`](#registry_entry_count_from_raw) - Entry count from raw registry JSON (`entries` array length).
- [`registry_entry_to_json_value`](#registry_entry_to_json_value) - Single registry entry for `findRegistryEntry` / `find_registry_entry`.
- [`registry_parse_summary_to_json_value`](#registry_parse_summary_to_json_value) - `parseRegistry` / `parse_registry` summary object.
- [`version_constraint_option`](#version_constraint_option) - Empty string means “no constraint” for `find_one` host inputs.

---

## formspec_core::registry_client::wire_json::registry_entry_count_from_raw

*Function*

Entry count from raw registry JSON (`entries` array length).

```rust
fn registry_entry_count_from_raw(val: &serde_json::Value) -> usize
```



## formspec_core::registry_client::wire_json::registry_entry_to_json_value

*Function*

Single registry entry for `findRegistryEntry` / `find_registry_entry`.

```rust
fn registry_entry_to_json_value(entry: &super::RegistryEntry, style: crate::JsonWireStyle) -> serde_json::Value
```



## formspec_core::registry_client::wire_json::registry_parse_summary_to_json_value

*Function*

`parseRegistry` / `parse_registry` summary object.

```rust
fn registry_parse_summary_to_json_value(registry: &super::Registry, raw: &serde_json::Value, issues: &[String], style: crate::JsonWireStyle) -> serde_json::Value
```



## formspec_core::registry_client::wire_json::version_constraint_option

*Function*

Empty string means “no constraint” for `find_one` host inputs.

```rust
fn version_constraint_option(s: &str) -> Option<&str>
```

---

## Source: formspec_core/repeat_references.md

**formspec_core > repeat_references**

# Module: repeat_references

## Contents

**Functions**

- [`is_repeatable_group`](#is_repeatable_group) - Check whether an Item declares a repeatable Group (Core §4.2.4).
- [`unsubscripted_repeat_message`](#unsubscripted_repeat_message) - Describe the invalid step in an authored field path.
- [`unsubscripted_repeats`](#unsubscripted_repeats) - Find repeat groups traversed without a subscript, once per distinct group.
- [`variable_target`](#variable_target) - Map a variable's scope Item key to its expression site (Core §4.5.1).

---

## formspec_core::repeat_references::is_repeatable_group

*Function*

Check whether an Item declares a repeatable Group (Core §4.2.4).

During traversal an omitted Item type is inferred as a Group when
`repeatable` is true. Definition validation still requires an explicit type.

```rust
fn is_repeatable_group(item_type: Option<&str>, repeatable: Option<bool>) -> bool
```



## formspec_core::repeat_references::unsubscripted_repeat_message

*Function*

Describe the invalid step in an authored field path.

```rust
fn unsubscripted_repeat_message(path: &str) -> String
```



## formspec_core::repeat_references::unsubscripted_repeats

*Function*

Find repeat groups traversed without a subscript, once per distinct group.

The caller supplies declared Item paths and repeatability from its Definition index.
The site resolver maps authored targets or Item keys to dotted Item paths.

```rust
fn unsubscripted_repeats<impl Fn(&str) -> Option<String>, impl Fn(&str) -> bool, impl Fn(&str) -> bool>(target: Option<&str>, expression: &fel_core::ast::Expr, resolve_site: impl Trait, declares: impl Trait, is_repeat: impl Trait) -> std::collections::BTreeSet<String>
```



## formspec_core::repeat_references::variable_target

*Function*

Map a variable's scope Item key to its expression site (Core §4.5.1).

A variable scoped to a repeatable Group runs at a row site. The form scope
(`#`) and unrecognized Item keys have no Item site.

```rust
fn variable_target<'a, impl FnOnce(&str) -> Option<&'a str>, impl FnOnce(&str) -> bool>(scope: &str, path_by_key: impl Trait, is_repeat: impl Trait) -> Option<String>
```

---

## Source: formspec_core/response_migration.md

**formspec_core > response_migration**

# Module: response_migration

## Contents

**Functions**

- [`apply_migrations_to_response_data`](#apply_migrations_to_response_data) - Apply `definition.migrations.from[from_version]` to `response_data` (core spec §6.7).

---

## formspec_core::response_migration::apply_migrations_to_response_data

*Function*

Apply `definition.migrations.from[from_version]` to `response_data` (core spec §6.7).

Returns the data unchanged when it is not an object or no descriptor names `from_version`.

```rust
fn apply_migrations_to_response_data(definition: &fel_core::exact_json::Value, response_data: fel_core::exact_json::Value, from_version: &str, now_iso: &str) -> fel_core::exact_json::Value
```

---

## Source: formspec_core/response_selection.md

**formspec_core > response_selection**

# Module: response_selection

## Contents

**Structs**

- [`Disposition`](#disposition) - One outcome from the caller's disposition authority.
- [`NewerRecord`](#newerrecord) - Identity of a different completed record that a fresh read would select.
- [`ResponseSelection`](#responseselection) - A declared Response read (Core §2.1.6).
- [`SelectionContext`](#selectioncontext) - Caller-supplied facts and delivery options for one read.
- [`SelectionMapping`](#selectionmapping) - The Mapping material resolved by the caller for an available read.
- [`SelectionRecord`](#selectionrecord) - A Response candidate with its storage scope and original JSON.
- [`SubjectDeclaration`](#subjectdeclaration) - The upstream Definition's subject type and key declarations.
- [`SubjectKeyDeclaration`](#subjectkeydeclaration) - The key type in a Definition's subject declaration.
- [`SubjectPredicate`](#subjectpredicate) - A typed comparison against a key on the upstream Response.
- [`TargetDefinition`](#targetdefinition) - The upstream Definition reference.

**Enums**

- [`Cardinality`](#cardinality) - How many of the ordered records are delivered.
- [`Pin`](#pin) - When to retain the selected value.
- [`PredicateOp`](#predicateop) - The comparison applied to the upstream key.
- [`PredicateSource`](#predicatesource) - The source of a subject predicate's reference value.
- [`SelectionOutcome`](#selectionoutcome) - An available value or an undifferentiated refusal.
- [`SelectionSource`](#selectionsource) - Where the Response selection was declared.
- [`SelectionStatus`](#selectionstatus) - The lifecycle policy for candidate selection.
- [`SubjectKeyType`](#subjectkeytype) - The declared type of an upstream subject key.
- [`WhenNone`](#whennone) - The result of a successful match with no eligible records.

**Functions**

- [`select`](#select) - Selects and commits to the value delivered by an authorized Response read.

---

## formspec_core::response_selection::Cardinality

*Enum*

How many of the ordered records are delivered.

**Variants:**
- `Latest` - One record overall.
- `LatestPerSubject` - One record for each distinct subject, in selection order.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> Cardinality`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &Cardinality) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::Disposition

*Struct*

One outcome from the caller's disposition authority.

**Fields:**
- `response_id: String` - Filed Response id.
- `response_hash: Sha256Digest` - Handoff digest of those exact filed bytes.
- `value: String` - Outcome URI.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::NewerRecord

*Struct*

Identity of a different completed record that a fresh read would select.

**Fields:**
- `response_id: String` - Response id.
- `response_hash: Sha256Digest` - Completed Response handoff hash.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::Pin

*Enum*

When to retain the selected value.

**Variants:**
- `None` - Select from the current inputs each time.
- `AtOpen` - Use the value captured at open after checking availability.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> Pin`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &Pin) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::PredicateOp

*Enum*

The comparison applied to the upstream key.

**Variants:**
- `Eq` - Equality of identically typed values.
- `Le` - Integer less than or equal.
- `Ge` - Integer greater than or equal.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> PredicateOp`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &PredicateOp) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::PredicateSource

*Enum*

The source of a subject predicate's reference value.

**Variants:**
- `Subject(String)` - Key of the consumer's subject.
- `RouteParam(String)` - Name of a catalog route parameter.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::ResponseSelection

*Struct*

A declared Response read (Core §2.1.6).

**Fields:**
- `definition: TargetDefinition` - Upstream Definition identity and compatible versions.
- `subject: Vec<SubjectPredicate>` - All predicates must match.
- `status: SelectionStatus` - Which lifecycle state to read.
- `disposition: Option<String>` - Required outcome reported by the disposition authority.
- `when_none: WhenNone` - How to deliver a successful empty match.
- `cardinality: Cardinality` - Number of records to deliver.
- `pin: Pin` - Retention policy for the delivered value.
- `mapping: Option<String>` - Forward Mapping URL, resolved by the caller.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SelectionContext

*Struct*

Caller-supplied facts and delivery options for one read.

**Fields:**
- `scope: String` - Storage scope being read.
- `authorized: bool` - Whether the caller authorized the query and checked access to all supplied candidates.
- `source: SelectionSource` - Where the selection was declared.
- `upstream_subject: Option<SubjectDeclaration>` - Required upstream subject declaration. JSON null means the Definition has no subject.
- `consumer_subject: Option<std::collections::BTreeMap<String, crate::subject_key::SubjectKey>>` - Keys of the consuming Response, when available.
- `route_params: Option<std::collections::BTreeMap<String, String>>` - Route parameters for a catalog source.
- `projection: Option<Vec<String>>` - FieldRef paths for a Definition instance or a catalog field projection.
- `fallback: Option<Box<serde_json::value::RawValue>>` - Instance fallback for a successful empty match.
- `dispositions: Option<Vec<Disposition>>` - Completed record outcomes. An empty list means the authority answered with no outcomes.
- `mapping: Option<SelectionMapping>` - Resolved forward Mapping with its caller-verified identity.
- `pin: Option<DeliveredSelection>` - Retained records, value and digest for a later at-open read.
- `include_input_positions: bool` - Include original input positions for hosts tracking concrete deliveries.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SelectionMapping

*Struct*

The Mapping material resolved by the caller for an available read.

**Fields:**
- `reference: MappingReference` - Identity of the resolved Mapping.
- `document: serde_json::Value` - The resolved Mapping document.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SelectionOutcome

*Enum*

An available value or an undifferentiated refusal.

**Variants:**
- `Available{ delivered: DeliveredSelection, newer: Option<NewerRecord>, input_positions: Option<Vec<usize>> }` - Successful delivery, which may be an empty match.
- `Unavailable` - Refusal, unusable input or missing required record.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SelectionRecord

*Struct*

A Response candidate with its storage scope and original JSON.

**Fields:**
- `scope: String` - Storage scope supplied by the caller.
- `response: Box<serde_json::value::RawValue>` - Original Response JSON, including authored signatures.
- `implicit_subject_id: Option<String>` - Server-only respondent identity when the Definition has no subject.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SelectionSource

*Enum*

Where the Response selection was declared.

**Variants:**
- `Definition` - A Definition response instance.
- `Catalog` - An app catalog data source.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SelectionSource`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &SelectionSource) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SelectionStatus

*Enum*

The lifecycle policy for candidate selection.

**Variants:**
- `Completed` - Only immutable completed filings.
- `Current` - Each subject's open draft or its latest completed filing.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SelectionStatus`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &SelectionStatus) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SubjectDeclaration

*Struct*

The upstream Definition's subject type and key declarations.

**Fields:**
- `type: String` - The Definition's subject type.
- `keys: std::collections::BTreeMap<String, SubjectKeyDeclaration>` - Types of its declared keys.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SubjectKeyDeclaration

*Struct*

The key type in a Definition's subject declaration.

**Fields:**
- `data_type: SubjectKeyType` - Scalar type declared by the Definition.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SubjectKeyType

*Enum*

The declared type of an upstream subject key.

**Variants:**
- `String` - Text.
- `Integer` - Signed integer.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SubjectKeyType`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &SubjectKeyType) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::SubjectPredicate

*Struct*

A typed comparison against a key on the upstream Response.

**Fields:**
- `key: String` - Upstream subject key.
- `op: PredicateOp` - Comparison relative to the resolved reference.
- `from: PredicateSource` - Consumer subject or catalog route input.
- `offset: Option<i64>` - Integer addition before the comparison.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::TargetDefinition

*Struct*

The upstream Definition reference.

**Fields:**
- `url: String` - Canonical upstream Definition URL.
- `compatible_versions: Option<String>` - Semantic version range.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::WhenNone

*Enum*

The result of a successful match with no eligible records.

**Variants:**
- `Unavailable` - Return unavailable.
- `Empty` - Deliver a fallback, or JSON null.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> WhenNone`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Default**
  - `fn default() -> WhenNone`
- **Deserialize**
  - `fn deserialize<__D>(__deserializer: __D) -> _serde::__private228::Result<Self, <__D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &WhenNone) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::response_selection::select

*Function*

Selects and commits to the value delivered by an authorized Response read.

For a fixed predicate set, the fallback scans the supplied records in expected O(m)
time. Latest-per-subject sorts only the k winning records in O(k log k) additional
time. Timestamp, JSON, digest and projection costs depend on input byte size.
The caller authorizes before querying, supplies record-level authorization and
looks up disposition and Mapping facts. This function performs no I/O.

```rust
fn select(records: &[SelectionRecord], selection: &ResponseSelection, context: &SelectionContext) -> SelectionOutcome
```

---

## Source: formspec_core/response_selection/candidates.md

**formspec_core > response_selection > candidates**

# Module: response_selection::candidates

## Contents

**Functions**

- [`valid_authored_instant`](#valid_authored_instant) - Checks an authored timestamp before admitting a preview delivery.

---

## formspec_core::response_selection::candidates::valid_authored_instant

*Function*

Checks an authored timestamp before admitting a preview delivery.

```rust
fn valid_authored_instant(text: &str) -> bool
```

---

## Source: formspec_core/response_selection/wire.md

**formspec_core > response_selection > wire**

# Module: response_selection::wire

## Contents

**Functions**

- [`select_json`](#select_json) - Runs the shared selector on its JSON wire inputs.
- [`subject_id`](#subject_id) - Derives the unprefixed filing-unit id from its type and typed keys.
- [`subject_id_json`](#subject_id_json) - Derives the subject id from JSON text for the subject keys.

---

## formspec_core::response_selection::wire::select_json

*Function*

Runs the shared selector on its JSON wire inputs.

# Errors

Returns an error if any of the JSON inputs cannot be decoded or the result cannot
be serialized. Valid input with an unavailable resolution returns a JSON outcome.

```rust
fn select_json(records_json: &str, selection_json: &str, context_json: &str) -> Result<String, String>
```



## formspec_core::response_selection::wire::subject_id

*Function*

Derives the unprefixed filing-unit id from its type and typed keys.

# Errors

Returns an error for an out-of-range integer key or a canonical encoding failure.

```rust
fn subject_id(subject_type: &str, keys: &std::collections::BTreeMap<String, crate::subject_key::SubjectKey>) -> Result<String, String>
```



## formspec_core::response_selection::wire::subject_id_json

*Function*

Derives the subject id from JSON text for the subject keys.

# Errors

Returns an error for malformed JSON, untyped keys or a canonical encoding failure.

```rust
fn subject_id_json(subject_type: &str, keys_json: &str) -> Result<String, String>
```

---

## Source: formspec_core/runtime_mapping/document.md

**formspec_core > runtime_mapping > document**

# Module: runtime_mapping::document

## Contents

**Functions**

- [`execute_mapping_doc`](#execute_mapping_doc) - Execute a full mapping document (rules + defaults + autoMap).
- [`execute_mapping_doc_with_validation`](#execute_mapping_doc_with_validation) - Execute a mapping with independently supplied external source schema validation.

---

## formspec_core::runtime_mapping::document::execute_mapping_doc

*Function*

Execute a full mapping document (rules + defaults + autoMap).

```rust
fn execute_mapping_doc(doc: &super::types::MappingDocument, source: &serde_json::Value, direction: super::types::MappingDirection) -> super::types::MappingResult
```



## formspec_core::runtime_mapping::document::execute_mapping_doc_with_validation

*Function*

Execute a mapping with independently supplied external source schema validation.

The validator must compile the schema and validate the instance, returning
an error for invalid schemas, unresolved references, or mismatched values.
The external identity is validated using the Mapping association schema.
Forward execution validates input before evaluating rules. Reverse execution
validates the final mapped output. A refusal returns empty output and an
`InvalidDocument` diagnostic. Definition-associated documents keep their
existing execution behavior and do not call the validator.

```rust
fn execute_mapping_doc_with_validation<impl Fn(&Value, &Value) -> Result<(), String>>(doc: &super::types::MappingDocument, source: &serde_json::Value, direction: super::types::MappingDirection, validator: impl Trait) -> super::types::MappingResult
```

---

## Source: formspec_core/runtime_mapping/engine_helpers.md

**formspec_core > runtime_mapping > engine_helpers**

# Module: runtime_mapping::engine_helpers

## Contents

**Functions**

- [`execute_mapping`](#execute_mapping) - Execute a set of mapping rules in a given direction.

---

## formspec_core::runtime_mapping::engine_helpers::execute_mapping

*Function*

Execute a set of mapping rules in a given direction.

```rust
fn execute_mapping(rules: &[MappingRule], source: &serde_json::Value, direction: MappingDirection) -> MappingResult
```

---

## Source: formspec_core/runtime_mapping/parse.md

**formspec_core > runtime_mapping > parse**

# Module: runtime_mapping::parse

## Contents

**Functions**

- [`parse_coerce_type`](#parse_coerce_type) - Parse a coerce type from a mapping rule JSON `coerce` field.
- [`parse_mapping_direction_field`](#parse_mapping_direction_field) - Parse optional top-level `"direction"` restriction on a mapping document.
- [`parse_mapping_document_from_value`](#parse_mapping_document_from_value) - Parse a full mapping document (rules, defaults, autoMap, optional direction lock).
- [`parse_mapping_rules_from_value`](#parse_mapping_rules_from_value) - Parse a JSON array of mapping rules into runtime structures.

---

## formspec_core::runtime_mapping::parse::parse_coerce_type

*Function*

Parse a coerce type from a mapping rule JSON `coerce` field.

Accepts string shorthand (`"number"`) or object form (`{"from": "string", "to": "number"}`).
The object `"from"` field is ignored for runtime dispatch.

```rust
fn parse_coerce_type(val: &serde_json::Value) -> Option<super::types::CoerceType>
```



## formspec_core::runtime_mapping::parse::parse_mapping_direction_field

*Function*

Parse optional top-level `"direction"` restriction on a mapping document.

```rust
fn parse_mapping_direction_field(val: &serde_json::Value) -> Option<super::types::MappingDirection>
```



## formspec_core::runtime_mapping::parse::parse_mapping_document_from_value

*Function*

Parse a full mapping document (rules, defaults, autoMap, optional direction lock).

```rust
fn parse_mapping_document_from_value(val: &serde_json::Value) -> Result<super::types::MappingDocument, String>
```



## formspec_core::runtime_mapping::parse::parse_mapping_rules_from_value

*Function*

Parse a JSON array of mapping rules into runtime structures.

```rust
fn parse_mapping_rules_from_value(val: &serde_json::Value) -> Result<Vec<super::types::MappingRule>, String>
```

---

## Source: formspec_core/runtime_mapping/types.md

**formspec_core > runtime_mapping > types**

# Module: runtime_mapping::types

## Contents

**Structs**

- [`ArrayDescriptor`](#arraydescriptor) - Array iteration descriptor.
- [`MappingDiagnostic`](#mappingdiagnostic) - A diagnostic from mapping execution.
- [`MappingDocument`](#mappingdocument) - A complete mapping document with rules, defaults, and autoMap.
- [`MappingResult`](#mappingresult) - Result of a mapping execution.
- [`MappingRule`](#mappingrule) - A mapping rule — one transform in the pipeline.
- [`MappingSourceSchema`](#mappingsourceschema) - Versioned external source identity and its inline JSON Schema.
- [`ReverseOverride`](#reverseoverride) - Reverse-direction transform override.

**Enums**

- [`ArrayMode`](#arraymode) - Array iteration mode.
- [`CoerceType`](#coercetype) - Target types for coercion.
- [`MappingDirection`](#mappingdirection) - Transform direction.
- [`MappingErrorCode`](#mappingerrorcode) - Structured error codes for mapping diagnostics.
- [`TransformType`](#transformtype) - Supported transform types.
- [`UnmappedStrategy`](#unmappedstrategy) - Strategy for values not found in a value map.

---

## formspec_core::runtime_mapping::types::ArrayDescriptor

*Struct*

Array iteration descriptor.

**Fields:**
- `mode: ArrayMode` - Iteration mode: "each", "indexed", or "whole".
- `inner_rules: Vec<MappingRule>` - Sub-rules applied per element (each/indexed modes).

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ArrayDescriptor`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::runtime_mapping::types::ArrayMode

*Enum*

Array iteration mode.

**Variants:**
- `Each` - Process each element individually.
- `Indexed` - Access elements by index.
- `Whole` - Treat the array as a single value (default).

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ArrayMode`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &ArrayMode) -> bool`



## formspec_core::runtime_mapping::types::CoerceType

*Enum*

Target types for coercion.

**Variants:**
- `String` - Coerce value to a UTF-8 string.
- `Number` - Coerce value to a floating-point number.
- `Integer` - Coerce value to an integer.
- `Boolean` - Coerce value to a boolean.
- `Date` - Coerce value to an ISO 8601 date string (`YYYY-MM-DD`).
- `DateTime` - Coerce value to an ISO 8601 date-time string.
- `Array` - Coerce value to an array, wrapping single scalars if needed.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> CoerceType`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &CoerceType) -> bool`



## formspec_core::runtime_mapping::types::MappingDiagnostic

*Struct*

A diagnostic from mapping execution.

**Fields:**
- `rule_index: usize` - 0-based index of the rule that produced this diagnostic.
- `source_path: Option<String>` - Source path of the rule, if declared.
- `target_path: String` - Target path of the rule.
- `error_code: MappingErrorCode` - Structured classification code for this diagnostic.
- `message: String` - Human-readable diagnostic explanation.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingDiagnostic`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::runtime_mapping::types::MappingDirection

*Enum*

Transform direction.

**Variants:**
- `Forward` - Source to target (e.g. external data model into Formspec response).
- `Reverse` - Target to source (e.g. Formspec response back to external data model).

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingDirection`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &MappingDirection) -> bool`



## formspec_core::runtime_mapping::types::MappingDocument

*Struct*

A complete mapping document with rules, defaults, and autoMap.

**Fields:**
- `source_schema: Option<MappingSourceSchema>` - External source association; execution requires an independent schema validator.
- `rules: Vec<MappingRule>` - Sequence of mapping rules defining the transformation pipeline.
- `defaults: Option<serde_json::Map<String, serde_json::Value>>` - Key-value defaults pre-populated into the output before rules execute (forward only).
- `auto_map: bool` - When true, generate synthetic preserve rules for unmapped top-level source keys.
- `direction_restriction: Option<MappingDirection>` - When set, [`execute_mapping_doc`](super::document::execute_mapping_doc) only permits this direction.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingDocument`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::runtime_mapping::types::MappingErrorCode

*Enum*

Structured error codes for mapping diagnostics.

**Variants:**
- `UnmappedValue` - Source value was not found in a value map and unmapped strategy is `"error"`.
- `CoerceFailure` - Value could not be coerced to the requested target type.
- `FelRuntime` - Runtime error occurred while evaluating a FEL expression.
- `InvalidDocument` - Document-level restriction violated (e.g. forward-only doc executed in reverse).

**Methods:**

- `fn as_str(self: &Self) -> &'static str` - Uppercase wire token for JSON diagnostics.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingErrorCode`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &MappingErrorCode) -> bool`



## formspec_core::runtime_mapping::types::MappingResult

*Struct*

Result of a mapping execution.

**Fields:**
- `direction: MappingDirection` - Direction executed (`Forward` or `Reverse`).
- `output: serde_json::Value` - Output document produced by mapping execution.
- `rules_applied: usize` - Number of rules successfully applied.
- `diagnostics: Vec<MappingDiagnostic>` - Non-fatal diagnostics emitted during execution.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingResult`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::runtime_mapping::types::MappingRule

*Struct*

A mapping rule — one transform in the pipeline.

**Fields:**
- `source_path: Option<String>` - Source path (dot notation).
- `target_path: String` - Target path (dot notation).
- `transform: TransformType` - Transform type.
- `condition: Option<String>` - Optional FEL condition guard.
- `priority: i32` - Priority (higher = earlier in forward).
- `reverse_priority: Option<i32>` - Reverse priority (if different from forward).
- `default: Option<serde_json::Value>` - Fallback value when source resolves to null/absent.
- `bidirectional: bool` - Whether this rule participates in reverse execution (default true).
- `array: Option<ArrayDescriptor>` - Array descriptor for iterating over array source values.
- `reverse: Option<Box<ReverseOverride>>` - Reverse-direction transform override.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingRule`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::runtime_mapping::types::MappingSourceSchema

*Struct*

Versioned external source identity and its inline JSON Schema.

**Fields:**
- `url: String` - Canonical external schema identity.
- `version: String` - Exact external schema version.
- `schema: serde_json::Value` - Inline schema validated by the binding's maintained JSON Schema implementation.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> MappingSourceSchema`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::runtime_mapping::types::ReverseOverride

*Struct*

Reverse-direction transform override.

**Fields:**
- `transform: TransformType` - Replacement transform type to apply in the reverse direction.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ReverseOverride`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::runtime_mapping::types::TransformType

*Enum*

Supported transform types.

**Variants:**
- `Preserve` - Copy value as-is.
- `Drop` - Drop the value (skip this rule).
- `Constant(serde_json::Value)` - Inject a constant value (no source path required).
- `ValueMap{ forward: Vec<(serde_json::Value, serde_json::Value)>, unmapped: UnmappedStrategy }` - Map values through a lookup table.
- `Coerce(CoerceType)` - Coerce to a target type.
- `Expression(String)` - Evaluate a FEL expression.
- `Flatten{ separator: String }` - Flatten nested/array structure to a scalar string using separator.
- `Nest{ separator: String }` - Expand flat string into nested object by splitting on separator.
- `Concat(String)` - FEL expression that must evaluate to a string ($ = source value, full doc in scope).
- `Split(String)` - FEL expression that must return array or object ($ = source value, full doc in scope).

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> TransformType`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::runtime_mapping::types::UnmappedStrategy

*Enum*

Strategy for values not found in a value map.

Spec: mapping/mapping-spec.md §4.6 — ValueMap unmapped strategies.
The spec defines exactly four strategies: "error", "drop", "passthrough", "default".

**Variants:**
- `PassThrough` - `"passthrough"` — copy the source value through unchanged.
- `Drop` - `"drop"` — omit the target field entirely (returns None from apply_value_map).
- `Error` - `"error"` — produce a runtime mapping diagnostic.
- `Default` - `"default"` — use the default value from the rule's `default` property.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> UnmappedStrategy`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &UnmappedStrategy) -> bool`

---

## Source: formspec_core/runtime_mapping/wire_json.md

**formspec_core > runtime_mapping > wire_json**

# Module: runtime_mapping::wire_json

## Contents

**Functions**

- [`mapping_direction_wire`](#mapping_direction_wire) - Serialize [`MappingDirection`] to the wire string (`forward` / `reverse`).
- [`mapping_result_to_json_value`](#mapping_result_to_json_value) - Mapping execute result (`executeMappingRules` / `executeMappingDocument`).
- [`parse_mapping_direction_wire`](#parse_mapping_direction_wire) - Parse wire direction string into [`MappingDirection`].

---

## formspec_core::runtime_mapping::wire_json::mapping_direction_wire

*Function*

Serialize [`MappingDirection`] to the wire string (`forward` / `reverse`).

```rust
fn mapping_direction_wire(d: super::types::MappingDirection) -> &'static str
```



## formspec_core::runtime_mapping::wire_json::mapping_result_to_json_value

*Function*

Mapping execute result (`executeMappingRules` / `executeMappingDocument`).

```rust
fn mapping_result_to_json_value(result: &super::types::MappingResult, style: crate::JsonWireStyle) -> serde_json::Value
```



## formspec_core::runtime_mapping::wire_json::parse_mapping_direction_wire

*Function*

Parse wire direction string into [`MappingDirection`].

```rust
fn parse_mapping_direction_wire(s: &str) -> Result<super::types::MappingDirection, String>
```

---

## Source: formspec_core/schema_validator.md

**formspec_core > schema_validator**

# Module: schema_validator

## Contents

**Structs**

- [`ComponentValidationTarget`](#componentvalidationtarget) - A single component subtree node that needs host-side schema execution.
- [`SchemaValidationError`](#schemavalidationerror) - A schema validation error with path and message.
- [`SchemaValidationPlan`](#schemavalidationplan) - Validation dispatch plan returned to host runtimes that execute JSON Schema locally.
- [`SchemaValidationResult`](#schemavalidationresult) - Result of schema validation.

**Enums**

- [`DocumentType`](#documenttype) - All recognized Formspec document types.

**Functions**

- [`detect_document_type`](#detect_document_type) - Detect the document type from a JSON value by examining marker fields.
- [`json_pointer_to_jsonpath`](#json_pointer_to_jsonpath) - Convert a JSON Pointer (e.g., `/items/0/key`) to a JSONPath (e.g., `$.items\[0\].key`).
- [`schema_validation_plan`](#schema_validation_plan) - Build the validation execution plan for a document.
- [`validate_document`](#validate_document) - Validate a Formspec document, auto-detecting its type and running schema validation.

**Traits**

- [`JsonSchemaValidator`](#jsonschemavalidator) - Trait for JSON Schema validation — implemented by the host/binding layer.

---

## formspec_core::schema_validator::ComponentValidationTarget

*Struct*

A single component subtree node that needs host-side schema execution.

**Fields:**
- `pointer: String` - JSON Pointer to the node root (e.g. `/tree/children/0`).
- `component: String` - Component type string used to pick the correct schema definition.
- `node: serde_json::Value` - Raw node value to validate.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ComponentValidationTarget`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::schema_validator::DocumentType

*Enum*

All recognized Formspec document types.

**Variants:**
- `Definition`
- `Issuer`
- `Theme`
- `Mapping`
- `ValidationMapping`
- `ResponseActions`
- `Ontology`
- `References`
- `Locale`
- `Experience`
- `Component`
- `Response`
- `IntakeHandoff`
- `ValidationReport`
- `ValidationResult`
- `DataSources` - App-level catalog of qualified data source declarations.
- `OutcomeVerificationCase` - Authored outcome procedure and expected-observation document.
- `OutcomeVerificationReport` - Generated outcome comparison report document.
- `Registry`
- `Changelog`
- `FelFunctions`
- `Screener`
- `Determination`
- `Surface` - Surface document per ADR 0150 §6 — composition primitive that names

**Methods:**

- `fn schema_key(self: &Self) -> &'static str` - Schema key for this document type (used as discriminator).
- `fn from_schema_key(key: &str) -> Option<Self>` - Parse the public schema key string used by the TS/Python layers.

**Traits:** Copy, Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> DocumentType`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **PartialEq**
  - `fn eq(self: &Self, other: &DocumentType) -> bool`



## formspec_core::schema_validator::JsonSchemaValidator

*Trait*

Trait for JSON Schema validation — implemented by the host/binding layer.

This allows the WASM layer to use AJV and the PyO3 layer to use jsonschema-rs
without coupling `formspec-core` to either.

**Methods:**

- `validate`: Validate a document against the schema for the given document type.



## formspec_core::schema_validator::SchemaValidationError

*Struct*

A schema validation error with path and message.

**Fields:**
- `path: String` - JSONPath to the invalid element (e.g., `$.items\[0\].key`).
- `message: String` - Human-readable error message.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SchemaValidationError`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::schema_validator::SchemaValidationPlan

*Struct*

Validation dispatch plan returned to host runtimes that execute JSON Schema locally.

**Fields:**
- `document_type: Option<String>` - Detected or explicitly requested document type.
- `mode: String` - Strategy discriminator: `unknown`, `document`, or `component`.
- `component_targets: Vec<ComponentValidationTarget>` - Per-node validation targets for component documents.
- `error: Option<String>` - Populated only for `unknown` mode.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SchemaValidationPlan`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`



## formspec_core::schema_validator::SchemaValidationResult

*Struct*

Result of schema validation.

**Fields:**
- `document_type: Option<DocumentType>` - Detected document type (None if detection failed).
- `errors: Vec<SchemaValidationError>` - Validation errors.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SchemaValidationResult`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_core::schema_validator::detect_document_type

*Function*

Detect the document type from a JSON value by examining marker fields.

```rust
fn detect_document_type(doc: &serde_json::Value) -> Option<DocumentType>
```



## formspec_core::schema_validator::json_pointer_to_jsonpath

*Function*

Convert a JSON Pointer (e.g., `/items/0/key`) to a JSONPath (e.g., `$.items\[0\].key`).

```rust
fn json_pointer_to_jsonpath(pointer: &str) -> String
```



## formspec_core::schema_validator::schema_validation_plan

*Function*

Build the validation execution plan for a document.

Non-component documents validate as a single root document. Component documents use
the same shallow-document + per-node strategy as the host validators to avoid
whole-tree oneOf backtracking.

```rust
fn schema_validation_plan(doc: &serde_json::Value, document_type_override: Option<DocumentType>) -> SchemaValidationPlan
```



## formspec_core::schema_validator::validate_document

*Function*

Validate a Formspec document, auto-detecting its type and running schema validation.

```rust
fn validate_document(doc: &serde_json::Value, validator: &dyn JsonSchemaValidator) -> SchemaValidationResult
```

---

## Source: formspec_core/subject_key.md

**formspec_core > subject_key**

# Module: subject_key

## Contents

**Enums**

- [`SubjectKey`](#subjectkey) - A filed unit's typed key value.

---

## formspec_core::subject_key::SubjectKey

*Enum*

A filed unit's typed key value.

**Variants:**
- `String(String)` - Text preserved verbatim.
- `Integer(i64)` - Signed integer in the I-JSON safe range.

**Methods:**

- `fn is_integer_in_range<T>(value: &T) -> bool` - Checks the inclusive I-JSON bounds for an already integral key.

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> SubjectKey`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &SubjectKey) -> bool`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`

---

## Source: formspec_core/validation_report.md

**formspec_core > validation_report**

# Module: validation_report

## Contents

**Structs**

- [`ValidationReportAssemblyError`](#validationreportassemblyerror) - A finding cannot participate in report assembly.

**Functions**

- [`build_validation_report`](#build_validation_report) - Assemble a validation-report candidate without evaluating or admitting it.
- [`format_diagnostic_report`](#format_diagnostic_report) - Format an assembled validation report into a human-readable diagnostic text report.

---

## formspec_core::validation_report::ValidationReportAssemblyError

*Struct*

A finding cannot participate in report assembly.

**Methods:**

- `fn index(self: &Self) -> usize` - Return the zero-based position of the rejected finding.
- `fn field(self: &Self) -> &'static str` - Return the invalid property, or `$` for a nonobject finding.

**Traits:** Error

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Display**
  - `fn fmt(self: &Self, formatter: & mut fmt::Formatter) -> fmt::Result`



## formspec_core::validation_report::build_validation_report

*Function*

Assemble a validation-report candidate without evaluating or admitting it.

`results` contains qualified, tagged public ValidationResult objects. Findings
retain their order and values. The caller supplies `timestamp` and pins.
Empty optional pins are omitted, also matching JavaScript.

`Ok` is not canonical schema admission. The caller must validate the candidate
against the maintained ValidationReport schema before persistence, submission,
or deriving acceptance from its counts. In particular, internal Definition/cycle
findings must be refused by admission, never dropped or relabeled. Raw evaluator
receipt retention and explicit standard result tagging belong to the caller.

# Examples
```
let candidate = formspec_core::build_validation_report(
    &[], "2026-10-07T00:00:00Z", Some("urn:example"), Some("1.0.0"),
)?;
assert_eq!(candidate["counts"]["error"], 0);
// Admit the candidate with the host's canonical schema validator before use.
# Ok::<(), formspec_core::ValidationReportAssemblyError>(())
```

# Errors
Returns an indexed error for a nonobject finding, a missing or conflicting
`$formspecValidationResult` marker, or a missing/unknown severity. Other schema
violations are the host's admission responsibility.

```rust
fn build_validation_report(results: &[serde_json::Value], timestamp: &str, definition_url: Option<&str>, definition_version: Option<&str>) -> Result<serde_json::Value, ValidationReportAssemblyError>
```



## formspec_core::validation_report::format_diagnostic_report

*Function*

Format an assembled validation report into a human-readable diagnostic text report.

Returns a formatted multi-line string containing the overall validity, counts,
metadata pins, and finding diagnostics.

```rust
fn format_diagnostic_report(report: &serde_json::Value) -> Result<String, String>
```

---

## Source: formspec_core/value_coerce.md

**formspec_core > value_coerce**

# Module: value_coerce

## Contents

**Functions**

- [`coerce_field_value`](#coerce_field_value) - Coerce an inbound field value (whitespace, numeric strings, money shape, `precision` rounding).

---

## formspec_core::value_coerce::coerce_field_value

*Function*

Coerce an inbound field value (whitespace, numeric strings, money shape, `precision` rounding).

Matches TypeScript `coerceFieldValue(item, bind, definition, value)` in `packages/formspec-engine`.

```rust
fn coerce_field_value(item: &fel_core::exact_json::Value, bind: Option<&fel_core::exact_json::Value>, definition: &fel_core::exact_json::Value, value: fel_core::exact_json::Value) -> fel_core::exact_json::Value
```

---

## Source: formspec_core/wire_keys.md

**formspec_core > wire_keys**

# Module: wire_keys

## Contents

**Structs**

- [`ChangelogRootKeys`](#changelogrootkeys) - Top-level changelog object keys for [`crate::json_artifacts::changelog_to_json_value`].

**Functions**

- [`assembly_provenance_keys`](#assembly_provenance_keys) - Keys for [`crate::assembler::assembly_result_to_json_value`] provenance rows + root.
- [`changelog_change_keys`](#changelog_change_keys) - Per-change object keys inside changelog JSON.
- [`changelog_root_keys`](#changelog_root_keys) - Field names for the changelog root object in the given wire style.
- [`evaluation_batch_keys`](#evaluation_batch_keys) - Batch evaluation JSON keys: non-relevant paths, validation `constraintKind`, `shapeId`.
- [`item_location_parent_key`](#item_location_parent_key) - Parent path key for [`crate::path_utils::definition_item_location_to_json_value`].
- [`lint_document_type_key`](#lint_document_type_key) - Document type field for lint result JSON.
- [`mapping_result_host_keys`](#mapping_result_host_keys) - Keys for [`crate::runtime_mapping::mapping_result_to_json_value`].
- [`registry_entry_keys`](#registry_entry_keys) - Keys for [`crate::registry_client::registry_entry_to_json_value`].
- [`registry_parse_summary_keys`](#registry_parse_summary_keys) - Keys for [`crate::registry_client::registry_parse_summary_to_json_value`].

**Constants**

- [`CHANGELOG_MARKER_FIELD`](#changelog_marker_field) - Envelope marker field name for changelog documents.
- [`CHANGELOG_MARKER_VERSION`](#changelog_marker_version) - Value required by `changelog.schema.json` for the marker field (`const: "1.0"`).

---

## formspec_core::wire_keys::CHANGELOG_MARKER_FIELD

*Constant*: `&str`

Envelope marker field name for changelog documents.
Identical across wire styles — JSON envelope markers (`$formspec*`) are
never translated to snake_case, they're document-type discriminators
defined by the schema.



## formspec_core::wire_keys::CHANGELOG_MARKER_VERSION

*Constant*: `&str`

Value required by `changelog.schema.json` for the marker field (`const: "1.0"`).



## formspec_core::wire_keys::ChangelogRootKeys

*Struct*

Top-level changelog object keys for [`crate::json_artifacts::changelog_to_json_value`].

**Fields:**
- `marker: &'static str`
- `marker_version: &'static str`
- `definition_url: &'static str`
- `from_version: &'static str`
- `to_version: &'static str`
- `semver_impact: &'static str`



## formspec_core::wire_keys::assembly_provenance_keys

*Function*

Keys for [`crate::assembler::assembly_result_to_json_value`] provenance rows + root.

```rust
fn assembly_provenance_keys(style: JsonWireStyle) -> (&'static str, &'static str)
```



## formspec_core::wire_keys::changelog_change_keys

*Function*

Per-change object keys inside changelog JSON.

```rust
fn changelog_change_keys(style: JsonWireStyle) -> (&'static str, &'static str)
```



## formspec_core::wire_keys::changelog_root_keys

*Function*

Field names for the changelog root object in the given wire style.

```rust
fn changelog_root_keys(style: JsonWireStyle) -> ChangelogRootKeys
```



## formspec_core::wire_keys::evaluation_batch_keys

*Function*

Batch evaluation JSON keys: non-relevant paths, validation `constraintKind`, `shapeId`.

```rust
fn evaluation_batch_keys(style: JsonWireStyle) -> (&'static str, &'static str, &'static str)
```



## formspec_core::wire_keys::item_location_parent_key

*Function*

Parent path key for [`crate::path_utils::definition_item_location_to_json_value`].

```rust
fn item_location_parent_key(style: JsonWireStyle) -> &'static str
```



## formspec_core::wire_keys::lint_document_type_key

*Function*

Document type field for lint result JSON.

```rust
fn lint_document_type_key(style: JsonWireStyle) -> &'static str
```



## formspec_core::wire_keys::mapping_result_host_keys

*Function*

Keys for [`crate::runtime_mapping::mapping_result_to_json_value`].

```rust
fn mapping_result_host_keys(style: JsonWireStyle) -> (&'static str, &'static str, &'static str, &'static str, &'static str)
```



## formspec_core::wire_keys::registry_entry_keys

*Function*

Keys for [`crate::registry_client::registry_entry_to_json_value`].

```rust
fn registry_entry_keys(style: JsonWireStyle) -> (&'static str, &'static str)
```



## formspec_core::wire_keys::registry_parse_summary_keys

*Function*

Keys for [`crate::registry_client::registry_parse_summary_to_json_value`].

```rust
fn registry_parse_summary_keys(style: JsonWireStyle) -> (&'static str, &'static str)
```

---
