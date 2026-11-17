---
"@formspec-org/app-graph": minor
"@formspec-org/surface": patch
---

<!-- tier: foundation -->

Publication gates lint bundle documents against their loaded companions and prove the rendered-Need trace ran.

- Add `documentLintValidator`, `AppGraphDocumentLintContext`, and `DOCUMENT_LINT_ORIGIN`. These replace unreleased Locale-only names; they are additions for npm users. `documentLintDiagnostics(lint, handle, context)` supplies the shared mapping for authoring and publication. It preserves all severities, source locations, `suggestedFix`, and `specRef` under origin `x-formspec-lint`.
- `documentLintValidator(lint)` lints every loaded Definition, Theme, Component, Locale, Screener, Response Actions, Mapping, Ontology, References, and Registry document. It pairs companions by target URL, includes peer Locales for fallback checks, and lints unresolved targets without a paired Definition. Surface and Experience remain excluded until their duplicate rules are reconciled. `bundleComponentDocuments` is never passed; app-graph keeps ownership of bundle Component identity checks.
- Breaking: remove `validateThemeTokenRegistry` (released in 2.1.0). The validator and report producers no longer report the unregistered Theme-token warning by default. Hosts receive it only by injecting `documentLintValidator(lintDocument)` into `crossArtifactValidators`. It now arrives as W708 (`THEME-TOKEN-UNREGISTERED`) under origin `x-formspec-lint`, with canonical lint metadata instead of `details.token`, `details.brandToken`, and `details.reason`.
- `renderedNeedTrace: { mode: 'required' | 'when-declared', digest }` on the validation and producer requests runs the strict rendered-Need trace (Needs spec §10.3) and writes `report.renderedNeedTrace` (`completed` or `not-applicable`). Each covered Definition is bound to its content: url, version, and canonical digest (the injected `digest`, JCS + SHA-256 as Source hashes a Definition), plus the digests of the Locales and Components targeting it. The trace now walks Screener items, options, and binds like a Definition's. Source checks that record for a Need-traced Definition instead of re-running the rule. `runRenderedNeedTrace` exposes the same run.
- App Manifest 2.5 (`bundleManifest/2.5`) adds the optional `needs` member; each 2.x minor is additive, so every 2.4 rule holds in 2.5 (`appManifestVersionAtLeast`, `APP_MANIFEST_VERSIONS`; the resolver, app-entry, Locale association, and `@formspec-org/surface` entry selection use it). The bundle-export producer pairs the `needs` member's document as Needs evidence and refuses a declared document the bundle does not carry (`APP-GRAPH-NEEDS-REF`).
- The AppGraph report schema admits `hostEvidence.needsDocuments[n]` evidence slots (already emitted) and the `renderedNeedTrace` record.
