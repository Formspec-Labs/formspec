# @formspec-org/webcomponent

## 3.0.0

### Minor Changes

- bc35e3d: <!-- tier: foundation -->

  Accessibility checks for publish (ADR 0166 §3). `@formspec-org/webcomponent/host` builds one self-contained HTML page (`renderHostPage`) that draws `<formspec-render>` from pinned Definition, Theme and Locale documents with no network. `@formspec-org/walk` gains `formspec-walk a11y` and `formspec-walk serve` (`AccessibilityServer`): axe-core (WCAG A/AA) on every page and again with validation errors shown, as a structured report; a timeout or browser failure is a failed report, never a pass. `@axe-core/playwright` is an optional peer dependency. `initFormspecEngine` accepts `{ wasmBytes }` for hosts that cannot fetch the `.wasm`. Walk now depends on the webcomponent.

- e4cac2a: <!-- tier: foundation -->

  A `trigger: "auto"` Modal opens only while its `when` holds and its page is shown (Component spec §6.16, §8.1). The renderers called `showModal()` as soon as `when` held, even inside a hidden wizard page or tab panel: the invisible open dialog made every other page inert, so Next and every other control stopped responding. `@formspec-org/layout` adds `bindAutoModal(dialog, onOpen)`, which opens the dialog when `when` holds and its place in the form is rendered, closes it when either stops, and opens it again when the respondent returns to its page; a resize while it stays shown does not reopen a dismissed modal. `ModalLayoutBehavior` gains `bindAutoOpen(dialog, onOpen)` so every webcomponent adapter shares that binding, and the React `ModalLayout` uses `bindAutoModal` too, which fixes an auto Modal on an inactive tab.

- b494889: <!-- tier: foundation -->

  Normalize authored letter case after whitespace processing and before storage and validation. Text inputs and editable table cells show the stored value when the respondent leaves the control.

- ceb352e: <!-- tier: foundation -->

  Breaking: submit-profile validation now requires current answers for warning
  Shapes authored with confirm, explain or acknowledge mode. The engine exposes
  the current findings and pending edits. Accepted-record review displays the
  explanations retained in the filing.

### Patch Changes

- 7a3307c: <!-- tier: foundation -->

  The default skin keeps each answerable question's message line while it is empty, so a validation message appearing moves nothing: one Required message used to push every later question down 41px, and Save draft, which shows every message at once, moved everything below the first question. The empty line replaces the gap under a stacked question instead of adding to it, so two questions stand one line apart (20.8px), not 41px. `spacing.field` is the floor between stacked questions: a Theme that sets it above one line gets that gap, the message at its top; between everything else it is the gap it always was. The line hangs into the gap only in a column whose gap is the skin's own and only when a visible item follows; a Stack with an authored gap, grid cells, the form root, and read-only, assistant-filled, inline and toggle questions keep it inside the question. The table-cell input, file drop zone, signature Clear button and secondary button draw the input border (`color.input`, held to 3:1 on the card) in both appearances, where their soft borders measured 1.5:1 light and 2.1 to 2.3:1 dark. Dark-mode mixes lighten toward the dark card instead of white. Dark filled buttons label their saturated light-mode fills with `color.primaryForeground`, the colour those fills pair with in both appearances; the token registry drops its three `dark-*-label-on-saturated-*` pairs, which made the linter report E1903 on themes for labels no stylesheet draws, and no platform stylesheet reads `color.dark.primaryForeground`.

- ff8ca95: <!-- tier: foundation -->

  Focusing or leaving a field the filer cannot change no longer reveals its errors. A read-only, calculated, or (React) protected field was marked touched on blur, so clicking into an empty required identity field and tabbing away showed "Required" on a field the filer could not fill. React `useField().touch()` and `inputProps.onBlur`, and the webcomponent's `markFieldTouched` (every behavior's `touch()` and the field's `focusout`/`change` tracking), now leave such a field untouched. Its errors still show after an explicit pass over all fields, such as save, submit, or a wizard step (Core §5.5). Editable fields are unchanged.

- 0974c9f: <!-- tier: foundation -->

  Use the same section order and localized page titles for Wizard and Tabs in both renderers.

- dafa76f: <!-- tier: foundation -->

  Core §4.2.5.3 `styleHints.size` scales an item in the default skin again. Since `zoom` left the skin, the `compact` and `large` rules set font sizes inside `:where()`, and the base label, input and help rules outranked them, so nothing changed size. The hints now set `--formspec-size-scale` (0.875 or 1.125) at zero specificity, so states and Theme classes still restyle over them, and every text and control size the skin gives an item multiplies it: label, legend, description, hint, field help, error, prefix/suffix, inputs and their widget parts, DataTable cells, display headings and group titles. The item's own text scales by `em`. A size inside another compounds (a `compact` item in a `large` group draws at 0.984), exactly to two levels. The never-read size tokens the hints used to set (`--formspec-font-size-*`, `--formspec-default-font-size-*`, `--formspec-space-*`, `--formspec-control-height`) are gone.

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
- Updated dependencies [2662067]
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
- Updated dependencies [492106c]
- Updated dependencies [624fafb]
- Updated dependencies [fbcd351]
- Updated dependencies [582f4b7]
- Updated dependencies [c991aab]
- Updated dependencies [ceb352e]
- Updated dependencies [492106c]
- Updated dependencies [1cca148]
- Updated dependencies [1cca148]
  - @formspec-org/engine@3.0.0
  - @formspec-org/types@0.3.0
  - @formspec-org/layout@3.0.0

## 2.1.0

### Minor Changes

- <!-- tier: foundation -->

  A repeatable group can declare `seedFrom` so a new Response opens with one row per JSON array element from a secondary instance; relative `prePopulate` fills those fields. Host data, including a present empty array, wins. `<formspec-render>` passes constructor `responseData` (hydrate-then-seed); a later saved tree uses `loadResponseData`.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @formspec-org/engine@2.1.0
  - @formspec-org/types@0.2.1
  - @formspec-org/layout@2.1.0

## 2.0.2

### Patch Changes

- edb5999: <!-- tier: foundation -->

  A click on an option lands even when focus is already on a sibling option of the same required field. Focus moving between a field's own controls, or leaving because of a pointer press inside the field, no longer marks the field touched, so the required error does not appear between the press and its release and move the label out from under the pointer.

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

- aa22031: <!-- tier: foundation -->

  A validation message reads the same everywhere. The evaluator resolves `{{expression}}`
  in a Bind's `constraintMessage`, a Bind constraint and a wildcard Shape see the repeat
  row they sit in (`@index`, `@count`, `@current`, `prev`, `next`, `parent`), and a
  boundary row renders empty rather than its own template. The renderer resolves a
  message through the Locale cascade, so its dates follow the active locale, and
  summaries read what the field itself shows.

  Definition `styleHints` render: `emphasis` and `size` reach every adapter as structural
  classes, beneath state and the Theme. A section takes its own `spacing.section` rhythm,
  and the platform Theme no longer overrides a design system's own gaps.

  An adapter declares the render root's classes, so a design system's form rules apply
  from whichever build the page loads. Every renderer-drawn word resolves through
  `$ui.<key>` and follows a locale switch, including the wizard's step wording, the data
  table, the validation summary, the file-upload dropzone, the screener and an action's
  result line. React tracks group heading depth, as the web component does. While the
  engine boots, the skeleton marks each `{{}}` value as pending instead of showing its
  expression, and draws its repeat chrome from the same inventory.

  `migrateResponse` follows core §6.7: `migrations.from[<version>].fieldMap` with
  `preserve`, `drop` and `expression` (`$` the source value, `@source` the whole source),
  nested and indexed targets, `defaults` for new fields, and carry-forward only of paths this
  version still has. The runtime had read a `[{fromVersion, changes}]` shape the schema
  rejects, so a migration authored through Studio or the Forms MCP did nothing.

  Mapping: a `valueMap` matches a boolean or number source by its string form, as the spec
  says and the schema's own `{"true": "Y"}` example shows; and the lint accepts a member after
  an indexed segment (`jobs[0].employerName`), the JSON path syntax the spec names and the
  runtime already executed.

  An instance `source` written as a relative reference (`./data/claimant.json`) resolves
  against the page that loaded the form, like any relative reference, so a Definition names
  its record beside itself and works under whatever path the site is served from. A host
  scheme such as `formspec-fn:` is still never fetched; with no page, an absolute URL or root
  path passes through as before.

### Patch Changes

- Updated dependencies [96f5f6d]
- Updated dependencies [96f5f6d]
- Updated dependencies [aa22031]
- Updated dependencies [aa22031]
  - @formspec-org/types@0.2.0
  - @formspec-org/engine@2.0.0
  - @formspec-org/layout@2.0.0
