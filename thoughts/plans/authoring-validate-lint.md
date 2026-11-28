# Authoring validate equals the stack linter: Forms, Wireframes and publish gates report what formspec-lint reports

## Front matter

**Goal.** For any document an author can produce, three checks report exactly what `formspec-lint` reports (reached as the engine's `lintDocument`), as the same entries, under one code per rule:
- Forms MCP `formspec_validate_form` (and every `diagnose()` gate);
- Wireframes `formspec_wireframes_validate`;
- every AppGraph publish gate.

Today two of them report green on documents the linter rejects. Authors learn of those defects only at server publish, or by writing their own wrappers; downstream multi-form deployments had to maintain three local wrappers (`port-review.json` plan entry RC-NO-LINTER).

**Status.** Revision 2, partly implemented. **Landed on formspec main (not pushed):** fs-6jt9 as 4152fd19 and fs-i29t as d6f8773c, each after an independent review. **Still open:** E304 waits for the evaluator plan's §3.2.2 spec commit; fs-ebrt has gone to another agent, and fs-e9xa follows it. **Follow-ups:** fs-isg6, fs-dlre, fs-0ksc, fs-rgj1. This revision folds in:
- the independent pre-review, which approved with named changes, no blockers, and endorsed D3;
- the owner's rulings on Q5, Q6 and Q7 (§9).

**Tickets.**

| Ticket | Type / priority | Scope | Depends on |
|---|---|---|---|
| **fs-anqx** | epic | The whole unit | |
| fs-6jt9 | bug, P1 | E500 vertex model | |
| fs-i29t | task, P1 | Lint corrections and E304 | |
| fs-ebrt | bug, P1 | Bundle lint | fs-6jt9, fs-i29t |
| fs-e9xa | bug, P1 | Forms `diagnose()` | fs-ebrt, fs-i29t |
| fs-drn5 | task, P3 | Surface and Experience: one owner each | |

fs-dmgz was extended, not duplicated.

**Evidence base.** Checked at formspec 3f6890ef and formspec-studio ab4d6b0, against built dists that were current for the paths probed: formspec-mcp dist 2026-11-17; core and app-graph dist 2026-11-06, their source last changed 2026-10-26. The probe scripts live in an ephemeral scratchpad; every finding below quotes its observed result, so it stands without them.

**What changed from revision 1.**
- **Census of native AppGraph rules.** It found three rules owned twice:
  - Experience referential integrity and item refs, each at two severities;
  - the Theme token registry warning, with lint W708 broader than the spec.

  So `experience` joins `surface` as an excluded kind, W708 is rescoped and the app-graph twin deleted, and fs-drn5 now covers Surface and Experience.
- **fs-6jt9 redesigned** to one vertex per key and slot, including the MIP query functions; the old "answered or filed" escape is removed.
- **R2 corrected.** formspec-lint does not depend on formspec-eval. The couplings with the evaluator work are `crates/formspec-wasm`, the shared fel-core checkout, and generated files. WASM is rebuilt only through the project runner.
- **D5 baseline computed at gate time.** Accept-all is gated too (owner, Q7).
- **Added:** E304 (named by `evaluator-parity.md` §11); the severity changes; more consumers; deployment-tools' hand-written lint loops now go through the shared mapping.
- **Closed:** Q3 (Component §11.4 and §4.5), Q4 (drop), Q5 (minor plus a "Breaking:" line), Q6 (both lockfiles, with a diff check).

---

## 1. Items

| Item | Verdict | Evidence |
|---|---|---|
| **F5:** validate_form runs no linter | Confirmed | See the F5 detail below. |
| F5 sub-claim "a pattern that refuses every answer" | Corrected (dropped) | FEL `'^[0-9]+\.[0-9]+$'` gets `FEL_PARSE_ERROR` from today's diagnose() and E400 from lint. The correctly escaped `\\.` gets neither, as it should. The no-runtime-diagnostic part (F24) belongs to the evaluator. |
| **F33c:** Wireframes lints Locales only | Confirmed | See the F33c detail below. |
| **N1** (new): false W1401 | Confirmed | `localeLintValidator` never passes the other Locales, so the passport applicant bundle gets 3 false W1401 ("fallback target "en" was not supplied"). Passing `localeDocuments` clears all 8 Locales. |
| **N2** (new): two owners for the same rule | Confirmed | See §3. |
| **N3** (new): chat audit is silently dead | Confirmed | `formspec-chat/src/chat-session.ts:935` calls `formspec_describe`, a tool the product-verb surface removed; the catch returns `[]`. |
| **F23a:** false cycle between two `required` rules | Confirmed in both places | See the F23a detail below. |
| F7 sub-claim "validation accepts a dangling `choicesFrom`" | Fixed for free (E302) | The verb that writes the dangling reference stays with RC-AUTHORING-VERBS. |
| F4, F25 | Out of scope; nothing here fixes them | |

**F5 detail.**
- Code path: validate_form with no response calls `handleDescribe('audit')`, which returns `project.diagnose()` (`formspec-mcp/src/product-tools.ts:492-496`).
- The structural pass runs only when a validator is supplied (`formspec-core/src/queries/diagnostics.ts:41`), and nothing passes one (`registry.ts:135-142`; no other caller found).
- On a Definition with an undefined option set, two sibling fields labelled "Name", mutual `required` binds and a bind on an unknown path:
  - validate_form returns `counts {error:1}`: the TS `CIRCULAR_DEPENDENCY c -> d` only;
  - `lintDocument` on the exported Definition reports E101, E300, E302, E500 and W1902.
- A multi-form deployment plan: diagnose() gives 0/0/0; lint gives 4 W1902. Another multi-form Definition: 0 against 3 info W902.

**F33c detail.**
- `formspec-mcp-wireframes/src/server.ts:3203-3207` wires only `localeLintValidator`, which takes Locale handles only (`app-graph/src/locale-lint.ts:116`).
- Probe: given a Definition with an undefined option set and a Response Action whose `pathTemplate` `/plans/{planId}` has no bindings, the validator returns `[]`. `lintDocument` reports E302, and E1805 "pathBindings must match pathTemplate placeholders exactly; missing=["planId"]" (`pass_response_actions.rs:484-500`).

**F23a detail.**
- TS reports `CIRCULAR_DEPENDENCY c -> d`; lint reports `E500 $.binds[0].required c → d → c`.
- Cause: `formspec-lint/src/expressions.rs:97` (and its copy at `:147`) sets `bind_target` for every slot except `constraint`, and `dependencies.rs:29` merges those expressions onto the field's own vertex.
- The evaluator checks only variable cycles (`formspec-eval/src/recalculate/variables.rs:34`), so runtime behaviour does not change.

**Measurements.**

*Lint cost.* Warm `lintDocument` against today's diagnose():

| Definition | Size | Lint (warm) | diagnose() today |
|---|---|---|---|
| Another large private form | 1.1 MB | 50 ms | 142 ms |
| A large private form | 530 KB | 42 ms | 57 ms |
| A private plan | 354 KB | 25 ms | 32 ms |

The first call pays 360 ms of schema warm-up. All 55 passport-bundle documents lint in 47 ms warm.

*Fallout.*
- The three seed bundles give no errors when every document is linted.
- Representative multi-form Definitions give no errors.
- A fresh Studio project, and a Studio-authored tree with pages, an Accordion and a group, lint clean.
- Themes with tokens are the exception (§3): a 5-token theme gives W708 ×4, including spec-sanctioned prefixes, and W709 ×50 (info).

## 2. Design

### D1. One rule owner per diagnostic, one severity, one shape

- formspec-lint owns every rule that both sides would otherwise report. Where the spec names a code, the lint title carries it, following the E605–E613 convention.
- The only shape is the AppGraph Diagnostic (`schemas/app-graph-validation-report.schema.json` `$defs/Diagnostic`):
  - origin `x-formspec-lint`, phase `cross-artifact`;
  - `primarySource {artifactSlot, artifactKind, jsonPointer, ref}`;
  - `details {lintPath, suggestedFix?, specRef?}`.
- `suggestedFix` is appended to the message. That replaces the hard-coded E1402 bare-key sentence (`locale-lint.ts:58-59`).

### D2. The mapping and the bundle validator live in `@formspec-org/app-graph`

app-graph is layer 1 and has no engine. `document-lint.ts` replaces `locale-lint.ts`.

- `AppGraphDocumentLinter(document, context)`, with context type `AppGraphDocumentLintContext`: `definitionDocument`, `screenerDocument`, `themeDocument`, `componentDocuments`, `localeDocuments`, `registryDocuments`. The key names are those of `lintDocument`'s options.
- `documentLintDiagnostics(lint, handle, context)` is the one mapping from a finding to a diagnostic. It keeps every severity; today's Locale validator drops `info`.
- `documentLintValidator(lint)` lints every `loaded` handle of these kinds: definition, theme, component, locale, screener, responseActions, mapping, ontology, references, registry.
  - It excludes `surface` and `experience` until fs-drn5 gives each rule one owner, and `dataSources` and `appManifest`, which the linter has no pass for.
  - It never passes `bundleComponentDocuments`. E605 would otherwise duplicate `APP-GRAPH-COMPONENT-NODE-IDENTITY-DUPLICATE`.
  - Pairing is by URL:
    - a Definition gets every loaded Registry;
    - a companion document gets its exactly-one target Definition (`componentTargetUrl` generalised to every kind), plus that Definition's Theme (exactly one), Components and Locales;
    - a Locale targeting a Screener gets that Screener;
    - an unresolved target is linted without that context, and the resolver's own diagnostic owns it.
- Renamed with no alias, since none of these has been released (they exist only in the pending changeset `.changeset/publication-locale-lint-and-need-trace.md`; npm app-graph is at 2.1.0):

  | Today | Becomes |
  |---|---|
  | `localeLintValidator` | `documentLintValidator` |
  | `AppGraphLocaleLintContext` | `AppGraphDocumentLintContext` |
  | `LOCALE_LINT_ORIGIN` | `DOCUMENT_LINT_ORIGIN` (same value) |

- Deleted: `validateThemeTokenRegistry`. Lint W708, rescoped by fs-i29t, is the one owner (§3).
- **Amendment (ADR 0172).** AppGraph calls the Rust `check_instance_projection` through the same linter port. See [App Graph Validator, Response projection context](../../specs/app-graph/app-graph-validator-spec.md#response-projection-context) for the receiving form and upstream Definitions passed to Core. Core owns projection diagnostics and version filtering.
- `WireframesMcpServerOptions.localeLinter` becomes `documentLinter`, still required.

### D3. Where the linter is bound

- A package with no engine dependency receives the linter as an injected port: app-graph, and Wireframes at its composition root.
- A package that already depends on the engine binds it directly. formspec-core already calls tools WASM inside diagnose() (`validateExtensionUsage`, `diagnostics.ts:126`), so it imports `lintDocument`.
- The reviewer endorsed this. An optional port that nothing wired is the F5 bug; a required one would add a parameter to every `createProject` caller for a single implementation.

`diagnose(state)` stays a pure query:
- The body of `RawProject.export()` is extracted into a pure `exportBundle(state)`, which both `RawProject.export()` and `diagnose(state)` call.
- `diagnose(state)` lints every exported document and returns `{ diagnostics: AppGraphDiagnostic[], counts }`.
- Pairing is by project membership: every companion document is checked against `definitions[0]`, so E1400, E1700, E1800, E1201, E1310 and W707 can fire. The Definition is linted with `extensions.registries[*].document`; each Locale gets the other Locales.
- With tools WASM uninitialised, `diagnose()` throws; it never returns an empty result.
- formspec-core gains a dependency on app-graph (layer 2 on layer 1; `scripts/check-dep-fences.mjs`).

### D4. Delete the duplicates, move what only TS had, drop what the spec does not hold

**Deleted from formspec-core:**
- diagnose()'s structural, FEL, cycle and extension passes, and the consistency checks (`diagnostics.ts:41-311`);
- `dependencyGraph()` and `DependencyGraph` (`dependency-graph.ts:142-264`, `types.ts:595`, `project-core.ts:118`, `raw-project.ts:330`, `vocabulary-gated-core.ts:121`);
- `ProjectOptions.schemaValidator` (`types.ts:303-304`, `raw-project.ts:208,216`).

**Kept:** `fieldDependents`, `variableDependents`, and the editor's single-expression `FEL_PARSE_ERROR` (`expression-index.ts:98-102`).

**Moved into lint (fs-i29t):**
- E400 for an Item `initialValue` written `=expr` (Core §4.2.3).
- E400 for a Component `when`, including template trees (Component §8).
- W800 per Component §4.2 category:
  - Input binds a field;
  - Display binds a field, a display item, or nothing;
  - DataTable and Accordion bind a repeatable group;
  - template child binds resolve relative to the bound group.

  This replaces `ORPHAN_COMPONENT_BIND`, `DISPLAY_ITEM_BIND` and `STALE_THEME_REGION_KEY`.

**Dropped:**
- `PAGED_ROOT_NON_GROUP`. Component §11.4 and §4.5 define how unbound items render (root Sections, then Theme pages, then generated fallback), and the check ignored Theme page authority.
- `UNMATCHED_THEME_SELECTOR` (owner, through the review).
- Inline item FEL properties, which are not in the Item schema.

**Severity changes authors will see.** These are written into the core changeset and fs-i29t.
- A stale mapping `sourcePath` goes from TS warning (`diagnostics.ts:218-224`) to lint **E1110, an error**. It now blocks merges and Studio publish.
- A malformed `when` becomes **E400, an error**, so server publish refuses it. Component §8.4 (`component-spec.md:2981-2990`) asks a runtime only to hide the component and warn. E400 stays: §8.4 governs rendering, not authoring or publish, and the lint entry cites §8.4.

**fs-dmgz (extended):** delete `formspec-mcp/src/schemas.ts:24-38`, the third copy of the errors-only wrapper. It duplicates the engine's `createSchemaValidator`. Callers: `tools/bootstrap.ts:93` and `tests/advisory-severity.test.ts:27,36`.

### D5. Merge gates block only on errors the proposals introduce (owner, Q7)

- Compute the baseline when the gate runs: `diagnose(snapshotBefore + userOverlay)`, reusing the reject path's restore-and-replay (`studio-core/src/proposal-manager.ts:656-670`).
- Compare a multiset of (code, artifactSlot, message), with `[n]` indexes in the message normalised.
- This applies to accept-all (`:520-525`, ungated today) and to `_partialMerge` (`:855`).
- An error the user's own edit introduced is in the baseline, so it does not block.
- The MCP refusal (`tools/changeset.ts:315`) lists the new errors. Today it lists `diag.structural`, which is always empty.

### D6. E500 per Core §3.6.1 (fs-6jt9, lands first)

The graph has one vertex per key and slot.

**Writes.** Which expressions write a field's value:
- `calculate` and an `=`-prefixed `default` write it.
- `relevant` writes it only when the field's effective `excludedValue` is `"null"`:
  - the effective value is the merged Bind's (§4.3);
  - the default is `"preserve"` (§4.3.1).
- Relevance inherits through ancestors (logical AND, §4.3.2). So a group's `relevant` writes every descendant whose effective `excludedValue` is `"null"`.
- `required`, `readonly` and `constraint` write nothing.

**Reads.**
- `$X` reads X's value vertex.
- The MIP query functions `relevant()`, `readonly()`, `required()` and `valid()` read X's slot vertex. fel-core reports these as `mip_deps` (`fel-core/src/dependencies.rs:113`).

**One helper** serves the object-form walk, the array-form walk and the screener binds (`expressions.rs` near `:97`, `:147`, and the screener `walk_binds`).

**MIP query reads (settled by review; this replaces the spec-expert question).**

| Query | Reads |
|---|---|
| `relevant($X)` | the `relevant` of X and its ancestors |
| `readonly($X)` | the `readonly` of X and its ancestors |
| `required($X)` | X's `required`, plus the `relevant` of X and its ancestors (§5.6 rules 1, 3) |
| `valid($X)` | X's value, `required` and `constraint`; the `relevant` of X and its ancestors; every Shape targeting X (`constraint`, `activeWhen`, composed members) |

`relevant` also writes a field's value when the field's effective Bind declares a `default` (§4.3.1, §5.6 rule 5).

**Draft Core §3.6.1 bullet.** Lands after the evaluator plan's `specs/core/spec.md` commits; edit `spec.md` and `spec.llm.md` together, then run `npm run docs:generate` and `docs:check`.

> - **Bind and query edges.** A `calculate` or `=`-prefixed `default` expression writes its Item's value. A `relevant` expression writes the value of its Item, and of each descendant, whose effective Bind sets `excludedValue: "null"` or declares a `default`. `required`, `readonly` and `constraint` expressions write no value. A MIP query on Item X depends on:
>   - `relevant($X)` and `readonly($X)`: that property's expressions on X and on X's ancestors;
>   - `required($X)`: X's `required` and the `relevant` expressions of X and its ancestors;
>   - `valid($X)`: X's value, X's `required` and `constraint`, the `relevant` expressions of X and its ancestors, and every Shape targeting X (`constraint`, `activeWhen` and composed members).

Wireframes validate newly lints Definitions, so fs-6jt9 must be in the WASM before fs-ebrt.

### Scaling

| Path | Cost |
|---|---|
| Forms | k documents; one WASM call each, serialising the document plus its paired Definition: O(k·\|D\|). One `structuredClone` per call (`exportBundle`). |
| Wireframes | n handles: O(n²) handle comparisons (n ≤ ~60) plus O(n·\|D\|) serialisation. |
| Merge gates | Add one restore-and-replay of the user's overlay, plus one diagnose, per merge. |
| UI | diagnose() runs in `useMemo` keyed on the project, the changeset or the message count, not on every keystroke. |
| E304 | One lookup in the set of repeatable groups per path reference. |

Measured lint cost is below today's diagnose(), which makes two `analyzeFEL` WASM calls per expression.

## 3. Census: native AppGraph rules against lint rules

The native validators are listed at `app-graph/src/validator.ts:335-355`. The fs-ebrt implementer confirms this table before writing code.

| AppGraph module | Codes | Lint overlap | Resolution |
|---|---|---|---|
| experience-referential-integrity | `EXP-REFERENTIAL-INTEGRITY` (error, `:198`), `EXP-ITEM-REF-UNRESOLVED` (error, `:287`), `EXP-UNIT-UNMOUNTED` | W1701 (warning, `pass_experience.rs:147`), W1702 (warning, `:171`). The spec names the EXP codes (`experience-spec.md:444-445`, `:503`). | **Two owners, two severities.** Exclude `experience`; fs-drn5 picks one owner (recommended: lint, at error, spec name in the title). |
| theme-token-registry | `THEME-TOKEN-UNREGISTERED` (warning, `:100`; owned prefixes only) | W708 (warning; every non-`x-` unregistered token, including `typography.`, `border.` and `elevation.`, which Theme §3.2 sanctions), W709 (info, one per missing registry token). token-registry-spec §5:454-457 names both. | **Two owners; lint's scope is wrong.** fs-i29t rescopes W708 to the registry-owned prefixes and titles it `(THEME-TOKEN-UNREGISTERED)`; the other signal old W708 carried (a key outside every Theme §3.2 category, not `x-`) gets its own code, W710, so each code is one rule; W709 becomes one info per theme. fs-ebrt deletes `validateThemeTokenRegistry` and points the spec at W708 alone. |
| component-routes | `APP-GRAPH-COMPONENT-NODE-IDENTITY-DUPLICATE` and 16 others | E605, only with `bundleComponentDocuments` | Never pass that option. |
| app-entry, surface-* | `SURFACE-ENTRY-UNRESOLVED`, slot/unit/trigger/widget codes, E611 and E612 (owned by TS by design, `lib.rs:16`) | Studio-core's surface-local `SURFACE-ROUTE-UNREACHABLE` and `SURFACE-SLOT-BINDING-UNRESOLVED` duplicate lint E606 and E607 | `surface` excluded; fs-drn5. |
| locale-associations | `APP-GRAPH-LOCALE-{DUPLICATE,REF,TARGET,UI-CHROME-MISSING}` | none (E1400 cannot fire under URL pairing) | Keep. |
| ux-title-duplicates | `APP-GRAPH-UX-TITLE-DUPLICATE` (Section and Panel titles) | none (W1902 is Definition sibling labels) | Keep. |
| ui-graph-policy | `THEME-TOKEN-{REF,CATEGORY,SLOT,WIDGET}`, `THEME-ROUTE-CLASS`, `LOCALE-KEY-OWNER*` (policy evidence) | none | Keep. |
| data-sources | `DATA-SOURCE-*` for catalog identity and availability | Rust `check_instance_projection` (ADR 0172) | The linter port reports `INSTANCE-PROJECTION-*` for the selection and delivered schema (§2 D2 amendment). |
| Other modules: component-graph-context, executable-schema-contracts, experience-action-refs, needs coverage and rendered-need trace, screener-surface-targets, ux-authoring-quality, widget-runtime-contract | | none (no lint pass, or an excluded kind) | Keep. |

## 4. Files to change, by repository

### formspec

**fs-6jt9**
- `crates/formspec-lint/src/expressions.rs`: the one helper; the per-slot write and read model.
- `crates/formspec-lint/src/dependencies.rs`: per-slot vertices, `mip_deps`, `excludedValue` resolution; docs and tests.

**fs-i29t**
- `crates/formspec-lint/src/expressions.rs`: walk Item `initialValue`; E304 over every FEL string.
- `crates/formspec-lint/src/pass_component/{walk.rs, check_input_compat.rs, field_lookup.rs, classification.rs}`: parse `when`; E304 in `when`; W800 per category.
- `crates/formspec-lint/src/pass_theme/token_registry.rs`: W708 scope; W709 aggregation.
- `specs/lint-codes.json`: W708, W709, W800, E400 and E304 entries.
- `tests/fixtures/lint/*`.
- Regenerate `crates/formspec-lint/src/generated/lint_code.rs` with `npm run docs:generate`.

**fs-ebrt**
- `git mv packages/formspec-app-graph/src/locale-lint.ts src/document-lint.ts`, then rewrite it.
- `src/index.ts:124-131`.
- Delete `src/theme-token-registry.ts`, and its entry in `validator.ts:350`.
- `tests/publication-gates.test.ts:69-133`: move to `tests/document-lint.test.ts`.
- `.changeset/publication-locale-lint-and-need-trace.md:10`: rewrite the bullet.
- `specs/theme/token-registry-spec.md:454-457`: name W708 as the implementation. Edit it after the evaluator's spec commits, then run `npm run docs:generate`.

**fs-e9xa**
- `packages/formspec-core/src/queries/diagnostics.ts`: rewrite.
- `queries/dependency-graph.ts`, `queries/index.ts`.
- `raw-project.ts`: extract `exportBundle`; diagnose; removals.
- `project-core.ts:118,123`, `types.ts`, `index.ts:122-125`.
- `package.json`, `README.md:113,116,187`.
- Tests: `diagnostics.test.ts`, `queries.test.ts:925-950`, `e2e.test.ts:30-40`, `e2e-examples.test.ts:355-368`.
- A new core changeset: `minor`, with a "Breaking:" line and the severity changes; tier `foundation`.
- `package-lock.json` (§9, Q6).
- API.llm.md and `filemap.json`, regenerated (§8).

### formspec-studio

**fs-e9xa**

*studio-core*
- `src/types.ts:29-30`, `src/index.ts:249-250`.
- `src/project.ts:396`.
- `src/vocabulary-gated-core.ts:121,126`.
- `src/proposal-manager.ts:520-525,656-670,855`.
- `README.md:74`.
- `tests/proposal-manager.test.ts`.

*formspec-mcp*
- `src/tool-output-schemas.ts:17-22,113,123,130`: the `audit` output becomes `lintReport`. Keep it as a container check only (code, severity and message required; the rest JSON). A test asserts each entry against the canonical `$defs/Diagnostic`.
- `src/tools/{query.ts:24-26, changeset.ts:310-318}`; `bootstrap.ts` and `lifecycle.ts` use counts only.
- `src/product-tools.ts:783-786`, `README.md:108`.
- Tests: `query.test.ts`, `output-validation.test.ts:143,200,219-221`, `lifecycle.test.ts:148`, `demos/*replay*`.

*formspec-chat*
- `src/chat-session.ts:931-959`.
- `tests/chat-session.test.ts`, `tests/integration.test.ts`.

*Studio UI*
- `src/components/ChatPanel.tsx:10-11,697-709`.
- `tests/components/status-bar.test.tsx`.

*Lockfile:* `package-lock.json` (§9, Q6).

**fs-ebrt**

*mcp-wireframes*
- `src/server.ts:10,85-91,3206`.
- `src/product-tools.ts:1098-1101`.
- `scripts/replay-tool-calls.ts:739`.
- `README.md:28`.
- Tests: `tests/{product-harness.ts:43, d1-locale-attachment.test.ts:26, mcp-definition-boundary.test.ts:44}`; `blind-run-authoring.test.ts:550-551` asserts the E1402 `suggestedFix`, not `'bare key'`.
- New `tests/validate-lints-every-document.test.ts`.
- `dist/tool-catalog.json` is regenerated by `npm run build`.

*formspec-mcp*
- `src/app-graph-publish.ts:11-12,346-350`.

**fs-dmgz**
- `formspec-mcp/src/schemas.ts`, `src/tools/bootstrap.ts:93`, `tests/advisory-severity.test.ts:27,36`.

### formspec-stack root

- `tools/deployment-tools/validators/validate.ts`:
  - `:10,664,856` (imports, the validator, `documentLinter`);
  - the hand-written Definition/Locale lint loop (`:397-433`) and the Mapping loop (`:499-520`) go through `documentLintDiagnostics`, keeping their errors-only gate policy.
- After `git submodule status`, a parent commit bumping the formspec and formspec-studio pointers.

### Outside these repositories (named, not edited)

- `~/.codex/skills/form-stack-integration/references/authoring-and-validation.md:51,80,91`. Line 91 says lint and validate "each report defects the other misses", which becomes false.
- The in-repo checkpoint copy under `thoughts/plans/benefits-scenarios/.../form-stack-integration-skill-checkpoint-v1` is another agent's work in progress; coordinate.
- Downstream host deployments retire their local `lint.mjs` wrappers and `cross-check.mjs` check 1.

## 5. Tests to write first (RED), at the layer where each bug lives

Run every check through the package's own script, never a bare binary from PATH:
- Rust: `cargo nextest run -p formspec-lint`.
- TS: `npm test` in each package, or `npm run test --workspace=<pkg>` in formspec.
- deployment-tools: `npm test` and `npm run typecheck`.
- Registry: the formspec Python lint-registry test, but only after the extension has been rebuilt by the stack's own target (R3).

**fs-6jt9**
- These give no E500: mutual `required`; mutual `readonly`; mutual `relevant` with the default `excludedValue` (`"preserve"`).
- These give E500: mutual `relevant` with `excludedValue: "null"`; a group `relevant` that reads a descendant whose `excludedValue` is `"null"`; `A.calculate = readonly($B)` with `B.readonly = $A`; a `calculate` cycle.
- Control: a self-referencing `constraint` (`$ >= 0`) stays clean.

**fs-i29t**
- E400 fires at `initialValue` `=1 + + 2` and at a malformed `when` (tree and template); a literal `initialValue` stays silent.
- W800 fires for: an input bound to a group; an input bound to a display item; a display component bound to a missing item; a DataTable bound to a non-repeatable group.
- W800 stays silent for: a display component bound to a field; a display component bound to a display item; an unbound display component; an Accordion bound to a repeatable group; a bare-key child bind in a DataTable template.
- W708 is silent for `typography.body` and `elevation.card` and fires for `color.accent`, with the brand hint; W709 gives one info per theme.
- E304 fires on `$R.x` in a Bind, a Shape, a variable, Item text, `initialValue` and `when`. It stays silent for `$x`, `@current.x`, `$R[*].x`, `$R[0].x`, and `$G.x` where `G` is not repeatable.

**fs-ebrt, app-graph** (`tests/document-lint.test.ts`; stub linters record the context they receive)
1. A Definition finding becomes a diagnostic with the expected origin, slot, `jsonPointer` and `suggestedFix`; info severity is kept.
2. A Response Action is linted with its Definition and Components.
3. A Locale's context includes the other Locales (the W1401 case).
4. Surface, experience and dataSources handles never reach the linter.
5. An unresolved target is linted without a `definitionDocument`.
6. A Definition gets the Registries.
7. `bundleComponentDocuments` is never passed.
8. No report contains both `THEME-TOKEN-UNREGISTERED` and W708.
9. The existing Locale cases (`publication-gates.test.ts:70-133`) carry over unchanged in what they assert.

**fs-ebrt, Wireframes** (`validate-lints-every-document.test.ts`)
- `formspec_wireframes_validate` refuses a materialized E302 Definition and an E1805 Response Action (`WIREFRAMES-VALIDATION-FAILED`, origin `x-formspec-lint`).
- `public-api.typecheck.ts` fails to compile without `documentLinter`.

**fs-ebrt, deployment-tools**
- A bundle whose Definition has E302 is refused.
- The three example bundles still validate.

**fs-e9xa, formspec-core** (`diagnostics.test.ts`, real engine)
- E300, E302, E500 (from a `calculate` cycle) and W1902, with matching counts.
- Every entry validates against `$defs/Diagnostic`.
- Companion documents are linted against the project Definition: W705, E1110, W800, E1402.
- Extension cases give E600, E601 and E602.
- Mutual `required` binds give no E500.
- diagnose() throws when tools WASM is uninitialised.
- The `dependencyGraph` tests are deleted.

**fs-e9xa, studio-core**
For both accept-all and per-group merges:
- a pre-existing lint error does not block;
- an error introduced by the user's own edit does not block;
- an error introduced by an accepted AI proposal blocks.

**fs-e9xa, formspec-mcp**
- validate_form (no response), publish_form validate and query audit return the same object with E302, W1902 and `counts {error:1, warning:1}`.
- Output validation enforces the new schema.

**fs-e9xa, formspec-chat**
- `auditViaTools` calls `formspec_validate_form` and maps the lint diagnostics.

**Composed end-to-end check on the real path, last**
1. Run the MCP probes against the rebuilt dists; validate_form and Wireframes validate should report the lint codes.
2. Replay an injected-defect plan with `npm run replay` in mcp-wireframes; the unbound placeholder must be refused.

## 6. Contract changes and every consumer inside the stack

| # | Contract | Change | Consumers (none left on the old shape) |
|---|---|---|---|
| C1 | `@formspec-org/core` `Diagnostics` / `IProjectCore.diagnose()` | Four buckets plus counts → `{diagnostics: AppGraphDiagnostic[], counts}`; throws without tools WASM | core: raw-project, project-core, types, queries, README:113,116,187, 3 test files. studio-core: project, vocabulary-gated-core, proposal-manager, re-exports, README:74, tests. mcp: query, changeset, bootstrap/lifecycle (counts), output schemas, tests and demos. chat: chat-session and 2 test files. Studio UI: ChatPanel, StatusBar/UnifiedStudio (counts), status-bar test. API.llm.md ×4. |
| C2 | core removals | `dependencyGraph()`, `DependencyGraph`, `ProjectOptions.schemaValidator` | `vocabulary-gated-core.ts:121`, `queries.test.ts:930,946`, `index.ts:122`, core `README.md:113,187`. |
| C3 | MCP tool outputs | validate_form (no response), publish_form validate, lifecycle validate, query audit → `{diagnostics, counts}`; the merge refusal lists new errors | mcp tests and demos, chat, `README:108`, tool descriptions, the form-stack-integration skill (outside the repo, plus a checkpoint copy in flight), downstream host wrappers. |
| C4 | app-graph lint port | §2 D2 renames (unreleased); `documentLintDiagnostics`; `AppGraphLintDiagnostic` gains `suggestedFix`/`specRef`; `validateThemeTokenRegistry` deleted | app-graph index and tests; mcp `app-graph-publish.ts`; Wireframes `server.ts`; deployment-tools `validate.ts`; the pending changeset; token-registry-spec §5. formspec-server's e2e support calls `publishFormVersionWithAppGraphReport` unchanged; its reports gain lint entries. |
| C5 | `WireframesMcpServerOptions.localeLinter` | → `documentLinter`, required (package not on npm) | `server.ts`, `replay-tool-calls.ts` (serve-stdio and replay), 3 tests, deployment-tools `validate.ts:856`, README, tool description, tool catalog. |
| C6 | Behaviour of validate and the publish gates | Lint errors in every bundle document except Surface and Experience are refused; no false W1401; no doubled theme-token warning | Export follows `validationPassed`; the seed packages' errors are unchanged. |
| C7 | formspec-lint rules | E500 vertex model; W800 per category (repeat-template relative paths resolve, Component §4.4); E400 on `initialValue` and `when`; W708 scope; new W710 (uncategorized token; `specs/ui-policy.json` `unknownNonExtensionDiagnostic` now points at it); W709 aggregated; new E304; E1110/E400 now reach authoring as errors | Every lint caller: server publish, `python -m formspec.validate`, the MCP draft gate, conformance fixtures, `tests/unit/test_lint_rule_registry.py`. |

**Changesets.** Core and app-graph share a fixed group with the engine. Both get a `minor` bump with a "Breaking:" line (owner, Q5); this is one decision across this plan and `evaluator-parity.md`.

## 7. Risks

- **R1. Lint fallout in fixtures.** Real defects will surface:
  - core's e2e examples assert 0 errors **and** 0 warnings (`e2e-examples.test.ts:367-368`);
  - the MCP demo replays assert 0 errors;
  - the Wireframes suites validate Definitions authored by verbs.

  Fix the fixtures. File verb defects under RC-AUTHORING-VERBS. Never relax a gate. A theme with tokens is the known case; fs-i29t lands first so it does not trip.
- **R2. Couplings with the evaluator work.** formspec-lint does not depend on formspec-eval. The couplings are:
  - `crates/formspec-wasm`, which compiles both (Cargo.toml:43, 63, 64);
  - the shared fel-core checkout;
  - generated files (`docs:generate`, filemap, API.llm.md).

  Mitigations:
  - Rebuild WASM only with `npm run build:wasm --workspace=@formspec-org/engine` (Makefile:49). It runs in the pinned image and `scripts/in-wasm-image.mjs` copies the working tree, so run it once, in an agreed window, after the evaluator's Rust tree is committed.
  - Never run `build:wasm:tools` (it uses the wasm-pack on PATH), the formspec root `npm run build`, or `make api-docs` in the shared tree.
- **R3. Python registry test.** `formspec/.venv` and `_native.abi3.so` were rebuilt by a `uv` the stack did not choose. Rebuild through the stack's own target before trusting `test_lint_rule_registry.py`. Never run `uv`.
- **R4. Visible chat change.** The dead chat audit comes alive, so the auto-fix approval flow (`queueAutoFixApproval`) fires on lint issues for the first time. Expected, but visible.
- **R5. Lockfiles.** See §9, Q6.
- **R6. Severity changes.** E1110 and E400 now block merges and Studio publish (§2 D4).

## 8. Order of work and working arrangement

**Working arrangement**
- **Rust:** a git worktree of formspec placed at the stack root, beside the other submodules, so `../fel-core` resolves. Give it its own `CARGO_TARGET_DIR`. Check `df` first and stop under 25 GB free (195 GB free at planning time).
- **TypeScript:** the main checkouts, committing with explicit paths, since other agents work in formspec and in the root `.tickets/`.
- **Generated files:** run `npm run docs:generate`, `npm run docs:filemap` and `node scripts/generate-ts-api-markdown.mjs` (which rewrites every package's API.llm.md) only after the evaluator's commits. Commit only this unit's files. Report other regenerated diffs; do not commit or revert them.

**Order**
1. **fs-6jt9** in the worktree: RED, fix, nextest. Commit formspec.
2. **fs-i29t** in the worktree: RED, implement, lint-codes.json, `docs:generate` / `docs:check`, nextest. The E304 registry entry waits for the evaluator's S6 spec commit. Commit formspec.
3. **One WASM rebuild** (`npm run build:wasm --workspace=@formspec-org/engine`) in the agreed window, with both lint tickets merged into the main tree.
4. **fs-ebrt, formspec half.**
   1. Confirm the census.
   2. RED, then app-graph `document-lint.ts`.
   3. Delete `validateThemeTokenRegistry`.
   4. Run app-graph `npm test` and build app-graph.
   5. Rewrite the pending changeset.
   6. Edit token-registry-spec §5 after the evaluator's spec commits.
   7. Commit.
5. **fs-e9xa, formspec half.**
   1. RED, then the `exportBundle(state)` extraction, the new `diagnose(state)`, and the removals.
   2. Run core `npm test`; build core.
   3. Add the changeset.
   4. Lockfile (Q6) in `formspec/`.
   5. Commit.
6. **formspec-studio**, one commit per ticket half, with explicit paths:
   1. Wireframes: `documentLinter`, the validator, the tests; run `npm test`.
   2. formspec-mcp: `app-graph-publish`, outputs, tools, descriptions, README, tests and demos; run `npm test`.
   3. studio-core: D5 and types; run `npm test`.
   4. chat, then the Studio UI; run `npm test` in each.
   5. fs-dmgz's `schemas.ts` cleanup.
   6. Lockfile (Q6) in `formspec-studio/`.
   7. Tool catalog through the build.
7. **Root:** deployment-tools `validate.ts`, then `npm test` and `npm run typecheck` there. Then the parent pointer commit.
8. **Composed end-to-end check** (§5).
9. **Generated docs, after the evaluator's commits:** API.llm.md and filemap, committing only this unit's files.
10. **Reviews:** after each ticket, an independent `semi-formal-code-review`; after the set, `semi-formal-architecture-review`. Brief reviewers to run checks through the package scripts.
11. **Skill text:** coordinate with its owner and with the checkpoint author.

Push only with the owner's OK, submodules before the root.

## 9. Decisions and open questions

| | Question | Answer |
|---|---|---|
| **Q1** | Where is the linter bound? | Decided (reviewer endorsed): §2 D3. |
| **Q2** | `relevant` edges | Replaced by the D6 model (§4.3.1, §4.3.2). Open: the one MIP-query-function question to formspec-specs:spec-expert. |
| **Q3** | Items outside every page | Closed: Component §11.4 and §4.5. `PAGED_ROOT_NON_GROUP` is dropped. |
| **Q4** | `UNMATCHED_THEME_SELECTOR` | Closed: dropped. |
| **Q5** | Changeset bump (owner) | `minor` with a "Breaking:" line, the same as the evaluator plan. |
| **Q6** | Lockfiles (owner) | At implementation time, run `npm install --package-lock-only` in `formspec/` and then in `formspec-studio/` (authorized for exactly this). Accept only if `git diff` shows the single core → app-graph edge in each file; otherwise stop and report. |
| **Q7** | Accept-all gating (owner) | Gated like per-group merges, against the gate-time baseline (§2 D5). |
| **A1** | ADR 0172 (proposed): upstream-Definitions context member and the Rust instance-projection check | Recorded in §2 D2 and §3. Implement only when 0172 is ratified; it does not change fs-6jt9 or fs-i29t. |
| | **Still open** | Severity and owner for the Experience findings, which fs-drn5 decides. Recommended: lint at error, with the spec name in the title. |

## 10. Observed, not changed

- `formspec-mcp/src/mcpb-entry.ts` is unused by the MCPB bundle (`mcpb:bundle` bundles `dist/index.js`) and never initialises WASM.
