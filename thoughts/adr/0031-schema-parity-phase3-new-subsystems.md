# ADR-0031: Schema Parity Phase 3 — New Subsystems

**Status:** Partial
**Date:** 2026-02-28
**Depends on:** [ADR-0029](0029-schema-parity-phase1-enrich-existing.md), [ADR-0030](0030-schema-parity-phase2-new-artifacts.md), [schema-coverage-audit.md](schema-coverage-audit.md)

---

## Goal

Implement the remaining schema features that require new engine logic, new runtime behavior, or entirely new functional subsystems. After this phase, every property across all 9 Formspec schemas has at least one exercised example in the grant-application suite.

## Scope

This phase touches engine internals and may require spec clarifications:

- **Screener + Routes** — new engine subsystem for respondent routing
- **Extension Registry** — `registry.json` artifact + engine extension loading
- **Scoped Variables** — engine support for group-scoped variable resolution
- **Writable Instances** — engine support for mutable scratch-pad instances
- **Multi-Platform Rendering** — theme/label multiplexing for `pdf`, `csv`, `mobile` contexts

---

## Reference: Schema Coverage Audit

The complete property-by-property gap analysis lives in [`schema-coverage-audit.md`](schema-coverage-audit.md). **Read that file first** — it lists every schema property, whether the grant-app exercises it, and what's missing. Do NOT re-explore the schemas or grant-app files to discover gaps; the audit already contains every "NO" entry organized by schema section. The work items below are derived directly from that audit.

---

## Work Items

### A. Screener + Routes

The screener is a pre-form classification system: a small set of screening questions whose answers determine which route (form variant) the respondent follows.

1. **Add `screener` to `definition.json`** with 2-3 screening items (e.g., "Are you a new or returning applicant?", "What is your organization type?")
2. **Add `routes`** — at least 3 Route objects with:
   - `condition` — FEL expression evaluating screener answers
   - `target` — page or group key to start at
   - `label` — human-readable route name
   - `extensions` — at least one `x-` property
3. **Engine: `evaluateScreener(answers)`** — new method that evaluates route conditions against screener answers and returns the matching route
4. **Webcomponent** — render screener items before the main form; on completion, apply the selected route (skip irrelevant pages/groups)

**Tests:**
- Unit test: screener evaluation with various answer combinations
- Unit test: no matching route returns null/default
- E2E: screener renders, user answers, correct form pages appear

### B. Extension Registry (`registry.json`)

1. **Create `examples/grant-application/registry.json`** with:
   - `$formspecRegistry: "1.0"`, `$schema`, `published`, `publisher` (all 3 properties: `name`, `url`, `contact`)
   - At least 5 `RegistryEntry` objects, one per category:
     - `dataType` — custom type (e.g., `x-ssn`) with `baseType: "string"`, `constraints`, `metadata`
     - `function` — custom FEL function (e.g., `x-fiscal-year`) with `parameters`, `returns`
     - `constraint` — custom constraint (e.g., `x-duns-valid`) with `parameters`
     - `property` — custom definition property (e.g., `x-agency-code`)
     - `namespace` — logical grouping (e.g., `x-grants-gov`) with `members` referencing the above
   - Exercise all 4 `status` values across entries: `draft`, `stable`, `deprecated`, `retired`
   - `deprecationNotice` on the `deprecated` entry
   - `specUrl`, `schemaUrl`, `license` on at least one entry
   - `examples` array on at least 2 entries
   - `compatibility.formspecVersion` and `compatibility.mappingDslVersion`
   - `extensions` at registry and entry levels
2. **Schema validation tests** — verify conditional validation fires (e.g., `dataType` requires `baseType`, `function` requires `parameters` + `returns`, `deprecated` requires `deprecationNotice`)

**Tests:**
- Python: schema validation for valid registry, invalid registry (missing conditional fields)
- Python: `src/formspec/registry.py` can load and query the registry

### C. Scoped Variables

Currently all variables use the default `"#"` scope (definition-wide). The spec defines scoped variables that are local to a group.

1. **Add scoped variables to `definition.json`** — at least 2 variables with `scope` targeting a specific group (e.g., `scope: "budget"` for a budget-subtotal variable, `scope: "projectPhases"` for a phase-level aggregate)
2. **Engine: scoped variable resolution** — `variableSignals` must resolve scoped variables relative to their target group, not the definition root. A variable scoped to `budget` should only see fields within the `budget` group.
3. **Scoped variable in FEL** — `@scopedVar` references resolve within scope

**Tests:**
- Unit test: scoped variable evaluates correctly within its group
- Unit test: scoped variable is not visible outside its scope
- E2E: a scoped variable drives a calculated field within its group

### D. Writable Instances

Currently the only instance (`agencyData`) is `readonly: true`. The spec defines writable instances as scratch-pad data stores.

1. **Add writable instance to `definition.json`** — e.g., `scratchPad` with `readonly: false`, inline `data`, and `schema` type declarations
2. **Add `source` instance** — an instance with `source` (external URL) and `static: true`
3. **Engine: mutable instance signals** — writable instances produce signals that can be updated via `setValue` or FEL `calculate` binds
4. **`schema` on instance** — engine validates instance data shape against declared schema

**Tests:**
- Unit test: writable instance value can be set and read
- Unit test: readonly instance rejects writes
- Unit test: `source` instance loads from URL (mock in test)
- Unit test: `static` instance caches and doesn't re-fetch
- E2E: a FEL expression writes to a scratch-pad instance, another field reads from it

### E. Multi-Platform Labels & Themes

The spec defines label contexts (`short`, `aria`, `pdf`, `csv`) and theme platforms (`web`, `mobile`, `pdf`, `print`, `kiosk`, `universal`), but only `short`/`aria` and `web` are exercised.

1. **Add `labels.pdf` and `labels.csv`** — on at least 3 items in `definition.json`
2. **Add `theme-pdf.json`** — a second theme file with `platform: "pdf"`, different tokens, different selectors (e.g., no interactive widgets)
3. **Label multiplexing** — engine/renderer selects label variant based on active platform context

**Tests:**
- Unit test: label resolution returns `pdf` label when platform is `pdf`, falls back to `label` otherwise
- Unit test: `csv` label context used by mapping engine for CSV column headers
- Schema validation: `theme-pdf.json` validates against `theme.schema.json`

### F. Remaining Gaps (Cleanup)

1. **`DatePicker.showTime`** — exercise with `dateTime` field from Phase 1
2. **`ProgressBar.bind`** — data-bound progress bar (Phase 1 added the prop; Phase 3 wires the engine)
3. **`Modal.trigger: "auto"`** — auto-open modal based on `when` condition
4. **`Popover.triggerBind`** — dynamic trigger text from data binding
5. **`Grid.columns` as string** — CSS `grid-template-columns` value (Phase 1 added to JSON; Phase 3 ensures renderer handles it)
6. **`Stack.direction: "horizontal"`** — ensure renderer applies `flex-direction: row`

---

## TDD Workflow

Phase 3 features are engine-level. The TDD loop is stricter here because incorrect engine behavior is harder to debug than missing JSON properties:

1. **Red** — write one unit test for the core mechanic (e.g., "scoped variable evaluates within its group"). This is a FormEngine test, not a Playwright test. Run it, confirm the failure message names the missing feature.
2. **Green** — implement the minimum engine change. No UI, no cleanup. Confirm the unit test passes.
3. **Flesh out** — add tests for: null/missing scope, scope targeting nonexistent group, nested scopes, interaction with existing variables. Add an E2E test that proves the feature works through the webcomponent.
4. **Finish** — run full suites. Fix any regressions. The engine change must not break any of the 70+ existing grant-app E2E tests.

For subsystems that span engine + webcomponent (screener, writable instances), write engine unit tests first, then E2E tests. Never write the E2E test before the engine logic exists — it will fail for the wrong reason.

---

## Success Criteria

Phase 3 is done when:

- [ ] `definition.json` has a `screener` with routes, and the engine can evaluate it
- [ ] `registry.json` validates against `registry.schema.json` with all 5 extension categories and all 4 lifecycle statuses
- [ ] At least 2 variables use non-`"#"` `scope` and resolve correctly within their target group
- [ ] At least one instance has `readonly: false` and can be written to
- [ ] At least one instance uses `source` (external URL) with `static: true`
- [ ] `labels.pdf` and `labels.csv` are present on items and resolved by platform context
- [ ] A `theme-pdf.json` with `platform: "pdf"` validates and uses different tokens/selectors than the web theme
- [ ] Screener E2E test proves: screening questions render, answers route to correct form pages
- [ ] Python conformance tests cover: registry schema validation (including conditional required fields), scoped variable evaluation, changelog parsing
- [ ] Full Playwright suite passes with zero regressions
- [ ] Full Python conformance suite passes with zero regressions

**Final audit state:** Every property, every enum value, every `$defs` type across all 9 schemas has at least one exercised example. The schema-coverage-audit "NO" count drops to zero (excluding `extensions` properties, which are exercised in aggregate via representative examples rather than exhaustively at every level).

---

## Phase Summary

| Phase | Focus | New Files | Engine Changes | Audit "NO" Eliminated |
|-------|-------|-----------|----------------|-----------------------|
| 1 | Enrich existing JSON | 1 (submission-in-progress) | Minimal (renderer props) | ~60 |
| 2 | New artifacts + mapping depth | 4-5 (changelog, XML/CSV mapping, amended submission, contact fragment) | Moderate (mapping engine, `$ref` assembly) | ~40 |
| 3 | New subsystems | 2 (registry, PDF theme) | Significant (screener, scoped vars, writable instances) | ~20 |
| **Total** | | **7-8 new files** | | **~120 → 0** |
