# ADR 0153 gate 9b — UI Graph Policy a11y profile closure

**Status:** Closed (2026-05-26)
**Scope:** Keyboard-navigation metadata profile, named-region profile, host-landmark scope profile — ADR 0153 gate **9b** only (not full ADR 0153/0154 ratification).

## Observation

Gate 9b residual was scoped separately from the Wireframes-MCP active-consumer slice: route-landmark profile for `main` / `navigation` / `complementary` had landed, but keyboard-navigation semantics, named `region` behavior, non-layout/modal route-root handling, and host-reserved landmark conflicts were still open.

## What closed

| Profile | Spec | Validator | Projection | Consumers |
|---|---|---|---|---|
| Keyboard-navigation metadata (§5.3.2) | `ui-graph-policy-spec.md` | shape only | copies `keyboardNavigation` | inert `data-formspec-ui-policy-keyboard-navigation`; no focus/tabindex synthesis |
| Named region (§5.3.3) | `landmarkLabel` required when `landmark: region` | `UI-POLICY-REGION-LABEL` | copies `landmarkLabel` | layout route roots: `role="region"` + `aria-label` |
| Host-landmark scope (§5.3.4) | `hostEvidence.hostLandmarks.reserved[]` | `UI-POLICY-HOST-LANDMARK-CONFLICT` | `a11y.landmarkSuppressed: true` | no active `role` when suppressed; Modal/Dialog route roots stay metadata-only |

## Evidence

- `formspec/specs/app-graph/ui-graph-policy-spec.md` §5.3.2–§5.3.4
- `formspec/schemas/ui-graph-policy.schema.json`
- `formspec/packages/formspec-app-graph/src/ui-graph-policy.ts`
- `formspec/tests/conformance/fixtures/app-graph-validator/ui-graph-policy-a11y-profiles.case.json`
- `formspec/packages/formspec-app-graph/tests/ui-graph-policy-conformance.test.ts`
- `formspec/tests/conformance/test_app_graph_ui_policy_a11y_profiles_fixture_corpus.py`
- `formspec/packages/formspec-layout/tests/planner.test.ts` (region+label, host-reserved-main suppression)
- `formspec/packages/formspec-react/tests/layout.test.tsx` (region active landmark, suppression, Modal metadata-only)

## Verification run

```sh
npm run test -w @formspec-org/app-graph
npm run test -w @formspec-org/layout
npm run test -w @formspec-org/react
npm run docs:check
python3 -m pytest tests/conformance/test_app_graph_ui_policy_a11y_profiles_fixture_corpus.py tests/conformance/schemas/test_ui_graph_policy_schema.py -q
```

All passed at closure commit.

## Deliberate deferrals (outside 9b)

- Focus algorithms, tabindex heuristics, full ARIA synthesis
- ADR 0152 fine-grained authorization
- ADR 0153/0154 status promotion (`proposed` → ratified) — owner-only
- Optional App Manifest `uiGraphPolicy` sibling slot
