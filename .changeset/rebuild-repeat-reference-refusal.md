---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: Rebuild rejects Definitions that traverse a repeatable group without a subscript. The `UNSUBSCRIPTED_REPEAT_REFERENCE` definition error names the authored expression, including when the repeat has zero rows. Use the sibling key for the current row or `[*]` for all rows.
