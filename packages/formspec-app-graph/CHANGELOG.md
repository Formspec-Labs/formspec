# @formspec-org/app-graph

## 3.0.0

### Major Changes

- a097e0d: <!-- tier: foundation -->

  Report stored option values that differ between directly connected choice fields. Projection checks now take the receiving Definition and its instance name or catalog prefill binding. Callers that use the projection lint port must pass this information in `projectionConsumer`, or pass `null` for a widget.

### Minor Changes

- 307b20d: <!-- tier: foundation -->

  Breaking: native evaluation now rejects choice and multiChoice values outside named option sets and reports `prePopulate.editable: false` fields as readonly, including through FEL `readonly()`. FormEngine retains the authored Definition: `getDefinition()` and `engine.definition` no longer carry resolved `options` for `optionSet` fields; read them through `getOptions(path)` or `optionSignals`. FormEngine uses evaluator readonly results directly.

- 49c104a: <!-- tier: foundation -->

  Breaking: native, WASM, and Python evaluation omit `source` on `MIN_REPEAT` and `MAX_REPEAT` findings, matching the validation-result schema. Rust `ValidationResult.source` is now optional. FormEngine passes evaluator results through without rewriting cardinality findings.

- bfda53a: <!-- tier: foundation -->

  Hosts can supply a lazy loader for the native document linter. Bundle admission loads it when a schema-valid bundle needs a filed-Response projection check.

- 3a61bc2: <!-- tier: foundation -->

  Place a filing tracker on every Surface route, and count paired warning follow-ups once. Validate each roster against the subject keys of its target forms. Show each authorized roster member’s form progress and name the members with a confirmed outstanding filing.

- eb9721c: <!-- tier: foundation -->

  Authoring validation can check module widgets against what the deployment host ships, so a bundle that passes it no longer fails publication's widget resolver.

  - `@formspec-org/app-graph` owns the delivery-contract comparison (`widgetContractMismatchReasons`, `WidgetRuntimeContract`) and adds `hostWidgetContracts` to the validation request. When a caller supplies it, `validateHostWidgetContracts` reports `WIDGET-UNIMPLEMENTED` for a binding the host does not supply and `WIDGET-DELIVERY-CONTRACT-MISMATCH` (with the resolver's reasons, e.g. `registry-entry-version-mismatch`, `rendered-config-inventory-mismatch`, `runtime-contract-missing`) for a Registry entry no shipped variant matches. A widget listed with an empty variant list is shipped without a delivery contract and resolves exactly as the runtime resolver does. `hostWidgetContractSet(modules)` builds the data from a host's widget module variants (widget names plus contracts); `selectHostWidgetContract` and `hostWidgetContractVariants` let a host select from it.
  - `@formspec-org/surface`'s `createWidgetRegistry` now calls that comparison, so runtime and authoring refuse with the same reasons; `WidgetRuntimeContract` types are re-exported from app-graph.
  - `@formspec-org/surface-react` publishes its starter delivery contracts React-free from `./widget-metadata`: `starterWidgetContracts(options)`, `STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS`, `ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS`, and the delivery ids and rendered-config inventories. `starterWidgetModule` delivers exactly that table. `StarterWidgetModuleOptions` is now exported from the package root.

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

- 2cb3f74: <!-- tier: foundation -->

  Breaking: Rebuild rejects Definitions that traverse a repeatable group without a subscript. The `UNSUBSCRIPTED_REPEAT_REFERENCE` definition error names the authored expression, including when the repeat has zero rows. Use the sibling key for the current row or `[*]` for all rows.

- d02f0af: <!-- tier: foundation -->

  Breaking: Formspec lint reports E304 for field paths that continue through a repeatable group without a subscript. Use `$amount` or `@current.amount` for a sibling in the current row, `$rows[1].amount` for one explicit row, and `$rows[*].amount` for all rows.

- 9e50ff3: <!-- tier: foundation -->

  Breaking: Untouched fields are null in editing signals and absent from Response data. Validations comparing a field to `""` no longer fire on untouched fields. Use `responseData` to prefill a new Response and `savedResponseData` to resume. `loadResponseData` replaces current data. Resume applies no padding or creation values, and added repeat rows receive no relative prefill. Prefill and saved values retain their input types, so a string supplied for a numeric field reports `TYPE_MISMATCH`. Creation waits for URL-fetched sources before applying their `seedFrom` and `prePopulate` values.

- b0b7393: <!-- tier: foundation -->

  Breaking: FEL expressions at repeat sites use the same scope in evaluation and ad-hoc reads. A sibling key reads the current row, `[*]` reads the whole collection, and scoped variables evaluate per row. The engine removes `wasmPrepareFelExpression`. Pass authored FEL directly to the evaluator.

  `compileExpression` and `{{…}}` expressions in labels and hints now bind bare `$` to the item (Core §3.2.1).

- f3aa11f: <!-- tier: foundation -->

  Start a new filing unit from an authored route and resume it at its own address.

- 624fafb: <!-- tier: foundation -->

  Breaking: FormEngine recomputes calculated values and drops answers that become non-relevant after other answers are pruned when preparing submit data. The submit report uses the final evaluator findings as-is and includes relevant external findings. APIs that request the submit profile can throw “Submit evaluation did not converge on stable Response data”.

### Patch Changes

- f945d75: <!-- tier: foundation -->

  `APP-GRAPH-RENDERED-NAVIGATION-IMPLICIT` no longer suggests `navigation.visible: false` as an alternative to a Need trace: hidden navigation is inventoried and still needs its own direct trace, because its scope shapes shell navigation.

- ae6af9b: <!-- tier: foundation -->

  `WIDGET-UNIMPLEMENTED` now names what the deployment host does ship for the binding's module: `details.shippedWidgets` (sorted widget names; a per-module host set replaces `anyModule`, as resolution does) and the same list in the message, so an author can pick a widget that exists instead of guessing.

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
- Updated dependencies [624fafb]
- Updated dependencies [582f4b7]
- Updated dependencies [ceb352e]
- Updated dependencies [1cca148]
- Updated dependencies [1cca148]
  - @formspec-org/engine@3.0.0
  - @formspec-org/types@0.3.0
  - @formspec-org/layout@3.0.0

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

### Patch Changes

- Updated dependencies [96f5f6d]
- Updated dependencies [aa22031]
  - @formspec-org/types@0.2.0
