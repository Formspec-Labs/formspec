# Formspec Core Specification (LLM Reference)

Formspec is a JSON-native declarative form standard. A Formspec definition is a self-contained JSON document describing a form's structure, behavior, and constraints — independent of rendering, language, or transport.

Inspired by XForms (reactive model), SHACL (composable validation), and FHIR Questionnaire (practical form hierarchy), but built for JSON from the ground up.

## Design Principles (priority order)

1. **Schema is data, not code** — definitions are plain JSON, no Turing-complete language needed to interpret structure
2. **Separate structure / behavior / presentation** — Items define data, Binds define logic, renderers handle display
3. **JSON-native** — not XML transliterated; designed for JSON types and paths
4. **Language-agnostic** — FEL (expression language) is deterministic, implementable in any language
5. **Layered complexity** — simple forms need no expressions or binds; complexity is opt-in
6. **Extensible without forking** — extension points for types, functions, constraints
7. **Structured validation** — validation produces machine-readable results, not just pass/fail

## Conformance

**Core** processors must: parse definitions, support all data types including `money`, implement all 5 Bind MIPs (`calculate`, `relevant`, `required`, `readonly`, `constraint`), implement full FEL, implement validation shapes, implement 4-phase processing model, support versioning/response pinning, support named option sets, reject circular dependencies.

**Extended** processors must additionally: support extensions, screener routing, modular composition, version migration maps, pre-population.

**Prohibitions**: no silent version substitution, no validation of non-relevant fields, no blocking persistence on validation state.

## Six Core Abstractions

### 1. Definition
The complete versioned form specification. Contains: identity (`url` + `version` — globally unique immutable tuple), items, binds, data sources, validation shapes, metadata. Minimal example:

```json
{
  "formspec": "1.0",
  "url": "https://example.org/forms/intake",
  "version": "2.1.0",
  "title": "Patient Intake Form",
  "status": "active",
  "items": [
    { "key": "firstName", "type": "field", "dataType": "string" },
    { "key": "lastName",  "type": "field", "dataType": "string" }
  ]
}
```

### 2. Instance
A JSON object mirroring the item tree, containing current field values. Rules:
- `field` with key `k` → property `k` with value of declared dataType (or null)
- non-repeatable `group` with key `k` → nested object under `k`
- repeatable `group` with key `k` → JSON array of objects under `k`
- `display` items have no instance representation

Supports multiple named instances: `$primary` (default, mutable) and user-defined secondary instances (read-only reference data).

### 3. Item
A node in the definition's structural tree. Every item has a `key` (unique among siblings, matches `^[a-zA-Z_][a-zA-Z0-9_]*$`) and a `type`:

| Type | Purpose | Has value? | Has children? |
|------|---------|-----------|--------------|
| `field` | Captures data | Yes | No |
| `group` | Container, optionally repeatable | No | Yes |
| `display` | Read-only content (headings, help) | No | No |

**Field dataTypes**: `string`, `number`, `integer`, `boolean`, `date`, `dateTime`, `time`, `choice` (string), `multiChoice` (array of strings), `attachment` (object with url/contentType/size).

### 4. Bind
Behavioral declaration attached to data nodes by path. Each bind has a `target` (dot-separated key path) and one or more FEL expressions:

| Property | Returns | Behavior |
|----------|---------|----------|
| `calculate` | field's dataType | Computed value; field becomes implicitly readonly |
| `relevant` | boolean | false → node hidden, excluded from validation, value preserved but non-relevant |
| `required` | boolean | true → field must have non-null, non-empty value |
| `readonly` | boolean | true → no user modification; calculate can still write |
| `constraint` | boolean | false → field invalid; pair with `constraintMessage` |
| `default` | field's dataType | Value applied when a previously non-relevant field becomes relevant again; distinct from item `initialValue`/`prePopulate` and not continuously reactive like `calculate` |

Binds are **reactive** — when a dependency changes, all affected binds re-evaluate per the processing model.

### 5. Validation Shape
Named, composable validation rule sets (inspired by SHACL). Each shape has: `name`, `target` (data paths), and constraints with `expression` (FEL boolean), `severity` (error/warning/info), `message`, optional `code`.

Shapes compose via: `and` (all pass), `or` (any pass), `not` (must fail), `xone` (exactly one passes).

Produces structured `ValidationResult` entries (not booleans) with shape name, target path, severity, message, code.

### 6. Response
A completed/in-progress instance pinned to a specific definition version.

Required: `definitionUrl`, `definitionVersion`, `status` (in-progress | completed | amended | stopped), `data` (the instance), `authored` (ISO 8601 datetime).

Optional: `id` (UUID), `author`, `subject` (entity the response is about), `displayedIssuer` (submit-time resolved Issuer pin), `validationResults`, `authoredSignatures`.

### 7. Data Source
Declares external/supplemental data available to FEL expressions at runtime. Populates secondary instances.

Required properties: `name` (unique identifier, used in `@instance('name')`).

| Source | Mechanism |
|--------|-----------|
| `data` (inline) | Data embedded in definition via `data` property |
| `source` (URL) | Fetched from endpoint at form-load time; must be JSON |
| `source` with `formspec-fn:` URI | Host-provided function data source (e.g., `"source": "formspec-fn:lookupPatient"`) — host environment maps URI to a callback |

Secondary instances are **read-only** — calculate binds must not target them.

## Three-Layer Architecture

| Layer | Question | Contains |
|-------|----------|----------|
| **Structure** (Items) | WHAT data is collected? | Field tree, data types, repeatability, options, labels — pure schema, no logic |
| **Behavior** (Binds + Shapes) | HOW does data behave? | Calculations, relevance, required/readonly, constraints, validation — all via FEL, reactive |
| **Presentation** | HOW is data displayed? | Optional advisory hints only; must not affect data/validation semantics; renderers may ignore |

This separation means one definition can drive web, mobile, PDF, voice, and API-only endpoints without modification.

## Issuer Binding

Definitions may declare `issuer` as either a full inline Issuer document or exactly `{url}`. The referenced Issuer sidecar declares who is asking the form as respondent-facing identity data. Issuer is not Theme: Theme may style issuer chrome, but Issuer owns name, logo URL, parent chain, contact point, jurisdiction, and document identity.

Resolution order is deterministic: host override, then Definition declaration, then unbranded fallback. Host override is a full Issuer document or URL, not a partial overlay. Programmatic embed config is trusted. `?_issuer=` is respondent-controlled and may apply only when its origin is allowlisted; renderers must visibly indicate query-supplied branding. Embed config wins over query override.

When host override is active, renderers walk only the host-injected Issuer's `parentOrganization` chain. They must not merge it with the Definition-declared chain. Response `displayedIssuer` pins the resolved primary Issuer at submit time and remains inside the signed-payload preimage because the v1 omission rule strips only `authoredSignatures`.

## Processing Model (4 phases, in order)

### Phase 1: Rebuild
**Trigger**: Structural change (repeat added/removed, definition replaced).
**Action**: Re-index items, reconstruct dependency DAG, validate acyclic. If cycle detected → error, stop.
*No-op after initial load if no repeatable groups.*

### Phase 2: Recalculate
**Trigger**: Field values changed or Phase 1 completed.
**Action**: Identify dirty nodes → compute transitive affected subgraph → topological sort → evaluate binds in order:
- `calculate` → write to instance, mark dirty if changed (iterate until stable, min 100 iteration limit)
- `relevant` → store boolean; non-relevant cascades to descendants
- `required` → store boolean
- `readonly` → store boolean

**Guarantee**: Only re-evaluates binds in the affected subgraph (minimal recalculation).

### Phase 3: Revalidate
**Trigger**: Phase 2 completed.
**Action**: For affected relevant fields: evaluate `constraint` binds, check `required` state, evaluate intersecting shapes. Composed shapes (`and`/`or`/`not`/`xone`) evaluated by combining constituent results.

### Phase 4: Notify
**Trigger**: Phase 3 completed.
**Action**: Signal changed values, changed states (relevant/required/readonly), changed validation to observers. Mechanism is implementation-defined.

**Batch operations**: Defer all 4 phases until batch completes, then run once with union of dirty nodes. Final state must be identical regardless of batching.

**Presentation hints** do NOT participate in the processing cycle. FEL must not reference them. They must not appear in response data.

## Validation Results

Structured JSON objects, not booleans. Every ValidationResult entry has:
- `severity` (REQUIRED): `error` | `warning` | `info`
- `path` (REQUIRED): dot-notation with concrete 1-based indices for repeats (e.g., `lineItems[3].amount`)
- `message` (REQUIRED): human-readable
- `constraintKind` (REQUIRED): `required` | `type` | `cardinality` | `constraint` | `shape` | `external`
- `code` (RECOMMENDED): machine-readable identifier
- `source` (OPTIONAL): `bind` | `shape`
- `shapeId` (OPTIONAL): if source is shape
- `constraint` (OPTIONAL): the failed FEL expression

**Standard codes**: `REQUIRED`, `TYPE_MISMATCH`, `MIN_REPEAT`, `MAX_REPEAT`, `CONSTRAINT_FAILED`, `SHAPE_FAILED`, `EXTERNAL_FAILED`.

**Severity semantics**:
- `error` → invalid, must resolve before response can be `completed`
- `warning` → suspect, should review, does not block completion
- `info` → informational, no action required

**Aggregated state**: any errors → `invalid`; warnings only → `valid-with-warnings`; else → `valid`.

**Non-relevant fields**: must NOT produce validation results. Results removed when field becomes non-relevant.

## FEL — Formspec Expression Language

A small, deterministic, side-effect-free expression language for form logic. No statements, loops, variable assignment, I/O, or user-defined functions. Host-language independent, deterministic (except `now()`), strictly typed (no truthy/falsy coercion).

### Field References

| Syntax | Meaning |
|--------|---------|
| `$fieldKey` | Value of field, resolved in nearest scope |
| `$parent.child` | Nested field via dot-notation |
| `$` | Current node's own value (used in constraints) |
| `$repeat[n].field` | Value at 1-based index in repeat |
| `$repeat[*].field` | Array of all values across repeat instances |
| `@current` | Current repeat instance object |
| `@index` | 1-based position in current repeat |
| `@count` | Total instances in current repeat |
| `@instance('name')` | Secondary instance by data source name |

References are **lexically scoped** — inside a repeat, `$siblingField` resolves within the same repeat instance.

### Operators (lowest to highest precedence)

1. `? :` (ternary, right-assoc)
2. `or` (logical)
3. `and` (logical)
4. `=`, `!=` (equality)
5. `<`, `>`, `<=`, `>=` (comparison)
6. `in`, `not in` (membership — right operand must be array)
7. `??` (null-coalescing)
8. `+`, `-`, `&` (addition / string concatenation)
9. `*`, `/`, `%` (multiplication)
10. `not`, `-` (unary, right-assoc)

Key rules: arithmetic requires `number` operands; `&` requires `string` operands (not `+`); logical operators require `boolean` (no truthy/falsy); division by zero → error; cross-type comparisons → type error; `null = null` → true.

### Type System

**Primitives**: `string`, `number` (decimal semantics, min 18 significant digits — `0.1 + 0.2 = 0.3`), `boolean`, `date` (ISO 8601), `money` (`{amount: "50000.00", currency: "USD"}` — amount is string for precision), `null`.

**Compound**: `array` (homogeneous, from `$repeat[*].field` or literals like `['a','b','c']`).

**No implicit coercion.** Explicit casts: `number()`, `string()`, `boolean()`, `date()`. Empty string ≠ null (`null` = absent, `''` = present but empty). `required` treats both as unsatisfied.

### Built-in Functions (~40+)

**Aggregates**: `sum`, `count`, `countWhere`, `avg`, `min`, `max` — operate on arrays, skip nulls.

**String**: `length`, `contains`, `startsWith`, `endsWith`, `substring` (1-based), `replace` (literal), `upper`, `lower`, `trim`, `matches` (regex), `format` (positional `{0}`, `{1}`).

**Numeric**: `round` (banker's rounding), `floor`, `ceil`, `abs`, `power`.

**Date**: `today`, `now`, `year`, `month`, `day`, `dateDiff` (years/months/days), `dateAdd`, `hours`, `minutes`, `seconds`, `time` (construct), `timeDiff` (seconds between times).

**Logical**: `if` (only selected branch evaluated), `coalesce` (first non-null), `empty` (null/empty-string/empty-array), `present` (inverse of empty), `selected` (multiChoice contains value).

**Type-checking**: `isNumber`, `isString`, `isDate`, `isNull`, `typeOf`.

**Money**: `money`, `moneyAmount`, `moneyCurrency`, `moneyAdd` (same currency required), `moneySum`.

**MIP-state queries**: `valid($path)`, `relevant($path)`, `readonly($path)`, `required($path)` — query computed state of fields.

**Repeat navigation**: `prev()`, `next()` (return adjacent rows or null), `parent()` (enclosing context). Must only be called within repeat context.

### Element-Wise Array Operations

When an operator is applied to two equal-length arrays, it operates element-wise. Scalar + array → broadcast scalar to each element. Different-length arrays → error.

Example: `sum($lineItems[*].quantity * $lineItems[*].unitPrice)` → element-wise multiply then sum.

### Null Propagation

General rule: null propagates (e.g., `null + 5` → `null`, `null < 5` → `null`).

**Special handling in bind contexts**: `relevant` null → `true` (show field), `required` null → `false` (don't block), `readonly` null → `false` (editable), `constraint` null → `true` (passes). But `if()` condition null → evaluation error.

Functions with special null handling: `coalesce`, `empty`, `present`, `isNull`, `typeOf`, aggregates (skip nulls), `??`, `string(null)` → `""`, `boolean(null)` → `false`, `length(null)` → `0`.

Missing field (exists in definition but no value) → `null`. Field key not in definition → definition error (static check).

### Error Handling

**Definition errors** (load-time, block processing): syntax errors, undefined references, undefined instances/functions, circular dependencies, arity mismatches, calculate target conflicts, read-only instance writes.

**Evaluation errors** (runtime, produce `null` + diagnostic): type errors, division by zero, index out of bounds, date overflow, regex errors. Evaluation errors don't halt — they produce `null` so the rest of the form keeps working.

### Extension Functions

Must: not collide with builtins, be pure, be total (return value for all valid inputs), declare signature. Should be registered before definition loads. Definitions should declare used extensions in `extensions` array.

## Definition Schema

### Top-Level Properties

Required: `$formspec` ("1.0"), `url` (canonical URI, doesn't change between versions), `version`, `status` ("draft"/"active"/"retired"), `title`, `items` (array).

Optional: `versionAlgorithm` ("semver"/"date"/"integer"/"natural", default "semver"), `derivedFrom` (parent definition — either a URI string or `{url, version}` object), `description`, `issuer` (inline Issuer or strict `{url}` reference), `binds`, `shapes`, `instances` (secondary data sources), `variables` (named computed values), `nonRelevantBehavior` ("remove"/"empty"/"keep", default "remove"), `optionSets`, `screener`, `migrations`, `date`, `name` (machine-friendly), `extensions`, `formPresentation`.

### Form Presentation (advisory)

`pageMode`: "single" | "wizard" | "tabs". `labelPosition`: "top" | "start" | "hidden". `density`: "compact" | "comfortable" | "spacious".

### Item Properties

**Common** (all types): `key` (REQUIRED, globally unique in definition, `[a-zA-Z][a-zA-Z0-9_]*`), `type` (REQUIRED), `label` (REQUIRED), `description`, `hint`, `labels` (context-keyed alternatives: "short", "pdf", "csv", "accessibility").

**Group-specific**: `children` (REQUIRED), `repeatable` (default false), `minRepeat` (default 0), `maxRepeat` (positive int or absent for unbounded).

**Field-specific**: `dataType` (REQUIRED), `precision`, `prefix`/`suffix` (display only), `options` (array of `{value, label}` or URI), `optionSet` (reference to top-level named set), `initialValue` (literal or `=expression`, evaluated once), `semanticType` (metadata annotation), `prePopulate` (shorthand for initialValue + readonly bind), `children` (for dependent sub-questions).

**Extended dataTypes** (beyond conceptual model): `string`, `text`, `integer`, `decimal`, `boolean`, `date`, `dateTime`, `time`, `uri`, `attachment`, `choice`, `multiChoice`, `money`.

### Display Items

Read-only non-data elements (instructions, headings). No children, no dataType. Only `relevant` bind is meaningful; all others ignored.

### Presentation Hints

Optional `presentation` object on any item. All advisory, must not affect data/validation. No cascade from parent to child.

- **widgetHint**: Suggested UI control. Built-in widget names use canonical PascalCase (e.g., `choice` -> `Select`/`RadioGroup`, `boolean` -> `Toggle`). Custom values prefixed `x-`.
- **layout**: `flow` (stack/grid/inline), `columns` (1-12 for grid), `collapsible`/`collapsedByDefault`, and grid-scoped placement (`grid.span`, `grid.start`, `grid.rowSpan`, `grid.rowStart`).
- **styleHints**: `emphasis` (primary/success/warning/danger/muted), `size` (compact/default/large).
- **accessibility**: `role`, `description` (screen-reader-only), `liveRegion` (off/polite/assertive).

Tier 1 hints can be overridden by Theme spec (Tier 2) and Component spec (Tier 3).

### Bind Schema (detailed)

`path` (REQUIRED): dot-notation with `[*]` for repeats. Additional properties beyond core MIPs:
- `constraintMessage`: human-readable failure text
- `default`: value applied when non-relevant→relevant transition (distinct from `initialValue`)
- `whitespace`: "preserve" (default) | "trim" | "normalize" | "remove" — applied before storage and validation
- `excludedValue`: "preserve" (default) | "null" — what downstream expressions see for non-relevant fields
- `nonRelevantBehavior`: per-path override of definition-level setting
- `disabledDisplay`: "hidden" (default) | "protected" — how non-relevant items render

**Inheritance rules**:
- `relevant`: AND inheritance (non-relevant parent → non-relevant children)
- `readonly`: OR inheritance (readonly parent → readonly children)
- `required`: NOT inherited
- `calculate`, `constraint`: NOT inherited

**Path syntax**: `fieldKey`, `group.field`, `group[*].field`, `group[@index = N].field`, deep nesting supported. FieldRef (definition-time, with `[*]`) vs resolved instance path (runtime, with concrete indices).

### Variables

Named computed values with lexical scoping. Declared in top-level `variables` array.
- `name`: referenced as `@name` in FEL
- `expression`: FEL expression, continuously recalculated
- `scope`: item key or `"#"` for definition-wide (default)

Variables must not form circular dependencies. Evaluation respects dependency graph order.

### Option Sets

Named reusable option lists in top-level `optionSets`. Either inline `options` (array of `{value, label}`) or external via `source` URI with `valueField`/`labelField` mapping. Referenced by fields via `optionSet` property.

### Screener Routing

Optional `screener` section with `items` (classification fields), optional `binds` (scoped bind declarations for screener items — supports `required`, `relevant`, `constraint`, `calculate`; evaluated in screener scope only, do NOT interact with main form binds), and `routes` (ordered rules with `condition` FEL expression, `target` definition URL, `label`). First matching condition wins. `"condition": "true"` = default. Screener items are NOT part of form instance data.

## Validation (detailed)

### Shape Schema

Required: `id` (unique), `target` (path or `"#"` for root), `message`.
Optional: `severity` (default "error"), `constraint` (FEL boolean), `code`, `context` (additional data as FEL expressions), `activeWhen` (conditional evaluation), `timing` ("continuous"/"submit"/"demand").

Composition: `and`/`or`/`not`/`xone` referencing other shape IDs. May nest. Circular references → definition error. If both `constraint` and composition present, combined with implicit AND.

### ValidationReport

```json
{ "valid": true, "results": [], "counts": { "error": 0, "warning": 2, "info": 1 }, "timestamp": "..." }
```

`valid` = true iff zero error-severity results. Results include all sources (bind, shape, external).

### Validation Modes (runtime, not definition)

- **continuous**: validate on every value change (recommended default)
- **deferred**: validate only on explicit request (save/submit/navigation)
- **disabled**: skip validation entirely (bulk import, migration)

**Critical rule**: saving data must NEVER be blocked by validation. Only submission requires `valid = true`.

Per-shape `timing` interacts with global mode: disabled overrides all; deferred defers all; continuous respects individual timing.

### Non-Relevant Field Handling

1. Validation suppressed (no results produced)
2. Submission: controlled by `nonRelevantBehavior` — "remove" (default, omit), "empty" (null values), "keep" (preserve values)
3. Required suppressed (never required when non-relevant)
4. Calculate continues evaluating (value available to other expressions); `excludedValue` controls what downstream sees
5. Re-relevance restores value; `default` applied if declared

### External Validation

External systems inject results with `source: "external"` and optional `sourceId`. Merged into ValidationReport, participate in `valid` determination. Same path+code → idempotent replacement.

## Versioning & Evolution

### Identity

`url` = logical form identity (stable across versions). `url|version` = fully qualified reference. `(url, version)` tuple is globally unique and immutable.

### Version Algorithms

`semver` (default), `date` (YYYY.MM.DD), `integer`, `natural` (equality only, no ordering).

Semver guidance: patch = cosmetic only, minor = additive, major = breaking (migration recommended).

### Status Lifecycle

`draft` → `active` → `retired`. No backward transitions for same version. Active versions are immutable.

### Response Pinning

Responses always validated against their pinned version. Published versions must not be modified in place — changes require new version.

### Variant Derivation

`derivedFrom` is informational only — no runtime linkage. Enables change analysis, pre-population, lineage tracking.

### Modular Composition

`$ref` on Group items includes items from another definition. `keyPrefix` prevents key collisions. Assembly (resolving all refs) should happen at publish time. Recursive resolution required; circular refs → error.

### Version Migrations

`migrations.from[version]` declares field mappings (`source` → `target` with `preserve`/`drop`/`expression` transforms) and `defaults` for new fields. Migration produces a new response; original preserved. Migrated response status reset to "in-progress".

## Extension Points

All extension identifiers must be prefixed with `x-`.

- **Extension properties**: `extensions` object on any Formspec object; processors must preserve unrecognized extensions on round-trip
- **Extension namespaces**: `x-{org}-{domain}` convention, should include `version`

Custom data types, functions, and constraints are declared via the **Extension Registry** (see `extension-registry.llm.md`) rather than inline in definitions. The registry provides structured metadata for discovery and validation.

Extensions must NOT alter core semantics (required, relevant, readonly, calculate, FEL evaluation, valid flag).

## Lineage

- **XForms**: Bind MIPs, reactive dependency graph, non-relevant pruning, 4-phase processing, multiple instances, MVC separation, expression context scoping
- **SHACL**: Named composable shapes, three severity levels, structured results, composition operators, custom constraint components. Key divergence: only errors affect validity (not warnings/info)
- **FHIR R5/SDC**: Canonical URL+version+status, response pinning, derivedFrom, linkId→key, item taxonomy, disabledDisplay, variable scoping, initialExpression vs calculatedExpression, modular composition, versionAlgorithm
- **Other**: ODK XLSForm ($field refs, . self-ref), SurveyJS (PEG grammar, rich operators), JSON Forms (data/UI separation, validation modes, external errors)
