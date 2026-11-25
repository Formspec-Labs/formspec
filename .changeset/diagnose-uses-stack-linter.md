---
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: `project.diagnose()` now lints every exported project document through `@formspec-org/app-graph` and the stack linter (`lintDocument`), returning `{ diagnostics: AppGraphDiagnostic[], counts }` instead of the four legacy buckets (`structural`, `expressions`, `extensions`, `consistency`), and throws when tools WASM is uninitialised. Removed `dependencyGraph()`, `DependencyGraph`, and `ProjectOptions.schemaValidator`. Severity changes: a stale mapping `sourcePath` is now lint error `E1110` (blocking merges and Studio publish) and a malformed component `when` expression is now lint error `E400`.
