---
"@formspec-org/engine": patch
---

<!-- tier: foundation -->

`rewriteFELReferences` and `rewriteMessageTemplate` rename every reference the FEL parser locates, using its source positions instead of a second grammar. A keyed lookup on a grouped source such as `($rows)[id = $sel].name` and the instance name in `instance('name', path)` are now renamed. A `$name` bound by an enclosing `let` is a local and is no longer renamed with the field it shadows.
