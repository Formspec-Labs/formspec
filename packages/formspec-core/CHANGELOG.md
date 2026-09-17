# @formspec-org/core

## 2.1.0

### Minor Changes

- <!-- tier: foundation -->

  A repeatable group can declare `seedFrom` so a new Response opens with one row per JSON array element from a secondary instance; relative `prePopulate` fills those fields. Host data, including a present empty array, wins. `<formspec-render>` passes constructor `responseData` (hydrate-then-seed); a later saved tree uses `loadResponseData`.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @formspec-org/engine@2.1.0
  - @formspec-org/types@0.2.1

## 2.0.2

### Patch Changes

- @formspec-org/engine@2.0.2

## 2.0.1

### Patch Changes

- <!-- tier: foundation -->

  The registry refuses `2.0.0` for app-graph and surface — those numbers were used and
  unpublished once, and npm never lets an unpublished number back. The fixed group moves
  to 2.0.1 together so every package still carries one number.

- Updated dependencies
  - @formspec-org/engine@2.0.1

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
