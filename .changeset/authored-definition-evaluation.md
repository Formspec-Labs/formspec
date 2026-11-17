---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: native evaluation now rejects choice and multiChoice values outside named option sets and reports `prePopulate.editable: false` fields as readonly, including through FEL `readonly()`. FormEngine retains the authored Definition: `getDefinition()` and `engine.definition` no longer carry resolved `options` for `optionSet` fields; read them through `getOptions(path)` or `optionSignals`. FormEngine uses evaluator readonly results directly.
