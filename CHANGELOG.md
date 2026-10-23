# Changelog

All notable changes to the Formspec project will be documented in this file.

## [Unreleased]

### Changed - formspec-wasm (fs-4zhu)
- Converged FEL WASM export function `js_name` attributes from uppercase acronyms (`evalFEL`, `analyzeFEL`, etc.) to modern TypeScript camelCase (`evalFel`, `analyzeFel`, `parseFel`, `tokenizeFel`, `printFel`, `getFelDependencies`, `analyzeFelWithFieldTypes`, `collectFelRewriteTargets`, `rewriteFelReferences`).
- Maintained deprecated legacy uppercase aliases (`evalFEL`, etc.) to ensure seamless backward compatibility for existing consumers.
- Standardized split ABI version export `js_name = "formspecWasmSplitAbiVersion"` as a quoted string.
