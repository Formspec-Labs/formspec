---
"@formspec-org/app-graph": minor
"@formspec-org/surface": patch
---

<!-- tier: foundation -->

Publication gates can lint Locales against their targets and prove the rendered-Need trace ran.

- `localeLintValidator(lint)` turns an injected document linter (the engine's `lintDocument`) into a cross-artifact validator that lints every loaded Locale with its target Definition or Screener plus the Theme and Components rendering that Definition (Locale spec §7, E1400–E1411). Findings keep the Locale spec code under origin `x-formspec-lint`; E1402 messages name the bare-item-key rule.
- `renderedNeedTrace: { mode: 'required' | 'when-declared', digest }` on the validation and producer requests runs the strict rendered-Need trace (Needs spec §10.3) and writes `report.renderedNeedTrace` (`completed` or `not-applicable`). Each covered Definition is bound to its content: url, version, and canonical digest (the injected `digest`, JCS + SHA-256 as Source hashes a Definition), plus the digests of the Locales and Components targeting it. The trace now walks Screener items, options, and binds like a Definition's. Source checks that record for a Need-traced Definition instead of re-running the rule. `runRenderedNeedTrace` exposes the same run.
- App Manifest 2.5 (`bundleManifest/2.5`) adds the optional `needs` member; each 2.x minor is additive, so every 2.4 rule holds in 2.5 (`appManifestVersionAtLeast`, `APP_MANIFEST_VERSIONS`; the resolver, app-entry, Locale association, and `@formspec-org/surface` entry selection use it). The bundle-export producer pairs the `needs` member's document as Needs evidence and refuses a declared document the bundle does not carry (`APP-GRAPH-NEEDS-REF`).
- The AppGraph report schema admits `hostEvidence.needsDocuments[n]` evidence slots (already emitted) and the `renderedNeedTrace` record.
