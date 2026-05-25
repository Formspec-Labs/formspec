---
title: Formspec ModuleResolver Interface Specification
version: 0.1.0-draft.2
date: 2026-05-25
status: draft
---

# Formspec ModuleResolver Interface Specification v0.1

**Version:** 0.1.0-draft.2
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Companion to:** App Manifest, Registry, Surface, and AppGraphValidator

---

## Status of This Document

This document is the prose-only interface contract for the app-graph
`ModuleResolver` primitive. It defines the request/response shape, registry
index boundary, app and sibling `modules[]` evidence, admission model,
contribution ownership checks, payload-schema hook boundary, and diagnostics
consumed by `AppGraphValidator`.

This document intentionally does not define a JSON Schema, generated types,
fixture-backed conformance, shared package implementation, Rust lint rewrite,
production consumer wiring, renderer fallback policy, or fine-grained
authorization. Those land in later implementation gates after the prose
responsibilities are stable.

Architecture Decision Records may record provenance for this boundary, but
this specification states the resolver contract directly.

## Bottom Line Up Front

- `ModuleResolver` answers whether declared modules are admitted and whether
  module-contributed values resolve to exactly one admitted owner.
- Registry module entries own `contributes[]` and `dependencies[]`; consuming
  artifacts own `modules[]` declarations and module-contributed values.
- App Manifest `modules[]` is app-level evidence. Sibling document `modules[]`
  must resolve against the app module set or the default module set.
- Host-supplied admission evidence can constrain modules by `id`, `version`,
  `publisher`, or `lockHash`. The resolver does not require or absorb the v4
  spike Posture sidecar.
- `ModuleResolver` does not fetch artifacts, validate source schemas, render
  Components, execute Response Actions, or own Component id-collision checks.

## 1. Purpose and Scope

Formspec schemas intentionally admit `x-*` extension values at module-extensible
sites. `ModuleResolver` turns those admitted shapes into graph-level evidence:
which modules are available, which Registry entries they contribute, whether
their dependency and admission requirements hold, and whether payload-bearing
uses match the contributing module's payload schema.

In scope:

- app-level and sibling-document `modules[]` coherence,
- default module set semantics for closed-core behavior,
- Registry indexing for `category: "module"` entries and their contributions,
- module version and dependency compatibility checks,
- optional host-supplied coarse admission evidence,
- contribution owner, category, and admitted-owner checks,
- payload-schema validation hooks for module-owned payloads, and
- imported diagnostics with `origin: "module-resolver"` and
  `phase: "module-resolution"`.

Out of scope:

- artifact loading and manifest ref resolution,
- source schema validation,
- `AppGraphValidator` cross-artifact invariants outside module ownership,
- runtime execution or Response Actions invocation,
- renderer fallback and widget rendering behavior,
- the v4 spike Posture sidecar as a required input,
- Component bundle id collision ownership (E605),
- fine-grained actor, route, widget, field, source, or operation authorization.

## 2. Resolver Request

A `ModuleResolverRequest` is assembled from already loaded source artifacts and
Registry documents.

| Field | Required | Description |
|---|---|---|
| `appModules` | yes | App Manifest `modules[]` plus the default module set. |
| `documents` | yes | Loaded artifact handles or document summaries that may declare `modules[]` or consume module-contributed values. |
| `registries` | yes | Loaded Registry documents or a prebuilt registry index. |
| `admission` | no | Host-supplied coarse module allowlist evidence using `ModuleRef` identity fields plus host predicates. It is not a Posture sidecar requirement. |
| `support` | yes | Supported module categories, contribution categories, version-range grammar, and payload-schema validators. |
| `options` | no | Diagnostic policy and phase controls. Options MUST NOT authorize artifact loading, rendering, or effect execution. |

The resolver consumes loaded documents only. Missing Registry or sibling
artifacts are `ArtifactResolver` findings; malformed source documents remain
the `AppGraphValidator` schema phase.

## 3. Module References and Default Set

`ModuleRef` is the canonical module reference shape used by App Manifest
`modules[]`, consuming-document `modules[]`, and Registry module
`dependencies[]`. Host admission evidence may reuse these identity fields without
adding fields to the canonical `ModuleRef` schema. A reference has:

| Field | Description |
|---|---|
| `id` | `x-*` module identifier. |
| `version` | Exact SemVer or supported range expression. |
| `publisher` | Optional provenance assertion. |
| `lockHash` | Optional byte-level pin. |

Omitting `modules[]` in a form-only document is equivalent to declaring the
core default module set for closed-core behavior. That default does not
authorize arbitrary `x-*` values. A module-contributed value must resolve to a
declared or default module contribution with the expected category.

The default module set is a compatibility profile input, not a hidden global.
Consumers that use a different profile must name it in resolver support data so
diagnostics remain reproducible.

## 4. Registry Index

The resolver builds or consumes a deterministic Registry index:

| Index | Description |
|---|---|
| `modulesById` | `category: "module"` entries keyed by module name. |
| `entriesByName` | All Registry entries keyed by `name`. |
| `latestEntryByName` | Deterministic latest compatible entry when multiple versions exist. |
| `contributedBy` | Contribution name to owning module ids. |
| `payloadSchemas` | Contribution name to payload schema fragments such as `widgetShape.props`, `slotShape`, `semantics`, `row`, or `categoryShape`. |

Each module entry's `contributes[]` names Registry entries bundled by that
module. Each `dependencies[]` entry is a `ModuleRef` that must resolve against
the app module set and Registry module index.

The resolver MUST diagnose duplicate ownership when more than one admitted
module claims the same contribution name. It MUST NOT choose a winner by
Registry order.

## 5. Admission Model

Admission is coarse and module-scoped. Optional host admission evidence may
allow or deny a module reference by field equality:

1. `id` must match.
2. `version` must match or satisfy the support profile's version policy.
3. If `publisher` is present on the admission entry, it must equal the document
   module ref.
4. If `lockHash` is present on the admission entry, it must equal the document
   module ref.
5. Host predicates outside the `ModuleRef` identity tuple, such as timestamping
   requirements, may be reported as coarse admission evidence but must be
   validated by a later gate before execution relies on them.

The resolver may report binary module admission evidence, but it does not
define per-actor, per-route, per-widget, per-field, or per-source policy. Those
fine-grained policies require a separate authorization contract.

## 6. Resolution Order

The resolver runs deterministic phases:

1. Build the app module set from App Manifest `modules[]` plus the support
   profile's default module set.
2. Build the Registry index.
3. Validate app module ids and versions against Registry module entries.
4. Validate module `dependencies[]` against admitted app modules.
5. Compare each sibling document's `modules[]` with the app module set or
   default module set.
6. Apply optional host admission evidence.
7. Resolve each module-contributed value to one Registry entry, expected
   category, and admitted owning module.
8. Run payload-schema validators for payload-bearing contribution sites.
9. Return a module-resolution report with deterministic diagnostics.

Each phase should continue after recoverable failures so downstream reports can
show the full module-resolution failure set.

## 7. Contribution Resolution

A module-contributed value resolves only when all of these hold:

1. The value names a Registry entry.
2. The Registry entry's category matches the consuming site.
3. Exactly one module entry contributes that Registry entry.
4. The owning module is in the app module set.
5. The owning module is admitted by optional host admission evidence.
6. The owning module's dependencies resolve.

For E603-style sites, a module-extensible `x-*` value that fails any ownership
or admission check is unresolved. Closed-core values bypass contribution
resolution and remain schema or core-spec authority.

For E604-style sites, payload validation runs only after contribution ownership
resolves. Payload-schema failures are module-resolution diagnostics, not
renderer fallback instructions.

## 8. Known Consuming Sites

This interface covers the current and planned module-consuming sites without
requiring all consumers to be wired in this prose slice.

| Site | Expected contribution category | Payload boundary |
|---|---|---|
| Experience `units[].kind` | `unit-kind` | Future unit payload schema hook. |
| Surface `module-widget.binding.moduleId` and `widgetName` | `widget` | `binding.config` validates against `widgetShape.props`. |
| Theme widget configuration | `widget` | `widgetConfig` validates against `widgetShape.props`. |
| Mapping transforms | transform contribution family when promoted | Future transform payload hook. |
| Response Actions intents | `action-intent` | Validation tuple authority remains Response Actions and validation mapping. |
| Validation Mapping rows | `validation-mapping-row` | `row` payload schema. |
| UI graph policy token slots | `token-category` | Future `categoryShape` hook. |

Component bundle id collision diagnostics, including current E605 behavior,
are not ModuleResolver-owned. They remain bundle-graph validation because they
compare Component artifact identity across the resolved app graph rather than
module declaration, admission, contribution, dependency, or payload-schema
evidence.

## 9. Resolver Response

| Field | Required | Description |
|---|---|---|
| `ok` | yes | `false` when any module-resolution diagnostic has error severity. |
| `modules` | yes | Normalized app module set with source pointers. |
| `documents` | yes | Per-document module coherence results. |
| `contributions` | yes | Contribution resolution results keyed by consuming site. |
| `diagnostics` | yes | Module-resolution diagnostics in the shared app-graph envelope. |
| `summary` | yes | Counts for modules, admitted modules, denied modules, unresolved dependencies, unresolved contributions, payload failures, errors, warnings, and infos. |
| `phase` | yes | Module-resolution phase status and optional reason. |

Downstream `AppGraphValidator` imports these diagnostics with
`origin: "module-resolver"` and `phase: "module-resolution"`. It MUST NOT
duplicate them as native cross-artifact findings.

## 10. Diagnostics

Resolver diagnostics MUST use stable codes, deterministic source pointers, and
the shared app-graph diagnostic envelope.

| Code | Severity | Meaning |
|---|---|---|
| `MODULE-UNRESOLVED` | error | A declared app module is absent from the Registry module index. |
| `MODULE-VERSION-UNRESOLVED` | error | Registry module version evidence does not satisfy a `ModuleRef`. |
| `MODULE-DEPENDENCY-UNRESOLVED` | error | A module dependency is not in the admitted app module set. |
| `MODULE-SIBLING-UNDECLARED` | error | A sibling document declares a module outside the app module set and default module set. |
| `MODULE-ADMISSION-DENIED` | error | Optional host admission evidence denies a declared module. |
| `MODULE-CONTRIBUTION-MISSING` | error | A module-contributed value names no Registry entry. |
| `MODULE-CONTRIBUTION-CATEGORY` | error | A Registry entry category does not match the consuming site. |
| `MODULE-CONTRIBUTION-UNOWNED` | error | No module contributes the Registry entry. |
| `MODULE-CONTRIBUTION-CONFLICT` | error | More than one module contributes the same Registry entry. |
| `MODULE-CONTRIBUTION-UNADMITTED` | error | The owning module is not admitted by app or host evidence. |
| `MODULE-PAYLOAD-SCHEMA-MISMATCH` | error | A payload-bearing use fails the owning contribution's payload schema. |

Existing lint codes E603 and E604 are current enforcement seeds for unresolved
module-extensible values and payload-schema mismatches. A shared resolver may
map its diagnostics to those lint codes for lint consumers, but the interface
itself uses phase/origin diagnostics so AppGraph reports can import them
without recoding ownership.

## 11. Non-Goals and Handoff

The resolver hands off:

- module-resolution diagnostics to `AppGraphValidator`,
- source artifact loading failures to `ArtifactResolver`,
- source schema failures to the schema phase,
- cross-artifact non-module invariants to `AppGraphValidator`,
- rendering and fallback behavior to renderer/projection layers, and
- fine-grained authorization to a separate authorization contract.

It does not absorb the v4 spike Posture sidecar, execute effects, fetch Data
Sources payloads, or decide Component Surface/route identity.

## 12. Conformance

This v0.1 draft is an interface and responsibility contract only. A conforming
future implementation still needs:

1. schema or generated type promotion if the report/handle surface is frozen,
2. shared resolver package extraction,
3. fixture-backed conformance for module admission, dependency, contribution,
   category, conflict, and payload failures,
4. integration with `ArtifactResolver` and `AppGraphValidator`, and
5. production consumer wiring across lint, Studio, MCPs, runtime, and
   projection surfaces that consume module evidence.

Until those gates land, tools MAY use this document to align resolver
interfaces and diagnostics, but MUST NOT claim production `ModuleResolver`
conformance from this prose alone.
