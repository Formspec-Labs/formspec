# @formspec-org/layout

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
