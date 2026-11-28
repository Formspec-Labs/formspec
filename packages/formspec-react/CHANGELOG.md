# @formspec-org/react

## 3.0.0

### Major Changes

- d253733: <!-- tier: foundation -->

  Require Node.js 22.12.0 or later for CommonJS and ES module consumers. Both entry points preserve exact JSON numbers.

### Minor Changes

- 2509341: <!-- tier: foundation -->

  Section IDs and titles now follow the authored page or the Heading that names a loose run. Loose content without a section ID stays in authored order within a neighboring section. Flat forms render continuously. Unknown section links open the first section. Authored titles retain their translations and responsive overrides. Theme Items outside page regions share a trailing section with a link based on the first available Item key. If every candidate key is in use, the Items stay at the end of the final Theme page.

  Use `resolvePageSequence` directly for section ownership and progress. The plan now includes the attachments previously applied by `workspaceSections`.

- ceb352e: <!-- tier: foundation -->

  Breaking: submit-profile validation now requires current answers for warning
  Shapes authored with confirm, explain or acknowledge mode. The engine exposes
  the current findings and pending edits. Accepted-record review displays the
  explanations retained in the filing.

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

- e4cac2a: <!-- tier: foundation -->

  A `trigger: "auto"` Modal opens only while its `when` holds and its page is shown (Component spec §6.16, §8.1). The renderers called `showModal()` as soon as `when` held, even inside a hidden wizard page or tab panel: the invisible open dialog made every other page inert, so Next and every other control stopped responding. `@formspec-org/layout` adds `bindAutoModal(dialog, onOpen)`, which opens the dialog when `when` holds and its place in the form is rendered, closes it when either stops, and opens it again when the respondent returns to its page; a resize while it stays shown does not reopen a dismissed modal. `ModalLayoutBehavior` gains `bindAutoOpen(dialog, onOpen)` so every webcomponent adapter shares that binding, and the React `ModalLayout` uses `bindAutoModal` too, which fixes an auto Modal on an inactive tab.

- 80a4421: <!-- tier: foundation -->

  CommonJS consumers get one React context: the CJS build now shares chunks across entries, so `FormspecProvider` from the root and a hook from `/hooks` work together under `require()` (before, each CJS entry embedded its own context and the hook threw "useFormspecContext must be used within a FormspecProvider"). The exports map gives each condition its own types (`.d.ts` for `import`, `.d.cts` for `require`), so CommonJS TypeScript stops resolving ESM declarations. `engines.node` is `^20.19.0 || >=22.12.0`, the versions where `require(esm)` is unflagged; the CJS build needs it to load the ESM-only engine, layout and types. `marked`, `canonicalize` and `@noble/hashes` move to devDependencies because they are bundled into `dist`.

  `test:consumer` loads every entry by name in a fresh Node process through both `require` and `import`, asserts subpath re-exports are the root's own bindings, and renders the root provider around a `/hooks` hook after `initFormspecEngine()`. `test:packed` runs publint and arethetypeswrong, then packs the package and its workspace-linked dependencies, installs only the react tarball (the others through `overrides`) into a throwaway project, and runs the same probe; CI runs it on Node 22 and 20.19.

- c6eba42: <!-- tier: foundation -->

  Markdown sanitizing no longer passes `allowedSchemesRelative`, which is not a `sanitize-html` option: it failed `tsc` on the package's sources and never had an effect. Protocol-relative links keep sanitize-html's default (`allowProtocolRelative: true`), so rendered output is unchanged.

- 35d3b2f: <!-- tier: foundation -->

  `import '@formspec-org/react'` works under Node ESM again. The ESM build bundled the CommonJS `sanitize-html` (and `postcss` beneath it), whose `require("path")` threw "Dynamic require of \"path\" is not supported" on import. `sanitize-html` is now left external, resolved from the package's own dependency; only the ESM-only `canonicalize`, `@noble/hashes` and `marked` stay bundled for the CommonJS build.

- ff8ca95: <!-- tier: foundation -->

  Focusing or leaving a field the filer cannot change no longer reveals its errors. A read-only, calculated, or (React) protected field was marked touched on blur, so clicking into an empty required identity field and tabbing away showed "Required" on a field the filer could not fill. React `useField().touch()` and `inputProps.onBlur`, and the webcomponent's `markFieldTouched` (every behavior's `touch()` and the field's `focusout`/`change` tracking), now leave such a field untouched. Its errors still show after an explicit pass over all fields, such as save, submit, or a wizard step (Core §5.5). Editable fields are unchanged.

- dabfe0d: <!-- tier: foundation -->

  Native selects now commit on the browser's input event before a host autosave update can rerender the old controlled value. Shared event handling deduplicates the later change event against the displayed option; change-only integrations still work. Numeric selects retain the authored option spelling when the engine canonicalizes the answer. This covers form fields, editable DataTable cells, repeat rows and native screener choice and Yes/No controls.

- 0974c9f: <!-- tier: foundation -->

  Use the same section order and localized page titles for Wizard and Tabs in both renderers.

- 750682a: <!-- tier: foundation -->

  Emit one readable Playwright spec per manifest form with `emit --manifest package-manifest.json --all --out-dir specs --url-template '/forms/{slug}' --axe`. Each spec checks the mounted Definition, and the axe test scans the whole host page. Use `--root` to select the form to navigate. Templates accept `{formId}` and `{slug}` as URL-encoded values. Relative host URLs use Playwright’s configured base URL.

  Run the specs with `formspec-walk test --summary walk.json`. Each form lists discovered tests and their attempts, walk findings, uncovered items and axe reports. Each attempt with an axe report records its index in the form’s `axe` array. The summary retains the runner’s verdict and global errors, including a failure when execution was expected and no tests ran.

  The React renderer marks its mounted Definition so the walk can recognize a display-only form. The walk waits for the live form in either renderer.

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
