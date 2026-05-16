# formspec.frame — An OWL-Inspired Data Science Layer for Formspec

## The Real Problem

Data scientists consuming formspec response data today face these pain points:

1. **Schema discovery** — "What fields exist? What do they mean?" (must read the definition JSON manually)
2. **Type coercion** — Money comes as `{amount, currency}`, dates as ISO strings, choices as opaque value codes
3. **Null semantics** — `null` could mean "not relevant" (structural absence), "skipped" (user didn't answer), or "empty" (explicitly cleared)
4. **Repeat group flattening** — Nested arrays need normalization into separate tables or exploded rows
5. **Option label resolution** — Response has `"severe"`, analyst wants `"Severe (Grade 3)"`
6. **Cross-form alignment** — Two forms both collect "EIN" but call it different things
7. **Computed vs. captured** — Which columns are user input vs. calculated?
8. **Version drift** — Same form, different versions = different schemas

## Design Thesis

Pure OWL would solve problems 6 and partially 1, but data scientists don't use SPARQL or triple stores. The insight is: borrow OWL's *conceptual model* (typed properties, class hierarchies, concept equivalence, controlled vocabularies) but deliver it through **pandas/polars/Arrow/Parquet** — the tools people actually use.

---

## The Extension Registry as Foundation

The extension registry (`specs/registry/extension-registry.md`) already solves a significant portion of the type enrichment and discovery infrastructure needed by `formspec.frame`. Understanding what it covers — and where it stops — shapes the design of the data science layer.

### What the Registry Already Solves

| Data Science Need | Registry Coverage |
|---|---|
| "What does `x-formspec-ein` mean?" | `description` + `displayName` in `metadata` |
| "What's the real type?" | `baseType` + `constraints` (pattern, min/max, maxLength) |
| "Is this sensitive data?" | `metadata.sensitive: true` on SSN, credit card entries |
| "How should I display/parse it?" | `metadata.prefix`, `displayMask`, `inputMode`, `autocomplete` |
| "Is this extension still supported?" | `status` lifecycle (draft → stable → deprecated → retired) |
| "Can I use this with my formspec version?" | `compatibility.formspecVersion` semver range |
| "Where do I get more info?" | `specUrl`, `schemaUrl` |

When `formspec.frame` loads a definition with `"extensions": {"x-formspec-ein": true}`, it can look up the registry and learn: this is a string matching `^\d{2}-\d{7}$`, it's called "Employer Identification Number", it has numeric `inputMode`, and it's not sensitive. That's real value for schema inference and column metadata — no guessing required.

The registry's five extension categories (`dataType`, `function`, `constraint`, `property`, `namespace`) and its `metadata` object on dataType entries provide a natural place for richer type information. The `formspec-common.registry.json` already demonstrates this with entries for email, SSN, EIN, phone, postal code, percentage, USD currency, and credit card — each carrying `baseType`, `constraints`, and presentation `metadata`.

### What the Registry Does NOT Solve

1. **No concept IRIs** — `x-formspec-ein` has a `description` but no machine-readable link to an external concept like `https://irs.gov/terms/ein`. Two registries can describe the same real-world concept with different extension names and there's no way to detect the overlap.

2. **No cross-system equivalences** — No way to declare "this is the same thing as FHIR's `Organization.identifier:ein`" or "schema.org's `taxID`". The `specUrl` and `schemaUrl` point to documentation, not to ontological bindings.

3. **No vocabulary binding** — Registry entries can declare `constraints` and `metadata` for dataType extensions, but there's no mechanism for binding option sets to external terminologies (ICD-10, NAICS, MeSH, etc.).

4. **Classification is binary** — `sensitive: true/false` is the entire classification system. No levels (public/internal/confidential/restricted), no categories (PII vs PHI vs financial), no regulatory tags.

5. **No alignment metadata** — No SKOS-style relationship types between extensions (exact match, broader, narrower).

### The Registry as the Ontology Vehicle

### Why Not Put Ontological Metadata in the Registry?

An earlier draft proposed adding `concept`, `system`, and `equivalents` to the registry's `metadata` object. This was rejected in favor of a **separate Ontology Document sidecar** for these reasons:

1. **`additionalProperties: false`** — The registry entry schema forbids unknown properties. Adding ontological fields requires a registry schema change, coupling ontological evolution to registry spec evolution.

2. **Different authorities** — The extension publisher knows their extension represents an EIN. But the *alignment* between EIN and `schema.org/taxID` may be maintained by a different party (a standards body, a data governance team). Registry = extension publisher's authority. Alignments = potentially someone else's.

3. **Different cadences** — ICD-10 updates annually. The `x-org-icd10` extension might not change at all. Coupling vocabulary versions to extension versions is artificial.

4. **Cross-cutting scope** — Ontological metadata applies to fields *without* extensions, option sets, groups, and mapping rules. The registry only covers extensions. A plain `date` field with no extension still needs a concept IRI.

5. **Composability** — Multiple ontology overlays per form (FHIR overlay for clinical use, DDI overlay for research). This is the sidecar pattern formspec already uses for themes and components.

The registry stays focused on extension mechanics. Ontological metadata lives in a separate `$formspecOntology` sidecar document — see the [Ontology Specification](../../specs/ontology/ontology-spec.md) and [Ontology Schema](../../schemas/ontology.schema.json).

### How the Layers Compose

`formspec.frame` reads three data sources with graceful degradation:

| Data Source | What It Provides | Required? |
|---|---|---|
| **Definition** | Field structure, types, option sets, binds, labels | Yes |
| **Registry** | Extension type enrichment (baseType, constraints, sensitive, displayName) | Optional |
| **Ontology Document** | Concept IRIs, vocabulary bindings, cross-system alignments, JSON-LD context | Optional |

Any layer can be absent and the others still work. Definition alone gives you typed DataFrames. Adding registry gives richer type metadata. Adding ontology gives cross-form alignment and linked data export.

---

## Three Layers

### Layer 1: `formspec.frame` — Definition-Aware DataFrames

A Python module that takes a definition + responses and produces properly typed, metadata-rich DataFrames:

```python
from formspec.frame import FormFrame

ff = FormFrame.from_files(
    definition="grant-application/definition.json",
    responses=["response-001.json", "response-002.json", ...],
    registry="formspec-common.registry.json"  # optional
)

# Main table (scalar fields)
ff.main  # → polars/pandas DataFrame with typed columns

# Repeat group tables (normalized, foreign-keyed)
ff.tables["lineItems"]      # → DataFrame with _response_id FK
ff.tables["subcontracts"]   # → DataFrame with _response_id FK

# Rich column metadata
ff.schema["ein"]
# → ColumnMeta(
#     key="ein",
#     dataType="string",
#     semanticType="us-gov:ein",
#     label="Employer ID Number",
#     source="captured",        # vs "calculated"
#     required=True,
#     extension="x-formspec-ein",
#     options=None,
#     nullSemantics="non-relevant"  # why nulls appear
# )

# Option label resolution
ff.main["severity"]              # → ["mild", "moderate", "severe"]
ff.resolve_labels("severity")    # → ["Mild", "Moderate", "Severe"]

# Export with schema
ff.to_parquet("output/", include_metadata=True)
ff.to_frictionless("datapackage.json")
```

The key insight: **the definition IS the schema**. We don't need to infer types or guess column meanings — the definition declares them. No other form system has this advantage.

What this does under the hood:
- Maps `dataType` → Arrow/pandas types (money → Decimal + currency column, date → datetime64, choice → Categorical)
- Separates repeatable groups into normalized tables with `_response_id` foreign keys
- Tags each column with `source: "captured" | "calculated" | "initial"` from bind analysis
- Distinguishes null reasons: `nonRelevantBehavior` tells us whether nulls mean "removed" vs "empty" vs "kept"
- Carries `semanticType` as column-level metadata (survives Parquet round-trip via Arrow metadata)

### Layer 2: The Ontology Bridge — Concept-Aware Metadata

This is the "OWL-inspired" layer. Not literal OWL files (unless someone wants them), but the *concepts* that make data interoperable:

```python
# Structured semanticType (the key schema change)
# Current: "semanticType": "us-gov:ein"  (free text, useless for machines)
# Proposed:
{
  "semanticType": {
    "concept": "https://irs.gov/terms/ein",
    "system": "https://irs.gov/terms",
    "display": "Employer Identification Number",
    "equivalents": [
      {"system": "https://schema.org", "code": "taxID"},
      {"system": "urn:fhir", "code": "Organization.identifier:ein"}
    ]
  }
}
```

This enables:

```python
from formspec.frame import FormFrame, align

# Load two different forms
grants = FormFrame.from_files("grant-app/definition.json", grant_responses)
compliance = FormFrame.from_files("compliance-report/definition.json", compliance_responses)

# Auto-detect alignable columns via shared concept IRIs
alignment = align(grants, compliance)
# → AlignmentReport:
#     exact:   grants.orgEIN ↔ compliance.taxIdentifier  (same concept IRI)
#     broader: grants.category ↔ compliance.expenseType   (SKOS broader)
#     missing: compliance.auditDate has no counterpart in grants

# Merge datasets on aligned columns
merged = alignment.merge(on="exact")
```

The structured `semanticType` is tiny — one schema property change — but it's the keystone that makes cross-form data science possible without manual column mapping.

**Optional OWL/JSON-LD export for those who want it:**

```python
# Generate JSON-LD context from definition
context = ff.to_jsonld_context()
# → {"@context": {"ein": {"@id": "https://irs.gov/terms/ein", "@type": "xsd:string"}, ...}}

# Generate OWL vocabulary from definition
owl = ff.to_owl()
# → OWL ontology with classes (groups), datatype properties (fields),
#   object properties (nested groups), restrictions (cardinality), individuals (options)

# Generate Frictionless Data Package (most practical for data science)
ff.to_frictionless("datapackage.json")
# → Standard data package descriptor with table schemas, foreign keys,
#   and custom metadata carrying semanticType
```

### Layer 3: Vocabulary Resolution — Controlled Terms

Option sets become first-class vocabulary bindings:

```python
# Definition declares vocabulary binding
{
  "optionSets": {
    "diagnosisCodes": {
      "vocabulary": {
        "system": "http://hl7.org/fhir/sid/icd-10",
        "version": "2024"
      },
      "options": [
        {"value": "F32.1", "label": "Major depressive disorder, single episode, moderate"}
      ]
    }
  }
}
```

```python
# In the data science layer:
ff.vocabularies["diagnosisCodes"]
# → VocabularyBinding(
#     system="http://hl7.org/fhir/sid/icd-10",
#     version="2024",
#     values={"F32.1": "Major depressive disorder, single episode, moderate", ...}
# )

# Cross-vocabulary alignment (via SKOS-style mapping)
ff.vocabularies["diagnosisCodes"].align_to("http://snomed.info/sct")
# → uses registered terminology mappings
```

---

## What Makes This Different From Just "Export to CSV"

The existing pipeline (definition → mapping → adapter → CSV bytes) loses information at every step:

| Lost Information | Current Pipeline | FormFrame |
|---|---|---|
| Column types | All strings in CSV | Arrow-typed columns |
| Null semantics | `""` = missing? skipped? | Tagged: non-relevant / empty / missing |
| Calculated vs captured | Indistinguishable | `source` metadata on each column |
| Option meanings | Opaque codes | Resolvable labels + vocabulary bindings |
| Repeat group structure | Flattened (duplicated scalars) | Normalized tables with FKs |
| Cross-form alignment | Manual column mapping | Auto-alignment via concept IRIs |
| Validation quality | Lost entirely | Available as sidecar metadata |
| Version provenance | Lost | Tracked per response |

---

## What Needs to Change in Formspec (Spec-Level)

Layer 1 (`formspec.frame` core) needs **zero spec changes** — it reads existing definition + response JSON.

Layers 2 and 3 require the **Ontology Document sidecar** — a new companion spec that carries concept IRIs, vocabulary bindings, and cross-system alignments separately from both the definition and the registry.

| Artifact | What It Adds | Status |
|---|---|---|
| [Ontology Specification](../../specs/ontology/ontology-spec.md) | `$formspecOntology` sidecar document format: concepts, vocabularies, alignments, JSON-LD context | Draft |
| [Ontology Schema](../../schemas/ontology.schema.json) | JSON Schema for the sidecar document | Draft |
| [Implementation Plan](../../thoughts/archive/plans/2026-03-23-formspec-frame-implementation.md) | Phase-by-phase build sequence for `src/formspec/frame/` | Draft |

The sidecar approach means **zero changes to the definition schema or registry schema**. The ontology document is a new artifact type that targets a definition by URL, versioned independently, and authored by a potentially different party (standards body, data governance team, domain expert).

## Why This Is Uniquely Feasible for Formspec

The reason this works is that **the definition already contains everything a data dictionary would**: field names, types, descriptions, labels, constraints, cardinality, computed derivations, controlled vocabularies, and version lineage. Other form systems lose this metadata at export time. Formspec can carry it all the way through to the DataFrame because the definition is a first-class, machine-readable artifact.

---

## Related Explorations

- [Compliance deep dive](./2026-03-23-compliance-exploration.md)
- [Security deep dive](./2026-03-23-security-exploration.md)
- [Data ontology deep dive](./2026-03-23-data-ontology-exploration.md)
- [Cross-domain synthesis](./2026-03-23-compliance-security-ontology-synthesis.md)
