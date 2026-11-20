# @formspec-org/types

## 0.3.0

### Minor Changes

- e190c49: <!-- tier: kernel -->

  Field classification has one axis: Definition `accessControl.class` (Core §4.2.1), drawn from the closed Access-Class Registry (Extension Registry §3.2.3). The generated `Item` type gains optional `accessControl: AccessControl` (`class`, plus the renderer-only `subjectKind` for `protected`); `common` exports `AccessClass`; the generated `RegistryEntry` admits the `access-class` category with `AccessClassShape` (`token` or `prefix`, plus `maps` to CUI, FHIR security labels, DPV, and regulatory citations).

- c9ed6d8: <!-- tier: kernel -->

  Author a persistent filing tracker band and repeat its groups over a qualified Data Sources roster.

- b494889: <!-- tier: kernel -->

  Add `letterCase` to Definition Binds for `string` and `text` fields. Authors can preserve case or convert input to uppercase or lowercase.

- 6471622: <!-- tier: kernel -->

  Rename the Outcome Verification case and report relation `direct-need-trace`
  to `need-trace`. Export `EffectiveNeedTrace` and
  `RenderedNeedTraceSourcePointer` for consumers of App Graph trace evidence.

- 9c44160: <!-- tier: kernel -->

  Add `EvaluatedFormState` and `validationResultIdentity` for consumers that share form progress and validation findings. Finding identity includes the acknowledgement code for grouped explanation findings.

  Expose the generated `warningExplanation` property on the public `FormDefinition` type.

- f3aa11f: <!-- tier: kernel -->

  Describe an authored control for starting a filing unit whose key the store assigns.

- 1cca148: <!-- tier: kernel -->

  Allow `workspace` as a Definition page mode and add Locale strings for workspace navigation, search, progress, and findings.

### Patch Changes

- 7566f80: <!-- tier: kernel -->

  The generated `AppGraphValidationReport` type gains the optional `renderedNeedTrace` record (Needs spec §10.3: `completed` or `not-applicable`, with each covered Definition's url, version, and canonical digest plus its Locales' and Components' digests), and its evidence slots admit `hostEvidence.needsDocuments[n]`. The generated `ScreenerDocument` type gains the optional root `x-generation` (Screener spec §2.1), so a Screener title can carry its own Need trace.

- 96331a0: <!-- tier: kernel -->

  `ValidationResult` documents the reserved Definition-error codes `SYNTAX_ERROR` and `ARITY_MISMATCH`; `CONSTRAINT_PARSE_ERROR` now covers a Bind constraint that calls an undefined function.

- 582f4b7: <!-- tier: kernel -->

  The ValidationResult schema documents `UNDEFINED_FUNCTION` as a reserved Definition error and includes extension calls in `ARITY_MISMATCH`.

## 0.2.1

### Patch Changes

- <!-- tier: kernel -->

  A repeatable group can declare `seedFrom`. Generated `SeedFrom` types match the definition schema so authoring and the engine share one shape.

## 0.2.0

### Minor Changes

- 96f5f6d: <!-- tier: kernel -->

  Add generated types for the versioned Surface 0.2, Registry 1.1, App Manifest
  2.4, Locale 2.0, deterministic Definition Response sources, and Outcome
  Verification Case and Report document formats.

- aa22031: <!-- tier: kernel -->

  Regenerate the Locale and Theme types: the closed `$ui.<ChromeStringKey>` family now
  covers every word a renderer draws for itself, and a token registry entry can declare
  `adapterDefault` — a token each adapter resolves from its own design system while a
  Theme leaves it unset.

**Velocity tier:** 0 — Kernel
**Target cadence:** 6–12 months

All notable changes to this package will be documented in this file.

## [Unreleased]
