# Option α deferral — UI graph policy row

**Row:** stack rollup [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"ADR 0153 / ADR 0154 gating table" → "UI graph policy" (Partial).

**Status:** route-landmark checkpoint landed after this deferral was written; row remains Partial pending residual gate-9 promotion or App Manifest policy slot owner decision.

**Closing slice per rollup:** "Broader consumer conformance if another UI Graph Policy gate is promoted; optional future App Manifest policy slot decision". Closing fixture/test: "App-graph runtime conformance + production caller wiring". Blocker: ADR 0153 gates 9a–9d.

## Why this row does not close

The closing slice is **conditional**:

1. **"if another UI Graph Policy gate is promoted"** — gates 9a (Locale ownership), 9b (Accessibility route), 9c (Responsive route), 9d (Theme token-slot) are all individually Partial per ADR 0153 §9 with their own closure conditions ("broader consumer integration"). Promotion of any one to Closed would be a separate ADR-level scope decision against gate 9x's own conditions.
2. **"optional future App Manifest policy slot decision"** — adding a UI Graph Policy slot to App Manifest is a substantial ADR-level decision (App Manifest schema revision + cross-stack coordination) that has not been authored.

Per architecture-review-BEFORE scout `acf1f5b627eb396ec` Verdict C: "Closing slice is conditional ('if another UI Graph Policy gate is promoted' / 'optional future App Manifest policy slot decision'). Trigger has not fired. Promotion of either is itself an ADR-level decision, not session work. Pulling one in arbitrarily under a /goal hook would be closure-theater — it converts a conditional-promotion-when-evidence-arrives into a forced-promotion-because-/goal-fired. Worse, the *conditional* is the architectural value: promotion-on-evidence-not-deadline is the right discipline per `feedback_calendar_time`."

Forcing closure now would either:
- Promote gate 9a/9b/9c/9d unilaterally without the prerequisite "broader consumer integration" evidence — closure-theater
- Author an App Manifest policy slot ADR + schema revision + fixture cascade — multi-day cross-stack work

## What HAS landed for this row

The row's `Executable today` cell already pins substantial UI Graph Policy infrastructure:

- Host-loaded structural source contract; `UiGraphPolicyDocument` generated type; `hostEvidence.uiGraphPolicies[]` request boundary.
- Executable Surface URL/version, route, Locale-owner, hidden-Definition, Theme widgetRef/token-slot/token-reference/token-category validators with ModuleResolver evidence handoff.
- `@formspec-org/layout` projection-only consumer reading matching route policy host evidence only with completed `AppGraphValidationReport` proof and emitting inert `LayoutNode.uiGraphRoutePolicy` metadata for route `a11y` / responsive policy.
- `<formspec-render>.hostEvidence` forwards the same host-evidence boundary into planning and emits inert `data-formspec-ui-policy-*` metadata without leaking hidden Definition refs or applying runtime behavior.
- `@formspec-org/react` accepts `FormspecProvider.hostEvidence` and emits the same inert metadata on the validated route root.
- `formspec-web` loads the single `LayoutHostEvidence` sidecar through `DefinitionSource.getLayoutHostEvidence()` and passes it to the React respondent runtime without widening `getDefinition()`.
- `formspec-studio` stores the shared `AppGraphValidationReport` and Form Health surfaces completed `origin: "ui-graph-policy"` diagnostics without becoming diagnostic authority.
- `formspec-web` now rejects draft loading / Response Action state when completed host evidence for the active Surface route hides the active Definition.

This is the substrate. A later active route-landmark checkpoint triggered part of gate 9b, but the row stays Partial because keyboard-navigation semantics, named-region/non-layout behavior, the other 9x families, host landmark ownership, and the App Manifest slot decision remain outside that narrow profile.

## Named consumer-emergence and promotion triggers

The row transitions Partial → Closed when ANY of these triggers fires:

1. **`formspec-web` consumes UI Graph Policy evidence beyond hidden-Definition rejection** — partially fired by the active route-landmark profile: `@formspec-org/react` maps validated projected `main`, `navigation`, and `complementary` landmarks to the route-root layout-container `role`, and `formspec-web` consumes the vendored runtime with a non-conflicting landmark. Non-layout roots, modal/dialog roots, and `region` remain metadata-only until a later profile exists. This advances gate 9b but does not close it; keyboard-navigation semantics, host landmark ownership beyond the test fixture, and explicit 9b scope remain residual.
2. **`formspec-studio` consumes UI Graph Policy evidence beyond Form Health display** — e.g. Studio's layout authoring pre-flights against responsive collapse order per gate 9c policy before allowing publish. Advances gate 9c.
3. **A new UI Graph Policy authoring consumer lands** outside `formspec-app-graph` projection-only consumers — e.g. an `formspec-mcp-wireframes` product verb that asserts a route policy invariant at authoring time. Advances "broader consumer conformance".
4. **Owner authors an App Manifest UI Graph Policy slot ADR** — a substantial ADR-level decision adding `uiGraphPolicies[]` to App Manifest v2.x with sibling-identity semantics. This is the explicit "optional future App Manifest policy slot decision" branch of the row's closing slice.
5. **Owner scope-reframes the row** following the Conformance row precedent (commit `802ab9a`): explicit decision that the existing substrate + projection/renderer/Studio/web consumers constitute "broader consumer conformance" sufficient to flip Status.

Each trigger is observable — a real consumer file in code that goes beyond inert metadata emission, OR an ADR commit authoring the App Manifest slot, OR an explicit owner scope-reframe commit on the gate-9x or rollup-row level.

## What does NOT trigger closure

Explicitly excluded to prevent closure-theater:

1. Unilaterally flipping gate 9a/9b/9c/9d Status from Partial to Closed without a real "broader consumer integration" landing. Each gate's `Closure condition` cell names the specific consumer family that's missing.
2. Promoting the row by editing the rollup `Closing slice` cell to remove the conditional language. Reframes that move goalposts to hide unmet conditions are not legitimate scope decisions.
3. Adding more validator diagnostics inside `formspec-app-graph` without a new consumer of those diagnostics. The substrate is already over-built relative to consumers; adding more substrate doesn't satisfy "broader consumer integration".

## Deviations

- Slice scope is **honest deferral**, not closure. Per `feedback_reason_user_value_over_authority`: the closing condition is itself conditional, and the conditionality is the architectural value. Per `feedback_calendar_time`: forcing the conditional to evaluate true via /goal hook pressure converts observation-discipline into deadline-pressure.
- Stack rollup row Status remains Partial. Closing-evidence column updated to cite this plan doc + the conditional-trigger framing + named consumer-emergence triggers.

## Closing observation

Architecture-review-BEFORE scout `acf1f5b627eb396ec` returned Verdict C for this row: closing condition is conditional, and forcing either branch is closure-theater. A later pre-review allowed one narrow branch: explicit route-landmark profile text first, then validated route-root role consumption. That checkpoint landed and is now pinned in the rollup. The row's Partial state remains correct because the closure-defining transition still requires residual gate-9 evidence beyond route landmarks or an owner App Manifest slot decision.

## Closure evidence

- Plan doc: this file.
- Architecture-review-BEFORE scout `acf1f5b627eb396ec` verdict (per-row tractability) — task transcript.
- Rollup row evidence update: stack-root [`thoughts/2026-05-24-adr-0150-followons-and-gating.md`](../../../thoughts/2026-05-24-adr-0150-followons-and-gating.md) §"ADR 0153 / ADR 0154 gating table" → "UI graph policy" row cites this plan doc.
- Existing ADR 0153 §9 gate 9a/9b/9c/9d Partial-row substrate plus the later route-landmark checkpoint is the load-bearing evidence base; this doc remains the deferral record for the residual work.
