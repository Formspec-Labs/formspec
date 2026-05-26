---
title: Formspec App Manifest Specification
version: 2.3.0-draft.1
date: 2026-05-25
status: draft
---

# Formspec App Manifest Specification v2.3

**Version:** 2.3.0-draft.1
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 -- A JSON-Native Declarative Form Standard
**Supersedes:** Bundle Manifest v1.0 (file renamed; structurally reframed per [ADR 0150](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md) §5.2/§5.3/§11.2).

---

## Status of This Document

This document is a **draft specification**. It is a companion to the [Formspec v1.0 core specification](../core/spec.md) and does not modify or extend the core processing model. Implementors are encouraged to experiment with this specification and provide feedback, but MUST NOT treat it as stable for production use until a 2.3.0 release is published.

This spec was promoted from the concept architecture note [`thoughts/archive/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/archive/specs/2026-05-20-formspec-semantic-layers.md) (Open Question §11.5 "Bundle Manifest"), shipped as the Bundle Manifest v1.0 spec, then **reframed as the App Manifest v2.0** per ADR 0150 §5.2/§5.3. The reframe widens the envelope from "names ONE form" to "names ONE app composed of zero-or-more Definitions, zero-or-more Surfaces, zero-or-more Registries, plus optional substrate modules and sessions." The `$formspecBundle` constant bumps `"1.0"` → `"2.0"` (§11.2 BREAKING) so strict-validating consumers of the legacy shape fail loud rather than silently mis-parse a structurally different document. App Manifest v2.1 is the first additive minor and adds `dataSources[]` sibling references without changing the v2.0 shape for documents that do not use that slot. App Manifest v2.2 adds `components[]` sibling references for app graphs that need more than one Component document or a route-bound Component membership handle. App Manifest v2.3 adds `screeners[]` sibling references as explicit association evidence for standalone Screener documents; it does not absorb Screener evaluation or runtime routing into App Manifest.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as defined in [RFC 3986].

Terms defined in the Formspec v1.0 core specification retain their core-specification meanings throughout this document unless explicitly redefined.

Additional terms:

- **App Manifest** -- A JSON document conforming to this specification, identified by `$formspecBundle: "2.0"`, `"2.1"`, `"2.2"`, or `"2.3"`. The author-facing single composition envelope above a Formspec app. (The wire constant retains the `$formspecBundle` name for symmetry with the v1.0 lineage and to keep validator dispatch trivial; the **document** is the App Manifest.)
- **App** -- The composed unit named by an App Manifest. An app composes zero-or-more Definitions, zero-or-more Surfaces, zero-or-more Registries, and any combination of optional substrate documents.
- **Form-only app** -- An App Manifest whose `definitions[]` holds exactly one Definition and no Surfaces. The simple-form path: one Definition file plus one App Manifest file, no synthesis, today's behavior with the addition of a stable form identity.
- **Non-form app** -- An App Manifest whose `definitions[]` is empty (`[]`). Composes surfaces, modules, registries without Definitions (e.g. workflow viewers, registry browsers, dashboard apps).
- **Sibling reference** -- An entry inside an App Manifest that names one composed artifact by canonical URL and (optional) version pin or range.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- bluf:start file=app-manifest-spec.bluf.md -->
- This document defines the **App Manifest** -- a single authored JSON artifact that names a Formspec app by composing its Definitions, Surfaces, Registries, Modules, Sessions, and any combination of optional substrate documents (Experience, Response Actions, Component/Components, Theme, References, Ontology, Locales, Mappings, Data Sources) at coherent versions.
- A valid App Manifest requires `$formspecBundle: "2.0"`, `"2.1"`, or `"2.2"`, a strict SemVer `version`, a stable app-identity `id` URL distinct from every sibling URL, and a REQUIRED `definitions[]` array (MAY be empty for non-form apps; single-element for form-only apps; multi-element for multi-form apps).
- App Manifest is a pure composition envelope: no inline sidecars, no synthesis on absence, no shims on existing primary specs. Sibling absence is honored; each sibling spec's existing defaults apply.
- App Manifest adds a forward-composition graph alongside sibling-owned `targetDefinition` and `targetSurfaceRoutes[]` references. Reverse-discovery continues to work; App Manifests add discovery-without-scanning for tools that hold one.
- BREAKING vs Bundle Manifest v1.0: singular `definition` reframes as `definitions[]` (REQUIRED, MAY be empty); singular `registry` reframes as `registries[]`; `surfaces[]`, `modules: ModuleRef[]`, `sessions: SessionRef[]` arrive; `$formspecBundle` const bumps `"1.0"` → `"2.0"` so strict consumers fail loud.
- ADDITIVE vs App Manifest v2.0: `$formspecBundle: "2.1"` admits `dataSources[]`; `$formspecBundle: "2.2"` admits `components[]` and continues to admit `dataSources[]`; older 2.x documents remain valid when they do not use newer members.
- This BLUF is governed by `schemas/bundle-manifest.schema.json`, the canonical structural contract.
<!-- bluf:end -->

---

## Table of Contents

- [§1 Introduction](#1-introduction)
- [§2 Identity and Versioning](#2-identity-and-versioning)
- [§3 Members](#3-members)
- [§4 Absence Semantics](#4-absence-semantics)
- [§5 Relationship to the Reference Graph](#5-relationship-to-the-reference-graph)
- [§6 Conformance](#6-conformance)

---

## 1. Introduction

The Formspec architecture composes a form from up to ten authored siblings -- Definition, Experience, Response Actions, Component, Theme, Locale, Mapping, References, Ontology, Registry -- plus generated artifacts (Trace) and response-scoped artifacts (Response, Respondent Ledger, ValidationReport, Intake Handoff, Determination Record). Each sibling carries its own URL and version. Form-bound siblings carry `targetDefinition`; Component 1.2 documents may instead carry `targetSurfaceRoutes[]`.

This composition graph works when a renderer or generator already knows which siblings to load. It fails for the author opening an app for the first time: an app is implicit in the union of artifacts, but no single artifact names it. There is no stable URL the author can publish, no single file Studio can open, no version a deployer can pin.

This specification defines the **App Manifest**: a single authored JSON artifact that names a Formspec app as one thing. The App Manifest references zero-or-more Definitions, zero-or-more Surfaces, zero-or-more Registries, zero-or-more Components, zero-or-more Screeners, optional substrate Modules and Sessions, and any combination of optional single-cardinality siblings, each by canonical URL and (optional) version. The app's own `id` is the stable identity URL; the app's `version` is the coherent published-app version that pins sibling versions.

The reframe from "Bundle Manifest names one form" (v1.0) to "App Manifest names one app" (v2.0) lands per [ADR 0150](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md) §5.2/§5.3 — Formspec as a layered UI substrate must envelope multi-form apps (an intake suite composing several screening forms) and non-form apps (a workflow viewer composing only surfaces). The v1.0 singular `definition`/`registry` was structurally adequate only for form-only apps; v2.0 plurals open the envelope without breaking the form-only common case (single-element `definitions[]`).

The App Manifest is a **pure composition envelope**. It MUST NOT:

- inline sibling document bodies (a `locale` reference names a URL; the locale strings live at that URL),
- synthesize absent siblings (a manifest that references only `definitions[]` does NOT cause a renderer to fabricate an Experience document; see §4 Absence Semantics),
- override sibling semantics (sibling versions, sibling identities, and sibling spec rules are unchanged by being named in a manifest),
- replace Definition as the core executable model for form-only apps (Definition stays the source of behavior; manifest is the optional envelope above it).

A Definition without an App Manifest remains a valid Formspec form. The App Manifest is the **opt-in** seam between architectural breadth (many specs) and authoring ergonomics (open one thing).

## 2. Identity and Versioning

### 2.1 App Identity

An App Manifest MUST carry an `id` property whose value is a stable canonical URL identifying the app. Two App Manifests with the same `id` SHOULD be different versions of the same app; an `id` change SHOULD be reserved for apps that have diverged enough to no longer share a continuous evolution.

The `id` MUST be distinct from every sibling URL referenced in the same manifest (every `definitions[].url`, every optional single-cardinality slot's `url`, every entry in `registries[]` / `surfaces[]` / `screeners[]` / `dataSources[]` / `components[]` / `locales[]` / `mappings[]`). An app's `id` is the app's identity; a sibling's URL is an artifact's identity. Collapsing them would mean the app and one of its parts share an identity, which breaks publication and Trace.

### 2.2 App Version

An App Manifest MUST carry a `version` property whose value is a strict SemVer 2.0.0 string (no leading zeros in numeric identifiers, no empty pre-release identifiers, no leading-zero numeric pre-release identifiers). The app version represents the **coherent published app**: bumping any sibling version SHOULD bump the app version. Producers MAY publish multiple app versions for the same `id` (different SemVer values); consumers MAY pin against any.

The App Manifest spec itself is versioned via `$formspecBundle`. This schema accepts `"2.0"`, `"2.1"`, `"2.2"`, and `"2.3"`:

- `"2.0"` is the original ADR 0150 major/minor for the singular-to-plural App Manifest shape.
- `"2.1"` is the first additive minor and introduces `dataSources[]` sibling references.
- `"2.2"` is the second additive minor and introduces `components[]` sibling references while preserving the singular `component` compatibility member.
- `"2.3"` is the third additive minor and introduces `screeners[]` sibling references as explicit Screener-to-app association evidence.

The `$formspecBundle` value tracks the major.minor of the canonical schema `$id` (`https://formspec.org/schemas/bundleManifest/2.3`). Future minor versions (`2.4`, `2.5`) introduce new sibling slots while remaining backward compatible with older 2.x documents that do not use them, and a major bump (`3.0`) signals another breaking shape change.

A processor that supports only `2.0` MUST check `$formspecBundle` before structural schema validation. A v2.0-only processor MUST reject `"2.1"`, `"2.2"`, and `"2.3"` documents with `unsupported-bundle-version`; a v2.1 processor MUST reject `"2.2"` and `"2.3"` documents with `unsupported-bundle-version`; a v2.2 processor MUST reject `"2.3"` documents with `unsupported-bundle-version`; a v2.3 processor MUST accept valid `"2.0"`, `"2.1"`, and `"2.2"` documents that do not use unsupported newer members. A document with `$formspecBundle` outside the supported 2.x set MUST be rejected with an `unsupported-bundle-version` error rather than a generic schema-validation failure. Documents carrying the legacy `"1.0"` value MUST be rejected by 2.x processors; the 1.0 → 2.0 plural-shape change (ADR 0150 §11.2) is BREAKING and silent acceptance would mis-parse the document.

### 2.3 Sibling Version Pinning

Each sibling reference -- every `definitions[]` entry, every populated optional sibling, every `registries[]`/`surfaces[]`/`screeners[]`/`dataSources[]`/`components[]`/`locales[]`/`mappings[]` entry -- carries an optional `version` field. When present, `version` MUST be either:

- an **exact** SemVer 2.0.0 string (e.g., `"1.2.0"`), OR
- a **range expression** in the form Definition's `targetDefinition.compatibleVersions` accepts (e.g., `">=1.0.0 <2.0.0"`, `"^1.0.0"`).

When `version` is omitted, the manifest accepts any compatible-by-major sibling version (equivalent to `"^<sibling-current-major>"`).

Producers SHOULD pin exact versions in published manifests. Range expressions are RECOMMENDED for development and prerelease workflows.

For form-bound siblings, a manifest's sibling pin SHOULD be a subset of the sibling artifact's own `targetDefinition.compatibleVersions` range. Manifests MUST NOT widen a sibling's compatibility envelope.

The manifest's top-level `version` is shape-validated as strict SemVer because it pins the published-app identity (one row in a release catalog). Per-`SiblingRef.version` is shape-validated only as a non-empty string because it carries the broader "exact or range" grammar described above; range-expression validation is the responsibility of the sibling resolution step, not the schema.

## 3. Members

### 3.1 Required Member

| Member | Type | Cardinality | Description |
|---|---|---|---|
| `definitions` | `SiblingRef[]` | REQUIRED; MAY be empty | Zero-or-more Definitions this app composes. Empty array identifies a non-form app. Single-element is the form-only common case. Multi-element supports multi-form apps. |

### 3.2 Optional Single-Cardinality Members

Each MAY appear at most once.

| Member | Type | Composes |
|---|---|---|
| `experience` | `SiblingRef` | Task intent (Experience companion spec) |
| `responseActions` | `SiblingRef` | Form-scoped action orchestration |
| `component` | `SiblingRef` | Legacy single Component compatibility reference; normalized as `components[]` handle `default` by revised import paths |
| `theme` | `SiblingRef` | Visual tokens and presentation defaults |
| `references` | `SiblingRef` | External resource attachments |
| `ontology` | `SiblingRef` | Concept metadata |

### 3.3 Optional Array-Cardinality Members

Each MAY appear at most once as a container. Each container holds one or more entries; entries are distinguished by a member-specific key that MUST be unique within the array (where the member defines one).

| Member | Item Type | Per-entry Key | Description |
|---|---|---|---|
| `registries` | `SiblingRef` | (URL) | Registry documents (option-set / module / token registry enrichment). Multi-element supports tenant-local overlays over stack-shared registries. |
| `surfaces` | `SiblingRef` | (URL) | Surface documents (presentation/layout shells; Surface spec lands at ADR 0150 §14 P2). Multi-element supports respondent + reviewer surfaces. |
| `screeners` | `SiblingRef` | (URL) | Screener documents. v2.3 only; multi-element supports explicit Screener-to-app association without absorbing Screener evaluation, runtime routing, TraceIndex, or hostEvidence into App Manifest. |
| `dataSources` | `SiblingRef` | (URL) | Data Sources catalogs. v2.1+ only; multi-element supports app, route, slot, module, or resource source catalogs without changing Definition `instances`. |
| `components` | `ComponentRef` | `handle` (slug) | Component documents. v2.2+ only; multi-element supports app UI with route-bound Component identity and stable graph-wide membership handles. |
| `modules` | `ModuleRef` (common.schema) | `id` | Substrate modules this app depends on. Coherence rule: every module declared by a sibling document MUST resolve against this list or the default module set (ADR 0150 §4.9). |
| `sessions` | `SessionRef` (common.schema) | `id` | Sessions held against the app. Durable session index for `respondent-ledger.sessionRefs[]` URN references (ADR 0150 §5.5). |
| `locales` | `LocaleRef` | `locale` (BCP47 tag) | One Locale document per supported locale. |
| `mappings` | `MappingRef` | `handle` (slug) | One Mapping document per named handle. Response Actions and other consumers resolve `mappingRef` against this handle. |

### 3.4 SiblingRef, LocaleRef, MappingRef, ComponentRef Shapes

All sibling references share a `url` (required, URI) and optional `version` (SemVer or range expression). Array-member item types add a per-entry key:

- `LocaleRef = SiblingRef + { locale: BCP47 }`
- `MappingRef = SiblingRef + { handle: slug }`
- `ComponentRef = SiblingRef + { handle: slug }`
- `ModuleRef` and `SessionRef` live in `common.schema.json#/$defs/` (canonical shapes per ADR 0150 §4.4 / §5.5).

`SiblingRef.url` MUST resolve to a single sibling artifact of the expected type. A manifest-aware processor SHOULD verify that the loaded artifact's discriminator matches the manifest slot. The discriminator names are slot-specific:

| Manifest slot | Loaded-document discriminator |
|---|---|
| `definitions[]` | `$formspec` (the Definition root carries the unqualified discriminator) |
| `experience` | `$formspecExperience` |
| `responseActions` | `$formspecResponseActions` |
| `component` | `$formspecComponent` |
| `components[]` | `$formspecComponent` |
| `theme` | `$formspecTheme` |
| `references` | `$formspecReferences` |
| `ontology` | `$formspecOntology` |
| `registries[]` | `$formspecRegistry` |
| `surfaces[]` | `$formspecSurface` (Surface spec; ADR 0150 §14 P2) |
| `screeners[]` | `$formspecScreener` |
| `dataSources[]` | `$formspecDataSources` |
| `locales[]` | `$formspecLocale` |
| `mappings[]` | `$formspecMapping` |

The Definition naming asymmetry (`$formspec` vs every other sibling's `$formspec<Type>`) is inherited from the Definition core spec and is not adjusted by this spec. Mismatched discriminators are a resolution error, not a manifest-shape error.

Each Ref shape MAY carry `x-*` extension properties (e.g., `x-lockfileHash`, `x-cachedAt`) for tooling-specific per-reference metadata; processors MUST ignore unknown `x-*` properties when resolving siblings.

The singular `component` member remains valid for v2.0+ manifests. Revised import
paths normalize it to a logical `components[]` entry with `handle: "default"`.
Producers that need more than one Component document MUST use `components[]`;
they MUST NOT encode Component selection in filenames, URLs, route names, or
other naming conventions. A manifest SHOULD NOT declare both `component` and
`components[]`; if both are present, processors MUST reject a `components[]`
entry whose `handle` is `default` because it conflicts with the normalized
singular Component membership.

### 3.5 Closed Property Surface

The App Manifest schema declares `additionalProperties: false`. New sibling slots require an App Manifest schema version bump. `dataSources[]` is the first additive slot and requires `$formspecBundle: "2.1"` or later; a `"2.0"` manifest carrying `dataSources[]` is invalid. `components[]` is the second additive slot and requires `$formspecBundle: "2.2"` or later; `"2.0"` and `"2.1"` manifests carrying `components[]` are invalid. `screeners[]` is the third additive slot and requires `$formspecBundle: "2.3"`; `"2.0"`, `"2.1"`, and `"2.2"` manifests carrying `screeners[]` are invalid. The closed surface keeps manifest resolution deterministic.

Authors MAY use `x-*` extension properties on the top-level object for tooling-specific metadata. Manifest-aware processors MUST ignore unknown `x-*` properties when resolving siblings.

### 3.6 Excluded Members (Runtime / Generated Artifacts)

The following artifacts MUST NOT appear in an App Manifest. They are response-scoped or generated, and are produced from a manifest at runtime rather than composing one:

- Response, Validation Report, Determination Record
- Respondent Ledger, Intake Handoff
- Trace

## 4. Absence Semantics

An App Manifest names which sibling artifacts compose an app. When a sibling slot is **absent**, that sibling's own specification rules govern -- not App Manifest.

Absence MUST NOT trigger synthesis. Specifically:

- A manifest that references only `definitions[]` MUST NOT cause a renderer, generator, or consumer to fabricate an Experience document from Definition structure. As the concept architecture note ([`thoughts/archive/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/archive/specs/2026-05-20-formspec-semantic-layers.md) §6.2) warns: "Definition groups describe data structure ... Experience units describe task intent. Sometimes they align. Often they do not." Synthesizing Experience would conflate the two layers and create fake Trace coverage.
- A manifest without `component` or `components[]` MUST cause renderers to use Definition's existing widget-default rendering for form-bound render paths. No Component tree is synthesized; the layered absence is honored.
- A manifest without `theme` MUST cause renderers to use their built-in presentation defaults.
- A manifest without `locales` MUST cause locale resolution to fall back to Definition-embedded strings (per [Locale spec §4 Fallback Cascade](../locale/locale-spec.md#4-fallback-cascade)).
- A manifest without `responseActions` MUST cause Component triggers to be unresolvable (per Component §5.19) -- which is an authoring or host-configuration error only if the Component document actually declares `ActionButton` nodes. A manifest with neither `responseActions` nor `component` has no triggers; submit happens via host UI outside Formspec's responsibility.
- A manifest without `mappings` MUST cause Response Actions effects of type `mappingExecution` to fail resolution at invocation time (a Response Actions runtime error, not a manifest-shape error).
- A manifest without `dataSources[]` MUST NOT cause processors to synthesize a Data Sources catalog from Definition `instances`, widget payloads, fixture paths, or URL naming conventions. Definition-local `instances` keep their existing form-local meaning.
- A manifest without `components[]` MUST NOT cause processors to discover additional Component documents from filenames, URLs, route names, or Surface structure. The singular `component` compatibility member names at most one Component document.
- A manifest without `screeners[]` MUST NOT cause processors to discover Screener documents from filenames, TraceIndex, Runtime Plan, embedded Definition screeners, hostEvidence, loaded Definitions, or Surface route names. A Screener must be associated by `screeners[]` before AppGraphValidator checks `surface:<route-id>` targets against loaded Surfaces.
- A manifest with empty `definitions[]` (non-form app) MUST NOT cause a renderer to fabricate a Definition. Non-form apps compose surfaces and modules; form rendering paths SHOULD NOT trigger.

A **form-only app** (single-element `definitions[]`, no `surfaces`) is a valid manifest and a valid form. It is the simple-form path: one Definition file plus one App Manifest file, no synthesis, today's behavior with the addition of a stable form identity.

The opt-in escalation is monotone: an author starts with `definitions: [<one>]`, adds `experience` when task intent becomes worth naming, adds `component` when a single Component tree becomes worth controlling, adds `components[]` when multiple Component documents or route-bound Component identity become worth naming, adds `screeners[]` when standalone eligibility or routing Screeners need an authored app association, adds a second Definition when the app composes a second form, adds `surfaces[]` when the app needs presentation shells beyond the form-only path. Each addition is an authored artifact, not a synthesized one.

## 5. Relationship to the Reference Graph

Form-bound sibling artifacts carry a `targetDefinition` back-reference naming the Definition they bind to. Component 1.2 documents may instead declare `targetSurfaceRoutes[]` when they bind to Surface routes. App Manifest does **not** change either sibling-owned reference shape -- it adds a forward-composition graph alongside them.

### 5.1 Forward Composition (Manifest → Siblings)

The manifest's slot-by-slot sibling references compose an app forward. A consumer that holds an App Manifest can resolve every artifact needed to render or process the app without scanning a content-addressable store, registry, or filesystem for documents that target a given Definition.

This is the seam App Manifest adds: discovery without reverse-scanning.

### 5.2 Back-Reference Preservation (Sibling → Definition)

Every form-bound sibling document continues to carry its own `targetDefinition` (Experience, Component, Response Actions, Theme, Locale, Mapping, References, Ontology). Component 1.2 route-bound documents carry `targetSurfaceRoutes[]` instead. Those sibling-owned references are unchanged. App Manifest does NOT consume them; it does NOT supersede them; it does NOT generate them.

For multi-Definition apps, each form-bound sibling's `targetDefinition` names ONE Definition (the spec contract); the manifest names which Definitions are co-composed but does not re-target sibling back-references.

A sibling artifact remains independently valid against its own spec without ever appearing in an App Manifest. The reverse-discovery path (load Definition; find siblings whose `targetDefinition.url` matches) MUST continue to work for tools that do not use App Manifest.

### 5.3 Consistency Between Manifest Pin and Back-Reference

When an App Manifest pins a sibling at version V, the loaded sibling document at `siblingRef.url` MUST satisfy two constraints:

1. The sibling document's own `version` MUST be compatible with the manifest's pin (`siblingRef.version`).
2. For form-bound siblings, the sibling document's `targetDefinition.url` MUST equal one of the manifest's `definitions[].url` entries, and the sibling's `targetDefinition.compatibleVersions` MUST accept that Definition's pinned `version`.

A manifest that names a sibling whose back-reference targets a Definition NOT in the manifest's `definitions[]` is a resolution error.

### 5.4 Screener Association and Surface Targets

`screeners[]` is an authored association slot for standalone Screener documents.
It is not a runtime Screener evaluator, a router, a TraceIndex shortcut, or a
host-evidence channel. A Screener remains independently valid against the
Screener spec whether or not it appears in an App Manifest.

When an App Manifest declares `screeners[]`, `ArtifactResolver` loads those
Screener documents as manifest-associated siblings. `AppGraphValidator` MUST
check any associated Screener route target using the `surface:<route-id>` scheme
against the loaded Surface documents in the same app graph. The target MUST
resolve to exactly one loaded Surface `routes[].id`. Missing or ambiguous
resolution is a cross-artifact validation error. Processors MUST NOT infer a
Screener-to-app association from filenames, loaded Definitions, TraceIndex,
Runtime Plan, embedded Definition screeners, Surface route names, or ad hoc
`hostEvidence`.

### 5.5 Module Coherence (ADR 0150 §5.2)

The App Manifest's `modules[]` declaration is the canonical app-level module manifest. Coherence rule: every module declared by a sibling document's `modules[]` MUST resolve against the App Manifest's `modules[]` OR against the default module set (ADR 0150 §4.9 — omitting `modules[]` is identical to declaring the core module set). A sibling that depends on a module NOT in the app's manifest is a manifest-resolution error.

### 5.6 Session Index (ADR 0150 §5.5)

The App Manifest's `sessions[]` is the durable session index for the app. Each `SessionRef.id` is a `urn:formspec:session:...` URN; `respondent-ledger.sessionRefs[]` references those URNs to trace the temporal grouping of acts in the ledger back to a session opened against this app.

`sessions[]` is a durable session identity anchor, not runtime route state.
Host session boundaries own issued tokens, actor/collaborator context, and
session authentication. Surface runtime routers own active route and navigation
history. Core Response instances own Response data/status. Response Actions
runtime owns invocation/effect state. App Manifest may index sessions and let
Ledger records refer to them, but it MUST NOT synthesize route navigation,
Response instances, or action invocations from the session index alone.

### 5.7 No Shim Path

This specification does NOT introduce a `definition.bundle` field, a `Bundle.legacyDefinitionOnly` flag, or any backwards-compat alias on existing primary specs. App Manifest is a peer primary artifact; existing artifacts are unchanged. Implementations migrating from Bundle Manifest v1.0 to App Manifest v2.0 update their manifest files (singular → plural shape, `$formspecBundle` 1.0 → 2.0) — they do not modify existing schema shapes of the underlying sibling documents.

## 6. Conformance

### 6.1 Conformance Targets

A **Manifest-Aware Processor** MUST:

1. Validate the App Manifest document against `schemas/bundle-manifest.schema.json`.
2. Enforce array-uniqueness: every `locales[].locale` MUST be unique within `locales`; every `mappings[].handle` MUST be unique within `mappings`; every `components[].handle` MUST be unique within `components`; every `modules[].id` MUST be unique within `modules`; every `sessions[].id` MUST be unique within `sessions`; every `definitions[].url` MUST be unique within `definitions`; every `dataSources[].url` MUST be unique within `dataSources`; every `screeners[].url` MUST be unique within `screeners`.
3. Enforce identity distinctness: the manifest's `id` MUST NOT equal any sibling `url` in the same manifest (singles or array entries; see §2.1).
4. When resolving siblings: load each sibling URL, verify the sibling document's discriminator matches the slot per the §3.4 table, and verify §5.3 sibling-pin consistency.
5. Honor §4 Absence Semantics. Absent siblings MUST NOT be synthesized.
6. Enforce §5.5 module coherence: every sibling's `modules[]` entry MUST resolve against the manifest's `modules[]` or the default module set.
7. Reject documents with unsupported `$formspecBundle` values with an `unsupported-bundle-version` error (per §2.2). A v2.3 processor MUST accept valid `"2.0"`, `"2.1"`, and `"2.2"` documents that do not use unsupported newer members.
8. Reject `dataSources[]` unless `$formspecBundle` is `"2.1"`, `"2.2"`, or `"2.3"`.
9. Reject `components[]` unless `$formspecBundle` is `"2.2"` or `"2.3"`.
10. Reject `screeners[]` unless `$formspecBundle` is `"2.3"`.
11. Reject a manifest that declares both singular `component` and a `components[]` entry with `handle: "default"`.

A processor MAY perform partial loads (e.g., resolve only the first Definition + a Component for a quick preview).

### 6.2 Conformance Fixtures

This specification's normative conformance corpus lives at `tests/conformance/fixtures/bundle/`:

| Fixture | Posture | Proves |
|---|---|---|
| `bundle-definition-only.json` | positive | Minimum valid manifest (single-element `definitions[]`) |
| `bundle-full-singles.json` | positive | Every optional single-cardinality sibling populated + plural slots |
| `bundle-with-locales-and-mappings.json` | positive | Array-cardinality siblings (locales, mappings) |
| `app-multi-definition.json` | positive | Multi-element `definitions[]` (multi-form app) |
| `app-non-form.json` | positive | Empty `definitions[]` (non-form app composing only surfaces) |
| `app-with-modules-and-sessions.json` | positive | `modules: ModuleRef[]` and `sessions: SessionRef[]` |
| `app-with-data-sources-v2-1.json` | positive | `$formspecBundle: "2.1"` admits `dataSources[]` sibling references |
| `app-with-components-v2-2.json` | positive | `$formspecBundle: "2.2"` admits `components[]` sibling references and continues to admit `dataSources[]` |
| `app-with-screeners-v2-3.json` | positive | `$formspecBundle: "2.3"` admits `screeners[]` sibling references and continues to admit `dataSources[]` and `components[]` |
| `invalid-missing-definition.json` | negative | Schema rejects manifest without `definitions[]` |
| `invalid-duplicate-locale-tag.json` | negative | Semantics rejects duplicate `locales[].locale` |
| `invalid-duplicate-mapping-handle.json` | negative | Semantics rejects duplicate `mappings[].handle` |
| `invalid-duplicate-component-handle.json` | negative | Semantics rejects duplicate `components[].handle` |
| `invalid-component-default-handle-conflict.json` | negative | Semantics rejects singular `component` plus `components[].handle: "default"` |
| `invalid-id-equals-sibling-url.json` | negative | Semantics rejects manifest `id` colliding with any sibling URL |
| `invalid-unknown-property.json` | negative | Closed schema rejects unknown top-level property |
| `invalid-bad-version.json` | negative | Schema rejects non-SemVer `version` |
| `invalid-formspec-bundle-1-0.json` | negative | Schema rejects retired `$formspecBundle: "1.0"` (BREAKING per §2.2 / ADR 0150 §11.2) |
| `invalid-data-sources-in-2-0.json` | negative | Schema rejects v2.1+ `dataSources[]` on a `$formspecBundle: "2.0"` manifest |
| `invalid-components-in-2-1.json` | negative | Schema rejects v2.2-only `components[]` on a `$formspecBundle: "2.1"` manifest |
| `invalid-screeners-in-2-2.json` | negative | Schema rejects v2.3-only `screeners[]` on a `$formspecBundle: "2.2"` manifest |
| `invalid-duplicate-screener-url.json` | negative | Semantics rejects duplicate `screeners[].url` |

A conforming implementation MUST process every fixture in this corpus and produce the documented posture.

The static fixture corpus exercises every §6.1 rule that a processor can verify against a single document (rules 1, 2, 3, 5, 7, 8, 9, 10, 11). Rule 4 -- §5.3 sibling-pin consistency -- and rule 6 -- §5.5 module coherence -- require the processor to load the named sibling documents and inspect their discriminators, versions, `targetDefinition` / `targetSurfaceRoutes[]`, and `modules[]` declarations. Rule 10 gates the `screeners[]` association source; AppGraphValidator conformance fixtures exercise §5.4 surface-target resolution after loading associated Screeners and Surfaces. These are **online checks**: no static manifest fixture can supply its own siblings. Conformance suites that exercise rules 4 + 6 and §5.4 MUST stub or load the sibling-resolution seam (loaders are §6.3 out of scope for v2).

### 6.3 Out of Scope for v2

The following are explicitly NOT part of this v2 conformance:

- A canonical manifest-loader implementation (Rust crate, TS module, Python loader). App Manifest is a declarative envelope with no business logic; schema validation plus the §6.1 processor rules are sufficient. Loader implementations land when consumers (renderer, Studio, MCP) need them.
- Cross-sibling consistency beyond §5.3/§5.5 and the §5.4 Screener surface-target check (e.g., verifying that a Component's `actionRef` resolves against the manifested Response Actions document). That verification is the responsibility of each sibling's own spec.
- Manifest composition (a manifest that references another manifest). Manifests MUST compose siblings only.
- Diff and merge semantics for manifest versions. May be added in a future minor version.
- Data Sources loading, source payload fetch/cache behavior, and source-to-slot resolution. App Manifest v2.1+ names Data Sources catalogs; `ArtifactResolver` and `AppGraphValidator` own runtime resolution in later gates.
- Component route resolution, duplicate route-claim detection, fake `targetDefinition` rejection, and graph-wide node identity. App Manifest v2.2 names Component membership handles; `AppGraphValidator` owns route and node-identity enforcement in later gates.
- Screener evaluation, runtime routing, production route activation, TraceIndex generation, and host authorization. App Manifest v2.3 names Screener association handles; `ArtifactResolver` loads the associated Screener documents, and `AppGraphValidator` owns source conformance for `surface:<route-id>` targets against loaded Surfaces.
