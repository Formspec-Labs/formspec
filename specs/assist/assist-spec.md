---
title: Formspec Assist Specification
version: 1.0.0-draft.2
date: 2026-09-16
depends_on:
  - specs/core/references-spec.md
  - specs/ontology/ontology-spec.md
  - specs/core/spec.md
---

# Formspec Assist Specification v1.0

**Version:** 1.0.0-draft.2
**Date:** 2026-09-16
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard

---

## Abstract

The Formspec Assist Specification defines a transport-agnostic interoperability
contract for software that helps people complete forms. It standardizes how an
agent, browser extension, accessibility tool, automation system, or chat layer
can discover a live Formspec form, inspect its structure and current state,
retrieve contextual help from References and Ontology sidecars, validate input,
and request mutations in a controlled, user-consented way.

This specification is the filling-side counterpart to the Formspec authoring
tool surface. It does not define form rendering, authoring workflows, or LLM
behavior. Instead it defines the structured protocol that those systems can rely
on: tool names, result envelopes, error codes, context-resolution rules,
profile-matching behavior, transport requirements, and browser-facing discovery
conventions.

Assist is additive. A processor that does not implement this specification
remains fully conformant to Formspec core. An implementation that does support
Assist MUST NOT change core response, validation, calculation, or relevance
semantics.

## Status of This Document

This document is a **draft specification**. It is a companion to Formspec v1.0
and does not modify the core processing model. Implementors are encouraged to
experiment with it and provide feedback, but MUST NOT treat it as a stable
production contract until a 1.0.0 release is published.

Draft 2 rebases §4.1, §7.2, §8, and §10.1 on the [WebMCP][webmcp] Community
Group draft of 2026-09-15: `document.modelContext`, `AbortSignal` lifecycle,
`getTools()` / `executeTool()`, tool annotations in place of the never-shipped
`requestUserInteraction()`, and the declarative `<form>` attributes.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD",
"SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this
document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119]
[RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as
defined in [RFC 3986]. JSON Schema refers to JSON Schema draft-07 unless a
transport binding explicitly states otherwise.

Terms defined in the Formspec v1.0 core specification retain their meanings
throughout this document unless explicitly redefined.

Additional terms:

- **Assist Provider** — a live implementation that exposes the Assist tool
  catalog for one active form.
- **Assist Consumer** — any system that discovers and invokes Assist tools.
- **Passive Provider** — a renderer that emits declarative metadata helpful to
  agents, but does not expose the full tool catalog.
- **Profile** — a user-controlled, reusable store of values keyed primarily by
  ontology concept identity and secondarily by field path.
- **Human-in-the-loop** — an explicit user confirmation step before a mutation
  with user-visible consequences is applied.
- **Agent** / **browser's agent** — as defined by [WebMCP][webmcp]: an
  autonomous assistant acting on a user's goals; a browser's agent is one
  provided by or through the browser.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[webmcp]: https://webmachinelearning.github.io/webmcp/

---

## Bottom Line Up Front

- Assist defines a standard tool surface for **form filling**, not form
  authoring.
- The required core covers **introspection, help lookup, mutation, and
  validation** for a live form.
- Context for a field is assembled from **References** and **Ontology**
  sidecars using a deterministic resolution algorithm.
- Cross-form autofill is driven by **ontology concept identity**, not by field
  name heuristics alone.
- The protocol is **transport-agnostic** and can be bound to WebMCP, MCP,
  `postMessage`, HTTP, or in-process calls.
- Assist is **LLM-independent**. Chat experiences are consumers of this spec,
  not part of it.
- Assist is **additive**. It MUST NOT alter core data semantics, validation
  semantics, or the response model.

## 1. Purpose and Scope

Formspec already captures the raw ingredients needed for assisted form
completion:

1. **Form state and validation** via the Formspec engine and core processing
   model.
2. **Contextual knowledge** via References Documents.
3. **Semantic identity** via Ontology Documents and `semanticType`.

This specification defines how those ingredients become interoperable at
runtime.

### 1.1 What This Specification Defines

This specification defines:

1. A **normative tool catalog** for live-form inspection, help, mutation,
   validation, navigation, and profile workflows.
2. A **field-help resolution algorithm** combining References, Ontology,
   registries, and field metadata.
3. A **profile-matching algorithm** for cross-form reuse of user data.
4. **Transport requirements** that any Assist binding MUST satisfy.
5. **Declarative browser annotations** that passive consumers can inspect
   without full tool access.
6. **Discovery conventions** for sidecar documents and browser extensions.

### 1.2 What This Specification Does Not Define

This specification does not define:

1. Form rendering or component behavior.
2. Form authoring or authoring-side MCP tools.
3. LLM prompts, chat UX, or model selection.
4. A mandatory storage engine for user profiles.
5. A single canonical JSON document schema for the protocol as a whole.

> **Design note:** Assist is a live interoperability contract, not a sidecar
> document format. Tool declarations SHOULD use JSON Schema for their input
> shapes, but this specification does not define one top-level schema file
> analogous to `definition.schema.json` or `references.schema.json`.

### 1.3 Relationship to Other Specifications

| Specification | Relationship |
|---|---|
| **Core** | Assist reads and mutates state governed by the core processing model. |
| **References** | Assist uses References Documents as one source of contextual help. |
| **Ontology** | Assist uses Ontology Documents and registry concepts for semantic alignment and profile matching. |
| **Component** | Passive annotations are emitted by renderers but MUST NOT alter component semantics. |
| **Registry** | Registry concept entries participate in the ontology resolution cascade. |
| **Authoring MCP** | Assist is the filling-side analogue, not a replacement or extension of authoring MCP tools. |
| **WebMCP** | The canonical browser transport (§7.2) and the declarative attribute vocabulary of §8.2. Assist owns tool semantics; WebMCP supplies registration, discovery, invocation, and annotations. |

### 1.4 Design Principles

1. **LLM-independent.** The protocol MUST stand on structured data alone.
2. **User-controlled mutation.** Providers MUST preserve user agency, especially
   for autofill and bulk actions.
3. **Additive, not invasive.** Assist MUST NOT redefine core semantics.
4. **Transport-neutral.** Tool behavior is normative; transport wiring is not.
5. **Graceful degradation.** Consumers SHOULD still extract useful behavior when
   sidecars or full provider support are absent.

## 2. Conformance Roles

This specification defines three conformance roles.

### 2.1 Assist Provider

An Assist Provider exposes the tool catalog for a live form.

A conformant Assist Provider:

- **MUST** implement every tool in §3.2, §3.3, and §3.4.
- **MUST** follow the field-help resolution algorithm in §5.
- **MUST** preserve the result and error contracts in §4.
- **MUST NOT** write to readonly or non-relevant fields through Assist tools.

### 2.2 Assist Consumer

An Assist Consumer discovers and invokes Assist tools.

A conformant Assist Consumer:

- **MUST** treat the provider as authoritative for live form state.
- **MUST** parse structured tool results rather than scraping human-readable
  text from them.
- **SHOULD** request or surface user confirmation for high-impact mutations.
- **SHOULD** degrade gracefully when optional tool categories are absent.

### 2.3 Passive Provider

A Passive Provider does not expose the full tool catalog, but emits declarative
metadata per §8.

A conformant Passive Provider:

- **MUST** preserve standard accessibility semantics.
- **SHOULD** emit `data-formspec-*` and field-level annotations where possible.
- **MAY** omit profile and tool invocation support entirely.

## 3. Tool Catalog

### 3.1 Naming

All Assist tools use the namespace `formspec.` followed by a category and
action: `formspec.{category}.{action}`.

### 3.2 Required Core Introspection Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.form.describe` | `{}` | `FormDescription` | High-level form metadata and status. |
| `formspec.field.list` | `{ filter?: "all" \| "required" \| "empty" \| "invalid" \| "relevant" }` | `FieldSummary[]` | Default filter is `"relevant"`. |
| `formspec.field.describe` | `{ path: string }` | `FieldDescription` | Includes live state and resolved help. |
| `formspec.field.help` | `{ path: string, audience?: "human" \| "agent" \| "both" }` | `FieldHelp` | Default audience is `"agent"`. Providers MAY allow consumers to override this default. |
| `formspec.form.progress` | `{}` | `FormProgress` | Progress summary across required and total fields. |

### 3.3 Required Core Mutation Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.field.set` | `{ path: string, value: unknown }` | `SetValueResult` | MUST reject writes to readonly or non-relevant fields. |
| `formspec.field.bulkSet` | `{ entries: Array<{ path: string, value: unknown }> }` | `BulkSetResult` | MAY partially succeed; each entry is independent unless a transport defines stronger atomicity. |

The `value` property in `formspec.field.set` MAY be omitted. An omitted `value` is treated as `null` and clears the field. Providers MUST treat `undefined` (from omission) identically to `null` for the purpose of setting field values.

### 3.4 Required Core Validation Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.form.validate` | `{ profile?: ValidationProfile }` | `ValidationReport` | `ValidationProfile` is the core vocabulary (`live`, `on-submit`, `on-demand`, `off`); default `"live"`. |
| `formspec.field.validate` | `{ path: string }` | `{ results: ValidationResult[] }` | Field-scoped validation only. |

### 3.5 Optional Profile Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.profile.match` | `{ profileRef?: string }` | `{ matches: ProfileMatch[] }` | Suggests reusable values. |
| `formspec.profile.apply` | `{ matches: Array<{ path: string, value: unknown }>, confirm?: boolean }` | `ProfileApplyResult` | `confirm: true` requires human-in-the-loop. When `confirm` is `true` and the provider has no confirmation mechanism, the provider MUST return an error with code `x-confirmation-required`. The provider MUST NOT silently apply values without confirmation when confirmation was explicitly requested. |
| `formspec.profile.learn` | `{ profileRef?: string }` | `{ savedConcepts: number, savedFields: number }` | Saves concept-bound values and permitted fallbacks. |

### 3.6 Optional Navigation Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.form.pages` | `{}` | `{ pages: PageProgress[] }` | Available when the provider knows page structure. `PageProgress` MUST be computed over the provider's current live field set for each page, including active repeat instances that exist at evaluation time. |
| `formspec.form.nextIncomplete` | `{ scope?: "field" \| "page" }` | `NextIncompleteResult` | Default scope is `"field"`. For `scope: "page"`, the provider MUST select the next page containing an incomplete live field, including incomplete fields within active repeat instances. |

## 4. Common Result, Error, and Data Contracts

### 4.1 Tool Result and Envelope

Every Assist tool invocation yields exactly one of:

- the tool-specific **result object** defined in §4.4, or
- a **`ToolError`** object (§4.2).

That object is the normative result. How it travels is a binding detail (§7):

| Binding | Success | Error |
|---|---|---|
| MCP, HTTP, browser messaging, in-process (§7.3–§7.5) | MCP `CallToolResult`: `text` is the JSON result object | same envelope, `isError: true`, `text` is the JSON `ToolError` |
| WebMCP (§7.2) | the result object itself; the browser serializes it | `{ "error": ToolError }`, returned — never thrown |

A WebMCP result whose only top-level key is `error`, holding an object with
`code`, is a `ToolError`. Result objects MUST NOT define a top-level `error`
key; the key is reserved.

```typescript
interface ToolResult {            // MCP-family envelope
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}
```

Consumers MUST parse the JSON payload before using it.

### 4.2 Error Contract

An error result is a `ToolError` object, carried per §4.1 (MCP-family
bindings: `isError: true` with the JSON in `text`; WebMCP: `{ error: ToolError }`):

```typescript
interface ToolError {
  code:
    | "NOT_FOUND"
    | "INVALID_PATH"
    | "INVALID_VALUE"
    | "NOT_RELEVANT"
    | "READONLY"
    | "UNSUPPORTED"
    | "ENGINE_ERROR";
  message: string;
  path?: string;
}
```

Providers MAY define additional `x-`-prefixed error codes. Consumers MUST treat
unknown non-`x-` codes as generic failures.

The following `x-`-prefixed error codes are RECOMMENDED for common provider conditions:

| Code | Meaning |
| --- | --- |
| `x-confirmation-required` | A mutation requiring `confirm: true` was requested but no confirmation mechanism is available. |
| `x-invalid-sidecar` | A loaded References or Ontology document has a structural error or its `targetDefinition` does not match the active form. |
| `x-cancelled` | The caller aborted the invocation before the mutation was applied. Nothing was written. Observable by in-process callers; a WebMCP caller sees its own abort reason instead (§7.2). |

### 4.3 Mutation Rules

For every mutation tool:

1. A provider **MUST** validate that the path resolves to a writable field.
2. A provider **MUST NOT** silently write to a readonly field.
3. A provider **MUST NOT** silently write to a non-relevant field.
4. A provider **MUST NOT** suppress core validation triggered by the write.
5. A provider **SHOULD** support human-in-the-loop confirmation for bulk or
   profile-driven writes.

### 4.4 Common Data Shapes

```typescript
interface FormDescription {
  title: string;
  description?: string;
  url?: string;
  version?: string;
  fieldCount: number;
  pageCount?: number;
  status?: string;
}

interface FieldSummary {
  path: string;
  label: string;
  dataType: string;
  required: boolean;
  relevant: boolean;
  readonly: boolean;
  filled: boolean;
  valid: boolean;
}

A field is **valid** if it has no validation results with severity `"error"` for its path. Warning-level and info-level results do not affect field validity. This is the field-scoped application of the core specification's validity rule (core §5.1, "A Response is valid if and only if zero validation results with severity `error` exist").

interface FormProgress {
  total: number;
  filled: number;
  valid: number;
  required: number;
  requiredFilled: number;
  complete: boolean;
  pages?: PageProgress[];
}

A field is **filled** if its current value is not empty. A value is "empty" if it is `null`, `undefined` in host languages that distinguish it, an empty string `""`, or an empty array `[]`. This definition extends the core specification's `empty()` function (core §3.5.5) to additionally cover `undefined` for host languages that distinguish it. It is otherwise consistent with `required` bind semantics (core §2.1.4).

interface PageProgress {
  id: string;
  title?: string;
  fieldCount: number;
  filledCount: number;
  complete: boolean;
}

interface FieldDescription {
  path: string;
  label: string;
  hint?: string;
  dataType: string;
  widget?: string;
  value: unknown;
  required: boolean;
  relevant: boolean;
  readonly: boolean;
  valid: boolean;
  validation: ValidationResult[];
  options?: Array<{ value: string; label: string }>;
  calculated?: boolean;
  expression?: string;
  repeatIndex?: number;
  repeatCount?: number;
  minRepeat?: number;
  maxRepeat?: number;
  help: FieldHelp;
}

`widget` — the `presentation.widgetHint` value from the field's Definition item, if present. This is advisory and reflects the form author's intended control type, not the resolved component-tree widget.

interface SetValueResult {
  accepted: boolean;
  value: unknown;
  validation: ValidationResult[];
}

interface BulkSetResult {
  results: Array<{
    path: string;
    accepted: boolean;
    validation: ValidationResult[];
    error?: ToolError;
  }>;
  summary: { accepted: number; rejected: number; errors: number };
}

interface ProfileApplyResult {
  filled: Array<{ path: string; value: unknown }>;
  skipped: Array<{ path: string; reason: string }>;
  validation?: ValidationReport;
}

The `reason` field in skipped entries SHOULD use one of the following standard values:

| Value | Meaning |
| --- | --- |
| `NOT_FOUND` | The target path does not exist in the form. |
| `READONLY` | The target field is readonly. |
| `NOT_RELEVANT` | The target field is currently not relevant. |
| `INVALID_VALUE` | The value was rejected by the engine. |
| `DECLINED` | The user declined the mutation during confirmation. |

Providers MAY use additional `x-`-prefixed reason strings. Consumers MUST treat unrecognized reason strings as generic skips.

interface NextIncompleteResult {
  path?: string;
  pageId?: string;
  label: string;
  reason: "empty" | "invalid" | "required" | "complete";
}
```

`ValidationResult` and `ValidationReport` retain their meanings from the core
Formspec specification and related schemas.

For providers that expose page-scoped progress or navigation, `PageProgress`
and page-scoped `NextIncompleteResult` are computed over the provider's
current live, instance-expanded field set for each page. Page-level results
identify the logical page, not an individual repeat instance. Providers MAY
surface repeat-specific detail through field-scoped tools such as
`formspec.field.describe`.

## 5. Field Help and Context Resolution

### 5.1 `FieldHelp`

`FieldHelp` is the structured grounding object returned by
`formspec.field.help` and embedded in `FieldDescription`.

```typescript
interface FieldHelp {
  path: string;
  label: string;
  references: Partial<Record<ReferenceType, ReferenceEntry[]>>;
  concept?: ConceptBinding;
  equivalents?: ConceptEquivalent[];
  summary?: string;
  commonMistakes?: string[];
}

type ReferenceType =
  | "documentation" | "example" | "regulation" | "policy" | "glossary"
  | "schema" | "vector-store" | "knowledge-base" | "retrieval"
  | "tool" | "api" | "context";

interface ReferenceEntry {
  title: string;
  uri?: string;
  content?: string | object;
  excerpt?: string;
  rel?: string;
  priority?: "primary" | "supplementary" | "background";
}

interface ConceptBinding {
  concept: string;
  system?: string;
  code?: string;
  display?: string;
}

interface ConceptEquivalent {
  concept?: string;
  system?: string;
  code?: string;
  display?: string;
  type?: "exact" | "close" | "broader" | "narrower" | "related";
}
```

### 5.2 References Resolution

To resolve `FieldHelp.references`, a conformant provider MUST:

1. Load every active References Document targeting the live Definition. When multiple References Documents target the active Definition, a provider MUST process all documents. Entries from all documents are collected into a single candidate set for target matching and audience filtering. The document-order position of each entry (its position within its source document, with earlier documents preceding later ones) is used as the secondary sort key within priority tiers during the step 8 sort.
2. Determine the field path and its ancestor paths by splitting the path on `.`
   and taking progressively shorter prefixes. For path
   `organization.details.ein`, the ancestors are `organization.details` and
   `organization`. When the path contains repeat indices (e.g.,
   `items[0].field`), ancestor candidates MUST include both the index-stripped
   form (`items`) and the wildcard form (`items[*]`) for each ancestor segment.
3. Collect references whose `target` matches:
   - the exact field path,
   - any explicit ancestor path selected during that walk, and
   - `"#"` for form-level context. Wildcard ancestor paths (e.g., `items[*]`) are valid candidates and MUST be included when building the candidate set for indexed paths.
4. **MUST NOT** treat references as implicitly inherited. Any ancestor context
   included in `FieldHelp` is included because the provider explicitly walked
   ancestor targets, not because the References specification defines
   inheritance.
5. Filter by `audience`:
   - `"agent"` consumers receive `agent` and `both`,
   - `"human"` consumers receive `human` and `both`,
   - `"both"` consumers receive all entries.
6. Resolve any document-local `$ref` bindings before grouping.
7. Group entries by `type`.
8. Sort entries within a type by effective priority:
   `primary` before `supplementary` before `background`, preserving document
   order within a tier.

### 5.3 Ontology Resolution Cascade

Concept identity for a field may come from up to three sources. Providers MUST
resolve them in the following order:

1. **Ontology Document binding** — a concept binding for the field's full path
   in an active Ontology Document. When multiple Ontology Documents are loaded, a provider MUST resolve concept bindings using the last-loaded document's binding for a given path. The load order is the array order in which documents were provided to the provider. This pins the Ontology Specification's implementation-defined load order (ontology §8.2) to the concrete array order of the Assist API.
2. **Registry concept entry** — a loaded registry entry whose `name` matches
   the field's `semanticType`.
3. **`semanticType` literal** — the raw `semanticType` string treated as a
   literal semantic annotation.

When processing `equivalents`, an absent relationship type MUST be treated as
`"exact"`.

### 5.4 Synthesized Fields

`summary` and `commonMistakes` are OPTIONAL synthesized outputs. Providers MAY
leave them empty. If present, they MUST be treated as advisory material and
MUST NOT override the authoritative meaning of References or Ontology bindings.

When providers synthesize `summary`, the result SHOULD be a concise plain-text sentence suitable for display in a tooltip or chat context. Providers MAY use LLM-generated content. The synthesis method is implementation-defined.

## 6. Profile Matching

### 6.1 Profile Structure

```typescript
interface UserProfile {
  id: string;
  label: string;
  created: string;
  updated: string;
  concepts: Record<string, ProfileEntry>;
  fields: Record<string, ProfileEntry>;
}

interface ProfileEntry {
  value: unknown;
  confidence: number;
  source: ProfileEntrySource;
  lastUsed: string;
  verified: boolean;
}

type ProfileEntrySource =
  | { type: "form-fill"; formUrl: string; fieldPath: string; timestamp: string }
  | { type: "manual"; timestamp: string }
  | { type: "import"; source: string; timestamp: string }
  | { type: "extension"; extensionId: string; timestamp: string };

interface ProfileMatch {
  path: string;
  concept?: string;
  value: unknown;
  confidence: number;
  relationship?: "exact" | "close" | "broader" | "narrower" | "related" | "field-key";
  source: ProfileEntrySource;
}
```

### 6.2 Matching Algorithm

For each writable field considered for autofill, a conformant provider MUST:

1. Resolve the field's concept identity using §5.3.
2. Check `profile.concepts[conceptUri]` for an exact concept match.
3. If no exact match exists, evaluate concept equivalents using these
   RECOMMENDED confidence levels:
   - `exact` or absent type: `0.95`
   - `close`: `0.80`
   - `broader` or `narrower`: `0.60`
   - `related`: `0.40`
4. If no concept-based match exists, MAY fall back to `profile.fields[path]`
   with relationship `"field-key"` and low confidence.
5. SHOULD discard matches below an implementation-defined threshold. `0.50` is
   RECOMMENDED.

### 6.3 Learning Rules

When implementing `formspec.profile.learn`, a provider:

- **SHOULD** store values under concept identity when available.
- **MAY** store field-path fallbacks for stable, non-concept-bound fields.
- **MUST NOT** transmit profile data off-device or off-origin without explicit
  user consent.

## 7. Transport Bindings

### 7.1 Transport-Neutral Requirements

Any conformant Assist transport MUST provide:

1. **Tool discovery** — the consumer can enumerate available tools together
   with descriptions and JSON input schemas. Tool discovery results SHOULD include only tools the provider actually supports. Consumers SHOULD NOT assume all tools from the normative catalog are present. Consumers SHOULD check tool enumeration before invocation, or handle `UNSUPPORTED` errors gracefully.
2. **Tool invocation** — the consumer can invoke a tool by name with JSON input
   and receive the §4 envelope.
3. **Error preservation** — transport adapters MUST preserve `ToolError`
   semantics.
4. **Human-in-the-loop support** — two independent layers, neither replacing
   the other: the provider can pause and obtain user confirmation before a
   requested mutation proceeds, and the binding lets the consumer's runtime
   (browser, agent host) gate consequential tools behind its own confirmation.

### 7.2 WebMCP Binding

[WebMCP][webmcp] exposes page-defined tools to in-page agents and the
browser's agent through `document.modelContext`. It is the canonical browser
transport for Assist.

A conformant WebMCP binding:

- **MUST** register each tool with
  `document.modelContext.registerTool(tool, { signal })` and unregister by
  aborting that signal. There is no atomic replacement; tool names MUST be
  unique per document.
- **MUST** use the Assist tool name verbatim. `formspec.{category}.{action}`
  satisfies WebMCP's name grammar (1–128 ASCII alphanumerics, `_`, `-`, `.`).
- **MUST** supply `title` (browsers show it in consent UI), `description`, a
  JSON Schema `inputSchema` with a `description` on every property, and
  `annotations` per the table below.
- **MUST** return the §4 result object from `execute`, and MUST return
  `ToolError` as `{ error: ToolError }` rather than rejecting: WebMCP delivers
  a rejected `execute` as a bare `UnknownError` and discards the reason.
- **MUST** honor `execute`'s `signal`: no mutation may be applied after the
  abort, and the signal MUST reach any provider-side confirmation so the
  dialog can be dismissed. The binding reports `x-cancelled`; the WebMCP
  caller observes its own abort reason and never sees that result.
- **MUST** treat the document as hosting one Assist Provider at a time: names
  are fixed, so a second provider's registrations are refused wholesale.
  Construct a new provider only after the previous one was detached.
- **MUST NOT** install a polyfill on `document.modelContext`. The object is
  per-document, `SecureContext`-only, and gated by the `tools` permissions
  policy (default `'self'`); which polyfill, if any, is the host page's call.
  When the object is absent the binding is a no-op.
- **SHOULD** rely on the `toolchange` event for discovery signaling rather
  than a custom event.
- **MAY** pass `exposedTo` when the form is embedded cross-origin (e.g. a
  white-label respondent shell) and the embedding document's agent should see
  the tools.

Annotation mapping:

| Assist tools | `annotations` | Why |
|---|---|---|
| §3.2 introspection, §3.4 validation, §3.6 navigation, `formspec.profile.match` | `readOnlyHint: true` | No state change. |
| `formspec.field.help`, `formspec.field.describe` | `readOnlyHint: true`, `untrustedContentHint: true` | Relay References `content`, which may be fetched from third-party URIs. |
| §3.3 mutation, `formspec.profile.apply`, `formspec.profile.learn` | `consequentialHint: true` | Write the respondent's form or profile; the hint lets browsers and agents gate consequential tools behind their own confirmation (WebMCP §6.4.5). It is advisory — the provider-side gate is the only guaranteed one. |

`consequentialHint` is the consumer-side layer of §7.1(4). The provider-side
`confirm: true` handler on `formspec.profile.apply` remains required.

In-page consumers discover tools with `document.modelContext.getTools()`
(`RegisteredTool[]`, each carrying its owning `window` and `origin`) and invoke
them with `executeTool(tool, input, { signal })`, which resolves to the
serialized result object. The browser's agent observes the same tool map
without running page script.

### 7.3 MCP Binding

For server-mediated agents, Assist tools MAY be exposed as MCP tools.

A conformant MCP binding:

- **MUST** preserve the Assist tool names and result envelopes.
- **SHOULD** map human-in-the-loop requests to explicit MCP user prompts.

### 7.4 Browser Messaging Binding

Browser extensions and page scripts MAY use a `postMessage`-style binding.

A conformant browser messaging binding SHOULD:

- announce available tools through a DOM event or equivalent discovery signal,
- correlate requests and responses with stable call identifiers,
- isolate privileged extension APIs from injected page code.

Consumers and providers SHOULD use a `callId` string property to correlate requests and responses. The format is implementation-defined; UUIDs are RECOMMENDED.

### 7.5 HTTP Binding

Remote agents MAY use an HTTP transport.

A conformant HTTP binding SHOULD expose:

- `GET /formspec/tools` for discovery, and
- `POST /formspec/tools/{name}` for invocation.

The `{name}` segment uses the full dot-delimited tool name. Servers MUST NOT interpret dots in the tool name as path separators or file extensions.

HTTP is a binding detail only. The normative contract remains the Assist tool
surface and result envelope.

## 8. Declarative Browser Annotations

Renderers SHOULD expose passive metadata that lets consumers identify and
partially understand a form even when no Assist Provider is active. Two layers
coexist: Formspec identity (§8.1) and WebMCP's declarative tool attributes
(§8.2), which make the rendered `<form>` a browser-synthesized tool with no
page script.

### 8.1 Form Container Annotations

The form container SHOULD expose:

- `data-formspec-form`
- `data-formspec-title`
- `data-formspec-url`
- `data-formspec-version`

These identify a Formspec form to extension Mode 2 (§10.2) regardless of
WebMCP support.

### 8.2 Declarative WebMCP Attributes

Where the renderer emits a native `<form>`, it SHOULD emit WebMCP's declarative
attributes ([explainer][webmcp-declarative]):

| Attribute | On | Value |
|---|---|---|
| `toolname` | `<form>` | WebMCP-legal, unique per document; `formspec.form.fill` is RECOMMENDED for a page with one form. |
| `tooldescription` | `<form>` | The Definition `description`, else `title`. |
| `toolautosubmit` | `<form>` | **Absent by default.** Without it the agent fills and the respondent submits — the passive tier's human-in-the-loop. Renderers MUST NOT add it unless the host explicitly opts in. |
| `name` | each control | The field path; it becomes the property name in the synthesized schema. |
| `toolparamdescription` | each control | Concise field context: the field `hint`, else `FieldHelp.summary` (§5.4), else the label. |
| `autocomplete` | each control | Best-effort token per §8.3. |

Standard accessibility metadata (visible labels, `aria-describedby`, native
semantics) MUST remain intact. Providers and renderers **MUST NOT** degrade
accessibility to add Assist annotations.

Declarative tools are the Passive Provider tier (§2.3). The browser
synthesizes a flat JSON Schema from named controls, so repeat groups,
relevance, calculated fields, and FEL-driven behavior do not survive into it;
a live Assist Provider (§7.2) is the tier that carries them. When a
declarative submission is agent-invoked, page script MAY intercept it via
`SubmitEvent.agentInvoked` and answer with `respondWith()`; the answer SHOULD
be a §4 result object such as the `ValidationReport` the submission produced.

[webmcp-declarative]: https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md

### 8.3 Ontology-to-Autocomplete Mapping

Renderers SHOULD map well-known concept URIs to HTML `autocomplete` tokens when
there is a reasonable one-to-one correspondence.

| Concept URI | `autocomplete` |
|---|---|
| `https://schema.org/givenName` | `given-name` |
| `https://schema.org/familyName` | `family-name` |
| `https://schema.org/email` | `email` |
| `https://schema.org/telephone` | `tel` |
| `https://schema.org/streetAddress` | `street-address` |
| `https://schema.org/addressLocality` | `address-level2` |
| `https://schema.org/addressRegion` | `address-level1` |
| `https://schema.org/postalCode` | `postal-code` |
| `https://schema.org/addressCountry` | `country` |
| `https://schema.org/birthDate` | `bday` |

This mapping is advisory. Unknown concepts MUST NOT cause an error.

## 9. Sidecar Discovery

Assist Providers and extension consumers often need References and Ontology
sidecars for a form encountered in the wild.

Consumers SHOULD attempt discovery in this order:

1. **Active provider first.** If a live Assist Provider exists, use its tools
   rather than independently reloading sidecars.
2. **HTML link relations.** Pages SHOULD publish sidecars with:
   - `<link rel="formspec-references" href="...">`
   - `<link rel="formspec-ontology" href="...">`
   - `<link rel="formspec-registry" href="...">`
3. **Definition metadata.** A definition MAY publish sidecar URLs in a future
   `sidecars` metadata object.
4. **Well-known sibling paths.** Consumers MAY try heuristic sibling paths such
   as `references.json` and `ontology.json`.

Sidecars are immutable for a given `(definitionUrl, definitionVersion)` pair.
Consumers SHOULD cache using that tuple as the primary key.

Missing sidecars MUST degrade gracefully:

- without References, help contains less context;
- without Ontology, profile matching falls back to weak heuristics;
- without both, core introspection, mutation, and validation still work.

## 10. Extension Integration

Browser extensions are a primary Assist consumer. They SHOULD support three
operating modes.

### 10.1 Mode 1: Active Assist Provider

The page already exposes a conformant Assist Provider.

The extension:

- discovers tools through the provider's binding — under native WebMCP,
  `document.modelContext.getTools()`; a polyfilled page exposes only a
  page-world object, so the polyfill's own bridge is the discovery path,
- invokes the full tool catalog,
- treats provider-returned help and validation as authoritative.

### 10.2 Mode 2: Formspec Form Without Assist

The page renders a Formspec form but does not expose Assist.

The extension:

- detects the live form and engine through public host APIs,
- MAY bootstrap an in-page Assist Provider,
- SHOULD discover and cache sidecars using §9.

### 10.3 Mode 3: Plain HTML Form

The page contains no Formspec form.

The extension MAY fall back to heuristic field detection using:

- label associations,
- `name`, `id`, and `placeholder`,
- `aria-label`,
- `autocomplete` tokens.

Mode 3 is explicitly degraded and non-authoritative. Consumers MUST treat its
profile matches as advisory.

## 11. Security and Privacy Considerations

Assist implementations handle sensitive live form data. A conformant provider:

1. **MUST** treat all tool input as untrusted.
2. **MUST** validate paths and values before acting on them.
3. **MUST NOT** bypass readonly or relevance protections.
4. **MUST NOT** block persistence solely because validation findings exist,
   unless the underlying host policy already requires that behavior outside
   Assist.
5. **MUST NOT** transmit profile data without explicit user consent.
6. **SHOULD** encrypt profile storage at rest where the platform allows.
7. **SHOULD** keep privileged browser-extension capabilities separated from any
   page-context bootstrap code.

## 12. Conformance Summary

### 12.1 Provider Requirements

A conformant Assist Provider:

- **MUST** implement the required core tools.
- **MUST** return the §4 result or error object in the envelope its binding
  defines (§4.1).
- **MUST** implement field-help resolution per §5.
- **MUST** preserve core processing semantics.
- **MUST** support at least one discovery and invocation transport.

### 12.2 Consumer Requirements

A conformant Assist Consumer:

- **MUST** parse structured result payloads.
- **MUST** respect provider errors and unsupported-tool conditions.
- **SHOULD** use provider-exposed help and validation rather than substituting
  scraped UI state when provider access exists.
- **SHOULD** surface or request confirmation for high-impact writes.

### 12.3 Passive Provider Requirements

A conformant Passive Provider:

- **MUST** preserve accessibility and native semantics.
- **SHOULD** emit stable `data-formspec-*` metadata.
- **MAY** omit the active tool surface entirely.
