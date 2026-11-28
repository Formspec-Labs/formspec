# @formspec-org/layout

## 3.0.0

### Minor Changes

- e4cac2a: <!-- tier: foundation -->

  A `trigger: "auto"` Modal opens only while its `when` holds and its page is shown (Component spec §6.16, §8.1). The renderers called `showModal()` as soon as `when` held, even inside a hidden wizard page or tab panel: the invisible open dialog made every other page inert, so Next and every other control stopped responding. `@formspec-org/layout` adds `bindAutoModal(dialog, onOpen)`, which opens the dialog when `when` holds and its place in the form is rendered, closes it when either stops, and opens it again when the respondent returns to its page; a resize while it stays shown does not reopen a dismissed modal. `ModalLayoutBehavior` gains `bindAutoOpen(dialog, onOpen)` so every webcomponent adapter shares that binding, and the React `ModalLayout` uses `bindAutoModal` too, which fixes an auto Modal on an inactive tab.

- 2509341: <!-- tier: foundation -->

  Section IDs and titles now follow the authored page or the Heading that names a loose run. Loose content without a section ID stays in authored order within a neighboring section. Flat forms render continuously. Unknown section links open the first section. Authored titles retain their translations and responsive overrides. Theme Items outside page regions share a trailing section with a link based on the first available Item key. If every candidate key is in use, the Items stay at the end of the final Theme page.

  Use `resolvePageSequence` directly for section ownership and progress. The plan now includes the attachments previously applied by `workspaceSections`.

- 9c44160: <!-- tier: foundation -->

  **Breaking**

  - Engine removes `getProgress()` and its `FormProgress` export. Use `getEvaluatedFormState()` with layout's `summarizeFormProgress`. Request `{ profile: 'on-submit' }` when computing saved draft progress. For all Submit callers, `getValidationReport({ profile: 'on-submit' })` skips the extra evaluation when the Definition has no submit-timed Shapes or explanation modes to check. When it runs the extra pass, it adds that pass's findings to the live report once per finding identity.
  - Layout makes `PageSequenceEntry.id` optional and requires `nodes`, `fieldTemplates` and `groups` alongside `fields`. Shared progress reports `form.ready` and `sections[].filled` for readiness and editable answer coverage. Validation summary rows now carry a finding identity.
  - Assist makes `FormProgress.valid` nullable when validation is unavailable and replaces the form `complete` flag with `ready` and the page `complete` flag with `filled`. Generated page IDs use Definition Item keys. Form and page progress include `missingReadonly`. Field navigation returns the path and label with `blocked-readonly` for the first required read-only blank after other field issues are resolved.

- 0974c9f: <!-- tier: foundation -->

  Use the same section order and localized page titles for Wizard and Tabs in both renderers.

- 492106c: <!-- tier: foundation -->

  **Breaking**

  - Layout `summarizeFormProgress` requires its explanation-state argument (`ExplanationStateLike | null`), and `ExplanationStateLike` requires `instances` and `groups`, with each group's `shapeIds` and `paths`. Omitting it used to count an answered follow-up again as its warnings.
  - An owed warning explanation or group acknowledgement (Core §5.3.1) is counted once under `toCheck` in every validation profile, and in the new `followUps` count. It is listed in the new summary `followUps`, not in `findings`, and it keeps `form.ready` false; `pageProgressIssue` still reports such a page as `invalid`. A Submit report's explanation errors no longer count under `toFix`.
  - A current group acknowledgement explains only the firings it covers (its code, Shape and path), not every warning that shares its code.

  **Added**

  - Layout `declaresWarningFollowUps`, `readFormProgressFollowUpRows` and `warningAcknowledgementLegend`.
  - React `acknowledgementLink` workspace prop: the Findings margin lists each owed follow-up once and links a group to the control that accepts it.
  - Surface plans a form slot's `draftReviewHref` from the one review route whose binding resolves to it, and reports `SLOT-BINDING-INCOMPLETE` (`draft-review-ambiguous`) when two or more review it. Surface React links Findings to that route, `?acknowledge=<code>`, whose arrival moves focus from the route heading to the group's enabled Accept button.
  - React shows a Submit-timing warning's explanation control beside its field before Submit once the explanation state names it, and a Findings row for an owed explanation lands in that control. The form reads the explanation state once edits pause, and at once for an answer or a Submit; before Submit and while no live warning fires, typing therefore costs no Submit evaluation.
  - Assist reports an owed follow-up: `getProgress().ready` is false, and `formspec.form.nextIncomplete` returns reason `follow-up` (a group acknowledgement belongs to no page).

- 1cca148: <!-- tier: foundation -->

  Render the authored workspace with section navigation, localized question search, live findings, and shared Save actions. Surface links preserve each form's section and handle browser focus and titles. Definition Walk can open an instruction-only workspace and find the right repeat by its binding.

### Patch Changes

- 7a3307c: <!-- tier: foundation -->

  The default skin keeps each answerable question's message line while it is empty, so a validation message appearing moves nothing: one Required message used to push every later question down 41px, and Save draft, which shows every message at once, moved everything below the first question. The empty line replaces the gap under a stacked question instead of adding to it, so two questions stand one line apart (20.8px), not 41px. `spacing.field` is the floor between stacked questions: a Theme that sets it above one line gets that gap, the message at its top; between everything else it is the gap it always was. The line hangs into the gap only in a column whose gap is the skin's own and only when a visible item follows; a Stack with an authored gap, grid cells, the form root, and read-only, assistant-filled, inline and toggle questions keep it inside the question. The table-cell input, file drop zone, signature Clear button and secondary button draw the input border (`color.input`, held to 3:1 on the card) in both appearances, where their soft borders measured 1.5:1 light and 2.1 to 2.3:1 dark. Dark-mode mixes lighten toward the dark card instead of white. Dark filled buttons label their saturated light-mode fills with `color.primaryForeground`, the colour those fills pair with in both appearances; the token registry drops its three `dark-*-label-on-saturated-*` pairs, which made the linter report E1903 on themes for labels no stylesheet draws, and no platform stylesheet reads `color.dark.primaryForeground`.

- 3a61bc2: <!-- tier: foundation -->

  Place a filing tracker on every Surface route, and count paired warning follow-ups once. Validate each roster against the subject keys of its target forms. Show each authorized roster member’s form progress and name the members with a confirmed outstanding filing.

- 1639f33: <!-- tier: foundation -->

  Count each outstanding warning explanation or grouped acknowledgement once in the filing summary and workspace findings when the evaluator reports it.

- dafa76f: <!-- tier: foundation -->

  Core §4.2.5.3 `styleHints.size` scales an item in the default skin again. Since `zoom` left the skin, the `compact` and `large` rules set font sizes inside `:where()`, and the base label, input and help rules outranked them, so nothing changed size. The hints now set `--formspec-size-scale` (0.875 or 1.125) at zero specificity, so states and Theme classes still restyle over them, and every text and control size the skin gives an item multiplies it: label, legend, description, hint, field help, error, prefix/suffix, inputs and their widget parts, DataTable cells, display headings and group titles. The item's own text scales by `em`. A size inside another compounds (a `compact` item in a `large` group draws at 0.984), exactly to two levels. The never-read size tokens the hints used to set (`--formspec-font-size-*`, `--formspec-default-font-size-*`, `--formspec-space-*`, `--formspec-control-height`) are gone.

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

## 2.1.0

### Patch Changes

- Updated dependencies
  - @formspec-org/types@0.2.1

## 2.0.2

## 2.0.1

### Patch Changes

- <!-- tier: foundation -->

  The registry refuses `2.0.0` for app-graph and surface — those numbers were used and
  unpublished once, and npm never lets an unpublished number back. The fixed group moves
  to 2.0.1 together so every package still carries one number.

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
- Updated dependencies [aa22031]
  - @formspec-org/types@0.2.0
