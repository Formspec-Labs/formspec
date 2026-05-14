# Universal Declarative Forms (UDF)

## A JSON-Native Standard for Form Definition, Validation, and Evolution

**Version:** 0.1.0-draft  
**Status:** Draft Specification  
**Date:** 2026-02-19  
**Authors:** Synthesized from W3C XForms, W3C SHACL, HL7 FHIR R5/SDC, and community practice

---

## Abstract

Universal Declarative Forms (UDF) is a format-agnostic, JSON-native standard for defining data collection forms, their validation rules, and their evolution over time. UDF separates **what data is collected** from **how it is displayed**, enabling a single form definition to drive web UIs, mobile apps, PDF generation, API validation, and analytics pipelines.

UDF synthesizes the declarative power of W3C XForms (instance/bind/UI separation, reactive dependency graphs, non-relevant data exclusion), the structured validation model of W3C SHACL (severity levels, composable constraints, machine-readable results), and the identity and evolution semantics of HL7 FHIR R5 (canonical URLs, semantic versioning, response pinning, modular composition).

The result is a standard that any language can implement, any authoring tool can target, and any rendering layer can consume.

---

## Table of Contents

1. [Conceptual Model](#1-conceptual-model)
2. [Form Identity and Versioning](#2-form-identity-and-versioning)
3. [Instance Schema](#3-instance-schema)
4. [Binds](#4-binds)
5. [Expression Language (UEL)](#5-expression-language-uel)
6. [Validation Semantics](#6-validation-semantics)
7. [Composition and Modularity](#7-composition-and-modularity)
8. [Extension Points](#8-extension-points)
9. [Hard Cases — Worked Examples](#9-hard-cases--worked-examples)
10. [Lineage and Influences](#10-lineage-and-influences)
11. [Conformance](#11-conformance)

---

## 1. Conceptual Model

### 1.1 Design Principles

1. **Data is JSON.** Instance data, form definitions, and validation results are all JSON documents. No XML required at any layer.
2. **Declarations, not procedures.** Form authors declare *what* — fields, constraints, calculations, visibility conditions. Engines decide *how* and *when* to evaluate.
3. **Separation of concerns.** Four independent layers — Identity, Instance, Bind, and Presentation — may be authored, versioned, and consumed independently.
4. **Validation is structured.** Every validation result is a machine-readable record with a field path, severity, human message, and constraint identifier. No string parsing.
5. **Evolution is first-class.** Definitions are versioned artifacts. Responses are pinned to definition versions. Definitions evolve without breaking existing responses.
6. **Extensibility without forking.** Domain-specific field types, expression functions, and validation rules plug into well-defined extension points.

### 1.2 The Four Layers

A UDF form comprises four conceptual layers. Each is a separate JSON structure. Together they describe a complete data collection instrument.

```
┌─────────────────────────────────────────────────┐
│                  IDENTITY                        │
│  Canonical URL · version · status · derivedFrom  │
├─────────────────────────────────────────────────┤
│                  INSTANCE                        │
│  Field tree · types · defaults · repeatable      │
│  groups · choice lists · pre-population sources  │
├─────────────────────────────────────────────────┤
│                    BIND                          │
│  calculate · relevant · required · readonly ·    │
│  constraint · validation shapes                  │
├─────────────────────────────────────────────────┤
│               PRESENTATION HINTS                 │
│  Labels · help text · display labels ·           │
│  ordering · grouping (optional layer)            │
└─────────────────────────────────────────────────┘
```

**Identity** defines *what this form is* — its globally unique identifier, version, lifecycle status, and relationships to other definitions.

**Instance** defines *what data exists* — a tree of typed fields, repeatable groups, choice option sets, and default values. This is the data schema.

**Bind** defines *how data behaves* — reactive expressions that calculate values, control visibility, enforce required-ness, set read-only state, and constrain validity. Binds reference instance fields by path.

**Presentation Hints** define *how data should be labeled* — human-readable names, descriptions, help text, and alternative display labels for different contexts. This layer is optional; a form without presentation hints is still a valid, processable definition. Layout, navigation, and rendering are explicitly out of scope — those are concerns of the consuming application.

### 1.3 Core Nouns

| Noun | Definition | Analogues |
|------|-----------|-----------|
| **FormDefinition** | The top-level container. A versioned, identifiable form specification. | XForms `model`, FHIR `Questionnaire` |
| **Field** | A single data-collection point with a type, a path in the instance tree, and optional metadata. | XForms instance node + UI control, FHIR `Questionnaire.item` |
| **Group** | A structural container for fields and nested groups. May be repeatable. | XForms `group`/`repeat`, FHIR `item` with `type: "group"` |
| **Bind** | A set of reactive expressions attached to a field or group by path. | XForms `bind` element |
| **Shape** | A composable validation rule with a severity, constraint expression, and structured result template. | SHACL `PropertyShape`, XForms `constraint` MIP |
| **OptionSet** | A named list of permitted values for selection fields. May be inline or referenced. | XForms `itemset`, FHIR `answerValueSet` |
| **Instance** | The runtime data document — a JSON object whose structure mirrors the field tree. | XForms `instance`, FHIR `QuestionnaireResponse` |
| **FormResponse** | A completed (or in-progress) instance pinned to a specific FormDefinition version. | FHIR `QuestionnaireResponse` |
| **ValidationReport** | The structured output of validation — a list of ValidationResult records plus an `isValid` flag. | SHACL `ValidationReport` |
| **ValidationResult** | A single finding — field path, severity, message, constraint ID, offending value, context. | SHACL `ValidationResult` |

### 1.4 Core Verbs

| Verb | Semantics |
|------|-----------|
| **evaluate** | Compute the value of a UEL expression given the current instance state. |
| **recalculate** | Re-evaluate all `calculate` binds in dependency order, updating instance values. |
| **revalidate** | Re-evaluate all `constraint` binds and shapes, producing a new ValidationReport. |
| **refresh relevance** | Re-evaluate all `relevant` binds, marking fields as relevant or non-relevant. |
| **submit** | Serialize the instance, excluding non-relevant data, for external consumption. |
| **assemble** | Resolve modular `$include` references, producing a self-contained FormDefinition. |
| **migrate** | Apply a version migration map to transform a FormResponse from one definition version to another. |

### 1.5 Relationship Between Definition and Response

```
FormDefinition (v2.1.0)          FormResponse
┌──────────────────┐            ┌──────────────────────┐
│ url: ".../sf425"  │◄──────────│ definitionUrl: "..."  │
│ version: "2.1.0"  │           │ definitionVersion:    │
│ fields: [...]     │           │   "2.1.0"             │
│ binds: [...]      │           │ status: "in-progress" │
│ shapes: [...]     │           │ data: { ... }         │
└──────────────────┘            └──────────────────────┘
```

A FormResponse **always** records the `definitionUrl` and `definitionVersion` it was created against. Engines validate responses using the referenced definition version, not the latest version.

---

## 2. Form Identity and Versioning

### 2.1 Canonical Identity

Every FormDefinition is globally identified by a **canonical URL** — a persistent, resolvable-in-principle URI that uniquely names the form across all systems.

```json
{
  "url": "https://grants.gov/forms/sf-425",
  "version": "2.1.0",
  "versionAlgorithm": "semver",
  "name": "sf-425",
  "title": "Federal Financial Report (SF-425)",
  "status": "active",
  "date": "2025-10-01"
}
```

**`url`** (required): The canonical URL. Does not change across versions.  
**`version`** (required): The version string. Interpretation governed by `versionAlgorithm`.  
**`versionAlgorithm`** (default: `"semver"`): One of `"semver"`, `"date"`, `"integer"`, or a custom algorithm URI.  
**`name`** (required): A machine-friendly identifier (ASCII, no spaces). Used in code generation.  
**`title`** (optional): A human-readable display name.  
**`status`** (required): One of `"draft"`, `"active"`, `"retired"`.  
**`date`** (required): The date this version was published (ISO 8601).

### 2.2 Version Semantics

Under `"semver"` (the default):

- **Patch** (2.1.0 → 2.1.1): Cosmetic changes — label text, help text, descriptions. No structural or behavioral changes. Existing responses remain valid.
- **Minor** (2.1.0 → 2.2.0): Additive changes — new optional fields, new option set values, relaxed constraints. Existing responses remain valid but may not exercise new fields.
- **Major** (2.1.0 → 3.0.0): Breaking changes — removed fields, tightened constraints, restructured groups. Existing responses may require migration.

### 2.3 Definition Lifecycle

```
draft ──► active ──► retired
  ▲          │
  └──────────┘  (new draft version created from active)
```

- **draft**: Under development. May change without notice. Should not be used for production data collection.
- **active**: Published and stable. The definition SHOULD NOT change (publish a new version instead). Responses may be collected against active definitions.
- **retired**: No longer recommended for new data collection. Existing responses remain valid and can still be validated against the retired definition.

### 2.4 Derivation and Variants

A FormDefinition may declare that it is derived from another:

```json
{
  "url": "https://grants.gov/forms/sf-425-short",
  "version": "1.0.0",
  "derivedFrom": "https://grants.gov/forms/sf-425|2.1.0",
  "title": "SF-425 Short Form"
}
```

The `derivedFrom` field uses the notation `url|version` to pin to a specific base version. This models the "long form / short form" pattern. The derived definition is a complete, standalone definition — not a diff. The relationship is informational and supports tooling (e.g., showing which fields were omitted from the base).

### 2.5 Response Pinning

A FormResponse records:

```json
{
  "id": "resp-2025-q3-abc123",
  "definitionUrl": "https://grants.gov/forms/sf-425",
  "definitionVersion": "2.1.0",
  "status": "in-progress",
  "subject": { "id": "grant-12345", "type": "Grant" },
  "authored": "2025-11-15T14:30:00Z",
  "data": { }
}
```

Engines MUST use `definitionVersion` (not the latest version) for validation and display. If the referenced version is not available, the engine MUST report an error rather than silently substituting another version.

---

## 3. Instance Schema

The instance schema defines the tree of fields and groups that constitute the form's data structure.

### 3.1 Field Definition

```json
{
  "path": "expenditures.federal_share",
  "type": "decimal",
  "label": "Federal Share of Expenditures",
  "description": "Total federal funds expended during the reporting period.",
  "labels": {
    "column_header": "Federal $",
    "pdf_label": "10a. Federal Share"
  },
  "precision": 2,
  "default": 0,
  "defaultWhenExcluded": null
}
```

**`path`** (required): A dot-delimited path uniquely identifying this field within the instance tree. Within repeatable groups, the path represents the *template*; runtime instances are indexed (see §5).

**`type`** (required): One of the core types (§3.2) or an extension type URI.

**`label`** (recommended): The primary human-readable label.

**`description`** (optional): Extended help text or instructions.

**`labels`** (optional): A map of alternative display labels keyed by context name. Consuming applications choose which label to display based on their context (table column, PDF, screen reader, etc.).

**`precision`** (optional, numeric types): Number of decimal places.

**`default`** (optional): The initial value when the field is first created.

**`defaultWhenExcluded`** (optional): The value to use when this field becomes non-relevant (see §4.3). Defaults to `null` (field is omitted from submitted data).

### 3.2 Core Field Types

| Type | JSON Value Type | Description |
|------|----------------|-------------|
| `string` | string | Free-text, single line |
| `text` | string | Narrative / multi-line text |
| `integer` | number | Whole number |
| `decimal` | number | Decimal number with optional precision |
| `boolean` | boolean | True/false |
| `date` | string (ISO 8601 date) | Calendar date |
| `dateTime` | string (ISO 8601 datetime) | Date and time |
| `time` | string (ISO 8601 time) | Time of day |
| `select` | string | Single selection from an option set |
| `multiSelect` | array of strings | Multiple selections from an option set |
| `currency` | number | Monetary amount (precision and currency via field metadata) |
| `attachment` | object | File reference `{ "filename", "mediaType", "url", "size" }` |
| `uri` | string | A URI/URL |
| `email` | string | Email address |

Extension types are URIs (e.g., `"urn:ext:geo-coordinate"`) and MUST be registered in the definition's `extensions` block (see §8).

### 3.3 Groups

Groups organize fields into logical sections and enable repeatability.

```json
{
  "path": "budget_lines",
  "type": "group",
  "repeatable": true,
  "minRepeat": 1,
  "maxRepeat": 50,
  "label": "Budget Line Items",
  "fields": [
    { "path": "budget_lines[].category", "type": "select", "label": "Cost Category", ... },
    { "path": "budget_lines[].budgeted", "type": "currency", "label": "Budgeted Amount", ... },
    { "path": "budget_lines[].expended", "type": "currency", "label": "Expended Amount", ... },
    { "path": "budget_lines[].balance", "type": "currency", "label": "Balance", ... }
  ]
}
```

**`repeatable`** (default: `false`): When `true`, the group may be instantiated zero or more times at runtime, producing an array in the instance data.

**`minRepeat`** / **`maxRepeat`** (optional): Cardinality constraints on repeatable groups.

**`fields`** (required): The ordered list of child fields and nested groups.

Within a repeatable group, field paths use `[]` to denote the array position: `budget_lines[].category`. At runtime, the bracket resolves to an index: `budget_lines[0].category`, `budget_lines[1].category`, etc.

### 3.4 Option Sets

```json
{
  "optionSets": {
    "cost_categories": {
      "options": [
        { "value": "personnel", "label": "Personnel" },
        { "value": "fringe", "label": "Fringe Benefits" },
        { "value": "travel", "label": "Travel" },
        { "value": "equipment", "label": "Equipment" },
        { "value": "supplies", "label": "Supplies" },
        { "value": "contractual", "label": "Contractual" },
        { "value": "other", "label": "Other" }
      ]
    },
    "yes_no_na": {
      "options": [
        { "value": "yes", "label": "Yes" },
        { "value": "no", "label": "No" },
        { "value": "na", "label": "Not Applicable" }
      ]
    }
  }
}
```

A `select` or `multiSelect` field references an option set by name:

```json
{ "path": "budget_lines[].category", "type": "select", "optionSet": "cost_categories" }
```

Option sets may also reference an external URI for dynamic loading:

```json
{
  "optionSets": {
    "agency_list": {
      "source": "https://api.sam.gov/agencies",
      "valueField": "code",
      "labelField": "name"
    }
  }
}
```

### 3.5 Pre-Population Sources

Fields may declare external data sources for pre-population:

```json
{
  "path": "award_amount",
  "type": "currency",
  "prePopulate": {
    "source": "https://grants.gov/api/awards/{award_id}",
    "field": "total_amount",
    "editable": false
  }
}
```

**`source`**: A URI template. Parameters in `{braces}` are resolved from context (other field values, environment variables).

**`field`**: The JSON path within the source response to extract the value.

**`editable`** (default: `true`): When `false`, the pre-populated value is locked — the user cannot modify it. The bind layer may independently set `readonly`, but `prePopulate.editable: false` is a stronger signal that the value is authoritative.

### 3.6 Secondary Instances

A FormDefinition may declare named secondary data sources — analogous to XForms' multiple instances — that expressions can reference:

```json
{
  "secondaryInstances": {
    "prior_year": {
      "source": "https://grants.gov/api/responses/{prior_response_id}",
      "description": "Prior-year submission for year-over-year comparison"
    },
    "lookup_rates": {
      "inline": {
        "indirect_rate": 0.52,
        "fringe_rate": 0.35
      }
    }
  }
}
```

Expressions reference secondary instances with the `$instances` prefix: `$instances.prior_year.expenditures.federal_share`.

---

## 4. Binds

Binds attach reactive behavior to fields and groups. Each bind references a field path and declares one or more **Model Item Properties (MIPs)** — expressions that are re-evaluated whenever their dependencies change.

### 4.1 Bind Structure

```json
{
  "binds": [
    {
      "path": "budget_lines[].balance",
      "calculate": "budget_lines[].budgeted - budget_lines[].expended",
      "readonly": true
    },
    {
      "path": "indirect_costs",
      "calculate": "direct_costs * $instances.lookup_rates.indirect_rate"
    },
    {
      "path": "section_b",
      "relevant": "reporting_type = 'annual'",
      "requiredFields": ["section_b.narrative", "section_b.objectives_met"]
    },
    {
      "path": "budget_lines[].expended",
      "required": true,
      "constraint": {
        "expression": ". >= 0",
        "message": "Expended amount cannot be negative."
      }
    }
  ]
}
```

### 4.2 Model Item Properties (MIPs)

| MIP | Type | Semantics |
|-----|------|-----------|
| **`calculate`** | UEL expression → value | Sets the field's value to the expression result. Calculated fields are implicitly readonly unless overridden. |
| **`relevant`** | UEL expression → boolean | When `false`, the field/group is non-relevant: hidden from display, excluded from submission, and its validation rules are suspended. |
| **`required`** | UEL expression → boolean, or literal `true`/`false` | When `true`, the field must have a non-null, non-empty value for the form to be valid (at error severity). May be a dynamic expression: `"required": "reporting_type = 'final'"`. |
| **`readonly`** | UEL expression → boolean | When `true`, the field's value cannot be changed by the user. Calculated fields are implicitly readonly. |
| **`constraint`** | Shape reference or inline shape | A validation rule applied to this field. See §6 for full shape semantics. |

### 4.3 Non-Relevant Data Exclusion

When a bind's `relevant` expression evaluates to `false`:

1. The field or group is **non-relevant**.
2. Non-relevant fields are **excluded from submitted data** — they do not appear in the serialized instance.
3. All validation rules (required, constraint, shapes) on non-relevant fields are **suspended** — they cannot produce validation results.
4. If the field has a `defaultWhenExcluded` value, that value is used in any expressions that reference the field. If no `defaultWhenExcluded` is declared, the field's value is treated as `null` in expressions.
5. Non-relevant fields **retain their last value in memory** — if the field becomes relevant again, its previous value is restored.

This is a direct adoption of XForms' non-relevant semantics, which solve the common problem of "hidden fields failing validation."

### 4.4 The Reactive Dependency Graph

All MIP expressions are analyzed to build a **dependency graph**. When a field value changes, only the binds that transitively depend on that field are re-evaluated — not the entire form.

**Algorithm:**

1. Parse each MIP expression to extract field path references.
2. Build a directed acyclic graph (DAG) where edges point from referenced fields to the binds that reference them.
3. If the graph contains a cycle, the engine MUST report a `cycle-detected` error at definition load time.
4. When field `F` changes, compute the **pertinent dependency subgraph** — all binds reachable from `F` — and re-evaluate them in topological order.
5. Re-evaluation order: `calculate` first (values must be current), then `relevant` (visibility may change), then `required` and `readonly`, then `constraint` (validation depends on final values and relevance).

This is adapted from XForms Appendix C (Recalculation Sequence Algorithm), simplified for JSON paths instead of XPath node-sets.

### 4.5 Repeat Context in Binds

Within a repeatable group, bind expressions use **relative paths** that resolve within the current repeat iteration:

```json
{
  "path": "budget_lines[].balance",
  "calculate": "budget_lines[].budgeted - budget_lines[].expended"
}
```

When this bind is evaluated for `budget_lines[2]`, the expression resolves to `budget_lines[2].budgeted - budget_lines[2].expended`. The `[]` notation means "the current iteration."

To reference across iterations or aggregate over all iterations, use explicit indexing or aggregate functions:

```json
{
  "path": "total_expended",
  "calculate": "sum(budget_lines[*].expended)"
}
```

`[*]` means "all iterations" and is valid only inside aggregate functions (`sum`, `count`, `min`, `max`, `avg`).

---

## 5. Expression Language (UEL)

UDF defines the **Universal Expression Language (UEL)** — a small, deterministic, side-effect-free expression language designed to be implementable in any programming language. UEL is not JavaScript. It is not XPath. It is a purpose-built language for form logic.

### 5.1 Design Goals

1. **Portable**: No host-language dependencies. Evaluable in JavaScript, Python, Java, Rust, Go, C#, or any language.
2. **Deterministic**: Same inputs always produce the same outputs. No random, no I/O, no mutation.
3. **Safe**: No loops, no recursion, no unbounded computation. Every expression terminates.
4. **Readable**: Syntax familiar to spreadsheet users and non-programmers.

### 5.2 Lexical Elements

**Literals:**
- Numbers: `42`, `3.14`, `-7`
- Strings: `'hello'`, `"hello"` (single or double quotes)
- Booleans: `true`, `false`
- Null: `null`
- Dates: `@2025-01-15` (date literal prefix)
- DateTimes: `@2025-01-15T14:30:00Z`

**Identifiers / Field References:**
- Simple: `field_name`
- Dotted path: `section.field_name`
- Repeat current: `group[].field` (resolves to current iteration)
- Repeat indexed: `group[0].field` (explicit index)
- Repeat wildcard: `group[*].field` (all iterations — only in aggregates)
- Secondary instance: `$instances.name.path`
- Self reference: `.` (the value of the field this bind is attached to)

**Operators (precedence high to low):**

| Precedence | Operators | Description |
|-----------|-----------|-------------|
| 1 | `(` `)` | Grouping |
| 2 | `-` (unary), `not` | Negation, logical NOT |
| 3 | `*`, `/`, `mod` | Multiplication, division, modulo |
| 4 | `+`, `-` | Addition, subtraction |
| 5 | `&` | String concatenation |
| 6 | `=`, `!=`, `<`, `>`, `<=`, `>=` | Comparison |
| 7 | `and` | Logical AND |
| 8 | `or` | Logical OR |

**Conditional:**
```
if(condition, then_value, else_value)
```

### 5.3 Type Coercion Rules

UEL is weakly typed with explicit coercion rules. These rules are exhaustive — implementations MUST follow them, not invent their own.

| From | To | Rule |
|------|----|------|
| `null` | number | `0` |
| `null` | string | `""` |
| `null` | boolean | `false` |
| `""` (empty string) | number | `0` |
| `""` (empty string) | boolean | `false` |
| string (numeric) | number | Parse as number. If parsing fails, `NaN`. |
| string (non-empty) | boolean | `true` |
| number `0` | boolean | `false` |
| number (non-zero) | boolean | `true` |
| boolean `true` | number | `1` |
| boolean `false` | number | `0` |
| boolean `true` | string | `"true"` |
| boolean `false` | string | `"false"` |

**NaN propagation:** Any arithmetic operation involving `NaN` produces `NaN`. `NaN = NaN` is `false`. `NaN != NaN` is `true`. The function `isNaN(x)` tests for NaN.

**Null propagation in comparisons:** `null = null` is `true`. `null = ""` is `false`. `null < 5` is `true` (null coerces to 0). Engines SHOULD warn when null comparisons may produce surprising results.

### 5.4 Built-in Functions

#### Aggregate Functions
| Function | Signature | Description |
|----------|----------|-------------|
| `sum(values)` | array → number | Sum of numeric values. Ignores nulls. |
| `count(values)` | array → number | Count of non-null values. |
| `avg(values)` | array → number | Arithmetic mean. Ignores nulls. |
| `min(values)` | array → number/date | Minimum value. |
| `max(values)` | array → number/date | Maximum value. |
| `countWhere(values, expr)` | array, bool-expr → number | Count of items where expression is true. |

#### Numeric Functions
| Function | Signature | Description |
|----------|----------|-------------|
| `round(n, places)` | number, int → number | Round to `places` decimal places. |
| `floor(n)` | number → number | Round down. |
| `ceil(n)` | number → number | Round up. |
| `abs(n)` | number → number | Absolute value. |
| `power(base, exp)` | number, number → number | Exponentiation. |

#### String Functions
| Function | Signature | Description |
|----------|----------|-------------|
| `length(s)` | string → number | Character count. |
| `contains(s, sub)` | string, string → boolean | Substring test. |
| `startsWith(s, pre)` | string, string → boolean | Prefix test. |
| `endsWith(s, suf)` | string, string → boolean | Suffix test. |
| `upper(s)` | string → string | Uppercase. |
| `lower(s)` | string → string | Lowercase. |
| `trim(s)` | string → string | Strip whitespace. |
| `replace(s, find, rep)` | string × 3 → string | String replacement. |
| `substr(s, start, len)` | string, int, int → string | Substring extraction. |
| `format(template, ...)` | string, any... → string | String interpolation: `format('{0} of {1}', a, b)`. |
| `matches(s, pattern)` | string, string → boolean | Regex match (ECMA-262 subset). |

#### Date Functions
| Function | Signature | Description |
|----------|----------|-------------|
| `today()` | → date | Current date (evaluation-time). |
| `now()` | → dateTime | Current datetime (evaluation-time). |
| `daysBetween(d1, d2)` | date, date → number | Signed day difference. |
| `monthsBetween(d1, d2)` | date, date → number | Signed month difference. |
| `addDays(d, n)` | date, number → date | Add days. |
| `addMonths(d, n)` | date, number → date | Add months. |
| `year(d)` | date → number | Extract year. |
| `month(d)` | date → number | Extract month (1-12). |
| `day(d)` | date → number | Extract day of month. |

#### Logic and Utility
| Function | Signature | Description |
|----------|----------|-------------|
| `if(cond, then, else)` | boolean, any, any → any | Conditional. Both branches are evaluated; engines MAY optimize. |
| `coalesce(a, b, ...)` | any... → any | First non-null argument. |
| `isEmpty(x)` | any → boolean | `true` if null, empty string, or empty array. |
| `isNaN(x)` | any → boolean | `true` if value is NaN. |
| `selected(field, value)` | multiSelect, string → boolean | `true` if the multi-select field includes the given value. |
| `instanceOf(field, type)` | any, string → boolean | Runtime type check. |
| `index()` | → number | Current repeat iteration index (0-based). Available only within repeat context. |

#### Cross-Form References
| Function | Signature | Description |
|----------|----------|-------------|
| `prior(path)` | string → any | Value of `path` from the `prior_year` secondary instance. Shorthand for `$instances.prior_year.{path}`. |
| `external(instanceName, path)` | string, string → any | Value from a named secondary instance. |

### 5.5 Expression Grammar (EBNF)

```ebnf
expression     = or_expr ;
or_expr        = and_expr { "or" and_expr } ;
and_expr       = comparison { "and" comparison } ;
comparison     = addition { comp_op addition } ;
comp_op        = "=" | "!=" | "<" | ">" | "<=" | ">=" ;
addition       = multiplication { add_op multiplication } ;
add_op         = "+" | "-" | "&" ;
multiplication = unary { mul_op unary } ;
mul_op         = "*" | "/" | "mod" ;
unary          = [ "-" | "not" ] primary ;
primary        = literal | field_ref | function_call | "(" expression ")" ;

literal        = number | string | boolean | null | date_literal ;
number         = [ "-" ] digit { digit } [ "." digit { digit } ] ;
string         = "'" { char } "'" | '"' { char } '"' ;
boolean        = "true" | "false" ;
null           = "null" ;
date_literal   = "@" iso_date [ "T" iso_time ] ;

field_ref      = [ "$instances." ident "." ] path_segment { "." path_segment } | "." ;
path_segment   = ident [ "[" [ index | "*" ] "]" ] ;
index          = digit { digit } ;
ident          = letter { letter | digit | "_" } ;

function_call  = ident "(" [ expression { "," expression } ] ")" ;
```

### 5.6 Expression Context

Every expression is evaluated within a **context** that provides:

1. **The primary instance** — the current form data.
2. **The bind target path** — the field this bind is attached to, accessible as `.`.
3. **The repeat index** — if inside a repeat, the current iteration index.
4. **Secondary instances** — named data sources accessible via `$instances`.
5. **The evaluation timestamp** — for `today()` and `now()`. Fixed for the duration of a single recalculation pass.

---

## 6. Validation Semantics

### 6.1 Shapes: Composable Validation Rules

A **Shape** is a named, reusable validation rule. Shapes are the primary unit of validation in UDF, inspired by SHACL's constraint model.

```json
{
  "shapes": [
    {
      "id": "budget-balance-check",
      "path": "total_expended",
      "severity": "error",
      "constraint": "total_expended <= award_amount",
      "message": "Total expenditures ({total_expended}) cannot exceed award amount ({award_amount}).",
      "code": "BUDGET_EXCEEDS_AWARD"
    },
    {
      "id": "yoy-change-warning",
      "path": "expenditures.federal_share",
      "severity": "warning",
      "constraint": "abs(. - prior(expenditures.federal_share)) / coalesce(prior(expenditures.federal_share), 1) <= 0.25",
      "message": "Federal share changed by more than 25% from prior year. Please verify.",
      "code": "YOY_CHANGE_EXCEEDS_THRESHOLD"
    }
  ]
}
```

### 6.2 Shape Properties

| Property | Required | Description |
|----------|---------|-------------|
| `id` | Yes | Unique identifier within the definition. |
| `path` | Yes | The field or group path this shape validates. Use `"$form"` for form-level shapes. |
| `severity` | Yes | `"error"`, `"warning"`, or `"info"`. |
| `constraint` | Yes | A UEL expression that must evaluate to `true` for the shape to pass. |
| `message` | Yes | Human-readable message. May contain `{field_path}` interpolation tokens that resolve to current values. |
| `code` | Recommended | Machine-readable error code. Stable across versions for programmatic handling. |
| `context` | Optional | A map of additional data to include in the ValidationResult (for programmatic consumers). |
| `when` | Optional | A UEL expression — if present, the shape is only evaluated when this condition is true. |
| `validationMode` | Optional | Controls when this shape is evaluated. See §6.5. |

### 6.3 Constraint Composition

Shapes may compose constraints using logical operators:

```json
{
  "id": "date-range-check",
  "path": "reporting_period",
  "severity": "error",
  "constraint": {
    "and": [
      "reporting_period.start_date <= reporting_period.end_date",
      "daysBetween(reporting_period.start_date, reporting_period.end_date) <= 366"
    ]
  },
  "message": "Reporting period must not exceed one year and start must precede end."
}
```

Supported composition operators (from SHACL):

| Operator | Semantics |
|----------|-----------|
| `and` | All constraints must pass. |
| `or` | At least one constraint must pass. |
| `not` | The constraint must fail (logical inversion). |
| `xone` | Exactly one constraint must pass (exclusive or). |

### 6.4 Severity Semantics

| Severity | Semantics | Effect on `isValid` |
|----------|-----------|-------------------|
| `error` | The data is invalid. Submission SHOULD be blocked. | `false` |
| `warning` | The data is suspicious but permitted. Review recommended. | No effect (still `true`) |
| `info` | Informational message. No action required. | No effect (still `true`) |

**`isValid`** is `true` if and only if there are zero results with severity `error`.

### 6.5 Validation Modes

Not all rules should fire all the time. A `validationMode` controls *when* a shape is evaluated:

| Mode | Fires When | Use Case |
|------|-----------|----------|
| `"onChange"` (default) | After any value change that affects the shape's dependencies. | Real-time field-level feedback. |
| `"onBlur"` | When the user leaves the field (UI hint — engines without this concept treat as `onChange`). | Expensive validations. |
| `"onSubmit"` | Only when the form is explicitly submitted. | Cross-section totals, final checks. |
| `"onDemand"` | Only when explicitly triggered by the consuming application. | External API validations. |

Engines MUST support all modes. Engines that lack a concept of "blur" (e.g., API-only validators) MUST treat `onBlur` as `onChange`.

**Saving incomplete data:** Regardless of validation mode, engines MUST allow saving the current instance state at any time. Validation modes control when results are *computed and displayed*, not when data can be *persisted*. This directly addresses the requirement that incomplete sections are never blocked by validation.

### 6.6 Non-Relevant Field Handling

When a field is non-relevant (its `relevant` bind evaluates to `false`):

1. All shapes targeting that field are **suspended** — they produce no results.
2. The field's `required` MIP is **suspended** — a non-relevant field cannot be required.
3. If a form-level or group-level shape references a non-relevant field, the non-relevant field's value is treated according to its `defaultWhenExcluded` (or `null`).

### 6.7 The ValidationReport

```json
{
  "isValid": false,
  "timestamp": "2025-11-15T14:32:00Z",
  "counts": { "error": 2, "warning": 1, "info": 0 },
  "results": [
    {
      "path": "budget_lines[2].expended",
      "severity": "error",
      "message": "Expended amount cannot be negative.",
      "code": "FIELD_CONSTRAINT_FAILED",
      "shapeId": null,
      "constraintComponent": "field-constraint",
      "value": -500.00
    },
    {
      "path": "total_expended",
      "severity": "error",
      "message": "Total expenditures ($125,000) cannot exceed award amount ($100,000).",
      "code": "BUDGET_EXCEEDS_AWARD",
      "shapeId": "budget-balance-check",
      "constraintComponent": "shape",
      "value": 125000.00,
      "context": {
        "award_amount": 100000.00
      }
    },
    {
      "path": "expenditures.federal_share",
      "severity": "warning",
      "message": "Federal share changed by more than 25% from prior year. Please verify.",
      "code": "YOY_CHANGE_EXCEEDS_THRESHOLD",
      "shapeId": "yoy-change-warning",
      "constraintComponent": "shape",
      "value": 95000.00,
      "context": {
        "prior_value": 50000.00,
        "percent_change": 0.90
      }
    }
  ]
}
```

### 6.8 ValidationResult Properties

| Property | Required | Description |
|----------|---------|-------------|
| `path` | Yes | Dot-notation path to the field. For repeat fields, includes the index: `budget_lines[2].expended`. |
| `severity` | Yes | `"error"`, `"warning"`, or `"info"`. |
| `message` | Yes | Human-readable message with values interpolated. |
| `code` | Yes | Machine-readable code. Either from the shape's `code` or a built-in code (see §6.9). |
| `shapeId` | No | The `id` of the shape that produced this result, or `null` for built-in constraints. |
| `constraintComponent` | Yes | The type of constraint: `"required"`, `"type"`, `"field-constraint"`, `"shape"`, `"external"`. |
| `value` | No | The offending value at the time of validation. |
| `context` | No | Additional structured data for programmatic consumers. |

### 6.9 Built-in Constraint Codes

| Code | Component | Description |
|------|-----------|-------------|
| `REQUIRED` | `required` | A required field is empty or null. |
| `TYPE_MISMATCH` | `type` | The value does not match the declared field type. |
| `MIN_REPEAT` | `minRepeat` | A repeatable group has fewer iterations than `minRepeat`. |
| `MAX_REPEAT` | `maxRepeat` | A repeatable group has more iterations than `maxRepeat`. |
| `FIELD_CONSTRAINT_FAILED` | `field-constraint` | An inline `constraint` on a bind failed. |
| `SHAPE_FAILED` | `shape` | A named shape's constraint expression returned false. |
| `EXTERNAL_VALIDATION_FAILED` | `external` | An external validation source injected an error. |

### 6.10 External Validation Injection

External systems (API checks, third-party verifiers) can inject results into the validation pipeline. External results use the same ValidationResult structure and are merged into the report:

```json
{
  "path": "duns_number",
  "severity": "error",
  "message": "DUNS number not found in SAM.gov registry.",
  "code": "SAM_LOOKUP_FAILED",
  "shapeId": null,
  "constraintComponent": "external",
  "value": "123456789",
  "context": {
    "source": "sam.gov",
    "checked_at": "2025-11-15T14:31:00Z"
  }
}
```

External results MUST set `constraintComponent` to `"external"`. Engines MUST include external results in the final report and in the `isValid` determination (errors from external sources block submission just like schema-derived errors).

### 6.11 Validation Scope Levels

Shapes can target different scope levels:

| Scope | Path Pattern | Example |
|-------|-------------|---------|
| **Field** | Specific field path | `"path": "budget_lines[].expended"` |
| **Group** | Group path | `"path": "budget_lines"` (validates across rows) |
| **Form** | `"$form"` | `"path": "$form"` (cross-section check) |
| **Cross-Form** | `"$cross"` | `"path": "$cross"` (references secondary instances) |

---

## 7. Composition and Modularity

### 7.1 Includes

A FormDefinition may include fields and groups from other definitions:

```json
{
  "fields": [
    { "$include": "https://grants.gov/forms/common/reporting-period|1.0.0#reporting_period" },
    { "$include": "https://grants.gov/forms/common/recipient-info|1.0.0#recipient" },
    { "path": "expenditures", "type": "group", "fields": [ ... ] }
  ]
}
```

The `$include` value is `canonical-url|version#fragment-path`. The fragment identifies which field or group to include.

### 7.2 Assembly

Before a FormDefinition is evaluated, all `$include` references MUST be resolved, producing a **self-contained assembled definition**. The assembled definition records its source:

```json
{
  "assembledFrom": [
    "https://grants.gov/forms/common/reporting-period|1.0.0",
    "https://grants.gov/forms/common/recipient-info|1.0.0"
  ]
}
```

Assembly is analogous to FHIR SDC's `$assemble` operation. Engines MAY cache assembled definitions.

### 7.3 Screener Routing

A FormDefinition may include a **screener** — a set of questions that route users to the appropriate form variant:

```json
{
  "screener": {
    "fields": [
      {
        "path": "$screener.total_award",
        "type": "currency",
        "label": "What is your total award amount?"
      },
      {
        "path": "$screener.reporting_frequency",
        "type": "select",
        "label": "Reporting frequency?",
        "optionSet": "reporting_frequencies"
      }
    ],
    "routes": [
      {
        "condition": "$screener.total_award < 250000 and $screener.reporting_frequency = 'annual'",
        "target": "https://grants.gov/forms/sf-425-short|1.0.0"
      },
      {
        "condition": "true",
        "target": "https://grants.gov/forms/sf-425|2.1.0"
      }
    ]
  }
}
```

Routes are evaluated in order; the first matching condition wins. The `"true"` condition acts as a default/fallback.

---

## 8. Extension Points

### 8.1 Custom Field Types

```json
{
  "extensions": {
    "fieldTypes": {
      "urn:ext:geo-coordinate": {
        "label": "Geographic Coordinate",
        "jsonType": "object",
        "schema": {
          "latitude": "decimal",
          "longitude": "decimal"
        },
        "validate": "urn:ext:validators:geo-coordinate"
      }
    }
  }
}
```

Custom field types declare their JSON representation and may reference a custom validator. Engines that encounter an unknown extension type MUST treat the field as opaque (store and return the value) but MAY skip type-specific validation.

### 8.2 Custom Expression Functions

```json
{
  "extensions": {
    "functions": {
      "urn:ext:fn:calculateIndirectCost": {
        "label": "Calculate Indirect Cost",
        "params": ["directCost", "rate", "base"],
        "returns": "decimal",
        "implementation": "urn:ext:impl:indirect-cost-calculator"
      }
    }
  }
}
```

Custom functions are declared in the definition and resolved by the engine at runtime. The `implementation` URI points to an engine-specific implementation. Engines that do not have the implementation MUST report an `unsupported-extension` error.

### 8.3 Custom Constraint Components

```json
{
  "extensions": {
    "constraintComponents": {
      "urn:ext:constraint:ein-format": {
        "label": "EIN Format Check",
        "constraint": "matches(., '^\\d{2}-\\d{7}$')",
        "message": "Value must be a valid EIN (XX-XXXXXXX format).",
        "code": "INVALID_EIN_FORMAT"
      }
    }
  }
}
```

Custom constraint components are reusable shapes that can be referenced by field type or explicitly in binds. When the constraint is a UEL expression (not an external validator), it is portable across all engines.

### 8.4 Extension Namespacing

All extension identifiers use URIs to avoid collisions. Engines MUST ignore extensions they do not recognize (unless the extension is declared as `"mustUnderstand": true`, in which case the engine MUST report an error if it cannot process the extension).

---

## 9. Hard Cases — Worked Examples

### 9.1 Budget Line Items with Calculated Subtotals and Cross-Row Total

**Scenario:** A budget form with repeatable line items. Each row has budgeted and expended amounts. The balance is calculated per row. A grand total sums all rows and must not exceed a pre-populated award amount.

```json
{
  "url": "https://example.gov/forms/budget-report",
  "version": "1.0.0",
  "status": "active",

  "fields": [
    {
      "path": "award_amount",
      "type": "currency",
      "label": "Total Award Amount",
      "prePopulate": {
        "source": "https://api.example.gov/awards/{award_id}",
        "field": "amount",
        "editable": false
      }
    },
    {
      "path": "budget_lines",
      "type": "group",
      "repeatable": true,
      "minRepeat": 1,
      "maxRepeat": 20,
      "label": "Budget Line Items",
      "fields": [
        { "path": "budget_lines[].category", "type": "select", "optionSet": "cost_categories", "label": "Category" },
        { "path": "budget_lines[].budgeted", "type": "currency", "label": "Budgeted", "default": 0 },
        { "path": "budget_lines[].expended", "type": "currency", "label": "Expended", "default": 0 },
        { "path": "budget_lines[].balance", "type": "currency", "label": "Balance" }
      ]
    },
    { "path": "total_budgeted", "type": "currency", "label": "Total Budgeted" },
    { "path": "total_expended", "type": "currency", "label": "Total Expended" },
    { "path": "total_balance", "type": "currency", "label": "Total Balance" }
  ],

  "binds": [
    {
      "path": "budget_lines[].balance",
      "calculate": "budget_lines[].budgeted - budget_lines[].expended",
      "readonly": true
    },
    { "path": "total_budgeted", "calculate": "sum(budget_lines[*].budgeted)", "readonly": true },
    { "path": "total_expended", "calculate": "sum(budget_lines[*].expended)", "readonly": true },
    { "path": "total_balance", "calculate": "total_budgeted - total_expended", "readonly": true },
    {
      "path": "budget_lines[].expended",
      "required": true,
      "constraint": {
        "expression": ". >= 0",
        "message": "Expended amount cannot be negative."
      }
    }
  ],

  "shapes": [
    {
      "id": "budget-total-check",
      "path": "total_expended",
      "severity": "error",
      "constraint": "total_expended <= award_amount",
      "message": "Total expenditures (${total_expended}) exceed award amount (${award_amount}).",
      "code": "BUDGET_EXCEEDS_AWARD",
      "validationMode": "onSubmit"
    }
  ]
}
```

**What happens at runtime:**

1. `award_amount` is pre-populated and locked.
2. User adds budget lines. Each row's `balance` auto-calculates.
3. Footer totals auto-calculate from all rows via `sum(budget_lines[*].expended)`.
4. On submit, the `budget-total-check` shape fires — if total exceeds award, submission is blocked.

### 9.2 Conditional Section with Dependent Required Fields

**Scenario:** Section B only appears for annual reports. When visible, its narrative field is required.

```json
{
  "fields": [
    {
      "path": "reporting_type",
      "type": "select",
      "optionSet": "reporting_types",
      "label": "Reporting Type"
    },
    {
      "path": "section_b",
      "type": "group",
      "label": "Section B — Program Outcomes",
      "fields": [
        { "path": "section_b.narrative", "type": "text", "label": "Describe program outcomes" },
        { "path": "section_b.objectives_met", "type": "select", "optionSet": "yes_no_na", "label": "Were all objectives met?" }
      ]
    }
  ],

  "binds": [
    {
      "path": "section_b",
      "relevant": "reporting_type = 'annual'"
    },
    {
      "path": "section_b.narrative",
      "required": true
    },
    {
      "path": "section_b.objectives_met",
      "required": true
    }
  ]
}
```

**What happens:**

1. User selects "Quarterly" → `section_b` is non-relevant → hidden, excluded from submission, `required` on children is suspended.
2. User changes to "Annual" → `section_b` becomes relevant → appears, `required` rules activate, previously entered values (if any) are restored.

### 9.3 Year-over-Year Change Warning

**Scenario:** Flag when federal expenditures change by more than 25% from prior year.

```json
{
  "secondaryInstances": {
    "prior_year": {
      "source": "https://api.example.gov/responses/{prior_response_id}",
      "description": "Prior-year SF-425 submission"
    }
  },

  "shapes": [
    {
      "id": "yoy-federal-share",
      "path": "expenditures.federal_share",
      "severity": "warning",
      "when": "$instances.prior_year != null",
      "constraint": "abs(. - prior(expenditures.federal_share)) / max(prior(expenditures.federal_share), 1) <= 0.25",
      "message": "Federal share changed by {format('{0:.0%}', abs(. - prior(expenditures.federal_share)) / max(prior(expenditures.federal_share), 1))} from prior year (${prior(expenditures.federal_share)} → ${.}). Please verify.",
      "code": "YOY_FEDERAL_SHARE_CHANGE"
    }
  ]
}
```

**Key details:**

- The `when` guard ensures the shape only fires if prior-year data is available.
- Severity is `warning` — it does not block submission.
- The denominator uses `max(..., 1)` to avoid division by zero when the prior year value is 0.

### 9.4 Screener Routing to Long vs Short Form

**Scenario:** Small awards with annual reporting get a simplified form.

```json
{
  "url": "https://grants.gov/forms/sf-425-screener",
  "version": "1.0.0",
  "status": "active",
  "title": "SF-425 Form Selector",

  "screener": {
    "fields": [
      {
        "path": "$screener.award_amount",
        "type": "currency",
        "label": "Total federal award amount"
      },
      {
        "path": "$screener.frequency",
        "type": "select",
        "label": "Required reporting frequency",
        "optionSet": "reporting_frequencies"
      }
    ],
    "routes": [
      {
        "condition": "$screener.award_amount < 250000 and $screener.frequency = 'annual'",
        "target": "https://grants.gov/forms/sf-425-short|1.0.0",
        "label": "SF-425 Short Form"
      },
      {
        "condition": "true",
        "target": "https://grants.gov/forms/sf-425|2.1.0",
        "label": "SF-425 Full Form"
      }
    ]
  }
}
```

### 9.5 External Validation Failure Injected Alongside Schema Errors

**Scenario:** The form validates a DUNS number against SAM.gov. The external check returns an error that merges with schema-derived errors.

```json
{
  "validationReport": {
    "isValid": false,
    "timestamp": "2025-11-15T14:32:00Z",
    "counts": { "error": 3, "warning": 0, "info": 1 },
    "results": [
      {
        "path": "recipient.name",
        "severity": "error",
        "message": "Recipient name is required.",
        "code": "REQUIRED",
        "constraintComponent": "required",
        "value": null
      },
      {
        "path": "recipient.ein",
        "severity": "error",
        "message": "Value must be a valid EIN (XX-XXXXXXX format).",
        "code": "INVALID_EIN_FORMAT",
        "constraintComponent": "field-constraint",
        "value": "12345"
      },
      {
        "path": "recipient.duns_number",
        "severity": "error",
        "message": "DUNS number not found in SAM.gov registry.",
        "code": "SAM_LOOKUP_FAILED",
        "constraintComponent": "external",
        "value": "999999999",
        "context": {
          "source": "sam.gov",
          "checked_at": "2025-11-15T14:31:45Z"
        }
      },
      {
        "path": "recipient.duns_number",
        "severity": "info",
        "message": "SAM.gov recommends transitioning to UEI. See sam.gov/transition for details.",
        "code": "UEI_TRANSITION_NOTICE",
        "constraintComponent": "external",
        "value": "999999999"
      }
    ]
  }
}
```

All four results — two schema-derived, two external — coexist in a single report. The `isValid` flag reflects only `error`-severity results. Consuming systems (UI, API, PDF, analytics) can filter by `constraintComponent`, `severity`, or `code` without knowing the validation internals.

### 9.6 Repeatable Rows with Per-Row Validation and Cross-Row Constraint

**Scenario:** Personnel line items where each row must have a non-zero percentage, and all percentages across rows must sum to exactly 100%.

```json
{
  "fields": [
    {
      "path": "personnel",
      "type": "group",
      "repeatable": true,
      "minRepeat": 1,
      "label": "Personnel",
      "fields": [
        { "path": "personnel[].name", "type": "string", "label": "Name" },
        { "path": "personnel[].role", "type": "string", "label": "Role" },
        { "path": "personnel[].percent_effort", "type": "decimal", "label": "% Effort" }
      ]
    },
    { "path": "total_effort", "type": "decimal", "label": "Total % Effort" }
  ],

  "binds": [
    { "path": "total_effort", "calculate": "sum(personnel[*].percent_effort)", "readonly": true },
    {
      "path": "personnel[].percent_effort",
      "required": true,
      "constraint": {
        "expression": ". > 0 and . <= 100",
        "message": "Effort percentage must be between 0 and 100."
      }
    }
  ],

  "shapes": [
    {
      "id": "effort-sum-check",
      "path": "total_effort",
      "severity": "error",
      "constraint": "total_effort = 100",
      "message": "Total effort must equal 100% (currently {total_effort}%).",
      "code": "EFFORT_SUM_MISMATCH",
      "validationMode": "onSubmit"
    }
  ]
}
```

---

## 10. Lineage and Influences

### 10.1 What Came from XForms

| Concept | XForms Origin | UDF Adaptation |
|---------|--------------|----------------|
| Instance/Bind/UI separation | Core architecture | Retained as Instance/Bind/Presentation Hints, with Presentation Hints optional |
| Model Item Properties (MIPs) | `calculate`, `relevant`, `required`, `readonly`, `constraint` | All five MIPs retained with identical semantics |
| Non-relevant data exclusion | `relevant` MIP — non-relevant nodes excluded from submission | Adopted directly. This is the single most under-appreciated feature of XForms. |
| Reactive dependency graph | Appendix C recalculation algorithm | Simplified for JSON paths. DAG construction and topological sort retained. |
| Repeatable sections | `xf:repeat` with `nodeset` binding | `repeatable: true` on groups with `[]` path syntax |
| Secondary instances | Multiple `instance` elements | `secondaryInstances` map with inline or URI sources |
| Expression-based MIPs | XPath expressions in bind attributes | Replaced with UEL (same concept, JSON-friendly syntax) |

### 10.2 What Came from SHACL

| Concept | SHACL Origin | UDF Adaptation |
|---------|-------------|----------------|
| Three severity levels | `sh:Violation`, `sh:Warning`, `sh:Info` | `error`, `warning`, `info` (same semantics, simpler names) |
| Structured validation results | `sh:ValidationResult` with focus node, path, value, message, source shape, component | `ValidationResult` with path, severity, message, code, shapeId, constraintComponent, value, context |
| Constraint composition | `sh:and`, `sh:or`, `sh:not`, `sh:xone` | `and`, `or`, `not`, `xone` in shape constraint objects |
| Shapes as reusable constraint units | Property shapes and node shapes | Named shapes with IDs, referenceable across the definition |
| Separation of constraint definition from execution | Shapes graph vs data graph | FormDefinition (shapes) vs FormResponse (data) are independent resources |

### 10.3 What Came from FHIR R5 / SDC

| Concept | FHIR Origin | UDF Adaptation |
|---------|-------------|----------------|
| Canonical URL + version | `Questionnaire.url` + `Questionnaire.version` | Adopted directly |
| Version algorithm | `Questionnaire.versionAlgorithm` | Adopted directly |
| Status lifecycle | `draft` / `active` / `retired` | Adopted directly |
| Response pinning | `QuestionnaireResponse.questionnaire` references specific version | `FormResponse.definitionVersion` |
| `derivedFrom` | `Questionnaire.derivedFrom` | Adopted directly for form variants |
| Two-tier conditionals | `enableWhen` (simple) + `enableWhenExpression` (complex) | Unified into UEL expressions in `relevant` bind. No need for two tiers — UEL handles both. |
| Modular composition | SDC `subQuestionnaire` + `$assemble` | `$include` + assembly process |
| `disabledDisplay` | hidden vs protected | `defaultWhenExcluded` + the distinction between `relevant: false` (exclude) and `readonly: true` (show but lock) |

### 10.4 What Came from ODK XLSForm

| Concept | ODK Origin | UDF Adaptation |
|---------|-----------|----------------|
| `${field_name}` expression syntax | XLSForm's simple field references | Simplified to bare `field_name` in UEL (no `${}` needed since expressions are in a dedicated context) |
| `.` self-reference | `${.}` in XLSForm calculate columns | Adopted directly |

### 10.5 What Came from SurveyJS

| Concept | SurveyJS Origin | UDF Adaptation |
|---------|----------------|----------------|
| Dependency-tracked expression evaluation | PEG.js expression engine with caching | UEL dependency graph with incremental re-evaluation |
| Validation modes | `validateOnValueChange`, `validateOnComplete` | `validationMode` property on shapes |

### 10.6 What Came from JSON Forms

| Concept | JSON Forms Origin | UDF Adaptation |
|---------|------------------|----------------|
| External error injection | `additionalErrors` API | External validation injection (§6.10) with `constraintComponent: "external"` |

### 10.7 What Came from CommonGrants

| Concept | CommonGrants Origin | UDF Adaptation |
|---------|-------------------|----------------|
| Bidirectional mapping DSL | `field`/`switch`/`const` mapping constructs | Informed the design of `prePopulate` source mappings and screener routing conditions |

### 10.8 What's Original to UDF

| Feature | Why It's New |
|---------|-------------|
| **Unified expression language (UEL)** | XForms used XPath. FHIR uses FHIRPath. ODK uses a custom syntax. None of these are JSON-native or designed for portability across all host languages. UEL is purpose-built for this use case. |
| **`defaultWhenExcluded`** | Neither XForms nor FHIR provides a clean way to specify what value a non-relevant field should have in expressions. XForms just uses empty string; FHIR has no equivalent. UDF makes this explicit. |
| **Machine-readable error codes on all results** | SHACL provides `sourceConstraintComponent` but not application-level error codes. FHIR has `OperationOutcome.issue.code` but not on form validation. UDF requires `code` on every result. |
| **Validation modes as a first-class shape property** | SurveyJS has validation timing but as a global setting. UDF makes it per-shape, allowing different rules to fire at different times. |
| **Screener routing** | No predecessor has a declarative mechanism for routing users to different form variants based on initial answers. This is typically hardcoded. |
| **`$cross` validation scope** | Cross-form validation (comparing against prior-year or sibling submissions) is not addressed by XForms, SHACL, or FHIR. UDF makes it a declared scope. |
| **Presentation Hints as optional layer** | XForms couples labels to UI controls. FHIR embeds `text` in items. UDF makes the entire presentation layer optional — a headless form is a valid form. |
| **`context` map on ValidationResult** | Neither SHACL nor FHIR provides a structured way to pass additional data (e.g., the expected vs actual values) along with a validation result. UDF's `context` enables richer programmatic consumers. |

---

## 11. Conformance

### 11.1 Conformance Levels

**UDF Core** — An engine that supports:
- Parsing and assembling FormDefinitions
- Field types: all core types (§3.2)
- Binds: all five MIPs (§4.2)
- UEL: full expression language (§5)
- Validation: shapes, severity levels, ValidationReport generation (§6)
- Versioning: canonical URL, version, status, response pinning (§2)

**UDF Extended** — UDF Core plus:
- Extension field types (§8.1)
- Extension functions (§8.2)
- Extension constraint components (§8.3)
- Screener routing (§7.3)
- `mustUnderstand` extension processing

### 11.2 Conformance Claims

A conforming UDF engine MUST:

1. Parse any valid FormDefinition without error.
2. Construct the reactive dependency graph and detect cycles.
3. Evaluate all UEL expressions per the semantics in §5.
4. Produce a valid ValidationReport per the structure in §6.7.
5. Exclude non-relevant fields from submitted data.
6. Support all four validation modes (treating `onBlur` as `onChange` if blur is not applicable).
7. Allow saving instance data regardless of validation state.
8. Merge external validation results into the report.

A conforming UDF engine MUST NOT:

1. Silently substitute a different definition version when validating a pinned response.
2. Produce validation results for non-relevant fields.
3. Block data persistence based on validation errors (validation and persistence are independent operations).

### 11.3 Document Conformance

A conforming FormDefinition MUST:

1. Have a valid `url`, `version`, and `status`.
2. Have a valid field tree with no duplicate paths.
3. Have no circular dependencies in bind expressions.
4. Use only declared option sets and extension types.
5. Provide `message` and `code` on all shapes.

---

*End of Specification*

*Universal Declarative Forms (UDF) v0.1.0-draft — Feedback welcome.*