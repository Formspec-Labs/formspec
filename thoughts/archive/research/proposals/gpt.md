# JSON Declarative Form Model Standard

## Motivation and scope

The core problem is not that modern JSON form libraries are “missing features”; it’s that the ecosystem lacks a shared *conceptual contract* for what a declarative form **is**—a stable separation of (a) instance data, (b) declarative behavior (calculations, relevance, constraints), and (c) any particular rendering or workflow.

The most complete such contract remains XForms’ model layer: standardized instance data + binds, where a single bind can express `calculate`, `constraint`, `relevant`, `required`, and `readonly`, and the processor defines when and how these expressions are recomputed.  XForms also explicitly frames the “separate data from controls” advantage relative to classic HTML forms—making the essential “what gets submitted” more tractable and reusable.

But XForms is deeply XML/XPath-shaped; meanwhile today’s mainstream form definitions and payloads are JSON. That mismatch has repeatedly forced authors toward either (a) code-driven form logic, or (b) ad-hoc JSON mini-languages that reinvent pieces of XForms without a shared vocabulary.

This report proposes **JDFM (JSON Declarative Form Model)**: a JSON-native format specification that:

- **Standardizes the model layer** (data + binds + shapes), making UI/layout explicitly out-of-scope.
- **Uses a deterministic, side-effect-free expression language** designed for dependency tracking and incremental recomputation—leaning on the same “re-evaluate only when dependencies change” idea that appears in modern engines.
- **Defines validation as a separate, composable “shapes” layer**, reporting structured results with severity partitions inspired by SHACL’s reporting discipline.
- **Treats identity/versioning and schema evolution as first-class**, aligned with the canonical URL + version + lifecycle approach found in healthcare-grade specs, including a standard way to “pin” responses to a definition version.

Normative keywords (MUST, SHOULD, MAY, etc.) are used with the meaning defined by BCP 14 (RFC 2119 + RFC 8174).

## Findings from XForms, SHACL, and FHIR R5

**From XForms (model and recomputation semantics)**  
XForms defines a model with instance data and bind-based model item properties. In particular:

- The MIP set being “one bind vocabulary” is explicit: `readonly`, `required`, `relevant`, `calculate`, and `constraint` are defined as model item properties with clear defaults and expression semantics.  
- XForms treats each expression attached to a node/property as a “compute” unit, defines how dependencies are discovered (when expressions reference other nodes), and requires recalculation ordering consistent with dependency direction.  
- XForms processors rebuild dependency structures and then recalculate/revalidate/refresh in a defined lifecycle.  
- XForms `relevant=false` is not only a UI concern: non-relevant nodes are “unavailable” and *can be removed from submission serialization*.  
- Submission processing explicitly prunes non-relevant nodes when a submission’s `relevant` attribute is true (the default), meaning “non-relevant data exclusion” is part of the normative model semantics—not just a rendering choice.  
- Repeats are a first-class primitive with defined creation/destruction and index update behavior.  
- Multiple “instances” are built-in: an `instance` can reference external initial data via `src`/`resource`, supporting secondary data sources.

**From SHACL (shapes, composition, and validation reporting)**  
SHACL’s key contribution is to decouple (a) constraint definitions (“shapes”) from (b) the data being validated, and to standardize reporting:

- Severity is tri-leveled: Info, Warning, Violation.  
- Validation results are structured: each result can carry a focus node, result path, value, severity, constraint component, and source shape, among other metadata.  
- Constraint composition exists as first-class operators (`sh:and`, `sh:or`, `sh:not`, `sh:xone`) with defined semantics.  
- SHACL’s report concept (`sh:ValidationReport` with `sh:conforms`) is a canonical “results graph” pattern—even if JDFM will slightly differ on what “conforms” means (JDFM must ignore warnings/info when computing “is_valid”).

**From FHIR R5 + SDC (identity, lifecycle, completion semantics, modularity)**  
What *XForms didn’t solve* is long-lived schema evolution in a multi-party ecosystem. FHIR’s Questionnaire family is a mature answer:

- A Questionnaire carries canonical identity (`url`) plus `version`, `versionAlgorithm[x]`, `derivedFrom`, and a status lifecycle including `draft | active | retired | unknown`.  
- Questionnaire items support declarative enablement via `enableWhen`, with guidance to use an expression-based extension when more complex behavior is needed—mirroring a two-tier “simple vs expressive” model.  
- Disabled display distinguishes *hidden* vs *protected* (visible but not editable), which is a subtle but important UX/semantics distinction.  
- QuestionnaireResponse references the Questionnaire via a canonical reference (`questionnaire`), and the linking between definition and response is by stable `linkId`.  
- FHIR explicitly treats “in-progress” responses differently: requirements (e.g., required answers) are not expected to be fully satisfied until the response is completed/amended; once completed, non-enabled items must be removed. This is a direct precedent for “validation modes” that should not block saving partial drafts.  
- Canonical references can be version-pinned using the `url|version` pipe notation, and FHIR recommends declaring `versionAlgorithm[x]` because not all ecosystems use SemVer.  
- The Structured Data Capture (SDC) IG formalizes modular assembly: `subQuestionnaire`, a `$assemble` operation that inlines modular questionnaires, and an `assembledFrom` extension that records assembly lineage including versions.

**Secondary influences that matter to JDFM’s design constraints**

- “Field reference syntax that humans can write” is solved well in the **Open Data Kit (ODK)** XLSForm ecosystem: `${question-name}` variables and a shared operator/function vocabulary used across calculations, constraints, and relevants.  
- Performance and incremental recomputation aren’t hypothetical: **SurveyJS** documents that expressions are re-evaluated only when referenced values change, and that decision trees and paths are cached.  
- “External validation injection” is a practical requirement in modern stacks: **JSON Forms** documents supplying backend errors via `additionalErrors` and mixing them with schema-derived errors.  
- “Mapping DSLs” like those in CommonGrants demonstrate a readable, schema-validatable approach to transformation primitives such as constant/field/switch.  

## The JDFM conceptual model

JDFM is a **format specification**: a JSON structure defining form *data shape*, *declarative behavior*, *validation shapes*, and *identity/versioning*. It is not a UI schema and does not standardize layout, steps, or navigation.

### Core nouns

**FormDefinition**  
A canonical, versioned artifact that defines:

- **Fields**: the data nodes that can appear in a response, including types and metadata.
- **Bindings**: XForms-style model item properties (MIPs) attached to fields/groups (calculate, relevant, required, readonly, plus typed constraints).
- **Shapes**: SHACL-style validation definitions with severity and structured reporting metadata.
- **Instances**: named additional JSON inputs (prefill/reference/prior-year/cross-form data) used by expressions.
- **Variants**: derived definitions and routing rules.

**FormResponse**  
A data instance produced by a respondent/system, containing:

- **Pinned reference to a FormDefinition version** (canonical + version).
- **Values** keyed by stable field identifiers (not by UI labels).
- Optional metadata such as timestamps, authoring context, and validation reports.

**ValidationReport**  
A portable, renderer-agnostic representation of validation results, partitioned by severity and addressable by field paths.

### JDFM’s three-layer separation

JDFM is intentionally strict about separation:

- **Instance layer (values)**: the JSON content a user/system is “filling out”.
- **Behavior layer (bindings)**: pure expressions that compute or gate values and participation (calculate / relevant / required / readonly).
- **Constraint layer (shapes)**: a composable validation graph that can produce rich, portable results and can be run under different modes.

This is a direct generalization of the XForms model architecture—instance + binds—while keeping UI out-of-scope.

### Addressing: stable Field IDs, dynamic instance pointers

To support evolution (VC-03) and cross-form dependencies (FL-04), JDFM distinguishes:

- **FieldRef**: a stable identifier path (string) anchored in the definition tree, version-to-version stable as long as the semantics of the field remain the same. This mirrors how Questionnaire/QuestionnaireResponse link via stable identifiers (`linkId`).  
- **DataPointer**: a JSON Pointer (RFC 6901) into the *concrete response instance*, including repeat indexes.  

JDFM uses both: FieldRef for definition-time targeting; DataPointer for runtime results addressing.

### Minimal object model (normative)

Below is the **normative** structural contract for JDFM v1.0.0.

#### FormDefinition

A JDFM FormDefinition MUST be a JSON object with:

- `jdfm`: string, the spec version (e.g., `"1.0.0"`).
- `canonical`: URI string identifying the definition across servers and time (RFC 3986).  
- `version`: string identifying this version (SemVer RECOMMENDED, but not REQUIRED). FHIR explicitly supports non-SemVer schemes and provides `versionAlgorithm[x]` for comparison guidance.  
- `versionAlgorithm`: string enum `{ "semver", "lexical", "date", "opaque" }` describing how versions should be compared (aligned to the rationale in FHIR canonical identity guidance).  
- `status`: string enum `{ "draft", "active", "retired" }`, matching the general lifecycle shape used in canonical artifacts.  
- `derivedFrom`: optional array of canonical+version references (to model variants/lineage).  
- `fields`: a single root FieldNode.
- `bindings`: array of Binding objects.
- `shapes`: array of Shape objects.
- `instances`: optional map of named InstanceDescriptors.
- `variants`: optional VariantRouter descriptor.
- `extensions`: optional object for vendor/domain extensions.

#### FieldNode

A FieldNode is one of:

- **field**: leaf nodes that hold values (text, number, date, money, boolean, select, multiselect, attachment, long-text).
- **group**: an object container of child nodes.
- **repeat**: an array of group items (repeatable section), analogous in intent to XForms repeat collections.  

Every FieldNode MUST include:

- `id`: stable identifier, unique among siblings and RECOMMENDED unique across the whole tree.
- `kind`: `"field" | "group" | "repeat"`.
- `meta`: label/help/description and optional context-specific label variants (FM-01).

Repeat nodes MUST include:

- `item`: a group FieldNode describing the row object shape.
- `minItems`, `maxItems`: constraints on repeat cardinality (FL-03).

#### Binding

A Binding attaches model item properties to one target FieldRef.

Each Binding MUST include:

- `target`: FieldRef string (definition-time stable path).
- Optional MIP-style properties (all expressions are in JDFM-EL, defined later):
  - `calculate`: expression producing a value to write to the target.
  - `relevant`: boolean expression controlling whether the target participates (visibility *and* data inclusion semantics).
  - `required`: boolean expression controlling requiredness.
  - `readonly`: boolean expression controlling editability/lock.
  - `constraint`: boolean expression producing validity (XForms-style).  
- `whenExcluded`: policy controlling behavior when `relevant=false`:
  - `submission`: `"prune" | "null" | "default"` (FL-02, FM-02).
  - `evaluationValue`: `"missing" | "null" | "default"` (how downstream expressions treat excluded values).
  - `defaultValue`: JSON value used if `"default"` is selected.

This explicitly imports XForms’ point that non-relevant nodes are unavailable and may be removed from submission serialization.

#### Shape

A Shape is a reusable, composable validation unit, inspired by SHACL shapes and components.

Each Shape MUST include:

- `id`: stable identifier.
- `severity`: `"error" | "warning" | "info"` (VR-01), matching SHACL’s tri-level model.
- `target`: FieldRef or the special target `"@form"` for form-level rules.
- `activeWhen`: optional boolean expression controlling whether the shape is evaluated.
- `assert`: one of:
  - `{ "expr": "<boolean expression>" }` (formula-based rule, VE-02), or
  - `{ "allOf": [assert, ...] }`, `{ "anyOf": [...] }`, `{ "oneOf": [...] }`, `{ "not": assert }` (composition).
- `message`: human-readable message template.
- `code`: machine-readable code string.
- `explain`: optional structured context to help renderers generate inline explanations.

Composition is intentionally isomorphic to SHACL’s constraint composition ideas (`and/or/not/xone`).

## The JDFM expression language

JDFM defines **JDFM-EL**, a JSON-serializable expression language designed for:

- determinism (no I/O, no random unless explicitly injected as an input instance),
- static/dynamic dependency extraction,
- incremental recomputation.

This is directly motivated by XForms’ “compute” model and dependency ordering.  It is also aligned with documented production practice where expression engines only re-evaluate when referenced values change and cache parse structures/decision trees.

### Syntax overview

JDFM-EL syntax combines three proven ideas:

- **ODK/XLSForm-style `${name}` references** as a human-friendly, parser-friendly variable token.  
- **Dot/bracket navigation** over JSON objects/arrays.
- **Pure functional helpers** for aggregation, coercion, and money/date operations.

A JDFM-EL expression is a UTF-8 string.

#### Lexical elements (normative)

- Whitespace MAY appear anywhere between tokens.
- Literals:
  - strings: `"..."` (JSON string rules)
  - booleans: `true`, `false`
  - null: `null`
  - numbers: `123`, `-4.56`, `1e6` (treated as decimal, not binary float, in evaluation)
- Field references:
  - `${fieldRef}` references a value by FieldRef relative to the current scope.
  - `${@.field}` references a value relative to the current repeat row (`@` is “current object”).
  - `${$.field}` references a value at the response root.

The `${...}` tokenization is intentionally similar to ODK’s `${question-name}` variables.

#### Operators (normative subset)

JDFM-EL supports:

- arithmetic: `+ - * /`
- comparisons: `== != > >= < <=`
- boolean: `and or not`
- membership: `in`
- null-coalescing: `??` (left if not null/missing, else right)

String concatenation MUST use `concat(a,b,...)` (not `+`), mirroring ODK’s caution that math operators are numeric and that `+` is not used for concatenating strings.

### Types and coercion rules

JDFM-EL supports the following runtime types:

- `Missing` (no value at that path)
- `Null`
- `Boolean`
- `Decimal` (arbitrary-precision base-10)
- `String`
- `Date` and `DateTime` (ISO 8601 / RFC 3339 compatible strings normalized during parsing)  
- `Money` (object `{ "amount": "<decimal>", "currency": "<ISO4217>" }`) where currency codes are ISO 4217.  
- `Attachment` (object with metadata; see below)
- `Array`
- `Object`

**Empty/unanswered values**: By default, absent field references produce `Missing`. For compatibility with XLSForm-like semantics, implementations SHOULD treat “unanswered” primitives as empty strings only at the UI integration layer, not at the JDFM-EL layer. (ODK explicitly notes that variables referencing unanswered questions are empty strings and are not automatically converted to zero.)

### Built-in functions (minimum required set)

Implementations MUST support:

- `if(cond, thenExpr, elseExpr)`
- `coalesce(a, b, ...)` (first non-null/non-missing)
- `isMissing(x)`, `isNull(x)`, `isEmpty(x)` (empty string or empty array)
- `count(x)` (array length)
- `sum(arrayOfNumbers)`
- `abs(x)`, `min(a,b)`, `max(a,b)`, `round(x, digits)`
- `matches(text, regex)` (full match by default)
- `today()` returns current date (in the evaluator’s timezone context)
- `date(s)`, `dateTime(s)` parse RFC 3339-ish inputs
- `inst(name)` returns the root object of a named instance

**Money helpers (required if `money` fields are used)**

- `money(amount, currency)` returns a Money object.
- `moneyAmount(m)` extracts decimal amount.
- `moneyCurrency(m)` extracts currency.
- `moneyEq(a,b)` equality (both amount and currency)
- `moneyAdd(a,b)` (requires same currency)
- `moneySum(arrayOfMoney)` (requires uniform currency)

### Repeat context

Within a repeat row:

- `@` is bound to the row object.
- `idx()` returns zero-based index of the row in its parent array.
- `parent()` returns the parent object context (one level up).

This is conceptually parallel to repeat index handling and context availability patterns in XForms repeats (including the importance of defined index semantics), even though JDFM avoids XPath.

### Dependency extraction and incremental recomputation

To guarantee VE-01, JDFM-EL is constrained so dependencies are tractable:

- A JDFM-EL expression MUST be side-effect-free and MUST depend only on:
  - referenced fields in the active response (`$`),
  - the current repeat row (`@`),
  - named instances via `inst(name)`,
  - literal constants.

An implementation MUST be able to determine an expression’s dependencies either by static parse (preferred) or by instrumented evaluation.

This design aligns with:

- XForms’ explicit “compute” concept and dependency ordering constraints.  
- SurveyJS’ published strategy of re-evaluating expressions only when referenced values change and caching parse artifacts.  

## Validation semantics and reporting

JDFM validation must support: field-level, group-level, form-level, and cross-form rules with severity partitioning, plus modes that do not block draft saving.

### Execution phases and modes

JDFM defines a **ValidationMode** input to validation execution:

- `draft`: advisory validation (warnings/info) and *non-blocking* errors MAY be computed but MUST NOT block persistence.
- `save`: stronger checks (e.g., required fields in already-touched sections), still MUST NOT block persistence by default.
- `submit`: full enforcement; errors block submission serialization.
- `audit`: full enforcement plus optional integrity/completeness checks, including “should-be-present” items.

This is motivated by FHIR’s explicit stance that QuestionnaireResponse instances may be stored incomplete and are not expected to meet requirements until completed; once completed, requirements must be met and disabled/non-enabled content removed.

### Interaction with relevance and non-relevant data exclusion

JDFM distinguishes:

- **UI relevance** (out of scope for rendering, but modeled as `relevant` state),
- **data relevance** (whether this node participates in submission and validation).

**Normative rule:** If a node’s effective `relevant` evaluates to `false`, then:

- its constraints and shapes MUST NOT be evaluated unless explicitly configured with `activeWhen` that overrides relevance, and
- it MUST be handled in submission materialization according to `whenExcluded.submission`.

This behavior is explicitly grounded in XForms’ relevant property definition (“unavailable” and removable from submission serialization) and in XForms submission pruning behavior where non-relevant nodes are deselected/pruned during submission when `relevant=true`.

### External validation result injection

JDFM treats external validations (third-party API checks, business rule engines, manual review) as first-class by defining a standard merge contract:

- External systems can supply `ValidationResult[]`.
- A JDFM engine MUST merge external results with internally computed results into a single ValidationReport.
- Merging MUST preserve provenance (`source.type = "external"` and a stable source identifier).

This is aligned with modern practice in JSON-based renderers that mix backend-provided errors with schema-derived errors.

### ValidationReport and ValidationResult (normative)

**ValidationReport** MUST include:

- `is_valid`: boolean (VX-02): true iff there are **zero** results with `severity="error"`.
- `results`: array of ValidationResult.
- `by_severity`: object with arrays `{ "error": [], "warning": [], "info": [] }`.

**ValidationResult** MUST include (VX-01):

- `severity`: `"error" | "warning" | "info"` (VR-01)
- `fieldRef`: FieldRef string (stable, definition-oriented)
- `dataPointer`: JSON Pointer to the concrete failing value in the FormResponse (RFC 6901)
- `message`: human-readable string
- `code`: machine-readable string
- `context`: JSON object (free-form), for downstream renderers/analytics
- `source`:
  - `type`: `"shape" | "binding" | "external"`
  - `id`: shape id or binding id or external validator id
  - optional `constraint`: constraint identifier (SHACL analog: source constraint component)

This structure is intentionally close to SHACL ValidationResult patterns (path/value/severity/source metadata), but adapted to JSON Pointer and non-RDF data.

## Versioning, modularity, and evolution

JDFM adopts a “canonical artifact” model: definitions have stable canonical identity and explicit versions, and responses pin to a version.

### Canonical identity and pinned references

A FormDefinition MUST have:

- `canonical`: a URI stable across locations (RFC 3986).  
- `version`: a publisher-managed version string.

A FormResponse MUST include:

- `definition`: `{ "canonical": "...", "version": "..." }`

This is directly analogous to how FHIR uses canonical URL identity and supports version pinning via `url|version`.

### Lifecycle: draft, active, retired

Definitions evolve under a lifecycle:

- `draft`: may change without strict backward compatibility guarantees.
- `active`: stable; changes MUST preserve the ability to interpret previously stored responses, primarily via stable field IDs/FieldRefs.
- `retired`: remains resolvable for historic responses but MUST NOT be used for new responses.

A similar lifecycle exists in canonical artifacts like Questionnaire with `draft`, `active`, `retired`.

### Variants and derivation

JDFM supports “long vs short form” and other variants without forking semantics:

- A variant is a FormDefinition with `derivedFrom` referencing a base.
- A base definition MAY include a `variants` router that selects a derived definition by evaluating conditions against a small “screener” subset of fields.

This mirrors the “derivedFrom” model as a formal relationship.

### Modular composition and assembly lineage

JDFM borrows the SDC modular pattern:

- A definition may contain placeholders that reference other FormDefinitions (subforms).
- A standard assembly process can inline subforms into a fully expanded definition, producing an assembled artifact.
- The assembled artifact SHOULD record `assembledFrom` references to the component definitions (including versions).

This is the same core approach as `subQuestionnaire`, `$assemble`, and `assembledFrom`.

## Hard cases, lineage, and extension points

This section provides concrete examples in JDFM’s own format and then documents lineage and extension hooks.

### Example: a single cohesive grant-reporting model

The following example includes:

- Budget line items that sum to a total matching a pre-populated award amount (error).
- Conditional section with dependent required fields and non-relevant exclusion.
- Repeatable rows with per-row subtotal and cross-row total.
- Prior-year warning.
- Screener routing to long vs short variant.
- External validation injection.

#### FormDefinition: base with routing

```json
{
  "jdfm": "1.0.0",
  "canonical": "https://forms.example.gov/jdfm/grant-report",
  "version": "2026.1.0",
  "versionAlgorithm": "semver",
  "status": "active",
  "title": "Federal Grant Report",
  "derivedFrom": [],
  "instances": {
    "award": { "kind": "instance", "description": "Authoritative award facts (prefill)", "required": true },
    "priorYear": { "kind": "instance", "description": "Prior-year FormResponse values", "required": false }
  },
  "fields": {
    "id": "root",
    "kind": "group",
    "meta": { "label": "Grant Report Root" },
    "children": {
      "screener": {
        "id": "screener",
        "kind": "group",
        "meta": { "label": "Screener" },
        "children": {
          "reporting_track": {
            "id": "reporting_track",
            "kind": "field",
            "type": "select",
            "meta": {
              "label": "Reporting track",
              "help": "Select the track that applies to this grant."
            },
            "options": [
              { "value": "short", "label": "Short form" },
              { "value": "long", "label": "Long form (detailed budget)" }
            ],
            "default": "short"
          }
        }
      }
    }
  },
  "bindings": [],
  "shapes": [],
  "variants": {
    "strategy": "firstMatch",
    "variants": [
      {
        "canonical": "https://forms.example.gov/jdfm/grant-report--short",
        "version": "2026.1.0",
        "appliesWhen": "${$.screener.reporting_track} == \"short\""
      },
      {
        "canonical": "https://forms.example.gov/jdfm/grant-report--long",
        "version": "2026.1.0",
        "appliesWhen": "${$.screener.reporting_track} == \"long\""
      }
    ],
    "default": {
      "canonical": "https://forms.example.gov/jdfm/grant-report--short",
      "version": "2026.1.0"
    }
  },
  "extensions": {
    "x-out-of-scope": {
      "note": "Layout/wizard/navigation are intentionally excluded from the core standard."
    }
  }
}
```

#### FormDefinition: long variant with budget + conditional subawards + YoY warnings

```json
{
  "jdfm": "1.0.0",
  "canonical": "https://forms.example.gov/jdfm/grant-report--long",
  "version": "2026.1.0",
  "versionAlgorithm": "semver",
  "status": "active",
  "derivedFrom": ["https://forms.example.gov/jdfm/grant-report|2026.1.0"],
  "title": "Federal Grant Report (Long Form)",
  "instances": {
    "award": { "kind": "instance", "required": true },
    "priorYear": { "kind": "instance", "required": false }
  },
  "fields": {
    "id": "root",
    "kind": "group",
    "meta": { "label": "Grant Report" },
    "children": {
      "award_amount": {
        "id": "award_amount",
        "kind": "field",
        "type": "money",
        "meta": {
          "label": "Award amount",
          "help": "Pre-populated from the authoritative award record."
        },
        "default": { "amount": "0.00", "currency": "USD" }
      },
      "budget": {
        "id": "budget",
        "kind": "group",
        "meta": { "label": "Budget" },
        "children": {
          "line_items": {
            "id": "line_items",
            "kind": "repeat",
            "meta": { "label": "Budget line items" },
            "minItems": 0,
            "maxItems": 5000,
            "item": {
              "id": "line_item",
              "kind": "group",
              "meta": { "label": "Line item" },
              "children": {
                "category": {
                  "id": "category",
                  "kind": "field",
                  "type": "select",
                  "meta": { "label": "Category" },
                  "options": [
                    { "value": "personnel", "label": "Personnel" },
                    { "value": "travel", "label": "Travel" },
                    { "value": "equipment", "label": "Equipment" },
                    { "value": "contracts", "label": "Contracts" },
                    { "value": "other", "label": "Other" }
                  ]
                },
                "description": {
                  "id": "description",
                  "kind": "field",
                  "type": "text",
                  "meta": { "label": "Description" },
                  "default": ""
                },
                "quantity": {
                  "id": "quantity",
                  "kind": "field",
                  "type": "decimal",
                  "meta": { "label": "Quantity" },
                  "default": "1"
                },
                "unit_cost": {
                  "id": "unit_cost",
                  "kind": "field",
                  "type": "money",
                  "meta": { "label": "Unit cost" },
                  "default": { "amount": "0.00", "currency": "USD" }
                },
                "subtotal": {
                  "id": "subtotal",
                  "kind": "field",
                  "type": "money",
                  "meta": { "label": "Subtotal (calculated)" },
                  "default": { "amount": "0.00", "currency": "USD" }
                }
              }
            }
          },
          "total_budget": {
            "id": "total_budget",
            "kind": "field",
            "type": "money",
            "meta": { "label": "Total budget (calculated)" },
            "default": { "amount": "0.00", "currency": "USD" }
          }
        }
      },
      "subawards": {
        "id": "subawards",
        "kind": "group",
        "meta": { "label": "Subawards" },
        "children": {
          "has_subawards": {
            "id": "has_subawards",
            "kind": "field",
            "type": "boolean",
            "meta": { "label": "Do you have any subawards?" },
            "default": false
          },
          "subawardee_name": {
            "id": "subawardee_name",
            "kind": "field",
            "type": "text",
            "meta": { "label": "Primary subawardee name" },
            "default": ""
          },
          "subaward_amount": {
            "id": "subaward_amount",
            "kind": "field",
            "type": "money",
            "meta": { "label": "Primary subaward amount" },
            "default": { "amount": "0.00", "currency": "USD" }
          }
        }
      },
      "attachments": {
        "id": "attachments",
        "kind": "group",
        "meta": { "label": "Attachments" },
        "children": {
          "budget_justification": {
            "id": "budget_justification",
            "kind": "field",
            "type": "attachment",
            "meta": { "label": "Budget justification document" },
            "default": null
          }
        }
      }
    }
  },
  "bindings": [
    {
      "id": "prefill_award_amount",
      "target": "award_amount",
      "calculate": "inst(\"award\").award_amount",
      "readonly": "true"
    },
    {
      "id": "line_subtotal",
      "target": "budget.line_items[].subtotal",
      "calculate": "money( decimal(${@.quantity}) * decimal(${@.unit_cost.amount}), ${@.unit_cost.currency} )",
      "readonly": "true"
    },
    {
      "id": "budget_total",
      "target": "budget.total_budget",
      "calculate": "money( sum(${$.budget.line_items[*].subtotal.amount}), \"USD\" )",
      "readonly": "true"
    },
    {
      "id": "subawards_relevance",
      "target": "subawards.subawardee_name",
      "relevant": "${$.subawards.has_subawards} == true",
      "required": "${$.subawards.has_subawards} == true",
      "whenExcluded": {
        "submission": "prune",
        "evaluationValue": "default",
        "defaultValue": ""
      }
    },
    {
      "id": "subawards_amount_relevance",
      "target": "subawards.subaward_amount",
      "relevant": "${$.subawards.has_subawards} == true",
      "required": "${$.subawards.has_subawards} == true",
      "whenExcluded": {
        "submission": "prune",
        "evaluationValue": "default",
        "defaultValue": { "amount": "0.00", "currency": "USD" }
      }
    }
  ],
  "shapes": [
    {
      "id": "budget_total_matches_award",
      "severity": "error",
      "target": "budget.total_budget",
      "activeWhen": "true",
      "assert": {
        "expr": "moneyEq(${$.budget.total_budget}, ${$.award_amount})"
      },
      "code": "BUDGET_TOTAL_MUST_MATCH_AWARD",
      "message": "Total budget must equal the award amount.",
      "explain": {
        "showFields": ["award_amount", "budget.total_budget"]
      }
    },
    {
      "id": "line_item_requires_description_if_amount_nonzero",
      "severity": "error",
      "target": "budget.line_items[].description",
      "activeWhen": "true",
      "assert": {
        "expr": "decimal(${@.subtotal.amount}) == 0 or (not isEmpty(${@.description}))"
      },
      "code": "LINE_ITEM_DESC_REQUIRED",
      "message": "Provide a description when the line item subtotal is non-zero.",
      "explain": { "rowScoped": true }
    },
    {
      "id": "yoy_budget_change_warning",
      "severity": "warning",
      "target": "budget.total_budget",
      "activeWhen": "not isMissing(inst(\"priorYear\").budget.total_budget)",
      "assert": {
        "expr": "abs(decimal(${$.budget.total_budget.amount}) - decimal(inst(\"priorYear\").budget.total_budget.amount)) <= (0.2 * decimal(inst(\"priorYear\").budget.total_budget.amount))"
      },
      "code": "YOY_BUDGET_CHANGE_GT_20PCT",
      "message": "Budget total differs by more than 20% from prior year; please confirm and explain.",
      "explain": {
        "context": {
          "threshold": "0.20",
          "priorYearField": "priorYear.budget.total_budget"
        }
      }
    }
  ],
  "extensions": {
    "x-financial": {
      "currencyDefault": "USD",
      "decimalPolicy": "fromStrings"
    }
  }
}
```

#### FormResponse: pinned version + external validation injected

```json
{
  "jdfm": "1.0.0",
  "definition": {
    "canonical": "https://forms.example.gov/jdfm/grant-report--long",
    "version": "2026.1.0"
  },
  "status": "in-progress",
  "authored": "2026-02-19T10:30:00-07:00",
  "values": {
    "award_amount": { "amount": "100000.00", "currency": "USD" },
    "budget": {
      "line_items": [
        {
          "category": "personnel",
          "description": "Project manager",
          "quantity": "1",
          "unit_cost": { "amount": "60000.00", "currency": "USD" },
          "subtotal": { "amount": "60000.00", "currency": "USD" }
        },
        {
          "category": "travel",
          "description": "Field travel",
          "quantity": "1",
          "unit_cost": { "amount": "50000.00", "currency": "USD" },
          "subtotal": { "amount": "50000.00", "currency": "USD" }
        }
      ],
      "total_budget": { "amount": "110000.00", "currency": "USD" }
    },
    "subawards": {
      "has_subawards": true,
      "subawardee_name": "",
      "subaward_amount": { "amount": "0.00", "currency": "USD" }
    },
    "attachments": {
      "budget_justification": {
        "filename": "budget.pdf",
        "contentType": "application/pdf",
        "url": "https://files.example.gov/object/abc123",
        "size": 482331,
        "hash": "Base64Sha1Here=="
      }
    }
  },
  "externalValidation": {
    "results": [
      {
        "severity": "error",
        "fieldRef": "attachments.budget_justification",
        "dataPointer": "/attachments/budget_justification",
        "code": "ATTACHMENT_VIRUS_SCAN_FAILED",
        "message": "Attachment failed malware scan; replace the file.",
        "context": { "scanner": "thirdPartyA", "scanId": "scan-7781" },
        "source": { "type": "external", "id": "malware-scan-service" }
      }
    ]
  }
}
```

The attachment metadata fields (`url`, `size`, `hash`) are aligned with widely used attachment semantics (e.g., hash/size/url patterns used in healthcare attachments), including the idea that `url` must resolve to actual data and `size`/`hash` support integrity checks.

### Lineage: what JDFM borrows, what it changes, and what it adds

**Borrowed (directly)**

- From XForms: bind-centered MIPs (`calculate`, `constraint`, `relevant`, `required`, `readonly`) and the idea that binds define a recomputed dependency graph with ordering constraints.  
- From XForms: non-relevant data pruning during submission, not merely “hidden UI”.  
- From SHACL: three severity levels and portable, structured validation results with explicit source metadata and compositional logic operators.  
- From FHIR R5: canonical identity + version + versionAlgorithm + derivedFrom + lifecycle status, and the requirement-driven distinction between “in-progress draft” and “completed” enforcement.  
- From SDC: modular assembly (`$assemble`) and explicit assembly lineage (`assembledFrom`).  
- From Open Data Kit / XLSForm: `${...}` variable references and reuse of a single expression vocabulary across calculations/constraints/relevants.  
- From SurveyJS: dependency-tracked re-evaluation and caching as a first-class runtime goal.  
- From JSON Forms: explicit support for injecting external validation errors into the same result pipeline.  
- From CommonGrants: small, JSON-schema-validatable mapping primitives that can be reused as a JDFM extension module for transformations.  

**Original (necessary additions)**

- **FieldRef + DataPointer dual addressing**: SHACL is RDF-path-first, XForms is XPath-first, and FHIR QuestionnaireResponse is item-linkId-tree-first. JDFM introduces a JSON-native “stable ref + concrete pointer” model to make repeat-row targeting and analytics stable across versions while remaining renderer-agnostic.
- **Explicit `whenExcluded` semantics**: many systems conflate “hidden”, “disabled”, and “excluded from submission”. JDFM makes the exclusion policy declarative and testable, and separates “submission pruning” from “evaluation masking.”
- **ValidationMode as a normative input**: rather than leaving draft-vs-submit behavior to applications, JDFM standardizes it—motivated by FHIR’s explicit incomplete/completed semantics.  
- **JSON-native repeat semantics without XPath**: repeats are arrays of row objects keyed by stable IDs, rather than template-driven XML trees.

### Extension points (non-forking design)

JDFM defines extension points so implementers can add domain needs without standard fragmentation:

1. **Custom field types**
   - Any field `type` MAY be namespaced, e.g., `"type": "x-domain:uei"` or `"type": "x-financial:appropriationCode"`.
   - Custom types MUST declare:
     - canonical type id,
     - base primitive (string/decimal/object),
     - normalization and comparison rules.

2. **Custom functions**
   - Implementations MAY extend the function registry via namespaces:
     - `fn:...` reserved for core
     - `x-<vendor>:...` for extensions
   - Custom functions MUST be pure and deterministic to preserve dependency tracking guarantees.

3. **Custom constraint components**
   - Shapes MAY reference `constraintComponent` identifiers (SHACL-style) so that a single “business rule component” can be reused with different parameters, while still producing standardized results metadata.  

4. **Transform modules**
   - JDFM MAY embed a transformation section (out-of-core module) reusing readable mapping primitives such as `const`, `field`, and `switch`, following CommonGrants’ pattern.  

5. **Interchange metadata**
   - Implementations MAY add `@context` or other semantic metadata, but the core standard does not require RDF/JSON-LD.

### A deliberately contrarian design note

Many ecosystems treat validations as “UI behavior” (show/hide/disable + required + errors). JDFM flips that: **the model owns participation and truth; the UI merely reflects it**—because submission pruning, cross-form comparisons, and analytics cannot safely depend on UI frameworks. XForms’ submission pruning step, and FHIR’s “completed responses must not include disabled items,” both point to the same conclusion: relevance/exclusion is a *data contract*, not a CSS trick.
