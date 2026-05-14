# Formspec — Work Tracking & Architecture Index

JSON-native declarative form specification. One definition renders on web, React, iOS, server — schema-constrained JSON throughout, AI-authorable directly. Built by [Michael Deeb](https://www.linkedin.com/in/michael-deeb/), [TealWolf Consulting](https://tealwolf.consulting/) with [Focus Consulting](https://focusconsulting.io/). Open-core: runtime under [Apache-2.0](LICENSE), authoring under [BSL 1.1](LICENSE-BSL).

[Website](https://formspec.org) · [Features](https://formspec.org/features/) · [Architecture](https://formspec.org/architecture/) · [Blog](https://formspec.org/blog/)

---

## Architecture

The specification — 20 JSON Schemas, normative prose, FEL grammar — is the abstraction boundary. TypeScript ⇒ WASM, Python ⇒ PyO3. One Rust kernel (7 crates, ~47k lines, 1,533 tests), every platform.

```
  schemas/ (structural truth)    specs/ (behavioral truth)    FEL grammar (expression truth)
       │                                │
  ┌────┴─────────────┐         ┌───────┴──────────────┐
  │ TypeScript Engine │◄─WASM──│ Rust Shared Kernel    │──PyO3──► Python
  │  Reactive signals │         │  FEL eval, lint, map  │           │ Adaptors
  │  <formspec-render>│         │  assembler, registry  │           │ CLI/validate
  └───────────────────┘         └───────────────────────┘           └───────────
```

**Crates:** `fel-core` / `formspec-core` / `formspec-eval` / `formspec-lint` / `formspec-changeset` / `formspec-wasm` / `formspec-py`. **TS packages:** `formspec-engine` (L1), `formspec-layout` (L1), `formspec-webcomponent` (L2), `formspec-core` (L2), `formspec-react` (L2), `formspec-assist` (L2), `formspec-adapters` (L3). Layer fence: `npm run check:deps`.

Full architecture → [CLAUDE.md](CLAUDE.md). Stack-level context → [`../VISION.md`](../VISION.md), [`../thoughts/adr/TODO.md`](../thoughts/adr/TODO.md).

---

## ADR follow-ups (code-validated 2026-05-14)

Per-ADR detail → [`thoughts/TODO.md`](thoughts/TODO.md). Blocked stack-level ADRs → [`../thoughts/adr/TODO.md`](../thoughts/adr/TODO.md) §4.

### Active gaps

| ADR | % | Remaining |
|-----|----|-----------|
| 0029 — Schema Parity Phase 1 | ~75% | 4 items in engine fixture only (not back-synced to `examples/grant-application/definition.json`): `dataType:"uri"`, `timing:"demand"`, `{{expression}}` interpolation, shape extensions. 6 component.json gaps: `Stack.align`, `Stack.wrap`, `TextInput.inputMode`, `TextInput.suffix`, `Panel.position:left`, `Modal.trigger:auto`. 2 `constraintKind` values (`cardinality`, `shape`) not exercised in submissions. |
| 0030 — Schema Parity Phase 2 | ~90% | `pages` + `regions` + responsive overrides in main `theme.json` (exists only in `theme-pdf.json`). |
| 0031 — Schema Parity Phase 3 | ~65% | `registry.json` missing from `examples/grant-application/` (kitchen-sink fixture exists but incomplete: no `retired` status, `examples` arrays, `mappingDslVersion`, `extensions`). No `source` + `static:true` instance. `Modal.trigger:"auto"` missing. |
| 0040 — MCP Tool Consolidation | ~55% | 49 actual tools (vs 28 target). `outputSchema` not wired (`grep` returns zero in `formspec-mcp/`). Actual tool count not updated in ADR. |
| 0048 — i18n | ~45% | `formatNumber()` and `formatDate()` as callable FEL built-ins (helper functions exist but not in evaluator dispatch). Locale lint rules L101/L201/L301/L401 (zero matches in `formspec-lint/`). Conformance Tier 2. |
| 0053 — WebMCP | ~40% | PostMessage/CustomEvent/HTTP/MCPWebSocket transport shims (only InProcess exists). `data-formspec-*` assist annotations (only render-layer `appearance`/`theme-href` exist). `requestUserInteraction()` not wired (uses custom `confirmProfileApply` callback). `formspec-assist-chat` package (doesn't exist). Pluggable transport abstraction. |

### Blocked (design gate)

| ADR | Blocker |
|-----|---------|
| 0051 — PDF | Three crates (`formspec-theme`, `formspec-plan`, `formspec-pdf`) don't exist. Rust spec `rust-layout-planner-and-pdf.md` status: Design only. `x-pdf` extension hook in schema but no renderer. |
| 0052 — Remove Theme Pages | All artifacts intact: `theme.pages` (`theme.schema.json:205`), `PageLayout` (`:542`), `Region` (`:594`), spec §6 (140 lines). No deprecation markers. ADR unresolved: Remove vs. Studio-only. |

### Done & archived (2026-05-14)

| ADR | What |
|-----|------|
| 0062 — Post-Split Follow-Ups | All 5 slices verified. `CommandPipeline` exists (`pipeline.ts:11`), `RawProject` 2,346→683 lines, batch API collapsed to single `_execute` path. → [`thoughts/archive/adr/`](thoughts/archive/adr/) |
| 48 earlier ADRs | 0001–0028, 0032–0038, 0041, 0043–0047, 0049–0050, 0057–0061, 0064–0065, 0077. |

### Relocated (2026-05-14)

| ADR | To |
|-----|-----|
| 0039 — Page Management | `formspec-studio/thoughts/adr/` |
| 0042 — Blog Posts | `formspec-site/thoughts/adr/` |
| 0055 — Studio Consolidation | `formspec-studio/thoughts/adr/` |

---

## Build & test

```bash
make build                    # Rust + npm + PyO3
make test                     # Full: unit + python + rust + e2e + studio-e2e
cargo nextest run --workspace # Rust only (1,533 tests)
npm test                      # Playwright E2E (auto-starts Vite)
python3 -m pytest tests/      # Python conformance
npm run docs:generate         # Regenerate spec artifacts + filemap
npm run docs:check            # Doc/schema freshness gates
```

---

## Quick Start

```html
<formspec-render></formspec-render>
<script type="module">
  import "formspec-webcomponent";
  const el = document.querySelector("formspec-render");
  el.definition = { /* definition JSON */ };
  el.addEventListener("formspec-submit", (e) => {
    console.log(e.detail.response, e.detail.validationReport);
  });
</script>
```

```bash
# Validate a definition (Python CLI)
python3 -m formspec.validate path/to/project/ --registry registries/common.registry.json

# Server-side evaluation
from formspec._rust import evaluate_definition
result = evaluate_definition(definition, submitted_data)
```

---

## Roadmap

- [x] Rust shared kernel (7 crates, 1,533 tests). WASM wired into TypeScript. PyO3 wired into Python.
- [x] Companion specs: Locale, Ontology, References, Screener, Assist, Respondent Ledger.
- [ ] Conformance test suite — formalize cross-runtime parity tests into spec-defined suite format.
- [ ] Stack-level semantic fixture — exercise canonical response → WOS → Trellis → export → verify across 5 contracts.
- [ ] ADR closeout: schema parity gaps (0029/0030/0031), MCP consolidation (0040), i18n FEL functions + lint (0048), WebMCP transports + annotations (0053), PDF crates (0051), theme pages deprecation (0052).

---

## Repository structure

```
schemas/         21 JSON Schemas — structural source of truth
specs/           Normative specs per tier (core, theme, component, mapping, locale, …)
crates/          Rust shared kernel (7 crates)
packages/        TypeScript packages (8, layered)
src/formspec/    Python bridge + format adapters
examples/        Reference examples (grant-application, invoice, clinical-intake, …)
thoughts/        ADRs, plans, specs, research → [thoughts/TODO.md](thoughts/TODO.md)
tests/           Python conformance, Playwright E2E, fixtures
docs/            Generated HTML specs and API reference
```

**Status:** 1.0.0-draft.1. Design rationale → [`thoughts/adr/`](thoughts/adr/). Stack tracking → [`../thoughts/adr/TODO.md`](../thoughts/adr/TODO.md).

## Authors

Created by [Michael Deeb](https://www.linkedin.com/in/michael-deeb/) at [TealWolf Consulting](https://tealwolf.consulting/) in partnership with [Focus Consulting](https://focusconsulting.io/).

## License

Open-core. Runtime (engine, renderers, FEL, linter, schemas, specs): [Apache-2.0](LICENSE). Authoring tools (core, assist, changeset): [BSL 1.1](LICENSE-BSL) → converts to Apache-2.0 April 7, 2030.
