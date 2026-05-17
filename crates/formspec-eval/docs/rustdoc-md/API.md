# formspec-eval — generated API (Markdown)

> Do not edit by hand; regenerate via npm script / cargo doc-md + this bundler.

Bundled from [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md). Nested module paths are preserved in headings. Relative links may not resolve; search by heading.

---

## doc-md index

# Documentation Index

Generated markdown documentation for this project.

## Dependencies (1)

- [`formspec-eval`](formspec_eval/index.md)

---

Generated with [cargo-doc-md](https://github.com/Crazytieguy/cargo-doc-md)

---

## Source: formspec_eval/index.md

# formspec_eval

Formspec Definition Evaluator — 4-phase batch processor.

## Layout
The main path is [`pipeline::evaluate`] with [`EvalOptions`]:
1. [`mod@rebuild`] — definition → item tree, initial values, repeat expansion, wildcard binds
2. [`mod@recalculate`] — relevance, required, readonly, variables, calculate ([`recalculate()`])
3. [`mod@revalidate`] — required/type/constraint, extensions, shapes ([`revalidate()`])
4. [`mod@nrb`] — output shaping for non-relevant fields

Cross-cutting: [`mod@convert`] (path resolution), private `fel_json` (money-aware JSON→`Value` for env fields),
private `runtime_seed` (prePopulate / previous non-relevant). [`mod@screener_eval`] evaluates standalone screener documents.

## Documentation

- Human overview: crate `README.md` (phases, API map, context).
- API reference: `cargo doc -p formspec-eval --no-deps --open`.
- Markdown API export: `docs/rustdoc-md/API.md` (regenerate with `npm run docs:formspec-eval`).

## Modules

### [`formspec_eval`](formspec_eval.md)

*7 modules*

### [`convert`](convert.md)

*1 function*

### [`eval_json`](eval_json.md)

*1 struct, 4 functions*

### [`eval_options`](eval_options.md)

*1 struct*

### [`nrb`](nrb.md)

*2 functions*

### [`pipeline`](pipeline.md)

*1 function*

### [`rebuild::item_tree`](rebuild/item_tree.md)

*2 functions*

### [`rebuild::repeat_data`](rebuild/repeat_data.md)

*1 function*

### [`rebuild::repeat_expand`](rebuild/repeat_expand.md)

*1 function*

### [`recalculate`](recalculate.md)

*1 function*

### [`recalculate::variables`](recalculate/variables.md)

*1 function*

### [`registry_constraints`](registry_constraints.md)

*1 function*

### [`revalidate`](revalidate.md)

*1 function*

### [`screener_eval`](screener_eval.md)

*1 function*

### [`types`](types.md)

*1 module*

### [`types::definition`](types/definition.md)

*1 struct*

### [`types::determination`](types/determination.md)

*1 function, 5 enums, 8 structs*

### [`types::evaluation`](types/evaluation.md)

*1 enum, 3 structs*

### [`types::extensions`](types/extensions.md)

*1 struct*

### [`types::item_tree`](types/item_tree.md)

*1 struct*

### [`types::modes`](types/modes.md)

*3 enums*

### [`types::taxonomy`](types/taxonomy.md)

*4 enums*

---

## Source: formspec_eval/formspec_eval.md

**formspec_eval**

# Module: formspec_eval

## Contents

**Modules**

- [`convert`](#convert) - Value resolution helpers for dotted paths and nested objects.
- [`nrb`](#nrb) - Phase 4: NRB (Non-Relevant Behavior) application.
- [`rebuild`](#rebuild) - Phase 1: Rebuild — build the item tree from a definition JSON.
- [`recalculate`](#recalculate) - Phase 2: Recalculate — evaluate computed values and bind expressions.
- [`revalidate`](#revalidate) - Phase 3: Revalidate — validate all constraints and shapes.
- [`screener_eval`](#screener_eval) - Standalone Screener Document evaluation — full pipeline per screener-spec.md §10.
- [`types`](#types) - Core types for the Formspec evaluator.

---

## Module: convert

Value resolution helpers for dotted paths and nested objects.



## Module: nrb

Phase 4: NRB (Non-Relevant Behavior) application.



## Module: rebuild

Phase 1: Rebuild — build the item tree from a definition JSON.



## Module: recalculate

Phase 2: Recalculate — evaluate computed values and bind expressions.

Submodules follow data flow: `json_fel` (coercion) → `variables` / `repeats` →
`bind_pass` (relevance, required, readonly, whitespace) → `calculate_pass` (fixpoint).



## Module: revalidate

Phase 3: Revalidate — validate all constraints and shapes.



## Module: screener_eval

Standalone Screener Document evaluation — full pipeline per screener-spec.md §10.

Replaces the embedded-screener first-match-only `evaluate_screener` with a
multi-phase, multi-strategy pipeline that produces a Determination Record.



## Module: types

Core types for the Formspec evaluator.

---

## Source: formspec_eval/convert.md

**formspec_eval > convert**

# Module: convert

## Contents

**Functions**

- [`resolve_value_by_path`](#resolve_value_by_path) - Resolve a value from a flat HashMap by dotted path, walking nested objects if needed.

---

## formspec_eval::convert::resolve_value_by_path

*Function*

Resolve a value from a flat HashMap by dotted path, walking nested objects if needed.
Returns an owned Value because the result may not exist in the HashMap.

```rust
fn resolve_value_by_path(values: &std::collections::HashMap<String, serde_json::Value>, path: &str) -> serde_json::Value
```

---

## Source: formspec_eval/eval_json.md

**formspec_eval > eval_json**

# Module: eval_json

## Contents

**Structs**

- [`EvalHostContextBundle`](#evalhostcontextbundle) - Parsed WASM / JSON evaluation context bundle.

**Functions**

- [`eval_context_from_json_object`](#eval_context_from_json_object) - Parses [`EvalContext`] fields from a host JSON object (clock, prior validations, `repeatCounts`, …).
- [`eval_host_context_from_json_map`](#eval_host_context_from_json_map) - Parse the optional JSON context object passed to `evaluateDefinition` from JavaScript.
- [`evaluation_result_to_json_value`](#evaluation_result_to_json_value) - Full batch evaluation output as JSON (matches `evaluateDefinition` WASM shape, camelCase).
- [`evaluation_result_to_json_value_styled`](#evaluation_result_to_json_value_styled) - Serialize [`EvaluationResult`] for host bindings (`JsCamel` vs `PythonSnake` keys).

---

## formspec_eval::eval_json::EvalHostContextBundle

*Struct*

Parsed WASM / JSON evaluation context bundle.

**Fields:**
- `context: crate::types::EvalContext` - Clock, prior validations, and prior non-relevant paths.
- `trigger: crate::types::EvalTrigger` - Shape-rule timing for this batch (`submit` / `continuous` / …).
- `instances: std::collections::HashMap<String, serde_json::Value>` - Named instance payloads merged into the FEL environment.
- `constraints: Vec<crate::types::ExtensionConstraint>` - Extension constraints derived from optional registry documents in the context object.



## formspec_eval::eval_json::eval_context_from_json_object

*Function*

Parses [`EvalContext`] fields from a host JSON object (clock, prior validations, `repeatCounts`, …).

Trigger, `instances`, and registry documents are not read; use [`eval_host_context_from_json_map`] for the full bundle.

```rust
fn eval_context_from_json_object(ctx_obj: &serde_json::Map<String, serde_json::Value>) -> Result<crate::types::EvalContext, String>
```



## formspec_eval::eval_json::eval_host_context_from_json_map

*Function*

Parse the optional JSON context object passed to `evaluateDefinition` from JavaScript.

```rust
fn eval_host_context_from_json_map(ctx_obj: &serde_json::Map<String, serde_json::Value>) -> Result<EvalHostContextBundle, String>
```



## formspec_eval::eval_json::evaluation_result_to_json_value

*Function*

Full batch evaluation output as JSON (matches `evaluateDefinition` WASM shape, camelCase).

```rust
fn evaluation_result_to_json_value(result: &crate::types::EvaluationResult) -> serde_json::Value
```



## formspec_eval::eval_json::evaluation_result_to_json_value_styled

*Function*

Serialize [`EvaluationResult`] for host bindings (`JsCamel` vs `PythonSnake` keys).

```rust
fn evaluation_result_to_json_value_styled(result: &crate::types::EvaluationResult, style: formspec_core::JsonWireStyle) -> serde_json::Value
```

---

## Source: formspec_eval/eval_options.md

**formspec_eval > eval_options**

# Module: eval_options

## Contents

**Structs**

- [`EvalOptions`](#evaloptions) - Options for a single definition evaluation ([`crate::pipeline::evaluate`]).

---

## formspec_eval::eval_options::EvalOptions

*Struct*

Options for a single definition evaluation ([`crate::pipeline::evaluate`]).

**Fields:**
- `trigger: crate::types::EvalTrigger` - When to evaluate shape rules.
- `extension_constraints: Vec<crate::types::ExtensionConstraint>` - Extension constraints resolved from registry documents.
- `instances: std::collections::HashMap<String, serde_json::Value>` - Named instance payloads for pre-populate and `@instance()`.
- `context: crate::types::EvalContext` - Runtime context (now, prior validations, repeat counts).

**Methods:**

- `fn new() -> Self` - Create options with defaults (continuous trigger, empty instances/constraints).
- `fn trigger(self: Self, trigger: EvalTrigger) -> Self` - Set shape evaluation timing.
- `fn extension_constraints(self: Self, constraints: Vec<ExtensionConstraint>) -> Self` - Replace extension constraints from registries.
- `fn instances(self: Self, instances: HashMap<String, Value>) -> Self` - Set named instance payloads.
- `fn context(self: Self, context: EvalContext) -> Self` - Set runtime evaluation context.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> EvalOptions`
- **Default**
  - `fn default() -> Self`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`

---

## Source: formspec_eval/nrb.md

**formspec_eval > nrb**

# Module: nrb

## Contents

**Functions**

- [`apply_nrb`](#apply_nrb) - Apply NRB to non-relevant fields.
- [`resolve_nrb`](#resolve_nrb) - Get the NRB mode for a given path using the lookup precedence:

---

## formspec_eval::nrb::apply_nrb

*Function*

Apply NRB to non-relevant fields.

```rust
fn apply_nrb(values: & mut std::collections::HashMap<String, serde_json::Value>, items: &[crate::types::ItemInfo], definition_default: &str)
```



## formspec_eval::nrb::resolve_nrb

*Function*

Get the NRB mode for a given path using the lookup precedence:
exact path -> wildcard -> stripped indices -> parent -> definition default.

```rust
fn resolve_nrb(path: &str, items: &[crate::types::ItemInfo], definition_default: &str) -> crate::types::NrbMode
```

---

## Source: formspec_eval/pipeline.md

**formspec_eval > pipeline**

# Module: pipeline

## Contents

**Functions**

- [`evaluate`](#evaluate) - Evaluate a definition through the full four-phase pipeline.

---

## formspec_eval::pipeline::evaluate

*Function*

Evaluate a definition through the full four-phase pipeline.

```rust
fn evaluate(definition: &serde_json::Value, data: &std::collections::HashMap<String, serde_json::Value>, options: &crate::eval_options::EvalOptions) -> crate::types::EvaluationResult
```

---

## Source: formspec_eval/rebuild/item_tree.md

**formspec_eval > rebuild > item_tree**

# Module: rebuild::item_tree

## Contents

**Functions**

- [`parse_variables`](#parse_variables) - Parse variables from definition JSON.
- [`rebuild_item_tree`](#rebuild_item_tree) - Build the item tree from a definition JSON.

---

## formspec_eval::rebuild::item_tree::parse_variables

*Function*

Parse variables from definition JSON.

```rust
fn parse_variables(definition: &serde_json::Value) -> Vec<crate::types::VariableDef>
```



## formspec_eval::rebuild::item_tree::rebuild_item_tree

*Function*

Build the item tree from a definition JSON.

```rust
fn rebuild_item_tree(definition: &serde_json::Value) -> Vec<crate::types::ItemInfo>
```

---

## Source: formspec_eval/rebuild/repeat_data.md

**formspec_eval > rebuild > repeat_data**

# Module: rebuild::repeat_data

## Contents

**Functions**

- [`expand_wildcard_path`](#expand_wildcard_path) - Expand wildcard paths against actual repeat data.

---

## formspec_eval::rebuild::repeat_data::expand_wildcard_path

*Function*

Expand wildcard paths against actual repeat data.
For example, `items[*].total` with 3 items returns:
`["items[0].total", "items[1].total", "items[2].total"]`

```rust
fn expand_wildcard_path(pattern: &str, data: &std::collections::HashMap<String, serde_json::Value>) -> Vec<String>
```

---

## Source: formspec_eval/rebuild/repeat_expand.md

**formspec_eval > rebuild > repeat_expand**

# Module: rebuild::repeat_expand

## Contents

**Functions**

- [`expand_repeat_instances`](#expand_repeat_instances) - Expand repeatable groups into concrete indexed instances based on data.

---

## formspec_eval::rebuild::repeat_expand::expand_repeat_instances

*Function*

Expand repeatable groups into concrete indexed instances based on data.

For each repeatable group, counts instances in data and clones the
template children N times with indexed paths: `group[0].child`, `group[1].child`.

```rust
fn expand_repeat_instances(items: & mut [crate::types::ItemInfo], data: &std::collections::HashMap<String, serde_json::Value>)
```

---

## Source: formspec_eval/recalculate.md

**formspec_eval > recalculate**

# Module: recalculate

## Contents

**Functions**

- [`recalculate`](#recalculate) - Recalculate all computed values with full processing model.

---

## formspec_eval::recalculate::recalculate

*Function*

Recalculate all computed values with full processing model.

```rust
fn recalculate(items: & mut [crate::types::ItemInfo], data: &std::collections::HashMap<String, serde_json::Value>, definition: &serde_json::Value, now_iso: Option<&str>, previous_validations: Option<&[crate::types::ValidationResult]>, instances: &std::collections::HashMap<String, serde_json::Value>) -> (std::collections::HashMap<String, serde_json::Value>, std::collections::HashMap<String, serde_json::Value>, Option<String>)
```

---

## Source: formspec_eval/recalculate/variables.md

**formspec_eval > recalculate > variables**

# Module: recalculate::variables

## Contents

**Functions**

- [`topo_sort_variables`](#topo_sort_variables) - Topologically sort variables by their dependencies.

---

## formspec_eval::recalculate::variables::topo_sort_variables

*Function*

Topologically sort variables by their dependencies.

```rust
fn topo_sort_variables(variables: &[crate::types::VariableDef]) -> Result<Vec<String>, String>
```

---

## Source: formspec_eval/registry_constraints.md

**formspec_eval > registry_constraints**

# Module: registry_constraints

## Contents

**Functions**

- [`extension_constraints_from_registry_documents`](#extension_constraints_from_registry_documents) - Extract extension constraint payloads from raw registry documents (`entries` arrays).

---

## formspec_eval::registry_constraints::extension_constraints_from_registry_documents

*Function*

Extract extension constraint payloads from raw registry documents (`entries` arrays).

```rust
fn extension_constraints_from_registry_documents(docs: &[serde_json::Value]) -> Vec<crate::ExtensionConstraint>
```

---

## Source: formspec_eval/revalidate.md

**formspec_eval > revalidate**

# Module: revalidate

## Contents

**Functions**

- [`revalidate`](#revalidate) - Validate all constraints and shapes.

---

## formspec_eval::revalidate::revalidate

*Function*

Validate all constraints and shapes.

```rust
fn revalidate(items: &[crate::types::ItemInfo], values: &std::collections::HashMap<String, serde_json::Value>, variables: &std::collections::HashMap<String, serde_json::Value>, shapes: Option<&[serde_json::Value]>, trigger: crate::types::EvalTrigger, extension_constraints: &[crate::types::ExtensionConstraint], formspec_version: &str, now_iso: Option<&str>, repeat_counts: Option<&std::collections::HashMap<String, u64>>, instances: &std::collections::HashMap<String, serde_json::Value>) -> Vec<crate::types::ValidationResult>
```

---

## Source: formspec_eval/screener_eval.md

**formspec_eval > screener_eval**

# Module: screener_eval

## Contents

**Functions**

- [`evaluate_screener_document`](#evaluate_screener_document) - Evaluate a standalone Screener Document against respondent inputs.

---

## formspec_eval::screener_eval::evaluate_screener_document

*Function*

Evaluate a standalone Screener Document against respondent inputs.

Implements the full pipeline from screener-spec.md §10:
1. Availability check
2. Build FEL environment from answers
3. Hoist and evaluate override routes
4. Evaluate phases by strategy
5. Assemble Determination Record

```rust
fn evaluate_screener_document(screener: &serde_json::Value, answers: &std::collections::HashMap<String, crate::types::determination::AnswerInput>, now_iso: Option<&str>) -> crate::types::determination::DeterminationRecord
```

---

## Source: formspec_eval/types.md

**formspec_eval > types**

# Module: types

## Contents

**Modules**

- [`determination`](#determination) - Determination Record types — structured output of screener evaluation.

---

## Module: determination

Determination Record types — structured output of screener evaluation.

Maps directly to `schemas/determination.schema.json`. All types derive
`Serialize` for JSON output via serde.

---

## Source: formspec_eval/types/definition.md

**formspec_eval > types > definition**

# Module: types::definition

## Contents

**Structs**

- [`VariableDef`](#variabledef) - A definition variable with optional scope.

---

## formspec_eval::types::definition::VariableDef

*Struct*

A definition variable with optional scope.

**Fields:**
- `name: String` - Variable name as declared in `variables`.
- `expression: String` - FEL expression body (after optional `=` prefix stripped upstream).
- `scope: Option<String>` - Optional dotted path limiting where the variable is visible.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> VariableDef`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`

---

## Source: formspec_eval/types/determination.md

**formspec_eval > types > determination**

# Module: types::determination

## Contents

**Structs**

- [`AnswerInput`](#answerinput) - Input for a single screener item — value + answer state.
- [`DeterminationRecord`](#determinationrecord) - The complete evaluation output of a Screener Document.
- [`InputEntry`](#inputentry) - A screener item's value and answer state at evaluation time.
- [`OverrideBlock`](#overrideblock) - Override evaluation results.
- [`PhaseResult`](#phaseresult) - Result of evaluating a single phase.
- [`RouteResult`](#routeresult) - A single route's evaluation outcome.
- [`ScreenerRef`](#screenerref) - Reference to the screener that produced a Determination Record.
- [`ValidityBlock`](#validityblock) - Expiration metadata derived from `resultValidity`.

**Enums**

- [`AnswerState`](#answerstate) - Answer state for a screener item input.
- [`DeterminationStatus`](#determinationstatus) - Top-level determination status on the wire.
- [`EliminationReason`](#eliminationreason) - Why an eliminated route did not match.
- [`PhaseStatus`](#phasestatus) - Per-phase evaluation status on the wire.
- [`PhaseStrategy`](#phasestrategy) - Phase evaluation strategy (built-ins + screener-declared extensions).

**Functions**

- [`parse_answer_state`](#parse_answer_state) - Parse a wire string into an [`AnswerState`]. Unknown values fall back to

---

## formspec_eval::types::determination::AnswerInput

*Struct*

Input for a single screener item — value + answer state.

**Fields:**
- `value: serde_json::Value` - The item's value (any JSON value).
- `state: AnswerState` - Answer state.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> AnswerInput`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_eval::types::determination::AnswerState

*Enum*

Answer state for a screener item input.

**Variants:**
- `Answered` - Respondent provided a value.
- `Declined` - Item presented but respondent declined to answer.
- `NotPresented` - Item not shown (e.g. relevance was false).

**Methods:**

- `fn as_str(self: &Self) -> &'static str` - Convert to the schema string representation.

**Traits:** Eq, Copy

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &AnswerState) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> AnswerState`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_eval::types::determination::DeterminationRecord

*Struct*

The complete evaluation output of a Screener Document.

**Fields:**
- `marker: String` - Marker field. Always `"1.0"`.
- `screener: ScreenerRef` - Reference to the screener that produced this record.
- `timestamp: String` - ISO 8601 datetime when evaluation completed.
- `evaluation_version: String` - Version of evaluation logic applied (reflects evaluationBinding).
- `status: DeterminationStatus` - `completed`, `partial`, `expired`, or `unavailable`.
- `overrides: OverrideBlock` - Override route evaluation results.
- `phases: Vec<PhaseResult>` - Per-phase evaluation results. Empty if overrides halted.
- `inputs: std::collections::HashMap<String, InputEntry>` - Item path → input entry for every screener item.
- `validity: Option<ValidityBlock>` - Present when screener declares `resultValidity`.
- `extensions: Option<serde_json::Value>` - Extension data.

**Trait Implementations:**

- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> DeterminationRecord`



## formspec_eval::types::determination::DeterminationStatus

*Enum*

Top-level determination status on the wire.

**Variants:**
- `Completed`
- `Partial`
- `Expired`
- `Unavailable`

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str`
- `fn parse_wire(s: &str) -> Option<Self>`

**Traits:** Copy, Eq

**Trait Implementations:**

- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **PartialEq**
  - `fn eq(self: &Self, other: &DeterminationStatus) -> bool`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> DeterminationStatus`
- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`



## formspec_eval::types::determination::EliminationReason

*Enum*

Why an eliminated route did not match.

**Variants:**
- `ConditionFalse`
- `BelowThreshold`
- `MaxExceeded`
- `NullScore`
- `ExpressionError`

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str`
- `fn parse_wire(s: &str) -> Option<Self>`

**Traits:** Eq, Copy

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &EliminationReason) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> EliminationReason`
- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`
- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`



## formspec_eval::types::determination::InputEntry

*Struct*

A screener item's value and answer state at evaluation time.

**Fields:**
- `value: serde_json::Value` - The item's value (any JSON type, null when declined/not-presented).
- `state: AnswerState` - Answer state at evaluation time.

**Trait Implementations:**

- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> InputEntry`



## formspec_eval::types::determination::OverrideBlock

*Struct*

Override evaluation results.

**Fields:**
- `matched: Vec<RouteResult>` - Override routes that fired.
- `halted: bool` - `true` if a terminal override halted the pipeline.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> OverrideBlock`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_eval::types::determination::PhaseResult

*Struct*

Result of evaluating a single phase.

**Fields:**
- `id: String` - Phase identifier.
- `status: PhaseStatus` - `evaluated`, `skipped`, or `unsupported-strategy`.
- `strategy: PhaseStrategy` - Strategy used.
- `matched: Vec<RouteResult>` - Routes that matched.
- `eliminated: Vec<RouteResult>` - Routes that did not match.
- `warnings: Vec<String>` - Phase-level warnings (e.g. `"below-minimum"`). Always present (empty array when none).

**Trait Implementations:**

- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> PhaseResult`



## formspec_eval::types::determination::PhaseStatus

*Enum*

Per-phase evaluation status on the wire.

**Variants:**
- `Evaluated`
- `Skipped`
- `UnsupportedStrategy`

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str`
- `fn parse_wire(s: &str) -> Option<Self>`

**Traits:** Eq, Copy

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &PhaseStatus) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> PhaseStatus`
- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`
- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`



## formspec_eval::types::determination::PhaseStrategy

*Enum*

Phase evaluation strategy (built-ins + screener-declared extensions).

**Variants:**
- `FirstMatch`
- `FanOut`
- `ScoreThreshold`
- `Other(String)` - Any other strategy id from the screener document (including `x-*`).

**Methods:**

- `fn from_wire<impl Into<String>>(s: impl Trait) -> Self`
- `fn as_wire_str(self: &Self) -> Cow<str>`

**Traits:** Eq

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`
- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`
- **Clone**
  - `fn clone(self: &Self) -> PhaseStrategy`
- **PartialEq**
  - `fn eq(self: &Self, other: &PhaseStrategy) -> bool`



## formspec_eval::types::determination::RouteResult

*Struct*

A single route's evaluation outcome.

**Fields:**
- `target: String` - Route target URI.
- `label: Option<String>` - Human-readable label.
- `message: Option<String>` - Respondent-facing message.
- `score: Option<f64>` - Computed score (score-threshold only).
- `reason: Option<EliminationReason>` - Elimination reason (eliminated routes only).
- `metadata: Option<serde_json::Value>` - Arbitrary metadata from the route.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> RouteResult`
- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`



## formspec_eval::types::determination::ScreenerRef

*Struct*

Reference to the screener that produced a Determination Record.

**Fields:**
- `url: String` - Canonical URI of the screener.
- `version: String` - Semantic version of the screener.

**Trait Implementations:**

- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> ScreenerRef`



## formspec_eval::types::determination::ValidityBlock

*Struct*

Expiration metadata derived from `resultValidity`.

**Fields:**
- `valid_until: String` - When this record expires (timestamp + resultValidity).
- `result_validity: String` - The original ISO 8601 duration from the screener.

**Trait Implementations:**

- **Serialize**
  - `fn serialize<__S>(self: &Self, __serializer: __S) -> _serde::__private228::Result<<__S as >::Ok, <__S as >::Error>`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> ValidityBlock`



## formspec_eval::types::determination::parse_answer_state

*Function*

Parse a wire string into an [`AnswerState`]. Unknown values fall back to
[`AnswerState::Answered`] — shared by the WASM and Python bindings so the
two surfaces cannot silently disagree on screener answer-state semantics.

```rust
fn parse_answer_state(s: &str) -> AnswerState
```

---

## Source: formspec_eval/types/evaluation.md

**formspec_eval > types > evaluation**

# Module: types::evaluation

## Contents

**Structs**

- [`EvalContext`](#evalcontext) - Optional runtime context injected into a single evaluation cycle.
- [`EvaluationResult`](#evaluationresult) - Result of the full evaluation cycle.
- [`ValidationResult`](#validationresult) - Validation result for a single field.

**Enums**

- [`EvalTrigger`](#evaltrigger) - When to evaluate shape rules.

---

## formspec_eval::types::evaluation::EvalContext

*Struct*

Optional runtime context injected into a single evaluation cycle.

**Fields:**
- `now_iso: Option<String>` - Wall-clock instant for FEL `now()` / date helpers (ISO-8601 string).
- `previous_validations: Option<Vec<ValidationResult>>` - Prior cycle validation results (e.g. for host-driven revalidation hints).
- `previous_non_relevant: Option<Vec<String>>` - Paths that were non-relevant in the prior evaluation cycle.
- `repeat_counts: Option<std::collections::HashMap<String, u64>>` - Authoritative repeat row counts by **group base path** (e.g. `items`), when the host

**Trait Implementations:**

- **Default**
  - `fn default() -> EvalContext`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> EvalContext`



## formspec_eval::types::evaluation::EvalTrigger

*Enum*

When to evaluate shape rules.

**Variants:**
- `Continuous` - Evaluate only shapes with timing "continuous" (or no timing).
- `Submit` - Evaluate shapes with timing "continuous" or "submit" (skip "demand").
- `Demand` - Evaluate only shapes with timing "demand".
- `Disabled` - Skip all shape evaluation.

**Methods:**

- `fn from_python_eval_def_option(trigger: Option<&str>) -> Self` - Python `evaluate_def` trigger strings (`submit` / `disabled` / default → continuous).

**Traits:** Eq, Copy

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &EvalTrigger) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> EvalTrigger`



## formspec_eval::types::evaluation::EvaluationResult

*Struct*

Result of the full evaluation cycle.

**Fields:**
- `values: std::collections::HashMap<String, serde_json::Value>` - All field values after recalculation (post-NRB).
- `validations: Vec<ValidationResult>` - Validation results.
- `non_relevant: Vec<String>` - Fields marked non-relevant.
- `variables: std::collections::HashMap<String, serde_json::Value>` - Evaluated variable values.
- `required: std::collections::HashMap<String, bool>` - Required state by path.
- `readonly: std::collections::HashMap<String, bool>` - Readonly state by path.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> EvaluationResult`



## formspec_eval::types::evaluation::ValidationResult

*Struct*

Validation result for a single field.

**Fields:**
- `path: String` - Path to the field.
- `severity: super::taxonomy::Severity` - Severity: error, warning, info.
- `constraint_kind: super::taxonomy::ConstraintKind` - Constraint kind: required, constraint, type, cardinality, shape.
- `code: super::taxonomy::ValidationCode` - Validation code: REQUIRED, CONSTRAINT_FAILED, TYPE_MISMATCH, etc.
- `message: String` - Human-readable message.
- `constraint: Option<String>` - Original constraint expression when available.
- `source: super::taxonomy::ValidationSource` - Source of the validation: bind, shape, definition.
- `shape_id: Option<String>` - Shape ID (for shape validations only).
- `context: Option<std::collections::HashMap<String, serde_json::Value>>` - Evaluated shape failure context values.

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> ValidationResult`
- **PartialEq**
  - `fn eq(self: &Self, other: &ValidationResult) -> bool`

---

## Source: formspec_eval/types/extensions.md

**formspec_eval > types > extensions**

# Module: types::extensions

## Contents

**Structs**

- [`ExtensionConstraint`](#extensionconstraint) - Pre-parsed extension constraint data from a registry entry.

---

## formspec_eval::types::extensions::ExtensionConstraint

*Struct*

Pre-parsed extension constraint data from a registry entry.
Passed into the evaluator from the PyO3 layer — no registry parsing here.

**Fields:**
- `name: String` - Extension name (e.g. "x-formspec-email").
- `display_name: Option<String>` - Display name for human-readable messages (e.g. "Email address").
- `pattern: Option<String>` - Regex pattern constraint (anchored).
- `max_length: Option<u64>` - Maximum string length.
- `minimum: Option<f64>` - Minimum numeric value.
- `maximum: Option<f64>` - Maximum numeric value.
- `base_type: Option<String>` - Base data type this extension expects (e.g. "string", "decimal").
- `status: String` - Lifecycle status: "stable", "deprecated", "retired", "draft".
- `deprecation_notice: Option<String>` - Deprecation notice text (when status is "deprecated").
- `compatibility_version: Option<String>` - Formspec version compatibility range (e.g. ">=1.0.0 <2.0.0").

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **Clone**
  - `fn clone(self: &Self) -> ExtensionConstraint`

---

## Source: formspec_eval/types/item_tree.md

**formspec_eval > types > item_tree**

# Module: types::item_tree

## Contents

**Structs**

- [`ItemInfo`](#iteminfo) - A node in the evaluation item tree.

---

## formspec_eval::types::item_tree::ItemInfo

*Struct*

A node in the evaluation item tree.

**Fields:**
- `key: String` - Item key (leaf name, not full path).
- `path: String` - Full dotted path from root (e.g. "address.city").
- `item_type: String` - Normalized item type ("field", "group", "display", etc.).
- `data_type: Option<String>` - Data type (string, number, boolean, date, etc.).
- `currency: Option<String>` - Fixed currency for money fields, or the definition default currency.
- `value: serde_json::Value` - Current value.
- `relevant: bool` - Whether the item is relevant (visible).
- `required: bool` - Whether the item is required.
- `readonly: bool` - Whether the item is readonly.
- `calculate: Option<String>` - Calculated expression (if any).
- `precision: Option<u32>` - Numeric precision for calculated values.
- `constraint: Option<String>` - Constraint expression (if any).
- `constraint_message: Option<String>` - Author-provided constraint failure message (if any).
- `relevance: Option<String>` - Relevance expression (if any).
- `required_expr: Option<String>` - Required expression (if any).
- `readonly_expr: Option<String>` - Readonly expression (if any).
- `whitespace: Option<super::modes::WhitespaceMode>` - Whitespace normalization mode (if any).
- `nrb: Option<super::modes::NrbMode>` - Non-relevant behavior override for this bind.
- `excluded_value: Option<super::modes::ExcludedValueMode>` - Excluded value behavior when non-relevant.
- `default_value: Option<serde_json::Value>` - Default value to apply on non-relevant → relevant transition when field is empty.
- `default_expression: Option<String>` - FEL expression default (without `=` prefix) for relevance transitions.
- `initial_value: Option<serde_json::Value>` - Initial value for field seeding (literal or "=expr").
- `prev_relevant: bool` - Previous relevance state (for tracking transitions).
- `parent_path: Option<String>` - Parent path (None for top-level items).
- `repeatable: bool` - Whether this group is repeatable.
- `repeat_min: Option<u64>` - Minimum repeat count (for repeatable groups).
- `repeat_max: Option<u64>` - Maximum repeat count (for repeatable groups).
- `option_values: Vec<String>` - Valid option values for choice/multiChoice fields.
- `accept_types: Vec<String>` - Accepted MIME types for attachment fields (e.g. ["image/*", "application/pdf"]).
- `extensions: Vec<String>` - Extension names declared on this item (only enabled ones, value=true).
- `pre_populate_instance: Option<String>` - Pre-populate instance name (e.g. "userProfile").
- `pre_populate_path: Option<String>` - Pre-populate path within the instance (e.g. "contactEmail").
- `children: Vec<ItemInfo>` - Child items.

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ItemInfo`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`

---

## Source: formspec_eval/types/modes.md

**formspec_eval > types > modes**

# Module: types::modes

## Contents

**Enums**

- [`ExcludedValueMode`](#excludedvaluemode) - Excluded-value behavior when a field is non-relevant.
- [`NrbMode`](#nrbmode) - NRB (Non-Relevant Behavior) mode.
- [`WhitespaceMode`](#whitespacemode) - Whitespace normalization mode.

---

## formspec_eval::types::modes::ExcludedValueMode

*Enum*

Excluded-value behavior when a field is non-relevant.

**Variants:**
- `Null` - Hide from shapes / env as null.
- `Keep` - Keep current value visible to cross-field rules.

**Methods:**

- `fn parse_wire(s: &str) -> Option<Self>` - Parse definition/bind wire value; unknown strings are rejected.
- `fn as_wire_str(self: Self) -> &'static str`

**Traits:** Eq, Copy

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &ExcludedValueMode) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> ExcludedValueMode`



## formspec_eval::types::modes::NrbMode

*Enum*

NRB (Non-Relevant Behavior) mode.

**Variants:**
- `Remove` - Remove the field from output data.
- `Empty` - Set the field to null.
- `Keep` - Leave the field value unchanged.

**Traits:** Copy

**Trait Implementations:**

- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &NrbMode) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> NrbMode`



## formspec_eval::types::modes::WhitespaceMode

*Enum*

Whitespace normalization mode.

**Variants:**
- `Trim` - Strip leading and trailing Unicode whitespace.
- `Normalize` - Collapse internal runs of whitespace to a single ASCII space.
- `Remove` - Remove all Unicode whitespace characters.
- `Preserve` - Leave string values unchanged.

**Traits:** Copy

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &WhitespaceMode) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> WhitespaceMode`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`

---

## Source: formspec_eval/types/taxonomy.md

**formspec_eval > types > taxonomy**

# Module: types::taxonomy

## Contents

**Enums**

- [`ConstraintKind`](#constraintkind) - What kind of rule produced the validation.
- [`Severity`](#severity) - Validation severity on the wire (`error` / `warning` / `info`).
- [`ValidationCode`](#validationcode) - Machine validation code (known codes + definition-authored shape codes).
- [`ValidationSource`](#validationsource) - Origin layer for a validation result.

---

## formspec_eval::types::taxonomy::ConstraintKind

*Enum*

What kind of rule produced the validation.

**Variants:**
- `Required`
- `Constraint`
- `Type`
- `Cardinality`
- `Shape`
- `Definition`

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str`
- `fn parse_wire(s: &str) -> Option<Self>`

**Traits:** Eq, Copy

**Trait Implementations:**

- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`
- **PartialEq**
  - `fn eq(self: &Self, other: &ConstraintKind) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> ConstraintKind`
- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`



## formspec_eval::types::taxonomy::Severity

*Enum*

Validation severity on the wire (`error` / `warning` / `info`).

**Variants:**
- `Error`
- `Warning`
- `Info`

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str`
- `fn parse_wire(s: &str) -> Option<Self>`

**Traits:** Eq, Copy

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &Severity) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> Severity`
- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`
- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`



## formspec_eval::types::taxonomy::ValidationCode

*Enum*

Machine validation code (known codes + definition-authored shape codes).

**Variants:**
- `Required`
- `TypeMismatch`
- `ConstraintFailed`
- `ConstraintParseError`
- `MinRepeat`
- `MaxRepeat`
- `UnresolvedExtension`
- `ExtensionRetired`
- `ExtensionDeprecated`
- `ExtensionCompatibilityMismatch`
- `PatternMismatch`
- `MaxLengthExceeded`
- `RangeUnderflow`
- `RangeOverflow`
- `CircularDependency`
- `Shape(String)` - Shape rule `code` from the definition (e.g. `SHAPE_FAILED`).

**Methods:**

- `fn from_wire(s: &str) -> Self`
- `fn as_wire_str(self: &Self) -> Cow<str>`

**Traits:** Eq

**Trait Implementations:**

- **Clone**
  - `fn clone(self: &Self) -> ValidationCode`
- **PartialEq**
  - `fn eq(self: &Self, other: &ValidationCode) -> bool`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`
- **FromStr**
  - `fn from_str(s: &str) -> Result<Self, <Self as >::Err>`
- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Display**
  - `fn fmt(self: &Self, f: & mut fmt::Formatter) -> fmt::Result`



## formspec_eval::types::taxonomy::ValidationSource

*Enum*

Origin layer for a validation result.

**Variants:**
- `Bind`
- `Shape`
- `Definition`
- `External` - Extension registry constraint (not a bind or shape rule).

**Methods:**

- `fn as_wire_str(self: Self) -> &'static str`
- `fn parse_wire(s: &str) -> Option<Self>`

**Traits:** Eq, Copy

**Trait Implementations:**

- **PartialEq**
  - `fn eq(self: &Self, other: &ValidationSource) -> bool`
- **Clone**
  - `fn clone(self: &Self) -> ValidationSource`
- **PartialEq**
  - `fn eq(self: &Self, other: &&str) -> bool`
- **Deserialize**
  - `fn deserialize<D>(deserializer: D) -> Result<Self, <D as >::Error>`
- **Hash**
  - `fn hash<__H>(self: &Self, state: & mut __H)`
- **Debug**
  - `fn fmt(self: &Self, f: & mut $crate::fmt::Formatter) -> $crate::fmt::Result`
- **PartialEq**
  - `fn eq(self: &Self, other: &str) -> bool`
- **Serialize**
  - `fn serialize<S>(self: &Self, serializer: S) -> Result<<S as >::Ok, <S as >::Error>`

---

