---
name: Surface render v10 gap closure
date: 2026-07-28
status: closed
archived: 2026-07-29
tracking_epic: fs-m4c6
tracking_item: fs-lgrq
linked_tracking:
  - fs-r2od
  - fs-9d5e
  - fs-q1ex
  - fs-3b30
  - fs-5g59
scope:
  - formspec
  - formspec-studio
  - formspec-web
  - case-portal follow-up
  - formspec-stack tracking and ADRs
source_review:
  - spikes/surface-render-v10/src/gaps.ts
  - specs/surface/surface-shell-spec.md Appendix B
  - thoughts/spikes/2026-07-26-lifecycle-demo-v10.md
---

# Surface render v10 gap closure plan

## Result

**Archive disposition:** complete for this plan's scope. The operator-host and
public-signer implementations remain open under `fs-3b30` and `fs-5g59` and
their active plans. Commit organization remains a separately authorized
workflow. Archiving this parent plan does not claim that either leaf shipped or
that any change was committed, pushed, published, or deployed.

Addressing the remaining v10 feedback requires a specification-first program, not
seven isolated patches.

The work will:

1. correct the v10 trust model before any browser verifier is promoted;
2. revise the document formats that cannot currently express accessible
   images, widget data, widget actions, a stable app entry, or app-level
   localized shell strings;
3. finish four shared-package defects that remain hidden inside rows marked
   resolved;
4. wire a verified, data-backed, post-MVP respondent Surface into
   `formspec-web`;
5. keep staff routes in an authorized operator host and keep the public signing
   ceremony as a separate `formspec-web` signer slice instead of exposing
   either through the respondent runtime;
6. reconcile the specification, gap ledger, generated evidence, and tracker
   only after the implementation proves each claim.

Completion means every v10 observation has one of three explicit outcomes:
implemented with permanent evidence, corrected as a false or overly broad
claim, or split into a separately owned and tracked product slice. It does not
authorize a push, package publication, deployment, or release.

## Authority and change order

This plan records the work; it does not replace the sources that own behavior.

1. [`GOAL.md`](../../../../GOAL.md) requires one buyer-proof, end-to-end case and
   offline-verifiable evidence.
2. [`DEVELOPMENT-PHILOSOPHY.md`](../../../../DEVELOPMENT-PHILOSOPHY.md) sets the
   repository order: architecture decision record (ADR), specification,
   schema, implementation plan, code, then tests.
3. [`surface.schema.json`](../../../schemas/surface.schema.json),
   [`bundle-manifest.schema.json`](../../../schemas/bundle-manifest.schema.json),
   [`registry.schema.json`](../../../schemas/registry.schema.json), and
   [`locale.schema.json`](../../../schemas/locale.schema.json) own document
   structure.
4. The Surface, App Manifest, Registry, Locale, Data Sources, Theme, and
   Response Actions specifications own behavior in their respective areas.
5. The
   [`Signature Method Registry`](../../../specs/registry/signature-method-registry.md)
   and
   [`integrity-signature-port`](../../../../integrity-stack/packages/integrity-signature-port/src/index.ts)
   already own COSE method and key-resolution behavior. A bundle profile reuses
   them.
6. Accepted `formspec-web`
   [ADR 0005](../../../../formspec-web/thoughts/adr/0005-mvp-scope-defer-cryptographic-substrate.md)
   and
   [ADR 0009](../../../../formspec-web/thoughts/adr/0009-hexagonal-architecture-ports-and-adapters.md)
   keep cryptographic journeys and bundle/verifier ports post-MVP until
   separately ratified.
7. [`spikes/surface-render-v10/src/gaps.ts`](../../../spikes/surface-render-v10/src/gaps.ts)
   is the canonical v10 ledger source.
   [`evidence/gap-ledger.json`](../../../spikes/surface-render-v10/evidence/gap-ledger.json)
   is generated output and MUST NOT be edited directly.
8. Package source and tests show current implementation state. They do not
   overrule a specification or make spike-local behavior normative.

When this plan discovers a decision not already owned by an accepted ADR or
specification, execution stops at that boundary until the owning text is
ratified.

## Validated planning snapshot

Observed on 2026-07-28 before this plan was written:

| Repository | Local HEAD | Branch relation | Relevant local state |
| --- | --- | --- | --- |
| `formspec-stack` | `49d47b49043be62065d97525b1a1c3cf14903cde` | `main`, ahead of tracked `origin/main` by 3 | New tracking item `fs-lgrq` and links to `fs-r2od` / `fs-9d5e` |
| `formspec` | `c3d5beaa5d72af83f59b42c763be68f8d588ae62` | `main`, ahead by 13 | Clean before this plan |
| `formspec-web` | `3d1836cde66cdfe700e7740874c522de41ddc580` | `main`, aligned with tracked `origin/main` | Clean |
| `formspec-studio` | `f166e9652528ffe860454cca6a69a9bbdd35cd2e` | `main`, ahead by 2 | Clean |

These are local observations, not release claims. Refresh branches, live remote
refs, worktree state, and generated baselines before implementation or status
changes.

## Execution record

WP0 completed on 2026-07-28 before schema or host implementation began.

- Live `origin/main` refs were rechecked as
  `8ab362d78dced5befec2c07c6330da90ee502dda` for `formspec-stack`,
  `576393be4af23f1ac676529098c91014e785f7fb` for `formspec`,
  `3d1836cde66cdfe700e7740874c522de41ddc580` for `formspec-web`,
  `8b8921156a5639ea17fbe9ff25f1c8acc8e2766d` for
  `formspec-studio`, and
  `45b9bc564109874a7f0af50b91922ce77581a1b8` for `case-portal`.
  The local branch relations in the planning snapshot were unchanged.
- The initial ledger contained 29 rows: 22 binary-resolved and 7 open.
  The open IDs were `widget-data-binding`, `no-runtime-state`,
  `response-actions-type-mismatch`, `browser-bundle-verification`,
  `verified-state-chrome`, `shell-visual-design`, and
  `static-content-image-has-no-alt-channel`. Resolved rows with explicit
  follow-up work included `bundle-manifest-dereference`,
  `module-widget-runtime`, and `platform-theme-merge`.
- Stack
  [ADR 0162](../../../../thoughts/adr/0162-surface-bundle-admission-and-v10-contract-closure.md)
  ratified the trust, release, actor, version, entry, Locale, widget, retry,
  and ledger decisions. Web ADRs
  [0012](../../../../formspec-web/thoughts/adr/0012-surface-bundle-source-port.md)
  and
  [0013](../../../../formspec-web/thoughts/adr/0013-surface-bundle-verifier-port.md)
  ratified the narrow post-MVP acquisition and verification ports.
- At the end of WP0, the expanded ledger contained 36 rows: 21 `implemented`,
  1 `corrected`, 1 `split`, and 13 open. `no-runtime-state` remained the split
  historical parent; `fs-q1ex`, `fs-3b30`, and `fs-5g59` tracked its
  respondent, operator, and public-signer children.
- `npm run gap-ledger`, `npm run typecheck`, and `npm run test:unit` pass in
  `spikes/surface-render-v10`; the focused suite reports 8 tests passed.

The pre-existing plan, TODO, and tracker edits were preserved. No push,
publication, deployment, or release occurred.

WP1 completed locally on 2026-07-28.

- The signed-bundle profile, closed schema, and
  `@formspec-org/surface-bundle-signing` package now own the production
  preimage, raw-byte parsing, COSE verification, publisher/app authority,
  pinned or monotonic release checks, and post-validation atomic admission.
- The conformance suite uses actual COSE and WebCrypto operations. It covers 15
  acceptance and adversarial vectors plus a policy-mutation regression proving
  that verification snapshots trust, method-registry, release mode, and the
  exact monotonic store before its first asynchronous boundary.
- `npm run typecheck`, `npm test`, and `npm run build` for the package pass;
  the focused suite reports 23 tests passed. Root dependency and changeset
  configuration now recognizes the package. Historical spike signature bytes
  remain unchanged and are explicitly quarantined from production evidence.

WP2, WP3 generation/lint, WP4, and WP5 completed locally on 2026-07-28.

- Surface 0.2, Registry 1.1, App Manifest 2.4, and Locale 2.0 now own image
  alternative text, qualified widget inputs and outputs, fail-closed app entry,
  and target-bound shell localization. Canonical schemas, generated
  TypeScript, Rust schema copies, examples, diagnostics, and specification
  views agree.
- Rust Locale lint accepts general module keys, enforces the closed Surface
  shell family, and keeps fallback inside one target identity. Its full library
  suite reports 449 tests passed; the focused Locale suite reports 5 tests
  passed.
- The generated Response Actions input reaches React without `as never`;
  platform Theme values remain below tenant overrides; inline bundle exports
  use an exact-own-key validating resolver; and Surface reuses the AppGraph
  widget contribution helper.
- AppGraph now enforces Data Sources availability and widget bindings,
  fail-closed app entry, widget output/action/transition coherence, and Locale
  target/reference identity. Its build and 460-test suite pass. The paired
  Python vNext corpus reports 11 tests passed.
- `npm run docs:check` passes, including 188 specification contract tests and
  498 metadata tests. The App Manifest coverage row now cites the package and
  paired cross-artifact corpus rather than claiming specification-only
  coverage.
- Studio core and Wireframes author and reopen Surface 0.2 image, data, and
  action fields, App Manifest 2.4 entry selection, and Locale 2.0 targets.
  Executable lifecycle fixtures export separate respondent and staff graphs.
  An independent follow-up review found incomplete nested validation, a
  silently droppable primary Definition, non-atomic reopen, and weak actor
  separation evidence. Studio now validates byte-identical canonical v10
  schema snapshots before candidate admission and export, requires the exact
  primary Definition identity, validates on an isolated candidate before
  commit, and proves distinct respondent/staff actors, sessions, and route
  classes. The full Studio test run reports 3,722 passing tests and one
  existing todo; its root build and package dry-run pass.

WP6 completed locally on 2026-07-28.

- `@formspec-org/surface` now owns the canonical `DataSourceLoader` port,
  catalog/source/context request shape, authorization and payload-validation
  seams, declared failure modes, and the HTTP document-resource bridge.
- `@formspec-org/surface-react` resolves named widget inputs through that port
  and gives widgets frozen input values only after availability,
  authorization, loading, and schema checks. It also owns exact declared
  widget-output emission, stable invocation identity, in-flight coalescing,
  durable replay, stale-result suppression, and single eligible navigation.
- The Definition renderer callback now carries only the resolved form plan,
  Theme grant, route context, and Response Actions document. Draft storage,
  identity, transport, payment, WOS, and operator behavior remain host
  concerns.
- The full Surface suite reports 227 passing tests; Surface React reports 132.
  Both packages build. The v10 spike type-checks and builds, and all 12
  dependency-fence checks pass. The reconciled spike ledger suite reports
  8 passing tests.

WP7 and the in-scope WP9 evidence work completed locally on 2026-07-28.

- `formspec-web` now activates the lazy signed respondent root only for the
  anonymous `publicPortal` profile with complete deployment-owned acquisition,
  trust, release-pin, module, and receipt configuration. The root uses the
  existing respondent draft, submit, response-action, status, Locale, and
  Theme seams. It loads the real signed Definition and data source, persists a
  release-qualified confirmation copy, and restores an explicit receipt or
  unavailable state after refresh.
- Admission keeps one immutable snapshot through signature and authority
  verification, release preflight, AppGraph/schema validation, respondent
  actor and exact entry selection, dereference and renderability proof, and
  the atomic release commit. The actor profile rejects staff, ceremony, embed,
  extra module/data/action capabilities, Surface action bindings, and Registry
  widget action outputs. HTTP acquisition has origin, byte, redirect, and
  deployment-owned deadline limits.
- The production browser suite reports 27 passing and 5 intentionally skipped
  live-server tests. It covers the real fill/save/resume/submit/receipt/refresh
  journey, exact entry after reorder, invalid and ambiguous entry refusal,
  signed staff-route refusal, Locale and scoped Theme, exact image
  alternatives, keyboard/mobile/light/dark use, one `h1`, axe, persistent
  status, and all named trust, release, and tamper refusals. Package
  conformance separately proves the attacker-signed replacement-key vector.
- The complete non-container web gate passes: 245 conformance tests, 1,005
  unit tests, vendor and upstream sync, the browser suite, production build,
  and a 117.0 KiB gzip initial bundle. The container build reached its final
  image export and loaded `formspec-web:local`, but this Colima/Buildx process
  did not return after reporting `DONE`. Using that inspected image through
  the explicit prebuilt-image diagnostic path, compose quickstart,
  gzip/cache-header, and two-deployment browser smoke all pass. This is not a
  claim that the default `npm run ci` command returned successfully in this
  local Docker environment.
- The first container smoke found that the atomic runtime-config replacement
  inherited a private temporary-file mode and nginx returned 403. The
  entrypoint now sets mode `0644`; its regression test and all three container
  smokes pass.
- The final canonical ledger contains 36 rows: 31 `implemented`, 2
  `corrected`, 1 `split`, and 2 open. The generated ledger, Surface Shell
  appendices, spike README, package comments, TODO, and trackers agree.
  `fs-q1ex` and `fs-lgrq` are closed. `fs-3b30` and `fs-5g59` remain open for
  the separately authorized operator host and public signer ceremony.
- Independent architecture review first returned
  `PROCEED-WITH-CONDITIONS`. After the release-commit order was made identical
  in every canonical record, the missing browser entry and actor refusals were
  added, acquisition time was bounded, the actor profile was hardened, and
  device-clock and browser-session receipt limits were documented, its
  follow-up verdict was `PROCEED` with no material concern.
- Final live `origin/main` refs were unchanged from WP0:
  `8ab362d78dced5befec2c07c6330da90ee502dda` for `formspec-stack`,
  `576393be4af23f1ac676529098c91014e785f7fb` for `formspec`,
  `3d1836cde66cdfe700e7740874c522de41ddc580` for `formspec-web`,
  `8b8921156a5639ea17fbe9ff25f1c8acc8e2766d` for
  `formspec-studio`, and
  `45b9bc564109874a7f0af50b91922ce77581a1b8` for `case-portal`.
  Every checkout remains on `main`; no remote commit is missing locally. The
  local branches remain 3, 13, 0, 2, and 0 commits ahead, respectively.
  Current uncommitted path counts are 12, 216, 152, 20, and 1.
- Package versions remain prerelease-local values: `@formspec-org/types`,
  `@formspec-org/app-graph`, `@formspec-org/surface-bundle-signing`,
  `@formspec-org/surface`, and `@formspec-org/surface-react` are `0.1.0`;
  layout, engine, and web component are `1.0.0`; React is `0.1.0`;
  `formspec-web` is `0.0.1`; and `case-portal` is `0.0.0`. No version bump or
  publication has occurred.
- Browser authority validity still uses device time. Required digest pins
  prevent a rolled-back clock from authorizing different bytes, but expiry is
  not adversary-resistant until trusted time exists. Deployment key and pin
  removal remains the production revocation boundary. The session-stored
  receipt is a schema-checked confirmation copy, not independently
  authenticated proof.

Release bookkeeping remains deliberately separate. Two dependency-ordered
changesets exist. **V10-116 transferred the recorded dependency order to the
separately authorized commit workflow.** This plan authorized no staging,
commit, push, publication, or deployment.

## Uncommitted history plan

This is the dependency-ordered handoff from the commit-organizer review. It is
not authorization to stage or commit. Recheck each `HEAD` and worktree before
executing it.

| Repository / order | Proposed subject | Rollback unit |
| --- | --- | --- |
| stack 1 | `docs(adr): ratify Surface v10 admission` | ADR 0162 only |
| formspec 1 | `feat(signing): verify Surface bundle releases` | Signing profile/schema/package, build wiring, and signing tests |
| formspec 2 | `feat(surface): close Surface v10 contracts` | Surface 0.2, Registry 1.1, App Manifest 2.4, Locale 2.0, generated mirrors, AppGraph, shared runtime packages, tests, and both changesets |
| formspec 3 | `docs(spike): reconcile Surface v10 evidence` | Canonical ledger, generated evidence/screenshots, plan, README, and generated TODO |
| studio 1 | `feat(studio-core): author Surface v10 bundles` | Canonical schema snapshots, atomic author/reopen behavior, core tests, and generated `dist` |
| studio 2 | `feat(mcp-wireframes): expose v10 authoring` | MCP methods and materialization/authoring journeys |
| web 1 | `fix(web): label attachment upload controls` | Independent accessibility fix and regression found by the v10 gate |
| web 2 | `chore(web): vendor Surface v10 dependencies` | Provenance-checked upstream packages, schemas, Theme assets, dependency metadata, and lockfile |
| web 3 | `feat(web): add signed bundle admission` | Source/verifier ports, bounded adapters, conformance, admission host, composition, and ADRs 0012/0013 |
| web 4 | `feat(web): run verified respondent Surfaces` | Respondent actor, controller, receipt, Locale/Theme/widget integration, and browser evidence |
| web 5 | `feat(web): configure signed Surface deployments` | Runtime JSON, container entrypoint/Compose, configuration docs, and deployment tests |
| web 6 | `test(web): support prebuilt deployment checks` | Diagnostic-only `FORMSPEC_WEB_TEST_USE_PREBUILT_IMAGE` branches; default and CI still build |
| web 7 | `docs(plan): define public signer ceremony` | Deferred signer ownership plan only |
| case portal 1 | `docs(plan): define Surface v10 operator host` | Deferred operator ownership plan only |
| stack 2 | `docs(stack): reconcile Surface v10 work` | Ticket closures, open actor children, and open-work index |
| stack 3 | `chore(stack): record Surface v10 gap closure` | Child-repository pointers after every child commit exists |

The formspec contract/runtime unit is intentionally broad because its
discriminator and generated-type migration crosses schemas, Rust mirrors,
validators, and consumers. Split it only if every intermediate commit can pass
its own generation and build gates. Use hunk-level staging for mixed web
configuration and deployment scripts. The vendored
`formspec-types/dist/generated/needs.{d.ts,js}` pair is required because the
fresh generated index exports `needs.js`; both files match the upstream build
byte-for-byte and the web typecheck depends on the complete generated set.

## Baseline feedback inventory

The baseline JSON summary reported 29 ledger rows: 22 resolved and 7 open. That
count was not the complete remaining workload. Appendix B added open findings
that had no ledger row, and several resolved rows described residual defects in
their own resolution notes. The execution record above preserves that baseline;
the generated ledger now reports the typed dispositions.

| Feedback | State verified during planning | Planned disposition |
| --- | --- | --- |
| `widget-data-binding` | Open. Surface carries widget configuration but no authored data reference. | Surface 0.2 data bindings use qualified Data Sources references; the existing validator and loader tickets provide graph checks and runtime delivery. |
| `no-runtime-state` | Open and too broad. It mixes respondent submission/receipt state, staff queue state, and a signing ceremony. | Preserve the historical row with a typed `split` disposition and open child rows. Land respondent state in `formspec-web`; track staff state in an authorized operator host; track the public ceremony as its own `formspec-web` signer slice. |
| `response-actions-type-mismatch` / F6 | Open. The generated document does not assign to the engine input without `as never`. | Make the generated type authoritative at the engine seam and remove the cast. |
| `browser-bundle-verification` | Open. The spike has a browser verifier, but its key and signer claims are not independently trusted. | Ratify a signed-bundle and trust-anchor profile first, then add narrow source/verifier ports and a pre-render admission state machine. |
| `verified-state-chrome` | Open. `SurfaceApp.header` is available; the component remains spike-local. | Add host-owned verification status in `formspec-web`, showing only authenticated publisher facts. |
| `shell-visual-design` | Open but classified as spike scaffolding. | Productize only checking, refusal, error, and verified status. Keep the gap drawer and probes as evidence tooling. |
| `static-content-image-has-no-alt-channel` / F1 | Open. A schema-valid image can omit authored alternative text. | Surface 0.2 requires `alt` for images, including `""` as an explicit decorative choice. |
| F3 app entry | Open but absent from the ledger. Manifest order silently selects the app entry Surface. | App Manifest 2.4 adds an optional canonical `entrySurface` reference. The selected Surface still owns its entry route. |
| F4 widget action declaration | Open but absent from the ledger. Static validation cannot see widget action output. | Registry 1.1 declares widget action outputs; Surface 0.2 maps those outputs to exact Response Actions IDs. |
| F7 Locale integration | The host override seam exists, but Locale cannot target a non-form app and the shell does not consume Locale. | Locale 2.0 adds an app target and canonical `$module` shell keys; App Manifest 2.4 and the host adapter select and deliver them. |
| validating inline-bundle resolver | A typed Surface dereferencer landed, but the resolved row explicitly leaves AppGraph validation of inlined exports open. | Add a validating in-memory export arm beside `resolveArtifacts`; keep renderer typing separate. |
| duplicated widget lookup | A resolved row explicitly records a second implementation of Registry widget identity. | Export and reuse one pure AppGraph helper before extending widget action validation. |
| platform-under-tenant theme | Theme §3.7 requires layering, but direct React and web-component consumers replace the platform Theme. | Add one pure layout helper and use it in React, web component, and Surface. |
| stale transition and platform status | Appendix A and the spike README still describe closed or partially closed work as open. | Correct them only after the underlying code assertions are true. |
| signing trust and rollback finding | Not represented by the seven open IDs. The spike trusts a public key shipped beside the bundle, presents unsigned signer metadata as trusted, and has no stale-but-valid release policy. | Add a canonical open ledger row. Reuse the integrity signature machinery, then add bundle-specific publishing authorization and rollback checks as release blockers. |

## Architecture assessment

### Category and lineage

This is both a product-surface change and proof infrastructure. The browser
experience is user-facing, while the signing, graph validation, and evidence
paths determine whether its claims are trustworthy.

The work continues these decisions:

- ADR 0150: Surface and module-aware Locale addressing.
- ADR 0153: AppGraphValidator owns cross-artifact graph checks.
- ADR 0160: Registry widget identity uses `widgetShape.widgetName`, not a
  similarly named contribution identifier.
- Surface Shell §6: verification completes before any bundle-derived output.
- Theme §3.7: platform tokens sit below tenant tokens at one owned scope.
- Data Sources: catalogs describe authorized inputs; hosts load values through
  a narrow injected port.
- The Signature Method Registry and integrity signature port already own
  protected `method_uri`, COSE verification, verification receipts, and
  `KeyResolver`.
- `formspec-web` ADRs 0005 and 0009 place bundle source/verifier ports after the
  respondent MVP and require per-port ratification.

The v10 spike is evidence for those seams. Its local signature profile,
sidecar-key trust, UI probes, and combined respondent/staff navigation are not
precedent to promote.

### System seams and owners

| Seam | Input | Owner | Output |
| --- | --- | --- | --- |
| Signed bundle admission | Raw export, COSE signature, deployment trust and release policy | Existing integrity verifier/key resolver plus a bundle profile and host admission adapter | Authorized current bundle or refusal; never a partly trusted or stale bundle |
| App composition | Verified manifest and loaded Surfaces | App Manifest + Surface core | Qualified route table and stable app entry |
| Widget data | Qualified data binding and active actor/route context | Data Sources validator, `DataSourceLoader`, host authorization | Schema-checked named widget inputs or declared failure |
| Widget actions | Registry output declaration and Surface mapping | Registry, Surface, Response Actions executor | Successful named action result before navigation |
| Localization | Active app target, locale, module key, variables | Locale store/resolver and host adapter | Final person-facing shell text |
| Definition runtime | Resolved form slot plan and host respondent controller | `formspec-web` through a Surface React render callback | Draft, submit, action, receipt, and route state |
| Theme cascade | Platform Theme and optional tenant Theme | `formspec-layout` helper; one renderer owner | Platform remainder with tenant overrides, scoped to owned output |

### Invariants

The following statements must remain true across every work package:

1. A schema or owning specification defines authored vocabulary before a
   renderer consumes it.
2. No manifest, route title, widget, Locale string, or other bundle-derived
   output reaches the document before signature and trust checks succeed.
3. Production admission uses COSE `kid`, the protected `method_uri`, the
   existing method registry and `KeyResolver`; it forbids the direct
   `rawPublicKey` bypass.
4. A valid key is not sufficient. Deployment trust binds it to publisher
   identity, permitted app identities, allowed methods, validity interval, and
   revocation state.
5. Admission also enforces an allowed digest or monotonic release rule per app
   so an old but correctly signed bundle cannot silently roll back a
   deployment.
6. Displayed publisher or signer facts are cryptographically bound and trusted.
   Host observation time may be displayed separately as host evidence.
7. Route identity remains `(Surface canonical identity, route id)`. A Surface
   owns its own `entry`; App Manifest selects the entry Surface only.
8. Widget configuration is not live data. Live values flow through a qualified
   Data Sources binding, validation, authorization, and an injected loader.
9. A widget cannot navigate directly. It emits a declared output with one
   stable invocation ID, Surface maps that output to an exact Response Actions
   ID, and navigation happens exactly once only after one eligible transition
   receives a successful, current-session action result.
10. The generated document type is authoritative at runtime package seams.
11. Platform Theme values remain below tenant overrides in every renderer, and
   tenant values never escape the renderer-owned scope.
12. Public respondent deployment does not expose staff routes or staff data.

### Counterfactual checks

The plan deliberately rejects four superficially smaller approaches:

- Copying the spike verifier would detect mutation but would also trust a
  replacement bundle, signature, and replacement sidecar key. That is not
  publisher verification.
- Passing widget values by `widgetName`, host switch statements, or
  `binding.config` would create an invisible second data model and bypass Data
  Sources availability and authorization.
- Letting App Manifest override a Surface route ID would create two entry-route
  authorities. Selecting only the entry Surface fixes reorder instability
  without duplicating route ownership.
- Shipping the combined v10 navigation in `formspec-web` would put an operator
  queue in a public respondent host whose current scope does not include staff
  identity or authorization.

### Architecture verdict

**Proceed after reshaping.** The seven open rows are real, but the original
shape is incomplete. Execution is approved only as the dependency-ordered work
below, with the bundle-signing/trust profile and actor/deployment decision as
hard gates. A patch sequence that begins in React or copies spike code fails
those gates.

An independent architecture gate returned **proceed with conditions**. This
revision incorporates its material corrections: multi-Surface entry ambiguity
fails closed; Locale identity includes target; bundle verification reuses the
existing integrity ports and adds app-scoped publishing and rollback policy;
accepted web ADRs are amended before post-MVP ports; ledger splits remain
distinct from shipped work; and widget action retries use stable invocation
identity. WP0 still requires the owning ADRs to ratify those choices before
implementation.

## Version and vocabulary decisions to ratify

The first ADR work package must confirm these exact decisions before schema
edits:

| Artifact | Planned revision | Decision |
| --- | --- | --- |
| Surface | 0.2 | One migrated shape adds image `alt`, widget `dataBindings`, and widget `actionBindings`. No 0.1 compatibility aliases in the 0.2 runtime path. |
| Registry | 1.1 | Widget shape declares named runtime data inputs and named action outputs separately from configuration `props`. |
| App Manifest | 2.4 | `entrySurface` is a canonical URL that must match exactly one `surfaces[].url`; it is optional only when zero or one Surface exists. Locale references are unique by URL, while loaded Locale identity is the complete target-and-locale tuple. |
| Locale | 2.0 | Replace Definition-only targeting with an explicit app-or-Definition target, support canonical `$module` keys, and never cross target identity during locale fallback. |
| Data Sources | 1.0 | No format bump. Existing catalog identity, availability, runtime, failure, and payload-schema fields already own the needed behavior. |
| Signed Surface bundle | New bundle profile under an owning ADR | Reuse COSE_Sign1, protected `method_uri`, the method registry, integrity verifier receipt, and `KeyResolver`. Add only the domain-separated bundle preimage plus publisher/app authorization, freshness/rollback, and refusal policy. |

Greenfield migration is intentional: fixtures, exemplars, authoring output,
generated types, and consumers move together. A compatibility bridge is allowed
only if the ADR identifies a current external consumer that cannot migrate.

## Dependency map

| Work package | Requires | Unblocks |
| --- | --- | --- |
| WP0 Baseline and decisions | Current sources | Every other package |
| WP1 Signing and trust profile | WP0 | Browser verification and host admission |
| WP2 Specifications and schemas | WP0 | Generation, validators, authoring, runtime |
| WP3 Generated artifacts and authoring | WP2 | Valid exemplars and host bundles |
| WP4 Shared package repairs | WP0; widget helper before action validation | Validator and host integration |
| WP5 Cross-artifact validation | WP2, WP3, widget helper, `fs-r2od` | Runtime delivery and release admission |
| WP6 Runtime ports and bindings | WP1, WP2, WP4, WP5, `fs-9d5e` | Product hosts |
| WP7 Post-MVP respondent host | WP0 ADR amendments, WP1, WP3–WP6 | Browser and journey proof |
| WP8 Operator and ceremony slices | WP0, WP2, WP5–WP6 | Honest disposition of broad runtime-state feedback |
| WP9 Evidence and reconciliation | WP1–WP8 as applicable | Closure and release bookkeeping |

Independent work inside WP1, WP2, and WP4 may run in parallel after WP0. A
later package may not substitute local fixtures for an unfinished dependency.

## WP0 — Freeze the baseline and ratify ownership

- [x] **V10-001** Refresh `main`, live `origin/main`, worktree, submodule, and
  ticket state for `formspec-stack`, `formspec`, `formspec-web`,
  `formspec-studio`, and `case-portal`. Record unrelated changes before edits.
- [x] **V10-002** Regenerate the v10 ledger from `src/gaps.ts` without changing
  it and record the starting total, open IDs, and resolved rows containing
  residual text.
- [x] **V10-003** Write or amend an ADR that owns:
  the signed-bundle trust profile, actor-specific deployment, app entry
  selection, widget data/action identities, Locale app targeting, and document
  version transitions.
- [x] **V10-004** In that ADR, keep the browser admission verifier separate
  from the future full receipt/claim-graph verifier described by
  `formspec-web` ADR 0009.
- [x] **V10-005** Preserve `no-runtime-state` as a historical row and give it a
  typed `split` disposition pointing to named respondent, operator, and
  ceremony child rows. Create linked tracker items for the operator host and
  public signer ceremony if they are not delivered in the same implementation
  window.
- [x] **V10-006** Link this plan to `fs-r2od` and `fs-9d5e` without duplicating
  their Data Sources validator and loader scope. Preserve the dependency
  `fs-9d5e` → `fs-r2od`.
- [x] **V10-007** Add F3, F4, F7 Locale integration, and signing trust/rollback
  to the canonical ledger as open rows. Record the existing F7 host override
  seam as groundwork, not automatic Locale integration.
- [x] **V10-008** Amend accepted `formspec-web` ADR 0005 to move this exact
  signed-bundle admission journey into a named post-MVP slice. Ratify
  `SurfaceBundleSource` and `SurfaceBundleVerifier` in their own ADRs under ADR
  0009 before adding either port.
- [x] **V10-009** Extend the ledger's binary resolution model with a closed
  disposition vocabulary: `implemented`, `corrected`, and `split`.
  `implemented` and `corrected` require permanent source and guards; `split`
  requires open child IDs and MUST NOT count as shipped. Preserve every
  historical row and generate counts by disposition.

**Gate:** accepted ADR text names each owner, version, migration rule, trust
source, actor boundary, post-MVP web slice, ledger disposition, and deferred
product slice. No schema or host code starts before this gate.

## WP1 — Define a promotable signed-bundle and trust profile

- [x] **V10-010** Specify only the bundle-specific signed object, canonical
  preimage over the App Manifest and `documents` map, and a production
  domain-separation value distinct from
  `formspec.spike-v10.bundle-export.signed-payload.v1`.
- [x] **V10-011** Reuse COSE_Sign1, protected-header `method_uri`, the Signature
  Method Registry, the integrity verifier receipt, and `KeyResolver`. Do not
  add a JSON method selector or a second signature-verification abstraction.
- [x] **V10-012** Require a `KeyRef` of kind `kid` for production bundle
  admission and resolve it through an independently configured `KeyResolver`.
  Forbid `rawPublicKey` and ignore bundle-supplied public-key bytes as trust
  evidence.
- [x] **V10-013** State which fields are signed publisher claims, which are
  trust-store facts, and which are host observations. Do not display unsigned
  `signerName`, `signedAt`, or affirmation text as verified.
- [x] **V10-014** Define a deployment trust-policy result that binds `kid` to
  publisher identity, permitted app IDs or namespaces, allowed methods,
  validity interval, and revocation state. A cryptographically valid signature
  outside that authority is refused.
- [x] **V10-015** Define a rollback policy per app identity: pin an allowed
  digest/release in deployment configuration or enforce a monotonic signed
  release sequence. Bind the release identifier in the signed bytes.
- [x] **V10-016** Define `verified`, `failed`, and `unverified/unsupported`
  admission outcomes, reusing the verifier receipt and adding digest,
  trust-policy result, release-policy result, and host checked-at evidence.
  Only fully authorized and current `verified` input is admitted.
- [x] **V10-017** Add conformance vectors for a valid signature, one-byte
  mutation, wrong domain, unsupported method, unknown key, forged bundle plus
  replacement sidecar key, altered signer metadata, wrong publisher, wrong
  app, expired authority, revoked key, conflicting JSON/protected method, and
  old-but-valid release.
- [x] **V10-018** Replace or quarantine the schema-invalid v10 signature
  evidence. Preserve the old bytes as spike history; do not cite them as
  production conformance.

**Gate:** an offline verifier using an independently supplied key resolver,
publisher/app policy, and release policy accepts the current authorized vector
and refuses every adversarial vector. The plan remains blocked for host
promotion until this is green.

## WP2 — Revise the owning specifications and schemas

### WP2A — Surface 0.2 image accessibility

- [x] **V10-020** Add `binding.alt: string` to `static-content`. Require it
  exactly when `kind` is `image`; forbid it for other kinds. Empty string means
  the author deliberately marked the image decorative.
- [x] **V10-021** Remove `slot.title`, URL, and filename fallback behavior from
  the normative image path. Malformed runtime input with missing `alt` remains
  unavailable and diagnostic.
- [x] **V10-022** Add schema and DOM fixtures for meaningful alt, empty alt,
  missing alt, illegal alt on non-image content, exact attribute output, and no
  synthesized name.

### WP2B — Surface 0.2 and Registry 1.1 widget data

- [x] **V10-023** Add Registry widget data-input declarations distinct from
  configuration `props`. Pin stable input names and whether each input is
  required; keep actual source payload shape authoritative in the Data Sources
  catalog.
- [x] **V10-024** Add
  `module-widget.binding.dataBindings[<inputName>] =
  {catalogRef, sourceRef}`. `catalogRef` is the canonical Data Sources URL
  already declared in App Manifest; `sourceRef` is an ID within that catalog.
- [x] **V10-025** Specify exact-match resolution, required-input behavior,
  payload validation, availability, failure modes, and the runtime value as a
  read-only object keyed by input name. Do not add inline payloads, query text,
  filename discovery, or catalog-order fallback.
- [x] **V10-026** Specify that app, exact Surface, exact route, exact slot, or
  matching module availability may cover a widget. Definition-only
  availability does not.

### WP2C — Registry 1.1 and Surface 0.2 widget actions

- [x] **V10-027** Add closed
  `widgetShape.actionOutputs[] = {name, description?}` entries. Names describe
  events the widget can emit; they are not app action IDs or generic intents.
- [x] **V10-028** Add
  `module-widget.binding.actionBindings[<outputName>] =
  {actionRef}` where `actionRef` exactly matches a loaded Response Actions
  action ID.
- [x] **V10-029** Specify that a widget receives only `emitAction(outputName)`.
  It receives neither a route table nor direct navigation. The shell advances
  only after the mapped action completes successfully.
- [x] **V10-029A** Reuse Response Actions invocation and idempotency rules:
  assign one stable invocation ID per emitted output, coalesce duplicate
  in-flight emissions, replay a durable prior outcome, ignore late completion
  for an obsolete route/session generation, and navigate exactly once only
  when one eligible transition matches the completed action.

### WP2D — App Manifest 2.4 entry Surface

- [x] **V10-030** Add `entrySurface` as a canonical URL gated to App Manifest
  2.4. It must match exactly one `surfaces[].url`; it may be omitted only when
  the manifest has zero or one Surface.
- [x] **V10-031** Keep route entry authority in the selected Surface's
  `entry`. Do not add a manifest route override or key the selection on the
  bundle-local `Surface.id`.
- [x] **V10-032** For App Manifest 2.4, use the sole Surface implicitly when
  exactly one exists. Refuse two or more Surfaces without `entrySurface` with
  `APP-ENTRY-AMBIGUOUS`; invalid explicit selection also fails with no
  fallback. Migrate every current multi-Surface exemplar. Older manifest
  versions keep their historical semantics but are not admitted by this
  production bundle profile until migrated.

### WP2E — Locale 2.0 app target and shell keys

- [x] **V10-033** Replace Definition-only `targetDefinition` with
  `target: {kind: "definition" | "app", url, compatibleVersions?}`.
- [x] **V10-034** Index Locale state by `(target kind, target URL, locale)`.
  Permit the same language tag for distinct app and Definition targets; reject
  duplicate complete tuples after normalizing the locale tag.
- [x] **V10-035** Define canonical keys
  `$module.x-formspec-surface.shell.<SurfaceStringKey>` one-to-one with the
  closed Surface string set.
- [x] **V10-036** Make Locale's existing FEL `{{...}}` interpolation the only
  authored template syntax. Add the shell variable context and retire the
  Surface-only `{name}` parser.
- [x] **V10-037** Update App Manifest 2.4 Locale association rules: remove
  locale-only uniqueness, require each Locale reference URL to be unique,
  require the reference locale to match the loaded document, and require the
  target to be this app or a loaded Definition.
- [x] **V10-038** Keep regional-to-base fallback inside one exact target.
  Lookup MUST NOT fall from an app Locale to a Definition Locale, or between
  two Definitions, merely because their language tags match.

**Gate:** specification prose, JSON Schemas, examples, diagnostics, and version
rules agree. Negative fixtures prove every closed shape and every exact
identity rule.

## WP3 — Generate types and update authoring

- [x] **V10-040** Regenerate TypeScript types, Rust schema mirrors, lint
  metadata, spec artifacts, examples, and file maps from the ratified schemas.
  Review generated diffs instead of hand-editing generated files.
- [x] **V10-041** Update Rust Locale lint to accept `$module` grammar and
  validate the closed `x-formspec-surface.shell` key family. Schema and lint
  MUST NOT disagree about valid module keys.
- [x] **V10-042** Update Formspec Studio core and Wireframes MCP materialization
  to author Surface 0.2 image alt, qualified widget data bindings, and widget
  action bindings without `x-` escape fields.
- [x] **V10-043** Update Studio manifest authoring to emit App Manifest 2.4
  `entrySurface` and target-aware Locale references.
- [x] **V10-044** Migrate the lifecycle v10 exemplar and conformance corpus to
  the new document versions. Use actor-specific respondent and staff manifests
  or exports rather than one public navigation graph.
- [x] **V10-045** Add authoring rejection tests for missing image alt,
  unmanifested data catalog, unknown widget input/output, unresolved action,
  invalid entry Surface, and invalid Locale target.

**Gate:** Studio can author, serialize, reopen, and export each new field;
schema-invalid drafts cannot reach signing.

## WP4 — Finish shared-package defects

### WP4A — Generated Response Actions type at the engine seam

- [x] **V10-050** Derive `ResponseActionsDocumentInput` from the generated
  `ResponseActionsDocument`. Preserve an explicitly named actions-only helper
  only if a current caller needs partial input.
- [x] **V10-051** Remove `as never` from `SurfaceSlot`. Add compile-time
  assignability coverage and engine, React, web-component, and Surface React
  behavior tests.

### WP4B — Platform Theme below tenant Theme everywhere

- [x] **V10-052** Add a pure helper beside `buildPlatformTheme` that merges
  token maps without mutating inputs: platform first, tenant overrides second,
  tenant presentation metadata preserved.
- [x] **V10-053** Use the helper in React, web component, and the admitting
  Surface theme authority branch. Retain refusal and owned-scope cleanup.
- [x] **V10-054** Test partial tenant themes in each renderer, including
  retained platform spacing/radii, tenant brand override, refusing-route zero
  tenant values, and document-root cleanup.

### WP4C — Validating inline-bundle resolver

- [x] **V10-055** Add public
  `resolveBundleExportArtifacts({manifest, documents, ...})` beside
  `resolveArtifacts`, implemented through an exact-own-key in-memory loader.
- [x] **V10-056** Keep `ArtifactResolutionHandle.document` as `unknown` and
  keep Surface's typed dereference separate. Validation evidence and renderer
  typing remain two jobs.
- [x] **V10-057** Cover complete, missing, inherited-key, wrong discriminator,
  version/identity mismatch, manifest-version gate, and graph-input handoff
  cases.

### WP4D — Shared widget contribution identity

- [x] **V10-058** Export one minimal pure AppGraph helper for resolving
  `widgetShape.widgetName` through an admitted module contribution and reuse it
  in Surface.
- [x] **V10-059** Test PascalCase names, contribution-ID rejection, coincident
  names, wrong vocabulary, and module scoping before action-source validation
  uses the helper.

**Gate:** affected package tests and builds pass without casts, duplicated
identity walks, or renderer-specific theme merge logic.

## WP5 — Add cross-artifact validation

- [x] **V10-060** Complete linked ticket `fs-r2od`: validate manifested Data
  Sources catalogs and exact app/Surface/route/slot/module availability with
  paired TypeScript and Python fixtures.
- [x] **V10-061** Extend that validation to widget `dataBindings`: manifested
  catalog, existing source, declared input, availability, and optional source
  payload schema. Use qualified route identity.
- [x] **V10-062** Validate `entrySurface` against exactly one manifest Surface,
  then validate the selected Surface's own entry route. Emit
  `APP-ENTRY-AMBIGUOUS`, `APP-ENTRY-SURFACE-UNRESOLVED`, or the existing
  unresolved-entry diagnostic as applicable; never fall back after an
  explicit error.
- [x] **V10-063** Add `E612` for an undeclared widget output or unresolved
  `actionRef`.
- [x] **V10-064** Extend `E611` to credit a module widget only when the shared
  helper resolves the widget, the Registry declares the output, the Surface
  maps it to the exact action ID, and the transition trigger resolves to that
  same action. Keep `E611` at warning because private host behavior remains
  invisible.
- [x] **V10-065** Validate that a completed action selects at most one eligible
  transition for the active qualified route. Zero matches reports and stays;
  multiple matches report ambiguity and never pick by declaration order.
- [x] **V10-066** Validate Locale target/ref coherence, unique reference URLs,
  and duplicate normalized `(target kind, target URL, locale)` tuples after
  loading.
- [x] **V10-067** Run the complete AppGraph validation report over the inline
  verified export before typed Surface dereference.

**Gate:** malformed cross-artifact graphs fail before signing and before
runtime loading; test order, filenames, and prototype inheritance cannot
change a verdict.

## WP6 — Add runtime ports and package bindings

- [x] **V10-070** Complete linked ticket `fs-9d5e` after `fs-r2od`. Define one
  canonical `DataSourceLoader` port, conformance suite, and host bridge for at
  least one real source family.
- [x] **V10-071** Adapt or replace `SurfaceWidgetDataResolver` so Surface passes
  resolved source descriptors and active context to the canonical loader
  rather than introducing a second fetch seam.
- [x] **V10-072** Deliver a read-only named input object to the widget only
  after availability, host authorization, loading, and payload validation.
  Honor catalog `failureMode`; do not invent empty success values.
- [x] **V10-073** Add the widget `emitAction` port. Reject undeclared or
  unmapped outputs at runtime. Give each emission one stable invocation ID,
  coalesce duplicate in-flight emissions, replay durable outcomes, and invoke
  the existing Response Actions executor. Discard navigation from a late
  result after route/session change; navigate exactly once only when one
  eligible transition matches a successful terminal result.
- [x] **V10-074** Update Locale store and handler lookup to include target.
  Add a Surface string resolver adapter with precedence:
  active app Locale → same-target regional/base fallback → built-in English
  default.
- [x] **V10-075** Add a narrow `renderDefinitionForm` callback through
  `SurfaceApp` → `SurfaceRouteView` → `SurfaceSlot`. Pass the resolved form
  plan, theme grant, route context, and Response Actions document; retain the
  current renderer as the default.
- [x] **V10-076** Do not thread draft storage, identity, transport, payment,
  WOS, or operator concerns through `@formspec-org/surface-react`.

**Gate:** package-level integration tests prove exact data, action, Locale, and
form-runtime handoffs while package dependency fences remain green.

## WP7 — Promote the post-MVP verified respondent Surface in `formspec-web`

- [x] **V10-080** Ratify narrow `SurfaceBundleSource` and
  `SurfaceBundleVerifier` ports in their own accepted ADRs plus conformance
  suites. Keep them distinct from the future receipt/claim-graph verifier.
- [x] **V10-081** Add source and WebCrypto/integrity adapters with injected
  method registry, existing `KeyResolver`, bundle publishing-authority policy,
  and release/rollback policy. Add explicit deployment configuration for
  bundle location, trust anchors, permitted app identity, and allowed current
  release, plus origin, byte, redirect, and acquisition-deadline limits.
- [x] **V10-082** Add an
  acquire → verify and preflight release policy → validate schema, graph,
  actor, and entry → dereference and prove renderability → atomically commit
  the release → admit and render state machine.
  Checking, failed, unsupported, and adapter-error UI is host-owned and uses no
  bundle-derived title, text, route, Theme, or widget.
- [x] **V10-083** Add a persistent verification-status component through the
  existing `SurfaceApp.header` slot. Show verified publisher/release facts only
  when authenticated; show digest, method, trust result, adapter version, and
  checked-at with their correct provenance.
- [x] **V10-084** Extract the existing respondent draft/submit/action
  controller from `RespondentRuntime.tsx` and mount it through
  `renderDefinitionForm`. Reuse current `DraftStore`, `SubmitTransport`,
  response-action ledger, and status ports.
- [x] **V10-085** Populate `routeParams.caseRef`, receipt widget data, and
  navigation from the real submission confirmation. Persist or reload enough
  state for a receipt deep link; otherwise show an explicit unavailable state.
- [x] **V10-086** Resolve respondent widget values through
  `DataSourceLoader`. Do not query from a component, switch on widget names, or
  read staff sources.
- [x] **V10-087** Load active app-target Locale and prove that changing locale
  updates every shell-owned person-facing string.
- [x] **V10-088** Vendor the new upstream packages and update dependency,
  license, source-size, upstream-blocker, vendor-leak, and bundle-budget checks.

**Gate:** the public host contains respondent routes only. A verified person can
fill, save, resume, submit, receive a real confirmation, navigate to the
receipt, refresh it, and see authenticated verification status on every route.

## WP8 — Address operator and ceremony runtime separately

The v10 export combines product planes that do not share an authorization
boundary. This package prevents that convenience from becoming architecture.

### WP8A — Operator queue

- [x] **V10-090** Create a linked operator-host plan and tracker item owned by
  `case-portal` or another explicitly authorized staff host. Amend
  `case-portal` scope before adding Formspec rendering.
- [x] **V10-091 — transferred, not implemented here.** The active operator plan
  at
  `case-portal/thoughts/plans/2026-07-28-surface-v10-operator-host.md` and open
  tracker `fs-3b30` own actor/route availability evidence and a staff-specific
  signed bundle. The public respondent deployment MUST NOT receive the staff
  Surface, navigation, or Data Sources.
- [x] **V10-092 — transferred, not implemented here.** The same active operator
  plan and `fs-3b30` own authorized queue ports and empty, unavailable, and
  error states. No fixture row or release-signature metadata may appear as
  queue state.

### WP8B — Public signing ceremony

- [x] **V10-093** Create a linked `formspec-web` public-signer plan and tracker
  item, consistent with web ADR 0001. Define the actual control or widget output
  that raises the authored action and the signature/attestation object it
  produces. Do not move this public ceremony into the staff host.
- [x] **V10-094 — transferred, not implemented here.** The active signer plan at
  `formspec-web/thoughts/plans/2026-07-28-surface-v10-public-signer.md` and open
  tracker `fs-5g59` own the Registry and Surface output binding to Response
  Actions. A static route with a `submit` transition is not a completed
  ceremony.
- [x] **V10-095** Keep the ceremony out of the respondent MVP until its actor,
  preimage, consent, action, and receipt rules have independent conformance and
  product evidence.

**Gate:** `no-runtime-state` remains in history with a `split` disposition and
truthful, separately owned respondent/operator/ceremony child rows and linked
evidence. Shipping the respondent slice does not imply the other two shipped.

## WP9 — Evidence, record reconciliation, and release boundary

### Automated package and schema gates

- [x] **V10-100** Run focused builds/tests for `formspec-types`,
  `formspec-app-graph`, `formspec-layout`, `formspec-engine`,
  `formspec-react`, `formspec-webcomponent`, `formspec-surface`, and
  `formspec-surface-react`.
- [x] **V10-101** Run the Rust lint/schema conformance suites and paired
  TypeScript/Python AppGraph fixtures.
- [x] **V10-102** Run `npm run check:deps`, `npm run docs:check`,
  `npm run test:react-compat`, full `npm run test:unit`, and full
  `npm run build` in `formspec`.
- [x] **V10-103** Run `formspec-studio` build, unit/integration tests, and the
  migrated authoring/materialization corpus.
- [x] **V10-104** Run `formspec-web` typecheck, lint, conformance, unit, vendor,
  upstream, browser, build, and bundle-budget gates.

### Browser, accessibility, and adversarial evidence

- [x] **V10-105** Prove that unsigned, unsupported, unknown-key,
  wrong-publisher, wrong-app, expired, revoked, stale-but-valid,
  metadata-tampered, bundle-tampered, and bundle-plus-replacement-key inputs
  render zero bundle-derived DOM and never set a bundle-derived
  `document.title`.
- [x] **V10-106** Prove verified deep links, back/forward navigation, persistent
  status chrome, explicit app entry after Surface reorder, invalid explicit
  entry refusal, and ambiguous multi-Surface entry refusal.
- [x] **V10-107** Prove exact image alt behavior, keyboard navigation, one
  `h1`, axe checks, light/dark modes, and mobile layout.
- [x] **V10-108** Prove widget data authorization/schema failure, declared and
  undeclared action outputs, double-click coalescing, durable retry replay,
  stale-completion rejection, ambiguous-transition refusal, no direct
  navigation, target-bounded Locale switching, Theme layering, and tenant-token
  containment.
- [x] **V10-109** Prove the full respondent fill/save/resume/submit/receipt/
  refresh journey with real host-port outputs. Record operator and ceremony
  evidence separately when their slices land.

### Ledger and documentation

- [x] **V10-110** Add the typed resolution/disposition model to `src/gaps.ts`
  while preserving every historical row. Require permanent source and guards
  for `implemented` and `corrected`; require existing leaf child IDs for
  `split`. Do not use a comment, plan, tracker item, or screenshot as
  implementation evidence.
- [x] **V10-111** Remove stale residual language for the inline resolver,
  duplicate widget identity, platform theme merge, Response Actions type, and
  transition source only when its named gate is green.
- [x] **V10-112** Reconcile Surface Shell Appendix A/B, the spike README,
  package comments, status counts, disposition counts, and child rows
  one-to-one with the canonical ledger. Specifically correct the stale
  `transition-has-no-trigger-source` and platform-theme rows without describing
  `split` work as shipped.
- [x] **V10-113** Regenerate `evidence/gap-ledger.json`; run spike `gap-ledger`,
  `typecheck`, unit, build, and browser probe. Check the generated diff into the
  same rollback unit as the canonical source update.
- [x] **V10-114** Run focused TODO synchronization for this plan, then report
  unrelated repository TODO drift separately.

### Release bookkeeping

- [x] **V10-115** Add public `app-graph`, `surface`, and `surface-react`
  packages to the changeset tier/fixed-group configuration before authoring
  changesets that name them.
- [x] **V10-116 — transferred to the separately authorized commit workflow.**
  The changesets and dependency order remain in this archive as the handoff:
  specifications/schemas before generated types, validators/packages before
  hosts, and evidence/docs last. This checked transfer is not evidence that a
  commit, push, publication, or deployment occurred.
- [x] **V10-117** Recheck current branches, live remote refs, package versions,
  and worktrees before any requested push or publication. Local green status
  remains distinct from released, deployed, and manually reviewed status.

## Final acceptance matrix

| Outcome | Required proof |
| --- | --- |
| Accessible images | Every schema-valid image contains an authored `alt`; exact meaningful and empty values reach the DOM; no synthesis remains. |
| Stable app entry | Reordering `surfaces[]` does not change an explicit entry; invalid explicit selection and multi-Surface omission both fail rather than falling back. |
| Real widget data | Qualified catalog/source bindings validate and load through one authorized port; no value travels in `config`. |
| Real widget actions | Only declared and mapped outputs invoke exact action IDs; stable invocation identity coalesces/replays retries; current successful execution selects exactly one navigation. |
| Localized shell | Non-form apps can carry app-target Locale; every shell string has a canonical key, changes with active locale, and never falls across target identity. |
| Type and Theme repairs | No `as never`; direct React, web component, and Surface retain the platform Theme under a partial tenant Theme. |
| Trusted browser admission | Existing COSE/key primitives are reused; wrong publisher/app, configured revocation/expiry at the host-observed time, stale release, or replacement key cannot gain admission; no bundle-derived output appears before verification. Required digest pins prevent changed bytes even if the browser clock is rolled back. Deployment key/pin removal remains the production revocation boundary until trusted time is available. |
| Respondent runtime | Verified fill/save/resume/submit/receipt/refresh uses existing host ports and real confirmation data. |
| Actor separation | Public host has no staff route/data; operator and ceremony work has separate authority, tracker, and evidence. |
| Honest records | Canonical ledger, generated JSON, Appendix B, README, package comments, TODO, and tracker report the same state and distinguish implemented, corrected, split, and still-open work. |

The plan closes only when the acceptance matrix is backed by current source,
automated tests, browser evidence, and an independent review. A reduced open
count by itself is not completion.

## Explicit non-goals

- Moving route-class theme authority into another shared vocabulary package
  without measured consumer benefit.
- Adding a Registry “must render unbranded” flag; the structural theme boundary
  already guarantees that outcome.
- Raising `E611` above warning while private host action sources remain
  statically invisible.
- Treating `GapDrawer`, `DocumentRootProbe`, probe hooks, `StubFrame`, or
  `TENANT_TOKEN_VALUES` as product UI.
- Making `@formspec-org/surface-react` own identity, authorization, draft
  storage, transport, WOS state, or deployment trust.
- Publishing one combined respondent/staff bundle merely because the spike used
  one for measurement.
