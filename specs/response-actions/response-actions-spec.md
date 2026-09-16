---
title: Formspec Response Actions
version: 1.0.0-draft.1
date: 2026-05-26
depends_on:
  - specs/core/spec.md
  - specs/core/validation-mapping.md
  - specs/component/component-spec.md
  - specs/experience/experience-spec.md
  - specs/audit/respondent-ledger-spec.md
---

# Formspec Response Actions v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-22
**Editors:** Formspec Working Group
**Schema:** `schemas/response-actions.schema.json` (`https://formspec.org/schemas/responseActions/1.0`)
**Companion to:** Formspec v1.0, Validation Mapping, Component, Experience, Mapping, Intake Handoff, and Respondent Ledger

---

## Status of This Document

This document is a **draft normative companion** to [Formspec v1.0 core specification](../core/spec.md) and [Formspec Validation Mapping](../core/validation-mapping.md). It defines the Response Actions sidecar: a form-scoped runtime contract for named action invocation.

This document closes the Response Actions promotion gate in [Formspec Semantic Layers](../../thoughts/archive/specs/2026-05-20-formspec-semantic-layers.md). It is additive: existing Definition, Response, ValidationReport, Mapping, Intake Handoff, Ledger, Locale, Theme, Component, and Experience schemas retain ownership of their own structural truth.

## Conventions and Terminology

BCP 14 normative terms (MUST, MUST NOT, SHOULD, MAY) appear in capitals. "VM" means [Validation Mapping](../core/validation-mapping.md). "FEL" means [Forms Expression Language](../../../fel-core/specs/fel/fel-grammar.md). "Ledger" means [Respondent Ledger](../audit/respondent-ledger-spec.md).

An **Action** is a named runtime intent declared in a Response Actions document. An **invocation** is a single attempt to execute an Action against the current Response snapshot. An **effect** is a typed side-effect request from the closed `EffectRequest.type` taxonomy. A **durable effect** is `mappingExecution`, `ledgerAppend`, `handoffAssembly`, `evidenceRequest`, or `serviceRequest`. A **transient effect** is `hostEvent` or `browserResource`.

---

## Bottom Line Up Front

<!-- bluf:start file=response-actions-spec.bluf.md -->
- Response Actions is a sidecar artifact: it binds `ActionButton.actionRef` or host invocations to named Actions without changing Definition, Response, Mapping, Intake Handoff, or Ledger schemas.
- Each Action resolves exactly one validation tuple: standard intents inherit the Validation Mapping master row unless a full `validation` tuple is supplied; `x-` intents MUST supply the full tuple and never consult the master table.
- Invocation order is fixed: snapshot Response, evaluate FEL preconditions, run validation for the resolved profile, apply the blocking gate, then invoke effects in declared order.
- Durable effects require frozen idempotency keys and replay by prior outcome; `hostEvent` and `browserResource` MUST NOT carry idempotency keys.
- A typed `x-formspec-runtime` catalog plans mutation requests and allowlisted outputs. Hosts retain network, origin, credential, scope, and private session authority.
- Runtime processors own action resolution, tuple resolution, and invocation sequencing; lint owns static compatibility/reference checks; layout may place configured triggers but must not execute or infer actions.
- Formspec may request domain Ledger events and assemble Intake Handoffs, but it MUST NOT author `case.created` or case lifecycle events; optional `action.*` lifecycle records are processor audit observations outside the declared effect chain.
<!-- bluf:end -->

---

## 1. Introduction

### 1.1 Purpose and Scope

Response Actions declares the actions a form caller may invoke against a Response, the FEL preconditions guarding those actions, the validation profile each action runs, the ordered effect chain each action executes, and the terminal outcome category returned to the caller.

In scope:

- Action identity and lookup by `Action.id`.
- FEL precondition context and evaluation order.
- Validation trigger mapping by VM intent or full tuple override.
- Blocking and persistence reconciliation.
- Closed effect taxonomy, effect ordering, idempotency, replay, failure, and deferred outcomes.
- Structured, transport-neutral assembly of host-admitted service mutation requests and allowlisted response outputs.
- Cross-artifact references to Mapping, Intake Handoff, and Respondent Ledger.

Out of scope:

- Definition behavior, Mapping body rules, Intake Handoff body shape, Ledger event taxonomy, and governed case lifecycle.
- Component widget shape beyond citing `ActionButton.actionRef`.
- Authorization. `actor` is metadata only; host applications own authorization.
- Network access, base origins, credentials, authorization headers, tenant scope, and session storage. Hosts own these capabilities.
- Workflow host acceptance, rejection, deferral, governed case identity, and `case.created`.

### 1.2 Relationship to Existing Specifications

| Existing spec | Relationship |
|---|---|
| [Core](../core/spec.md) | Response Actions runs Core validation through the VM profile and may transition Response status according to the resolved persistence policy. |
| [Validation Mapping](../core/validation-mapping.md) | VM is authoritative for standard `ActionIntent`, closed validation tuple vocabularies, master table defaults, and the tuple predicate. |
| [Experience](../experience/experience-spec.md) | Experience `ActionRef` resolves to `actions[*].id` in a loaded Response Actions document. Unresolved refs are inert findings. |
| [Component](../component/component-spec.md) | `ActionButton.actionRef` is the canonical widget binding to a Response Action. There is no legacy SubmitButton fallthrough. |
| [FEL](../../../fel-core/specs/fel/fel-grammar.md) | Response Actions declares closed host-binding catalogs for preconditions, idempotency keys, and effect-time expressions. |
| [Mapping](../mapping/mapping-spec.md) | `mappingExecution.mappingRef` points to a Mapping document by handle. Mapping rules are never inlined. |
| [Intake Handoff](../core/intake-handoff-spec.semantic.md) | `handoffAssembly` assembles an Intake Handoff outcome. Response Actions describes the request, not the body. |
| [Respondent Ledger](../audit/respondent-ledger-spec.md) | `ledgerAppend` may request published domain Ledger events. Optional `action.*` lifecycle records are processor audit observations, not declared effects. |
| [Data Sources](../data-sources/data-sources-spec.md) | Read-only remote data belongs in Data Sources. `serviceRequest` is restricted to mutation methods. |

### 1.3 Design Principles

1. **Sidecar, not overlay.** Response Actions is a peer artifact. It binds behavior to a target Definition without modifying the Definition schema.
2. **Closed taxonomies.** `EffectRequest.type`, `onFailure`, and `onDeferred` are closed enums. `Action.intent` uses VM standard intents or `x-` publisher extensions.
3. **Cite, do not invent.** Validation vocabulary comes from VM. Ledger kinds come from Ledger. Mapping handles come from Mapping. Handoff bodies come from Intake Handoff.
4. **No global rollback.** Effects execute in declared order. Failure halts the chain and never reverses prior durable effects.
5. **Idempotency at durable boundaries.** Every durable effect MUST carry an idempotency key. `hostEvent` and `browserResource` MUST NOT carry one.
6. **Data plans requests; hosts grant capabilities.** A runtime request describes path, body, safe headers, and allowlisted outputs. It never supplies an origin, credentials, authorization, session persistence, or network implementation.

### 1.4 Schema Reference

<!-- schema-ref:start id=response-actions-top-level schema=schemas/response-actions.schema.json pointers=# -->
<!-- generated:schema-ref id=response-actions-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecResponseActions` | `$formspecResponseActions` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Response Actions document version. MUST be '1.0'. |
| `#/properties/actions` | `actions` | <code>array</code> | yes | — | Named actions. Order is documentation-only; resolution is by Action.id. Each id MUST be unique within the document. |
| `#/properties/description` | `description` | <code>string</code> | no | — | Human-readable description of this document's purpose and scope: what the actions do for the respondent and the host. Ignored during execution. |
| `#/properties/modules` | `modules` | <code>array</code> | no | — | OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef (id + version, with optional publisher + lockHash for posture admission). Default-module-set behavior per ADR 0150 §4.9 preserves form-only documents — omitting modules[] is identical to declaring the core module set. Per ADR 0150 §4.3. |
| `#/properties/name` | `name` | <code>string</code> | no | pattern: <code>^[a-zA-Z][a-zA-Z0-9_\-]*&#36;</code> | Machine-readable short name for this Response Actions document. Pattern: letters, digits, hyphens, underscores; must start with a letter. |
| `#/properties/scope` | `scope` | <code>string</code> | no | enum: <code>"response"</code>, <code>"app"</code>; default: <code>"response"</code> | Execution scope. response actions submit and validate the target Definition. app actions execute without a form submission and MUST omit targetDefinition. |
| `#/properties/targetDefinition` | `targetDefinition` | <code>object</code> | no | — | The Definition this Response Actions document binds to. Identical role to Experience.targetDefinition. |
| `#/properties/title` | `title` | <code>string</code> | no | — | Human-readable name for this Response Actions document. |
| `#/properties/version` | `version` | <code>string</code> | yes | — | Version of this Response Actions document. SemVer RECOMMENDED. |
| `#/properties/x-formspec-runtime` | `x-formspec-runtime` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/RuntimeRequestCatalog</code> | Typed runtime bindings for durable serviceRequest effects. The catalog describes request assembly and allowlisted outputs; the host retains origin, credential, authorization, tenant-scope, and network authority. |
<!-- schema-ref:end -->

### 1.5 Peer Artifact Stance

A Response Actions document is promoted to a peer artifact when an authored form needs named actions whose validation tuple, preconditions, effects, and terminal behavior must be portable across renderers. Implementations MAY generate starter Response Actions documents, but the emitted sidecar is author-owned after publication.

## 2. Document Structure

A conforming document MUST include `$formspecResponseActions`, `version`, and
at least one Action. It MUST choose exactly one execution scope:

- Definition-scoped response actions include `targetDefinition`; `scope` is
  omitted or `response`.
- Application-scoped actions set `scope: app` and MUST omit
  `targetDefinition`.

```json
{
  "$formspecResponseActions": "1.0",
  "version": "1.0.0",
  "targetDefinition": {
    "url": "https://example.gov/forms/intake",
    "compatibleVersions": ">=1.0.0 <2.0.0"
  },
  "actions": []
}
```

`targetDefinition` has the same role as Experience `targetDefinition`: it binds the sidecar to a Definition identity and compatibility range. Processors MUST reject a Response Actions document whose target Definition is incompatible with the active Definition.

Application scope is for product operations such as route navigation, retry,
opening a support resource, or downloading an export. An app action MUST NOT
submit or manufacture a Response. Its full validation tuple MUST be
`profile: off`, `blocking: non-blocking`, and `persistence: none`.

Action `id` values MUST be unique within the document. JSON Schema cannot enforce uniqueness by object property; processors MUST reject duplicates.

## 3. Actions

### 3.1 Action Shape

```json
{
  "id": "submitApplication",
  "intent": "submit",
  "actor": "respondent",
  "label": { "ref": "$action.submitApplication.label" },
  "preconditions": [],
  "validation": {
    "profile": "on-submit",
    "blocking": "block-on-error",
    "persistence": "complete-response"
  },
  "effects": [],
  "onFailure": "stop",
  "onDeferred": "stop"
}
```

### 3.2 `intent`

`intent` MUST be either a standard VM `ActionIntent` (`save-draft`, `autosave`, `review`, `submit`, `request-evidence`) or an `x-` publisher extension intent.

For a standard intent, the VM master table supplies the default `(profile, blocking, persistence)` triple. An Action MAY include a `validation` block to replace that default, but the block MUST specify the full tuple using VM `ValidationTuple`; partial-axis overrides are forbidden.

For an `x-` intent, `validation` is REQUIRED. Processors MUST NOT consult the VM master table for an `x-` intent.

### 3.3 `actor`, `label`, `onFailure`, `onDeferred`

`actor` is free metadata naming the caller. Processors MUST NOT use it for authorization decisions.

`label` MAY be a Locale reference (`{ "ref": "$action.submit.label" }`) or a literal label (`{ "literal": "Submit" }`). It is presentational and has no runtime effect.

`onFailure` is `stop` or `retry-once`; default `stop`. `retry-once` re-invokes exactly once with the same invocation id and frozen idempotency keys.

`onDeferred` is `stop` or `await`; default `stop`. `await` keeps the invocation handle live according to the processor profile.

## 4. Preconditions

`preconditions` is an ordered array of FEL expressions:

```json
{
  "id": "applicantNamePresent",
  "expression": "not isEmpty(@response.applicantName)",
  "severity": "block"
}
```

`severity: block` means a false result terminates the invocation as `blocked` with `cause: "precondition"`. `severity: defer` means a false result terminates as `deferred` with an implementation-defined retry contract.

### 4.1 Precondition FEL Catalog

Precondition expressions evaluate in this closed FEL host-binding catalog. The catalog conforms to [FEL §6.3.1](../../../fel-core/specs/fel/fel-grammar.md) — every entry MUST publish `name`, `kind`, `type`, `purity`, `evaluationTiming`, and `scope` so a catalog-aware FEL evaluator can satisfy the [FEL §6.3.5](../../../fel-core/specs/fel/fel-grammar.md) acceptance bar (closed catalog, evaluation-moment binding, negative fixtures for unbound names).

| name | kind | type | purity | evaluationTiming | scope |
|---|---|---|---|---|---|
| `response` | object | Immutable Response snapshot taken at invocation start. | pure | eager | expression |
| `definition` | object | Pinned Definition referenced by `targetDefinition`. | pure | eager | expression |
| `action` | object | Current Action `{ id, intent, actor }`. | pure | eager | expression |
| `now` | function | `() -> datetime` current processor time. | impure | lazy | expression |
| `validation` | object | `{ lastReport: ValidationReport \| null }` where `lastReport` is the most recent ValidationReport produced by any earlier Action invocation against the same `responseId`, or `null` when no invocation has yet produced a report. Continuous-validation state is not exposed through `@validation`. | pure | eager | expression |
| `invocation` | object | `{ id: string }`; stable across replays. | pure | eager | expression |

`@invocation.attempt` is intentionally absent from the precondition catalog. Preconditions also MUST NOT access prior effect outcomes, Ledger contents, Handoff documents, mutable Definition state, or host-application state. FEL evaluators MUST reject unregistered `@name` bindings.

Precondition evaluation MUST NOT produce side effects.

## 5. Validation Trigger Mapping

Each Action resolves exactly one tuple `(profile, blocking, persistence)`:

1. If the Action has a `validation` block, that full tuple is used after VM `ValidationTuple` schema validation.
2. Otherwise, if `intent` is a standard VM intent, the VM master table row is used.
3. Otherwise, the document is invalid because `x-` intents require `validation`.

The resolved tuple MUST satisfy VM Section 6.3:

```text
NOT (persistence = complete-response AND blocking != block-on-error)
AND NOT (persistence = complete-response AND profile != on-submit)
AND NOT (profile = off AND blocking = block-on-error)
AND NOT (blocking = block-on-error AND persistence != complete-response)
```

For `profile: off`, no ValidationReport is produced. For any other profile, the processor MUST produce exactly one ValidationReport snapshot before the blocking gate.

Persistence policies mean:

- `draft-checkpoint`: persist the current Response as a draft when the invocation completes or defers; status remains `in-progress`.
- `complete-response`: transition Response status to `completed` only after the validation blocking gate passes.
- `none`: no Response mutation.

## 6. Effects

### 6.1 Effect Taxonomy

`EffectRequest.type` is closed:

| type | Class | Idempotency key | Purpose |
|---|---|---|---|
| `mappingExecution` | durable | required | Run a Mapping document and produce a target payload. |
| `ledgerAppend` | durable | required | Request a Respondent Ledger append using a published domain event kind. |
| `handoffAssembly` | durable | required | Assemble an Intake Handoff document and forward to a recipient handle. |
| `evidenceRequest` | durable | required | Trigger demand-timing evidence collection. |
| `serviceRequest` | durable | required | Invoke one typed, host-admitted service mutation from `x-formspec-runtime`. |
| `hostEvent` | transient | forbidden | Dispatch a host-local event. |
| `browserResource` | transient | forbidden | Open or download a validated structured browser resource. |

<!-- schema-ref:start id=response-actions-effects schema=schemas/response-actions.schema.json pointers=#/$defs/EffectRequest,#/$defs/MappingExecutionEffect,#/$defs/LedgerAppendEffect,#/$defs/HandoffAssemblyEffect,#/$defs/EvidenceRequestEffect,#/$defs/ServiceRequestEffect,#/$defs/HostEventEffect,#/$defs/BrowserResourceEffect -->
<!-- generated:schema-ref id=response-actions-effects -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/EffectRequest` | `(self)` | <code>composite</code> | — | — | Closed effect request taxonomy. |
| `#/$defs/MappingExecutionEffect/properties/idempotencyKey` | `idempotencyKey` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/IdempotencyKey</code> | — |
| `#/$defs/MappingExecutionEffect/properties/mappingRef` | `mappingRef` | <code>string</code> | yes | — | — |
| `#/$defs/MappingExecutionEffect/properties/onError` | `onError` | <code>string</code> | no | enum: <code>"fail"</code>, <code>"defer"</code>; default: <code>"fail"</code> | — |
| `#/$defs/MappingExecutionEffect/properties/type` | `type` | <code>const</code> | yes | const: <code>"mappingExecution"</code> | — |
| `#/$defs/LedgerAppendEffect/properties/eventKind` | `eventKind` | <code>string</code> | yes | — | Published Respondent Ledger domain event kind. case.* and action.* lifecycle kinds MUST NOT be author-declared effects. |
| `#/$defs/LedgerAppendEffect/properties/idempotencyKey` | `idempotencyKey` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/IdempotencyKey</code> | — |
| `#/$defs/LedgerAppendEffect/properties/onError` | `onError` | <code>string</code> | no | enum: <code>"fail"</code>, <code>"defer"</code>; default: <code>"fail"</code> | — |
| `#/$defs/LedgerAppendEffect/properties/payloadRef` | `payloadRef` | <code>string</code> | no | — | Optional FEL expression producing the event payload. Evaluated in the effect-time catalog. |
| `#/$defs/LedgerAppendEffect/properties/type` | `type` | <code>const</code> | yes | const: <code>"ledgerAppend"</code> | — |
| `#/$defs/HandoffAssemblyEffect/properties/handoffProfileRef` | `handoffProfileRef` | <code>string</code> | yes | — | — |
| `#/$defs/HandoffAssemblyEffect/properties/idempotencyKey` | `idempotencyKey` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/IdempotencyKey</code> | — |
| `#/$defs/HandoffAssemblyEffect/properties/onError` | `onError` | <code>string</code> | no | enum: <code>"fail"</code>, <code>"defer"</code>; default: <code>"fail"</code> | — |
| `#/$defs/HandoffAssemblyEffect/properties/recipientRef` | `recipientRef` | <code>string</code> | yes | — | — |
| `#/$defs/HandoffAssemblyEffect/properties/type` | `type` | <code>const</code> | yes | const: <code>"handoffAssembly"</code> | — |
| `#/$defs/EvidenceRequestEffect/properties/idempotencyKey` | `idempotencyKey` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/IdempotencyKey</code> | — |
| `#/$defs/EvidenceRequestEffect/properties/onError` | `onError` | <code>string</code> | no | enum: <code>"fail"</code>, <code>"defer"</code>; default: <code>"defer"</code> | — |
| `#/$defs/EvidenceRequestEffect/properties/requestRef` | `requestRef` | <code>string</code> | yes | — | — |
| `#/$defs/EvidenceRequestEffect/properties/type` | `type` | <code>const</code> | yes | const: <code>"evidenceRequest"</code> | — |
| `#/$defs/ServiceRequestEffect/properties/idempotencyKey` | `idempotencyKey` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/IdempotencyKey</code> | — |
| `#/$defs/ServiceRequestEffect/properties/onError` | `onError` | <code>string</code> | no | enum: <code>"fail"</code>, <code>"defer"</code>; default: <code>"fail"</code> | — |
| `#/$defs/ServiceRequestEffect/properties/requestRef` | `requestRef` | <code>string</code> | yes | pattern: <code>^[A-Za-z][A-Za-z0-9-]*&#36;</code> | Identifier of one request in this document's x-formspec-runtime.requests catalog. |
| `#/$defs/ServiceRequestEffect/properties/type` | `type` | <code>const</code> | yes | const: <code>"serviceRequest"</code> | — |
| `#/$defs/HostEventEffect/properties/detailRef` | `detailRef` | <code>string</code> | no | — | Optional FEL expression producing transient event detail. |
| `#/$defs/HostEventEffect/properties/eventName` | `eventName` | <code>string</code> | yes | — | — |
| `#/$defs/HostEventEffect/properties/type` | `type` | <code>const</code> | yes | const: <code>"hostEvent"</code> | — |
| `#/$defs/BrowserResourceEffect/properties/onError` | `onError` | <code>string</code> | no | enum: <code>"fail"</code>, <code>"defer"</code>; default: <code>"fail"</code> | — |
| `#/$defs/BrowserResourceEffect/properties/operation` | `operation` | <code>string</code> | yes | enum: <code>"open"</code>, <code>"download"</code> | open follows a safe internal, HTTPS, or explicitly authored mailto destination. download saves an authored resource. |
| `#/$defs/BrowserResourceEffect/properties/resourceRef` | `resourceRef` | <code>string</code> | yes | pattern: <code>^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*&#36;</code> | Safe own-property path into the structured action input. The resolved value is a browser resource object; it is never evaluated as code. |
| `#/$defs/BrowserResourceEffect/properties/target` | `target` | <code>string</code> | no | enum: <code>"self"</code>, <code>"new"</code>; default: <code>"self"</code> | Browsing context for open operations. Downloads ignore this value. |
| `#/$defs/BrowserResourceEffect/properties/type` | `type` | <code>const</code> | yes | const: <code>"browserResource"</code> | — |
<!-- schema-ref:end -->

### 6.2 Ordered Execution and No Rollback

The processor MUST invoke effects in declared array order. It MUST NOT reorder, parallelize, or coalesce effects unless a future spec introduces explicit syntax for that behavior.

When an effect fails with `onError: fail`, the processor MUST halt remaining effects and MUST NOT reverse prior effects. Prior durable effects remain materialized; idempotency keys protect replay from duplication.

`onError` values are `fail` or `defer`. Earlier drafts included `continue`; it is forbidden because it could let a failed effect chain report success.

### 6.3 Idempotency

Every durable effect MUST carry `idempotencyKey`. The key is a FEL expression evaluated once when the effect is first about to execute. The resolved string is cached for the lifetime of the invocation and reused on retry or replay.

The idempotency-key FEL catalog is the stable precondition catalog. `@invocation.id` is available; `@invocation.attempt` and `@effects` are NOT available. A processor MUST reject an idempotency expression that references unbound names.

A processor receiving a durable effect with a previously executed idempotency key MUST observe the prior outcome without re-executing the side effect. The effect trace records `status: "replayed"`.

### 6.4 Effect-Time FEL Catalog

For non-idempotency expressions (`payloadRef`, `detailRef`), the effect-time catalog extends the precondition catalog. Entries follow [FEL §6.3.1](../../../fel-core/specs/fel/fel-grammar.md) and publish all six fields:

| name | kind | type | purity | evaluationTiming | scope |
|---|---|---|---|---|---|
| `effects` | object | Array of prior effect outcomes `{ type, status, outcomeRef }`. FEL path subscripts on `@name` bindings are **1-based** per [FEL §6.2.2](../../../fel-core/specs/fel/fel-grammar.md), so `@effects[1]` is the first prior effect. | pure | lazy | expression |
| `invocation` | object | `{ id: string, attempt: integer }`; `attempt` is a property of `@invocation`, not a separate binding. | pure | eager | expression |

`@effects[i]` MUST only reference prior effects. Referencing the current or a future effect is an evaluation error.

`browserResource.resourceRef` is not FEL. It is a safe own-property path into
the validated structured app-action input. Hosts MUST reject prototype-bearing
paths and resources whose operation, destination scheme, media type, or payload
is outside host policy. The action declares the operation; the host retains
navigation, popup, and download authority.

The FEL surface index (`@effects[i]`, 1-based) and the trace artifact index (`effectIndex` in §8 failure outcomes and Ledger records, 0-based per host idiom) refer to the same effect offset by one. Authors who need to correlate a FEL reference with a trace record subtract one: `@effects[1].outcomeRef` corresponds to `effectIndex: 0`. The dual-base convention is intentional — FEL grammar owns the path-subscript base; the trace artifact uses the language-of-host base.

### 6.5 Effect Outcomes

Each effect contributes an outcome record:

```json
{
  "type": "ledgerAppend",
  "status": "succeeded",
  "idempotencyKey": "response-123/submit",
  "outcomeRef": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

`status` is `succeeded`, `failed`, `deferred`, `replayed`, or `not-invoked`. `outcomeRef` MUST be a content-addressable `sha256:<64 lowercase hex>` handle when a durable effect produces material output.

### 6.6 Service Requests

A `serviceRequest` effect names exactly one request in the same document's
`x-formspec-runtime.requests` catalog. Request ids MUST be unique. A processor
MUST reject an unresolved or ambiguous `requestRef` before invocation.

<!-- schema-ref:start id=response-actions-service-requests schema=schemas/response-actions.schema.json pointers=#/$defs/ServiceRequestEffect,#/$defs/RuntimeRequestCatalog,#/$defs/RuntimeRequest,#/$defs/HttpJsonRequest,#/$defs/RuntimeValueSelector,#/$defs/RuntimeRequestOutput -->
<!-- generated:schema-ref id=response-actions-service-requests -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/ServiceRequestEffect/properties/idempotencyKey` | `idempotencyKey` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/IdempotencyKey</code> | — |
| `#/$defs/ServiceRequestEffect/properties/onError` | `onError` | <code>string</code> | no | enum: <code>"fail"</code>, <code>"defer"</code>; default: <code>"fail"</code> | — |
| `#/$defs/ServiceRequestEffect/properties/requestRef` | `requestRef` | <code>string</code> | yes | pattern: <code>^[A-Za-z][A-Za-z0-9-]*&#36;</code> | Identifier of one request in this document's x-formspec-runtime.requests catalog. |
| `#/$defs/ServiceRequestEffect/properties/type` | `type` | <code>const</code> | yes | const: <code>"serviceRequest"</code> | — |
| `#/$defs/RuntimeRequestCatalog/properties/requests` | `requests` | <code>array</code> | yes | — | Named request bindings. Each id MUST be unique within the catalog. |
| `#/$defs/RuntimeRequestCatalog/properties/version` | `version` | <code>const</code> | yes | const: <code>"1.0"</code> | Runtime request catalog version. |
| `#/$defs/RuntimeRequest/properties/adapter` | `adapter` | <code>const</code> | yes | const: <code>"http-json"</code> | JSON-over-HTTP runtime adapter. |
| `#/$defs/RuntimeRequest/properties/id` | `id` | <code>string</code> | yes | pattern: <code>^[A-Za-z][A-Za-z0-9-]*&#36;</code> | Stable request id referenced by serviceRequest.requestRef. |
| `#/$defs/RuntimeRequest/properties/outputs` | `outputs` | <code>object</code> | no | — | Allowlisted names extracted from the parsed JSON response. Outputs default to invocation-private. `transition` outputs may enter route state; the host sends `session` outputs only to its private session store. |
| `#/$defs/RuntimeRequest/properties/request` | `request` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/HttpJsonRequest</code> | — |
| `#/$defs/RuntimeRequest/properties/successStatuses` | `successStatuses` | <code>array</code> | no | — | Optional exact successful HTTP status codes. Omission admits any 2xx response. |
| `#/$defs/RuntimeRequest/properties/x-generation` | `x-generation` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>https://formspec.org/schemas/common/1.0#/&#36;defs/Generation</code> | Generation provenance for this functional request declaration. |
| `#/$defs/HttpJsonRequest/properties/bodyBindings` | `bodyBindings` | <code>object</code> | no | — | JSON Pointer targets populated from runtime selectors after bodyDefaults are copied. |
| `#/$defs/HttpJsonRequest/properties/bodyDefaults` | `bodyDefaults` | <code>object</code> | no | — | Optional literal JSON object copied before bodyBindings are applied. |
| `#/$defs/HttpJsonRequest/properties/headerBindings` | `headerBindings` | <code>object</code> | no | — | Optional non-authority request headers. Hosts MUST reject credentials, cookies, hop-by-hop headers, idempotency-key, and Formspec scope headers. |
| `#/$defs/HttpJsonRequest/properties/method` | `method` | <code>string</code> | yes | enum: <code>"POST"</code>, <code>"PUT"</code>, <code>"PATCH"</code>, <code>"DELETE"</code> | Mutation method. Read-only GET delivery belongs in Data Sources. |
| `#/$defs/HttpJsonRequest/properties/pathBindings` | `pathBindings` | <code>object</code> | no | — | Bindings for every and only the named placeholders in pathTemplate. Resolved values MUST be scalar. |
| `#/$defs/HttpJsonRequest/properties/pathTemplate` | `pathTemplate` | <code>string</code> | yes | pattern: <code>^/(?!/)</code> | Same-origin absolute-path template. Braced placeholders resolve only from pathBindings; hosts reject unsafe or malformed paths. |
| `#/$defs/HttpJsonRequest/properties/queryBindings` | `queryBindings` | <code>object</code> | no | — | Optional query values. Resolved values MUST be scalar. |
| `#/$defs/RuntimeValueSelector/properties/from` | `from` | <code>string</code> | yes | enum: <code>"input"</code>, <code>"route"</code>, <code>"session"</code>, <code>"result"</code>, <code>"literal"</code> | Closed runtime source catalog. |
| `#/$defs/RuntimeValueSelector/properties/path` | `path` | <code>string</code> | no | pattern: <code>^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*&#36;</code> | Safe own-property path into the selected structured source. |
| `#/$defs/RuntimeValueSelector/properties/value` | `value` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/JsonValue</code> | Literal JSON value when from is literal. |
| `#/$defs/RuntimeRequestOutput/properties/exposure` | `exposure` | <code>string</code> | no | enum: <code>"internal"</code>, <code>"transition"</code>, <code>"session"</code>; default: <code>"internal"</code> | `internal` remains invocation-private; `transition` MUST resolve to a non-empty string and may be consumed by Surface transition params; `session` MUST resolve to a non-empty string, and the host sends it only to its private session store for later `from: session` selectors. |
| `#/$defs/RuntimeRequestOutput/properties/path` | `path` | <code>string</code> | yes | pattern: <code>^/(?:[^~/]&#124;~[01])+(?:/(?:[^~/]&#124;~[01])*)*&#36;</code> | JSON Pointer into the parsed successful response body. |
<!-- schema-ref:end -->

The catalog is a typed, code-free request description. A request uses the
`http-json` adapter and one mutation method: `POST`, `PUT`, `PATCH`, or
`DELETE`. Read-only `GET` operations belong in Data Sources. `pathTemplate`
MUST be one same-origin absolute path. It MUST NOT contain an origin, repeated
slash, backslash, query, fragment, raw dot segment, or percent-encoded dot,
slash, or backslash. `pathBindings` MUST bind every and only the template's
named placeholders.

Selectors use the closed source catalog `input`, `route`, `session`, `result`,
or `literal`. Non-literal selectors use a safe own-property `path`; literal
selectors carry a JSON `value`. A processor MUST reject prototype-bearing
paths, inherited properties, accessors, cycles, non-JSON values, or a missing
path segment. Path, query, and header bindings MUST resolve to scalar values.
The processor percent-encodes path values, encodes query values, copies
`bodyDefaults`, and then applies `bodyBindings` at their non-root JSON Pointer
targets.

Artifacts MUST NOT author credentials, cookies, `Host`, `Origin`,
`Idempotency-Key`, representation headers, hop-by-hop headers, proxy/security
headers, or `X-Formspec-*` authority and scope headers. The host chooses the
base origin, credentials, authorization, tenant scope, idempotency header, and
request implementation after applying its own admission policy. The reference
engine plans requests; it does not perform network I/O.

A successful adapter parses one JSON response body and extracts only names
declared in `outputs`, using safe non-root JSON Pointers. Undeclared fields and
the raw response body MUST NOT enter the effect trace, invocation result,
route state, session state, lifecycle records, or diagnostics. Output
`exposure` has three values:

- `internal` (default) remains private to the adapter and may feed later
  `from: result` selectors in the same invocation.
- `transition` MUST be a non-empty string. The adapter may return it as a
  transition binding only when the effect succeeds or replays.
- `session` MUST be a non-empty string. The adapter returns it separately to
  the host session store. It MUST NOT appear in the invocation result,
  transition bindings, effect trace, lifecycle records, or diagnostics. A
  later action may read the host-stored value through `from: session`.

The host effect adapter returns only the normalized effect outcome and any
allowed transition bindings to the action engine. It persists session outputs
directly in its private session store. Retry MUST reuse the frozen effect
idempotency key. A Promise-returning adapter requires the asynchronous
invocation API; the synchronous API MUST fail before treating that Promise as
a successful outcome.

## 7. Invocation State Machine

Invocation follows this order:

1. `created`: receive `actionId`, invocation id, and either the Response/Definition snapshot for response scope or validated structured input for app scope.
2. `preconditions`: evaluate preconditions in order.
3. `validation`: for response scope, resolve the tuple and produce a ValidationReport unless profile is `off`; app scope requires the fixed off/non-blocking/none tuple and performs no Response validation.
4. `blocking-gate`: if `blocking` is `block-on-error` and `ValidationReport.valid` is false, terminate `blocked` with `cause: "validation"` and invoke zero effects.
5. `effects-running`: invoke effects in declared order. Awaited adapters remain serial; the next effect cannot begin until the current effect reaches an outcome.
6. Terminal: `completed`, `failed`, `deferred`, or `blocked`.

**Normative rule `invocation.blocking-gate`.** When the resolved tuple uses
`valid: false`, the invocation MUST terminate as `blocked` with
`cause: "validation"`. The processor MUST emit an explicit `not-invoked`
outcome for every declared effect and MUST invoke none of them.

The UI MUST NOT report success for `failed`, `deferred`, or `blocked`. On blocked validation, Response data remains preserved and status remains `in-progress`. Application actions never mutate Response state.

### 7.1 Runtime Invocation State Ownership

Response Actions owns action invocation state. An invocation is identified by
`invocation.id` plus the resolved `actionId`, the current Response snapshot, the
resolved validation tuple, and the ordered effect trace. Invocation state
records precondition results, validation output, blocking outcome, durable
effect idempotency/replay state, transient host-event delivery, and one terminal
state: `completed`, `failed`, `deferred`, or `blocked`.

Invocation state is not route state, session state, or Response identity.
Surface routers may observe a completed invocation to decide whether a
declared transition can advance; they do not own preconditions, validation,
effect execution, idempotency, replay, or terminal classification. Session
processors may authenticate the caller and bind actor/session context; they do
not change the action state machine. A host may persist explicitly exposed
service outputs into its private session store and supply them to a later
`from: session` selector; the action engine never exposes or stores those
values. Core Response processors mutate data or status only through the
resolved VM persistence policy; an invocation trace cannot replace a Response
document.

Processors MUST keep invocation/effect state explicit when a route contains
multiple Response instances, when a route parameter selects the Response
instance, or when several actions target the same Response. They MUST NOT infer
the Response instance from Definition URL alone, from the current route alone,
from an `ActionButton` DOM location, or from an AppGraphValidator diagnostic.

## 8. Failure Outcomes

A failed terminal reports the failed effect index, effect type, a meaningful reason, the effect trace through failure, and the validation report when validation ran.

If `onFailure: retry-once`, the processor retries exactly once with the same `invocation.id` and frozen idempotency keys. Retry re-enters at effect execution with the same Response snapshot; preconditions and validation are not re-evaluated.

Processors MAY record `action.failed` lifecycle audit records per Ledger Section 8.5. Those records are processor policy and are not declared `ledgerAppend` effects.

## 9. Deferred Outcomes

A deferred terminal reports a replay token, deferred effect index when applicable, and the partial effect trace. The replay token is implementation-defined and opaque to this spec.

Deferred invocations MUST NOT transition Response status to `completed`. Processors MAY record `action.deferred` lifecycle audit records per Ledger Section 8.5 outside the declared effect chain.

## 10. Host Event Boundaries

`hostEvent` is a transient host-local signal. It MUST NOT have durable external consequences, MUST NOT carry `idempotencyKey`, and MUST NOT be used as the only durable record of a completed submission.

`browserResource` is a transient, host-mediated navigation or download
request. It MUST resolve its `resourceRef` only against validated structured
action input. A generic browser host MAY admit same-origin paths, HTTPS
destinations, intentional `mailto` links, and locally generated downloads; it
MUST fail closed for unsafe schemes or malformed resources.

`serviceRequest` is durable and host-mediated. The engine may assemble its
transport-neutral request and extract declared outputs, but only the host may
choose an origin, attach credentials or scope, perform the request, and persist
session outputs. A generic renderer MUST NOT infer these capabilities from
visible copy, route state, or an extension key that is not the typed
`x-formspec-runtime` catalog.

`ActionButton.actionRef` resolves against `actions[*].id`. An unresolved ref MUST produce an inert widget and an informative finding. There is no implicit default Action, no free-string fallback, and no legacy SubmitButton behavior.

Renderers MAY provide host adapters for `ActionButton` clicks, but the reusable action resolution, validation-tuple resolution, and invocation sequencing boundary belongs to the runtime engine layer. Layout processors MAY place or synthesize inert `ActionButton` nodes when explicitly configured with an `actionRef`; they MUST NOT execute actions, infer validation behavior, or invent an implicit Response Action.

## 11. Cross-Artifact References

### 11.1 Mapping

`mappingExecution.mappingRef` is a handle to a Mapping document. Inlining Mapping rules in an EffectRequest is forbidden.

### 11.2 Intake Handoff

`handoffAssembly.handoffProfileRef` is a handle to an Intake Handoff assembly profile. The produced Handoff document is the response-to-workflow boundary object and MUST use content-addressable outcome handles when returned in the effect trace.

The workflow host outcome (`accepted`, `rejected`, or `deferred`) is outside this spec. Response Actions MUST NOT author `case.created` or any case lifecycle event.

### 11.3 Respondent Ledger

`ledgerAppend.eventKind` MUST be a kind published by the Respondent Ledger spec. Response Actions may request domain Ledger events such as `draft.saved`, `response.submit-attempted`, and `response.completed`.

The optional `action.invoked`, `action.failed`, `action.deferred`, and `action.replayed` kinds are processor lifecycle audit records. Authors MUST NOT declare them as ordinary `ledgerAppend` effects. The declared effect chain begins only after preconditions, validation, and the blocking gate pass.

The completed terminal is covered by `response.completed` when an Action declares that domain Ledger append. Ledger does not define `action.completed`.

## 12. Conformance

A conforming Response Actions document MUST:

- Validate against `schemas/response-actions.schema.json`.
- Choose exactly one response or app scope. App scope omits
  `targetDefinition`, performs no form submission, and uses the fixed
  off/non-blocking/none tuple.
- Use only VM standard `ActionIntent` values or `x-` extension intents.
- Provide a full `validation` tuple for every `x-` intent and for every standard-intent override.
- Use only the closed `EffectRequest.type` taxonomy.
- Give every durable effect an `idempotencyKey` and give no `hostEvent` or
  `browserResource` an `idempotencyKey`.
- Avoid authoring `action.*`, `case.created`, or case lifecycle events as effects.
- Resolve each `serviceRequest.requestRef` exactly once; use safe request paths,
  admitted authored headers, complete placeholder bindings, closed selectors,
  safe body/output JSON Pointers, and declared output exposure.

A conforming static lint processor SHOULD validate `targetDefinition` compatibility when paired with a Definition, reject duplicate `actions[*].id`, report unresolved Component `ActionButton.actionRef` references when paired with Component documents, and reject duplicate or unresolved service requests, unsafe paths or headers, placeholder mismatches, invalid selectors or JSON Pointers, and unknown output exposure.

A conforming processor that executes Actions MUST implement the Section 7 state machine, enforce FEL catalog closure, freeze durable idempotency keys, preserve prior durable effects on failure, and return only the four terminal states.

## 13. Prohibitions

Response Actions MUST NOT:

1. Add behavior directly to Definition.
2. Define new validation profile, blocking policy, or persistence policy vocabulary.
3. Inline Mapping rules or Handoff body shape.
4. Invent Ledger event kinds.
5. Author `case.created` or any case lifecycle event.
6. Treat `hostEvent` as durable submission evidence.
7. Roll back already-materialized durable effects.
8. Submit or mutate a Response from an app-scoped action.
9. Resolve a browser resource from code, an unvalidated object, or a
   prototype-bearing path.
10. Put an origin, credential, authorization, tenant scope, or executable
    request code in `x-formspec-runtime`.
11. Expose raw service response bodies, undeclared outputs, or `session`
    outputs through effect traces, transition bindings, lifecycle records, or
    diagnostics.
