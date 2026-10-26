---
"@formspec-org/react": patch
---

<!-- tier: foundation -->

`engines.node` is now `>=20.19.0`. The CommonJS build `require()`s the ESM-only `@formspec-org/engine`, `layout` and `types`; that load needs Node's built-in `require(esm)`, which is unflagged from 20.19. A new `test:consumer` script loads the package by name in a fresh Node process, through both the `require` and `import` export conditions, and renders with `react-dom/server`.

`test:packed` packs the package and its workspace-linked dependencies, installs the tarballs into a throwaway project outside the workspace, and runs the same probe there; CI runs it after the unit tests.
