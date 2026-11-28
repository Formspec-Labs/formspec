# @formspec-org/engine

## 3.0.0

### Major Changes

- a097e0d: <!-- tier: foundation -->

  Report stored option values that differ between directly connected choice fields. Projection checks now take the receiving Definition and its instance name or catalog prefill binding. Callers that use the projection lint port must pass this information in `projectionConsumer`, or pass `null` for a widget.

### Minor Changes

- bc35e3d: <!-- tier: foundation -->

  Accessibility checks for publish (ADR 0166 §3). `@formspec-org/webcomponent/host` builds one self-contained HTML page (`renderHostPage`) that draws `<formspec-render>` from pinned Definition, Theme and Locale documents with no network. `@formspec-org/walk` gains `formspec-walk a11y` and `formspec-walk serve` (`AccessibilityServer`): axe-core (WCAG A/AA) on every page and again with validation errors shown, as a structured report; a timeout or browser failure is a failed report, never a pass. `@axe-core/playwright` is an optional peer dependency. `initFormspecEngine` accepts `{ wasmBytes }` for hosts that cannot fetch the `.wasm`. Walk now depends on the webcomponent.

- e190c49: <!-- tier: foundation -->

  Definition validation and lint now understand `accessControl.class` (Core §4.2.1). The embedded schemas accept `accessControl` on Field and Group items with a core class (`unclassified`, `protected`) or a `cui.*` / `hipaa.*` token, and refuse any other value. `subjectKind` is allowed only with `class: "protected"`. The new lint rule E613 reports a well-formed `cui.*` / `hipaa.*` token that no loaded registry declares through a draft or stable `access-class` entry; values the schema refuses stay E101 only. The registry client parses the `access-class` category.

- 307b20d: <!-- tier: foundation -->

  Breaking: native evaluation now rejects choice and multiChoice values outside named option sets and reports `prePopulate.editable: false` fields as readonly, including through FEL `readonly()`. FormEngine retains the authored Definition: `getDefinition()` and `engine.definition` no longer carry resolved `options` for `optionSet` fields; read them through `getOptions(path)` or `optionSignals`. FormEngine uses evaluator readonly results directly.

- 49c104a: <!-- tier: foundation -->

  Breaking: native, WASM, and Python evaluation omit `source` on `MIN_REPEAT` and `MAX_REPEAT` findings, matching the validation-result schema. Rust `ValidationResult.source` is now optional. FormEngine passes evaluator results through without rewriting cardinality findings.

- 2662067: <!-- tier: foundation -->

  Breaking: `getFELDependencies(expression)` returns a structured result. Use `.fields` for form field paths and `.instanceReads` for paths grouped by secondary instance. With the engine tools initialized, `getDefinitionInstanceReads(definition)` also includes creation-time reads from `seedFrom` and `prePopulate`.

  Definition lint reports unresolved FEL names, reads outside an instance's declared schema, malformed interpolations, duplicate Shape ids, and warning answer modes on non-warning Shapes.

- a8e3230: <!-- tier: foundation -->

  Save and resume editable drafts with `getDraftSnapshot()`, `loadDraftSnapshot()`, or the `draftSnapshot` engine option. A snapshot contains the Definition URL, version, and editable data, including hidden answers, empty repeat rows, and exact numeric values. Resumed answers keep their values when prefill arrives, and replacement repeat rows can receive fresh prefill.

- 582f4b7: <!-- tier: foundation -->

  Breaking: Rebuild reports unknown FEL calls as `UNDEFINED_FUNCTION` at the authored expression, replacing `CONSTRAINT_PARSE_ERROR`. Declare Item behavior on Binds. Evaluation reports retain input refusals in the on-demand profile and expose FEL errors from the expressions that produced the settled result.

- 77182ed: <!-- tier: foundation -->

  The bundled WASM modules export FEL functions in camelCase with a lowercase acronym (`evalFel`, `analyzeFel`, `tokenizeFel`, `getFelDependencies`, `checkFelExtensionName`, ...). The uppercase `FEL` exports are gone, with no aliases. They were internal to the engine's WASM bridge; the public engine FEL API (`evalFEL`, `analyzeFEL`, ...) is unchanged.

- bfda53a: <!-- tier: foundation -->

  Hosts can supply a lazy loader for the native document linter. Bundle admission loads it when a schema-valid bundle needs a filed-Response projection check.

- e25db1a: <!-- tier: foundation -->

  FEL expressions can select a single row by key with `rows[key = value]`.
  The engine rewrites field references inside selectors and tracks the key and
  result field paths for dependency analysis. Multiple matches yield `null` and
  a `FEL_AMBIGUOUS_ROW_LOOKUP` diagnostic in the FEL evaluation API.

- b494889: <!-- tier: foundation -->

  Normalize authored letter case after whitespace processing and before storage and validation. Text inputs and editable table cells show the stored value when the respondent leaves the control.

- 7566f80: <!-- tier: foundation -->

  Publication gates lint bundle documents against their loaded companions and prove the rendered-Need trace ran.

  - Add `documentLintValidator`, `AppGraphDocumentLintContext`, and `DOCUMENT_LINT_ORIGIN`. These replace unreleased Locale-only names; they are additions for npm users. `documentLintDiagnostics(lint, handle, context)` supplies the shared mapping for authoring and publication. It preserves all severities, source locations, `suggestedFix`, and `specRef` under origin `x-formspec-lint`.
  - `documentLintValidator(lint)` lints every loaded Definition, Theme, Component, Locale, Screener, Response Actions, Mapping, Ontology, References, and Registry document. It pairs companions by target URL, includes peer Locales for fallback checks, and lints unresolved targets without a paired Definition. Surface and Experience remain excluded until their duplicate rules are reconciled. `bundleComponentDocuments` is never passed; app-graph keeps ownership of bundle Component identity checks.
  - Hosts can pass `resolveMappingSourceContext` to `documentLintValidator` for Mappings that read host metadata alongside Definition data. The engine's `lintDocument` accepts the returned `mappingSourceContext` with its JSON Schema and dotted `dataPath` and checks the original Mapping rules.
  - Breaking: remove `validateThemeTokenRegistry` (released in 2.1.0). The validator and report producers no longer report the unregistered Theme-token warning by default. Hosts receive it only by injecting `documentLintValidator(lintDocument)` into `crossArtifactValidators`. It now arrives as W708 (`THEME-TOKEN-UNREGISTERED`) under origin `x-formspec-lint`, with canonical lint metadata instead of `details.token`, `details.brandToken`, and `details.reason`.
  - `renderedNeedTrace: { mode: 'required' | 'when-declared', digest }` on the validation and producer requests runs the strict rendered-Need trace (Needs spec §10.3) and writes `report.renderedNeedTrace` (`completed` or `not-applicable`). Each covered Definition is bound to its content: url, version, and canonical digest (the injected `digest`, JCS + SHA-256 as Source hashes a Definition), plus the digests of the Locales and Components targeting it. The trace now walks Screener items, options, and binds like a Definition's. Source checks that record for a Need-traced Definition instead of re-running the rule. `runRenderedNeedTrace` exposes the same run.
  - App Manifest 2.5 (`bundleManifest/2.5`) adds the optional `needs` member; each 2.x minor is additive, so every 2.4 rule holds in 2.5 (`appManifestVersionAtLeast`, `APP_MANIFEST_VERSIONS`; the resolver, app-entry, Locale association, and `@formspec-org/surface` entry selection use it). The bundle-export producer pairs the `needs` member's document as Needs evidence and refuses a declared document the bundle does not carry (`APP-GRAPH-NEEDS-REF`).
  - The rendered-Need trace resolves inherited traces within Definitions and Screeners. Trace roots still require direct traces. The validator reports each missing root and each bad anchor once. A direct anchor that repeats the inherited pins produces a `REDUNDANT` warning. The report schema also admits `hostEvidence.needsDocuments[n]` evidence slots.
  - Breaking: `RenderedNeedTraceNode.source` requires `jsonPointer`, and each node requires `effective` with the Need IDs and the sources that supply them. Both `renderedNeedTrace.nodes` and `collectRenderedNeedTraceNodes` expose the effective trace. A `MISSING` diagnostic's `relatedSources` lists the dependent nodes that inherit from the missing root.
  - Add `definitionPublicationReports` to publish each Definition with its own rendered-Need trace from the admitted bundle. The full report remains available for bundle review.

- 96331a0: <!-- tier: foundation -->

  Breaking: Rebuild refuses a Definition whose authored FEL has a syntax error or calls a built-in function with the wrong number of arguments (Core §3.10.1). The refusal is a `SYNTAX_ERROR` or `ARITY_MISMATCH` Definition finding at the expression's JSONPath, so a malformed readonly calculate no longer keeps a supplied value and an on-demand report no longer drops the refusal. `{{}}` text interpolation still renders a broken expression literally. A calculate's FEL evaluation errors now appear in `diagnostics`, and every diagnostic carries the FEL `code` when it has one, such as `FEL_AMBIGUOUS_ROW_LOOKUP` or `FEL_ARITHMETIC_OVERFLOW`. Required checks treat a whitespace-only string as present unless the Bind trims it, and a Shape whose `activeWhen` is null is skipped.

- 2cb3f74: <!-- tier: foundation -->

  Breaking: Rebuild rejects Definitions that traverse a repeatable group without a subscript. The `UNSUBSCRIPTED_REPEAT_REFERENCE` definition error names the authored expression, including when the repeat has zero rows. Use the sibling key for the current row or `[*]` for all rows.

- d02f0af: <!-- tier: foundation -->

  Breaking: Formspec lint reports E304 for field paths that continue through a repeatable group without a subscript. Use `$amount` or `@current.amount` for a sibling in the current row, `$rows[1].amount` for one explicit row, and `$rows[*].amount` for all rows.

- 9e50ff3: <!-- tier: foundation -->

  Breaking: Untouched fields are null in editing signals and absent from Response data. Validations comparing a field to `""` no longer fire on untouched fields. Use `responseData` to prefill a new Response and `savedResponseData` to resume. `loadResponseData` replaces current data. Resume applies no padding or creation values, and added repeat rows receive no relative prefill. Prefill and saved values retain their input types, so a string supplied for a numeric field reports `TYPE_MISMATCH`. Creation waits for URL-fetched sources before applying their `seedFrom` and `prePopulate` values.

- b0b7393: <!-- tier: foundation -->

  Breaking: FEL expressions at repeat sites use the same scope in evaluation and ad-hoc reads. A sibling key reads the current row, `[*]` reads the whole collection, and scoped variables evaluate per row. The engine removes `wasmPrepareFelExpression`. Pass authored FEL directly to the evaluator.

  `compileExpression` and `{{…}}` expressions in labels and hints now bind bare `$` to the item (Core §3.2.1).

- 9c44160: <!-- tier: foundation -->

  **Breaking**

  - Engine removes `getProgress()` and its `FormProgress` export. Use `getEvaluatedFormState()` with layout's `summarizeFormProgress`. Request `{ profile: 'on-submit' }` when computing saved draft progress. For all Submit callers, `getValidationReport({ profile: 'on-submit' })` skips the extra evaluation when the Definition has no submit-timed Shapes or explanation modes to check. When it runs the extra pass, it adds that pass's findings to the live report once per finding identity.
  - Layout makes `PageSequenceEntry.id` optional and requires `nodes`, `fieldTemplates` and `groups` alongside `fields`. Shared progress reports `form.ready` and `sections[].filled` for readiness and editable answer coverage. Validation summary rows now carry a finding identity.
  - Assist makes `FormProgress.valid` nullable when validation is unavailable and replaces the form `complete` flag with `ready` and the page `complete` flag with `filled`. Generated page IDs use Definition Item keys. Form and page progress include `missingReadonly`. Field navigation returns the path and label with `blocked-readonly` for the first required read-only blank after other field issues are resolved.

- 492106c: <!-- tier: foundation -->

  Breaking: for a subject-declaring Definition, `FormEngine` ignores a supplied `responseSubject.id` and derives `Response.subject.id` once, at construction, from the validated `type` and `keys`. `getResponse({ subject })` now throws for a subject-declaring Definition. While the subject is refused, `getResponse`, `getResponseSnapshot` and `captureSubmitSnapshot` throw `Response subject refused: <path>: <message>`; `hasSubjectRefusal()` and the `TYPE_MISMATCH` finding in `getValidationReport()` remain. A host entity subject on a Definition without a subject declaration must carry `responseSubject.id`, or construction throws. Rust: `formspec_core::response_selection::{subject_id, subject_id_json}` moved to `formspec_core::subject_key` (no alias).

  A subject-declaring form no longer loads the tools WebAssembly (4.66 MB, 1.59 MB gzip) to name its filing unit; the runtime WebAssembly grows by about 15 KB (5 KB gzip). `responseSubjectId(type, keys)` needs only `initFormspecEngine()` and is also exported from `@formspec-org/engine/render`. In `@formspec-org/surface-react`, the Definition form slot and draft keys derive the id from the planned subject through runtime WebAssembly: the slot shows no loading state for tools, an unhashable subject shows the localized unavailable message, and a renderer-supplied id neither keys a draft nor recreates the engine. A slot whose initial data names a Mapping (`initialData.mappingRef`) still downloads the tools WebAssembly, now on its own before reversing the Mapping, so the saving above does not apply to it; a failed tools load shows the localized unavailable message.

- 624fafb: <!-- tier: foundation -->

  Breaking: FormEngine recomputes calculated values and drops answers that become non-relevant after other answers are pruned when preparing submit data. The submit report uses the final evaluator findings as-is and includes relevant external findings. APIs that request the submit profile can throw “Submit evaluation did not converge on stable Response data”.

- fbcd351: <!-- tier: foundation -->

  Breaking: `FormEngine` preserves undeclared Response `data` keys in place across load, edits, repeat operations, and snapshots (including saved properties sharing a `display` Item key and extras inside nested/dependent groups), and evaluation validates values as given without mutating whitespace or letter case. Export `canonicalizeResponseData` for explicit input/import canonicalization and report undeclared paths in `EvaluationResult.undeclaredDataPaths`.

- c991aab: <!-- tier: foundation -->

  Breaking changes to `valid()` follow Core §3.5.9. Each read uses the same evaluation's required, type, cardinality, constraint and Shape errors on the referenced item. Recalculate and Revalidate repeat until those reads settle. A field hidden through `valid()` produces no findings. An evaluation that cannot settle is refused with `CIRCULAR_DEPENDENCY`. External and explanation errors still block filing. The browser editing snapshot carries the settled paths in `invalidPaths`.

  Model item property queries require a `$path` field reference. Inside a repeat row, use `$x` to name the current row's field. Rebuild refuses other argument forms with `MIP_ARGUMENT_NOT_FIELD`. Host expressions report the argument error, and interpolation preserves the affected placeholder. The `previousValidations` evaluation context is removed.

- ceb352e: <!-- tier: foundation -->

  Breaking: submit-profile validation now requires current answers for warning
  Shapes authored with confirm, explain or acknowledge mode. The engine exposes
  the current findings and pending edits. Accepted-record review displays the
  explanations retained in the filing.

### Patch Changes

- 6e3468f: <!-- tier: foundation -->

  Assemble Group `$ref` inclusions with a host-supplied resolver before evaluating
  or validating the Definition. An unassembled Group now produces an error at
  its authored reference.

- 3f7c97d: <!-- tier: foundation -->

  Expression initial values can read scoped Definition variables and wait for
  instance sources before filling absent fields. Removing a repeat row preserves
  the surviving rows' prior relevance and validation state.

- 226b1d3: <!-- tier: foundation -->

  The engine declares `@formspec-org/integrity-canonical` as `^0.1.1` instead of a `file:` path into a sibling `integrity-stack` checkout, which no install outside the formspec-stack could resolve. Inside the stack the workspace root links that sibling, so local builds resolve the same package. Installing the published engine still needs `@formspec-org/integrity-canonical`, `@formspec/signature-port` and `@formspec/signature-cose` on npm.

- 37c2c94: <!-- tier: foundation -->

  `rewriteFELReferences` and `rewriteMessageTemplate` rename every reference the FEL parser locates, using its source positions instead of a second grammar. A keyed lookup on a grouped source such as `($rows)[id = $sel].name` and the instance name in `instance('name', path)` are now renamed. A `$name` bound by an enclosing `let` is a local and is no longer renamed with the field it shadows.

- 2285933: <!-- tier: foundation -->

  `setValue` keeps respondent input to a field under a group keyed `instances`, a legal Item key. It read `instances.<name>…` as an instance target before looking up the field, so the input was lost: with a writable instance of that name the value went into the instance and the field stayed null; with none, `setValue` threw `Unknown instance`. A path that names an Item now writes that Item; only a path naming no Item targets an instance.

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

### Minor Changes

- <!-- tier: foundation -->

  A repeatable group can declare `seedFrom` so a new Response opens with one row per JSON array element from a secondary instance; relative `prePopulate` fills those fields. Host data, including a present empty array, wins. `<formspec-render>` passes constructor `responseData` (hydrate-then-seed); a later saved tree uses `loadResponseData`.

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

**Velocity tier:** 1 — Foundation
**Target cadence:** 3–6 months

All notable changes to this package will be documented in this file.

## [Unreleased]

### Changed

- **FEL analysis wire format:** WASM/Rust `fel_analysis_to_json_value` exposes parse failures as `errors: { message, span? }[]` (not plain strings). `@formspec-org/engine` normalizes these to `FELAnalysisError` with `line`, `column`, and `offset` for backward-compatible UX; optional `span` is passed through when present.
