Prompt: Design a Modern Declarative Form Standard

> Research prompt for investigating XForms, SHACL, and FHIR R5, then proposing an original JSON-native form definition and validation standard.




---

The Gap

W3C XForms (2003) remains the most complete declarative form specification ever produced. Its core model — instance data, reactive binds, UI controls — solved the problem of separating form logic from presentation two decades ago. But XForms is trapped in XML. Every modern JSON form library (SurveyJS, JSON Forms, RJSF, Form.io) independently reinvents pieces of XForms without the vocabulary, the completeness, or the coherence.

Nobody has built "JSON-LD for XForms" — a format-agnostic, JSON-native standard that carries XForms' declarative power into the modern stack. That's what this should be.

Think of it as: what would XForms look like if it were designed today, for JSON, informed by 20 years of hindsight and the best ideas from SHACL and FHIR R5?


---

Investigate

W3C XForms — the field model

Read the XForms 1.1 spec (https://www.w3.org/TR/xforms11/). Focus on:

Model Item Properties (MIPs): The unified bind — calculate, constraint, relevant, required, readonly as expressions per data node

The reactive dependency graph and MIP recomputation semantics

Non-relevant data exclusion — disabled data omitted from submission, not just hidden

xforms:repeat — repeatable sections as first-class primitives

Multiple instances — secondary data sources for cross-form references

The MVC separation — instance (data), bind (behavior), UI (presentation) as independent layers


Understand what's essential to the model vs what's incidental to XML.

W3C SHACL — the validation model

Read the SHACL spec (https://www.w3.org/TR/shacl/). Focus on:

Three severity levels: Violation, Warning, Info

Structured ValidationResult: field path, value, message, constraint component, source shape

Constraint composition: and/or/not/xone

The separation of shapes (constraints) from data (instances)


Understand how SHACL decouples validation definition from validation execution and reporting.

HL7 FHIR R5 + SDC — the identity and evolution model

Read the FHIR R5 Questionnaire spec (https://hl7.org/fhir/questionnaire.html) and SDC IG (https://build.fhir.org/ig/HL7/sdc/). Focus on:

Versioning: Canonical URL + semver + versionAlgorithm + derivedFrom + status lifecycle

Response pinning: Responses reference a specific definition version

Two-tier conditionals: Simple declarative (enableWhen) vs expression-based (enableWhenExpression)

disabledDisplay: Hidden vs protected distinction for disabled fields

Modular composition: subQuestionnaire + $assemble + assembledFrom

Definition/response separation as distinct resources


Understand how FHIR solves schema evolution without breaking existing data.

Secondary influences

ODK XLSForm — ${field_name} expression syntax as a cleaner alternative to XPath

SurveyJS — PEG.js expression engine with dependency tracking and cached evaluation

JSON Forms — Validation modes, external error injection, dual-schema separation

CommonGrants — Bidirectional mapping DSL (field/switch/const) for data transformation between systems



---

Requirements It Must Handle

These come from a real federal grant reporting system. They're representative of complex government/financial data collection generally — not domain-specific.

Field Definitions

FT-01: Standard types — text, numeric, date, select, multi-select, narrative/long-text, boolean

FT-02: Financial fields with currency formatting and decimal precision

FT-03: File attachment fields (the standard models the field; storage is external)

FT-04: Auto-calculated fields with formula expressions referencing other fields

FT-05: Pre-populated fields from external data sources, with editable vs locked distinction

FM-01: Field metadata — human label, description/help text, alternative display labels per context

FM-02: Default value when field is excluded by conditional logic


Form Logic

FL-01: Conditional visibility — fields/sections appear or hide based on other values

FL-02: Non-relevant data exclusion — hidden fields excluded from submitted data, not just from display

FL-03: Repeatable sections — dynamically add/remove groups of fields (one-to-many)

FL-04: Cross-form field dependencies via shared identifiers

FL-05: Screener/routing logic — direct users to the correct form variant based on answers


Validation

VR-01: Three severity levels — error (blocks submission), warning (advisory), info (informational)

VS-01: Field-level validation (individual field — required, type, min/max, pattern)

VS-02: Field-group-level validation (related fields together — sum checks, "line items must total")

VS-03: Form-level validation (cross-section checks — "Section A + Section B = Grand Total")

VS-04: Cross-form validation (prior-year comparison, identifier consistency across submissions)

VE-01: Real-time incremental re-evaluation — expression engine supports partial recalculation when a single field changes

VE-02: Formula-based validation rules using the same expression language as calculated fields

VE-03: Prior-year comparison rules — flag values that differ significantly from previous submission

VE-04: Inline explanatory messages tied to specific constraint failures

VE-05: Saving incomplete sections must never be blocked by validation — validation modes control when rules execute

VE-06: External validation (e.g., third-party API checks) injected into the same result pipeline as schema-derived errors

VX-01: Structured validation results — field path, severity, human message, machine-readable code, context data

VX-02: Results partitioned by severity — is_valid considers only errors, not warnings or info

VX-03: Results consumable by any system (UI, API, PDF, analytics) without importing validation internals


Versioning & Evolution

VC-01: Multiple definition versions coexisting simultaneously

VC-02: Responses pinned to the definition version they were created with

VC-03: Definitions evolve without breaking existing responses

VC-04: Form variants derived from a common base (long form / short form)

VC-05: Year-over-year pre-population from prior responses

VC-06: Definition lifecycle — draft, active, retired


Authoring & Extensibility

AD-01: Schema-driven — definitions are data (JSON), not code

AD-02: Must support future visual/no-code authoring tools

AD-03: Program-agnostic — not tied to any specific domain

AD-04: Extensible for domain-specific field types, validation rules, and expression functions without modifying the core standard


Explicitly Out of Scope

The standard defines what fields exist and how values are validated, not how they're displayed or collected. These are real requirements but belong to other layers — the standard must not prevent them:

Layout, navigation, progress indication, multi-step wizards

Rendering (HTML, PDF, API serialization, CSV export)

Data entry UX (auto-save, collaboration, offline caching, sync)

Workflow (submission lifecycle, review/approval, transmittal)

Accessibility and design system compliance (WCAG, USWDS)



---

Deliverable

An original standard specification. Not an implementation guide for a specific framework — a format specification that could be implemented in any language.

It should:

1. Define the conceptual model — the core abstractions (instance, bind, validation shape, form identity, etc.), their relationships, and their semantics. What are the nouns? What are the verbs?


2. Define the expression language — syntax, operators, field references (including within repeatable contexts), type coercion rules, and built-in functions. It should be evaluable in any language, not tied to XPath or JavaScript or Python.


3. Define validation semantics — how rules execute, how severity partitions results, how validation modes work, how external results merge, how non-relevant fields are handled.


4. Define versioning semantics — how definitions are identified, how they evolve, how responses bind to versions, how variants relate to base definitions.


5. Show the hard cases — concrete examples in the standard's own format:

Budget line items summing to a total that must match a pre-populated award amount

Conditional section with dependent required fields and validation

Repeatable rows with per-row calculated subtotals and a cross-row total

Warning for year-over-year change exceeding a threshold

Screener routing to long vs short form variant

External validation failure injected alongside schema-derived errors



6. Document lineage — what was borrowed from each ancestor (XForms, SHACL, FHIR R5, ODK, etc.), what's original, and why the original parts were necessary.


7. Define extension points — where implementors can add domain-specific types, functions, and rules without forking the standard.



Think big. This should read like something that could be submitted to a standards body — not as a product spec for one application.