# ADR-0029: Schema Parity Phase 1 — Enrich Existing Files

**Status:** In Progress
**Date:** 2026-02-28
**Depends on:** [schema-coverage-audit.md](schema-coverage-audit.md)
**Followed by:** [ADR-0030](0030-schema-parity-phase2-new-artifacts.md), [ADR-0031](0031-schema-parity-phase3-new-subsystems.md)

---

## Goal

Achieve dense schema coverage by adding unused properties, enum values, and feature variants to the grant-application's **existing** JSON files. No new files, no new engine subsystems — just fill the gaps in what's already partially exercised.

## Scope

Four existing files gain new content:

- `examples/grant-application/definition.json`
- `examples/grant-application/theme.json`
- `examples/grant-application/component.json`
- `examples/grant-application/submission.json`

Engine and webcomponent changes only where the schema property is already parsed but untested (e.g., `suffix` rendering, `widgetHint` pass-through). If a property requires new engine logic, it belongs in Phase 2 or 3.

---

## Reference: Schema Coverage Audit

The complete property-by-property gap analysis lives in [`schema-coverage-audit.md`](schema-coverage-audit.md). **Read that file first** — it lists every schema property, whether the grant-app exercises it, and what's missing. Do NOT re-explore the schemas or grant-app files to discover gaps; the audit already contains every "NO" entry organized by schema section. The work items below are derived directly from that audit.

---

## Work Items

### A. Definition Enrichment (`definition.json`)

1. **Missing dataTypes** — add fields exercising `dateTime`, `time`, `uri`
   - e.g., `meetingTime` (time), `submissionDeadline` (dateTime), `projectWebsite` (uri)
2. **Field properties** — add `suffix` (e.g., `"%"` on `indirectRate`), per-field `currency`, `description` on at least 3 items, field-level `presentation` with `widgetHint`
3. **`initialValue` as expression** — e.g., `"=today()"` on `startDate`
4. **`prePopulate.editable: false`** — lock a pre-populated field (e.g., `ein` from instance data)
5. **Presentation subsystem** — on at least one group: `layout.flow: "grid"`, `layout.columns`, `layout.colSpan`, `layout.collapsible`, `layout.collapsedByDefault`, `styleHints.emphasis`, `styleHints.size`, `accessibility.role`, `accessibility.description`, `accessibility.liveRegion`
6. **Unused enum values:**
   - Conditional `required` expression (e.g., `"$applicantInfo.orgType = 'university'"` instead of `"true"`)
   - Conditional `readonly` expression
   - `whitespace: "remove"` on at least one bind
   - `nonRelevantBehavior: "empty"` per-bind override
   - `timing: "demand"` on at least one shape
   - `xone` shape composition
   - Shape `message` with `{{expression}}` interpolation
   - Shape composition via shape ID references (not just inline FEL)
7. **`derivedFrom`** — add as `{url, version}` object
8. **`extensions`** — add `x-` data at definition level, at least one item, one bind, one shape

### B. Theme Enrichment (`theme.json`)

1. **Cascade level 3 (`items`)** — add per-item presentation overrides for at least 3 items
2. **`style` blocks** — add `$token.` references in PresentationBlocks (defaults and/or selectors)
3. **`fallback` widget chain** — e.g., `["camera", "fileUpload"]` on attachment selector
4. **`cssClass` in theme** — on at least one PresentationBlock
5. **`AccessibilityBlock`** — `liveRegion: "polite"` on at least one PresentationBlock
6. **Selector matching** — add `type` matching (e.g., match all `group` type items), add combined `type` + `dataType` selector
7. **Token gaps** — add `elevation.*` token, at least one numeric token value
8. **`labelPosition: "hidden"`** — exercise the third enum value somewhere

### C. Component Enrichment (`component.json`)

1. **`Select` component** — add at least one Select (e.g., for a field currently using RadioGroup with many options)
2. **Instantiate `SummaryRow`** — use the dead custom component template in the tree
3. **`cssClass` array form** — `["class1", "class2"]` on at least one component
4. **Layout prop gaps:**
   - `Stack.direction: "horizontal"`, `Stack.align`, `Stack.wrap`
   - `Grid.columns` as CSS string (e.g., `"1fr 2fr 1fr"`), `Grid.gap`, `Grid.rowGap`
   - `Tabs.position`, `Tabs.defaultTab`
   - `Page.description`
5. **Input prop gaps:**
   - `TextInput.maxLines`, `TextInput.inputMode`, `TextInput.prefix`, `TextInput.suffix`
   - `NumberInput.step`, `NumberInput.min`, `NumberInput.max`, `NumberInput.showStepper`
   - `DatePicker.minDate`, `DatePicker.maxDate`
   - `FileUpload.multiple`
   - `MoneyInput.locale`, `Rating.icon`, `Rating.allowHalf`
6. **Display prop gaps:**
   - `Alert.severity: "success"` and `"error"`
   - `Badge.variant: "default"`, `"primary"`, `"success"`, `"error"`
   - `ProgressBar.bind` (data-bound progress)
7. **Container prop gaps:**
   - `Card.subtitle`
   - `Panel.position: "left"`
   - `Modal.trigger: "auto"`, `Modal.size` variants
   - `Popover.triggerBind`, `Popover.placement` variants

### D. Response Enrichment (`submission.json`)

1. **`id`** — add UUID
2. **`subject`** — add `{id, type}` (e.g., `{id: "GRANT-2026-001", type: "grant-application"}`)
3. **`validationResults`** — add array exercising all 6 `constraintKind` values, all 3 `source` values, `shapeId`, `sourceId`, `value`, `constraint`, `context`
4. **Second submission file** — `submission-in-progress.json` with `status: "in-progress"`, partial data, non-empty `validationResults`
5. **Data gaps** — include attachment values, multiChoice array values, nested repeat data (projectPhases/phaseTasks), `nonRelevantBehavior: "empty"` representation

---

## TDD Workflow

Every change follows the red-green-refactor loop from CLAUDE.md:

1. **Red** — write one E2E test asserting the new property/value is present and behaves correctly (e.g., "a field with `suffix: '%'` renders the suffix after the input"). Run it, confirm it fails.
2. **Green** — make the minimal change: add the property to the JSON fixture, fix engine/webcomponent if the property was already parsed but untested. Run, confirm pass.
3. **Flesh out** — add edge-case tests (null suffix, empty suffix, suffix with special characters). Run, see which fail.
4. **Finish** — implement remaining changes, run full suite (`npm test` + `python3 -m pytest tests/ -q`).

For properties the engine already handles (just not exercised in the grant-app), step 2 is often just editing JSON — the test is the proof.

For properties that need renderer changes (e.g., `suffix`, `widgetHint` pass-through), the test drives the implementation.

---

## Success Criteria

Phase 1 is done when:

- [ ] All items in sections A–D above are present in the grant-app JSON files
- [ ] `definition.json` validates against `definition.schema.json`
- [ ] `theme.json` validates against `theme.schema.json`
- [ ] `component.json` validates against `component.schema.json`
- [ ] `submission.json` and `submission-in-progress.json` validate against `response.schema.json`
- [ ] Every new property/value has at least one Playwright E2E test proving it renders or behaves correctly
- [ ] Full Playwright suite passes with zero regressions (`npm test`)
- [ ] Full Python conformance suite passes with zero regressions (`python3 -m pytest tests/ -q`)
- [ ] The schema-coverage-audit gap list for `definition`, `theme`, `component`, and `response` schemas shows zero "NO" entries for properties that exist in the grant-app files (properties requiring new subsystems excluded — those are Phase 2/3)

**Measurable coverage target:** Eliminate ~60 of the ~120 total "NO" entries from the audit across these four schemas.
