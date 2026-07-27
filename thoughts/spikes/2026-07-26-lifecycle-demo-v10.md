# Spike v10 — the lifecycle demo

**Date:** 2026-07-26 (pre-registration) / 2026-07-27 (run)
**Spike dir:** [`../../spikes/lifecycle-demo-v10/`](../../spikes/lifecycle-demo-v10/)
**Discharges:** [ADR 0159](../../../thoughts/adr/0159-product-substrate-recognition.md) follow-on 1 — *"the single most important artifact this ADR produces"* — and is the build-cost half of that ADR's promotion condition 3.
**Continues:** [`2026-07-26-wireframe-generator-spike-v9.md`](2026-07-26-wireframe-generator-spike-v9.md) (harness lineage), `formspec-studio/packages/formspec-mcp-wireframes/tests/demo-beats-adr-0152.test.ts` (the exemplar bundle this extends).
**Owner scoping:** NO Trellis, NO WOS. Sign-off and release use Formspec-native authored signatures ([ADR 0083](../../../thoughts/adr/0083-formspec-native-authored-signatures.md) lineage) and in-repo verification only.

## Nugget

> ADR 0159 §The lifecycle thread is the only section of that ADR with no evidence, and the moat claim has never been demonstrated on any artifact. Walk ONE app through all six stages and report what the substrate actually carries — including where it carries nothing.

One exemplar. Six stages. No arms, no matrix. A negative result on any bar is the deliverable, not a failure of it.

---

# PART 1 — PRE-REGISTRATION

*Everything in Part 1 was written before the harness ran. Part 2 is the result.*

## The exemplar, and why this one

`https://benefits.example.gov/apps/assistance` — a rent-assistance application. **It is the ADR 0152 §9 acceptance bundle**, the artifact ADR 0159 follow-on 1 measures as *"2 of 6 stages, as a vitest file rather than a clickable graph."* Extending it rather than picking a fresh corpus member makes the delta legible: the two stages that already had evidence keep it, and the four that did not are visible as additions to the same bundle rather than as a different measurement.

It is chosen over any v9 corpus member on three properties the stages require:

1. **An intake route.** `/apply` is Definition-backed capture from a respondent — the one `routeClass` that *admits* tenant chrome theming ([ADR 0161](../../../thoughts/adr/0161-route-class-and-rendering-ring-boundary.md) §6).
2. **A proof route.** The bundle as it stands has none; the demo adds `/receipt/:caseRef` — the artifact a landlord or court relies on off-platform. This is the refusing side of bar 4, and the reason a v9 corpus member could not be used unchanged: v9's proof-shaped surfaces (`verifier`, `trust-center`) are separate bundles with no intake route.
3. **A signature moment.** The bundle as it stands has none; the demo adds `/certify` (`ceremony`) — the applicant's declaration under penalty of perjury. The app's own signature moment sits beside the *release* signature the sign-off stage produces, which keeps the two kinds of signing visibly distinct instead of letting the demo imply that an internal sign-off is an end-user attestation ([ADR 0159](../../../thoughts/adr/0159-product-substrate-recognition.md) substrate rejection #5).

Four routes, one Definition, one Experience, one Theme, one bundle-local Registry.

| routeId | path | routeClass | Tenant chrome theming |
|---|---|---|---|
| `apply` | `/apply` | `intake` | **admits** |
| `certify` | `/certify` | `ceremony` | refuses |
| `receipt` | `/receipt/:caseRef` | `proof` | refuses |
| `queue` | `/queue` | `operation` | refuses |

## Stage mapping

One kernel, one MCP process, six stages in order. Each stage writes its substrate state to `evidence/`.

| Stage | Actor | What happens | Substrate state after |
|---|---|---|---|
| **1 Idea** | `ai-agent` | The brief becomes four Experience units with actor and task refs. **No Definition.** | Experience document, `units[]` populated, `targetDefinition` absent |
| **2 Plan** | `ai-agent` | Definition declared + four items. Four routes added — **the agent's `routeClass` writes are refused** (0152 beat 1) and it keeps drafting without them. Slots bound. | Definition + Surface draft with unclassified routes |
| **3 Build** | `ai-agent`, then `human` | 0160 verbs: `declareRegistry` (bundle-local) + `addRegistryEntry` ×N; `declareTheme` — **refused for the agent** (0152 beat 3), declared by the human — + `setThemeToken`. Then **one deliberate human edit** the regeneration stage must preserve. | Registry + Theme minted; designer edit in the Surface |
| **4 Sign-off** | `human` | Human classifies all four routes (0152 beat 2 — the same posture that refused the agent admits the human). `exportBundle`. Canonicalize. **Authored signature over the canonical export.** | Signed bundle + `AuthoredSignature` record |
| **5 Release** | — | `produceAppGraphValidationReport` over the themed graph → release evidence including the THEME-ROUTE-CLASS beats. **Offline signature verification from the exported bundle alone.** | Validation report + verification result |
| **6 Feedback** | `human` → `ai-agent` | A change request amends the brief. Regeneration runs. **Does the designer's edit survive?** | Regenerated bundle + merge verdict |

### The deliberate human edit (stage 3)

Two edits on the intake route, both landing in the exported Surface document so survival is measurable byte-for-byte rather than inferred:

- **An insertion.** The designer adds a `static-content` text slot carrying one plain-language sentence the AI never wrote: *"You can apply even if you have already received help this year."*
- **A modification.** The designer retitles the AI's `applyForm` slot from the generated *"Application form"* to *"About your household."*

Insertion and modification are separated because [`regeneration-merge-spec.md`](../../specs/component/regeneration-merge-spec.md) §5.3 classifies them as different delta classes with different merge outcomes. A merge that preserved one and dropped the other would be invisible if only one edit were made.

## Pre-registered bars

Each bar states its own falsifier. **A bar that reports `met: false` is a result, not a failure of the spike.**

### Bar 1 — trace connectivity

Every stage's artifacts trace back to the originating brief / Experience, using the substrate's own trace and provenance machinery as it exists.

**Met iff** a single connected chain links `brief line → Experience unit → task → Surface route → slot → Definition item → Component node`, where every hop is either (a) an edge in the kernel's own `TraceIndex` (`rebuildTraceIndex` / `queryTrace`, digest-verified fresh) or (b) a reference physically present in the documents `exportBundle` returns. Hops asserted by the spike's own bookkeeping and by nothing else do not count.

**Falsifier:** any hop reachable only through the spike's private records.

**Known risk, recorded before running:** the kernel exposes `bindActor` and `bindTask` but no op that writes `unit.itemRefs` after a unit exists, and `addUnit` conflicts on re-add. If the Experience → Definition-item hop can only close through the Surface route that binds both, that is reported as the hop's actual shape, and the missing verb is named.

### Bar 2 — offline signature verification

The authored signature produced at sign-off verifies **offline, from the exported bundle**.

**Met iff** a verification path that reads only the committed evidence files — no kernel, no MCP, no live process state — recanonicalizes the export, reconstructs the COSE `Sig_structure`, and verifies the Ed25519 signature; **and** the same path returns `failed` when one byte of the export is mutated.

**Falsifier:** verification that passes on a tampered export, or verification that requires the signing process to still be alive.

**Recorded choice.** [ADR 0083](../../../thoughts/adr/0083-formspec-native-authored-signatures.md) is `Accepted` and owns `Response.authoredSignatures`; `formspec/specs/core/spec.md` §2.1.N pins the preimage as `formspec.response.signed-payload.v1 || 0x00 || JCS(response_without_authoredSignatures)` with method `urn:formspec:sig-method:ed25519-cose-sign1@1` (`formspec/registries/signature-method-registry.json`). That machinery signs a **Response** — a filled instance. This demo signs a **bundle export**, which no shipped canonicalization profile covers, and ADR 0111 forbids cross-domain reuse of a domain tag. So the spike reuses every primitive and mints one spike-local domain tag: `formspec.spike-v10.bundle-export.signed-payload.v1 || 0x00 || JCS(export)`. The signature record conforms to `response.schema.json` `$defs/AuthoredSignature` and is Ajv-validated against it. **This is a spike-local profile, not a promotion candidate**; a real bundle-signing profile is a spec change, named in §Follow-ups.

### Bar 3 — the 0152 beats fire legibly mid-journey

The ADR 0152 authorization beats fire inside the lifecycle walk, not in a separate test.

**Met iff** the `ai-agent` is refused `surface.routeClass` at stage 2 and `theme.declaration` at stage 3, each refusal naming the vocabulary, the value, and the actor URN in its message; the agent keeps working after each refusal; nothing is smuggled into the substrate by a refused write; and the `human` succeeds at both under **the same posture declaration**.

**Falsifier:** a refusal that is fatal to the journey, a refusal whose message does not name what was refused, or a refused write that nonetheless left state behind.

### Bar 4 — THEME-ROUTE-CLASS in the release report

Tenant theming is admitted on the intake route and refused on the proof route, in the stage-5 release report.

**Met iff** the release validation report's `cross-artifact` phase reaches `completed`, and `THEME-ROUTE-CLASS` fires exactly once for the `proof` route's widget and zero times for the `intake` route's widget, with the diagnostic's own `details` naming `routeClass` and `reason`.

**Falsifier:** zero fires (the guard is asleep), a fire on `intake`, or a `cross-artifact` phase that skipped — a phase that did not run makes "no diagnostics" vacuous.

### Bar 5 — THE MOAT BAR: regeneration with designer-edit preservation

After the feedback stage triggers a regeneration, the deliberate human edit made at build stage **survives**, proven by the regeneration-merge machinery as it exists.

**Met iff** the substrate's own regeneration-merge machinery is invoked and returns a merged artifact in which both designer edits are present, together with a `regeneration-merge-report` accounting for them.

**Pre-registered prediction: this bar will fail.** ADR 0159's own falsifier list says the moat has never been demonstrated. The scout pass run before this document found:

- [`formspec/specs/component/regeneration-merge-spec.md`](../../specs/component/regeneration-merge-spec.md) — normative §1–§11, **status Draft**, whose own Status section says conformance *"will be proven by the regeneration merge pytest suite before this draft is promoted."*
- [`formspec/schemas/regeneration-merge-report.schema.json`](../../schemas/regeneration-merge-report.schema.json) — the report shape, pinned by `tests/conformance/spec/test_regeneration_merge_report_schema.py`, which validates **the schema**, never a merge output.
- ~~18~~ **17** fixture scenarios under `tests/conformance/fixtures/regeneration-merge/`, each carrying `old-generated.json`, `designer-edited.json`, `new-generated.json`, `expected-merged.json`, `expected-report.json`.
- No executable merge anywhere: a grep for `regenerationMerge` / `three_way_merge` / `MergeReport` across every `.ts` / `.rs` / `.py` in the stack returns nothing but the schema test and doc comments.

> **Correction, struck not rewritten.** Both `18`s on this page were a **pre-run counting error in the scout pass**, not a change in the corpus: `readdirSync` over the fixture root returns **17** scenario directories, which is what 5b measured and what Part 2 reports throughout. Struck rather than silently edited — a pre-registration that gets quietly reconciled to its own results is not a pre-registration.

**So the bar is run as a measurement, not as a demonstration**, in three parts, each of which can independently falsify the prediction:

- **5a — API-surface probe.** Enumerate the exported members of `@formspec-org/studio-core`, `@formspec-org/mcp-wireframes`, `@formspec-org/app-graph`, `@formspec-org/engine` and `@formspec-org/types` at runtime and report every export whose name matches `/regenerat|three.?way|mergeReport/i`. If one exists, the prediction is wrong and the spike calls it. *(Widened after the run — see Part 2 §5a. The pattern above is a name guess, and a name guess alone cannot license the claim the walkthrough makes from it.)*
- **5b — fixture-corpus probe.** Count the ~~18~~ **17** shipped scenarios, count how many assert designer-edit survival in their `expected-merged.json`, and count how many are executed by any code in the repo. The gap between the second and third numbers is the finding.
- **5c — live measurement.** Snapshot the three-way inputs the spec names — `old-generated` (the Surface at end of stage 2), `designer-edited` (end of stage 3), `new-generated` (the Surface a fresh kernel produces from the amended brief at stage 6) — then report, edit by edit, what a consumer of the substrate as it ships today actually receives.

**No merge is implemented in this spike.** Writing one here would make the bar unfalsifiable: the claim under test is what the *substrate* does, and a spike-local merge is not the substrate.

### Bar 6 — the five ADR 0160 acceptance bars hold on this exemplar

[ADR 0160](../../../thoughts/adr/0160-mcp-materialisation-verbs.md) §7's five bars stay met on this new bundle, at the scope §7 defines.

**Met iff**, on the release validation report: `ARTIFACT-MISSING` ≤ 1; `THEME-TOKEN-REF` = 0; `MODULE-UNRESOLVED` + `MODULE-CONTRIBUTION-MISSING` = 0 on `verb-family`-scoped diagnostics; `cross-artifact` = `completed`; and the slot/route census is unchanged between the report run and the authored graph — the control that says no bar was cleared by authoring less. The `targetDefinition` spec rev (bar 5) is checked by the Theme and Experience documents exporting at all on this Definition-bearing bundle.

**Falsifier:** any of the five failing on an exemplar authored entirely through the v1 verb family with no host loader wired.

## Method

- **No host `ArtifactLoader` anywhere.** Every artifact the graph validates is bundle-local, served by `kernel.resolveBundleLocal` (ADR 0160 §4.4). Wiring a loader "just in case" would make bar 6 unfalsifiable.
- **Real Ajv over the shipped `formspec/schemas/*.json`**, v9's pattern, no stubs.
- **The served documents are the kernel's own exports**, never spike-derived projections. v9's correction, kept: a document the spike hand-derives can assert anything the spike wrote down.
- **`V10_OUTPUT_ROOT` guard**, mirroring v9's. Evidence defaults to the spike dir so a deliberate re-measurement rewrites it; any run that is not a re-measurement redirects.
- **The walkthrough is generated from the evidence JSON**, never hand-written. The JSON is the provenance; the HTML is the deliverable.

## Out of scope

- Trellis. WOS. Any ledger anchoring, case event, or export manifest.
- Rendering. The walkthrough renders the *story*, not the app.
- Any modification to a substrate package. A gap this spike finds is reported, not patched.
- Implementing regeneration merge. See bar 5.

---

# PART 2 — RESULTS

*Written after the run of **2026-07-26**. Numbers are read from `evidence/lifecycle.json`, not from memory.*

> **Everything in Part 2 is the 2026-07-26 measurement and stands as written.** Bar 5 closed on 2026-07-27 — the merge shipped and the same probes now report it met. The re-measurement is [PART 3](#part-3--addendum-2026-07-27--the-moat-closed); it does not amend the numbers below, and the committed evidence under `evidence/` is now the 2026-07-27 run.

## Verdict

**5 of 6 bars met. Bar 5 — the moat — is not met, as pre-registered.**

| Bar | | Headline |
|---|---|---|
| 1 Trace connectivity | **met** | All five hops hold; two are kernel-built `TraceIndex` edges, three are references in the exported documents. **Narrower than it sounds: only 1 of the 4 journey entries is route-mounted**, so the unit→route hop holds over 1 of 4 (finding 7) |
| 2 Offline signature | **met** | `verified` from the committed files alone; one changed byte → `failed` |
| 3 The 0152 beats | **met** | 9 refusals across the walk, every one naming vocabulary + value + actor; the agent kept working; nothing leaked |
| 4 THEME-ROUTE-CLASS | **met** | 0 fires on `intake`, 1 each on `ceremony` / `proof` / `operation`, `cross-artifact: completed` |
| 5 **The moat** | **NOT MET** | **No regeneration merge exists to run.** Both designer edits destroyed |
| 6 ADR 0160's five bars | **met** | All five hold on a new exemplar authored through the verb family with zero host loaders |

Evidence: [`../../spikes/lifecycle-demo-v10/evidence/lifecycle.json`](../../spikes/lifecycle-demo-v10/evidence/lifecycle.json).
Walkthrough: [`../../spikes/lifecycle-demo-v10/lifecycle-walkthrough.html`](../../spikes/lifecycle-demo-v10/lifecycle-walkthrough.html).

**ADR 0159 §The lifecycle thread now has evidence at all six stages** (it had one). **§The technical move nobody else has still has none, and now has a measurement saying why.**

## Bar 5 — the moat, in detail

The pre-registered prediction held. Three independent probes agree:

- **5a, API surface.** **332 runtime exports** enumerated across `@formspec-org/{studio-core,mcp-wireframes,app-graph,engine,types}`, scanned twice. **Zero** match a regeneration-merge entry-point name (`/regenerat|three.?way|mergereport|mergedraft|sourceanchor/i`). **Seven** match the merge spec's own §3/§9 identity vocabulary (`/anchor|x-?generation|generationmarker|designeredit|preservation/i`), every one in `@formspec-org/studio-core`: `emptyAnchorMappingsDocument`, `validateAnchorMappingsDocument`, `appendAnchorMapping`, `anchorString` — the §9 `$formspecAnchorMappings` rename document, whose own `@filedesc` cites §9 — and `anchorsOf`, `computeAnchorGroups`, `reanchorEntries` in [`proposal-anchors.ts`](../../../formspec-studio/packages/formspec-studio-core/src/proposal-anchors.ts), whose `@filedesc` says its identity rule *"mirrors `regeneration-merge-spec §3`"* and applies it to ProposalManager changeset grouping. **So the merge's identity and rename primitives ship; nothing composes them over a Component tree.** Runtime enumeration, not grep — a grep can miss a re-export and a `.d.ts` can promise what the JS does not ship.

  **The second pass is a post-run widening, recorded as one.** Pre-registration scanned only the entry-point pattern; review found that a shipped merge could surface under a name that pattern misses, which would make the walkthrough's most prominent negative ("zero merge entry points across 332 exports") a claim wider than its probe. The widened sweep did not overturn the prediction — it sharpened it, and it is why `apiProbe.patternsScanned` now ships in the evidence so the reader can re-run the same sweep. `merge` alone is deliberately not in the second pattern: `mergeBreakpointNamespace` (Theme breakpoints) shows the word is generic in this corpus.
- **5b, the shipped corpus.** `regeneration-merge-spec.md` is **Draft 1.0.0-draft.1**. `regeneration-merge-report.schema.json` ships. **17** fixture scenarios ship, every one carrying the full `old-generated` / `designer-edited` / `new-generated` triple **plus expected merge outputs**, and **10 of them assert that a designer-only value survives** — computed over the fixture JSON, not read off directory names. **No test in the repo reads any of those expected outputs.** The conformance suite collects **17 tests** under `-k regeneration`, all in `test_regeneration_merge_report_schema.py`, which validates the report *shape* and never runs a merge. Nine further files name the corpus without executing it — including `comp_bundle_id_audit.py`, whose only reference is an `EXCLUDED_TREES` entry that *skips* it.
- **5c, live.** The change request splits the form across two pages, so regeneration is a real structural change and not a re-run: `old-generated` has 3 routes, `new-generated` has 4. Both designer edits are gone from it — the inserted sentence and the retitled heading. `survivingEdits: 0 / 2`.

**The moat is specified, fixtured, and unbuilt.** The gap is not "no design" — the design is written down to §11 and the acceptance corpus already exists with expected outputs. The gap is that nothing executes it. That is the shortest path this ADR has to its own promotion condition 3: wire the 17 shipped scenarios to an implementation and the corpus grades it.

*A spike-local merge was deliberately not written. The claim under test is what the substrate does; a merge implemented here would have made the bar unfalsifiable.*

## Findings the walk produced

Each was measured, not inferred. None is worked around silently; each is recorded as a beat in the evidence and visible in the walkthrough.

1. **No verb persists the brief.** `wireframeFromBrief` takes a `brief` string and forwards only `id`, `version`, `title` to `createBundle`. The brief survives into the substrate solely as the units it produced — which is why bar 1's first hop had to be measured against the exported Experience rather than assumed.
2. **No `bindItem`.** `bindActor` and `bindTask` exist; nothing writes `unit.itemRefs` after a unit exists, and `addUnit` conflicts on re-add. **The Experience→Definition link ADR 0159's Plan row describes ("Experience binds to items") is unreachable through the verb surface.** The two meet on the Surface route that binds both instead, which is what bar 1's fourth hop actually measures.
3. **`routeClass` is write-once, and that breaks the 0152 story across a handoff.** The Surface op set is `addRoute` / `bindSlot` / `removeSlot` / `addTransition` — no `removeRoute`, no `setRouteClass`, no route update. `addRoute` on an existing id is `CONFLICT`, **measured on the *human's* kernel** — re-classing `/apply` from `intake` to `proof` under the actor the posture admits returns `CONFLICT — Surface route 'apply' already exists.` The probe has to run there: `ProposalManagerFacade.addRoute` checks the ADR 0152 posture as its first statement, so on the agent's kernel the posture always answers first and the refusal is stage 2's again — a message about *who* may write the vocabulary, carrying no information about write-once. The agent-kernel call is recorded beside it as the contrast, not quoted as the finding. So ADR 0152's *"the refusal is legible, not fatal"* holds **inside one session and fails across the handoff**: a route the agent was refused a class on is created unclassified, and nothing can ever classify it. `demo-beats-adr-0152.test.ts` never crosses that seam because its two beats use separate bundles. **The person must author the routes themselves**, which is what this walk does.
4. **There is no actor-handoff verb.** The kernel reads the acting actor from its construction context, and supplying a kernel together with posture options is a construction-time error — one kernel is one actor. The handoff is necessarily a new session replaying the authored state. The walk checks the replay against the agent's own exported documents rather than assuming it, and the check passes.
5. **`AuthoredSignature` cannot describe a signature over anything but a Response.** `signedPayload.canonicalization` is `const: "formspec-response-signing-v1"`. The record produced here conforms on **every other field** and fails on that one, because claiming the const for bundle-export bytes is exactly the cross-domain reuse ADR 0111 forbids. **Widening it is a spec change, not a spike fix.** See §Follow-ups.
6. **`addAction` mints a Response Actions document no manifest slot names.** `readAppManifest` emits no `responseActions` key and `exportBundle` does not serialise it, so the `submit` transitions cannot resolve — 2 `APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER`, verb-family-scoped. **This is ADR 0160 §4.2(b) ("no mint without a declaration") firing on a kind §6.5 does not list as excluded.** 0160 fixed the identical defect for `ensureExperience` and left this one.
7. **A Definition-bearing bundle cannot mount a non-form unit on a non-form route.** `APP-GRAPH-SURFACE-EXPERIENCE-UNIT-DEFINITION` requires any route mounting a unit to carry a `definition-form` slot for the Experience's `targetDefinition`, which the kernel stamps automatically. On this app that makes the receipt, the signing screen and the staff queue unmountable. **The rule reads `targetDefinition` as "every unit collects for this form"**, which is false of `attestation`, `confirmation` and `review` units. A first run mounted units on all four routes and measured 3 of these errors.
8. **ADR 0160 §8.1's naming hazard is still open, and it is a trust hazard, not a cosmetic one.** `ui-graph-policy.schema.json` requires `theme.assignments[].widgetRef.widgetName` to match the **contribution-id** pattern; `validateThemeRouteClass` joins assignments to routes on the **Surface binding's** `widgetName`. A first run took the PascalCase branch and reproduced v9's numbers exactly — 4 `APP-GRAPH-SCHEMA` + 4 `MODULE-CONTRIBUTION-MISSING`, `cross-artifact` skipped on `schema-errors`, **and zero `THEME-ROUTE-CLASS` fires.** Rewriting only the policy clears the schema and breaks the join, silencing the guard the other way. **The only shape in which the schema passes and the trust guard can fire is naming the widget in `x-` form everywhere**, which is what this exemplar does. Until §8.1 closes, a plausible naming choice silently disables a trust rule.
9. **The staff console needs its own Surface.** Route-graph reachability requires every route to be reachable from the entry; a caseworker queue reachable from an applicant's receipt would be a lie about the app told to satisfy a linter. Two surfaces in one bundle is the truthful shape and `surfaces[]` is plural for it — but the kernel is single-runtime per surface draft, so the second surface must be declared explicitly with `addSurface`; `wireframeFromBrief` mints only one.

## What bar 2 actually proves

`verified` came from the shipped `WebCryptoVerifier` against the shipped `signature-method-registry.json` (v1.1.0) under method `urn:formspec:sig-method:ed25519-cose-sign1@1`, reading only:

```
evidence/stage-4-signoff.bundle-export.json
evidence/stage-4-signoff.authored-signature.json
formspec/registries/signature-method-registry.json
```

No kernel, no MCP, no live signing state. The method URI is read out of the **COSE protected header**, never out of the JSON record, so a record claiming a method its envelope does not carry cannot pass. The signature is **detached** (`payload = null`, ADR 0109 consumer shape), which is what makes the tamper control meaningful: the verifier must rebuild the preimage from the export on disk. Changing one byte — the respondent Surface's `id` — flips the verdict to `failed`.

**Recorded choice, restated so it is not mistaken for a promotion.** The domain tag `formspec.spike-v10.bundle-export.signed-payload.v1` is spike-local. Every primitive under it is shipped substrate: RFC 8785 JCS via `canonicalize`, `@integrity-stack/cose` byte helpers, `@integrity-stack/signature-adapter-webcrypto`, the shipped registry.

## Method notes

- **No host `ArtifactLoader` is wired anywhere.** Every artifact validated is bundle-local, served by `kernel.resolveBundleLocal`. Wiring one would have made bar 6 unfalsifiable.
- **Real Ajv over the shipped `formspec/schemas/*.json`.** No stubs. `demo-beats-adr-0152.test.ts` passes `() => ({ ok: true })`, which is why the naming hazard in finding 8 is invisible there.
- **Every served document is the kernel's own export**, never a spike-derived projection.
- **The walkthrough is generated from `evidence/lifecycle.json`.** Its attribution is load-bearing: `admitted` / `refused` beats quote the substrate verbatim under "The substrate said"; `recorded` beats are the walk's own notes and are labelled "What the walk found". Nothing on the page puts words in the substrate's mouth.

## Follow-ups

Named, not scheduled. Ordered by what unblocks the most.

1. **Implement regeneration merge against the 17 shipped scenarios.** The corpus already carries expected outputs and 10 preservation assertions; wiring an implementation to it grades itself. This is ADR 0159's promotion condition 3 and the only bar this spike could not meet.
2. **Close ADR 0160 §8.1.** Finding 8 shows the hazard silently disables `THEME-ROUTE-CLASS`, which is a trust rule. Either the policy field takes the Surface binding's vocabulary or the join takes the contribution id — but the two cannot keep disagreeing.
3. **Declare Response Actions in the manifest** (finding 6). Same fix ADR 0160 §4.2(b) already applied to `ensureExperience`.
4. **Decide whether a route class is amendable** (finding 3). Today an AI-drafted unclassified route is permanently unclassifiable, which makes the AI-drafts-human-ratifies journey unwalkable without re-authoring.
5. **A bundle-signing profile**, or an explicit decision that bundle export signing is out of scope (finding 5). `AuthoredSignature`'s `canonicalization` const is the blocker and it is load-bearing — loosening it without a registry of profiles would re-open the cross-domain reuse ADR 0111 closes.
6. **`bindItem`, or a statement that the Experience→Definition edge lives on the Surface** (finding 2). ADR 0159's Plan row currently describes a binding the verb surface cannot perform.
7. **Revisit `APP-GRAPH-SURFACE-EXPERIENCE-UNIT-DEFINITION`** (finding 7) — a bundle-scoped Experience with mixed unit kinds is the normal case, not an edge case.

## Re-running

```sh
cd formspec/spikes/lifecycle-demo-v10
npm install
V10_OUTPUT_ROOT=/tmp/v10 npm run spike   # any run that is NOT a re-measurement
npm run spike                            # deliberate re-measurement — rewrites committed evidence
```

**Rebuild the substrate packages first.** The spike imports built output; `vitest` and `tsc` do not refresh it.

---

# PART 3 — ADDENDUM 2026-07-27 — the moat closed

*Appended after a second run. Part 1 (pre-registration) and Part 2 (the 2026-07-26 results) are untouched: the arc — measured missing, then closed — is the finding, and rewriting the negative would delete the evidence that the bar was falsifiable.*

## Verdict

**6 of 6 bars met.** Bar 5 flipped from NOT MET to MET. Bars 1–4 and 6 re-ran unchanged.

| Bar | 2026-07-26 | 2026-07-27 |
|---|---|---|
| 5 **The moat** | NOT MET — `survivingEdits: 0 / 2`, no merge entry point, 0 tests executing the corpus | **MET** — `survivingEdits: 2 / 2`, entry point `kernel.regenerateSurfaceDocument`, 17 / 17 corpus scenarios reproduce their expected merged document *and* their expected report |

## What shipped

Follow-up 1 ("implement regeneration merge against the 17 shipped scenarios") is done, in the order the follow-up named: the corpus grades the implementation, not the other way round.

- **The engine** — [`packages/formspec-core/src/regeneration-merge.ts`](../../packages/formspec-core/src/regeneration-merge.ts). `regeneration-merge-spec.md` §2–§9, conformance §11 Levels 1–3 (algorithm, report shape, invariants). It lives in `formspec-core` rather than `studio-core` for two reasons that both point the same way: the merge is renderer-independent by §1.2, and the acceptance corpus is formspec-side, so the runner and the thing it grades sit in one repo with no cross-submodule test dependency.
- **The seam** — §6's identity, children and node-type live behind a `MergeDocumentAdapter`. `componentMergeAdapter` reads `x-generation.anchors[]`; `surfaceMergeAdapter` derives `surface:` / `route:` / `slot:` anchors from the spec-required stable ids, because the Surface family carries no `x-generation` and this walk's artifact is a Surface. Nothing in the algorithm is adapter-aware — the Component corpus and the Surface walk exercise the same code.
- **The runner** — [`packages/formspec-core/tests/regeneration-merge-conformance.test.ts`](../../packages/formspec-core/tests/regeneration-merge-conformance.test.ts). 97 assertions over the 17 scenarios: expected merged document, expected report, report-schema validity, determinism, no-mutation, convergence, and the 10 preservation scenarios asserted mechanically rather than by directory name.
- **The shipped path** — `kernel.regenerateSurfaceDocument` on [`StudioCoreKernel`](../../../formspec-studio/packages/formspec-studio-core/src/kernel/StudioCoreKernel.ts), implemented in `ProposalManagerFacade`. The regenerating session's own Surface *is* `new_generated`; the host supplies the §2.4 common ancestor and the designer's version. The op composes the §9 `$formspecAnchorMappings` document the Project already persisted — the primitive that shipped in 2026-07-26's 5a probe with nothing calling it.

## Bar 5 re-measured, same three probes

The probes were not softened. Two changed shape and both changes are recorded here as widenings, in the same spirit as Part 2's second-pass note.

- **5a, API surface.** **341** runtime exports across the same five packages. **4** now match the entry-point pattern (`regenerationMerge`, `regenerationMergeSurface`, `regenerationMergeWithAdapter`, `RegenerationMergeInputError`) where 2026-07-26 found 0; **9** match the §3/§9 identity vocabulary where it found 7. Pattern unchanged. The suite now asserts `noMergeEntryPoint === false`, so a merge that stops shipping fails the bar rather than quietly re-passing it.
- **5b, the shipped corpus — widened to actually run it.** The 2026-07-26 probe could only *count* the corpus and grep for who read it. It now replays all 17 scenarios through the shipped export, from outside the package that implements it: **17 reproduced the expected merged document, 17 the expected report, 0 failures.** `reason` is compared for presence, not text — §11.3 requires the field and §7 gives it no normative wording, so pinning generated prose to fixture prose would grade the copywriting. Every other field is compared exactly, entry order included.
  The consumer scan also moved from `git grep` to a working-tree walk. The question 5b asks is what code is present and runs; staging state is not part of that question, and a runner that exists and passes is a consumer of the corpus whether or not it has been committed. Build output, dependencies and virtualenvs are skipped, so the answer is still about the repo rather than one package's `node_modules`.
- **5c, live.** Same triple, same two edits, same change request splitting the form across two pages. `survivingEdits: 2 / 2`. The designer's inserted sentence is preserved as an orphan under its original parent; the designer's plain-English heading beats the regenerator's. The rebuild's own work still lands — the new `/apply/money` page, the updated page title, the rewritten transitions — which the suite asserts separately, because a merge that preserved the designer by discarding the AI would clear this bar while making the product useless.

## The falsification pass

The gate was checked against itself once. Disabling the two preservation steps in the engine — the designer-value overlay in §6.5 and the §6.7 orphan reattachment — and re-running both gates:

| | preservation on | preservation off |
|---|---|---|
| Conformance runner | 97 / 97 pass | **29 fail**, 68 pass |
| Corpus replay in the spike | 17 merged, 17 reports | **8 merged, 11 reports** (9 scenarios fail) |
| Bar 5 | MET, `2 / 2` | **NOT MET**, `0 / 2` |

Both steps were restored and both gates re-verified green. The bar can fail, which is what makes it worth reporting.

## Spec-versus-fixture calls made during implementation

The corpus is the acceptance suite, so where the fixtures and the §6 prose could be read two ways, the fixtures decided. Each call is recorded because each is a candidate spec clarification, not an implementation detail.

1. **A widget swap takes the designer node whole.** §6.5 reads as a property-by-property overlay that would also emit `COMP-REGENERATION-DESIGNER-SURVIVED` for the swapped node's other property changes. `widget-swap/expected-report.json` emits `COMP-REGENERATION-WIDGET-SWAP` alone. Implemented as the fixture: a swap changes the node's property vocabulary, so overlaying properties across two different widgets is not meaningful. `COMP-REGENERATION-PROPERTY-CONFLICT` still fires on the swapped node when designer and generator both moved the same property to different values.
2. **A child-array delta counts against "clean regenerated" only when it changes what the generated assembly places.** `designer-precedes` and `orphan-broken-binding` both have a `childAdd` on `/tree`, and the corpus reports `COMP-REGENERATION-REGENERATED` for the parent in the second and not the first. The discriminator that reconciles every scenario: the added child resolves in `new_index` (a real assembly change) versus it does not (orphan-pass business). `orphan-cascade` fixes the other half — a child the designer only *moved* is not a removal, because it still exists in `designer_index`.
3. **The merged root is never designer-removed.** §6.4's designer-removed row returns no merged node, but §2.3 requires the merged document to have a root. `orphan-detached` has a designer root that matches nothing, and its expected merged document carries the generated root with no report entry for it. Implemented as: the root always materializes from `new_generated`, and the unmatched designer root is surfaced by the §6.7 orphan pass — which is exactly what that fixture's two `orphaned[]` entries are.
4. **`nodePath` for `COMP-REGENERATION-DESIGNER-REMOVED` is the merged parent.** The node does not exist in `merged`, so it has no path of its own; `designer-removed/expected-report.json` anchors the finding at `/tree`. The merged parent is the nearest surviving location a reviewer can open.
5. **`propertyDeltas` descend into objects.** `rename-migrated` reports `/x-generation/source` and `/x-generation/anchors`, not `/x-generation`. Arrays compare atomically, consistent with §5.2's "array order is significant".
6. **§3.3 duplicate disambiguation is per-document and only for actual duplicates.** Extending every key with the parent chain would break `orphan-cascade`, where the designer moved a node under a new parent and the corpus still expects it matched. The key extends only when the raw anchor set repeats within that document, which is what §3.3 says ("the match key **first** extends to…").
7. **`AnchorMappingsDocument.kind` is studio-local.** The shipped [`project-anchor-mappings.ts`](../../../formspec-studio/packages/formspec-studio-core/src/project-anchor-mappings.ts) requires `kind` on every entry; §9.1's shape is `{from, to}` and `rename-migrated/context.json` carries no `kind`. The engine reads only `from` / `to`, so both shapes pass structurally and `validateAnchorMappingsDocument` keeps its stricter studio-side contract. **Candidate spec note:** §9.1 should say explicitly that additional members are ignored, since §9.1 currently says processors "MUST NOT infer rename semantics from additional members" without saying whether their presence is an error.
8. **`orphan-cascade` silently drops a designer-authored container.** Post-run verification found `designerWrapper` (anchors `['concept:x-designer-wrapper']`) absent from `expected-merged.json` with NO report entry anywhere — the corpus expects a designer-authored node to vanish without a trace, which sits uneasily beside §7's every-outcome-is-reported posture. The engine matches the corpus. **Candidate spec note:** either the fixture owes the node a report row, or §7 should name the case where a designer container dissolves when its children are reclaimed.

## Deferred, honestly

- **§11 Level 4 (resolver composition) is not implemented.** The merge is report-only and never invokes the Component / Component Reference Fields / Experience resolvers. §7.1 and §8.4 make that a *runtime* obligation on the conforming host, and the fixtures' `_base/` peer documents are unused by the algorithm. The `RegenerationMergeContext` carries the peer documents so the composition has somewhere to land, and the §11.5 two-hop `path → item:<path> → anchors` join belongs to the review surface that consumes the report.
- **§10's DOM contract is not implemented.** `data-merge-status` / `data-merge-anchors` are review-surface obligations; no review surface consumes `MergeReport` yet.
- **Custom-component sub-trees are not merged.** The engine walks the main tree. §3.4 mentions `/components/address/tree/...` paths and no fixture exercises them; a second adapter pass over `components[]` is the shape when one does.
- **The merged draft is not written back into the kernel's sidecar draft store.** Committing it would replay designer `routeClass` values through a path that never ran ADR 0152 actor write authority — the exact seam Part 2's finding 3 is about. The op returns a proposal and the decision to accept belongs to a review surface holding the actor that authored the merge. **This is a real follow-up, not a design position:** until it closes, the merge preserves edits for a consumer that reads the returned document, and does not yet preserve them *in the project*.
- **No Python runner.** The corpus executes TypeScript-side. A Python runner would need a second full implementation of §6, which is not cheap; the Python suite still collects the same 17 report-schema tests under `-k regeneration` and still runs no merge. The walkthrough says so in those words rather than implying the corpus is dual-run.

## Follow-ups this addendum adds

Numbered continuing Part 2's list. Part 2's follow-up 1 is closed; 2–7 stand.

8. **Commit the merged draft through an authority-carrying path.** `regenerateSurfaceDocument` is report-only for the ADR 0152 reason above. The accept path needs an actor and a write route, and it is the difference between "the merge preserves edits" and "the project preserves edits".
9. **Promote `regeneration-merge-spec.md` out of Draft.** §11's conformance levels now have an implementation that passes Levels 1–3 against the shipped corpus. The eight calls above are the clarification list; the honest gate for promotion is Level 4, which needs a review surface.
10. **Give the Surface family real source anchors.** The Surface adapter derives identity from stable ids because Surfaces carry no `x-generation`. ADR 0159's GENERATION discipline says source anchors go on *every produced node*; a generated Surface that carried them would let a route survive being renamed, which id-identity cannot.

## Re-measurement provenance

Both gates were run scratch-first under `V10_OUTPUT_ROOT` before the committed evidence was rewritten. The walkthrough regenerates from `evidence/lifecycle.json` as before — its moat section now tells the positive story **and keeps a dated line naming the day the promise was not yet earned**, because the arc is part of the claim.
