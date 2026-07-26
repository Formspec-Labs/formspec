# Wireframe / Dynamic-UI Generator Spike v8

**Status:** complete — code-bearing translation of the real formspec-cloud SaaS mockup corpus through the production substrate
**Lives at:** [`formspec/spikes/wireframe-generator-v8/`](../../spikes/wireframe-generator-v8/) + this doc
**Continues:** [`2026-05-26-wireframe-generator-spike-v7.md`](./2026-05-26-wireframe-generator-spike-v7.md) (authoring-tool probe, 14 findings) + [`../../spikes/wireframe-generator-v7/`](../../spikes/wireframe-generator-v7/)
**Corpus:** [`formspec-cloud/thoughts/concepts/claude-design-handoff/project/`](../../../formspec-cloud/thoughts/concepts/claude-design-handoff/project/) — 37 files covering 30 of the product's 61 declared routes
**Substrate under test:** ADR 0153/0154 closed production substrate (`@formspec-org/app-graph`, `@formspec-org/mcp-wireframes`, `@formspec-org/studio-core`), as v7 exercised it

## Verdict

**All fourteen of v7's findings recur under real-SaaS demand, and sixteen more appear that an authoring tool never surfaced.** v7's conclusion — the substrate is closed for intake, not for authoring software — was too narrow. The substrate is closed for *the form*, and the product that sells the form is a different animal: sixty-one routes, seven personas, a persistent shell, a data plane, a proof vocabulary rendered six ways, and a trust claim that depends on some routes refusing tenant theming. Twelve translated exemplars produced **36 primary findings across 11 gap families**, 95 error diagnostics, and not one region that both needed a data source and got one.

The shape of the failure is uniform and diagnostic: every exemplar completed `artifact-resolution → schema → module-resolution → cross-artifact`, and every exemplar failed at content. The substrate accepted twelve app graphs whose combined payload is 15 routes and 66 slots — of which **49 (74%) are `module-widget` against modules the Registry cannot admit** — plus **53 workaround binding strings the validator cannot read** (38 distinct, every one an `x-spike-v8:` tag standing where a declared data source, channel, or sensitivity class should be). The product is expressible as boxes and inexpressible as meaning.

One region in twelve surfaces was a native fit: the onboarding wizard's organization step, which is a `definition-form`. It still failed validation — because no MCP verb mints the Definition it binds to (v7's F14, one missing verb, cheapest promotion in the catalog).

The ranking is the deliverable. **Slot taxonomy is 12 of 36 primary findings** and touches every exemplar; **the data-source gap is 2 findings but 53 workaround binding strings**; **the two missing MCP verbs are 2 findings but 94 of 97 auto-recorded diagnostics — 93 from the Registry-admission gap alone**. Frequency by finding count and frequency by blast radius disagree, and both are in the tracker below.

## Scope Boundary

In scope:

- All 37 corpus files classified into 14 pattern families ([`classification.json`](../../spikes/wireframe-generator-v8/classification.json)).
- Twelve exemplars translated through real Wireframes-MCP verbs and validated with real `produceAppGraphValidationReport()`: forms index, owner dashboard, form detail, form editor, onboarding wizard, signature ceremony, admin billing, dev webhooks, trust center, verifier, responses index, versions & diff.
- Per-exemplar App Manifest + Surface + UI Graph Policy artifacts, per-exemplar validation reports, one findings catalog with family ranking and an explicit v7 cross-reference.

Out of scope:

- The 25 corpus files outside the exemplar set (classified, not translated).
- Render. v7 shipped HTML intent sketches; v8 spent that budget on corpus breadth. The gap catalog is what gets promoted, not the pixels.
- Modifications to Wireframes-MCP, `@formspec-org/app-graph`, or any substrate package.
- Promotion of any `x-spike-v8:*` shape. The strings exist to make gaps visible in the saved artifacts; none is a contract candidate.

## Persona Posture

v7's persona wall, held. While authoring, the persona read the mockup corpus, the mockup route map, and the published MCP tool surface ([`formspec-studio/packages/formspec-mcp-wireframes/src/index.ts`](../../../formspec-studio/packages/formspec-mcp-wireframes/src/index.ts)) — and none of `formspec/specs/`, `formspec/schemas/`, or the ADR corpus. v7's harness and tracker doc were allowed as scaffolding.

The wall is what makes the findings usable: a wanted/got pair recorded by someone who *could have* looked up the right shape is a documentation gap, not a substrate gap. Every finding below is a shape the published verb surface did not offer to a competent reader of it.

## Corpus classification

All 37 files, 14 families. Full rows in [`classification.json`](../../spikes/wireframe-generator-v8/classification.json).

| Family | Files | Exemplar translated | What it stresses |
|---|---|---|---|
| collection-index | 7 | `forms-index v3`, `responses-index` | list, filter, bulk action, empty state, saved views |
| platform-surface | 5 | — | auth, status, email kit, placeholder, route map |
| content-compliance | 4 | `trust-center` | matrix, claim freshness, anonymous access |
| dashboard | 3 | `index.html` | stat tiles, charts, event feed, runtime status |
| entity-detail | 3 | `form-detail` | tab IA, typed route param, cross-bundle embed |
| developer-crud | 3 | `dev-webhooks` | operational actions, secrets, delivery history |
| editor-shell | 2 | `form-edit` | first-party module admission, tree, selection channel |
| settings-admin | 2 | `admin-billing` | read-only panels, external handoff, quota meters |
| interactive-tool | 2 | `verifier` | client-executed action, artifact input |
| proof-artifact | 2 | — | no-JS render, frozen theme authority |
| wizard | 1 | `onboarding` | step sequence, irreversibility, Definition minting |
| stateful-ceremony | 1 | `signature-ceremony` | signature capture, identity assurance, immutable chrome |
| diff-compare | 1 | `form-versions` | compare slot, artifact lineage |
| respondent-intake | 1 | — | the substrate's design center — no findings expected |

`respondent-intake` and `proof-artifact` are deliberately untranslated: the first is what the closed substrate was sized for, the second inherits the read-only-display and theme-authority gaps already recorded elsewhere.

## Per-Surface Tracker

Every exemplar completed the same four phases — `artifact-resolution`, `schema`, `module-resolution`, `cross-artifact`. `surface-local`, `authorization-boundary`, and `unsupported` are `not-run` (same producer behavior v7 observed). Reports: [`reports/*.validation.json`](../../spikes/wireframe-generator-v8/reports/).

| Exemplar | Family | Route | Routes | Slots | Errors | Distinct codes |
|---|---|---|---|---|---|---|
| forms-index | collection-index | `/o/:org/w/:ws/forms` | 1 | 5 | 7 | MODULE-* |
| owner-dashboard | dashboard | `/o/:org/w/:ws` | 1 | 8 | 11 | MODULE-* |
| form-detail | entity-detail | `/forms/:id` | 1 | 7 | 8 | MODULE-* |
| form-edit | editor-shell | `/forms/:id/edit` | 1 | 6 | 9 | MODULE-* |
| onboarding | wizard | `/onboarding` | 4 | 5 | 9 | MODULE-*, APP-GRAPH-SURFACE-DEFINITION-SLOT |
| signature-ceremony | stateful-ceremony | `/sign/:envelopeId` | 1 | 6 | 6 | MODULE-* |
| admin-billing | settings-admin | `/admin/billing` | 1 | 5 | 9 | MODULE-*, APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF |
| dev-webhooks | developer-crud | `/dev/webhooks` | 1 | 5 | 8 | MODULE-* |
| trust-center | content-compliance | `/trust` | 1 | 5 | 6 | MODULE-* |
| verifier | interactive-tool | `/verify` | 1 | 5 | 7 | MODULE-* |
| responses-index | collection-index | `/forms/:id/responses` | 1 | 4 | 7 | MODULE-* |
| form-versions | diff-compare | `/forms/:id/versions` | 1 | 5 | 8 | MODULE-* |
| **Total** | | | **15** | **66** | **95** | 4 distinct codes |

**Schema-phase caveat carries over from v7.** Both `schemaValidators` and `evidenceSchemaValidators` are `() => ({ ok: true })` — the `schema: completed` status means the pipeline reached the phase, not that Ajv validated the authored Surface documents or the UI Graph Policy host evidence that findings 5, 6, 23, 27, and 33 hang off. Cross-artifact and module-resolution carry the substantive weight. Wiring real Ajv needs schema-URL knowledge the persona wall forbids.

**Two diagnostics are the whole story.** `MODULE-UNRESOLVED` + `MODULE-CONTRIBUTION-MISSING` fire on all twelve exemplars because 49 of 66 slots are `module-widget` fallbacks — the substrate correctly refusing modules no Registry admits (finding 18). `APP-GRAPH-SURFACE-DEFINITION-SLOT` (onboarding) and `APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF` (admin-billing) are the two places the persona reached for a *native* primitive and still could not land it — findings 21 and 24, and the two most promotable rows in this catalog.

**Two slot bindings were refused before validation ran.** `bindSlot(embed-route)` rejected `surfaceUrl` and `routeId` (`VALIDATION — EmbedRouteSlot.binding contains unsupported properties`), and `bindSlot(definition-form)` rejected `version` (`unsupported property`). The first is finding 17 answered directly: the embed primitive will not take a cross-bundle target. The second says a `definition-form` slot cannot pin the Definition version it renders — the pinning guarantee the product's own versions surface advertises (finding 36) is not expressible at the slot that binds the form. Both refusals are recorded in [`reports/findings.json`](../../spikes/wireframe-generator-v8/reports/findings.json) (ids 136, 159).

**Harness disclosure.** A refused slot still appears in the Surface document served to the loader, because both the `bindSlot` calls and the loaded document derive from one `SlotSpec[]`. That is deliberate — it keeps the served document honest about what the persona intended — but it means the two refusals above are visible only in the findings record, not as validator diagnostics.

## MCP Verb Usage Tracker

| Verb | Usage | Adequacy |
|---|---|---|
| `wireframeFromBrief` | 12 (one per exemplar) | **Insufficient** — finding 1: one Surface per bundle against a 61-route product with a persistent authenticated shell. v7's F1 at twenty times the scale, plus an inheritance axis v7 did not need. |
| `addRoute` | 15 | **Insufficient** — findings 3, 4, 16, 20: path strings only. No typed parameters, no lifecycle state, no nesting, no ordering. |
| `bindSlot` | 66 | **Load-bearing failure** — findings 7-9, 12-14, 17, 22, 28, 31, 34, 35. Five slot types absorbed twelve surfaces; 49 bindings became `module-widget`, 14 became `static-content` headings that threw away their data, 1 became `experience-unit` standing in for a read-only panel, 1 became `embed-route` on guessed semantics. |
| `declareModule` | 44 (39 distinct modules) | Verb shape adequate, outcome useless — finding 18: no admission path, so every declaration produces two error diagnostics. Includes the *first-party* studio canvas. |
| `addExperienceUnit` | 1 | **Misuse-by-design** — finding 24 (v7 F4 exactly): used for a read-only billing panel with no actor and no task. Substrate emits the correct diagnostic against the wrong substrate. |
| `addDefinitionStub` | 1 | **Refused** — finding 21: `NOT_FOUND — Definition is not loaded in the single-runtime facade`. v7 inferred an id and hoped; v8 got the explicit refusal. |
| `declareUiGraphPolicy` | 12 | **Adequate frame, two knobs** — findings 5, 6, 23, 27, 33: twelve surfaces, twelve identical `{ landmark, keyboardNavigation }` declarations. No access posture, no theme authority, no step-up precondition, no sensitivity class, no table/multi-pane/no-JS a11y profile. |
| `produceAppGraphValidationReport` | 12 | **Adequate** — every diagnostic mapped to a persona-recorded gap; no false positives, no false negatives inside the phases that ran. |
| `declareComponent` / `bindComponentMembership` / `add/move/copyComponentNode` | 0 | Not exercised. Same judgment as v7: Component-tree authoring sits upstream of slot binding, and the graph-edit pipeline has its own coverage. Recorded as a coverage gap, not a substrate finding. |
| `setComponentLayout` | 0 | Not exercised (as above). |

## Substrate Gap Tracker

Eleven families. **Primary** counts distinct findings; **sites** counts where the gap actually bit (bindings, diagnostics, surfaces). The two columns disagree on purpose — finding count measures conceptual breadth, sites measure blast radius.

| Family | Primary | Sites | Findings | What the substrate would need |
|---|---|---|---|---|
| Slot taxonomy is intake-shaped | **12** | 49 module-widget bindings across 12 exemplars | 7, 8, 9, 12, 13, 14, 17, 22, 28, 31, 34, 35 | `collection`, `filter-bar`, `stat-strip`/`stat-tile`, `visualization`, `event-feed`, `tree`, `compare`, `matrix`, `signature-ceremony`, `artifact-input` — plus explicit `embed-route` semantics |
| State and status unauthorable | 5 | 12 exemplars | 4, 10, 15, 32, 36 | Slot `stateVariants` (empty/loading/error/unauthorized), route `lifecycle`, host-status predicates, user-scoped `viewState`, artifact lineage |
| App composition | 4 | 12 bundles for one app | 1, 3, 16, 20 | Multi-Surface bundle + inherited shell, typed route params, nested/tabbed routes, ordered step flows |
| Action vocabulary is completion-shaped | 4 | ~20 authored actions, none declarable | 11, 25, 26, 30 | Action targets beyond form submit: `runtime-command`, `artifact-download`, `external-handoff`, `client-executed`; subject selectors for bulk |
| Capability gating absent | 3 | 4 surfaces need step-up or sensitivity | 5, 23, 27 | Route access posture, identity-assurance precondition, field/binding `sensitivity` class |
| MCP verb surface | 2 | **94 of 97 diagnostics** (93 from finding 18) | 18, 21 | Registry admission (`declareRegistry`) and `declareDefinition` |
| Data source | 2 | **53 workaround binding strings, 38 distinct** | 2, 29 | An MCP verb that authors the ratified Data Sources artifact, a `workspace:` scope value, and a `sensitivity` class — see §Post-wall corrections |
| Read-only display | 1 | 1 experience-unit misuse + every read-mostly panel | 24 | `data-view` slot: data source + layout intent, no Experience, no Definition |
| Theming authority | 1 | 5 proof-class routes | 6 | `themeAuthority: tenant \| platform \| frozen` on RoutePolicy |
| a11y profile shape | 1 | 12 identical declarations | 33 | `data-table`, `multi-pane`, `command-surface`, `no-script` profiles |
| Cross-slot contract | 1 | 6 master-detail surfaces | 19 | Named `publishes` / `consumes` channels validated at graph time |

**Counting rule, and where it is inconsistent.** Diagnostics with one root cause collapse to one primary finding plus auto-records (93 `MODULE-*` diagnostics → finding 18). Findings recorded by the persona do not collapse: 9, 12, and 28 are the same missing primitive — a data-bound, non-prose `static-content` kind — met on three surfaces in three shapes (stat strip, stat tile with delta, capability matrix), and they hold three ids. That inflates slot-taxonomy's headline relative to the diagnostic families. The v7 cross-reference below shows it plainly: all three trace to F13. Read the family ranking as *breadth of demand*, not as a count of distinct primitives.

## Findings

36 primary findings, grouped by family. Each cites the exemplar and the verb; full wanted/got/why/suggestion text at [`reports/findings.json`](../../spikes/wireframe-generator-v8/reports/findings.json). `→ Fn` marks the v7 finding this confirms.

### Slot taxonomy (12)

- **7 · no `list` / collection slot** — forms-index · `bindSlot` · → F8. The paying persona's home screen becomes one opaque widget.
- **8 · no `filter-bar` slot** — forms-index · `bindSlot` · → F7. Six of eleven index surfaces carry one; the filter↔list relationship is unvalidatable.
- **9 · no `stat-strip` static-content kind** — forms-index · `bindSlot(static-content)` · → F13. Ten of twelve exemplars open with a data-bound header the substrate can only render as a heading.
- **12 · no `stat-tile` with delta + threshold** — owner-dashboard · `bindSlot(static-content)` · → F13. The dashboard's entire payload is four numbers with deltas.
- **13 · no visualization slot** — owner-dashboard · `bindSlot` · new. Proof-state distribution is drawn by a widget, so the four-state taxonomy the product sells is not enforced across the six surfaces that render it.
- **14 · no `event-feed` slot** — owner-dashboard · `bindSlot` · new. Three surfaces render the same event stream from three private definitions of "event".
- **17 · `embed-route` semantics undefined across bundles** — form-detail · `bindSlot(embed-route)` · new. The core loop is "author a form, see what the respondent sees"; whether the substrate's own embed primitive crosses that boundary is unstated.
- **22 · no signature-capture slot** — signature-ceremony · `bindSlot` · new. Signature is a first-class product noun with its own envelope model, certificate surface, and webhook events, and no slot type.
- **28 · no matrix / comparison-table kind** — trust-center · `bindSlot(static-content)` · → F13. The most-requested procurement artifact in the product is opaque to the substrate meant to make claims auditable.
- **31 · no `artifact-input` outside a Definition** — verifier · `bindSlot` · new. Ephemeral input (verifier, selective proof, imports, API try-it) must currently pretend to be a respondent form.
- **34 · no `tree` slot** — form-edit · `bindSlot` · → F2. The spec outline renders the substrate's own Definition and the substrate has no hierarchy primitive for it.
- **35 · no `compare` / diff slot** — form-versions · `bindSlot` · → F11. The strongest form: both sides of the diff are Formspec documents.

### State and status (5)

- **4 · no route lifecycle state** — cross-cutting · `addRoute` · new. Nine preview and three disabled routes ship with a visibility commitment enforced only by review.
- **10 · no slot state variants** — forms-index · `bindSlot` · new. The mockup ships a designed empty state; loading, partial, and error have nowhere to live.
- **15 · no runtime status region** — owner-dashboard · `bindSlot` · new. The degraded-anchoring banner is load-bearing trust copy that renders conditionally on host state the graph cannot reference.
- **32 · no user-scoped view state** — responses-index · `bindSlot` · new. Column sets on a response table decide what a CSV export contains: an evidence-scope decision wearing a UI-preference costume.
- **36 · no artifact lineage primitive** — form-versions · `bindSlot` · new. Version pinning is what makes a receipt mean something in five years; it appears on four surfaces as prose.

### App composition (4)

- **1 · one Surface per bundle** — cross-cutting · `wireframeFromBrief` · → F1. Twelve exemplars became twelve bundles; the shell the product promises on "every authenticated route" must be re-declared or dropped.
- **3 · route parameters are untyped** — cross-cutting · `addRoute` · new. Thirty-one of sixty-one routes are parameterized entity routes; the parameter is the subject of the page and the graph cannot see it.
- **16 · no tab / sub-route IA** — form-detail · `addRoute` · → F1. Six views of one subject either re-declare shared chrome six times or hide the tabs in module state.
- **20 · no step-sequence contract** — onboarding · `addRoute` · new. Ordering, gating, progress, resumption, and irreversibility are all module state on the "first hour is the product" surface.

### Action vocabulary (4)

- **11 · no multi-subject (bulk) action** — forms-index · Response Actions · new. The highest-blast-radius actions in the product are the ones an audit trail cannot see.
- **25 · no external-handoff or artifact-download target** — admin-billing · Response Actions · → F12. Actions that leave the product or mutate tenancy are exactly the ones needing an audit record.
- **26 · no operational-action family** — dev-webhooks · Response Actions · → F9. Register, pause, rotate, test, replay — the recovery verbs are unmodellable.
- **30 · no client-executed action** — verifier · Response Actions · → F12, reshaped. The verifier's defining property is that it does not call the host, and that property is inexpressible.

### Capability gating (3)

- **5 · no route access posture** — cross-cutting · `declareUiGraphPolicy` · → F10. Anonymous reachability of the verifier is the positioning bet; step-up on destructive admin actions is the governance claim; neither is on the artifact that describes routes.
- **23 · no identity-assurance precondition** — signature-ceremony · `declareUiGraphPolicy` · → F10. Four surfaces need step-up; one missing predicate.
- **27 · no sensitivity annotation** — dev-webhooks · `bindSlot` · new. A signing secret whose sensitivity is invisible to the graph leaks into whatever consumes the graph next — renderer, analytics, or AI context projection.

### MCP verb surface (2 findings, 95 diagnostics)

- **18 · no Registry admission path** — form-edit · `declareModule` · new. The product's own designer cannot be composed into the product's own app graph through the product's own authoring MCP. **Split post-spike: admission path landed, entry content did not — see §Follow-up.**
- **21 · no `declareDefinition`** — onboarding · `addDefinitionStub` · → F14. The one native design fit in the corpus fails on one missing verb. **Cheapest promotion in this catalog.**

### Data source (2 findings, 46 sites)

- **2 · no data-source verb at all** — cross-cutting · MCP verb surface · → F3, deepened. v7 asked for a `workspace:` scope family; the persona found nowhere on the MCP to write a scope string at all. 53 workaround binding strings, 38 distinct, zero validatable. **Partly corrected post-wall — see §Post-wall corrections.**
- **29 · no freshness contract on compliance facts** — trust-center · `bindSlot` · → F3. A SOC 2 date typed into a heading is a date nobody re-checks, on the surface where staleness is a procurement disqualifier.

### Single-finding families (4)

- **24 · no read-only data-view primitive** — admin-billing · `bindSlot` · → F4. Read-mostly panels dominate the admin, trust, detail, and receipt surfaces; every one currently claims to be an Experience unit, corrupting Experience for the flows that mean it.
- **6 · no theme authority** — cross-cutting · `declareUiGraphPolicy` · new. Tenants may theme form chrome and must not theme receipt, certificate, verifier, or ceremony. The rule is structural and the graph cannot state it.
- **33 · a11y profiles under-cover the corpus** — cross-cutting · `declareUiGraphPolicy` · → F6. Twelve surfaces, one a11y shape, against a 4 218-row table, six-tab navigation, focus-trapped drawers, a command palette, and a receipt that must render with JS off.
- **19 · no cross-slot selection channel** — form-edit · `bindSlot` · → F5. The relationship the user perceives as central (canvas selects, inspector edits) is the one the graph cannot see.

## Cross-check against v7's 14 findings

**All 14 confirmed.** No v7 finding failed to recur once the customer was a real SaaS product.

| v7 finding | v8 status | Where it recurred |
|---|---|---|
| F1 multi-Surface app primitive | **confirmed, amplified** | 1, 16 — 61 routes and a persistent shell, plus a tab-IA axis v7 did not need |
| F2 no `tree` slot | **confirmed** | 34 — spec outline over the product's own Definition |
| F3 Data Source scope set | **confirmed, deepened** | 2, 29 — the prior gap is that no verb writes a scope at all |
| F4 no read-only display primitive | **confirmed, same diagnostic** | 24 — `APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF` fired again |
| F5 cross-slot selection | **confirmed** | 19 — canvas → inspector; 6 master-detail surfaces in the corpus |
| F6 authoring-shaped a11y profiles | **confirmed, widened** | 33 — the corpus wants table, multi-pane, command, and no-JS profiles |
| F7 no `filter-bar` | **confirmed** | 8 — six index surfaces |
| F8 no `list` | **confirmed** | 7 — the paying persona's home screen |
| F9 reviewer-action vocabulary | **confirmed, generalized** | 26 — operational actions (rotate, replay, test) are the same shape |
| F10 capability gating | **confirmed, split** | 5, 23, 27 — access posture, identity assurance, and sensitivity are three distinct hooks |
| F11 no `diff` / `split-tree` | **confirmed** | 35 — version diff over Formspec documents |
| F12 non-form action verb | **confirmed, extended** | 25, 30 — plus external handoff, artifact download, and *client-executed* |
| F13 no `metadata-strip` kind | **confirmed, three times** | 9, 12, 28 — stat strip, stat tile, capability matrix |
| F14 no `createDefinition` verb | **confirmed, harder** | 21 — v7 inferred an id; v8 got `NOT_FOUND` and a validator error |

**Sixteen findings new in v8** — 3, 4, 6, 10, 11, 13, 14, 15, 17, 18, 20, 22, 27, 31, 32, 36. They cluster in three places an authoring tool never reaches: **product composition** (typed route params, lifecycle badges, step flows, theme authority, Registry admission), **runtime state** (empty/loading/error variants, host status, user-scoped view state, artifact lineage), and **product nouns** (signature capture, event feed, visualization, ephemeral artifact input).

The pattern: v7 found the substrate could not describe *how an authoring tool is laid out*. v8 finds it also cannot describe *what a product knows, who may see it, when it changes, or which parts are not the tenant's to change*.

## What this means

- **The promotion order changes.** v7 ranked slot taxonomy first, and slot taxonomy is still the largest family (12 of 36). But two findings with the smallest counts have the largest blast radius: Registry admission (18) causes 93 of 97 diagnostics, and the missing data-source verb (2) leaves 53 binding strings unreadable. **Land 18 and 21 first — they are single verbs and they unblock the two places the persona reached for native primitives.** Then 2, which post-wall turns out to be a facade wrapper over an already-ratified artifact rather than a new contract — cheaper than this catalog first assumed. Then the slot taxonomy in demand order (`collection`, `stat-strip`, `filter-bar`, `data-view`, `compare`, `tree`).
- **Read-only display (24) is the highest-leverage single slot type.** It closes v7 F4, stops `experience-unit` from being corrupted, and serves the admin, trust, detail, receipt, and certificate families at once.
- **Three findings are trust-claim-bearing, not ergonomics.** Theme authority (6) protects the visual immutability of proof surfaces; sensitivity annotation (27) keeps secrets out of whatever consumes the graph, including the co-pilot; client-executed actions (30) are the verifier's independence claim. These are cheap hooks with disproportionate downside if deferred — the product ships a white-label story and an AI co-pilot, and both are exactly the pressures that break these rules quietly.
- **Capability gating stays partly blocked.** Findings 5, 23, 27 split v7's F10 into three hooks. The predicate *slots* can land before the authorization semantics exist; the semantics remain the fine-grained-authorization question v7 left held.
- **The graph-edit verbs are unexercised, twice.** v7 and v8 both judged Component-tree authoring upstream of slot binding. Two spikes with zero coverage is a coverage claim nobody has tested — worth a targeted probe rather than a third incidental skip.

The substrate is closed for the form. **v7 said it is not closed for authoring software; v8 says it is not closed for the product that sells the form** — which is the same substrate, one layer out, and the layer the company's revenue sits on.

## Post-wall corrections

The persona wall makes findings valid as *authoring-experience* evidence, and it also guarantees some of them misjudge how much substrate already exists. Reviewed against the specs after authoring closed:

- **Finding 2 is a facade gap, not a contract gap.** [`formspec/schemas/data-sources.schema.json`](../../schemas/data-sources.schema.json) already ratifies a `DataSource` shape with `kind`, `owner`, `scope`, `availability` (down to `level: "slot"` with `surfaceRef`/`routeRef`/`slotId`), `runtime` (delivery, cache, failure mode, provenance), and an optional payload `schema`; App Manifest carries `dataSources[]` siblings; ADR 0153 lists Data Sources as **Closed**. What is missing is (a) any verb on Wireframes-MCP that authors it — zero occurrences of `dataSource` in the MCP or studio-core source — and (b) validator/loader wiring, already tracked as `fs-r2od` (availability cross-artifact checks) and `fs-9d5e` (runtime loader). **This strengthens the promotion argument rather than weakening it:** the verb is a wrapper over a closed artifact, not a new contract.
- **Two thirds of finding 2's ask is already modeled; one third is not.** `runtime.cache.staleAfter` covers most of finding 29's freshness ask. `scope` is `session | route | definition | resource` — no workspace-shaped value, so v7's F3 scope-family point stands unchanged. There is **no sensitivity/classification field anywhere on `DataSource`**, so finding 27's ask is genuinely net-new surface.
- **Everything else held.** The five-member slot-type union and the four-member `static-content` kind enum are as the persona found them, so findings 7-9, 12-14, 17, 22, 28, 31, 34, and 35 name real absences. The published MCP has no Registry-admission verb and no `declareDefinition`, confirming 18 and 21 exactly.

Nothing in this section was fed back into the persona record: [`reports/findings.json`](../../spikes/wireframe-generator-v8/reports/findings.json) stays as authored, because a corrected record would no longer evidence what the published interface communicates to a competent reader of it. The corrections belong here, in the promotion argument.

## Follow-up

**Finding 18 splits in two. The admission gap is closed; an entry-content gap is open, and it owns the 93 diagnostics.**

Wireframes-MCP now has `declareRegistry` and `declareDefinition`, so finding 21 closes outright and finding 18's *path* closes: a bundle can declare a Registry sibling, `declareModule` against it, and the module resolves `admitted` with its widget contribution `resolved`. Proven end to end at [`formspec-studio/packages/formspec-mcp-wireframes/tests/registry-admission-journey.test.ts`](../../../formspec-studio/packages/formspec-mcp-wireframes/tests/registry-admission-journey.test.ts), which drives this spike's harness path and pairs each verb against a control run without it.

**What that does not do is clear this spike's 93 `MODULE-*` diagnostics.** Admission is per module and needs a matching `category: "module"` Registry entry naming its contributions. §MCP Verb Usage Tracker records **44 `declareModule` calls, 39 distinct modules** across twelve exemplars, and no verb authors an entry for any of them. The proof test's Registry document is hand-authored and served by the host loader; re-running the spike corpus against the new verbs would move 93 diagnostics only if someone first wrote 39 module entries plus a widget entry per contribution, by hand, outside the MCP. **Recorded here rather than absorbed into the closure claim: the residual is a distinct finding, not a rounding error on finding 18.**

**37 · no Registry entry-content verb** — cross-cutting · MCP verb surface · new (post-spike). A `declareRegistryEntry`-shaped verb would have to author, per [`schemas/registry.schema.json`](../../schemas/registry.schema.json) `$defs.RegistryEntry`:

- **Every entry:** `name` (`^x-…` globally unique), `category`, `version` (exact semver), `status`, `description`, `compatibility.formspecVersion`. Six required fields with no defaults — the widest required set of any authoring verb in the MCP.
- **A `module` entry:** `contributes[]`, listing the entry `name` of each contribution. This is the edge module resolution walks.
- **A `widget` contribution:** `widgetShape`, whose `widgetName` is the *only* mapping from a Surface `module-widget` binding to the entry — a binding names `{moduleId, widgetName}` and `widgetName` matches nothing else in the document. Plus `props` (JSON Schema for `binding.config` / Theme `widgetConfig`), and optionally `childrenPolicy`, `fallback`, `tokenSlots[]`.

**The design fork the verb has to settle, and the reason this is not a trivial wrapper:** the other declaration verbs push a `SiblingRef` onto the manifest and stop, because the referenced document is authored upstream and served by the host. Entry content has no such upstream when the MCP is the author — so either the MCP mints a bundle-local Registry document it also owns (new artifact ownership, new write surface, publication and versioning questions), or entry authoring stays a host/publisher concern and the MCP's job ends at `declareRegistry`. **Settle that before writing the verb.** Every other v8 promotion candidate is a facade wrapper over a closed contract; this one is not.

**One upstream schema gap surfaced while proving the path.** `widgetShape.widgetName` is load-bearing in [`packages/formspec-app-graph/src/module-resolver.ts`](../../packages/formspec-app-graph/src/module-resolver.ts) (`widgetContributionNameFor`) and normative in [`specs/app-graph/module-resolver-spec.md`](../../specs/app-graph/module-resolver-spec.md) §Contribution use sites, but `registry.schema.json` declared only `props`, `childrenPolicy`, `fallback`, `tokenSlots` — an external implementer authoring a Registry from the published schema could not learn that the field exists, let alone that admission depends on it. Now declared. This is the same class of gap as finding 18 one layer down: the contract was closed in prose and open in the schema.

## Verification

From `formspec/spikes/wireframe-generator-v8/` on 2026-07-26:

```sh
npm install
npm run spike        # vitest run — 12 exemplar translations + rollup, 13 tests, all pass
npm run typecheck    # tsc --noEmit — clean
```

| Output | Count |
|---|---|
| Corpus files classified | 37 (14 families) |
| Exemplars translated + validated | 12 |
| Routes authored | 15 |
| Slots bound | 66 (49 `module-widget`, 14 `static-content`, 1 `experience-unit`, 1 `definition-form`, 1 `embed-route`) — `rollup.json:totals.slotTypes` |
| Workaround binding strings | 53 sites, 38 distinct, 0 validatable — `rollup.json:totals.spikeBindingSites`, counted by `countSpikeBindings()` (every `x-spike-v8:` string inside an authored slot binding) |
| Bind-time refusals | 2 (`embed-route` rejected `surfaceUrl`+`routeId`; `definition-form` rejected `version`) |
| Error diagnostics | 95 (4 distinct codes) |
| Primary findings | 36 across 11 gap families |
| Diagnostic auto-records | 97 |
| v7 findings confirmed | 14 of 14 |

Artifacts: [`artifacts/*.json`](../../spikes/wireframe-generator-v8/artifacts/) (App Manifest + Surface + UI Graph Policy + slot→mockup-region map per exemplar). Reports: [`reports/*.validation.json`](../../spikes/wireframe-generator-v8/reports/), [`reports/findings.json`](../../spikes/wireframe-generator-v8/reports/findings.json), [`reports/rollup.json`](../../spikes/wireframe-generator-v8/reports/rollup.json).
