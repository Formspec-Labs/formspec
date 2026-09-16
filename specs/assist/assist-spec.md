---
title: Formspec Assist Specification
version: 1.0.0-draft.3
date: 2026-09-16
depends_on:
  - specs/core/references-spec.md
  - specs/ontology/ontology-spec.md
  - specs/core/spec.md
---

# Formspec Assist Specification v1.0

**Version:** 1.0.0-draft.3
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

Draft 3 makes errors actionable — `ToolError.retryable`, messages that name
the fix, `x-user-edited` (§4.2) — and adds the stale-write guard (§4.3 rule
6), the WebMCP registration profile and permissive registered schemas (§7.2),
output minimization for field help and profile match (§5.1–§5.2, §6.1),
`formspec.profile.apply` keyed by path (§3.5), renderer marking of
assistant-written fields (§8.4), the §11 threat map against WebMCP §6.3–§6.4,
and the LLM tool-name fallback (§3.1).

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

LLM tool-name grammars (Claude, OpenAI: `^[a-zA-Z0-9_-]{1,128}$`) reject
`.`. A consumer presenting tools to such a model MAY map `.` → `_`
deterministically (`formspec.field.set` → `formspec_field_set`) and MUST map
the model's call back before invoking. Providers MUST accept only the dotted
form on the wire. Catalog names MUST NOT contain `_`, so the mapping is a
bijection.

### 3.2 Required Core Introspection Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.form.describe` | `{}` | `FormDescription` | High-level form metadata and status. |
| `formspec.field.list` | `{ filter?: "all" \| "required" \| "empty" \| "invalid" \| "relevant" }` | `FieldSummary[]` | Default filter is `"relevant"`. |
| `formspec.field.describe` | `{ path: string }` | `FieldDescription` | Includes live state and resolved help, minimized at the §5.2 defaults (no `content`, 4096-byte cap). |
| `formspec.field.help` | `{ path: string, audience?: "human" \| "agent" \| "both", includeContent?: boolean, maxBytes?: number }` | `FieldHelp` | Default audience is `"agent"`. Providers MAY allow consumers to override this default. `includeContent` defaults to `false`; `maxBytes` defaults to 4096, minimum 512 (§5.2). |
| `formspec.form.progress` | `{}` | `FormProgress` | Progress summary across required and total fields. |

### 3.3 Required Core Mutation Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.field.set` | `{ path: string, value?: unknown, expected?: unknown }` | `SetValueResult` | MUST reject writes to readonly, calculated, or non-relevant fields. A respondent-written value is replaced only when `expected` equals it (§4.3 rule 6); otherwise `x-user-edited`. |
| `formspec.field.bulkSet` | `{ entries: Array<{ path: string, value: unknown, expected?: unknown }> }` | `BulkSetResult` | MAY partially succeed; each entry is independent unless a transport defines stronger atomicity. `expected` is per entry. |

For a choice field (one with options), `value` MAY be an option's label
instead of its value; the provider stores the option value. Label matching is
case-insensitive and exact; no match or an ambiguous match is
`INVALID_VALUE`, and the message lists the options as `value — label`.

The `value` property in `formspec.field.set` MAY be omitted. An omitted `value` is treated as `null` and clears the field. Providers MUST treat `undefined` (from omission) identically to `null` for the purpose of setting field values.

### 3.4 Required Core Validation Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.form.validate` | `{ profile?: ValidationProfile }` | `ValidationReport` | `ValidationProfile` is the core vocabulary (`live`, `on-submit`, `on-demand`, `off`); default `"live"`. |
| `formspec.field.validate` | `{ path: string }` | `{ results: ValidationResult[] }` | Field-scoped validation only. |

### 3.5 Optional Profile Tools

| Tool | Input | Output | Notes |
|---|---|---|---|
| `formspec.profile.match` | `{ profileRef?: string }` | `{ matches: ProfileMatch[] }` | Names the fields a profile can fill. The wire shape carries no values and no provenance (§6.1); values stay in-page until `profile.apply`. |
| `formspec.profile.apply` | `{ paths?: Array<string \| { path: string, expected: unknown }>, confirm?: boolean }` | `ProfileApplyResult` | Applies the current match set (§6.2). Omitted `paths` means every current match. Values resolve in-page from that set, never from tool input. A path that does not exist is skipped `NOT_FOUND`; one that exists but has no current match, `x-not-matched`; one that left the set because it became readonly or non-relevant, `READONLY` / `NOT_RELEVANT`. Skips are decided before confirmation, so the respondent is shown only writes that will land. `confirm: true` requires human-in-the-loop. When `confirm` is `true` and the provider has no confirmation mechanism, the provider MUST return an error with code `x-confirmation-required`. The provider MUST NOT silently apply values without confirmation when confirmation was explicitly requested. The confirmation shows the respondent each `{ path, value }` about to be written, in the caller's order. `{ path, expected }` entries follow §4.3 rule 6. |
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
  retryable: boolean;
}
```

`retryable` is `true` when the same call may be retried with corrected input
without consulting the respondent: `NOT_FOUND`, `INVALID_PATH`,
`INVALID_VALUE`, `NOT_RELEVANT`, `UNSUPPORTED`. It is `false` otherwise,
including every `x-` code — the safe reading of an unknown failure is "ask
the human".

`message` MUST name the fix, not just the fault: what was expected, what
arrived, and where. The shapes below are normative for input validation:

| Fault | Message shape |
| --- | --- |
| enum | `input.filter must be one of: all, required, empty, invalid, relevant (got "foo")` |
| unknown key | `unexpected input property "mode"; accepted: profile` |
| missing required | `missing required input property "path" (string: field path, e.g. "organization.ein")` |
| type | `input.entries must be an array of { path, value }` |

Providers MAY define additional `x-`-prefixed error codes. Consumers MUST treat
unknown non-`x-` codes as generic failures.

The following `x-`-prefixed error codes are RECOMMENDED for common provider conditions:

| Code | Meaning |
| --- | --- |
| `x-confirmation-required` | A mutation requiring `confirm: true` was requested but no confirmation mechanism is available. |
| `x-invalid-sidecar` | A loaded References or Ontology document has a structural error or its `targetDefinition` does not match the active form. |
| `x-cancelled` | The caller aborted the invocation before the mutation was applied. Nothing was written. Observable by in-process callers; a WebMCP caller sees its own abort reason instead (§7.2). |
| `x-user-edited` | The target holds a value the respondent (or a hydrated response) wrote and the call's `expected` is absent or does not equal it (§4.3 rule 6). Nothing was written. The error never echoes the current value: a consumer that wants to replace it reads the field through `formspec.field.describe`, where the provider's value-visibility policy applies. |

### 4.3 Mutation Rules

For every mutation tool:

1. A provider **MUST** validate that the path resolves to a writable field.
2. A provider **MUST NOT** silently write to a readonly field.
3. A provider **MUST NOT** silently write to a non-relevant field.
4. A provider **MUST NOT** suppress core validation triggered by the write.
5. A provider **SHOULD** support human-in-the-loop confirmation for bulk or
   profile-driven writes.
6. A provider **MUST NOT** overwrite a filled field (§4.4) the assistant did
   not write unless the entry proves the caller has read it: the write is
   compare-and-set. The engine records a write source per path; a write is
   *the assistant's own* when that source is `assist`. When the target's
   current value is non-empty and its write source is anything but `assist`
   (a respondent edit, a hydrated response, or no source recorded), the
   write proceeds only if the entry carries `expected` deep-equal to the
   current value; otherwise the provider refuses with `x-user-edited` and
   writes nothing. A blind flag is not accepted: it is exactly the
   "overwrite an edit the agent never read" failure this rule exists to stop
   (WebMCP issue #298), and injected sidecar text could request it. Empty
   fields and fields the assistant itself wrote are always writable.
   Calculated fields are refused as `READONLY` before this check. Applies per
   entry to `formspec.field.set`, `formspec.field.bulkSet`, and
   `formspec.profile.apply`. Every Assist write **MUST** be recorded with
   source `assist` so the guard and the renderer (§8.4) see the same fact.
   A deliberate read-then-replace still reaches the respondent through the
   consumer runtime's `consequentialHint` gate (§7.1(4)).

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
  summary: { accepted: number; rejected: number; skipped: number; errors: number };
}

`skipped` counts entries refused by §4.3 rule 6; each carries `accepted: false` and `error.code` `x-user-edited`.

interface ProfileApplyResult {
  filled: Array<{ path: string }>;
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
| `x-user-edited` | The target holds a respondent-written value and the entry's `expected` is absent or stale (§4.3 rule 6). |
| `x-not-matched` | The path exists but has no current profile match (§6.2). |

`filled` carries paths only. Every channel that returns a respondent's value
to a consumer — `formspec.field.describe`, confirmation prompts — is subject
to the provider's value-visibility policy (§11); results and errors never
route around it.

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
  truncated?: { omitted: Partial<Record<ReferenceType, number>> };
}

type ReferenceType =
  | "documentation" | "example" | "regulation" | "policy" | "glossary"
  | "schema" | "vector-store" | "knowledge-base" | "retrieval"
  | "tool" | "api" | "context";

interface ReferenceEntry {
  title: string;
  type: ReferenceType;
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

`ReferenceEntry` on the wire is a projection of the References Document
entry: `title`, `type`, `uri`, `excerpt`, `rel`, `priority` always;
`content` only when the call carried `includeContent: true` (§3.2). Reference
`content` is the largest and least trusted text a provider relays (§11), so
the consumer asks for it. `truncated` is present only when the §5.2 byte cap
dropped entries, and counts them per type so the consumer knows what it did
not see.

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
9. Project each entry to the wire shape (§5.1): omit `content` unless the
   call carried `includeContent: true`.
10. Cap the serialized `references` object — UTF-8 bytes of compact JSON —
    at `maxBytes` (default 4096, minimum 512; a smaller request is raised to
    512). While it is over the cap, degrade before dropping, always taking
    the entry with the lowest effective priority across all types first
    (`background` before `supplementary` before `primary`; an absent
    `priority` ranks as `supplementary`; last in document order first within
    a tier): strip `content`, then strip `excerpt`, then drop whole entries
    — never below one entry per `type` that had any. Record dropped entries
    in `FieldHelp.truncated.omitted` by type. The consumer raises `maxBytes`,
    asks again with a narrower `audience`, or fetches by `uri`.

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
  confidence: number;
  relationship?: "exact" | "close" | "broader" | "narrower" | "related" | "field-key";
}
```

`UserProfile` and `ProfileEntry` are the stored shape. `ProfileMatch` is the
wire shape `formspec.profile.match` returns: a projection that names the
field and how well it matched, with no `value` and no `source`. The value
and its provenance (`formUrl`, `fieldPath`, timestamps) stay in-page; the
respondent sees the value at `profile.apply` confirmation (§3.5), the agent
never does.

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

The reference profile store is origin-scoped `localStorage`. In private
browsing it is ephemeral: the browser discards it at session end, and
`formspec.profile.learn` persists nothing beyond the session (WebMCP §6.3.5).

## 7. Transport Bindings

### 7.1 Transport-Neutral Requirements

Any conformant Assist transport MUST provide:

1. **Tool discovery** — the consumer can enumerate available tools together
   with descriptions and JSON input schemas. Tool discovery results SHOULD include only tools the provider actually supports. Consumers SHOULD NOT assume all tools from the normative catalog are present. Consumers SHOULD check tool enumeration before invocation, or handle `UNSUPPORTED` errors gracefully.
2. **Tool invocation** — the consumer can invoke a tool by name with JSON input
   and receive the §4 envelope.
3. **Error preservation** — transport adapters MUST preserve `ToolError`
   semantics.
4. **Human-in-the-loop support** — three layers, in order of what they can
   bind. (a) Page preconditions (§4.3): readonly, relevance, and the
   compare-and-set guard hold for every tool-path write regardless of which
   agent calls. (b) The consumer runtime's confirmation, requested through
   `consequentialHint` (§7.2): the only layer that can bind a user agent that
   also drives the page, when that runtime honors the hint. (c) The
   provider-side confirmation (`confirm: true`): UX for the respondent, not a
   security boundary — a user agent that also drives the page can click it
   ([webmcp#288][webmcp-288]).

[webmcp-288]: https://github.com/webmachinelearning/webmcp/issues/288

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
- **MUST** supply `title` (browsers show it in consent UI), `description`
  (at most 500 characters), a JSON Schema `inputSchema` with a `description`
  on every property (at most 150 characters each), and `annotations` per the
  table below. Titles are imperative ("Set field value"); descriptions say
  what the tool does, when to use it, and what comes back.
- **MUST NOT** set `additionalProperties: false` on a registered
  `inputSchema`. The provider validates strictly in code and answers an
  unexpected key with `INVALID_VALUE` naming the accepted keys (§4.2). A
  schema-level rejection carries no message, so an agent that sent one extra
  key stalls with nothing to correct; the provider's error keeps the fix on
  the path. Once WebMCP resolves input validation
  ([webmcp#92][webmcp-92]) the browser will pre-validate against this
  schema, and a permissive schema keeps the provider's error reachable.
- **MUST** register the default profile unless the host asks for `'all'`.
  The default registers `formspec.form.describe`, `formspec.form.progress`,
  `formspec.field.list`, `formspec.field.describe`, `formspec.field.help`,
  `formspec.field.bulkSet`, `formspec.form.validate`,
  `formspec.form.nextIncomplete`, plus `formspec.profile.match`,
  `formspec.profile.apply`, and `formspec.profile.learn` when the provider
  has profile *capability* — a storage backend or a loaded profile, not
  merely default in-memory storage. A profile loaded after registration
  adds the three profile tools then (registration is additive; only
  replacement is non-atomic). `'all'` registers the whole catalog. Every
  registered tool costs the agent context on every turn, and the omitted
  tools overlap: `field.set` is a one-entry `bulkSet`, `field.validate` is
  one path's slice of the `form.validate` report, and `form.pages` is
  `form.progress.pages`. The
  omitted tools remain on the provider for the other bindings (§7.3–§7.5).
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
| §3.3 mutation, `formspec.profile.apply`, `formspec.profile.learn` | `consequentialHint: true` | Write the respondent's form or profile; the hint lets browsers and agents gate consequential tools behind their own confirmation (WebMCP §6.4.5). The hint is advisory to the agent; the browser's gate is the security boundary (§7.1(4)). |

`consequentialHint` is the consumer-side layer of §7.1(4). The provider-side
`confirm: true` handler on `formspec.profile.apply` remains required.

In-page consumers discover tools with `document.modelContext.getTools()`
(`RegisteredTool[]`, each carrying its owning `window` and `origin`) and invoke
them with `executeTool(tool, input, { signal })`, which resolves to the
serialized result object. The browser's agent observes the same tool map
without running page script.

[webmcp-92]: https://github.com/webmachinelearning/webmcp/issues/92

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

A renderer SHOULD offer, as a host opt-in, to render the form as a native
`<form>` carrying WebMCP's declarative attributes
([explainer][webmcp-declarative]). It MUST NOT do so by default: a declarative
fill tool beside an active Assist Provider is the overlapping-tool shape WebMCP
warns against, and a native `<form>` in light DOM nests inside any host form
around it. A page MUST NOT expose both tiers for the same form.

| Attribute | On | Value |
|---|---|---|
| `toolname` | `<form>` | WebMCP-legal, unique per document; `formspec.form.fill` is RECOMMENDED for a page with one form. Never one of the §3 catalog names. |
| `tooldescription` | `<form>` | The Definition `description`, else `title`. Plain text, markup stripped, at most 500 characters. |
| `toolautosubmit` | `<form>` | **Absent by default.** Without it the agent fills and the respondent submits — the passive tier's human-in-the-loop. Renderers MUST NOT add it unless the host explicitly opts in. |
| `name` | each control | The field path; it becomes the property name in the synthesized schema. |
| `toolparamdescription` | each control | Concise field context: the field `hint`, else `FieldHelp.summary` (§5.4), else the label. Plain text, markup stripped, at most 150 characters. |
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

### 8.4 Assistant-Written Fields

The respondent must be able to see what the assistant wrote and where. A
renderer whose engine records write sources (§4.3 rule 6):

- **MUST** stamp `data-formspec-agent-filled=""` on the field root of every
  field whose current write source is `assist`, and remove it when a
  respondent edit changes the source.
- **MUST** treat an assistant write as touching the field, so its validation
  shows immediately rather than waiting for blur or submit.
- **SHOULD** announce each write batch once through its live region
  ("{label} filled by your assistant"; the string is Locale-resolvable, with
  English as the fallback).
- **SHOULD** give `[data-formspec-agent-filled]` a visible style hook with
  contrast that passes the renderer's accessibility gate.

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

Assist handles live form data and rides on WebMCP's threat model
([WebMCP][webmcp] §6.3–§6.4). Each row names the threat, the mechanism this
specification supplies, and what stays open.

| WebMCP threat | Assist mechanism | Residual gap |
|---|---|---|
| §6.3.1.1 Tool poisoning via metadata | Tool names, titles, descriptions, and schemas are provider constants (§7.2); no form, sidecar, or respondent text reaches them. | A host registering its own tools beside Assist owns its own metadata. |
| §6.3.1.2 Output injection | References `content` is off by default and the help payload is byte-capped (§5.1–§5.2); `field.help` and `field.describe` carry `untrustedContentHint` (§7.2); consumers parse structured results, never prose (§2.2). | `title` and `excerpt` from a compromised sidecar still reach the agent; the hint informs, it does not sanitize. |
| §6.3.1.3 Tool implementation as target | All tool input is untrusted: paths and values are validated before use, readonly and non-relevant targets are refused, respondent-written values are replaced only compare-and-set (`expected`), and every write runs the same engine path as the UI (§4.3). | An engine defect reachable from the UI is reachable from Assist. |
| §6.3.2 Misrepresentation of intent | Imperative titles and accurate descriptions (§7.2); `consequentialHint` on every writing tool; the browser's gate is the boundary (§7.1(4)). | Provider-side confirmation is UX — a user agent that drives the page can click it ([webmcp#288][webmcp-288]). |
| §6.3.3 Over-parameterization | Inputs are paths, values, and enum switches; `profile.match` returns no values and no provenance, `profile.apply` takes paths only (§3.5, §6.1). | `field.describe` returns the current value; the tool is useless without it. |
| §6.3.4 Same-origin | `exposedTo` is the host's decision (§7.2); in an undelegated cross-origin frame `registerTool` throws `NotAllowedError` and the binding is a no-op. | A host that delegates the `tools` policy delegates the whole catalog. |
| §6.3.5 Private browsing | The reference profile store is origin `localStorage`, ephemeral in private mode; profile data never leaves the origin without consent (§6.3). | In normal mode learned values persist until the user clears them. |
| §6.4.1 Permissions policy | The binding never polyfills `document.modelContext`; `tools` defaults to `'self'` (§7.2). | None owned here. |
| §6.4.2 Input lengths | Tool descriptions ≤ 500 and property descriptions ≤ 150 characters (§7.2); `tooldescription` / `toolparamdescription` capped and markup-stripped (§8.2); help payload byte-capped (§5.2). | Field `value` input is unbounded; the engine's `dataType` coercion is the check. |

Beyond the map, a conformant provider:

1. **MUST NOT** block persistence solely because validation findings exist,
   unless the underlying host policy already requires that behavior outside
   Assist.
2. **SHOULD** encrypt profile storage at rest where the platform allows.
3. **SHOULD** keep privileged browser-extension capabilities separated from any
   page-context bootstrap code.

## 12. Conformance Summary

### 12.1 Provider Requirements

A conformant Assist Provider:

- **MUST** implement the required core tools.
- **MUST** return the §4 result or error object in the envelope its binding
  defines (§4.1).
- **MUST** implement field-help resolution per §5.
- **MUST** preserve core processing semantics.
- **MUST** refuse to overwrite a respondent-written value unless the entry's
  `expected` equals it, and record every Assist write with source `assist`
  (§4.3 rule 6).
- **MUST** set `retryable` on every `ToolError` and name the fix in
  `message` (§4.2).
- **MUST** support at least one discovery and invocation transport.

### 12.2 Consumer Requirements

A conformant Assist Consumer:

- **MUST** parse structured result payloads.
- **MUST** respect provider errors and unsupported-tool conditions; retry
  with corrected input only when `retryable` is `true`, otherwise ask the
  human (§4.2).
- **SHOULD** use provider-exposed help and validation rather than substituting
  scraped UI state when provider access exists.
- **SHOULD** surface or request confirmation for high-impact writes.

### 12.3 Passive Provider and Renderer Requirements

A conformant Passive Provider:

- **MUST** preserve accessibility and native semantics.
- **SHOULD** emit stable `data-formspec-*` metadata.
- **MAY** omit the active tool surface entirely.

A renderer hosting an Assist Provider:

- **MUST** mark assistant-written fields with `data-formspec-agent-filled`
  and show their validation immediately (§8.4).
