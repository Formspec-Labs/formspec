# Issuer Sidecar Spec

**Date:** 2026-05-21
**Status:** Draft
**Depends on:** Definition Schema (schemas/definition.schema.json), Locale Spec (specs/locale/locale-spec.md), Locale Schema (schemas/locale.schema.json)
**Introduces:** `Party` base shape shared across Publisher (Registry, Ontology) and Issuer (new)
**Sibling to:** References, Locale, Ontology sidecars (with one deliberate structural difference — see "Why this binds differently")

---

## The Gap

A Formspec Definition today can say what the form asks, how to validate it, how to render it, and how to translate it. It cannot say **who is asking**.

The only fields that touch organizational identity are `title` (a form name) and `description` (free prose). There is no structured place to put:

- The legal name of the organization sending the form
- The department within that organization
- The jurisdictional context (city / county / state / federal)
- The logo a respondent would recognize
- The support contact when something goes wrong
- The parent agency the department reports into

Every renderer today either omits this entirely, hard-codes it per deployment, or invents an `x-issuer` convention that other renderers can't read. The same City of Springfield Department of Health publishing fifty forms repeats itself fifty times, or doesn't, depending on who built the page.

This is the kind of thing that should be one structured artifact, authored once, referenced everywhere it applies.

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

Today this requires forking. With an Issuer sidecar and host-override resolution, the federal program's Definition declares the federal Issuer; each state's deployment host injects the state's Issuer. The Definition stays untouched; the rendered chrome reflects the deployer.

### Individuals authoring a single form

A lawyer sends a custom intake form to a new client. A doctor sends a patient questionnaire. A small nonprofit publishes one annual survey. They don't have an org chart. They are the issuer.

The same sidecar shape supports an inline Issuer fragment embedded directly in the Definition — one place, one document, no separate fetch. The cost of structured issuer identity for an individual is the same as adding a title.

### Form-authoring tools (downstream)

A visual form authoring environment can offer a real "pick an issuer" experience: select from issuers the user has access to, manage the organization chart, edit logos, configure jurisdictions. Without a spec, every authoring tool invents its own organization model and they don't interoperate.

The `Party` base introduced below also lets the same picker work for any sidecar that names a party — including Publisher on Registry and Ontology docs.

### Verifiers (future)

When a form's authenticity matters — receipts, signed records, audit chains — the Issuer document gives the cryptographic substrate something concrete to attest. "This Issuer document, with this hash, was bundled in this receipt and displayed at sign time." The sidecar today doesn't require any of this; it just doesn't preclude it.

---

## Issuer vs Publisher — different actors, shared base

Registry §2.1 and Ontology §2.2 already define a `Publisher` shape — *who maintains a sidecar document*. The IRS may consume a References doc published by FHIR-Gov Consortium and an Ontology doc published by W3C. Three actors in one form: IRS is the Issuer (asking the respondent); FHIR-Gov and W3C are Publishers (maintaining the artifacts the form depends on). They are not the same role and they should not collapse to one shape.

They *do* share a thin base: every party has a name, may have a stable identifier, may carry contact information. This proposal factors that base out as **`Party`** and lets Publisher and Issuer each extend it with their role-specific fields. One picker in Studio, two distinct semantic roles in the spec.

---

## Why this binds differently from other sidecars

Locale, References, and Ontology sidecars all declare `targetDefinition.url` — the sidecar points IN to the Definition. That direction is correct for those artifacts: each one is *about* a specific Definition. One Locale per language per form. One References doc per form. The sidecar's existence is justified by the Definition.

Issuer is the inverse cardinality. One Issuer publishes many forms. Asking the City of Springfield to enumerate `targetDefinitions[]` of all fifty forms it publishes — and re-publish the Issuer doc every time it ships a new form — inverts the dependency. The Issuer exists prior to and outlives any individual form.

So Definition points OUT to Issuer (`definition.issuer: { url }`), not the other way around. This matches Theme (one Theme can dress many Definitions) and contradicts Locale/References/Ontology (one of them per Definition).

The asymmetry is deliberate and lives in the cardinality of the underlying actor, not in spec inconsistency.

---

## Approaches Considered

### Embed inside Theme

Add a `branding` block to the Theme spec: name, logo, contact, jurisdiction. White-label works naturally because Theme is already host-overrideable, and no new spec file is needed.

Rejected because Theme is presentation-tier — colors, typography, spacing. Issuer identity is data: who is legally asking, what jurisdiction, what contact chain. Paper renderers, verifiers, and exporters would have to dig into Theme for non-presentational facts. The Theme/Definition bright line collapses.

### Embed inline in Definition only

Add an `issuer` block directly to the Definition schema. No ref pattern, no sidecar, no new file. Simplest.

Rejected because of repetition (every form by the same agency repeats the same content), rename pain (an organizational rename forces re-publishing every Definition), and the lack of a host-override mechanism (white-label deployments would need to fork every form). Wrong fit for the 1:N case where one form template is deployed by many issuers.

### Subsume Publisher into Issuer

Promote the existing Registry/Ontology `Publisher` to be the same shape as Issuer. One actor model across the stack.

Rejected. "Publisher" is invisible metadata on a doc nobody renders; "Issuer" is the headline a respondent sees. Conflating them would either pressure Registry authors to add logos they don't need, or force the same shape to mean two different things in two different contexts. Wrong unification.

### Sidecar with shared `Party` base — selected

Standalone Issuer document, referenceable by URL, hierarchical via parent references. Definition either embeds an Issuer inline (individual case) or references it by URL (organizational case). Host may override at render time. **Issuer extends a shared `Party` base shape; existing Publisher in Registry/Ontology can adopt the same base.** Naming distinction preserved; structural reuse achieved.

---

## Design

### The `Party` base

Lives in a shared `$defs` block (canonical location: `schemas/common.schema.json` or referenced from existing common definitions). Three fields, all optional except `name`:

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string or LangMap | Display name. Inline-localizable (see "Localization") |
| `identifier` | URI | Stable identity (DID, domain URI, URN). Distinct from any document URL |
| `contact` | object | `{ supportEmail?, supportPhone?, supportUrl? }` |

Publisher (in Registry, Ontology) is `Party` as-is — its existing `{ name, url, contact }` shape migrates by aliasing `url` to `identifier` (or via a back-compat shim).

### Issuer extends `Party`

A new sidecar spec and schema, in their own subdirectory:

- `specs/issuer/issuer-spec.md`
- `schemas/issuer.schema.json`

An Issuer document is `Party` plus document-identity, sidecar-version, and respondent-chrome fields.

**Required:**

| Field | Type | Notes |
| --- | --- | --- |
| `$formspecIssuer` | const `"1.0"` | Sidecar version pin. Matches Locale/References/Ontology convention |
| `url` | URI | Canonical URL of *this Issuer document* (per Formspec sidecar convention) |
| `version` | string | Semver. MAY also carry a content hash for cache invalidation: `1.2.0+sha256-…` |
| `name` | string or LangMap | (inherited from Party) |
| `kind` | enum | `organization \| department \| program \| individual` |

**Optional identity fields:**

| Field | Type | Notes |
| --- | --- | --- |
| `displayName` | string or LangMap | Preferred display, often shorter than `name` |
| `shortName` | string or LangMap | Terse variant for mobile header / chrome |
| `identifier` | URI | (inherited from Party) Stable entity identifier |
| `partOf` | URI | Reference to the parent Issuer doc (linear chain) |
| `organizationName` | string or LangMap | Flat helper; denormalized convenience |
| `departmentName` | string or LangMap | Flat helper |
| `jurisdiction` | object | `{ level, name, code? }` where `level ∈ federal \| state \| county \| municipal \| tribal \| international \| private \| individual` |

**Optional presentation fields:**

| Field | Type | Notes |
| --- | --- | --- |
| `logo` | object | Variant carrier: `{ primary?, wordmark?, monochrome? }`. Each variant: `{ url, altText, aspectRatio, preferredBackground: light\|dark\|any }` |
| `homepage` | URI | Public homepage for "learn more" affordances |
| `contact` | object | (inherited from Party) extended freely; no postal address in v1 |

**Escape:**

| Field | Type | Notes |
| --- | --- | --- |
| `extensions` | object | `x-*`-prefixed map. Unknown `x-*` keys MUST be preserved across read-write round-trips |

### Hierarchy — linear chain plus flat helpers

Each Issuer document may declare `partOf` pointing to its parent Issuer by URL. Renderers walk the chain from primary to root. There is no nesting (no `departments[]` array on the parent); each organizational unit owns its own document. A parent rename does not touch its children.

In addition, an Issuer may carry flat helper fields (`organizationName`, `departmentName`) for renderers and authoring tools that want a cheap top-level read without walking the chain. When both the chain and the flat helpers are present, they SHOULD agree; a validator warns rather than errors. The chain is canonical truth.

Renderers MUST detect cycles and MUST bound depth at 8. Chains in practice rarely exceed five (program / department / agency / city / state).

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

The inline shape (Branch 1) covers the individual / small-organization / single-deployer case. The URL-ref shape (Branch 2) is strictly `{ url }` — `additionalProperties: false` makes the discriminator unambiguous. The URL is a *fetchable* Issuer document URL; the entity's own stable identifier lives in the Issuer doc's `identifier` field.

### Resolution cascade

A renderer must resolve the effective Issuer in this order:

1. **Host override** — the deployment context (a hosting tenant, an embedded site, a white-label shell) may provide an Issuer at render time. This wins.
2. **Definition declaration** — the Issuer the Definition author embedded inline or referenced by URL.
3. **Unbranded fallback** — render `title` and `description` only.

The host override mechanism is a full Issuer document (or a URL to one). No partial overlay (overlay semantics are a tarpit; layering optional fields invites silent drift). For v1, the *transport* of the host override (query parameter, HTTP header, embed-time config object) is implementation-defined; the *shape* is normative.

### Platform-as-Issuer case

When the rendering platform itself is the issuer (e.g., a Formspec demo page, a Studio preview, a sandbox), the host provides its own platform Issuer document. No special spec mechanism — same cascade, same shape. The respondent always sees a concrete Issuer; unbranded fallback only fires when no host override and no Definition declaration is present.

### Localization

String fields on Issuer (`name`, `displayName`, `shortName`, `organizationName`, `departmentName`, `logo.*.altText`) accept either a plain string or a language map:

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

When given as a plain string, the language is inferred from the Issuer document's `defaultLanguage` field (BCP-47, optional, defaults to `en`). When given as a map, keys are BCP-47 tags; the renderer picks per its locale fallback rules.

This inline-localization model is the canonical mechanism for Issuer strings. The Locale sidecar's `$issuer.*` reserved-key extension (below) is a secondary mechanism for forms that want per-form Issuer overrides without forking the Issuer doc.

### Locale spec extension

The Locale spec adds an optional cross-reference for Issuer strings. Two changes:

1. **Schema regex extension.** `schemas/locale.schema.json` `strings.propertyNames` regex (currently gating `^(\$form\.|\$shape\.|\$page\.|\$optionSet\.|\$component\.|[a-zA-Z])…`) extends to permit `\$issuer\.`. This is a normative schema change, not a prose-only addition.
2. **Spec text.** `specs/locale/locale-spec.md` adds reserved-key documentation alongside §3.1.5 (form-level keys), §3.1.6 (shape), §3.1.7 (page), §3.1.8 (component): a new section for `$issuer.*` keys covering `$issuer.name`, `$issuer.displayName`, `$issuer.shortName`, `$issuer.organizationName`, `$issuer.departmentName`, `$issuer.logo.altText`. Resolution follows the existing four-step fallback cascade at §4.1.

The per-form Locale doc may override Issuer strings for the duration of one Definition's rendering. The Issuer doc's inline language map is the default; the Locale doc's `$issuer.*` keys take precedence when present.

### Theme relationship

Theme is unchanged. Colors, typography, and spacing tokens stay in Theme. The logo URL lives in the Issuer document, not in Theme. Theme MAY declare *how* to render the issuer chrome (logo max height, position) via the existing token shape, but the identity itself (name, logo URL, parent chain) is data. The Theme/Definition bright line is preserved.

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
    "contact": { "supportEmail": "jane@example.law" }
  }
}
```

One Definition, one inline Issuer, no separate fetch.

### A small nonprofit publishing its annual survey

Same shape as the individual case — inline Issuer, `kind: "organization"`, no `partOf`. No more overhead than authoring the title.

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

Department Issuer (bilingual):

```json
{
  "$formspecIssuer": "1.0",
  "url": "https://springfield.gov/health/issuer.json",
  "version": "3.0.0",
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
  "partOf": "https://springfield.gov/issuer.json",
  "jurisdiction": { "level": "municipal", "name": "Springfield" },
  "logo": {
    "primary": {
      "url": "https://springfield.gov/health/logo.svg",
      "altText": "Springfield Public Health seal",
      "aspectRatio": "1:1",
      "preferredBackground": "light"
    },
    "monochrome": {
      "url": "https://springfield.gov/health/logo-mono.svg",
      "altText": "Springfield Public Health seal",
      "preferredBackground": "any"
    }
  },
  "homepage": "https://springfield.gov/health",
  "contact": {
    "supportEmail": "health@springfield.gov",
    "supportPhone": "+1-555-555-0100"
  }
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
  "partOf": "https://state.gov/issuer.json",
  "jurisdiction": { "level": "municipal", "name": "Springfield" }
}
```

When the city renames the health department, one document changes. Fifty Definitions stay untouched. Renderers caching the old Issuer see the version bump and refetch.

### Federal program deployed by fifty states

The Definition declares the federal program as `issuer`. Each state's deployment context injects a host-override Issuer (the state's own).

What the respondent sees: the *state's* chrome — state seal as primary logo, state contact info, state name as immediate issuer. The federal program walks up as a parent in the chain ("part of [Federal Program]"), so respondents understand the relationship without losing the state's authorship of the deployment.

What the receipt records (when receipts ship): a `displayedIssuer` field on the Response capturing the resolved primary Issuer (the state's). The Definition's declared Issuer remains pinned in the form-version reference. The audit trail can therefore distinguish "form authored by federal program" from "form rendered by state." This is the spec hook; the receipt schema change is tracked under Files Touched.

No Definition forks. No Issuer duplication. The federal program ships one model form; the states render it under their own seals; the audit chain knows both.

---

## Files Touched

**New:**

- `specs/issuer/issuer-spec.md`
- `schemas/issuer.schema.json`
- `schemas/common.schema.json` — or extend an existing shared `$defs` file to hold the `Party` base

**Extended:**

- `schemas/definition.schema.json` — add optional `issuer` property (oneOf inline vs `{url}` ref)
- `schemas/locale.schema.json` — extend `strings.propertyNames` regex to permit `$issuer.` prefix (normative schema change)
- `specs/locale/locale-spec.md` — add `$issuer.*` reserved-key section parallel to §3.1.5–3.1.8
- `specs/core/spec.md` — add §"Issuer binding" describing the Definition `issuer` property, resolution cascade, and the Theme/Issuer bright line
- `schemas/registry.schema.json` — Publisher migrates to extend `Party` (back-compat shim retains existing `{ name, url, contact }` shape; `url` aliases to `identifier`)
- `schemas/ontology.schema.json` — same Publisher migration
- `schemas/response.schema.json` — add optional `displayedIssuer` field capturing the resolved primary Issuer at render/sign time (for the federal-states audit story)

**Unchanged:**

Theme, Engine APIs, Respondent Ledger event taxonomy.

---

## Conformance

Per Formspec's portability commitment ("conformance is the portability bar"), this spec ships with fixtures every conformant implementation must pass. Initial fixture corpus:

- **Inline vs ref equivalence.** A Definition with an inline Issuer renders identically to the same Definition with a URL-ref to an equivalent Issuer document.
- **Chain walk.** A three-level `partOf` chain resolves correctly; renderer can produce both the immediate display and the breadcrumb.
- **Cycle detection.** A circular `partOf` chain fails fast with a defined error, not infinite recursion.
- **Depth cap.** A chain of depth 9 truncates at 8 with a defined warning.
- **Host override.** A render with a host-injected Issuer ignores the Definition's declared Issuer; primary chain reflects host.
- **Locale fallback.** `$issuer.name` in a Locale doc overrides the Issuer doc's inline `name`. Inline language map without a Locale doc resolves per requested locale + BCP-47 fallback.
- **Inline vs map string equivalence.** `name: "X"` with `defaultLanguage: "en"` and `name: { "en": "X" }` produce identical rendered output for an English request.
- **Extensions preservation.** Read → write of an Issuer doc with unknown `x-*` keys preserves them byte-stable.
- **Version-pin discriminator.** A Definition's inline `issuer` validates against the full Issuer schema (Branch 1 of `oneOf`); a Definition's `{ url }` issuer validates against Branch 2 only.
- **Publisher↔Party round-trip.** A Registry doc's existing `Publisher: { name, url, contact }` reads as a valid `Party` (with `url` → `identifier` aliasing); writes back unchanged.

---

## Non-Goals

The following are explicitly out of scope for v1. The design does not preclude them.

- Cryptographic attestation of an Issuer document (a future story; the `identifier` field reserves a binding point).
- Issuer-grade verification UI (the "is this really from City of Springfield?" question — requires separate link-integrity and substrate work).
- Multi-issuer or co-issued forms (e.g., two agencies jointly issuing one form — belongs with the multi-party form work).
- Issuer wallet or verifiable-credential integration.
- Issuer revocation lifecycle (requires a ledger).
- Partial-overlay host-override semantics. Overlay is a tarpit; full-document override only.
- Postal address as a respondent-chrome field. Not rendered today; out unless adopter demand surfaces.

---

## Open Questions

1. **`Party` base location.** Add to a new `schemas/common.schema.json`, or fold into an existing shared `$defs` file? Lean: new file, since it'll grow as more party-shaped concepts surface (Custodian, Originator, Sender).
2. **Publisher migration cadence.** Hard cutover (next minor) vs deprecation window (current `url` stays valid for two minor versions)? Lean: deprecation window — touching every existing Registry/Ontology doc at once is unnecessary churn.
3. **`identifier` shape.** Free-form URI for v1, or constrain to one of `did:* | https://* | urn:*`? Lean: free-form for v1; tighten when cryptographic attestation arrives.
4. **`kind` enum coverage.** Are `program` and `individual` both warranted, or does `organization | department` cover the field? Lean: keep all four. `program` covers cross-org initiatives (a federal program is structurally not a department of anyone); `individual` is the legally distinct single-person case.
5. **Host-override transport.** Implementation-defined for v1, or normative now? Lean: implementation-defined for v1 with a normative shape contract; revisit for v1.1 once two implementations exist.

---

## Cross-References

- Sibling sidecar patterns: References (`specs/core/references-spec.md`), Locale (`specs/locale/locale-spec.md`), Ontology (`specs/ontology/ontology-spec.md`)
- Definition schema: `schemas/definition.schema.json`
- Locale reserved-key prefixes: `specs/locale/locale-spec.md` §3.1.5–3.1.8
- Locale fallback cascade: `specs/locale/locale-spec.md` §4.1
- Existing Publisher shapes: `specs/registry/extension-registry.md` §2.1, `specs/ontology/ontology-spec.md` §2.2 (both migrate to extend `Party`)
- Receipt-side audit pin: `schemas/response.schema.json` (new optional `displayedIssuer` field)
