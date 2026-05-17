---
title: Formspec Extension Registry
version: 1.0.0-draft.1
date: 2026-04-09
status: draft
---

# Formspec Extension Registry v1.0

**Version:** 1.0.0-draft.1  
**Date:** 2026-04-09  
**Editors:** Formspec Working Group  
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard  

---

## Abstract

The Formspec Extension Registry specification defines a JSON document format
for publishing, discovering, and validating Formspec extensions and semantic
metadata. A Registry Document enumerates a set of named entries — custom data
types, custom functions, custom constraints, extension properties, extension
namespaces, concept identities, and vocabulary bindings — together with their
metadata, version history, compatibility bounds, and machine-readable schemas.
This specification does not define a runtime service; it defines a static
document format that MAY be served over HTTPS, bundled in a package, or checked
into a repository. By standardizing how extensions and concepts are described
and located, the Registry format enables tool vendors, form authors, data
governance teams, and validation engines to interoperate across organizational
boundaries without out-of-band coordination.

## Status of This Document

This document is a **draft specification**. It is a companion to the Formspec
v1.0 core specification and does not modify or extend the core extension
mechanisms defined in §8 of that specification. Implementors are encouraged to
experiment with this specification and provide feedback, but MUST NOT treat it
as stable for production use until a 1.0.0 release is published.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119]
[RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as
defined in [RFC 3986]. Semver syntax is as defined in [Semantic Versioning
2.0.0][semver].

Terms defined in Formspec v1.0 — *conformant processor*, *Definition document*,
*extension*, *FEL expression* — retain their meanings here.

Additional terms:

- **Registry Document** — A JSON document conforming to this specification.
- **Registry Entry** — A single extension record within a Registry Document.
- **Registry-aware processor** — A conformant Formspec processor that
  additionally understands the Registry Document format and uses it for
  extension discovery and validation.

## Bottom Line Up Front

<!-- bluf:start file=extension-registry.bluf.md -->
- This document defines the registry format for publishing Formspec extension metadata.
- A valid registry document requires `$formspecRegistry`, `publisher`, `published`, and `entries`.
- Registry entries standardize naming, lifecycle, and compatibility bounds for extension interoperability.
- This BLUF is governed by `schemas/registry.schema.json`; generated references are the structural contract.
<!-- bluf:end -->

---

## 1. Purpose and Scope

Formspec v1.0 §8 defines five extension categories and requires all extension
identifiers to carry an `x-` prefix. The core specification deliberately leaves
extension *publication* and *discovery* out of scope. This companion
specification fills that gap by defining:

1. A machine-readable **Registry Entry** format for describing a single
   extension.
2. A **Registry Document** format that collects entries into a publishable
   catalog.
3. **Naming rules** that codify and extend the `x-` prefix conventions.
4. A **discovery mechanism** based on well-known URLs.
5. A **lifecycle model** governing how extensions move from draft to retirement.
6. **Conformance requirements** for registry-aware processors.

This specification does NOT define a centralized registry service, governance
board, or approval process. Any organization MAY publish its own Registry
Document. Interoperability is achieved through the common format, not through
centralized authority.

---

## 2. Registry Document Format

A Registry Document is a JSON object at the top level with the following
properties:

<!-- schema-ref:start id=registry-top-level schema=schemas/registry.schema.json pointers=# -->
<!-- generated:schema-ref id=registry-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecRegistry` | `$formspecRegistry` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Registry specification version. MUST be '1.0'. |
| `#/properties/$schema` | `$schema` | <code>string</code> | no | — | Optional JSON Schema URI for editor validation and autocompletion. |
| `#/properties/entries` | `entries` | <code>array</code> | yes | critical | Array of extension registry entries. Each entry describes one extension with its category, version, compatibility bounds, and category-specific metadata. Within a single document, the (name, version) tuple MUST be unique. |
| `#/properties/extensions` | `extensions` | <code>object</code> | no | — | Registry-level extension properties for vendor-specific metadata. All property keys MUST be x-prefixed. |
| `#/properties/published` | `published` | <code>string</code> | yes | critical | ISO 8601 timestamp indicating when this registry version was published. Used for freshness checks and conditional GET cache validation. |
| `#/properties/publisher` | `publisher` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/Publisher</code>; critical | Organization publishing this registry document. Provides provenance and contact information for all entries unless overridden at the entry level. |
<!-- schema-ref:end -->

The generated table above is the canonical structural contract for Registry
Document top-level properties.

### 2.1 Publisher Object

| Property | Type | Req | Description |
|---|---|---|---|
| `name` | string | REQUIRED | Human-readable organization name. |
| `url` | string (URI) | REQUIRED | Organization home page. |
| `contact` | string | OPTIONAL | Contact email or URI. |

---

## 3. Registry Entry Format

Each element of the `entries` array is a JSON object describing one extension.

| Property | Type | Req | Description |
|---|---|---|---|
| `name` | string | REQUIRED | The `x-`-prefixed extension identifier. |
| `category` | enum | REQUIRED | One of: `"dataType"`, `"function"`, `"constraint"`, `"property"`, `"namespace"`. |
| `version` | string | REQUIRED | Semver version of the extension itself. |
| `status` | enum | REQUIRED | One of: `"draft"`, `"stable"`, `"deprecated"`, `"retired"`. See §6. |
| `publisher` | object | OPTIONAL | Entry-level publisher override. Same schema as §2.1. |
| `description` | string | REQUIRED | Human-readable summary of the extension's purpose. |
| `specUrl` | string (URI) | RECOMMENDED | Link to the full extension documentation. |
| `schemaUrl` | string (URI) | RECOMMENDED | Link to a JSON Schema for the extension's data. |
| `compatibility` | object | REQUIRED | Version compatibility bounds. See §3.1. |
| `license` | string | RECOMMENDED | SPDX license identifier (e.g. `"Apache-2.0"`). |
| `deprecationNotice` | string | CONDITIONAL | Human-readable deprecation message. REQUIRED when `status` is `"deprecated"`. See §6. |
| `examples` | array | OPTIONAL | Array of JSON values demonstrating usage. |
| `extensions` | object | OPTIONAL | Extension properties (all keys `x-`-prefixed). |

### 3.1 Compatibility Object

| Property | Type | Req | Description |
|---|---|---|---|
| `formspecVersion` | string | REQUIRED | Semver range of compatible Formspec versions (e.g. `">=1.0.0 <2.0.0"`). |
| `mappingDslVersion` | string | OPTIONAL | Semver range of compatible Mapping DSL versions, if the extension interacts with mappings. |

### 3.2 Category-Specific Properties

Depending on the value of `category`, additional properties are REQUIRED or
OPTIONAL on the entry object:

**`dataType`** — Custom data type (§8.1 of Formspec v1.0):

| Property | Type | Req | Description |
|---|---|---|---|
| `baseType` | string | REQUIRED | Core type this extends: `string`, `integer`, `decimal`, `boolean`, `date`, `dateTime`, `time`, `uri`. |
| `constraints` | object | OPTIONAL | Default constraint values for this type. |
| `metadata` | object | OPTIONAL | Presentation-layer metadata. |

**`function`** — Custom function (§8.2):

| Property | Type | Req | Description |
|---|---|---|---|
| `parameters` | array | REQUIRED | Array of `{name, type, description?}` objects. |
| `returns` | string | REQUIRED | Core data type name for the return value. |

**`constraint`** — Custom validation constraint (§8.3):

| Property | Type | Req | Description |
|---|---|---|---|
| `parameters` | array | REQUIRED | Array of `{name, type, description?}` objects. |

**`property`** — Extension property (§8.4):

No additional required properties. The `schemaUrl` is RECOMMENDED.

**`namespace`** — Extension namespace (§8.5):

| Property | Type | Req | Description |
|---|---|---|---|
| `members` | array | OPTIONAL | Array of `x-`-prefixed extension names grouped under this namespace. |

**`concept`** — Concept identity (Ontology specification):

| Property | Type | Req | Description |
|---|---|---|---|
| `conceptUri` | string (URI) | REQUIRED | The concept IRI in the external ontology or standard. Globally unique identifier for the concept this entry represents. |
| `conceptSystem` | string (URI) | RECOMMENDED | The ontology or concept system URI (e.g., `https://schema.org`, `https://www.irs.gov/terms`). |
| `conceptCode` | string | OPTIONAL | Short code within the system (e.g., `"EIN"`, `"MR"`). |
| `equivalents` | array | OPTIONAL | Cross-system equivalences. Each element declares `system` (URI, REQUIRED), `code` (string, REQUIRED), `display` (string, OPTIONAL), and `type` (string, OPTIONAL — defaults to `"exact"`). Relationship types follow SKOS semantics: `exact`, `close`, `broader`, `narrower`, `related`. Custom types MUST be `x-`-prefixed. |
| `metadata` | object | OPTIONAL | Descriptive metadata (e.g., `displayName`). |

A field's `semanticType` may reference a concept entry by name. When a
processor encounters a `semanticType` value matching a loaded concept entry's
`name`, it SHOULD resolve the entry and make its concept metadata available
to downstream tooling.

**`vocabulary`** — Vocabulary/terminology binding (Ontology specification):

| Property | Type | Req | Description |
|---|---|---|---|
| `vocabularySystem` | string (URI) | REQUIRED | The terminology system URI (e.g., `http://hl7.org/fhir/sid/icd-10`). |
| `vocabularyVersion` | string | RECOMMENDED | Version of the terminology (e.g., `"2024"`). |
| `filter` | object | OPTIONAL | Subset constraints: `ancestor` (root code), `maxDepth` (integer), `include` (array of codes), `exclude` (array of codes). |
| `metadata` | object | OPTIONAL | Descriptive metadata (e.g., `displayName`). |

Vocabulary entries complement Ontology Document vocabulary bindings by
providing shared, reusable terminology metadata at the registry level.

> **Note:** Unlike extension categories, concept and vocabulary entries MUST
> NOT affect the processing model (§2.4 of Formspec v1.0). They are pure
> metadata consumed by ontology-aware tooling, data science pipelines, and
> interoperability layers.

---

## 4. Naming Rules

This section codifies and extends the naming conventions of Formspec v1.0 §8.
All rules in this section are **normative**.

1. All extension identifiers — type names, function names, constraint names,
   property keys, and namespace keys — MUST start with `x-`.

2. Extension identifiers MUST match the regular expression:
   ```
   ^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$
   ```
   That is: the `x-` prefix, followed by one or more hyphen-separated segments
   of lowercase ASCII letters and digits, each segment beginning with a letter.

3. The prefix `x-formspec-` is **reserved** for extensions that MAY be
   promoted into future versions of the Formspec core specification.
   Third-party publishers MUST NOT register identifiers beginning with
   `x-formspec-`.

4. Within a single Registry Document, the combination of `name` and `version`
   MUST be unique. A Registry Document MUST NOT contain two entries with the
   same `name` and `version`.

5. Across independently published registries, naming conflicts are resolved by
   publisher authority. Organizations SHOULD use the `x-{org}-{domain}` pattern
   (§8.5) to minimize collision risk.

6. Concept entries SHOULD use the prefix `x-onto-` (e.g., `x-onto-ein`,
   `x-onto-birthdate`) and vocabulary entries SHOULD use `x-vocab-` (e.g.,
   `x-vocab-icd10-cm`, `x-vocab-admin-gender`) to distinguish them from
   extension entries by convention. This is advisory; the naming regex is
   unchanged.

---

## 5. Discovery

To support automated discovery, organizations publishing Formspec extensions
SHOULD serve their Registry Document at a well-known URL:

```
https://{host}/.well-known/formspec-extensions.json
```

The following requirements apply:

1. The response MUST have Content-Type `application/json`.

2. The response MUST be a valid Registry Document as defined in §2.

3. Servers SHOULD support conditional GET (`If-None-Match` /
   `If-Modified-Since`) to allow efficient polling.

4. Processors MAY also accept Registry Document URIs from configuration,
   command-line arguments, or Definition-level metadata. The well-known URL
   convention is OPTIONAL and does not preclude other distribution mechanisms.

---

## 6. Extension Lifecycle

Every registry entry declares a `status` that indicates its maturity. The
following lifecycle states and transition rules are **normative**.

```
 ┌───────┐    promote    ┌────────┐    sunset     ┌────────────┐    remove    ┌─────────┐
 │ draft │──────────────▶│ stable │──────────────▶│ deprecated │────────────▶│ retired │
 └───────┘               └────────┘               └────────────┘             └─────────┘
```

| Transition | Rule |
|---|---|
| draft → stable | The publisher asserts the extension's interface is frozen for the given major version. |
| stable → deprecated | The publisher MUST provide a `deprecationNotice` (human-readable string) on the entry explaining why the extension is deprecated. The publisher SHOULD identify a replacement extension if one exists. |
| deprecated → retired | The publisher asserts the extension SHOULD NOT be used and MAY stop supporting it. Processors encountering a `retired` extension SHOULD emit a warning. |
| (any) → draft | A new `version` (with incremented major version) MAY re-enter `draft`. |

Transitions MUST NOT skip states. An extension MUST NOT move directly from
`draft` to `deprecated` or from `stable` to `retired`.

---

## 7. Conformance

A **registry-aware processor** is a conformant Formspec processor (as defined
in Formspec v1.0 §1) that additionally implements the following behaviors:

1. **Loading.** The processor MUST be able to parse a Registry Document and
   validate it against the schema defined in Appendix A.

2. **Resolution.** When a Definition document references an extension
   (custom data type, function, constraint, or namespace), the processor
   SHOULD attempt to locate a matching entry in one or more configured
   Registry Documents by `name` and `category`.

3. **Compatibility check.** If a matching entry is found, the processor MUST
   verify that the current Formspec version satisfies the entry's
   `compatibility.formspecVersion` range. A mismatch MUST produce a warning;
   it SHOULD NOT produce a hard error unless the entry's `extensions` include
   `"x-formspec-strict": true`.

4. **Status enforcement.** If a matching entry has `status` equal to
   `"retired"`, the processor MUST emit a warning. If the entry has `status`
   equal to `"deprecated"`, the processor SHOULD emit an informational notice.

5. **Schema validation.** If the entry provides a `schemaUrl`, the processor
   SHOULD fetch and validate the extension's data in the Definition against
   that schema.

6. **Unresolved extensions.** When an item declares an enabled extension
   (i.e. `"extensions": { "x-example": true }`) and the processor cannot
   locate a matching registry entry, the processor MUST emit an error with
   code `UNRESOLVED_EXTENSION`. This applies regardless of the extension's
   intended category, because without the registry entry the processor
   cannot determine the extension's semantics. Disabled extensions
   (`"x-example": false`) MUST NOT trigger this error.

7. **Concept resolution.** When a Definition field's `semanticType` matches
   the `name` of a loaded registry entry with `category: "concept"`, the
   processor SHOULD resolve the entry and make its concept metadata (URI,
   equivalents, display) available to downstream tooling. An unresolved
   `semanticType` that does not match any loaded concept entry is NOT an
   error — `semanticType` remains a freeform string for processors that do
   not support concept resolution.

8. **Vocabulary resolution.** Vocabulary entries provide shared terminology
   metadata that complements Ontology Document vocabulary bindings. When an
   Ontology Document vocabulary binding references a `system` that matches a
   loaded vocabulary registry entry's `vocabularySystem`, the registry entry
   MAY provide default version and filter metadata. The Ontology Document's
   values take precedence when both are present.

---

## 8. Examples

### 8.1 Registry Document with Two Entries

```json
{
  "$formspecRegistry": "1.0",
  "$schema": "https://formspec.org/schemas/registry/v1.0/registry.json",
  "publisher": {
    "name": "Federal Grants Commission",
    "url": "https://grants.gov",
    "contact": "formspec@grants.gov"
  },
  "published": "2025-07-10T00:00:00Z",
  "entries": [
    {
      "name": "x-gov-grants",
      "category": "namespace",
      "version": "2.0.0",
      "status": "stable",
      "description": "Namespace for federal grants management extensions. Groups CFDA lookup, SAM.gov registration validation, single-audit thresholds, and fiscal year utilities under one umbrella.",
      "specUrl": "https://grants.gov/formspec/x-gov-grants/v2.0/spec.html",
      "schemaUrl": "https://grants.gov/formspec/x-gov-grants/v2.0/schema.json",
      "compatibility": {
        "formspecVersion": ">=1.0.0 <2.0.0"
      },
      "license": "CC0-1.0",
      "members": [
        "x-gov-grants-cfda-lookup",
        "x-gov-grants-sam-registration",
        "x-gov-grants-single-audit",
        "x-gov-grants-fiscal-year"
      ],
      "examples": [
        {
          "extensions": {
            "x-gov-grants": {
              "version": "2.0",
              "cfda-number": true,
              "sam-registration-required": true,
              "single-audit-threshold": 750000
            }
          }
        }
      ]
    },
    {
      "name": "x-currency-usd",
      "category": "dataType",
      "version": "1.1.0",
      "status": "stable",
      "description": "US Dollar currency type. Extends decimal with 2-digit precision, non-negative constraint, and presentation metadata for dollar-sign prefix and thousands separators.",
      "specUrl": "https://grants.gov/formspec/x-currency-usd/v1.1/spec.html",
      "schemaUrl": "https://grants.gov/formspec/x-currency-usd/v1.1/schema.json",
      "compatibility": {
        "formspecVersion": ">=1.0.0 <2.0.0"
      },
      "license": "CC0-1.0",
      "baseType": "decimal",
      "constraints": {
        "minimum": 0
      },
      "metadata": {
        "prefix": "$",
        "precision": 2,
        "thousandsSeparator": true
      },
      "examples": [
        {
          "key": "total_budget",
          "type": "field",
          "dataType": "decimal",
          "label": "Total Project Budget",
          "extensions": { "x-currency-usd": true }
        }
      ]
    }
  ]
}
```

---

## Appendix A: Registry Entry JSON Schema

The following JSON Schema defines the structure of a single Registry Entry.
The full Registry Document schema wraps this in an `entries` array alongside
the top-level `$formspecRegistry`, `publisher`, and `published` properties.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://formspec.org/schemas/registry/v1.0/entry.json",
  "title": "Formspec Registry Entry",
  "type": "object",
  "required": ["name", "category", "version", "status", "description", "compatibility"],
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$",
      "description": "The x-prefixed extension identifier."
    },
    "category": {
      "type": "string",
      "enum": ["dataType", "function", "constraint", "property", "namespace"]
    },
    "version": {
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)"
    },
    "status": {
      "type": "string",
      "enum": ["draft", "stable", "deprecated", "retired"]
    },
    "publisher": {
      "$ref": "#/$defs/publisher"
    },
    "description": {
      "type": "string",
      "minLength": 1
    },
    "specUrl": {
      "type": "string",
      "format": "uri"
    },
    "schemaUrl": {
      "type": "string",
      "format": "uri"
    },
    "compatibility": {
      "type": "object",
      "required": ["formspecVersion"],
      "properties": {
        "formspecVersion": { "type": "string" },
        "mappingDslVersion": { "type": "string" }
      },
      "additionalProperties": false
    },
    "license": {
      "type": "string"
    },
    "deprecationNotice": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable deprecation message. REQUIRED when status is 'deprecated'."
    },
    "examples": {
      "type": "array",
      "items": true
    },
    "extensions": {
      "type": "object",
      "propertyNames": { "pattern": "^x-" }
    },
    "baseType": {
      "type": "string",
      "enum": ["string", "integer", "decimal", "boolean", "date", "dateTime", "time", "uri"]
    },
    "constraints": {
      "type": "object"
    },
    "metadata": {
      "type": "object"
    },
    "parameters": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "type"],
        "properties": {
          "name": { "type": "string" },
          "type": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    },
    "returns": {
      "type": "string"
    },
    "members": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$"
      }
    }
  },
  "allOf": [
    {
      "if": { "properties": { "category": { "const": "dataType" } } },
      "then": { "required": ["baseType"] }
    },
    {
      "if": { "properties": { "category": { "const": "function" } } },
      "then": { "required": ["parameters", "returns"] }
    },
    {
      "if": { "properties": { "category": { "const": "constraint" } } },
      "then": { "required": ["parameters"] }
    },
    {
      "if": { "properties": { "status": { "const": "deprecated" } }, "required": ["status"] },
      "then": { "required": ["deprecationNotice"] }
    }
  ],
  "additionalProperties": false,
  "$defs": {
    "publisher": {
      "type": "object",
      "required": ["name", "url"],
      "properties": {
        "name": { "type": "string" },
        "url": { "type": "string", "format": "uri" },
        "contact": { "type": "string" }
      },
      "additionalProperties": false
    }
  }
}
```

---

## Appendix B: References

| Tag | Reference |
|---|---|
| [rfc2119] | Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. |
| [RFC 8174] | Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. |
| [RFC 8259] | Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. |
| [RFC 3986] | Berners-Lee, T., Fielding, R., and L. Masinter, "Uniform Resource Identifier (URI): Generic Syntax", STD 66, RFC 3986, January 2005. |
| [semver] | Preston-Werner, T., "Semantic Versioning 2.0.0", https://semver.org/spec/v2.0.0.html. |
| [SPDX] | SPDX Workgroup, "SPDX License List", https://spdx.org/licenses/. |
| [well-known] | Nottingham, M., "Defining Well-Known Uniform Resource Identifiers (URIs)", RFC 8615, May 2019. |
