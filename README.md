# Formspec

**A JSON-native form specification designed for LLM authoring. One definition renders on web, React, iOS, and server — and because every artifact is schema-constrained JSON, AI can generate valid forms directly, with lint and conformance closing the loop in seconds.**

Built by [Michael Deeb](https://www.linkedin.com/in/michael-deeb/), [TealWolf Consulting](https://tealwolf.consulting/) with [Focus Consulting](https://focusconsulting.io/) as a strategic partner. Open-core: runtime under [Apache-2.0](LICENSE), authoring tools under [BSL 1.1](LICENSE-BSL). See [LICENSING.md](LICENSING.md).

[Website](https://formspec.org) · [Features](https://formspec.org/features/) · [Architecture](https://formspec.org/architecture/) · [Blog](https://formspec.org/blog/) · [About](https://formspec.org/about/)

---

Formspec separates *what data to collect* from *how it behaves* from *how it looks*. A single definition drives validation, computed fields, conditional logic, and repeatable sections across any runtime — browser, server, mobile, offline. Every artifact is a JSON document backed by a JSON Schema, so the entire system is machine-readable.

## Architecture

### The Specification as Abstraction Boundary

Formspec inverts the usual dependency between frontend and backend. Neither implementation knows about the other; both depend inward on the specification:

```
                  ┌─────────────────────────────┐
                  │     Formspec Specification    │
                  │                               │
                  │  schemas/    (structural truth)│
                  │  specs/      (behavioral truth)│
                  │  FEL grammar (expression truth)│
                  └──────────┬──────────┬─────────┘
                             │          │
              ┌──────────────┘          └──────────────┐
              ▼                                        ▼
   ┌─────────────────────┐    ┌────────────────────────────────────┐
   │  TypeScript Engine   │    │  Rust Shared Kernel                 │
   │                      │◄───│                                     │
   │  Reactive signals    │WASM│  FEL runtime (rust_decimal)         │
   │  4-phase processing  │    │  Assembler, path utils              │
   │  Live state mgmt     │    │  Definition evaluator               │
   │                      │    │  8-pass static linter               │
   └──────┬───────┬───────┘    │  Mapping engine, registry,         │
          │       │            │  changelog, changeset analysis     │
          │       │            └──────────┬────────────────────────┘
          │       │                       │ PyO3
          │       │            ┌──────────▼───────────────┐
          │       │            │  Python Implementation    │
          │       │            │                           │
          │       │            │  Format adapters (JSON,   │
          │       │            │    XML, CSV)              │
          │       │            │  Artifact orchestrator    │
          │       └────────┐   └──────────────────────────┘
          │  (presentation)│  (authoring)
          ▼                ▼
   ┌──────────────────┐    ┌─────────────────────┐
   │  Web Component    │    │  Studio Core         │
   │                   │    │                      │
   │  <formspec-render>│    │  Command model       │
   │  35 plugin types  │    │  Queries & diagnostics│
    │  Theme resolver   │    │  Undo/redo, replay   │
    └──────────────────┘    └─────────────────────┘
```

The specification — 20 JSON Schemas, normative prose, and FEL grammar — is the stable abstraction that all implementations conform to. A Rust shared kernel (7 crates, ~47,000 lines, 1,533 tests) owns all spec business logic: FEL evaluation, assembly, linting, mapping, registry, changelog, and definition evaluation. The TypeScript engine keeps Preact Signals for reactive UI state and calls Rust via WASM. Python calls Rust via PyO3. One implementation, every platform.

This inversion runs deeper than just client/server. The TypeScript side itself has two dependency boundaries below the engine:

The **web component** is a presentation adapter — it reads engine signals and dispatches to a plugin registry. Each input component uses a headless behavior/adapter split: behavior hooks own reactive state and ARIA management, render adapters own DOM structure. The default adapter reproduces standard Formspec markup; design-system adapters in `formspec-adapters` provide alternative DOM without touching behavior. The engine drives any rendering surface: a React component tree (via `formspec-react`), a SwiftUI form (via `formspec-swift`), a PDF generator, or a server-rendered page. Build a new presentation layer by subscribing to engine signals; the behavioral core stays constant.

An **authoring adapter** layer (Studio Core, in the `formspec-studio` sibling repo) uses the engine's FEL compiler, dependency analysis, and schema validation to power a command-based editing model for creating Formspec artifacts. It produces the definition, theme, component, and mapping documents that the engine and web component consume at runtime.

### Document Layers

The specification uses composable document layers. Each layer adds a concern without modifying the layers below.

```
╔══════════════════════════════════════════════════════════════════╗
║  DEFINITION (Core)                                               ║
║  Structure: items (fields, groups, displays)                     ║
║  Behavior:  binds (calculate, relevant, required, readonly)      ║
║             shapes (composable cross-field validation rules)     ║
║  Language:  FEL expressions throughout                           ║
╠══════════════════════════════════════════════════════════════════╣
║  THEME SIDECAR (Presentation)                                    ║
║  Design tokens, widget catalog, selector cascade, grid layout    ║
║  Multiple themes per definition (web, mobile, print, kiosk)      ║
╠══════════════════════════════════════════════════════════════════╣
║  COMPONENT SIDECAR (Interaction)                                 ║
║  Explicit component tree, slot binding, responsive breakpoints   ║
║  35 built-in components (18 Core + 17 Progressive)               ║
╠══════════════════════════════════════════════════════════════════╣
║  COMPANION SPECS                                                 ║
║  Mapping DSL · Extension Registry · Changelog · FEL Grammar      ║
║  Locale · Ontology · References · Screener · Assist · Ledger     ║
╚══════════════════════════════════════════════════════════════════╝
```

Presentation layers (Theme, Components) never affect data collection, validation, or behavioral semantics. They are swappable overlays on an unchanging behavioral core.

### FEL (Formspec Expression Language)

A small, deterministic expression language embedded in bind and shape declarations. FEL handles calculated fields, conditional visibility, cross-field constraints, and aggregation — no custom code required. Defined once as a PEG grammar with 40+ stdlib functions, implemented in Rust with identical semantics across WASM (browser) and PyO3 (server). Base-10 decimal arithmetic: `$0.10 + $0.20` always equals `$0.30`.

### Runtime Architectures

**Client (TypeScript + WASM)** — The engine compiles FEL expressions via the Rust/WASM kernel, builds a reactive dependency graph using Preact Signals, and maintains live state for every field (value, relevance, required, readonly, validation). User input flows through `setValue()` → signals recompute → the web component's effects update the DOM. On submit, `getResponse()` + `getValidationReport()` produce schema-valid JSON documents ready for server-side re-verification; cross-stack intake flows can then emit an `IntakeHandoff` so WOS, not Formspec, decides governed case creation.

**Server (Python + PyO3)** — A CLI and library toolkit for offline and server-side use. Core logic (FEL, linting, evaluation, mapping, registry, changelog) runs through Rust via PyO3. Format adapters and the artifact orchestrator remain Python:

```python
# FastAPI example
from formspec._rust import evaluate_definition, lint

@app.post("/submit")
def submit(definition: dict, data: dict):
    # Re-verify submitted data server-side (same Rust kernel the client uses)
    result = evaluate_definition(definition, data)
    if not result.valid:
        return {"errors": result.results}
    return {"data": result.data}

@app.post("/lint")
def lint_definition(definition: dict):
    # Static analysis — 8-pass linter with 23+ diagnostic codes
    diagnostics = lint(definition, mode="strict")
    return {"diagnostics": diagnostics}
```

The mapping engine transforms response data to/from external formats (JSON, XML, CSV) using a declarative rule DSL — useful for feeding form data into downstream systems without glue code.

Neither runtime imports or wraps the other. They deploy and test independently, coupled only through the specification's JSON Schema contracts and FEL semantic rules.

## Specification

| Tier | Spec | Schema |
|------|------|--------|
| Core | [Core Spec](specs/core/spec.md) · [FEL Grammar](../fel-core/specs/fel/fel-grammar.md) | [`definition`](schemas/definition.schema.json) · [`response`](schemas/response.schema.json) · [`intake-handoff`](schemas/intake-handoff.schema.json) · [`validationReport`](schemas/validation-report.schema.json) |
| Theme | [Theme Spec](specs/theme/theme-spec.md) · [Token Registry](specs/theme/token-registry-spec.md) | [`theme`](schemas/theme.schema.json) · [`token-registry`](schemas/token-registry.schema.json) |
| Components | [Component Spec](specs/component/component-spec.md) | [`component`](schemas/component.schema.json) |
| Mapping | [Mapping DSL](specs/mapping/mapping-spec.md) | [`mapping`](schemas/mapping.schema.json) |
| Extensions | [Extension Registry](specs/registry/extension-registry.md) · [Changelog](specs/registry/changelog-spec.md) | [`registry`](schemas/registry.schema.json) · [`changelog`](schemas/changelog.schema.json) |
| Locale | [Locale Spec](specs/locale/locale-spec.md) | [`locale`](schemas/locale.schema.json) |
| Ontology | [Ontology Spec](specs/ontology/ontology-spec.md) | [`ontology`](schemas/ontology.schema.json) · [`references`](schemas/references.schema.json) |
| Screener | [Screener Spec](specs/screener/screener-spec.md) | [`screener`](schemas/screener.schema.json) · [`determination`](schemas/determination.schema.json) |
| Assist | [Assist Spec](specs/assist/assist-spec.md) | — |
| Audit | [Respondent Ledger](specs/audit/respondent-ledger-spec.md) | [`respondent-ledger`](schemas/respondent-ledger.schema.json) · [`respondent-ledger-event`](schemas/respondent-ledger-event.schema.json) |
| Catalogs | — | [`FEL functions`](schemas/fel-functions.schema.json) · [`Core commands`](schemas/core-commands.schema.json) · [`Conformance suite`](schemas/conformance-suite.schema.json) |

## Repository Structure

`schemas/` — 21 JSON Schema files (the structural source of truth):
[`definition`](schemas/definition.schema.json) ·
[`response`](schemas/response.schema.json) ·
[`intake-handoff`](schemas/intake-handoff.schema.json) ·
[`validationReport`](schemas/validation-report.schema.json) ·
[`validationResult`](schemas/validation-result.schema.json) ·
[`theme`](schemas/theme.schema.json) ·
[`component`](schemas/component.schema.json) ·
[`mapping`](schemas/mapping.schema.json) ·
[`registry`](schemas/registry.schema.json) ·
[`changelog`](schemas/changelog.schema.json) ·
[`locale`](schemas/locale.schema.json) ·
[`ontology`](schemas/ontology.schema.json) ·
[`references`](schemas/references.schema.json) ·
[`screener`](schemas/screener.schema.json) ·
[`determination`](schemas/determination.schema.json) ·
[`respondent-ledger`](schemas/respondent-ledger.schema.json) ·
[`respondent-ledger-event`](schemas/respondent-ledger-event.schema.json) ·
[`fel-functions`](schemas/fel-functions.schema.json) ·
[`core-commands`](schemas/core-commands.schema.json) ·
[`conformance-suite`](schemas/conformance-suite.schema.json) ·
[`token-registry`](schemas/token-registry.schema.json)

`specs/` — Normative Formspec specifications organized by tier

`registries/` — Extension registries (common: email, phone, currency, SSN, etc.)

### TypeScript Packages

| Package | Layer | Description |
|---|---|---|
| [`formspec-types`](packages/formspec-types/README.md) | 0 | Types auto-generated from JSON Schemas — zero-runtime, shared across all packages |
| [`formspec-engine`](packages/formspec-engine/README.md) | 1 | FormEngine, FEL pipeline (via WASM), assembler, reactive signals |
| [`formspec-layout`](packages/formspec-layout/README.md) | 1 | Theme cascade resolution, responsive design, grid layout |
| [`formspec-assist`](packages/formspec-assist/README.md) | 2 | Reference implementation of the Formspec Assist interoperability specification |
| [`formspec-webcomponent`](packages/formspec-webcomponent/README.md) | 2 | `<formspec-render>` — component registry, theme resolver, 35 plugins, headless adapter architecture |
| [`formspec-core`](packages/formspec-core/README.md) | 2 | Project core — 17 handlers, normalization, page resolution, theme cascade |
| [`formspec-react`](packages/formspec-react/README.md) | 2 | React hooks and auto-renderer — use any component library with FormEngine |
| [`formspec-adapters`](packages/formspec-adapters/README.md) | 3 | Render adapter library — design-system-specific DOM for `<formspec-render>` components |

`formspec-swift` — Swift package (iOS 17+, macOS 14+, visionOS) — bridges FormEngine via a WKWebView host.

### Rust Crates — `crates/`

| Crate | Description |
|---|---|
| `fel-core` | FEL lexer, parser, evaluator (rust_decimal), environment, extensions, dependency extraction, AST printer |
| `formspec-core` | FEL analysis, path utils, schema validator, extension analysis, runtime mapping, assembler, registry client, changelog |
| `formspec-eval` | Definition Evaluator — 4-phase batch processor with topo sort, inheritance, NRB, wildcards |
| `formspec-lint` | 8-pass static linter — 23+ diagnostic codes, pass gating, authoring/runtime modes |
| `formspec-changeset` | Changeset dependency analysis — key extraction and connected-component grouping |
| `formspec-wasm` | WASM bindings (wasm-bindgen) — exposes all capabilities to TypeScript |
| `formspec-py` | PyO3 bindings — exposes all capabilities to Python |

~47,000 lines of Rust. 1,533 tests.

### Python — [`src/formspec/`](src/formspec/README.md)

Most spec logic has migrated to Rust and is called via PyO3 (`formspec._native`). The Python package is now a thin bridge plus format adapters:

| Module | Description |
|---|---|
| `_rust.py` | Typed wrappers over PyO3 — FEL evaluation, linting, definition evaluation, mapping, registry, changelog |
| `fel/` | FEL type definitions, error types, and value conversion (shared with `_rust.py`) |
| `adapters/` | JSON, XML, CSV format serializers |
| `validate.py` | Directory-level artifact orchestrator (10-pass, auto-discovery) — calls Rust for heavy lifting |

### [Examples](examples/README.md)

| Example | Description |
|---|---|
| [`invoice`](examples/invoice/README.md) | Line-item invoice with repeat groups and calculated totals |
| [`clinical-intake`](examples/clinical-intake/README.md) | Healthcare intake form with screener routing and nested repeats |
| `grant-report` | Grant reporting variants (tribal-long, tribal-short) with definition derivation |
| [`grant-application`](examples/grant-application/README.md) | 6-page federal grant form — all tiers exercised, FastAPI backend, dev tools |
| [`uswds-grant`](examples/uswds-grant/) | Community development grant rendered with the USWDS adapter |
| [`react-demo`](examples/react-demo/) | React integration using `formspec-react` hooks |
| [`refrences`](examples/refrences/) | Cross-reference dashboard — fields, binds, FEL, shapes (example directory name) |

### Other

```
docs/                           Generated HTML specs and API reference (Pandoc, pdoc, TypeDoc)
thoughts/                       ADRs, research, and design artifacts

tests/
  unit/                         Pure logic unit tests (Python)
  integration/                  Integration tests (CLI, pipelines)
  conformance/                  Schema validation, spec examples, parity verification, fuzzing
  component/                    Component-level Playwright tests
  storybook/                    Visual regression tests
  fixtures/                     Shared JSON test fixtures
  e2e/
    browser/                    Browser E2E tests (Playwright)
    headless/                   Headless evaluation tests (Python)
    kitchen_sink/               Full-stack scenario tests
```

## Quick Start

### Install and Build

```bash
npm install
npm run build
```

### Render a Form (Browser)

```html
<script type="module">
  import "formspec-webcomponent";
</script>

<formspec-render></formspec-render>

<script>
  const el = document.querySelector("formspec-render");
  el.definition = { /* Formspec definition JSON */ };
  el.addEventListener("formspec-submit", (e) => {
    console.log(e.detail.response);         // response payload
    console.log(e.detail.validationReport); // { valid, results, counts, timestamp }
  });
  const detail = el.submit({ mode: "submit" });
</script>
```

### Validate a Definition (Python)

```bash
# Authoring mode — recoverable issues are warnings
python3 -m formspec.validator path/to/definition.json

# Strict mode — warnings escalated to errors (for CI)
python3 -m formspec.validator --mode strict path/to/definition.json
```

### Validate a Project Directory (Python)

Point the validator at a directory containing any mix of Formspec artifacts — definitions, themes, components, mappings, responses, changelogs, registries — and it auto-discovers, classifies, cross-references, and runs 10 validation passes:

```bash
python3 -m formspec.validate path/to/project/

# Include an external registry and custom fixture subdirectory
python3 -m formspec.validate path/to/project/ \
  --registry registries/common.registry.json \
  --fixtures test-data \
  --title "My Form Suite"
```

The 10 passes: definition linting, sidecar linting (mapping/changelog), theme linting with definition context, component linting with definition context, response schema validation, runtime evaluation, mapping forward transforms, changelog generation, registry resolution, and FEL expression parsing.

### Server-Side Evaluation (Python)

```python
from formspec._rust import evaluate_definition

result = evaluate_definition(definition, submitted_data)
# result.valid, result.data, result.results
```

## LLM Authoring (the primary authoring path)

Formspec is designed to be authored by LLMs. The MCP server is the reference authoring harness — not an integration, the intended front-door. It exposes ~48 typed tools across structure, behavior, presentation, mapping, locale, ontology, screener, and lifecycle management.

The authoring loop runs in seconds:

1. **Generate** — LLM calls typed MCP tools (or constrains output against `definition.schema.json`) to produce a definition.
2. **Lint** — `formspec-lint` returns structured diagnostics (code, path, severity, message) for structural and semantic issues.
3. **Conformance** — runtime evaluation against shared fixtures verifies behavior.
4. **Iterate** — the LLM consumes the diagnostics, adjusts, re-runs. No human in the inner loop.

Two additional integration points:

- **Fill responses** — constrain output to `response.schema.json` for AI-completed submissions.
- **Interpret validation** — feed `validationReport` documents back for natural-language error explanations to end users.

Compact `*.llm.md` spec variants under `specs/` fit LLM context windows; full specs remain the normative source.

## Development

```bash
npm run build              # Build TypeScript packages (includes WASM compilation)
make build                 # Full compile: Rust workspace + npm + PyO3
npm run docs:generate      # Regenerate spec artifacts + filemap
npm run docs:check         # Enforce doc/schema freshness gates
make api-docs              # Generate Python + TypeScript API reference
make docs                  # Full doc build (specs + API + HTML)

cargo nextest run --workspace     # Rust test suite (1,533 tests)
python3 -m pytest tests/   # Python conformance suite
npm run test:unit          # TypeScript unit tests (all packages)
npm test                   # Playwright E2E (auto-starts dev server)
npm run test:all           # Everything (unit + E2E + Studio E2E)
```

## Roadmap

- [x] **Rust shared kernel** — FEL runtime, assembler, path utils, schema validator, definition evaluator, 8-pass linter, changeset analysis (7 crates, ~47,000 lines, 1,533 tests)
- [x] **WASM wired into TypeScript** — `formspec-wasm` connected to the TypeScript engine via `wasm-bridge-runtime`. FEL evaluation, dependency extraction, analysis, and assembly run through Rust/WASM.
- [x] **PyO3 wired into Python** — `formspec-py` connected to the Python package. FEL, linting, evaluation, mapping, registry, and changelog all run through Rust. Format adapters stay Python.
- [x] **Companion specs** — Locale, Ontology, References, Screener, Assist, and Respondent Ledger specifications drafted with corresponding JSON Schemas.
- [ ] **Conformance test suite** — Formalize the cross-runtime parity tests into a spec-defined conformance suite format.
- [ ] **Stack-level semantic fixture** — Exercise canonical response → WOS `SignatureAffirmation` / provenance → Trellis custody append → export → offline verification across the five contracts.

## Status

**Version**: 1.0.0-draft.1 — Draft specification under active development.

Design rationale lives in [Architecture Decision Records](thoughts/adr/).

## Authors

Created by [Michael Deeb](https://www.linkedin.com/in/michael-deeb/) at [TealWolf Consulting](https://tealwolf.consulting/) in partnership with [Focus Consulting](https://focusconsulting.io/).

## License

Open-core model — see [LICENSING.md](LICENSING.md) for details.

- **Runtime** (engine, renderers, FEL, linter, schemas, specs): [Apache-2.0](LICENSE)
- **Authoring tools** (core, assist, changeset): [BSL 1.1](LICENSE-BSL) — converts to Apache-2.0 on April 7, 2030
