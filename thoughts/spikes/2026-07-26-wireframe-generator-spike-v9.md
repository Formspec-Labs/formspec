# Wireframe / Dynamic-UI Generator Spike v9 — the delta run

**Status:** complete — v8's twelve exemplars re-translated through the same persona wall, measured against what shipped since
**Lives at:** [`formspec/spikes/wireframe-generator-v9/`](../../spikes/wireframe-generator-v9/) + this doc
**Continues:** [`2026-07-26-wireframe-generator-spike-v8.md`](./2026-07-26-wireframe-generator-spike-v8.md) (36 primary findings, 95 error diagnostics) + [`../../spikes/wireframe-generator-v8/`](../../spikes/wireframe-generator-v8/)
**Cross-references:** [`../../spikes/e4-trust-redteam/`](../../spikes/e4-trust-redteam/) — v9 re-prices E4's claim-1 residual
**Corpus:** unchanged — [`formspec-cloud/thoughts/concepts/claude-design-handoff/project/`](../../../formspec-cloud/thoughts/concepts/claude-design-handoff/project/). The same twelve exemplars, the same 15 routes, the same 66 slots. The delta is only honest if the translation is the same translation, and the harness asserts it.
**Substrate under test:** `@formspec-org/app-graph`, `@formspec-org/mcp-wireframes`, `@formspec-org/studio-core` as of 2026-07-26, plus `routeClass` on `surface.schema.json` `$defs/Route` and the `THEME-ROUTE-CLASS` rule

## Verdict

**One of the three things that shipped is reachable from the authoring surface. Of 36 v8 primary findings, one closed, two narrowed, thirty-three persist, and six new ones appeared — net 42.**

`declareDefinition` closed finding 21 outright: the onboarding organization step now mints a Definition, hangs three items on it, and binds a `definition-form` slot, and the `APP-GRAPH-SURFACE-DEFINITION-SLOT` diagnostic is gone from the corpus. That was v8's "cheapest promotion in the catalog", and the estimate was right.

`declareRegistry` narrowed finding 18 and, taken alone, **made the graph worse**. It puts a Registry pointer on the manifest that no verb can fill, so twelve surfaces gained an `ARTIFACT-MISSING`, `cross-artifact` went from `completed` on 12 surfaces to `skipped: unresolved-artifacts` on all 12, and error diagnostics rose from 95 to 118. Hand-write the Registry document outside the MCP and `MODULE-*` drops 93 → 0. The admission path is real; the author cannot walk it.

**`routeClass` is the sharp one, and not in the way anyone predicted.** `addRoute` does not reject a `routeClass` argument — it *silently discards* it. The facade rebuilds the route from `{ id, path, title }` before the kernel (which would have refused the unknown key) ever sees it. All 15 attempts returned `ok: true`; **0 survive into the Surface document the kernel exports**. The consequence is measured, not argued: a tenant-brand Theme assignment pushed at the signature ceremony, the verifier, and the trust center produced **zero `THEME-ROUTE-CLASS` diagnostics in every arm — including the best-case arm where the Registry resolves, the widgets are admitted, and the token slots exist.** E4 filed unclassified routes as the *residual*, the price of leaving classification optional. For anything authored through Wireframes-MCP it is the only case: 15 of 15 routes here, 61 of 61 in the product route map.

The number that makes the rest trustworthy is a zero. A `v8-parity` arm — v8's exact authoring shape, re-run under real Ajv instead of v8's `() => ({ ok: true })` stub — reproduces **95 errors, per-surface identical on all twelve**. So the schema stub v8 was criticised for hid nothing, and every other number below is attributable to the thing it changed rather than to the harness.

**The one shape all three results share: declaration shipped without materialisation.** `declareRegistry` names a Registry nothing can fill. `declareDefinition` mints a Definition nothing can export — the single `ARTIFACT-MISSING` that survives into the best arm is `definitions[0]`. `declareUiGraphPolicy` assigns Theme tokens with no verb to declare a Theme. Findings 18, 21, 42, and v8's own follow-up 37 are four faces of finding 43.

## Method — four arms, because one number would have mixed three effects

| Arm | Adds | Errors | Like-for-like (schema excluded) | `cross-artifact` completed |
|---|---|---|---|---|
| v8 (baseline) | — | 95 | 95 | 12 / 12 |
| `v8-parity` | real Ajv over `formspec/schemas/*.json` | 95 | 95 | 11 / 12 |
| `verb-only` | `declareRegistry` + tenant-theme probe | 118 | 112 | 0 / 12 |
| `host-authored` | Registry hand-composed from `declareModule`'s docstring recipe | 203 | 1 | 0 / 12 |
| `host-corrected` | the fixes the validator's own diagnostics name | 8 | 8 | 11 / 12 |

`v8-parity` vs v8 is the only like-for-like comparison and it is **exactly zero**, per surface and in total. Everything else moves a second variable and is reported as its own number. All rows computed in [`reports/delta.json`](../../spikes/wireframe-generator-v9/reports/delta.json), not asserted.

Two harness corrections v9 makes to v8, both load-bearing:

1. **Real Ajv, no stubs** (the E4 pattern). v8's `schema: completed` meant "the pipeline reached the phase".
2. **The served Surface is the kernel's, not the spike's.** v8 hand-derived the loaded Surface from its own slot specs, so the document could assert anything the persona wrote down — including a `routeClass` no verb had recorded. v9 serves `exportSurfaceDocument()` output, falling back to `readSurfaceDraft()` when the draft is unpublishable and recording the refusal. Without this correction v9 would have reported `routeClass` as *working*.

That fallback fired once, and it is a finding in its own right: **the onboarding wizard is not publishable.** Four sibling step routes, `SURFACE-ROUTE-UNREACHABLE` on three of them, because nothing links them and `embed-route` is the only edge the Surface has. Finding 20 said "routes are an unordered set"; the harder version is that a four-step wizard authored entirely through published verbs cannot be exported at all.

## Persona posture

v7's wall, held, with one addition stated explicitly because it changed the result.

| Allowed | Forbidden |
|---|---|
| The mockup corpus + its route map | All of `formspec/specs/` |
| [`formspec-mcp-wireframes/src/index.ts`](../../../formspec-studio/packages/formspec-mcp-wireframes/src/index.ts), including the `declareRegistry` / `declareDefinition` / `declareModule` docstrings | All of `formspec/schemas/` |
| v8's harness and surface scripts as scaffolding | The ADR / thoughts corpus outside the spike dirs |
| **Diagnostics this run produced** — the persona iterates on its own errors | |

The last row is new and is why `host-corrected` exists. Two corrections came purely from error text the substrate handed back: widget renaming (`APP-GRAPH-SCHEMA` named the pattern) and the Definition data type (`details.helperDetail.validTypes` named the vocabulary). Neither required opening a spec, and an AI author would run exactly that loop. Excluding it would have understated the substrate.

## Pre-registered predictions

| # | Prediction | Verdict | Evidence |
|---|---|---|---|
| P1 | Finding 21 (`declareDefinition`) **closes** | **HELD** | `declareDefinition` accepted; 3/3 `addDefinitionStub` calls landed; `APP-GRAPH-SURFACE-DEFINITION-SLOT` absent from all four arms. `reports/findings.json` finding 21, `disposition: "closed"`. Two snags on the way, both self-correcting and both recorded: the first `dataType` guess (`text/short`) was refused with the valid set in `details.helperDetail.validTypes`, and the verb needs `initFormspecEngine()` first or returns `UNKNOWN: Formspec runtime WASM is not initialized` — undocumented on the MCP surface. |
| P2 | Finding 18 **narrows, does not close**; `MODULE-*` persists | **HELD** | `declareRegistry` accepted on 12/12. `MODULE-*` diagnostics: v8 93 → parity 93 → verb-only **99** → host-authored 0. The persona found no published path to author entries; the docstring says so itself. `delta.json` `registry.moduleDiagnostics`. |
| P3 | Finding 6 (theme authority) **closes** — routeClass is authorable | **FAILED**, and the falsifier was wrong too | The pre-registered falsifier was "routeClass unreachable through MCP verbs (no verb sets it)". Reality is worse: `addRoute` *accepts* the key, returns `ok` on 15/15, and discards it. `delta.json` `routeClass`: `attempted 15, verbReturnedOk 15, persistedInExportedSurface 0, distinctErrors []`. Finding 6 → `narrowed`; findings 38 and 39 are new. |
| P4 | Total error diagnostics **drop by less than half** | **HELD**, though the sign is the story | They did not drop. 95 → 118 in the verb-only arm (+24%). They drop to 8 only in `host-corrected`, which requires work no MCP verb can do. |
| P5 | The remaining ~33 findings **persist unchanged** | **HELD** | 33 persist. Six incidental closures would have been findings; there were none. |

## Per-finding disposition

**closed 1 · narrowed 2 · persists 33 · new 6 · total 42.** Machine-readable in [`reports/findings.json`](../../spikes/wireframe-generator-v9/reports/findings.json) (`dispositionCounts`, `dispositionIds`).

| # | Family | Disposition | Note |
|---|---|---|---|
| 1 | app-composition | persists | One Surface per bundle; twelve bundles for one product. |
| 2 | data-source | persists | Still no data-source verb. 53 unreadable binding strings, 38 distinct — identical to v8. |
| 3 | app-composition | persists | `addRoute` takes four keys; `:id` is still a character sequence. |
| 4 | state-and-status | persists | No route lifecycle field. |
| 5 | capability-gating | persists | No access posture on RoutePolicy. |
| **6** | theming-and-density | **narrowed** | The rule now exists and is unreachable. v8's *"the graph cannot state it"* is false; *"the author cannot state it"* is now true. See 38, 39. |
| 7 | slot-taxonomy | persists | No `collection` slot type. |
| 8 | slot-taxonomy | persists | No `filter-bar` slot type. |
| 9 | slot-taxonomy | persists | No `stat-strip` static-content kind. |
| 10 | state-and-status | persists | No per-slot state variants. |
| 11 | action-vocabulary | persists | No multi-subject action contract. |
| 12 | slot-taxonomy | persists | No `stat-tile` kind. |
| 13 | slot-taxonomy | persists | No chart slot. |
| 14 | slot-taxonomy | persists | No `activity-feed` slot. |
| 15 | state-and-status | persists | No host-status region. |
| 16 | app-composition | persists | Six tabs under one entity route, unexpressible. |
| 17 | slot-taxonomy | persists | Cross-bundle `embed-route` legality still unstated. |
| **18** | mcp-verb-surface | **narrowed** | `declareRegistry` closed the admission half. The content half owns the diagnostics and grew: 93 → 99. |
| 19 | cross-slot-contract | persists | No publish/consume channel. |
| 20 | app-composition | persists | Sharpened: the wizard is not merely unordered, it is **unpublishable** — `SURFACE-ROUTE-UNREACHABLE` ×3, `delta.json` `surfaceExport.refusals`. |
| **21** | mcp-verb-surface | **closed** | `declareDefinition` + `addDefinitionStub` walk the native path end to end. Residue is finding 43, not this one. |
| 22 | slot-taxonomy | persists | No signature-capture slot. |
| 23 | capability-gating | persists | No identity-assurance declaration. |
| 24 | read-only-display | persists | Still the highest-leverage single slot type; `experience-unit` still stands in for it. |
| 25 | action-vocabulary | persists | No external-handoff action. |
| 26 | action-vocabulary | persists | No operational action family. |
| 27 | capability-gating | persists | No sensitivity class on any artifact. |
| 28 | slot-taxonomy | persists | No capability-matrix kind. |
| 29 | data-source | persists | No freshness binding. |
| 30 | action-vocabulary | persists | No client-executed action. |
| 31 | slot-taxonomy | persists | No artifact-input region. |
| 32 | state-and-status | persists | No per-user view state. |
| 33 | a11y-profile | persists | Twelve surfaces, two a11y knobs. |
| 34 | slot-taxonomy | persists | No tree slot. |
| 35 | slot-taxonomy | persists | No compare slot. |
| 36 | state-and-status | persists | No version-lineage declaration. |
| 37 | mcp-verb-surface | *(v8 follow-up, not re-run)* | The Registry entry-content verb. v9's finding 43 generalises it. |
| **38** | mcp-verb-surface | **new** | `addRoute` accepts `routeClass`, returns ok, discards it. 15 ok / 0 persisted. |
| **39** | theming-and-density | **new** | Tenant Theme assignments reach ceremony, verifier, and trust center unrefused. 0 `THEME-ROUTE-CLASS` in every arm. |
| **40** | mcp-verb-surface | **new** | The v8 schema-stub correction, recorded so the next run does not inherit the ambiguity. Effect measured: zero. |
| **41** | mcp-verb-surface | **new** | `bindSlot` accepts 47 PascalCase widget names the Registry and Theme artifacts cannot represent (`^x-[a-z]…`). 202 schema errors, two hops downstream, in a document the author has no verb to write. |
| **42** | theming-and-density | **new** | No `declareTheme` verb. The MCP lets a tenant *assign* theme tokens but not *declare* the theme they come from — the risky half shipped, the legitimate half did not. 6 `THEME-TOKEN-REF`. |
| **43** | mcp-verb-surface | **new** | Declaration shipped without materialisation. `exportSurfaceDocument` is the only export, and it is on the kernel rather than the verb surface. |

## Per-surface tracker

Slots and routes are byte-identical to v8 (the harness asserts `slotsUnchanged` on all twelve). Reports: [`reports/`](../../spikes/wireframe-generator-v9/reports/).

| Exemplar | Slots | v8 | parity | verb-only | host-authored | host-corrected | cross-artifact (parity → corrected) |
|---|---|---|---|---|---|---|---|
| forms-index | 5 | 7 | 7 | 8 | 16 | 0 | completed → completed |
| owner-dashboard | 8 | 11 | 11 | 12 | 24 | 0 | completed → completed |
| form-detail | 7 | 8 | 8 | 9 | 16 | 0 | completed → completed |
| form-edit | 6 | 9 | 9 | 10 | 20 | 0 | completed → completed |
| onboarding | 5 | 9 | 9 | 10 | 17 | 1 | skipped → skipped |
| signature-ceremony | 6 | 6 | 6 | 11 | 14 | 2 | completed → completed |
| admin-billing | 5 | 9 | 9 | 9 | 16 | 1 | completed → completed |
| dev-webhooks | 5 | 8 | 8 | 9 | 16 | 0 | completed → completed |
| trust-center | 5 | 6 | 6 | 11 | 14 | 2 | completed → completed |
| verifier | 5 | 7 | 7 | 12 | 18 | 2 | completed → completed |
| responses-index | 4 | 7 | 7 | 8 | 16 | 0 | completed → completed |
| form-versions | 5 | 8 | 8 | 9 | 16 | 0 | completed → completed |
| **total** | **66** | **95** | **95** | **118** | **203** | **8** | 11/12 → 11/12 |

Error codes by arm ([`delta.json`](../../spikes/wireframe-generator-v9/reports/delta.json) `errorCodeCounts`):

| Code | parity | verb-only | host-authored | host-corrected |
|---|---|---|---|---|
| `MODULE-UNRESOLVED` | 44 | 44 | 0 | 0 |
| `MODULE-CONTRIBUTION-MISSING` | 49 | 55 | 0 | 0 |
| `ARTIFACT-MISSING` | 1 | 13 | 1 | 1 |
| `APP-GRAPH-SCHEMA` | 0 | 6 | 202 | 0 |
| `THEME-TOKEN-REF` | 0 | 0 | 0 | 6 |
| `APP-GRAPH-SURFACE-EXPERIENCE-UNIT-REF` | 1 | 0 | 0 | 1 |
| `THEME-ROUTE-CLASS` | **0** | **0** | **0** | **0** |

The bottom row is the run's headline. The `host-corrected` column is the strongest form of the claim: everything else that could have suppressed the diagnostic is fixed, and it still does not fire.

## Assessment — is posture-gated write authority the right seam for `routeClass`?

The dispatching question, answered on merit rather than by citation. **Yes as the eventual seam, no as the next move; and there is a cheap correct fix that is independent of the decision and should land regardless.**

**Land now, unblocked by anything:** the facade should stop swallowing unknown keys. [`formspec-mcp-wireframes/src/index.ts:163`](../../../formspec-studio/packages/formspec-mcp-wireframes/src/index.ts) rebuilds the route as `{ id: input.routeId, path: input.path, title: input.title }`, so the kernel's existing `SurfaceRoute contains unsupported property` check at [`ProposalManagerFacade.ts:3284`](../../../formspec-studio/packages/formspec-studio-core/src/kernel/ProposalManagerFacade.ts) never runs. Pass the input through and the guard fires. **Silent discard is strictly worse than refusal** — a refusal teaches the caller, a success teaches them wrong, and an MCP verb is called with JSON over a wire where nothing else will catch the typo. This is a bug with a clear right answer and it does not depend on the authority question. Finding 41 is the same bug one field over (`bindSlot` accepting widget names the artifacts cannot represent), and the same fix applies.

**Why "just add `routeClass` to `addRoute`" is wrong.** Wireframes-MCP is intended to run in both a platform-side and a tenant/AI-facing posture. `intake` is the single class that admits tenant chrome theming. A tenant who can call `addRoute({ routeClass: 'intake' })` on their signature ceremony has unlocked theming on it. That is precisely the failure E4 named against v8's original `themeAuthority` proposal — *a constraint the constrained party can edit is not a constraint* — reappearing one artifact over. The route-class design deliberately moved the classification onto Surface, "which the platform ships and the tenant consumes"; exposing an unguarded write verb hands it back.

**Why posture-gated write authority is the right eventual seam.** The question `routeClass` raises is not "may this field be written" but "**which actor** may write **which values**". That is a two-axis question — actor × class — and it is exactly the shape [`actor-posture-admission.ts`](../../../formspec-studio/packages/formspec-studio-core/src/actor-posture-admission.ts) already carries, with `POSTURE_ACTOR_SCOPE_EXTENSION` and `POSTURE_CLASS_SCOPE_EXTENSION` as the two named hooks and `posture-declaration.schema.json` `allowedActors` as the declaration site. A per-verb allowlist would solve `routeClass` and nothing else; the posture seam solves the family — the same question is already queued for `declareTheme` (finding 42), for sensitivity annotation (finding 27), and for whatever writes access posture (finding 5). Four consumers is enough to justify a seam.

**Three things that must be settled before it is built, and none is settled today:**

1. **The hooks are unevaluated.** Their own comments say the canonical shape is "in ADR 0152 (not evaluated yet)". Building `routeClass` authority on an unevaluated extension point means the first real consumer defines the contract by accident. Evaluate ADR 0152 first, with `routeClass` as one input among the four consumers — not as the driver.
2. **The posture must be attested, not asserted.** If the tenant-facing MCP instance declares its own posture, the seam is decorative for exactly the reason the field cannot sit on RoutePolicy. Where posture comes from, and what makes it unforgeable, is the load-bearing question and it is upstream of any verb.
3. **This spike does not evidence the tenant-facing posture actually exists yet.** The finding is real for the platform-side posture too (v9's persona is a platform PM and still cannot classify a route). So the immediate cost is being paid before the multi-posture design is needed — which argues for fixing the silent discard now and taking the authority question at ADR 0152's pace rather than at this spike's.

**Recommendation.** Fix the silent discard (findings 38, 41) as a bug. Do **not** add `routeClass` to `addRoute` behind it — leave the kernel refusing it, which is honest, until the write path has an authority story. Fold `routeClass` into the ADR 0152 evaluation as one of four consumers. Until then, `routeClass` is authored by whoever authors Surface documents by hand, and `THEME-ROUTE-CLASS` protects hand-authored Surfaces only — which should be **written down as the current guarantee**, because E4's rollup records claim 1 as *narrowed* on the strength of a guard that no MCP-authored app can currently trigger.

## What contradicts v8, E4, or the plan

- **The plan's P3 falsifier was itself wrong.** It anticipated "no verb sets it → new finding". The verb *appears* to set it. Any future check that asks "did `addRoute` accept it?" gets the wrong answer; the question has to be "is it in the exported Surface?".
- **The dispatch brief's premise — that `addRoute` actively rejects `routeClass` with `SurfaceRoute contains unsupported property: routeClass` — does not reproduce.** That check exists in the kernel and is correct about what the kernel would do, but the MCP facade never forwards the key, so the error never fires and the caller sees `ok`. The corrected chain is in finding 38.
- **E4's residual is not a residual.** [`e4-trust-redteam/README.md`](../../spikes/e4-trust-redteam/README.md) records `claim1-theme-authority-unclassified` as "the residual hole… the guard is opt-in". For MCP-authored graphs, unclassified is not the hole in the guarantee — it *is* the guarantee. E4's own framing ("the price of that (correct) call… filed here so the price stays visible and is re-measured on every run") invites exactly this re-measurement; the price is larger than the word "residual" carries.
- **v8's §Follow-up over-claimed one word.** It states finding 18's *path* closes and finding 21 "closes outright". 21 does close — confirmed here end to end. 18's path closes in the sense that a hand-authored Registry resolves, but the arm that only uses verbs is **worse** than the arm without `declareRegistry` at all, and the follow-up does not say so. "Narrowed, at a cost" is the accurate summary.
- **v8's schema-stub caveat cost nothing.** Real Ajv over v8's exact authoring shape produces 95 errors and zero `APP-GRAPH-SCHEMA` — per surface identical. The caveat was correct to record and its effect is zero. Recorded as finding 40 so it is not re-litigated.
- **`x-spike-*` binding counts are unchanged: 53 sites, 38 distinct.** Nothing that shipped touched the data-source gap, which remains the widest-blast-radius unaddressed finding after the module-entry gap.

## Follow-up

1. **Bug, land now:** `addRoute` and `bindSlot` must not swallow keys the artifacts cannot represent. Findings 38, 41.
2. **Decision, ADR 0152:** actor × class write authority, with `routeClass`, `declareTheme`, sensitivity, and access posture as the four consumers. Findings 38, 42, 27, 5.
3. **Verb family, one design:** `export<Artifact>Document` as a peer of each `declare*`, mirroring `exportSurfaceDocument` including its refuse-when-unpublishable behaviour. Closes the residue of 18, 21, and 42 at once, and subsumes v8's follow-up 37. Finding 43.
4. **Write down the current guarantee.** `THEME-ROUTE-CLASS` protects hand-authored Surfaces only. Until (2) lands, any claim that proof surfaces are structurally protected should say so.
5. **Unchanged from v8, unaddressed:** the data-source verb (finding 2, 53 binding sites) and read-only display (finding 24). v8 ranked them second and third; nothing since has moved either, so they inherit the top of the queue once the above clears.

## Verification

From `formspec/spikes/wireframe-generator-v9/` on 2026-07-26, after rebuilding `@formspec-org/types`, `@formspec-org/app-graph`, `@formspec-org/studio-core`, and `@formspec-org/mcp-wireframes`:

```sh
npm install
npm run spike        # vitest run — 48 translations (12 exemplars × 4 arms) + findings + rollup; 50 tests, all pass
npm run typecheck    # tsc --noEmit — clean
```

| Output | Value |
|---|---|
| Exemplars re-translated | 12, identical routes (15) and slots (66) to v8 |
| Arms | 4 — `v8-parity`, `verb-only`, `host-authored`, `host-corrected` |
| Validation reports | 48 (`reports/*.validation.json`) |
| Primary findings | 42 — closed 1, narrowed 2, persists 33, new 6 |
| Total findings incl. auto-records | 162 |
| Like-for-like delta vs v8 | **0** (`v8-parity`, schema excluded) |
| `routeClass` attempts / verb ok / persisted | 15 / 15 / **0** |
| `THEME-ROUTE-CLASS` diagnostics, all arms | **0** |
| `MODULE-*`: v8 → parity → verb-only → host-authored | 93 → 93 → 99 → 0 |
| Workaround binding sites | 53 (38 distinct) — unchanged from v8 |

Nothing under `formspec/schemas/`, `formspec/specs/`, `packages/`, or the ADR corpus was modified. No `x-spike-v9:*` shape is a contract candidate.
