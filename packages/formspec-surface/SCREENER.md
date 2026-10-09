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
`onDetermination(record, answers, evaluationTime)` returning
`{status:"accepted"}` or `{status:"refused",reason:string}`. Native evaluation
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
