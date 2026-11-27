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

Supports multiple named instances: `$primary` (default, mutable) and user-defined secondary instances (reference data FEL reads; read-only unless `readonly: false`, which admits host writes only).

### 3. Item
A node in the definition's structural tree. Every item has a `key` (unique across the whole definition, matches `^[a-zA-Z][a-zA-Z0-9_]*$`) and a `type`:

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

Warning Shapes use the Definition's `warningExplanation` (`none` by default), overridden by the Shape's `explanation`. `confirm` records an entry per firing with optional text. `explain` requires text per firing. `acknowledge` requires an explicit Shape `code` and covers all current firings sharing that code in one review action. All warning Shapes sharing an acknowledgement code use `acknowledge` mode. See Core §5.2.1 and Locale §3.1.6 for `explanationPrompt`.

### 6. Response
A completed/in-progress instance pinned to a specific definition version.

Required: `definitionUrl`, `definitionVersion`, `status` (in-progress | completed | amended | stopped), `data` (the instance), `authored` (ISO 8601 datetime).

Optional: `id` (UUID), `author`, `subject`, `resolvedInstances`, `explanations`, `displayedIssuer` (submit-time resolved Issuer pin), `validationResults`, `authoredSignatures`.

When Definition `subject` declares `{type, keys: {name: {dataType, authorizationParent?, minted?}}}`, Response `subject` requires `{id, type, keys}`. Keys are string or integer only. `id` is 64 lowercase hex SHA-256 characters, no prefix, over integrity-canonical-json-v1 bytes of {type, keys} framed with UTF-8 `formspec.subject.id.v1` then NUL. It identifies the filing unit independently of Response.id and editable answers, and is unique only with its scope; indexes and authorization keys pair them. A per-scope singleton declares empty keys and takes relations through its scope parent. Scope is not a key. Authorization parents require string keys and derive from stored keys and scope on each check; they are never persisted as duplicate relationships. An implicit respondent identity for a Definition without a declaration stays server-only.

`minted: true` requires an opaque scoped string identifier with no ordering or offsets and no `authorizationParent` because a fresh value carries no grant. Find-or-create checks `open` through the scope and declared parents. The store assigns omitted minted keys and returns the complete subject. A retry returns the same keys and draft while it remains open. The store accepts supplied minted values only when the same scope assigned them together for the same subject type and parents in any period. A complete subject can request lookup only under the same authorization. An authorized lookup with no open draft reports absence. Minted keys stay fixed across re-keying and can be compared for equality alongside a separate integer period predicate.

Integer subject keys must be within ±(2^53−1), the I-JSON interoperable range ([RFC 7493 §2.2](https://www.rfc-editor.org/rfc/rfc7493#section-2.2)). Refuse out-of-range integers. Use string keys for identifiers that can exceed the bound or carry leading zeros.

`resolvedInstances[]` records `{instance, records: [{responseId, definitionVersion, responseHash?}], valueDigest, none, pinned, mapping?: {url, digest}}`. Only `assemble_candidate` writes it, before Sign; the server re-runs it at Sign and Submit and refuses differences. `valueDigest` covers the delivered value: latest gives one projection; latest-per-subject gives an ordered array of per-record projections, with Mapping applied once to the whole array. none true gives the data fallback or null without Mapping. Hash under `integrity-canonical-json-v1` / `formspec.instance.value.v1`. Completed records include `ResponseJson::handoff_hash()` as `responseHash`; current drafts omit it and retain the delivered value in evaluation receipts. These fields remain inside the signed Response. Review outcome comes from the WOS determination; read evidence comes from `Response.resolvedInstances`.

`explanations[]` stores instance `{shapeId, path, basis, text?, author, recorded}` or group `{code, group: true, paths, basis, author, recorded, partyRef?}` entries. The server stamps the actor and time and checks party authority at save. For each acknowledgement code, the stored group paths together must equal the current firing paths. Each entry's `basis` must match the firings at its own paths (Core §2.1.6). Candidate assembly keeps exactly the current entries for completion. Whole-Response signatures and the handoff hash cover the stored entries.

### 7. Data Source
Declares external/supplemental data available to FEL expressions at runtime. Populates secondary instances.

App-level Data Sources catalogs serve consumers such as Surface prefill and widget inputs. Only Definition-local instances supply FEL `@instance()` values.

Required properties: `name` (unique identifier, used in `@instance('name')`).

`@instance('list').rows[id = subject('id')].name` reads the name of the unique
row whose `id` equals the current form's subject key. See [FEL Grammar §6.2.1](https://github.com/Formspec-Labs/fel-core/blob/main/specs/fel/fel-grammar.md#621-keyed-row-lookup)
for keyed lookup rules. A duplicate match yields `null` and the FEL diagnostic
`FEL_AMBIGUOUS_ROW_LOOKUP`. Formspec surfaces the diagnostic message from Bind
constraints and Shapes.

| Source | Mechanism |
|--------|-----------|
| `data` (inline) | Data embedded in definition via `data` property |
| `source` (URL) | Fetched from endpoint at form-load time; must be JSON |
| `response` (`ResponseSelection`) | Filed or current Responses selected by upstream Definition and subject predicates; delivers only the required path-keyed `schema` projection of `Response.data` |
| `source` with `formspec-fn:` URI | Host-provided function data source (e.g., `"source": "formspec-fn:lookupPatient"`) — host environment maps URI to a callback |

Secondary instances are **read-only** unless `readonly: false` (host-written via the processor API, never submitted). No Bind targets an instance — Bind paths resolve to Items; intermediate values belong in Variables.

Exactly one content source: `source`, `response`, or `data` alone; `data` may back either external source as fallback. `source` is a literal URI, with no templates. Response instances require `schema` with FieldRef paths (`agencies[*].uei`) and Core data types; other instance schemas remain informative. The shared `ResponseSelection` lives in `response.schema.json#/$defs/ResponseSelection`: `definition` (common TargetDefinition), `subject[]` predicates (`eq|le|ge`, `from.subject|from.routeParam`, integer-only le/ge/offset), `status` (`completed|current`), optional disposition URI, `whenNone` (`unavailable` default or `empty`), `cardinality` (`latest|latest-per-subject`), `pin` (`none|at-open`), optional forward Mapping URL. Definition instances forbid routeParam and require declared from.subject keys.

Authorize before query; refusals stay unavailable even with whenNone=empty. Candidates stay in scope, then match Definition/version, subject type/predicates, status and disposition. Integer route parameters require ^-?[0-9]+$, exact base-10 conversion before offset/comparison, and refusal as unavailable for malformed values or values outside the I-JSON integer range. String keys stay strings. Order is authored descending then Response id ascending. Unavailable blocks Sign/Submit, never Save. At-open pins refuse unavailable open; later loads return the pin and report `newer`. Re-pin is an authorized draft operation; refill touches only chosen fields. `check_instance_projection` checks upstream paths/types, stored choice value sets for direct copies with static options, subject compatibility and integer offsets at authoring and publish. A declared `compatibleVersions` range requires SemVer. Without a range, check all upstream versions, including integer and date versions.

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

Creation-time values are outside this cycle. Re-evaluating a Response MUST NOT pad repeats or apply `seedFrom`, `prePopulate`, or `initialValue`.

### Phase 1: Rebuild
**Trigger**: Structural change (repeat added/removed, definition replaced).
**Action**: Re-index items and check the Definition. Refuse dependency cycles, invalid FEL syntax, unknown calls, and arity mismatches before evaluating expressions. A MIP query depends on the state it reads: `valid($p)` on `p`'s value, `required` and `constraint` Binds, inherited `relevant` and error-severity Shapes targeting `p`; `relevant`/`readonly` on the inherited Binds of that name; `required` on its own Bind and inherited `relevant`. Check signatures against built-ins and the evaluation’s registered extensions.
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
**Action**: For affected relevant fields: evaluate `constraint` binds (`false` → `CONSTRAINT_FAILED` with the Bind's `constraintMessage`), check `required` state, evaluate intersecting shapes. Composed shapes (`and`/`or`/`not`/`xone`) evaluated by combining constituent results.

### Phase 4: Notify
**Trigger**: Phase 3 completed.
**Action**: Signal changed values, changed states (relevant/required/readonly), changed validation to observers. Mechanism is implementation-defined.

**Batch operations**: Defer all 4 phases until batch completes, then run once with union of dirty nodes. Final state must be identical regardless of batching.

**Presentation hints** do NOT participate in the processing cycle. FEL must not reference them. They must not appear in response data.

## Validation Results

Structured JSON objects, not booleans. Every ValidationResult entry has:
- `severity` (REQUIRED): `error` | `warning` | `info`
- `path` (REQUIRED): dot-notation with concrete 0-based indices for repeats (e.g., `lineItems[2].amount` is the third instance; FEL `@index` is 1-based)
- `message` (REQUIRED): human-readable
- `constraintKind` (REQUIRED): `required` | `type` | `cardinality` | `constraint` | `shape` | `external` | `explanation` | `definition`
- `code` (RECOMMENDED): machine-readable identifier
- `source` (OPTIONAL): `bind` | `shape`
- `shapeId` (OPTIONAL): Shape failure or instance explanation result
- `constraint` (OPTIONAL): the failed FEL expression

**Standard codes**: `REQUIRED`, `TYPE_MISMATCH`, `OPTIONS_UNAVAILABLE`, `MIN_REPEAT`, `MAX_REPEAT`, `CONSTRAINT_FAILED`, `SHAPE_FAILED`, `EXTERNAL_FAILED`.

In `on-submit`, `explanation` findings use `source: "shape"` and `EXPLANATION_REQUIRED` or `EXPLANATION_STALE` (errors) or `EXPLANATION_UNUSED` (info). The processor emits at most one group finding per code, using `path: "#"` and `context.code`. Explanation errors use `block-on-error` and the original warning keeps its severity (Core §5.3.1).

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
| `$fieldKey` | Value of field in the nearest enclosing scope that declares it |
| `$parent.child` | Nested field via dot-notation |
| `$` | Current node's own value (used in constraints) |
| `$repeat[n].field` | Value at 1-based index in repeat |
| `$repeat` or `$repeat[*]` | Array of row objects in order, including empty rows; `[]` for zero rows |
| `$repeat[*].field` | Array of values across repeat instances, with `null` for missing values |
| `@current` | Current repeat instance object |
| `@index` | 1-based position in current repeat |
| `@count` | Total instances in current repeat |
| `@instance('name')` | Secondary instance by data source name |

Lexical scoping applies at every expression site, including Binds, Shapes, Item text, variables, and component `when`. A field declared in the nearest scope resolves to `null` when it has no value. A sibling reference inside a repeat reads the same row, which mirrors XForms scoping. `@current`, `@index`, and `@count` exist only inside a repeat.

A path that continues past a repeatable Group requires a subscript on that Group at any depth. `$rows.amount` and `$outer[*].inner.amount` are definition errors. Use `$amount` or `@current.amount` for the current row and `$rows[*].amount` for all rows.

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

**MIP-state queries**: `valid($path)`, `relevant($path)`, `readonly($path)`, `required($path)` — query the computed state of fields in the same evaluation, Bind expressions included. The argument must be a `$path` (`$amount` is the current row's field inside a repeat); `@current.amount`, a variable, a literal or a function result is `MIP_ARGUMENT_NOT_FIELD`. A wildcard or out-of-range repeat index yields `null`. For a field or group, `valid($p)` is false exactly when `p` itself has an error of kind `required`, `type`, `cardinality`, `constraint` or `shape`. Descendant, external and explanation findings do not affect it. A non-relevant item reads as valid. Report the single state in which every `valid()` read agrees with the reported results, or refuse with `CIRCULAR_DEPENDENCY`.

**Repeat navigation**: `prev()`, `next()` (return adjacent rows or null), `parent()` (enclosing context). Must only be called within repeat context.

`subject(string) → any` reads the form's own `Response.subject.keys`, returning null for absent keys/subject and rejecting a non-string argument.

### Element-Wise Array Operations

When an operator is applied to two equal-length arrays, it operates element-wise. Scalar + array → broadcast scalar to each element. Different-length arrays → error.

Example: `sum($lineItems[*].quantity * $lineItems[*].unitPrice)` → element-wise multiply then sum.

### Null Propagation

General rule: null propagates (e.g., `null + 5` → `null`, `null < 5` → `null`).

**Boolean contexts**: `relevant` null → `true` (show field), `required` null → `false` (don't block), `readonly` null → `false` (editable), `constraint` null → `true` (passes), Shape `activeWhen` null → `false` (skip). But `if()` condition null → evaluation error.

Functions with special null handling: `coalesce`, `empty`, `present`, `isNull`, `typeOf`, aggregates (skip nulls), `??`, `string(null)` → `""`, `boolean(null)` → `false`, `length(null)` → `0`.

`subject(null)` raises a type error (§3.8.2).

Missing field (exists in definition but no value) → `null`. Field key not in definition → definition error (static check).

### Error Handling

**Definition errors** (load-time, block processing): syntax errors, undefined references, undefined instances/functions, circular dependencies, arity mismatches, calculate target conflicts, instance-path Binds (`instances.<name>…` / `@instance('<name>')…` as a Bind `path`). Rebuild refuses evaluation with a `definition` ValidationResult at the authored expression's JSONPath: `SYNTAX_ERROR` (message carries the expression and position), `ARITY_MISMATCH`, `SEED_PREDICATE_SCOPE`, `UNSUBSCRIPTED_REPEAT_REFERENCE`, `MIP_ARGUMENT_NOT_FIELD`; `{{}}` text interpolation is exempt from the first two. A dependency cycle is `CIRCULAR_DEPENDENCY` with an empty path.

**Evaluation errors** (runtime, produce `null` + diagnostic): type errors, division by zero, arithmetic overflow, including an aggregate's running total (`FEL_ARITHMETIC_OVERFLOW`), index out of bounds, date overflow, regex errors. Evaluation errors don't halt — they produce `null` so the rest of the form keeps working.

### Extension Functions

Must: not collide with builtins, be pure, be total (return value for all valid inputs), declare signature. Should be registered before definition loads. Definitions should declare used extensions in `extensions` array.

## Definition Schema

### Top-Level Properties

Required: `$formspec` ("1.0"), `url` (canonical URI, doesn't change between versions), `version`, `status` ("draft"/"active"/"retired"), `title`, `items` (array).

Optional: `versionAlgorithm` ("semver"/"date"/"integer"/"natural", default "semver"), `derivedFrom` (parent definition — either a URI string or `{url, version}` object), `description`, `issuer` (inline Issuer or strict `{url}` reference), `binds`, `shapes`, `instances` (secondary data sources), `variables` (named computed values), `nonRelevantBehavior` ("remove"/"empty"/"keep", default "remove"), `optionSets`, `screener`, `migrations`, `date`, `name` (machine-friendly), `extensions`, `formPresentation`.

### Form Presentation (advisory)

`pageMode`: "single" | "wizard" | "tabs" | "workspace". Workspace shows one section at a time with free section selection, question search, and validation findings. Workspace preserves authored Component Section and Theme page IDs and titles. A generated group uses its Item key. Outside the Theme remainder, a loose run becomes an addressable section only when its first non-blank Heading supplies its title and its first available Item key supplies its ID. Content without a section ID attaches to the previous identified section, or to the next one when first. Under Theme §6.3, rendered unassigned Items form one trailing section with the first available Item key as its ID and the first non-blank Heading or a localized stock title as its title. If every candidate key is already a section ID, the Items stay at the end of the final Theme page. `labelPosition`: "top" | "start" | "hidden". `density`: "compact" | "comfortable" | "spacious".

### Item Properties

**Common** (all types): `key` (REQUIRED, globally unique in definition, `[a-zA-Z][a-zA-Z0-9_]*`), `type` (REQUIRED), `label` (REQUIRED), `description`, `hint`, `labels` (context-keyed alternatives: "short", "pdf", "csv", "accessibility"). Displayed text resolves per property before interpolation, first match wins: Locale `<key>.label@context` → Locale `<key>.label` → `labels[context]` → `label`; `hint`/`description` the same minus the `labels[context]` step. `label`, `labels` values, `description`, `hint` may contain `{{expression}}` FEL interpolation, evaluated in the item's scope (repeat instance inside a repeat) under Locale §3.3.1 rules (`{{{{` = literal `{{`; failed expression stays literal).

**Group-specific**: `children` (REQUIRED), `repeatable` (default false), `minRepeat` (default 0), `maxRepeat` (positive int or absent for unbounded).

Creation runs once for a new Response. Host prefill wins key by key, including `null` fields and `[]` groups. Resume uses saved data as given. A pending `seedFrom` repeat stays absent until arrival or failure. A pending `prePopulate` field waits before considering `initialValue`. An expression initial value waits for referenced instances, including references through visible variables. On failure, use the authored fallback. Without a fallback, `seedFrom` uses zero source rows and the processor SHOULD emit a diagnostic. Person edits win throughout.

`seedFrom.where` optionally filters the array in source order before repeat limits. Use `$.field` for the candidate, `subject(key)` for the Response subject, and literal names for declared instances. The repeat waits for all named inputs used by the predicate. Boolean `true` keeps the original element for relative `prePopulate`. Predicate errors leave the repeat absent and surface a coded diagnostic.

To read the current source record after removal or resume, copy a stable key with relative `prePopulate` and use keyed FEL lookup (§4.4.2). Comparing with the value at creation requires a captured value or pinned source version.

**Field-specific**: `dataType` (REQUIRED), `precision`, `prefix`/`suffix` (display only), `options` (array of `{value, label}` or URI; membership is normative against host-supplied lists and an absent remote list emits `OPTIONS_UNAVAILABLE`), `optionSet` (reference to top-level named set; takes precedence over `options` including when URL-backed), `initialValue` (literal or `=expression`, evaluated once), `semanticType` (metadata annotation), `prePopulate` (creation-time source value with an optional readonly lock), `children` (for dependent sub-questions).

**Extended dataTypes** (beyond conceptual model): `string`, `text`, `integer`, `decimal`, `boolean`, `date`, `dateTime`, `time`, `uri`, `attachment`, `choice`, `multiChoice`, `money`.

### Display Items

Read-only non-data elements (instructions, headings). No children, no dataType. Only `relevant` bind is meaningful; all others ignored. The `label` is the displayed content and supports `{{expression}}` interpolation.

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
- `letterCase`: "preserve" (default) | "upper" | "lower" — locale-independent Unicode case conversion for `string` and `text` input, after whitespace and before storage and validation
- `excludedValue`: "preserve" (default) | "null" — what downstream expressions see for non-relevant fields
- `nonRelevantBehavior`: per-path override of definition-level setting
- `disabledDisplay`: "hidden" (default) | "protected" — how non-relevant items render

**Inheritance rules**:
- `relevant`: AND inheritance (non-relevant parent → non-relevant children)
- `readonly`: OR inheritance (readonly parent → readonly children)
- `required`: NOT inherited
- `calculate`, `constraint`: NOT inherited

**Multiple binds per target**: merged property by property in document order; later values replace earlier ones (no AND/OR combination). `group[*].field` targets item `group.field`.

**Path syntax**: `fieldKey`, `group.field`, `group[*].field`, `group[@index = N].field`, deep nesting supported. FieldRef (definition-time, with `[*]`) vs resolved instance path (runtime, with concrete indices).

### Variables

Named computed values with lexical scoping. Declared in top-level `variables` array.
- `name`: referenced as `@name` in FEL
- `expression`: FEL expression, continuously recalculated
- `scope`: item key or `"#"` for definition-wide (default). A variable scoped to a repeatable Group or an item inside one is evaluated once per repeat instance in that instance's context.

Variables must not form circular dependencies. Evaluation respects dependency graph order.

### Option Sets

Named reusable option lists in top-level `optionSets`. Either inline `options` (array of `{value, label}`) or external via `source` URI with `valueField`/`labelField` mapping. Referenced by fields via `optionSet` property. Option membership is normative for inline and remote lists alike: the host supplies resolved option lists keyed by `optionSet` name (`optionSets`) and by URI (`uris`, checking `optionSets[name]` before `uris[source]`), filing hosts retain and forward the trusted snapshot (canonical digest domain `formspec.option-snapshot.v1`) to every authoritative recheck, out-of-list answers emit `TYPE_MISMATCH`, and an absent remote list for an answered relevant field emits `OPTIONS_UNAVAILABLE` (never silent acceptance or inline fallback).

### Screener Routing

Optional `screener` section with `items` (classification fields), optional `binds` (scoped bind declarations for screener items — supports `required`, `relevant`, `constraint`, `calculate`; evaluated in screener scope only, do NOT interact with main form binds), and `routes` (ordered rules with `condition` FEL expression, `target` definition URL, `label`). First matching condition wins. `"condition": "true"` = default. Screener items are NOT part of form instance data.

## Validation (detailed)

### Shape Schema

Required: `id` (unique), `target` (path or `"#"` for root), `message`.
Optional: `severity` (default "error"), `constraint` (FEL boolean), `code`, `context` (additional data as FEL expressions), `activeWhen` (conditional evaluation), `timing` ("continuous"/"submit"/"demand").

The Shape's target supplies the evaluation context for `constraint`, `activeWhen`, `message` interpolation, and `context` expressions. Message interpolation follows Locale §3.3.1. A `multiChoice` renders its selected values in response order, separated by a comma and a space.

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

Before filing, evaluate in the submit profile with one clock until a pass
returns the same `data` it received. A later pass sees answers omitted from its
input as `null` and recomputes calculations. File the settled data and findings, including
external validation results under §5.7. On recheck, refuse a Response whose
data change. Omitted declared repeats compare equal to empty arrays, including
group objects that exist only to hold those arrays.

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

Custom data types, functions, and constraints are declared via the **Extension Registry** (see `extension-registry.llm.md`) rather than inline in definitions. The registry provides structured metadata for discovery and validation. Publishers and filing hosts MUST pin governing Extension Registry documents alongside published Definitions and supply them to every authoritative recheck; recheck qualification preserves exact decimal bounds and fails closed on malformed registries, duplicate extension names, unsupported constraint keys, invalid patterns/lengths/bounds, or inverted ranges.

Extensions must NOT alter core semantics (required, relevant, readonly, calculate, FEL evaluation, valid flag).

## Lineage

- **XForms**: Bind MIPs, reactive dependency graph, non-relevant pruning, 4-phase processing, multiple instances, MVC separation, expression context scoping
- **SHACL**: Named composable shapes, three severity levels, structured results, composition operators, custom constraint components. Key divergence: only errors affect validity (not warnings/info)
- **FHIR R5/SDC**: Canonical URL+version+status, response pinning, derivedFrom, linkId→key, item taxonomy, disabledDisplay, variable scoping, initialExpression vs calculatedExpression, modular composition, versionAlgorithm
- **Other**: ODK XLSForm ($field refs, . self-ref), SurveyJS (PEG grammar, rich operators), JSON Forms (data/UI separation, validation modes, external errors)
