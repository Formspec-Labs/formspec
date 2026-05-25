# ADR-0030: Schema Parity Phase 2 — New Artifacts & Mapping Depth

**Status:** Partial
**Date:** 2026-02-28
**Depends on:** [ADR-0029](0029-schema-parity-phase1-enrich-existing.md), [schema-coverage-audit.md](schema-coverage-audit.md)
**Followed by:** [ADR-0031](0031-schema-parity-phase3-new-subsystems.md)

---

## Goal

Add new grant-app artifact files that exercise entire schema subsystems currently at zero coverage. Each new file is a standalone JSON document validated against its schema. Modest engine/tooling additions may be needed, but nothing requires new architectural subsystems — the schemas and specs already define the shape; we're producing conforming documents and proving the tooling can consume them.

## Scope

New files added to `examples/grant-application/`:

- `changelog.json` — exercises `changelog.schema.json`
- `submission-amended.json` — exercises `status: "amended"` and `status: "stopped"`
- Enriched `mapping.json` — exercises remaining transforms, reverse mapping, full-form coerce/valueMap
- `mapping-xml.json` — exercises XML adapter and format
- `mapping-csv.json` — exercises CSV adapter and format

Enrichments to existing files:

- `definition.json` — `$ref` + `keyPrefix`, full `MigrationDescriptor`, `presentation.layout.page` path fix
- `theme.json` — `pages` + `regions` (12-column grid), `breakpoints`
- `submission.json` — `validationResults` with `constraintKind: "type"` and `"external"`, `source: "external"`

---

## Reference: Schema Coverage Audit

The complete property-by-property gap analysis lives in [`schema-coverage-audit.md`](schema-coverage-audit.md). **Read that file first** — it lists every schema property, whether the grant-app exercises it, and what's missing. Do NOT re-explore the schemas or grant-app files to discover gaps; the audit already contains every "NO" entry organized by schema section. The work items below are derived directly from that audit.

---

## Work Items

### A. Changelog (`changelog.json`)

Create a changelog simulating `definition.json` evolving from `1.0.0` to `1.1.0`:

1. `definitionUrl`, `fromVersion: "1.0.0"`, `toVersion: "1.1.0"`, `generatedAt`, `semverImpact: "minor"`, `summary`
2. At least 5 `Change` objects exercising all 5 `type` values: `added`, `removed`, `modified`, `moved`, `renamed`
3. All 3 `impact` levels: `breaking`, `compatible`, `cosmetic`
4. All 8 `target` categories: `item`, `bind`, `shape`, `optionSet`, `dataSource`, `screener`, `migration`, `metadata`
5. `before`/`after` fragments on `modified`, `removed`, `renamed`, `moved` changes
6. `migrationHint` — at least one `"preserve"`, one `"drop"`, one FEL expression referencing `$old`
7. `key` on `target: "item"` changes

### B. Bidirectional & Deep Mapping (`mapping.json` enrichment)

1. **`direction: "both"`** — change from `"forward"` to `"both"`
2. **Remaining transforms** — add rules exercising: `drop`, `flatten`, `nest`, `constant`, `split`
3. **Full-form `coerce`** — `{from: "string", to: "date", format: "YYYY-MM-DD"}` on at least one rule
4. **Full-form `valueMap`** — `{forward: {...}, reverse: {...}, unmapped: "passthrough", default: "unknown"}` on at least one rule
5. **`reverse` overrides** — `ReverseOverride` block on at least 2 rules with different reverse transforms
6. **`bidirectional: false`** — on at least one one-way rule
7. **`reversePriority`** — on at least 2 rules
8. **`default`** — fallback value on at least one rule
9. **`description`** — human-readable text on at least 3 rules
10. **`separator`** — on at least one flatten/nest rule
11. **`defaults`** — target document default values at top level
12. **`autoMap`** — synthetic preserve rules
13. **`conformanceLevel: "bidirectional"`**
14. **Fix `array.rules` → `array.innerRules`** — correct the naming mismatch found in the audit
15. **`innerRules` depth** — exercise `condition`, `priority`, `index` on inner rules
16. **`ArrayDescriptor.mode: "indexed"`** — at least one array with indexed mode

### C. XML Mapping (`mapping-xml.json`)

1. `targetSchema.format: "xml"`, `targetSchema.rootElement`, `targetSchema.namespaces`
2. `XmlAdapter` config: `declaration`, `indent`, `cdata`
3. At least 5 rules mapping grant-app fields to XML paths
4. `targetSchema.url` — canonical target schema URL

### D. CSV Mapping (`mapping-csv.json`)

1. `targetSchema.format: "csv"`, `targetSchema.name`
2. `CsvAdapter` config: `delimiter`, `quote`, `header`, `encoding`, `lineEnding`
3. At least 5 rules mapping grant-app flat fields to CSV columns
4. `flatten` transform for nested group data

### E. Theme Pages & Regions (`theme.json` enrichment)

1. **`pages`** — at least 2 Page objects with `id`, `title`, `description`, `regions`
2. **`regions`** — at least 4 Region objects exercising `key`, `span`, `start`
3. **`responsive`** on regions — breakpoint-keyed overrides with `span`, `start`, `hidden`
4. **`breakpoints`** — theme-level breakpoint definitions (may differ from component.json breakpoints)

### F. Definition Composition & Migration (`definition.json` enrichment)

1. **`$ref` + `keyPrefix`** — extract a reusable group (e.g., contact info) into a separate fragment file (`examples/grant-application/contact-fragment.json`), reference it via `$ref` with `keyPrefix` to prevent key collisions
2. **Full `MigrationDescriptor`** — populate `migrations.from["0.9.0"]` with `description`, `fieldMap` entries using all 3 transform values (`preserve`, `drop`, `expression`), and `defaults`
3. **Fix `presentation.page` path** — move from `presentation.page` to `presentation.layout.page` (or document the intentional deviation)

### G. External Validation Coverage

1. **`constraintKind: "type"`** — add a validation result for type mismatch (e.g., string in integer field)
2. **`constraintKind: "external"`** — add a validation result from an external system (e.g., `"x-irs-ein-lookup"`)
3. **`source: "external"`** with `sourceId` — on the external validation result
4. **`validationReport` metadata** — add `definitionUrl` and `definitionVersion` to engine output (or document the intentional omission)

### H. Response Lifecycle (`submission-amended.json`)

1. `status: "amended"` — a reopened submission with modified data
2. Include `validationResults` showing the amended state
3. Optionally a `submission-stopped.json` with `status: "stopped"` and partial data

---

## TDD Workflow

Same red-green-refactor loop, but the "red" step now often involves Python tooling:

1. **Red** — write a test that loads the new JSON file, validates it against its schema, and asserts specific content. For mapping files, test that the Python mapping engine can execute the rules. For changelog files, test that `src/formspec/changelog.py` can parse and classify the changes.
2. **Green** — create the JSON file with minimal content. Fix any schema validation errors. Implement the minimum tooling to pass.
3. **Flesh out** — add tests for round-trip mapping (forward then reverse), changelog impact classification, region layout rendering.
4. **Finish** — complete the JSON content, run full suites.

For new file types without existing tooling (e.g., XML/CSV mapping execution), the test may initially be schema-validation-only, with execution tests added as tooling catches up.

---

## Success Criteria

Phase 2 is done when:

- [ ] `changelog.json` validates against `changelog.schema.json` and exercises all 5 change types, all 3 impact levels, all 8 target categories
- [ ] `mapping.json` exercises all 10 transform types, bidirectional rules, full-form coerce and valueMap
- [ ] `mapping-xml.json` validates against `mapping.schema.json` with `format: "xml"` and XML adapter config
- [ ] `mapping-csv.json` validates against `mapping.schema.json` with `format: "csv"` and CSV adapter config
- [ ] `theme.json` has `pages` with regions exercising the 12-column grid system and responsive overrides
- [ ] `definition.json` uses `$ref` to import a fragment, and `migrations` has a complete `MigrationDescriptor`
- [ ] `submission-amended.json` validates with `status: "amended"` and non-empty `validationResults`
- [ ] Python conformance tests cover: changelog parsing, mapping round-trip (forward + reverse), schema validation for all new files
- [ ] Playwright E2E tests cover: theme page/region layout rendering (if webcomponent supports it), `$ref` fragment resolution
- [ ] Full test suites pass with zero regressions
- [ ] The schema-coverage-audit shows zero "ENTIRELY UNUSED" entries for `changelog.schema.json`
- [ ] The `mapping.schema.json` audit moves from "PARTIAL" to "GOOD" or better
- [ ] The `theme.schema.json` audit moves from "MODERATE" to "GOOD" or better

**Measurable coverage target:** Eliminate ~40 more "NO" entries from the audit. Move `changelog.schema.json` from zero to full coverage. Move `mapping.schema.json` from 5/10 transforms to 10/10.
