---
"@formspec-org/engine": minor
---

<!-- tier: foundation -->

The bundled WASM modules export FEL functions in camelCase with a lowercase acronym (`evalFel`, `analyzeFel`, `tokenizeFel`, `getFelDependencies`, `checkFelExtensionName`, ...). The uppercase `FEL` exports are gone, with no aliases, so code that calls the raw module (for example through `getWasmModule()`) must use the new names. The public engine FEL API (`evalFEL`, `analyzeFEL`, ...) is unchanged.
