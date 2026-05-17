---
title: Formspec Mapping DSL
version: 1.0.0-draft.1
date: 2026-04-09
status: draft
---

# Formspec Mapping DSL v1.0 — Bidirectional Data Transformation for Formspec Responses

**Version:** 1.0.0-draft.1  
**Date:** 2026-04-09  
**Editors:** Formspec Working Group  
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard  

---

## Abstract

The Formspec Mapping DSL is a companion specification to Formspec v1.0 that
defines a declarative, JSON-native language for expressing bidirectional data
transformations between Formspec Responses and external system schemas. A
Mapping Document — itself a JSON document — declares field-level
correspondences, structural reorganizations, type coercions, value
translations, and conditional logic sufficient to convert a Formspec Response
into an API payload, database record, CSV export, or XML document, and to
reverse that transformation when importing external data back into a Formspec
Response. The Mapping DSL reuses the Formspec Expression Language (FEL) for all
computed transforms and generalizes the version-migration `fieldMap` already
present in §6.7 of the core specification.

## Status of This Document

This document is a **draft specification**. It is a companion to the Formspec
v1.0 core specification and does not modify or extend that specification.
Implementors are encouraged to experiment with this specification and provide
feedback, but MUST NOT treat it as stable for production use until a 1.0.0
release is published.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119]
[RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. JSON Pointer syntax is
as defined in [RFC 6901]. URI syntax is as defined in [RFC 3986].

Terms defined in the Formspec v1.0 core specification — including *Definition*,
*Instance*, *Response*, *Bind*, *FEL*, and *conformant processor* — retain
their core-specification meanings throughout this document unless explicitly
redefined.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 4180]: https://www.rfc-editor.org/rfc/rfc4180
[RFC 6901]: https://www.rfc-editor.org/rfc/rfc6901
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- bluf:start file=mapping-spec.bluf.md -->
- This document defines bidirectional Mapping DSL transforms between Formspec Responses and external schemas.
- A valid mapping requires `$formspecMapping`, `version`, `definitionRef`, `definitionVersion`, `targetSchema`, and at least one `rules` entry.
- Field rules are declarative and can compose transforms for preserve/drop/expression/coerce/value map/array reshaping.
- This BLUF is governed by `schemas/mapping.schema.json`; generated schema references are the canonical structural contract.
<!-- bluf:end -->

## 1. Introduction

### 1.1 Purpose

Formspec v1.0 defines a complete model for form structure, reactive behavior,
validation, and response capture. A Formspec Response is a self-contained JSON
document that records the data collected by a form, pinned to a specific
Definition version. Within the Formspec ecosystem, this is sufficient: the
Response faithfully mirrors the form's field hierarchy, types, and semantics.

Real systems, however, rarely consume form data in its native shape. A grant
management platform may need to flatten a nested budget section into a
relational database row. A government reporting system may require the same
data as an XML document conforming to a fixed schema. An analytics pipeline
may ingest CSV extracts with column names that bear no resemblance to the
Formspec field keys. A REST API may expect a JSON payload whose structure
reflects the API's domain model, not the form's presentation hierarchy.

In each case, a transformation stands between the Formspec Response and the
external system. Without a standard way to declare these transformations,
implementors must write bespoke mapping code — code that is tightly coupled to
both the form definition and the external schema, difficult to version, and
impossible to share across implementations.

This specification fills that gap. The Formspec Mapping DSL defines a
declarative language for expressing bidirectional data transformations between
Formspec Responses and external system schemas. A single Mapping Document
describes both the forward path (Response to external) and the reverse path
(external to Response), enabling round-trip data exchange without imperative
glue code.

### 1.2 Scope

This specification defines:

- The JSON schema for **Mapping Documents** — standalone JSON documents that
  declare field-level correspondences and transforms between a Formspec
  Response and an external schema.
- **Field renaming and path remapping** — changing field keys and restructuring
  nested hierarchies.
- **Type coercion rules** — converting between Formspec types (string, number,
  date, money, boolean) and external representations.
- **Value mapping** — translating enumerated values, code systems, and
  display labels between Formspec option sets and external code tables.
- **Array and repeat operations** — mapping Formspec repeat sections to
  external arrays, flat row sets, or positional structures.
- **Conditional mapping** — applying field rules only when specified
  conditions hold, using FEL expressions.
- **Default injection** — supplying default values when source data is absent
  or null.
- **Bidirectional semantics** — declaring both forward (Response → External)
  and reverse (External → Response) transforms, with explicit opt-out for
  lossy or one-directional mappings.
- **Adapter contracts** for serialization to JSON, XML, and CSV target formats.

This specification does **not** define:

- Transport protocols (HTTP, WebSocket, message queue, file transfer).
- Authentication, authorization, or access control.
- Rendering, layout, or visual presentation of forms.
- The Formspec core specification itself (form structure, validation,
  processing model, FEL grammar). Those are defined in Formspec v1.0 and
  incorporated by reference.
- Execution scheduling, trigger mechanisms, or workflow orchestration.
- Persistence or storage mechanisms for Mapping Documents.

### 1.3 Relationship to Formspec Core

The Formspec Mapping DSL is a **companion specification** to Formspec v1.0. It
is neither an extension nor a superseding revision. The two specifications are
independent in the following sense:

- A conformant Formspec Core processor is **NOT REQUIRED** to implement the
  Mapping DSL. A Core or Extended processor that does not support this
  specification remains fully conformant with Formspec v1.0.
- A conformant Mapping DSL processor **MUST** understand the Formspec Response
  schema (§2.1.6 of the core specification) and **MUST** implement the
  Formspec Expression Language (§3 of the core specification), since FEL is
  the computation substrate for all transform expressions in this DSL.

The relationship to §6.7 of the core specification is one of generalization.
The version-migration `fieldMap` defined in §6.7 supports three transform
types — `preserve`, `drop`, and `expression` — applied to pairs of Formspec
Responses at different Definition versions. The Mapping DSL retains these
three transform types as primitives and adds structural transforms, type
coercions, value maps, conditional logic, array operations, and
multi-format adapters. In formal terms:

> Every valid §6.7 `fieldMap` entry is a degenerate Mapping Document Field
> Rule in which both source and target schemas are Formspec Responses. A
> conformant Mapping DSL processor SHOULD be able to interpret §6.7
> `fieldMap` entries as Mapping rules without modification.

### 1.4 Terminology

The following terms are defined for use throughout this specification. Where
a term is also used in the Formspec core specification with the same meaning,
this is noted.

- **Mapping Document** — A JSON document conforming to the Mapping DSL
  schema that declares a set of field-level correspondences and transforms
  between a Formspec Response and an external schema. A Mapping Document is
  the primary artifact defined by this specification.

- **Source Schema** — The schema from which data is read during a mapping
  operation. In a forward mapping, the source schema is the Formspec Response.
  In a reverse mapping, the source schema is the external system's data
  structure.

- **Target Schema** — The schema to which data is written during a mapping
  operation. In a forward mapping, the target schema is the external system's
  data structure. In a reverse mapping, the target schema is the Formspec
  Response.

- **Forward Mapping** — A transformation that reads data from a Formspec
  Response (source) and produces a data structure conforming to the external
  schema (target). This is the Response → External direction.

- **Reverse Mapping** — A transformation that reads data from an external
  system's data structure (source) and produces or updates a Formspec
  Response (target). This is the External → Response direction.

- **Transform** — A declarative operation applied to a single field's value
  during mapping. Transforms include identity preservation, value
  expressions (FEL), type coercions, value lookups, and structural
  reshaping. The §6.7 migration transforms (`preserve`, `drop`,
  `expression`) are a subset.

- **Field Rule** — A single entry in a Mapping Document's rule list that
  binds a source path to a target path and specifies zero or more transforms
  to apply during the mapping. A Field Rule is the atomic unit of a Mapping
  Document.

- **Adapter** — A pluggable serialization/deserialization component that
  converts between the Mapping Engine's internal representation (JSON) and
  an external wire format (JSON, XML, CSV). Adapters handle format-specific
  concerns such as XML namespace prefixing, CSV column ordering, and
  character encoding.

### 1.5 Conformance

This specification defines three conformance levels. Each level is a strict
superset of the preceding level.

#### 1.5.1 Mapping Core

A conformant **Mapping Core** processor MUST:

1. Parse and validate any Mapping Document that conforms to the Mapping DSL
   JSON schema without error.
2. Implement **forward mapping** (Formspec Response → JSON target) for all
   Field Rule types defined in this specification.
3. Implement the full Formspec Expression Language (FEL) as defined in §3 of
   the Formspec v1.0 core specification, including all built-in functions.
4. Correctly apply all transform types: `preserve`, `drop`, `expression`,
   type coercion, value map, default injection, and conditional mapping.
5. Process array and repeat-section mappings for JSON targets.
6. Report a diagnostic error when encountering a Mapping Document that
   references an unknown transform type, an unresolvable source path, or
   an invalid FEL expression.

A Mapping Core processor is NOT REQUIRED to support reverse mapping, XML
adapters, or CSV adapters.

#### 1.5.2 Mapping Bidirectional

A conformant **Mapping Bidirectional** processor MUST support Mapping Core
plus:

1. **Reverse mapping** (JSON source → Formspec Response) for all Field Rule
   types that are declared as reversible in the Mapping Document.
2. Round-trip fidelity: for any Formspec Response R and Mapping Document M
   where all Field Rules are declared bidirectional, applying the forward
   mapping followed by the reverse mapping MUST produce a Response R′ such
   that for every field path covered by M, the value in R′ equals the value
   in R (subject to the precision and coercion rules defined in this
   specification).
3. Detection and reporting of **lossy transforms** — Field Rules whose
   forward transform discards information (e.g., `drop`, many-to-one value
   maps) MUST be flagged as non-reversible, and the processor MUST report an
   error if a reverse mapping is attempted through a non-reversible rule.

A processor claiming Mapping Bidirectional conformance implicitly claims
Mapping Core conformance.

#### 1.5.3 Mapping Extended

A conformant **Mapping Extended** processor MUST support Mapping Bidirectional
plus:

1. An **XML Adapter** capable of serializing the mapping output as an XML
   document conforming to a target XML schema, and deserializing an XML
   document into the mapping engine's internal representation. The adapter
   MUST support namespace declarations, attribute-vs-element mapping, and
   mixed content handling.
2. A **CSV Adapter** capable of serializing the mapping output as a
   CSV file conforming to [RFC 4180], and deserializing a CSV file into the
   mapping engine's internal representation. The adapter MUST support
   configurable delimiters, header-row mapping, and multi-row repeat
   flattening.
3. Adapter-specific configuration properties in the Mapping Document
   (e.g., XML namespace bindings, CSV delimiter, encoding).

A processor claiming Mapping Extended conformance implicitly claims Mapping
Bidirectional conformance.

### 1.6 Notational Conventions

All normative JSON examples in this specification use the following
conventions:

- JSON property names are enclosed in double quotes per [RFC 8259].
- Ellipsis (`...`) within a JSON object or array indicates that additional
  properties or elements may be present but are omitted for brevity.
- Comments of the form `// description` appear in JSON examples for
  explanatory purposes only. Comments are not valid JSON; conformant
  processors MUST NOT expect or emit them.
- Field paths use dot notation (e.g., `expenditures.miscellaneous.total`)
  consistent with FEL reference syntax. Array indexing uses bracket notation
  (e.g., `lineItems[0].amount`); the wildcard `[*]` denotes all elements of
  an array.
- The keywords MUST, SHOULD, MAY, and their negatives are capitalized when
  used in their RFC 2119 sense. Lower-case uses of these words carry their
  ordinary English meaning.

---

## 2. Conceptual Model

### 2.1 Overview

A **Mapping Document** is a standalone JSON document that connects a Formspec
Response to an external system by declaring field-level correspondences and
transforms. It is not embedded in a Formspec Definition, nor does it modify
the Definition or Response schemas. Instead, it sits alongside these artifacts
as an independent, versionable configuration that a Mapping Engine interprets
at runtime.

Conceptually, a Mapping Document answers three questions:

1. **What goes where?** For each field in the source, which field (if any) in
   the target receives its value?
2. **How is it transformed?** What operations — renaming, restructuring, type
   coercion, value translation, computation — are applied to the value in
   transit?
3. **In which direction(s)?** Is the mapping forward-only, reverse-only, or
   bidirectional?

The Mapping Engine is the runtime component that reads a Mapping Document,
accepts a source data structure (a Formspec Response or an external payload),
and produces the corresponding target data structure. The engine is
format-agnostic at its core; format-specific concerns (XML serialization,
CSV column ordering) are delegated to Adapters.

### 2.2 Architecture

The following diagram illustrates the high-level architecture of the Mapping
DSL runtime.

```
┌─────────────────┐                                       ┌─────────────────┐
│                 │        ┌───────────────────┐          │                 │
│   Formspec      │        │                   │          │   External      │
│   Response      │───────▶│   Mapping Engine  │─────────▶│   System        │
│                 │        │                   │          │                 │
│  (JSON)         │◀───────│  ┌─────────────┐  │◀─────────│  (JSON/XML/CSV) │
│                 │        │  │  Mapping     │  │          │                 │
└─────────────────┘        │  │  Document    │  │          └─────────────────┘
                           │  └─────────────┘  │
                           │                   │
                           │  ┌─────────────┐  │
                           │  │  FEL         │  │
                           │  │  Evaluator   │  │
                           │  └─────────────┘  │
                           │                   │
                           │  ┌─────────────┐  │
                           │  │  Adapter     │  │
                           │  │  (JSON/XML/  │  │
                           │  │   CSV)       │  │
                           │  └─────────────┘  │
                           │                   │
                           └───────────────────┘

         ◀──── Forward Mapping (Response → External) ────▶
         ◀──── Reverse Mapping (External → Response) ────▶
```

The **Mapping Engine** is composed of three sub-components:

- The **Mapping Document** provides the declarative rule set.
- The **FEL Evaluator** executes transform expressions. This is the same
  evaluator used by Formspec Core processors for Bind calculations and
  validation constraints.
- The **Adapter** handles format-specific serialization and deserialization.
  A Mapping Core processor provides a JSON adapter; a Mapping Extended
  processor additionally provides XML and CSV adapters.

### 2.3 Mapping Document Lifecycle

A Mapping Document is **authored alongside** a Formspec Definition but
**versioned independently**. This separation reflects the reality that form
structure and integration requirements evolve on different timelines: a form
may undergo several minor revisions while its API mapping remains stable, or
an external system may change its schema while the form itself is unchanged.

The lifecycle of a Mapping Document is as follows:

1. **Authoring.** A Mapping Document is created by a form author, integration
   engineer, or automated tool. It declares which Formspec Definition (by
   `definitionRef`) and which external schema it targets.

2. **Association.** A Mapping Document is associated with a Formspec
   Definition by reference. The Definition document itself does not contain
   or reference Mapping Documents (the core specification is unaware of
   this companion specification). Association is maintained externally —
   for example, by a form registry, a configuration file, or a bundling
   convention.

3. **Versioning.** A Mapping Document MUST declare its own version
   (following [Semantic Versioning 2.0.0][semver]) and the
   `definitionVersion` or version range of the Formspec Definition it is
   compatible with. When the Definition undergoes a breaking change, the
   Mapping Document's compatibility range is updated accordingly.

4. **Distribution.** A Mapping Document MAY be distributed in any of the
   following ways:
   - **Bundled** alongside the Formspec Definition in a package or archive.
   - **Referenced** by URI from an external registry or configuration store.
   - **Inline** within a system-specific integration configuration (e.g.,
     an API gateway rule set), provided the Mapping Document retains its
     complete JSON structure.

5. **Retirement.** When a Mapping Document is no longer needed — because the
   external system has been decommissioned, the form has been retired, or a
   successor mapping has been published — the Mapping Document SHOULD be
   marked as deprecated and eventually removed from active registries.

[semver]: https://semver.org/spec/v2.0.0.html

### 2.4 Data Flow

Mapping execution follows a pipeline of discrete stages. The forward and
reverse paths are symmetric but traverse the pipeline in opposite directions.

#### 2.4.1 Forward Path (Response → External)

The forward path transforms a Formspec Response into an external data
structure:

```
┌──────────┐    ┌───────────┐    ┌─────────────┐    ┌──────────────┐    ┌───────────┐
│ Response │───▶│  Extract  │───▶│  Transform  │───▶│ Restructure  │───▶│ Serialize │
│          │    │           │    │             │    │              │    │           │
│ (source) │    │ Read each │    │ Apply FEL   │    │ Build target │    │ Emit JSON │
│          │    │ source    │    │ expressions,│    │ structure    │    │ / XML /   │
│          │    │ field     │    │ coercions,  │    │ (nesting,    │    │ CSV via   │
│          │    │ value     │    │ value maps  │    │ arrays,      │    │ Adapter   │
│          │    │           │    │             │    │ flattening)  │    │           │
└──────────┘    └───────────┘    └─────────────┘    └──────────────┘    └───────────┘
```

1. **Extract.** The engine reads each source field value from the Response's
   `data` object, following the source path declared in the Field Rule. For
   repeat sections, extraction iterates over all instances.

2. **Transform.** Each extracted value passes through the transforms declared
   in its Field Rule: FEL expression evaluation, type coercion, value
   map lookup, or default injection. Transforms execute in declared order.

3. **Restructure.** The transformed values are assembled into the target
   schema's structure. This stage handles path remapping (source path
   `a.b.c` → target path `x.y.z`), array construction, object nesting,
   and flattening.

4. **Serialize.** The restructured data is serialized to the target format
   by the appropriate Adapter. For JSON targets, this is a trivial identity
   operation. For XML and CSV targets, the Adapter applies format-specific
   rules (namespace prefixing, attribute placement, column ordering, quoting).

#### 2.4.2 Reverse Path (External → Response)

The reverse path transforms an external data structure into a Formspec
Response:

```
┌──────────┐    ┌───────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────┐
│ External │───▶│   Parse   │───▶│ Restructure  │───▶│  Transform  │───▶│ Response │
│          │    │           │    │              │    │             │    │          │
│ (source) │    │ Adapter   │    │ Map target   │    │ Apply       │    │ Inject   │
│          │    │ reads     │    │ paths back   │    │ reverse FEL │    │ into     │
│          │    │ JSON/XML/ │    │ to source    │    │ expressions,│    │ Response │
│          │    │ CSV       │    │ paths        │    │ coercions   │    │ data     │
└──────────┘    └───────────┘    └──────────────┘    └─────────────┘    └──────────┘
```

1. **Parse.** The Adapter deserializes the external format into the engine's
   internal JSON representation.

2. **Restructure.** The engine maps the external structure back to the
   Response's field hierarchy, using the target-to-source path
   correspondences declared in the Field Rules.

3. **Transform.** Each value passes through the reverse transforms. If a
   Field Rule declares an explicit `reverse` expression, that expression is
   evaluated. If the forward transform is lossless and invertible (e.g.,
   `preserve`, reversible type coercions), the engine derives the reverse
   transform automatically.

4. **Inject.** The transformed values are written into the Response's `data`
   object. The engine MUST NOT overwrite fields that are not covered by the
   Mapping Document. If the Response does not yet exist, the engine creates
   a new Response scaffold with `status` set to `"in-progress"`.

### 2.5 Relationship to §6.7 Migrations

The version-migration `fieldMap` defined in §6.7 of the Formspec core
specification is a **degenerate case** of a Mapping Document. Specifically:

| §6.7 Migration Concept | Mapping DSL Equivalent |
|-------------------------|------------------------|
| `source` (field path in old version) | Field Rule `sourcePath` |
| `target` (field path in new version, or `null`) | Field Rule `targetPath` (or `targetPath` absent with `transform: "drop"`) |
| `transform: "preserve"` | Field Rule with `transform: "preserve"` |
| `transform: "drop"` | Field Rule with `transform: "drop"` |
| `transform: "expression"` with `expression` | Field Rule with `transform: "expression"` and `expression` |
| `defaults` object | Mapping Document `defaults` section |

In a migration, both the source schema and target schema are Formspec
Responses — one pinned to an older Definition version, the other to the
current version. A Mapping Document generalizes this by allowing the target
schema to be any JSON structure, XML document, or CSV file.

A conformant Mapping DSL processor SHOULD be able to accept a §6.7 migration
descriptor and interpret it as a Mapping Document with the following
default assumptions:

- The source schema is a Formspec Response at version `from[version]`.
- The target schema is a Formspec Response at the enclosing Definition's
  version.
- The Adapter is the identity JSON adapter.
- All unmentioned fields follow the §6.7 pass-through rule: carried forward
  by path matching if the path exists in the target version, dropped
  otherwise.

> **Example.** The following §6.7 migration entry:
>
> ```json
> {
>   "source": "expenditures.other_costs",
>   "target": "expenditures.miscellaneous.total",
>   "transform": "preserve"
> }
> ```
>
> is equivalent to this Mapping DSL Field Rule:
>
> ```json
> {
>   "sourcePath": "expenditures.other_costs",
>   "targetPath": "expenditures.miscellaneous.total",
>   "transform": "preserve",
>   "bidirectional": true
> }
> ```

### 2.6 Design Principles

The following principles guide the design of the Mapping DSL. They are listed
in priority order; when principles conflict, higher-numbered principles yield
to lower-numbered ones.

1. **Declarative over imperative.** A Mapping Document describes *what* data
   goes where and *how* values are transformed, not the procedural steps to
   accomplish the mapping. The engine decides execution order, parallelism,
   and optimization strategy. Mapping Documents MUST NOT contain loops,
   variable assignments, or control-flow statements.

2. **FEL for computation.** All computed transforms — value derivations,
   conditional logic, string formatting, arithmetic — use the Formspec
   Expression Language. No second expression language is introduced. This
   ensures that form authors who already know FEL can author Mapping
   Documents without learning a new syntax, and that implementations can
   reuse their existing FEL evaluator.

3. **Composition over complexity.** Complex mappings SHOULD be expressed as
   compositions of simple Field Rules rather than as monolithic expressions.
   The DSL provides structural primitives (path remapping, array iteration,
   value maps) so that FEL expressions remain small and focused on value
   computation. If an expression exceeds a few lines, it is a signal that
   the mapping should be decomposed into multiple rules or that an
   intermediate field should be introduced.

4. **Explicit over implicit.** A Mapping Document SHOULD make all
   correspondences visible. Silent conventions — such as auto-mapping fields
   by matching names — are permitted as opt-in conveniences but MUST NOT be
   the default behavior. A reader of a Mapping Document SHOULD be able to
   determine the complete field mapping by reading the document alone,
   without inferring unstated rules.

5. **Bidirectional by default, with explicit opt-out.** Every Field Rule is
   assumed to be bidirectional unless the author explicitly marks it as
   forward-only or reverse-only. This default encourages round-trip data
   fidelity and makes lossy transforms visible. When a transform is
   inherently lossy (e.g., projecting multiple source fields into a single
   target field, dropping fields, truncating precision), the author MUST
   declare the rule as non-reversible. A conformant processor MUST report
   an error if a reverse mapping is attempted through a rule marked
   `"bidirectional": false`.

6. **Independence from transport and storage.** A Mapping Document declares
   data shape transformations, not how or when those transformations are
   triggered. Whether a mapping executes synchronously in an HTTP request
   handler, asynchronously in a message queue consumer, or as a batch
   nightly job is outside the scope of this specification. This separation
   allows the same Mapping Document to be reused across integration
   patterns without modification.

---

## 3. Mapping Document Schema

A Mapping Document is a JSON object that declaratively describes a bidirectional transform between a Formspec Response and an external schema. This section defines the normative structure of that document.

All property names are case-sensitive. Implementations MUST reject documents containing unrecognized properties at the root level unless those properties begin with `x-` (vendor extension prefix).

---

### 3.1 Top-Level Structure

The root of a Mapping Document is a JSON object. The following table enumerates all recognized properties.

<!-- schema-ref:start id=mapping-top-level schema=schemas/mapping.schema.json pointers=# -->
<!-- generated:schema-ref id=mapping-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecMapping` | `$formspecMapping` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Mapping specification version. MUST be '1.0'. |
| `#/properties/$schema` | `$schema` | <code>string</code> | no | — | URI identifying the version of the Mapping DSL specification this document conforms to. |
| `#/properties/adapters` | `adapters` | <code>object</code> | no | — | Adapter-specific configuration keyed by adapter identifier. The active adapter is determined by targetSchema.format. Built-in adapters: 'json' (Mapping Core), 'xml' and 'csv' (Mapping Extended). Custom adapters use x- prefix. |
| `#/properties/autoMap` | `autoMap` | <code>boolean</code> | no | default: <code>false</code> | When true, the processor generates synthetic 'preserve' rules (at priority -1) for every source field not already covered by an explicit rule's sourcePath. Synthetic rules use identical source and target paths. Explicit rules always take precedence. When targetSchema.format is 'csv', auto-mapped paths containing dots are silently skipped. |
| `#/properties/conformanceLevel` | `conformanceLevel` | <code>string</code> | no | enum: <code>"core"</code>, <code>"bidirectional"</code>, <code>"extended"</code> | Declares the minimum conformance level required to process this mapping document. 'core': forward JSON mapping only. 'bidirectional': adds reverse mapping with round-trip fidelity. 'extended': adds XML and CSV adapters. Each level is a strict superset of the preceding level. |
| `#/properties/defaults` | `defaults` | <code>object</code> | no | — | Leaf values applied to the target document before any Field Rules execute. Keys are dot-notation target paths; values are literal JSON values. Any Field Rule that writes to the same path will overwrite the default. Defaults are applied only in the forward direction. |
| `#/properties/definitionRef` | `definitionRef` | <code>string</code> | yes | critical | URI or stable identifier of the Formspec Definition this mapping targets. Corresponds to the Definition's 'url' property — the canonical identity that is stable across versions. |
| `#/properties/definitionVersion` | `definitionVersion` | <code>string</code> | yes | critical | Semver range of compatible Formspec Definition versions per node-semver syntax. An implementation MUST refuse to execute a Mapping Document when the resolved Definition version does not satisfy this range. |
| `#/properties/direction` | `direction` | <code>string</code> | no | enum: <code>"forward"</code>, <code>"reverse"</code>, <code>"both"</code>; default: <code>"forward"</code>; critical | Execution direction. 'forward': Response→External (default), reverse execution MUST raise an error. 'reverse': External→Response only, forward execution MUST raise an error. 'both': rules are evaluated in either direction; each Field Rule MAY supply an explicit reverse override. |
| `#/properties/extensions` | `extensions` | <code>object</code> | no | — | Document-level extension properties. All keys MUST be prefixed with 'x-'. |
| `#/properties/rules` | `rules` | <code>array</code> | yes | critical | Ordered array of Field Rule objects. Rules are sorted by priority (descending, stable sort) before execution. Equal-priority rules retain document order. When two rules write to the same targetPath, last-write-wins. MUST contain at least one element. |
| `#/properties/targetSchema` | `targetSchema` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/TargetSchema</code>; critical | Descriptor for the external system schema targeted by this mapping. Determines the adapter used for serialization and the path syntax rules for targetPath values. |
| `#/properties/version` | `version` | <code>string</code> | yes | pattern: <code>^(0&#124;[1-9]\d*)\.(0&#124;[1-9]\d*)\.(0&#124;[1-9]\d*)&#36;</code>; critical | Semantic version of this Mapping Document. Independent of both the Formspec Definition version and the DSL specification version. Implementations SHOULD use this for cache invalidation and change detection. |
<!-- schema-ref:end -->

The generated table above is the canonical structural contract for top-level mapping properties.

#### 3.1.1 Versioning

The `version` property tracks the Mapping Document's own revision history and is independent of both the Formspec Definition version and this specification's version. Implementations SHOULD use `version` for cache invalidation and change detection.

The `definitionVersion` property MUST be a valid semver range. An implementation MUST refuse to execute a Mapping Document when the resolved Formspec Definition version does not satisfy the stated range.

#### 3.1.2 Direction Semantics

| Value | Meaning |
|---|---|
| `"forward"` | Rules are evaluated source-to-target only. Reverse execution MUST raise an error. |
| `"reverse"` | Rules are evaluated target-to-source only. Forward execution MUST raise an error. |
| `"both"` | Rules are evaluated in either direction. Each Field Rule MAY supply an explicit `reverse` override (§ 3.3). |

#### 3.1.3 Example

The following Mapping Document maps a Formspec patient-intake form to an HL7 FHIR Patient resource.

```json
{
  "$schema": "https://formspec.org/mapping/v1/schema.json",
  "version": "1.2.0",
  "definitionRef": "https://clinic.example.com/forms/patient-intake",
  "definitionVersion": ">=1.0.0 <2.0.0",
  "targetSchema": {
    "format": "json",
    "name": "FHIR Patient R4",
    "url": "https://hl7.org/fhir/R4/patient.schema.json"
  },
  "direction": "both",
  "defaults": {
    "resourceType": "Patient",
    "meta.profile": ["https://hl7.org/fhir/R4/patient.html"]
  },
  "autoMap": false,
  "rules": [
    {
      "sourcePath": "patient_name.first",
      "targetPath": "name[0].given[0]",
      "transform": "preserve",
      "description": "Patient first name"
    },
    {
      "sourcePath": "patient_name.last",
      "targetPath": "name[0].family",
      "transform": "preserve"
    },
    {
      "sourcePath": "date_of_birth",
      "targetPath": "birthDate",
      "transform": "coerce",
      "coerce": {
        "from": "datetime",
        "to": "date",
        "format": "YYYY-MM-DD"
      }
    },
    {
      "sourcePath": "biological_sex",
      "targetPath": "gender",
      "transform": "valueMap",
      "valueMap": {
        "forward": {
          "male": "male",
          "female": "female",
          "intersex": "other",
          "prefer_not_to_say": "unknown"
        },
        "reverse": {
          "male": "male",
          "female": "female",
          "other": "intersex",
          "unknown": "prefer_not_to_say"
        },
        "unmapped": "drop",
        "default": "unknown"
      }
    },
    {
      "sourcePath": "insurance_provider",
      "targetPath": "extension[0]",
      "transform": "expression",
      "expression": "{ 'url': 'https://clinic.example.com/fhir/ext/insurance', 'valueString': $ }",
      "condition": "$ != null and $ != ''",
      "priority": 10,
      "description": "Map insurance to FHIR extension only when provided"
    },
    {
      "targetPath": "active",
      "transform": "constant",
      "expression": "true"
    }
  ],
  "adapters": {
    "x-fhir-r4": {
      "validateOnEmit": true,
      "profileUrl": "https://hl7.org/fhir/R4/patient.html"
    }
  }
}
```

---

### 3.2 Target Schema Descriptor

The `targetSchema` object describes the external data format that the Formspec Response is mapped to or from. Implementations use this descriptor for validation, serialization hints, and adapter selection.

| Property | Type | Required | Condition | Description |
|---|---|---|---|---|
| `format` | `string` | REQUIRED | — | The structural format of the target. MUST be one of `"json"`, `"xml"`, or `"csv"`. |
| `name` | `string` | RECOMMENDED | — | Human-readable name of the target schema (e.g. `"FHIR Patient R4"`). |
| `url` | `string` | OPTIONAL | — | Canonical URL or URI pointing to the target schema definition. |
| `rootElement` | `string` | CONDITIONAL | REQUIRED when `format` is `"xml"` | The local name of the root XML element in the target document. |
| `namespaces` | `object` | CONDITIONAL | REQUIRED when `format` is `"xml"` and namespaces are in use | A JSON object mapping namespace prefixes (strings) to namespace URI strings. The default namespace SHOULD use the key `""` (empty string). |

#### 3.2.1 Format-Specific Behavior

- **`"json"`** — Target paths use dot-notation with bracket indexing for arrays (e.g. `name[0].given[0]`). Implementations MUST produce and consume well-formed JSON per [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259).
- **`"xml"`** — Target paths use dot-notation where each segment corresponds to an element local name. Attribute paths MUST be prefixed with `@` (e.g. `Patient.name.@use`). Implementations MUST respect `rootElement` and `namespaces` during serialization.
- **`"csv"`** — Target paths are column header names. Nested paths MUST NOT be used; implementations MUST raise an error if a `targetPath` contains a dot when `format` is `"csv"`.

#### 3.2.2 Example (XML)

```json
{
  "format": "xml",
  "name": "CDA R2 ClinicalDocument",
  "url": "urn:hl7-org:v3",
  "rootElement": "ClinicalDocument",
  "namespaces": {
    "": "urn:hl7-org:v3",
    "xsi": "http://www.w3.org/2001/XMLSchema-instance"
  }
}
```

---

### 3.3 Field Rule Structure

A **Field Rule** is a JSON object that describes how a single datum (or set of data) is transformed between the source and target schemas. Field Rules are the fundamental unit of a Mapping Document.

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `sourcePath` | `string` | CONDITIONAL | — | Dot-path identifying the value in the source document. REQUIRED for all transforms except `"constant"` and `"drop"` (when used with only a `targetPath`). |
| `targetPath` | `string` | CONDITIONAL | — | Dot-path identifying the destination in the target document. REQUIRED for all transforms except `"drop"` (when used with only a `sourcePath`). |
| `transform` | `string` | REQUIRED | — | The transform type. See [§ 3.3.1](#331-transform-types). |
| `expression` | `string` | CONDITIONAL | — | A FEL expression. REQUIRED when `transform` is `"expression"`, `"constant"`, `"concat"`, or `"split"`. For `"flatten"` and `"nest"`, OPTIONAL when the rule uses only the structural modes defined in §4.7 and §4.8; REQUIRED when §4.7 or §4.8 specifies `expression` for non-trivial projection. Within the expression `$` binds to the resolved source value and `@source` binds to the entire source document. |
| `coerce` | `object` | CONDITIONAL | — | Coercion descriptor. REQUIRED when `transform` is `"coerce"`. See [§ 3.3.2](#332-coerce-object). |
| `valueMap` | `object` | CONDITIONAL | — | Value mapping descriptor. REQUIRED when `transform` is `"valueMap"`. See [§ 3.3.3](#333-valuemap-object). |
| `reverse` | `object` | OPTIONAL | — | Explicit override configuration applied when the rule is executed in the reverse direction. The object MAY contain any Field Rule property except `sourcePath`, `targetPath`, and `reverse` itself. |
| `bidirectional` | `boolean` | OPTIONAL | `true` | If `false`, the rule is skipped during reverse execution (even when `direction` is `"both"`). |
| `condition` | `string` | OPTIONAL | — | A FEL expression that MUST evaluate to a boolean. The rule is executed only when the expression evaluates to `true`. Bindings are the same as for `expression`. |
| `default` | *any* | OPTIONAL | — | Fallback value emitted when the `sourcePath` resolves to `undefined`, `null`, or is absent from the source document. |
| `array` | `object` | OPTIONAL | — | Array handling descriptor. See [§ 3.3.4](#334-array-object). |
| `description` | `string` | OPTIONAL | — | Human-readable description of the rule's intent. Implementations MUST ignore this property during execution. |
| `priority` | `integer` | OPTIONAL | `0` | Execution priority. Higher values execute first. See [§ 3.4](#34-field-rule-ordering-and-precedence). |

At least one of `sourcePath` or `targetPath` MUST be present. If both are omitted, implementations MUST raise a validation error.

When `array.innerRules` contains at least one nested rule, the parent rule SHOULD still declare `transform` (typically `"preserve"` when per-element work lives entirely in `innerRules`). The JSON Schema requires `transform` on every Field Rule for valid interchange. Conforming runtimes MAY accept a missing parent `transform` in that situation and treat it as `"preserve"` for execution; authors SHOULD not rely on that shorthand in documents that must validate everywhere.

#### 3.3.1 Transform Types

The `transform` property MUST be one of the following string values.

| Value | Behavior |
|---|---|
| `"preserve"` | Copy the source value to the target without modification. The source and target types SHOULD be compatible. |
| `"drop"` | Explicitly exclude the field from the output. When `sourcePath` is given, the source value is consumed and discarded. When `targetPath` is given, any value that would have been written (e.g. via `autoMap`) is suppressed. |
| `"expression"` | Evaluate the FEL `expression` and write its result to `targetPath`. |
| `"coerce"` | Convert the source value from one type to another according to the `coerce` descriptor. |
| `"valueMap"` | Replace the source value using the lookup table defined in the `valueMap` descriptor. |
| `"flatten"` | Collapse a nested source structure into a scalar or flat object at `targetPath`. Structural modes (delimited join, positional array keys, dot-prefix object keys) are defined in [§ 4.7](#47-flatten--collapse-nested-or-array-structures). The `expression` property is OPTIONAL for those modes and MUST be provided only when §4.7 requires it for non-trivial flattening (e.g. per-element projection before join). |
| `"nest"` | Expand a scalar or flat source into a nested structure at `targetPath`. Structural modes (delimited split, positional reassembly, dot-prefix nesting) are defined in [§ 4.8](#48-nest--expand-flat-structures-into-nested-form). The `expression` property is OPTIONAL for those modes; provide it only when §4.8 requires `expression` for an extension beyond those modes. |
| `"constant"` | Write a fixed value to `targetPath`. The value is defined by `expression`, which MUST be a FEL literal or deterministic expression. `sourcePath` MAY be omitted. |
| `"concat"` | Concatenate multiple source values into a single target string. `expression` defines the template (e.g. `@source.first + ' ' + @source.last`). |
| `"split"` | Split a single source value into multiple target values. `expression` defines the splitting logic and MUST return an array or object. |

#### 3.3.2 Coerce Object

| Property | Type | Required | Description |
|---|---|---|---|
| `from` | `string` | REQUIRED | Source data type. One of `"string"`, `"number"`, `"boolean"`, `"date"`, `"datetime"`, `"integer"`, `"array"`, `"object"`. |
| `to` | `string` | REQUIRED | Target data type. Same enumeration as `from`. |
| `format` | `string` | OPTIONAL | Format pattern applied during coercion (e.g. `"YYYY-MM-DD"` for date types, `"0.00"` for numeric formatting). |

Implementations MUST raise an error when the `from`/`to` combination is not supported by the runtime.

#### 3.3.3 ValueMap Object

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `forward` | `object` | REQUIRED | — | Key-value pairs mapping source values (keys) to target values (values) in the forward direction. |
| `reverse` | `object` | OPTIONAL | *inferred* | Key-value pairs for the reverse direction. If omitted, the implementation MUST infer the reverse map by inverting `forward`. If `forward` is not injective (multiple keys map to the same value), the implementation MUST raise an error rather than silently choose. |
| `unmapped` | `string` | OPTIONAL | `"error"` | Strategy when a source value has no matching key. One of `"error"` (raise), `"drop"` (omit field), `"passthrough"` (copy value unchanged), or `"default"` (use the rule `default` property; see §4.6). |
| `default` | *any* | OPTIONAL | — | Value to emit when `unmapped` is `"drop"` and a fallback is desired, or when the source value is `null`. |

`valueMap` MUST use the structured object shape with a `forward` map. Omitted `unmapped` defaults to **`"error"`** (§4.6).

#### 3.3.4 Array Object

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `mode` | `string` | REQUIRED | — | One of `"each"` (apply transform to every element), `"whole"` (treat the entire array as the source value), or `"indexed"` (apply positional inner rules). |
| `separator` | `string` | OPTIONAL | — | Delimiter used when `transform` is `"concat"` or `"split"` and the source or target is a delimited string. |
| `innerRules` | `array` | OPTIONAL | `[]` | An ordered array of Field Rule objects applied to each element when `mode` is `"each"` or `"indexed"`. Paths within inner rules are relative to the current array element. |

#### 3.3.5 Example

```json
{
  "sourcePath": "address.lines",
  "targetPath": "addr.streetAddressLine",
  "transform": "expression",
  "expression": "join($, ', ')",
  "reverse": {
    "transform": "split",
    "expression": "split($, ', ')"
  },
  "condition": "$ != null and count($) > 0",
  "default": "",
  "bidirectional": true,
  "array": {
    "mode": "whole"
  },
  "priority": 0,
  "description": "Flatten address lines into a single comma-separated string for the target schema."
}
```

---

### 3.4 Field Rule Ordering and Precedence

Field Rules are evaluated according to the following deterministic procedure:

1. **Priority sort.** Before execution, implementations MUST sort the `rules` array in descending order of `priority`. Rules with a higher `priority` value execute first.
2. **Stable order.** Rules that share the same `priority` MUST execute in the order in which they appear in the `rules` array (i.e. the sort MUST be stable).
3. **Condition guard.** Immediately before a rule executes, the implementation MUST evaluate its `condition` expression (if present). If the expression evaluates to `false`, the rule MUST be skipped entirely — no output is written, and no side-effects occur.
4. **Last-write wins.** When two or more rules write to the same `targetPath`, the rule that executes later overwrites the value produced by the earlier rule. Implementations SHOULD emit a diagnostic warning when this occurs, but MUST NOT treat it as an error.
5. **Default application.** Values in the top-level `defaults` object are written to the target *before* any rules execute. Any rule that writes to the same path as a default will overwrite it.

> **Note:** Because higher `priority` values execute first, a rule with `"priority": 10` will be overwritten by a later rule with `"priority": 0` targeting the same path. Authors who wish high-priority rules to take final precedence SHOULD use a `condition` guard on the lower-priority rule to avoid conflict, or omit the lower-priority rule.

---

### 3.5 Auto-Mapping

When the top-level `autoMap` property is `true`, the implementation MUST augment the explicit `rules` array with synthetic rules before execution.

#### 3.5.1 Synthetic Rule Generation

The implementation MUST perform the following steps:

1. **Enumerate source fields.** Collect every leaf-level path present in the source document.
2. **Exclude covered paths.** Remove any path that is referenced by `sourcePath` in an explicit rule (regardless of whether that rule's `condition` would evaluate to `true`).
3. **Generate preserve rules.** For each remaining path, produce a synthetic Field Rule equivalent to:

    ```json
    {
      "sourcePath": "<path>",
      "targetPath": "<path>",
      "transform": "preserve",
      "priority": -1
    }
    ```

4. **Inject.** Append the synthetic rules to the end of the sorted rule list. Because their `priority` is `-1`, they execute after all explicit rules at the default priority.

#### 3.5.2 Constraints

- Auto-mapping is **shallow by default**. Implementations MUST enumerate only top-level and directly nested scalar fields. Deeply nested objects or arrays MUST NOT be recursively expanded unless the implementation documents extended deep-mapping behavior.
- Explicit rules always take precedence. A `"drop"` rule with a matching `sourcePath` MUST suppress the corresponding auto-mapped rule.
- When `targetSchema.format` is `"csv"`, auto-mapped paths MUST NOT contain dots. Any source path with nesting MUST be silently skipped during auto-map generation.

#### 3.5.3 Example

Given a Formspec Response with fields `name`, `email`, and `age`, and a single explicit rule:

```json
{
  "autoMap": true,
  "rules": [
    {
      "sourcePath": "email",
      "targetPath": "contact.emailAddress",
      "transform": "preserve"
    }
  ]
}
```

The effective rule set at execution time is:

| # | `sourcePath` | `targetPath` | `transform` | Origin |
|---|---|---|---|---|
| 1 | `email` | `contact.emailAddress` | `preserve` | Explicit |
| 2 | `name` | `name` | `preserve` | Auto-mapped |
| 3 | `age` | `age` | `preserve` | Auto-mapped |

The field `email` is excluded from auto-mapping because it is already covered by an explicit rule.

---

## 4. Transform Operations

A **transform operation** defines how a source value is converted when mapped from `sourcePath` to `targetPath`. Every Field Rule MUST specify exactly one transform type via the `transform` property. The transform type determines which additional properties are required or permitted on the rule.

### 4.1 Transform Type Reference

| Type | Description | Auto-Reversible | Required Properties |
|------|-------------|-----------------|---------------------|
| `preserve` | Identity copy; value passes through unmodified | Yes | — |
| `drop` | Discard; target field is omitted | No | — |
| `expression` | Evaluate a FEL expression | No | `expression` |
| `coerce` | Convert value to a different type | Conditional | `coerce` |
| `valueMap` | Lookup-table substitution | Conditional | `valueMap` |
| `flatten` | Collapse nested structure into flat keys or string | Yes | — |
| `nest` | Expand flat keys or string into nested structure | Yes | — |
| `constant` | Emit a fixed value regardless of source | No | `expression` |
| `concat` | Join multiple source values into one string | No | `expression` |
| `split` | Split a single string into multiple target values | No | `expression` |

Implementations MUST reject a Field Rule whose `transform` value is not one of the types listed above.

### 4.2 `preserve` — Identity Copy

The `preserve` transform copies the source value to the target path without modification. The source value's type is retained.

```json
{
  "sourcePath": "applicant.full_name",
  "targetPath": "recipient.name",
  "transform": "preserve"
}
```

`preserve` is always auto-reversible. When a mapping is executed in reverse, the engine MUST copy the value from the original `targetPath` back to the original `sourcePath` with no additional configuration.

When source and target types are incompatible, implementations SHOULD attempt implicit coercion and SHOULD emit a diagnostic warning.

### 4.3 `drop` — Discard

The `drop` transform suppresses the source value; no corresponding property is written to the target document.

```json
{
  "sourcePath": "internal_notes",
  "targetPath": null,
  "transform": "drop"
}
```

`drop` is never reversible. A Field Rule with `"transform": "drop"` MUST have `bidirectional` set to `false` or absent (defaulting to `false` for drop rules). Implementations MUST emit a validation error if `"bidirectional": true` is explicitly set on a drop rule.

When `targetPath` is `null` or omitted on a `drop` rule, implementations MUST accept the rule without error. If `targetPath` is provided, the field at that path MUST still be omitted from output.

### 4.4 `expression` — FEL Evaluation

The `expression` transform evaluates a FEL expression string to compute the target value.

#### Binding Context

| Variable | Description |
|----------|-------------|
| `$` | The resolved source value at `sourcePath` |
| `@source` | The entire source document root |

Implementations MUST make both bindings available during expression evaluation. If `sourcePath` resolves to `undefined` or is absent, `$` MUST bind to `null`.

#### Reversibility

`expression` transforms are **not** auto-reversible. To enable reverse mapping, the rule MUST supply an explicit `reverse.expression`. Specifying `bidirectional: true` without a `reverse` block on an `expression` rule MUST produce a validation error.

#### Examples

**Arithmetic — convert dollars to cents:**

```json
{
  "sourcePath": "price_dollars",
  "targetPath": "price_cents",
  "transform": "expression",
  "expression": "round($ * 100)",
  "reverse": {
    "expression": "$ / 100"
  }
}
```

**String formatting — last-name-first display:**

```json
{
  "sourcePath": "applicant",
  "targetPath": "display_name",
  "transform": "expression",
  "expression": "format('{0}, {1}', @source.applicant.last_name, @source.applicant.first_name)",
  "bidirectional": false
}
```

**Conditional truncation — enforce max length:**

```json
{
  "sourcePath": "description",
  "targetPath": "short_description",
  "transform": "expression",
  "expression": "if(length($) > 140, substring($, 0, 137) + '...', $)",
  "bidirectional": false
}
```

Because truncation is lossy, no `reverse` block is provided and this rule MUST NOT be used bidirectionally.

### 4.5 `coerce` — Type Conversion

The `coerce` transform converts the source value from one type to another. The rule MUST include a `coerce` object with `from` and `to` properties.

#### Supported Conversions

| From ↓ \ To → | `string` | `number` | `integer` | `boolean` | `date` | `datetime` | `money` |
|---|---|---|---|---|---|---|---|
| **`string`** | — | ✔ | ✔ | ✔ | ✔ | ✔ | ✘ |
| **`number`** | ✔ | — | ✔ | ✔ | ✘ | ✘ | ✘ |
| **`integer`** | ✔ | ✔ | — | ✔ | ✘ | ✘ | ✘ |
| **`boolean`** | ✔ | ✔ | ✔ | — | ✘ | ✘ | ✘ |
| **`date`** | ✔ | ✘ | ✘ | ✘ | — | ✔ | ✘ |
| **`datetime`** | ✔ | ✘ | ✘ | ✘ | ✔³ | — | ✘ |
| **`money`** | ✔ | ✔⁴ | ✔⁴ | ✘ | ✘ | ✘ | — |

- ✔ = supported, ✘ = MUST reject at validation, — = identity (no-op)
- ³ `datetime→date`: **Lossy**; time component is discarded.
- ⁴ `money→number` / `money→integer`: **Lossy**; the currency code is discarded. Implementations SHOULD emit a warning.

#### Reversibility

A `coerce` transform is auto-reversible **only** when the conversion is non-lossy in both directions. Lossy conversions (marked ³ and ⁴ above) MUST NOT be auto-reversed. To reverse a lossy coercion, the rule MUST provide an explicit `reverse` block.

#### Coercion Rules

- **String → boolean:** `"true"`, `"yes"`, `"1"` (case-insensitive) coerce to `true`. `"false"`, `"no"`, `"0"`, `""` coerce to `false`. All other values MUST produce a runtime error.
- **Boolean → integer:** `true` → `1`, `false` → `0`.
- **Date/datetime → string:** The `format` property specifies the output pattern (e.g. `"YYYY-MM-DD"`). If `format` is omitted, ISO 8601 is the default.
- **Money → number:** Extracts the `amount` field. Currency is discarded.

#### Examples

**Date format coercion:**

```json
{
  "sourcePath": "date_of_birth",
  "targetPath": "dob",
  "transform": "coerce",
  "coerce": {
    "from": "date",
    "to": "string",
    "format": "MM/DD/YYYY"
  }
}
```

**Money to number (lossy, with explicit reverse):**

```json
{
  "sourcePath": "total_budget",
  "targetPath": "amount",
  "transform": "coerce",
  "coerce": {
    "from": "money",
    "to": "number"
  },
  "reverse": {
    "transform": "expression",
    "expression": "money($, 'USD')"
  }
}
```

### 4.6 `valueMap` — Lookup Table

The `valueMap` transform substitutes the source value using a static lookup table. The rule MUST include a `valueMap` object containing a `forward` map.

#### Reverse Derivation

If every value in `forward` is unique (i.e. the mapping is bijective), implementations MUST auto-derive the reverse map by inverting key–value pairs. If `forward` contains duplicate values, auto-reversal is impossible and a `reverse.valueMap.forward` block MUST be provided explicitly for bidirectional rules.

A rule MAY supply an explicit `reverse.valueMap.forward` to override the auto-derived inverse, even when the forward map is bijective.

#### Unmapped Value Strategies

| Strategy | Behavior |
|----------|----------|
| `"error"` | MUST produce a runtime mapping error. This is the default. |
| `"passthrough"` | Pass the source value through to the target unmodified. |
| `"drop"` | Omit the target field entirely. |
| `"default"` | Use the value specified in the rule's `default` property. The rule MUST define `default` when this strategy is selected. |

Implementations MUST apply the same `unmapped` strategy in both forward and reverse directions unless the `reverse` block specifies its own `unmapped` override.

#### Examples

**Option codes to external system codes:**

```json
{
  "sourcePath": "priority_level",
  "targetPath": "priority_code",
  "transform": "valueMap",
  "valueMap": {
    "forward": {
      "low": 1,
      "medium": 2,
      "high": 3,
      "critical": 4
    },
    "unmapped": "error"
  }
}
```

**Boolean to Y/N:**

```json
{
  "sourcePath": "is_active",
  "targetPath": "active_flag",
  "transform": "valueMap",
  "valueMap": {
    "forward": {
      "true": "Y",
      "false": "N"
    },
    "unmapped": "default",
    "default": "N"
  }
}
```

### 4.7 `flatten` — Collapse Nested or Array Structures

A Field Rule with `"transform": "flatten"` collapses a nested object or
array into a flat target representation. The engine MUST support three modes:

| Mode | Source Type | Behavior | Required Properties |
|------|-------------|----------|---------------------|
| **Delimited** | Array of scalars | Join elements into a delimited string | `separator` |
| **Positional** | Array | Map each element to `<targetPath>_0`, `<targetPath>_1`, … | None (default for arrays without `separator`) |
| **Dot-prefix** | Object | Flatten nested keys as dot-delimited paths | None (default for objects) |

Mode selection: array with `separator` → Delimited; array without →
Positional; object → Dot-prefix. For non-trivial flattening (e.g.,
extracting a property from each element before joining), an `expression`
MUST be provided; `$` is bound to the source value.

The `flatten` transform is **auto-reversible**, pairing with `nest` (§4.8).
Delimited reverses via split; Positional collects indexed fields; Dot-prefix
rebuilds nested objects.

> **Example 1 — Delimited.** Flatten tags to a comma-separated string.
>
> ```json
> {
>   "sourcePath": "metadata.tags",
>   "targetPath": "tags_csv",
>   "transform": "flatten",
>   "separator": ", "
> }
> ```
>
> Source: `{"metadata": {"tags": ["urgent", "fiscal", "Q3"]}}`
> Target: `{"tags_csv": "urgent, fiscal, Q3"}`

> **Example 2 — Dot-prefix.** Flatten a nested address object.
>
> ```json
> {
>   "sourcePath": "applicant.address",
>   "targetPath": "addr",
>   "transform": "flatten"
> }
> ```
>
> Source: `{"applicant": {"address": {"street": "100 Main St", "city": "Springfield"}}}`
> Target: `{"addr.street": "100 Main St", "addr.city": "Springfield"}`

---

### 4.8 `nest` — Expand Flat Structures into Nested Form

A Field Rule with `"transform": "nest"` is the inverse of `flatten`. It expands a flat source into a nested target. Mode is inferred from source
shape:

- Delimited string + `separator` → split into array.
- Positionally-named fields (`<sourcePath>_0`, `_1`, …) → ordered array.
- Dot-prefixed fields (`<sourcePath>.child.leaf`) → nested object.

The `nest` transform is **auto-reversible** and pairs with `flatten`.

> **Example 1 — String to array.** Split a pipe-delimited string.
>
> ```json
> {
>   "sourcePath": "skill_list",
>   "targetPath": "applicant.skills",
>   "transform": "nest",
>   "separator": "|"
> }
> ```
>
> Source: `{"skill_list": "Python|SQL|Formspec"}`
> Target: `{"applicant": {"skills": ["Python", "SQL", "Formspec"]}}`

> **Example 2 — Dot-prefixed keys to object.**
>
> ```json
> {
>   "sourcePath": "contact_info",
>   "targetPath": "contact",
>   "transform": "nest"
> }
> ```
>
> Source: `{"contact_info.name": "Jane Doe", "contact_info.email": "jane@example.com"}`
> Target: `{"contact": {"name": "Jane Doe", "email": "jane@example.com"}}`

---

### 4.9 `constant` — Fixed Value Injection

A Field Rule with `"transform": "constant"` writes a fixed value to the
target. `sourcePath` is NOT REQUIRED and MUST be ignored if present.
`expression` provides the literal value as a FEL expression. It MAY
reference `@source` but SHOULD NOT, since the intent is source-independent
injection.

The `constant` transform is **not reversible**. If `"bidirectional": true`
is set, a conformant processor MUST report a validation error.

> **Example.** Inject a fixed API version.
>
> ```json
> {
>   "targetPath": "api_version",
>   "transform": "constant",
>   "expression": "'2024-07-01'",
>   "bidirectional": false
> }
> ```

---

### 4.10 `concat` — Multiple Sources to Single Target String

A Field Rule with `"transform": "concat"` combines multiple source fields
into a single target string. `sourcePath` is NOT REQUIRED; the `expression`
MUST be a FEL expression referencing source fields via `@source`. The
expression MUST evaluate to a string; non-string results are coerced via
FEL's `string()` function.

The `concat` transform is **not auto-reversible** (boundary information is
lost). `"bidirectional": true` MUST NOT be set unless an explicit `reverse`
expression is provided.

> **Example.** Combine first and last name.
>
> ```json
> {
>   "targetPath": "full_name",
>   "transform": "concat",
>   "expression": "@source.applicant.first_name + ' ' + @source.applicant.last_name",
>   "bidirectional": false
> }
> ```
>
> Source: `{"applicant": {"first_name": "Maria", "last_name": "Santos"}}`
> Target: `{"full_name": "Maria Santos"}`

---

### 4.11 `split` — Single Source to Multiple Targets

A Field Rule with `"transform": "split"` decomposes a single source value
into multiple target fields. `expression` MUST return an object (keys
appended to `targetPath`) or array (indices as positional suffixes). `$` is
bound to the source value; `@source` to the full document.

> **Example.** Split an address string into structured fields.
>
> ```json
> {
>   "sourcePath": "address_line",
>   "targetPath": "address",
>   "transform": "split",
>   "expression": "let parts = split($, ', ') in {street: parts[0], city: parts[1], state: parts[2]}"
> }
> ```
>
> Source: `{"address_line": "100 Main St, Springfield, IL"}`
> Target: `{"address": {"street": "100 Main St", "city": "Springfield", "state": "IL"}}`

---

### 4.12 Array Operations

The `array` object on a Field Rule controls how array-valued source
fields — including Formspec repeat groups — are mapped. When present,
`array` MUST contain a `mode` property.

#### 4.12.1 `array` Object Schema

| Property | Type | Required | Description |
|------------|--------|----------|-------------|
| `mode` | string | REQUIRED | `"each"`, `"whole"`, or `"indexed"` |
| `separator` | string | OPTIONAL | Delimiter for string serialization. Valid only with `"whole"`. |
| `innerRules` | array | OPTIONAL | Nested Field Rules with element-relative paths. |

#### 4.12.2 `mode: "each"`

Iterate every source element, applying `transform`/`expression` or
`innerRules` per element. Within scope: `$` = current element, `$index` =
zero-based index, `@source` = full document. Paths in `innerRules` resolve
relative to the current element. Target MUST contain one output element per
source element, in order.

#### 4.12.3 `mode: "whole"`

Treat the entire array as a single value (`$` = complete array). Appropriate
for aggregate operations (sum, filter, join).

#### 4.12.4 `mode: "indexed"`

Apply `innerRules` by positional index. Each inner rule MUST include an
`index` property (integer). Uncovered elements are **dropped**.

#### 4.12.5 Complete Example — Repeat Group to API Array

**Source (Formspec Response — repeat group with `description`, `amount`,
`category`):**

```json
{
  "budget_items": [
    { "description": "Travel expenses", "amount": 1500.00, "category": "travel" },
    { "description": "Equipment",       "amount": 3200.50, "category": "supplies" },
    { "description": "Contractor fees", "amount": 8000.00, "category": "personnel" }
  ]
}
```

**Field Rule:**

```json
{
  "sourcePath": "budget_items",
  "targetPath": "line_items",
  "transform": "preserve",
  "array": {
    "mode": "each",
    "innerRules": [
      { "sourcePath": "description", "targetPath": "label",  "transform": "preserve" },
      { "sourcePath": "amount",      "targetPath": "value",  "transform": "coerce", "coerce": "string" },
      { "sourcePath": "category",    "targetPath": "type",   "transform": "valueMap",
        "valueMap": { "forward": { "travel": "TRAVEL", "supplies": "EQUIP", "personnel": "PERS" } } }
    ]
  }
}
```

**Target (External API):**

```json
{
  "line_items": [
    { "label": "Travel expenses", "value": "1500",   "type": "TRAVEL" },
    { "label": "Equipment",       "value": "3200.5", "type": "EQUIP" },
    { "label": "Contractor fees", "value": "8000",   "type": "PERS" }
  ]
}
```

The engine iterates `budget_items`, applies inner rules per element using
element-relative paths, and assembles `line_items`. For reverse mapping,
inner rules invert per-element: `valueMap` reverses (§4.6), `coerce`
reverses to the original type, `preserve` is symmetric.

---

### 4.13 Conditional Mapping

A Field Rule MAY include a `condition` property — a FEL expression
evaluating to a boolean. If `condition` evaluates to `false` or `null`, the
engine MUST skip the entire rule: no target value is written, no side
effects occur.

Within `condition`: `$` is bound to the `sourcePath` value (or `null` if
absent); `@source` is bound to the full source document.

The `condition` is evaluated **before** any transform or expression. A
skipped rule MUST NOT produce an error even if its `expression` or
`sourcePath` would be invalid for the given input.

#### 4.13.1 Branching

Multiple Field Rules MAY target the same `targetPath` with mutually
exclusive `condition` expressions. A conformant processor SHOULD warn (but
MUST NOT error) if conditions are not provably exclusive. When multiple
rules targeting the same path evaluate to `true`, the **last rule in
document order** wins.

#### 4.13.2 Reverse Direction

During reverse mapping, `condition` is evaluated against the external
document (the reverse-direction source). `$` and `@source` bind to
external values. Authors SHOULD ensure conditions are meaningful in both
directions, or provide a `reverse.condition` override.

> **Example — Type-discriminated branching.** Route different source fields
> to the same target based on a type discriminator.
>
> ```json
> [
>   {
>     "sourcePath": "business_email",
>     "targetPath": "contact.email",
>     "transform": "preserve",
>     "condition": "@source.contact_type == 'organization'"
>   },
>   {
>     "sourcePath": "personal_email",
>     "targetPath": "contact.email",
>     "transform": "preserve",
>     "condition": "@source.contact_type == 'individual'"
>   }
> ]
> ```
>
> When `contact_type` is `"organization"`, `business_email` maps to
> `contact.email`. When `"individual"`, `personal_email` maps instead.

---

## 5. Bidirectional Semantics

### 5.1 Forward and Reverse Execution

A Mapping Engine operates in one of two **directions**:

| Direction | Source | Target |
|-----------|--------|--------|
| **Forward** | Formspec Response | External schema (default) |
| **Reverse** | External schema | Formspec Response |

The top-level `direction` property controls the default: `"forward"` (default
if omitted), `"reverse"`, or `"both"`. Individual Field Rules declare
directional participation via `bidirectional` (§5.4). A Mapping Core processor
MAY ignore `bidirectional` and support only forward execution.

### 5.2 Auto-Reversal

A transform is **auto-reversible** when the engine can derive its inverse
without an explicit `reverse` block.

| Transform | Auto-Reversible | Inverse | Conditions |
|-----------|:-:|---|---|
| `preserve` | Yes | `preserve` | Identity is its own inverse. |
| `drop` | No | — | Value discarded. |
| `expression` | No | — | Arbitrary FEL; not generally invertible. |
| `coerce` | Conditional | `coerce` (inverse pair) | Only for lossless type pairs (see below). |
| `valueMap` | Conditional | `valueMap` (inverted) | Only when the map is bijective. |
| `flatten` | Yes | `nest` | Structural inverse (§4.7–4.8). |
| `nest` | Yes | `flatten` | Structural inverse (§4.7–4.8). |
| `constant` | No | — | No source value to recover. |
| `concat` | No | — | Segment boundaries lost. |
| `split` | No | — | Join order ambiguous. |

**Lossless coercion pairs** (auto-reversible in both directions):

| From → To | Notes |
|-----------|-------|
| `string` ↔ `integer` | String must be a valid integer literal. |
| `string` ↔ `number` | String must be a valid JSON number; implementation MUST preserve full decimal precision. |
| `string` ↔ `boolean` | Only `"true"`/`"false"` (case-insensitive). |
| `date` ↔ `string` | Lossless when ISO 8601 format is specified. |

Pairs not listed (e.g., `number` → `integer`, `money` → `number`) are lossy
and MUST NOT be auto-reversed. When the engine encounters an auto-reversible
rule during reverse execution, it MUST apply the derived inverse automatically.

### 5.3 Explicit Reverse Overrides

A Field Rule MAY include a `reverse` object that overrides auto-derivation.
Permitted properties:

| Property | Type | Description |
|----------|------|-------------|
| `transform` | string | Reverse transform type. |
| `expression` | string | FEL expression for reverse. |
| `coerce` | string | Target type for reverse coercion. |
| `valueMap` | object | Reverse value map. |
| `default` | any | Default when external field is absent. |

`sourcePath` and `targetPath` are swapped automatically during reverse
execution. The `reverse` block MUST NOT re-specify them; a conformant
processor MUST report a validation error if either appears inside `reverse`.

```json
{
  "sourcePath": "income.annual",
  "targetPath": "annualIncome",
  "transform": "expression",
  "expression": "$.income.annual / 100",
  "bidirectional": true,
  "reverse": {
    "transform": "expression",
    "expression": "$.annualIncome * 100"
  }
}
```

### 5.4 Lossy Transforms and Non-Reversibility

> **Definition.** A transform *T* is **lossy** if there exist distinct source
> values *s₁* ≠ *s₂* such that *T(s₁)* = *T(s₂)*.

Inherently lossy transforms include: `drop`, `expression` (without explicit
`reverse`), lossy `coerce` pairs, many-to-one `valueMap`, `concat`, and
`split`.

A Field Rule whose forward transform is lossy MUST set `"bidirectional":
false`. A processor MUST report a validation error if a lossy rule declares
`"bidirectional": true` without an explicit `reverse` block. Attempting
reverse execution through a rule marked `"bidirectional": false` MUST produce
an error; the processor MUST NOT silently skip the rule.

### 5.5 Round-Trip Fidelity

Let *M* be a Mapping Document, *F_M* the forward mapping, *R_M* the reverse
mapping, and *P(R)* the projection of Response *R* onto source paths covered
by *M*.

> **Response Round-Trip.** For every valid Response *R*:
> *P( R_M( F_M( R ) ) )* = *P( R )*

> **External Round-Trip.** For every valid Response *R*:
> *F_M( R_M( F_M( R ) ) )* = *F_M( R )*

Fields not covered by any Field Rule MUST be left untouched by both forward
and reverse execution. A processor claiming **Mapping Bidirectional**
conformance (§1.5.2) MUST satisfy both properties for all Mapping Documents
whose Field Rules are all declared `"bidirectional": true`, subject to
precision and coercion rules in §4.5 and §5.2.

### 5.6 Conflict Resolution in Reverse Mapping

When multiple external fields resolve to the same Response path during reverse
mapping:

1. **Last-rule-wins.** Rules evaluate in document order; the last rule
   writing to a given path prevails.
2. **Warning.** The processor SHOULD emit a diagnostic warning identifying
   the conflicting rules and affected path.
3. **Explicit precedence.** A Field Rule MAY declare `"reversePriority"` (a
   non-negative integer). The highest `reversePriority` wins regardless of
   document order; equal priorities fall back to last-rule-wins.

```json
[
  { "sourcePath": "fullName", "targetPath": "displayName",
    "transform": "preserve", "bidirectional": true, "reversePriority": 10 },
  { "sourcePath": "fullName", "targetPath": "legalName",
    "transform": "preserve", "bidirectional": true, "reversePriority": 20 }
]
```

In reverse, both rules write to `fullName`; `legalName` prevails (higher
priority).

---

## 6. Format Adapters

### 6.1 Adapter Architecture

Adapters decouple transform logic from wire formats. An Adapter implements:

| Operation | Signature | Description |
|-----------|-----------|-------------|
| **serialize** | `(JSONValue) → bytes` | Internal JSON → wire format. |
| **deserialize** | `(bytes) → JSONValue` | Wire format → internal JSON. |

Three built-in adapters are defined:

| Adapter | Conformance Level | Wire Format |
|---------|-------------------|-------------|
| JSON | Mapping Core | [RFC 8259] |
| XML | Mapping Extended | XML 1.0 |
| CSV | Mapping Extended | [RFC 4180] |

The active adapter is determined by `targetSchema.format`. When omitted, the
JSON adapter MUST be used. Implementations MAY support custom adapters (§6.5).

### 6.2 JSON Adapter

The JSON adapter performs **identity serialization** — the engine's internal
representation is already JSON. Target paths use dot-notation with bracket
indexing (`user.tags[0]`). Intermediate objects and arrays MUST be created
automatically.

**Configuration** (`adapters.json`):

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `pretty` | boolean | `false` | Emit indented JSON. |
| `sortKeys` | boolean | `false` | Sort object keys lexicographically. |
| `nullHandling` | string | `"include"` | `"include"` or `"omit"` (suppress `null`-valued keys). |

```json
{ "adapters": { "json": { "pretty": true, "nullHandling": "omit" } } }
```

### 6.3 XML Adapter (Mapping Extended)

The XML adapter serializes internal JSON as an XML 1.0 document.

**Target path conventions:**

| Syntax | Meaning | Example Output |
|--------|---------|----------------|
| `a.b.c` | Nested elements | `<a><b><c>…</c></b></a>` |
| `a.b.@id` | Attribute on parent | `<a><b id="…"/></a>` |
| `a.b[0].c` | Repeated sibling | First `<b><c>…</c></b>` under `<a>` |

Namespace prefixes use colon notation in paths (`xsi:type`). The
`targetSchema` MUST declare `rootElement` and MAY declare `namespaces`:

```json
{ "targetSchema": {
    "format": "xml", "rootElement": "Order",
    "namespaces": { "": "urn:example:orders:v2" }
} }
```

**Configuration** (`adapters.xml`):

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `declaration` | boolean | `true` | Include `<?xml?>` declaration. |
| `indent` | integer | `2` | Spaces per level; `0` disables. |
| `cdata` | string[] | `[]` | Paths whose content is wrapped in `CDATA`. |

**Example.** Given rules mapping `orderId` → `order.@id`, `customer` →
`order.customer`, and `notes` → `order.notes` (with `cdata: ["order.notes"]`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Order xmlns="urn:example:orders:v2" id="12345">
  <customer>Acme Corp</customer>
  <notes><![CDATA[Handle with care & urgency]]></notes>
</Order>
```

### 6.4 CSV Adapter (Mapping Extended)

The CSV adapter serializes internal JSON as [RFC 4180] delimited text.

**Structural constraint.** All target paths MUST be simple identifiers (no
dot-notation or brackets). A nested target path MUST produce a validation
error.

**Repeat groups.** Each repeat-section iteration emits a separate row.
Fields outside the repeat group are duplicated across rows.

**Configuration** (`adapters.csv`):

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `delimiter` | string | `","` | Field delimiter. |
| `quote` | string | `"\""` | Quote character. |
| `header` | boolean | `true` | Emit header row. |
| `encoding` | string | `"utf-8"` | Character encoding. |
| `lineEnding` | string | `"crlf"` | `"crlf"` or `"lf"`. |

**Example.** Source with `orderId: "ORD-99"` and repeat items
`[{sku:"A1", qty:2}, {sku:"B3", qty:5}]`:

```csv
order_id,sku,quantity
ORD-99,A1,2
ORD-99,B3,5
```

### 6.5 Custom Adapters

Implementations MAY register custom adapters by string identifier. Custom
identifiers MUST begin with the `x-` prefix. Configuration is placed under
`adapters.<identifier>`:

```json
{ "targetSchema": { "format": "x-protobuf" },
  "adapters": { "x-protobuf": { "protoFile": "order.proto",
    "messageType": "example.Order" } } }
```

Custom adapters MUST implement the same `serialize`/`deserialize` interface
(§6.1). The configuration schema is adapter-defined and outside the scope of
this specification. A processor encountering an unrecognized adapter identifier
MUST report a diagnostic error and MUST NOT silently fall back to JSON.

---

## 7. Processing Model

### 7.1 Execution Pipeline

A conformant Mapping Engine MUST execute a Mapping Document through the
following ordered pipeline. Implementations MAY optimize internal
representations but MUST produce results indistinguishable from this
sequential model.

| Step | Name | Description |
|------|------|-------------|
| 1 | **Validate** | Parse the Mapping Document as JSON ([RFC 8259]). Verify conformance to the Mapping DSL schema (§3). Confirm `definitionVersion` compatibility with the source Response. Halt on any validation error (§7.2). |
| 2 | **Resolve direction** | Read `direction` (`"forward"` / `"reverse"` / `"both"`; default `"forward"`). Select the active direction. Filter Field Rules to those participating in the active direction (§5.4). |
| 3 | **Apply defaults** | Write each key-value pair from `defaults` to the target. Defaults MUST NOT overwrite values subsequently written by Field Rules. |
| 4 | **Generate auto-map rules** | If `"autoMap": true`, synthesize a `preserve` rule for every source field not already covered by an explicit rule. Synthesized rules MUST have lower priority than all explicit rules. |
| 5 | **Sort rules** | Order all Field Rules by `priority` descending. Equal-priority rules MUST retain document order (stable sort). |
| 6 | **Execute rules** | For each rule: **(a)** evaluate `condition` — skip if `false`/`null`; **(b)** resolve `sourcePath`; **(c)** apply `transform`; **(d)** write result to `targetPath`. |
| 7 | **Serialize** | Pass the target document to the active Adapter (§6). |

During **reverse** execution, source and target roles swap per §5.1.
Step 6 applies reverse transforms (auto-derived or explicit `reverse`
blocks) per §5.2–5.3.

### 7.2 Error Handling

Errors fall into four categories:

| Category | Examples | Behavior |
|----------|----------|----------|
| **Validation** | Malformed JSON, missing required properties, unknown transform type, invalid FEL syntax, `definitionVersion` out of range. | MUST halt before Step 6. |
| **Resolution** | `sourcePath` not found, runtime version mismatch. | If `default` exists, use it and continue. Otherwise produce a diagnostic (non-fatal). |
| **Transform** | Coercion failure, unmapped `valueMap` value with `"error"` strategy, FEL runtime exception. | Produce a diagnostic. Non-fatal; continue with remaining rules. |
| **Adapter** | Nested path in CSV, encoding error, namespace conflict. | MUST halt. Partial output MUST NOT be emitted. |

Processors MUST collect all non-fatal diagnostics as an ordered array of
**Diagnostic** objects:

```json
{ "ruleIndex": 3,
  "sourcePath": "budget_items[2].amount",
  "targetPath": "lineItems[2].value",
  "errorCode": "COERCE_FAILURE",
  "message": "Cannot coerce 'TBD' to type integer." }
```

| Property | Type | Description |
|----------|------|-------------|
| `ruleIndex` | integer | Zero-based rule index; `-1` if not rule-specific. |
| `sourcePath` | string | Resolved source path at failure. |
| `targetPath` | string | Declared target path. |
| `errorCode` | string | Machine-readable code (see below). |
| `message` | string | Human-readable description. |

**Standard error codes:** `INVALID_DOCUMENT`, `VERSION_MISMATCH`,
`INVALID_FEL` (validation); `PATH_NOT_FOUND` (resolution);
`COERCE_FAILURE`, `UNMAPPED_VALUE`, `FEL_RUNTIME` (transform);
`ADAPTER_FAILURE` (adapter).

### 7.3 Null and Absent Value Handling

Formspec Responses distinguish **absent** fields from **explicit null**.
The engine MUST handle each case as follows:

| Scenario | `preserve` | `expression` | `coerce` | `valueMap` |
|----------|-----------|-------------|---------|----------|
| Absent + `default` | Write `default`. | Write `default` (skip expression). | Write `default`. | Write `default`. |
| Absent, no `default` | Omit target. | Evaluate with `$` = `null`. | Omit target. | Omit target. |
| Explicit `null` | Write `null`. | Evaluate with `$` = `null`. | Write `null` (no error). | Look up `null` key; if missing, apply `unmapped` strategy. |

### 7.4 Idempotency

Forward mapping MUST be **idempotent**: *F_M(R)* = *F_M(R)* for all
invocations over the same Response *R* and Mapping Document *M*.
Implementations MUST NOT introduce non-determinism (random IDs,
timestamps, hash-map iteration order) unless the Mapping Document
explicitly invokes a non-deterministic FEL function. Reverse mapping
is similarly idempotent over the same external input.

---

## 8. Examples

### 8.1 Grant Application to Federal API

Maps a Formspec grant form (`applicant_name`, `ein`, `budget_total`,
`budget_items` repeat, `narrative`) to a federal API payload
(`organization.name`, `organization.taxId`, `financials.requestedAmount`,
`lineItems[]`, `projectDescription`).

```json
{
  "$schema": "https://formspec.org/schemas/mapping/1.0",
  "version": "1.0.0",
  "definitionRef": "https://grants.example.gov/forms/sf-424",
  "definitionVersion": ">=3.0.0 <4.0.0",
  "direction": "forward",
  "targetSchema": { "format": "json" },
  "defaults": { "submissionType": "initial", "schemaVersion": "2024-07-01" },
  "rules": [
    { "sourcePath": "applicant_name",
      "targetPath": "organization.name",  "transform": "preserve" },
    { "sourcePath": "ein",
      "targetPath": "organization.taxId", "transform": "expression",
      "expression": "replace($, '-', '')",
      "bidirectional": true,
      "reverse": {
        "transform": "expression",
        "expression": "substring($, 0, 2) + '-' + substring($, 2)" } },
    { "sourcePath": "budget_total",
      "targetPath": "financials.requestedAmount",
      "transform": "coerce", "coerce": "number" },
    { "sourcePath": "budget_items", "targetPath": "lineItems",
      "transform": "preserve",
      "array": { "mode": "each", "innerRules": [
        { "sourcePath": "description", "targetPath": "label",  "transform": "preserve" },
        { "sourcePath": "amount",      "targetPath": "value",  "transform": "coerce", "coerce": "string" },
        { "sourcePath": "category",    "targetPath": "type",   "transform": "valueMap",
          "valueMap": { "forward": { "travel": "TRAVEL", "supplies": "EQUIP",
                        "personnel": "PERS", "other": "MISC" } } }
      ] } },
    { "sourcePath": "narrative",
      "targetPath": "projectDescription", "transform": "preserve" }
  ]
}
```

**Key rules:** The `ein` rule strips the dash via `expression` and provides
an explicit `reverse` to re-insert it, enabling round-trip fidelity.
The `budget_items` rule uses `array.mode: "each"` with `innerRules` to
remap each repeat entry's fields and translate `category` codes via
`valueMap`. The `defaults` block injects required API envelope fields.

### 8.2 Patient Intake to CSV Export

Maps a patient intake form (`name`, `dob`, `medications` repeat,
`allergies` array) to a flat CSV with positional medication columns and a
delimited allergy list.

```json
{
  "$schema": "https://formspec.org/schemas/mapping/1.0",
  "version": "1.0.0",
  "definitionRef": "https://clinic.example.com/forms/intake",
  "definitionVersion": "1.x",
  "direction": "forward",
  "targetSchema": { "format": "csv" },
  "adapters": { "csv": { "delimiter": ",", "header": true } },
  "rules": [
    { "sourcePath": "name", "targetPath": "patient_name",  "transform": "preserve" },
    { "sourcePath": "dob",  "targetPath": "date_of_birth", "transform": "coerce", "coerce": "string" },
    { "sourcePath": "medications", "targetPath": "medication",
      "transform": "flatten",
      "array": { "mode": "indexed", "innerRules": [
        { "index": 0, "targetPath": "medication_1", "sourcePath": "name", "transform": "preserve" },
        { "index": 1, "targetPath": "medication_2", "sourcePath": "name", "transform": "preserve" },
        { "index": 2, "targetPath": "medication_3", "sourcePath": "name", "transform": "preserve" },
        { "index": 3, "targetPath": "medication_4", "sourcePath": "name", "transform": "preserve" },
        { "index": 4, "targetPath": "medication_5", "sourcePath": "name", "transform": "preserve" }
      ] } },
    { "sourcePath": "allergies", "targetPath": "allergy_list",
      "transform": "flatten", "separator": "; " }
  ]
}
```

**Key rules:** `medications` uses `mode: "indexed"` to map up to five
repeat entries to positional columns; absent entries produce empty CSV
cells. `allergies` uses `flatten` with `separator` to join the array.
All `targetPath` values are simple identifiers per the CSV structural
constraint (§6.4).

### 8.3 Bidirectional FHIR Integration

Round-trip mapping between a Formspec vitals form and an [HL7 FHIR
Observation][fhir-obs] resource.

[fhir-obs]: https://www.hl7.org/fhir/observation.html

```json
{
  "$schema": "https://formspec.org/schemas/mapping/1.0",
  "version": "1.0.0",
  "definitionRef": "https://ehr.example.com/forms/vitals",
  "definitionVersion": "2.x",
  "direction": "both",
  "targetSchema": { "format": "json" },
  "defaults": { "resourceType": "Observation", "status": "final" },
  "rules": [
    { "sourcePath": "reading_code",  "targetPath": "code.coding[0].code",    "transform": "preserve" },
    { "sourcePath": "reading_label", "targetPath": "code.coding[0].display", "transform": "preserve" },
    { "sourcePath": "value",         "targetPath": "valueQuantity.value",    "transform": "coerce", "coerce": "number" },
    { "sourcePath": "unit",          "targetPath": "valueQuantity.unit",     "transform": "preserve" },
    { "sourcePath": "recorded_at",   "targetPath": "effectiveDateTime",
      "transform": "coerce", "coerce": "string" },
    { "sourcePath": "notes",         "targetPath": "note[0].text",           "transform": "preserve" },
    { "targetPath": "resourceType",  "transform": "constant",
      "expression": "'Observation'", "bidirectional": false }
  ]
}
```

**Round-trip behavior:** `preserve` and lossless `coerce` rules auto-reverse
(§5.2). The `constant` rule (`resourceType`) is forward-only; during reverse
execution it is skipped. `defaults` apply only to the forward target.

---

## Appendix A. Relationship to §6.7 Migrations (Normative)

This appendix defines the formal algorithm for converting a §6.7 version
migration descriptor into a Mapping Document.

### A.1 Conversion Algorithm

Given a §6.7 migration descriptor *D* with source version *V_src*:

1. Create Mapping Document *M*: `direction: "forward"`, `version: "1.0.0"`,
   `definitionVersion`: *V_src*.
2. Set `targetSchema.format: "json"`.
3. For each entry *e* in *D*.`fieldMap`:
   - *r*.`sourcePath` ← *e*.`source`.
   - If *e*.`target` is `null`: set `transform: "drop"`,
     `bidirectional: false`. No `targetPath`.
   - Else: *r*.`targetPath` ← *e*.`target`, *r*.`transform` ← *e*.`transform`.
   - If *e*.`transform` is `"expression"`: *r*.`expression` ← *e*.`expression`,
     *r*.`bidirectional` ← `false` (FEL expressions are not auto-reversible).
4. Copy *D*.`defaults` to *M*.`defaults`.
5. Set `autoMap: true` — replicating §6.7's pass-through semantics for
   fields not mentioned in `fieldMap`.

### A.2 Example

**§6.7 migration descriptor:**

```json
{ "migrations": { "from": { "2.1.0": {
  "description": "Restructured budget section",
  "fieldMap": [
    { "source": "expenditures.other_costs",
      "target": "expenditures.miscellaneous.total", "transform": "preserve" },
    { "source": "indirect_rate", "target": null, "transform": "drop" },
    { "source": "pi_name",
      "target": "principal_investigator.full_name",
      "transform": "expression", "expression": "upper($)" }
  ],
  "defaults": {
    "expenditures.miscellaneous.description": "",
    "reporting.frequency": "quarterly"
  }
} } } }
```

**Equivalent Mapping Document:**

```json
{
  "$schema": "https://formspec.org/schemas/mapping/1.0",
  "version": "1.0.0",
  "definitionRef": "https://example.gov/forms/expenditure-report",
  "definitionVersion": "2.1.0",
  "direction": "forward",
  "autoMap": true,
  "targetSchema": { "format": "json" },
  "defaults": {
    "expenditures.miscellaneous.description": "",
    "reporting.frequency": "quarterly"
  },
  "rules": [
    { "sourcePath": "expenditures.other_costs",
      "targetPath": "expenditures.miscellaneous.total",
      "transform": "preserve" },
    { "sourcePath": "indirect_rate",
      "transform": "drop", "bidirectional": false },
    { "sourcePath": "pi_name",
      "targetPath": "principal_investigator.full_name",
      "transform": "expression", "expression": "upper($)",
      "bidirectional": false }
  ]
}
```

**Property correspondence:**

| §6.7 Property | Mapping Document Property | Notes |
|---------------|---------------------------|-------|
| `source` | `sourcePath` | Direct rename. |
| `target` | `targetPath` | `null` → `transform: "drop"`, no `targetPath`. |
| `transform` | `transform` | Values `"preserve"`, `"drop"`, `"expression"` are identical. |
| `expression` | `expression` | FEL bindings (`$`, `@source`) unchanged. |
| `defaults` | `defaults` | Moved to Mapping Document top level. |
| *(pass-through)* | `autoMap: true` | Implicit §6.7 carry-forward for unmentioned fields. |
