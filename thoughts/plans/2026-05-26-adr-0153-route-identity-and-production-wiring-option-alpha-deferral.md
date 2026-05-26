# Option α deferral — Component Surface/route identity + Production wiring rows

**Rows:** stack rollup [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"ADR 0153 / ADR 0154 gating table" → "Component Surface/route identity" (Partial) and "Production wiring" (Partial).

**Status:** intentionally deferred — both rows remain Partial pending real consumer emergence.

**Closing slice per rollup:** both rows close on "Production copy/move consumer test outside StudioCore when that consumer exists". Per architecture review the consumer must be *outside* the studio-core release lifecycle, *not* a thin wrapper inside the same submodule.

## Why this slice does not close the rows

Two independent cross-stack architecture-review-BEFORE scouts have evaluated the closure path and returned the same finding:

- **`acf1f5b627eb396ec`** (tractability audit) — Verdict C: "Not session-tractable. Closing fixture/test = 'Production copy/move consumer test outside StudioCore when that consumer exists' — that consumer does not exist in any submodule today. Forcing closure now would require either fabricating a synthetic consumer (closure-theater) or building real cross-route product behavior (out of session scope)."
- **`a161c67fe5413c667`** (re-review against owner /goal hook override) — Verdict C — Rescope: "Forms-MCP product verbs that wrap `kernel.copyNode` / `kernel.moveNode` 1:1, in the same submodule, in a form-authoring-shaped product MCP, sharing the same release lifecycle and the same failure domain, is **the same conformance test the rollup row already cites as `Partial`-not-`Closed` evidence**. Landing them flips no honest signal; it widens MCP surface area and inflates plan/test debt to preserve the appearance of progress."

Forms-MCP at `formspec-studio/packages/formspec-mcp/src/product-verbs.ts` consumes `@formspec-org/studio-core` directly. Constructor at line 134 instantiates `StudioCoreKernel`. Every existing verb (e.g. `addFormField` line 161) is a thin pass-through. A `copyComponentNode` / `moveComponentNode` verb here would be structurally indistinguishable from the existing public `StudioCoreKernel` consumer conformance test at `formspec-studio/packages/formspec-studio-core/tests/kernel/proposal-manager-facade.test.ts:2628` that the rollup row 65 already cites as Partial-not-Closed evidence.

Same-submodule, same-release-lifecycle, same-failure-domain. The rollup row text says "outside StudioCore"; the architecturally honest reading is "outside the studio-core release lifecycle" — i.e. a caller that can drift independently.

## Why this is Option α not Option β/γ

The architecture-review-BEFORE scout `a161c67fe5413c667` named three rescope options:

- **Option α** — Accept that closure is not session-tractable, and document why honestly. Recognize the row as deferred-to-real-consumer-emergence, status remaining Partial with a precise blocking observation.
- **Option β** — Build the verb in Wireframes-MCP instead of Forms-MCP. Wireframes-MCP is the correct product home for multi-Component journeys per ADR 0150 §14 P3. Still same-submodule, still doesn't legitimately close.
- **Option γ** — Build the consumer in `formspec-server` or `formspec-web` across submodule boundaries via the existing MCP/BFF seam (precedent: `publishFormVersionWithAppGraphReport`). Architecturally honest closure. Multi-day work.

This plan executes Option α. Per `feedback_reason_user_value_over_authority` and `feedback_calendar_time`: the owner /goal hook is a signal, not authority that can override the architectural fact that no submodule outside formspec-studio currently has a use case for graph-wide copy/move. Manufacturing one in Forms-MCP fabricates the consumer rather than discovering it.

Option γ is the architecturally correct path; it is **multi-day work** crossing `formspec-server`, `formspec-mcp`, `formspec-web` submodule boundaries with a new HTTP endpoint family. Owner's call whether to execute it in a separate session.

## Named consumer-emergence triggers

The rows transition Partial → Closed when ANY of these consumer-emergence triggers fires (named-observation-not-date framing per `feedback_calendar_time`):

1. **`formspec-cloud` Studio authoring of multi-Surface apps lands.** Cloud UI is the natural multi-Surface authoring consumer; its emergence creates the multi-Component / multi-Surface bundle shape that graph-wide copy/move semantics serve.
2. **`case-portal` admin tooling needs to relocate or duplicate Component nodes across routes for case templates.** Case templates spanning multiple intake routes naturally need graph-wide identity for clone/move operations.
3. **Wireframes-MCP graph-edit verbs land for real consumers** (i.e. a downstream caller of Wireframes-MCP that actually invokes copy/move across routes, not just authors a single-route wireframe). This satisfies "consumer outside studio-core release lifecycle" if Wireframes-MCP's release cadence diverges from studio-core's per its standalone product positioning.
4. **`formspec-server` or `formspec-web` calls `copyNode` / `moveNode` through the MCP/BFF seam** (Option γ). Architecturally honest closure across submodule boundaries.

Each trigger is observable — a real call site to `kernel.copyNode` or `kernel.moveNode` in code paths outside `formspec-studio/packages/formspec-studio-core/`.

## What does NOT trigger closure

Explicitly excluded to prevent closure-theater:

1. Adding `copyComponentNode` / `moveComponentNode` thin-wrapper verbs to Forms-MCP or any other package inside `formspec-studio/`. Confirmed Verdict C by both scouts.
2. Synthesizing a multi-Component fixture in StudioCore's test tree as "outside-StudioCore" evidence. Same release lifecycle = same conformance harness.
3. Marking the rows Closed via owner scope reframe **without** changing the closing condition text. Scope reframes that match real user value (like the Conformance row's commit `802ab9a` reframe) are legitimate; reframes that move the goalposts to hide unmet conditions are not.

## Deviations

- Slice scope is **honest deferral**, not closure. Per `feedback_reason_user_value_over_authority`: two architecture-review-BEFORE scouts independently returned the same finding — the closing condition specifies a consumer outside `formspec-studio` that doesn't exist anywhere in the stack today. Per `feedback_conceptual_nugget`: the tractable nugget under the owner /goal hook is documenting the deferral with named triggers, not pretending closure happened.
- Stack rollup row Status remains Partial for both rows. Closing-evidence column is updated to cite this plan doc + both scout verdicts. Owner can override and flip Status to Closed via explicit scope reframe (precedent: Conformance row commit `802ab9a`) but only if the reframe is honest about what's been substituted for the original closing condition.

## Closing observation

Two architecture-review-BEFORE scouts (`acf1f5b627eb396ec`, `a161c67fe5413c667`) returned the same Verdict C / Option α finding. The owner /goal hook's premise that these rows are session-closable is incorrect against the codebase reality: the consumer the closing condition names does not exist in any submodule outside `formspec-studio` today. Plan doc landed; rollup row evidence cells updated to surface the architecture-review finding; named consumer-emergence triggers pinned for future closure detection.

## Closure evidence

- Plan doc: this file.
- Architecture-review-BEFORE scout `acf1f5b627eb396ec` verdict (tractability audit) — file: subagent transcript at task `acf1f5b627eb396ec`.
- Architecture-review-BEFORE scout `a161c67fe5413c667` verdict (re-review against /goal hook override) — file: subagent transcript at task `a161c67fe5413c667`.
- Rollup row evidence updates: stack-root [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"ADR 0153 / ADR 0154 gating table" → "Component Surface/route identity" + "Production wiring" rows cite this plan doc.
- Named consumer-emergence triggers: documented in §"Named consumer-emergence triggers" above.
