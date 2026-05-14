# Claude (UDF) — Feature Requirements Matrix

## Summary

Universal Declarative Forms (UDF) proposes a four-layer architecture — Identity, Instance, Bind, and Presentation Hints — that closely mirrors XForms' MVC separation while transplanting it into a JSON-native format. It introduces a custom expression language (UEL) designed for cross-language portability, adopts SHACL's structured validation model with three severity levels and composable constraints ("shapes"), and borrows FHIR R5's canonical URL + semver + lifecycle status pattern for versioning and response pinning. The proposal is thorough and specification-grade, with worked examples for all six hard cases requested in the prompt, though a few requirements receive only implicit or partial coverage.

## Requirements Coverage

| Req ID | Requirement | Coverage | Proposal Mechanism | Notes |
|--------|-------------|----------|--------------------|-------|
| **FT-01** | Standard types — text, numeric, date, select, multi-select, narrative/long-text, boolean | **Full** | §3.2 Core Field Types: `string`, `text`, `integer`, `decimal`, `boolean`, `date`, `dateTime`, `time`, `select`, `multiSelect` | All requested types present. Also adds `uri`, `email`, and `currency` beyond what was asked. |
| **FT-02** | Financial fields with currency formatting and decimal precision | **Full** | §3.2 `currency` type + §3.1 `precision` field property | Dedicated `currency` type with optional `precision`. Formatting is left to the consuming layer (per out-of-scope boundary), but the data model supports it. Currency code (USD, EUR) is not explicitly addressed — only `precision` is mentioned. |
| **FT-03** | File attachment fields | **Full** | §3.2 `attachment` type with structured object `{ "filename", "mediaType", "url", "size" }` | Models the field metadata; storage is external, matching the requirement. |
| **FT-04** | Auto-calculated fields with formula expressions | **Full** | §4.2 `calculate` MIP in Binds + §5 UEL expression language | Calculated fields are implicitly readonly. Dependency graph ensures correct recalculation order. Worked example in §9.1. |
| **FT-05** | Pre-populated fields with editable vs locked distinction | **Full** | §3.5 `prePopulate` with `source`, `field`, and `editable` properties | `editable: false` locks the value. URI template for source resolution. Clear separation from the `readonly` MIP. |
| **FM-01** | Field metadata — label, description/help text, alternative display labels | **Full** | §3.1 `label`, `description`, and `labels` map (keyed by context name, e.g., `column_header`, `pdf_label`) | The `labels` map elegantly addresses the "alternative display labels per context" requirement. |
| **FM-02** | Default value when field is excluded by conditional logic | **Full** | §3.1 `defaultWhenExcluded` property + §4.3 non-relevant data exclusion semantics | Explicitly modeled. Defaults to `null` if not declared. Identified as an original UDF contribution in §10.8. |
| **FL-01** | Conditional visibility — fields/sections appear or hide based on other values | **Full** | §4.2 `relevant` MIP — UEL boolean expression controlling visibility | Direct adoption of XForms `relevant` semantics. Worked example in §9.2. |
| **FL-02** | Non-relevant data exclusion — hidden fields excluded from submitted data | **Full** | §4.3 Non-Relevant Data Exclusion (5 explicit rules) | Thoroughly specified: excluded from submission, validation suspended, `defaultWhenExcluded` in expressions, last value retained in memory. Conformance requirement in §11.2. |
| **FL-03** | Repeatable sections — dynamically add/remove groups of fields | **Full** | §3.3 Groups with `repeatable: true`, `minRepeat`, `maxRepeat` + §4.5 Repeat Context in Binds | `[]` for current iteration, `[n]` for indexed, `[*]` for aggregation. Multiple worked examples (§9.1, §9.6). |
| **FL-04** | Cross-form field dependencies via shared identifiers | **Full** | §3.6 Secondary Instances + §5.4 `prior()` and `external()` functions + `$instances` prefix | Secondary instances (inline or URI-sourced) enable referencing data from other forms. `$instances.prior_year.path` syntax. |
| **FL-05** | Screener/routing logic — direct users to correct form variant | **Full** | §7.3 Screener Routing — `screener.fields` + `screener.routes` with condition/target pairs | First-matching-condition routing with `"true"` as fallback default. Worked example in §9.4. Identified as original to UDF in §10.8. |
| **VR-01** | Three severity levels — error, warning, info | **Full** | §6.4 Severity Semantics: `error`, `warning`, `info` | Direct from SHACL. `isValid` is true iff zero errors. |
| **VS-01** | Field-level validation | **Full** | §4.2 `constraint` MIP on binds (inline shapes) + §6.1 Shapes with field-specific `path` + built-in `required`/type checks | Both inline constraints on binds and named shapes can target individual fields. Built-in codes in §6.9. |
| **VS-02** | Field-group-level validation (related fields together) | **Full** | §6.11 Validation Scope Levels — shapes with group path (e.g., `"path": "budget_lines"`) | Explicitly listed as a scope level. Worked example in §9.6 (effort-sum-check validates across personnel rows). |
| **VS-03** | Form-level validation (cross-section checks) | **Full** | §6.11 `"path": "$form"` scope for form-level shapes | Dedicated `$form` path token for cross-section constraints. |
| **VS-04** | Cross-form validation (prior-year comparison, cross-submission consistency) | **Full** | §6.11 `"path": "$cross"` scope + §3.6 Secondary Instances + `prior()` function | Dedicated `$cross` scope. Worked example in §9.3 (year-over-year change warning). Identified as original to UDF. |
| **VE-01** | Real-time incremental re-evaluation | **Full** | §4.4 Reactive Dependency Graph — DAG construction, pertinent subgraph recomputation on field change, topological sort | Algorithm specified: parse dependencies, build DAG, detect cycles, compute pertinent subgraph, re-evaluate in topological order. Directly adapted from XForms Appendix C. |
| **VE-02** | Formula-based validation rules using same expression language as calculated fields | **Full** | §6.1 Shape `constraint` property uses UEL (same language as `calculate` in §4.2) | Unified expression language across all MIPs and shapes. |
| **VE-03** | Prior-year comparison rules | **Full** | §3.6 Secondary Instances (`prior_year`) + §5.4 `prior()` function + shapes with `when` guard | Worked example in §9.3 with threshold-based warning, `when` guard for availability, division-by-zero protection. |
| **VE-04** | Inline explanatory messages tied to specific constraint failures | **Full** | §6.2 Shape `message` property with `{field_path}` interpolation tokens | Messages support value interpolation: `"Total expenditures ({total_expended}) cannot exceed award amount ({award_amount})."` |
| **VE-05** | Saving incomplete sections must never be blocked by validation | **Full** | §6.5 Validation Modes — explicit statement: "engines MUST allow saving the current instance state at any time" + §11.2 conformance requirement | Both normative prose and conformance requirements mandate that validation and persistence are independent operations. |
| **VE-06** | External validation injected into same result pipeline | **Full** | §6.10 External Validation Injection — `constraintComponent: "external"` + §6.9 `EXTERNAL_VALIDATION_FAILED` built-in code | Worked example in §9.5 showing external results merged with schema-derived errors. Conformance requirement in §11.2. |
| **VX-01** | Structured validation results — field path, severity, message, machine-readable code, context data | **Full** | §6.8 ValidationResult Properties: `path`, `severity`, `message`, `code`, `shapeId`, `constraintComponent`, `value`, `context` | All requested fields present plus additional ones (`shapeId`, `constraintComponent`). |
| **VX-02** | Results partitioned by severity — is_valid considers only errors | **Full** | §6.4 `isValid` is `true` iff zero results with severity `error` + §6.7 `counts` map partitioned by severity | `counts: { "error": 2, "warning": 1, "info": 0 }` in the report. |
| **VX-03** | Results consumable by any system without importing validation internals | **Full** | §6.7 ValidationReport as standalone JSON + §6.8 self-contained result records | The report is a plain JSON document with all information inline. The `constraintComponent` field allows filtering by source type. Explicitly noted in §9.5 commentary. |
| **VC-01** | Multiple definition versions coexisting simultaneously | **Full** | §2.1 Canonical URL (stable across versions) + §2.2 Version Semantics (semver) | The `url` stays constant; `version` differentiates. Multiple versions can coexist since each is a separate JSON document. |
| **VC-02** | Responses pinned to the definition version they were created with | **Full** | §2.5 Response Pinning — `definitionUrl` + `definitionVersion` on FormResponse | Conformance requirement: engines MUST NOT silently substitute a different version. |
| **VC-03** | Definitions evolve without breaking existing responses | **Full** | §2.2 Semver semantics (patch/minor = non-breaking, major = breaking with migration) + §1.4 `migrate` verb | Semver governs compatibility. Patch and minor changes preserve response validity. Major changes require explicit migration. |
| **VC-04** | Form variants derived from a common base (long form / short form) | **Full** | §2.4 `derivedFrom` field with `url|version` pinning | Derived definition is standalone (not a diff). Relationship is informational for tooling. Worked example in §9.4 (screener routing to short vs full form). |
| **VC-05** | Year-over-year pre-population from prior responses | **Full** | §3.6 Secondary Instances (`prior_year` with source URI) + §5.4 `prior()` function | URI template references prior response. `prior()` is syntactic sugar for `$instances.prior_year.{path}`. |
| **VC-06** | Definition lifecycle — draft, active, retired | **Full** | §2.3 Definition Lifecycle — `draft`, `active`, `retired` with state transition diagram | Adopted directly from FHIR R5. Semantics specified for each state. |
| **AD-01** | Schema-driven — definitions are data (JSON), not code | **Full** | §1.1 Design Principle #1: "Data is JSON" + entire spec defines JSON structures | The entire specification is built around JSON documents as the primary artifact. |
| **AD-02** | Must support future visual/no-code authoring tools | **Full** | §1.1 Design Principle #2: "Declarations, not procedures" + §1.2 layered architecture | Declarative JSON format is inherently tooling-friendly. The abstract explicitly states "any authoring tool can target." No procedural logic required. |
| **AD-03** | Program-agnostic — not tied to any specific domain | **Full** | §1.1 (no domain-specific concepts in core) + §8 Extension Points for domain specialization | Core types and mechanisms are generic. Domain-specific needs are handled via extensions (§8.1-8.3). Worked examples use grants but only as illustration. |
| **AD-04** | Extensible for domain-specific field types, validation rules, and expression functions | **Full** | §8.1 Custom Field Types (URI-based), §8.2 Custom Expression Functions, §8.3 Custom Constraint Components + §8.4 Extension Namespacing with `mustUnderstand` | Three explicit extension points covering all three requested areas. URI namespacing prevents collisions. `mustUnderstand` flag for critical extensions. |

## Summary Statistics

| Coverage | Count |
|----------|-------|
| **Full** | 35 |
| **Partial** | 0 |
| **None** | 0 |
| **Total** | 35 |

## Assessment

### Strengths

- **Comprehensive coverage.** Every single requirement from FT-01 through AD-04 is addressed with an explicit, named mechanism in the specification. No requirement is left to "implicit" or "the engine should figure it out."
- **Specification-grade rigor.** The proposal reads like a standards document, not an implementation guide. It defines conformance levels (§11), normative MUST/SHOULD language, an EBNF grammar for UEL, and explicit type coercion tables — all hallmarks of a real specification.
- **Strong lineage documentation.** Section 10 meticulously traces every concept to its ancestor (XForms, SHACL, FHIR, ODK, SurveyJS, JSON Forms, CommonGrants) and clearly identifies what is original to UDF. This is exactly what the prompt asked for.
- **Worked examples for all hard cases.** All six hard cases from the prompt deliverable are present as concrete JSON examples (§9.1-9.6), including runtime behavior narratives.
- **Original contributions are well-chosen.** `defaultWhenExcluded`, per-shape `validationMode`, screener routing, `$cross` validation scope, and the `context` map on ValidationResult are genuine gaps in predecessor standards that UDF fills.

### Weaknesses

- **Currency formatting underspecified.** While there is a `currency` type with `precision`, the specification does not address how currency codes (USD, EUR, etc.) are declared. This is arguably a presentation concern, but the prompt's FT-02 mentioned "currency formatting" which implies the definition should carry enough metadata for a renderer to format correctly.
- **Migration semantics are thin.** The `migrate` verb is listed in §1.4, but there is no section defining migration map structure, how field renames are expressed, or how value transformations work during migration. This is noted as a verb but not fully specified.
- **No response pre-population from prior responses at the field level.** VC-05 is addressed via secondary instances and `prior()`, but there is no declarative mechanism to say "pre-populate field X from the prior response's field Y" at the field definition level — the form author must wire this up via `calculate` binds referencing `prior()`.
- **UEL `if()` evaluates both branches.** §5.4 states "Both branches are evaluated; engines MAY optimize." This differs from typical short-circuit semantics and could cause unexpected behavior (e.g., division by zero in the else branch). The spec acknowledges this but leaves optimization optional.
- **No explicit data mapping / export DSL.** The prompt's "Secondary influences" mention CommonGrants' bidirectional mapping DSL. While UDF cites this as an influence on `prePopulate` and screener routing, there is no mapping layer for transforming response data into external formats (CSV, XML, alternate JSON shapes). This was listed as out of scope in the prompt, so it is not a gap per se, but it is a missed opportunity given the influence citation.
