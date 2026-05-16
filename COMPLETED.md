# Formspec — Completed Work Log

This file holds completed items and completion notes moved out of `TODO.md` so active backlog work stays focused.

## Snapshot Notes

**Validated 2026-04-22.** Items #29, #30, #31, #32 all landed in the 2026-04-19 batch. All 29 previously-draft lint rules now graduated (37 total tested, 0 draft). Cross-repo WOS-T4 / Trellis signature closeout is now tracked canonically here at the stack level; submodule TODOs remain the local execution notes. Formspec's signed-response / `authoredSignatures` slice landed 2026-04-22. Trellis `SignatureAffirmation` append/export/verify/tamper vectors and Core extension prose landed 2026-04-22 (`trellis/` submodule).

## Resolved

- **FORMSPEC-BENCHMARK-HARNESS-001 closed 2026-05-15** (`fs-l5b9`) — `benchmarks/test_benchmark_harness.py` already exercises four real tasks (`clinical-intake`, `grant-application`, `grant-report`, `invoice`); 15/15 tests pass. The `pytest.skip('no tasks yet')` branches at lines 64/90/103 are vestigial dead arms of `_task_ids() or ["__placeholder__"]` parametrize guards — only hit when the task tree is empty. TODO claim that the harness skipped all tests was stale; no engineering work was required.
- **Respondent Ledger §6.2 MUST promotion closed 2026-04-22** — `eventHash` / `priorEventHash` are now mandatory when a Respondent Ledger event is wrapped by a Trellis envelope; `priorEventHash = null` is reserved for the first wrapped event.
- **ADR 0072 Formspec-side implementation closed 2026-04-22** — `attachment.added` / `attachment.replaced` now carry `EvidenceAttachmentBinding`; `attachment.removed` references `priorAttachmentBindingHash` without minting a new binding; schema conditionals and a concrete attachment-binding fixture landed.

### Resolved 2026-04-19 batch

- **#30** — Changelog snake→camel boundary hardened. `generate_changelog` Python binding now accepts `wire_style="snake" | "camel"`; `change_to_object` in `crates/formspec-core/src/json_artifacts.rs` skips None for optional string fields so camel output matches `changelog.schema.json` directly. `_changelog_snake_to_camel` helper + 52 LOC of private allowlist deleted from `validate.py`. 8 new tests (5 Python, 3 Rust) pin the contract.
- **#31** — Release-pipeline scripts now have 22 tests across `scripts/tests/` (8 filter + 10 placement + 4 CLI subprocess). Scripts refactored to export pure `filterForTier` / `restoreFromScratch` / `checkPlacement` functions with CLI guards. CLI behavior preserved byte-for-byte.
- **#32** — Registry assertion at `tests/unit/test_lint_rule_registry.py` extracted into `_check_diagnostics_against_registry` that iterates all matching diagnostics instead of picking `matching[0]`. 5 new unit tests pin divergent-emission detection with per-emission locator.
- **#29 fully closed** — all 29 previously-draft lint rules graduated to `tested` with triggering fixtures and `with_metadata`-wrapped emission sites.
- **Schema additions** — `variant: "plain" | "richtext" | "markdown" | "latex"` on TextInput in both `schemas/component.schema.json` and `crates/formspec-lint/schemas/component.schema.json`.
- **Baselines** — 300 Rust lint tests green, 13/13 registry tests green, 1986 Python tests green.

### Resolved 2026-04-17 parallel-craftsman batch

- **#22** — FEL trace bridge through WASM → Python → TS → MCP. New MCP tool `formspec_fel_trace` returns `TraceStep[]` byte-identical to Rust.
- **#23** — `benchmarks/run_mcp_loop.py` verified end-to-end (`score=1.0 / validates=true` in one round on invoice task).
- **#24** — Tier-split release pipeline with scripted partitioning + per-tier sequential CI.
- **#25** — CI gate verified; 8 on-disk fixtures + generic registry-driven assertion replaced 3 hand-crafted per-rule tests.
- **#26** — 29 draft rules carry verified `specRef` + `suggestedFix` (state intentionally remained `draft` at that point).
- **#27** — Changelog E100 fix: envelope marker in generator + snake→camel translation at lint boundary + 4 round-trip conformance tests + benchmark widening.
- **#28** — ADR-0064 landed in earlier session; submodule pointer already current.

### Resolved items from editor/layout split review

- Studio-core extraction review batch resolved (type maps, dispatch typing, catalog entries, fallback removals, exports, dependency cleanup, duplicate tests).
- Individual review findings resolved across screener evaluation, widget hint casing, adapter defaults, dead code removal, layout mapping, bind pills, test naming, E2E placement, prose alignment, and cast cleanup.

### Resolved items from chaos-test + DnD review + studio plans

- ARCH/BUG/UX/CONF findings listed in the prior TODO log are completed and archived here.
- Includes FEL chain wiring, sigil hints, per-row shape evaluation, date coercion, repeat template required handling, sampling overrides, place-on-page resolution, status persistence, widget mapping fixes, wildcard shape rewrites, and documented sortable E2E limits.
