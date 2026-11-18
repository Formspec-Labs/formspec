---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: FEL expressions at repeat sites use the same scope in evaluation and ad-hoc reads. A sibling key reads the current row, `[*]` reads the whole collection, and scoped variables evaluate per row. The engine removes `wasmPrepareFelExpression`. Pass authored FEL directly to the evaluator.

`compileExpression` and `{{…}}` expressions in labels and hints now bind bare `$` to the item (Core §3.2.1).
