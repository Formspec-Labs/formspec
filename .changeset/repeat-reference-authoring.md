---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: Formspec lint reports E304 for field paths that continue through a repeatable group without a subscript. Use `$amount` or `@current.amount` for a sibling in the current row, `$rows[1].amount` for one explicit row, and `$rows[*].amount` for all rows.
