---
title: Formspec Ontology Specification
version: 1.0.0-draft.1
date: 2026-03-23
status: draft
---

# Formspec Ontology Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-03-23
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard

---

## Abstract

The Formspec Ontology Specification defines a standalone sidecar document for
*binding* form fields to concepts defined in external ontologies and standards
(schema.org, FHIR, ICD-10, Dublin Core, etc.). An Ontology Document does not
define new concepts — it references existing ones by IRI, connecting Formspec's
data collection model to the broader ecosystem of domain ontologies, controlled
vocabularies, and data standards.

An Ontology Document lives alongside the Definition (like Theme, Component, and
References documents) and binds semantic metadata to specific fields and option
sets by path. Multiple Ontology Documents MAY target the same Definition — for
different domains, standards bodies, or interoperability contexts.

This specification enables data scientists, integration engineers, and automated
tooling to understand what form data *means*, not just what it *looks like* — and
to mechanically align data across independently authored forms that collect the
same real-world concepts.

## Status of This Document

This document is a **draft specification**. It is a companion to the Formspec
v1.0 core specification and does not modify or extend the core processing model.
Implementors are encouraged to experiment with this specification and provide
feedback, but MUST NOT treat it as stable for production use until a 1.0.0
release is published.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119]
[RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as
defined in [RFC 3986]. IRI syntax is as defined in [RFC 3987].

Terms defined in Formspec v1.0 — *conformant processor*, *Definition document*,
*extension*, *FEL expression*, *semanticType* — retain their meanings here.

Additional terms:

- **Ontology Document** — A JSON document conforming to this specification.
- **Concept Binding** — An entry in the `concepts` map that associates a
  Definition item path with a concept IRI.
- **Vocabulary Binding** — An entry in the `vocabularies` map that associates
  a named option set with an external terminology system.
- **Alignment** — A declared relationship between a Definition field and a
  concept in an external system, with a typed relationship qualifier.
- **Ontology-aware processor** — A conformant Formspec processor that
  additionally understands the Ontology Document format and uses it for
  semantic annotation, cross-form alignment, or data export enrichment.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119

## Bottom Line Up Front

<!-- bluf:start file=ontology-spec.bluf.md -->
- Ontology Documents are standalone JSON sidecars that **bind** form fields to concepts defined in external ontologies (schema.org, FHIR, ICD-10, etc.) — they reference existing concepts by URI, they do not define new ones. Like Theme, Component, and References documents, they live alongside the Definition.
- Each Concept Binding declares a `concept` URI linking a Definition field to an external ontology (FHIR, schema.org, ICD-10, etc.), with optional cross-system `equivalents` using SKOS relationship types (exact, broader, narrower, related, close).
- Vocabulary Bindings associate named option sets with external terminology systems, enabling terminology version tracking, cross-vocabulary alignment, and code normalization via `valueMap`.
- Alignments declare typed relationships between Definition fields and concepts in other systems, enabling cross-form data science — two independently authored forms that align to the same concept can have their data mechanically merged.
- Multiple Ontology Documents MAY target the same Definition — for different domains, standards bodies, or interoperability contexts. Bindings merge additively; last-loaded document wins for the same path.
- Ontology metadata is pure metadata — it MUST NOT affect data capture, validation, or the processing model. Ontology property values are static; FEL expressions MUST NOT appear.
- The specification is OWL-integrative, not OWL-compatible: it uses IRIs for concept identity and SKOS for alignment types, but does not implement OWL formal semantics, open-world reasoning, or class hierarchies. JSON-LD context fragments bridge to the semantic web when needed.
- This BLUF is governed by `schemas/ontology.schema.json`; generated references are the structural contract.
<!-- bluf:end -->

---

## 1. Purpose and Scope

Formspec v1.0 defines a `semanticType` property on Field items as a "domain
meaning annotation" that is "purely metadata" and "MUST NOT affect validation,
calculation, or any behavioral semantics." The core specification deliberately
leaves semantic *publication*, *alignment*, and *vocabulary binding* out of scope.

This companion specification fills that gap by defining:

1. A **Concept Binding** format for associating Definition items with concept
   IRIs from external ontologies and standards.
2. A **Vocabulary Binding** format for associating named option sets with
   external terminology systems.
3. An **Alignment** format for declaring typed relationships between Definition
   fields and concepts in other systems (SKOS-inspired).
4. A **JSON-LD Context** generation mechanism for producing self-describing
   linked data from form responses.
5. **Conformance requirements** for ontology-aware processors.

This specification does NOT define an ontology, an ontology language, a reasoning
engine, or a terminology service. It defines a **binding document** — a metadata
layer that references concepts defined elsewhere and attaches them to form
fields. External ontologies (schema.org, FHIR, OWL vocabularies) define what
concepts mean. This specification declares which of those concepts each form
field represents.

> **Clarification on naming:** Despite the name "Ontology Document," this
> specification does not create a new ontology or define new concepts. The name
> reflects the document's *purpose* (connecting forms to ontologies) rather than
> its *nature* (it is a binding/annotation document, not an ontology itself).
> The relationship to external ontologies is strictly referential — concept URIs
> point to definitions maintained by their respective authorities (W3C, HL7,
> WHO, etc.), and this specification neither redefines nor extends those
> definitions.

### 1.0.1 Relationship to Registry Concept and Vocabulary Entries

Shared, reusable concept identity and vocabulary metadata MAY also be published
as `concept` and `vocabulary` entries in Extension Registry documents (see the
Extension Registry specification §3.2). Registry-published concepts are
org-level: any form whose field declares a matching `semanticType` gains concept
metadata automatically, without requiring an Ontology Document.

The Ontology Document remains the definitive place for:

- **Per-form concept bindings** — path-based assignment of concepts to specific
  fields in a specific Definition, including concepts not published in any
  shared registry.
- **Alignments** — typed cross-system field relationships that are inherently
  per-form (e.g., "field `mrn` in this form maps to FHIR `Patient.identifier`").
- **JSON-LD context** — export-pipeline-specific linked data context fragments.
- **Bespoke vocabulary bindings** — per-form `valueMap` overrides and vocabulary
  metadata for option sets not covered by a shared registry entry.

When both a registry concept entry and an Ontology Document binding apply to the
same field, the Ontology Document binding takes precedence. See §3.4 for the
full resolution cascade.

### 1.1 Design Principles

1. **Binding, not definition.** This document references concepts defined in
   external ontologies — it does not define new concepts. schema.org defines
   what `birthDate` means. FHIR defines what `Patient.identifier` means. This
   document says "field `dob` in this form represents `schema.org/birthDate`."

2. **Sidecar, not embedded.** Ontological metadata is authored and versioned
   independently of the Definition. The same form can have multiple ontology
   overlays for different contexts (healthcare, research, government).

3. **Different authority.** The ontology overlay may be authored by a different
   party than the form author — a standards body, a data governance team, or a
   domain expert.

4. **Different cadence.** Terminology systems (ICD-10, SNOMED, NAICS) update on
   their own schedules. Vocabulary bindings must version independently of both
   the Definition and the extension registry.

5. **Pure metadata.** Like References, an Ontology Document MUST NOT affect data
   capture, validation, or the processing model. A processor that does not
   understand ontology documents MUST ignore them without error.

6. **Graceful degradation.** Every property is optional except the structural
   minimum. A document with only concept bindings is valid. A document with only
   vocabulary bindings is valid. Tooling extracts whatever is present.

### 1.2 Relationship to OWL and the Semantic Web

This specification is OWL-integrative, not OWL-compatible. It uses IRIs for concept identity and SKOS for alignment vocabulary, but does not implement OWL formal semantics, open-world reasoning, or class hierarchies. See Appendix B for a detailed discussion.

---

## 2. Ontology Document Format

An Ontology Document is a JSON object at the top level with the following
properties:

| Property | Type | Req | Description |
|---|---|---|---|
| `$schema` | string (URI) | OPTIONAL | JSON Schema URI for validation tooling (e.g., `"schemas/ontology.schema.json"`). |
| `$formspecOntology` | string | REQUIRED | Specification version. MUST be `"1.0"`. |
| `url` | string (URI) | OPTIONAL | Canonical URL for this Ontology Document. |
| `name` | string | OPTIONAL | Machine-readable identifier for this Ontology Document (e.g., `"clinical-intake-fhir-r4"`). |
| `version` | string | REQUIRED | Version of this Ontology Document. |
| `targetDefinition` | object | REQUIRED | Binding to the target Definition. See §2.1. |
| `title` | string | RECOMMENDED | Human-readable name for this document. |
| `description` | string | OPTIONAL | Purpose and scope of this ontology overlay. |
| `publisher` | object | OPTIONAL | Organization publishing this document. See §2.2. |
| `published` | string | OPTIONAL | ISO 8601 timestamp of publication. |
| `defaultSystem` | string (URI) | OPTIONAL | Default concept system URI applied when a concept binding omits `system`. |
| `concepts` | object | OPTIONAL | Map of item paths to Concept Bindings. See §3. |
| `vocabularies` | object | OPTIONAL | Map of option set names to Vocabulary Bindings. See §4. |
| `alignments` | array | OPTIONAL | Array of cross-system Alignment declarations. See §5. |
| `context` | object | OPTIONAL | JSON-LD `@context` fragment for response export. See §6. |
| `extensions` | object | OPTIONAL | Extension properties (all keys `x-`-prefixed). |

### 2.1 Target Definition

| Property | Type | Req | Description |
|---|---|---|---|
| `url` | string (URI) | REQUIRED | Canonical URL of the target Definition. |
| `compatibleVersions` | string | OPTIONAL | Semver range of compatible Definition versions (e.g., `">=1.0.0 <2.0.0"`). |

### 2.2 Publisher Object

| Property | Type | Req | Description |
|---|---|---|---|
| `name` | string | REQUIRED | Human-readable organization name. |
| `url` | string (URI) | REQUIRED | Organization home page. |
| `contact` | string | OPTIONAL | Contact email or URI. |

### 2.3 Validation Rules

- Concept binding keys MUST use the same path syntax as `Bind.path` in Core §4.3.3. Paths that reference nonexistent items produce a warning, not a hard error.
- Vocabulary binding keys MUST match names in the Definition's `optionSets`. Keys that do not match a defined option set produce a warning.
- Alignment `field` values MUST use the same path syntax as `Bind.path`.
- Ontology property values are **static**. FEL expressions MUST NOT appear in any Ontology Document property.
- As with other Formspec sidecar documents, an Ontology Document MAY include additional properties prefixed with `x-` at the document root. Unrecognized `x-`-prefixed properties MUST be preserved on round-trip.
- An empty `concepts` object, empty `vocabularies` object, or empty `alignments` array is valid.
- The `context.@context` value MUST be a string (URI), an object, or an array — per the JSON-LD specification.

---

## 3. Concept Bindings

The `concepts` property is an object whose keys are item paths (using the same
path syntax as `Bind.path` in Core §4.3.3) and whose values are Concept Binding
objects.

A Concept Binding associates a Definition item with a concept in an external
ontology or standard.

| Path | Meaning |
|---|---|
| `mrn` | Top-level field |
| `demographics.dob` | Nested field within a group |
| `lineItems[*].amount` | Every instance of `amount` within the repeatable group `lineItems` |
| `#` | The form itself (form-level concept binding) |

A concept binding on a repeatable group path (e.g., `lineItems[*].amount`) means that every instance of that field represents the bound concept.

| Property | Type | Req | Description |
|---|---|---|---|
| `concept` | string (IRI) | REQUIRED | The concept IRI in the external system. |
| `system` | string (URI) | RECOMMENDED | The concept system or ontology URI. Falls back to `defaultSystem` if omitted. |
| `display` | string | RECOMMENDED | Human-readable name of the concept. |
| `code` | string | OPTIONAL | Short code within the system (e.g., `"MR"` for Medical Record Number). |
| `equivalents` | array | OPTIONAL | Cross-system equivalences. See §3.1. |

### 3.1 Equivalents

Each element of the `equivalents` array declares that the bound concept is
equivalent to a concept in another system:

| Property | Type | Req | Description |
|---|---|---|---|
| `system` | string | REQUIRED | The target system identifier. |
| `code` | string | REQUIRED | The concept code within the target system. |
| `display` | string | OPTIONAL | Human-readable name in the target system. |
| `type` | string | OPTIONAL | Relationship type. When `type` is absent, processors MUST treat the relationship as `exact` (this is a processing-model default, not a schema `default`). See §3.2. |

### 3.2 Relationship Types (SKOS-Inspired)

Relationship types follow SKOS (Simple Knowledge Organization System) semantics:

| Type | Meaning |
|---|---|
| `exact` | Identical concept (SKOS `exactMatch`). Default. |
| `close` | Very similar but not identical (SKOS `closeMatch`). |
| `broader` | Source concept is more specific than target (SKOS `broadMatch`). |
| `narrower` | Source concept is more general than target (SKOS `narrowMatch`). |
| `related` | Associatively related (SKOS `relatedMatch`). |

Custom relationship types MUST be prefixed with `x-`.

### 3.3 Example

```json
{
  "concepts": {
    "mrn": {
      "concept": "http://terminology.hl7.org/CodeSystem/v2-0203#MR",
      "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
      "display": "Medical Record Number",
      "code": "MR",
      "equivalents": [
        {
          "system": "https://schema.org",
          "code": "MedicalRecord.identifier",
          "type": "related"
        }
      ]
    },
    "dob": {
      "concept": "https://schema.org/birthDate",
      "system": "https://schema.org",
      "display": "Date of Birth"
    },
    "demographics.ssn": {
      "concept": "https://www.irs.gov/terms/social-security-number",
      "system": "https://www.irs.gov/terms",
      "display": "Social Security Number",
      "equivalents": [
        {
          "system": "https://schema.org",
          "code": "taxID",
          "type": "broader"
        }
      ]
    }
  }
}
```

### 3.4 Resolution Cascade

Concept identity for a field may come from up to three sources. When multiple
sources apply to the same field, the following cascade determines precedence
(highest to lowest):

1. **Ontology Document binding** — a concept binding in the `concepts` map
   for this field's path. Provides the authoritative concept URI, equivalents,
   and metadata for tooling that loads ontology documents.
2. **Registry concept entry** — when the field's `semanticType` matches the
   `name` of a loaded registry entry with `category: "concept"`. Provides
   shared concept metadata for tooling that loads registries but not ontology
   documents.
3. **`semanticType` literal** — the raw `semanticType` string value, treated
   as a freeform domain annotation. Authoritative for processors that load
   neither registries nor ontology documents.

All three MAY coexist on the same field. No warning is needed — this is the
expected pattern for definitions designed to work across multiple tooling
contexts. A field with `"semanticType": "x-onto-ein"` and an Ontology Document
binding for the same path is well-formed; the ontology binding provides richer
metadata while the registry entry provides a shared baseline.

---

## 4. Vocabulary Bindings

The `vocabularies` property is an object whose keys are option set names
(matching keys in the Definition's `optionSets`) and whose values are
Vocabulary Binding objects.

A Vocabulary Binding associates a named option set with an external terminology
system, enabling cross-vocabulary alignment and terminology version tracking.

| Property | Type | Req | Description |
|---|---|---|---|
| `system` | string (URI) | REQUIRED | The terminology system URI (e.g., `"http://hl7.org/fhir/sid/icd-10"`). |
| `version` | string | RECOMMENDED | Version of the terminology (e.g., `"2024"`). |
| `display` | string | RECOMMENDED | Human-readable name (e.g., `"ICD-10-CM"`). |
| `filter` | object | OPTIONAL | Subset constraints on the vocabulary. See §4.1. |
| `valueMap` | object | OPTIONAL | Map from option set `value` strings to terminology codes, when they differ. Keys are the Definition's option values; values are the external terminology codes. |

### 4.1 Filter Object

| Property | Type | Req | Description |
|---|---|---|---|
| `ancestor` | string | OPTIONAL | Root code for hierarchical filtering (only descendants included). |
| `maxDepth` | integer | OPTIONAL | Maximum depth from the ancestor code. |
| `include` | array | OPTIONAL | Explicit list of codes to include. |
| `exclude` | array | OPTIONAL | Explicit list of codes to exclude. |

### 4.2 Example

```json
{
  "vocabularies": {
    "diagnosisCodes": {
      "system": "http://hl7.org/fhir/sid/icd-10",
      "version": "2024",
      "display": "ICD-10-CM",
      "filter": {
        "ancestor": "F00-F99",
        "maxDepth": 3
      }
    },
    "genderOptions": {
      "system": "http://hl7.org/fhir/ValueSet/administrative-gender",
      "version": "5.0.0",
      "display": "Administrative Gender",
      "valueMap": {
        "m": "male",
        "f": "female",
        "o": "other",
        "u": "unknown"
      }
    }
  }
}
```

### 4.3 Interaction with Option Sets

Vocabulary Bindings do not replace or override the Definition's option set
values. They provide additional metadata that enables:

1. **Terminology version tracking** — which version of ICD-10 these codes come from.
2. **Cross-vocabulary alignment** — tooling can look up equivalent codes in
   other terminology systems using the `system` + code combination.
3. **Hierarchical context** — the `filter` clarifies which subset of a large
   vocabulary is in scope.
4. **Code normalization** — the `valueMap` translates between the Definition's
   option values and the external terminology's codes when they differ.

### 4.4 Dynamic Option Sources

Vocabulary Bindings target named option sets declared in the Definition's `optionSets`. Fields that use `choicesFrom` for dynamic option sources are outside the scope of static Vocabulary Bindings. Dynamic vocabulary resolution, if needed, MUST be handled by the host environment.

---

## 5. Alignments

The `alignments` array declares explicit relationships between Definition
fields and concepts in external systems. While concept bindings (§3) declare
"this field represents this concept," alignments declare "this field's concept
relates to that system's concept in this way."

Alignments enable cross-form data science: two independently authored forms
that align to the same external concept can have their data mechanically merged.

| Property | Type | Req | Description |
|---|---|---|---|
| `field` | string | REQUIRED | Item path in the Definition. |
| `target` | object | REQUIRED | External system concept reference. |
| `target.system` | string | REQUIRED | External system identifier. |
| `target.code` | string | REQUIRED | Concept code in the external system. |
| `target.display` | string | OPTIONAL | Human-readable name in the external system. |
| `type` | string | REQUIRED | Relationship type (§3.2). |
| `bidirectional` | boolean | OPTIONAL | Whether the alignment applies in both directions. Default `false`. |
| `notes` | string | OPTIONAL | Human-readable explanation of the alignment rationale. |

### 5.1 Example

```json
{
  "alignments": [
    {
      "field": "mrn",
      "target": { "system": "urn:fhir:r4", "code": "Patient.identifier" },
      "type": "exact",
      "bidirectional": true
    },
    {
      "field": "demographics.dob",
      "target": { "system": "urn:fhir:r4", "code": "Patient.birthDate" },
      "type": "exact",
      "bidirectional": true
    },
    {
      "field": "demographics.gender",
      "target": { "system": "urn:fhir:r4", "code": "Patient.gender" },
      "type": "exact",
      "bidirectional": true
    },
    {
      "field": "demographics.gender",
      "target": { "system": "https://schema.org", "code": "gender" },
      "type": "broader",
      "notes": "schema.org gender includes gender identity; FHIR administrative-gender is narrower."
    }
  ]
}
```

### 5.2 Alignment vs. Concept Equivalents

Concept bindings (§3) with `equivalents` declare equivalences from the concept's
perspective — "an EIN is also known as a taxID." Alignments (§5) declare
equivalences from the field's perspective — "this field maps to that system's
field." The distinction matters when:

- A concept has many equivalences but only some are relevant to a specific form's
  integration context.
- An alignment needs notes, directionality, or custom relationship types.
- The alignment involves fields that have no concept binding (pure structural alignment).

Both mechanisms are valid. Concept equivalents are simpler for common cases.
Alignments provide richer metadata for integration engineering.

---

## 6. JSON-LD Context Fragment

The `context` property MAY contain a JSON-LD `@context` fragment that, when
applied to a response document, makes the response a valid JSON-LD document.
This enables form responses to participate in linked data ecosystems.

### 6.1 Example

```json
{
  "context": {
    "@context": {
      "@vocab": "https://example.gov/forms/clinical-intake#",
      "mrn": {
        "@id": "http://terminology.hl7.org/CodeSystem/v2-0203#MR",
        "@type": "xsd:string"
      },
      "dob": {
        "@id": "https://schema.org/birthDate",
        "@type": "xsd:date"
      },
      "gender": {
        "@id": "http://hl7.org/fhir/administrative-gender",
        "@type": "@vocab"
      }
    }
  }
}
```

### 6.2 Auto-Generation

Ontology-aware tooling SHOULD be capable of generating a JSON-LD context
fragment from the concept bindings and vocabulary bindings in the document.
Explicitly authored `context` entries override auto-generated ones.

---

## 7. Relationship to Existing Properties

Ontology bindings complement but do not replace existing Definition and Registry
properties. The following table shows the full layering from structural typing
through semantic identity:

| Property | Source | Purpose |
|---|---|---|
| `dataType` | Definition | Structural type (string, date, money, etc.) |
| `semanticType` | Definition | Domain annotation — freeform string, URI, or registry concept key |
| Extension (`x-formspec-ein`) | Registry | Type refinement with validation constraints and presentation metadata |
| **Concept entry** (`x-onto-ein`) | **Registry** | **Shared concept identity with cross-system equivalences** |
| **Vocabulary entry** (`x-vocab-icd10-cm`) | **Registry** | **Shared terminology binding with version tracking** |
| **Concept Binding** | **Ontology Document** | **Per-form concept binding by path** |
| **Vocabulary Binding** | **Ontology Document** | **Per-form vocabulary binding with valueMap** |
| **Alignment** | **Ontology Document** | **Per-form typed cross-system field relationships** |

- `dataType` and extensions remain the right place for structural typing and
  validation constraints.
- `semanticType` is the inline entry point for concept identity. When its value
  matches a loaded `concept` registry entry, processors resolve it to the
  entry's concept URI and equivalences. When it does not match, it remains a
  freeform domain annotation.
- Registry `concept` and `vocabulary` entries provide shared, org-level semantic
  metadata — concept URIs, SKOS equivalences, terminology systems. They are
  reusable across forms and maintained centrally by a data governance team or
  standards body.
- Ontology Document bindings provide per-form metadata — path-based concept
  assignment, cross-system alignments, JSON-LD context, and bespoke vocabulary
  bindings with `valueMap` overrides.
- When a field has a `semanticType` that resolves to a registry concept entry
  AND an Ontology Document binding for the same path, the Ontology Document
  binding takes precedence (see §3.4). The registry entry MAY still provide
  supplementary metadata (equivalents, display) that the ontology binding does
  not override.

---

## 8. Conformance

This specification defines conformance requirements for Ontology Document handling.

### 8.1 Core Processor Requirements

- A conformant Core processor MAY ignore Ontology Documents entirely — they are an additive metadata layer.
- A conformant Core processor MUST NOT use ontology bindings to alter data capture, validation, or the processing model.
- Ontology metadata MUST NOT appear in Response data.

### 8.2 Extended Processor Requirements

- An Extended processor that supports ontology documents MUST load and validate Ontology Documents against the schema in §9.
- An Extended processor MUST verify that `targetDefinition.url` matches the loaded Definition's `url`. On mismatch, the processor MUST NOT apply the ontology bindings and SHOULD emit an error.
- An Extended processor SHOULD verify `targetDefinition.compatibleVersions` and emit a warning on version mismatch. The processor MAY still apply the ontology bindings (warn-and-continue).
- An Extended processor MUST resolve `defaultSystem` as the fallback for concept bindings that omit `system`.
- When a concept binding references a Definition item path that does not exist in the loaded Definition, the processor MUST emit a warning but MUST NOT reject the document.
- When a vocabulary binding references an option set name that does not exist in the loaded Definition, the processor MUST emit a warning but MUST NOT reject the document.
- Load order of multiple Ontology Documents is implementation-defined. When multiple documents bind the same path, the last-loaded document's binding takes precedence. Vocabulary bindings merge additively (last-loaded overrides for the same option set name). Alignments concatenate.
- An Extended processor that encounters an unrecognized, non-`x-`-prefixed relationship `type` SHOULD emit a warning and treat it as `"related"`.
- An Extended processor MUST preserve unrecognized `x-`-prefixed properties on round-trip.
- When a concept binding's path targets a field whose `semanticType` matches a loaded concept registry entry, the ontology binding takes precedence for concept identity. The registry entry MAY still provide supplementary metadata (equivalents, display) that the ontology binding does not include.
- When a vocabulary binding references an option set name that also matches a loaded vocabulary registry entry, the ontology binding takes precedence. The `vocabularyVersion` from the ontology binding overrides the registry entry's version.

---

## 9. Schema

<!-- schema-ref:start id=ontology-top-level schema=schemas/ontology.schema.json pointers=# -->
<!-- generated:schema-ref id=ontology-top-level -->
_(Table will be generated by `npm run docs:generate`.)_
<!-- schema-ref:end -->

---

## 10. Security Considerations

- **URI resolution**: Processors and tooling MUST NOT blindly dereference concept URIs, system URIs, or alignment target URIs from ontology documents. Concept URIs are identifiers, not fetch targets. Implementations that resolve URIs for metadata enrichment SHOULD maintain an allowlist of trusted domains.
- **JSON-LD context injection**: The `context.@context` property could inject unexpected `@type` or `@id` mappings into response exports. Implementations that apply JSON-LD contexts to response data MUST validate the context structure and SHOULD restrict `@context` values to known, trusted patterns.
- **Alignment target trust**: Alignment `target.system` values identify external systems but do not authenticate them. An attacker who publishes a malicious Ontology Document could declare false alignments (e.g., claiming a field aligns to a system it does not). Implementations SHOULD verify the provenance of loaded Ontology Documents.
- **Document provenance**: Since Ontology Documents are separate files that bind to a Definition by URL, loading ontology documents from untrusted sources could inject misleading semantic metadata. Implementations SHOULD verify document provenance before applying bindings.
- **Information disclosure**: Concept URIs and alignment targets may reveal information about the form's domain and data model. Organizations that require data model confidentiality SHOULD restrict distribution of Ontology Documents.

---

## 11. Complete Example

```json
{
  "$formspecOntology": "1.0",
  "version": "1.0.0",
  "title": "Clinical Intake — FHIR R4 Ontology Overlay",
  "description": "Binds the clinical intake form to FHIR R4 concepts and terminology systems for healthcare data interoperability.",
  "targetDefinition": {
    "url": "https://example.org/forms/clinical-intake",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "publisher": {
    "name": "Health Data Standards Board",
    "url": "https://hdsb.example.org",
    "contact": "standards@hdsb.example.org"
  },
  "published": "2026-03-23T00:00:00Z",
  "defaultSystem": "http://hl7.org/fhir",

  "concepts": {
    "mrn": {
      "concept": "http://terminology.hl7.org/CodeSystem/v2-0203#MR",
      "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
      "display": "Medical Record Number",
      "code": "MR"
    },
    "demographics.dob": {
      "concept": "https://schema.org/birthDate",
      "system": "https://schema.org",
      "display": "Date of Birth"
    },
    "demographics.gender": {
      "concept": "http://hl7.org/fhir/administrative-gender",
      "display": "Administrative Gender"
    },
    "demographics.ssn": {
      "concept": "https://www.irs.gov/terms/social-security-number",
      "system": "https://www.irs.gov/terms",
      "display": "Social Security Number",
      "equivalents": [
        { "system": "https://schema.org", "code": "taxID", "type": "broader" }
      ]
    }
  },

  "vocabularies": {
    "diagnosisCodes": {
      "system": "http://hl7.org/fhir/sid/icd-10",
      "version": "2024",
      "display": "ICD-10-CM",
      "filter": { "ancestor": "F00-F99", "maxDepth": 3 }
    },
    "genderOptions": {
      "system": "http://hl7.org/fhir/ValueSet/administrative-gender",
      "version": "5.0.0",
      "display": "Administrative Gender"
    }
  },

  "alignments": [
    {
      "field": "mrn",
      "target": { "system": "urn:fhir:r4", "code": "Patient.identifier" },
      "type": "exact",
      "bidirectional": true
    },
    {
      "field": "demographics.dob",
      "target": { "system": "urn:fhir:r4", "code": "Patient.birthDate" },
      "type": "exact",
      "bidirectional": true
    },
    {
      "field": "demographics.gender",
      "target": { "system": "urn:fhir:r4", "code": "Patient.gender" },
      "type": "exact",
      "bidirectional": true
    },
    {
      "field": "demographics.gender",
      "target": { "system": "https://schema.org", "code": "gender" },
      "type": "broader",
      "notes": "schema.org gender includes gender identity; FHIR administrative-gender is narrower."
    },
    {
      "field": "demographics.ein",
      "target": { "system": "urn:salesforce", "code": "Account.TaxId__c" },
      "type": "exact",
      "bidirectional": true
    }
  ],

  "context": {
    "@context": {
      "@vocab": "https://example.org/forms/clinical-intake#",
      "mrn": { "@id": "http://terminology.hl7.org/CodeSystem/v2-0203#MR", "@type": "xsd:string" },
      "dob": { "@id": "https://schema.org/birthDate", "@type": "xsd:date" },
      "gender": { "@id": "http://hl7.org/fhir/administrative-gender", "@type": "@vocab" }
    }
  }
}
```

---

## Appendix A: References

| Tag | Reference |
|---|---|
| [rfc2119] | Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997. |
| [RFC 8174] | Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017. |
| [RFC 8259] | Bray, T., Ed., "The JavaScript Object Notation (JSON) Data Interchange Format", STD 90, RFC 8259, December 2017. |
| [RFC 3986] | Berners-Lee, T., Fielding, R., and L. Masinter, "Uniform Resource Identifier (URI): Generic Syntax", STD 66, RFC 3986, January 2005. |
| [RFC 3987] | Duerst, M. and M. Suignard, "Internationalized Resource Identifiers (IRIs)", RFC 3987, January 2005. |
| [SKOS] | Miles, A. and S. Bechhofer, "SKOS Simple Knowledge Organization System Reference", W3C Recommendation, August 2009. |
| [JSON-LD] | Sporny, M., et al., "JSON-LD 1.1", W3C Recommendation, July 2020. |

## Appendix B: Relationship to OWL and the Semantic Web

This specification is **OWL-integrative, not OWL-compatible**. It is designed to
interoperate with OWL-based systems, not to replace them.

**What this specification shares with OWL:**

- **IRI-based concept identity.** Concept bindings use IRIs (Internationalized
  Resource Identifiers) to identify concepts — the same addressing scheme used
  by OWL, RDF, and the broader semantic web. Two systems that agree on an IRI
  are talking about the same thing, regardless of their native format.

- **SKOS alignment vocabulary.** The `equivalents` and alignment `type` values
  (`exact`, `close`, `broader`, `narrower`, `related`) are drawn from SKOS
  (Simple Knowledge Organization System), a W3C standard that sits alongside
  OWL in the semantic web stack. SKOS is purpose-built for concept alignment
  between systems that do not share a full ontology.

- **JSON-LD bridge.** The `context` property (§6) produces a JSON-LD `@context`
  fragment that, when applied to a response document, makes it a valid JSON-LD
  document. This enables form responses to be ingested by triple stores, queried
  with SPARQL, and merged with RDF datasets.

**What this specification does NOT do:**

- **No open-world assumption.** OWL operates under open-world semantics: the
  absence of a statement does not imply its negation. Formspec operates under
  closed-world semantics: a field not in the Definition is an error, not an
  unknown. This specification inherits Formspec's closed-world model.

- **No logical reasoning.** OWL axioms enable inference — a reasoner can derive
  new facts from declared class relationships, property restrictions, and
  equivalence axioms. Alignments in this specification are flat assertions. They
  support matching and merging but not logical deduction.

- **No class hierarchy.** This specification does not model `rdfs:subClassOf`
  relationships between groups. Groups in a Definition are structural containers
  with compositional semantics, not ontological classes with subsumption chains.
  The `broader`/`narrower` SKOS types on equivalents express concept-level
  relationships but do not constitute formal class axioms.

- **No property restrictions.** OWL uses `owl:Restriction` to declare domain,
  range, and cardinality constraints on properties. This information exists in
  the Definition (field `dataType`, `minRepeat`/`maxRepeat`, binds) but is not
  duplicated in the Ontology Document.

**Derived OWL output.** Tooling MAY generate OWL/RDFS vocabularies from Ontology
Documents combined with Definition structure — mapping groups to `owl:Class`,
fields to `owl:DatatypeProperty`, cardinality to `owl:Restriction`, and option
sets to `owl:oneOf` enumerations. Such output is a derived artifact, not a
canonical representation. Round-trip fidelity is not guaranteed. The generated
OWL is suitable for integration with semantic web infrastructure but does not
capture the full behavioral semantics of the Definition (conditional relevance,
calculated fields, validation shapes).

## Static Semantics and Lint

Ontology Documents are first validated against `schemas/ontology.schema.json`.
Static semantic lint then checks authoring invariants without dereferencing
concept URIs, system URIs, JSON-LD contexts, or alignment targets.

The Ontology semantic pass owns the `E1200`/`W1200` diagnostic family:

- `E1200` rejects invalid `concepts` keys and `alignments[*].field` paths.
- `E1201` rejects `targetDefinition.url` mismatches when a paired Definition is
  supplied.
- `E1202` rejects FEL-looking dynamic expressions in static Ontology values
  outside the JSON-LD `context.@context` fragment.
- `W1200` warns when `targetDefinition.compatibleVersions` does not
  confidently include the paired Definition version.
- `W1201` and `W1202` warn when syntactically valid concept or alignment paths
  do not resolve to Definition item paths.
- `W1203` and `W1204` warn when vocabulary bindings or `valueMap` keys do not
  resolve to Definition option sets and option values.
- `W1205` reports use of `defaultSystem` fallback, and `W1206` reports concept
  bindings that omit `system` when no fallback exists.

The lint pass exposes static analysis facts for downstream tooling: normalized
concept/alignment paths, resolved item paths, resolved option-set/value-map
coverage, and the effective concept system after `defaultSystem` fallback.
