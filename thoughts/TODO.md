# Formspec Work Tracking

Formspec-level ADR, plan, spec, research, and review tracking. Code-validated 2026-05-14. Stack-level cross-reference → [`../../thoughts/adr/TODO.md`](../../thoughts/adr/TODO.md). Full task CSV → [`TODO.csv`](TODO.csv) (346 rows, includes `status` column from swarm validation 2026-05-14).

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

---

## Swarm validation details (2026-05-14)

All 346 tasks validated by 9 parallel formspec-scout agents. Each task's target file was checked for feature presence. See per-scout reports above for file:line evidence.

| Status | Count | % |
|--------|-------|---|
| ✅ DONE | 158 | 46% |
| ⚠️ PARTIAL | 27 | 8% |
| ❌ NOT_DONE | 159 | 46% |
| ❓ UNKNOWN | 2 | <1% |

**By source group:**

| Group | DONE | PARTIAL | NOT_DONE |
|-------|------|---------|----------|
| ADR 0029 (grant examples) | 59 | 3 | 12 |
| ADR 0030 (changelog/mapping) | 46 | 1 | 3 |
| ADR 0031 (screener/registry) | 20 | 5 | 14 |
| ADR 0040 (MCP tools) | 16 | 1 | 2 |
| ADR 0048 (locale) | 7 | 4 | 8 |
| ADR 0053 (assist) | 7 | 10 | 10 |
| Plans | 2 | 1 | 13 |
| Spec 2026-03-24 (Rust) | 0 | 0 | 40 |
| Spec 2026-03-26 | 1 | 4 | 43 |
| Spec 2026-03-31 (advisories) | 0 | 0 | 12 |

**Notable partial implementations:** ADR 0053 assist tools exist but are inline in `provider.ts` rather than the spec'd file layout; ADR 0048 locale engine implementation exists in `src/locale.ts` not `src/i18n/`; Spec definition-advisories spec prose and Rust Pass 8 are fully designed but unimplemented.

---

## P0 deep-dive (2026-05-14) — 24 tickets, 3 scouts

Scouts traced each P0 ticket from symptom → root domino → product impact, evaluating whether each change should be bigger (additional files, test strategy, cascade).

### Recommended merge groups (ship together)

| Merge group | Tickets | Why together | Est. effort |
|-------------|---------|-------------|-------------|
| **M1: Grant-app shape+uri convergence** | 0029-003, 0029-015, 0029-017, 0031-023 | All touch `definition.json`; engine fixture is canonical source; back-syncs share a single target file. | ~2h |
| **M2: Theme pages + regions + responsive** | 0030-032, 0030-033, 0030-034 | Pages need regions; regions need responsive. 3 serial PRs would conflict. One commit. | ~2h |
| **M3: MCP addWizardPage** | PLAN-001, PLAN-002, 0031-005 | `add_group` handler + registration, plus registry.json (prerequisite for dependent tickets). | ~1.5h |
| **M4: ARIA describedBy cleanup** | PLAN-008, PLAN-009 | Default + USWDS adapters, same dead code pattern. One commit. | ~1h |
| **M5: formatNumber + formatDate FEL** | 0048-012, 0048-013 | Same locale-formatting module, same dispatch table. Fix together or neither works. | ~2h |
| **M6: Assist DOM annotations** | 0053-017, 0053-018 | Share AdapterContext injection; `data-formspec-*` is prerequisite for `toolparamdescription` integration. | ~3h |
| **M7: Spec advisories prose** | SPEC-089, SPEC-090 | §3.10.3 insertion + §3.10 retitling. Single spec edit. | ~1h |
| **M8: Rust Pass 8 + tests + Python** | SPEC-092, SPEC-093, SPEC-096, SPEC-097, SPEC-098 | Pipeline integration + test coverage + Python bridge + MCP surface. Full stack. | ~5h |
| **Standalone** | 0040-013 (outputSchema) | Bulk mechanical change across 49 tools. Independent of other P0 work. | ~3h |

### Key scope-expansion findings

P0 tickets that scouts flagged as **too narrow as written:**

- **0029-003, 0029-015, 0029-017**: The `benchmarks/tasks/grant-application/reference/definition.json` has the same drift. Fix ALL THREE copies (example, benchmark reference, engine fixture) for convergence — or at minimum verify the engine fixture is canonical and propagate forward.
- **0030-032/033/034**: theme-pdf.json already has pages/regions. The web theme has orphaned breakpoints. These tickets should be merged into one commit that adds pages WITH regions WITH responsive — otherwise the intermediate state is broken (pages without regions).
- **0031-005**: Zero independent value. 11 dependent tickets blocked on it. Either ship with the first dependent ticket (0031-006) or create a skeleton that passes schema validation and is immediately extended.
- **0053-017/018**: Should add `toolAnnotations` to `AdapterContext` (a shared type) so ALL adapters (default, USWDS, Tailwind) pick up `data-formspec-*` and `toolparamdescription` without per-adapter work.
- **SPEC-092**: The Rust Pass 8 should also scan screener items and shape paths (not just definition items), extending what the current TS `buildAdvisories` checks.

### Test strategy per group

| Group | Test location | Key assertion |
|-------|--------------|---------------|
| M1 | `tests/conformance/suite/`, `tests/unit/` | No regression on `info: 0` in submit mode; `uri` is valid dataType |
| M2 | `cargo nextest run -p formspec-lint`, `npm test` | Lint handles pages/regions; E2E doesn't break |
| M3 | `packages/formspec-mcp/tests/structure.test.ts` | `add_group` creates definition group + sets wizard mode |
| M4 | Playwright E2E | `aria-describedby` on inputs stays in sync with desc/hint changes |
| M5 | `cargo nextest run -p fel-core` | `formatNumber(1234.5)` returns `"1,234.5"` |
| M6 | Playwright E2E | `[data-formspec-path]` count = field count |
| M7 | `npm run docs:check` | Generated artifacts pass freshness check |
| M8 | `cargo nextest run -p formspec-lint` | W900 fires for required+readonly; suppressed when calculate present |
| 0040-013 | `packages/formspec-mcp/tests/` | Every tool validates response against outputSchema |

---

## P1 deep-dive (2026-05-14) — 20 tickets, 3 scouts

All P1 tickets evaluated for root-cause layer, product impact, and scope expansion. 1 duplicate found (SPEC-042 = 0053-020, same deliverable extracted from ADR and spec sources).

### Recommended merge groups

| Ship unit | Tickets | What | ~Effort |
|-----------|---------|------|---------|
| **M9: Component exercises** | 0029-034, 0029-035, 0029-043, 0029-045, 0029-060, 0029-061 | Stack align/wrap, TextInput inputMode/suffix, Panel left, Modal auto — all component.json | 1h |
| **M10: ARIA describedBy last mile** | PLAN-010 | Remove 3 remaining manual sets in radio-group, checkbox-group, text-input adapters | 1h |
| **M11: Extensions back-sync** | 0029-020 | Add missing x-budget-version + x-help-link; align benchmark reference copy too | 1h |
| **M12: Fixture constraintKinds** | 0029-067 | Add cardinality + shape validation results to submission-in-progress.json | 1h |
| **M13: Registry entries** | 0031-006→011 | 6 entries on registry.json (blocked on 0031-005/P0). Map statuses to cover all 4 incl. retired | 1.5h |
| **M14: Assist transport** | 0053-004, 0053-026 | Transport abstraction (interface + InProcess + PostMessage) + HTTP transport (blocked) | 4h |
| **M15: Assist consent** | 0053-013 | Wire requestUserInteraction into profile.apply confirm flow + tool schema annotations | 2h |
| **M16: Assist-chat scaffold** | 0053-020, SPEC-042 (duplicate) | Create formspec-assist-chat/ with interfaces + stubs. Merge SPEC-042→0053-020 | 1h |

### Key scope-expansion findings

- **0029-020**: Three-way divergence between example, benchmark reference, and engine fixture. Fix example AND benchmark. Engine fixture is canonical — consider making it the source of truth.
- **0029-067**: The `retired` lifecycle status is missing from ALL registries (not just grant-app). Kitchen-sink fixture also lacks it. Should backfill kitchen-sink for conformance coverage.
- **0031-011**: `retired` has zero coverage in any fixture across the entire repo — schema permits it, nothing exercises it. This is a test gap, not just an example gap.
- **0053-004**: The transport abstraction blocks 0053-026. Ship abstraction + at least InProcess + PostMessage concretes in one commit.
- **0053-020/SPEC-042**: Identical tickets (ADR 0053 and Spec assist-chat both extracted the same package scaffold). Mark SPEC-042 as duplicate-of:0053-020.
- **PLAN-010**: `screener.ts` has 4 more manual `aria-describedby` sets outside the default adapters (lines 230,255,268,284) — out of scope for this ticket but worth tracking separately.
- **0029-043**: Ticket claims 8 inputMode values (`text/decimal/numeric/email/url/tel/search/none`) but schema only supports 5 (`text/email/tel/url/search`). Schema analysis gap in original extraction.

### Test strategy per group

| Group | Test location | Key assertion |
|-------|--------------|---------------|
| M9 | Playwright E2E + visual | Stack wraps, url keyboard on mobile, Panel left, Modal auto-opens |
| M10 | Playwright E2E | aria-describedby stays in sync on radio-group/checkbox-group/text-input |
| M11 | `grep` across 3 copies | x-budget-version + x-help-link present in all grant-app definitions |
| M12 | Python conformance | All 6 constraintKind values found in fixtures |
| M13 | `cargo nextest run -p formspec-core` | Registry entries pass schema validation (registry_client) |
| M14 | `packages/formspec-assist/tests/` | Transport registration + tool invoke round-trips |
| M15 | `packages/formspec-assist/tests/` | `requestUserInteraction` called when `confirm: true` |
| M16 | `npm run build` | Package builds; `createChatSession` returns ChatSession |

---

## P2 deep-dive (2026-05-14) — 20 tickets, 3 scouts

### Status changes discovered
- **0031-001, 0031-002** → **WONTFIX** (superseded by spec §1.3 — screener is now a standalone document, not embedded in definition.json)
- **PLAN-016** → **DONE** (SubmitButton is fully specified in spec, schema, types, runtime across all layers)
- **0030-047, SPEC-091** → still NOT_DONE but **BLOCKED** on P0 dependencies
- **PLAN-004, PLAN-005** → still NOT_DONE but **BLOCKED** on PLAN-001 (P0)
- **PLAN-006** → still NOT_DONE but **BLOCKED** on PLAN-003 (P2, same group)

### Recommended merge groups

| Ship unit | Tickets | What | ~Effort |
|-----------|---------|------|---------|
| **M17: Component E2E tests** | 0029-075, 0030-046, 0031-037 | Playwright tests for new component props, ref fragment resolution, writable instances | 2h |
| **M18: Registry Python facade** | 0031-018 | Create `src/formspec/registry.py` wrapping Rust bridge | 1h |
| **M19: MCP tool consolidation** | 0040-017 | Merge 49→28 tools per merge plan | 4h |
| **M20: PAGED_ROOT_NON_GROUP fix + tests** | PLAN-003, PLAN-006 | Add themePlacedKeys set, differentiate message, add test | 2h |
| **M21: DataTable widget catalog** | PLAN-012, PLAN-014, PLAN-015, PLAN-017 | DataTable in widget catalog + UI toggle + column config + SubmitButton palette entry | 3h |
| **M22: Lint mode wiring** | SPEC-094, SPEC-095 | Add W9xx to Authoring suppressed set; add W9xx no-promotion guard + test | 1h |
| **Standalone** | SPEC-091 | Blocked on SPEC-089; add one-sentence cross-ref once §3.10.3 exists | 10min |
| **Stale** | 0030-047 | Blocked on M2; close as wontfix if pages never land | — |

### Test strategy per group

| Group | Test location | Key assertion |
|-------|--------------|---------------|
| M17 | Playwright grant-app specs | component properties render; altContact fields in DOM; scratchPad reads/writes via FEL |
| M18 | `python3 -c "from formspec.registry import Registry"` | Import succeeds; `Registry.load()` round-trips through Rust |
| M19 | `packages/formspec-mcp/tests/integration.test.ts` | Pre-merge and post-merge flows identical for key authoring paths |
| M20 | `packages/formspec-core/tests/diagnostics.test.ts` | Theme-placed item fires diagnostic with "theme-placed" wording |
| M21 | Vitest (studio-core) + Playwright (studio E2E) | DataTable appears in group widget palette; SubmitButton adds node |
| M22 | `cargo nextest run -p formspec-lint` | W900 suppressed in Authoring; W900 NOT promoted in strict mode |

---

## P3 deep-dive (2026-05-14) — 16 tickets, 2 scouts

### Status changes discovered
- **0029-072** → **DONE** (multiChoice array values already in sample-submission.json:42-45)
- **SPEC-099** → NOOP (condition not met — Rust Pass 8 hasn't shipped via WASM)
- **SPEC-100** → FUTURE (mapping-aware check not started)
- **0048-014→017** → BIGGER THAN DESCRIBED (require new `DocumentType::Locale` + cross-doc infrastructure, not just a lint pass)

### Recommended merge groups

| Ship unit | Tickets | What | ~Effort |
|-----------|---------|------|---------|
| **M23: Per-field currency** | 0029-005 | Add currency to requestedAmount + optional 2nd money field | 1h |
| **M24: SummaryRow instantiation** | 0029-031 | Replace built-in Summary with SummaryRow custom component | 1h |
| **M25: NRB=empty fixture** | 0029-074 | Create submission-university.json exercising nonRelevantBehavior empty | 1h |
| **M26: ValidationReport metadata** | 0030-043 | 3-line fix wiring definition.url/version through engine | 30min |
| **M27: Registry enrichment** | 0031-012→016 | deprecationNotice, specUrl/schemaUrl, examples, mappingDslVersion, extensions — all on registry.json (blocked on 0031-005) | 1h |
| **M28: Locale lint foundation** | 0048-014→017 | New DocumentType::Locale + pass_locale.rs + LintOptions expansion (bigger than tickets describe) | 6h |
| **NOOP** | SPEC-099, SPEC-100 | Condition not met / future work | — |

### Key scope-expansion findings

- **0048-014→017** are significantly larger than their 1-line descriptions suggest. They require:
  1. Adding `DocumentType::Locale` recognition + `$formspecLocale` marker detection in schema_validator.rs
  2. A new `pass_locale.rs` module (pass 9 in the pipeline)
  3. Cross-document `LintOptions` expansion (locale documents, definition documents)
  4. FEL `{{expression}}` extraction — if spec supports arbitrary FEL, not just variable refs, L301 becomes a full FEL parse
  5. Python-side `validate_all()` integration
  - Estimated effort: ~6h for basic passes, likely more for FEL expression support
- **0029-005**: Consider adding a 2nd money field (`euPortion` with `EUR`) for genuine mixed-currency demo
- **0030-043**: 3-line fix, highest-RoI ticket in this batch (fixes real traceability hole for multi-definition deployments)

---

## P4 deep-dive (2026-05-14) — 108 tickets, 3 scouts

Group-level analysis of all speculative/future work.

### Key findings by group

| Group | Tickets | Current state | ~Effort | P4 correct? |
|-------|---------|--------------|---------|-------------|
| Rust theme crate | SPEC-001→008 | TS equivalent in formspec-layout; no crate | 4-6h | Yes |
| Rust plan crate | SPEC-009→019 | TS equivalent in formspec-layout; no crate | 8-12h | Yes |
| WASM bridge | SPEC-020→023 | wasm crate exists; no theme/plan/pdf flags | 3-4h | Yes |
| Rust PDF crate | SPEC-024→040 | Greenfield; ADR 0051 blocked | 25-40h | **Promote 4a to P3** |
| formy extension | SPEC-049→058 | **Submodule doesn't exist** — all 10 BLOCKED | 30-50h | P4 but add BLOCKED label |
| Locale translation | SPEC-059→069 | SPEC-060 DONE; design exists; rest greenfield | 16-24h | Yes |
| Refs-ontology | SPEC-070→088 | 1 PARTIAL (ContextResolver); rest greenfield | 36-56h | Yes (heaviest group) |
| Assist-chat | SPEC-041→048 | Chat exists in formspec-studio; LLMAdapter not in Layer 0 | 2-3wks | Yes, arguably P5 |
| Assist PARTIALs (paths) | 0053-005→012 | Code exists at wrong paths; monolith provider.ts | ~1 day | **Should be P3** |
| Assist NOT_DONEs | 0053-019→025 | Blocked on 0053-020 (P1 scaffold) | — | Yes |
| Locale naming | 0048-005→009 | Code exists with different names; path mismatches | ~hours | **Should be P3** |
| Misc | 0040-014, 0048-011, 0048-018 | PARTIAL/NOT_DONE; no demand driver | ~1wk each | Yes |

### Items that should be promoted

**SPEC-024→027 (PDF 4a) → P3.** Unblocks ADR 0051. Font metrics + measurement + pagination are independent of other Rust crate work. ADR 0051 is BLOCKED on this. PDF output is a product requirement for government forms — the stack already ships PDF-specific themes.

**0053-005→012 (path fixes) → P3.** All PARTIALs exist but at wrong paths or inline in 969-line `provider.ts`. Organizational debt, not feature gaps. Extracting to `src/tools/`, `src/shim/`, `src/profile/`, `src/resolver/` is ~1 day.

**0048-005→009 (locale naming) → P3.** `resolveLocaleString` exists at FormEngine.ts:690. Fallback chain, FEL interpolation, `@context` suffix all exist in `locale.ts` and `field-view-model.ts`. Adding aliases or renaming is ~30min.

### Items that need explicit BLOCKED label

**SPEC-049→058 (formy):** `formy-extension/` submodule does not exist at `../formy-extension/` or anywhere in the monorepo. All 10 tickets are unstartable until this is created.
