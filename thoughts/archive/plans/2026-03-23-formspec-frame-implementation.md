# formspec.frame — Implementation Plan

**Date:** 2026-03-23
**Status:** Draft
**Depends on:** Ontology spec (`specs/ontology/ontology-spec.md`), Ontology schema (`schemas/ontology.schema.json`)

---

## Overview

`formspec.frame` is a Python module that transforms formspec definitions + responses into properly typed, metadata-rich DataFrames for data science consumption. It reads three data sources:

1. **Definition** — field structure, types, option sets, binds (always available)
2. **Registry** — extension type enrichment, sensitivity flags (optional)
3. **Ontology Document** — concept IRIs, vocabulary bindings, alignments (optional)

Layer 1 (definition-aware DataFrames) requires **zero spec changes** and can be built immediately. Layer 2 (cross-form alignment) and Layer 3 (vocabulary resolution) require the Ontology Document sidecar.

---

## Module Structure

```
src/formspec/frame/
  __init__.py          # FormFrame public API, from_files(), from_dicts()
  schema.py            # Definition → ColumnMeta[], table decomposition
  normalize.py         # Repeat group → normalized tables with FKs
  coerce.py            # dataType → Arrow/pandas type mapping
  nulls.py             # nonRelevantBehavior → null tagging
  labels.py            # Option set label resolution
  align.py             # Cross-form alignment via concept IRIs
  ontology.py          # Ontology Document loader and merger
  export/
    __init__.py
    parquet.py          # Arrow + metadata → .parquet files
    frictionless.py     # → datapackage.json (Frictionless Data Package)
    jsonld.py           # → JSON-LD @context (from ontology doc or auto-gen)
    owl.py              # → OWL/RDFS vocabulary (optional, for RDF consumers)
```

---

## Dependencies

| Dependency | Purpose | Required? |
|---|---|---|
| `pyarrow` | Arrow schema, Parquet export, column metadata | Yes |
| `polars` | Primary DataFrame backend (zero-copy Arrow interop) | Yes |
| `pandas` | Optional compatibility (`.to_pandas()` on FormFrame) | Optional |

No other new dependencies. The existing `formspec` package provides definition parsing, response processing, registry loading, and FEL evaluation.

---

## Core API

### FormFrame

```python
class FormFrame:
    """Definition-aware DataFrame container with rich column metadata."""

    @classmethod
    def from_files(
        cls,
        definition: str | Path,
        responses: list[str | Path],
        *,
        registry: str | Path | None = None,
        ontology: str | Path | list[str | Path] | None = None,
    ) -> "FormFrame": ...

    @classmethod
    def from_dicts(
        cls,
        definition: dict,
        responses: list[dict],
        *,
        registry: dict | None = None,
        ontology: dict | list[dict] | None = None,
    ) -> "FormFrame": ...

    # Data access
    main: pl.DataFrame                  # Scalar fields (one row per response)
    tables: dict[str, pl.DataFrame]     # Repeat group tables (FK: _response_id)
    validation: pl.DataFrame | None     # Validation results (optional)

    # Metadata
    schema: dict[str, ColumnMeta]       # Column metadata by field key
    vocabularies: dict[str, VocabularyBinding]   # Bound vocabularies
    definition_url: str
    definition_version: str

    # Operations
    def resolve_labels(self, column: str) -> pl.Series: ...
    def to_pandas(self) -> pd.DataFrame: ...

    # Export
    def to_parquet(self, path: str | Path, *, include_metadata: bool = True) -> None: ...
    def to_frictionless(self, path: str | Path) -> None: ...
    def to_jsonld_context(self) -> dict: ...
    def to_owl(self) -> str: ...
```

### ColumnMeta

```python
@dataclass(frozen=True)
class ColumnMeta:
    """Rich metadata for a single column, derived from definition + registry + ontology."""

    key: str                            # Field key (= column name)
    path: str                           # Full dot-separated path
    data_type: str                      # Formspec dataType
    arrow_type: pa.DataType             # Resolved Arrow type
    label: str | None                   # Human-readable label
    description: str | None             # Field description
    source: Literal["captured", "calculated", "initial"]
    required: bool | str                # True, False, or FEL expression
    semantic_type: str | None           # Raw semanticType from definition
    extension: str | None               # Primary extension name (e.g., "x-formspec-ein")
    sensitive: bool                     # From registry metadata
    options: list[Option] | None        # Resolved option set
    vocabulary: VocabularyBinding | None  # From ontology document
    concept: ConceptBinding | None      # From ontology document
    null_semantics: Literal["removed", "empty", "kept"]  # From nonRelevantBehavior
```

### align()

```python
def align(
    *frames: FormFrame,
) -> AlignmentReport:
    """Auto-detect alignable columns across FormFrames via shared concept IRIs."""
    ...

@dataclass
class AlignmentReport:
    exact: list[ColumnAlignment]     # Same concept IRI
    close: list[ColumnAlignment]     # SKOS closeMatch
    broader: list[ColumnAlignment]   # SKOS broadMatch
    narrower: list[ColumnAlignment]  # SKOS narrowMatch
    related: list[ColumnAlignment]   # SKOS relatedMatch
    unmatched: list[str]             # Fields with no alignment

    def merge(self, *, on: str = "exact") -> pl.DataFrame: ...
```

---

## Implementation Phases

### Phase 1: Definition-Aware DataFrames (no spec changes)

**What:** Load definition + responses → typed DataFrames with column metadata.

**Build sequence:**

1. `schema.py` — Walk the definition item tree. For each field, produce a `ColumnMeta` with:
   - `data_type` from the field's `dataType`
   - `arrow_type` from the type mapping table (see below)
   - `source` from bind analysis (`calculate` → "calculated", `initialValue` → "initial", else "captured")
   - `required` from bind analysis
   - `null_semantics` from `nonRelevantBehavior` (definition-level or per-bind override)
   - `label`, `description` from field properties
   - `options` from resolved option set

2. `normalize.py` — Decompose response data into tables:
   - Walk the item tree. Non-repeatable groups → flatten into parent with dot-separated keys.
   - Repeatable groups → separate table with `_response_id` (from response `id` or positional index) and `_index` (position within the repeat array).
   - Nested repeatable groups → separate table with compound FK (`_response_id` + parent `_index`).

3. `coerce.py` — Type mapping table:

   | dataType | Arrow Type | Notes |
   |---|---|---|
   | string | `utf8` | |
   | text | `utf8` | |
   | integer | `int64` | |
   | decimal | `decimal128(38, scale)` | `scale` from field `precision` or 10 |
   | boolean | `bool_` | |
   | date | `date32` | Parse ISO 8601 |
   | dateTime | `timestamp('us')` | Parse ISO 8601 |
   | time | `time64('us')` | Parse ISO 8601 time |
   | uri | `utf8` | |
   | attachment | `utf8` | Store as JSON string |
   | choice | `dictionary(int32, utf8)` | Categorical |
   | multiChoice | `list_(utf8)` | |
   | money | `struct({amount: decimal128, currency: utf8})` | Or split into two columns |

4. `nulls.py` — Null tagging:
   - For each field, check `nonRelevantBehavior`:
     - `"remove"` → null means "structurally absent (non-relevant)"
     - `"empty"` → null means "explicitly empty"
     - `"keep"` → null means "never filled"
   - Encode as Arrow column metadata: `{"formspec:null_semantics": "removed"}`

5. `labels.py` — Option label resolution:
   - Build value→label map from resolved option set
   - `resolve_labels(column)` → replace values with labels
   - `resolve_labels(column, side_by_side=True)` → add `{column}_label` column

6. `__init__.py` — `FormFrame.from_files()` / `from_dicts()`:
   - Parse definition JSON
   - Build schema (ColumnMeta per field)
   - For each response: extract `data`, apply normalization, coerce types
   - Concatenate into DataFrames
   - Attach metadata

**Registry enrichment (optional in Phase 1):**
   - If registry provided, look up extensions on fields
   - Enrich ColumnMeta with `sensitive`, `extension`, display name
   - Override `arrow_type` if registry constraints provide tighter type info

### Phase 2: Cross-Form Alignment (requires Ontology Document)

**What:** Load ontology documents → enrich ColumnMeta with concept IRIs → align across FormFrames.

**Build sequence:**

1. `ontology.py` — Ontology Document loader:
   - Parse and validate against `schemas/ontology.schema.json`
   - Verify `targetDefinition.url` matches loaded definition
   - Check `compatibleVersions` against definition version
   - Merge multiple ontology documents (later overrides earlier, alignments concatenate)

2. Enrich `schema.py` — After base schema is built:
   - For each concept binding, attach `ConceptBinding` to matching `ColumnMeta`
   - For each vocabulary binding, attach `VocabularyBinding` to matching `ColumnMeta`
   - If concept binding has `equivalents`, store on `ColumnMeta`

3. `align.py` — Cross-form alignment:
   - For each pair of FormFrames, compare concept IRIs
   - `exact`: same concept IRI
   - `broader`/`narrower`: check `equivalents` with SKOS type
   - `related`: check `equivalents` with related type
   - Produce `AlignmentReport` with merge capability

### Phase 3: Export (builds on Phase 1 + 2)

**Build sequence:**

1. `export/parquet.py`:
   - Write each table as a `.parquet` file with Arrow schema metadata
   - Encode ColumnMeta as Arrow field metadata (survives round-trip)
   - Write `_metadata.json` sidecar with full schema, vocabulary bindings, concept bindings

2. `export/frictionless.py`:
   - Generate `datapackage.json` per Frictionless Data Package spec
   - One `resource` per table (main + repeat group tables)
   - `schema.fields` with `name`, `type`, `description`, `constraints`
   - `foreignKeys` for repeat group → main relationships
   - Custom `formspec:` properties for concept IRIs, vocabulary bindings

3. `export/jsonld.py`:
   - If ontology document has `context`, use it
   - Otherwise auto-generate from concept bindings:
     - Each field key → `{"@id": concept_iri, "@type": xsd_type}`
     - Each vocabulary-bound option set → `{"@type": "@vocab"}`

4. `export/owl.py`:
   - Generate OWL/RDFS vocabulary from definition structure:
     - Groups → `owl:Class`
     - Fields → `owl:DatatypeProperty` with `rdfs:range`
     - Repeatable groups → cardinality restrictions
     - Option sets → `owl:oneOf` enumerations
   - Enrich with concept IRIs from ontology document if available

---

## Testing Strategy

**Unit tests** (per module):
- `test_schema.py` — item tree → ColumnMeta for all 12 dataTypes, calculated/captured/initial detection
- `test_normalize.py` — flat, nested, repeatable, nested-repeatable group decomposition
- `test_coerce.py` — each dataType → Arrow type, edge cases (null money, empty multiChoice)
- `test_nulls.py` — remove/empty/keep semantics, per-bind override
- `test_labels.py` — label resolution, missing labels, multiChoice labels
- `test_ontology.py` — loading, merging, target validation, concept/vocabulary enrichment
- `test_align.py` — exact/broader/narrower/related matching, merge

**Integration tests:**
- Load real example definitions (grant-application, clinical fixtures) + synthetic responses
- Verify full pipeline: from_files() → DataFrame with correct types, metadata, tables
- Round-trip: FormFrame → Parquet → reload → verify metadata preserved

**Conformance tests:**
- Ontology Document against `schemas/ontology.schema.json`
- Frictionless export against Frictionless Data Package schema

---

## Related Documents

- [Ontology specification](../../specs/ontology/ontology-spec.md)
- [Ontology schema](../../schemas/ontology.schema.json)
- [Research: formspec.frame design](../research/2026-03-23-formspec-frame-data-science-layer.md)
- [Research: data ontology exploration](../research/2026-03-23-data-ontology-exploration.md)
- [Research: compliance/security/ontology synthesis](../research/2026-03-23-compliance-security-ontology-synthesis.md)
