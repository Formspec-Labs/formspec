---
"@formspec-org/engine": minor
---

<!-- tier: foundation -->

Breaking: Rebuild reports unknown FEL calls as `UNDEFINED_FUNCTION` at the authored expression, replacing `CONSTRAINT_PARSE_ERROR`. Declare Item behavior on Binds. Evaluation reports retain input refusals in the on-demand profile and expose FEL errors from the expressions that produced the settled result.
