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

**Audit legend:** `Impl` = implementation status from 2026-05-14 codebase validation (updated from 2026-04-29 audit). `Doc` = status in the ADR file itself. Cross-reference parent tracking at [`../../thoughts/adr/TODO.md`](../../thoughts/adr/TODO.md).

| ADR | File | Doc | Impl | Notes |
|-----|------|-----|------|-------|
| 0029 | [schema-parity-phase1](adr/0029-schema-parity-phase1-enrich-existing.md) | Proposed | **~50%** | Definition/theme/component/response enrichments mostly done. All 3 named items (uri dataType, demand timing, message shape with interpolation) still not done. Per-enrichment E2E test coverage not verified. |
| 0030 | [schema-parity-phase2](adr/0030-schema-parity-phase2-new-artifacts.md) | Proposed | **7/8, ~70%** | Changelog, bidirectional mapping, XML/CSV adapters, definition composition, external validation, response lifecycle all done. Theme Pages & Regions (item E) not done — no `pages` or `regions` keys in theme.json. |
| 0031 | [schema-parity-phase3](adr/0031-schema-parity-phase3-new-subsystems.md) | Proposed | **~50%** | Screener, extension registry, scoped variables, multi-platform labels fully done. No grant-app `registry.json` (only kitchen-sink fixture exists); `retired` lifecycle, `source` instance unexercised. Grid.columns CSS string format unresolved. |
| 0039 | [seamless-page-management](adr/0039-seamless-page-management.md) | Proposed | **~40%** | Studio as sole writer + component-tree-native pages shipped. `addPage`/`removePage`/`placeOnPage`/`setItemWidth`/reorder all shipped. Missing: `pages.autoGenerate` handler, Response Inspector, Simulation section, `EditorPropertiesPanel`→`ItemRow` migration, `theme.pages` not removed. |
| 0040 | [mcp-tool-consolidation](adr/0040-mcp-tool-consolidation.md) | Proposed | **~55%** | Core consolidation done (65→28 equivalent). Post-ADR feature growth back to 46 tools. `outputSchema` not wired to MCP protocol. Actual tool count not updated in ADR. |
| 0042 | [launch-blog-posts](adr/0042-launch-blog-posts.md) | Proposed | **~80%** | 13 posts shipped. Post 5 (government/vendor) deferred. Cross-posting not set up. |
| 0048 | [i18n-as-locale-artifact](adr/0048-i18n-as-locale-artifact.md) | Proposed | **~45%** | Full stack: schema, spec, Rust FEL (`locale()`, `pluralCategory()`), `LocaleStore`, core handlers, webcomponent, React hook, MCP tool, E2E. Missing: `formatNumber()`/`formatDate()` FEL functions, locale lint rules (L101-L401), conformance Tier 2. |
| 0051 | [pdf-acroform-generation](adr/0051-pdf-acroform-generation.md) | Proposed | **Not started** | **Blocked:** superseded spec `rust-layout-planner-and-pdf.md` (status: Design) not implemented; three Rust crates don't exist. |
| 0052 | [remove-theme-page-layout](adr/0052-remove-theme-page-layout.md) | Proposed | **Not started** | **Blocked:** paired with 0039; schema removal breaks non-Studio consumers. Deprecation path decision pending. |
| 0053 | [webmcp-native-assist-protocol](adr/0053-webmcp-native-assist-protocol.md) | Proposed | **~40%** | All 14 assist tools + WebMCP shim + profile matcher + chat package done. Missing: PostMessage/CustomEvent/HTTP transports (none exist), `data-formspec-*` DOM annotations (only render-layer attrs exist), `requestUserInteraction()` integration. |
| 0055 | [studio-semantic-workspace-consolidation](adr/0055-studio-semantic-workspace-consolidation.md) | Proposed | **~40%** | Build/Manage toggle, Form Health panel, Screener toggle, Evidence tab, Blueprint auto-switch all shipped. Missing: Response Inspector, Simulation section, `EditorPropertiesPanel`→`ItemRow` migration. Dead code not cleaned (`EditorPropertiesPanel.tsx`, `LogicTab.tsx`, `DataTab.tsx` still present). |
| 0062 | [post-split-follow-ups](adr/0062-post-split-follow-ups.md) | Proposed | **~30%** | Slices 1 (handler registry→static map), 2 (JSON-native state), 3 (decomposition, partial), 5 (registry seam) done. Slice 4: `CommandPipeline` does not exist yet; batch API surface remains. `RawProject` (682 lines) not decomposed. |

### Stack-level ADRs (cross-reference)

ADRs 0054, 0056, 0059, 0063, 0066–0081, 0082–0093 are parent-level stack ADRs tracked in [`../../thoughts/adr/`](../../thoughts/adr/) and indexed in [`../../thoughts/adr/TODO.md`](../../thoughts/adr/TODO.md). Formspec-specific implementation status for shared ADRs is tracked under the per-ADR entries above (0029–0062). Blocked ADRs: 0051, 0052.

### Audit summary (updated 2026-05-14)

| Impl status | Count | ADRs |
|-------------|-------|------|
| **Partially done** | 10 | 0029 (~50%), 0030 (~70%), 0031 (~50%), 0039 (~40%), 0040 (~55%), 0042 (~80%), 0048 (~45%), 0053 (~40%), 0055 (~40%), 0062 (~30%) |
| **Not started** | 2 | 0051, 0052 |
| **Archived (done/superseded)** | 47 | 0001–0028, 0032–0038, 0041, 0043–0047, 0049–0050, 0057–0061, 0064–0065, 0077 → [`archive/adr/`](archive/adr/) |

**Cross-cutting observations:**

1. **Formspec engine surface is mature** (locale, screener, FEL, components, mapping); gaps concentrated in privacy/transparency (0074), PDF (0051), and cross-system emission (0079) — tracked at stack level.
2. **Active blockages:** 0051 (PDF — Rust layout planner not implemented), 0052 (Theme pages — deprecation path decision pending, paired with 0039).
3. **Stack-level ADRs (0066–0093)** tracked in [`../../thoughts/adr/TODO.md`](../../thoughts/adr/TODO.md); form-specific progress reflected in per-ADR entries above.

Actionable follow-ups → [`adr/TODO.md`](adr/TODO.md) and parent [`../../thoughts/adr/TODO.md`](../../thoughts/adr/TODO.md).

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
