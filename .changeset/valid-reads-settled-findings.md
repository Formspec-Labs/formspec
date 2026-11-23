---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking changes to `valid()` follow Core §3.5.9. Each read uses the same evaluation's required, type, cardinality, constraint and Shape errors on the referenced item. Recalculate and Revalidate repeat until those reads settle. A field hidden through `valid()` produces no findings. An evaluation that cannot settle is refused with `CIRCULAR_DEPENDENCY`. External and explanation errors still block filing. The browser editing snapshot carries the settled paths in `invalidPaths`.

Model item property queries require a `$path` field reference. Inside a repeat row, use `$x` to name the current row's field. Rebuild refuses other argument forms with `MIP_ARGUMENT_NOT_FIELD`. Host expressions report the argument error, and interpolation preserves the affected placeholder. The `previousValidations` evaluation context is removed.
