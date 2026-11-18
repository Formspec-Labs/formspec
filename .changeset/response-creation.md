---
"@formspec-org/engine": minor
"@formspec-org/app-graph": minor
"@formspec-org/core": minor
---

<!-- tier: foundation -->

Breaking: Untouched fields are null in editing signals and absent from Response data. Validations comparing a field to `""` no longer fire on untouched fields. Use `responseData` to prefill a new Response and `savedResponseData` to resume. `loadResponseData` replaces current data. Resume applies no padding or creation values, and added repeat rows receive no relative prefill. Prefill and saved values retain their input types, so a string supplied for a numeric field reports `TYPE_MISMATCH`. Creation waits for URL-fetched sources before applying their `seedFrom` and `prePopulate` values.
