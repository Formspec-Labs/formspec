---
"@formspec-org/engine": minor
"@formspec-org/layout": minor
"@formspec-org/assist": minor
---

<!-- tier: foundation -->

**Breaking**

- Engine removes `getProgress()` and its `FormProgress` export. Use `getEvaluatedFormState()` with layout's `summarizeFormProgress`. Request `{ profile: 'on-submit' }` when computing saved draft progress. For all Submit callers, `getValidationReport({ profile: 'on-submit' })` skips the extra evaluation when the Definition has no submit-timed Shapes or explanation modes to check. When it runs the extra pass, it adds that pass's findings to the live report once per finding identity.
- Layout makes `PageSequenceEntry.id` optional and requires `nodes`, `fieldTemplates` and `groups` alongside `fields`. Shared progress reports `form.ready` and `sections[].filled` for readiness and editable answer coverage. Validation summary rows now carry a finding identity.
- Assist makes `FormProgress.valid` nullable when validation is unavailable and replaces the form `complete` flag with `ready` and the page `complete` flag with `filled`. Generated page IDs use Definition Item keys. Form and page progress include `missingReadonly`. Field navigation returns the path and label with `blocked-readonly` for the first required read-only blank after other field issues are resolved.
