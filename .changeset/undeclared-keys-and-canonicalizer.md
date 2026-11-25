---
"@formspec-org/engine": minor
---

<!-- tier: foundation -->

Breaking: `FormEngine` preserves undeclared Response `data` keys in place across load, edits, repeat operations, and snapshots (including saved properties sharing a `display` Item key and extras inside nested/dependent groups), and evaluation validates values as given without mutating whitespace or letter case. Export `canonicalizeResponseData` for explicit input/import canonicalization and report undeclared paths in `EvaluationResult.undeclaredDataPaths`.
