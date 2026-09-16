# @formspec-org/walk

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

- 8d0bac8: <!-- tier: foundation -->

  New package: the Definition walk. `derivePlan` reads a Definition, Locale and Theme
  into the names, states, options, groups, repeats and conditions a rendered form must
  present; `Walk` checks them on a live page by keyboard and screen reader (Guidepup's
  virtual reader in the page, or the OS's own); `walkDefinition` runs them all;
  `formspec-walk emit` writes them out as a readable Playwright spec.

### Patch Changes

- Updated dependencies [96f5f6d]
- Updated dependencies [96f5f6d]
- Updated dependencies [aa22031]
- Updated dependencies [aa22031]
  - @formspec-org/types@0.2.0
  - @formspec-org/engine@2.0.0
  - @formspec-org/layout@2.0.0
