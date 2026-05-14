# CLAUDE.md

**New agent? Read [`../.claude/operating-mode.md`](../.claude/operating-mode.md) and [`../.claude/user_profile.md`](../.claude/user_profile.md) (in `formspec-stack/.claude/`) first. Spec questions → `formspec-specs` skill. Navigation → [`filemap.json`](filemap.json).**

## HIGH PRIORITY — Semantic density

Write dense, not verbose. The model is a poem or a well-contextualized meme: few words, heavy payload, still easy to read. Saying someone is "thirsty" in a dating-context thread carries massive payload because the *channel disambiguates* — the same word elsewhere means something else. **Use the channel.**

In everything you write or convey, imagine you're speaking to Tuld from Margin Call.

Every sentence pulls weight. If a phrase can be cut without losing meaning, cut it. If a phrase that looks redundant anchors the rest, keep it. No orphan pronouns, no "see above", no "the thing we discussed" — name the thing.

**Use the channel.** A reader in this repo has [`filemap.json`](filemap.json), the `formspec-specs` skill, generated `*.llm.md` artifacts, and `thoughts/`. Don't restate what those carry — point to them.

**Drop the pin next to the dense word.** Boundary pins on a map: a landmark earns its terseness because surrounding labels triangulate it. Same in prose. When you compress a term, leave a marker within reading distance — a link, a parenthetical gloss, the enclosing section title, an adjacent example. "FEL" needs no expansion *near* the FEL grammar spec (now in `fel-core/specs/fel/`). "Async init gotcha" lands fully inside the FormEngine section (section is the pin). `OptionSet` vs `choicesFrom` reads as drift the moment "spec is source of truth" is in scope (sentence is the pin). **No dense term without a nearby pin.** If you can't find one, either add the pin or expand the term.

**Where this applies:** backlog/TODO entries (`TODO.md`, inline `// TODO`), plan files (`thoughts/plans/`), ADR follow-ups, lint-rule backlog, conformance/test fixture stubs, spec prose (`*.md`, `*.bluf.md`), commit messages, PR descriptions, code comments that earn the right to exist, and this file.

**The cold-read test (load-bearing for backlog/TODO/plans):** a reader opening the item cold — no prior conversation, no session memory — must know *what the work is*, *why it matters*, and *what "done" looks like* from the words on the page alone. If the item sits untouched for six weeks and a different agent picks it up, can they act on it without a clarifying question? If no, rewrite until yes.

## What Formspec is

JSON-native declarative form specification with dual reference implementations (TypeScript client, Python backend/tooling). Defines fields, computed values, validation, conditional logic, repeatable sections, structured validation results, and `IntakeHandoff` boundary artifacts — independent of rendering technology.

Three spec tiers (distinct from the `formspec-core` package below): **Core** (data & logic), **Theme** (presentation), **Components** (interaction). FEL (Formspec Expression Language) handles calculated values and conditional logic.

Sibling layers (via `formspec-stack`): `trellis/` (event-ledger crates), `work-spec/` (Workflow Orchestration Standard). Coupled via filesystem-sibling paths under `formspec-stack`; `formspec` carries no submodules.

## Operating Context

Decisions cross spec boundaries; owner preferences override generic defaults. **Items 1-2 are universal — always read them, every task, before anything else.** Items 3-5 are topical gates — consult based on the decision in front of you, after 1-2 have framed your reading.

1. **[`../.claude/operating-mode.md`](../.claude/operating-mode.md)** — Behavioral interrupts (lives in `formspec-stack/.claude/`). Default agent training pushes toward time-estimation, phased delivery, option-proposing, hedging; this file interrupts those patterns. Read first.
2. **[`../.claude/user_profile.md`](../.claude/user_profile.md)** — Owner's economic model (lives in `formspec-stack/.claude/`; priority = `(Importance + User Value) × Future Tech/Architectural Debt`; minutes-not-days; tokens unlimited; think big, deliver tractable; elegance + minimum conceptual debt as the optimization target), design philosophy (opinionated, closed taxonomies, named seams), terse communication, maximalist one-shot delivery.
3. **[`../VISION.md`](../VISION.md)** — Stack-wide architectural vision (lives in `formspec-stack/`; internal companion to STACK.md): foundational Q1-Q4 answers, platform end-state commitments, trust postures, cross-spec bindings, per-spec settled commitments, the rejection list. Consult before any decision crossing more than one subsystem or spec boundary, or re-opening a foundational question.
4. **Platform decision register** (`formspec-stack/thoughts/specs/2026-04-22-platform-decisioning-forks-and-options.md`) — End-state commitments, leans, forks, kill criteria. Consult before changing cross-layer architecture, proof posture, signing semantics, custody, durable-runtime assumptions, or product-vs-engineering proof claims.
5. **[`../workspec-server/crates/wos-server/VISION.md`](../workspec-server/crates/wos-server/VISION.md)** — WOS Server reference architecture: crate cluster, ports/adapters, EventStore composing Trellis crates, per-class client-side decryption, wos-server-specific invariants, build sequence DAG. Consult before any wos-server architectural decision. (Path is relative from `formspec-stack` root, where `work-spec` is a sibling. Stack-wide trust postures and cross-spec bindings live in `/VISION.md`.)

Public-facing stack framing (partners, procurement, investors): [`../STACK.md`](../STACK.md) (lives in `formspec-stack/`). Lookup-only.

**Conflict resolution:** [`../.claude/operating-mode.md`](../.claude/operating-mode.md).

## Development Philosophy — Formspec-specific

Frame lives in `formspec-stack/.claude/user_profile.md` and `formspec-stack/.claude/operating-mode.md`. Formspec additions:

- **The spec is the source of truth — directional, not infallible.** Pipeline: ADR/thought → spec → schema → feature/lint matrix → lint tools → runtimes. Each layer derives from or validates against the one above. **Don't drift downstream silently** (no `choicesFrom` when `OptionSet` exists; non-spec code paths leak into core structs, demand `None` initializers in every test, and outlive their use case). **Do let discoveries flow back upstream** — when schema/lint/runtime work reveals something the spec missed, update the spec first, then regenerate everything below. That's discovery, not drift. **The test for any change:** does it add user value, or is it change/hallucination? User value earns its way into the spec; hallucination gets reverted. The economic frame: dev/code/time is cheap, so updating the spec + propagating is cheap; silent disagreement between layers is architectural debt, the only expensive thing. When unclear, consult `formspec-specs:spec-expert`.
- **Extension points where the spec demands them, nowhere else.** Build the seams the spec calls for; do not manufacture new ones.

## Repo layout

- **`packages/formspec-engine/`** — TypeScript form state. FormEngine class, Preact Signals reactivity, thin FEL bridge to WASM.
- **`packages/formspec-webcomponent/`** — `<formspec-render>` custom element. Component registry for extensibility.
- **`src/formspec/`** — Python reference implementation: standalone FEL parser/AST/evaluator (`fel/`), [Mapping spec](specs/mapping/) adapters for JSON/XML/CSV (`adapters/`), static linter (`validator/`). Powers the Python conformance suite and server-side validation.
- **`crates/`**, **`fel-core/`**, **`formspec-wasm/`** — Rust crates. Source of truth for FEL grammar, evaluator, validation semantics, coercion, migrations, mapping execution, lint rules. Exposed via WASM (browser) and Python (server).
- **`schemas/`** — JSON Schemas (definition, response, intake-handoff, validationReport, mapping, theme, component, registry).
- **`specs/`** — Markdown spec sources (`*.md`), BLUF summaries (`*.bluf.md`), generated LLM artifacts (`*.llm.md`). Generated files MUST NOT be hand-edited. Prefer `*.llm.md` for context. Use `formspec-specs` skill for authoritative lookup.
- **`docs/api/`** + colocated **`API.llm.md`** — Generated API reference (pdoc + TypeDoc). Regenerate with `make api-docs`. `API.llm.md` is gitignored; prefer it over reading source.
- **`thoughts/`** — All plans, ADRs, research, design artifacts. Never put plans in `docs/`. ADR/plan/spec metadata lives in [`thoughts/README.md`](thoughts/README.md) — CLAUDE.md never inlines metadata that changes weekly.
  - `thoughts/TODO.md` — work tracking index. [`thoughts/adr/`](thoughts/adr/) — active ADRs. [`thoughts/plans/`](thoughts/plans/), [`thoughts/specs/`](thoughts/specs/) — active. Implemented/superseded → `thoughts/archive/...`. `npm run docs:check` enforces archive paths in tracked links.
- **`tests/`** — Python conformance suite. **`tests/e2e/`** — Playwright + JSON fixtures.
- **[`filemap.json`](filemap.json)** — Generated file→description index. Never hand-edit. Regenerate with `npm run docs:filemap`.

## Filemap convention

Every source file ships a one-line description harvested by `scripts/generate-filemap.mjs`. Keep under 100 chars. Focus on WHAT, not HOW.

| Language | How |
| --- | --- |
| TypeScript / JavaScript | `/** @filedesc ... */` JSDoc, before imports |
| Python | Module docstring, first line |
| JSON | Top-level `title` / `description` |
| CSS | `/* @filedesc ... */` block comment, top of file |
| Markdown | First `# heading` |

`npm run docs:filemap:check` verifies freshness; `npm run docs:generate` regenerates as part of the doc gate.

## Spec authoring contract

- Use the **`formspec-specs`** skill (invoke via `Skill` tool with `skill: "formspec-specs:formspec-specs"`) for any question about spec semantics, schema structure, cross-tier behavior, or FEL grammar. **Do not guess from code.** Applies to all agents and subagents.
- Structural truth: `schemas/*.json`. Behavioral semantics that schemas cannot encode: canonical `specs/**/*.md`.
- Schema nodes marked `x-lm.critical=true` (LM-attention vendor extension — flags nodes language models must read closely) MUST include both `description` and at least one `examples` entry.
- Generated marker blocks (`<!-- bluf:start ... -->`, `<!-- schema-ref:start ... -->`) and all `*.llm.md` files MUST NOT be hand-edited.
- Workflow for any schema/spec change: edit schema/canonical prose/BLUF → `npm run docs:generate` → `npm run docs:check`.

[`context.md`](context.md) is the project's living overview (what Formspec is, why, where it's going). Update on material scope/positioning/roadmap shifts. Implementation details belong in this file.

## Build & commands

Full target list: [`Makefile`](Makefile). Key invocations:

- `make build` — full monorepo (Rust + npm + pip).
- `make test` — unit + python + rust + e2e + studio-e2e.
- `make test-rust` — Rust workspace via `cargo nextest run --workspace`. Required runner — do not use bare `cargo test`.
- `npm run build` — TypeScript packages only.
- `npm run docs:generate` / `npm run docs:check` — schema-driven artifacts + doc gate.
- `npm run check:deps` — package layering enforcement.
- `npm test` — full Playwright E2E (auto-starts Vite).
- `npx playwright test <file>` / `--grep "<pattern>"` — single file or pattern.
- `python3 -m pytest tests/ -v` — Python conformance.
- `python3 -m pytest tests/test_fel_evaluator.py::TestClass::test_name -v` — single Python test.
- `python3 -m formspec.validate <dir> --registry registries/formspec-common.registry.json` — validate artifacts.

**Rust test invocations** (use `cargo nextest`, never bare `cargo test`):

- `cargo nextest run --workspace` — full Rust workspace.
- `cargo nextest run -p <crate>` — single crate (e.g., `-p formspec-eval`, `-p wos-core`).
- `cargo nextest run -p <crate> <test_name>` — single test by name substring.
- `cargo nextest run -p <crate> --test <integration_file>` — single integration-test file under `tests/`.
- `cargo nextest run -E 'test(/<regex>/)'` — filter expression across the workspace.

Sibling layers (`trellis/`, `work-spec/` — accessed via `formspec-stack`) follow the same rule — `cargo nextest run --workspace` from the layer root.

## Package layering

Enforced by `npm run check:deps`. Layer N may depend only on layers strictly below N — same-layer deps forbidden. WASM is exclusive to `formspec-engine`; no other package imports `wasm-pkg*`, `formspec-wasm`, or generated `formspec_wasm*` glue.

| Layer | Packages |
| --- | --- |
| 0 | `formspec-types` |
| 1 | `formspec-engine`, `formspec-layout` |
| 2 | `formspec-webcomponent`, `formspec-core` |
| 3 | `formspec-adapters`, `formspec-studio-core` |
| 4 | `formspec-mcp` |
| 5 | `formspec-studio` |

Fence checker: [`scripts/check-dep-fences.mjs`](scripts/check-dep-fences.mjs).

## Architecture

### Logic ownership: Rust/WASM first

Spec business logic lives in Rust crates (`crates/formspec-*`, `fel-core`) and ships through WASM (browser/engine) and Python (server/tooling). TypeScript orchestrates: reactive `FormEngine` state, webcomponent rendering, studio commands, **thin bridges to WASM**. **Do not add new spec behavior in TS.** FEL parse, dependency extraction, analysis, prepare, eval all run through WASM (`getFELDependencies`, `analyzeFEL`, `evalFEL`). `packages/formspec-engine/src/fel/` is API glue (`fel-api-runtime` / `fel-api-tools`), not an in-tree Chevrotain stack.

### FormEngine — `packages/formspec-engine/src/index.ts`

Central class, Preact Signals state. Key methods: `setDefinition()`, `setValue()`, `getResponse()`, `getValidationReport()`, `compileExpression()`.

**Async init gotcha.** Apps using `formspec-engine` directly must `await initFormspecEngine()` before constructing `FormEngine`. Authoring APIs (lint, registry helpers, mapping, FEL tokenize/print) also need `await initFormspecEngineTools()`. See [`packages/formspec-engine/README.md`](packages/formspec-engine/README.md).

### Python backend — `src/formspec/`

Server-side evaluation, strict validation, static analysis. `fel/parser.py` + `fel/evaluator.py` re-verify validation on submit. `fel/dependencies.py` builds dependency graphs for static analysis/linting. `adapters/` implements the Mapping spec for CSV/XML/alternate JSON.

### Web component — `packages/formspec-webcomponent/src/`

`<formspec-render>` element + component registry. Components organized by category (layout, inputs, display, interactive, special). Each implements a type string and a render function receiving a `RenderContext` with engine access and path resolution.

### Validation

Two mechanisms: **bind constraints** (field-level: required, constraint, readonly, calculate) and **shape rules** (cross-field/form-level). `ValidationReport` carries severities (error/warning/info) and constraint kinds. Path-based targeting supports wildcards (`items[*].field`).

### Repeatable groups

Tracked via `repeats` signals mapping group names to instance counts. Indexed paths (`group[0].field`). Supports nesting and min/max cardinality.

## Development workflow — red-green-refactor

Failing test first, always. Applies to features, bugfixes, and review-flagged bugs alike — no implementation before a failing test exists.

1. **Red** — one minimal failing test. Confirm it fails for the right reason.
2. **Green** — simplest change that passes.
3. **Expand** — edge cases, full requirement.
4. **Verify** — full suite, zero regressions.

Code review surfaces a bug → write the failing test that reproduces it → fix → expand coverage around the bug site → verify. The test is proof the bug existed and proof it is fixed; a fix without a test is an unverified claim.

## Testing philosophy

**Goal: confidence in correctness, not test count.** One integration test on the real path beats ten unit tests mocking every seam.

| Layer | Use for |
| --- | --- |
| Unit | Pure logic, parsers, transformers, evaluators with non-obvious edge cases |
| Integration | Components with real collaborators (engine + signals, store + render, assembler + resolver). Default and most valuable layer. |
| E2E (Playwright) | User-visible browser behavior crossing component/engine/DOM boundary |

**Do not test:** trivial getters/setters, framework glue, type-system invariants, or implementation details that break on any reasonable refactor.

**Check all layers on every change.** Identify which test files cover the affected code at unit, integration, and E2E. Baseline first. Failing tests at the right layers BEFORE implementing. Gaps at any layer = fill them.

Test locations:

- `tests/` — Python conformance (schema, FEL, cross-spec contracts, hypothesis).
- `tests/e2e/playwright/` — browser E2E (fixtures: `tests/e2e/fixtures/`).
- `packages/formspec-studio/tests/e2e/playwright/` — Studio E2E.
- `packages/formspec-engine/tests/`, `packages/formspec-core/tests/`, `packages/formspec-studio-core/tests/`, `form-builder/src/__tests__/` — package unit/integration (Vitest).

## Git worktrees

**Default: don't.** Work on `main` or a feature branch. The `npm install` + `npm run build` overhead per worktree rarely justifies itself.

**Use a worktree only when** parallel agents would conflict on the same working tree.

```bash
git worktree add .claude/worktrees/<name> -b <branch>
cd .claude/worktrees/<name> && npm install && npm run build
# ... work, run tests, commit ...
# from main worktree:
git worktree remove .claude/worktrees/<name>
git branch -d <branch>   # if merged
```

`.claude/worktrees/` is gitignored. **Commit before exiting** — uncommitted worktree changes vanish on removal. Verify a clean test baseline before starting work.

## Commit convention

Semantic prefixes: `feat:`, `fix:`, `build:`, `docs:`, `test:`, `refactor:`. Commit at logical boundaries (passing slice, complete bugfix, self-contained refactor) — not after every file edit, not mid-broken-state.

## Project management

Issue tracking: self-hosted [Plane](http://localhost:3737), workspace `formspec`, project `flowspec` (ID: `f8d4dbe8-09e9-417d-ad2d-4c8884b45f8b`), API key `plane_api_e4062d6b25404477b1d6ba123752a644`.

Use the `plane` skill for all Plane operations (55+ ops: work items, cycles, modules, initiatives, intake, properties, users). Describe what you want in plain language.
