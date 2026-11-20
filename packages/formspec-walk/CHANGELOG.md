# @formspec-org/walk

## 3.0.0

### Minor Changes

- bc35e3d: <!-- tier: foundation -->

  Accessibility checks for publish (ADR 0166 §3). `@formspec-org/webcomponent/host` builds one self-contained HTML page (`renderHostPage`) that draws `<formspec-render>` from pinned Definition, Theme and Locale documents with no network. `@formspec-org/walk` gains `formspec-walk a11y` and `formspec-walk serve` (`AccessibilityServer`): axe-core (WCAG A/AA) on every page and again with validation errors shown, as a structured report; a timeout or browser failure is a failed report, never a pass. `@axe-core/playwright` is an optional peer dependency. `initFormspecEngine` accepts `{ wasmBytes }` for hosts that cannot fetch the `.wasm`. Walk now depends on the webcomponent.

- dabfe0d: <!-- tier: foundation -->

  The Definition Walk now makes a native select choice with one keyboard action and checks the displayed value, field state and exported Response before restoring the original answer. The public `Walk.choice()` check can also run independently. It can reach a choice in an initially empty repeat. Emitted test titles remain distinct when group labels repeat or long labels share a prefix. The new `formspec-walk test <spec>` command and `@formspec-org/walk/reporter` export fail when no tests execute, including all-skipped runs and `--pass-with-no-tests`. Listing tests and shards with no assigned tests remain successful.

  Choice checks report unsupported native typeahead labels as uncovered rather than falsely failing a correct control. Playwright supplies printable US-layout keys; the walk includes punctuation and explicitly reports when no option can be exercised.

- 750682a: <!-- tier: foundation -->

  Emit one readable Playwright spec per manifest form with `emit --manifest package-manifest.json --all --out-dir specs --url-template '/forms/{slug}' --axe`. Each spec checks the mounted Definition, and the axe test scans the whole host page. Use `--root` to select the form to navigate. Templates accept `{formId}` and `{slug}` as URL-encoded values. Relative host URLs use Playwright’s configured base URL.

  Run the specs with `formspec-walk test --summary walk.json`. Each form lists discovered tests and their attempts, walk findings, uncovered items and axe reports. Each attempt with an axe report records its index in the form’s `axe` array. The summary retains the runner’s verdict and global errors, including a failure when execution was expected and no tests ran.

  The React renderer marks its mounted Definition so the walk can recognize a display-only form. The walk waits for the live form in either renderer.

- 1cca148: <!-- tier: foundation -->

  Render the authored workspace with section navigation, localized question search, live findings, and shared Save actions. Surface links preserve each form's section and handle browser focus and titles. Definition Walk can open an instruction-only workspace and find the right repeat by its binding.

### Patch Changes

- 2509341: <!-- tier: foundation -->

  Section IDs and titles now follow the authored page or the Heading that names a loose run. Loose content without a section ID stays in authored order within a neighboring section. Flat forms render continuously. Unknown section links open the first section. Authored titles retain their translations and responsive overrides. Theme Items outside page regions share a trailing section with a link based on the first available Item key. If every candidate key is in use, the Items stay at the end of the final Theme page.

  Use `resolvePageSequence` directly for section ownership and progress. The plan now includes the attachments previously applied by `workspaceSections`.

- 86fa695: <!-- tier: foundation -->

  Run the Definition Walk's axe check on every section when the renderer displays a workspace. Report unreachable sections and retain the findings from the sections the walk reached. When the renderer displays a workspace form as one page, scan that page and flag the workspace controls for review.

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
- Updated dependencies [eb9721c]
- Updated dependencies [e25db1a]
- Updated dependencies [b494889]
- Updated dependencies [b494889]
- Updated dependencies [6471622]
- Updated dependencies [1639f33]
- Updated dependencies [7566f80]
- Updated dependencies [ff8ca95]
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
- Updated dependencies [f3aa11f]
- Updated dependencies [624fafb]
- Updated dependencies [582f4b7]
- Updated dependencies [ceb352e]
- Updated dependencies [1cca148]
- Updated dependencies [1cca148]
  - @formspec-org/engine@3.0.0
  - @formspec-org/webcomponent@3.0.0
  - @formspec-org/types@0.3.0
  - @formspec-org/layout@3.0.0
  - @formspec-org/surface@3.0.0

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
