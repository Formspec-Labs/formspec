---
title: Formspec ArtifactResolver Interface Specification
version: 0.1.0-draft.4
date: 2026-05-25
status: draft
---

# Formspec ArtifactResolver Interface Specification v0.1

**Version:** 0.1.0-draft.4
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Companion to:** App Manifest, AppGraphValidator, and Module Resolver

---

## Status of This Document

This document is the interface contract for the app-graph
`ArtifactResolver` primitive. It defines the resolver request/response shape,
loader boundary, manifest slot coverage, diagnostic vocabulary, and the handle
metadata consumed by `AppGraphValidator`.

The resolver output report is also pinned by
`schemas/artifact-resolution-report.schema.json` with `$id`
`https://formspec.org/schemas/artifactResolutionReport/0.1` and generated
`@formspec-org/types` types. A shared pure TypeScript resolver kernel now lives
in `@formspec-org/app-graph` and uses a host-injected loader port. This
document intentionally does not define a resolver request schema, production
consumer wiring, or runtime fetch/cache policy. A source conformance corpus now
executes the shared kernel against scenario fixtures; request interchange and
consumer wiring land in later implementation gates after responsibilities are
stable.

Architecture Decision Records may record provenance for this boundary, but
this specification states the resolver contract directly.

## Bottom Line Up Front

- `ArtifactResolver` turns App Manifest sibling references into resolved
  artifact handles. It does not validate source schemas or graph coherence.
- App Manifest `SiblingRef.url` plus optional `version` is the canonical
  sibling identity. Local paths, fixture names, URL suffixes, and directory
  scans are not identity.
- A host supplies the loader port. The resolver normalizes loaded artifacts,
  checks expected discriminator and identity/version evidence, and emits
  deterministic `artifact-resolution` diagnostics.
- Module and session declarations may be surfaced as manifest evidence, but
  module admission, dependencies, contribution ownership, and session runtime
  policy remain outside resolver authority.

## 1. Purpose and Scope

The App Manifest is the graph root. `ArtifactResolver` reads the manifest's
declared sibling references and produces handle records that downstream tools
can consume without guessing from local filesystem layout or implicit sibling
discovery.

In scope:

- resolver request and response concepts,
- host-supplied loader port boundary,
- App Manifest v2.0/v2.1/v2.2 sibling slot coverage,
- artifact handle identity and status metadata,
- discriminator, ref, version, and identity mismatch diagnostics, and
- imported diagnostic origin rules for `AppGraphValidator`.

Out of scope:

- source schema validation,
- `ModuleResolver` admission, dependency, and contribution logic,
- `AppGraphValidator` cross-artifact invariants,
- Response Actions invocation or durable effect execution,
- Data Sources payload fetching, caching, subscriptions, or staleness policy,
- runtime session ownership,
- fine-grained authorization semantics,
- local fixture-path identity or directory scanning, and
- production consumer wiring.

## 2. Resolver Request

An `ArtifactResolverRequest` is assembled by a host that already has an App
Manifest document and a loading strategy.

| Field | Required | Description |
|---|---|---|
| `manifest` | yes | Parsed App Manifest document. |
| `loader` | yes | Host-supplied port that loads a sibling by `SiblingRef.url`, optional `version`, and expected artifact kind. |
| `support` | no | Supported App Manifest versions, artifact kinds, and URI schemes. When omitted, the shared kernel uses its current default support profile. |
| `source` | no | Host source label for the App Manifest handle. It is diagnostic evidence only, not identity. |
| `digest` | no | Optional App Manifest content digest for reproducibility evidence. |
| `schemaId` | no | Optional App Manifest schema selected by the host or support profile. |

The resolver MAY reject a request before loading siblings when the manifest
version or top-level shape is outside the supplied or default support profile.
Full App Manifest source schema validation remains the `AppGraphValidator`
schema phase; the resolver only performs enough manifest inspection to
enumerate declared refs and protect its loading boundary.

## 3. Loader Port

The loader is the only component that performs I/O. It is host-specific and may
load from package resources, object stores, registries, file URLs, or in-memory
objects. A production resolver MUST NOT bake in spike fixture paths.

Conceptual loader input:

| Field | Description |
|---|---|
| `slot` | Manifest slot and ordinal, such as `definitions[0]` or `surfaces[1]`. |
| `ref` | The manifest `SiblingRef`, `LocaleRef`, `MappingRef`, or `ComponentRef` entry. |
| `artifactKind` | Expected artifact family for discriminator and identity checks. |
| `support` | Supported schemes and version policy supplied by the request. |

Conceptual loader outcome:

| Field | Description |
|---|---|
| `status` | `loaded`, `missing`, `unsupported`, `invalid-discriminator`, or an extension status. |
| `document` | Parsed JSON document when loading succeeds. |
| `source` | Diagnostic source label. It is evidence, not identity. |
| `digest` | Optional content digest for stale-input detection. |
| `diagnostics` | Loader-origin diagnostics that the resolver preserves or normalizes with `origin: "artifact-resolver"`. |

The resolver is responsible for converting loader failures into deterministic
artifact handles. It MUST NOT throw away partial evidence for one failed sibling
when other declared siblings can still be represented as handles.

## 4. Manifest Slot Coverage

The resolver covers App Manifest v2.0, v2.1, and v2.2 sibling references that
identify loadable source artifacts.

| Manifest member | Cardinality | Artifact kind | Expected discriminator |
|---|---|---|---|
| `definitions[]` | array, required, may be empty | `definition` | `$formspec` |
| `experience` | optional single | `experience` | `$formspecExperience` |
| `responseActions` | optional single | `responseActions` | `$formspecResponseActions` |
| `component` | optional single | `component` | `$formspecComponent` |
| `components[]` | optional array, App Manifest v2.2 only | `component` | `$formspecComponent` |
| `theme` | optional single | `theme` | `$formspecTheme` |
| `references` | optional single | `references` | `$formspecReferences` |
| `ontology` | optional single | `ontology` | `$formspecOntology` |
| `registries[]` | optional array | `registry` | `$formspecRegistry` |
| `surfaces[]` | optional array | `surface` | `$formspecSurface` |
| `dataSources[]` | optional array, App Manifest v2.1+ | `dataSources` | `$formspecDataSources` |
| `locales[]` | optional array | `locale` | `$formspecLocale` |
| `mappings[]` | optional array | `mapping` | `$formspecMapping` |

`modules[]` and `sessions[]` are App Manifest declarations, not sibling
artifact documents loaded by this resolver. The resolver MAY expose them as
manifest evidence to later phases, but `ModuleResolver` owns module admission,
dependencies, contribution ownership, and widget payload authority. Runtime
session state remains outside artifact resolution.

The resolver MUST reject or diagnose `dataSources[]` on App Manifest v2.0 and
`components[]` on App Manifest v2.0/v2.1. It MUST fail loud on manifest slots
outside the supplied support profile unless the member is an allowed `x-*`
extension ignored by App Manifest rules.

For `components[]`, `ComponentRef.handle` is App Manifest membership evidence
carried on the manifest ref. The resolver preserves that ref evidence for
downstream identity and route checks. It MUST NOT derive a Component handle
from local source labels, filenames, URL suffixes, Surface ids, route names, or
loaded Component document structure. The singular `component` member remains a
legacy compatibility loadable slot; revised import paths may normalize it
downstream as membership handle `default`, but the resolver keeps the declared
slot and ref evidence explicit.

## 5. Artifact Handles

A successful resolver response contains one handle for the manifest plus one
handle for each declared loadable sibling. Handles align with the
`@formspec-org/app-graph` `ResolvedArtifactHandle` shape.

| Field | Description |
|---|---|
| `slot` | Manifest slot and ordinal, such as `definitions[0]`. |
| `artifactKind` | Expected artifact family from the manifest slot. |
| `status` | Resolver status. Non-`loaded` handles still appear in the response. |
| `ref` | App Manifest ref for sibling artifacts. The manifest handle may omit it. |
| `schemaId` | Schema selected by artifact kind and support profile, when known. |
| `document` | Parsed JSON only when `status` is `loaded`. |
| `identity` | Document identity extracted from artifact-owned fields when the family defines one. |
| `source` | Host source label for diagnostics only. |
| `digest` | Optional digest. |
| `diagnostics` | Handle-local artifact-resolution diagnostics. |

The resolver MUST NOT derive identity from `source`, local paths, fixture names,
or URL suffix conventions. For Surface artifacts, the App Manifest
`surfaces[]` ref is canonical sibling identity; the Surface document's local
`id` is route-namespace evidence only.

For Component artifacts loaded through `components[]`, `ref.handle` is
membership evidence. The loaded Component document's own fields may contribute
document evidence for later phases, but they do not replace the App Manifest
membership handle.

## 6. Resolution Order

The resolver runs deterministically:

1. Confirm the App Manifest version is within the request support profile.
2. Enumerate supported loadable sibling slots in App Manifest order.
3. Produce a manifest handle.
4. Invoke the loader once per declared sibling ref.
5. For loaded documents, check the expected discriminator.
6. When the artifact family defines canonical identity or version fields,
   compare them with the manifest ref.
7. Emit one deterministic response with handles, diagnostics, and phase status.

The resolver does not synthesize absent siblings. A manifest without
`dataSources[]` or `components[]`, for example, produces no Data Sources or
Component-list handles and no fabricated catalog or Component membership list.

## 7. Resolver Response

| Field | Required | Description |
|---|---|---|
| `ok` | yes | `false` when any artifact-resolution diagnostic has error severity. |
| `manifest` | yes | Resolved handle for the App Manifest root. |
| `artifacts` | yes | Handles grouped by manifest slot. |
| `diagnostics` | yes | Resolver diagnostics normalized to the shared app-graph diagnostic shape. |
| `summary` | yes | Counts for declared refs, loaded artifacts, missing artifacts, unsupported refs, discriminator mismatches, version mismatches, identity mismatches, errors, warnings, and infos. |
| `phase` | yes | Artifact-resolution phase status and optional reason. |

Downstream `AppGraphValidator` consumes the handles and imports diagnostics
with `origin: "artifact-resolver"` and `phase: "artifact-resolution"`.

## 8. Diagnostics

Resolver diagnostics MUST use stable codes, deterministic source pointers, and
the shared app-graph diagnostic envelope.

| Code | Severity | Meaning |
|---|---|---|
| `ARTIFACT-REF-MALFORMED` | error | A manifest member expected to be a ref is missing `url` or has an invalid ref shape. |
| `ARTIFACT-UNSUPPORTED-SLOT` | error | The manifest uses a slot outside the resolver support profile. |
| `ARTIFACT-UNSUPPORTED-SCHEME` | error | The loader refuses the ref scheme under the support profile. |
| `ARTIFACT-MISSING` | error | The loader cannot find the declared sibling. |
| `ARTIFACT-LOAD-FAILED` | error | The loader found a source but could not parse or load it as JSON. |
| `ARTIFACT-DISCRIMINATOR-MISMATCH` | error | The loaded document discriminator does not match the manifest slot. |
| `ARTIFACT-VERSION-MISMATCH` | error | The manifest ref version is incompatible with loaded artifact version evidence. |
| `ARTIFACT-IDENTITY-MISMATCH` | error | Loaded artifact identity contradicts the manifest ref URL. |
| `ARTIFACT-DATASOURCES-VERSION-GATE` | error | `dataSources[]` appears on an App Manifest version below v2.1. |
| `ARTIFACT-COMPONENTS-VERSION-GATE` | error | `components[]` appears on an App Manifest version below v2.2. |

Diagnostics MAY include host-specific `details`, but details MUST NOT promote
local path, fixture, cache, or fetch metadata to identity authority.

The shared resolver kernel emits the Data Sources and Component version-gate
diagnostics above. Source conformance fixtures cover those failure families.
Gate 12 closure still requires AppGraphValidator/ModuleResolver integration and
production consumer integration.

## 9. Non-Goals and Handoff

The resolver hands off:

- loaded handles and artifact-resolution diagnostics to `AppGraphValidator`,
- manifest `modules[]` declarations to `ModuleResolver`,
- manifest `sessions[]` declarations to runtime/session ownership, and
- source labels and digests to tools that need reproducibility evidence.

It does not decide whether the resolved graph is coherent, whether modules are
admitted, whether Response Actions may execute, or whether a host may fetch
Data Sources payloads at runtime.

## 10. Conformance

This v0.1 draft defines the interface, output report contract, shared kernel,
and source conformance fixture families. A conforming production implementation
still needs:

1. integration with `AppGraphValidator` and `ModuleResolver`,
2. production consumer wiring, and
3. a resolver request schema/generated type only if future implementation
   inputs need a stable interchange artifact.

Until those gates land, tools MAY use this document to align resolver
interfaces and diagnostics, but MUST NOT claim production `ArtifactResolver`
conformance from this prose alone.
