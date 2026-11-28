# @formspec-org/outcome-verification

## 0.3.0

### Minor Changes

- 6471622: <!-- tier: foundation -->

  Export `indexOutcomeNeedTraces` to resolve the exact Need revisions that an
  App Graph node inherits or declares. The verifier's rule index now cites
  AppGraphValidator's `rendered-node.effective-need-trace` rule. Outcome
  Verification cases and reports use the `need-trace` relation in place of
  `direct-need-trace`. The verifier requires `@formspec-org/types` 0.3.0 or later
  in the 0.3 release line for the effective trace types.

### Patch Changes

- Updated dependencies [e190c49]
- Updated dependencies [7566f80]
- Updated dependencies [96331a0]
- Updated dependencies [c9ed6d8]
- Updated dependencies [b494889]
- Updated dependencies [6471622]
- Updated dependencies [9c44160]
- Updated dependencies [f3aa11f]
- Updated dependencies [582f4b7]
- Updated dependencies [1cca148]
  - @formspec-org/types@0.3.0

## 0.2.0

### Minor Changes

- 96f5f6d: <!-- tier: foundation -->

  Add production signed-bundle admission, complete vNext AppGraph validation,
  platform-under-tenant Theme layering, target-aware Locale handling, and
  runtime Surface data, action, form, and widget integrations. Add generic
  semantic controls, deterministic preview/test Definition Response delivery,
  and data-only outcome verification.

### Patch Changes

- Updated dependencies [96f5f6d]
- Updated dependencies [aa22031]
  - @formspec-org/types@0.2.0
