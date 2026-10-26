---
"@formspec-org/types": patch
---

<!-- tier: kernel -->

The generated `AppGraphValidationReport` type gains the optional `renderedNeedTrace` record (Needs spec §10.3: `completed` or `not-applicable`, with each covered Definition's url, version, and canonical digest plus its Locales' and Components' digests), and its evidence slots admit `hostEvidence.needsDocuments[n]`. The generated `ScreenerDocument` type gains the optional root `x-generation` (Screener spec §2.1), so a Screener title can carry its own Need trace.
