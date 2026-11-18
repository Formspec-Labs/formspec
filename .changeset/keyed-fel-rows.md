---
"@formspec-org/engine": minor
---

<!-- tier: foundation -->

FEL expressions can select a single row by key with `rows[key = value]`.
The engine rewrites field references inside selectors and tracks the key and
result field paths for dependency analysis. Multiple matches yield `null` and
a `FEL_AMBIGUOUS_ROW_LOOKUP` diagnostic in the FEL evaluation API.
