---
title: Formspec Data Sources Specification
version: 1.0.0-draft.1
date: 2026-05-26
depends_on:
  - specs/bundle/app-manifest-spec.md
  - specs/app-graph/artifact-resolver-spec.md
  - specs/app-graph/app-graph-validator-spec.md
---

# Formspec Data Sources Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-24
**Editors:** Formspec Working Group
**Schema:** `schemas/data-sources.schema.json` (`https://formspec.org/schemas/dataSources/1.0`)
**Companion to:** Formspec v1.0, App Manifest, Surface, Experience, Component, Response Actions, and ADR 0153

---

## Status of This Document

This document is a draft normative companion to [Formspec v1.0 core specification](../core/spec.md) and [App Manifest](../bundle/app-manifest-spec.md). It defines a peer app-graph Data Sources catalog for sources that must be resolved across an app, route, slot, module, or external resource boundary.

This document is additive. It does not replace Definition-local `instances`, does not define a runtime loader, and does not authorize fine-grained access policy.

## Bottom Line Up Front

<!-- bluf:start file=data-sources-spec.bluf.md -->
- Data Sources is a peer app artifact for app-graph source catalogs; Definition-local `instances` remain the authority for `@instance()` lookup inside a Definition.
- App Manifest v2.1 introduces `dataSources[]` sibling references by URL/version; v2.0 manifests remain valid but cannot carry `dataSources[]`.
- Each source declares a closed source family, owner, scope, availability selector, runtime delivery/cache/failure/provenance behavior, and coarse authorization boundary.
- Route or slot availability MUST include a Surface URL because App Manifests may compose multiple Surfaces and route ids are not graph-global.
- The catalog never embeds local fixture paths, widget payload folklore, or runtime data. Cross-artifact resolution belongs to `ArtifactResolver` and `AppGraphValidator`.
- Fine-grained actor, operation, route, widget, or field authorization remains fail-closed until ADR 0152 supplies the authorization contract.
- ADR 0153 gate 5 "Closed" is the catalog contract only — availability validator (`fs-r2od`) and runtime loader (`fs-9d5e`) are tracked in [`thoughts/2026-05-26-open-work-index.md`](../../../thoughts/2026-05-26-open-work-index.md).
<!-- bluf:end -->

## 1. Purpose and Scope

A Data Sources document declares named data sources available to the resolved app graph. It is for cases where source availability is broader than a single Definition:

- route parameters exposed to a Surface route,
- host state shared across app shells or modules,
- query results or document resources used by non-form widgets,
- draft or completed Definition-response state exposed to a reviewer route, and
- module-scoped source availability declared by an admitted module.

In scope:

- document identity and App Manifest sibling reference semantics,
- source family taxonomy,
- source owner and scope metadata,
- source-to-app, Definition, Surface, route, slot, or module availability,
- delivery, cache, staleness, failure-mode, and provenance declarations, and
- a coarse authorization boundary that can fail closed before ADR 0152.

Out of scope:

- fetching, subscribing, caching, or materializing source payloads,
- defining a query language,
- executing Response Actions,
- changing Definition-local `instances`,
- renderer-specific widget payload interpretation, and
- fine-grained authorization.

## 2. Relationship to Definition Instances

The core Definition spec already defines secondary instances. A Definition's top-level `instances` object is the authority for `@instance('name')` lookup inside that Definition. Form-only documents MAY keep using `instances` without an App Manifest Data Sources catalog.

A Data Sources document does not create `@instance()` names by default. A processor MAY bridge a Data Source to a Definition instance only when a later app-graph validator or runtime loader explicitly defines that mapping. Until then, Definition-local `instances` and peer Data Sources are separate contracts:

| Surface | Owns |
|---|---|
| Definition `instances` | form-local secondary data exposed to FEL `@instance()` |
| Data Sources document | app-level source family, availability, cache, failure, provenance, and coarse authorization declarations |

This split preserves the simple-form path and prevents app-level source catalogs from silently changing Definition semantics.

## 3. Document Structure

A conforming Data Sources document MUST include `$formspecDataSources`, `id`, `version`, and `sources[]`:

```json
{
  "$formspecDataSources": "1.0",
  "id": "https://example.gov/apps/intake/data-sources",
  "version": "1.0.0",
  "sources": []
}
```

`id` is the catalog's canonical artifact identity. App Manifest v2.1 `dataSources[]` entries reference this URL and MAY pin a version. Local fixture paths, filenames, URL suffix conventions, and implicit sibling discovery are not identity.

### 3.1 Schema Reference

<!-- schema-ref:start id=data-sources-top-level schema=schemas/data-sources.schema.json pointers=# -->
<!-- generated:schema-ref id=data-sources-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecDataSources` | `$formspecDataSources` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Data Sources document version. MUST be '1.0'. |
| `#/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>https://formspec.org/schemas/common/1.0#/&#36;defs/Extensions</code> | — |
| `#/properties/id` | `id` | <code>string</code> | yes | — | Canonical identity URL for this Data Sources catalog. App Manifest v2.1 dataSources[] entries reference this URL. |
| `#/properties/sources` | `sources` | <code>array</code> | yes | — | Named data sources available to the resolved app graph. Each id MUST be unique within this document; processors enforce that semantic invariant. |
| `#/properties/title` | `title` | <code>string</code> | no | — | Human-readable title for this Data Sources catalog. |
| `#/properties/version` | `version` | <code>string</code> | yes | pattern: <code>^(0&#124;[1-9][0-9]*)\.(0&#124;[1-9][0-9]*)\.(0&#124;[1-9][0-9]*)(?:-((?:0&#124;[1-9][0-9]*&#124;[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0&#124;[1-9][0-9]*&#124;[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?&#36;</code> | Version of this Data Sources document. MUST be a strict SemVer 2.0.0 string. |
<!-- schema-ref:end -->

## 4. Source Shape

Every `sources[]` entry MUST have a unique `id`, a `kind`, an `owner`, a `scope`, an `availability` selector, and `runtime` behavior.

### 4.1 Source Identity and Kind

`kind` is a closed enum:

| Kind | ID prefix | Meaning |
|---|---|---|
| `host-state` | `host:` | Host application state such as active matter, current user profile, or environment context. |
| `definition-response` | `response:` | Draft or completed Response state for a named Definition. |
| `document-resource` | `resource:` | External document, attachment, knowledge base, or reference resource. |
| `conversation-stream` | `conversation:` | Conversation transcript or stream supplied by a host or module. |
| `query-result` | `query:` | Materialized result of a host-defined query. |
| `route-params` | `route:` | Route parameter values made available to consumers on a Surface route. |

The `id` prefix MUST match `kind`. A `definition-response` source MUST declare `definitionRef` as a canonical Definition URL.

Source ids MUST be unique within one Data Sources document. JSON Schema cannot enforce uniqueness by object property, so processors MUST reject duplicates.

### 4.2 Owner and Scope

`owner` declares who supplies the source:

- `host`
- `formspec`
- `module`

This is source ownership metadata only. It MUST NOT be used as fine-grained authorization.

`scope` declares lifetime or addressing scope:

- `session`
- `route`
- `definition`
- `resource`

## 5. Availability

`availability.level` declares where the source is advertised in the resolved app graph:

| Level | Required selector fields |
|---|---|
| `app` | none |
| `definition` | `definitionRef` |
| `surface` | `surfaceRef` |
| `route` | `surfaceRef`, `routeRef` |
| `slot` | `surfaceRef`, `routeRef`, `slotId` |
| `module` | `moduleId` |

Surface, route, and slot availability MUST include `surfaceRef`. App Manifests may compose multiple Surfaces, and route ids are unique only within a Surface document. A surface, route, or slot selector without `surfaceRef` is ambiguous and MUST be rejected.

Schema validation verifies selector shape. Cross-artifact resolution - for example checking that `surfaceRef` is loaded by the App Manifest, `routeRef` exists on that Surface, and `slotId` exists on that route - belongs to `AppGraphValidator`.

## 6. Runtime Behavior

`runtime.delivery` declares how consumers receive the source:

| Delivery | Required cache behavior |
|---|---|
| `snapshot` | any cache mode except rules forbidden by `CacheRule` |
| `live` | `cache.mode: "subscribe"` |
| `draft` | source `kind: "definition-response"` and `cache.mode: "draft"` |

`runtime.cache.mode` is one of:

- `snapshot`
- `subscribe`
- `draft`
- `none`

`staleAfter` MAY be present for cached modes. It MUST NOT be present when `cache.mode` is `none`.

`runtime.failureMode` is one of:

- `empty-state`
- `stale-ok`
- `block-render`
- `degraded-widget`

These are declarations to downstream processors. This spec does not define a cache implementation or rendering fallback algorithm.

## 7. Provenance

`runtime.provenance.kind` MUST match the source `kind`. `runtime.provenance.source` records the host, response, route, resource, query, or conversation provenance pointer used by the resolver.

This document does not define a global provenance URI syntax. Hosts and modules MAY use implementation-specific pointers, but the `kind` match lets app-graph validators reject obvious category drift.

## 8. Authorization Boundary

`runtime.authorizationBoundary` is a coarse boundary enum:

- `host`
- `formspec-session`
- `module`

It answers only which boundary must admit the source before exposure. It does not express actor allowlists, field policy, route policy, widget policy, operation policy, or per-source ACLs. Such fine-grained fields MUST be rejected until ADR 0152 supplies the authorization contract.

## 9. App Manifest Integration

App Manifest v2.1 introduces optional `dataSources[]` as an array-cardinality sibling slot. Each entry is a `SiblingRef` and resolves to a Data Sources document whose loaded discriminator is `$formspecDataSources`.

App Manifest v2.0 documents remain valid. They MUST NOT include `dataSources[]`. A v2.0 manifest with `dataSources[]` is invalid because that sibling slot was not part of the v2.0 closed property surface.

Absent `dataSources[]` does not cause synthesis. Renderers, generators, and runtimes MUST NOT fabricate a Data Sources document from Definition `instances`, widget payloads, fixture paths, or URL naming conventions.

## 10. Conformance

A Data-Sources-Aware Processor MUST:

1. Validate the Data Sources document against `schemas/data-sources.schema.json`.
2. Reject duplicate source ids.
3. Reject source ids whose prefix does not match `kind`.
4. Reject `cache.mode: "none"` with `staleAfter`.
5. Reject `delivery: "live"` unless `cache.mode` is `subscribe`.
6. Reject `delivery: "draft"` unless the source is `kind: "definition-response"` and `cache.mode` is `draft`.
7. Reject provenance kind drift.
8. Reject route or slot availability without a Surface URL.
9. Reject fine-grained authorization fields not declared by this schema.

### 10.1 Conformance Fixtures

The normative fixture corpus lives at `tests/conformance/fixtures/data-sources/`:

| Fixture | Posture | Proves |
|---|---|---|
| `valid-catalog.json` | positive | App-level, slot-level, Definition-response draft, and module-level sources validate. |
| `duplicate-id.json` | negative | Duplicate source ids are semantic errors. |
| `id-prefix-mismatch.json` | negative | Source id prefix must match `kind`. |
| `cache-none-stale-after.json` | negative | `cache.mode: "none"` forbids `staleAfter`. |
| `live-with-snapshot-cache.json` | negative | Live delivery requires subscribe cache mode. |
| `draft-not-definition-response.json` | negative | Draft delivery is only valid for Definition-response sources with draft cache. |
| `provenance-kind-mismatch.json` | negative | Provenance kind must match source kind. |
| `surface-without-surface-ref.json` | negative | Surface availability is ambiguous without a Surface URL. |
| `slot-without-surface-ref.json` | negative | Slot availability is ambiguous without a Surface URL. |
| `fine-grained-auth.json` | negative | Fine-grained authorization fields are rejected before ADR 0152. |

App Manifest v2.1 Data Sources references are covered in `tests/conformance/fixtures/bundle/app-with-data-sources-v2-1.json`; v2.0 rejection is covered in `invalid-data-sources-in-2-0.json`.

## 11. Contract vs stack implementation

This v1.0 document closes the **catalog contract** (ADR 0153 gate 5). Shared graph loading and validation exist elsewhere; this spec still does not define runtime behavior.

| Concern | Status | Where |
|---|---|---|
| Peer artifact spec + schema + fixtures | **Closed** (this document) | §3–§10 |
| `ArtifactResolver` / `ModuleResolver` load `dataSources[]` siblings | **Closed** (contract + kernel) | ADR 0153 gates 4, 12; `artifact-resolver-spec.md` |
| `AppGraphValidator` availability cross-artifact checks | **Open** | Stack ticket [`fs-r2od`](../../../.tickets/fs-r2od.md) |
| Payload fetch, cache enforcement, host loader port | **Open** | Stack ticket [`fs-9d5e`](../../../.tickets/fs-9d5e.md); requires normative loader slice (§12) |
| Source-to-Definition-instance bridge | **Open** | Explicit mapping only; not implied by catalog |
| Renderer fallback / query language | **Out of scope** | — |
| Fine-grained authorization | **Held** | ADR 0152 |

**Cold-read index:** [`thoughts/2026-05-26-open-work-index.md`](../../../thoughts/2026-05-26-open-work-index.md).

## 12. Runtime loader (future normative slice)

The catalog declares `runtime` delivery, cache, staleness, failure, and provenance metadata. **No processor in this spec version fetches or materializes payloads.** When a loader lands:

1. A host **`DataSourceLoader`** (name TBD) port resolves declared sources against loaded graph handles — not fixture paths.
2. **Definition `instances`** remain the authority for `@instance()` inside a Definition unless an explicit, documented bridge maps a catalog `sources[].id` to an instance name.
3. **Definition-local** URL / `formspec-fn:` loading in Core §2.1.7 and `FormEngine` stays valid for form-only apps without a peer catalog.

Implementation tracking: tickets `fs-r2od` (validator availability) then `fs-9d5e` (loader MVP). Do not treat ADR 0153 gate 5 "Closed" as runtime-complete.
