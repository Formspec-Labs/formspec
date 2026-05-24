"""ADR 0150 §4.2/§10 — MasterTable four-constraint demotion conformance.

Pins the demotion of the four pre-ADR-0150 constraints on
``validation-mapping.MasterTable``:

- ``const`` (table value-pin)
- ``minItems: 5``
- ``maxItems: 5``
- ``uniqueItems: true``

The table cardinality opens at the schema layer and closes per-module at
the conformance layer via Registry's ``validation-mapping-row`` contribution
category (ADR 0150 §4.2; Task 2 in the P0 implementation plan).

The closed-core 5 rows remain authoritative as **JCS (RFC 8785) byte-equality
fixtures** under
``tests/conformance/fixtures/validation-mapping/closed-core-5-rows-jcs.json``.
This file pins both the structural demotion (schema validates non-5-row
tables) AND the byte-equality of the canonical 5 rows.
"""
import json
from pathlib import Path

import jcs
import jsonschema
import pytest

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "schemas" / "validation-mapping.schema.json"
JCS_FIXTURE_PATH = (
    ROOT
    / "tests"
    / "conformance"
    / "fixtures"
    / "validation-mapping"
    / "closed-core-5-rows-jcs.json"
)

CANONICAL_ROWS = [
    {"intent": "save-draft", "profile": "off", "blocking": "non-blocking", "persistence": "draft-checkpoint"},
    {"intent": "autosave", "profile": "off", "blocking": "non-blocking", "persistence": "draft-checkpoint"},
    {"intent": "review", "profile": "on-submit", "blocking": "non-blocking", "persistence": "none"},
    {"intent": "submit", "profile": "on-submit", "blocking": "block-on-error", "persistence": "complete-response"},
    {"intent": "request-evidence", "profile": "on-demand", "blocking": "non-blocking", "persistence": "draft-checkpoint"},
]


@pytest.fixture(scope="module")
def schema():
    with SCHEMA_PATH.open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def master_table_validator(schema):
    table_schema = {
        "$schema": schema["$schema"],
        "$defs": schema["$defs"],
        "$ref": "#/$defs/MasterTable",
    }
    return jsonschema.Draft202012Validator(table_schema)


class TestMasterTableFourConstraintDemotion:
    """ADR 0150 §4.2 / §10 row 6: all four constraints are gone."""

    def test_master_table_def_has_no_const(self, schema):
        assert "const" not in schema["$defs"]["MasterTable"], (
            "MasterTable.const was removed per ADR 0150 §4.2; the closed-core "
            "5 rows live as a JCS byte-equality fixture instead."
        )

    def test_master_table_def_has_no_min_items(self, schema):
        assert "minItems" not in schema["$defs"]["MasterTable"], (
            "MasterTable.minItems was removed per ADR 0150 §4.2 — modules MAY "
            "contribute fewer rows than the closed-core baseline if they replace it."
        )

    def test_master_table_def_has_no_max_items(self, schema):
        assert "maxItems" not in schema["$defs"]["MasterTable"], (
            "MasterTable.maxItems was removed per ADR 0150 §4.2 — modules MAY "
            "contribute additional rows via the `validation-mapping-row` category."
        )

    def test_master_table_def_has_no_unique_items(self, schema):
        assert "uniqueItems" not in schema["$defs"]["MasterTable"], (
            "MasterTable.uniqueItems was removed per ADR 0150 §4.2. Row "
            "uniqueness (per intent) is a conformance-layer rule enforced by "
            "the Registry's `validation-mapping-row` contribution category, "
            "not a schema-layer set semantic."
        )

    def test_master_table_def_retains_items_ref(self, schema):
        items = schema["$defs"]["MasterTable"].get("items")
        assert items == {"$ref": "#/$defs/MappingEntry"}, (
            "MasterTable.items MUST keep the MappingEntry $ref — only the four "
            "cardinality/value constraints demote; the row-shape contract stays."
        )


class TestMasterTableStructuralDemotionProofs:
    """Demotion proofs — schema no longer enforces 5-row cardinality nor uniqueness."""

    def test_canonical_5_rows_still_validate(self, master_table_validator):
        """Regression — the closed-core 5 rows MUST keep validating."""
        errors = list(master_table_validator.iter_errors(CANONICAL_ROWS))
        assert errors == [], [e.message for e in errors]

    def test_6_row_table_validates_structurally(self, master_table_validator):
        """Demotion proof — schema no longer caps cardinality at 5."""
        six_rows = CANONICAL_ROWS + [
            {
                "intent": "x-acme-bulk-import",
                "profile": "on-submit",
                "blocking": "block-on-error",
                "persistence": "complete-response",
            }
        ]
        errors = list(master_table_validator.iter_errors(six_rows))
        assert errors == [], [e.message for e in errors]

    def test_4_row_table_validates_structurally(self, master_table_validator):
        """Demotion proof — schema no longer requires 5-row cardinality.

        A module that replaces the closed-core 5 rows with its own narrower row
        set MUST be schema-valid (conformance layer decides whether the
        narrowing is admissible per Registry posture).
        """
        four_rows = CANONICAL_ROWS[:4]
        errors = list(master_table_validator.iter_errors(four_rows))
        assert errors == [], [e.message for e in errors]

    def test_empty_table_validates_structurally(self, master_table_validator):
        """Demotion proof — schema no longer requires minimum cardinality."""
        errors = list(master_table_validator.iter_errors([]))
        assert errors == [], [e.message for e in errors]

    def test_duplicate_rows_validate_structurally(self, master_table_validator):
        """Demotion proof — schema no longer enforces uniqueItems on the table.

        Row uniqueness (canonically, one row per intent) is a conformance-layer
        rule owned by Registry's `validation-mapping-row` contribution category
        (ADR 0150 §4.2), not a schema-layer set semantic. Two identical rows
        MUST be schema-valid even though they are semantically redundant.
        """
        duplicated = [CANONICAL_ROWS[0], CANONICAL_ROWS[0]]
        errors = list(master_table_validator.iter_errors(duplicated))
        assert errors == [], [e.message for e in errors]


class TestMasterTableMappingEntryPredicateStillBinds:
    """Demotion does NOT loosen the per-row validity predicate."""

    def test_row_with_prohibited_tuple_still_rejected(self, master_table_validator):
        """§6.3 predicate via MappingEntry / ValidationTuplePredicate still fires.

        Demoting the four MasterTable constraints does NOT loosen the per-row
        ValidationTuplePredicate carried by MappingEntry. Rows that violate the
        §6.3 predicate (e.g. `complete-response` with non-`block-on-error`)
        still fail.
        """
        bad = [
            {
                "intent": "submit",
                "profile": "on-submit",
                "blocking": "non-blocking",
                "persistence": "complete-response",
            }
        ]
        errors = list(master_table_validator.iter_errors(bad))
        assert errors, "ValidationTuplePredicate must still reject prohibited tuples"


class TestClosedCore5RowsJcsByteEquality:
    """JCS (RFC 8785) byte-equality pin for the closed-core 5 rows.

    The fixture at ``closed-core-5-rows-jcs.json`` is the canonicalized form
    of the inline ``CANONICAL_ROWS``. Any drift in the inline list MUST be
    reflected in the fixture file, OR vice versa — they are pinned to be
    byte-for-byte identical under JCS canonicalization (RFC 8785).

    This replaces the schema's old ``MasterTable.const`` byte-equality pin
    after the §4.2 demotion. Authority moves from schema to fixture per
    ADR 0150 §4.2 ("byte-equality invariant moves from schema authority to
    fixture authority").
    """

    def test_inline_rows_jcs_canonicalize_to_fixture_bytes(self):
        canonical_bytes = jcs.canonicalize(CANONICAL_ROWS)
        with JCS_FIXTURE_PATH.open("rb") as f:
            fixture_bytes = f.read()
        assert canonical_bytes == fixture_bytes, (
            "Inline CANONICAL_ROWS, when JCS-canonicalized (RFC 8785), MUST "
            "equal the byte content of closed-core-5-rows-jcs.json. Drift here "
            "indicates either the canonical row set changed (update the "
            "fixture) or the fixture was hand-edited (regenerate via jcs)."
        )

    def test_fixture_is_jcs_canonical_idempotent(self):
        """Re-canonicalizing the fixture content yields the same bytes."""
        with JCS_FIXTURE_PATH.open("rb") as f:
            fixture_bytes = f.read()
        parsed = json.loads(fixture_bytes)
        recanonicalized = jcs.canonicalize(parsed)
        assert fixture_bytes == recanonicalized, (
            "Fixture bytes must be a JCS canonical encoding (idempotent under "
            "re-canonicalization). If this fails, the fixture was likely "
            "hand-edited; regenerate via `jcs.canonicalize(rows)`."
        )

    def test_fixture_parses_to_canonical_rows(self):
        """Sanity: the canonical-byte fixture decodes back to CANONICAL_ROWS."""
        with JCS_FIXTURE_PATH.open() as f:
            parsed = json.load(f)
        assert parsed == CANONICAL_ROWS

    def test_fixture_validates_against_master_table_schema(self, master_table_validator):
        """The JCS fixture content is a schema-valid MasterTable."""
        with JCS_FIXTURE_PATH.open() as f:
            parsed = json.load(f)
        errors = list(master_table_validator.iter_errors(parsed))
        assert errors == [], [e.message for e in errors]
