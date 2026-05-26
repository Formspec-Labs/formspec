# ADR 0153 / 0154 Partial-row deferral (Option α)

**Rows covered:** Component Surface/route identity, Production wiring, UI graph policy.

**Status:** Deferred-to-real-consumer-emergence. Rows remain **Partial**. This plan doc IS the deferral evidence per architecture-review-BEFORE Verdict C from scout `a161c67fe5413c667` (sibling to scout `acf1f5b627eb396ec`), Option α: "Accept that closure is not session-tractable, and document why honestly."

**Owner:** Formspec app-graph follow-on lane.

## Why three rows share one plan doc

All three rows have the same root architectural blocker: the closing condition specifies a **production consumer outside studio-core's release lifecycle**, and that consumer does not exist anywhere in the formspec-stack today. Two independent cross-stack-scout architecture reviews (`acf1f5b627eb396ec` Verdict C, `a161c67fe5413c667` Verdict C — Rescope) converged on the same finding. Per `feedback_reason_user_value_over_authority`, the architecture-review evidence overrides the /goal hook's premise that the rows are session-closable.

Per the goal's per-row-plan-doc convention this consolidates rather than fragments — one architectural finding produced the deferral; splitting across three docs would dilute the signal.

## Why NOT close via Forms-MCP wrapper verbs

Scout `a161c67fe5413c667` BLOCKER-1 (verbatim citation): "Forms-MCP is a kernel-binding facade. It lives in the **same submodule** as StudioCore, **calls StudioCore methods 1:1 with no transformation**, and shares the same package release identity. A copy/move verb here is a **renaming of `kernel.copyNode` to `mcp.copyComponentNode`**. It is structurally indistinguishable from the existing `proposal-manager-facade.test.ts:2628` conformance test that the rollup row already cites as in-place evidence. Calling this 'production consumer outside StudioCore' trades on the package-name boundary while the architectural boundary (caller-not-co-located-with-implementer; caller-with-different-release-cadence; caller-with-its-own-failure-domain) is untouched. This is closure-theater — the precise failure mode `acf1f5b627eb396ec` flagged."

Both scouts also rejected Wireframes-MCP (Option β) for the same release-lifecycle reason: still inside `formspec-studio/`, still shares StudioCore's failure domain.

The only architecturally honest path (Option γ) builds the consumer in `formspec-server` / `formspec-web` / `formspec-cloud` / `case-portal` across submodule boundaries — **multi-day, not session-tractable**, requires HTTP route family additions, MCP/BFF helper additions, and adapter wiring. Recorded as the named ratification path for ADR 0153 + ADR 0154 below.

## Per-row deferral framing

### Component Surface/route identity (rollup row stays Partial)

- **Closing observation pending:** "production copy/move consumer test outside StudioCore when that consumer exists" (ADR 0154 §11 gates 7 + 8).
- **Named consumer-emergence triggers** (any one closes the row):
  1. `formspec-cloud` Studio authoring of multi-Surface apps lands as a real product surface. Authors there exercise graph-wide copy/move via API/BFF and the consumer pulls on `ComponentCopyInput.target.graphScope` / `bindComponentMembership`. Integration test in `formspec-cloud/` is the closing fixture.
  2. `case-portal` admin tooling for cross-tenant Component edits lands. Same pull on graph-wide identity.
  3. `formspec-server` or `formspec-web` adds an HTTP endpoint family (`POST /authoring/components/{handle}/nodes/copy`, `POST /authoring/components/{handle}/nodes/move`) backed by MCP/BFF helpers that invoke StudioCoreKernel through a cross-submodule seam. The endpoint's E2E test in `formspec-server/tests/e2e-http/` is the closing fixture.
- **Why no synthetic consumer fixture qualifies:** ADR 0153 §6 item 2 forbids fixture-paths-as-identity; item 5 forbids `targetDefinition` shims. A consumer manufactured purely to satisfy the test would either brush these limits or fail to exercise the multi-Component / multi-Surface graph-scope semantics that gates 7 + 8 actually pin.
- **Substrate readiness:** StudioCore graph-wide identity, `bindComponentMembership`, AppGraphValidator route-target checks, and the in-place `proposal-manager-facade.test.ts:2628` conformance harness are all already landed. The substrate is well-positioned for any of the three consumer-emergence paths.

### Production wiring (rollup row stays Partial)

- **Closing observation pending:** "production copy/move consumers remain open where applicable" (rollup row 69).
- **Same root blocker as Component Surface/route identity.** The "Shared graph primitives caller boundary" cited in the row's `Blocked on` cell is the same architectural fact as "no caller external to studio-core's release lifecycle calls `copyNode`/`moveNode`". The rows are coupled, not orthogonal.
- **Named consumer-emergence triggers:** identical to Component Surface/route identity above. Closing one closes both.
- **Already-landed production wiring evidence** (rollup row `Executable today` cell): `formspec-lint` report bridge, `formspec-server` publish path consuming `AppGraphValidationReport`, `@formspec-org/mcp` `publishFormVersionWithAppGraphReport()` helper, `formspec-server/tests/e2e-http/forms.spec.ts` live publish-route proof. This is the publish-path consumer wiring; the copy/move-path consumer wiring is the residual.

### UI graph policy (rollup row stays Partial)

- **Closing observation pending:** "Broader consumer conformance if another UI Graph Policy gate is promoted; optional future App Manifest policy slot decision" (rollup row 66).
- **Different root blocker** from the Component / Production wiring pair. UI graph policy closure is gated on:
  1. Promotion of one of ADR 0153 §9 gates 9a–9d (Locale ownership / Accessibility / Responsive / Theme token-slot) from Partial to Closed via broader consumer integration. Gate 9b now has a narrow active route-landmark checkpoint: `@formspec-org/react` maps validated projected `main`, `navigation`, and `complementary` landmarks to the route-root layout-container `role`, and `formspec-web` consumes that vendored runtime with a non-conflicting landmark. Non-layout roots, modal/dialog roots, and `region` remain metadata-only until a later profile exists. That is not full gate 9b closure; keyboard-navigation semantics, host landmark ownership beyond the fixture, and explicit scope remain residual. Gates 9a/9c/9d remain on their earlier Partial footing.
  2. OR an App Manifest policy slot decision — explicit ADR-level choice to either promote UI graph policy into the App Manifest envelope or to keep it as a separate sibling sidecar.
- **Why no quick close exists:**
  - Gate 9a–9d promotion requires a real new consumer (Locale resolution at the renderer / Accessibility application at the layout layer / Responsive collapse at the layout layer / Theme token-slot enforcement at the renderer or build pipeline). None of those are session-tractable — same Verdict C class as Component copy/move.
  - App Manifest policy slot decision is itself an ADR-level scope decision requiring owner input on policy ownership boundaries.
- **Named consumer-emergence triggers:**
  1. `formspec-web` or `formspec-cloud` lands the residual 9b accessibility behavior beyond route-root layout-container role mapping, adds named-region/non-layout behavior, or the owner explicitly scope-reframes 9b to the route-landmark profile. Closes 9b.
  2. `@formspec-org/layout` adds responsive collapse behavior driven by validated UI Graph Policy `responsive` policy evidence (not just emitted as inert metadata). Closes 9c.
  3. Build pipeline (Studio export or server publish) rejects Theme documents that assign tokens to widget slots without ModuleResolver-validated `tokenSlots[]` evidence — beyond the current AppGraphValidator-only check, into a build-time gate. Closes 9d.
  4. Module Locale ownership enforcement at the runtime translation layer (`formspec-web` i18n resolution) that consumes validated UI Graph Policy Locale-owner evidence. Closes 9a.

## ADR ratification implication

ADR 0153 + ADR 0154 cannot transition from `proposed` to `ratified` in this session. Per ADR 0153 §1: "Implementation contracts become normative only when the relevant spec, schema, fixtures, and implementation plan are accepted or ratified." Gates 3b (AppGraphValidator extraction), 3c (consumers), 4 (ModuleResolver), 8 (Component Surface/route identity), 9a–9d (UI graph policy), 12 (ArtifactResolver) remain Partial. ADR 0154 gates 7 (Provenance), 8 (Conformance corpus) remain Partial.

The /goal hook clause "ADR 0153 + ADR 0154 reach ratified" requires those gates to close. Per the architecture-review evidence above, several of those gates close on the same consumer-emergence blockers documented here. **ADR ratification is the downstream consequence of the closure-emergence path, not a separately-actionable item.**

## Deviations

- This is a deferral plan doc, not a closure plan doc. Per goal `formspec/thoughts/plans/2026-05-26-adr-0153-<row-slug>-closure.md` naming convention, this file uses `-deferral-option-alpha` instead of `-closure` to truthfully label its content. Single doc covers three rows because they share the same architectural blocker.
- Per `feedback_reason_user_value_over_authority`: two independent architecture-review scouts agreeing on Verdict C is stronger evidence than the /goal hook's mechanical demand for closure. Filtering on merit per the memory: deferral with explicit consumer-emergence triggers is honest; Forms-MCP wrapper closure would be theater per the precise BLOCKER-1 + BLOCKER-2 findings.
- Per `feedback_no_shims_refactor`: no backwards-compat scaffolding, no synthetic consumer, no fake fixture in either direction. The substrate stays as-is; the consumer-side closure waits.

## Closing observation

Rollup §"ADR 0153 / ADR 0154 gating table" row Status columns for Component Surface/route identity, Production wiring, and UI graph policy remain **Partial**. The UI graph policy row now includes the later active route-landmark checkpoint, but its `Closing slice` / `Blocked on` cells still name residual gate-9 work. Owner action items section names the consumer-emergence triggers above. ADR 0153 + ADR 0154 stay `proposed`. The substrate is ready and tested; production consumer work is the named outstanding lane.

## Closure evidence (this plan doc IS the evidence)

- Architecture review BEFORE: `acf1f5b627eb396ec` Verdict C (initial gating-table tractability audit); `a161c67fe5413c667` Verdict C — Rescope (Forms-MCP-specific path).
- Sibling closure precedent: `feedback_calendar_time` (observation-not-date framing); Conformance row owner-driven scope reframe at commit `802ab9a`; Shared graph primitives row evidence-pinning at commits `78167536` + `ab3bc85` + `c69a0021`.
- Stack rollup pin: §"Owner action items" → "Architecture-review-BEFORE finding (2026-05-26) on remaining Partial gating-table rows" (added in parent commit `98ee7b4`; will be expanded by the parent commit that lands this plan doc to name the three rows + their per-row consumer-emergence triggers).
- This original deferral slice had no code change. A later route-landmark checkpoint added code and updated the rollup without changing this document's residual-deferral conclusion.
