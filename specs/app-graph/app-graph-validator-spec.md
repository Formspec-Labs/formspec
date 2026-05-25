---
title: Formspec AppGraphValidator Interface Specification
version: 0.1.0-draft.3
date: 2026-05-25
status: draft
---

# Formspec AppGraphValidator Interface Specification v0.1

**Version:** 0.1.0-draft.3
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Companion to:** App Manifest, Surface, Data Sources, Response Actions, Module Resolver, and Artifact Resolver

---

## Status of This Document

This document is the interface contract for the app-graph validator request
and report boundary. It defines the inputs, outputs, diagnostic shape,
schema-validation boundary, and cross-artifact ownership model for a production
`AppGraphValidator`.

The report output shape is structurally governed by
`schemas/app-graph-validation-report.schema.json`
(`https://formspec.org/schemas/appGraphValidationReport/0.1`) with generated
TypeScript exported by `@formspec-org/types`. This document intentionally does
not define a JSON Schema for validator requests, resolver implementations,
runtime invocation behavior, projection behavior, or production consumer wiring.
The Component route-target fixtures described in §9 are source-conformance
evidence for that validator family only. Broader production conformance lands in
later implementation gates after the report boundary is stable.

Architecture Decision Records may record provenance for this boundary, but
this specification states the validator contract directly.

## Bottom Line Up Front

- `AppGraphValidator` validates an already resolved app graph. It does not fetch
  URLs, discover siblings, read local fixture paths, or synthesize missing
  artifacts.
- Inputs are an App Manifest, `ArtifactResolver`-provided artifact handles,
  `ModuleResolver` output, a schema registry/support profile, and validator
  options.
- Outputs are deterministic validation reports with `ok`, summary counts,
  per-artifact schema results, diagnostics, skipped phases, and source pointers.
- Native validator diagnostics cover source schema validation, cross-artifact
  invariants, unsupported graph features, and fail-closed authorization
  boundaries. Resolver, module, and Surface-local diagnostics may be surfaced in
  the report only as imported diagnostics with their origin preserved.
- The validator does not render Components, execute Response Actions, evaluate
  durable effects, author ledger events, or decide fine-grained authorization.

## 1. Purpose and Scope

The App Manifest names an app graph. `ArtifactResolver` loads that graph's
referenced artifacts. `ModuleResolver` decides module admission and contribution
ownership. `AppGraphValidator` then validates the resolved graph as a graph
rather than as unrelated JSON files.

In scope:

- the validator request shape,
- the validator report shape,
- diagnostic identity and source pointers,
- per-artifact schema validation over loaded artifacts,
- cross-artifact invariants that require more than one artifact,
- imported upstream diagnostics from resolver/module/surface-local checks, and
- fail-closed handling for unsupported features and fine-grained authorization
  placeholders.

Out of scope:

- fetching, loading, or discovering artifacts,
- using fixture paths, filenames, URL suffixes, or directory conventions as
  identity,
- module admission/contribution resolution internals,
- Surface draft authoring and export-local lint rules,
- schema definitions for validator request payloads,
- validator request generated types and production consumer wiring,
- Studio, MCP, runtime, projection, or renderer wiring,
- source payload fetching/caching/subscription behavior, and
- Response Actions invocation or durable effect execution.

## 2. Validator Request

A validator request MUST be assembled from already resolved inputs. The minimum
request has these conceptual fields:

| Field | Required | Description |
|---|---|---|
| `manifest` | yes | Artifact handle for the App Manifest that roots the graph. |
| `artifacts` | yes | Resolved artifact handles grouped by manifest slot, for example `definitions[]`, `surfaces[]`, `dataSources[]`, `responseActions[]`, `experiences[]`, `registries[]`, `locales[]`, `theme`, `component`, and future graph siblings. |
| `schemaRegistry` | yes | Closed support profile for schema IDs, artifact kinds, and versions the validator can evaluate without network lookup. |
| `artifactResolution` | yes | `ArtifactResolver` result, including imported diagnostics for missing artifacts, unsupported references, discriminator drift, and ref/version mismatches. |
| `moduleResolution` | no | Full `ModuleResolutionReport` result when modules are present or module-contributed values must be checked. |
| `hostEvidence` | no | Host-supplied evidence collections that are not App Manifest siblings, such as `uiGraphPolicies[]`. This evidence is never discovered by `ArtifactResolver`. |
| `evidenceSchemaValidators` | no | Schema validators for host-supplied evidence. These validators are separate from artifact schema validators because host evidence is not an artifact handle. |
| `options` | no | Validator controls such as supported bundle versions, diagnostic severity policy, phase selection for tools, and compatibility profile. Options MUST NOT authorize fetching, rendering, or effect execution. |

### 2.1 Host Evidence

`hostEvidence` is explicit request evidence supplied by the host. It is not an
App Manifest slot namespace, and it is not discovered by `ArtifactResolver`.
The v0.1 UI Graph Policy boundary defines
`hostEvidence.uiGraphPolicies[]` entries with required `schemaId`, `source`, and
`document` fields. `source` is diagnostic evidence only, not identity authority.

The shared validator kernel validates host evidence through explicit
`evidenceSchemaValidators` before using that evidence in cross-artifact checks.
Missing or failing host-evidence schema validation MUST produce
`evidenceResults[]` entries and MUST skip dependent cross-artifact evaluation.
Artifact `schemaValidators` MUST NOT be used for host evidence.

This specification does not define a request JSON Schema and does not require
runtime hidden-state or consumer UI Graph Policy diagnostics in this slice. The
shared kernel does include the Surface/route, Locale-owner, hidden Definition
reference, Theme widgetRef, Theme token-slot, Theme token-reference/category,
and custom token-category evidence UI Graph Policy semantic passes over
schema-valid `hostEvidence.uiGraphPolicies[]`, loaded Surface handles, loaded
Locale handles, loaded Definition handles, loaded Theme handles, and completed
ModuleResolver evidence when a check depends on module
admission, contribution ownership, or normalized widget token-slot evidence.

### 2.2 Artifact Handle

An artifact handle is not just a JSON document. It carries enough source and
identity metadata for deterministic diagnostics:

| Field | Description |
|---|---|
| `slot` | Manifest slot and ordinal, such as `definitions[0]` or `dataSources[1]`. |
| `ref` | The App Manifest sibling reference, when the artifact came from a sibling slot. |
| `artifactKind` | Expected artifact family, such as `definition`, `surface`, `dataSources`, or `responseActions`. |
| `schemaId` | Schema selected for source validation. |
| `document` | Parsed JSON value when loading succeeded. |
| `identity` | Canonical document identity extracted from the document when that artifact family defines one, such as Definition `url`/`version` or Data Sources `id`/`version`. For Surface, this records the local Surface `id` for route namespace diagnostics only; canonical sibling identity remains the App Manifest `surfaces[]` ref URL/version carried in `ref`. |
| `source` | Diagnostic source pointer, such as URI, package resource, or host object ID. It is evidence for error reporting, not production identity. |
| `digest` | Optional content digest for tools that need stale-input checks. |
| `status` | Resolver status, such as `loaded`, `missing`, `unsupported`, or `invalid-discriminator`. Non-`loaded` statuses are reported by `ArtifactResolver`; the validator skips dependent graph phases. |

The validator MUST NOT derive identity from `source`, local paths, filenames, or
fixture metadata. Production graph identity is anchored by App Manifest refs and
checked against loaded artifact identity fields only where the artifact family
defines global identity. Surface route namespaces use Surface `id` locally, but
a Surface sibling is identified by the App Manifest `surfaces[]` URL/version
ref.

## 3. Validation Order

The validator runs in deterministic phases:

1. Import `artifactResolution` diagnostics and mark unresolved handles.
2. Import top-level `moduleResolution.diagnostics` when supplied.
3. Validate loaded artifacts and supplied host evidence against their selected
   source schemas.
4. Record loaded artifacts without an available artifact schema validator as
   `not-run` schema results, and host evidence without an available evidence
   schema validator as `not-run` evidence results.
5. Skip cross-artifact validation when required source schemas fail or do not
   run, and record the skipped phase status.
6. Evaluate cross-artifact invariants for the remaining schema-valid graph.
7. Apply fail-closed checks for unsupported features and fine-grained authorization
   placeholders.
8. Return one report sorted deterministically by severity, phase, artifact slot,
   JSON Pointer, and code.

Schema validation is a precondition for cross-artifact interpretation. A schema
valid graph can still be graph-invalid. A schema-invalid or schema-unvalidated
artifact or host-evidence document can still produce imported diagnostics, but
graph checks depending on that input MUST be skipped rather than guessed.

## 4. Validation Report

An `AppGraphValidationReport` is the validator's only output contract. It is a
data report, not an execution plan.

| Field | Required | Description |
|---|---|---|
| `ok` | yes | `true` only when no error-severity diagnostic exists in the report. |
| `summary` | yes | Counts for artifacts, schema failures, schema-unvalidated artifacts, graph errors, warnings, infos, imported diagnostics, unsupported features, and skipped phases. `unvalidatedArtifacts` counts artifact schema results only; host-evidence not-run state is represented in `evidenceResults[]` and phase status. `importedDiagnostics` excludes native `app-graph-validator`, `schema-validator`, and `ui-graph-policy` diagnostics emitted by the shared kernel. |
| `schemaResults` | yes | Per-loaded-artifact schema validation results, including schema ID, artifact source pointer, status, and schema diagnostics. This array is artifact-only. |
| `evidenceResults` | yes | Per-host-evidence schema validation results, including evidence slot, schema ID, opaque source, status, and schema diagnostics. Entries MUST NOT carry `artifactKind`, `ref`, `identity`, or App Manifest slot identity. |
| `diagnostics` | yes | Unified diagnostics from native validator phases and imported resolver/module/surface-local phases. |
| `phases` | yes | Ordered phase statuses with `completed`, `skipped`, or `not-run` status and skip reason when applicable. |
| `support` | no | Optional echo of supported bundle versions, artifact kinds, schema versions, and feature flags used for the run. |

Reports MUST be deterministic for the same request and support profile. They
MUST NOT contain fetched source payloads, rendered Component output, effect
results, private credentials, or host-only cache contents.

## 5. Diagnostic Shape

Every diagnostic in the unified report MUST carry:

| Field | Description |
|---|---|
| `code` | Stable machine-readable code. Native AppGraphValidator codes SHOULD use an `APP-GRAPH-` prefix unless a sibling spec already owns a code. |
| `severity` | `error`, `warning`, or `info`. `ok` is false when any diagnostic has `severity: "error"`. |
| `phase` | One of `artifact-resolution`, `schema`, `module-resolution`, `surface-local`, `cross-artifact`, `authorization-boundary`, or `unsupported`. |
| `origin` | Producing component, such as `app-graph-validator`, `artifact-resolver`, `module-resolver`, `surface-local-lint`, `schema-validator`, or `ui-graph-policy`. |
| `message` | Human-readable explanation. |
| `primarySource` | Artifact slot/source and JSON Pointer, when available. |
| `relatedSources` | Optional list of other artifacts or pointers that explain a cross-artifact conflict. |
| `details` | Optional stable JSON object for machine consumers. It MUST NOT contain executable code or local fixture-path identity. |

Imported diagnostics MUST preserve their origin. The validator MAY normalize
their envelope into this shape, but it MUST NOT recode an `ArtifactResolver`
diagnostic as native validator authority or duplicate `ModuleResolver` findings
as independent module checks. When importing diagnostics from a
`ModuleResolutionReport`, the validator imports only the report's top-level
`diagnostics[]` and adapts resolver source pointers to the
`AppGraphValidationReport` `SourcePointer` shape. Resolver-only module evidence
stays available on the typed `moduleResolution` context input; it is not copied
into the AppGraph report source pointer and does not widen the report schema.
When a ModuleResolver diagnostic points at host evidence, the imported
AppGraph source pointer preserves only `artifactSlot`, opaque `source`, and
`jsonPointer`; it MUST NOT add `artifactKind`, `ref`, or document identity to
host evidence.

## 6. Source Schema Validation Boundary

The validator owns source schema validation for loaded artifacts in the request.
It selects schemas from the supplied schema registry and support profile. It
MUST reject or diagnose artifacts whose version/discriminator is unsupported by
that profile.

The validator does not own:

- artifact fetching,
- local path containment checks,
- remote retrieval policy,
- sibling discovery,
- module contribution resolution internals,
- renderability of generated Components,
- Response Actions invocation state, or
- Data Sources payload availability at runtime.

Source schema validation answers whether each loaded artifact has the correct
shape for its declared family. Cross-artifact validation answers whether the
schema-valid artifacts are coherent together.

## 7. Cross-Artifact Invariant Ownership

The following table assigns ownership for invariants that may appear in a final
app-graph report.

| Invariant family | Owner | Report phase | Notes |
|---|---|---|---|
| Manifest sibling fetch/load, missing artifacts, local path containment, unsupported URI scheme | `ArtifactResolver` | `artifact-resolution` | Imported. The validator consumes the result and skips dependent phases. |
| Manifest sibling ref vs loaded artifact discriminator/version/identity | `ArtifactResolver`, surfaced through validator report | `artifact-resolution` | The resolver proves the handle matches the ref. The validator MUST NOT recover by guessing from filenames or URL suffixes. |
| App Manifest schema shape and supported `$formspecBundle` versions | `AppGraphValidator` schema phase | `schema` / `unsupported` | v2.0 and v2.1 support is profile-driven. Unsupported future versions fail loud. |
| Per-artifact source schemas | `AppGraphValidator` schema phase | `schema` | Runs only on loaded documents with selected schemas. |
| Module admission, module dependency, contribution ownership, widget prop schema | `ModuleResolver` | `module-resolution` | Imported from the typed `ModuleResolutionReport`. The validator passes the full report to cross-artifact validators as context evidence, imports only top-level resolver diagnostics, and does not duplicate module resolution logic. |
| Surface draft publishability, local route reachability, unresolved embed-route targets, duplicate route/slot ids | Surface export/local lint | `surface-local` | Imported or pre-run by Surface tools. Cross-artifact checks remain separate. |
| Surface slots to loaded Definitions, Experience units, Response Actions, and Data Sources | `AppGraphValidator` | `cross-artifact` | Validates relationships across already loaded artifacts. |
| Experience target Definitions and unit references | `AppGraphValidator` | `cross-artifact` | Checks that references name loaded Definitions and units. |
| Response Actions targetDefinition and Surface transition trigger references | `AppGraphValidator` | `cross-artifact` | Response Actions remains the executor; validator only checks declared references. |
| Data Sources availability selectors to loaded Surfaces, routes, slots, Definitions, and modules | `AppGraphValidator` | `cross-artifact` | Payload fetching and cache behavior remain out of scope. |
| UI graph policy to routes, locale keys, responsive rules, hidden Definition refs, and Theme widget refs/token slots/categories | UI Graph Policy spec plus `AppGraphValidator` | `cross-artifact` | `specs/app-graph/ui-graph-policy-spec.md` defines the prose boundary and `ui-graph-policy` is an admitted report origin. The shared kernel currently enforces host-evidence-backed Surface/route, policy-local Locale-owner, Locale-owner module-id resolution against completed ModuleResolver evidence, hidden Definition reference diagnostics, Theme widgetRef resolution against completed ModuleResolver widget contribution evidence, Theme token-slot checks against completed ModuleResolver `widgetTokenSlots[]` evidence, Theme token reference/category checks over exactly-one loaded Theme evidence, and custom `x-*` category compatibility against completed ModuleResolver `tokenCategories[]` evidence; runtime hidden-state and consumer checks remain later gates. |
| Fine-grained actor, route, operation, widget, field, or source authorization | Future authorization contract | `authorization-boundary` | Until a dedicated authorization contract lands, such fields fail closed rather than receiving semantics. |
| Response Actions invocation, idempotency replay, effect execution, and ledger append | Response Actions runtime and LedgerPort gates | not validator-owned | The validator may check references but must not execute behavior. |
| Component Surface/route target resolution, duplicate route claims, route-bound control Definition context, fake `targetDefinition` rejection, and node identity disambiguation | Component Surface/route identity contract plus `AppGraphValidator` gates | `cross-artifact` | The shared kernel currently enforces loaded Component membership, Surface/route/slot target resolution, duplicate route claims, exact-only Surface version mismatch, ref-less Component handle rejection, evidence-limited fake `targetDefinition` rejection, URL-based `definition-form` route context for route-bound Components with bound controls, stable route-scoped nodePath segment availability (`nodeId`, then `bind`, then `id`), sibling segment ambiguity, and duplicate constructed graph-wide Component node identity keys. Studio/kernel graph-wide operations and provenance validation remain later gates. |
| Component projection output and renderer fallback | Projection/runtime/renderer gates | not validator-owned | The validator may check future Component graph identity, but it must not render Components or choose fallback behavior. |

## 8. Unsupported Features and Authorization

A processor MUST fail loud when a graph uses an artifact version, manifest
version, sibling slot, or feature outside the supplied support profile. It MUST
NOT silently ignore unknown non-extension graph features in order to produce a
partial app.

Fine-grained authorization remains outside this specification. Until a
dedicated authorization contract lands, the validator MAY carry binary
admission evidence supplied by the host or session boundary, but MUST reject
fields that attempt to define
per-actor, per-route, per-artifact, per-operation, per-widget-class, per-field,
or per-source authorization semantics.

## 9. Conformance

This v0.1 draft defines the prose validator contract, the shared report
schema/generation evidence, and source conformance for the initial Component
route-target, route-bound-control Definition-context, Component node identity,
UI Graph Policy Surface/route, UI Graph Policy Locale-owner, hidden Definition,
and Theme widgetRef validator families. A conforming future implementation will
need later gates to provide:

1. broader fixture-backed conformance beyond the Component route-target /
   route-bound-control / node-identity, UI Graph Policy Surface/route, UI Graph
   Policy Locale-owner, hidden Definition, Theme widgetRef families, and typed
   `ModuleResolutionReport` diagnostic handoff,
2. broader extraction from lint, studio-core, and spike-local lessons without fixture
   assumptions, and
3. production consumers wired to shared validator output.

Until those gates land, tools MAY use this document to align interfaces and
diagnostic vocabulary, but MUST NOT claim production `AppGraphValidator`
conformance from this prose and report schema alone.
