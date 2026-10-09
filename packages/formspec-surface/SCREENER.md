# Native Screener slots

Surface 0.3 can render one native Screener and navigate using its actual
Determination. The binding is closed:

```json
{"screenerRef":"urn:example:eligibility","allowedTargets":["surface:apply","surface:paper"]}
```

Use `https://formspec.org/schemas/surface/0.3`. The unchanged 0.2 schema remains
at its historical URI in `schemas/surface-v0.2.schema.json`. The latest schema
also admits existing 0.2 documents, but only 0.3 admits Screener slots.

The App Manifest must list exactly one Screener URL with an exact semantic
version; the loaded document must carry the same URL/version. Each allowed
`surface:<route-id>` must be authored in that Screener and resolve to one loaded
Surface route. `dereferenceBundleExport` retains manifested Screener handles;
AppGraph validates their associations; the Surface planner refuses unsupported
presentation. Hosts remain responsible for authenticating and admitting the
loaded package.

The bounded presenter admits flat string, integer, decimal, boolean and
single-choice fields with static string option values. Bind support is limited
to canonical `required: "true"` / `"false"`. Groups, repeats, dynamic options,
other bind properties, legacy aliases and unsupported item properties refuse.
Every presented field needs an explicit answer. Booleans offer an unanswered
state, Yes and No. No is the genuine boolean false.

`FormspecScreener` / `useScreener` offer optional
`onDetermination(record, answers, evaluationTime, {signal, completionId})` returning
`{status:"accepted"}` or `{status:"refused",reason:string,retry?:"same-act"|"new-act"}`, synchronously or by Promise. Native evaluation
receives `nowIso`. Refusal preserves answers and visible controls with a named
finding. This mode does not call `onRoute` or allow skip completion. Existing
standalone callers retain their default behavior.

`resolveScreenerDetermination` checks pins, evaluation version, completed status,
current invocation time, expiry, exact typed answered inputs, warnings and all
matched targets. It returns one allowed target or a refusal. The shell then
checks the current route generation, unique destination, path collision and
required route parameters before navigation. It never fabricates a completed
Response Action or grants task, draft, provider or signing authority.

This is a stateless mounted Screener; it does not claim retained-session or
availability continuity. It inherits the route Theme grant. Definition
Components do not target a Screener. Locale 2.1 resources can target the exact
Screener through `localeDocuments` and `activeLocale` on the React presenter or
Surface host. Bundle resolution carries the declared Locale resources into
local and embedded Screener slots. Locale 2.0 remains unchanged.

The answering UI localizes its heading, intro, item and static option labels,
required messages, and shared chrome. Language changes preserve answers,
including explicit false. The native evaluation document and Determination
remain canonical. Invalid Locale resources refuse with a named finding;
interpolation failures retain literal text and expose translation warnings.

## Awaited host completion

`SurfaceApp`, `SurfaceRouteView`, and `SurfaceSlot` accept one optional
`screenerCompletion` policy. Omitted or `{mode:"stateless"}` preserves qualified
local navigation. `{mode:"host-required",selectionKey,complete}` requires a
nonempty host-supplied selection key and completion callback. Missing either
refuses with a named finding and preserves answers. Embedded slots inherit this
policy. Direct `SurfaceRouteView`/`SurfaceSlot` hosts supply the pure
`checkScreenerTarget` destination check as well as navigation; `SurfaceApp` supplies
both from one maintained resolver. Destination checks run before host invocation
and again when navigating. This is a runtime capability; authored documents need no migration.

The exported `SurfaceScreenerCompletion` callback receives a
`SurfaceScreenerCompletionRequest`: exact document/ref, closed primitive answers,
full native Determination, invocation time, authored allowed targets, qualified
target, outer route/parameters/slot, runtime generation, visit identity, opaque
selection key, stable `completionId`, and `AbortSignal`. These browser values are
diagnostic. The host owns authenticated actor, selected publication, trusted
clock, storage and durable acceptance. The host should independently evaluate
and qualify its selected Screener, retain the complete native result, and accept
only when its durable Ready target equals the browser's attempted target. A
changed target requires `{status:"refused",reason:"fresh-screening",retry:"new-act"}`.
Acceptance cannot substitute a destination.

While a Promise is pending, the hook reports `completing`, disables native
controls and submit, and locks duplicate/reentrant submission. It awaits host
acceptance, then rechecks result expiry and current route/visit before navigating.
Answers remain visible after refusal. Callback replacement aborts pending work
without clearing answers or the retained act. Selection replacement, answer
edits, restart, document replacement or `retry:"new-act"` retire the act. Locale
changes preserve both answers and pending work.

Same-act retries reuse the exact private answers/result/invocation time and
completion ID. A host should use that ID as its durable idempotency identity
(for example an HTTP `Idempotency-Key`), reconcile an already committed result,
and reject changed input under the same identity. Abort does not roll back host
storage. A committed result followed by stale navigation is a navigation refusal;
the host must reconcile its transaction. This in-memory act does not supply
cross-reload recovery or retained-session continuity.

`formspec_eval::admit_screener_qualification_profile(&document)` exposes the same
pure supported-profile check for startup admission, without evaluation or invented
answers. Hosts still enforce schema, size limits and selected publication authority.

Rust consumers can call `formspec_eval::qualify_screener_determination` with the
selected document, native result, typed `AnswerInput` map, trusted invocation and
acceptance times, and allowed targets. It returns typed `Ready { target }` or
`Refused { reason }` without evaluating or changing the full result. Incomplete
native runs may be retained as Pending evidence, but never authorize navigation.
Shared fixtures check parity with `resolveScreenerDetermination` for the bounded
presenter. The Rust helper uses RFC3339 time at millisecond precision; exhaustive
browser timestamp-parser equivalence is not claimed. `DeterminationRecord` and
its nested result types now deserialize for retained-result replay without
expanding the WASM or Python API.
