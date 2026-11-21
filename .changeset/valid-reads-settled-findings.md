---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: `valid()` reads the Bind and Shape results of the same evaluation in every FEL expression, text included (Core §3.5.9). Evaluation repeats Recalculate and Revalidate until those reads settle, so a field hidden through `valid()` keeps no findings and the server recheck, FormEngine and Python return one verdict; an evaluation that cannot settle is refused with `CIRCULAR_DEPENDENCY`. External results injected with `injectExternalValidation` and explanation results still block filing but no longer change what `valid()` reads, in Binds, Shapes or `compileExpression`. Evaluation results carry `invalidPaths`, the settled set. A MIP query whose argument is not a `$path` field reference (`@current.x`, a bare name, a variable, a literal or a function result) is refused at Rebuild with `MIP_ARGUMENT_NOT_FIELD`; inside a repeat row write `$x`. The `previousValidations` evaluation context is removed.
