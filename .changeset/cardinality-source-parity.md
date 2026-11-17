---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: native, WASM, and Python evaluation omit `source` on `MIN_REPEAT` and `MAX_REPEAT` findings, matching the validation-result schema. Rust `ValidationResult.source` is now optional. FormEngine passes evaluator results through without rewriting cardinality findings.
