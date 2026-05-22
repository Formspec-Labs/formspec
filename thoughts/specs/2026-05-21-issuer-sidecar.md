# Issuer Sidecar Spec

**Date:** 2026-05-21
**Status:** Draft
**Depends on:** Definition Schema, Response Schema, Registry Schema, Ontology Schema, existing `schemas/common.schema.json`
**Extends:** `schemas/common.schema.json` with `$defs/Party`, `$defs/LangMap`, `$defs/ContactPoint`; reuses existing `$defs/Extensions`
**Migrates:** `Publisher` shape in Registry and Ontology to extend the shared `Party` base (deprecation window: two minor versions)
**Sibling to:** References, Locale, Ontology sidecars (with one deliberate structural difference — see "Why this binds differently")

---

## The Gap

A Formspec Definition today can say what the form asks, how to validate it, how to render it, and how to translate it. It cannot say **who is asking**.

The only fields that touch organizational identity are `title` (a form name) and `description` (free prose). There is no structured place to put:

- The legal name of the organization sending the form
- The department within that organization
- The jurisdictional context (city / county / state / federal)
- The logo a respondent would recognize, in the variant appropriate to context
- The support contact when something goes wrong
- The parent agency the department reports into

Every renderer today either omits this entirely, hard-codes it per deployment, or invents an `x-issuer` convention that other renderers can't read. The same City of Springfield Department of Public Health publishing fifty forms repeats itself fifty times, or doesn't, depending on who built the page.

This is the kind of thing that should be one structured artifact, authored once, referenced everywhere it applies — and shaped so the audit trail records which Issuer actually rendered.

---

## Glossary — "Issuer" disambiguation

"Issuer" carries two distinct meanings across the formspec-stack. This spec uses it in the first sense; readers MUST NOT conflate.

| Term | Meaning | Where |
| --- | --- | --- |
| **Issuer** (this spec) | The organization authoring or asking the form. Respondent-facing chrome. | Issuer sidecar; `definition.issuer`; `response.displayedIssuer` |
| **`attestationProvider`** (WOS / ADR 0068 D-3.1, ADR 0140) | The identity-proofing IDP that issued the respondent's identity attestation. Receipt-internal evidence. | WOS `IdentityAttestation`; informally called "issuer of an identity proof" |

The two MAY refer to the same legal entity (a state agency running both its own forms and its own IDP) and a receipt MAY carry both, but they occupy different audit roles and must not collapse to one shape.

---

## Who Benefits

### Respondents

A respondent opening a form needs to know in the first second:

- Who is asking (the immediate sender — the department they're dealing with)
- What organization that's part of (the parent — the city, the agency, the company)
- That it's legitimate (the logo and contact match what they expect)

Today they get a title and prose. With an Issuer sidecar they get a recognizable brand chain — *Vaccine Clinic Intake*, *Department of Public Health*, *City of Springfield* — rendered consistently across every form that organization publishes, with a support contact that doesn't change when the form changes.

### Organizations publishing many forms

A municipal agency that publishes fifty forms wants to author its identity **once**. When the agency renames, when the logo changes, when the support email moves, the change should propagate to every form without re-publishing every Definition.

A sidecar with its own URL and version line achieves this. Every form references the same Issuer URL. The Issuer document evolves on its own cadence.

### Form-template publishers (one form, many deployers)

A federal program publishes a model intake form. Fifty states deploy it. Each state needs to render its own branding — its seal, its support contact, its jurisdictional context — without forking the form definition.

Today this requires forking. With an Issuer sidecar and host-override resolution, the federal program's Definition declares the federal Issuer; each state's deployment host injects the state's Issuer. The Definition stays untouched; the rendered chrome reflects the deployer; the receipt records both.

### Individuals authoring a single form

A lawyer sends a custom intake form to a new client. A doctor sends a patient questionnaire. A small nonprofit publishes one annual survey. They don't have an org chart. They are the issuer.

The same sidecar shape supports an inline Issuer fragment embedded directly in the Definition — one place, one document, no separate fetch.

### Form-authoring tools (downstream)

A visual form authoring environment can offer a real "pick an issuer" experience: select from issuers the user has access to, manage the organization chart, edit logos, configure jurisdictions. The shared `Party` base (below) means the same picker resolves Publishers on Registry/Ontology docs and Issuers on Definitions — one party model, two roles.

### Verifiers (future)

When a form's authenticity matters — receipts, signed records, audit chains — the Issuer document gives the cryptographic substrate something concrete to attest. "This Issuer document, with this hash, was bundled in this receipt and displayed at sign time." The receipt-side hook (`displayedIssuer` on Response) lands in v1 and is automatically inside the signed-payload preimage by the existing omission rule (see "Receipt-side audit pin"). The cryptographic attestation work lands later as a sibling `formspec-issuer-trellis-binding` crate without spec change.

### Search / discovery / knowledge graphs (interop dividend)

Issuer documents are shape-compatible with projection as schema.org `Organization` / `GovernmentOrganization` JSON-LD. An agency publishing Issuer docs gets indexable organizational identity for free; tooling that already understands schema.org (search engines, ROR exports, open-data portals) can consume them with no Formspec-specific adapter. The `@container: "@language"` convention on LangMap fields is JSON-LD-valid; see "Localization" and "Schema.org Mapping."

---

## Issuer vs Publisher — different actors, shared base

Registry §2.1 and Ontology §2.2 each define a `Publisher` shape — *who maintains a sidecar document*. The IRS may consume a References doc published by FHIR-Gov Consortium and an Ontology doc published by W3C. Three actors in one form: IRS is the Issuer (asking the respondent); FHIR-Gov and W3C are Publishers (maintaining artifacts the form depends on). They are not the same role and they should not collapse to one shape.

They share a thin base — every party has a name, may have a stable identifier, may have a homepage, may carry contact points. This proposal factors that base as **`Party`** added to the existing `schemas/common.schema.json`. Publisher in Registry and Ontology migrates to extend `Party`; Issuer extends `Party` with respondent-chrome fields. The duplication that exists today (Publisher defined twice) collapses to one source of truth.

---

## Why this binds differently from other sidecars

Locale, References, and Ontology sidecars all declare `targetDefinition.url` — the sidecar points IN to the Definition. That direction is correct for those artifacts: each one is *about* a specific Definition. One Locale per language per form. One References doc per form. The sidecar's existence is justified by the Definition.

Issuer is the inverse cardinality. One Issuer publishes many forms. Asking the City of Springfield to enumerate `targetDefinitions[]` of all fifty forms it publishes — and re-publish the Issuer doc every time it ships a new form — inverts the dependency. The Issuer exists prior to and outlives any individual form.

So Definition points OUT to Issuer (`definition.issuer: { url }`), not the other way around. This matches Theme (one Theme can dress many Definitions) and contradicts Locale/References/Ontology (one of them per Definition).

The asymmetry is deliberate and lives in the cardinality of the underlying actor, not in spec inconsistency.

---

## Approaches Considered

### Embed inside Theme

Add a `branding` block to the Theme spec. White-label works naturally because Theme is already host-overrideable.

Rejected because Theme is presentation-tier — colors, typography, spacing. Issuer identity is data: who is legally asking, what jurisdiction, what contact chain. Paper renderers, verifiers, and exporters would have to dig into Theme for non-presentational facts. The Theme/Definition bright line collapses.

### Embed inline in Definition only

Add an `issuer` block directly to the Definition schema. Simplest.

Rejected because of repetition (every form by the same agency repeats the same content), rename pain (an organizational rename forces re-publishing every Definition), and the lack of a host-override mechanism. Wrong fit for the 1:N case where one form template is deployed by many issuers.

### Subsume Publisher into Issuer

Promote the existing Registry/Ontology `Publisher` to be the same shape as Issuer.

Rejected. "Publisher" is invisible metadata on a doc nobody renders; "Issuer" is the headline a respondent sees. The `Party` base captures the structural overlap without flattening the semantics.

### Locale `$issuer.*` reserved-key extension for translations

Carry Issuer translations through per-form Locale documents using a `$issuer.*` reserved-key prefix.

Rejected. Locale docs bind to a Definition via `targetDefinition`; Issuer is N:Definition. Translating one Issuer would force copying `$issuer.*` keys into all fifty of the agency's per-form Locale docs — defeating the entire "author once" story. Translations live inline on the Issuer doc instead, using JSON-LD-compatible `@container: @language` semantics.

### Sidecar with shared `Party` base, JSON-LD-compatible inline language maps — selected

Standalone Issuer document, referenceable by URL, hierarchical via parent references. Definition either embeds an Issuer inline or references it by URL. Host may override at render time. Multilingual via inline language maps (JSON-LD `@container: @language` convention). `Party` factored to the shared `common.schema.json`; Publisher migrates to extend it. Receipt records the resolved Issuer (inside the signed payload by the existing omission rule).

---

## Design

### `Party` base ($defs in existing `common.schema.json`)

Added to the existing `schemas/common.schema.json` as `$defs/Party`. Inherits the convention of every other shared $def in that file. Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string or LangMap | Display name (required) |
| `identifier` | URI | Stable entity identifier — see "Identifier values" below |
| `homepage` | URI | Public organizational homepage (distinct from any document URL) |
| `contactPoint` | ContactPoint or ContactPoint[] | Contact info; single-object form preserves ergonomics for the individual case |

`LangMap` and `ContactPoint` shapes are also new `$defs` in `common.schema.json`. The `extensions` block on Issuer (below) `$ref`s the existing `$defs/Extensions` rather than redefining it.

#### `LangMap` shape

```json
"LangMap": {
  "type": "object",
  "propertyNames": {
    "pattern": "^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$",
    "description": "BCP 47 language tag (e.g., 'en', 'es-MX', 'zh-Hant-TW')"
  },
  "additionalProperties": { "type": "string" }
}
```

Matches the BCP 47 pattern already used by Locale spec. Schema validation rejects invalid tags (e.g., `"english"`). JSON-LD-compatible per `@container: "@language"` convention; an `@context` published alongside the schema makes any LangMap-valued field a valid JSON-LD language container.

#### `ContactPoint` shape

```json
"ContactPoint": {
  "type": "object",
  "properties": {
    "contactType":       { "type": "string" },
    "email":             { "type": "string", "format": "email" },
    "telephone":         { "type": "string" },
    "url":               { "type": "string", "format": "uri" },
    "availableLanguage": { "type": "array", "items": { "type": "string", "pattern": "^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$" } }
  }
}
```

Aligned with schema.org `ContactPoint` (which inherits vCard semantics). `contactType` is open (e.g., `"customer support"`, `"accessibility"`, `"language line"`). v1 renderers SHOULD honor `contactType: "customer support"` as the default support contact; future spec versions MAY narrow the vocabulary.

#### Identifier values

`identifier` is a free-form URI in v1. RECOMMENDED canonical values where they apply:

- `https://ror.org/<id>` for ROR-registered orgs (universities, research orgs, many government agencies — ~110k entities covered, free, permanent)
- `https://www.wikidata.org/entity/Q<n>` for Wikidata-covered orgs
- `did:web:<domain>` / `did:key:<key>` / `did:plc:<id>` for DID-using orgs (resolution out of scope for v1)
- `https://<org-domain>` for orgs publishing at their own domain (the cheapest stable identifier)

Renderers and authoring tools MAY fetch the `identifier` URL for metadata enrichment. Future spec versions may require a registered scheme subset when cryptographic attestation arrives.

### Publisher migration

`Publisher` in `schemas/registry.schema.json` and `schemas/ontology.schema.json` redefines to extend `$defs/Party`. Legacy fields handled as follows:

- **Legacy `Publisher.url`** (currently "Organization home page URI") aliases to `Party.homepage`. New documents SHOULD use `homepage`; legacy `url` continues to validate for two minor versions, then becomes invalid.
- **Legacy `Publisher.contact: string`** is structurally incompatible with `Party.contactPoint: ContactPoint`. Resolution: the legacy `contact: string` field is preserved on Publisher (NOT promoted to Party) and DEPRECATED for two minor versions. New documents SHOULD use `contactPoint`. Renderers SHOULD prefer `contactPoint` when present and fall back to legacy `contact` otherwise.

This collapses today's duplication (Publisher defined twice) and prepares the migration path for future party-shaped concepts (Custodian, Originator, Sender). The Rust parser (`crates/formspec-core/src/registry_client/`), lint mirror schemas (`crates/formspec-lint/schemas/`), and generated TypeScript types (`packages/formspec-types/src/generated/registry.ts`) all carry the migration.

### Issuer document

A new sidecar spec and schema:

- `specs/issuer/issuer-spec.md`
- `schemas/issuer.schema.json`

Issuer extends `Party` with document-identity, sidecar-version, and respondent-chrome fields.

**Required:**

| Field | Type | Notes |
| --- | --- | --- |
| `$formspecIssuer` | const `"1.0"` | Sidecar version pin. Matches Locale/References/Ontology convention |
| `url` | URI | Canonical URL of *this Issuer document* (per Formspec sidecar convention; distinct from `Party.homepage`) |
| `version` | string | Format: semver (`MAJOR.MINOR.PATCH`), optionally suffixed with `+sha256-<hex>` for content-hash cache invalidation |
| `name` | string or LangMap | (from Party) |
| `kind` | enum | `organization \| department \| program \| individual` (see kind disambiguation below) |

**Optional identity fields:**

| Field | Type | Notes |
| --- | --- | --- |
| `displayName` | string or LangMap | Preferred display, often shorter than `name` |
| `shortName` | string or LangMap | Terse variant for mobile header |
| `identifier` | URI | (from Party) See "Identifier values" |
| `homepage` | URI | (from Party) |
| `parentOrganization` | URI | Reference to the parent Issuer doc (linear chain). Schema.org-aligned name. SHOULD be present when `kind = department`; SHOULD NOT be present when `kind = individual`. Validator warns on either violation |
| `organizationName` | string or LangMap | Flat helper; denormalized convenience |
| `departmentName` | string or LangMap | Flat helper |
| `jurisdiction` | object | `{ level, name, code? }` — see Jurisdiction below |
| `defaultLanguage` | string | BCP 47 tag (e.g., `en`, `es-MX`, `cy-GB`). Default: `en` |

**Optional presentation fields:**

| Field | Type | Notes |
| --- | --- | --- |
| `logo` | object | Variant carrier (see "Logo variants") |
| `contactPoint` | ContactPoint or ContactPoint[] | (from Party) |

**Escape:**

| Field | Type | Notes |
| --- | --- | --- |
| `extensions` | object | `$ref: "common.schema.json#/$defs/Extensions"`. Unknown `x-*` keys MUST be preserved across read-write round-trips |

#### `kind` disambiguation

The `kind: "organization"` value names the *Issuer kind* (a UI-tier label for "an org-shaped entity that is asking the respondent"). It has no relationship to the WOS scope-tier `Organization` of ADR 0146 / ADR 0068 D-1.3 (which names the product-ownership boundary). The two MAY refer to the same legal entity in a given deployment, but the spec does not bind them.

`kind`×`parentOrganization` structural constraints (validator SHOULD-warn):

- `kind: "department"` SHOULD have `parentOrganization` (an unparented department is structurally weird)
- `kind: "individual"` SHOULD NOT have `parentOrganization` (individuals are leaf nodes)
- `kind: "program"` MAY or MAY NOT have `parentOrganization` (cross-org programs have no parent; sub-programs do)

#### Jurisdiction

```json
"jurisdiction": {
  "level": "state",        // federal | state | county | municipal | tribal | international | private | individual
  "name": "Massachusetts",
  "code": "US-MA"          // optional
}
```

`code` SHOULD use ISO 3166-1 alpha-2 (`"US"`, `"CA"`, `"GB"`) for `level: international` and ISO 3166-2 (`"US-MA"`, `"GB-ENG"`, `"CA-ON"`) for `level: state`. For `level: county | municipal | tribal`, `code` MAY be a country-specific identifier (FIPS in the US, etc.) — format is jurisdiction-dependent.

#### Logo variants

```json
"logo": {
  "primary":    { "url": "...", "altText": "...", "aspectRatio": "1:1",  "preferredBackground": "light" },
  "wordmark":   { "url": "...", "altText": "...", "aspectRatio": "4:1",  "preferredBackground": "any" },
  "monochrome": { "url": "...", "altText": "...", "aspectRatio": "1:1",  "preferredBackground": "any" }
}
```

All three variants are optional; at least one SHOULD be present if `logo` is set. Renderer selects per context: tall layouts and paper render prefer `primary`; narrow headers and embed contexts prefer `wordmark`; dark-mode and high-contrast a11y modes prefer `monochrome`.

`aspectRatio` follows `^\d+:\d+$` format (validator-enforced). `preferredBackground ∈ light | dark | any`. `altText` accepts a LangMap.

### Localization — inline language maps (JSON-LD-compatible)

Every string field on Issuer (`name`, `displayName`, `shortName`, `organizationName`, `departmentName`, `logo.*.altText`) accepts either a plain string or a LangMap:

```json
"name": "City of Springfield"
```

or

```json
"name": {
  "en": "City of Springfield",
  "es": "Ciudad de Springfield",
  "fr": "Ville de Springfield"
}
```

Plain strings are interpreted in the language declared by `defaultLanguage`. LangMap keys are BCP 47 tags (schema-enforced); renderers pick per their locale fallback rules; absent the requested language, the renderer falls back to `defaultLanguage`.

**JSON-LD compatibility.** The LangMap shape is structurally identical to JSON-LD's `@container: "@language"` indexing convention. An `@context` document published alongside the Issuer schema (URL listed in Open Questions) declares `name`, `displayName`, `shortName`, `organizationName`, `departmentName`, and `logo.*.altText` as `@language`-keyed containers. The wire shape is identical; downstream JSON-LD processors (Verifiable Credentials toolchains, schema.org indexers) consume Issuer docs without an adapter.

The Locale sidecar is **not** involved. Issuer translations live in the Issuer doc.

### Hierarchy — linear chain plus flat helpers

Each Issuer document may declare `parentOrganization` pointing to its parent Issuer by URL. Renderers walk the chain from primary to root. There is no nesting (no `departments[]` array on the parent); each organizational unit owns its own document. A parent rename does not touch its children.

Flat helpers (`organizationName`, `departmentName`) let renderers and authoring tools read top-level org context cheaply without walking the chain. When both the chain and the flat helpers are present, they SHOULD agree; a validator warns rather than errors. The chain is canonical truth.

Renderers MUST detect cycles and MUST bound depth at 8.

**Parent fetch failure.** If a `parentOrganization` URL returns an error or times out, the renderer MUST continue rendering with the successfully resolved portion of the chain. It MUST NOT fail the form. It SHOULD display a visual indicator that the parent context could not be loaded. If the failed Issuer's immediate document includes `organizationName` and/or `departmentName`, the renderer SHOULD use those flat helpers as display-only placeholders for the unresolved parent.

**Inline Issuer with `parentOrganization`.** When the `issuer` property carries an inline Issuer document (Branch 1 below) that declares `parentOrganization`, the renderer MUST fetch and walk the chain exactly as it would for a URL-referenced Issuer. Inline does not imply self-contained; it means only that the immediate Issuer was not fetched separately. Cycle and depth-cap rules apply equally.

### Binding to Definition

A new optional top-level property on Definition:

```json
"issuer": {
  "oneOf": [
    { "$ref": "issuer.schema.json" },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["url"],
      "properties": { "url": { "type": "string", "format": "uri" } }
    }
  ]
}
```

The inline shape (Branch 1) covers the individual / small-organization case. The URL-ref shape (Branch 2) is strictly `{ url }` — `additionalProperties: false` makes the discriminator unambiguous. The URL is a *fetchable* Issuer document URL; the entity's own stable identifier lives in the Issuer doc's `identifier` field.

### Resolution cascade

A renderer must resolve the effective Issuer in this order:

1. **Host override** — the deployment context provides an Issuer at render time. Wins.
2. **Definition declaration** — the Issuer the Definition author embedded inline or referenced by URL.
3. **Unbranded fallback** — render `title` and `description` only.

The host override is a full Issuer document (or a URL to one). No partial overlay.

**Two-chain rule.** When a host override is active, the renderer walks ONLY the host-injected Issuer's `parentOrganization` chain. The Definition-declared Issuer and its chain are not rendered and not fetched. The `displayedIssuer` receipt field captures only the host-injected Issuer's identity. Chain-merge is a Non-Goal.

### Host-override transport

Two normative transports; renderers MUST support both:

1. **Embed-time config object.** Programmatic hosts (web-component consumers, framework integrations, embedded shells) pass an `issuerOverride: IssuerSource` parameter at construction or render. Shape:

   ```ts
   type IssuerSource =
     | { kind: 'inline', issuer: Issuer }
     | { kind: 'url',    url: string }
   ```

2. **URL query parameter.** Browser-resident renderers honor `?_issuer=<url-encoded-issuer-document-url>` on the form URL. Reserved `_issuer` prefix prevents collision with form-defined parameters.

When both are present, embed-time wins (it's a deliberate host injection; the query parameter is respondent-side and untrusted by default).

### Receipt-side audit pin

The federal-states cascade is only honest if the audit trail records *which* Issuer rendered. `schemas/response.schema.json` gains an optional `displayedIssuer` field capturing the resolved primary Issuer (the one the cascade landed on) at form-submit time:

| Field | Type | Notes |
| --- | --- | --- |
| `displayedIssuer.url` | URI | URL of the resolved Issuer doc |
| `displayedIssuer.version` | string | Issuer doc version at render time |

The Definition's declared Issuer is already pinned by `definition.url` + `definition.version` in the Response. The new field captures the *resolved* (post-cascade) Issuer. A verifier can therefore distinguish "form authored by federal program" from "form rendered by state X."

**Inside the signed payload.** `displayedIssuer` is a top-level Response field. By the existing canonicalization rule (`spec.md` §"Signed Response Payload" — only `authoredSignatures` is stripped from the JCS preimage), `displayedIssuer` is automatically inside the signed-payload digest. This is the load-bearing audit property: a host-override that swaps the displayed Issuer after signing would invalidate the signature. No spec change to the canonicalization profile is required. Future Trellis-attestation work (a sibling `formspec-issuer-trellis-binding` crate) MAY additionally attest the Issuer document bytes by content hash via `version`'s `+sha256-<hex>` suffix.

**V1 boundary.** `displayedIssuer` is the *submit-time* pin only; per-event Issuer-displayed-during-this-event is not recorded in the Respondent Ledger. A long-running draft where the host-override changes mid-session records the final Issuer at submit, not the sequence. Documented as accepted v1 limitation.

### Caching and version pinning

Renderers fetch Issuer documents over HTTP. Caching policy:

- Renderers MUST respect HTTP `Cache-Control` and `ETag` headers as floor caching policy.
- Renderers MUST NOT cache an Issuer document indefinitely in the absence of explicit cache headers — a default `max-age` of 3600 seconds (1 hour) is RECOMMENDED.
- When the `version` field includes a `+sha256-<hex>` suffix, the renderer MUST verify the content hash after fetching. If the hash does not match the cached bytes, the renderer MUST refetch, regardless of cache headers.
- A `version` change (with or without content-hash suffix) MUST invalidate any cached Issuer document for that URL.

`parentOrganization` URLs are version-free at v1; renderers fetch latest. A future spec revision MAY allow `parentOrganization` to be an object `{ url, version }` for pinned chains.

### Theme relationship

Theme is unchanged. Colors, typography, and spacing tokens stay in Theme. The logo URL lives in the Issuer document, not in Theme. Theme MAY declare *how* to render the issuer chrome (logo max height, position) via the existing token shape, but the identity itself (name, logo URL, parent chain) is data. The Theme/Definition bright line is preserved.

---

## Schema.org Mapping

Issuer documents project cleanly as schema.org `Organization` / `GovernmentOrganization` JSON-LD via this mapping. An `@context` document SHOULD be published alongside the schema (URL listed in Open Questions); renderers, indexers, and knowledge graphs consume Issuer docs without a Formspec-specific adapter.

| Issuer field | schema.org equivalent |
| --- | --- |
| `name` | `name` (LangMap → `@language`-keyed container) |
| `displayName` / `shortName` | `alternateName` (multi-valued; projection collapses both to `alternateName[]`) |
| `identifier` | `identifier` (URI; ROR / Wikidata / DID all valid) |
| `homepage` | `url` |
| `parentOrganization` | `parentOrganization` (identical) |
| `organizationName` / `departmentName` | `parentOrganization.name` / `department.name` (denormalized) |
| `jurisdiction` | `GovernmentOrganization.jurisdiction` (when `kind: agency/program` and jurisdiction-bearing) |
| `logo.primary.url` | `logo` (schema.org `ImageObject`) |
| `contactPoint` | `contactPoint` (identical — vCard-aligned) |
| `kind: "organization" \| "department" \| "individual"` | `@type: Organization | GovernmentOrganization | Person` |
| `kind: "program"` | `@type: GovernmentOrganization` (with no `parentOrganization`) or future `GovernmentService` linkage |

The crosswalk is normative. A future Issuer-as-VC story uses the same projection as the credential subject.

**Reserved-term audit (VC).** Issuer field names audited against W3C VC Data Model 2.0 reserved terms (`id`, `type`, `issuer`, `credentialSubject`, `proof`, etc.). No collisions: spec uses `url` (document URL) and `identifier` (entity URI), not `id`; `kind` is unreserved.

---

## Worked Examples

### A lawyer sending a custom intake form

```json
{
  "$formspec": "1.0",
  "url": "https://example.law/forms/intake-2026",
  "version": "1.0.0",
  "title": "New Client Intake",
  "issuer": {
    "$formspecIssuer": "1.0",
    "url": "https://example.law/issuer.json",
    "version": "1.0.0",
    "kind": "individual",
    "name": "Jane Smith, Esq.",
    "identifier": "https://example.law",
    "homepage": "https://example.law",
    "contactPoint": { "contactType": "customer support", "email": "jane@example.law" }
  }
}
```

One Definition, one inline Issuer, no separate fetch. No `parentOrganization` (an individual has no parent).

### A small nonprofit publishing its annual survey

Same shape as the individual case — inline Issuer, `kind: "organization"`, no `parentOrganization`.

### City agency publishing many forms

The agency authors one Issuer document and points every Definition at it.

Definition (one of many):

```json
{
  "$formspec": "1.0",
  "url": "https://springfield.gov/forms/vax-intake",
  "version": "2.1.0",
  "title": "Vaccine Clinic Intake",
  "issuer": { "url": "https://springfield.gov/health/issuer.json" }
}
```

Department Issuer (bilingual, ROR-identified, with logo variants):

```json
{
  "$formspecIssuer": "1.0",
  "url": "https://springfield.gov/health/issuer.json",
  "version": "3.0.0+sha256-7a9b3c2d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b",
  "defaultLanguage": "en",
  "kind": "department",
  "name": {
    "en": "City of Springfield Department of Public Health",
    "es": "Departamento de Salud Pública de la Ciudad de Springfield"
  },
  "displayName": {
    "en": "Springfield Public Health",
    "es": "Salud Pública de Springfield"
  },
  "shortName": "Springfield Health",
  "organizationName": "City of Springfield",
  "departmentName": "Department of Public Health",
  "parentOrganization": "https://springfield.gov/issuer.json",
  "identifier": "https://ror.org/01s7zjk96",
  "homepage": "https://springfield.gov/health",
  "jurisdiction": { "level": "municipal", "name": "Springfield", "code": "US-MA-Springfield" },
  "logo": {
    "primary": {
      "url": "https://springfield.gov/health/logo.svg",
      "altText": "Springfield Public Health seal",
      "aspectRatio": "1:1",
      "preferredBackground": "light"
    },
    "wordmark": {
      "url": "https://springfield.gov/health/wordmark.svg",
      "altText": "Springfield Public Health",
      "aspectRatio": "4:1",
      "preferredBackground": "any"
    },
    "monochrome": {
      "url": "https://springfield.gov/health/logo-mono.svg",
      "altText": "Springfield Public Health seal",
      "aspectRatio": "1:1",
      "preferredBackground": "any"
    }
  },
  "contactPoint": [
    {
      "contactType": "customer support",
      "email": "health@springfield.gov",
      "telephone": "+1-555-555-0100",
      "availableLanguage": ["en", "es"]
    },
    {
      "contactType": "accessibility",
      "email": "ada@springfield.gov",
      "availableLanguage": ["en"]
    }
  ]
}
```

Parent Issuer:

```json
{
  "$formspecIssuer": "1.0",
  "url": "https://springfield.gov/issuer.json",
  "version": "5.0.0",
  "kind": "organization",
  "name": "City of Springfield",
  "parentOrganization": "https://state.gov/issuer.json",
  "jurisdiction": { "level": "municipal", "name": "Springfield" }
}
```

When the city renames the health department, one document changes. Fifty Definitions stay untouched. Renderers caching the old Issuer see the version bump (and the new content hash) and refetch.

### Federal program deployed by fifty states

The Definition declares the federal program as `issuer`. Each state's deployment context injects a host-override Issuer (the state's own) via embed-time config or `?_issuer=<state-url>`.

What the respondent sees: the *state's* chrome — state seal as primary logo, state contact info, state name as immediate issuer. The federal program walks up as a parent in the chain (via the state Issuer's `parentOrganization` pointing to the federal Issuer).

What the receipt records: `definition.url` + `definition.version` pin the federal program's form authorship. `displayedIssuer.url` + `displayedIssuer.version` pin the state's Issuer that actually rendered. Both fields are inside the signed-payload preimage, so the audit trail cannot be tampered with post-signing without invalidating the signature.

No Definition forks. No Issuer duplication. Audit honest end-to-end.

---

## Files Touched

**New:**

- `specs/issuer/issuer-spec.md`
- `schemas/issuer.schema.json`
- Issuer JSON-LD `@context` document (location: Open Question 1)

**Extended (existing files):**

- `schemas/common.schema.json` — add `$defs/Party`, `$defs/LangMap`, `$defs/ContactPoint`; reuse existing `$defs/Extensions`
- `schemas/definition.schema.json` — add optional `issuer` property (`oneOf` inline vs `{url}` ref)
- `schemas/response.schema.json` — add optional `displayedIssuer` field (`{ url, version }`); falls inside signed-payload preimage by existing omission rule
- `schemas/registry.schema.json` — `Publisher` extends `$defs/Party`; legacy `url` aliases to `homepage`; legacy `contact: string` deprecated (preserved for two minors)
- `schemas/ontology.schema.json` — same Publisher migration
- `specs/core/spec.md` — add §"Issuer binding" describing Definition `issuer` property, resolution cascade, host-override transport, Theme/Issuer bright line. Cross-reference §"Signed Response Payload" for `displayedIssuer` inclusion
- `specs/audit/respondent-ledger-spec.md` — note that Response's `displayedIssuer` is the canonical submit-time pin; per-event Issuer pinning is a v1 non-goal
- `crates/formspec-core/src/registry_client/{parse.rs, types.rs, registry.rs}` — Rust Publisher parser adopts alias rules
- `crates/formspec-lint/schemas/{registry.schema.json, ontology.schema.json}` — lint mirror schemas
- `packages/formspec-types/src/generated/registry.ts` — regenerate via `npm run docs:generate`

**Unchanged:**

Theme, Locale, References, Engine APIs, Respondent Ledger event taxonomy, integrity-stack crates, formspec-trellis-bindings (forward-compatible — future `formspec-issuer-trellis-binding` sibling crate is additive).

---

## Conformance

Per Formspec's portability commitment, this spec ships with fixtures every conformant implementation must pass.

- **Inline vs ref equivalence.** A Definition with an inline Issuer renders identically to the same Definition with a URL-ref to an equivalent Issuer document.
- **Chain walk.** A three-level `parentOrganization` chain resolves correctly; renderer produces both immediate display and breadcrumb.
- **Cycle detection.** A circular `parentOrganization` chain fails fast with a defined error.
- **Depth cap.** A chain of depth 9 truncates at 8 with a defined warning.
- **Parent fetch failure degradation.** When a parent URL 404s, the renderer continues with the immediate Issuer + flat-helper display; form is not blocked.
- **Inline + chain walk.** An inline Issuer with `parentOrganization` triggers a parent fetch.
- **Host override — embed transport.** A render with embed-time `issuerOverride` ignores Definition's declared Issuer; primary chain reflects host.
- **Host override — query transport.** A render with `?_issuer=<url>` and no embed-time override and an allowlisted origin resolves to the query Issuer.
- **Host override — embed beats query.** When both are present, embed wins.
- **Query override rejected without allowlist.** Renderer ignores `?_issuer=` and logs a warning when no origin allowlist is configured.
- **Two-chain rule.** When host override is active, Definition's declared Issuer chain is not walked.
- **Version-pin discriminator.** A Definition's inline `issuer` validates against the full Issuer schema (Branch 1); `{ url }` validates against Branch 2 only; an Issuer-shaped object never matches Branch 2.
- **LangMap BCP 47 enforcement.** `name: { "english": "X" }` fails schema validation; `name: { "en": "X" }` passes.
- **LangMap fallback.** `name: "X"` with `defaultLanguage: "en"` resolves identically to `name: { "en": "X" }` for an English request. Unrequested-language fallback returns the `defaultLanguage` entry.
- **Logo variant selection.** Renderer in light mode picks `logo.primary`; renderer in dark/high-contrast picks `logo.monochrome` when present; narrow-header renderer picks `logo.wordmark` when present.
- **Extensions preservation.** Read → write of an Issuer doc with unknown `x-*` keys preserves them byte-stable.
- **Content-hash invalidation.** A cached Issuer doc whose computed SHA-256 does not match `version`'s `+sha256-<hex>` suffix is refetched.
- **Receipt audit pin inside signed payload.** A Response captured with a host-override Issuer carries `displayedIssuer.url` matching the host's; the value is inside the JCS preimage of the signed-payload digest.
- **Publisher legacy round-trip.** A Registry doc's legacy `{ name, url, contact }` shape validates (with deprecation warnings); writes back unchanged on read.
- **`kind`×`parentOrganization` constraint.** A `kind: "department"` Issuer without `parentOrganization` produces a validator warning; a `kind: "individual"` Issuer with `parentOrganization` produces a validator warning. Neither blocks render.
- **Schema.org projection.** An Issuer doc with the published `@context` parses as a valid schema.org `Organization` / `GovernmentOrganization` JSON-LD payload.

---

## Security Considerations

### Query-parameter Issuer override (`?_issuer=`)

The query-parameter override transport is respondent-controllable: anyone with the form URL can append `?_issuer=<malicious-url>` to spoof the form's branding chrome. Without validation, this is a phishing vector.

**Normative requirements:**

- Renderers that support `?_issuer=` MUST NOT apply the override unless the override URL's origin matches a deploy-time-configured origin allowlist.
- When no allowlist is configured, renderers MUST ignore `?_issuer=` and SHOULD log a warning.
- Renderers MUST display a visible indicator when the displayed Issuer was supplied via query-parameter override (e.g., "Branding provided by [host]"). This applies whether the override was allowlisted or not.

Embed-time overrides (programmatic) are trusted — the embedding host is the deployer and has implicit authority to set chrome. The visible-indicator requirement does not apply to embed-time overrides.

### Issuer document fetch integrity

`identifier` URLs and `parentOrganization` URLs are fetched by renderers. The `version` field's optional `+sha256-<hex>` suffix is the integrity mechanism for cache invalidation; renderers SHOULD verify when present. Cryptographic attestation of the Issuer document itself is reserved for a future Trellis-binding work.

### Naming overlap with identity-attestation "issuer"

Per the Glossary section, "Issuer" in this spec is distinct from the `attestationProvider` ("issuer of identity attestation") in WOS ADR 0068/0140. Implementations integrating with WOS receipts MUST NOT collapse the two. The Issuer document MAY be the same legal entity as the `attestationProvider`, but the audit trail records them in distinct fields.

---

## Non-Goals

The following are explicitly out of scope for v1. The design does not preclude them.

- Cryptographic attestation of an Issuer document (the `identifier` field reserves a binding point; the `version` content-hash format prepares the canonical bytes; future `formspec-issuer-trellis-binding` crate lands additively).
- Issuer-grade verification UI ("is this really from City of Springfield?" — requires separate link-integrity and substrate work).
- Multi-issuer or co-issued forms (belongs with multi-party form work).
- Issuer wallet or verifiable-credential integration as a credential subject (the shape is VC-compatible; the integration itself is future).
- Issuer revocation lifecycle (requires a ledger).
- Partial-overlay host override (full-document only).
- Postal address as a respondent-chrome field.
- Per-form Locale override of Issuer strings (structural mismatch).
- Per-event Respondent Ledger Issuer pin (submit-time `displayedIssuer` only).
- Two-chain merge under host override.
- BIMI-verified logo preference (future spec versions MAY honor BIMI when the Issuer's domain publishes BIMI records).
- ActivityPub federation of Issuer docs.
- Open Corporates / Common Crawl legal-entity verification.
- Studio authoring UX and MCP `pick_issuer` tool (follow-up implementation tickets).

---

## Open Questions

1. **JSON-LD `@context` publication URL.** Where does the canonical Issuer `@context` document live? Options: `https://formspec.org/contexts/issuer-v1.jsonld` (formspec-org-controlled), `https://schema.org/` (consume schema.org's directly with a thin overlay), inline-only (each Issuer doc embeds `@context` inline). Lean: formspec-org-controlled URL with `schema.org` aliases; allows schema-evolution without disturbing existing Issuer docs.
2. **Schema.org JSON-LD projection completeness.** Should the spec ship a normative projection tool that transforms Issuer → schema.org JSON-LD, or just a crosswalk table? Lean: crosswalk for v1; tool for v1.1 if a real consumer surfaces.
3. **`identifier` URI scheme tightening for crypto attestation.** When cryptographic attestation arrives, `identifier` will need to bind to a verifiable scheme. Constrain to `did:* | https://* | urn:*` then; free-form now.
4. **`contactPoint.contactType` vocabulary.** Open enum in v1. Should it converge to a controlled vocabulary (e.g., schema.org's recommended values) in a future version, or stay open?
5. **`.well-known/formspec-issuer` discovery.** Should authoring tools auto-discover an Issuer document by fetching `https://<org-domain>/.well-known/formspec-issuer`? Aligns with BIMI / OIDC discovery patterns. Lean: yes, but defer to v1.1.
6. **`parentOrganization` version pinning.** v1 fetches latest. Future spec MAY allow `parentOrganization: { url, version }` for pinned chains. Defer until a real "chain drift broke my form" report surfaces.

---

## Cross-References

- Sibling sidecar patterns: References (`specs/core/references-spec.md`), Locale (`specs/locale/locale-spec.md`), Ontology (`specs/ontology/ontology-spec.md`)
- Definition schema: `schemas/definition.schema.json`
- Response schema (extended): `schemas/response.schema.json`
- Signed-payload preimage discipline: `specs/core/spec.md` §"Signed Response Payload" (governs `displayedIssuer` inclusion)
- Publisher prior art (migrating to extend `Party`): `specs/registry/extension-registry.md` §2.1, `specs/ontology/ontology-spec.md` §2.2
- Rust Publisher consumer: `crates/formspec-core/src/registry_client/`
- Respondent Ledger (cross-cited for `displayedIssuer` pinning + v1 boundary): `specs/audit/respondent-ledger-spec.md`
- First-adopter UI consumer: `../formspec-web/PLANNING.md` rows FW-0020 ("Identity continuity within an issuer"), FW-0049 ("Safe-address handling"), and adjacent rows
- WOS principal taxonomy (non-colliding peer): `../work-spec/schemas/api/actor.schema.json` (Actor / PrincipalClass); ADR 0068 D-9 (ActorRef URN)
- Rulespec / PKAF authority pattern (structural prior art; intentionally non-coupled per ADR 0149): `../PKAF/constraints/core/authority.cue` (`Authority.derivesAuthorityFrom`)
- WOS Organization scope tier (semantically distinct from `kind: "organization"`): ADR 0146 (Organization-not-subscription)
- Identity attestation "issuer" overload (per Glossary): ADR 0068 D-3.1, ADR 0140
- External standards aligned with: W3C Verifiable Credentials Data Model 2.0; schema.org `Organization` / `GovernmentOrganization` / `ContactPoint`; W3C JSON-LD 1.1 `@container: "@language"`; vCard 4.0 (RFC 6350) via schema.org `ContactPoint`; BCP 47; ISO 3166-1 alpha-2 / ISO 3166-2; ROR; Wikidata; W3C DIDs
