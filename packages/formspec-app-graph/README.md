# Exact Component selection

`produceAppGraphValidationReport` and
`produceBundleExportAppGraphValidationReport` return `componentRouteResolver`.
The resolver selects a Component from an immutable snapshot of the same graph
the producer validated. Selection does not rerun schema or module validation.
`PreparedAppGraphReportProducerResult` is an in-process result. Its function
does not travel over JSON APIs; `AppGraphReportProducerResult` retains the
serializable reports-only shape for those APIs.

```ts
const result = produced.componentRouteResolver({
  surface: { url: surfaceUrl, version: surfaceVersion },
  route: routeId,
  slot: slotId,
  role: 'slot',
  definition: { url: definitionUrl, version: definitionVersion },
});
```

`ready` returns the frozen loaded Component handle. `unavailable` returns a
typed refusal reason and graph diagnostics. Selection requires completed
artifact, schema, and cross-artifact checks without errors, exact manifest and
loaded versions, one matching authored route/slot claim, and a matching
Definition-form slot. An omitted optional Component Surface version uses the
exact graph pins; a Surface range is unsupported by this selector.

`resolveComponentRouteTarget(validationRequest, selection)` provides the same
selection for callers that need to validate a fresh graph.

The host supplies current route coordinates and authenticates the graph and
schema validators. Selection establishes presentation metadata; task, draft,
attachment, signing, and committed render-instance authority remain host-owned.
Create a new producer result when the admitted package changes.
