# Changelog

All notable changes to the Formspec project will be documented in this file.

## [Unreleased]

### Changed - formspec-core (fs-aght)
- Moved `subject_id` and `subject_id_json` from `formspec_core::response_selection` to `formspec_core::subject_key`, which compiles without the `response-selection` feature, so the runtime WASM exports `subjectIdJson`. The old paths are removed, with no aliases; native callers (formspec-server `services/responses.rs`) must import from `subject_key`. `integrity-canonical` is no longer an optional dependency.

### Changed - formspec-wasm (fs-4zhu)
- Renamed every FEL WASM export `js_name` to camelCase with a lowercase acronym: `evalFel`, `evalFelWithContext`, `evalFelWithTrace`, `evalFelWithContextTrace`, `interpolateFelTemplate`, `parseFel`, `tokenizeFel`, `printFel`, `getFelDependencies`, `analyzeFel`, `analyzeFelWithFieldTypes`, `collectFelRewriteTargets`, `rewriteFelReferences`, `checkFelExtensionName`. The uppercase `FEL` exports are removed, with no aliases; callers of the raw WASM module must use the new names.
- Renamed the engine bridge helpers to match (`wasmEvalFel`, `wasmAnalyzeFel`, `wasmTokenizeFel`, ...). The public `@formspec-org/engine` FEL API (`evalFEL`, `analyzeFEL`, `tokenizeFEL`, ...) is unchanged.
