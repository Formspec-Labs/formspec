---
"@formspec-org/app-graph": minor
---

<!-- tier: foundation -->

Publication gates can lint Locales against their targets and prove the rendered-Need trace ran.

- `localeLintValidator(lint)` turns an injected document linter (the engine's `lintDocument`) into a cross-artifact validator that lints every loaded Locale with its target Definition or Screener plus the Theme and Components rendering that Definition (Locale spec §7, E1400–E1411). Findings keep the Locale spec code under origin `x-formspec-lint`; E1402 messages name the bare-item-key rule.
- `renderedNeedTrace: 'required' | 'when-declared'` on the validation and producer requests runs the strict rendered-Need trace (Needs spec §10.3) and writes `report.renderedNeedTrace` (`completed` or `not-applicable`, with the covered Definitions' url and version). Source checks that record for a Need-traced Definition instead of re-running the rule. `runRenderedNeedTrace` exposes the same run.
- The bundle-export producer pairs an App Manifest 2.4 `needs` member's document as Needs evidence and refuses a declared document the bundle does not carry (`APP-GRAPH-NEEDS-REF`).
- The AppGraph report schema admits `hostEvidence.needsDocuments[n]` evidence slots (already emitted) and the `renderedNeedTrace` record.
