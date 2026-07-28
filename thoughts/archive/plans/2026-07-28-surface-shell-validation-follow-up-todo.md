---
name: Surface Shell validation follow-up
date: 2026-07-28
status: closed
tracking_epic: fs-m4c6
tracking_item: fs-wu8i
scope:
  - specs/surface/surface-spec.md
  - specs/surface/surface-shell-spec.md
  - specs/app-graph/ui-graph-policy-spec.md
  - specs/lint-codes.json
  - crates/formspec-lint
  - "@formspec-org/app-graph"
  - "@formspec-org/surface"
  - "@formspec-org/surface-react"
  - formspec-stack/.claude-plugin/skills/formspec-specs
source_review: thoughts/reviews/2026-07-28-surface-shell-review-findings.md
---

# Surface Shell validation follow-up TODO

## Result

Close two confirmed React binding defects, align the shell with Surface route
identity, make host and diagnostic rules testable, and repair stale
documentation and lint metadata. Completion means the local plan has current
source and test evidence. It does not authorize a push, package publication, or
deployment.

This file is an execution backlog, not a second specification. The following
sources remain authoritative:

1. [`schemas/surface.schema.json`](../../../schemas/surface.schema.json) defines
   document structure.
2. [`specs/surface/surface-spec.md`](../../../specs/surface/surface-spec.md) and
   [`specs/surface/surface-shell-spec.md`](../../../specs/surface/surface-shell-spec.md)
   define Surface and shell behavior.
3. Sibling specifications define the behavior they own, including
   [`specs/theme/theme-spec.md`](../../../specs/theme/theme-spec.md),
   [`specs/theme/token-registry-spec.md`](../../../specs/theme/token-registry-spec.md),
   [`specs/app-graph/ui-graph-policy-spec.md`](../../../specs/app-graph/ui-graph-policy-spec.md),
   and
   [`specs/registry/extension-registry.md`](../../../specs/registry/extension-registry.md).
4. Package source and tests show implementation state; they do not override a
   specification.

If this TODO disagrees with an authority, correct this TODO or the owning
authority through its normal change process.

## Tracking

Active Formspec plans are tracked through `tk` and rendered into
[`thoughts/TODO.md`](../../TODO.md). Child epic `fs-wu8i` tracks this plan under
`fs-m4c6`. The checklist in this file owns the state of `SSV-001` through
`SSV-040`; the child epic records the plan's aggregate state.

At the validated snapshot, the focused Formspec check exited 1 because
`formspec/thoughts/TODO.md` would change. The repo-wide
`make todo-sync-check` exited 2 first on unrelated
`work-spec/TODO.md` drift. Preserve those as separate baselines: make the
Formspec check green for this work, and report unrelated repository drift
without absorbing it into this plan.

## Validated snapshot

This snapshot records the bytes reviewed before this update. It is not a
moving status claim.

- Observed: `2026-07-28 15:33:52 EDT (-0400)`
- Remote refs were refreshed with `git ls-remote --heads origin main`.
- Concurrent editing flag: none known at observation time.

| Repository | Branch | HEAD | Live `origin/main` | Relation | Dirty paths |
| --- | --- | --- | --- | --- | --- |
| `formspec` | `main` | `cc0ace4bc843c46ed975de1634dc425bd0caa550` | `576393be4af23f1ac676529098c91014e785f7fb` | ahead 7 | `M filemap.json`; untracked `thoughts/plans/2026-07-28-surface-shell-validation-follow-up-todo.md` |
| `formspec-stack` | `main` | `6e518e089a20d9cd13633ab15f2790958e1117c2` | `8ab362d78dced5befec2c07c6330da90ee502dda` | ahead 2 | modified `formspec` gitlink |

The reviewed work was local and unreleased. This table makes no claim that the
local commits were pushed, merged, published, or deployed.

### SSV-001 snapshot-procedure dry run

The procedure was exercised again at `2026-07-28 16:46:58 EDT (-0400)`.
Both repositories remained on `main` at the HEADs and live `origin/main`
values in the table above. Neither repository had staged paths. A read-only
independent review was active; no other writer was known, and repair was frozen
while the following evidence was captured.

- `formspec-stack` reported `M .tickets/fs-m4c6.md`, modified `formspec`
  gitlink state, and new `.tickets/fs-wu8i.md`.
- `formspec` reported the pre-existing `M filemap.json`, plus
  `M thoughts/TODO.md`, `M thoughts/reviews/README.md`, and this new plan.
- In `formspec-stack`, the relevant diff covered `.tickets/fs-m4c6.md` and
  new `.tickets/fs-wu8i.md`. The parent-ticket patch had SHA-256
  `e8e1afcd06bf41baef9ad177c58a59b5be15b6b1ade857cb3af84b61d136c009`;
  the child-ticket file had SHA-256
  `9ad200a648669bf1a9eef237b127540ee7b3234cc64489054e03008e51298b0a`.
- In `formspec`, the relevant tracked diff covered `thoughts/TODO.md` and
  `thoughts/reviews/README.md` and had SHA-256
  `dae0efecfeff2700b93087b658318c88b4406cb36f85af66f7bb37ba6f8d69bb`.
  This plan is the observation record itself and was also examined.
- The pre-existing `filemap.json` change was recorded as dirty but was not part
  of the SSV-001 diff. Git cannot reconstruct its earlier uncommitted states.

Before changing task status, record a new timestamp and run these commands in
both repositories:

```sh
git branch --show-current
git rev-parse HEAD
git status --short --branch
git diff --name-status
git diff --cached --name-status
git ls-remote --heads origin main
```

Also record whether another person, agent, hook, or build may change the target
files during the review.

## Rules for this work

1. **Pin each observation.** Identify the commit blob or the timestamped dirty
   worktree and relevant diff behind every implementation claim.
2. **Separate history from current state.** Appendix B records historical
   divergence. Close a current item only after a fresh source read and test.
3. **Classify before changing code.** An unused helper or different reference
   rule is not automatically a defect. Reopen a settled decision only when new
   user evidence or an authority conflict requires it.
4. **Test the user-visible result.** Check whether refused navigation remains
   interactive, diagnostics settle, tenant values cross a protected boundary,
   and failed actions advance. A test count does not answer those questions.
5. **Report delivery stages separately.** Local, committed, pushed, merged,
   published, deployed, and operationally observed are different states.
6. **Give each rule one owner.** Code may enforce a Theme or Surface rule, but
   the owning specification must state it.
7. **Add a regression for each edge.** Broad suites were green while the two
   live defects remained reproducible.

## Verified baseline — preserve

These items are already implemented or decided. They are not open tasks, but
later changes must keep them true.

| Area | Verified disposition |
| --- | --- |
| Core path collisions | The model retains every route handle, emits one `ROUTE-PATH-COLLISION` diagnostic per collision group, and refuses the shared URL in `matchRoute`. |
| Surface identity | Runtime code identifies a route with the qualified `(surfaceId, routeId)` pair. `surface:<route-id>` is currently a Screener/AppGraph destination URI, not a general runtime URL handle. |
| Verification ownership | Surface Shell §6.5 assigns authenticity verification to the host deployment. `bundleIsRenderable` is only a structural helper. |
| Verification strings | The shell-owned string-key set is closed, exhaustive, and covered by tests. |
| Runtime severities | `SURFACE_DIAGNOSTIC_SEVERITY` is total at compile time, and tests cover every runtime code. Hosts cannot replace a code's base severity. |
| `E611` | The authoring-time lint is a warning emitted by `AppGraphValidator`; it is distinct from runtime `TRANSITION-UNFIREABLE`. |
| Runtime token-registry dependency | Removed; registry-aware validation owns undeclared-token reporting. |
| Unclassified-route theming | Authoring and runtime postures differ intentionally; runtime fails closed. |
| Host-requested transition controls | The binding may render a core-classified `fireable` transition when the host supplies an executor. |
| Theme layering and heading rank | Theme §3.7 owns layering and emission; schema and shell define heading `level` as composition-relative rank. |
| Formerly silent branches | Dedicated diagnostics cover unknown slot type, unknown static-content kind, ambiguous route handle, and unevaluable condition. |
| Registry collisions | All colliding entries are omitted instead of selecting the first declaration. |
| Historical runtime divergences | Unknown slot input reports without throwing; unresolved marker links are unavailable; only completed, resolved, valid actions advance. |
| Spec discovery | The shell spec is tracked, backlinked, generated, inventoried, and present in the lookup map. |

## Work order

```text
SSV-001
  ├─ SSV-010 ─────────────────────┐
  ├─ SSV-011 ─────────────────────┤
  ├─ SSV-020 ─┐                   │
  ├─ SSV-021 ─┼─ SSV-030 ─────────┤
  ├─ SSV-022 ─┘                   ├─ SSV-040
  └─ SSV-031 ─────────────────────┘
```

Start with `SSV-001`. `SSV-010` and `SSV-011` may proceed in parallel after
the snapshot is pinned. `SSV-020`, `SSV-021`, and `SSV-022` must settle before
the prose reconciliation in `SSV-030`. Close the plan through `SSV-040`.

## SSV-001 — Make reviews snapshot-safe

**Priority:** P1

**Depends on:** nothing

**Owns:** review process and evidence lineage, not runtime behavior

- [x] Create a `tk` child item under `fs-m4c6`, record its ID in this file's
  `tracking_item`, and refresh the generated section in `thoughts/TODO.md`.
- [x] Add a short baseline block to the Surface Shell review procedure or its
  durable review document. Record the repository, branch, HEAD, live
  `origin/main`, timestamp and timezone, dirty paths, staged paths, relevant
  diff, and concurrent editing flag.
- [x] Require each implementation claim to identify either a commit blob or a
  timestamped dirty-worktree observation and the files examined.
- [x] Put concurrent review and repair in separate worktrees, or freeze repair
  until the review records its source snapshot.
- [x] Require the reviewer to stop and repin the baseline when a target file or
  HEAD changes during review.
- [x] State when Git cannot reconstruct a historical source snapshot.

**Acceptance**

- A future reader can identify the bytes behind every finding.
- A moving worktree cannot silently become one claimed atomic snapshot.
- The procedure does not require committing user work merely to review it.
- The plan has a canonical `tk` item, and the focused generated TODO check
  passes.

**Evidence**

- Review-procedure diff.
- A dry-run snapshot against `formspec` and `formspec-stack`.
- `node scripts/generate-todo.mjs fs-m4c6 formspec/thoughts/TODO.md --check`
  from the stack root.
- Whitespace checks for tracked, staged, and new documentation.

## SSV-010 — Withhold live navigation for collision-refused routes

**Priority:** P1 — confirmed live runtime defect

**Depends on:** `SSV-001`

**Owns:** Surface Shell navigation invariant and
`@formspec-org/surface-react` rendering

The core correctly reports `ROUTE-PATH-COLLISION` and resolves a colliding
address to no route. `SurfaceNav` ignores `SurfaceRouteHandle.pathCollides` and
renders each claimant as a clickable link. A person can therefore select an
address the core has refused.

- [x] Add a binding requirement to Surface Shell: no collision claimant may
  produce interactive navigation to the refused URL.
- [x] Permit a binding to show an unavailable item or omit it only when the
  host can still observe every claimant through diagnostics.
- [x] Make the React binding's concrete choice an unavailable item for each
  claimant. Render no `href` or click handler, expose the unavailable state to
  assistive technology, and retain the route label.
- [x] Document that choice in the React package API or README.
- [x] Add a React regression with two Surfaces that claim `/shared`.
- [x] Extend the browser probe to prove that `/shared` has no live navigation
  control.

**Acceptance**

- `matchRoute(app, "/shared")` returns no match and the collision refusal.
- The host receives one `ROUTE-PATH-COLLISION` diagnostic for the group.
- React renders both authored claimants as unavailable items with no `href` and
  no navigation callback.
- Non-colliding routes remain navigable.
- An unresolved parameterized route remains unavailable under its existing
  rule.

**Primary evidence**

- [`specs/surface/surface-shell-spec.md`](../../../specs/surface/surface-shell-spec.md)
- [`packages/formspec-surface/src/composition.ts`](../../../packages/formspec-surface/src/composition.ts)
- [`packages/formspec-surface-react/src/SurfaceApp.tsx`](../../../packages/formspec-surface-react/src/SurfaceApp.tsx)
- Core, React, and browser regression evidence.

## SSV-011 — Make diagnostic delivery settle under equivalent inline inputs

**Priority:** P1 — confirmed live runtime defect

**Depends on:** `SSV-001`

**Owns:** React binding notification behavior

`useSurfaceApp` depends on reference-valued inputs such as `widgetModules`,
`tokenAliases`, and `surfaceLabel`. Recreating an equivalent inline value
recreates the model and diagnostic array. A host that updates state in
`onDiagnostics` can then cause an unbounded notification/render loop.

- [x] Define semantic equality for diagnostic lists as the same order and the
  same public values for `code`, `severity`, `message`, `site`, and `details`,
  independent of object identity and object-key order. Treat `details` as
  JSON-compatible data: object keys are unordered and array order is
  significant.
- [x] Deliver the complete list once for the initial semantic state and once
  after each semantic change. Suppress delivery caused only by equivalent
  inline objects or arrays.
- [x] Define subscription transitions explicitly. A new subscription
  (`undefined` to a callback) receives the current complete list once. Replacing
  one callback with another while subscribed does not replay the list, but the
  replacement receives the next semantic change. Unsubscribing and then
  subscribing starts a new subscription. A component remount starts fresh.
- [x] Add a host harness whose callback updates state and whose equivalent
  `widgetModules`, `tokenAliases`, or label input is recreated on every render.
- [x] Add a second test proving a real diagnostic change still notifies.
- [x] Test the supported React 18 and React 19 peer range in ordinary and
  `StrictMode` roots. If the package cannot meet that range, narrow the peer
  declaration rather than leaving behavior untested.
- [x] Document the delivery rule in the React package API or README.

**Acceptance**

- The state-updating host settles without a React maximum-depth error.
- Equivalent inputs produce one initial callback per logical mount, including
  a development `StrictMode` mount.
- A new subscription receives the current list. Replacing only an active
  callback does not redeliver it; the latest callback receives the next
  semantic change.
- Adding, removing, or materially changing a diagnostic produces a new
  callback with the complete diagnostic list.
- Diagnostic and callback ordering remain deterministic in React 18 and 19.

**Primary evidence**

- [`packages/formspec-surface-react/src/SurfaceApp.tsx`](../../../packages/formspec-surface-react/src/SurfaceApp.tsx)
- A bounded render-count regression and the React 18/19 test matrix.

## SSV-020 — Separate destination URIs from runtime route identity

**Priority:** P1 — specification alignment

**Depends on:** `SSV-001`

**Owns:** Surface and Surface Shell route terminology

The owning Surface specification already supports three separate concepts:

1. `surface:<route-id>` is a Screener/AppGraph destination URI.
2. Runtime code identifies a route with the qualified
   `SurfaceRouteHandle` pair `(surfaceId, routeId)`.
3. Production URL routing is outside Surface-local conformance.

Surface Shell currently collapses the first two concepts when it says a
collision-refused route remains reachable through `surface:<route-id>`.

- [x] Keep `surface:<route-id>` scoped to Screener/AppGraph destination
  resolution. Do not broaden it into a general runtime router API without a
  real consumer and a separate authority change.
- [x] Describe runtime route identity as `(surfaceId, routeId)` and URL
  matching as a separate host or binding concern.
- [x] Rewrite the shell's collision and diagnostic prose so it does not present
  the destination URI as a runtime fallback.
- [x] State the precise collision result: the shared URL is refused, the
  qualified route records remain in the model, and person-facing reachability
  depends on entry paths the host actually provides.
- [x] Test the staff `/queue` example with no transition or embed path:
  `matchRoute` refuses the collided URL, `routeInSurface` still identifies each
  qualified route, and the shell offers no invented navigation path.
- [x] Update conformance references and the spec lookup map for every changed
  normative section.

**Acceptance**

- Surface and Surface Shell use the same three-part model.
- No shell rationale calls `surface:<route-id>` a runtime reachability
  guarantee.
- A collision neither deletes the qualified route records nor implies that a
  person can reach them through the refused URL.
- Screener/AppGraph destination tests retain exact-one resolution.
- The React binding gains no unsupported router API.

**Primary evidence**

- [`specs/surface/surface-spec.md`](../../../specs/surface/surface-spec.md)
- [`specs/surface/surface-shell-spec.md`](../../../specs/surface/surface-shell-spec.md)
- [`packages/formspec-surface/src/composition.ts`](../../../packages/formspec-surface/src/composition.ts)
- [`packages/formspec-app-graph`](../../../packages/formspec-app-graph)

## SSV-021 — Make verification and host obligations mechanically checkable

**Priority:** P2 — pre-1.0 design hardening

**Depends on:** `SSV-020` only where route entry affects the host checklist

**Owns:** Verifying Surface Shell and host boundary

Surface Shell §6.5 already assigns authenticity verification to the host
deployment. Keep that decision. The remaining work must make the host's duties
and the shell's limits observable.

- [x] Restate §6.1 with the **Verifying Surface Shell deployment** as subject,
  consistent with §6.5 and §8.4.
- [x] Use the specification's verdict names
  `verified | failed | unverified` throughout. Map the spike's `unsupported`
  state to `unverified`, or amend the owning specification before using a
  fourth name.
- [x] Define deployment conformance evidence for each verdict. State that
  `bundleIsRenderable` checks only structural presence and shape; it neither
  verifies authenticity nor supplies a default verdict.
- [x] Pin and test the host's render gate:
  - a verified signed export may render;
  - a failed signed export renders no bundle-derived output;
  - a signed export that the deployment cannot verify also renders no
    bundle-derived output in a Verifying Surface Shell deployment; and
  - an unsigned authoring preview may render only with an explicit
    `unverified` verdict.
- [x] Add a synchronous host-supplied static-asset admission resolver to the
  core planning boundary. It receives the authored image source and
  document-vocabulary site, and returns either an admitted runtime source or a
  refusal. With no resolver, an empty admitted source, or a refusal, the image
  slot is unavailable and the host receives the new closed runtime diagnostic
  `STATIC-IMAGE-SOURCE-REFUSED`. No binding may dereference the authored source
  directly.
- [x] Add image-origin allowlisting to the host checklist and require the host
  to implement it through the static-asset resolver. Replace the false claim
  that Theme §9.1 requires it with this shell-owned rule.
- [x] Rewrite “re-derive nothing” and “one rule per question” as observable
  behavior or static checks. Mark any remaining prose as review guidance.
- [x] Add tests or static checks proving that core and bindings never invent a
  `verified` verdict and that every conforming deployment supplies its own
  tri-state result.

**Acceptance**

- A test author can identify the subject of every verification requirement.
- Core and bindings expose no automatic or default `verified` claim.
- A conforming deployment tests all three canonical verdicts, including the
  difference between a signed-but-unverifiable export and an unsigned
  authoring preview.
- The host checklist names image-origin allowlisting and string overrides, and
  the owning text supports both.
- Authored image sources reach a binding only through the host resolver; absent
  or refused admission renders an unavailable slot and reports
  `STATIC-IMAGE-SOURCE-REFUSED`.
- `bundleIsRenderable` is documented and tested as an optional structural
  helper.

## SSV-022 — Resolve diagnostic severity and fire-table ambiguity

**Priority:** P2 — pre-1.0 specification clarity

**Depends on:** `SSV-020` for route-collision wording

**Owns:** runtime diagnostic semantics

The runtime already has a total code-to-severity map and an exhaustive
code-coverage test. `E611` is already separate from the runtime set. The open
gap is exact specification-to-source parity and the reason each severity asks
an operator to act.

- [x] Move the trailing-slash collision case out of the “does not fire” list;
  it currently concludes that the code **does** fire.
- [x] Record the operational reason
  `THEME-UNCLASSIFIED-REFUSED` is `info` while `STATIC-IMAGE-NO-ALT` and
  `TRANSITION-UNFIREABLE` are warnings, or change the normative table and code
  together.
- [x] Add an exact parity test between every runtime row in the normative
  severity table and `SURFACE_DIAGNOSTIC_SEVERITY`. Keep the existing
  compile-time exhaustiveness check.
- [x] Add focused examples for every edited fire and does-not-fire row.

**Acceptance**

- Every fire/does-not-fire list is internally consistent.
- Severity differences have a stated operational reason.
- The normative table and total source map agree exactly for every runtime
  code.
- Hosts never receive conflicting base severity for one code.
- No runtime code is silently folded into an authoring-time lint.

## SSV-030 — Reconcile current prose and cross-references

**Priority:** P1 — documentation integrity

**Depends on:** `SSV-020`, `SSV-021`, and `SSV-022`

**Owns:** current documentation, not historical source observations

- [x] Replace the dangling `surface-spec.md §6.2` citation in
  both `specs/app-graph/ui-graph-policy-spec.md` and
  `packages/formspec-surface/src/slot-plan.ts` with the actual owning section
  or ADR anchor.
- [x] Cite [`CLAUDE.md`](../../../CLAUDE.md) §Spec authoring contract directly for
  spec placement instead of treating ADR 0161 pin-test condition 1 as the
  placement authority.
- [x] Point `position` semantics to
  `surface.schema.json#/$defs/Slot/properties/position`.
- [x] Update Surface Shell §9.5: the signed example now uses
  `/receipt/{caseRef}`, so unsupported route grammar no longer prevents the
  example from being walked.
- [x] Correct the review record's reconciliation boundary: the repair began in
  local commit `d01888e5` and continued in later local commits. Record pushed,
  merged, published, and deployed state only from fresh evidence.
- [x] Classify each repeated lint-code list as normative, generated, or
  explanatory. Keep one normative inventory and replace only redundant copies
  with a link or generated reference.
- [x] Repair every changed lookup-map entry and section anchor.

**Acceptance**

- Every section citation resolves to the intended owning text.
- Current-state paragraphs agree with current source and Git history.
- Historical findings remain identifiable as historical.
- The worked example retains its real dead edge and `E611` lesson.
- Lint-code inventories have a named owner and no contradictory duplicate.
- Documentation, lookup-map, file-map, and whitespace gates pass.

## SSV-031 — Repair lint-registry and pass-inventory hygiene

**Priority:** P2 — repository hygiene

**Depends on:** `SSV-001`

**Owns:** lint metadata and documentation; not `E611` runtime behavior

At the validated snapshot,
`https://formspec.org/schemas/lint-registry.schema.json` returned HTTP 404 and
the repository had no local schema. This plan chooses a repository-owned
authority: `schemas/lint-registry.schema.json` keeps that canonical URI as its
`$id`, and clean-checkout validation maps the URI to the local file without
network access. Current tests inspect selected fields by hand; they do not
validate the whole registry against JSON Schema.

- [x] Add `schemas/lint-registry.schema.json` as the repository-owned schema
  with `$id` `https://formspec.org/schemas/lint-registry.schema.json`.
- [x] Keep the registry's canonical `$schema` URI and make the metadata test
  load the matching local `$id` directly. The gate must perform no network
  access and must fail when the URI and local `$id` diverge.
- [x] Validate all of `specs/lint-codes.json` against that schema in the normal
  documentation or metadata gate.
- [x] Update the pass-8 inventory in `crates/formspec-lint/src/lib.rs` to
  include Rust-emitted `E610` and identify `E611` as a registered code emitted
  by the TypeScript `AppGraphValidator`.
- [x] Update `crates/formspec-lint/README.md`; its pass-8 list currently stops
  at `E900`–`E902` and omits the Surface rules.
- [x] Decide whether the non-monotonic E6xx file order should be normalized.
  Do not renumber stable codes merely to make the table look tidy.

**Acceptance**

- The registry's `$schema` resolves in a clean checkout.
- The whole registry passes JSON Schema validation.
- Generated lint code remains current.
- Rust and TypeScript pass documentation distinguish registry membership from
  the emitter.
- Stable codes keep their values regardless of display order.
- Existing lint metadata gates and the `E611` fixture corpus pass.

## SSV-040 — Close the plan with current evidence

**Priority:** P1 — plan closure

**Depends on:** `SSV-001`, `SSV-010`, `SSV-011`, `SSV-020`, `SSV-021`,
`SSV-022`, `SSV-030`, and `SSV-031`

**Owns:** evidence and status only; it authorizes no push, publication, or
deployment

- [x] Re-read every item against one newly pinned snapshot.
- [x] Check a box only when current source and test evidence prove it.
- [x] Update the review record without erasing historical findings.
- [x] Run focused red/green regressions for `SSV-010` and `SSV-011`.
- [x] Run the isolated `npm run test:react-compat` gate against React 18 and
  React 19 in ordinary and development `StrictMode` roots. The command must
  use temporary installations and leave the main lockfile unchanged.
- [x] Run package builds and tests, Rust lint tests, conformance tests,
  documentation checks, dependency checks, and browser evidence.
- [x] Refresh the Formspec specification navigator after all spec edits.
  Review each changed reference file and update
  `.claude-plugin/skills/formspec-specs/references/.hash-cache.json`.
- [x] Correct the already-stale UI graph reference hash. At the validated
  snapshot, the cache held `sha256-d73f7237...` while the source hashed to
  `sha256-acff67b8...`.
- [x] Regenerate `filemap.json`; never edit it by hand.
- [x] Run the focused `tk` TODO synchronization check after `SSV-001`
  registers this plan.
- [x] Compare both local HEADs with live `origin/main`.
- [x] Record local verification, committed, pushed, merged, published,
  deployed, and browser-observed states separately.
- [x] Account for every dirty path in both repositories.
- [x] Move completed historical notes through the repository's normal archive
  or `COMPLETED.md` flow after every dependency above is complete.

**Minimum verification**

```sh
npm run build --workspace=@formspec-org/surface
npm run build --workspace=@formspec-org/surface-react
npm run build --workspace=@formspec-org/app-graph
npm run test --workspace=@formspec-org/surface
npm run test --workspace=@formspec-org/surface-react
npm run test --workspace=@formspec-org/app-graph
npm run test:react-compat
cargo nextest run -p formspec-lint
uv run pytest -q \
  tests/unit/test_lint_rule_registry.py \
  tests/unit/test_contract_surface_coverage.py \
  tests/conformance/test_app_graph_surface_response_action_trigger_fixture_corpus.py \
  tests/conformance/spec/test_surface_contract.py
npm run docs:check
npm run docs:filemap:check
npm run test:contract-surfaces
npm run check:deps
git diff --check
git diff --cached --check
git status --short --branch
git ls-remote --heads origin main
(cd spikes/surface-render-v10 && npm run typecheck && npm run build)
(cd .. && node scripts/generate-todo.mjs \
  fs-m4c6 formspec/thoughts/TODO.md --check)
(cd .. && git diff --check)
(cd .. && git diff --cached --check)
(cd .. && git status --short --branch)
(cd .. && git ls-remote --heads origin main)
```

Start the `surface-render-v10` preview and run `npm run probe` when rendered
behavior changes. Review every changed JSON file and screenshot. Update
evidence only when the probe produced it from the changed application.

**Completion bar**

- The two confirmed runtime defects have regression tests and no longer
  reproduce.
- Surface and Surface Shell distinguish destination URIs, qualified route
  identity, and URL matching.
- Verification, diagnostic, and host obligations have testable subjects.
- Current documentation contains no known stale status or dangling section
  citation from this validation.
- Registry metadata, its JSON Schema, generated code, and pass documentation
  agree.
- The file map, specification lookup maps, reference copies, and hash cache
  match their sources.
- The worktree is clean or every remaining dirty path is explicitly accounted
  for.
- The `tk` item and generated TODO show the same completion state.
- Push, merge, publication, and deployment remain separately authorized and
  verified actions.

## Closure evidence

**Result:** the plan closed locally on `2026-07-28`. All checklist items have
current source, automated-test, browser, documentation, generated-file, and
independent-review evidence. `fs-wu8i` is closed, and the focused generated
TODO check reports the same state. The verified implementation was then
organized into five local commits, followed by this closure-record commit.

### Final snapshot

The final implementation snapshot was pinned at
`2026-07-28 18:06:20 EDT (-0400)`. Repair stopped while the independent
reviewers inspected the target. After their final verdicts, only this closure
record, the review status, the ticket status, and generated TODO state changed.
No other target writer was known.

| Repository | Branch | HEAD | Live `origin/main` | Relation |
| --- | --- | --- | --- | --- |
| `formspec` | `main` | `cc0ace4bc843c46ed975de1634dc425bd0caa550` | `576393be4af23f1ac676529098c91014e785f7fb` | ahead 7 |
| `formspec-stack` | `main` | `6e518e089a20d9cd13633ab15f2790958e1117c2` | `8ab362d78dced5befec2c07c6330da90ee502dda` | ahead 2 |

Both live refs came from `git ls-remote --heads origin main`. Neither
repository had staged paths. A final read-only recheck at
`2026-07-28 18:12:49 EDT (-0400)` returned the same HEADs, live refs, and
ahead counts after the plan moved into the archive.

### Verification

- `@formspec-org/surface`: build passed; **195/195** tests passed.
- `@formspec-org/surface-react`: build passed; **118/118** tests passed,
  including collision-refused navigation, semantic diagnostic delivery, and a
  completed action that carries the matched `caseRef` into the destination.
- `@formspec-org/app-graph`: build passed; **415/415** tests passed.
- `npm run test:react-compat` packed and rendered the public `SurfaceApp` with
  React **18.2.0** and **19.2.4** in ordinary and development `StrictMode`
  roots. Each logical mount delivered one initial diagnostic, and subscription
  replacement and resubscription behaved as documented.
- The compatibility gate left `package-lock.json` byte-for-byte unchanged at
  SHA-256
  `92e38e6c08be7246ab3a5a8b652b611473ef25fb9853aac1a1af47d0ce6815d4`,
  equal to `HEAD`.
- The spike typecheck and production build passed. Its admission and verdict
  suites passed **4/4** tests. The production build split bundle and app code,
  and the refusal test proved that neither core nor binding code loads before
  host admission.
- `cargo nextest run -p formspec-lint` passed **447/447** tests.
  `cargo fmt --all --check` also passed.
- The focused Python selection passed **62/62** tests.
- `npm run docs:check` passed **188/188** specification checks and **487/487**
  metadata checks. `npm run docs:filemap:check` passed.
- `npm run test:contract-surfaces` passed its metadata (**487**), Studio
  (**124**), types (**29**), React (**2**), Web Component (**40**), and engine
  example (**3**) checks.
- `npm run check:deps` passed all 11 package fences. It retained three
  non-blocking baseline warnings because
  `@formspec/signature-adapter-webcrypto`, `@formspec/signature-cose`, and
  `@formspec/signature-port` have no layer assignment.
- `npm run docs:formspec-lint` regenerated the Rust API mirror. It returned 0
  with five existing broken intra-doc-link warnings in `expressions.rs` for
  `[N]` and `[M]`; those warnings are outside this plan.
- Tracked, staged, and new-file whitespace checks passed in both repositories.
  The focused command
  `node scripts/generate-todo.mjs fs-m4c6 formspec/thoughts/TODO.md --check`
  passed after ticket closure with one epic and two open children.

The specification lookup copies now match their sources. The Surface Shell
source has 2,015 lines and hash
`sha256-79a70a06dfa309a876ec4e9ceb9acd160c9bb85934ff16998113968b5ed49a69`.
The UI Graph Policy source has 731 lines and hash
`sha256-5982d62735279e408928dd0e5897877e8191a3ee21da98c4d7a81f82090338d9`.
The lookup index, detailed maps, and hash cache carry those values.
`filemap.json` was regenerated and reports 2,436 of 2,703 files mapped.

### Browser evidence

The local Chromium probe passed twice against the rebuilt static preview, with
stable key evidence hashes:

- dark apply screenshot:
  `97695767ac0afd6f817fe9bb1f7961cbfb8a8979599def5ebf15450148ef73d0`;
- light apply screenshot:
  `73eb951ea5caa75b517d5cac84bc4bd97ae4147af45b3e7fd47d7241ffa81e06`;
- signature-verification record:
  `d5826a1b4c92bb95e4f3211802f349fd22863265445edc5a50fad5dfdd962029`;
  and
- collision-navigation record:
  `4e4f1896f96360fec8c4263890e3b4b433065c5d57382d6840f7eb92b468863b`.

The probe confirmed both color schemes, tenant paint, one token emitter per
route, no document-root token leak, no unresolved-marker link, and no live
navigation to a collision-refused URL. An exact ImageMagick comparison of the
light and dark Submit-label crops reported zero differing pixels; each crop
contained 107 pure-white glyph pixels. The already-running preview process
served the rebuilt static bytes. Its ownership was not established, so this
work did not stop or replace it.

### Independent review

- The snapshot-discipline review returned **APPROVE**, high confidence.
- The architecture review returned **PROCEED**, high confidence, after tracing
  verification admission, route-collision guidance, the five-state transition
  taxonomy, public React compatibility, and the final navigation boundary.
- The code review found one final parameter-preservation defect. The binding
  now passes `routePlan.params`—the same merged values used during planning—to
  the completed-action navigation guard. The new `/case/CASE-42` to
  `/receipt/CASE-42` regression passed. The delta review returned
  **APPROVE**, and the architecture delta review returned **PROCEED**.

### Delivery state

| Stage | Verified state |
| --- | --- |
| Local source and tests | Verified as listed above |
| Committed | Local commits `c9b7361a`, `a3c29c88`, `76d8644d`, `662e3920`, and `84f41b84`, followed by this closure-record commit |
| Pushed | Not performed or established for this follow-up |
| Merged | Not performed or established |
| Published | Not performed |
| Deployed | Not performed |
| Browser-observed | Verified only against the local static preview |

### Dirty-path accounting

At the pre-commit closure snapshot, every remaining path belonged to this local
follow-up or to the generated tracking state it refreshed. No path was staged.
The commit organizer consumed the Formspec paths into the local commits listed
above and left the stack paths for the parent repository's closing commit.

`formspec-stack`:

- modified:
  `.claude-plugin/skills/formspec-specs/SKILL.md`,
  `.claude-plugin/skills/formspec-specs/references/.hash-cache.json`,
  `.claude-plugin/skills/formspec-specs/references/surface-shell-spec.md`,
  `.claude-plugin/skills/formspec-specs/references/ui-graph-policy-spec.md`,
  `.tickets/fs-m4c6.md`, and the `formspec` gitlink;
- new:
  `.claude-plugin/skills/formspec-specs/references/schemas/lint-registry.md`
  and `.tickets/fs-wu8i.md`.

`formspec` lint and generated metadata:

- `crates/formspec-lint/README.md`,
  `crates/formspec-lint/docs/rustdoc-md/API.md`,
  `crates/formspec-lint/src/lib.rs`, `schemas/lint-registry.schema.json`,
  `scripts/bundle-rustdoc-md.mjs`, `tests/unit/test_lint_rule_registry.py`,
  `package.json`, `scripts/test-surface-react-compat.mjs`, and `filemap.json`.

`formspec` runtime packages:

- `packages/formspec-app-graph/src/ui-graph-policy.ts` and
  `packages/formspec-app-graph/tests/ui-graph-policy-route-class.test.ts`;
- `packages/formspec-surface-react/README.md`,
  `packages/formspec-surface-react/src/SurfaceApp.tsx`,
  `packages/formspec-surface-react/src/SurfaceTransitions.tsx`,
  `packages/formspec-surface-react/src/diagnostic-delivery.ts`, and
  `packages/formspec-surface-react/tests/surface-app.test.tsx`;
- `packages/formspec-surface/README.md`,
  `packages/formspec-surface/src/bundle.ts`,
  `packages/formspec-surface/src/composition.ts`,
  `packages/formspec-surface/src/diagnostics.ts`,
  `packages/formspec-surface/src/index.ts`,
  `packages/formspec-surface/src/route-plan.ts`,
  `packages/formspec-surface/src/slot-plan.ts`,
  `packages/formspec-surface/src/static-content.ts`,
  `packages/formspec-surface/src/strings.ts`,
  `packages/formspec-surface/src/transitions.ts`,
  `packages/formspec-surface/tests/bundle.test.ts`,
  `packages/formspec-surface/tests/composition.test.ts`,
  `packages/formspec-surface/tests/diagnostics.test.ts`,
  `packages/formspec-surface/tests/route-path.test.ts`,
  `packages/formspec-surface/tests/static-content.test.ts`, and
  `packages/formspec-surface/tests/transitions.test.ts`.

`formspec` specifications and spike:

- `specs/app-graph/ui-graph-policy-spec.md` and
  `specs/surface/surface-shell-spec.md`;
- `spikes/surface-render-v10/README.md`,
  `spikes/surface-render-v10/package.json`,
  `spikes/surface-render-v10/scripts/probe.mjs`,
  `spikes/surface-render-v10/evidence/gap-ledger.json`,
  `spikes/surface-render-v10/evidence/r2-theme-reaches-and-paints.json`,
  `spikes/surface-render-v10/evidence/signature-verification.json`,
  `spikes/surface-render-v10/evidence/route-collision-navigation.json`,
  `spikes/surface-render-v10/evidence/screenshots/dark-01-apply-intake.png`,
  `spikes/surface-render-v10/evidence/screenshots/light-01-apply-intake.png`,
  `spikes/surface-render-v10/evidence/screenshots/light-05-verification-and-gap-ledger-open.png`,
  `spikes/surface-render-v10/src/app.tsx`,
  `spikes/surface-render-v10/src/bundle.ts`,
  `spikes/surface-render-v10/src/bundle-admission.ts`,
  `spikes/surface-render-v10/src/bundle-input.ts`,
  `spikes/surface-render-v10/src/chrome/CollisionNavigationProbe.tsx`,
  `spikes/surface-render-v10/src/chrome/DocumentRootProbe.tsx`,
  `spikes/surface-render-v10/src/chrome/VerificationChrome.tsx`,
  `spikes/surface-render-v10/src/gaps.ts`,
  `spikes/surface-render-v10/src/main.tsx`,
  `spikes/surface-render-v10/src/probe-hooks.ts`,
  `spikes/surface-render-v10/src/tenant-theme-probe.ts`,
  `spikes/surface-render-v10/src/verification-gate.ts`,
  `spikes/surface-render-v10/src/verify.ts`,
  `spikes/surface-render-v10/tests/bundle-admission.test.ts`, and
  `spikes/surface-render-v10/tests/verification-gate.test.ts`.

`formspec` tracking and review:

- `thoughts/TODO.md`,
  `thoughts/reviews/2026-07-28-surface-shell-review-findings.md`,
  `thoughts/reviews/README.md`, and
  `thoughts/archive/plans/2026-07-28-surface-shell-validation-follow-up-todo.md`.

The repository's normal flow keeps recently closed ticket entries in the
generated TODO for traceability and moves implemented plans to
`thoughts/archive/plans/`. This plan now follows that archive rule, and the
durable findings document is classified as a reference rather than active
planning.
