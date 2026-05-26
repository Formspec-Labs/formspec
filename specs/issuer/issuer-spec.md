---
title: Formspec Issuer Specification
version: 1.0.0-draft.1
date: 2026-05-22
depends_on:
  - specs/core/spec.md
  - specs/registry/extension-registry.md
  - specs/ontology/ontology-spec.md
  - specs/locale/locale-spec.md
  - specs/core/references-spec.md
  - specs/audit/respondent-ledger-spec.md
---

# Formspec Issuer Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-21
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 - A JSON-Native Declarative Form Standard

---

## 1. Status of This Document

This document is a **Draft** companion specification to the
[Formspec v1.0 Core Specification](../core/spec.md). It defines the Formspec
Issuer Document format: a sidecar JSON document declaring the organization,
program, department, or individual asking the respondent to complete a form.

Issuer is respondent-facing identity data. It is not Theme, Locale, References,
or Ontology content. Implementors are encouraged to experiment with this draft,
but MUST NOT treat it as stable for production use until a 1.0.0 release is
published.

## 2. Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT",
"SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and
"OPTIONAL" in this document are to be interpreted as described in
[BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in
ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as
defined in [RFC 3986]. Language tags follow BCP 47.

Terms defined in the Formspec v1.0 core specification, including *Definition*,
*Response*, *FEL*, *Theme*, and *conformant processor*, retain their
core-specification meanings throughout this document unless explicitly
redefined.

Additional terms:

- **Issuer** - The organization, department, program, or individual asking the
  respondent to complete the form. Issuer identity is displayed to the
  respondent and pinned in the Response when resolved.
- **Issuer Document** - A JSON document conforming to this specification.
- **Publisher** - The party that maintains a Registry or Ontology sidecar. A
  Publisher and an Issuer may be the same legal entity, but they are distinct
  roles.
- **Party** - The shared base shape in `common.schema.json#/$defs/Party` for
  name, identifier, homepage, and contact points.
- **Host override** - An Issuer supplied by the deployment host at render time,
  overriding the Definition-declared Issuer.
- **Displayed Issuer** - The resolved Issuer that was shown at submit time and
  recorded in Response `displayedIssuer`.

This specification uses "Issuer" only for respondent-facing form identity. It
MUST NOT be confused with WOS identity-attestation `attestationProvider` values
that may be informally called the issuer of an identity proof.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119

---

## 3. Bottom Line Up Front

<!-- bluf:start file=issuer-spec.bluf.md -->
- This document defines the Formspec Issuer Document - a sidecar declaring who is asking the form as respondent-facing chrome identity.
- Cardinality is inverse to Locale, References, and Ontology: one Issuer publishes many Definitions; Definitions point OUT via `definition.issuer`.
- The shared `Party` base (`common.schema.json#/$defs/Party`) collapses Registry/Ontology Publisher duplication while keeping Issuer and Publisher roles distinct.
- Resolution cascade: host override > Definition declaration > unbranded fallback. Response `displayedIssuer` pins the resolved Issuer at submit time inside the signed-payload preimage.
- This BLUF is governed by `schemas/issuer.schema.json`; generated schema references are the canonical structural contract.
<!-- bluf:end -->

## 4. Introduction

### 4.1 The Gap

A Formspec Definition can describe what a form asks, how to validate it, how to
render it, and how to translate it. It cannot, by itself, declare who is asking.

The only core fields that touch organizational identity are `title` and
`description`, both of which are free prose. They do not provide a structured
place for legal name, department, jurisdiction, logo, support contact, or parent
agency. Renderers therefore omit issuer identity, hard-code it per deployment,
or create incompatible `x-*` conventions.

Issuer Documents provide one structured artifact for respondent-facing
identity. A city agency can author its identity once and reference it from many
forms. A model federal Definition can remain unchanged while state deployment
hosts inject state-specific identity. A small organization or individual can
embed an Issuer inline in one Definition without operating a separate sidecar
URL.

### 4.2 Who Benefits

Respondents benefit because the first screen can show who is asking, what parent
organization that Issuer belongs to, and how to contact support.

Organizations publishing many forms benefit because renames, logo changes, and
support-channel updates happen in one Issuer Document instead of in every
Definition.

Form-template publishers benefit because one Definition can be deployed under
many local issuers without forking the form.

Verifiers benefit because the Response can pin the displayed Issuer at submit
time. That pin is part of the signed-payload preimage under the core
canonicalization rule.

## 5. Cardinality and Cardinal Asymmetry

Locale, References, and Ontology sidecars point IN to a target Definition
because each of those artifacts is about a specific form. Issuer has the
opposite cardinality. One Issuer can publish many Definitions, and the Issuer
exists before and after any individual Definition.

For that reason, a Definition points OUT to Issuer through `definition.issuer`.
An Issuer Document does not list every Definition it publishes. This asymmetry
is deliberate and comes from the actor model, not from an exception to the
sidecar pattern.

Issuer is also distinct from Publisher. A Registry or Ontology Publisher is
metadata about who maintains a sidecar. An Issuer is respondent-facing identity
for the party asking the form. Both roles share the `Party` base, but processors
MUST NOT collapse the roles.

## 6. Party Base

`schemas/common.schema.json` defines `Party`, `LangMap`, and `ContactPoint`
for shared identity data. Issuer extends `Party`; Registry and Ontology
Publisher shapes migrate to the same base.

`Party` provides:

| Field | Type | Notes |
|-------|------|-------|
| `name` | string or LangMap | Display name. Required for Issuer. |
| `identifier` | URI | Stable entity identifier. |
| `homepage` | URI | Public organizational homepage. Distinct from document `url`. |
| `contactPoint` | ContactPoint or ContactPoint[] | Contact information. |

`LangMap` keys are BCP 47 language tags and values are strings. This wire shape
matches JSON-LD language maps through `@container: "@language"`.

`ContactPoint` aligns with schema.org `ContactPoint` and carries
`contactType`, `email`, `telephone`, `url`, and `availableLanguage`.
`contactType` is an open string in v1. Renderers SHOULD use
`contactType: "customer support"` as the default support contact when present.

## 7. Issuer Document

An Issuer Document extends `Party` with document identity, issuer role, optional
hierarchy, jurisdiction, logo variants, and extension data.

The canonical structural contract is generated from
`schemas/issuer.schema.json`:

<!-- schema-ref:start id=issuer-top-level schema=schemas/issuer.schema.json pointers=# -->
<!-- generated:schema-ref id=issuer-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecIssuer` | `$formspecIssuer` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Sidecar version pin. |
| `#/properties/$schema` | `$schema` | <code>string</code> | no | — | — |
| `#/properties/contactPoint` | `contactPoint` | <code>composite</code> | no | — | — |
| `#/properties/defaultLanguage` | `defaultLanguage` | <code>string</code> | no | default: <code>"en"</code>; pattern: <code>^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*&#36;</code> | — |
| `#/properties/departmentName` | `departmentName` | <code>composite</code> | no | — | — |
| `#/properties/displayName` | `displayName` | <code>composite</code> | no | — | — |
| `#/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>https://formspec.org/schemas/common/1.0#/&#36;defs/Extensions</code> | — |
| `#/properties/homepage` | `homepage` | <code>string</code> | no | — | — |
| `#/properties/identifier` | `identifier` | <code>string</code> | no | — | — |
| `#/properties/jurisdiction` | `jurisdiction` | <code>object</code> | no | — | — |
| `#/properties/kind` | `kind` | <code>string</code> | yes | enum: <code>"organization"</code>, <code>"department"</code>, <code>"program"</code>, <code>"individual"</code>; critical | Issuer UI-tier role; not WOS scope-tier Organization (ADR 0146). |
| `#/properties/logo` | `logo` | <code>object</code> | no | — | — |
| `#/properties/name` | `name` | <code>composite</code> | yes | — | — |
| `#/properties/organizationName` | `organizationName` | <code>composite</code> | no | — | — |
| `#/properties/parentOrganization` | `parentOrganization` | <code>string</code> | no | — | URL of the parent Issuer document. Linear chain; no nesting. |
| `#/properties/shortName` | `shortName` | <code>composite</code> | no | — | — |
| `#/properties/url` | `url` | <code>string</code> | yes | — | Canonical URL of this Issuer document (distinct from Party.homepage). |
| `#/properties/version` | `version` | <code>string</code> | yes | pattern: <code>^(0&#124;[1-9]\d*)\.(0&#124;[1-9]\d*)\.(0&#124;[1-9]\d*)(\+sha256-[0-9a-f]{64})?&#36;</code> | Semver, optionally suffixed with +sha256-<hex> for content-hash invalidation. |
<!-- schema-ref:end -->

The schema requires `$formspecIssuer`, `url`, `version`, `name`, and `kind`.
`url` is the canonical URL of the Issuer Document itself. It is distinct from
`homepage`, which identifies the entity's public web presence.

### 7.1 Required Fields

| Field | Type | Notes |
|-------|------|-------|
| `$formspecIssuer` | const `"1.0"` | Sidecar version pin. |
| `url` | URI | Canonical URL of this Issuer Document. |
| `version` | string | Semver, optionally suffixed with `+sha256-<hex>`. |
| `name` | string or LangMap | Legal or full display name. |
| `kind` | enum | `organization`, `department`, `program`, or `individual`. |

### 7.2 Optional Identity Fields

| Field | Type | Notes |
|-------|------|-------|
| `displayName` | string or LangMap | Preferred respondent-facing name. |
| `shortName` | string or LangMap | Terse variant for narrow chrome. |
| `identifier` | URI | Stable entity identifier. |
| `homepage` | URI | Public home page for the entity. |
| `parentOrganization` | URI | URL of the parent Issuer Document. |
| `organizationName` | string or LangMap | Flat helper for parent organization display. |
| `departmentName` | string or LangMap | Flat helper for department display. |
| `jurisdiction` | object | Jurisdiction level, name, and optional code. |
| `defaultLanguage` | BCP 47 tag | Default language for plain strings. Default: `en`. |

`identifier` is a free-form URI in v1. Recommended values include ROR URIs,
Wikidata entity URIs, DID URIs, and stable HTTPS URLs controlled by the entity.

### 7.3 Optional Presentation Fields

`logo` carries displayable logo variants. `contactPoint` carries support,
accessibility, and language-line contact data through the shared `Party` shape.

Logo variant structure is generated from the schema:

<!-- schema-ref:start id=issuer-logo schema=schemas/issuer.schema.json pointers=#/properties/logo,#/$defs/LogoVariant -->
<!-- generated:schema-ref id=issuer-logo -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/logo/properties/monochrome` | `monochrome` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/LogoVariant</code> | — |
| `#/properties/logo/properties/primary` | `primary` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/LogoVariant</code> | — |
| `#/properties/logo/properties/wordmark` | `wordmark` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/LogoVariant</code> | — |
| `#/$defs/LogoVariant/properties/altText` | `altText` | <code>composite</code> | no | — | — |
| `#/$defs/LogoVariant/properties/aspectRatio` | `aspectRatio` | <code>string</code> | no | pattern: <code>^\d+:\d+&#36;</code> | — |
| `#/$defs/LogoVariant/properties/preferredBackground` | `preferredBackground` | <code>string</code> | no | enum: <code>"light"</code>, <code>"dark"</code>, <code>"any"</code> | — |
| `#/$defs/LogoVariant/properties/url` | `url` | <code>string</code> | yes | — | — |
<!-- schema-ref:end -->

All logo variants are optional. If `logo` is present, at least one of
`primary`, `wordmark`, or `monochrome` SHOULD be present. Renderers SHOULD use
`primary` in full-size and paper contexts, `wordmark` in narrow header contexts,
and `monochrome` for dark-mode or high-contrast contexts when available.

### 7.4 Extensions

`extensions` references `common.schema.json#/$defs/Extensions`. Extension keys
MUST use the `x-` prefix. Processors MUST preserve unknown extension data across
read-write round trips and MUST NOT let extensions alter core data capture,
validation, or submission semantics.

### 7.5 Kind Disambiguation

`kind: "organization"` is an Issuer role for respondent-facing chrome. It has
no relationship to WOS scope-tier Organization concepts. The two may name the
same legal entity in a deployment, but this specification does not bind them.

Processors SHOULD warn when a `department` Issuer lacks `parentOrganization`.
Processors SHOULD warn when an `individual` Issuer has `parentOrganization`.
Both cases remain renderable.

### 7.6 Jurisdiction

`jurisdiction.level` is one of `federal`, `state`, `county`, `municipal`,
`tribal`, `international`, `private`, or `individual`. `jurisdiction.name` is a
human-readable name. `jurisdiction.code` is optional.

When possible, `code` SHOULD use ISO 3166-1 alpha-2 for international
jurisdictions and ISO 3166-2 for state or province jurisdictions. County,
municipal, and tribal codes are jurisdiction-specific.

## 8. Localization

Issuer translations live inline in the Issuer Document. The Locale sidecar is
not involved.

Every string field that is visible to respondents accepts either a plain string
or a LangMap. Plain strings are interpreted in `defaultLanguage`. LangMap keys
are BCP 47 tags. Renderers resolve the requested locale using their locale
fallback rules, then fall back to `defaultLanguage` when no requested language
is available.

The LangMap shape is JSON-LD-compatible. The Issuer `@context` document defines
LangMap-valued fields as language containers, so downstream JSON-LD processors
can consume Issuer data without a Formspec-specific adapter.

## 9. Hierarchy

`parentOrganization` points to the parent Issuer Document by URL. Renderers walk
this linear chain from the primary Issuer to the root. Parent Issuers do not
contain child arrays.

Renderers MUST detect cycles. Renderers MUST bound chain depth at 8. If a parent
fetch fails or times out, the renderer MUST continue with the successfully
resolved portion of the chain and MUST NOT block form rendering. The renderer
SHOULD display a visual indicator that parent context could not be loaded. When
flat helpers are present, the renderer SHOULD use `organizationName` or
`departmentName` as display-only placeholders for the missing parent context.

An inline Issuer may still declare `parentOrganization`. Inline only means the
primary Issuer was supplied in the Definition; it does not make the chain
self-contained. Renderers MUST fetch and walk the parent chain in the same way
as for a URL-referenced Issuer.

## 10. Binding to Definition

Definition gains an optional top-level `issuer` property. The property has two
branches:

1. A full inline Issuer Document.
2. A strict URL reference object shaped exactly as `{ "url": "..." }`.

The URL-ref branch has `additionalProperties: false`, making the discriminator
unambiguous. A full Issuer-shaped object MUST validate only as the inline branch.
The URL is the fetchable Issuer Document URL. The entity's stable identity URI
lives in the Issuer Document's `identifier` field.

## 11. Resolution Cascade

Renderers resolve the effective Issuer in this order:

1. Host override.
2. Definition declaration.
3. Unbranded fallback.

The host override is a full Issuer Document or a URL to one. It is not a partial
overlay. If no host override and no Definition declaration is available, the
renderer uses unbranded fallback: the Definition `title` and `description`
without Issuer chrome.

### 11.1 Two-Chain Rule

When a host override is active, the renderer walks only the host-injected
Issuer's `parentOrganization` chain. It MUST NOT fetch, render, or merge the
Definition-declared Issuer chain. Response `displayedIssuer` captures only the
host-injected primary Issuer identity.

## 12. Host-Override Transports

Renderers MUST support two override transports.

Embed-time config object is the trusted programmatic transport. Framework
integrations, web components, and embedded shells pass an `issuerOverride`
value at construction or render time:

```ts
type IssuerSource =
  | { kind: "inline"; issuer: Issuer }
  | { kind: "url"; url: string };
```

URL query parameter is the browser transport. Browser-resident renderers honor
`?_issuer=<url-encoded-issuer-document-url>` on the form URL only when the
override URL's origin matches a deploy-time allowlist.

When both transports are present, embed-time config wins. Query-parameter
overrides are respondent-controlled and untrusted by default. Renderers MUST
ignore `?_issuer=` when no allowlist is configured and SHOULD log a warning.
Renderers MUST display a visible indicator when an allowlisted query-parameter
override supplies the displayed Issuer.

## 13. Receipt Audit Pin

Response `displayedIssuer` captures the resolved primary Issuer at submit time:

| Field | Type | Notes |
|-------|------|-------|
| `displayedIssuer.url` | URI | URL of the resolved Issuer Document. |
| `displayedIssuer.version` | string | Issuer Document version at render time. |

The Definition's authored Issuer remains available from the pinned Definition
identity (`definitionUrl` and `definitionVersion`) and the Definition content
used for validation. `displayedIssuer` captures the post-cascade Issuer that was
actually shown to the respondent.

`displayedIssuer` is a top-level Response field. Under the core "Signed
Response Payload" rule, only `authoredSignatures` is omitted from the JCS
preimage. Therefore `displayedIssuer` is automatically inside the signed-payload
digest, and no canonicalization-profile change is required.

V1 records the submit-time pin only. It does not record per-event Issuer
display in the Respondent Ledger. A long-running draft where the host override
changes mid-session records the final submit-time Issuer, not the sequence.

## 14. Caching and Version Pinning

Renderers fetch Issuer Documents over HTTP. Renderers MUST respect
`Cache-Control` and `ETag` headers. Renderers MUST NOT cache Issuer Documents
indefinitely when explicit cache headers are absent; a default max age of 3600
seconds is RECOMMENDED.

When `version` includes `+sha256-<hex>`, the renderer MUST verify fetched bytes
against the hash. A hash mismatch MUST invalidate the cached document and force
a refetch. A `version` change for the same URL MUST invalidate any cached Issuer
Document for that URL.

`parentOrganization` is version-free in v1 and resolves to the latest parent
Issuer Document. A future version may allow a pinned object shape for parent
chains.

## 15. Theme Relationship

Theme remains presentation tier. Colors, typography, spacing, layout, and chrome
placement belong in Theme. Issuer name, parent chain, logo URL, contact point,
jurisdiction, and document identity belong in Issuer.

Theme MAY define how issuer chrome is rendered, such as max logo height or
header placement. Theme MUST NOT define who the Issuer is.

## 16. Schema.org Mapping

Issuer Documents project to schema.org `Organization` and
`GovernmentOrganization` JSON-LD through the Issuer context document.

| Issuer field | schema.org equivalent |
|--------------|-----------------------|
| `name` | `schema:name` language container |
| `displayName` / `shortName` | `schema:alternateName` language container |
| `identifier` | `schema:identifier` |
| `homepage` | `schema:url` |
| `parentOrganization` | `schema:parentOrganization` |
| `organizationName` | `schema:parentOrganization` display helper |
| `departmentName` | `schema:department` display helper |
| `jurisdiction` | `schema:jurisdiction` |
| `logo` | `schema:logo` |
| `contactPoint` | `schema:contactPoint` |
| `kind` | `schema:additionalType` |

The field names avoid W3C Verifiable Credentials reserved-term collisions. The
spec uses `url` for the Issuer Document URL and `identifier` for the entity URI;
it does not use VC `id` or `issuer` fields.

## 17. Worked Examples

### 17.1 Inline Individual Issuer

```json
{
  "$formspec": "1.0",
  "url": "https://example.law/forms/intake-2026",
  "version": "1.0.0",
  "status": "active",
  "title": "New Client Intake",
  "items": [],
  "issuer": {
    "$formspecIssuer": "1.0",
    "url": "https://example.law/issuer.json",
    "version": "1.0.0",
    "kind": "individual",
    "name": "Jane Smith, Esq.",
    "identifier": "https://example.law",
    "homepage": "https://example.law",
    "contactPoint": {
      "contactType": "customer support",
      "email": "jane@example.law"
    }
  }
}
```

### 17.2 Shared Department Issuer

Definition:

```json
{
  "$formspec": "1.0",
  "url": "https://springfield.gov/forms/vax-intake",
  "version": "2.1.0",
  "status": "active",
  "title": "Vaccine Clinic Intake",
  "items": [],
  "issuer": { "url": "https://springfield.gov/health/issuer.json" }
}
```

Issuer:

```json
{
  "$formspecIssuer": "1.0",
  "url": "https://springfield.gov/health/issuer.json",
  "version": "3.0.0",
  "defaultLanguage": "en",
  "kind": "department",
  "name": {
    "en": "City of Springfield Department of Public Health",
    "es": "Departamento de Salud Publica de la Ciudad de Springfield"
  },
  "displayName": {
    "en": "Springfield Public Health",
    "es": "Salud Publica de Springfield"
  },
  "shortName": "Springfield Health",
  "organizationName": "City of Springfield",
  "departmentName": "Department of Public Health",
  "parentOrganization": "https://springfield.gov/issuer.json",
  "homepage": "https://springfield.gov/health",
  "jurisdiction": {
    "level": "municipal",
    "name": "Springfield",
    "code": "US-MA-Springfield"
  },
  "logo": {
    "primary": {
      "url": "https://springfield.gov/health/logo.svg",
      "altText": "Springfield Public Health seal",
      "aspectRatio": "1:1",
      "preferredBackground": "light"
    }
  },
  "contactPoint": [
    {
      "contactType": "customer support",
      "email": "health@springfield.gov",
      "telephone": "+1-555-555-0100",
      "availableLanguage": ["en", "es"]
    }
  ]
}
```

### 17.3 Host-Overridden Template

A federal program publishes one Definition with a federal Issuer. A state host
injects the state's Issuer at render time. The respondent sees the state chrome.
The Response still pins the Definition identity, and `displayedIssuer` pins the
state Issuer shown at submit time. No Definition fork is required.

## 18. Conformance

Conformance fixtures live under `tests/fixtures/issuer/`. A conforming Issuer
implementation SHOULD cover at least these cases:

- Inline Issuer and URL-referenced Issuer resolve equivalently when they contain
  equivalent Issuer content.
- A three-level `parentOrganization` chain resolves in order.
- Cycles in `parentOrganization` fail fast with a defined warning or error.
- A chain of depth 9 truncates at 8 with a defined warning.
- Parent fetch failure does not block form rendering.
- Inline Issuer with `parentOrganization` triggers a parent fetch.
- Embed-time host override ignores the Definition-declared Issuer.
- Query-parameter host override applies only when allowlisted.
- Embed-time host override wins over query-parameter override.
- The two-chain rule prevents chain merging.
- LangMap keys are validated as BCP 47 language tags.
- Logo variant selection is deterministic by rendering context.
- Unknown `x-*` extensions are preserved on read-write round trip.
- `displayedIssuer` is included in the signed-payload preimage.
- Publisher legacy fields validate during the migration window.
- `department` without `parentOrganization` and `individual` with
  `parentOrganization` produce warnings, not render-blocking errors.
- Issuer plus the published context projects to schema.org-compatible JSON-LD.

## 19. Security Considerations

Query-parameter overrides are respondent-controllable and can spoof branding
when applied without validation. Renderers MUST NOT apply `?_issuer=` unless the
override URL's origin matches a deploy-time allowlist. Renderers MUST visibly
indicate when query-parameter override branding was applied.

Embed-time overrides are trusted because the embedding host is the deployer.
The visible-indicator requirement does not apply to embed-time overrides.

Issuer fetches introduce remote content and cache-integrity concerns. Renderers
SHOULD verify `+sha256-<hex>` version suffixes when present and MUST refetch on
hash mismatch. Cryptographic attestation of Issuer document bytes is reserved
for future Trellis-binding work.

Implementations that also process WOS identity attestations MUST keep Issuer
separate from `attestationProvider`. The same legal entity may appear in both
roles, but the audit trail records them in distinct fields.

## 20. Non-Goals

The following are out of scope for v1:

- Cryptographic attestation of the Issuer Document itself.
- Issuer-grade verification UI.
- Multi-issuer or co-issued forms.
- Issuer wallet or Verifiable Credential integration.
- Issuer revocation lifecycle.
- Partial-overlay host override.
- Postal address as a respondent-chrome field.
- Per-form Locale override of Issuer strings.
- Per-event Respondent Ledger Issuer pinning.
- Merging host and Definition issuer chains.
- BIMI-verified logo preference.
- Issuer authoring UX and issuer-picking MCP tools.

## 21. Open Questions

The canonical Issuer JSON-LD context document is `specs/issuer/context.jsonld`
and is published at `https://formspec.org/contexts/issuer-v1.jsonld`.
Issuer Documents SHOULD reference that URL instead of embedding the context
inline.

1. Should Formspec ship a normative Issuer-to-schema.org projection tool, or is
   a crosswalk plus fixture corpus sufficient for v1?
2. Should `identifier` URI schemes be narrowed when cryptographic attestation
   arrives?
3. Should `contactPoint.contactType` stay open or converge to a controlled
   vocabulary?
4. Should authoring tools discover Issuer Documents through
   `/.well-known/formspec-issuer`?
5. Should future versions pin `parentOrganization` by `{ url, version }`?

## 22. Cross-References

- Core Definition: `specs/core/spec.md`
- Definition schema: `schemas/definition.schema.json`
- Response schema: `schemas/response.schema.json`
- Shared Party base: `schemas/common.schema.json#/$defs/Party`
- Registry Publisher migration: `specs/registry/extension-registry.md`
- Ontology Publisher migration: `specs/ontology/ontology-spec.md`
- Locale sidecar: `specs/locale/locale-spec.md`
- References sidecar: `specs/core/references-spec.md`
- Respondent Ledger boundary note: `specs/audit/respondent-ledger-spec.md`
- JSON-LD 1.1 language maps: `@container: "@language"`
- External vocabularies: schema.org `Organization`, `GovernmentOrganization`,
  `ContactPoint`; BCP 47; ISO 3166; ROR; Wikidata; W3C DIDs
