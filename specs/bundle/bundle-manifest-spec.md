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
- This document defines the Bundle Manifest -- a single authored JSON artifact that names a Formspec form by composing its Definition (REQUIRED) and optional siblings (Experience, Response Actions, Component, Theme, References, Ontology, Registry, locales[], mappings[]) at coherent versions.
- A valid Bundle Manifest requires `$formspecBundle: "1.0"`, a strict SemVer `version`, a stable form-identity `id` URL distinct from every sibling URL, and exactly one `definition` reference.
- Bundle Manifest is a pure composition envelope: no inline sidecars, no synthesis on absence, no shims on existing primary specs. Sibling absence is honored; each sibling spec's existing defaults apply (Definition-only bundles render via Definition's existing widget defaults).
- Bundle Manifest adds a forward-composition graph alongside the existing back-reference graph (each sibling's `targetDefinition` is unchanged). Reverse-discovery continues to work; bundles add discovery-without-scanning for tools that hold one.
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

A Bundle Manifest names which sibling artifacts compose a form. When a sibling slot is **absent**, that sibling's own specification rules govern -- not Bundle Manifest.

Absence MUST NOT trigger synthesis. Specifically:

- A bundle that references only `definition` MUST NOT cause a renderer, generator, or consumer to fabricate an Experience document from Definition structure. As the concept architecture note ([`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md) §6.2) warns: "Definition groups describe data structure ... Experience units describe task intent. Sometimes they align. Often they do not." Synthesizing Experience would conflate the two layers and create fake Trace coverage.
- A bundle without `component` MUST cause renderers to use Definition's existing widget-default rendering (today's pre-Experience behavior). No Component tree is synthesized; the layered absence is honored.
- A bundle without `theme` MUST cause renderers to use their built-in presentation defaults.
- A bundle without `locales` MUST cause locale resolution to fall back to Definition-embedded strings (per Locale spec rules).
- A bundle without `responseActions` MUST cause Component triggers to be unresolvable (per Component §5.19) -- which is an authoring or host-configuration error only if the Component document actually declares `ActionButton` nodes. A bundle with neither `responseActions` nor `component` has no triggers; submit happens via host UI outside Formspec's responsibility.
- A bundle without `mappings` MUST cause Response Actions effects of type `mappingExecution` to fail resolution at invocation time (a Response Actions runtime error, not a bundle-shape error).

A **Definition-only bundle** is a valid bundle and a valid form. It is the simple-form path: one Definition file plus one Bundle Manifest file, no synthesis, today's behavior with the addition of a stable form identity.

The opt-in escalation is monotone: an author starts with `definition`, adds `experience` when task intent becomes worth naming, adds `component` when widget choice becomes worth controlling, and so on. Each addition is an authored artifact, not a synthesized one.

## 5. Relationship to the Reference Graph

Sibling artifacts each carry a `targetDefinition` back-reference naming the Definition they bind to. Bundle Manifest does **not** change that back-reference graph -- it adds a forward-composition graph alongside it.

### 5.1 Forward Composition (Bundle → Siblings)

The bundle's slot-by-slot sibling references compose a form forward. A consumer that holds a Bundle Manifest can resolve every artifact needed to render or process the form without scanning a content addressable store, registry, or filesystem for documents that target a given Definition.

This is the seam Bundle Manifest adds: discovery without reverse-scanning.

### 5.2 Back-Reference Preservation (Sibling → Definition)

Every sibling document continues to carry its own `targetDefinition` (Experience, Component, Response Actions, Theme, Locale, Mapping, References, Ontology). Those back-references are unchanged. Bundle Manifest does NOT consume them; it does NOT supersede them; it does NOT generate them.

A sibling artifact remains independently valid against its own spec without ever appearing in a Bundle Manifest. The reverse-discovery path (load Definition; find siblings whose `targetDefinition.url` matches) MUST continue to work for tools that do not use Bundle Manifest.

### 5.3 Consistency Between Bundle Pin and Back-Reference

When a Bundle Manifest pins a sibling at version V, the loaded sibling document at `siblingRef.url` MUST satisfy two constraints:

1. The sibling document's own `version` MUST be compatible with the bundle's pin (`siblingRef.version`).
2. The sibling document's `targetDefinition.url` MUST equal the bundle's `definition.url`, and the sibling's `targetDefinition.compatibleVersions` MUST accept the bundle's `definition.version`.

A bundle that names a sibling whose back-reference targets a different Definition is a bundle-resolution error.

### 5.4 No Shim Path

This specification does NOT introduce a `definition.bundle` field, a `Bundle.legacyDefinitionOnly` flag, or any backwards-compat alias on existing primary specs. Bundle Manifest is a peer primary artifact; existing artifacts are unchanged. Implementations migrating to Bundle Manifest add bundle files alongside existing reference graphs; they do not modify existing schema shapes.

## 6. Conformance

### 6.1 Conformance Targets

A **Bundle-Aware Processor** MUST:

1. Validate the Bundle Manifest document against `schemas/bundle-manifest.schema.json`.
2. Enforce array-uniqueness: every `locales[].locale` MUST be unique within `locales`; every `mappings[].handle` MUST be unique within `mappings`.
3. Enforce identity distinctness: the bundle's `id` MUST NOT equal any sibling `url` in the same bundle (singles or array entries; see §2.1).
4. When resolving siblings: load each sibling URL, verify the sibling document's discriminator matches the slot per the §3.4 table, and verify §5.3 sibling-pin consistency.
5. Honor §4 Absence Semantics. Absent siblings MUST NOT be synthesized.

A processor MAY perform partial loads (e.g., resolve only `definition` and `component` for a quick preview).

### 6.2 Conformance Fixtures

This specification's normative conformance corpus lives at `tests/conformance/fixtures/bundle/`:

| Fixture | Posture | Proves |
|---|---|---|
| `bundle-definition-only.json` | positive | Minimum valid bundle (definition-only) |
| `bundle-full-singles.json` | positive | Every optional single-cardinality sibling populated |
| `bundle-with-locales-and-mappings.json` | positive | Array-cardinality siblings (locales, mappings) |
| `invalid-missing-definition.json` | negative | Schema rejects bundle without `definition` |
| `invalid-duplicate-locale-tag.json` | negative | Semantics rejects duplicate `locales[].locale` |
| `invalid-duplicate-mapping-handle.json` | negative | Semantics rejects duplicate `mappings[].handle` |
| `invalid-id-equals-sibling-url.json` | negative | Semantics rejects bundle `id` colliding with any sibling URL |
| `invalid-unknown-property.json` | negative | Closed schema rejects unknown top-level property |
| `invalid-bad-version.json` | negative | Schema rejects non-SemVer `version` |

A conforming implementation MUST process every fixture in this corpus and produce the documented posture.

### 6.3 Out of Scope for v1

The following are explicitly NOT part of this v1 conformance:

- A canonical bundle-loader implementation (Rust crate, TS module, Python loader). Bundle Manifest is a declarative envelope with no business logic; schema validation plus the §6.1 processor rules are sufficient. Loader implementations land when consumers (renderer, Studio, MCP) need them.
- Cross-sibling consistency beyond §5.3 (e.g., verifying that a Component's `actionRef` resolves against the bundled Response Actions document). That verification is the responsibility of each sibling's own spec.
- Bundle composition (a bundle that references another bundle). Bundles MUST compose siblings only.
- Diff and merge semantics for bundle versions. May be added in a future minor version.
