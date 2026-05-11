# Thoughts — Design Artifacts Index

All internal planning, research, decisions, and reviews live here. `docs/` is for user-facing content only.

**Layout:** **Active** work (open proposals, drafts, and in-flight specs) stays in `thoughts/adr/`, `thoughts/plans/`, and `thoughts/specs/`. **Superseded** and **implemented / closed** ADRs, execution plans, and delivered design specs live under **`thoughts/archive/`** — see [`archive/README.md`](archive/README.md).

### Verification

- After adding or moving markdown under `thoughts/`, run **`npm run docs:filemap`** so `filemap.json` stays accurate.
- **`npm run docs:check`** includes **`scripts/check-thoughts-relocated-paths.mjs`**, which fails if tracked sources cite legacy paths under **`thoughts/adr`**, **`thoughts/plans`**, **`thoughts/specs`**, or **`thoughts/reviews`** for files that exist only under **`thoughts/archive/`** (with exceptions when the same path still exists at top level, e.g. `thoughts/reviews/README.md`).

---

## Directory Structure

| Directory | Purpose | Naming Convention |
|-----------|---------|-------------------|
| `adr/` | **Active** ADRs — Proposed, in-progress, or Accepted but not yet landed as described | `NNNN-short-name.md` |
| `plans/` | **Active** implementation plans (open or draft) | `YYYY-MM-DD-short-name.md` |
| `specs/` | **Active** design specs / PRDs (future or partial) | `YYYY-MM-DD-short-name.md` |
| `archive/` | Closed ADRs, plans, specs, **archived** reviews & Studio history | `adr/`, `plans/`, `specs/`, `reviews/`, `studio/` |
| `reviews/` | **Active** reference reviews + planning (`README.md` indexes the split) | `YYYY-MM-DD-short-name.md` |
| `research/` | External spec analysis, competitive research | Free-form |
| `studio/` | Moved to `formspec-studio/thoughts/` — see [`../../formspec-studio/thoughts/`](../../formspec-studio/thoughts/) | — |
| `examples/` | Reference example implementation plans | Free-form |

---

## Active ADRs (open / in-flight)

Next free id: **0082**. Disambiguate-by-slug required for the following id collisions on disk:

- `0047` / `0048` / `0053` — historical cross-active/archive overlap; link by slug.

**Audit legend:** `Impl` = implementation status from 2026-04-29 codebase audit (see [`adr/TODO.md`](adr/TODO.md) for detail + actionable items). `Doc` = status in the ADR file itself.

| ADR | File | Doc | Impl | Notes |
|-----|------|-----|------|-------|
| 0029 | [schema-parity-phase1](adr/0029-schema-parity-phase1-enrich-existing.md) | Proposed | **~80%** | Definition/theme/component/response enrichments mostly done; minor gaps (`dataType: "uri"`, `timing: "demand"`, shape `{{expr}}` messages). Per-enrichment E2E test coverage not verified. |
| 0030 | [schema-parity-phase2](adr/0030-schema-parity-phase2-new-artifacts.md) | Proposed | **7/8 items** | Changelog, bidirectional mapping, XML/CSV adapters, definition composition, external validation, response lifecycle all done. **Theme Pages & Regions (item E) not done.** |
| 0031 | [schema-parity-phase3](adr/0031-schema-parity-phase3-new-subsystems.md) | Proposed | **~70%** | Screener, extension registry, scoped variables, multi-platform labels fully done. Writable instances partial. No grant-app `registry.json`; `retired` lifecycle status, `source` instance unexercised. |
| 0039 | [seamless-page-management](adr/0039-seamless-page-management.md) | Proposed | **~75%** | Core intent done: Studio as sole writer, component-tree-native pages (superseded ADR's `theme.pages` model). `addPage`/`removePage`/`placeOnPage`/`setItemWidth`/reorder all shipped. Missing: `pages.autoGenerate` handler, Response Inspector, Simulation section, `theme.pages` not formally removed. |
| 0040 | [mcp-tool-consolidation](adr/0040-mcp-tool-consolidation.md) | Proposed | **~60%** | Core consolidation done (65→28 equivalent). Post-ADR feature growth back to 46 tools. `formspec_guide`, batch semantics, merged tools all shipped. New tools (`widget`, `audit`, `theme`, `locale`, `ontology`, etc.) not in ADR scope. |
| 0042 | [launch-blog-posts](adr/0042-launch-blog-posts.md) | Proposed | **~80%** | 13 posts shipped (exceeded ADR's 5). Posts 1-4 covered via multiple focused deep-dives. Post 5 (government/vendor) deferred. Cross-posting not set up. |
| 0048 | [i18n-as-locale-artifact](adr/0048-i18n-as-locale-artifact.md) | Proposed | **~80%** | Full stack: schema, spec, Rust FEL (`locale()`, `pluralCategory()`), `LocaleStore`, core handlers, webcomponent, React hook, MCP tool, E2E. Missing: `formatNumber()`/`formatDate()` FEL functions, locale lint rules (L101-L401), conformance Tier 2. |
| 0051 | [pdf-acroform-generation](adr/0051-pdf-acroform-generation.md) | Proposed | **Not started** | Schema fixtures only (`theme-pdf.json`, `x-pdf` extensions). No `formspec-pdf` package/crate. Superseded by Rust layout planner spec (`thoughts/specs/2026-03-24-rust-layout-planner-and-pdf.md`, status: Design). |
| 0052 | [remove-theme-page-layout](adr/0052-remove-theme-page-layout.md) | Proposed | **Not started** | `theme.pages`, `PageLayout`, `Region` still in schema (`schemas/theme.schema.json`) and spec (`specs/theme/theme-spec.md` §6). Implementation drifts toward component-tree-native pages but no formal schema removal. |
| 0053 | [webmcp-native-assist-protocol](adr/0053-webmcp-native-assist-protocol.md) | Proposed | **~75%** | All 14 assist tools + WebMCP shim + profile matcher + chat package done. Missing: PostMessage/CustomEvent/HTTP transports, `data-formspec-*` DOM annotations, `requestUserInteraction()` integration. |
| 0054 | [privacy-preserving-ledger-chain](adr/0054-privacy-preserving-client-server-ledger-chain.md) | Proposed | **~40%** | Trellis v1.0 ratified (hash-chain, HPKE, Merkle, export). Respondent Ledger spec authored. WOS provenance chain with `ProvenanceSigner`. Missing: client-side ledger, zkSNARKs, MPC, HE, privacy-tier enforcement, DID adapters, real `Ed25519FileKeySigner`. |
| 0055 | [studio-semantic-workspace-consolidation](adr/0055-studio-semantic-workspace-consolidation.md) | Proposed | **~70%** | Logic+Data merged into Editor. Build/Manage toggle, Form Health panel, Screener toggle, `Evidence` tab all shipped. Missing: Response Inspector, Simulation section, inline tree expansion replacing properties panel, Blueprint auto-switch. Dead code not cleaned (`EditorPropertiesPanel`, `LogicTab`, `DataTab` files remain). |
| 0056 | [click-to-sign-attestation](adr/0056-click-to-sign-attestation-component.md) | Proposed | **Not started** | Prerequisite schemas exist (`attestation.captured` event, `authoredSignatures` on Response). No `ClickToSign` component, behavior hook, adapter, registry entry, spec prose, or tests. |
| 0059 | [unified-ledger-canonical-event-store](adr/0059-unified-ledger-as-canonical-event-store.md) | Narrative locked 2026-04-22 | **~50%** | Trellis v1.0 ratified with append-only store, COSE_Sign1, HPKE, Merkle, deterministic export, crypto-shredding, C2PA sidecar. Missing: identity layer (DIDs/VCs), full governance event taxonomy (~25 types; only 3 defined), CQRS projections, external anchoring (Rekor/Trillian), data-hosting tiers. |
| 0062 | [post-split-follow-ups](adr/0062-post-split-follow-ups.md) | Proposed | **~70%** | Slices 1 (handler registry→static map), 2 (JSON-native state), 3 (decomposition, partial), 5 (registry seam) done. Slice 4 (batch API collapse) structurally resolved via `CommandPipeline` but 4-path API surface remains. |
| 0063 | [release-trains-by-tier](adr/0063-release-trains-by-tier.md) | Proposed | **~60%** | Steps 1-3 done: version matrix + authoring instructions in `.changeset/README.md`, `fixed` groups in Changesets config, 4-job CI matrix with per-tier filtering and sequential ordering. Missing: dual release tags, per-tier CHANGELOGs, `updateInternalDependencies` config change. |
| 0066 | [stack-amendment-and-supersession](adr/0066-stack-amendment-and-supersession.md) | Proposed | **~30%** | All 7 `ProvenanceKind` variants + Rust constructors + tests + export adapters done. Missing: schema `$defs`, governance policy sections, runtime emission wiring, Trellis vectors/verifier, `ResponseCorrection` in Formspec, lint rule K-A-010. |
| 0067 | [stack-statutory-clocks](adr/0067-stack-statutory-clocks.md) | Proposed | **~30%** | `ClockStarted`/`ClockResolved` records + schema `$defs` + conformance tests + export done. Missing: runtime emission (AppealClock, ProcessingSLA, GrantExpiry, StatuteClock), pause/resume, Trellis vectors/verifier, Formspec StatuteClock origination. |
| 0068 | [stack-tenant-and-scope-composition](adr/0068-stack-tenant-and-scope-composition.md) | Proposed | **~35%** | `IdentityAttestation` record, `is_valid_tenant` grammar, `CaseInstance.tenant`, durable runtime contract done. Missing: Trellis `tenant` field in envelope, lint rule K-C-010, Formspec response `tenant` field, scope-bundle four-tuple enforcement, tenant-scope export bundles. |
| 0069 | [stack-time-semantics](adr/0069-stack-time-semantics.md) | Proposed | **~20%** | `ClockSkewObserved` record + schema + tests. Trellis nanosecond timestamps, canonical order by `prev_hash`. Missing: FEL timezone hard-refusal (D-6), second-precision rejection, backwards-timestamp rejection, leap-second rejection, TSA `clock_source`, lint rules K-T-010/K-T-011. |
| 0070 | [stack-failure-and-compensation](adr/0070-stack-failure-and-compensation.md) | Proposed | **~25%** | `CommitAttemptFailure`/`AuthorizationRejected` records + `InstanceStatus::Stalled` + `stalled_since` + conformance tests done. Missing: `AppendFailure` enum, retry-budget enforcement, runtime emission, Trellis `failures.json`, lint rules K-F-010/K-F-011. |
| 0071 | [stack-cross-layer-migration-and-versioning](adr/0071-stack-cross-layer-migration-and-versioning.md) | Proposed | **~25%** | `MigrationPinChanged` record + schema + tests + export done. Missing: `CaseOpenPin` wire home decision, Trellis envelope slot, verifier pin-immutability, cross-version replay suite, shared `pins.md`. |
| 0072 | [stack-evidence-integrity-and-attachment-binding](adr/0072-stack-evidence-integrity-and-attachment-binding.md) | Accepted | **Done** | Full Trellis + Formspec implementation: schema, verifier (D-6 all 5 checks), export bundle, 4 fixture vectors, Python verifier parity. WOS evidence-intake deferred to WOS-side implementation. |
| 0073 | [stack-case-initiation-and-intake-handoff](adr/0073-stack-case-initiation-and-intake-handoff.md) | Accepted | **Done** | Full implementation: `IntakeHandoff` schema, `CaseCreated`/`IntakeAccepted`/`IntakeRejected`/`IntakeDeferred` provenance records, WOS runtime `accept_intake_handoff` (11 tests), Formspec binding parser, conformance tests, Trellis vectors. Shared stack fixture bundle outstanding. |
| 0074 | [formspec-native-field-level-transparency](adr/0074-formspec-native-field-level-transparency.md) | Proposed | **Not started** | Planning artifacts only (PLN-0342..0346, PLN-0382). No schema changes, no `accessControl` property, no `ClassId` newtype, no bucketed Response shape, no Phase 5 emission step, no lint rules, no conformance fixtures. |
| 0075 | [rejection-register](adr/0075-rejection-register.md) | Proposed | **~40%** | ADR landed with 12 invariants + 15 rejection rows. VISION.md and PLANNING.md reference it. Missing: downstream doc reconciliation (README, counter-proposal-disposition, gap-analysis), CI lint rule (PLN-0264), amendment vs supersession policy. |
| 0076 | [product-tier-consolidation](adr/0076-product-tier-consolidation.md) | Proposed | **~85%** | 27→6 schema collapse done. Merged `wos-workflow.schema.json` (6101 lines) with 7 embedded blocks. Rust runtime + lint updated. `work-spec/TODO.md` confirms "substantively closed." Missing: Studio TS-type consolidation (WS-100), legacy tooling schema absorption, `RELEASE-STREAMS.md` rewrite. |
| 0078 | [foreach-topology](adr/0078-foreach-topology.md) | Proposed | **~15%** | Schema `foreach` type + properties added to `wos-workflow.schema.json`. Counter-proposal adopted. Missing: `StateKind::Foreach` in Rust, conditional `allOf` block, kernel prose (§4.3), lint rules, provenance iteration records, conformance fixtures, runtime execution. |
| 0079 | [formspec-native-intake-handoff-emission](adr/0079-formspec-native-intake-handoff-emission.md) | Proposed | **Not started** | Prerequisite IntakeHandoff schema exists (ADR 0073). No `targetWorkflow` field, no emission pipeline, no cross-spec lint rules, no conformance fixtures, no migration note. |
| 0080 | [governed-output-commit-pipeline](adr/0080-governed-output-commit-pipeline.md) | Proposed | **~20%** | `OutputBinding` schema `$defs`, `WOS-VER-LEVEL-001` lint rule, `apply_output_binding` runtime function, provenance mutation fields done. Missing: unified `commit_external_output`, write-scope enforcement (6 lint rules), reserved record kinds, conformance fixtures, surface attachments for 4/6 work types. |
| 0081 | [content-addressed-artifact-identity](adr/0081-content-addressed-artifact-identity.md) | Proposed | **Not started** | All PLN rows (PLN-0358..0364, PLN-0375/0376) Open. JCS+SHA-256 precedent exists for `caseFileSnapshot` but not extended to all definition-class artifacts. No `*Ref` syntax, no shared canonicalization library, no lint rule, no fixtures. |

### Audit summary (2026-04-29)

| Impl status | Count | ADRs |
|-------------|-------|------|
| **Done** | 2 | 0072, 0073 |
| **Partially done** | 22 | 0029–0031, 0039–0040, 0042, 0048, 0053–0055, 0059, 0062–0063, 0066–0071, 0075–0076, 0078, 0080 |
| **Not started** | 6 | 0051, 0052, 0056, 0074, 0079, 0081 |
| **Archived (done/superseded)** | 9 | 0014, 0036, 0037, 0041, 0061+sidecar, 0064, 0065, 0077 → [`archive/adr/`](archive/adr/) |

**Cross-cutting observations:**

1. **WOS stack-closure cluster (0066–0071)** follows a consistent pattern: `ProvenanceKind` Rust variants + schema `$defs` + conformance tests landed; runtime emission wiring, Trellis verifier obligations, and lint rules are universally open. Cluster ratification is gated on coordinated landing.
2. **Trellis v1.0 is ratified** with strong cryptographic integrity (hash-chain, HPKE, Merkle, deterministic export), but identity (DIDs/VCs), governance events, and selective-disclosure layers remain future work.
3. **Formspec engine surface** is mature (locale, screener, FEL, components, mapping); gaps concentrated in privacy/transparency (0074), PDF (0051), and cross-system emission (0079).

Actionable follow-ups → [`adr/TODO.md`](adr/TODO.md).

**Implemented / accepted / historical ADRs:** [`archive/adr/`](archive/adr/) (tier plans, WASM split, WOS boundary, grant design, etc.).

---

## Active plans

| File | Summary |
|------|---------|
| [self-contained-grant-app](plans/2026-02-27-self-contained-grant-app.md) | Vite example under `examples/grant-application` (not done) |
| [ralph-loop-execution](plans/2026-02-28-ralph-loop-execution.md) | Parity / iteration harness (Proposed) |
| [editor-canvas-audit](plans/2026-03-13-editor-canvas-audit.md) | Editor canvas audit |
| [u1-u4-mcp-ux-fixes](plans/2026-03-16-u1-u4-mcp-ux-fixes.md) | MCP UX fixes |
| [cloudflare-form-deploy](plans/2026-03-17-cloudflare-form-deploy.md) | Deploy scaffold |
| [pages-behavioral-api](plans/2026-03-17-pages-behavioral-api.md) | Pages behavioral API (Draft) |
| [features-page-copy-revision](plans/2026-03-18-features-page-copy-revision.md) | Marketing copy |
| [locale-engine-integration](plans/2026-03-20-locale-engine-integration.md) | Locale + FieldVM (Proposed) |
| [formspec-frame-implementation](plans/2026-03-23-formspec-frame-implementation.md) | Frame package (Draft) |
| [rust-layout-finish](plans/2026-03-24-rust-layout-finish.md) | Rust layout / PDF crates |
| [unified-authoring-finish](plans/2026-03-24-unified-authoring-finish.md) | Unified authoring convergence |
| [uswds-adapter-tech-debt](plans/2026-03-29-uswds-adapter-tech-debt.md) | USWDS adapter cleanup |
| [layout-workspace-completion](plans/2026-04-01-layout-workspace-completion.md) | Layout workspace follow-ups |
| [phase11-coprocessor-fel](plans/2026-04-11-phase11-coprocessor-fel.md) | Phase 11 FEL / coprocessor execution |
| [phase11-coprocessor-open-backlog](plans/2026-04-11-phase11-coprocessor-open-backlog.md) | Phase 11 closure / collateral |
| [trellis-trim-and-dedup](plans/2026-04-15-trellis-trim-and-dedup.md) | Trellis crate trim + deduplication |
| [changelog-generation-fails-doctype-detection](plans/2026-04-17-changelog-generation-fails-doctype-detection.md) | Changelog generator doctype-detection bug fix |

**Completed plans:** [`archive/plans/`](archive/plans/).

---

## Active specs

| File | Summary |
|------|---------|
| [formspec-chat-design](specs/2026-03-14-formspec-chat-design.md) | Conversational builder PRD |
| [project-ts-split](specs/2026-03-15-project-ts-split.md) | Split monolithic `project.ts` |
| [pages-layout phase 2–3 + parent](specs/2026-03-18-pages-layout-phase2-overview.md) | Pages / layout builder phases |
| [pages-tab-layout-builder](specs/2026-03-18-pages-tab-layout-builder.md) | Parent design for pages builder |
| [pages-layout-phase3-focus](specs/2026-03-18-pages-layout-phase3-focus.md) | Focus mode grid |
| [presentation-locale-fieldvm](specs/2026-03-21-presentation-locale-and-fieldvm-design.md) | Locale + FieldVM |
| [rust-layout-planner-pdf](specs/2026-03-24-rust-layout-planner-and-pdf.md) | Rust planner / PDF future |
| [unified-authoring-architecture](specs/2026-03-24-unified-authoring-architecture.md) | Unified authoring v6 |
| [formspec-swift-design](specs/2026-03-25-formspec-swift-design.md) | Swift renderer design |
| [page-mode-presentation-design](specs/2026-03-25-page-mode-as-presentation-design.md) | `pageMode` presentation |
| [assist-chat](specs/2026-03-26-assist-chat.md) | Filling-layer chat (future package) |
| [formy-extension](specs/2026-03-26-formy-extension.md) | Browser extension |
| [locale-translation-management](specs/2026-03-26-locale-translation-management.md) | Translation UX |
| [references-ontology-authoring-ux](specs/2026-03-26-references-ontology-authoring-ux.md) | References / ontology UX |
| [assist-remediation](specs/2026-03-27-assist-remediation.md) | Assist review remediation |
| [editor-layout-split-design](specs/2026-03-27-editor-layout-split-design.md) | Editor vs layout split |
| [definition-advisories](specs/2026-03-31-definition-advisories.md) | Definition advisories / Form Health |
| [formspec-brand-guidelines](specs/2026-04-06-formspec-brand-guidelines.md) | Brand voice / visual |
| [phase4-follow-up-design-decisions](specs/2026-04-07-phase4-follow-up-design-decisions.md) | Repeat-target FEL / tree paths |
| [formspec-wos-phase11-integration-master](../work-spec/thoughts/specs/2026-04-11-formspec-wos-phase11-integration-master.md) | **WOS ↔ Formspec Phase 11 index** *(in `work-spec/` submodule)* |
| [platform-decisioning-forks-and-options](specs/2026-04-22-platform-decisioning-forks-and-options.md) | **Platform decision register** — end-state commitments, leans, forks, kill criteria (cited by CLAUDE.md Operating Context) |
| [shared-cross-seam-fixture-bundle-design](specs/2026-04-24-shared-cross-seam-fixture-bundle-design.md) | Shared cross-seam fixture bundle design |

**Delivered / merged design specs (historical):** [`archive/specs/`](archive/specs/) (MCP, core split, assist interop, layout workspace DnD, Astro site, etc.).

---

## Reviews

See [`reviews/README.md`](reviews/README.md) — what stayed at top level vs [`archive/reviews/`](archive/reviews/).

---

## Research

See [research/README.md](research/README.md) — external spec analysis (XForms, FHIR, SHACL), competitive proposals (Claude/GPT/Gemini), and the [foundational architecture thesis](research/solutions-architecture-proposal.md).

---

## Studio

Studio thoughts moved to [`../../formspec-studio/thoughts/`](../../formspec-studio/thoughts/). Archived works remain under [`archive/studio/`](archive/studio/).

---

## Examples

Reference example implementation plans (formerly `refrence/`):

- [grant-report-plan](examples/2026-03-04-grant-report-plan.md) — Tribal Grant Annual Report
- [invoice-plan](examples/2026-03-04-invoice-plan.md) — Invoice with Line Items
- [clinical-intake-plan](examples/2026-03-04-clinical-intake-plan.md) — Clinical Intake Survey
