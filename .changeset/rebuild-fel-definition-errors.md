---
"@formspec-org/engine": minor
---

<!-- tier: foundation -->

Breaking: Rebuild refuses a Definition whose authored FEL has a syntax error or calls a built-in function with the wrong number of arguments (Core §3.10.1). The refusal is a `SYNTAX_ERROR` or `ARITY_MISMATCH` Definition finding at the expression's JSONPath, so a malformed readonly calculate no longer keeps a supplied value and an on-demand report no longer drops the refusal. `{{}}` text interpolation still renders a broken expression literally. A calculate's FEL evaluation errors now appear in `diagnostics`, and every diagnostic carries the FEL `code` when it has one, such as `FEL_AMBIGUOUS_ROW_LOOKUP` or `FEL_ARITHMETIC_OVERFLOW`. Required checks treat a whitespace-only string as present unless the Bind trims it, and a Shape whose `activeWhen` is null is skipped.
