# @formspec-org/assist

## 3.0.0

### Minor Changes

- 9c44160: <!-- tier: foundation -->

  **Breaking**

  - Engine removes `getProgress()` and its `FormProgress` export. Use `getEvaluatedFormState()` with layout's `summarizeFormProgress`. Request `{ profile: 'on-submit' }` when computing saved draft progress. For all Submit callers, `getValidationReport({ profile: 'on-submit' })` skips the extra evaluation when the Definition has no submit-timed Shapes or explanation modes to check. When it runs the extra pass, it adds that pass's findings to the live report once per finding identity.
  - Layout makes `PageSequenceEntry.id` optional and requires `nodes`, `fieldTemplates` and `groups` alongside `fields`. Shared progress reports `form.ready` and `sections[].filled` for readiness and editable answer coverage. Validation summary rows now carry a finding identity.
  - Assist makes `FormProgress.valid` nullable when validation is unavailable and replaces the form `complete` flag with `ready` and the page `complete` flag with `filled`. Generated page IDs use Definition Item keys. Form and page progress include `missingReadonly`. Field navigation returns the path and label with `blocked-readonly` for the first required read-only blank after other field issues are resolved.

### Patch Changes

- Updated dependencies [bc35e3d]
- Updated dependencies [e190c49]
- Updated dependencies [e190c49]
- Updated dependencies [7566f80]
- Updated dependencies [6e3468f]
- Updated dependencies [307b20d]
- Updated dependencies [e4cac2a]
- Updated dependencies [49c104a]
- Updated dependencies [3f7c97d]
- Updated dependencies [7a3307c]
- Updated dependencies [a097e0d]
- Updated dependencies [a8e3230]
- Updated dependencies [226b1d3]
- Updated dependencies [582f4b7]
- Updated dependencies [96331a0]
- Updated dependencies [37c2c94]
- Updated dependencies [77182ed]
- Updated dependencies [bfda53a]
- Updated dependencies [3a61bc2]
- Updated dependencies [c9ed6d8]
- Updated dependencies [2509341]
- Updated dependencies [e25db1a]
- Updated dependencies [b494889]
- Updated dependencies [b494889]
- Updated dependencies [6471622]
- Updated dependencies [1639f33]
- Updated dependencies [7566f80]
- Updated dependencies [96331a0]
- Updated dependencies [2cb3f74]
- Updated dependencies [d02f0af]
- Updated dependencies [9e50ff3]
- Updated dependencies [b0b7393]
- Updated dependencies [2285933]
- Updated dependencies [9c44160]
- Updated dependencies [9c44160]
- Updated dependencies [0974c9f]
- Updated dependencies [dafa76f]
- Updated dependencies [f3aa11f]
- Updated dependencies [624fafb]
- Updated dependencies [582f4b7]
- Updated dependencies [ceb352e]
- Updated dependencies [1cca148]
- Updated dependencies [1cca148]
  - @formspec-org/engine@3.0.0
  - @formspec-org/types@0.3.0
  - @formspec-org/layout@3.0.0

## 2.1.0

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @formspec-org/engine@2.1.0
  - @formspec-org/types@0.2.1
  - @formspec-org/layout@2.1.0

## 2.0.2

### Patch Changes

- @formspec-org/engine@2.0.2
- @formspec-org/layout@2.0.2

## 2.0.1

### Patch Changes

- <!-- tier: foundation -->

  The registry refuses `2.0.0` for app-graph and surface — those numbers were used and
  unpublished once, and npm never lets an unpublished number back. The fixed group moves
  to 2.0.1 together so every package still carries one number.

- Updated dependencies
  - @formspec-org/engine@2.0.1
  - @formspec-org/layout@2.0.1

## 2.0.0

### Minor Changes

- 96f5f6d: <!-- tier: foundation -->

  Add production signed-bundle admission, complete vNext AppGraph validation,
  platform-under-tenant Theme layering, target-aware Locale handling, and
  runtime Surface data, action, form, and widget integrations. Add generic
  semantic controls, deterministic preview/test Definition Response delivery,
  and data-only outcome verification.

### Patch Changes

- Updated dependencies [96f5f6d]
- Updated dependencies [96f5f6d]
- Updated dependencies [aa22031]
- Updated dependencies [aa22031]
  - @formspec-org/types@0.2.0
  - @formspec-org/engine@2.0.0
  - @formspec-org/layout@2.0.0
