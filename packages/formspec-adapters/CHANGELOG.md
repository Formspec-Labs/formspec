# @formspec-org/adapters

## 2.0.0

### Patch Changes

- e4cac2a: <!-- tier: integration -->

  The USWDS Modal hands a `trigger: "auto"` dialog to the webcomponent's `ModalLayoutBehavior.bindAutoOpen`, so it opens only while its `when` holds and its page is shown, and no longer blocks the rest of the form from a hidden wizard page. Its `when` now also resolves against the Modal's own scope (`whenPrefix`), as the default adapter's does.

- Updated dependencies [bc35e3d]
- Updated dependencies [e4cac2a]
- Updated dependencies [7a3307c]
- Updated dependencies [b494889]
- Updated dependencies [ff8ca95]
- Updated dependencies [0974c9f]
- Updated dependencies [dafa76f]
- Updated dependencies [ceb352e]
  - @formspec-org/webcomponent@3.0.0

## 1.0.0

### Minor Changes

- aa22031: <!-- tier: integration -->

  The USWDS adapter declares `usa-form usa-form--large` as the render root's classes
  instead of re-deriving them in its rules layer, so USWDS's own form rules apply in
  their own order and width stops narrow their inputs again. One rule gives fields,
  display text and dividers the same gap above; a section takes `spacing.section`; a
  group whose title is hidden no longer stacks a second gap on its first question. One
  shell builds every titled group, and the two repeat renders share one frame.
  `styleHints` map to USWDS's palette and type scale, and its own chrome — the file-upload
  dropzone, select-all, the validation summary's sentences — follows the Locale. A closed
  native `<dialog class="usa-modal">` disappears: USWDS's `display: inline-block` no longer
  outranks the browser's closed-dialog rule, so Close closes.

### Patch Changes

- Updated dependencies [96f5f6d]
- Updated dependencies [aa22031]
  - @formspec-org/webcomponent@2.0.0
