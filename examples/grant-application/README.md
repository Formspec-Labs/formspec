# Grant Application — Formspec Kitchen-Sink Reference

A complete vertical slice exercising nearly every feature across all Formspec specification tiers: screener routing, 6-page wizard authoring, FEL calculations and validation shapes, theme cascade (web + PDF), bidirectional JSON mapping plus CSV/XML adapters, an extension registry, and a v1.0→v1.1 changelog.

This directory is **artifacts only** — no app shell or server. To see these artifacts rendered live, run the [references demo](../references/) (Vite, port 8082) which loads every example through `<formspec-render>`. From the monorepo root: `npm run start:references`.

This example focuses on:

- **Breadth** — 6-page wizard, 13 data types, all bind MIPs, repeatable groups (incl. nested), variables, screener, instances, pre-population, `$ref` composition, version migrations.
- **Validation surface** — 12 shapes covering `or`/`not`/`and`/`xone`, shape-id composition, `activeWhen`, continuous/submit/demand timing, context blocks, named codes.
- **Mapping coverage** — bidirectional JSON (23 rules: `valueMap`, `coerce`, `concat`, `split`, `nest`, `flatten`, `constant`, `expression`, `drop`; array modes `each`/`indexed`/`whole`), forward-only CSV adapter, forward-only XML adapter with namespaces and CDATA.
- **Authoring surface** — registry with all 5 extension categories (`dataType`, `function`, `constraint`, `property`, `namespace`) across all lifecycle statuses; changelog with every change type and impact level; PDF theme with print-first tokens.

Validate artifacts:

```bash
PYTHONPATH=src python3 examples/grant-application/validate.py
```

## What's in this directory

| File | Spec | Purpose |
|---|---|---|
| `definition.json` | Core | 6-page grant application: items, binds, variables, shapes, screener, instances, migrations |
| `contact-fragment.json` | Core | Reusable contact group (`$ref` target for modular composition) |
| `component.json` | Component | 118-node wizard layout across 36 distinct component types, including 2 custom components |
| `theme.json` | Theme | USWDS-flavored web theme: tokens, cascade selectors, per-page grid regions |
| `theme-pdf.json` | Theme | PDF-specific theme with print-first tokens and static widget overrides |
| `mapping.json` | Mapping | Bidirectional JSON transform (23 rules) |
| `mapping-csv.json` | Mapping | CSV export adapter (6 rules, pipe/semicolon-delimited arrays) |
| `mapping-xml.json` | Mapping | XML export with namespaces and CDATA |
| `changelog.json` | Changelog | v1.0.0→v1.1.0 migration: 8 entries covering every change type and impact level |
| `screener.json` | Core | Standalone screener document (also embedded in `definition.json`) |
| `grant-bridge.css` | — | Component styling layered over `formspec-base.css`, consumed by the references demo |
| `fixtures/` | — | 4 submission samples: complete, in-progress, amended, stopped |
| `validate.py` | — | Lints every artifact in this directory via `formspec.validate.discover_artifacts` |

> Earlier iterations of this example shipped a Vite shell, a FastAPI backend, and a 5-tab tools dashboard. Those have been consolidated into the [references demo](../references/), which loads every example through the same WASM-backed renderer.

## Feature coverage

The remainder of this README is a feature inventory — useful for navigating the artifacts and for verifying that the spec features you care about have a working reference. For canonical semantics use the [`formspec-specs`](../../specs/) skill and the generated `*.llm.md` summaries.

### Core (data & logic)

**Form structure**
- **Item types** — field (data entry), group (container/section), display (read-only text like nonprofitPhoneHint)
- **Nested children** — field-under-field hierarchy (orgType > orgSubType yields path applicantInfo.orgType.orgSubType)
- **6 wizard pages** — Applicant Info, Project Narrative, Budget, Project Phases, Subcontractors, Review & Submit (via presentation.layout.page)

**Data types**
- **13 data types used** — string, integer, boolean, date, dateTime, time, choice, multiChoice, money, attachment, text, decimal, uri

**Bind MIPs**
- **calculate** — subtotals (unitCost * quantity), duration (dateDiff), phaseTotal (sum of taskCosts), orgNameUpper, indirectRateRounded, projectedEndDate, budgetDeviation, contactPhoneFallback, hasLineItems, scratchPad write-back
- **relevant** — nonprofitPhoneHint shown only for nonprofits, indirectRate hidden for government, subcontractors conditional on usesSubcontractors
- **required** — static (orgName, ein, abstract, startDate, endDate, focusAreas) and conditional (projectWebsite required only for universities)
- **readonly** — static (subtotal, duration, phaseTotal, projectedEndDate, budgetDeviation) and conditional (submissionDeadline readonly when both dates set)
- **constraint** — EIN pattern (XX-XXXXXXX), email contains @, phone format (XXX-XXX-XXXX), endDate > startDate
- **default** — orgType defaults to 'nonprofit', requestedAmount defaults to money(0, 'USD')

**Advanced bind features**
- **whitespace** — normalize (ein), trim (contactEmail), remove (orgSubType) — all three modes represented
- **nonRelevantBehavior** — form-level "remove" default, per-bind "keep" override on subcontractors, per-bind "empty" on nonprofitPhoneHint display item
- **constraintMessage** — custom validation messages on EIN, email, phone, and date ordering constraints
- **disabledDisplay** — "protected" on duration (readonly field styling hint)
- **excludedValue** — "null" on requestedAmount (exclude null from response data)

**Repeatable groups**
- **4 groups** — lineItems (1-20), projectPhases (1-10), phaseTasks (1-20), subcontractors (1-10)
- **Nested repeats** — phaseTasks nested inside projectPhases (two-level repeat)
- **Min/max cardinality** — minRepeat and maxRepeat set on all four groups

**Variables**
- **6 named computed values** — @totalDirect (line item sum), @indirectCosts (rate-based with government exemption), @grandTotal (direct + indirect), @projectPhasesTotal (phase sum), @budgetHasLineItems (presence check), @narrativeHasDateRange (date completeness)
- **Scoping** — @budgetHasLineItems scoped to budget, @narrativeHasDateRange scoped to projectNarrative; others form-wide

**Validation shapes**
- **12 shapes** — field-level and form-level (target "#"), all severity levels (error, warning, info)
- **Composition operators** — or (contactProvided), not (abstractNotPlaceholder), and (subcontractorEntryRequired), xone (budgetMethodExclusive), shape-id references (shapeRefCompositionCoverage)
- **activeWhen** — subcontractorCap and subcontractorEntryRequired active only when usesSubcontractors is true
- **Timing** — continuous (abstractLength), submit (narrativeDocRequired), demand (websiteFormat)
- **Context blocks** — budgetMatch includes computed metadata (grandTotal, requested, difference)
- **Shape codes** — every shape has a unique code (BUDGET_MISMATCH, SUBCONTRACTOR_CAP_EXCEEDED, etc.)

**Screener routing**
- **3 classification fields** — applicantType (choice), isReturning (boolean), requestedAmount (money)
- **4 conditional routes** — for-profit redirect, simplified renewal (returning + under $250K), standard renewal, new application (catch-all)

**Instance data**
- **Readonly** — agencyData (maxAward, fiscalYear, ein) with readonly: true
- **Writable with schema** — scratchPad (lastSavedTotal, budgetNotes) with typed schema and readonly: false
- **Readonly inline** — priorYearData uses inline static data (priorAwardAmount, performanceRating) so the standalone example works without a backend server

**Pre-population**
- **orgName** — pre-populated from agencyData with editable: true (user can override)
- **ein** — pre-populated from agencyData with editable: false (locked to source value)

**Modular composition**
- **$ref** — alternateContact group references contact-fragment.json#contactCore with keyPrefix "altContact"

**Version migrations**
- **v0.9 to v1.0 fieldMap** — preserve (contactName), drop (faxNumber), expression (requestedAmountRaw to requestedAmount.amount with rounding)
- **Defaults for new fields** — requestedAmount.currency set to "USD", selfAssessment set to 3

**Option sets**
- **budgetCategories** — 7 choices (personnel, fringe, travel, equipment, supplies, contractual, other)
- **orgTypes** — 4 choices (nonprofit, university, government, forprofit)
- **Inline options** — focusAreas has 5 inline options on the field itself

**Presentation hints**
- **widgetHint** — Slider on indirectRate
- **Layout modes** — page (wizard pages), flow: grid with columns: 2 (budget), collapsible with collapsedByDefault (budget)
- **styleHints** — emphasis: primary, size: default on budget group
- **Accessibility** — role: region, description, liveRegion: polite on budget group
- **Labels** — multi-label support (short, aria, pdf, csv) on orgName and other fields
- **Prefix/suffix** — "$" prefix on unitCost, "%" suffix on indirectRate
- **initialValue** — contactPhone defaults to "(202) 555-0100", startDate uses FEL expression "=today()"
- **semanticType** — email and phone on contact fields

**Extensions**
- **x- properties** — at definition level (x-agency, x-program-code), bind level (x-validation-group), shape level (x-help-link), route level (x-route-category), instance level (x-purpose), item level (x-budget-version), screener level (x-screener-version)

**Form metadata**
- **url, version, versionAlgorithm** — semver versioning with canonical URL
- **status** — "active"
- **derivedFrom** — references parent template (generic-application-template v2.0.0)
- **title, description, date, name** — full identification metadata

### FEL (expression language)

- **Arithmetic** — `*` (e.g. `$unitCost * $quantity`), `-` (e.g. `moneyAmount($budget.requestedAmount) - moneyAmount(@grandTotal)`), `/` (e.g. `/ 100` in indirect cost calc)
- **Comparison** — `=` (e.g. `$applicantInfo.orgType = 'nonprofit'`), `!=` (e.g. `$applicantInfo.orgType != 'government'`), `<` `>` `<=` `>=` (e.g. `$projectNarrative.endDate > $projectNarrative.startDate`, `length(...) <= 3000`)
- **Logical** — `and` (e.g. `$isReturning = true and moneyAmount($requestedAmount) < 250000`), `or` (e.g. `empty($endDate) or empty($startDate) or ...`), `not` (e.g. `not empty($startDate)`)
- **Null coalescing** — `??` (e.g. `$projectNarrative.indirectRate ?? 0`, `$hourlyRate ?? money(0, 'USD')`)
- **if/then/else** — conditional expressions (e.g. `if $applicantInfo.orgType = 'government' then money(0, 'USD') else money(...)`)
- **Money** — `money()` constructor (e.g. `money(0, 'USD')`), `moneyAmount()` extractor, `moneyCurrency()` extractor, `moneyAdd()` (e.g. `moneyAdd(@totalDirect, @indirectCosts)`)
- **String** — `upper()` (e.g. `upper($applicantInfo.orgName)`), `lower()` (e.g. `lower($projectNarrative.abstract)`), `contains()` (e.g. `contains($contactEmail, '@')`), `matches()` regex (e.g. `matches($ein, '^[0-9]{2}-[0-9]{7}$')`), `length()` (e.g. `length($abstract) <= 3000`), `string()` type cast (e.g. `string(@budgetHasLineItems)`)
- **Date** — `today()` (e.g. `=today()` as initialValue), `year()` (e.g. `year($startDate)`), `dateDiff()` (e.g. `dateDiff($endDate, $startDate, 'months')`), `dateAdd()` (e.g. `dateAdd($startDate, $duration, 'months')`)
- **Aggregates** — `sum()` with wildcard paths (e.g. `sum($budget.lineItems[*].subtotal)`, `sum($phaseTasks[*].taskCost)`), `count()` (e.g. `count($subcontractors[*].subName) >= 1`)
- **Null/presence** — `empty()` (e.g. `empty($projectNarrative.endDate)`), `present()` (e.g. `present($attachments.narrativeDoc)`), `isNull()` (e.g. `isNull($lineItems[0].category)`), `coalesce()` (e.g. `coalesce($contactPhone, 'N/A')`)
- **Math** — `round()` (e.g. `round($indirectRate, 0)`), `abs()` (e.g. `abs(moneyAmount($requestedAmount) - moneyAmount(@grandTotal))`)
- **Type conversion** — `string()` and `number()` (e.g. migration expression `string(round(number($), 2))`)
- **Path references** — `$field` (simple), `$group.field` (dotted), `$repeat[n].field` (indexed, e.g. `$lineItems[0].category`), `$repeat[*].field` (wildcard/element-wise, e.g. `$budget.lineItems[*].subtotal`), `@variable` (named computed values, e.g. `@totalDirect`, `@grandTotal`)

### Theme (presentation)

- **Web theme (theme.json)** — USWDS-flavored tokens (13 colors, 5 spacing xs-xl, 3 typography, 2 radius, 3 elevation, focusRing, grid columns, 5 USWDS class tokens), 3-level cascade (defaults -> selectors -> items), widget declarations (MoneyInput for money, RadioGroup for choice, Toggle for boolean, FileUpload for attachment), 2 stylesheets (USWDS bridge + grant bridge), responsive breakpoints (sm/md/lg/xl), 2 page regions (applicant-info with 5 responsive grid cells, project-budget with 4 cells), target definition binding with semver range `>=1.0.0 <2.0.0`
- **PDF theme (theme-pdf.json)** — print-first tokens (Times New Roman serif, 11pt, narrow mm spacing, monochrome palette), platform: pdf, static widget overrides (paragraph default for fields, section for groups, heading for display items), item overrides (ein monospace + letter-spacing, abstract pre-wrap, requestedAmount bold), x-pdf extension metadata (letter, portrait, page numbers), 3 page regions (applicant-info, project-budget, review-submit), 5 selectors (group, field, boolean, money, display)
- **Cascade demonstrated** — defaults (labelPosition top, widgetConfig with USWDS x-classes mapping root/label/control/hint/error), 5 selectors matching by dataType (money, choice, boolean, attachment) and item type (group), per-item overrides (orgName bold + primary underline, ein monospace + cssClass, abstract with minHeight + ARIA description + liveRegion)
- **Accessibility** — liveRegion (polite) on attachment fields and abstract textarea, ARIA description on projectNarrative.abstract ("Enter a detailed project abstract")

### Components (interaction)

- **Wizard layout** — Wizard root (showProgress, no skip) with 6 Pages: Applicant Info, Project Narrative, Budget, Project Phases, Subcontractors, Review & Submit
- **Core components (17 types)** — Stack (11), Grid (6), Columns (2), TextInput (8), NumberInput (1), DatePicker (3), Select (1), CheckboxGroup (1), Toggle (1), FileUpload (2), Heading (2), Text (20), Divider (2), Card (3), Collapsible (4), ConditionalGroup (2), Spacer (2)
- **Progressive components (15 types)** — Tabs (1), Accordion (1), RadioGroup (1), MoneyInput (1), Slider (1), Rating (1), Alert (6), Badge (5), ProgressBar (1), DataTable (3), Panel (1), Modal (3), Popover (4), Signature (1), Summary (5)
- **Custom components** — ContactField (parameterized: `field`) used 3x for contact inputs; SummaryRow (parameterized: `label`, `field`) used 2x for inline key-value display
- **Slot binding** — `bind` property on input components linking to definition item keys (50 bindings total: 23 direct input binds, 17 Summary item binds, 3 DataTable binds, plus display and repeat binds)
- **Conditional rendering** — 12 `when` expressions: ConditionalGroup for orgSubType visibility and subcontractor section, Text for nonprofit phone hint, Slider hidden for government orgs, 5 Badge components with status conditions (Draft, Initialized, Ready for Review, High Confidence, Needs Work), Alert for budget success/error, Modal auto-trigger on subcontractor toggle
- **Responsive design** — 3 breakpoints (sm 576, md 768, lg 1024); Grid column adaptation (3->2->1 at md/sm for contacts, 2->1 at sm for org fields)
- **Token references** — `$token.space.lg`, `$token.space.md`, `$token.space.sm` used throughout for consistent spacing in Stack gaps and Grid gutters
- **Local tokens** — 3 component-level token definitions: `space.lg` (32px), `color.accent` (#2e7d32), `border.card` (1px solid #dfe1e2)
- **Total** — 118 component nodes across 36 distinct types (17 core + 15 progressive + 2 custom + Wizard + Page)

### Mapping DSL (data transforms)

- **JSON mapping (mapping.json)** — direction: both (bidirectional conformance), 23 top-level rules + 7 inner rules, targetSchema format: json (Grants Management System Payload). Transforms exercised: preserve, valueMap (orgType with forward/reverse maps + unmapped passthrough + default), coerce (object-form with from/to/format and shorthand string), concat (FEL expression composing display name), split (expression with `upper()`), nest (date string to tree by separator), flatten (multiselect to pipe-delimited with reverse nest), constant (static mapping version), expression (FEL-based forward + reverse), drop (attachments stripped for privacy). Array modes: each (lineItems, 5 inner rules with condition guard), indexed (projectPhases, slots 0/1), whole (subcontractors with separator). Priorities and reversePriorities on most rules; `bidirectional: false` on forward-only rules. Top-level defaults (meta.source, meta.profile, submission.channel), per-rule defaults (contactPhone, abstract). Version range `>=1.0.0 <2.0.0`, autoMap enabled.
- **CSV adapter (mapping-csv.json)** — direction: forward, 6 rules. Adapter config: encoding utf-8, lineEnding lf, delimiter `,`, quote `"`, header row enabled. Transforms: preserve (3), coerce (1, date with format), flatten (2, pipe and semicolon separators for multiselect and repeat arrays).
- **XML adapter (mapping-xml.json)** — direction: forward, 6 rules. Root element `GrantApplication`, namespaces: default (`https://example.gov/ns/grants/application/v1`) + `xsi`. Adapter config: XML declaration enabled, indent 2, CDATA section on `GrantApplication.Project.Abstract`. Element mapping via dotted paths; attribute mapping via `@` prefix (`RequestedAmount.@currency`). All transforms are preserve.

### Registry & Changelog (extensions & versioning)

**Extension registry** — formspec-common (`registries/formspec-common.registry.json`, loaded by `validate.py`) covers the cross-example baseline. Grant-specific extensions referenced in artifacts: SSN dataType, fiscal-year function, DUNS constraint (deprecated, see UEI replacement), agency-code property (retired), and an x-grants-gov namespace umbrella.

**Changelog (changelog.json)**
- **Version range** — 1.0.0 to 1.1.0, semverImpact: `minor`
- **8 change entries** covering all change types: `added` (collaborationPlan field, migration descriptor), `removed` (legacyTotal bind), `modified` (EIN shape message, screener route, form title), `moved` (focusAreas optionSet to programFocusAreas), `renamed` (agencyData dataSource to organizationProfile)
- **All impact levels** — `breaking` (removed bind, renamed dataSource), `compatible` (added field, moved optionSet, expanded screener route, migration descriptor), `cosmetic` (updated validation message, clarified title)
- **Migration hints** — `preserve` (carry forward unchanged), `drop` (remove obsolete), `$old.agencyData` (expression-based remap for renamed source)
- **Migration descriptor** — dedicated "added migration" entry for upgrading 1.0.0 responses to 1.1.0 with carry-forward and source remapping
- **Targets** — item, bind, shape, optionSet, dataSource, screener, migration, metadata — broad cross-spec coverage

## What this does NOT cover

These Formspec features are defined in the specifications but not exercised by this example:

- **External option set sources** — all `optionSets` and inline `options` use static inline values; none use the `source` URI mechanism for fetching options from an external endpoint.
- **`formspec-fn:` data sources** — instance data uses inline `data` or a local `http://` source URL; the host-provided `formspec-fn:` function URI scheme for dynamic data injection is not demonstrated.
- **Some FEL stdlib functions** — unused functions include: `countWhere()`, `min()`, `max()`, `avg()`, `floor()`, `ceil()`, `power()`, `selected()`, repeat navigation (`prev()`, `next()`, `parent()`), and MIP state queries (`readonly()`, `required()`, `relevant()`).
- **Recursive custom components** — the two custom components (`ContactField`, `SummaryRow`) use only built-in components in their trees; custom components nesting other custom components is not shown.

For complete feature inventories, see the generated spec summaries:
`specs/core/spec.llm.md`, `specs/fel/fel-grammar.llm.md`, `specs/theme/theme-spec.llm.md`, `specs/component/component-spec.llm.md`, `specs/mapping/mapping-spec.llm.md`, `specs/registry/extension-registry.llm.md`.
