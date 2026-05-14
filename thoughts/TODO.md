# Formspec Work Tracking

Formspec-level ADR, plan, spec, research, and review tracking. Code-validated 2026-05-14. Stack-level cross-reference → [`../../thoughts/adr/TODO.md`](../../thoughts/adr/TODO.md). Full task CSV → [`TODO.csv`](TODO.csv) (295 rows).

Directories: [`adr/`](adr/), [`plans/`](plans/), [`specs/`](specs/), [`research/`](research/), [`reviews/`](reviews/), [`archive/`](archive/).

---

## ADR status (code-validated 2026-05-14)

| ADR | Impl | Summary |
|-----|------|---------|
| 0029 | ~75% | 164 tasks extracted — definition/theme/component/response enrichment gaps |
| 0030 | ~90% | ~45 tasks extracted — changelog, mapping, XML/CSV, theme pages |
| 0031 | ~65% | ~45 tasks extracted — registry, scoped vars, instances, multi-platform |
| 0040 | ~55% | 19 tasks extracted — MCP consolidation, outputSchema, tool count |
| 0048 | ~45% | 19 tasks extracted — FEL functions, lint rules, conformance |
| 0051 | blocked | 3 crates + WASM bridge (see Spec 2026-03-24 below) |
| 0052 | blocked | theme.pages removal blocked on deprecation path decision |
| 0053 | ~40% | 27 tasks extracted — transports, annotations, assist-chat |

## Active specs

| Spec | Status | Tasks |
|------|--------|-------|
| [rust-layout-planner-and-pdf](specs/2026-03-24-rust-layout-planner-and-pdf.md) | Not started | 40 tasks — 3 crates (theme, plan, pdf) + WASM bridge + full pipeline. Blocks ADR 0051. |
| [assist-chat](specs/2026-03-26-assist-chat.md) | Not started | 8 tasks — package, ChatSession, guided walkthrough, suggestions, doc extraction |
| [formy-extension](specs/2026-03-26-formy-extension.md) | Not started | 10 tasks — Chrome M3, Mode 1-3, profile vault, WebAuthn, Firefox port |
| [locale-translation-management](specs/2026-03-26-locale-translation-management.md) | Not started | 11 tasks — MCP tools, Studio tab, context panel, TMS integration |
| [references-ontology-authoring-ux](specs/2026-03-26-references-ontology-authoring-ux.md) | Not started | 19 tasks — handlers, MCP tools, Context panel, AI suggestions |
| [definition-advisories](specs/2026-03-31-definition-advisories.md) | Partial | 11 tasks — spec prose (3), Rust Pass 8 (5), MCP surface (1), tests (2) |

## Active plans

| Plan | Status | Tasks |
|------|--------|-------|
| [u1-u4-mcp-ux-fixes](plans/2026-03-16-u1-u4-mcp-ux-fixes.md) | Partial | 6 tasks — addWizardPage, PAGED_ROOT_NON_GROUP fix, tests |
| [uswds-adapter-tech-debt](plans/2026-03-29-uswds-adapter-tech-debt.md) | Partial | 5 tasks — ARIA DescribedBy migration to core |
| [layout-workspace-completion](plans/2026-04-01-layout-workspace-completion.md) | Partial | 6 tasks — DataTable UI, SubmitButton spec+UI |

## Immediate extraction (highest impact, lowest effort)

These are the items from swarm extraction that can be completed in a single session:

1. **ADR 0030 — Theme pages gap:** Add `pages` + `regions` to main `theme.json` (exists only in `theme-pdf.json`). ~2h, closes the only remaining ~90% ADR.
2. **Plan u1-u4 — addWizardPage:** Add `'add_group'` action to `formspec_page` in `structure.ts:52-79`, wire to `project.addWizardPage()`. ~1h.
3. **Plan uswds — ARIA DescribedBy:** Move `aria-describedby` management into `bindSharedFieldEffects`, remove from all 26+ adapters. ~3h.
4. **Spec definition-advisories — Rust Pass 8:** `crates/formspec-lint/src/bind_consistency.rs` with W900/W901/W902. ~4h, closes TS duplication.
5. **Spec definition-advisories — spec prose:** Insert §3.10.3, retitle §3.10. ~1h.
6. **ADR 0048 — formatNumber/formatDate FEL:** Register in `fel-core/src/evaluator/core.rs` dispatch. ~2h.
7. **ADR 0053 — data-formspec-* annotations:** Emit assist annotations on rendered elements in webcomponent. ~3h.

## Archive counts

| Category | Active | Archived |
|----------|--------|----------|
| ADRs | 8 | 48 |
| Plans | 3 | 51 |
| Specs | 6 | 30 |
| Research | 24 md | 13 |
| Reviews | 2 | archived/reviews/ |

---

Stack-level ADRs (0054, 0056, 0059, 0063, 0066–0093) → [`../../thoughts/adr/`](../../thoughts/adr/).
