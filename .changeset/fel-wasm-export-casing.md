---
"@formspec-org/engine": minor
---

<!-- tier: foundation -->

The bundled WASM modules export FEL functions in camelCase with a lowercase acronym (`evalFel`, `analyzeFel`, `tokenizeFel`, `getFelDependencies`, `checkFelExtensionName`, ...). The uppercase `FEL` exports are gone, with no aliases. They were internal to the engine's WASM bridge; the public engine FEL API (`evalFEL`, `analyzeFEL`, ...) is unchanged.
