---
title: Formspec References Specification
version: 1.0.0-draft.1
date: 2026-03-19
status: draft
---

# Formspec References Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-03-19
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard

---

## Abstract

The Formspec References Specification is a companion to Formspec v1.0 that
defines a standalone sidecar document for attaching external documentation,
knowledge sources, and AI agent data stores to any level of a Formspec
definition — the form itself, a group or section, or an individual field.
A References Document lives alongside the Definition (like Theme and Component
documents) and binds references to specific items by path. Multiple References
Documents MAY target the same Definition — for different audiences, languages,
or domains. A Reference is a JSON object that points to contextual information
(regulatory guidance, help articles, vector store collections, tool schemas)
and declares its intended audience (human, agent, or both). References are pure
metadata: they MUST NOT affect data capture, validation, or the processing
model.

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
defined in [RFC 3986]. JSON Pointer syntax is as defined in [RFC 6901].

Terms defined in the Formspec v1.0 core specification — including *Definition*,
*Item*, *Bind*, *FEL*, and *conformant processor* — retain their
core-specification meanings throughout this document unless explicitly redefined.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119

---

## Bottom Line Up Front

<!-- bluf:start file=references-spec.bluf.md -->
- References Documents are standalone JSON sidecars that bind external resources to specific Definition items by path — like Theme and Component documents, they live alongside the Definition.
- Each Bound Reference declares a `target` (item path or `"#"` for form-level), a `type` (documentation, regulation, vector-store, tool, context, etc.), and an `audience` (human, agent, both).
- Content is provided via `uri` (external pointer) and/or inline `content`. URI schemes support vector stores (`vectorstore:`), knowledge bases (`kb:`), and host-provided sources (`formspec-fn:`).
- Multiple References Documents MAY target the same Definition — for audience separation, locale variants, or domain overlays. References merge additively.
- References are pure metadata — they MUST NOT affect data capture, validation, or the processing model.
- The `type` and `rel` properties are open strings for forward compatibility — processors SHOULD warn on unrecognized values but MUST NOT reject the document.
- References do NOT inherit from parent to child; consumers walk the tree to collect context.
- `referenceDefs` enables DRY reuse of shared reference objects across bindings via `$ref` pointers with optional overrides.
<!-- bluf:end -->

## 1. Introduction

Forms exist in context. A tax form references regulatory guidance. A clinical intake form references diagnostic criteria. A grant application references federal reporting standards. Today, that context lives outside the form — in separate documents, institutional knowledge, or the heads of trained staff.

The References specification defines a standalone sidecar document that binds reference documentation, knowledge sources, and assistive data stores to specific items within a Formspec definition. Like Theme (Tier 2) and Component (Tier 3) documents, a References Document lives alongside the Definition rather than embedded within it. References serve two audiences:

1. **Human users** — contextual help, regulatory guidance, policy documents, instructional material.
2. **AI companion agents** — retrieval-augmented generation (RAG) endpoints, vector store collections, knowledge base articles, tool schemas, and structured context that agents can query at runtime to assist users.

References are **metadata** — they MUST NOT affect data capture, validation, or the processing model. A conformant processor that does not understand references MUST ignore them without error. This makes references a safe, additive layer that enhances the form experience without altering its behavior.

### 1.1 Design Principles

1. **Additive, not invasive** — References live in a separate document. Removing or ignoring the References Document produces an identical form from a data/behavior perspective. The Definition is never modified.
2. **Audience-aware** — Each reference declares its intended audience (`human`, `agent`, or `both`), enabling renderers and agents to filter appropriately.
3. **Transport-agnostic** — References can point to static documents (URLs), structured data endpoints (APIs), or abstract resource identifiers (vector store collection IDs). The spec defines the pointer; the consumer resolves it.
4. **Composable** — Multiple References Documents MAY target the same Definition, enabling audience separation, locale variants, and domain overlays without coordination between authors.
5. **Scoped** — Each reference declares its target item by path. A form-level reference (`"#"`) provides global context; an item-targeted reference provides guidance for that specific input.

## 2. Reference Object

A Reference is a JSON object that points to an external (or inline) source of contextual information.

### 2.1 Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | RECOMMENDED | Stable identifier for this reference, unique within the document. Enables deduplication and cross-referencing. Pattern: `[a-zA-Z][a-zA-Z0-9_-]*` |
| `type` | string | REQUIRED | The kind of reference. See §2.2. |
| `audience` | string | REQUIRED | Who this reference is for: `"human"`, `"agent"`, or `"both"`. |
| `title` | string | RECOMMENDED | Human-readable title or short description of the reference. |
| `uri` | string | Conditional | URI pointing to the reference content. REQUIRED unless `content` is provided. May be an HTTP(S) URL, a URN, or a scheme-prefixed identifier (see §3). |
| `content` | string or object | Conditional | Inline reference content. REQUIRED unless `uri` is provided. String for plain text or markdown. Object for structured data — no structural constraints are imposed by the base Reference schema; specific `type` values MAY define expected `content` shapes (e.g., `type: "tool"` expects a tool-schema-shaped object per §5.3). Authors SHOULD keep inline content concise (under 50 KB); for larger documents, prefer `uri`. |
| `mediaType` | string | OPTIONAL | MIME type of the referenced content (e.g., `"text/html"`, `"application/pdf"`, `"text/markdown"`, `"application/json"`). Helps consumers decide how to fetch and render. |
| `language` | string | OPTIONAL | BCP 47 language tag (e.g., `"en"`, `"es"`, `"fr-CA"`). Enables locale-aware reference selection. |
| `description` | string | OPTIONAL | Longer explanation of what this reference contains and when to consult it. |
| `tags` | array of string | OPTIONAL | Categorization tags for filtering and discovery (e.g., `["regulation", "2-cfr-200"]`, `["rag", "embeddings"]`). |
| `priority` | string | OPTIONAL | `"primary"`, `"supplementary"`, or `"background"`. Indicates how prominently the reference should be surfaced. When absent, processors MUST treat the reference as `"supplementary"` (this is a processing-model default, not a schema `default`). |
| `rel` | string | OPTIONAL | Relationship of this reference to the target. See §2.5 for defined values. When absent, the relationship is `"see-also"`. |
| `selector` | string | OPTIONAL | Advisory hint identifying the relevant portion of the referenced resource when URI fragments are insufficient. See §3.6. |
| `extensions` | object | OPTIONAL | Extension data. All keys MUST be prefixed with `x-`. |

### 2.2 Reference Types

Types are grouped by intended interface pattern — the distinction is about **how the consumer interacts with the reference**, not the underlying technology.

**Human-oriented types** — typically consumed by renderers for display:

| Type | Typical Audience | Description |
|------|------------------|-------------|
| `"documentation"` | human | Help articles, user guides, instructional content. |
| `"example"` | human | Worked examples, sample responses, templates. |

**Shared types** — typically useful to both humans and agents:

| Type | Typical Audience | Description |
|------|------------------|-------------|
| `"regulation"` | both | Laws, regulations, compliance standards (e.g., 2 CFR 200, HIPAA). |
| `"policy"` | both | Organizational policies, SOPs, internal guidelines. |
| `"glossary"` | both | Term definitions, abbreviations, domain vocabulary. |
| `"schema"` | both | JSON Schema, data dictionary, or structural specification for the data being collected. |

> **Note:** The audience column indicates the typical usage. The actual `audience` property on each reference is set independently — a `"documentation"` reference could have `audience: "agent"` if it contains agent-consumable guidance.

**Agent-oriented types** — consumed programmatically by AI companion agents. The type indicates the **query interface pattern**:

| Type | Interface Pattern | Description |
|------|-------------------|-------------|
| `"vector-store"` | Semantic similarity search | The agent sends a natural-language query and receives ranked document chunks. Use `vectorstore:` URIs (§3.1). |
| `"knowledge-base"` | Structured lookup | The agent queries by key, category, or structured filter. Returns articles, FAQ entries, or structured records. Use `kb:` URIs (§3.2). |
| `"retrieval"` | Request/response API | The agent sends a query to an HTTP endpoint and receives results. Catch-all for RAG systems that don't fit the above patterns. Use HTTPS URIs with `extensions` for query details (§3.3). |
| `"tool"` | Function invocation | The agent invokes a tool/function to compute or look up information. `content` SHOULD contain the tool schema (§5.3). |
| `"api"` | REST/GraphQL endpoint | The agent calls a structured API for reference data (e.g., code lookups, entity resolution). |
| `"context"` | Direct inclusion | Static text or structured data included directly in the agent's context window. No external query needed. |

Custom types MUST be prefixed with `x-` (e.g., `"x-org-training-video"`).

The `type` property is an open string — the schema does not reject unrecognized values. Processors encountering an unrecognized, non-`x-`-prefixed type SHOULD emit a warning and MAY skip the reference, but MUST NOT reject the document. This ensures forward compatibility when new standard types are added in future versions.

### 2.3 Validation Rules

- At least one of `uri` or `content` MUST be present.
- If both `uri` and `content` are present, `content` is treated as a cached/fallback representation of the URI target.
- `id`, when present, MUST be unique within the References Document. IDs SHOULD be unique across all loaded References Documents targeting the same Definition to enable unambiguous cross-referencing, but this is not a hard requirement.
- `audience` MUST be one of: `"human"`, `"agent"`, `"both"`.
- `type` MUST be a recognized type from §2.2 or an `x-`-prefixed custom type. A processor encountering an unrecognized, non-`x-`-prefixed type SHOULD emit a warning and MAY skip the reference, but MUST NOT reject the document.
- `priority` when present MUST be one of: `"primary"`, `"supplementary"`, `"background"`.
- `rel` when present SHOULD be a recognized relationship type from §2.5 or an `x-`-prefixed custom type. A processor encountering an unrecognized, non-`x-`-prefixed `rel` value MUST treat it as `"see-also"` and SHOULD emit a warning. The `rel` property is an open string — the schema does not reject unrecognized values.
- An empty `references` array (`"references": []`) is valid and semantically equivalent to a document with no bindings.
- Multiple references MAY share the same `uri` value (e.g., the same document serving as both a human `"regulation"` and an agent `"context"` reference with different `audience` values).
- Reference property values are **static**. FEL expressions MUST NOT appear in any reference property (`uri`, `content`, `title`, etc.). Dynamic reference resolution, if needed, MUST be handled by the host environment or via `formspec-fn:` URIs (§3.4).

### 2.4 Array Ordering

References within the `references` array are **ordered**. The first reference in the array is the most relevant; subsequent references are progressively less central. Processors that present references to humans or agents SHOULD preserve this authoring order.

References are grouped by their effective priority tier (primary, supplementary, background — see §2.1 for the default). All primary references are surfaced before supplementary, regardless of array position. Within a tier, array order determines presentation sequence.

> **Rationale:** Leaving order undefined would force divergent implementations — some treating order as significant, others not — with no way to reconcile them later. Defining it now costs nothing and prevents a class of interoperability bugs.

### 2.5 Reference Relationships

A Reference MAY declare a `rel` property that describes its relationship to the target item (the field, group, or form it is bound to). This enables consumers to understand not just *what* a reference points to, but *how* it relates to the thing being filled out.

**Defined relationship types:**

| `rel` value | Meaning |
|-------------|---------|
| `"authorizes"` | The referenced document authorizes or permits the action described by the target (e.g., a regulation authorizing a particular cost category). |
| `"constrains"` | The referenced document imposes constraints or limits on valid values (e.g., a rate ceiling, an enumeration of permitted codes). |
| `"defines"` | The referenced document defines the term or concept represented by the target (e.g., a glossary entry). |
| `"exemplifies"` | The referenced document provides an example or template for the target. |
| `"supersedes"` | The referenced document replaces a prior version of an earlier reference at the same target. |
| `"superseded-by"` | The referenced document has been replaced by a newer version. Typically paired with a sibling reference carrying `rel: "supersedes"`. |
| `"derived-from"` | The target's value or structure is derived from the referenced source (e.g., a pre-populated field drawn from an external record). |
| `"see-also"` | General association — the reference provides related but non-essential context. This is the implicit relationship when `rel` is absent. |

Custom relationship types MUST be prefixed with `x-` (e.g., `"x-org-audit-trail"`).

When `rel` is absent, processors MUST treat the relationship as `"see-also"`. A processor encountering an unrecognized, non-`x-`-prefixed `rel` value MUST treat it as `"see-also"` and SHOULD emit a warning. Like `type`, the `rel` property is an open string — the schema does not reject unrecognized values, ensuring forward compatibility.

> **Design note:** Relationship types are modeled after [IANA Link Relations](https://www.iana.org/assignments/link-relations/) and HTML's `rel` attribute. The set is intentionally small and focused on the reference–target relationship, not reference-to-reference relationships. References do not link to each other; if two references are related, that relationship is expressed in the documents they point to, not in the References Document.

**Example:**

```json
{
  "target": "indirectCostRate",
  "type": "regulation",
  "audience": "both",
  "rel": "constrains",
  "title": "2 CFR §200.414 — Indirect (F&A) Costs",
  "uri": "https://www.ecfr.gov/current/title-2/section-200.414"
}
```

## 3. URI Schemes for Agent Data Stores

References use URIs to point to external resources. Beyond standard `https://` URLs, this spec defines well-known URI scheme conventions for common AI infrastructure.

> **Note:** The `vectorstore:` and `kb:` schemes below are Formspec-defined conventions, not IANA-registered URI schemes. For environments that require standards-compliant URIs, use the `urn:x-{org}:` pattern (§3.5) or `formspec-fn:` host delegation (§3.4) instead.

### 3.1 Vector Store References

```
vectorstore:{provider}/{collection-id}
```

Examples:
- `vectorstore:pinecone/grant-guidance-v2`
- `vectorstore:chromadb/policy-docs`
- `vectorstore:weaviate/tax-regulations`

The vector store URI identifies the collection. Query parameters and authentication are runtime concerns handled by the consuming agent or host environment.

### 3.2 Knowledge Base References

```
kb:{provider}/{base-id}
```

Examples:
- `kb:aws-bedrock/ABCDEF1234`
- `kb:confluence/space-key/page-id`

### 3.3 Retrieval Endpoints

Standard HTTPS URIs are used for retrieval APIs. The `type: "retrieval"` plus optional `extensions` provide the agent with enough context to query them:

```json
{
  "target": "#",
  "type": "retrieval",
  "audience": "agent",
  "uri": "https://rag.example.gov/query",
  "title": "Federal grant guidance RAG endpoint",
  "extensions": {
    "x-retrieval": {
      "method": "POST",
      "topK": 5,
      "queryField": "question",
      "authScheme": "bearer"
    }
  }
}
```

### 3.4 Host-Provided Data Sources

Following the existing `formspec-fn:` convention from Data Sources (core §2.1.7):

```
formspec-fn:{function-name}
```

This delegates resolution to the host environment, which maps the function name to an actual data source, vector store, or API call. This is the recommended approach when the definition should remain environment-independent.

Example:
```json
{
  "target": "#",
  "type": "vector-store",
  "audience": "agent",
  "uri": "formspec-fn:searchGuidance",
  "title": "Search grant guidance knowledge base"
}
```

### 3.5 Opaque Identifiers

When a URI scheme doesn't fit, use a URN:

```
urn:x-{org}:{type}:{id}
```

Example: `urn:x-acme:vectordb:collection-42`

### 3.6 Fragment Targeting

Reference URIs MAY include a **fragment** (the portion after `#` per [RFC 3986 §3.5](https://www.rfc-editor.org/rfc/rfc3986#section-3.5)) to identify a specific part of the referenced resource. Fragment semantics are defined by the media type of the target resource:

- **HTML**: Fragment identifies an element by `id` (e.g., `https://ecfr.gov/title-2/section-200.414#p-200.414(f)`).
- **PDF**: Fragment follows the open parameters convention (e.g., `guide.pdf#page=12`).
- **JSON**: Fragment uses JSON Pointer ([RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)) (e.g., `schema.json#/definitions/CostCategory`).
- **Plain text / Markdown**: No standard fragment semantics. Use `selector` (below) instead.

When a URI includes a fragment, authors SHOULD include `mediaType` to enable consumers to interpret the fragment correctly.

For URI schemes that do not support fragments natively (e.g., `vectorstore:`, `kb:`), or when the target media type lacks fragment semantics, a Reference MAY include a `selector` property:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `selector` | string | OPTIONAL | A human- and agent-readable hint identifying the relevant portion of the referenced resource. Not a formal addressing mechanism — it is advisory context that helps consumers locate the relevant content. |

`selector` is intentionally unstructured. Examples:

- `"Section 200.414(f) — De minimis rate"` — points to a regulation subsection
- `"Chapter 3: Budget Justification"` — points to a document chapter
- `"rows where category = 'indirect'"` — hints at relevant data within a dataset

When both a URI fragment and `selector` are present, the URI fragment is the machine-actionable locator and `selector` provides supplementary human-readable context.

> **Rationale:** Without fragment or selector support, authors are forced to duplicate relevant excerpts into `content`, creating a second copy that drifts from the source. Fragments are already part of the URI spec — this section simply blesses their use and fills the gap for schemes that lack them.

**Example:**

```json
{
  "type": "regulation",
  "audience": "both",
  "rel": "constrains",
  "title": "De minimis indirect cost rate",
  "uri": "https://www.ecfr.gov/current/title-2/section-200.414#p-200.414(f)",
  "selector": "Section 200.414(f) — De minimis rate of 10%"
}
```

## 4. References Document

A **References Document** is a standalone JSON sidecar that binds references to a target Definition. Like Theme (Tier 2) and Component (Tier 3) documents, it lives alongside the Definition rather than embedded within it. This separation enables multiple References Documents to target the same Definition — for different audiences, languages, domains, or deployment contexts — without modifying the Definition itself.

### 4.1 Document Structure

A References Document MUST contain:

- **`$formspecReferences`** — Version pin. MUST be `"1.0"`.
- **`version`** — Version of this References Document (independently versioned from the target Definition).
- **`targetDefinition`** — Binding to the target Definition by canonical URL, with an optional `compatibleVersions` semver range.
- **`references`** — Ordered array of Bound References (§4.2).

A References Document MAY also contain:

- **`url`** — Canonical URI identifier for this document.
- **`name`** — Machine-readable short name. Pattern: `[a-zA-Z][a-zA-Z0-9_-]*` (letters, digits, hyphens, underscores; must start with a letter).
- **`title`** — Human-readable name.
- **`description`** — Human-readable description of purpose and scope.
- **`referenceDefs`** — Registry of reusable Reference objects (§4.6).

As with other Formspec sidecar documents, a References Document MAY include additional properties prefixed with `x-` at the document root (e.g., `"x-org-metadata": {...}`). Unrecognized `x-`-prefixed properties MUST be preserved on round-trip.

```json
{
  "$formspecReferences": "1.0",
  "version": "1.0.0",
  "title": "SF-425 Federal Guidance References",
  "targetDefinition": {
    "url": "https://example.gov/forms/sf-425",
    "compatibleVersions": ">=2025.1.0"
  },
  "referenceDefs": {
    "cfr-200-414": {
      "type": "regulation",
      "audience": "both",
      "rel": "constrains",
      "title": "2 CFR §200.414 — Indirect (F&A) Costs",
      "uri": "https://www.ecfr.gov/current/title-2/section-200.414",
      "priority": "primary"
    },
    "grant-kb": {
      "type": "vector-store",
      "audience": "agent",
      "title": "Federal grants guidance knowledge base",
      "uri": "vectorstore:pinecone/federal-grants-v3",
      "tags": ["rag", "grants", "2-cfr-200"]
    }
  },
  "references": [
    {
      "target": "#",
      "id": "cfr-guidance",
      "type": "regulation",
      "audience": "both",
      "title": "2 CFR Part 200 — Uniform Administrative Requirements",
      "uri": "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200",
      "priority": "primary"
    },
    {
      "target": "#",
      "id": "completion-guide",
      "type": "documentation",
      "audience": "human",
      "title": "SF-425 Line-by-Line Completion Guide",
      "uri": "https://example.gov/help/sf425-guide.pdf",
      "mediaType": "application/pdf"
    },
    {
      "target": "#",
      "id": "grant-kb",
      "type": "vector-store",
      "audience": "agent",
      "title": "Federal grants guidance knowledge base",
      "uri": "vectorstore:pinecone/federal-grants-v3",
      "description": "Embeddings of all OMB circulars, 2 CFR 200 subparts, and agency-specific grant guidance. Query with field-level questions for contextual help.",
      "tags": ["rag", "grants", "2-cfr-200"]
    },
    {
      "target": "indirectCostRate",
      "$ref": "#/referenceDefs/cfr-200-414",
      "selector": "Section 200.414(f) — De minimis rate of 10%"
    },
    {
      "target": "indirectCostRate",
      "type": "context",
      "audience": "agent",
      "rel": "defines",
      "title": "Indirect cost rate guidance",
      "content": "The indirect cost rate is a percentage negotiated between the grantee organization and its cognizant federal agency. It represents overhead costs (facilities, administration) that cannot be directly attributed to a specific grant. Common values range from 10% to 65%. Organizations without a negotiated rate may use the de minimis rate of 10% per 2 CFR §200.414(f). The rate entered here should match the organization's current Negotiated Indirect Cost Rate Agreement (NICRA).",
      "priority": "primary"
    },
    {
      "target": "indirectCostRate",
      "type": "example",
      "audience": "human",
      "title": "How to find your indirect cost rate",
      "uri": "https://example.gov/help/indirect-cost-rate-examples"
    }
  ]
}
```

### 4.2 Bound References

Each entry in the `references` array is a **Bound Reference** — a Reference object (§2) with an additional required `target` property that binds it to a specific location in the target Definition.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `target` | string | REQUIRED | Path identifying which Definition item(s) this reference applies to. Uses the same dot-notation path syntax as Bind paths (core §4.3.3). The special value `"#"` means form-level (applies to the entire form). Multiple references MAY target the same path. |

In addition to `target`, a Bound Reference contains all Reference properties from §2.1, or a `$ref` pointer to a `referenceDefs` entry (§4.6).

**Target path examples:**

| Target | Meaning |
|--------|---------|
| `"#"` | Form-level — applies to the entire form |
| `"indirectCostRate"` | A specific field |
| `"budget.lineItems"` | A nested group |
| `"lineItems[*].amount"` | All instances of a field within a repeat |

### 4.3 Target Definition Binding

The `targetDefinition` object declares which Definition this References Document is designed for:

```json
{
  "url": "https://example.gov/forms/sf-425",
  "compatibleVersions": ">=2025.1.0 <3.0.0"
}
```

- `url` (REQUIRED) — Canonical URL of the target Definition (its `url` property). A processor loading a References Document MUST verify that the `url` matches the loaded Definition's `url`. If the URLs do not match, the processor MUST NOT apply the references and SHOULD emit an error.
- `compatibleVersions` (OPTIONAL) — Semver range expression describing which Definition versions this document supports. When absent, the document is compatible with any version at that URL.

A processor loading a References Document SHOULD verify that the Definition's version satisfies `compatibleVersions` before applying references. On version mismatch, the processor SHOULD emit a warning but MAY still apply the references (warn-and-continue).

### 4.4 Multiple References Documents

Multiple References Documents MAY target the same Definition. This enables:

- **Audience separation** — one document for human-facing help, another for agent context.
- **Locale variants** — one document per language, each with `language`-tagged references.
- **Domain overlays** — a base references document plus a domain-specific overlay (e.g., agency-specific regulatory guidance on top of a shared form).

When multiple documents target the same Definition, a processor MUST merge their references by collecting all Bound References into a single ordered list. Within each document, array order is preserved (§2.4). Across documents, the processor determines load order (implementation-defined).

References from different documents that target the same path are **additive** — they do not replace each other.

### 4.5 Scoping and Non-Inheritance

References target specific items by path. A reference targeting a group does NOT automatically apply to the group's children — each item must be targeted explicitly.

**Rationale**: Automatic inheritance would create ambiguity about which references apply to a specific field vs. its container. Explicit targeting keeps the model simple and predictable. Consumers (particularly agents) that want hierarchical context may collect references from ancestor paths — see the recommended context assembly pattern in §5.1.

**Non-relevant items**: References targeting non-relevant items persist in the References Document (they are structural metadata). However, agents and renderers SHOULD NOT surface references for items that are currently non-relevant, since the user cannot interact with those items.

### 4.6 Reuse via `referenceDefs`

A References Document MAY declare a `referenceDefs` object — a registry of reusable Reference objects. Entries in the `references` array may use `$ref` pointers instead of duplicating reference objects inline.

#### 4.6.1 Declaring Shared References

`referenceDefs` is an object whose keys are reference identifiers (matching `[a-zA-Z][a-zA-Z0-9_-]*`) and whose values are Reference objects. The key becomes the reference's `id` — if the Reference object also declares an `id`, it MUST match the key. This constraint cannot be expressed in JSON Schema and MUST be enforced at processing time.

#### 4.6.2 Referencing Shared Definitions

Within the `references` array, a Bound Reference MAY use `{ "$ref": "#/referenceDefs/{key}" }` instead of inline Reference properties. The `$ref` value MUST be a JSON Pointer ([RFC 6901](https://www.rfc-editor.org/rfc/rfc6901)) relative to the References Document root.

```json
{
  "target": "indirectCostRate",
  "$ref": "#/referenceDefs/cfr-200-414"
}
```

A `$ref` entry MAY include additional properties alongside `$ref`. These properties **override** the corresponding properties from the referenced definition (shallow merge — top-level keys only). This allows site-specific customization without duplicating the entire reference:

```json
{
  "target": "indirectCostRate",
  "$ref": "#/referenceDefs/cfr-200-414",
  "selector": "Section 200.414(f) — De minimis rate of 10%",
  "priority": "primary"
}
```

#### 4.6.3 Resolution Rules

1. `$ref` resolution is performed at **load time**, before any processing. After resolution, the document behaves as if all references were declared inline.
2. A `$ref` pointing to a nonexistent key in `referenceDefs` is a document error. Processors MUST report it and MUST NOT silently ignore the broken reference.
3. `$ref` values MUST NOT be recursive — a `referenceDefs` entry MUST NOT use the `$ref` resolution mechanism defined in this section.
4. `referenceDefs` entries that are never referenced are inert — they impose no processing cost and MUST NOT cause warnings.
5. After resolution, the `id` of the resolved reference is the `referenceDefs` key. An override entry MUST NOT include `id` — the identity of a `$ref`-resolved reference is always the key it points to.
6. The result of merging overrides with the base reference MUST satisfy all validation rules in §2.3. Processors MUST validate the merged result, not the base and overrides independently.

> **Rationale:** This is the same pattern used by JSON Schema's `$defs` and Formspec's own `$ref` for modular composition (core §6.6). Without a reuse mechanism, documents with many items citing the same regulation will contain dozens of identical reference objects — a maintenance hazard where updating one copy but not the others creates silent inconsistency. `referenceDefs` makes the single-source-of-truth pattern expressible.

### 4.7 URI Stability and Versioning

Reference URIs are **not versioned** alongside the References Document or the target Definition. A reference URI may point to content that changes independently. This is by design — references point to living external resources.

Authors who need pinned references SHOULD:
- Use `content` for inline snapshots that are immutable with the document version.
- Include version information in URIs where the external system supports it (e.g., `https://www.ecfr.gov/current/title-2/section-200.414?version=2025-01-01`).
- Use `description` to note the expected version or date of the referenced content.

### 4.8 Modular Composition

When a Group uses `$ref` to include items from another definition (core §6.6), references in a sidecar References Document targeting the source definition do NOT automatically transfer to the assembled definition. The host definition's References Document(s) must explicitly bind references to any imported items using the assembled paths (which include the `keyPrefix` from the import).

> **Rationale:** Since References Documents are separate from the Definition, there is no mechanism for the assembler to "carry" them. The host authors are responsible for providing reference context for imported items. This is consistent with the sidecar model — the Definition is assembled independently of its references.

## 5. Agent Integration Patterns

This section describes how AI companion agents are expected to consume references. These patterns are advisory — implementations may vary.

### 5.1 Context Assembly

When an agent assists a user with a specific field, the recommended approach is to:

1. Collect all loaded References Documents targeting the active Definition.
2. Filter to Bound References whose `target` matches the field's path.
3. Additionally collect Bound References targeting ancestor groups (walking up the item tree by path segments) and form-level references (`target: "#"`).
4. Filter by `audience` (`"agent"` or `"both"`).
5. Sort by `priority` (`"primary"` first, then `"supplementary"`, then `"background"`).
6. Use `rel` to weight references appropriately — `"constrains"` and `"defines"` references are authoritative context for the target and SHOULD be consulted before `"see-also"` references, which provide background.
7. Use inline `content` references directly as context.
8. Resolve `uri` references as appropriate (fetch documents, query vector stores, call APIs).

### 5.2 Vector Store Query Pattern

For `type: "vector-store"` references, the agent constructs a query using:

- The field's `label`, `description`, and `hint` as natural-language query context.
- The user's current question or input as the primary query.
- The `tags` on the reference for namespace/filter scoping.

```
User asks: "What rate should I enter for indirect costs?"

Agent context assembly:
  1. Field: indirectCostRate (label: "Indirect Cost Rate")
  2. Inline context reference → immediate grounding
  3. Vector store reference → query "indirect cost rate guidance for federal grants"
  4. Regulation reference → deep-link for citation
```

### 5.3 Tool References

`type: "tool"` references point to tool schemas (e.g., OpenAPI operations, MCP tool definitions) that an agent can invoke to help the user. The `uri` points to the tool definition; `content` may contain the tool's JSON schema inline.

```json
{
  "target": "indirectCostRate",
  "type": "tool",
  "audience": "agent",
  "title": "NICRA Lookup",
  "uri": "https://api.example.gov/tools/nicra-lookup",
  "content": {
    "name": "lookupNICRA",
    "description": "Look up an organization's Negotiated Indirect Cost Rate Agreement by UEI or EIN.",
    "parameters": {
      "type": "object",
      "properties": {
        "uei": { "type": "string", "description": "Unique Entity Identifier" },
        "ein": { "type": "string", "description": "Employer Identification Number" }
      }
    }
  },
  "mediaType": "application/json"
}
```

### 5.4 Grounding Documents

`type: "context"` references with inline `content` provide pre-written grounding text optimized for agent consumption. These are particularly useful for:

- Field-specific instructions that go beyond the `description`/`hint` (which are optimized for human display).
- Domain rules and edge cases an agent should know about.
- Disambiguation guidance (e.g., "This field asks for the *federal* fiscal year, not the organization's fiscal year").

## 6. Relationship to Existing Properties

References complement but do not replace existing Item properties:

| Property | Purpose | Audience | Display |
|----------|---------|----------|---------|
| `label` | Primary display name | Human | Always visible |
| `hint` | Short instructional text | Human | Inline with input |
| `description` | Help text | Human | On-demand (tooltip/help) |
| **`references`** | **External context, knowledge sources, agent data** | **Human + Agent** | **Implementation-defined** |

- `description` and `hint` remain the right place for concise, inline human guidance.
- `references` (in the sidecar document) are for deeper context: full documents, knowledge bases, regulatory citations, and agent-consumable data sources.
- An agent SHOULD use `label`, `hint`, and `description` as lightweight context before consulting references for deeper information.

## 7. Rendering Guidance

References are metadata and renderers are free to present them however they choose (or not at all). Recommended patterns:

- **Human `documentation`/`regulation`/`policy` references**: render as links in a help panel, sidebar, or expandable section. `priority: "primary"` references may warrant a visible help icon on the field.
- **Human `example` references**: render inline or in a popover when the user focuses the field.
- **Agent references**: not rendered in the UI. Consumed programmatically by companion agents.
- **`audience: "both"` references**: available to both rendering and agent pipelines. A `regulation` reference might render as a citation link for humans while also being queryable context for an agent.
- **Relationship-aware rendering**: Renderers MAY use `rel` to differentiate presentation. For example, `rel: "constrains"` references could display with a "Requirements" heading or a distinct icon, while `rel: "exemplifies"` references could render as expandable example panels. `rel: "superseded-by"` references SHOULD be visually de-emphasized or annotated as outdated.

## 8. Conformance

This specification defines conformance requirements for References Document handling.

### 8.1 Core Processor Requirements

- A conformant Core processor MAY ignore References Documents entirely — they are an additive layer.
- A conformant Core processor MUST NOT use references to alter data capture, validation, or the processing model.
- References MUST NOT appear in Response data.

### 8.2 Extended Processor Requirements

- An Extended processor that supports references MUST load and validate References Documents against the schema in §9.
- An Extended processor that supports references MUST resolve `$ref` pointers within the document at load time (§4.6.3).
- An Extended processor MUST verify that `targetDefinition.url` matches the loaded Definition's `url`. On mismatch, the processor MUST NOT apply the references and SHOULD emit an error (§4.3).
- An Extended processor SHOULD verify `targetDefinition.compatibleVersions` and emit a warning on version mismatch (§4.3).
- An Extended processor MUST validate that `referenceDefs` entries with an explicit `id` have that `id` match the entry's key (§4.6.1). A mismatch is a document error.
- An Extended processor SHOULD validate that `target` paths in Bound References correspond to items that exist in the target Definition. A `target` pointing to a nonexistent item SHOULD emit a warning but MUST NOT cause document rejection.
- An Extended processor that supports references SHOULD surface human-audience references in the UI.
- An Extended processor that supports agent integration SHOULD make agent-audience references available to companion agents via a documented API.
- An Extended processor that encounters a reference with an unrecognized `type` (non-`x-`-prefixed) SHOULD emit a warning and MAY skip the reference, but MUST NOT reject the document.

## Static Semantics and Lint

References Documents are first validated against
`schemas/references.schema.json`. Static semantic lint then checks references
as metadata only: it resolves in-document pointers and target paths for
authoring feedback, but it does not turn references into validation rules,
requiredness, relevance, readonly behavior, or inherited child constraints.

The References semantic pass owns the `E1300`/`W1300` diagnostic family:

- `E1300` rejects `references[*].$ref` pointers that do not resolve to
  `referenceDefs`.
- `E1301` rejects `referenceDefs` entries whose explicit `id` does not match
  the map key.
- `E1302` rejects duplicate authored reference ids. Repeated use of the same
  `$ref` key is reuse, not a duplicate id.
- `E1303` rejects malformed `references[*].target` paths.
- `E1304` rejects FEL-looking dynamic expressions in static reference metadata.
- `W1300` and `W1301` warn for unknown non-`x-` `type` and `rel` values.

When lint receives a paired Definition, `E1310` rejects
`targetDefinition.url` mismatches, `W1310` warns on compatible-version
mismatch, and `W1311` warns when a syntactically valid target path does not
resolve to `#` or a Definition item path.

## 9. Schema

The normative JSON Schema for References Documents is defined in `schemas/references.schema.json`. This is a standalone schema (not embedded in the definition schema) consistent with the sidecar document model. The `TargetDefinition` type is shared with the Component schema via `$ref`.

<!-- schema-ref:start schema=schemas/references.schema.json pointers=#/properties/$formspecReferences,#/properties/targetDefinition,#/properties/references,#/$defs/BoundReference,#/$defs/Reference,#/$defs/ReferenceOrRef,#/$defs/ReferenceDefs -->
<!-- generated:schema-ref id= -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecReferences` | `(self)` | <code>string</code> | — | const: <code>"1.0"</code>; critical | References specification version. MUST be '1.0'. |
| `#/properties/targetDefinition` | `(self)` | <code>&#36;ref</code> | — | <code>&#36;ref</code>: <code>https://formspec.org/schemas/common/1.0#/&#36;defs/TargetDefinition</code>; critical | Binding to the target Formspec Definition and optional compatibility range. |
| `#/properties/references` | `(self)` | <code>array</code> | — | critical | Ordered list of references bound to the target Definition. Each entry specifies a target path (item key or '#' for form-level) and a reference or $ref pointer. References are static and resolved at load time. |
| `#/$defs/BoundReference/properties/$ref` | `$ref` | <code>string</code> | no | pattern: <code>^#/referenceDefs/[a-zA-Z][a-zA-Z0-9_-]*&#36;</code> | JSON Pointer (RFC 6901) to a referenceDefs entry. Resolved at load time. |
| `#/$defs/BoundReference/properties/audience` | `audience` | <code>string</code> | no | enum: <code>"human"</code>, <code>"agent"</code>, <code>"both"</code> | — |
| `#/$defs/BoundReference/properties/content` | `content` | <code>composite</code> | no | — | — |
| `#/$defs/BoundReference/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/$defs/BoundReference/properties/extensions` | `extensions` | <code>object</code> | no | — | — |
| `#/$defs/BoundReference/properties/id` | `id` | <code>string</code> | no | pattern: <code>^[a-zA-Z][a-zA-Z0-9_-]*&#36;</code> | — |
| `#/$defs/BoundReference/properties/language` | `language` | <code>string</code> | no | — | — |
| `#/$defs/BoundReference/properties/mediaType` | `mediaType` | <code>string</code> | no | — | — |
| `#/$defs/BoundReference/properties/priority` | `priority` | <code>string</code> | no | enum: <code>"primary"</code>, <code>"supplementary"</code>, <code>"background"</code> | — |
| `#/$defs/BoundReference/properties/rel` | `rel` | <code>string</code> | no | — | — |
| `#/$defs/BoundReference/properties/selector` | `selector` | <code>string</code> | no | — | — |
| `#/$defs/BoundReference/properties/tags` | `tags` | <code>array</code> | no | — | — |
| `#/$defs/BoundReference/properties/target` | `target` | <code>string</code> | yes | critical | Path identifying which Definition item(s) this reference applies to. Uses dot notation for nesting and [*] for all instances of a repeatable group. The special value '#' means form-level (applies to the entire form). Multiple references may target the same path. |
| `#/$defs/BoundReference/properties/title` | `title` | <code>string</code> | no | — | — |
| `#/$defs/BoundReference/properties/type` | `type` | <code>string</code> | no | — | — |
| `#/$defs/BoundReference/properties/uri` | `uri` | <code>string</code> | no | — | — |
| `#/$defs/Reference/properties/audience` | `audience` | <code>string</code> | yes | enum: <code>"human"</code>, <code>"agent"</code>, <code>"both"</code>; critical | Who consumes this reference. 'human': rendered in the UI (help panels, links, tooltips). 'agent': consumed programmatically by AI agents (not rendered). 'both': available to both rendering and agent pipelines. |
| `#/$defs/Reference/properties/content` | `content` | <code>composite</code> | no | — | Inline content of the reference. REQUIRED unless 'uri' is provided. May be a plain text string, markdown, or structured JSON object. |
| `#/$defs/Reference/properties/description` | `description` | <code>string</code> | no | — | Longer explanation of what this reference provides and why it is relevant. |
| `#/$defs/Reference/properties/extensions` | `extensions` | <code>object</code> | no | — | Reference-level extension data. All keys MUST be prefixed with 'x-'. |
| `#/$defs/Reference/properties/id` | `id` | <code>string</code> | no | pattern: <code>^[a-zA-Z][a-zA-Z0-9_-]*&#36;</code> | Identifier for this reference. RECOMMENDED. When present, MUST be unique within this References Document. When used as a referenceDefs key, the key and id MUST match (processing-time validation). |
| `#/$defs/Reference/properties/language` | `language` | <code>string</code> | no | — | BCP 47 language tag for the referenced content. |
| `#/$defs/Reference/properties/mediaType` | `mediaType` | <code>string</code> | no | — | MIME type of the referenced resource (RFC 2045). |
| `#/$defs/Reference/properties/priority` | `priority` | <code>string</code> | no | enum: <code>"primary"</code>, <code>"supplementary"</code>, <code>"background"</code> | Relative importance. 'primary': surfaced first. 'supplementary' (implicit default): normal. 'background': contextual. |
| `#/$defs/Reference/properties/rel` | `rel` | <code>string</code> | no | — | Semantic relationship to the target. Known values: 'authorizes', 'constrains', 'defines', 'exemplifies', 'supersedes', 'superseded-by', 'derived-from', 'see-also' (implicit default). Custom types MUST be prefixed with 'x-'. Unrecognized non-'x-' values: processor SHOULD warn and treat as 'see-also'. |
| `#/$defs/Reference/properties/selector` | `selector` | <code>string</code> | no | — | Fragment-targeting hint for resources without native fragment semantics. |
| `#/$defs/Reference/properties/tags` | `tags` | <code>array</code> | no | — | Categorization tags for filtering and grouping references. |
| `#/$defs/Reference/properties/title` | `title` | <code>string</code> | no | — | Human-readable label for this reference. RECOMMENDED. |
| `#/$defs/Reference/properties/type` | `type` | <code>string</code> | yes | critical | Classification of the referenced resource. Human-oriented: 'documentation', 'example'. Shared: 'regulation', 'policy', 'glossary', 'schema'. Agent-oriented: 'vector-store', 'knowledge-base', 'retrieval', 'tool', 'api', 'context'. Custom types MUST be prefixed with 'x-'. Unrecognized non-'x-' types: processor SHOULD warn and MAY skip. |
| `#/$defs/Reference/properties/uri` | `uri` | <code>string</code> | no | — | URI of the referenced resource. REQUIRED unless 'content' is provided. Supports https:, vectorstore:, kb:, formspec-fn:, and urn: schemes. |
| `#/$defs/ReferenceOrRef` | `(self)` | <code>composite</code> | — | — | Either a full inline Reference object, or a $ref pointer to a referenceDefs entry with optional property overrides. When $ref is present, the base object is shallow-merged with sibling properties (overrides win). The 'id' property MUST NOT appear alongside $ref — the referenceDefs key becomes the resolved id. MAINTENANCE NOTE: The $ref branch explicitly lists override properties — if a property is added to Reference, it must also be added to the $ref branch or overrides for that property will be silently rejected. |
| `#/$defs/ReferenceDefs` | `(self)` | <code>object</code> | — | — | Registry of reusable Reference objects keyed by identifier. Entries MUST NOT use $ref to other entries (no recursion). The key becomes the resolved reference's 'id' — if the entry also declares 'id', it MUST match the key (processing-time validation, not schema-enforceable). Broken $ref pointers are document errors. |
<!-- schema-ref:end -->

## 10. Security Considerations

- **URI resolution**: Agents and renderers MUST NOT blindly fetch arbitrary URIs from references. Implementations SHOULD maintain an allowlist of trusted domains or delegate URI resolution to the host environment.
- **Inline content**: `content` values (especially objects) MUST be treated as untrusted data. Renderers MUST sanitize HTML/markdown content before display. Agents SHOULD treat inline content as context, not as executable instructions.
- **Credential exposure**: Reference URIs MUST NOT contain credentials (API keys, tokens). Authentication for protected resources MUST be handled by the host environment or agent runtime, not embedded in the document.
- **Prompt injection**: Agent implementations MUST be aware that `content` fields and fetched reference documents could contain adversarial text. Standard prompt injection mitigations apply.
- **Circular resolution**: A reference URI could point back to the definition itself or to another reference that creates a loop. Implementations that recursively resolve reference URIs MUST guard against circular resolution (e.g., via a visited-set or depth limit).
- **Browser security**: Web implementations that fetch reference URIs for display (human-audience references) are subject to CORS and Content Security Policy restrictions. Implementations SHOULD proxy external reference content through a trusted backend rather than fetching directly from the browser.
- **Document provenance**: Since References Documents are separate files that bind to a Definition by URL, implementations SHOULD verify the provenance of loaded References Documents. Loading references from untrusted sources could inject misleading context into agent pipelines.
