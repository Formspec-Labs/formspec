# Wireframe / Dynamic-UI Generator Spike v7

**Status:** complete — code-bearing chaos-test phase-1 probe of authoring-tool UI fit
**Lives at:** [`formspec/spikes/wireframe-generator-v7/`](../../spikes/wireframe-generator-v7/) + this doc
**Continues:** [`2026-05-26-wireframe-generator-spike-v6.md`](./2026-05-26-wireframe-generator-spike-v6.md) (doc-only revalidation); last code-bearing spike was [`2026-05-24-wireframe-generator-spike-v4.md`](./2026-05-24-wireframe-generator-spike-v4.md) + [`../../spikes/wireframe-generator-v4/`](../../spikes/wireframe-generator-v4/)
**Authority:** stack-root [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) (ADR 0153/0154 substrate Closed 2026-05-26)

## Verdict

The closed Formspec production substrate accepts an authoring-tool app *structurally* — every surface schema-validates, module-resolves, and reaches `cross-artifact` validation completion — but the slot taxonomy, Component shape, Response Actions vocabulary, and Data Source scope set were sized for respondent-facing intake, not for the file-tree / filtered-list / diff-viewer pattern set authoring tools live in. The substrate did not refuse Policy Studio's UI; it accepted it as a graph the persona could only express by overloading `module-widget` against unadmitted modules and `experience-unit` against absent Experience documents. Every surface produced 4–6 error diagnostics the persona could trace back to a missing primitive, not a fixable shape.

v7 is a **chaos-test phase-1 probe**: a persona-shaped subagent read only Policy Studio's specs + the Wireframes-MCP tool surface and was blocked from reading Formspec internals. It authored three surfaces (Source Vault Browser, Lint Findings, Scenario Result Viewer), recorded every place a verb refused or a primitive forced a workaround, and produced a findings catalog the substrate doesn't yet close. The substrate is closed for intake. It is not closed for authoring software.

The full 4-phase chaos-test pipeline remains owner-gated per stack-root rollup §"Owner action items" — v7 ran phase 1 only against one input.

## Scope Boundary

v7 dogfoods the now-Closed ADR 0153/0154 production substrate (`@formspec-org/app-graph`, `@formspec-org/mcp-wireframes`, `@formspec-org/studio-core`) by driving Wireframes-MCP from a persona subagent reading only Policy Studio's existing specs as a customer brief.

In scope:

- Three Policy Studio surfaces: Source Vault Browser, Lint Findings, Scenario Result Viewer — chosen because they cover the substrate's hard cases (tree, list, diff).
- Real Wireframes-MCP verbs (`wireframeFromBrief`, `addRoute`, `bindSlot`, `declareComponent`, `bindComponentMembership`, `add/move/copyComponentNode`, `declareUiGraphPolicy`, `produceAppGraphValidationReport`, `addExperienceUnit`, `addDefinitionStub`, `declareModule`).
- Real `produceAppGraphValidationReport()` invocation per surface; real diagnostics; real artifact resolution.
- HTML sketch render of authoring intent (`snapshots/<surface>.html`).

Out of scope:

- Full Policy Studio (only three surfaces of ~10 modules in [`policy-studio/STUDIO-FEATURE-MATRIX.md`](../../../policy-studio/STUDIO-FEATURE-MATRIX.md)).
- ADR 0152 fine-grained authorization (substrate still Held; auth-shaped findings recorded but not exercised against policy).
- Production-renderer `<formspec-render>` end-to-end render (the persona's authoring deliberately surfaces Registry / module-admission gaps that block real render — that block IS the finding; intent-sketch render makes the gap visually obvious without conflating "intent capture" with "production render path").
- Modifications to Wireframes-MCP, `@formspec-org/app-graph`, or any substrate package.
- Promotion of any `x-spike-v7-*` shape (one example: the persona used `x-spike-v7:workspace:*` as a Data Source scope string to make the gap explicit; this is **not** a contract candidate).

## Persona Posture (chaos-test phase-1 inputs)

The persona-shaped subagent (general-purpose, dispatched once) had:

| Allowed (input) | Allowed (scaffolding import) | Forbidden |
|---|---|---|
| `formspec/spikes/wireframe-generator-v7/persona/PRD.md` (customer brief) | `formspec/spikes/wireframe-generator-v7/src/findings.ts` (findings collector — written as harness, imported by journey test) | All of `formspec/specs/` |
| `policy-studio/VISION.md`, `CONCEPT-MODEL.md`, `STUDIO-FEATURE-MATRIX.md` (customer's internal docs) | | All of `formspec/schemas/` |
| `formspec-studio/packages/formspec-mcp-wireframes/src/index.ts` (the MCP tool surface) | | All of `formspec/packages/` except via npm dependency |
| `formspec-studio/packages/formspec-mcp-wireframes/tests/graph-edit-journey.test.ts` (one test pattern reference) | | All ADR / thoughts / prior spike docs |

The "what the substrate makes hard" finding catalog is therefore from a posture the persona could legitimately occupy: a Policy Studio PM reading their own product spec + a third-party authoring tool's published interface, with no insider Formspec context.

## Per-Surface Tracker

| Surface | Routes | Slots authored | Validation phases | Error diagnostics |
|---|---|---|---|---|
| Source Vault Browser | 1 (`/sources`) | 3 (tree, detail, drawer) | 4 of 7 completed | 4 errors |
| Lint Findings | 1 (`/findings`) | 3 (filter-bar, list, drawer) | 4 of 7 completed | 5 errors |
| Scenario Result Viewer | 1 (`/scenarios/:scenarioId`) | 4 (metadata, expected, actual, action) | 4 of 7 completed | 6 errors |

`surface-local` and `authorization-boundary` phases are `not-run` per producer behavior when cross-artifact validation surfaces blocking errors before those phases gate; `unsupported` is `not-run` (no unsupported fields). All three surfaces completed `artifact-resolution → schema → module-resolution → cross-artifact` — the substrate accepted the shape, the diagnostics flagged the content gaps. Per-surface gap-family mapping lives in the §"Substrate Gap Tracker" rows below.

**Schema-phase caveat.** Schema-phase validation is no-op-stubbed (`schemaValidators: () => ({ ok: true })`) matching the established pattern in `graph-edit-journey.test.ts`. The `schema: completed` status reflects the producer pipeline reaching the phase, not Ajv-validating the authored Surface documents against published schemas. Cross-artifact and module-resolution phases carry the substantive validation weight in this spike. Wiring real Ajv against the substrate's published schemas would require persona-side schema URL knowledge that the posture forbids — promoting the spike to a non-stubbed schema-pass is a separate slice.

Full per-surface reports: [`reports/source-vault.validation.json`](../../spikes/wireframe-generator-v7/reports/source-vault.validation.json), [`reports/lint-findings.validation.json`](../../spikes/wireframe-generator-v7/reports/lint-findings.validation.json), [`reports/scenario-viewer.validation.json`](../../spikes/wireframe-generator-v7/reports/scenario-viewer.validation.json).

Intent sketches: [`snapshots/index.html`](../../spikes/wireframe-generator-v7/snapshots/index.html).

## MCP Verb Usage Tracker

The persona exercised every Wireframes-MCP verb relevant to journey-shaped authoring; gaps below name verbs that would close findings, not verbs the persona refused to try.

| Verb | Usage | Adequacy |
|---|---|---|
| `wireframeFromBrief` | Once per surface (3 separate bundles) | **Insufficient** — finding 1: no multi-Surface app primitive (Policy Studio is one app with sibling surfaces; the verb assumes one Surface per bundle) |
| `addRoute` | Per surface | Adequate for the 1-route case; multi-route nav metadata absent (finding 1 carries this) |
| `bindSlot` | 10 calls across surfaces | **Heavy strain** — findings 2/4/7/8/11/13: no `tree`, `list`, `filter-bar`, `diff`, or `metadata-strip` slot types; persona overloaded `module-widget` against unadmitted modules and `experience-unit` against missing Experience documents |
| `declareModule` | 3 modules (all `x-policy-studio-*`) | Adequate verb shape; substrate-gap is that Registry has no admission path for product-MCP-authored modules (finding 2's downstream) |
| `declareComponent` / `bindComponentMembership` / `addComponentNode` | Not used in journey | Persona judged Component-tree authoring was upstream of bindSlot; the spec did not stress the graph-edit pipeline (which `graph-edit-journey.test.ts` already covers) |
| `addExperienceUnit` | 5 calls | **Misuse-by-design** — finding 4: persona used `experience-unit` for read-only display because no other primitive accepts data-shaped, action-light slots; substrate emits APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF (correct diagnostic, wrong substrate) |
| `addDefinitionStub` | 1 (waiver-rationale) | **Insufficient** — finding 14: no `createDefinition` / `addDefinition` verb mints a fresh Definition document inline; persona fell back to stub on an inferred id |
| `declareUiGraphPolicy` | Per surface | **Adequate frame, insufficient profile set** — findings 6/10: a11y profiles are respondent-shaped (landmark/keyboard/responsive collapse), no authoring-shaped profiles (tree-node ARIA, multi-pane focus order, capability-gating predicate) |
| `produceAppGraphValidationReport` | Per surface | Adequate — surfaced every diagnostic that mapped to a persona-recorded gap; no false negatives observed within the cross-artifact phase |

## Substrate Gap Tracker

Five gap families, ordered by frequency the persona hit them.

| Family | Surfaces affected | Findings | What the substrate would need |
|---|---|---|---|
| Slot taxonomy is intake-shaped | All 3 | 2, 7, 8, 11, 13 | Slot types for `tree`, `list`, `filter-bar`, `diff`, `split-tree`, `metadata-strip` — or a `view-spec` slot family the substrate validates against a typed view schema |
| Read-only data display has no first-class shape | All 3 | 4 | A Component / slot shape that accepts a Data Source + a layout intent and emits inert DOM without a backing Experience unit or Definition |
| Data Source scope set is respondent-shaped | All 3 | 3 | `workspace:` family (`workspace:sources`, `workspace:lint-findings`, `workspace:scenarios`) alongside the existing `host:` / `response:` / `resource:` / `conversation:` / `query:` families |
| No reviewer-action vocabulary | Lint, Scenario | 9, 12 | Response Action kinds for non-form authoring actions (`waive`, `acknowledge`, `re-run`, `request-review`); current submit/save-draft shape doesn't fit |
| No capability-gating in UI Graph Policy | Lint | 10 | Authority-grant predicate evaluable at policy time (`visibleWhen: { actorHasGrant: "waive:S6" }`); without it, action visibility lives in renderer convention, not graph contract |

Cross-cutting frame gaps (lower frequency):

| Family | Surfaces affected | Findings | Note |
|---|---|---|---|
| Multi-Surface app primitive | Cross-cutting | 1 | `wireframeFromBrief` assumes one Surface per bundle; Policy Studio's IA wants sibling surfaces sharing identity + auth + Locale |
| Cross-slot selection contract | Source Vault | 5 | "Slot B receives selection from slot A" has no substrate expression; lives in renderer convention |
| Authoring-shaped a11y profiles | All 3 | 6 | Gate 9b closed respondent a11y profiles (route landmark, keyboard, responsive collapse, region+landmarkLabel); tree-ARIA / multi-pane focus / authoring-keyboard-shortcuts are a separate slice |
| `createDefinition` MCP verb | Lint | 14 | The waiver rationale needs a fresh Definition; the kernel's `addDefinitionStub` extends an existing one |

## Findings

Numbered. Each cites surface + verb + the persona's wanted/got shape; promotion suggestion at the bottom of each. Full programmatic record at [`reports/findings.json`](../../spikes/wireframe-generator-v7/reports/findings.json).

### F1 — `wireframeFromBrief` assumes one Surface per bundle

**Surface:** cross-cutting · **Verb:** `wireframeFromBrief` · **Severity:** reshape-needed

The persona wanted three sibling surfaces under one Policy Studio app — each a top-level IA tab sharing identity, auth, Locale. The verb creates one bundle with one Surface. Workaround: three separate bundles, no shared identity / Locale / Theme / Posture. Matters because authoring tools have sibling IA, not single-flow.

**Suggestion:** either a `declareSurface` companion that adds a sibling Surface to the existing bundle, or restate `wireframeFromBrief` to accept `surfaces: [...]` and treat the first as entry.

### F2 — No `tree` slot type

**Surface:** source-vault · **Verb:** `bindSlot` · **Severity:** missing-feature

Source tree (file-tree-style hierarchical navigation with expand/collapse + selection + node-shaped data binding) has no slot expression. Persona used `module-widget` against `x-policy-studio-source-tree` (unadmitted). AppGraphValidator correctly fires `MODULE-UNRESOLVED` + `MODULE-CONTRIBUTION-MISSING`. Matters: every authoring tool with file/document/policy-object hierarchy hits this.

**Suggestion:** `tree` as a fourth read-only-display slot type alongside (proposed) `list` and `diff`; binds to a Data Source returning a node-shape with `id`, `parentId`, `label`, `kind`, `children`.

### F3 — No `workspace:` Data Source scope

**Surface:** source-vault (also affects all other authoring surfaces) · **Verb:** `bindSlot` · **Severity:** reshape-needed

The persona needed `workspace:sources`, `workspace:lint-findings`, `workspace:scenarios` — workspace-state collections that aren't a respondent's response, not a host record, not a query, not a conversation. The existing five families (`host:` / `response:` / `resource:` / `conversation:` / `query:`) all assume respondent context. Persona used the explicit non-standard `x-spike-v7:workspace:` string to make the gap visible.

**Suggestion:** add `workspace:` family with a Data Source contract that names the workspace artifact kind, the selection contract, and access boundary. The existing Data Sources spec extension point (`F7` in v4 promotion tracker) is the natural home.

### F4 — No read-only data view primitive

**Surface:** source-vault (also affects Lint / Scenario) · **Verb:** `addExperienceUnit` · **Severity:** missing-feature

`experience-unit` was designed for the respondent's *work* (data-entry, review, signature) — units have actors and tasks. Read-only display (the source-detail pane, the lint-finding detail drawer, the scenario explanation panel) has no substrate-recognized shape. Persona used `experience-unit` and dropped `actorRef` / `taskRefs`; AppGraphValidator fires `APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF` because no Experience document backs the ref. Correct diagnostic, wrong substrate.

**Suggestion:** a `view` (or `display-pane`) slot kind that takes a Data Source + a layout intent (`detail` | `card` | `metadata` | `prose`) and emits inert DOM, with no Experience or Definition backing required.

### F5 — No cross-slot selection contract

**Surface:** source-vault · **Verb:** `bindSlot` · **Severity:** missing-feature

"Slot B and slot C receive the selected node from slot A" is a foundational authoring pattern (master-detail, list-drawer, tree-pane). Substrate has no expression — selection lives in renderer convention. Matters: every multi-pane authoring UI uses this.

**Suggestion:** a `selectionBinding` field on slot definitions naming the source slot + the local field consumed; AppGraphValidator can validate the cross-slot reference at graph time.

### F6 — UI Graph Policy a11y profiles are respondent-shaped

**Surface:** source-vault (also affects Lint / Scenario) · **Verb:** `declareUiGraphPolicy` · **Severity:** reshape-needed

Gate 9b closed three respondent-shaped a11y profiles (route landmark, keyboard navigation flag, responsive collapse, region+landmarkLabel + host landmark suppression). Authoring UIs need: tree-node ARIA (`role=treeitem`, `aria-expanded`, `aria-level`), multi-pane focus order across detail/drawer/main, authoring keyboard shortcuts (`?` for help, `j/k` for list nav, `/` for search). Substrate carries none.

**Suggestion:** an authoring-tool a11y profile slice alongside 9b's respondent profiles. Not a 9b reopener — a new slice.

### F7 — No `filter-bar` slot type

**Surface:** lint-findings · **Verb:** `bindSlot` · **Severity:** missing-feature

Declarative facets with chip state, bound to a Data Source whose schema enumerates the filterable dimensions. Substrate has nothing. Persona used `module-widget`.

**Suggestion:** `filter-bar` slot kind; binds to a Data Source + names the facet fields; emits filtered Data Source view to a downstream `list` slot via the F5 selection contract.

### F8 — No `list` slot type

**Surface:** lint-findings (also affects Source Vault drawer, Scenario surface list) · **Verb:** `bindSlot` · **Severity:** missing-feature

Paginated / sortable rows with columns, row selection, row-level conditional actions. Substrate has nothing. Persona used `module-widget`.

**Suggestion:** `list` slot kind alongside `tree` (F2) and `diff` (F11); binds to a Data Source + names columns + row-action descriptors that point at Response Actions (F9).

### F9 — Response Actions vocabulary is intake-completion-shaped

**Surface:** lint-findings (also affects Scenario `re-run`) · **Verb:** `addExperienceUnit` + Response Action declarations · **Severity:** reshape-needed

Authoring tools have reviewer actions: `waive-finding`, `acknowledge`, `re-run-scenario`, `request-review`, `record-resolution`. The current Response Actions taxonomy is shaped for intake completion (submit, save-draft, signature). Persona had no clean way to declare a non-form, side-effecting action against a workspace artifact.

**Suggestion:** Response Action kind taxonomy extension — `reviewer-action` family with subtypes (`waive`, `acknowledge`, `re-run`, `request-review`). Keep current taxonomy as `respondent-action` family.

### F10 — UI Graph Policy has no capability-gating

**Surface:** lint-findings · **Verb:** `declareUiGraphPolicy` · **Severity:** missing-feature

"Show the waive button only if the user has AuthorityGrant `waive:S6`" — fundamental authoring requirement, no substrate expression. AuthorityGrant is an authoring-side artifact; UI Graph Policy is respondent-side; the two don't talk. Persona left visibility predicates as TODOs.

**Suggestion:** this is partly an ADR 0152 fine-grained-authorization slice (Held). The narrower piece — substrate hook in UI Graph Policy for a `visibleWhen` predicate that any policy evaluator can populate — could land before ADR 0152 produces the policy semantics. Hook now, semantics later.

### F11 — No `diff` / `split-tree` slot type

**Surface:** scenario-viewer · **Verb:** `bindSlot` · **Severity:** missing-feature

Two structured tree inputs, aligned by node identity, inline diff highlighting. Substrate has nothing. Persona used two `experience-unit` slots side by side; substrate cannot reason about their alignment.

**Suggestion:** `diff` (or `split-tree`) slot kind; binds to *two* Data Sources + an alignment key + a divergence schema; emits aligned tree with divergence pinned. Same family as `tree` (F2) and `list` (F8).

### F12 — No non-form action verb

**Surface:** scenario-viewer · **Verb:** Response Actions invocation · **Severity:** reshape-needed

`re-run-scenario` is a runtime command, not a form submit. The current Response Actions executor model is form-submission-shaped. Persona had no substrate-recognized verb for "click this button → host runtime executes this named command".

**Suggestion:** runtime-command Response Action kind alongside the form-submit kind, with a `target: { runtimeCommand: <id> }` and validation-tuple-by-name. Slightly broader than F9.

### F13 — No `metadata-strip` static-content kind

**Surface:** scenario-viewer · **Verb:** `bindSlot(static-content)` · **Severity:** missing-feature

The scenario header wants a key/value strip (name, type, linked policy objects). `static-content` accepts `heading` and a few other simple kinds; not metadata. Persona used `module-widget`.

**Suggestion:** `metadata` kind in `static-content`'s binding (low-cost; same slot type, new kind enum value); takes a Data Source + a label/value path pair.

### F14 — No `createDefinition` / `addDefinition` MCP verb

**Surface:** lint-findings · **Verb:** `addDefinitionStub` · **Severity:** missing-feature

The waiver-rationale form (the only form on Lint surface) needs a fresh Definition document declared inline as part of the authoring journey. `addDefinitionStub` extends an existing Definition; there's no verb to declare a new one. Persona inferred an id and hoped.

**Suggestion:** `declareDefinition({ url, version, title })` companion verb to `declareComponent` — registers a new Definition in `definitions[]` so subsequent `addDefinitionStub` / `addItem` calls have somewhere to land.

## Verification

From `formspec/spikes/wireframe-generator-v7/` on 2026-05-26:

```sh
npm install
npm run spike       # vitest run — 3 per-surface authoring tests + 1 findings-persistence assertion, all pass
npx tsx src/render.ts   # writes snapshots/index.html + 3 per-surface intent sketches
npx tsc --noEmit    # clean
```

Validation per surface (from `npm run spike` output, captured in `reports/<surface>.validation.json`):

| Surface | Phases completed | Diagnostics (error/warn/info) |
|---|---|---|
| source-vault | artifact-resolution, schema, module-resolution, cross-artifact | 4 / 0 / 0 |
| lint-findings | artifact-resolution, schema, module-resolution, cross-artifact | 5 / 0 / 0 |
| scenario-viewer | artifact-resolution, schema, module-resolution, cross-artifact | 6 / 0 / 0 |

Findings: 30 raw records = 14 distinct primary findings (above) + 16 per-diagnostic auto-records confirming the 14 primary findings (one auto-record per validator-emitted diagnostic, each cross-references the primary finding for the substrate gap that fired it). Programmatic catalog at [`reports/findings.json`](../../spikes/wireframe-generator-v7/reports/findings.json).

## What this means for ADR 0150 / 0153 / 0154 / 0152

- **ADR 0150 — strengthened on the respondent axis, exposed on the authoring axis.** The closed substrate (App Manifest, Surface, Components, UI Graph Policy, Data Sources, Response Actions, AppGraphValidator) reaches the authoring app's app-graph cleanly. The expressiveness gap is in the *slot/widget/action vocabulary* sized for intake. Promotion candidates (F2, F4, F7, F8, F11, F13) extend the slot taxonomy; F3 extends Data Sources; F9, F12 extend Response Actions; F5, F6, F10 extend UI Graph Policy; F1, F14 extend Wireframes-MCP. None of these reopens ADR 0150 — they're additive contract surfaces.
- **ADR 0153 — gate 9 stays Closed; v6 §"Residual Gaps" gains item 6 (authoring-tool a11y profiles)** as a distinct slice from 9b. F6 is hygiene-class against ADR 0153 §"UI graph policy" row Closed state. F3 (workspace: Data Source family) is the same shape as v6 residual gap 3 (Data Sources runtime) but on the **scope-family** axis, not the runtime axis — could land as one contract slice or two.
- **ADR 0154 — substrate Closed for the graph-edit pipeline as proved. v7 did not exercise the graph-edit verbs heavily** (persona judged Component-tree authoring upstream of bindSlot for the three surfaces' shape); no new ADR 0154 findings.
- **ADR 0152 — F10 (capability-gating in UI Graph Policy) is the smallest pre-ADR-0152 substrate landing point.** The full policy semantics stay Held; a `visibleWhen` predicate hook lets any future evaluator populate it without further substrate work. This is consistent with the existing posture extension reservation (`posture.extensions.x-formspec-actor-scope` / `x-formspec-class-scope`) — same reflex, applied to UI Graph Policy.

The substrate is closed for the v4 acceptance corpus + intake conformance. **It is not closed for authoring tools.** v7's value is naming the gap as a finding catalog the owner can promote (or defer) one slice at a time; full chaos-test phases 2–4 (root-cause, sanity-check, parallel implementation) remain owner-gated per stack-root rollup §"Owner action items".
