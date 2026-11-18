# Evaluator parity: the server recheck and FormEngine compute one answer from the authored Definition and the filed data

**Goal.** For the same Definition and data, the browser `FormEngine` and every server recheck (`formspec_eval::evaluate`: formspec-server `composition.rs:2041-2075` `FormspecEvalAdapter`, `signing_fixture.rs:156`, `services/evaluation_instances.rs:476, 806` (all in crate `formspec-server`), `formspec-server-instance-proof/src/task_local_validation.rs:113`; wos-server `selected_formspec_processor.rs:564`; Python `src/formspec/validate/passes/runtime.py:42`) report the same validation results and the same Response data. The filed record is the verdict (GOAL.md: "server revalidation").

**Status.** Revision 3. Folds in the pre-review, the owner's rulings on Q1-Q6 (§10) and the reviewer's confirmation ("go with named changes": pending seedFrom repeats, no-invention exemption, live P ≡ F for every case, submit-profile Response data, path fixes, bare `$R`, ingress refuses for all Responses, compile-time creation fence, work-spec split out). The fs-rxih part 1 review settled the runtime design in §§2.5 and 2.8. Tickets: epic **fs-p4kg** (§9).

**Evidence base.** formspec HEAD `3f6890ef`, clean; no file under `crates/formspec-eval`, `crates/formspec-core`, `crates/formspec-wasm` or `packages/formspec-engine` changed since d126379b, and the engine dist was built from d126379b. Probes import that dist; "batch" is WASM `evaluateDefinition`, a pass-through to `formspec_eval::evaluate` (`crates/formspec-wasm/src/evaluate.rs:39-77`). Probe scripts lived in an ephemeral scratchpad; every finding below quotes its observed result so it stands without them.

**What changed from revision 1.** A second row-scope engine (`HostFelContext`) and a fourth alias binder (`variables.rs`) are in scope (N8, N9). A default-configuration parity hole (N10/Q6) is in scope. Creation has two explicit entry points (new vs resume) and is fenced behind a cargo feature. The guard asserts the filed-record verdict, a no-invention property, a per-leg ledger, re-derived `expected`, and runs once through the server adapter. `$R.x` without a subscript is a definition error (Q3). Q4 and Q5 are separate tickets. Big-O names the row-site aggregate case and its benchmark.

---

## 1. Items

Line numbers are HEAD. "Both" = browser and server agree with each other but not with Core.

### 1.1 Verified

| Item | Observed (probe) | Cause |
|---|---|---|
| **F1** named optionSet unenforced on recheck | `ZZ`: recheck no TYPE_MISMATCH, browser TYPE_MISMATCH | `rebuild/item_tree.rs:244-252` reads only `item.options`; `revalidate/items.rs:98-99` accepts any string when empty; FormEngine resolves sets first (`FormEngine.ts:258`); the TS suite runner also rewrites sets (`tests/shared-suite.test.mjs:41-51`) |
| **F2** `[]` files as phantom rows | `rows:[]`, minRepeat 1: both MIN_REPEAT **and** `rows[0].a:REQUIRED`, data `[{}]`. Suite `all-codes-validation`: browser reports MIN_REPEAT for `min_group: []` but files `[{},{}]`; the recheck of that Response passes | `rebuild/repeat_expand.rs:57-59`; `FormEngine.ts:1440-1445, 1481-1486`; Core spec.md:3213 puts padding at creation |
| **F26c** `{}` rows vanish from FEL | `[{a:'x'},{},{}]`: `count($rows[*])` = 1 (Core: 3) | `recalculate/repeats.rs:100-109` counts to the last row holding a value |
| **F12** untouched text = `''` | blank `copy=$src`: batch null, browser `''`; `isNull($src)` true vs false; suite cases file `''`/`null` for untouched fields | `helpers.ts:110`, `FormEngine.ts:1493-1503`; Core spec.md:2071-2075 |
| **F14** reopen fills blank saved cells | browser `WIDGETS`, batch null | `FormEngine.ts:1575-1593`, `instance-seeding.ts:93-114` |
| **F32** remove-then-add pre-fills | new row `GLOBEX` | `appendRepeatRow` `FormEngine.ts:479-486` → relative prePopulate by live index |
| **F22** `editable:false` not readonly on recheck | batch false, browser true; FEL `readonly($name)` false in both | `item_tree.rs:272-281`; `bind_pass.rs:119-125`; TS overlay `FormEngine.ts:1507, 1518-1524`, `reactive-patches.ts:84` |
| **F28+F31** undeclared keys | batch keeps, browser drops, neither reports | `nested_data.rs:154-155`, `output_data.rs:26-32`; `FormEngine.ts:451-453` |
| **F29** non-canonical values | `d:'12.5'`: batch TYPE_MISMATCH, browser 13.5; `invoice-single` `"150.00"` filed as `"150"` by the browser | `FormEngine.ts:595-612` → `formspec-core/src/value_coerce.rs:83-156`; evaluate ingests raw |
| **F13** row `required` naming a sibling never fires (both) | also with `@current.kind`; `relevant` works | `recalculate/mod.rs:176` → `bind_pass.rs:179-207` unscoped refresh |
| **F18** nested-group sibling null; shape qualified path spans rows (both) | `rows[*].body.copy=$a` null; shape `$rows.hi >= $rows.lo` never fires | `repeats.rs:298-336` aliases direct leaves only; shapes rewrite only `$base[*]` (`revalidate/shapes.rs:191, 207`) |
| **F21** zero rows null; `[*]` collapsed to this row (both) | `rows:[]`: `count`, `sum` null (Core: 0, 0); `share = $amt / sum($rows[*].amt)` null in every row (Core: 0.25, 0.75) | `repeats.rs:158-166`; `rebuild/wildcard.rs:37-84` textual rewrite against Core spec.md:1877 |
| **F26b** row-target shape on a non-relevant row (both) | `rows[0]:SHAPE_FAILED` | `shapes.rs:149` finds no node for `rows[0]` |

### 1.2 Corrected

- **F2** as filed ("FormEngine misses MIN_REPEAT") was already re-diagnosed; the stronger defect is the browser's report disagreeing with the recheck of its own Response.
- **F21** "browser counts rows lacking the field" is F12's `''`, not `count()` (Core spec.md:2096 counts non-null).
- **F14+F32** do change a public contract (§3).
- **F29**: the review's fix (canonicalise inside evaluate) is reversed by owner ruling Q2.

### 1.3 New

| Id | Defect | Observed | Cause |
|---|---|---|---|
| **N1** | A cleared pre-fill comes back in the filed Response (both) | after `setValue(null)`: field shows empty, `getResponse().data.name = "Acme"`, no REQUIRED | `runtime_seed.rs:184-222` re-fills null prePopulate fields on every evaluate (`pipeline.rs:59`) |
| **N2** | A row with no value reads a same-named outer field (both) | `rows[1].echo=$kind` → `"TOP"` (Core §3.8.3: null) | `repeats.rs:298-336` binds aliases only for present values |
| **N3** | Bind `constraint` reads `$rows[n]` 0-based; calculate and non-wildcard shapes 1-based | `$rows[1].lo` (lo 1, 9): calculate 1, constraint 9; `$ >= $rows.lo` fires on the wrong row | constraint env has no row arrays (`revalidate/env.rs:26-45`; arrays swapped in only at `revalidate/mod.rs:122-128`), so fel-core retries a flat key with the 1-based index (`fel-core/src/evaluator/core.rs:990-1010`) |
| **N4** | In-row undeclared key re-emitted as a flat top-level key | `{"rows":[{"a":"x"}], "rows[0].legacy":"old"}` | `output_data.rs:26-32` |
| **N5** | The recheck creates values | `{note}` with `status.initialValue` → recheck adds `status:"draft"`; seedFrom runs unless the caller sends `repeatCounts` | `rebuild/initial_values.rs:74-101`; `eval_json.rs:228-237`; servers pass `EvalOptions::default()` |
| **N6** | The parity suite cannot see most of this | — | Rust runner runs named cases only (`shared_suite.rs:107-118, 187-221`), compares 4 fields; TS runner rewrites optionSets; `expected.data` came from FormEngine runs (`shared_suite.rs:129-135`); schema claims a Python runner |
| **N7** | fel-core flat-key fallback | — | `fel-core/src/environment.rs:217-260` `project_repeat_field` is O(values) per reference and feeds N3 |
| **N8** | **Second row-scope engine** with the N2 defect. `HostFelContext`/`ScopedEnv` serves `compileExpression` (`FormEngine.ts:565`), Locale `{{}}` and Item text (`FormEngine.ts:1093, 2042`), component `when` (webcomponent `emit-node.ts:228`, `layout-plugin-builders.ts:119`; react `use-when.ts:18`) | (reviewer; confirmed by reading) | `host_context.rs:406-680`; `resolve_field` (`543-570`) falls outward when a row leaf has no value; `prepare` (`177-189`) rewrites source via fel-core `prepare_with_aliases` (`prepare_host.rs:497`, with `resolve_qualified_group_refs` at 249); the same rewrite is exported as WASM `prepareFelExpression` (`formspec-wasm/src/fel.rs:436-447`), called by FormEngine's dependency extraction (`wasm-fel.ts:69-89`, `FormEngine.ts:1755, 1955`), and Python `prepare_expression` (`formspec-py/src/fel.rs:348-355`) |
| **N9** | **Fourth alias binder.** Scoped variables alias by cloning all env data per variable; repeat-scoped variables get no row scope | (reviewer; confirmed by reading) | `recalculate/variables.rs:112-152`: O(scoped variables × values) per variables pass; prefix `rows.` never matches `rows[0].x` keys |
| **N10** | **Default-configuration hole** (Q6). Defaults are `excludedValue:"preserve"` (Core spec.md:3601) and `nonRelevantBehavior:"remove"` (`pipeline.rs:128-131`) | `{show:false, x:5, y:6}`, `x` relevant `$show`, `c=$x+1`, `y` constraint `$ = $c`: browser valid, files `{show:false,c:6,y:6}`; recheck of that Response: `c` null, `y:CONSTRAINT_FAILED`. Pure Rust disagrees with itself (`evaluate(P.data) ≠ P`) | in-session evaluation sees preserved `x`; the filed bytes do not carry it |
| **N11** | Option lists unknown at evaluation: URI-string `options` (schema `Item.options` oneOf array/uri), URL-backed `optionSets` (`option_sets.rs:5-15` → `[]`), TS-only `remoteOptions` (`FormEngine.ts:1594-1622`; absent from schema and spec) are all accepted silently by both | — | empty option list = accept anything (`revalidate/items.rs:98-99`) |

### 1.4 Dropped

The clinical-intake same-input calculated difference was a clock artifact in the probe (pinned clocks agree). Every record item reproduces.

---

## 2. Design

### 2.1 The rule

Core's processing cycle (§2.4, spec.md:1564) runs over existing data; creation-time values are defined only at Response and repeat-instance creation (spec.md:3213, 3224, 3309, 382). Every defect is a creation step, a Definition/data rewrite, or a scope rule running in the wrong place or several places. The stack gets one owner per operation, all in Rust:

1. **`evaluate(definition, data, options)`** — pure over the **authored** Definition and the data **exactly as given** (Q2). Normalises the Definition itself, counts rows from the data, evaluates every expression through one site-scope module, reports undeclared keys (Q1). Never creates, never canonicalises.
2. **Creation, new Responses only** — `create_response(definition, prefill, instances, now)` and `create_repeat_row(...)`, behind the non-default cargo feature `create` that only `formspec-wasm` enables (§2.3). **Resume** of a saved Response runs no creation (Core sentence S2: "a saved Response is not created again").
3. **Canonicalisation** — one exported Rust canonicaliser (`formspec_core::canonicalize_response_data`, built on `coerce_field_value`) called at typing (FormEngine `setValue`), at host import, and at formspec-server's API ingress (Q2).
4. **The filed record is the verdict** (Q6) — FormEngine's submit report is `evaluate(def, getResponse().data)`; a recheck sees fields pruned by `nonRelevantBehavior` as null and recomputes calculations.
5. **Candidate assembly** (ADR 0172, ADR 0173, both proposed) — `assemble_candidate(definition, response, evaluation, resolution) -> Response`, owned by formspec-eval and **outside** the `create` fence, because the server re-runs it at Sign and Submit and refuses on any difference. It is the only writer of `resolvedInstances` (0172) and `explanations` (0173).

`evaluate` takes the Response-level inputs it reads — warning explanations (0173), subject, instance resolution (0172) — rather than data alone. Instance pins: the server records them when a Response is opened, and the browser's `createResponse` receives them as `instances`; the server never calls `create`.

FormEngine holds state only: it passes the authored Definition and its data (Response-shaped) to `evaluate`, and patches signals from the result.

### 2.2 Definition normalisation inside `evaluate` (F1, F22)

- `pipeline.rs:41`: build the item tree from a clone with `formspec_core::resolve_option_sets_on_definition` applied (handles `{options}` and bare-array sets; O(items)).
- `prePopulate.editable:false` joins the readonly rule. Today (`bind_pass.rs:119-125`): `own = readonly_expr ? eval(readonly_expr) : calculate.is_some()`. After: `own = (readonly_expr ? eval(readonly_expr) : calculate.is_some()) || prepopulate_locked`. It reaches the `readonly` map and FEL `readonly()` through `env.set_mip`.
- FormEngine passes `this.definition` unmodified (a display-only resolved copy may feed widget option lists); `_prePopulateReadonly` and its `reactive-patches.ts` parameter go.
- Host-supplied option lists, URI-string options and `remoteOptions` (TS-only, absent from schema and spec) are **fs-oxsy** (Q4), not this item.

### 2.3 Creation: new vs resume (F2, F12, F14, F32, N1, N5)

Rust (`crates/formspec-eval/src/create.rs`, `#[cfg(feature = "create")]`):
- `create_response(definition, prefill, CreateOptions{instances, now_iso, extensions}) -> {data, pending}`. Host prefill goes through creation and wins key by key (Core spec.md:3266-3268: a present `[]` is host data). Creation fills absent keys: minRepeat empty rows, `seedFrom` rows with relative `prePopulate` (by seed element index, at that moment only), absolute `prePopulate`, literal and `=expr` `initialValue`. A field whose `prePopulate` source is pending gets **no** `initialValue` first (Core spec.md:3311: prePopulate takes precedence) and is listed in `pending`. A repeat whose `seedFrom` source is pending stays **absent** (not `[]`, which would be host data) and is listed in `pending`; when the source arrives it is created with `max(minRepeat, min(N, maxRepeat))` rows, and on fetch failure from the authored fallback data, else `N = 0` plus a diagnostic (Core spec.md:3270-3277). FormEngine calls `create_response` again over its current data on arrival, which fills only still-absent keys (FH-064: person edits win). This replaces `runtime_seed.rs:157-171` (`repeat_has_host_data`) and FormEngine's `_seedFromResolvedPaths`; a private app's form has five `seedFrom` repeats over source instances and is the acceptance workload.
- `create_repeat_row(definition, data, group_path, ...)`: `initialValue`, absolute `prePopulate`, nested minRepeat rows; never relative `prePopulate` (Core spec.md:3262-3263: a relative miss stays empty).
- Moves seeding out of `runtime_seed.rs` and `rebuild/initial_values.rs`; `evaluate` keeps `hydrate_inline_instances` and previous-non-relevant handling. Deletes `EvalOptions::apply_creation_seeds`, its JSON inference (`eval_json.rs:228-237`), `EvalContext::repeat_counts`, the host-count override (`pipeline.rs:44-50`) and minRepeat padding in `repeat_expand.rs:57-59`.
- **Fence.** `formspec-eval` `[features] create = []`, off by default, plus `pub const CREATION_COMPILED: bool = cfg!(feature = "create");`. `formspec-wasm` depends with `features = ["create"]`; `formspec-eval`'s own tests enable it through a self dev-dependency. Each server crate that rechecks asserts at compile time `const _: () = assert!(!formspec_eval::CREATION_COMPILED);` — formspec-server (beside `FormspecEvalAdapter`), wos-server (`selected_formspec_processor.rs`) and `wos-formspec-binding`. A build that unifies the feature into a server crate fails to compile. What it cannot see: feature unification inside the formspec workspace compiles `formspec-py` with `create` on; the Python port exports no creation. A separate `formspec-create` crate was rejected: it would need `formspec-eval` internals made public.
- WASM exports `createResponse`, `createRepeatRow`; `evaluateDefinition`'s context drops `repeatCounts`/`applyCreationSeeds` (the ad-hoc FEL context's own snapshot keeps its row counts until §2.5 replaces it).

FormEngine (`packages/formspec-engine/src/engine/`):
- Two entry points: **new** (`createResponse(def, prefill)` then evaluate) and **resume** (saved data as given, no creation). `loadResponseData` is resume. Consumers that pass a recovered draft or saved Response must call resume: formspec-web `RespondentRuntime.tsx:1587` (recovered draft as `responseData`), `respondent-flow.ts:54` (`hydrateEngineFromData`), `respondent-flow.ts:545` (party Responses).
- Deletes: Definition rewrite before evaluate (`FormEngine.ts:258`), minRepeat padding (`1440-1445, 1481-1486`), `''`/initial/prePopulate seeding (`1493-1537`, `helpers.ts:110`), `runInstanceDependentSeeding` (`1539-1594`) and its helpers in `instance-seeding.ts`, prePopulate on row add (`479-486`), the `=expr` patch-back (`reactive-patches.ts:37-41`), the `repeatCounts` side channel (`1712-1716, 1900, 1947`). Untouched fields are null in signals and absent from data; widgets render null as `''`.

### 2.4 Ingest (Q1, Q2 ruled)

- **Undeclared keys (Q1):** kept where they arrived (inside their row or group) and listed in a typed, non-blocking `EvaluationResult.undeclared_data_paths: Vec<String>` (instance paths, `rows[0].legacy`). Not `diagnostics` (that field is "errors from constraint and shape expressions", `types/evaluation.rs:37-46`). Refusing them is host policy at submit. FormEngine passes them through and re-emits them; `output_data.rs` re-nests them (fixes N4). Core S3.
- **Canonicalisation (Q2):** `evaluate` validates as given (`'12.5'` in a decimal field is TYPE_MISMATCH everywhere). One exported canonicaliser, `formspec_core::canonicalize_response_data(definition, data) -> data` (walks items, applies `coerce_field_value`), with WASM and Python bindings. FormEngine `setValue` uses its per-field form; hosts call it on import; formspec-server's API ingress runs it as a **detector**: when canonicalising would change any value, ingress refuses the Response, naming each path and its canonical value, for unsigned and signed Responses alike. Ingress never rewrites: stored bytes are the submitted text (fs-ecbq), and a Save-time rewrite breaks a later Sign, which requires the signing candidate to equal the saved revision (formspec-server `services/evaluation_instances.rs:482-494`). FormEngine resume stops coercing (`FormEngine.ts:595-612` on the load path).

### 2.5 One site-scope module (F13, F18, F21, F26b, F26c, N2, N3, N8, N9)

One module, `crates/formspec-eval/src/scope.rs`, implementing `fel_core::Environment` (`Fel::evaluate` already takes `&dyn Environment`). It **replaces** `HostFelContext`'s `ScopedEnv` (`host_context.rs:406-680`) rather than adding a sibling: `HostFelContext` keeps its public loading API (snapshot from the live engine) and gains a constructor from an `EvaluationResult`, and both feed the same scope module. Every expression is evaluated at a **site** (a concrete item or target path): Bind `calculate`/`relevant`/`required`/`readonly`/`default`/`constraint` and `constraintMessage`, the post-calculate required refresh, Shape `constraint`/`activeWhen`/`message`/`context`, Item text and Locale `{{}}`, variables, `compileExpression` and component `when`.

After resolving FEL `let` scopes, the evaluator folds the whole postfix chain on an authored field reference and passes it to `Environment::resolve_field(root, path: &[PathSegment]) -> Result<Value, FieldError>`. The host receives the root and every dot, index, and wildcard in order. At function-call nodes, FEL consults `Environment::precomputed(&Expr) -> Option<Value>` before evaluating arguments. A cache miss evaluates the call normally. The formspec-eval scope module supplies the precomputed results (§2.8).

Rules (Core §3.2.1, §3.2.2, §3.8.3, §3.10.1; FEL §6.2):

- **R1 nearest declaring scope.** `$k.rest` resolves at the nearest enclosing scope of the site (its groups and repeat instances, innermost first, then root) **that declares `k`**. A declared field with no value is null; resolution never continues past a declaring scope (fixes N2, F18 nested groups).
- **R2 unsubscripted repeat path is a definition error (Q3).** Core §3.10.1 requires the processor to stop before Recalculate when a path continues through a repeatable group without a subscript, as in `$R.x`, `$g.rows.x`, or `$outer[*].inner.x`. Check each authored expression once at Rebuild, including sites under a repeat with zero rows. Move `resolve_head` and `enclosing_repeat` from formspec-lint to formspec-core when the runtime lands and share the resolver with lint E304 (§11). Report the error at the authored site before row expansion can multiply the result. Use `$x` or `@current.x` for this row and `$R[*].x` for all rows.
- **R3 collection.** `$R[*]` is the array of `R`'s row objects in row order, one per row in the data including rows with no answers; zero rows is `[]`. `$R[*].x` is the array of `x` across rows, null where a row has none. Bare `$R` with no tail is `$R[*]` (Core S6; `host_context.rs:760` already pins `count($rows) = 2`; the private app's forms have zero uses of either spelling).
- **R4 explicit index.** `$R[n]` is 1-based for every site kind; out of range is an evaluation error (spec.md:1882-1883) (fixes N3).
- **R5 repeat context.** `@current`, `@index`, `@count`, `prev()`, `next()` come from the innermost enclosing instance for every site kind (fixes F13 including its `@current` control).
- **R6 row targets.** A shape on `R[*]` is suppressed when `R` or an ancestor is non-relevant (item-by-path index; also removes the O(tree) `find_item_by_path` per row) (fixes F26b).
- **R7 `[*]` Bind and Shape paths** (Core §4.3.3) target every row; the expression is evaluated at each concrete site; no textual rewrite. `$R[*].x` inside a row bind is all rows (fixes F21's collapse).
- **R8 variables.** A variable whose `scope` is a repeatable Group or an item inside one is evaluated once per instance, at that instance's site, and expressions under that instance see that instance's value; `#` and non-repeat scopes evaluate once (Core S8). Folds `variables.rs:112-152` aliasing into the module (fixes N9).

One row count, `RowCounts`, built once per evaluate from the flatten pass (array length per repeat instance path; `[]` and absent = 0; `{}` rows count), read by expansion, FEL arrays, cardinality, shape-target expansion (`shapes.rs:144`) and output. Until fs-i731 deletes the host side channel, host `repeatCounts` are a second input to that one count.

Deleted: textual rewrites `rebuild/wildcard.rs:37-84` (`instantiate_*`), `types/paths.rs` `resolve_qualified_repeat_refs`/`replace_qualified_group_ref`, shapes' `instantiate_wildcard_expr` (`shapes.rs:191, 207`); `HostFelContext::prepare` → `prepare_with_aliases`; FormEngine `normalizeExpressionForWasm` (`FormEngine.ts:1955`) and `normalizeExpressionForWasmEvaluation` (`wasm-fel.ts:69-89`), WASM `prepareFelExpression`, Python `prepare_expression` (dependency extraction reads the authored expression; the scope module resolves names). Alias binders `InstanceScope` shadowing (`repeats.rs:194-399`), `SiblingValues`/`restore_sibling_aliases`, `RepeatGroupArrays` and `RowContext` (`revalidate/env.rs`, `revalidate/mod.rs:122-128`), `variables.rs` aliases, the unscoped refresh walk. fs-5n76 deletes the FEL field-path split, the flat-key repeat fallback, and `project_repeat_field`, along with `resolve_qualified_group_refs` and `prepare_with_aliases` after the callers move.

Calculate visibility. Build row objects once per phase. A calculate write dirties its row and drops any hoisted result that uses the written input (§2.8). Rebuild only the dirty row.

### 2.6 The filed record is the verdict (Q6, N10)

FormEngine's submit report is `evaluate(def, getResponse().data)` with the submit trigger: the browser shows the person the verdict the server will compute. Core S4: re-evaluating a submitted Response sees fields pruned by `nonRelevantBehavior` as null and recomputes calculations. In-session (live) reports keep `excludedValue` semantics; only the submit report changes. The validation profile `on-submit` and `getResponseSnapshot` (`FormEngine.ts:827-860`) compute the report from the Response data they return, and `getResponse({profile:'on-submit'})` returns the submit evaluation's data, so the filed bytes equal the bytes the verdict was computed on (wos-server refuses any difference, `selected_formspec_processor.rs:581`).

### 2.7 Parity guard (shared suite; ledger mandatory)

One corpus, `tests/conformance/suite/*.json` against `schemas/conformance-suite.schema.json`. Schema additions (S12): `origin: "new" | "saved"` (new = creation over the payload as host prefill; saved = resume, no creation); optional `operations` (`setValue` / `addRow` / `removeRow`); FEL_EVALUATION gains optional `definitionPath`, `inputData`, `origin` and `site` for site-scoped ("when-style") expressions; ENGINE_PROCESSING `expected` may carry `undeclaredDataPaths`. Description corrected (runners are TS FormEngine + WASM and native Rust; Python is a pass-through).

**Scope of a leg.** Until ADRs 0172/0173 land, every leg compares Response `data` and the validation report only. Once they land, each leg passes the whole Response to `evaluate` and `assemble_candidate` and projects the whole Response (data, `resolvedInstances`, `explanations`), so the guard covers what the server re-runs at Sign and Submit.

**Options.** The session legs (`P`, `F`) load the case's registries, as the browser does. The server legs (`S`, its fixpoint, `FR`) use exactly what every server recheck builds today: the trigger and the clock (fs-20e3 adds the pinned registries). No-invention exempts a calculated value only in rows the input already has, and under a non-relevant node only null or removal.

**Legs** for every processing case:
- `P` = `evaluate(def, origin == new ? create(payload) : payload)` in the case's mode — in-session evaluation.
- `S` = `evaluate(def, P.data, submit)` — the server's verdict on the filed bytes.
- `F` = FormEngine on the same origin and payload, then `operations`; `F_submit` = its submit report; `FR` = `evaluate(def, F.getResponse().data, submit)`.

**Invariants.** Every case: live `P ≡ F` (continuous trigger, report and data). Continuous-mode cases: `expected ≡ P`. Submit-mode cases: `expected ≡ S ≡ F_submit ≡ FR`, `F.getResponse(submit).data ≡ S.data`, and `S` is a fixpoint (`evaluate(def, S.data) ≡ S`). Every evaluate call, both runners: **no invention** — the output data adds no key and changes no value except (a) calculated fields, (b) the `nonRelevantBehavior` projection of non-relevant fields, and (c) declared repeats absent from the input, projected as `[]`, with the group objects that enclose them (wos-server refuses on any change, `selected_formspec_processor.rs:581`). Rust runs `P`, `S` and no-invention natively; TS runs all legs. Operations cases: Rust checks `evaluate(def, expected.data) ≡ expected`.

**Projection** (both runners): `valid`, `counts`, each result's `path, code, severity, constraintKind, shapeId`, the `message` when authored (`constraintMessage`, shape `message`) and its presence when processor-generated, `data`, `undeclaredDataPaths`.

**Coverage rules.** The Rust runner discovers every case of every kind (no allowlist); FEL_EVALUATION cases run as a calculate (no `site`) or through the site-scope module (`site`); every ITEM_TEXT case. The TS runner passes the authored Definition (delete `normalizeDefinitionForEngine`). Every existing case's `expected` is re-derived from Core with the section cited in the case, not from an engine run (today's `expected.data` came from FormEngine, `shared_suite.rs:129-135`).

**Ledger** `tests/conformance/parity-ledger.json`: `{ "entries": { "<case id>": { "ts" | "rust": { "<leg>": { "ticket": "fs-…", "why": "…", "problems": ["…"] } } } } }`; a listed leg must fail with exactly its recorded problem lines, so any new difference fails CI with legs `P`, `S`, `F`, `F_submit`, `FR`, `noInvention`, `text`, `value`. The ticket is the one whose landing turns the leg green under the order in §8; `why` names every cause. Results are compared to `expected` on the fields each expected result lists (processor-generated messages and `$formspec*` envelope markers are left out of `expected`); leg-to-leg comparisons use full results and data. A listed leg must fail; a listed leg that passes fails the build; an unlisted leg must pass. Each fix deletes its entries; the epic closes when the file is deleted. Prior art: ODK Web Forms' `it.fails` on its ported Scenario suite.

**Server path, once.** After fs-i731, a formspec-server test runs every submit-mode case's `S` leg through `FormspecEvalAdapter` with JSON text (`composition.rs:2041`), and one end-to-end seed flow (new Response with instances → browser files → server rechecks) runs on the real path.

**What the guard cannot see:** a rule both runtimes and the case author get wrong together (mitigation: each `expected` cites its Core section; review checks the citation); renderer-only behaviour (webcomponent/react tests); a live operation outside `operations`.

### 2.8 Big O

| Path | Today | After |
|---|---|---|
| Repeat reference through fel-core fallback | O(values) per reference (`project_repeat_field`) | O(depth) lookup |
| Row-invariant `sum($R[*].x)` at a row site | O(rows) per call → **O(rows²) per pass** | O(rows) per phase and enclosing instance while inputs are stable, O(1) per row to reuse the result |
| Shape row relevance | O(tree) per row (`find_item_by_path`) | O(1) item-by-path index |
| Scoped variables | O(scoped variables × values) per pass (`variables.rs` clones all data) | O(instances × expression cost) |
| Row objects | rebuilt per instance entry | built once per phase, O(row) per dirty row |

The formspec-eval scope module hoists row-invariant call subtrees. A subtree is row-invariant when no reference resolves inside the row and it uses none of `@current`, `@index`, `@count`, `prev()`, `next()`, or `parent()`. Check dependencies through local bindings and variables when deciding invariance. Evaluate the subtree once per phase and enclosing instance, and drop the result when an input is written. Reuse the aggregate result through `precomputed`.

Target per pass O(values + items + sites × depth). New ignored timing test `row_site_aggregate_scaling` in `crates/formspec-eval/tests/integration/repeat_scaling.rs` with three shapes: per-row `share = $amt / sum($rows[*].amt)`; a `prev()` chain (`running = coalesce(prev().running, 0) + $amt`); a sibling read three groups deep inside a row. Expected: each linear in rows (time ratio ≈ 2 per doubling at 200 → 400 → 800 rows; ≈ 4 indicates O(rows²)). Run with `cargo nextest run -p formspec-eval --run-ignored only repeat_scaling`, before and after fs-rxih, with existing `constraint_scaling`.

In the after-benchmark report, measure alias binding and textual rewrite cost separately from the `sum()` scan. Use matched row counts and time the same parsed `sum()` against an already materialized array to isolate its scan from reference lookup and array construction. Record how often the end-to-end aggregate scans per phase and enclosing instance, including a write to an input that forces a rescan.

### 2.9 Prior art

| Option | Decision | Reason |
|---|---|---|
| One engine, all preprocessing inside it (Orbeon compiles once and runs the same runtime on JVM and JS; CommCare Formplayer; SurveyJS `survey-core` in Node) | Adopt | The defects are host-side rewrites around an engine that already exists once. |
| Data-only shared corpus (JSON-Schema-Test-Suite, CEL conformance data) | Adopt (already the suite) | ODK ported JavaRosa tests as code and they drifted. |
| ODK `it.fails` known-failure markers | Adopt, tests only | The strict ledger. |
| Native Rust as reference | Conformance oracle | The server is the authority. |
| Generated forms/responses, native vs WASM (Csmith-style, proptest) | Tests only, later | After the guard is green. |
| XForms §7.2 row context | Adopt for R1, R3, R5, R7 | Core §3.2.2 "mirrors XForms scoping". |
| JavaRosa row-tied qualified paths | Reject (Q3: definition error) | ODK shipped three answers for an unwritten rule; Formspec has explicit spellings for both meanings. |
| Position-keyed per-row initialisation re-applied after load | Reject | F14/F32; initialise once, at creation. |
| Silent canonicalisation on load (JavaRosa, Web Forms, AJV `coerceTypes`) | Reject (Q2) | Validates a record other than the one stored. |
| `''` for untouched / `''` → absent | Reject | Core distinguishes null from `''`. |

---

## 3. Public-contract changes and spec text

Contract changes:
- `evaluate` (Rust, WASM `evaluateDefinition`, Python `evaluate_definition`): refuses out-of-list choices for named sets; `readonly` includes the prePopulate lock; creates nothing (no seedFrom, prePopulate, initialValue or minRepeat rows); validates values as given; reports `undeclared_data_paths`; new row-scope semantics (R1-R8), and stops at Rebuild with a definition error for unsubscripted `$R.x`.
- Deleted: `EvalOptions::apply_creation_seeds`, `EvalContext::repeat_counts`, `evaluateDefinition` context keys `repeatCounts`/`applyCreationSeeds`, WASM `prepareFelExpression`, Python `prepare_expression`, `HostFelContext::prepare`.
- Added: `create_response`/`create_repeat_row` (feature `create`), WASM `createResponse`/`createRepeatRow`, `formspec_core::canonicalize_response_data` (+ WASM, Python), `EvaluationResult::undeclared_data_paths`, `HostFelContext` from an `EvaluationResult`.
- `@formspec-org/engine`: new vs resume entry points; untouched fields null/absent; no padding on resume; added rows get no relative prePopulate; resume does not canonicalise; submit report from the filed bytes; `compileExpression`/Item text/`when` use R1-R8. Changeset required.
- formspec-server API ingress canonicalises unsigned Responses and refuses non-canonical signed ones.
- **Release (owner rule):** the fixed group (engine, app-graph, core) takes a **minor** bump; every changeset in this epic carries a `Breaking:` line naming the behaviour change. The authoring-validators plan uses the same rule.

Spec text (canonical `specs/core/spec.md` + hand-maintained `spec.llm.md` in the same change, then `npm run docs:generate` / `docs:check`):

| Id | Where | Text |
|---|---|---|
| S1 | §2.4 Processing Model (spec.md:1564) | Creation-time values are not part of the processing cycle; a processor re-evaluating an existing Response MUST NOT apply them. |
| S2 | §4.2.2.1 (spec.md:3266-3277) and the `minRepeat`/`initialValue`/`prePopulate` rows (3213, 3309, 3311) | Creation runs once, for a new Response; host prefill goes through creation and wins key by key; a saved Response is not created again; a field whose prePopulate source is pending receives no initialValue first; a repeat whose seedFrom source is pending stays absent until the source arrives (then `max(minRepeat, min(N, maxRepeat))` rows) or fails (authored fallback, else `N = 0`). |
| S3 | §2.1.6 Response (spec.md:475) | Undeclared data keys are kept where they arrived and reported as undeclared data paths, without blocking; refusing them is host policy at submit. (Q1) |
| S4 | §5.6 Non-Relevant Field Handling (spec.md:4258) | Re-evaluating a submitted Response sees fields pruned by `nonRelevantBehavior` as null and recomputes calculations; the verdict on a filed Response is the evaluation of its data. (Q6) |
| S5 | §3.2.1 (spec.md:1866-1869) | Lexical scoping applies at every expression site (Bind properties, Shape `constraint`/`activeWhen`/`message`/`context`, Item text, variables, component `when`); a reference resolves in the nearest enclosing scope that declares the key; a declared field with no value is null (§3.8.3). |
| S6 | §3.2.2 (spec.md:1870-1883) and §3.10.1 table (spec.md:2600-2609) | A path naming a repeatable group without a subscript and followed by a tail (`$R.x`, at any depth: `$g.R.x`, `$outer[*].R.x`) is a definition error; this row is `$x` / `@current.x`, all rows `$R[*].x`; bare `$R` is `$R[*]`; `$R[*]` includes rows with no answers and is `[]` for zero rows. `@current`, `@index`, and `@count` exist only inside a repeat. Rebuild rejects the "Unsubscripted repeat reference" definition error before Recalculate. (Q3) |
| S7 | §5.2 Shape properties (spec.md:4065-4069) | `constraint` and `activeWhen` evaluate in the Shape's target context (today stated only for `message` and `context`). |
| S8 | §4.5.1 Variable `scope` (spec.md:3767) | A variable scoped to a repeatable Group or an item inside one is evaluated once per repeat instance, in that instance's context. |
| S9 | FEL grammar §6.2 (`fel-core/specs/fel/fel-grammar.md`) | Pointer to S5/S6 (fel-core commit). |
| S10 | `schemas/conformance-suite.schema.json` | `origin`, `operations`, site-scoped FEL cases, `undeclaredDataPaths`, corrected description. |
| S11 | `schemas/response.schema.json` `data` description | Undeclared keys kept and reported (S3). |
| — | §4.6 + §2.5.1 reserved codes; §4.2.3 `precision` row (spec.md:3304) | Owned by fs-oxsy (Q4) and fs-en4w (Q5). |

## 4. Files to change (by ticket)

- **fs-qg98 guard:** `packages/formspec-engine/tests/shared-suite.test.mjs`; `crates/formspec-eval/tests/integration/shared_suite.rs`; `schemas/conformance-suite.schema.json`; `tests/conformance/schemas/test_conformance_suite_schema.py`; `tests/conformance/parity-ledger.json` (new); suite cases and fixtures; re-derived `expected` of every existing case.
- **fs-6q36 Definition:** `crates/formspec-eval/src/{pipeline.rs, rebuild/item_tree.rs, types/item_tree.rs, recalculate/bind_pass.rs}`; `packages/formspec-engine/src/engine/{FormEngine.ts, reactive-patches.ts}`.
- **fs-rxih scope:** `crates/formspec-eval/src/scope.rs` (new), `host_context.rs`, `recalculate/{mod,walk,bind_pass,calculate_pass,repeats,text_pass,variables}.rs`, `revalidate/{mod,env,items,shapes,expr}.rs`, `rebuild/{wildcard,repeat_expand,nested_data}.rs`, `types/paths.rs`, `interpolation.rs`; `crates/formspec-wasm/src/{fel.rs, fel_context.rs}`; `crates/formspec-py/src/fel.rs`, `src/formspec/_rust.py`; `packages/formspec-engine/src/engine/{wasm-fel.ts, FormEngine.ts, fel-context.ts}`, `src/wasm-bridge-runtime.ts`; `crates/formspec-eval/tests/integration/repeat_scaling.rs`; shared resolver in formspec-core consumed by formspec-lint E304 and evaluator Rebuild; Core S5-S8.
- **fs-i731 creation:** `crates/formspec-eval/src/create.rs` (new), `Cargo.toml` (feature), `pipeline.rs`, `runtime_seed.rs`, `rebuild/initial_values.rs`, `rebuild/repeat_expand.rs`, `eval_options.rs`, `eval_json.rs`, `types/evaluation.rs`, `lib.rs`; `crates/formspec-wasm/{Cargo.toml, src/evaluate.rs, src/wasm_tests.rs}`; `packages/formspec-engine/src/engine/{FormEngine.ts, helpers.ts, instance-seeding.ts, reactive-patches.ts, wasm-fel.ts}`, `src/wasm-bridge-runtime.ts`, README; formspec-web respondent call sites; formspec-server adapter test; `CREATION_COMPILED` compile-time assertions in formspec-server, wos-server and `wos-formspec-binding`; Core S1-S2; `.changeset/`.
- **fs-6be9 submit verdict (Q6):** `FormEngine.ts` (`getValidationReport`, `getResponseSnapshot`, `getResponse` under `on-submit`), engine tests; Core S4.
- **fs-8xnt ingest:** `rebuild/nested_data.rs`, `output_data.rs`, `types/evaluation.rs`, `eval_json.rs`; `crates/formspec-core/src/value_coerce.rs` (+ `canonicalize_response_data`), WASM/Python bindings; `FormEngine.ts` load path; formspec-server ingress; `schemas/response.schema.json`; Core S3.
- **fs-5n76 fel-core:** `src/evaluator/core.rs`, `src/environment.rs`, `src/prepare_host.rs`, `src/lib.rs`, `tests/prepare_host_mutation_kills.rs`; FEL spec S9.
- Regenerate: `make api-docs`, `npm run docs:filemap` when files are added or removed.

## 5. Cases (RED first) with `expected`

Each case cites its Core section. Origin `saved` unless noted. "Leg" = which invariant fails today.

| Case | Input | Expected | Spec | Fixed by |
|---|---|---|---|---|
| `option-set-named-out-of-list` (submit) | `state` choice → set `{options:[NJ,NY]}`; `picks` multiChoice → bare-array set `[red,blue]`; `{state:'ZZ', picks:['red','teal']}` | invalid; `state` and `picks` TYPE_MISMATCH (type, processor message); errors 2 | §4.6, §4.2.3 | fs-6q36 |
| `prepopulate-locked-readonly` (continuous, origin new) | inline instance `org {name:'Acme'}`; `name` prePopulate `{org, name, editable:false}`; `locked = readonly($name)` | valid; data `{name:'Acme', locked:true}` | §4.2.3, §3.5 MIP functions | fs-6q36 |
| `repeat-empty-array-below-min` (submit) | `rows` minRepeat 1, child `a` required; `{rows:[]}` | invalid; `rows` MIN_REPEAT only; data `rows: []` | §4.2.2 (spec.md:3213), S1 | fs-i731 |
| `repeat-new-response-padding` (submit, origin new) | same Definition; payload `{}` | data `rows:[{},{}]` for minRepeat 2; REQUIRED `rows[0].a`, `rows[1].a` | §4.2.2, S2 | fs-i731 |
| `saved-response-not-created-again` (submit) | `status` initialValue `'draft'`; `rows` minRepeat 1 with seedFrom over an inline instance; payload `{note:'x'}` | data `{note:'x', rows:[]}` (no `status`, no seeded rows); `rows` MIN_REPEAT | S1, S2 | fs-i731 |
| `untouched-text-is-null` (continuous, origin new) | `src` string; `copy = $src`; `srcIsNull = isNull($src)`; payload `{}` | data `{copy:null, srcIsNull:true}`, no `src` key | §3.4 (spec.md:2071-2075) | fs-i731 |
| `seed-pending-source` (continuous, origin new) | `rows` minRepeat 1, seedFrom an instance with `source` (fetch fails) and authored fallback `data.items` (ACME, WIDGETS), relative prePopulate `name` | data `rows:[{name:'ACME'},{name:'WIDGETS'}]` (fallback seeds; no padding row first) | §4.2.2.1 (spec.md:3270-3277), S2 | fs-i731 |
| `seed-reopen-blank-cell` | seedFrom `record.items` (ACME, WIDGETS); payload `rows:[{name:'ACME',note:'a'},{note:'b'}]` | data rows unchanged; `rows[1].name` absent | §4.2.2.1, S2 | fs-i731 |
| `seed-remove-then-add` (origin new; operations removeRow `rows` 0, addRow `rows`) | seeds ACME, WIDGETS, GLOBEX | data rows `[{name:'WIDGETS'},{name:'GLOBEX'},{}]` | §4.2.2.1 (spec.md:3262-3263) | fs-i731 |
| `prepopulate-cleared-stays-cleared` (submit, origin new; operations setValue `name` null) | editable prePopulate from inline instance; `name` required | invalid; data `{name:null}`; `name` REQUIRED | §4.2.3, S1 | fs-i731 |
| `nrb-pruned-calc-input` (submit) | `x` relevant `$show`; `c = $x + 1`; `y` constraint `$ = $c`, message `y must equal c`; `{show:false, x:5, y:6}` | invalid; data `{show:false, c:null, y:6}`; `y` CONSTRAINT_FAILED `y must equal c` | §5.6, S4 | fs-6be9 |
| `repeat-empty-rows-count` | `[{a:'x'},{},{}]`; `m = count($rows[*])`, `k = count($rows[*].a)`, `n = count($rows)` | `m` 3, `k` 1, `n` 3 (`n` only under the R3 assumption) | §3.5.1 (spec.md:2096), S6 | fs-rxih |
| `repeat-zero-rows-aggregates` | `rows:[]`; `m = count($rows[*])`, `total = sum($rows[*].amt)` | 0, 0 | §3.5.1 (spec.md:2095-2096) | fs-rxih |
| `row-required-sibling` (submit; + `@current.kind` variant) | `rows[*].detail` required `$kind = 'x'`; rows kind `x`, `y` | `rows[0].detail` REQUIRED only | §3.2.1, S5 | fs-rxih |
| `row-nested-group-sibling` | `rows[*].body.copy = $a`; `rows:[{body:{a:'hello'}}]` | `copy` `'hello'` | §3.2.1, S5 | fs-rxih |
| `row-sibling-absent-is-null` | outer `kind:'TOP'`; `rows[*].echo = $kind`; rows `{kind:'row0'}`, `{}` | `echo` `'row0'`, null | §3.8.3, S5 | fs-rxih |
| `row-explicit-index-1-based` | rows lo 1, 9; `first = $rows[1].lo`; `probe` constraint and shape `$rows[1].lo = 1` | `first` 1; no results | §3.2.2 (spec.md:1879-1883) | fs-rxih |
| `row-unsubscripted-repeat-ref` (submit) | `rows[*].hi` constraint `$ >= $rows.lo`; rows (1,5), (9,2), plus a zero-row variant | One definition error at the authored constraint in Rebuild. A separate valid calculate must remain unevaluated. Update the case that currently expects per-row `CONSTRAINT_PARSE_ERROR` when the runtime lands. | §3.10.1, S6 | fs-rxih |
| `row-own-sibling-constraint` (submit; Bind, `@current.lo`, and Shape variants) | `$ >= $lo` on the same rows; shape message `hi below lo` | `rows[1].hi` CONSTRAINT_FAILED / SHAPE_FAILED only | §3.2.1, S5, S7 | fs-rxih |
| `row-star-is-all-rows` | `share = $amt / sum($rows[*].amt)`; amts 1, 3 | 0.25, 0.75 | §3.2.2 (spec.md:1877) | fs-rxih |
| `row-target-shape-non-relevant` (submit) | `rows` relevant `false`; shape on `rows[*]` constraint `false` | valid; no results | §5.6 rule 1 | fs-rxih |
| `variable-scoped-per-row` | variable `rowDouble` scope `rows`, `$amt * 2`; `rows[*].d = @rowDouble`; amts 1, 3 | `d` 2, 6 | §4.5.1, S8 | fs-rxih |
| ITEM_TEXT twins of each `row-*` case | label templates `Detail for {{$kind}}`, `Copy of {{$a}}`, `Kind {{coalesce($kind,'none')}}`, `{{$amt}} of {{sum($rows[*].amt)}}` | per row: `Detail for x`/`y`; `Copy of hello`; `Kind row0`/`Kind none`; `1 of 4`/`3 of 4` | Core §4.2.1, S5 | fs-rxih |
| Site-scoped FEL twins (`site`) | `$kind = 'x'` at `rows[0].detail`/`rows[1].detail`; `$a` at `rows[0].body.copy`; `isNull($kind)` at `rows[1].echo`; `$rows[1].lo` at root and at `rows[1].lo`; `sum($rows[*].amt)` at `rows[0].share` | true/false; `'hello'`; true; 1, 1; 4 | S5, Component §8 `when` | fs-rxih |
| `undeclared-keys-kept-in-place` | `{a:'x', bogus:'kept', rows:[{a2:'r', legacy:'old'}]}` | valid; data identical to input; `undeclaredDataPaths` `['bogus','rows[0].legacy']` | S3 | fs-8xnt |
| `non-canonical-decimal-string` (submit) | `d` decimal; `t = $d + 1`; `{d:'12.5'}` | invalid; `d` TYPE_MISMATCH; data `{d:'12.5', t:null}` | §2.1.3 types, Q2 | fs-8xnt |

**Implemented (fs-qg98):** after review fixes the ledger lists 81 TypeScript legs and 46 native legs across 42 cases, each with its exact problem lines; details in the fs-qg98 notes. Existing cases already RED under the guard: `all-codes-validation` (`F_submit`/`FR`: browser files `[{},{}]` for `[]`); `bind-merge-document-order`, `clinical-intake-submit-valid`, `grant-application-submit-valid`, `grant-report-short-submit-valid` (`F` data: `''`/`null` for untouched fields; fs-i731); `invoice-single-submit-valid` (`F` data: `"150.00"` filed as `"150"`; fs-8xnt). Re-derived `expected` may turn further legs RED; fs-qg98 ledgers each one it finds.

Unit tests outside the suite: `create.rs` (padding, seedFrom N/min/max, relative miss, absolute prePopulate, `=expr` once, pending source blocks initialValue); `canonicalize_response_data`; engine `setValue('12.5')` stores 12.5; widgets render null as `''`.

## 6. Migration and consumers

- **`$R[*].x`-as-this-row respellings** (measured): `crates/formspec-eval/tests/integration/evaluate_pipeline.rs:2748, 3163` and three `rows[*]` shape tests there; `tests/unit/test_definition_evaluator.py:201, 712` and its `rows[*].max` shape. No JSON fixture or example.
- **Q3 (unsubscripted `$R.x`)**: zero uses in live Definitions, examples, fixtures or a private app's forms; three in one archived chaos test (`thoughts/chaos-test/2026-04-07-v1/quarterly-report/quarterly-report.definition.json`), which becomes invalid and stays archived. Tests asserting the old meaning are rewritten as definition-error tests or deleted with their functions: `evaluate_pipeline.rs:2079, 2115, 2171`; `types/paths.rs:193`; `host_context.rs:764-765, 823`; fel-core `tests/prepare_host_mutation_kills.rs:60, 79, 93`.
- **Creation-in-evaluate tests** move to `create.rs` or become origin-`new` suite cases: `runtime_seed.rs` tests, `seed-from-*.json`, tests passing `repeatCounts`/`apply_creation_seeds` in `crates/formspec-eval`, `crates/formspec-wasm`, `packages/formspec-engine/tests/wasm-evaluate-definition.test.mjs`.
- **FormEngine tests** asserting `''` for untouched fields, the prePopulate overlay or TS seeding (`instances-and-prepopulation.test.mjs:95, 156-203` and others found by grep).
- **Callers of `evaluate`** (stricter recheck): crate `formspec-server` — `composition.rs` adapter, `services/signing_fixture.rs:156`, `services/evaluation_instances.rs:476, 806`; `formspec-server-instance-proof/src/task_local_validation.rs:113`; wos-server `selected_formspec_processor.rs:564-586`; `wos-formspec-binding` (compile-time fence only); Python `src/formspec/validate/passes/runtime.py:42` and the example Responses it validates (`examples/`). The work-spec `wos-formspec-binding/src/selected.rs:291-322` comparison defect is its own ticket outside this epic (§9).
- **FormEngine consumers** (re-run suites; direct engine use found in assist, walk, surface-react, studio): `formspec-webcomponent`, `formspec-react`, `formspec-layout`, `formspec-assist`, `formspec-surface-react`, `formspec-walk`, formspec-studio's `formspec-studio-core` preview (`evaluation-helpers.ts:88-91, 128-130`), `formspec-mcp`, `formspec-mcp-wireframes`, `formspec-studio`, `case-portal`, `formspec-web` (resume call sites above; re-vendor `vendor/formspec-engine` after publish), the a private app filing app (drop the inline-options workaround, duplicate readonly binds and `[*]`/qualified spellings; canonicalise imports through the exported canonicaliser).

## 7. Risks

- **fs-i731 touches the live session core** (rows, deferred sources, assist provenance in `rebuildRepeatRows`). Mitigation: guard legs `F`/`FR`, operations cases, engine/webcomponent/react/studio-core suites.
- **fs-rxih calculate visibility and hoisting.** Test a write to an aggregate input and verify the next row sees the updated value. Use `repeat_context.rs` to check row order for `prev()` and `next()`, and `row_site_aggregate_scaling` to check stable-input scaling.
- **Merging two scope engines** changes `compileExpression`, Locale text and `when` behaviour in renderers at once; ITEM_TEXT and site-scoped twins pin each rule before the swap.
- **Definition errors.** R2 stops Recalculate for an unsubscripted repeat reference. Existing handling of cycles and undefined functions remains a separate Core §3.10.1 gap (related to fs-he9l).
- **Concurrent agents**: the authoring-validators plan adds E304 (§11); the private app's shell agent sees the app workarounds change (§6).

## 8. Order of work

1. **fs-qg98** guard, ledger (mandatory), re-derived `expected`, every case in §5 (all now writable: Q1-Q6 are ruled). Architecture review before and after (new seams, multi-file).
2. **fs-6q36** Definition normalisation.
3. **fs-pod9** cardinality results carry no `source` (small; before fs-i731 so the guard's cardinality lines settle first).
4. **fs-rxih** one site-scope module for `evaluate` and `HostFelContext`; delete the prepare path; variables; `RowCounts` (inputs: flatten pass plus host `repeatCounts` until fs-i731).
5. **fs-i731** creation split, new/resume entry points, feature fence; both guard runners route origin-new cases through `create_response`; then the adapter leg and the end-to-end seed flow.
6. **fs-20e3** registry documents pinned at publish and passed by every server recheck; the guard's server legs gain the case's registries.
7. **fs-6be9** submit verdict from the filed bytes (after fs-i731; same FormEngine paths).
8. **fs-8xnt** ingest: undeclared paths, canonicaliser (incl. whitespace), server ingress (after fs-i731).
9. **fs-oxsy** host-supplied option lists (after fs-6q36).
10. **fs-5n76** fel-core deletions (after fs-rxih).
11. **fs-en4w** precision (independent; out of parity scope). Then fs-4a4a and fs-qvwk residue.

Each ledger entry names the ticket whose landing turns its leg green under this order (the last of its causes); a child is done when every entry naming it is deleted.

Each ticket: failing cases first; `cargo nextest run -p formspec-eval` (with `--features create` where relevant), `-p formspec-wasm`; engine `npm test`; webcomponent/react/studio-core `npm test`; Python `python3 -m pytest tests/` in the formspec venv; `npm run docs:check`; independent semi-formal code review.

## 9. Tickets

Stack-root `.tickets/`, tags per `TAG_CORPUS.md`.

| Id | Scope | Type / P | Depends on | Items |
|---|---|---|---|---|
| **fs-p4kg** | Epic | epic / P1, release-gated, cross-stack | children | all |
| **fs-qg98** | Guard, ledger, re-derived `expected`, all cases | task / P1, release-gated | — | N6; every §5 case |
| **fs-6q36** | Definition normalisation | bug / P1 | fs-qg98 | F1, F22 |
| **fs-rxih** | One site-scope module (evaluate + HostFelContext), one row count, Q3 | bug / P1 | fs-qg98 | F13, F18, F21, F26b, F26c, N2, N3, N8, N9 |
| **fs-i731** | Creation (new) vs resume, feature fence, adapter leg, seed end to end | bug / P1, release-gated, cross-stack | fs-qg98, fs-rxih | F2, F12, F14, F32, N1, N5 |
| **fs-6be9** | Submit verdict from filed bytes (Q6); submit-profile Response data = submit evaluation's data | bug / P1 | fs-qg98, fs-i731 | N10 |
| **fs-8xnt** | Undeclared paths (Q1), validate as given + one canonicaliser incl. server ingress (Q2) | bug / P2, cross-stack | fs-qg98, fs-i731 | F28, F31, N4, F29 |
| **fs-oxsy** | Host-supplied option lists; distinct finding when absent (Q4) | bug / P2 | fs-qg98, fs-6q36 | N11 |
| **fs-pod9** | Cardinality results carry no `source`; FormEngine stops stripping it | bug / P3 | fs-qg98 | found by the guard |
| **fs-20e3** | Server recheck receives no registry documents: pin at publish, pass at every call site | bug / P1, release-gated, cross-stack | fs-qg98 | found by the guard (B1) |
| **fs-5n76** | FEL field-path split, prepare path, flat-key fallback, `project_repeat_field` | task / P3 | fs-rxih | N7, Q3 deletions |
| **fs-en4w** | Precision: refuse over-precise input, calculated half-to-even (Q5) | bug / P3, standalone | — | Q5 (linked fs-qvwk, fs-p4kg) |

Found while implementing fs-qg98: **fs-pod9** (child, P3) — the evaluator emits `source: "bind"` on cardinality results while FormEngine strips it (`response-assembly.ts:398-410`); the schema's `bind` does not cover cardinality. Also folded into fs-8xnt: `evaluate` applies whitespace modes to the data it is given (`recalculate/mod.rs:105`), which Core §4.3.1 places before storage and Q2 places at input.

Outside the epic: **fs-081x** (sys:wos) — `wos-formspec-binding/src/selected.rs:291-322` compares flat `values` with the nested Response, so any group or repeat refuses.

Extended, not duplicated: **fs-jpge** keeps mapping/migration/registry parity; **fs-4a4a** drops its ScopedAliases RAII guard (fs-rxih deletes the alias machinery) and keeps the convergence loop and `resolve_nrb`; **fs-qvwk** bullets 5-6 absorbed by fs-rxih/fs-i731; **fs-he9l** shares the silent-unknown-name class with fs-8xnt.

## 10. Decisions (owner, 2026-11-17)

- **Q1** Keep undeclared keys where they arrived; report in typed non-blocking `undeclared_data_paths`; refusing is host policy at submit; one sentence in Core §2.1.6.
- **Q2** The recheck validates data exactly as given; canonicalisation at typing and import through one exported canonicaliser, also called by formspec-server's API ingress.
- **Q3** Unsubscripted `$R.x` on a repeatable `R` is a definition error; `$x`/`@current.x` for this row, `$R[*].x` for all rows; delete `resolve_qualified_repeat_refs` and fel-core `resolve_qualified_group_refs`.
- **Q4** Membership is normative; the host passes resolved option lists to `evaluate` like instances; an absent list is a distinct finding, never silent acceptance; separate ticket also covering URI-string `options` and TS-only `remoteOptions`.
- **Q5** At input refuse over-precise values; calculated values round half-to-even like `round()`; separate ticket, out of parity scope.
- **Q6** The filed record is the verdict: FormEngine's submit report is `evaluate(def, getResponse().data)`; re-evaluating a submitted Response sees pruned fields as null and recomputes calculations; Core sentence; RED case `nrb-pruned-calc-input`.

Confirmed in review: bare `$R` = `$R[*]`; ingress refuses (never rewrites) non-canonical Responses, signed or not.

## 11. Lint code for the authoring-validators plan

**E304 — Unsubscripted reference to a repeatable group.** Fires on any FEL string in a Definition (Bind, Shape, variable, Item text, `initialValue` `=expr`, component `when`) whose path passes through a repeatable group with no `[n]` or `[*]` after it and continues with a tail, at any depth (`$R.x`, `$g.R.x`, `$outer[*].R.x`). Never fires on bare `$R` (no tail), which is `$R[*]`. It must also fire on the bare-identifier spelling `R.x` (no `$`), which fel-core accepts as a field path (`fel-core/src/parser.rs:578`, beyond the FEL grammar's `FieldRef ← '$' Identifier`): the only uses are `sum(lineItems.lineSubtotal)` in `tests/e2e/fixtures/kitchen-sink-holistic/definition.v1.json` and `.v2.json`, which migrate to `sum($lineItems[*].lineSubtotal)` with fs-rxih. Spec citation `specs/core/spec.md#322-repeat-references` (S6) and the §3.10.1 definition-error table row "Unsubscripted repeat reference". Suggested fix: `$<tail>` or `@current.<tail>` for the same row, `$R[*].<tail>` for all rows. The fs-rxih authoring change adds E304 and its lint registry entry. Follow-ups **fs-3t13** cover path tails on `prev()`, `next()`, and `parent()`, and **fs-gyzx** gives lint and evaluation one `{{}}` scanner.
