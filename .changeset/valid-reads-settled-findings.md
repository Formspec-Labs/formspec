---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: `valid()` in Binds, variables, constraints and Shapes reads the findings of the same evaluation. Evaluation repeats Recalculate and Revalidate until those findings settle, so a field hidden through `valid()` reports no findings, and the server recheck, FormEngine and Python return one verdict. `previousValidations` only seeds the first pass.
