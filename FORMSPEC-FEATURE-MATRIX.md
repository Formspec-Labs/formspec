# Formspec Feature & Requirements Matrix

**Last updated:** 2026-05-11 (fully validated; 3 passes; known gaps + deferred items documented)
**Spec version:** 1.0.0-draft
**Purpose:** Exhaustive inventory of every feature built or specified in Formspec, the requirements each satisfies, why it exists, and its implementation status. Companion to [`context.md`](context.md) (positioning/vision) and [`TODO.md`](TODO.md) (active work).

---

## How to Read This Document

**Feature Status:**

| Icon | Meaning |
|------|---------|
| ✅ | Specified + Schema + Implemented (Rust/WASM + TS + Python parity) |
| 🟦 | Specified + Schema + Partially implemented (runtime exists, edge cases pending) |
| 🟡 | Specified + Schema; runtime implementation pending |
| ⚪ | Referenced or planned; specification pending |

**Implementation columns:**

| Column | Meaning |
|--------|---------|
| Rust | `fel-core` (sibling submodule, path-dep), `formspec-core`, `formspec-eval`, `formspec-lint`, `formspec-wasm`, `formspec-py` + signature crates |
| TS | `formspec-types`, `formspec-engine`, `formspec-webcomponent`, `formspec-react`, `formspec-layout`, `formspec-core`, `formspec-assist`, `formspec-adapters` |
| Py | `src/formspec/` (Python conformance, adapters, validation) |
| `—` | Not applicable to this runtime (e.g. internal parser/AST features consumed via binding, not reimplemented per runtime) |

**Statistics at a glance:**

| Dimension | Count |
|-----------|-------|
| Rust crates | 11 |
| TS packages | 11 |
| JSON schemas | 25 |
| Lint rules | 37 (all tested) |
| FEL stdlib functions | 72 |
| Companion document types | 11 (9 section-5 + Screener + Respondent Ledger) |
| Python test functions | ~2,139 |
| Rust test functions | ~24,000 (~1,700 manual + ~22,285 generated edge cases) |
| Cross-stack fixture bundles | 7 |

### What's Moved (2026-05 snapshot)

*All features are pre-release (no production users, no stable API). Status reflects spec + schema + implementation completeness, not production hardening. Movements since last full audit:*

| What | From | To |
|------|------|----|
| All 37 lint rules graduated (0 draft remaining) | 🟡 29 tested | ✅ 37 tested |
| 29 companion document lint rules added (theme, component) | — | ✅ |
| Cross-stack fixture harness (7 bundles, byte-level equality) | 🟡 | ✅ |
| 11 cross-spec contracts specified + schema-conformant | 🟡 | ✅ |
| FEL trace bridge (byte-identical Rust-WASM-Python) — feeds MCP `formspec_fel_trace` | 🟡 | ✅ |
| Response migration engine (semver-gated, FEL transforms) | 🟡 | ✅ |
| Component spec reached 35 built-in components with fallback chains | 🟦 | ✅ |
| Component spec: Click-to-Sign attestation specified (not implemented) | — | ⚪ |
| Android runtime: architecture finalized | ⚪ | 🟡 |
| PDF runtime: AcroForm spec completed | ⚪ | 🟡 |
| Data science export: draft spec started | — | ⚪ |

---

## 1. Data Model & Field Types

*For form authors: the structural vocabulary every form is built from — closed taxonomy means no surprise field types, no ad-hoc rendering. For respondents: predictable, type-safe data entry regardless of runtime. For downstream systems: clean, typed JSON without ambiguity.*

| # | Feature | Description | Why | Status | Rust | TS | Py |
|---|---------|-------------|-----|--------|------|----|----|
| 1.1 | **13 core data types** | `string`, `text`, `integer`, `decimal`, `boolean`, `date`, `dateTime`, `time`, `uri`, `attachment`, `choice`, `multiChoice`, `money` | Every field type has known, identical behavior across web, iOS, Python, and PDF. Reviewers and downstream systems get predictable, typed JSON — no ad-hoc field types, no rendering surprises. Money fields carry ISO 4217 currency by construction. | ✅ | ✅ | ✅ | ✅ |
| 1.2 | **Item tree (flat + nested)** | Items define fields with `key`, `type`, `label`. Groups contain children. Repeatable groups declare `repeats` with `min`/`max`. | Hierarchical data with repeatable sections — the structural backbone of every form definition. | ✅ | ✅ | ✅ | ✅ |
| 1.3 | **Option sets (shared + inline)** | `optionSets` top-level map for shared option lists. Items reference by name or declare inline `options`. | DRY for repeated option lists (state lists, yes/no/na). Shared sets are translatable via Locale documents. | ✅ | ✅ | ✅ | ✅ |
| 1.4 | **Repeatable groups** | Groups with `repeats: { min, max }`. Tracked via indexed paths (`group[0].field`). Supports nesting. | Line items, household members, multi-entry sections — the primary data-structuring mechanism. | ✅ | ✅ | ✅ | ✅ |
| 1.5 | **Definition variables** | Top-level `variables[]` with FEL `expression`, optional `scope` prefix. Topologically sorted by dependency. | Reusable computed constants (tax rates, thresholds) without polluting the response. Scoping prevents name collisions across sections. | ✅ | ✅ | ✅ | ✅ |
| 1.6 | **Named instances** | `instances` declaring external data sources with inline `data`, async `source` (HTTP), `readonly` flag, `schema` validation, `prePopulate` field mapping with `editable` flag (false = implicit `readonly` locking after pre-population). | Respondents don't re-enter data you already have. Pull from user profiles, prior applications, or external APIs — schema-validated before form load. Computed totals write back to source systems automatically. | ✅ | ✅ | ✅ | ✅ |
| 1.7 | **Field coercion pipeline** | 4-stage inbound coercion: whitespace normalization → numeric parsing → money wrapping → precision rounding. Applied on every `setValue()`. | Agencies receive data from 12 different intake channels in 12 different formats. The coercion pipeline normalizes everything on entry — no downstream type errors, no manual cleaning. | ✅ | ✅ | ✅ | ✅ |
| 1.8 | **Extension properties (`x-` namespace)** | Items accept `x-*` properties resolved against loaded registries. Unresolved extensions emit lint errors. | Domain-specific metadata (SSN format, phone validation) without modifying the core spec. | ✅ | ✅ | ✅ | ✅ |
| 1.9 | **Multi-context labels** | Items declare `labels: { review: "...", summary: "...", pdf: "..." }` with per-context overrides. Well-known contexts: `short`, `pdf`, `csv`, `accessibility`. Selected via `setLabelContext()`. | Same field needs different labels in different views (review vs. summary vs. print). Decoupled from Locale document context suffixes — same-language context switching. | ✅ | ✅ | ✅ | ✅ |

---

## 2. FEL Expression Language

*Foundational crate: `fel-core` (sibling submodule). Normative grammar at [`fel-core/specs/fel/fel-grammar.md`](../fel-core/specs/fel/fel-grammar.md). 72 stdlib functions.*

*For form authors: the expression language that powers calculations, conditions, and validation — auditable, deterministic, non-Turing-complete by design. For evaluators: base-10 decimal means `$0.10 + $0.20 = $0.30` always, no floating-point drift. For security reviewers: sandboxed — no I/O, no network, no filesystem.*

| # | Feature | Description | Why | Status | Rust | TS | Py |
|---|---------|-------------|-----|--------|------|----|----|
| 2.1 | **PEG grammar (deterministic parsing)** | Unambiguous recursive-descent parser with 12-level precedence ladder. Single valid parse tree per input. | Independent conformant implementations; no parser ambiguity. | ✅ | ✅ | ✅ | ✅ |
| 2.2 | **Base-10 decimal arithmetic** | All numbers are `rust_decimal::Decimal` (96-bit mantissa). Banker's rounding. `$0.10 + $0.20 = $0.30` always. | Tax prep apps, grant calculators, financial intake — all fail silently on floating-point. Ours doesn't. Base-10 decimal arithmetic is table-stakes for any form involving money, and most form engines get it wrong. | ✅ | ✅ | ✅ | ✅ |
| 2.3 | **20 AST node types** | Null, Boolean, Number, String, Date, DateTime, Array, Object, FieldRef, VarRef, ContextRef, UnaryOp, BinaryOp, Ternary, IfThenElse, Membership, NullCoalesce, LetBinding, FunctionCall, PostfixAccess. | Complete grammar coverage with round-trip fidelity (printer reconstructs source from AST). | ✅ | ✅ | — | — |
| 2.4 | **Dollar-sign field references** | `$field`, `$a.b.c`, `$a[n]` (1-based), `$a[*]` (wildcard). Bare `$` in repeat context scopes to current row. | Core data-binding — expressions reference form values without object-property syntax. | ✅ | ✅ | ✅ | ✅ |
| 2.5 | **Context references (`@`)** | `@current`, `@index`, `@count` (repeat metadata), `@instance('name')` (external data), `@source`/`@target` (mapping), `@variableName` (def variables). | Access to repeat-group metadata and external data that `$` cannot reach. | ✅ | ✅ | ✅ | ✅ |
| 2.6 | **Conditional expressions (3 syntaxes)** | `if cond then a else b`, `cond ? a : b`, `if(cond, a, b)`. Different readability contexts. | Keyword form for complex conditions; ternary for compact; function form for argument composition. | ✅ | ✅ | ✅ | ✅ |
| 2.7 | **Let bindings** | `let x = <value> in <body>`. Lexically scoped. `in` suppressed as membership operator inside value position. | Name-based abstraction within a single expression; avoids repeated sub-expression evaluation. | ✅ | ✅ | — | — |
| 2.8 | **Null semantics (XForms model)** | Null propagation for arithmetic/comparison/concat. Equality does NOT propagate (`null = null` → `true`). `??` for fallback. | Prevents "everything is null" cascades in conditional logic. | ✅ | ✅ | ✅ | ✅ |
| 2.9 | **Membership operator** | `value in ['a', 'b']`, `value not in [...]`. Non-associative. | Natural syntax for option-list testing. | ✅ | ✅ | ✅ | ✅ |
| 2.10 | **Path expressions & wildcard** | `$a[1].nested[*].value`. Chained Dot/Index/Wildcard segments on any expression. | Deep navigation of nested data structures and repeat groups. | ✅ | ✅ | ✅ | ✅ |
| 2.11 | **Array broadcasting** | `[1, 2] + 10` → `[11, 12]`. Unary negation distributes. Elementwise array-array. | Vectorized operations for repeat-group calculations without explicit mapping. | ✅ | ✅ | ✅ | ✅ |
| 2.12 | **String concatenation (`&`)** | `'Hello' & ' ' & 'World'`. Dedicated operator at precedence 8. | Type-unambiguous string concatenation (no overloaded `+`). | ✅ | ✅ | ✅ | ✅ |
| 2.13 | **Date/DateTime literals** | `@2024-01-15`, `@2024-01-15T14:30:00Z`. First-class date values. Calendar-correct validation (leap years, month lengths). | Date arithmetic without string parsing at evaluation time. | ✅ | ✅ | ✅ | ✅ |
| 2.14 | **Short-circuit evaluation** | `and`/`or` short-circuit. `if()` evaluates only selected branch. `??` evaluates right only when left is null. | Prevents unnecessary computation; enables conditional null-safe access. | ✅ | ✅ | ✅ | ✅ |
| 2.15 | **Deterministic + sandboxed evaluation** | Side-effect-free. No I/O, no filesystem, no network, no random. Extension functions receive only pre-evaluated values. | Form expressions come from definition authors, not evaluated code. The sandbox guarantees no I/O, no network, no filesystem — so security reviewers approve form definitions without auditing every expression. | ✅ | ✅ | ✅ | ✅ |
| 2.16 | **Evaluation budget (resource limits)** | `EvalBudget` enforces max_steps, max_alloc_bytes, wall-clock deadline. Max recursion 128. | Prevents resource exhaustion from pathological expressions. | ✅ | ✅ | — | — |
| 2.17 | **Structured evaluation trace** | `Trace` captures ordered steps: FieldResolved, FunctionCalled, BinaryOp, IfBranch, ShortCircuit. Opt-in. | Expression debugging, error explanation, MCP tool consumption, audit trails. | ✅ | ✅ | ✅ | — |
| 2.18 | **Dependency extraction (static analysis)** | Walks AST without evaluation → `Dependencies { fields, context_refs, instance_refs, mip_deps, has_self_ref, has_wildcard, uses_prev_next }`. | FormEngine dependency graph, circular reference detection, reactive triggers, lint rules. | ✅ | ✅ | ✅ | ✅ |
| 2.19 | **Extension function system** | `ExtensionRegistry` allows host-specific functions. Cannot shadow builtins or reserved words. Null-propagating by default. | Host-specific functions (geospatial, encryption) without modifying the core language. | ✅ | ✅ | ✅ | — |
| 2.20 | **Expression printer (round-trip)** | Serializes AST → FEL source. Parentheses only when needed for precedence. Preserves `!` vs `not`, ternary vs `if-then-else`. | AST transformation pipelines, refactoring, AI authoring. | ✅ | ✅ | — | — |
| 2.21 | **Source preparation / normalization** | `prepare_for_host()` rewrites bare `$`, repeat refs, row aliases into canonical wildcard paths. | Correct FEL evaluation inside repeat contexts without host rewriting. | ✅ | ✅ | — | — |
| 2.22 | **72 stdlib functions (10 categories)** | Aggregate (12, incl. `sumWhere`/`avgWhere`/`minWhere`/`maxWhere`), String (11), Numeric (5), Date (13), Logical (6), Type (9), Money (6, incl. `moneySumWhere`), MIP (4), Repeat (3: `prev`, `next`, `parent`), Locale (3). Package split: 61 Universal, 11 Formspec-only. | Complete expression coverage for form-domain calculations: budget totals, date arithmetic, type checking, money operations, cross-field queries. | ✅ | ✅ | ✅ | ✅ |
| 2.23 | **FEL arity checking** | Analysis-time validation: `check_function_arity()` verifies call argument counts match catalog-declared parameters. Handles optional (`?`) and variadic (`...`) params. Emits arity mismatch warnings. | Catches `sum(a, b, c)` (extra arg silently ignored at runtime) before deployment. Non-fatal warnings — expressions remain valid. | ✅ | ✅ | — | — |

#### 2.24 Known FEL Gaps

*Identified by comparative analysis vs. XForms, FEEL, FHIR Questionnaire. All gaps are ⚪ (not spec'd, not implemented).*

| # | Gap | What it would enable | Workaround today |
|---|-----|---------------------|-----------------|
| 2.24a | **`filter()` predicate** | `$items[filter(.total > 100)]` — filter array elements by expression | `sumWhere()`/`countWhere()` aggregates only |
| 2.24b | **`some()` / `every()` quantified expressions** | `some($items.total > 100)` — existential/universal quantification over arrays | No equivalent; requires manual enumeration |
| 2.24c | **`valid()` state query** | Cross-field validation gated on another field's validity state | No equivalent |
| 2.24d | **`moneySub()` / `moneyMul()` / `moneyDiv()`** | Complete money arithmetic (subtract, scalar multiply, ratio) | `moneyAdd()` only; manual currency handling |
| 2.24e | **`displayValue()` option label access** | Summary views and calculated display text from selected option labels | No equivalent |
| 2.24f | **`initialExpression` one-time defaults** | Pre-populated values that survive visibility toggles (vs `default` which re-fires on each transition) | Manual field setup via instances |
| 2.24g | **`answerConstraint` open/closed choice** | Reject or allow free-text entry beyond listed options | No equivalent; all choices are open |
| 2.24h | **Calculated-field user-edit semantics** | Defined policy when user edits a `calculate`-governed field (block / warn / silently overwrite / treat as override) | Behavior undefined |

---

## 3. Processing Model & Reactive Engine

*For reviewers and auditors: every form produces identical validation and calculation results whether rendered in a browser, on iOS, or re-evaluated server-side. Deterministic processing means an audit re-evaluation matches the original submission exactly — legally necessary, not just nice to have. For developers: framework-agnostic, pluggable, delta-patched for minimal re-renders.*

| # | Feature | Description | Why | Status | Rust | TS | Py |
|---|---------|-------------|-----|--------|------|----|----|
| 3.1 | **4-phase reactive cycle** | Rebuild (item tree + repeat instances) → Recalculate (relevance, required, readonly, calculate) → Revalidate (binds + shapes) → NRB (non-relevant behavior). Calculate settle capped at 100 iterations; pipeline runs fixed double-pass if values change. | Deterministic processing means an audit re-evaluation produces identical results. The same form definition evaluated on the same inputs yields the same outputs — in browser, on server, or in an audit replay. Not just consistent; legally necessary for rights-impacting workflows. | ✅ | ✅ | ✅ | ✅ |
| 3.2 | **FormEngine (Preact Signals)** | Central TS class. `setValue` → coerce → batch WASM eval → delta-patch all signals atomically. 14+ public API methods. | Framework-agnostic reactive form runtime. Delta patching minimizes re-renders. | ✅ | — | ✅ | — |
| 3.3 | **Pluggable reactive runtime** | `EngineReactiveRuntime` interface (`signal`, `computed`, `effect`, `batch`). Default: `@preact/signals-core`. Constructor accepts any implementation. | Framework portability without coupling to Preact. | ✅ | — | ✅ | — |
| 3.4 | **FieldViewModel (reactive presentation)** | Per-field reactive facade: `label`, `hint`, `description`, `value`, `required`, `visible`, `readonly`, `errors`, `firstError`, `options`. 6-step label cascade with locale resolution + FEL interpolation. | Fully localized forms where every user-facing string reactively updates on locale change. | ✅ | — | ✅ | — |
| 3.5 | **FormViewModel** | Form-level reactive state: `title`, `description`, `isValid`, `validationSummary`. Per-page titles with locale cascade. | Form-level presentation layer for headers, progress, summary views. | ✅ | — | ✅ | — |
| 3.6 | **Event replay** | `replay(events[])` / `applyReplayEvent(event)`. Accepts typed event sequence (`setValue`, `addRepeatInstance`, `evaluateShape`, etc.). Deterministic. | Server-side replay of client interactions for audit, testing, cross-device sync. | ✅ | — | ✅ | — |
| 3.7 | **External validation injection** | `injectExternalValidation(results[])` merges externally-produced validation results into the pipeline. Clear per-path or globally. | Server-side validation, cross-field rules from external systems, rules not expressible in FEL. | ✅ | — | ✅ | — |
| 3.8 | **Instance calculate writeback** | Calculate binds targeting `@instance(name).path` update instance data after each eval cycle. | Computed fields that update pre-populated source data (e.g., recalculated totals written back to profile). | ✅ | — | ✅ | — |
| 3.9 | **Calculate-before-required ordering** | `refresh_required_state()` re-evaluates all required expressions AFTER calculated values and variables have fully settled via calculate fixpoint. Two-pass design ensures `required` on a calculated field always sees the computed result. | Prevents silent logic errors where conditional required on calculated fields evaluates against null. Identified and fixed via chaos testing. | ✅ | ✅ | ✅ | — |

---

## 4. Validation System

*For form authors: field-level and cross-field rules expressed declaratively — no imperative code. For respondents: structured error messages, not generic "invalid." For reviewers and auditors: machine-readable validation reports that are admissible evidence, not presentation-layer strings.*

| # | Feature | Description | Why | Status | Rust | TS | Py |
|---|---------|-------------|-----|--------|------|----|----|
| 4.1 | **Bind constraints** | Per-field: `required`, `constraint` (FEL), `readonly`, `calculate`, `relevant`, `default`, `disabledDisplay` (`"hidden"`/`"protected"`). `default` fires on each non-relevant→relevant transition (distinct from `initialValue` which fires once at creation). `disabledDisplay` controls readonly rendering independently from data locking. | Field-level behavioral layer — the core mechanism for reactive form logic. | ✅ | ✅ | ✅ | ✅ |
| 4.2 | **Shape rules (cross-field)** | `shapes[]` with `target`, `constraint` (FEL), `activeWhen`, composition operators (`and`, `or`, `not`, `xone`). Per-shape validation timing (`continuous`/`submit`/`demand`). | Cross-field constraints (budget must balance, date ranges valid). Per-shape timing gives fine-grained control over when users see feedback. | ✅ | ✅ | ✅ | ✅ |
| 4.3 | **Structured validation results** | `ValidationReport` with severity levels (`error`/`warning`/`info`), constraint kinds, path-based targeting, wildcard support (`items[*].field`). | Machine-readable validation — not just display strings. Enables CI, audit, and programmatic error handling. | ✅ | ✅ | ✅ | ✅ |
| 4.4 | **Non-relevant behavior (NRB)** | Configurable per-bind `nonRelevantBehavior`: `remove` (omit from response), `empty` (null), `keep` (preserve). 5-step resolution: exact → wildcard → stripped-indices → parent → default. | Controls what happens to data when fields become irrelevant. Different fields can have different behaviors on the same form. | ✅ | ✅ | ✅ | ✅ |
| 4.5 | **ExcludedValue (dual-axis non-relevant)** | `excludedValue` controls what downstream expressions see for non-relevant fields' in-memory values — independent from response behavior. | Calculated total can include a non-relevant field's value (audit continuity) while excluding it from the submitted response. | ✅ | ✅ | ✅ | ✅ |
| 4.6 | **Null semantics for missing fields** | Defined but no value entered → `null` in FEL. Distinct from empty string or zero. | Progressive data collection where partial submissions are valid. `null` ≠ `""` ≠ `0`. | ✅ | ✅ | ✅ | ✅ |
| 4.7 | **Validation message cascade** | Per-code locale key → per-bind locale key → inline `constraintMessage` → processor default. Code synthesis: `required→REQUIRED`, `type→TYPE_MISMATCH`, `constraint→CONSTRAINT_FAILED`. | Context-appropriate, localized error messages per field and per constraint. | ✅ | ✅ | ✅ | — |

---

## 5. Companion Documents (Sidecar Architecture)

*Companion documents are specification-level artifacts with their own JSON Schemas and lint rules. Implementation lives in the schemas + linter + Python adapter suite; no per-runtime Rust/TS/Py columns (single Status column instead).*

### 5.1 Theme (`$formspecTheme: "1.0"`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.1.1 | **3-level cascade** | `defaults` → `selectors` (match by `type`/`dataType`) → `items[key]`. Increasing specificity. | Decouples visual control from data model. "One theme for web, one for mobile" without touching the Definition. | ✅ |
| 5.1.2 | **Design tokens** | Flat key-value map (`color.primary`, `spacing.md`). Referenced via `$token.<key>`. Single source of truth for visual constants. | Rebrand = edit tokens, not every field. | ✅ |
| 5.1.3 | **Token metadata registry** | Per-theme custom token categories with type/description/darkMode metadata. | Tooling validates tokens, generates docs, auto-produces dark-mode variants. | ✅ |
| 5.1.4 | **Widget assignment + fallback chains** | `widget` + ordered `fallback` chain. Renderers degrade gracefully. | Custom `x-` widgets always carry a standard fallback. | ✅ |
| 5.1.5 | **Page layout (12-column grid)** | `pages[]` with `regions[]` placing items with `span` (1-12) and optional `start`. | Wizard/sectioned navigation. | ✅ |
| 5.1.6 | **Responsive breakpoints + region overrides** | Named min-width values. Per-region `responsive` overrides per breakpoint. | Same theme adapts across viewport sizes. | ✅ |
| 5.1.7 | **5-level theme cascade resolver** | formPresentation → item.presentation → theme defaults → selectors → items overrides. Every resolved property tracks its `source`. | Design systems define presentation at multiple specificity levels. Type-aware selectors (all boolean → Toggle). | ✅ |
| 5.1.8 | **CSS class union** | Classes accumulate across all cascade levels (not replace). | Additive class composition without coordination. | ✅ |
| 5.1.9 | **Accessibility block** | `role`, `description`, `liveRegion` (off/polite/assertive). | Screen-reader announcements, ARIA role overrides. | ✅ |
| 5.1.10 | **Platform targeting** | `platform`: web/mobile/pdf/print/kiosk/universal. Author intent declaration. | Renderers may select by platform. | ✅ |
| 5.1.11 | **External stylesheets** | Ordered URI references to CSS files. | Integration with USWDS, Bootstrap without token re-declaration. | ✅ |
| 5.1.12 | **Version binding** | `targetDefinition.compatibleVersions` semver range. Mismatch → warn + fallback. | Theme safety across definition updates. | ✅ |
| 5.1.13 | **Widget hint on Definition items** | `presentation.widgetHint` declares preferred widget type ("textarea", "select", etc.) on Definition items. Theme widget assignment (5.1.4) can override. Decouples authoring intent from rendering choice. | Author declares "this text field should render as a textarea" without controlling the theme's widget strategy. | ✅ |

### 5.2 Component (`$formspecComponent: "1.0"`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.2.1 | **Component tree** | Single-root tree of typed component nodes. Parallel presentation tree bound to Definition items. | Full declarative layout replacing DOM authoring. | ✅ |
| 5.2.2 | **Slot binding** | Maps component to Definition item `key`. Renderer inherits label, required, readonly, relevant, validation. | Items appear in component tree without re-declaring behavioral properties. | ✅ |
| 5.2.3 | **Conditional rendering (`when`)** | FEL boolean on any component. `false` hides from display but preserves data. | Progressive disclosure. `when` is weaker than Bind `relevant` (which clears data). | ✅ |
| 5.2.4 | **35 built-in components** | Layout (10), Input (13), Display (9), Interactive (2). Closed taxonomy. 18 Core (MUST implement), 17 Progressive (SHOULD with fallback). | Covers full range of form UI primitives. Progressive degradation. | ✅ |
| 5.2.5 | **Fallback chains** | Per-component `x-lm.fallback` (Rating → NumberInput, Tabs → Stack, DataTable → Stack of Cards). | Graceful degradation when renderer lacks a component. | ✅ |
| 5.2.6 | **Custom component templates** | Named templates with `params[]` and `tree`. Instantiated via `{paramName}` interpolation. Recursive refs forbidden. | Reusable sub-trees without duplication. | ✅ |
| 5.2.7 | **Responsive overrides** | Per-component breakpoint-keyed prop overrides. Mobile-first cumulative cascade. | Component-level responsive behavior without separate trees. | ✅ |
| 5.2.8 | **Node IDs for locale/testing** | Optional `id` attribute. Enables `$component.<id>.prop` locale addressing, test selectors, accessibility anchoring. | Per-node locale overrides and testing hooks. | ✅ |
| 5.2.9 | **Click-to-Sign attestation** | Typed affirmation component — respondent types name/initials to attest to a statement. Locks bound fields after signing. Produces `attestation.captured` ledger event with structured metadata (who, when, what statement). Distinct from `Signature` (freehand biometric). | Regulatory consent requirements (21 CFR Part 11, ESIGN, eIDAS) need typed attestation, not just a drawn squiggle. Component is specified; implementation not started. | ⚪ |

### 5.3 Locale (`$formspecLocale: "1.0"`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.3.1 | **Fallback cascade** | Regional (`fr-CA`) → base language (`fr`) → explicit `fallback` chain → inline Definition defaults. Circular chain detection. | Zero-translation-gap: untranslated strings inherit from next level up. | ✅ |
| 5.3.2 | **FEL interpolation in strings** | `{{FEL expr}}` evaluated at render time. Broken expressions fall back to raw template with diagnostic. | Dynamic labels: `"Total: {{formatNumber($total)}}"`, computed validation messages. | ✅ |
| 5.3.3 | **CLDR plural forms** | `pluralCategory(count, locale)` returns zero/one/two/few/many/other per CLDR rules. | Grammatically correct plurals across languages. | ✅ |
| 5.3.4 | **Context suffixes** | `key@accessibility`, `key@short`, `key@pdf` target context-specific variants. | Same field has different labels in compact vs. full display, or screen-reader-specific hints. | ✅ |
| 5.3.5 | **Cross-tier namespaces** | `$form.*`, `$shape.<id>.*`, `$page.<id>.*`, `$optionSet.<set>.*`, `$component.<nodeId>.*`, `key.errors.<CODE>`. | One flat map covers every localizable string across all tiers. | ✅ |
| 5.3.6 | **RTL auto-detection** | Arabic, Hebrew, Farsi, Urdu auto-detected from BCP 47 tags. | Bi-directional text support without manual configuration. | ✅ |

### 5.4 Mapping (`$formspecMapping: "1.0"`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.4.1 | **Bidirectional transforms** | `forward` (Response→External), `reverse` (External→Response), `both`. | Round-trip data exchange: submit to FHIR, import from FHIR. | ✅ |
| 5.4.2 | **10 field rule transform types** | preserve, drop, expression (FEL), coerce, valueMap, flatten, nest, constant, concat, split. Default handled as separate fallback property. | Covers every practical data transformation between form and external schema. | ✅ |
| 5.4.3 | **3 adapter formats** | JSON (pretty/sortKeys/nullHandling), XML (declaration/indent/cdata/namespaces), CSV (delimiter/quote/header/encoding/lineEnding). | Government forms require XML (SAM.gov, Grants.gov), CSV (bulk), JSON (REST). | ✅ |
| 5.4.4 | **Value maps with unmapped strategies** | Forward + optional reverse. `unmapped`: error/drop/passthrough/default. Bijective auto-reverse. | Code-system translation (male/female/other ↔ M/F/O). | ✅ |
| 5.4.5 | **Auto-map mode** | Synthetic `preserve` rules at priority -1 for unmapped fields. | Quick mapping for structurally-compatible schemas. | ✅ |
| 5.4.6 | **Conditional guards** | FEL boolean `condition` per rule. Rule skipped when false/null. | Conditional mapping (only map org fields when contact_type = 'organization'). | ✅ |
| 5.4.7 | **Array handling (3 modes)** | `each` (iterate per element), `whole` (entire array as value), `indexed` (positional). Nested inner rules. | Repeat group → external array mapping; aggregate operations. | ✅ |
| 5.4.8 | **3 conformance levels** | `core` (forward JSON), `bidirectional` (+ reverse), `extended` (+ XML/CSV). Each a strict superset. | Renderer capability declaration. | ✅ |

### 5.5 Ontology (`$formspecOntology: "1.0"`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.5.1 | **Concept bindings** | Item paths → `{concept, system, display, code, equivalents[]}`. Concept IRI is globally unique. | Every form field has semantic identity queryable by external systems. | ✅ |
| 5.5.2 | **Cross-system equivalences (SKOS)** | Per-concept `{system, code, display, type}` with relationship types: exact, close, broader, narrower, related. | Same concept resolves across FHIR, schema.org, IRS without manual lookup. | ✅ |
| 5.5.3 | **Vocabulary bindings** | Option sets → `{system, version, filter}`. Connects choice lists to terminologies (ICD-10, LOINC). | Option sets carry formal semantics, not just display labels. | ✅ |
| 5.5.4 | **JSON-LD context** | Inline `@context` fragment. Applied to response → valid JSON-LD document. | Form responses participate in linked-data ecosystems. | ✅ |

### 5.6 References (`$formspecReferences: "1.0"`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.6.1 | **Audience tagging** | `human`, `agent`, `both` per reference. UI renders `human`; AI consumes `agent`. | One document serves humans and AI without pollution. | ✅ |
| 5.6.2 | **Relationship types** | `authorizes`, `constrains`, `defines`, `exemplifies`, `supersedes`, `superseded-by`, `derived-from`, `see-also`. Custom via `x-`. | Weighted context: `constrains` is authoritative, `see-also` is background. | ✅ |
| 5.6.3 | **Agent data store URIs** | `vectorstore:provider/id`, `kb:provider/id`, `formspec-fn:name`, `urn:x-org:type:id`. | Decoupled references to AI infrastructure without embedding credentials. | ✅ |
| 5.6.4 | **Tool invocation schemas** | `type: "tool"` with JSON Schema in `content`. Agent invokes field-level tools (rate calculators, drug checkers). | Bridges static definitions and dynamic data sources for AI agents. | ✅ |
| 5.6.5 | **Context assembly algorithm** | 8-step advisory algorithm for agents: filter by path → walk ancestors → filter audience → sort priority → weight by rel → resolve URIs. | Standard context assembly prevents ad-hoc agent implementations. | 🟡 |

### 5.7 Registry (`$formspecRegistry: "1.0"`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.7.1 | **7 entry categories** | `dataType`, `function`, `constraint`, `property`, `namespace`, `concept`, `vocabulary`. | Closed taxonomy; processors know how to consume each. | ✅ |
| 5.7.2 | **Lifecycle states** | `draft` → `stable` → `deprecated` → `retired`. Must not skip. `deprecated` requires notice. | Extension governance without central authority. | ✅ |
| 5.7.3 | **Compatibility bounds** | `formspecVersion` semver range. Mismatch → warn or hard error if `x-formspec-strict`. | Extensions declare which spec versions they support. | ✅ |
| 5.7.4 | **Common registry (18 entries)** | `x-formspec-email`, `x-formspec-phone`, `x-formspec-ssn`, `x-formspec-ein`, `x-formspec-luhn`, `x-formspec-age`, `x-formspec-mask`, etc. | Production-ready domain extensions for US government forms. | ✅ |

### 5.8 Assist (`$formspecAssist`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.8.1 | **14 MCP tools** | Inspection (5), Validation (3), Help (3), Mutation (3). Tool catalog registered via WebMCP. | Structured AI/form-agent interaction: observe, validate, advise, act. | 🟦 |
| 5.8.2 | **Profile matching** | Ontology-aware concept matching with confidence scores (exact=0.95, close=0.8, broader=0.6, related=0.4, field-key=0.3). | AI auto-fill with declared uncertainty; hosts decide threshold. | 🟦 |
| 5.8.3 | **Profile learning** | Capture field values as concept entries for reuse across forms. | Reduces repetitive data entry across multiple form interactions. | 🟦 |
| 5.8.4 | **User consent model** | Mutation tools require explicit user consent before execution. Per-session, per-tool, or per-call. | No silent data modification by AI agents. | 🟦 |

### 5.9 Changelog (`$formspecChangelog: "1.0"`)

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 5.9.1 | **5 change operations** | `added`, `removed`, `modified`, `moved`, `renamed`. Each with target, path, impact, description, before/after. | Atomic, machine-readable diff between Definition versions. | ✅ |
| 5.9.2 | **3-level impact classification** | `breaking` (→ major), `compatible` (→ minor), `cosmetic` (→ patch). `semverImpact` = max across all changes. | Automated semver governance; CI/CD gates on breaking changes. | ✅ |
| 5.9.3 | **Migration hints** | `drop`, `preserve`, or FEL expression referencing `$old`. Auto-generates migration fieldMap entries. | Automated response data migration between versions. | ✅ |

---

## 6. Signature & Response Architecture

*For respondents: legally meaningful "I signed this specific data at this time." For verifiers: standard COSE_Sign1 + canonical JSON — no proprietary signature format. For procurement: five registered signature methods including PQC-ready entries; posture declarations answer "what are your signing controls?" before the security review starts.*

| # | Feature | Description | Why | Status | Rust | TS | Py |
|---|---------|-------------|-----|--------|------|----|----|
| 6.1 | **Signed responses (`authoredSignatures`)** | One or more signature records attached to Response envelope. Each binds signer to canonical payload via `signedPayload.digest`. Multiple signatures (co-signatures) supported. | Procurement asks "how do you prove who signed what, and when?" Respondents sign a canonical payload — not a UI screenshot. Co-signatures don't invalidate earlier signatures. Standard COSE_Sign1 envelope, not a proprietary format. Critical for any workflow where a signature carries legal weight. | ✅ | ✅ | ✅ | ✅ |
| 6.2 | **Canonical JSON (JCS-lite)** | `formspec-response-signing-v1` is the Formspec profile shape: omit `authoredSignatures`, apply `formspec.response.signed-payload.v1`, and consume the shared `integrity-canonical-json-v1` canonical-byte primitive. | Adding co-signatures does not invalidate earlier signatures. Cross-system verification. Keeps the client-visible Formspec profile name distinct from the shared substrate primitive. | ✅ | ✅ | — | — |
| 6.3 | **COSE_Sign1 wire format** | `signatureValue` = base64-encoded COSE_Sign1 (RFC 9052). CBOR tag 18, 4-field body, `alg` + optional `kid` in protected header. | Standard, compact, CBOR-based signature envelope with IANA-registered algorithm identifiers. PQC-ready. | ✅ | ✅ | ✅ | — |
| 6.4 | **Signature method registry** | 5 entries: Ed25519, ECDSA-P256, RSA-PSS-SHA256, ML-DSA-65 (PQC), SLH-DSA-128s (PQC). Versioned `name@version` format. Schema pattern validation rejects unregistered methods. | Centralized algorithm registry. PQC entries registered now; infrastructure ready when IANA assigns codepoints. | ✅ | ✅ | ✅ | — |
| 6.5 | **Verifier port trait** | `Verifier` trait + `VerifyRequest` + `VerificationReceipt`. Swappable backends (ring, WebCrypto, HSM). | Clean ports-and-adapters pattern for signature verification. | ✅ | ✅ | ✅ | — |
| 6.6 | **Ring adapter (server-side)** | Ed25519, ECDSA-P256, RSA-PSS-SHA256 via `ring` crate. COSE_Sign1 decode + Sig_structure verification. | Production-grade server-side verification. | ✅ | ✅ | — | — |
| 6.7 | **WebCrypto adapter (browser)** | Ed25519 via `crypto.subtle.verify`. ECDSA/RSA-PSS stubs pending. | Browser-native client-side verification. | 🟦 | — | ✅ | — |
| 6.8 | **Verification receipts** | Tri-state result (verified/failed/unsupported). Captures adapter, key, registry version, timestamp. Optional `receiptBytes`. Context: revocation, timestamping, witness anchor. | Durable evidence for audit, dispute, legal admissibility. | ✅ | ✅ | ✅ | — |
| 6.9 | **Posture declarations** | Per-deployment policy: `allowedMethods`, `minimumPrimitiveVerification`, `receiptSigningRequired`, `allowedSigningIntents`, `jurisdictionalPosture` (ESIGN/UETA/eIDAS), `custodyPosture`. | Procurement asks "what signature methods do you support, and do you enforce minimums?" Posture declarations answer before the security review starts. Operators declare policy once; enforcement prevents undersigned responses — no after-the-fact audit scrambling. | 🟡 | — | — | — |
| 6.10 | **Cross-stack fixture harness** | 7 bundle directories with manifest-driven tests: Formspec-only, WOS-governed, posture-rejected, tampered, divergence, deferred, full-end-to-end. Byte-level cross-layer equality checks. | Proves cryptographic correctness across Formspec → WOS → Trellis. | ✅ | ✅ | — | — |
| 6.11 | **Response pinning** | Every Response pinned to exact Definition via immutable (`definitionUrl`, `definitionVersion`). Validation always against pinned version (VP-01). | Completed response always validates against the rules in effect when captured. | ✅ | ✅ | ✅ | ✅ |

---

## 7. Intake Handoff & Cross-Spec Contracts

*Cross-stack boundary artifacts — specified as schemas + fixture harness (section 6.10). Implementation columns omitted; contract correctness is proven by byte-level cross-stack equality checks, not per-runtime feature parity.*

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 7.1 | **IntakeHandoff boundary artifact** | Two modes: `publicIntake` (respondent-initiated, `caseRef: null`) and `workflowInitiated` (case-requested, `caseRef` required). Carries definition pin, response ref, response hash, validation report ref, ledger head ref. | Clean custody boundary: Formspec owns intake evidence; WOS owns governed case identity. | ✅ |
| 7.2 | **Response hash integrity** | SHA-256 digest covering full envelope including `authoredSignatures` (distinct from `signedPayload.digest` which omits them). | Tamper-evident envelope independent of signature verification. | ✅ |
| 7.3 | **WOS Formspec Coprocessor** | Formspec definitions serve as WOS contract validators. Engine validates task responses against the same bind/shape rules. | WOS reuses Formspec validation without inventing a second form language. | ✅ |

---

## 8. Screener System

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 8.1 | **Standalone screener document** | Freestanding routing instrument with no `targetDefinition`. Screening items + binds in isolated scope. | Reusable screening instruments decoupled from individual forms. | ✅ |
| 8.2 | **3 evaluation strategies** | `first-match` (binary gate), `fan-out` (multi-eligibility mapping), `score-threshold` (weighted scoring). Extension strategies via `x-`. | Real-world screening requires different decision patterns. | ✅ |
| 8.3 | **Override routes (safety-critical)** | Override routes hoisted before all phases. Terminal overrides halt pipeline. Two-stage: evaluate ALL overrides, THEN check terminal. | Safety-critical classifications (sanctions, crisis triage) must not be bypassed by strategy choice. | ✅ |
| 8.4 | **Determination Record** | Structured output: screener provenance, status, override results, per-phase results (matched/eliminated/scores), complete inputs map. | Complete, auditable, reproducible evaluation outcome. | ✅ |
| 8.5 | **3 answer states** | `answered`, `declined` (explicit non-response), `not-presented` (hidden). Preserved in Determination Record. | `declined` is semantically distinct from null — positive assertion with audit significance. | ✅ |
| 8.6 | **Availability windows** | Calendar-gated acceptance via `availability` date range. | Capacity management for seasonal or time-limited programs. | ✅ |
| 8.7 | **Result validity** | ISO 8601 duration for Determination Record expiration. | Avoids re-screening on every visit; respects temporal limits. | ✅ |

---

## 9. Respondent Ledger / Audit

*For operators and auditors: immutable, hash-chained event trail of every respondent action. Every event answers "who did what, when, and what class of value was involved?" — the kind of evidence procurement teams, courts, and regulators actually ask for.*

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 9.1 | **23 canonical event types** | Required (13): session.started, draft.saved/resumed, response.completed/amended/amendment-opened/stopped, attachment.added/replaced/removed, prepopulation.applied, system.merge-resolved, validation.snapshot-recorded. Optional (10): calculation.material-change, field.edit-recorded, response.correction-recorded, etc. | Structured audit trail of every respondent action. | ✅ |
| 9.2 | **Hash chains** | Each event carries `previousHash` + `eventHash` (SHA-256 of canonical JSON). Three `integrityProfile` modes: `none`, `chained`, `trellis-wrapped`. | Procurement asks "can your audit trail be modified?" Hash-chained events answer definitively. Any alteration breaks the chain — and the break is detectable, not silent. Three profiles: self-chained (lightweight), Trellis-wrapped (cryptographic, legal-grade). | ✅ |
| 9.3 | **ChangeSetEntry (value class tracking)** | Atomic change units with `op` (set/unset/add/remove/replace), `path`, `valueClass` (user-input/prepopulated/calculated/imported/system-derived/migration-derived). | Answers "who originated this value?" — critical for dispute resolution. | ✅ |
| 9.4 | **Attachment binding integrity** | `EvidenceAttachmentBinding` with `attachment_id`, `attachment_sha256`, `payload_content_hash`, `prior_binding_hash` (chaining replacements). | Portable, tamper-evident attachment identity independent of storage layout. | ✅ |
| 9.5 | **Offline authoring profile** | `OfflineAuthoringProfile` tracks sync state (online/pending-local/syncing/synced/conflict). Local-linear chain construction for buffered events. Authored-time preservation. | Correct chain semantics when device is offline for extended periods. | ✅ |
| 9.6 | **Identity & assurance model** | 4 ordered levels (L1 self-asserted → L4 in-person). Independent disclosure tiers (anonymous/pseudonymous/identified/public). Forward-only assurance upgrades. | Provider-neutral identity proofing. Survives provider changes. | ✅ |
| 9.7 | **Correction records** | `response.correction-recorded` with target event hash, corrected field set, original/corrected value pairs, reason, authorization ref. | Auditable corrections without rewriting history. | ✅ |

---

## 10. Lint & Static Analysis (37 Rules)

*7-pass pipeline (with 2 sub-passes). All rules tested with fixture coverage. 3 lint modes: Runtime, Authoring (suppresses select warnings), Strict (promotes warnings to errors).*

| # | Category | Codes | What It Catches | Status |
|---|----------|-------|-----------------|--------|
| 10.1 | **Document detection** | E100 | Unrecognizable document type | ✅ |
| 10.2 | **Schema conformance** | E101 | JSON Schema violations against embedded schemas | ✅ |
| 10.3 | **Structural (item tree)** | E200, E201 | Duplicate item keys, duplicate full paths | ✅ |
| 10.4 | **Reference integrity** | E300, E301, E302, W300 | Bind/shape target resolution, optionSet validation, dataType compatibility | ✅ |
| 10.5 | **Extension lifecycle** | E600, E601, E602 | Unresolved, retired, deprecated extensions against registries | ✅ |
| 10.6 | **FEL expression analysis** | E400 | Parse errors in all expression slots (binds, shapes, variables, screener) | ✅ |
| 10.7 | **Circular dependency detection** | E500 | Dependency cycles in dataflow expressions (calculate, relevant, required, readonly) | ✅ |
| 10.8 | **Theme validation** | W700–W709, W711, E710 | Token value validation, unresolved refs, cross-artifact consistency, page semantics, responsive breakpoints | ✅ |
| 10.9 | **Component validation** | E800–E804, E806–E807, W800–W804 | Root layout, type compatibility, option-source requirements, bind resolution, custom component cycles, duplicate binds | ✅ |

---

## 11. Multi-Runtime Support

| # | Runtime | Package/Layer | Status | Technology |
|---|---------|---------------|--------|------------|
| 11.1 | **Web Component** | `formspec-webcomponent` (L2) | ✅ Shipped | `<formspec-render>` custom element, Shadow DOM, 35 built-in components, headless behavior→adapter architecture |
| 11.2 | **React** | `formspec-react` (L2) | ✅ Shipped | 14 hooks (`useField`, `useFieldValue`, `useForm`, `useWhen`, etc.), `<FormspecForm>` auto-renderer, component override map |
| 11.3 | **iOS/macOS** | `formspec-swift` | ✅ Shipped | SwiftUI renderer with WebView bridge |
| 11.4 | **Android** | `formspec-kotlin` | 🟡 Architecture specified; runtime pending | Jetpack Compose renderer with WebView bridge (planned) |
| 11.5 | **Python** | `formspec-py` (PyO3) | ✅ Shipped | Server-side re-validation, linting, mapping, 23 exported functions |
| 11.6 | **Design adapters** | `formspec-adapters` (L3) | ✅ Shipped | USWDS (32 impl files), Tailwind (17 impl files) |
| 11.7 | **PDF (AcroForm)** | `formspec-pdf` (Rust) | 🟡 Specified + Schema; runtime pending | Fillable PDF generation with AcroForm fields, XFDF round-trip for offline fill-and-submit, PDF/UA tagged accessibility, `x-pdf` theme extensions (paper, orientation, fonts). Eliminates double data entry for PDF-first government workflows (SAM.gov, Grants.gov). |
| 11.8 | **Data science export** | `formspec.frame` (Python) | ⚪ Draft | Transform definitions + responses into typed Polars/Arrow DataFrames with column metadata, Parquet export, repeat-group normalization, null semantics tagging, cross-form alignment via concept IRIs. For data analysts consuming form data. |

---

## 12. Authoring Primitives

*Spec-level authoring infrastructure (lives in `formspec/`). Studio application features tracked in [`formspec-studio/FORMSPEC-STUDIO-FEATURE-MATRIX.md`].*

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 12.1 | **112 core commands** | Structured command catalog across 16 handler areas (items, binds, shapes, variables, theme, mapping, component, etc.). Schema-defined payloads. Enumerated in `crates/formspec-core/src/command/`. | Single source of truth for all mutations. Enables MCP tool generation, CLI autocomplete, visual editor palettes. | ✅ |
| 12.2 | **Command dispatch + undo/redo** | `RawProject` with `dispatch(cmd)`, `undo()`, `redo()`, `batch(cmds)`, state restore. Phase-aware pipeline with middleware. | Authoring engine with full history support. | ✅ |
| 12.3 | **Definition assembly (`$ref`)** | `assemble_definition()` resolves `$ref` inclusions, merges items/binds/shapes, rewrites FEL paths. Circular ref + key collision detection. | Modular form composition from reusable fragments. Multi-team development with shared libraries. | ✅ |
| 12.4 | **Response migration engine** | Ordered semver-gated migration rules (`rename`, `remove`, `add`, `transform`). FEL `transform` type evaluates expressions against full response context. | Declarative upgrade path for saved responses when form definitions evolve. | ✅ |
| 12.5 | **FEL condition group lift** | `try_liftConditionGroup()` optimization hoists shared conditions from binds into group-level relevance. | Performance optimization for the batch evaluator. | ✅ |

---

## 13. Testing & Conformance

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 13.1 | **~2,139 Python tests** | Schema conformance (892), spec examples (227), cross-spec contracts (177), unit/runtime (~700), property-based (52), round-trip (11), E2E (~27). | Multi-layered confidence in correctness. | ✅ |
| 13.2 | **~24,000 Rust tests (incl. generated)** | `fel-core` (198 + 9 proptest), `formspec-core` (71), `formspec-eval` (28), `formspec-lint` (~303), `formspec-wasm` (57), `formspec-py` (82), signature crates (18+), fixture harness (11), generated FEL edge cases (~22,285). | Spec-authoritative Rust center has exhaustive coverage. | ✅ |
| 13.3 | **Cross-runtime parity testing** | 240 FEL cases + 160 processing cases comparing Python vs TypeScript output. Tolerant-decimal comparator (1e-9). | Guarantees dual reference implementations produce identical results. | ✅ |
| 13.4 | **Property-based (Hypothesis + proptest)** | Schema fuzzing (50+ strategies), FEL algebraic invariants (12 properties: null propagation, commutativity, double negation, round-trips). | Finds edge cases in combinatorial space that hand-written tests miss. | ✅ |
| 13.5 | **Conformance suite schema** | 4 case kinds: FEL_EVALUATION, ENGINE_PROCESSING, VALIDATION_REPORT, RESPONSE_VALIDATION. 14 standard validation codes. | One case file, two runtimes, one expected output. | ✅ |
| 13.6 | **Spec example extraction** | Auto-extracts every JSON code block from spec markdown, validates against schema. 227 tests. | Spec prose stays honest — examples are always schema-valid. | ✅ |
| 13.7 | **Cross-spec contract tests** | 177 tests verifying normative spec prose matches JSON schema structure. Naming: `test_s{section}__{assertion}`. | Prevents spec-schema drift. | ✅ |
| 13.8 | **Adapter round-trip fidelity** | JSON identity, XML structure preservation, CSV value preservation, mapping forward-then-reverse. | `deserialize(serialize(x)) == x` for all supported types. | ✅ |
| 13.9 | **12-pass Python validator** | CLI: `python3 -m formspec.validate <dir>`. Auto-discovers artifacts. Lint, schema, FEL, runtime evaluation, mapping, changelog, registry. | Server-side re-validation catches authoring errors before deployment. | ✅ |

---

## 14. Accessibility

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 14.1 | **ARIA attributes (engine-driven)** | `aria-required`, `aria-invalid`, `aria-describedby` set by engine based on bind state, not individual components. | Accessibility is structural, not a rendering afterthought. | ✅ |
| 14.2 | **Keyboard navigation** | All 35 built-in components keyboard-operable. Focus management handles conditional visibility. | WCAG 2.2 AA operability requirement. | ✅ |
| 14.3 | **Screen reader support** | Repeat group add/remove announce changes. Validation errors via `aria-describedby`. Locale `@accessibility` context suffixes. | Screen-reader-specific text without polluting visual labels. | ✅ |
| 14.4 | **USWDS adapter** | Federal design system compliance out of the box. | Government projects get Section 508 compliance baseline. | ✅ |
| 14.5 | **Focus management** | Focus moves to next relevant field when fields become non-relevant. Wizard navigation focus. Repeat group focus on add/remove. | WCAG-compliant focus behavior for dynamic forms. | ✅ |

---

## 15. Data Privacy & Security

*For privacy-sensitive deployments: the product is offline-first by architecture — data lives on device until explicitly submitted. Tribal health sites, field inspectors, crisis response — any context where connectivity is unreliable or sovereignty is non-negotiable.*

| # | Feature | Description | Why | Status |
|---|---------|-------------|-----|--------|
| 15.1 | **Offline-first by architecture** | Rust/WASM kernel runs in browser. Full validation, calculations, conditional logic execute locally. No server round-trip during editing. | Field inspectors, tribal health sites, any context with unreliable connectivity. | ✅ |
| 15.2 | **FEL sandboxing** | Non-Turing-complete, side-effect-free, no I/O, no filesystem, no network. Extension functions receive only pre-evaluated values. | Form definitions are trusted author input; FEL expressions cannot escape their sandbox. | ✅ |
| 15.3 | **Data sovereignty** | Form data lives on device until explicitly submitted. No data flows to Formspec infrastructure (there is none). Apache-2.0 / BSL 1.1 ensures inspectability. | Tribal, indigenous, and sovereign communities control their own data. | ✅ |

---

## 16. Personas & User Journeys

*For product and backlog: every feature in sections 1-15 enables a specific persona to accomplish a specific goal. This section maps personas → journeys → enabling features → gaps. Features without a journey are inventory; journeys without a feature are gaps.*

### 16.1 Personas

| ID | Persona | Who they are | What they need |
|----|---------|-------------|----------------|
| P1 | **Form Author** | Builds and maintains form definitions. Program officer, compliance specialist, or LLM agent. | Author, lint, test, publish, maintain, deprecate forms. Collaborate with co-authors. Reuse shared fragments. |
| P2 | **Respondent** | Fills out and submits forms. Applicant, beneficiary, or case worker entering on someone's behalf. | Discover, fill (online/offline), save/resume, sign, submit, receive confirmation, track status, access/delete their data. |
| P3 | **Reviewer/Auditor** | Reviews submitted responses. Case officer, adjudicator, compliance auditor, court. | Receive submission, verify integrity, validate against rules, adjudicate, produce admissible evidence. |
| P4 | **Operator** | Deploys and monitors form infrastructure. Agency IT admin, platform SRE. | Deploy runtime, configure trust posture, monitor health, manage lifecycle (publish/unpublish/deprecate), view analytics. |
| P5 | **Integrator/Developer** | Embeds Formspec into an application. Frontend developer, backend engineer building intake pipelines. | Onboard (TTHW), integrate SDK, build UI, test, deploy, debug, prove WCAG/PII posture to procurement. |

### 16.2 Journey Gaps

*Format: what it would enable → workaround today. Features that already enable a journey step are listed in §1-15 and not restated here.*

| # | Persona | Gap | What it would enable | Workaround today |
|---|---------|-----|---------------------|-----------------|
| 16.1 | P2 | **Progress indicator** | Respondent sees how far through a multi-page form they are and which sections remain | No equivalent; pages exist in theme but no progress model |
| 16.2 | P2 | **Save/resume UX surface** | Respondent-facing auto-save indicator and resume picker — draft events (§9.1) exist programmatically but have no UI contract | Custom implementation per host application |
| 16.3 | P2 | **Offline sync UX** | Conflict resolution prompts, stale-definition warnings when resubmitting after offline fill | §15.1 provides the architecture; sync UX is host responsibility with no guidance |
| 16.4 | P2 | **Receipt UX** | Respondent sees a verifiable submission receipt — receipts exist cryptographically (§6.8) but have no user-visible artifact | Receipt bytes exist; display is host responsibility |
| 16.5 | P2 | **Submission status tracking** | Respondent queries "was my form received/processed/adjudicated?" | No equivalent; Formspec owns intake, not lifecycle |
| 16.6 | P2 | **Data portability / right-to-deletion** | Respondent exports all their data or requests deletion (GDPR/CCPA) | Ledgers are immutable by design (§9.2); no deletion workflow exists |
| 16.7 | P1 | **Multi-author collaboration** | Co-authors edit the same definition with review/approval gates and branch/merge workflow | §12.3 `$ref` enables modular composition but not concurrent editing |
| 16.8 | P1 | **Fragment library discovery** | Authors browse, search, and import reusable definition fragments | §12.3 `$ref` resolves local paths only; no catalog or registry |
| 16.9 | P1, P4 | **Publish/unpublish lifecycle** | Operator publishes a definition version to a runtime, unpublishes it, redirects respondents to replacement | No equivalent; definitions are files, not managed artifacts |
| 16.10 | P1, P4 | **Deprecation workflow** | Sunset timeline, respondent notification, automatic redirect to replacement definition | §5.9 changelog tracks version changes; no respondent-facing deprecation flow |
| 16.11 | P4 | **Analytics / usage dashboards** | Submission counts, error rates, completion rates, abandonment points | No equivalent; Formspec has no telemetry or metrics surface |
| 16.12 | P5 | **Onboarding (TTHW)** | Measured time-to-hello-world with a getting-started guide proving SDK ergonomics | SDK exists (§11); no onboarding measurement or canonical quickstart |
| 16.13 | P5 | **Developer debugging console** | Visual FEL trace explorer, validation report browser, event replay UI — traces (§2.17) and reports (§4.3) exist as data, not as a tool | `console.log` on the engine API |
| 16.14 | P4, P5 | **WCAG conformance report** | Formal accessibility audit proving WCAG 2.2 AA across all 35 built-in components — satisfies procurement checklist §508 | §14 documents features implemented; no formal audit or VPAT |
| 16.15 | P4, P5 | **PII encryption posture** | Document answering "how is PII protected at rest and in transit?" — satisfies procurement security review | §15 documents architecture (offline-first, sandboxed); no formal posture document |

### 16.3 Journey Steps Enabled (No Gaps)

*Journey steps fully covered by existing features — listed to confirm coverage, not to flag work.*

| # | Persona | Step | Enabling features |
|---|---------|------|-------------------|
| E.1 | P1 | Author definitions | §1 data model, §2 FEL, §4 validation, §12 authoring primitives |
| E.2 | P1 | Lint definitions | §10 lint (37 rules, 3 modes) |
| E.3 | P1 | Test definitions | §13 conformance suite (cross-runtime parity) |
| E.4 | P1 | Version + migrate | §5.9 changelog, §12.4 response migration engine |
| E.5 | P2 | Fill form (type-safe) | §1 data types, §3 processing model, §1.6 pre-population, §5.2 35 built-in components |
| E.6 | P2 | Offline fill | §15.1 offline-first architecture (Rust/WASM in browser) |
| E.7 | P2 | Sign response | §6.1-6.8 COSE_Sign1 signing + verification |
| E.8 | P2 | Submit response | §7 intake handoff |
| E.9 | P3 | Verify integrity | §7.2 response hash, §6 COSE verification, §6.10 fixture harness |
| E.10 | P3 | Validate submission | §6.11 response pinning, §4 validation system |
| E.11 | P3 | Audit event trail | §9 respondent ledger (hash-chained, 23 event types) |
| E.12 | P4 | Deploy runtime | §11 multi-runtime, §6.9 posture declarations |
| E.13 | P5 | Integrate SDK | §3.2 FormEngine, §3.3 pluggable runtime, §11.1 webcomponent, §11.2 React, §11.5 Python |
| E.14 | P5 | Customize rendering | §5.1 theme, §5.2 components, §11.6 design adapters (USWDS, Tailwind) |
| E.15 | P5 | Map data to external schemas | §5.4 mapping (10 rule types, JSON/XML/CSV, bidirectional) |

---

## Strategic Position

### What Formspec Is

A **form engine** — data, logic, validation, rendering. Defines what forms are and how they behave. Not a SaaS product, not a workflow engine, not a database.

### Two Claims

1. **Claim A — LLM-authored forms** (§1 data model, §10 lint, §12 authoring primitives, §13 conformance). Forms are structured data. Spec → schema → lint → conformance is the LLM's authoring loop (37 lint rules, 2,139+ conformance tests, 112 spec-level core commands). Compression to seconds.
2. **Claim B — AI-assisted form filling** (§5.8 Assist, §5.5 Ontology, §5.6 References). At runtime, AI helps users through 14 MCP tools, profile matching with ontology-grounded confidence scores, and contextual help from References documents.

### Key Differentiators

1. **Schema-first for LLM authoring** (§10 lint, §13 conformance) — Incumbent form tools cannot retrofit this without redesigning their stack.
2. **One definition, multiple runtimes** (§11) — Identical behavior on web, React, iOS, server. Shared Rust kernel guarantees parity.
3. **Deterministic expressions** (§2 FEL) — Auditable, statically analyzable, non-Turing-complete, base-10 decimal.
4. **Independent document types** (§5 companion docs, §8 screener, §9 ledger) — Each with its own spec, schema, and review cycle. Formspec ships 11 document types (Definition, Response, IntakeHandoff, Theme, Component, Locale, Mapping, Ontology, References, Registry, Changelog plus screener, ledger, posture, assist, and validation artifacts).
5. **High-stakes focus** — Tax prep, grants, insurance, clinical, compliance. Not contact forms.
6. **Cryptographic response signing** (§6) — COSE_Sign1 with cross-stack fixture harness proving byte-level correctness.
7. **Non-relevant field handling** (§4.4, §4.5) — Dual-axis (response behavior + in-memory excluded value) — a nuance most form specs ignore.

### Deferred / Not Yet

*Capabilities identified in research and ADRs that are not yet product commitments. Listed transparently — tracked here, not in the feature rows above.*

| # | Feature | Source | Why deferred |
|---|---------|--------|-------------|
| D.1 | **Field-level access classification** | ADR-0074 | Premature — proposes bucketed response encryption, key bags, Phase 5 emission. Major version bump before any production users. User need is simpler: `x-data-classification` metadata. |
| D.2 | **Native IntakeHandoff emission** | ADR-0079 | Custody is the story, not the envelope. `targetWorkflow` on definitions + auto-envelope is infrastructure that adds complexity before the custody narrative has proven user value. |
| D.3 | **Content-addressed artifact identity** | ADR-0081 | `*Ref` syntax and shared canonicalization library are infrastructure. Needed eventually; no user-facing impact yet. |
| D.4 | **Remove Theme Page Layout** | ADR-0052 | Spec change to replace `theme.pages` with component-tree-native pages. Implementation is drifting there already; formal removal is a spec cleanup, not a user feature. |

### Honest Tradeoffs

- **WASM call overhead** — Every FEL eval crosses JS-WASM boundary. The full pipeline (rebuild→recalculate→revalidate→NRB) runs in a single WASM call. Mitigated by cached ASTs and single-call batch evaluation.
- **WebView bridge latency** — iOS/Android use hidden WebView for the 35 built-in components, not native widgets. UniFFI roadmap replaces with native FFI.
- **Pre-release** — No production users, no formal accessibility audit, no stable API guarantee yet.
