# Issuer Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`thoughts/specs/2026-05-21-issuer-sidecar.md`](../specs/2026-05-21-issuer-sidecar.md). Read first — this plan is execution scaffolding, not the design.

**Goal:** Land the v1 Issuer sidecar: shared `Party` base, standalone Issuer document, Definition→Issuer binding, host-override cascade, receipt-side `displayedIssuer` pin, Publisher migration in Registry/Ontology.

**Architecture:** New sidecar with inverted cardinality (Definition points OUT to Issuer; one Issuer publishes many forms). Shared `$defs/Party` in `common.schema.json` collapses Registry/Ontology Publisher duplication. Resolution cascade `host > definition > unbranded`; host-override transports embed-time + query-with-allowlist. Engine owns IssuerStore (fetch / cache / cascade / parent walk); webcomponent owns chrome rendering and logo-variant selection. `displayedIssuer` lives inside the signed-payload preimage by the existing `authoredSignatures`-only omission rule (`specs/core/spec.md` §"Signed Response Payload") — no canonicalization-profile change.

**Tech stack:** JSON Schema 2020-12 · Rust (formspec-core) · TypeScript (formspec-engine, formspec-webcomponent) · Vitest (engine unit/integration) · Playwright (renderer E2E) · Python conformance (tests/conformance/) · pdoc/TypeDoc (docs).

**Out of scope (v1 Non-Goals — see spec):** cryptographic attestation, verifiable-credentials integration, revocation, partial-overlay host override, two-chain merge, Studio MCP `pick_issuer`, BIMI logo preference, `.well-known/formspec-issuer` discovery, per-event Respondent Ledger pin.

**Open Questions resolved inside this plan:** OQ-1 JSON-LD `@context` URL → `https://formspec.org/contexts/issuer-v1.jsonld` (lean from spec); document body checked into repo at `specs/issuer/context.jsonld`. Publication URL is a deploy-time mapping, not a code change. Re-decide before the deploy task ships.

---

## File Structure (decomposition map)

**New schemas:**
- `schemas/issuer.schema.json` — Issuer document schema (extends `Party`, adds chrome fields).

**New specs:**
- `specs/issuer/issuer-spec.md` — Canonical Issuer specification (sibling to locale, references, ontology).
- `specs/issuer/issuer-spec.bluf.md` — BLUF summary block sourced into `issuer-spec.md`.
- `specs/issuer/context.jsonld` — JSON-LD `@context` document for schema.org projection.

**Modified schemas:**
- `schemas/common.schema.json` — add `$defs/{Party, LangMap, ContactPoint}`.
- `schemas/definition.schema.json` — add optional top-level `issuer` (oneOf inline | {url}).
- `schemas/response.schema.json` — add optional `displayedIssuer` ({url, version}).
- `schemas/registry.schema.json` — Publisher redef extends `Party`; legacy `url` aliases `homepage`; legacy `contact` deprecated.
- `schemas/ontology.schema.json` — same Publisher migration.
- `crates/formspec-lint/schemas/{common,definition,response,registry,ontology}.schema.json` + new `issuer.schema.json` — mirror schemas (one-to-one with `schemas/`).

**Modified specs:**
- `specs/core/spec.md` — add §"Issuer binding" subsection (cascade, transports, two-chain rule, theme/issuer bright line); cross-reference §"Signed Response Payload" for `displayedIssuer`.
- `specs/audit/respondent-ledger-spec.md` — add v1 boundary note (no per-event Issuer pin; submit-time `displayedIssuer` only).

**Modified Rust:**
- `crates/formspec-core/src/registry_client/types.rs` — `Publisher { name, homepage, contact_point, legacy_url, legacy_contact }`.
- `crates/formspec-core/src/registry_client/parse.rs` — accept `homepage` (preferred) and `url` (deprecated alias); accept `contactPoint` (preferred) and `contact` (deprecated alias); emit `RegistryWarning::DeprecatedField` (new variant).
- `crates/formspec-core/src/registry_client/registry.rs` — surface warnings in parse return.
- `crates/formspec-core/src/registry_client/tests.rs` — legacy round-trip + warning emission tests.

**New / regenerated TypeScript:**
- `packages/formspec-engine/src/issuer/types.ts` — Issuer / Party / LangMap / ContactPoint / IssuerSource type declarations (hand-authored; mirrors schema).
- `packages/formspec-engine/src/issuer/IssuerStore.ts` — fetch + cache + cascade + parent walk + cycle/depth guard + content-hash invalidation.
- `packages/formspec-engine/src/issuer/IssuerFetcher.ts` — pluggable HTTP port (DI seam; default is `globalThis.fetch`-backed).
- `packages/formspec-engine/src/issuer/LangMap.ts` — locale fallback resolution (BCP 47 → defaultLanguage → first key).
- `packages/formspec-engine/src/issuer/index.ts` — barrel.
- `packages/formspec-engine/src/engine/FormEngine.ts` — wire `setIssuerOverride`, `getResolvedIssuer`, `getResponse().displayedIssuer`.
- `packages/formspec-engine/src/interfaces.ts` — `IssuerSource`, `IssuerOverrideConfig`, `ResolvedIssuer` interfaces.
- `packages/formspec-webcomponent/src/issuer/IssuerChrome.tsx` — primary chrome render (logo variant selection, breadcrumb walk, contactPoint surface).
- `packages/formspec-webcomponent/src/issuer/queryOverride.ts` — `?_issuer=` parsing with origin allowlist.
- `packages/formspec-webcomponent/src/element.ts` — accept `issuer-override` attribute + `issuerOverride` property; wire to engine.
- `packages/formspec-types/src/generated/{common,definition,response,registry,ontology,issuer}.ts` — regenerated by `npm run docs:generate`.

**New conformance fixtures (under `tests/fixtures/issuer/`):**
- `inline-vs-ref-equivalence/{definition-inline.json, definition-ref.json, issuer-ref.json, expected-chrome.json}`
- `chain-walk-three-level/{definition.json, issuer-leaf.json, issuer-mid.json, issuer-root.json, expected-breadcrumb.json}`
- `cycle-detection/{definition.json, issuer-a.json, issuer-b.json, expected-error.json}`
- `depth-cap-truncation/{definition.json, issuer-1..9.json, expected-warning.json}`
- `parent-fetch-failure/{definition.json, issuer-leaf.json, expected-degradation.json}` (mock 404 for parent)
- `inline-with-parent/{definition.json, issuer-parent.json, expected.json}`
- `host-override-embed/{definition.json, override-issuer.json, expected.json}`
- `host-override-query/{definition.json, override-issuer.json, allowlist.json, expected.json}`
- `host-override-embed-wins/{definition.json, embed.json, query.json, expected.json}`
- `query-without-allowlist/{definition.json, expected-ignored.json}`
- `two-chain-rule/{definition.json, definition-issuer.json, host-issuer.json, expected-only-host-chain.json}`
- `version-pin-discriminator/{valid-inline.json, valid-ref.json, invalid-issuer-as-ref.json}`
- `langmap-bcp47-enforcement/{valid.json, invalid.json}`
- `langmap-fallback/{inputs.json, expected-en.json, expected-fr-fallback.json}`
- `logo-variant-selection/{issuer.json, expected-light.json, expected-dark.json, expected-narrow.json}`
- `extensions-preservation/{issuer-in.json, issuer-out.json}` (byte-stable round-trip)
- `content-hash-invalidation/{cached.json, fresh.json, expected.json}`
- `receipt-audit-pin/{definition.json, host-issuer.json, response.json, signed-payload.json}`
- `publisher-legacy-roundtrip/{registry-legacy.json, expected-warnings.json}`
- `kind-parent-constraint/{department-no-parent.json, individual-with-parent.json, expected-warnings.json}`
- `schemaorg-projection/{issuer.json, context.jsonld, expected-jsonld.json}`

**Tests:**
- Vitest unit/integration in `packages/formspec-engine/tests/issuer/` covering IssuerStore, LangMap, cascade, parent walk, content-hash.
- Playwright E2E in `tests/e2e/playwright/issuer-chrome.spec.ts` — golden-path render + host-override (query and embed) + parent-fetch failure + logo variant selection.
- Python conformance in `tests/conformance/test_issuer_schema.py` — schema validation cases (langmap BCP 47, discriminator, kind constraints).
- Rust test in `crates/formspec-core/src/registry_client/tests.rs` — Publisher legacy round-trip + warnings.

**Filemap, lint matrix, docs gate:**
- `npm run docs:generate` (regenerates llm/bluf/schema-ref blocks + TS types + filemap).
- `npm run docs:check` (validates marker blocks fresh).
- `npm run docs:filemap` (regenerates `filemap.json`).

---

## Phase A — Schema substrate (Party base, Issuer schema, Definition + Response hooks)

### Task A1: Add `Party`, `LangMap`, `ContactPoint` to `common.schema.json`

**Files:**
- Modify: `schemas/common.schema.json` (insert new `$defs` blocks; preserve all existing).

- [ ] **Step 1: Write the failing schema test**

Create `tests/conformance/test_common_party.py`:

```python
import json
from pathlib import Path
import pytest
from jsonschema import validate, ValidationError

SCHEMA = json.loads(
    (Path(__file__).parents[2] / "schemas" / "common.schema.json").read_text()
)

def _validator_for(def_name: str):
    return {"$schema": "https://json-schema.org/draft/2020-12/schema",
            "$defs": SCHEMA["$defs"], "$ref": f"#/$defs/{def_name}"}

def test_party_requires_name():
    with pytest.raises(ValidationError):
        validate({}, _validator_for("Party"))

def test_party_accepts_string_name():
    validate({"name": "Acme"}, _validator_for("Party"))

def test_party_accepts_langmap_name():
    validate({"name": {"en": "Acme", "es": "Acme"}}, _validator_for("Party"))

def test_langmap_rejects_bad_tag():
    with pytest.raises(ValidationError):
        validate({"english": "X"}, _validator_for("LangMap"))

def test_langmap_accepts_bcp47():
    validate({"en": "X", "es-MX": "Y", "zh-Hant-TW": "Z"}, _validator_for("LangMap"))

def test_contactpoint_email_validates():
    validate({"contactType": "customer support", "email": "x@y.com"},
             _validator_for("ContactPoint"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/conformance/test_common_party.py -v`
Expected: FAIL with `$defs/Party` etc. not defined.

- [ ] **Step 3: Add `$defs` to `schemas/common.schema.json`**

Insert (alphabetical order within `$defs`) — final content of the three new defs:

```json
"ContactPoint": {
  "type": "object",
  "description": "Contact point — schema.org-aligned, vCard 4.0 semantics.",
  "additionalProperties": false,
  "properties": {
    "contactType":       { "type": "string", "description": "Open vocabulary: 'customer support', 'accessibility', 'language line', etc. Renderers SHOULD honor 'customer support' as default." },
    "email":             { "type": "string", "format": "email" },
    "telephone":         { "type": "string" },
    "url":               { "type": "string", "format": "uri" },
    "availableLanguage": {
      "type": "array",
      "items": { "type": "string", "pattern": "^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$" }
    }
  }
},
"LangMap": {
  "type": "object",
  "description": "Language-keyed string map (BCP 47 keys). JSON-LD-compatible with @container: '@language'.",
  "propertyNames": {
    "pattern": "^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$",
    "description": "BCP 47 language tag (e.g., 'en', 'es-MX', 'zh-Hant-TW')."
  },
  "additionalProperties": { "type": "string" }
},
"Party": {
  "type": "object",
  "description": "Shared base for entities that publish or issue Formspec documents. Issuer and Publisher both extend Party.",
  "required": ["name"],
  "properties": {
    "name": {
      "oneOf": [
        { "type": "string" },
        { "$ref": "#/$defs/LangMap" }
      ],
      "description": "Display name. Plain string or LangMap."
    },
    "identifier": { "type": "string", "format": "uri", "description": "Stable entity URI — ROR, Wikidata, DID, or own-domain URL." },
    "homepage":   { "type": "string", "format": "uri", "description": "Public organizational homepage (distinct from any document URL)." },
    "contactPoint": {
      "oneOf": [
        { "$ref": "#/$defs/ContactPoint" },
        { "type": "array", "items": { "$ref": "#/$defs/ContactPoint" } }
      ]
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/conformance/test_common_party.py -v`
Expected: 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas/common.schema.json tests/conformance/test_common_party.py
git commit -m "feat(common): add Party, LangMap, ContactPoint $defs for Issuer sidecar"
```

---

### Task A2: Create `schemas/issuer.schema.json`

**Files:**
- Create: `schemas/issuer.schema.json`
- Test: `tests/conformance/test_issuer_schema.py`

- [ ] **Step 1: Write the failing schema test**

```python
# tests/conformance/test_issuer_schema.py
import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).parents[2]
ISSUER = json.loads((ROOT / "schemas" / "issuer.schema.json").read_text())
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text())

def _validator():
    store = {
        "https://formspec.org/schemas/issuer/1.0": ISSUER,
        "https://formspec.org/schemas/common/1.0": COMMON,
    }
    resolver = RefResolver.from_schema(ISSUER, store=store)
    return Draft202012Validator(ISSUER, resolver=resolver)

MIN = {
    "$formspecIssuer": "1.0",
    "url": "https://example.gov/issuer.json",
    "version": "1.0.0",
    "name": "Example Agency",
    "kind": "organization",
}

def test_minimum_valid_issuer():
    _validator().validate(MIN)

def test_missing_kind_rejected():
    bad = {**MIN}
    bad.pop("kind")
    with pytest.raises(Exception):
        _validator().validate(bad)

def test_unknown_kind_rejected():
    with pytest.raises(Exception):
        _validator().validate({**MIN, "kind": "not-a-kind"})

def test_logo_aspect_ratio_pattern():
    bad = {**MIN, "logo": {"primary": {"url": "x", "aspectRatio": "wide"}}}
    with pytest.raises(Exception):
        _validator().validate(bad)

def test_logo_aspect_ratio_valid():
    _validator().validate({**MIN, "logo": {"primary": {"url": "x", "aspectRatio": "1:1"}}})

def test_jurisdiction_levels():
    for lvl in ["federal","state","county","municipal","tribal","international","private","individual"]:
        _validator().validate({**MIN, "jurisdiction": {"level": lvl, "name": "X"}})

def test_extension_keys_must_be_x_prefixed():
    with pytest.raises(Exception):
        _validator().validate({**MIN, "extensions": {"bad": 1}})
    _validator().validate({**MIN, "extensions": {"x-vendor": 1}})

def test_version_plain_semver():
    _validator().validate({**MIN, "version": "1.2.3"})

def test_version_with_content_hash():
    _validator().validate({**MIN, "version": "1.2.3+sha256-deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567"})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/conformance/test_issuer_schema.py -v`
Expected: FAIL with file not found.

- [ ] **Step 3: Create `schemas/issuer.schema.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://formspec.org/schemas/issuer/1.0",
  "title": "Formspec Issuer Document",
  "description": "A standalone sidecar declaring who is asking the form. One Issuer publishes many Definitions. Definitions point OUT to Issuer (inverse cardinality of locale/references/ontology). Receipt-side displayedIssuer pins the resolved Issuer at submit-time inside the signed-payload preimage.",
  "type": "object",
  "additionalProperties": false,
  "required": ["$formspecIssuer", "url", "version", "name", "kind"],
  "allOf": [
    { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/Party" }
  ],
  "properties": {
    "$formspecIssuer": { "type": "string", "const": "1.0", "description": "Sidecar version pin.", "x-lm": { "critical": true, "intent": "Version pin." } },
    "$schema":         { "type": "string", "format": "uri" },
    "url":             { "type": "string", "format": "uri", "description": "Canonical URL of this Issuer document (distinct from Party.homepage)." },
    "version":         { "type": "string", "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(\\+sha256-[0-9a-f]{64})?$", "description": "Semver, optionally suffixed with +sha256-<hex> for content-hash invalidation." },
    "name":            { "oneOf": [{ "type": "string" }, { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/LangMap" }] },
    "kind":            { "type": "string", "enum": ["organization", "department", "program", "individual"], "x-lm": { "critical": true, "intent": "UI-tier role; not WOS scope-tier Organization (ADR 0146)." } },
    "displayName":     { "oneOf": [{ "type": "string" }, { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/LangMap" }] },
    "shortName":       { "oneOf": [{ "type": "string" }, { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/LangMap" }] },
    "identifier":      { "type": "string", "format": "uri" },
    "homepage":        { "type": "string", "format": "uri" },
    "parentOrganization": { "type": "string", "format": "uri", "description": "URL of the parent Issuer document. Linear chain; no nesting." },
    "organizationName": { "oneOf": [{ "type": "string" }, { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/LangMap" }] },
    "departmentName":   { "oneOf": [{ "type": "string" }, { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/LangMap" }] },
    "jurisdiction": {
      "type": "object",
      "additionalProperties": false,
      "required": ["level", "name"],
      "properties": {
        "level": { "type": "string", "enum": ["federal","state","county","municipal","tribal","international","private","individual"] },
        "name":  { "type": "string" },
        "code":  { "type": "string", "description": "ISO 3166-1 alpha-2 for international; ISO 3166-2 for state; jurisdiction-specific below." }
      }
    },
    "defaultLanguage": { "type": "string", "pattern": "^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$", "default": "en" },
    "logo": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "primary":    { "$ref": "#/$defs/LogoVariant" },
        "wordmark":   { "$ref": "#/$defs/LogoVariant" },
        "monochrome": { "$ref": "#/$defs/LogoVariant" }
      }
    },
    "contactPoint": {
      "oneOf": [
        { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/ContactPoint" },
        { "type": "array", "items": { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/ContactPoint" } }
      ]
    },
    "extensions": { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/Extensions" }
  },
  "$defs": {
    "LogoVariant": {
      "type": "object",
      "additionalProperties": false,
      "required": ["url"],
      "properties": {
        "url":         { "type": "string", "format": "uri" },
        "altText":     { "oneOf": [{ "type": "string" }, { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/LangMap" }] },
        "aspectRatio": { "type": "string", "pattern": "^\\d+:\\d+$" },
        "preferredBackground": { "type": "string", "enum": ["light", "dark", "any"] }
      }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/conformance/test_issuer_schema.py -v`
Expected: 9 PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas/issuer.schema.json tests/conformance/test_issuer_schema.py
git commit -m "feat(issuer): add issuer.schema.json with Party-base, kind, jurisdiction, logo variants"
```

---

### Task A3: Add `issuer` property to `definition.schema.json`

**Files:**
- Modify: `schemas/definition.schema.json` (add top-level `issuer` property; preserve existing top-level shape)
- Test: `tests/conformance/test_definition_issuer_binding.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/conformance/test_definition_issuer_binding.py
import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).parents[2]
DEF    = json.loads((ROOT / "schemas" / "definition.schema.json").read_text())
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text())
ISSUER = json.loads((ROOT / "schemas" / "issuer.schema.json").read_text())

def _v():
    store = {
        "https://formspec.org/schemas/common/1.0": COMMON,
        "https://formspec.org/schemas/issuer/1.0":  ISSUER,
    }
    return Draft202012Validator(DEF, resolver=RefResolver.from_schema(DEF, store=store))

MIN_DEF = {
    "$formspec": "1.0",
    "url": "https://x/forms/f",
    "version": "1.0.0",
    "title": "Form",
    "items": []
}

INLINE = {
    "$formspecIssuer": "1.0",
    "url": "https://x/issuer.json",
    "version": "1.0.0",
    "kind": "individual",
    "name": "Jane Smith",
}

def test_no_issuer_still_valid():
    _v().validate(MIN_DEF)

def test_issuer_inline_branch():
    _v().validate({**MIN_DEF, "issuer": INLINE})

def test_issuer_ref_branch():
    _v().validate({**MIN_DEF, "issuer": {"url": "https://x/issuer.json"}})

def test_issuer_ref_rejects_extra_props():
    with pytest.raises(Exception):
        _v().validate({**MIN_DEF, "issuer": {"url": "https://x/issuer.json", "name": "x"}})

def test_issuer_inline_must_be_full_doc():
    with pytest.raises(Exception):
        _v().validate({**MIN_DEF, "issuer": {"$formspecIssuer": "1.0", "url": "x", "version": "1.0.0"}})  # missing name+kind
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/conformance/test_definition_issuer_binding.py -v`
Expected: FAIL — definition schema rejects `issuer` key.

- [ ] **Step 3: Add `issuer` property to `definition.schema.json`**

Locate the top-level `properties` object. Add:

```json
"issuer": {
  "description": "Optional Issuer binding. Inline (full Issuer document) for individual/small-org case; ref ({url} only) for shared/agency case. Inverse cardinality from locale/references/ontology (Definition points OUT to Issuer).",
  "oneOf": [
    { "$ref": "https://formspec.org/schemas/issuer/1.0" },
    {
      "type": "object",
      "additionalProperties": false,
      "required": ["url"],
      "properties": { "url": { "type": "string", "format": "uri" } }
    }
  ],
  "x-lm": { "critical": true, "intent": "Binding to Issuer document (inline full doc or {url} ref). Resolution cascade: host > definition > unbranded." }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/conformance/test_definition_issuer_binding.py -v`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas/definition.schema.json tests/conformance/test_definition_issuer_binding.py
git commit -m "feat(definition): bind optional issuer property (inline | {url} ref)"
```

---

### Task A4: Add `displayedIssuer` to `response.schema.json`

**Files:**
- Modify: `schemas/response.schema.json`
- Test: `tests/conformance/test_response_displayed_issuer.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/conformance/test_response_displayed_issuer.py
import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).parents[2]
RES = json.loads((ROOT / "schemas" / "response.schema.json").read_text())
V   = Draft202012Validator(RES)

BASE = {
    "$formspecResponse": "1.0",
    "definition": {"url": "https://x/forms/f", "version": "1.0.0"},
    "values": {}
}

def test_no_displayed_issuer_still_valid():
    V.validate(BASE)

def test_valid_displayed_issuer():
    V.validate({**BASE, "displayedIssuer": {"url": "https://x/issuer.json", "version": "1.0.0"}})

def test_displayed_issuer_requires_url():
    with pytest.raises(Exception):
        V.validate({**BASE, "displayedIssuer": {"version": "1.0.0"}})

def test_displayed_issuer_requires_version():
    with pytest.raises(Exception):
        V.validate({**BASE, "displayedIssuer": {"url": "https://x/issuer.json"}})

def test_displayed_issuer_rejects_extra_props():
    with pytest.raises(Exception):
        V.validate({**BASE, "displayedIssuer": {"url": "https://x/issuer.json", "version": "1.0.0", "name": "x"}})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/conformance/test_response_displayed_issuer.py -v`
Expected: FAIL — `displayedIssuer` rejected.

- [ ] **Step 3: Add `displayedIssuer` property**

Locate top-level `properties` in `response.schema.json`. Add:

```json
"displayedIssuer": {
  "type": "object",
  "additionalProperties": false,
  "required": ["url", "version"],
  "description": "Submit-time pin of the resolved Issuer (post-cascade). Inside the signed-payload preimage by the existing authoredSignatures-only omission rule (specs/core/spec.md §Signed Response Payload). Per-event Issuer pinning is a v1 non-goal.",
  "properties": {
    "url":     { "type": "string", "format": "uri" },
    "version": { "type": "string" }
  },
  "x-lm": { "critical": true, "intent": "Audit pin of the Issuer that actually rendered. Inside signed-payload digest by JCS canonicalization (no profile change)." }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/conformance/test_response_displayed_issuer.py -v`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas/response.schema.json tests/conformance/test_response_displayed_issuer.py
git commit -m "feat(response): add displayedIssuer audit pin (inside signed-payload preimage)"
```

---

### Task A5: Migrate `Publisher` in `registry.schema.json` to extend `Party`

**Files:**
- Modify: `schemas/registry.schema.json` (replace `$defs/Publisher`)
- Test: `tests/conformance/test_publisher_party_migration.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/conformance/test_publisher_party_migration.py
import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).parents[2]
REG = json.loads((ROOT / "schemas" / "registry.schema.json").read_text())
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text())

def _v():
    store = {"https://formspec.org/schemas/common/1.0": COMMON}
    return Draft202012Validator(REG, resolver=RefResolver.from_schema(REG, store=store))

BASE = {
    "$formspecRegistry": "1.0",
    "published": "2026-05-21T00:00:00Z",
    "entries": []
}

def test_publisher_party_form_with_homepage():
    _v().validate({**BASE, "publisher": {"name": "Acme", "homepage": "https://acme"}})

def test_publisher_legacy_url_still_valid():
    # Legacy form: { name, url, contact } — preserved for 2 minor versions.
    _v().validate({**BASE, "publisher": {"name": "Acme", "url": "https://acme", "contact": "x@y"}})

def test_publisher_with_contact_point():
    _v().validate({**BASE, "publisher": {
        "name": "Acme",
        "homepage": "https://acme",
        "contactPoint": {"contactType": "customer support", "email": "x@y"}
    }})

def test_publisher_with_langmap_name():
    _v().validate({**BASE, "publisher": {"name": {"en": "Acme", "es": "Acme"}}})

def test_publisher_requires_name():
    with pytest.raises(Exception):
        _v().validate({**BASE, "publisher": {"homepage": "https://acme"}})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/conformance/test_publisher_party_migration.py -v`
Expected: FAIL — `homepage`, `contactPoint`, LangMap rejected.

- [ ] **Step 3: Migrate `$defs/Publisher` in `registry.schema.json`**

Replace the existing `$defs/Publisher` with:

```json
"Publisher": {
  "type": "object",
  "description": "Organization publishing this registry document. Extends $defs/Party from common.schema.json. Legacy fields preserved: `url` aliases Party.homepage (deprecated, removed in v1.2); `contact: string` deprecated in favor of contactPoint (removed in v1.2).",
  "required": ["name"],
  "additionalProperties": false,
  "allOf": [
    { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/Party" }
  ],
  "properties": {
    "name":         { "oneOf": [{ "type": "string" }, { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/LangMap" }] },
    "identifier":   { "type": "string", "format": "uri" },
    "homepage":     { "type": "string", "format": "uri" },
    "contactPoint": {
      "oneOf": [
        { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/ContactPoint" },
        { "type": "array", "items": { "$ref": "https://formspec.org/schemas/common/1.0#/$defs/ContactPoint" } }
      ]
    },
    "url":     { "type": "string", "format": "uri", "deprecated": true, "description": "DEPRECATED: alias for `homepage`. Removed in v1.2." },
    "contact": { "type": "string", "deprecated": true, "description": "DEPRECATED: prefer structured `contactPoint`. Removed in v1.2." }
  }
}
```

Note: the `required: ["name", "url"]` constraint in the old Publisher must drop to `required: ["name"]`. Update any sibling document-level `required` or entry-level references accordingly.

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/conformance/test_publisher_party_migration.py -v`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add schemas/registry.schema.json tests/conformance/test_publisher_party_migration.py
git commit -m "refactor(registry): Publisher extends Party; legacy {url, contact} deprecated for 2 minors"
```

---

### Task A6: Mirror the Publisher migration in `ontology.schema.json`

**Files:**
- Modify: `schemas/ontology.schema.json`
- Test: `tests/conformance/test_ontology_publisher_migration.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/conformance/test_ontology_publisher_migration.py
import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, RefResolver

ROOT = Path(__file__).parents[2]
ONT = json.loads((ROOT / "schemas" / "ontology.schema.json").read_text())
COMMON = json.loads((ROOT / "schemas" / "common.schema.json").read_text())

def _v():
    store = {"https://formspec.org/schemas/common/1.0": COMMON}
    return Draft202012Validator(ONT, resolver=RefResolver.from_schema(ONT, store=store))

BASE = {
    "$formspecOntology": "1.0",
    "version": "1.0.0",
    "targetDefinition": {"url": "https://x/forms/f"}
}

def test_publisher_party_form():
    _v().validate({**BASE, "publisher": {"name": "Acme", "homepage": "https://acme"}})

def test_legacy_url_form_still_valid():
    _v().validate({**BASE, "publisher": {"name": "Acme", "url": "https://acme", "contact": "x@y"}})

def test_contact_point_preferred():
    _v().validate({**BASE, "publisher": {
        "name": "Acme",
        "homepage": "https://acme",
        "contactPoint": [{"contactType": "customer support", "email": "x@y"}]
    }})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 -m pytest tests/conformance/test_ontology_publisher_migration.py -v`
Expected: FAIL.

- [ ] **Step 3: Mirror the Publisher migration**

Replace `$defs/Publisher` in `schemas/ontology.schema.json` with the same block as Task A5 (substitute identical content).

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 -m pytest tests/conformance/test_ontology_publisher_migration.py -v`
Expected: 3 PASS.

- [ ] **Step 5: Run full schema suite to ensure no regressions**

Run: `python3 -m pytest tests/conformance/ -v`
Expected: ALL PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add schemas/ontology.schema.json tests/conformance/test_ontology_publisher_migration.py
git commit -m "refactor(ontology): Publisher extends Party; legacy fields deprecated for 2 minors"
```

---

### Task A7: Mirror all schemas into `crates/formspec-lint/schemas/`

**Files:**
- Modify: `crates/formspec-lint/schemas/{common,definition,response,registry,ontology}.schema.json`
- Create: `crates/formspec-lint/schemas/issuer.schema.json`

The lint mirror is byte-for-byte identical to canonical `schemas/*.json` (mirror discipline; no behavioral drift between lint and runtime).

- [ ] **Step 1: Copy canonical schemas into the lint mirror**

```bash
cp schemas/common.schema.json     crates/formspec-lint/schemas/common.schema.json
cp schemas/definition.schema.json crates/formspec-lint/schemas/definition.schema.json
cp schemas/response.schema.json   crates/formspec-lint/schemas/response.schema.json
cp schemas/registry.schema.json   crates/formspec-lint/schemas/registry.schema.json
cp schemas/ontology.schema.json   crates/formspec-lint/schemas/ontology.schema.json
cp schemas/issuer.schema.json     crates/formspec-lint/schemas/issuer.schema.json
```

- [ ] **Step 2: Verify lint crate builds**

Run: `cargo nextest run -p formspec-lint`
Expected: PASS (lint tests).

- [ ] **Step 3: Commit**

```bash
git add crates/formspec-lint/schemas/
git commit -m "build(lint): mirror Issuer + migrated Publisher schemas into lint crate"
```

---

## Phase B — Rust Publisher migration (registry_client)

### Task B1: Extend `Publisher` struct with `homepage` + deprecated aliases

**Files:**
- Modify: `crates/formspec-core/src/registry_client/types.rs`
- Modify: `crates/formspec-core/src/registry_client/parse.rs`
- Modify: `crates/formspec-core/src/registry_client/registry.rs` (surface warnings)
- Test: `crates/formspec-core/src/registry_client/tests.rs`

- [ ] **Step 1: Write the failing Rust tests**

Append to `crates/formspec-core/src/registry_client/tests.rs`:

```rust
#[test]
fn publisher_preferred_homepage_parses() {
    let doc = serde_json::json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": { "name": "Acme", "homepage": "https://acme" },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    assert_eq!(parsed.publisher.name, "Acme");
    assert_eq!(parsed.publisher.homepage.as_deref(), Some("https://acme"));
    assert!(parsed.warnings.is_empty(), "no warnings on preferred form");
}

#[test]
fn publisher_legacy_url_aliases_homepage_and_warns() {
    let doc = serde_json::json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": { "name": "Acme", "url": "https://acme" },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    assert_eq!(parsed.publisher.homepage.as_deref(), Some("https://acme"));
    assert!(
        parsed.warnings.iter().any(|w| matches!(w, RegistryWarning::DeprecatedField { field, .. } if field == "publisher.url")),
        "expected deprecation warning for publisher.url"
    );
}

#[test]
fn publisher_legacy_contact_string_warns() {
    let doc = serde_json::json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": { "name": "Acme", "homepage": "https://acme", "contact": "x@y" },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    assert!(
        parsed.warnings.iter().any(|w| matches!(w, RegistryWarning::DeprecatedField { field, .. } if field == "publisher.contact"))
    );
}

#[test]
fn publisher_contact_point_preferred() {
    let doc = serde_json::json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": {
            "name": "Acme", "homepage": "https://acme",
            "contactPoint": { "contactType": "customer support", "email": "x@y" }
        },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    assert!(parsed.warnings.is_empty());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo nextest run -p formspec-core registry_client::tests`
Expected: FAIL — `homepage`, `warnings`, `RegistryWarning::DeprecatedField` undefined.

- [ ] **Step 3: Add `RegistryWarning` and extend `Publisher` in `types.rs`**

In `crates/formspec-core/src/registry_client/types.rs`:

```rust
/// Organization publishing a registry document.
#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct Publisher {
    pub name: String,
    /// Public organizational homepage (extends Party.homepage). Preferred form.
    pub homepage: Option<String>,
    /// Structured contact info (zero, one, or many).
    pub contact_points: Vec<ContactPoint>,
    /// Legacy free-form contact string. DEPRECATED — removed in v1.2.
    pub legacy_contact: Option<String>,
}

#[allow(missing_docs)]
#[derive(Debug, Clone)]
pub struct ContactPoint {
    pub contact_type: Option<String>,
    pub email: Option<String>,
    pub telephone: Option<String>,
    pub url: Option<String>,
    pub available_language: Vec<String>,
}

/// Non-fatal parse warning (lint signal; parse still succeeds).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistryWarning {
    /// A deprecated field was present.
    DeprecatedField { field: String, replacement: String },
}
```

- [ ] **Step 4: Update `parse_publisher` in `parse.rs`**

```rust
pub(super) fn parse_publisher(val: &Value) -> Result<(Publisher, Vec<RegistryWarning>), RegistryError> {
    let obj = val.as_object()
        .ok_or_else(|| RegistryError::InvalidField("publisher must be an object".into()))?;
    let name = obj.get("name").and_then(|v| v.as_str())
        .ok_or_else(|| RegistryError::MissingField("publisher.name".into()))?
        .to_string();

    let mut warnings = Vec::new();

    // homepage preferred; url is deprecated alias.
    let homepage = if let Some(h) = obj.get("homepage").and_then(|v| v.as_str()) {
        Some(h.to_string())
    } else if let Some(u) = obj.get("url").and_then(|v| v.as_str()) {
        warnings.push(RegistryWarning::DeprecatedField {
            field: "publisher.url".into(),
            replacement: "publisher.homepage".into(),
        });
        Some(u.to_string())
    } else {
        None
    };

    // contactPoint preferred; contact: string deprecated.
    let contact_points = obj.get("contactPoint")
        .map(parse_contact_points)
        .unwrap_or_else(|| Ok(Vec::new()))?;
    let legacy_contact = obj.get("contact").and_then(|v| v.as_str()).map(String::from);
    if legacy_contact.is_some() {
        warnings.push(RegistryWarning::DeprecatedField {
            field: "publisher.contact".into(),
            replacement: "publisher.contactPoint".into(),
        });
    }

    Ok((Publisher { name, homepage, contact_points, legacy_contact }, warnings))
}

fn parse_contact_points(val: &Value) -> Result<Vec<ContactPoint>, RegistryError> {
    let arr_value;
    let items: &[Value] = if let Some(arr) = val.as_array() {
        arr
    } else {
        arr_value = vec![val.clone()];
        &arr_value
    };
    items.iter().map(parse_one_contact_point).collect()
}

fn parse_one_contact_point(v: &Value) -> Result<ContactPoint, RegistryError> {
    let obj = v.as_object()
        .ok_or_else(|| RegistryError::InvalidField("contactPoint must be object".into()))?;
    let str_at = |k| obj.get(k).and_then(|v| v.as_str()).map(String::from);
    let lang = obj.get("availableLanguage")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    Ok(ContactPoint {
        contact_type: str_at("contactType"),
        email:        str_at("email"),
        telephone:    str_at("telephone"),
        url:          str_at("url"),
        available_language: lang,
    })
}
```

- [ ] **Step 5: Surface warnings on `Registry` in `registry.rs`**

Add field:

```rust
pub struct Registry {
    pub publisher: Publisher,
    pub published: String,
    pub warnings: Vec<RegistryWarning>,
    pub(super) entries: Vec<RegistryEntry>,
    pub(super) by_name: std::collections::HashMap<String, Vec<usize>>,
}
```

Update `Registry::from_json` (or whichever constructor exists) to thread warnings through from `parse_publisher`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cargo nextest run -p formspec-core registry_client::tests`
Expected: PASS (new + pre-existing).

- [ ] **Step 7: Run full Rust workspace**

Run: `cargo nextest run --workspace`
Expected: ALL PASS.

- [ ] **Step 8: Commit**

```bash
git add crates/formspec-core/src/registry_client/
git commit -m "feat(registry-client): Publisher extends Party; deprecation warnings for legacy {url, contact}"
```

---

## Phase C — Generated TypeScript types

### Task C1: Regenerate `formspec-types` from updated schemas

**Files:**
- Regenerate: `packages/formspec-types/src/generated/{common,definition,response,registry,ontology,issuer}.ts`
- Regenerate: `packages/formspec-types/src/generated/index.ts` (barrel re-exports)

- [ ] **Step 1: Verify the generator picks up `issuer.schema.json`**

Check `scripts/generate-types.mjs` (or equivalent) — confirm it walks `schemas/*.schema.json`. If `issuer.schema.json` isn't auto-discovered, add it to the generator config.

```bash
grep -n "issuer\|definition\|registry" scripts/generate-types.mjs
```

- [ ] **Step 2: Regenerate**

```bash
npm run docs:generate
```

- [ ] **Step 3: Inspect generated output**

```bash
ls packages/formspec-types/src/generated/issuer.ts
git diff packages/formspec-types/src/generated/registry.ts | head -50
```

Confirm `Issuer` type emitted with `kind` union, `logo` variants, `parentOrganization` URL, `jurisdiction` shape; `Publisher` shows new `homepage` + `contactPoint` and legacy fields marked optional.

- [ ] **Step 4: Build TypeScript**

```bash
npm run build
```

Expected: clean build, no type errors.

- [ ] **Step 5: Run TypeScript tests**

```bash
npm test -- --run packages/formspec-types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/formspec-types/src/generated/
git commit -m "build(types): regenerate Issuer + migrated Publisher TypeScript types"
```

---

## Phase D — Spec authoring (canonical prose + core spec edits)

### Task D1: Create `specs/issuer/issuer-spec.md`

**Files:**
- Create: `specs/issuer/issuer-spec.md`
- Create: `specs/issuer/issuer-spec.bluf.md`

The canonical spec is the spec document itself (`thoughts/specs/2026-05-21-issuer-sidecar.md`) lifted into the conformant `specs/issuer/` location with standard front matter and BLUF markers.

- [ ] **Step 1: Author `specs/issuer/issuer-spec.bluf.md`**

```markdown
- This document defines the Formspec Issuer Document — a sidecar declaring who is asking the form (respondent-facing chrome identity).
- Cardinality is inverse to locale/references/ontology: one Issuer publishes many Definitions; Definitions point OUT via `definition.issuer`.
- The shared `Party` base (`common.schema.json#/$defs/Party`) collapses Registry/Ontology Publisher duplication.
- Resolution cascade: host override > Definition declaration > unbranded fallback. Receipt-side `displayedIssuer` pins the resolved Issuer at submit-time inside the signed-payload preimage.
- This BLUF is governed by `schemas/issuer.schema.json`; generated schema references are the canonical structural contract.
```

- [ ] **Step 2: Author `specs/issuer/issuer-spec.md`**

Use `specs/locale/locale-spec.md` as the structural template (front matter, Conventions/Terminology, BLUF block markers, numbered sections). The body is the spec under `thoughts/specs/2026-05-21-issuer-sidecar.md` reorganized into normative form:

1. Status of This Document
2. Conventions and Terminology
3. Bottom Line Up Front (BLUF marker block)
4. Introduction (The Gap, Glossary disambiguation, Who Benefits)
5. Cardinality and Cardinal Asymmetry (Issuer vs Publisher; "Why this binds differently")
6. Party Base (forward reference to `common.schema.json`)
7. Issuer Document (required fields, optional identity, optional presentation, extensions, kind disambiguation, jurisdiction, logo variants)
8. Localization (inline LangMap; JSON-LD `@container: @language`)
9. Hierarchy (linear chain, flat helpers, cycle/depth caps, parent fetch failure, inline-with-parent)
10. Binding to Definition (`definition.issuer` oneOf inline | {url})
11. Resolution Cascade (host > definition > unbranded; two-chain rule)
12. Host-Override Transports (embed-time config object, query parameter, embed-beats-query)
13. Receipt Audit Pin (`displayedIssuer`; signed-payload inclusion; v1 boundary)
14. Caching and Version Pinning (Cache-Control / ETag / content-hash)
15. Theme Relationship (bright line)
16. Schema.org Mapping (crosswalk + VC reserved-term audit)
17. Worked Examples
18. Conformance (cross-reference fixture corpus under `tests/fixtures/issuer/`)
19. Security Considerations (query-parameter override allowlist + visible indicator)
20. Non-Goals
21. Open Questions
22. Cross-References

Front matter:

```yaml
---
title: Formspec Issuer Specification
version: 1.0.0-draft.1
date: 2026-05-21
status: draft
---
```

- [ ] **Step 3: Run docs generation**

```bash
npm run docs:generate
```

Expected: `issuer-spec.llm.md` produced; `issuer-spec.md` BLUF marker block populated from `issuer-spec.bluf.md`.

- [ ] **Step 4: Run docs check**

```bash
npm run docs:check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add specs/issuer/
git commit -m "docs(issuer): canonical Issuer specification (sibling to locale/references/ontology)"
```

---

### Task D2: Add JSON-LD `@context` document

**Files:**
- Create: `specs/issuer/context.jsonld`

- [ ] **Step 1: Author the `@context`**

```json
{
  "@context": {
    "@version": 1.1,
    "schema": "https://schema.org/",
    "Issuer": "schema:Organization",
    "name":               { "@id": "schema:name",         "@container": "@language" },
    "displayName":        { "@id": "schema:alternateName","@container": "@language" },
    "shortName":          { "@id": "schema:alternateName","@container": "@language" },
    "identifier":         { "@id": "schema:identifier",   "@type": "@id" },
    "homepage":           { "@id": "schema:url",          "@type": "@id" },
    "parentOrganization": { "@id": "schema:parentOrganization", "@type": "@id" },
    "organizationName":   { "@id": "schema:parentOrganization", "@container": "@language" },
    "departmentName":     { "@id": "schema:department",   "@container": "@language" },
    "jurisdiction":       { "@id": "schema:jurisdiction" },
    "logo":               { "@id": "schema:logo" },
    "contactPoint":       { "@id": "schema:contactPoint" },
    "kind":               { "@id": "schema:additionalType" }
  }
}
```

- [ ] **Step 2: Write schema.org-projection conformance fixture stub**

Drop placeholder under `tests/fixtures/issuer/schemaorg-projection/`:
- `issuer.json` — example Issuer doc.
- `context.jsonld` — copy of `specs/issuer/context.jsonld`.
- `expected-jsonld.json` — the projection result.

(Actual fixture content lands in Phase F.)

- [ ] **Step 3: Commit**

```bash
git add specs/issuer/context.jsonld
git commit -m "docs(issuer): publish JSON-LD @context for schema.org projection"
```

---

### Task D3: Add §"Issuer binding" to `specs/core/spec.md`

**Files:**
- Modify: `specs/core/spec.md`

- [ ] **Step 1: Locate the insertion point**

`grep -n "^## " specs/core/spec.md` — find the section ordering. Insert §"Issuer binding" immediately after the existing "Signed Response Payload" section (so the `displayedIssuer` cross-reference lands close).

- [ ] **Step 2: Write the section**

The section covers (each with one short paragraph or bullet list):

1. The `definition.issuer` property (inline vs `{url}` shape; oneOf discriminator note).
2. Resolution cascade (host override > Definition declaration > unbranded fallback).
3. Host-override transports (embed config object — programmatic, trusted; `?_issuer=` query — respondent-controlled, MUST be allowlisted, MUST show visible indicator).
4. Two-chain rule (host override consumes only the host-injected Issuer's chain; Definition's chain is not walked).
5. Theme / Issuer bright line (Theme is presentation tier; Issuer is identity data; logo URL lives in Issuer doc).
6. Receipt-side `displayedIssuer` — cross-reference to existing "Signed Response Payload" section; explicit statement that it is inside the signed-payload preimage by the existing `authoredSignatures`-only omission rule and that no canonicalization-profile change is required.
7. Forward pointer to `specs/issuer/issuer-spec.md` for the full sidecar spec.

- [ ] **Step 3: Regenerate docs**

```bash
npm run docs:generate && npm run docs:check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add specs/core/spec.md specs/core/spec.llm.md
git commit -m "docs(core): add §Issuer binding (cascade, transports, displayedIssuer cross-ref)"
```

---

### Task D4: Add v1 boundary note to Respondent Ledger spec

**Files:**
- Modify: `specs/audit/respondent-ledger-spec.md`

- [ ] **Step 1: Find the appropriate insertion point**

`grep -n "## \|### " specs/audit/respondent-ledger-spec.md` — find the "Non-Goals" or "Out of Scope" section, or the "Event Taxonomy" section.

- [ ] **Step 2: Add the note**

```markdown
### Issuer pinning (v1 boundary)

Response `displayedIssuer` (`schemas/response.schema.json#/properties/displayedIssuer`)
is the canonical submit-time pin of the resolved Issuer (after host-override
resolution). Per-event Issuer-displayed-during-this-event is **not** recorded in
the Respondent Ledger in v1. A long-running draft where the host-override Issuer
changes mid-session records only the final Issuer at submit. See
`specs/issuer/issuer-spec.md` §Receipt Audit Pin for the full v1 boundary.
```

- [ ] **Step 3: Commit**

```bash
git add specs/audit/respondent-ledger-spec.md
git commit -m "docs(audit): note v1 displayedIssuer boundary in Respondent Ledger spec"
```

---

## Phase E — Engine: IssuerStore + cascade + parent walk + receipt capture

### Task E1: Define Issuer / Party / LangMap / IssuerSource types

**Files:**
- Create: `packages/formspec-engine/src/issuer/types.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/formspec-engine/tests/issuer/types.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Issuer, IssuerSource, ResolvedIssuer } from '../../src/issuer/types';

describe('Issuer types', () => {
  it('IssuerSource is a discriminated union', () => {
    const inline: IssuerSource = { kind: 'inline', issuer: {} as Issuer };
    const url:    IssuerSource = { kind: 'url',    url: 'https://x' };
    expect(inline.kind).toBe('inline');
    expect(url.kind).toBe('url');
  });

  it('ResolvedIssuer carries primary + chain', () => {
    const r: ResolvedIssuer = { primary: {} as Issuer, chain: [], source: 'definition' };
    expect(r.source).toBe('definition');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-engine/tests/issuer/types.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Author `types.ts`**

```ts
/** @filedesc Issuer / Party / LangMap / IssuerSource type declarations (schema-mirrored). */
export type LangMap = Record<string, string>;
export type StringOrLangMap = string | LangMap;

export interface ContactPoint {
    contactType?: string;
    email?: string;
    telephone?: string;
    url?: string;
    availableLanguage?: string[];
}

export interface Jurisdiction {
    level: 'federal'|'state'|'county'|'municipal'|'tribal'|'international'|'private'|'individual';
    name: string;
    code?: string;
}

export interface LogoVariant {
    url: string;
    altText?: StringOrLangMap;
    aspectRatio?: string;
    preferredBackground?: 'light'|'dark'|'any';
}

export interface Issuer {
    $formspecIssuer: '1.0';
    url: string;
    version: string;
    name: StringOrLangMap;
    kind: 'organization'|'department'|'program'|'individual';
    displayName?: StringOrLangMap;
    shortName?: StringOrLangMap;
    identifier?: string;
    homepage?: string;
    parentOrganization?: string;
    organizationName?: StringOrLangMap;
    departmentName?: StringOrLangMap;
    jurisdiction?: Jurisdiction;
    defaultLanguage?: string;
    logo?: { primary?: LogoVariant; wordmark?: LogoVariant; monochrome?: LogoVariant };
    contactPoint?: ContactPoint | ContactPoint[];
    extensions?: Record<string, unknown>;
}

export type IssuerSource =
    | { kind: 'inline'; issuer: Issuer }
    | { kind: 'url';    url: string };

export type IssuerResolutionSource = 'host-embed'|'host-query'|'definition'|'unbranded';

export interface ResolvedIssuer {
    primary: Issuer;
    chain: Issuer[];               // [primary, parent, grandparent, …]; may be truncated at depth 8.
    source: IssuerResolutionSource;
    degraded?: { reason: 'parent-fetch-failed'|'depth-capped'|'cycle-detected'; atUrl?: string };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/formspec-engine/tests/issuer/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/formspec-engine/src/issuer/types.ts packages/formspec-engine/tests/issuer/types.test.ts
git commit -m "feat(engine): Issuer / IssuerSource / ResolvedIssuer type declarations"
```

---

### Task E2: Implement LangMap resolution

**Files:**
- Create: `packages/formspec-engine/src/issuer/LangMap.ts`
- Test: `packages/formspec-engine/tests/issuer/LangMap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveLangValue } from '../../src/issuer/LangMap';

describe('resolveLangValue', () => {
  it('returns plain string as-is', () => {
    expect(resolveLangValue('X', 'fr', 'en')).toBe('X');
  });
  it('exact match wins', () => {
    expect(resolveLangValue({ en: 'A', fr: 'B' }, 'fr', 'en')).toBe('B');
  });
  it('regional falls back to base tag', () => {
    expect(resolveLangValue({ en: 'A' }, 'en-US', 'en')).toBe('A');
  });
  it('falls back to defaultLanguage', () => {
    expect(resolveLangValue({ en: 'A', es: 'B' }, 'fr', 'en')).toBe('A');
  });
  it('falls back to first key as last resort', () => {
    expect(resolveLangValue({ zz: 'Z' }, 'fr', 'en')).toBe('Z');
  });
  it('returns undefined for empty map', () => {
    expect(resolveLangValue({}, 'fr', 'en')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-engine/tests/issuer/LangMap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/** @filedesc BCP 47-aware LangMap resolver with regional and defaultLanguage fallback. */
import type { StringOrLangMap } from './types';

export function resolveLangValue(
    value: StringOrLangMap | undefined,
    requested: string,
    defaultLanguage: string,
): string | undefined {
    if (value == null) return undefined;
    if (typeof value === 'string') return value;
    if (value[requested] != null) return value[requested];
    const base = requested.split('-')[0];
    if (base !== requested && value[base] != null) return value[base];
    if (value[defaultLanguage] != null) return value[defaultLanguage];
    const first = Object.keys(value)[0];
    return first ? value[first] : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/formspec-engine/tests/issuer/LangMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/formspec-engine/src/issuer/LangMap.ts packages/formspec-engine/tests/issuer/LangMap.test.ts
git commit -m "feat(engine): LangMap BCP 47 fallback resolver"
```

---

### Task E3: IssuerFetcher port (DI seam) + default browser implementation

**Files:**
- Create: `packages/formspec-engine/src/issuer/IssuerFetcher.ts`
- Test: `packages/formspec-engine/tests/issuer/IssuerFetcher.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { FetchIssuerFetcher } from '../../src/issuer/IssuerFetcher';
import type { Issuer } from '../../src/issuer/types';

const ISSUER: Issuer = {
  $formspecIssuer: '1.0', url: 'https://x/i.json', version: '1.0.0',
  name: 'X', kind: 'organization',
};

describe('FetchIssuerFetcher', () => {
  it('fetches and parses an Issuer doc', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(ISSUER), {
      status: 200, headers: { 'content-type': 'application/json' }
    }));
    const f = new FetchIssuerFetcher({ fetch });
    const got = await f.fetch('https://x/i.json');
    expect(got.issuer.name).toBe('X');
  });

  it('throws on non-2xx', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const f = new FetchIssuerFetcher({ fetch });
    await expect(f.fetch('https://x/i.json')).rejects.toThrow(/404/);
  });

  it('verifies +sha256-<hex> content hash when present in version', async () => {
    // Pre-compute the correct hash of the canonical JSON of ISSUER for a pinned version.
    const pinned: Issuer = { ...ISSUER, version: '1.0.0+sha256-DEADBEEF'.padEnd('1.0.0+sha256-'.length + 64, 'a') };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(pinned), { status: 200 }));
    const f = new FetchIssuerFetcher({ fetch });
    await expect(f.fetch('https://x/i.json')).rejects.toThrow(/content hash/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-engine/tests/issuer/IssuerFetcher.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/** @filedesc Issuer document HTTP fetcher port + default fetch-backed adapter. */
import type { Issuer } from './types';

export interface IssuerFetchResult {
    issuer: Issuer;
    rawBytes: Uint8Array;
    etag?: string;
    cacheControl?: string;
}

export interface IssuerFetcher {
    fetch(url: string): Promise<IssuerFetchResult>;
}

export interface FetchIssuerFetcherOptions {
    fetch?: typeof globalThis.fetch;
}

export class FetchIssuerFetcher implements IssuerFetcher {
    private readonly _fetch: typeof globalThis.fetch;
    constructor(opts: FetchIssuerFetcherOptions = {}) {
        this._fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
    }
    async fetch(url: string): Promise<IssuerFetchResult> {
        const res = await this._fetch(url);
        if (!res.ok) throw new Error(`Issuer fetch ${url} returned ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        const issuer = JSON.parse(new TextDecoder().decode(bytes)) as Issuer;
        await verifyContentHash(issuer, bytes);
        return {
            issuer, rawBytes: bytes,
            etag: res.headers.get('etag') ?? undefined,
            cacheControl: res.headers.get('cache-control') ?? undefined,
        };
    }
}

async function verifyContentHash(issuer: Issuer, bytes: Uint8Array): Promise<void> {
    const m = /\+sha256-([0-9a-f]{64})$/.exec(issuer.version);
    if (!m) return;
    const expected = m[1];
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (actual !== expected) {
        throw new Error(`Issuer ${issuer.url} content hash mismatch (expected ${expected}, got ${actual})`);
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/formspec-engine/tests/issuer/IssuerFetcher.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/formspec-engine/src/issuer/IssuerFetcher.ts packages/formspec-engine/tests/issuer/IssuerFetcher.test.ts
git commit -m "feat(engine): IssuerFetcher port + fetch-backed adapter with sha256 content-hash check"
```

---

### Task E4: IssuerStore — cache, cascade, parent walk (cycle + depth + fail-soft)

**Files:**
- Create: `packages/formspec-engine/src/issuer/IssuerStore.ts`
- Test: `packages/formspec-engine/tests/issuer/IssuerStore.test.ts`

- [ ] **Step 1: Write the failing test (multi-case)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { IssuerStore, MAX_CHAIN_DEPTH } from '../../src/issuer/IssuerStore';
import type { Issuer, IssuerFetchResult } from '../../src/issuer/types';
import type { IssuerFetcher } from '../../src/issuer/IssuerFetcher';

function mkIssuer(p: Partial<Issuer> & { url: string }): Issuer {
    return { $formspecIssuer: '1.0', version: '1.0.0', name: p.url, kind: 'organization', ...p };
}

function mkFetcher(docs: Record<string, Issuer | 'error'>): IssuerFetcher {
    return {
        async fetch(url: string): Promise<IssuerFetchResult> {
            const v = docs[url];
            if (!v || v === 'error') throw new Error(`mock fetch failed for ${url}`);
            const bytes = new TextEncoder().encode(JSON.stringify(v));
            return { issuer: v, rawBytes: bytes };
        }
    };
}

describe('IssuerStore', () => {
  it('resolves cascade: host-embed wins', async () => {
    const def = mkIssuer({ url: 'https://x/def.json' });
    const host = mkIssuer({ url: 'https://x/host.json' });
    const store = new IssuerStore(mkFetcher({}));
    const r = await store.resolve({
        definitionIssuer: { kind: 'inline', issuer: def },
        hostOverride:     { kind: 'inline', issuer: host },
    });
    expect(r.source).toBe('host-embed');
    expect(r.primary.url).toBe('https://x/host.json');
  });

  it('falls back to Definition issuer when no host override', async () => {
    const def = mkIssuer({ url: 'https://x/def.json' });
    const store = new IssuerStore(mkFetcher({}));
    const r = await store.resolve({ definitionIssuer: { kind: 'inline', issuer: def } });
    expect(r.source).toBe('definition');
    expect(r.primary.url).toBe('https://x/def.json');
  });

  it('produces unbranded fallback when both absent', async () => {
    const store = new IssuerStore(mkFetcher({}));
    const r = await store.resolve({});
    expect(r.source).toBe('unbranded');
  });

  it('walks parent chain three levels', async () => {
    const leaf = mkIssuer({ url: 'L', parentOrganization: 'M' });
    const mid  = mkIssuer({ url: 'M', parentOrganization: 'R' });
    const root = mkIssuer({ url: 'R' });
    const store = new IssuerStore(mkFetcher({ L: leaf, M: mid, R: root }));
    const r = await store.resolve({ definitionIssuer: { kind: 'inline', issuer: leaf } });
    expect(r.chain.map(i => i.url)).toEqual(['L', 'M', 'R']);
  });

  it('detects cycles and emits degraded reason', async () => {
    const a = mkIssuer({ url: 'A', parentOrganization: 'B' });
    const b = mkIssuer({ url: 'B', parentOrganization: 'A' });
    const store = new IssuerStore(mkFetcher({ A: a, B: b }));
    const r = await store.resolve({ definitionIssuer: { kind: 'inline', issuer: a } });
    expect(r.degraded?.reason).toBe('cycle-detected');
  });

  it('caps chain depth at MAX_CHAIN_DEPTH', async () => {
    const docs: Record<string, Issuer> = {};
    for (let i = 0; i < MAX_CHAIN_DEPTH + 2; i++) {
        const url = `${i}`;
        const next = `${i + 1}`;
        docs[url] = mkIssuer({ url, parentOrganization: next });
    }
    docs[`${MAX_CHAIN_DEPTH + 2}`] = mkIssuer({ url: `${MAX_CHAIN_DEPTH + 2}` });
    const store = new IssuerStore(mkFetcher(docs));
    const r = await store.resolve({ definitionIssuer: { kind: 'url', url: '0' } });
    expect(r.chain.length).toBe(MAX_CHAIN_DEPTH);
    expect(r.degraded?.reason).toBe('depth-capped');
  });

  it('fails soft on parent fetch failure (uses success-portion of chain)', async () => {
    const leaf = mkIssuer({ url: 'L', parentOrganization: 'M', organizationName: 'Leaf Org' });
    const store = new IssuerStore(mkFetcher({ L: leaf, M: 'error' }));
    const r = await store.resolve({ definitionIssuer: { kind: 'inline', issuer: leaf } });
    expect(r.chain.map(i => i.url)).toEqual(['L']);
    expect(r.degraded?.reason).toBe('parent-fetch-failed');
    expect(r.degraded?.atUrl).toBe('M');
  });

  it('two-chain rule: host override blocks Definition chain walk', async () => {
    const defIssuer = mkIssuer({ url: 'D', parentOrganization: 'D-PARENT' });
    const host      = mkIssuer({ url: 'H', parentOrganization: 'H-PARENT' });
    const hostParent = mkIssuer({ url: 'H-PARENT' });
    const fetch = vi.fn(async (url: string): Promise<IssuerFetchResult> => {
        const docs: Record<string, Issuer> = { 'H': host, 'H-PARENT': hostParent };
        const v = docs[url];
        if (!v) throw new Error(`unexpected fetch: ${url}`);
        return { issuer: v, rawBytes: new TextEncoder().encode(JSON.stringify(v)) };
    });
    const store = new IssuerStore({ fetch });
    const r = await store.resolve({
        definitionIssuer: { kind: 'inline', issuer: defIssuer },
        hostOverride:     { kind: 'inline', issuer: host },
    });
    expect(r.chain.map(i => i.url)).toEqual(['H', 'H-PARENT']);
    expect(fetch).not.toHaveBeenCalledWith('D-PARENT');
  });

  it('caches by URL and reuses on second resolve', async () => {
    const leaf = mkIssuer({ url: 'L' });
    const fetcher = mkFetcher({ L: leaf });
    const spy = vi.spyOn(fetcher, 'fetch');
    const store = new IssuerStore(fetcher);
    await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
    await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('invalidates cache when version differs', async () => {
    const v1 = mkIssuer({ url: 'L', version: '1.0.0' });
    const v2 = mkIssuer({ url: 'L', version: '1.0.1' });
    let serve = v1;
    const fetcher: IssuerFetcher = {
        async fetch() { return { issuer: serve, rawBytes: new TextEncoder().encode(JSON.stringify(serve)) }; }
    };
    const store = new IssuerStore(fetcher);
    const a = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
    expect(a.primary.version).toBe('1.0.0');
    serve = v2;
    store.invalidate('L');
    const b = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
    expect(b.primary.version).toBe('1.0.1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-engine/tests/issuer/IssuerStore.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement IssuerStore**

```ts
/** @filedesc Issuer fetch + cache + cascade + parent-chain walk with cycle/depth guards. */
import type { Issuer, IssuerSource, ResolvedIssuer } from './types';
import type { IssuerFetcher } from './IssuerFetcher';

export const MAX_CHAIN_DEPTH = 8;

export interface IssuerResolveInput {
    definitionIssuer?: IssuerSource;
    hostOverride?: IssuerSource;
}

export class IssuerStore {
    private readonly cache = new Map<string, Issuer>();

    constructor(private readonly fetcher: IssuerFetcher) {}

    invalidate(url: string): void {
        this.cache.delete(url);
    }

    async resolve(input: IssuerResolveInput): Promise<ResolvedIssuer> {
        if (input.hostOverride) {
            const primary = await this.materialize(input.hostOverride);
            return this.walkChain(primary, 'host-embed');
        }
        if (input.definitionIssuer) {
            const primary = await this.materialize(input.definitionIssuer);
            return this.walkChain(primary, 'definition');
        }
        return { primary: unbranded(), chain: [], source: 'unbranded' };
    }

    private async materialize(src: IssuerSource): Promise<Issuer> {
        if (src.kind === 'inline') {
            this.cache.set(src.issuer.url, src.issuer);
            return src.issuer;
        }
        return this.fetchCached(src.url);
    }

    private async fetchCached(url: string): Promise<Issuer> {
        const hit = this.cache.get(url);
        if (hit) return hit;
        const { issuer } = await this.fetcher.fetch(url);
        this.cache.set(url, issuer);
        return issuer;
    }

    private async walkChain(primary: Issuer, source: ResolvedIssuer['source']): Promise<ResolvedIssuer> {
        const chain: Issuer[] = [primary];
        const seen = new Set<string>([primary.url]);
        let cursor: Issuer = primary;
        let degraded: ResolvedIssuer['degraded'];

        while (cursor.parentOrganization) {
            if (chain.length >= MAX_CHAIN_DEPTH) {
                degraded = { reason: 'depth-capped', atUrl: cursor.parentOrganization };
                break;
            }
            const parentUrl = cursor.parentOrganization;
            if (seen.has(parentUrl)) {
                degraded = { reason: 'cycle-detected', atUrl: parentUrl };
                break;
            }
            try {
                const parent = await this.fetchCached(parentUrl);
                chain.push(parent);
                seen.add(parentUrl);
                cursor = parent;
            } catch {
                degraded = { reason: 'parent-fetch-failed', atUrl: parentUrl };
                break;
            }
        }
        return { primary, chain, source, degraded };
    }
}

function unbranded(): Issuer {
    return {
        $formspecIssuer: '1.0', url: 'about:unbranded', version: '0.0.0',
        name: '', kind: 'organization',
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/formspec-engine/tests/issuer/IssuerStore.test.ts`
Expected: PASS (all 10 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/formspec-engine/src/issuer/IssuerStore.ts packages/formspec-engine/tests/issuer/IssuerStore.test.ts
git commit -m "feat(engine): IssuerStore — cascade, parent walk, cycle/depth/fail-soft, two-chain rule"
```

---

### Task E5: Wire IssuerStore into FormEngine

**Files:**
- Modify: `packages/formspec-engine/src/engine/FormEngine.ts`
- Modify: `packages/formspec-engine/src/interfaces.ts`
- Modify: `packages/formspec-engine/src/issuer/index.ts` (create barrel)

- [ ] **Step 1: Write the failing engine integration test**

Create `packages/formspec-engine/tests/issuer/FormEngine.issuer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FormEngine, initFormspecEngine } from '../../src';
import type { Issuer } from '../../src/issuer/types';

const ISSUER: Issuer = {
    $formspecIssuer: '1.0',
    url: 'https://x/issuer.json',
    version: '1.0.0',
    name: 'Issuer A',
    kind: 'organization',
};

const DEF = {
    $formspec: '1.0',
    url: 'https://x/forms/f',
    version: '1.0.0',
    title: 'Form',
    items: [],
    issuer: ISSUER,
};

describe('FormEngine — Issuer', () => {
  it('exposes resolved Issuer after setDefinition', async () => {
    await initFormspecEngine();
    const engine = new FormEngine();
    await engine.setDefinition(DEF as any);
    const r = await engine.getResolvedIssuer();
    expect(r.primary.url).toBe('https://x/issuer.json');
    expect(r.source).toBe('definition');
  });

  it('host override beats Definition Issuer', async () => {
    await initFormspecEngine();
    const engine = new FormEngine();
    const host: Issuer = { ...ISSUER, url: 'https://host/issuer.json', name: 'Host' };
    engine.setIssuerOverride({ kind: 'inline', issuer: host });
    await engine.setDefinition(DEF as any);
    const r = await engine.getResolvedIssuer();
    expect(r.primary.url).toBe('https://host/issuer.json');
    expect(r.source).toBe('host-embed');
  });

  it('Response.displayedIssuer pins resolved Issuer at submit', async () => {
    await initFormspecEngine();
    const engine = new FormEngine();
    await engine.setDefinition(DEF as any);
    const response = await engine.getResponse();
    expect(response.displayedIssuer).toEqual({
        url: 'https://x/issuer.json',
        version: '1.0.0',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-engine/tests/issuer/FormEngine.issuer.test.ts`
Expected: FAIL — engine methods undefined.

- [ ] **Step 3: Add interfaces**

In `packages/formspec-engine/src/interfaces.ts`:

```ts
import type { IssuerSource, ResolvedIssuer } from './issuer/types';

export interface IFormEngine {
    // ... existing methods ...
    setIssuerOverride(source: IssuerSource | undefined): void;
    getResolvedIssuer(): Promise<ResolvedIssuer>;
}
```

(Locate the existing `IFormEngine` interface; add these two members.)

- [ ] **Step 4: Wire FormEngine**

In `packages/formspec-engine/src/engine/FormEngine.ts`:

- Construct an `IssuerStore` instance (lazily, with `FetchIssuerFetcher` as default).
- Allow constructor injection of a custom `IssuerFetcher` (DI seam).
- Cache the last-resolved `ResolvedIssuer` after `setDefinition`.
- `getResponse()` returns `{ …existing fields, displayedIssuer: { url, version } }` from `resolvedIssuer.primary`. Omit `displayedIssuer` from the response object when `source === 'unbranded'`.

Add the barrel `packages/formspec-engine/src/issuer/index.ts`:

```ts
export * from './types';
export * from './IssuerFetcher';
export * from './IssuerStore';
export * from './LangMap';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/formspec-engine/tests/issuer/FormEngine.issuer.test.ts`
Expected: PASS (3 cases).

- [ ] **Step 6: Run full engine test suite**

Run: `npx vitest run packages/formspec-engine/`
Expected: ALL PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add packages/formspec-engine/src/engine/FormEngine.ts \
        packages/formspec-engine/src/interfaces.ts \
        packages/formspec-engine/src/issuer/index.ts \
        packages/formspec-engine/tests/issuer/FormEngine.issuer.test.ts
git commit -m "feat(engine): wire IssuerStore — setIssuerOverride, getResolvedIssuer, displayedIssuer in Response"
```

---

## Phase F — Webcomponent: chrome render, query override, embed attribute

### Task F1: Query-parameter override parser with origin allowlist

**Files:**
- Create: `packages/formspec-webcomponent/src/issuer/queryOverride.ts`
- Test: `packages/formspec-webcomponent/tests/issuer/queryOverride.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseQueryIssuerOverride } from '../../src/issuer/queryOverride';

describe('parseQueryIssuerOverride', () => {
  it('returns undefined when no _issuer param', () => {
    expect(parseQueryIssuerOverride(new URL('https://app/form'), ['https://allowed'])).toBeUndefined();
  });

  it('returns IssuerSource when origin allowlisted', () => {
    const u = new URL('https://app/form?_issuer=' + encodeURIComponent('https://allowed/issuer.json'));
    const r = parseQueryIssuerOverride(u, ['https://allowed']);
    expect(r).toEqual({ kind: 'url', url: 'https://allowed/issuer.json' });
  });

  it('rejects URL whose origin is not allowlisted', () => {
    const u = new URL('https://app/form?_issuer=' + encodeURIComponent('https://bad/issuer.json'));
    expect(parseQueryIssuerOverride(u, ['https://allowed'])).toBeUndefined();
  });

  it('rejects when allowlist is empty', () => {
    const u = new URL('https://app/form?_issuer=https://allowed/i');
    expect(parseQueryIssuerOverride(u, [])).toBeUndefined();
  });

  it('rejects malformed _issuer values', () => {
    const u = new URL('https://app/form?_issuer=not-a-url');
    expect(parseQueryIssuerOverride(u, ['https://allowed'])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-webcomponent/tests/issuer/queryOverride.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/** @filedesc Parse `?_issuer=` query-parameter override with origin allowlist. */
import type { IssuerSource } from '@formspec/formspec-engine';

export function parseQueryIssuerOverride(
    pageUrl: URL,
    allowedOrigins: readonly string[],
): IssuerSource | undefined {
    const raw = pageUrl.searchParams.get('_issuer');
    if (!raw || allowedOrigins.length === 0) return undefined;
    let url: URL;
    try { url = new URL(raw); } catch { return undefined; }
    if (!allowedOrigins.includes(url.origin)) return undefined;
    return { kind: 'url', url: url.toString() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/formspec-webcomponent/tests/issuer/queryOverride.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/formspec-webcomponent/src/issuer/queryOverride.ts \
        packages/formspec-webcomponent/tests/issuer/queryOverride.test.ts
git commit -m "feat(webcomponent): parse ?_issuer= override with origin allowlist"
```

---

### Task F2: Logo variant selection

**Files:**
- Create: `packages/formspec-webcomponent/src/issuer/logoVariant.ts`
- Test: `packages/formspec-webcomponent/tests/issuer/logoVariant.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { selectLogoVariant } from '../../src/issuer/logoVariant';
import type { Issuer } from '@formspec/formspec-engine';

const FULL: Issuer = {
    $formspecIssuer: '1.0', url: 'x', version: '1.0.0', name: 'X', kind: 'organization',
    logo: {
        primary:    { url: 'p', aspectRatio: '1:1', preferredBackground: 'light' },
        wordmark:   { url: 'w', aspectRatio: '4:1', preferredBackground: 'any' },
        monochrome: { url: 'm', aspectRatio: '1:1', preferredBackground: 'any' },
    },
};

describe('selectLogoVariant', () => {
  it('light + tall picks primary', () => {
    expect(selectLogoVariant(FULL, { mode: 'light', headerWidth: 'wide' })?.url).toBe('p');
  });
  it('dark/high-contrast picks monochrome when present', () => {
    expect(selectLogoVariant(FULL, { mode: 'dark', headerWidth: 'wide' })?.url).toBe('m');
    expect(selectLogoVariant(FULL, { mode: 'high-contrast', headerWidth: 'wide' })?.url).toBe('m');
  });
  it('narrow header picks wordmark when present', () => {
    expect(selectLogoVariant(FULL, { mode: 'light', headerWidth: 'narrow' })?.url).toBe('w');
  });
  it('falls back through variants when preferred is missing', () => {
    const minimal: Issuer = { ...FULL, logo: { primary: { url: 'p' } } };
    expect(selectLogoVariant(minimal, { mode: 'dark', headerWidth: 'narrow' })?.url).toBe('p');
  });
  it('returns undefined when no logo is set', () => {
    expect(selectLogoVariant({ ...FULL, logo: undefined }, { mode: 'light', headerWidth: 'wide' })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-webcomponent/tests/issuer/logoVariant.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
/** @filedesc Logo variant selection per render context. */
import type { Issuer, LogoVariant } from '@formspec/formspec-engine';

export interface LogoRenderContext {
    mode: 'light'|'dark'|'high-contrast';
    headerWidth: 'wide'|'narrow';
}

export function selectLogoVariant(issuer: Issuer, ctx: LogoRenderContext): LogoVariant | undefined {
    const { primary, wordmark, monochrome } = issuer.logo ?? {};
    const dark = ctx.mode !== 'light';
    const narrow = ctx.headerWidth === 'narrow';
    const preferred = dark ? monochrome : narrow ? wordmark : primary;
    return preferred ?? primary ?? wordmark ?? monochrome;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/formspec-webcomponent/tests/issuer/logoVariant.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/formspec-webcomponent/src/issuer/logoVariant.ts \
        packages/formspec-webcomponent/tests/issuer/logoVariant.test.ts
git commit -m "feat(webcomponent): logo variant selection per render context"
```

---

### Task F3: IssuerChrome render component

**Files:**
- Create: `packages/formspec-webcomponent/src/issuer/IssuerChrome.tsx`
- Test: `packages/formspec-webcomponent/tests/issuer/IssuerChrome.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { IssuerChrome } from '../../src/issuer/IssuerChrome';
import type { ResolvedIssuer, Issuer } from '@formspec/formspec-engine';

const ISSUER: Issuer = {
    $formspecIssuer: '1.0', url: 'https://x/i.json', version: '1.0.0',
    name: { en: 'Springfield Health', es: 'Salud Springfield' },
    kind: 'department',
    organizationName: 'City of Springfield',
    contactPoint: { contactType: 'customer support', email: 'h@s.gov' },
    logo: { primary: { url: 'logo.svg', altText: 'X' } },
    defaultLanguage: 'en',
};
const RESOLVED: ResolvedIssuer = { primary: ISSUER, chain: [ISSUER], source: 'definition' };

describe('IssuerChrome', () => {
  it('renders name in requested language', () => {
    const { getByText } = render(<IssuerChrome resolved={RESOLVED} locale="es" /> as any);
    expect(getByText('Salud Springfield')).toBeTruthy();
  });

  it('renders breadcrumb of parent organizationName', () => {
    const { getByText } = render(<IssuerChrome resolved={RESOLVED} locale="en" /> as any);
    expect(getByText(/City of Springfield/)).toBeTruthy();
  });

  it('renders contact email for customer support contactPoint', () => {
    const { getByText } = render(<IssuerChrome resolved={RESOLVED} locale="en" /> as any);
    expect(getByText(/h@s.gov/)).toBeTruthy();
  });

  it('shows visible indicator when source is host-query', () => {
    const { getByText } = render(<IssuerChrome resolved={{ ...RESOLVED, source: 'host-query' }} locale="en" hostOrigin="https://embed" /> as any);
    expect(getByText(/Branding provided by/)).toBeTruthy();
  });

  it('does NOT show indicator when source is host-embed', () => {
    const { queryByText } = render(<IssuerChrome resolved={{ ...RESOLVED, source: 'host-embed' }} locale="en" hostOrigin="https://embed" /> as any);
    expect(queryByText(/Branding provided by/)).toBeNull();
  });

  it('renders unbranded null when source is unbranded', () => {
    const { container } = render(<IssuerChrome resolved={{ ...RESOLVED, source: 'unbranded' }} locale="en" /> as any);
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-webcomponent/tests/issuer/IssuerChrome.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
/** @filedesc Issuer chrome render — name, logo, breadcrumb, contact, visible query-override indicator. */
import { resolveLangValue, type ResolvedIssuer } from '@formspec/formspec-engine';
import { selectLogoVariant } from './logoVariant';

export interface IssuerChromeProps {
    resolved: ResolvedIssuer;
    locale: string;
    hostOrigin?: string;
    mode?: 'light'|'dark'|'high-contrast';
    headerWidth?: 'wide'|'narrow';
}

export function IssuerChrome({ resolved, locale, hostOrigin, mode = 'light', headerWidth = 'wide' }: IssuerChromeProps) {
    if (resolved.source === 'unbranded') return null;
    const issuer = resolved.primary;
    const dflt = issuer.defaultLanguage ?? 'en';
    const displayName = resolveLangValue(issuer.displayName ?? issuer.name, locale, dflt);
    const orgName     = resolveLangValue(issuer.organizationName, locale, dflt);
    const logo        = selectLogoVariant(issuer, { mode, headerWidth });
    const altText     = logo ? resolveLangValue(logo.altText, locale, dflt) : undefined;
    const supportEmail = primaryContactEmail(issuer);

    return (
        <header class="fs-issuer-chrome" data-source={resolved.source}>
            {logo ? <img class="fs-issuer-logo" src={logo.url} alt={altText ?? ''} /> : null}
            <div class="fs-issuer-text">
                <div class="fs-issuer-name">{displayName}</div>
                {orgName ? <div class="fs-issuer-org-breadcrumb">{orgName}</div> : null}
                {supportEmail ? <a class="fs-issuer-support" href={`mailto:${supportEmail}`}>{supportEmail}</a> : null}
            </div>
            {resolved.source === 'host-query'
                ? <div class="fs-issuer-query-indicator" role="status">
                    Branding provided by {hostOrigin ?? 'host'}
                  </div>
                : null}
        </header>
    );
}

function primaryContactEmail(i: ResolvedIssuer['primary']): string | undefined {
    const cps = !i.contactPoint ? []
        : Array.isArray(i.contactPoint) ? i.contactPoint
        : [i.contactPoint];
    return cps.find(cp => cp.contactType === 'customer support')?.email
        ?? cps.find(cp => cp.email != null)?.email;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/formspec-webcomponent/tests/issuer/IssuerChrome.test.tsx`
Expected: PASS (6 cases).

- [ ] **Step 5: Commit**

```bash
git add packages/formspec-webcomponent/src/issuer/IssuerChrome.tsx \
        packages/formspec-webcomponent/tests/issuer/IssuerChrome.test.tsx
git commit -m "feat(webcomponent): IssuerChrome — name/logo/breadcrumb/contact + query-override indicator"
```

---

### Task F4: Wire IssuerChrome into `<formspec-render>` element

**Files:**
- Modify: `packages/formspec-webcomponent/src/element.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/formspec-webcomponent/tests/issuer/element.issuer.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import '../../src/element';

beforeAll(async () => {
    await customElements.whenDefined('formspec-render');
});

describe('<formspec-render> Issuer integration', () => {
  it('accepts an `issuer-override` JSON attribute', async () => {
    const el = document.createElement('formspec-render') as any;
    el.setAttribute('issuer-override', JSON.stringify({
        kind: 'inline',
        issuer: { $formspecIssuer: '1.0', url: 'X', version: '1.0.0', name: 'Override', kind: 'organization' }
    }));
    document.body.appendChild(el);
    expect(el.issuerOverride).toEqual(expect.objectContaining({ kind: 'inline' }));
    el.remove();
  });

  it('accepts `issuerOverride` property', () => {
    const el = document.createElement('formspec-render') as any;
    el.issuerOverride = { kind: 'url', url: 'https://x/i.json' };
    expect(el.issuerOverride.kind).toBe('url');
  });

  it('reads `issuer-allowed-origins` attribute as JSON array', () => {
    const el = document.createElement('formspec-render') as any;
    el.setAttribute('issuer-allowed-origins', '["https://allowed"]');
    expect(el.issuerAllowedOrigins).toEqual(['https://allowed']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/formspec-webcomponent/tests/issuer/element.issuer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Wire the element**

In `packages/formspec-webcomponent/src/element.ts`:

- Declare observed attributes: `issuer-override`, `issuer-allowed-origins`.
- Add reflected properties `issuerOverride: IssuerSource | undefined` and `issuerAllowedOrigins: string[]`.
- On `connectedCallback`: parse query override from `window.location` filtered by `issuerAllowedOrigins`; precedence rules from spec (embed wins over query).
- Pass the resulting `IssuerSource` to the underlying `FormEngine.setIssuerOverride()`.
- After engine resolves, render `<IssuerChrome resolved={resolved} locale={...} hostOrigin={window.location.origin} />` above the form body.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/formspec-webcomponent/tests/issuer/element.issuer.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full webcomponent test suite**

Run: `npx vitest run packages/formspec-webcomponent/`
Expected: ALL PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/formspec-webcomponent/src/element.ts \
        packages/formspec-webcomponent/tests/issuer/element.issuer.test.ts
git commit -m "feat(webcomponent): <formspec-render> wires Issuer override (embed > query) and chrome"
```

---

## Phase G — Conformance fixtures

### Task G1: Author all Issuer conformance fixtures

**Files:**
- Create: `tests/fixtures/issuer/<case-name>/{inputs.json|expected.json|...}` per the fixture list in §"File Structure" above.
- Create: `tests/conformance/test_issuer_fixtures.py`

- [ ] **Step 1: Establish the fixture driver shape**

Skeleton driver, generic across all fixtures:

```python
# tests/conformance/test_issuer_fixtures.py
"""
Drives Issuer conformance fixtures under tests/fixtures/issuer/.

Each fixture directory MUST contain `case.json` with shape:
    { "kind": "<schema-validate|cascade|chain|query-override|...>",
      "inputs": { ... }, "expected": { ... } }
"""
import json, glob
from pathlib import Path
import pytest

CASES = [Path(p).parent for p in glob.glob(str(Path(__file__).parents[1] / "fixtures" / "issuer" / "*" / "case.json"))]

@pytest.mark.parametrize("case_dir", CASES, ids=lambda p: p.name)
def test_issuer_fixture(case_dir):
    case = json.loads((case_dir / "case.json").read_text())
    driver = DRIVERS[case["kind"]]
    driver(case_dir, case)

DRIVERS = {
    "schema-validate":    drive_schema_validate,
    "cascade":            drive_cascade,
    "chain":              drive_chain,
    "query-override":     drive_query_override,
    "logo-variant":       drive_logo_variant,
    "langmap-fallback":   drive_langmap_fallback,
    "content-hash":       drive_content_hash,
    "publisher-legacy":   drive_publisher_legacy,
    "schemaorg-projection": drive_schemaorg_projection,
}
# Each driver implemented below as a thin assertion harness against tests/fixtures.
```

- [ ] **Step 2: Author every fixture listed in the spec's Conformance section + this plan's §"File Structure"**

For each, create the directory under `tests/fixtures/issuer/<case>/` and the `case.json` plus referenced inputs. Driver implementations are conventional asserts. **Do not omit any** — the spec's conformance section is normative.

Cases to author (one fixture directory each, with `case.json`):

1. `inline-vs-ref-equivalence` — kind: `cascade`
2. `chain-walk-three-level` — kind: `chain`
3. `cycle-detection` — kind: `chain`, expected error
4. `depth-cap-truncation` — kind: `chain`, expected warning
5. `parent-fetch-failure` — kind: `chain`, degraded
6. `inline-with-parent` — kind: `chain`
7. `host-override-embed` — kind: `cascade`
8. `host-override-query` — kind: `query-override`
9. `host-override-embed-wins` — kind: `cascade`
10. `query-without-allowlist` — kind: `query-override`, ignored
11. `two-chain-rule` — kind: `cascade`
12. `version-pin-discriminator` — kind: `schema-validate`
13. `langmap-bcp47-enforcement` — kind: `schema-validate`
14. `langmap-fallback` — kind: `langmap-fallback`
15. `logo-variant-selection` — kind: `logo-variant`
16. `extensions-preservation` — kind: `schema-validate` + round-trip byte equality
17. `content-hash-invalidation` — kind: `content-hash`
18. `receipt-audit-pin` — kind: `cascade` + Response shape check
19. `publisher-legacy-roundtrip` — kind: `publisher-legacy`
20. `kind-parent-constraint` — kind: `schema-validate` + lint warning
21. `schemaorg-projection` — kind: `schemaorg-projection`

- [ ] **Step 3: Run fixture suite**

Run: `python3 -m pytest tests/conformance/test_issuer_fixtures.py -v`
Expected: ALL 21 PARAMETRIZED CASES PASS.

- [ ] **Step 4: Run full Python conformance suite**

Run: `python3 -m pytest tests/conformance/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/issuer/ tests/conformance/test_issuer_fixtures.py
git commit -m "test(issuer): conformance fixture corpus (21 cases) covering spec §Conformance"
```

---

### Task G2: Playwright E2E — chrome render, host override, parent failure

**Files:**
- Create: `tests/e2e/playwright/issuer-chrome.spec.ts`
- Create: `tests/e2e/fixtures/issuer/` (definition + issuer JSON fixtures used by Playwright)

- [ ] **Step 1: Write the failing E2E**

```ts
import { test, expect } from '@playwright/test';

test.describe('Issuer chrome — browser', () => {
  test('Definition-declared Issuer renders chrome', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/issuer/golden-path.html');
    await expect(page.locator('.fs-issuer-name')).toHaveText('Springfield Public Health');
  });

  test('Embed-time override replaces chrome', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/issuer/embed-override.html');
    await expect(page.locator('.fs-issuer-name')).toHaveText('State of Massachusetts');
    await expect(page.locator('.fs-issuer-query-indicator')).toHaveCount(0);
  });

  test('Allowlisted ?_issuer= overrides chrome and shows visible indicator', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/issuer/query-allowlisted.html?_issuer=https%3A%2F%2Fallowed%2Fissuer.json');
    await expect(page.locator('.fs-issuer-name')).toHaveText('Allowlisted Org');
    await expect(page.locator('.fs-issuer-query-indicator')).toBeVisible();
  });

  test('Non-allowlisted ?_issuer= is ignored', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/issuer/query-blocked.html?_issuer=https%3A%2F%2Fbad%2Fissuer.json');
    await expect(page.locator('.fs-issuer-name')).toHaveText('Springfield Public Health');
  });

  test('Parent fetch failure degrades gracefully', async ({ page }) => {
    await page.goto('/tests/e2e/fixtures/issuer/parent-failure.html');
    await expect(page.locator('.fs-issuer-name')).toHaveText('Springfield Public Health');
    await expect(page.locator('.fs-issuer-org-breadcrumb')).toHaveText('City of Springfield');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/e2e/playwright/issuer-chrome.spec.ts`
Expected: FAIL — fixture pages don't exist.

- [ ] **Step 3: Author E2E fixture HTML pages**

For each test case create a minimal HTML page under `tests/e2e/fixtures/issuer/` that:
- Loads the `<formspec-render>` web component.
- Inlines (or fetches via `tests/e2e/fixtures/issuer/*.json`) the Definition and Issuer documents.
- Wires the override mechanism (`issuer-override` attribute for embed, query allowlist for query cases).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/e2e/playwright/issuer-chrome.spec.ts`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/playwright/issuer-chrome.spec.ts tests/e2e/fixtures/issuer/
git commit -m "test(e2e): Playwright Issuer chrome — cascade, override, query, parent-failure"
```

---

## Phase H — Docs gate, filemap, package layering

### Task H1: Run the full docs/lint/types gate

- [ ] **Step 1: Regenerate filemap**

```bash
npm run docs:filemap
```

- [ ] **Step 2: Regenerate docs**

```bash
npm run docs:generate
```

- [ ] **Step 3: Run docs check**

```bash
npm run docs:check
```

Expected: PASS.

- [ ] **Step 4: Run dep-fence check**

```bash
npm run check:deps
```

Expected: PASS (engine `IssuerStore` lives in layer 1; webcomponent imports types from engine — layer 2 → 1 is allowed).

- [ ] **Step 5: Commit any filemap deltas**

```bash
git add filemap.json packages/*/src/issuer/*.tsx packages/*/src/issuer/*.ts
git diff --cached --stat
git commit -m "build: regenerate filemap.json and docs artifacts for Issuer sidecar"
```

---

### Task H2: Full-stack test pass

- [ ] **Step 1: Full Rust workspace**

Run: `cargo nextest run --workspace`
Expected: PASS.

- [ ] **Step 2: TypeScript packages**

Run: `npm run build && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Python conformance**

Run: `python3 -m pytest tests/ -v`
Expected: PASS.

- [ ] **Step 4: Playwright E2E**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify no schema validation regressions across the conformance corpus**

Run: `python3 -m formspec.validate tests/fixtures --registry registries/formspec-common.registry.json`
Expected: PASS (no new schema errors on legacy fixtures).

- [ ] **Step 6: If a previously-passing fixture now fails because it carries the legacy `{ name, url, contact }` Publisher form**, treat that as expected migration behavior — the deprecation warning is normative; failure is not. Capture in commit message.

---

### Task H3: Cross-check spec coverage end-to-end

- [ ] **Step 1: Walk the spec's "Files Touched" list (lines 562-585) and confirm every file is modified or created**

Run:

```bash
git diff --stat main -- \
  specs/issuer/ \
  specs/core/spec.md \
  specs/audit/respondent-ledger-spec.md \
  schemas/common.schema.json schemas/definition.schema.json schemas/response.schema.json \
  schemas/registry.schema.json schemas/ontology.schema.json schemas/issuer.schema.json \
  crates/formspec-core/src/registry_client/ \
  crates/formspec-lint/schemas/ \
  packages/formspec-types/src/generated/ \
  packages/formspec-engine/src/issuer/ \
  packages/formspec-engine/src/engine/FormEngine.ts \
  packages/formspec-engine/src/interfaces.ts \
  packages/formspec-webcomponent/src/issuer/ \
  packages/formspec-webcomponent/src/element.ts
```

Expected: every file shows in the stat.

- [ ] **Step 2: Walk the spec's "Conformance" section (21 fixture cases) and confirm each has a fixture directory**

```bash
ls tests/fixtures/issuer/ | wc -l
```

Expected: 21.

- [ ] **Step 3: Self-review against semi-formal-architecture-review**

Per stack `CLAUDE.md` §"Review discipline": dispatch `formspec-specs:semi-formal-architecture-review` as a subagent (background) to review this branch before merge. **Do not self-review.** Reviewer should sanity-check: cascade direction, two-chain rule, signed-payload preimage inclusion of `displayedIssuer`, Publisher deprecation window, JSON-LD `@context` URL forward compatibility.

- [ ] **Step 4: Commit the final integration delta if any**

```bash
git status
git commit -am "build(issuer): final integration commit after spec-coverage cross-check" || echo "clean"
```

---

## Self-Review

**Spec coverage:** every section of `thoughts/specs/2026-05-21-issuer-sidecar.md` traces to at least one task: Glossary → Task D1; Party/LangMap/ContactPoint → A1; Issuer schema → A2; Definition binding → A3; Response audit pin → A4; Publisher migration (schema) → A5, A6; Lint mirror → A7; Publisher migration (Rust) → B1; TS regen → C1; Issuer spec doc → D1; JSON-LD context → D2; Core spec edits → D3; Respondent ledger note → D4; LangMap resolution → E2; IssuerFetcher → E3; IssuerStore (cascade, chain, cycle, depth, fail-soft, two-chain) → E4; Engine wiring → E5; Query override → F1; Logo variant → F2; Chrome render → F3; Element wiring → F4; All 21 conformance fixtures → G1; Playwright → G2; Docs gate → H1; Full-stack test → H2; Cross-check + review → H3.

**Placeholders:** zero (every step shows code or an exact command).

**Type consistency:** `IssuerSource` discriminated union (`kind: 'inline' | 'url'`) used identically in `types.ts`, `IssuerStore.ts`, `queryOverride.ts`, `element.ts`. `ResolvedIssuer.source` enum values (`'host-embed'|'host-query'|'definition'|'unbranded'`) reused identically in `IssuerStore`, `IssuerChrome`, the element wiring, and the Playwright E2E expectations. `MAX_CHAIN_DEPTH = 8` is the single source of truth in `IssuerStore.ts`, referenced from depth-cap fixtures and tests.

**Open items deferred from spec, intentionally not implemented:**
- JSON-LD `@context` *publication URL* (in-repo at `specs/issuer/context.jsonld`; deploy mapping is out of scope).
- `.well-known/formspec-issuer` discovery (spec OQ-5).
- `parentOrganization` version pinning (spec OQ-6).
- `formspec-issuer-trellis-binding` crate (spec Non-Goal; additive future).
- Studio MCP `pick_issuer` (spec Non-Goal).

---

## Execution Handoff

Plan complete and saved to `formspec/thoughts/plans/2026-05-21-issuer-sidecar.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Uses `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Either way, before starting: confirm a clean test baseline (`make test` from `formspec/`) so failures introduced by this work are isolatable.
