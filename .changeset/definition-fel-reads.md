---
"@formspec-org/engine": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: `getFELDependencies(expression)` returns a structured result. Use `.fields` for form field paths and `.instanceReads` for paths grouped by secondary instance. With the engine tools initialized, `getDefinitionInstanceReads(definition)` also includes creation-time reads from `seedFrom` and `prePopulate`.

Definition lint reports unresolved FEL names, reads outside an instance's declared schema, malformed interpolations, duplicate Shape ids, and warning answer modes on non-warning Shapes.
