# Wireframe / Dynamic-UI Generator Spike

**Status:** spike — exploratory proof, not production infrastructure
**Lives at:** `formspec/spikes/wireframe-generator/`
**Related:** [`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../specs/2026-05-20-formspec-semantic-layers.md), [`specs/experience/experience-spec.md`](../../specs/experience/experience-spec.md), [`specs/response-actions/response-actions-spec.md`](../../specs/response-actions/response-actions-spec.md), [`specs/component/component-spec.md`](../../specs/component/component-spec.md)
**Prior art:** XIML, UsiXML, CAMELEON Reference Framework (Domain → Task → Abstract UI → Concrete UI → Final UI), with explicit Dialog / Navigation models above Task.

---

## 1. Nugget

Formspec already carries the CAMELEON layers:

| CAMELEON layer | Formspec primitive |
|---|---|
| Domain model | Definition (entities, fields, FEL, validation) |
| Task model | Experience (actors, tasks, units with `kind`) |
| Dialog / Effects | Response Actions (action invocations + effects) |
| Concrete UI | Component (widget tree, layout, binding) |
| Final UI | renderer output (engine + webcomponent today) |

The spike investigates **using these primitives directly to express a non-form product surface** (a Harvey-AI-style legal research workspace) and renders it as a multi-route wireframe. The point is to identify what's *genuinely* missing for general UI work and propose the **smallest extension** that fills the gap.

Headline finding (registered up front, confirmed below):

1. **Navigation / Routing primitive is the real gap.** Formspec has no equivalent of UsiXML's NavigationGraph or XIML's Dialog model. The spike proposes a `Surface` sidecar.
2. **Component widget vocabulary is narrow for non-form surfaces.** Stream/Viewer/Gallery/ResultList shapes have no canonical Component widgets. Parked as `x-spike-kind` extensions on Experience units pending Component-extension discussion.
3. **AI-native enablement is optional.** `ai:` annotations on Experience units and Response Actions render as visible chips but are inert in the substrate. Nothing in the pipeline depends on AI.

## 2. Non-goals

- Faithful Harvey AI replica. Pick the recognizable subset that exercises gaps.
- Live data or AI calls. Wireframes only.
- Promotion of Surface or `x-spike-kind` into normative spec status.
- Mutation of the Component schema. Spike validates against current Component schema; awkwardness is part of the finding.

## 3. Pipeline

```
Definition  + Experience  + Response Actions  + Surface  (spike-only)
   (data)      (tasks)         (effects)         (routes)
                          │
                          ▼
        Generator  (Formspec primitives → Component per route)
                          │
                          ▼
       Component documents  ── one per route, schema-valid ──
                          │
                          ▼
        IR builder  (Component → WireframeNode tree)
                          │
                          ▼
        Renderer  (IR → single HTML, sidebar route switcher)
```

Renderer never imports Formspec types — that's the dependency-inversion seam that lets the renderer graduate to a standalone `wireframe-render` package later.

## 4. Sample fixture: LexAssist

A Harvey-AI-shaped legal research workspace. 8 routes exercise: shell layout, gallery, list-detail, conversational thread, document viewer, multi-step workflow, admin CRUD, profile.

| route | path | nugget exercised |
|---|---|---|
| home | `/` | shell + gallery + result-list |
| matter | `/m/:id` | shell + three-pane composition |
| thread | `/m/:id/t/:tid` | conversation (the stream gap) |
| doc-viewer | `/m/:id/d/:did` | viewer (the doc gap) |
| playbooks | `/playbooks` | gallery |
| playbook-runner | `/playbooks/:id/run` | form + progress |
| library | `/admin/library` | form + audit list |
| profile | `/profile` | form |

Five of the routes contain Formspec-native data-entry units; three contain primarily non-form surfaces (chat, doc viewer, gallery). That split is deliberate — it tests what Formspec covers vs what it lacks.

## 5. Surface (proposed sidecar)

Spike-only JSON. Names routes; composes Experience units into named slots; declares cross-route transitions. Modeled on UsiXML's Dialog Model and XIML's Navigation Model, stripped to a minimum.

```jsonc
{
  "$formspecSurface": "0.1-spike",
  "appName": "LexAssist",
  "nav": [{ "label": "Workspaces", "path": "/" }, ...],
  "routes": [
    {
      "id": "matter",
      "path": "/m/:id",
      "shellUnitRef": "matter.shell",
      "slots": {
        "left": ["matter.threadList", "matter.docList"],
        "main": ["matter.activity"],
        "right": ["matter.helper"]
      },
      "transitions": [{ "on": "selectThread", "to": "thread" }]
    }
  ]
}
```

The Surface depends on Experience (resolves `unitRef`s) and Response Actions (resolves transition triggers). It does not depend on Component — that's the generator's output.

## 6. `x-spike-kind` (Experience unit extension)

Units whose surface shape isn't covered by the closed `unit.kind` enum carry an `x-spike-kind`:

| x-spike-kind | semantics | sample-data carrier |
|---|---|---|
| `x-conversation` | Message stream | `extensions["x-spike-messages"]` |
| `x-document-viewer` | Large content surface + annotations | `extensions["x-spike-pages"]`, `x-spike-annotations` |
| `x-result-list` | Vertical list of rows | `extensions["x-spike-rows"]` |
| `x-gallery` | Card grid | `extensions["x-spike-cards"]` |
| `x-shell` | Layout shell | `extensions["x-spike-slot"]` |

Sample data lives **on the unit** because it is composition data (CAMELEON Task layer), not domain data (Definition). Treating a chat message as a `Definition.item` is the shoehorn this spike avoids.

## 7. AI-native enablement (optional)

Any Experience unit or Response Action may carry an `extensions["x-spike-ai"]` block:

```jsonc
"extensions": {
  "x-spike-ai": { "fillable": true, "providerHint": "chat", "prompt": "Summarize this matter's open issues" }
}
```

The renderer surfaces these as `🤖 ai:fillable` chips. Nothing else in the pipeline reacts to them. The substrate is AI-optional by construction.

## 8. Success criteria

1. `npm install && npm run spike` produces `output/wireframe.html` and `output/components/<route-id>.json`.
2. Each `output/components/*.json` validates against `schemas/component.schema.json`.
3. Opening `wireframe.html` shows a left-sidebar route switcher with all 8 routes visible and recognizable: chat looks chat-shaped, doc viewer looks doc-shaped, matter looks three-pane.
4. Lineage chips appear on representative nodes: `unit:matter.threadList`, `route:matter`, `actionRef:sendMessage`, and at least one `ai:*` chip.
5. The renderer source contains no `import` of Formspec types — proved by a grep in the spike test.
6. Findings section (§10) cites the routing gap, the widget-vocabulary gap, and the AI-optionality demonstration with concrete code evidence.

## 9. What this is not

- Not a published package. Lives in `spikes/`, outside any workspace layering.
- Not a regen-merge implementation.
- Not a Trace emitter.
- Not a normative promotion of Surface or `x-spike-kind`.

## 10. Findings

After running end-to-end against LexAssist (8 routes, all Component docs schema-valid):

### F1. Routing is the headline gap — Surface fills it cleanly

**Confirmed.** Formspec has no Dialog/Navigation primitive between Experience and Component. The proposed `Surface` sidecar (routes + slot composition + transitions, modeled on UsiXML Dialog + XIML Navigation) is small (a hundred lines for 8 routes) and additive — it depends on Experience for unit resolution and on Response Actions for transition triggers; it does not modify either. Generator + IR + renderer absorbed it without disturbing Formspec's authoritative layers.

**Promotion direction:** sibling sidecar to Experience, OR a `routes` + `composition` block under Experience. The sidecar shape is preferable because (a) form-only deployments don't need it, (b) it cleanly anchors the CAMELEON Dialog layer, and (c) `targetExperience` is a natural seam (Experience can stay form-shaped).

**Open sub-questions for promotion:** how transitions interact with Response Actions effects, whether route-level applicability (locale/posture/actor) belongs in Surface or stays in Experience, and whether nested/modal routes need first-class treatment.

### F2. Component schema strictness has no native extension slot for node-level metadata

**Confirmed.** Every Component variant uses `unevaluatedProperties: false`, with no `extensions` property defined on `ComponentBase`. Spike worked around this by stuffing all node-level metadata (kind, payload, AI hints, role, pane assignment) inside `x-generation` (which IS open via `additionalProperties: true`). It validated, but it's a smell — `x-generation` is documented as provenance only.

**Promotion direction:** add `extensions` (constrained to `^x-` keys) to `ComponentBase` OR define a new ComponentBase property like `metadata` with `additionalProperties: true` for renderer-ignored host metadata. Without this, any future Component-generation tooling will tunnel through `x-generation` the same way the spike did, which conflates provenance with payload.

**Concrete pinch point:** [`src/generate.ts`](../../spikes/wireframe-generator/src/generate.ts) — see the `xgen(...)` helper. Every node carries `x-generation: { source, strategy, generatedBy, anchors, spike: {...} }`. The `spike:` key is purely host-data, not provenance. Reviewer should flag this when normalizing.

### F3. `unit.kind` enum is form-narrow

**Confirmed.** Of the 19 LexAssist units, 9 carried `x-spike-kind` extensions because the closed enum (`data-entry / review / confirmation / evidence-collection / attestation / error-resolution / assistance`) didn't cover their surface intent:

| `x-spike-kind` | Count | What the closed enum forced |
|---|---|---|
| `x-shell` | 3 (shellAppNav, matterShell, matterHelper) | `assistance` — wrong: shell is layout, not assistance |
| `x-gallery` | 2 (homeWorkspaceGallery, playbooksGallery) | `review` — wrong: a card grid is not a read-only summary |
| `x-result-list` | 5 (homeRecentActivity, matterThreadList, matterDocList, matterActivity, libraryAudit, docCitations, playbookProgress) | `review` — wrong: a list is not a summary |
| `x-conversation` | 1 (threadHistory) | `review` — wrong: conversation is bidirectional |
| `x-document-viewer` | 1 (docViewer) | `review` — wrong: viewer has its own affordances |

**Promotion direction:** the closed enum is the right shape (registries beat free strings); widen it. Candidates to add: `navigation`, `gallery`, `stream`, `viewer`, `list`. Resist adding domain-specific kinds (no `chat`, `legal-research`); favor abstract presentation-intent words. Document that `unit.kind` is presentation-intent, not data shape.

### F4. Component widget vocabulary is form-narrow

**Confirmed.** TextInput / NumberInput / DatePicker / RadioGroup / etc. covered every Definition field cleanly. But ChatThread, DocumentViewer, ResultList, Gallery, ShellMarker have no canonical widgets. The spike worked around this by hosting them inside `Card` nodes with `x-generation.spike` payloads, but a real implementation would need named components.

**Promotion direction:** new `formspec-component-extensions` package (or named bundles within Component) defining `ChatThread`, `DocumentViewer`, `ResultList`, `Gallery`, `NavShell`. Likely lives outside Component core. Each new widget needs a fallback chain (per the spec's progressive-to-core fallbacks) — e.g. `ChatThread → Stack of Cards`, `DocumentViewer → Card with link`, `Gallery → Stack`, `NavShell → top Stack with links`.

### F5. Action intent enum is form-lifecycle-narrow

**Confirmed.** Standard `intent` values (`save-draft / autosave / review / submit / request-evidence`) don't cover `sendMessage`, `summarizeDoc`, `extractTimeline`, `runPlaybook`. LexAssist has 4 actions using `x-` intents (`x-send-message`, `x-summarize`, `x-extract-timeline`). Each `x-` intent requires a full `validation` tuple per the Response Actions spec §1.5 — workable but verbose.

**Promotion direction:** either expand the closed intent enum with a small set of ambient-operation intents (`invoke`, `transform`, `retrieve`, `compose`) OR recognize Response Actions as form-action-specific and add a peer **Event Actions** sidecar for ambient invocations. The peer-sidecar move keeps Response Actions's Validation-Mapping coupling intact while letting ambient triggers escape the form lifecycle entirely.

### F6. Definition is correctly small for non-form UIs

**Confirmed.** The full LexAssist Definition fits in ~140 lines: profile, matterDraft, composer, playbookInput, librarySettings, searchPanel. Everything else — threads, messages, documents, search results, citations — lived correctly in Surface composition data or Experience unit extensions. This is the right discipline: Definition owns *what the user authors / configures*; Surface/Experience own *what is presented*.

**Promotion direction:** no Definition changes needed. Reaffirm this discipline in any non-form-UI guidance: data the user reads-only-and-may-react-to lives in Task/Surface composition, not in Definition.

### F7. AI-native enablement is correctly orthogonal

**Confirmed.** AI annotations live in `extensions["x-spike-ai"]` on Experience units, propagate through `x-generation.spike.ai` on Component nodes, and surface as `🤖 ai:<providerHint>` chips with the prompt available on hover (HTML `title` attribute). The renderer renders them as visible metadata only — no layer interprets them at runtime, no AI provider is called, and removing the annotations does not break the pipeline.

The single workaround: **Action documents have no `extensions` field** (additionalProperties:false, no extensions property), so action-level AI hints have no carrier. The spike pulled the action's AI hint from the containing Experience unit instead. This is finding F2 in another guise.

**Promotion direction:** AI annotations as a small open vocabulary on `extensions` (when available — see F2). Avoid baking AI semantics into core; the renderer-as-chip pattern is a good template for what "AI as ambient annotation" should look like.

### F8. Generated artefacts pass the conformance bar

All 8 per-route Component documents validate against `schemas/component.schema.json`. The pipeline used only schema-tolerated extension slots (`unitRef`, `taskRefs`, `x-generation` with open `additionalProperties`). This is the spike's strongest signal that Formspec's existing primitives DO carry CAMELEON-equivalent semantics — the artefacts are real Formspec.

### Summary of proposed extensions (smallest viable set)

| Need | Proposed shape | Lives where |
|---|---|---|
| Navigation/Routing | `Surface` sidecar (routes + slot composition + transitions) | New sibling spec |
| Component node-level host metadata | `extensions` on `ComponentBase` (keys `^x-`) | Component spec amendment |
| Non-form unit kinds | Widen `unit.kind` enum: add `navigation`, `gallery`, `stream`, `viewer`, `list` | Experience spec amendment |
| Non-form widget vocabulary | `ChatThread`, `DocumentViewer`, `ResultList`, `Gallery`, `NavShell` with fallback chains | Component-extensions package |
| Ambient action intents | Either widen Response Actions `intent` enum OR add a peer `Event Actions` sidecar | Response Actions amendment OR new sibling spec |
| AI annotations | `extensions["x-ai"]` open vocabulary on units / actions / Component nodes | Open extension, no spec amendment
