# Changelog

All notable changes to the Formspec project will be documented in this file.

## [Unreleased]

### Changed - formspec-wasm (fs-4zhu)
- Renamed every FEL WASM export `js_name` to camelCase with a lowercase acronym: `evalFel`, `evalFelWithContext`, `evalFelWithTrace`, `evalFelWithContextTrace`, `interpolateFelTemplate`, `parseFel`, `tokenizeFel`, `printFel`, `getFelDependencies`, `analyzeFel`, `analyzeFelWithFieldTypes`, `collectFelRewriteTargets`, `rewriteFelReferences`, `checkFelExtensionName`. The uppercase `FEL` exports are removed, with no aliases; callers of the raw WASM module must use the new names.
- Renamed the engine bridge helpers to match (`wasmEvalFel`, `wasmAnalyzeFel`, `wasmTokenizeFel`, ...). The public `@formspec-org/engine` FEL API (`evalFEL`, `analyzeFEL`, `tokenizeFEL`, ...) is unchanged.
