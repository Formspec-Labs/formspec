---
"@formspec-org/react": patch
---

<!-- tier: foundation -->

CommonJS consumers get one React context: the CJS build now shares chunks across entries, so `FormspecProvider` from the root and a hook from `/hooks` work together under `require()` (before, each CJS entry embedded its own context and the hook threw "useFormspecContext must be used within a FormspecProvider"). The exports map gives each condition its own types (`.d.ts` for `import`, `.d.cts` for `require`), so CommonJS TypeScript stops resolving ESM declarations. `engines.node` is `^20.19.0 || >=22.12.0`, the versions where `require(esm)` is unflagged; the CJS build needs it to load the ESM-only engine, layout and types. `marked`, `canonicalize` and `@noble/hashes` move to devDependencies because they are bundled into `dist`.

`test:consumer` loads every entry by name in a fresh Node process through both `require` and `import`, asserts subpath re-exports are the root's own bindings, and renders the root provider around a `/hooks` hook after `initFormspecEngine()`. `test:packed` runs publint and arethetypeswrong, then packs the package and its workspace-linked dependencies, installs only the react tarball (the others through `overrides`) into a throwaway project, and runs the same probe; CI runs it on Node 22 and 20.19.
