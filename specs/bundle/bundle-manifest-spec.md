---
title: Formspec Bundle Manifest Specification
version: 1.0.0-draft.1
date: 2026-05-22
status: draft
---

# Formspec Bundle Manifest Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-22
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 -- A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **draft specification**. It is a companion to the [Formspec v1.0 core specification](../core/spec.md) and does not modify or extend the core processing model. Implementors are encouraged to experiment with this specification and provide feedback, but MUST NOT treat it as stable for production use until a 1.0.0 release is published.

This spec was promoted from the concept architecture note [`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md) (Open Question §11.5 "Bundle Manifest"). It resolves the authoring-bundle promotion gate from §9 of that note.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as defined in [RFC 3986].

Terms defined in the Formspec v1.0 core specification retain their core-specification meanings throughout this document unless explicitly redefined.

Additional terms:

- **Bundle Manifest** -- A JSON document conforming to this specification, identified by `$formspecBundle: "1.0"`. The author-facing single composition envelope above a Formspec form.
- **Sibling reference** -- An entry inside a Bundle Manifest that names one composed artifact by canonical URL and (optional) version pin or range.
- **Definition-only bundle** -- A Bundle Manifest whose sole sibling reference is `definition`. Renders via Definition's existing widget defaults; no Experience or Component is synthesized.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- bluf:start file=bundle-manifest-spec.bluf.md -->
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

The Formspec architecture composes a form from up to ten authored siblings -- Definition, Experience, Response Actions, Component, Theme, Locale, Mapping, References, Ontology, Registry -- plus generated artifacts (Trace) and response-scoped artifacts (Response, Respondent Ledger, ValidationReport, Intake Handoff, Determination Record). Each sibling carries its own URL, its own version, and its own `targetDefinition` back-reference.

This composition graph works when a renderer or generator already knows which siblings to load. It fails for the author opening a form for the first time: a form is implicit in the union of artifacts that target a Definition, but no single artifact names the form. There is no stable URL the author can publish, no single file Studio can open, no version a deployer can pin.

This specification defines the **Bundle Manifest**: a single authored JSON artifact that names a Formspec form as one thing. The Bundle Manifest references exactly one Definition (REQUIRED) and any combination of optional siblings, each by canonical URL and (optional) version. The bundle's own `id` is the stable form identity URL; the bundle's `version` is the coherent published-form version that pins sibling versions.

The Bundle Manifest is a **pure composition envelope**. It MUST NOT:

- inline sibling document bodies (a `locale` reference names a URL; the locale strings live at that URL),
- synthesize absent siblings (a bundle that references only `definition` does NOT cause a renderer to fabricate an Experience document; see §4 Absence Semantics),
- override sibling semantics (sibling versions, sibling identities, and sibling spec rules are unchanged by being named in a bundle),
- replace Definition as the core executable model (Definition stays the source of behavior; bundle is the optional envelope above it).

A Definition without a Bundle Manifest remains a valid Formspec form. The Bundle Manifest is the **opt-in** seam between architectural breadth (many specs) and authoring ergonomics (open one thing).

## 2. Identity and Versioning

### 2.1 Bundle Identity

A Bundle Manifest MUST carry an `id` property whose value is a stable canonical URL identifying the form. Two Bundle Manifests with the same `id` SHOULD be different versions of the same form; an `id` change SHOULD be reserved for forms that have diverged enough to no longer share a continuous evolution.

The `id` MUST be distinct from every sibling URL referenced in the same bundle (`definition.url`, every optional single-cardinality slot's `url`, and every entry in `locales[]` / `mappings[]`). A bundle's `id` is the form's identity; a sibling's URL is an artifact's identity. Collapsing them would mean the form and one of its parts share an identity, which breaks publication and Trace.

### 2.2 Bundle Version

A Bundle Manifest MUST carry a `version` property whose value is a strict SemVer 2.0.0 string (no leading zeros in numeric identifiers, no empty pre-release identifiers, no leading-zero numeric pre-release identifiers). The bundle version represents the **coherent published form**: bumping any sibling version SHOULD bump the bundle version. Producers MAY publish multiple bundle versions for the same `id` (different SemVer values); consumers MAY pin against any.

The Bundle Manifest spec itself is versioned via `$formspecBundle`, which MUST equal `"1.0"` for documents conforming to this spec. The `$formspecBundle` value tracks the major.minor of the canonical schema `$id` (`https://formspec.org/schemas/bundleManifest/1.0`); future minor versions (`1.1`, `1.2`) introduce new sibling slots while remaining backward compatible with `1.0` documents that do not use them, and a major bump (`2.0`) signals a breaking shape change.

### 2.3 Sibling Version Pinning

Each sibling reference -- `definition` and every populated optional sibling -- carries an optional `version` field. When present, `version` MUST be either:

- an **exact** SemVer 2.0.0 string (e.g., `"1.2.0"`), OR
- a **range expression** in the form Definition's `targetDefinition.compatibleVersions` accepts (e.g., `">=1.0.0 <2.0.0"`, `"^1.0.0"`).

When `version` is omitted, the bundle accepts any compatible-by-major sibling version (equivalent to `"^<sibling-current-major>"`).

Producers SHOULD pin exact versions in published bundles. Range expressions are RECOMMENDED for development and prerelease workflows.

A bundle's sibling pin SHOULD be a subset of the sibling artifact's own `targetDefinition.compatibleVersions` range. Bundles MUST NOT widen a sibling's compatibility envelope.

The bundle's top-level `version` is shape-validated as strict SemVer because it pins the published-form identity (one row in a release catalog). Per-`SiblingRef.version` is shape-validated only as a non-empty string because it carries the broader "exact or range" grammar described above; range-expression validation is the responsibility of the sibling resolution step, not the schema.

## 3. Members

### 3.1 Required Member

| Member | Type | Cardinality | Description |
|---|---|---|---|
| `definition` | `SiblingRef` | exactly one | The Definition this bundle composes. Bundle MUST reference exactly one Definition. |

### 3.2 Optional Single-Cardinality Members

Each MAY appear at most once.

| Member | Type | Composes |
|---|---|---|
| `experience` | `SiblingRef` | Task intent (Experience companion spec) |
| `responseActions` | `SiblingRef` | Form-scoped action orchestration |
| `component` | `SiblingRef` | Concrete UI tree |
| `theme` | `SiblingRef` | Visual tokens and presentation defaults |
| `references` | `SiblingRef` | External resource attachments |
| `ontology` | `SiblingRef` | Concept metadata |
| `registry` | `SiblingRef` | Option-set / token enrichment |

### 3.3 Optional Array-Cardinality Members

Each MAY appear at most once as a container. Each container holds one or more entries (`minItems: 1`); entries are distinguished by a member-specific key that MUST be unique within the array.

| Member | Item Type | Per-entry Key | Description |
|---|---|---|---|
| `locales` | `LocaleRef` | `locale` (BCP47 tag) | One Locale document per supported locale. |
| `mappings` | `MappingRef` | `handle` (slug) | One Mapping document per named handle. Response Actions and other consumers resolve `mappingRef` against this handle. |

### 3.4 SiblingRef, LocaleRef, MappingRef Shapes

All sibling references share a `url` (required, URI) and optional `version` (SemVer or range expression). Array-member item types add a per-entry key:

- `LocaleRef = SiblingRef + { locale: BCP47 }`
- `MappingRef = SiblingRef + { handle: slug }`

`SiblingRef.url` MUST resolve to a single sibling artifact of the expected type. A bundle-aware processor SHOULD verify that the loaded artifact's discriminator matches the bundle slot. The discriminator names are slot-specific:

| Bundle slot | Loaded-document discriminator |
|---|---|
| `definition` | `$formspec` (the Definition root carries the unqualified discriminator) |
| `experience` | `$formspecExperience` |
| `responseActions` | `$formspecResponseActions` |
| `component` | `$formspecComponent` |
| `theme` | `$formspecTheme` |
| `references` | `$formspecReferences` |
| `ontology` | `$formspecOntology` |
| `registry` | `$formspecRegistry` |
| `locales[]` | `$formspecLocale` |
| `mappings[]` | `$formspecMapping` |

The Definition naming asymmetry (`$formspec` vs every other sibling's `$formspec<Type>`) is inherited from the Definition core spec and is not adjusted by this spec. Mismatched discriminators are a bundle-resolution error, not a bundle-shape error.

Each Ref shape MAY carry `x-*` extension properties (e.g., `x-lockfileHash`, `x-cachedAt`) for tooling-specific per-reference metadata; processors MUST ignore unknown `x-*` properties when resolving siblings.

### 3.5 Closed Property Surface

The Bundle Manifest schema declares `additionalProperties: false`. New sibling slots require a Bundle Manifest schema version bump (e.g., `$formspecBundle: "1.1"`). The closed surface keeps bundle resolution deterministic.

Authors MAY use `x-*` extension properties on the top-level object for tooling-specific metadata. Bundle-aware processors MUST ignore unknown `x-*` properties when resolving siblings.

### 3.6 Excluded Members (Runtime / Generated Artifacts)

The following artifacts MUST NOT appear in a Bundle Manifest. They are response-scoped or generated, and are produced from a bundle at runtime rather than composing one:

- Response, Validation Report, Determination Record
- Respondent Ledger, Intake Handoff
- Trace

## 4. Absence Semantics

<!-- §4 prose lands in Task 16 -->

## 5. Relationship to the Reference Graph

<!-- §5 prose lands in Task 17 -->

## 6. Conformance

<!-- §6 prose lands in Task 18 -->
