"""Pin the regeneration-merge-report schema shape."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

SCHEMA_PATH = (
    Path(__file__).resolve().parents[3]
    / "schemas"
    / "regeneration-merge-report.schema.json"
)


@pytest.fixture(scope="module")
def schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text())


@pytest.fixture(scope="module")
def validator(schema) -> Draft202012Validator:
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def _entry(code: str, severity: str, **extra) -> dict:
    return {
        "anchors": ["item:/applicant/name"],
        "nodePath": "/tree/children/0",
        "code": code,
        "severity": severity,
        "reason": "sample",
        **extra,
    }


def _report(**overrides) -> dict:
    report = {
        "version": "1.0",
        "surviving": [_entry("COMP-REGENERATION-DESIGNER-SURVIVED", "info")],
        "regenerated": [_entry("COMP-REGENERATION-REGENERATED", "info")],
        "orphaned": [
            _entry(
                "COMP-REGENERATION-ORPHAN-NODE",
                "warning",
                reattachedTo="/tree",
                cascaded=False,
                detached=False,
            )
        ],
        "pendingReview": [_entry("COMP-REGENERATION-PENDING-REVIEW", "info")],
        "conflicts": [_entry("COMP-REGENERATION-PROPERTY-CONFLICT", "warning")],
    }
    report.update(overrides)
    return report


def test_id_and_version(schema):
    assert schema["$id"].endswith("/regeneration-merge-report/1.0")
    assert schema["properties"]["version"]["const"] == "1.0"


def test_required_top_level_arrays(schema):
    required = set(schema["required"])
    assert required == {
        "version",
        "surviving",
        "regenerated",
        "orphaned",
        "pendingReview",
        "conflicts",
    }


def test_entry_required_fields(schema):
    """F7 + Task 11: code/severity/reason live on base Entry."""
    entry = schema["$defs"]["Entry"]
    assert set(entry["required"]) == {"anchors", "nodePath", "code", "severity", "reason"}
    assert entry["properties"]["anchors"]["uniqueItems"] is True
    assert entry["properties"]["code"]["$ref"] == "#/$defs/Code"
    assert entry["properties"]["reason"]["minLength"] == 1


def test_entry_code_enum(schema):
    codes = set(schema["$defs"]["Code"]["enum"])
    assert codes == {
        "COMP-REGENERATION-NO-COMMON-ANCESTOR",
        "COMP-REGENERATION-DESIGNER-PRECEDES",
        "COMP-REGENERATION-DESIGNER-REMOVED",
        "COMP-REGENERATION-PROPERTY-CONFLICT",
        "COMP-REGENERATION-WIDGET-SWAP",
        "COMP-REGENERATION-DESIGNER-SURVIVED",
        "COMP-REGENERATION-REGENERATED",
        "COMP-REGENERATION-ORPHAN-NODE",
        "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE",
        "COMP-REGENERATION-ORPHAN-DETACHED",
        "COMP-REGENERATION-RENAME-MIGRATED",
        "COMP-REGENERATION-PENDING-REVIEW",
    }
    assert "COMP-REGENERATION-ORPHAN-BINDING" not in codes
    assert "COMP-REGENERATION-RENAME-UNDOCUMENTED" not in codes
    assert "COMP-REGENERATION-DESIGNER-INSERTED" not in codes
    assert set(schema["$defs"]["Entry"]["properties"]["severity"]["enum"]) == {
        "error",
        "warning",
        "info",
    }


def test_code_severity_constraints(schema):
    """§7: each finding code pins its canonical severity."""
    entry = schema["$defs"]["Entry"]
    severities = {
        rule["if"]["properties"]["code"]["const"]: rule["then"]["properties"][
            "severity"
        ]["const"]
        for rule in entry["allOf"]
    }
    assert severities == {
        "COMP-REGENERATION-NO-COMMON-ANCESTOR": "error",
        "COMP-REGENERATION-DESIGNER-PRECEDES": "warning",
        "COMP-REGENERATION-DESIGNER-REMOVED": "warning",
        "COMP-REGENERATION-PROPERTY-CONFLICT": "warning",
        "COMP-REGENERATION-WIDGET-SWAP": "warning",
        "COMP-REGENERATION-DESIGNER-SURVIVED": "info",
        "COMP-REGENERATION-REGENERATED": "info",
        "COMP-REGENERATION-ORPHAN-NODE": "warning",
        "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE": "info",
        "COMP-REGENERATION-ORPHAN-DETACHED": "warning",
        "COMP-REGENERATION-RENAME-MIGRATED": "info",
        "COMP-REGENERATION-PENDING-REVIEW": "info",
    }


def test_entry_has_property_deltas(schema):
    """F5: Studio needs property-level diff visibility."""
    entry_props = schema["$defs"]["Entry"]["properties"]
    assert "propertyDeltas" in entry_props
    assert entry_props["propertyDeltas"]["items"]["pattern"] == "^/"
    assert entry_props["propertyDeltas"]["uniqueItems"] is True


def test_report_arrays_use_role_specific_entries(schema):
    props = schema["properties"]
    assert props["surviving"]["items"]["$ref"] == "#/$defs/SurvivingEntry"
    assert props["regenerated"]["items"]["$ref"] == "#/$defs/RegeneratedEntry"
    assert props["orphaned"]["items"]["$ref"] == "#/$defs/OrphanEntry"
    assert props["pendingReview"]["items"]["$ref"] == "#/$defs/PendingReviewEntry"
    assert props["conflicts"]["items"]["$ref"] == "#/$defs/ConflictEntry"


def test_role_specific_code_placement(schema):
    surviving_code = schema["$defs"]["SurvivingEntry"]["allOf"][1]["properties"]["code"]
    assert set(surviving_code["enum"]) == {
        "COMP-REGENERATION-DESIGNER-SURVIVED",
        "COMP-REGENERATION-RENAME-MIGRATED",
    }
    assert (
        schema["$defs"]["RegeneratedEntry"]["allOf"][1]["properties"]["code"][
            "const"
        ]
        == "COMP-REGENERATION-REGENERATED"
    )
    assert (
        schema["$defs"]["PendingReviewEntry"]["allOf"][1]["properties"]["code"][
            "const"
        ]
        == "COMP-REGENERATION-PENDING-REVIEW"
    )


def test_orphan_entry_has_reattachment_fields(schema):
    """§8: base orphan entries always carry reattachment metadata."""
    orphan_shape = schema["$defs"]["OrphanEntry"]["allOf"][1]
    orphan_props = orphan_shape["properties"]
    assert {"reattachedTo", "cascaded", "detached"} <= set(orphan_props)
    assert set(orphan_props["code"]["enum"]) == {
        "COMP-REGENERATION-ORPHAN-NODE",
        "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE",
        "COMP-REGENERATION-ORPHAN-DETACHED",
    }
    assert set(schema["$defs"]["OrphanEntry"]["allOf"][1]["required"]) == {
        "reattachedTo",
        "cascaded",
        "detached",
    }
    flag_constraints = {
        rule["if"]["properties"]["code"]["const"]: rule["then"]["properties"]
        for rule in orphan_shape["allOf"]
    }
    assert flag_constraints["COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE"] == {
        "cascaded": {"const": True},
        "detached": {"const": False},
    }
    assert flag_constraints["COMP-REGENERATION-ORPHAN-DETACHED"] == {
        "cascaded": {"const": False},
        "detached": {"const": True},
    }


def test_conflict_entry_is_role_specific(schema):
    """Conflicts share base Entry fields but only allow conflict finding codes."""
    conflict = schema["$defs"]["ConflictEntry"]
    assert conflict["allOf"][0]["$ref"] == "#/$defs/Entry"
    assert set(conflict["allOf"][1]["properties"]["code"]["enum"]) == {
        "COMP-REGENERATION-NO-COMMON-ANCESTOR",
        "COMP-REGENERATION-DESIGNER-PRECEDES",
        "COMP-REGENERATION-DESIGNER-REMOVED",
        "COMP-REGENERATION-PROPERTY-CONFLICT",
        "COMP-REGENERATION-WIDGET-SWAP",
    }
    assert conflict["unevaluatedProperties"] is False


def test_valid_report_instance(validator):
    validator.validate(_report())


def test_role_specific_codes_are_rejected(validator):
    bad = _report(conflicts=[_entry("COMP-REGENERATION-REGENERATED", "info")])
    with pytest.raises(ValidationError):
        validator.validate(bad)


def test_wrong_code_severity_is_rejected(validator):
    bad = _report(
        conflicts=[_entry("COMP-REGENERATION-NO-COMMON-ANCESTOR", "warning")]
    )
    with pytest.raises(ValidationError):
        validator.validate(bad)


def test_orphan_metadata_is_required(validator):
    bad = _report(
        orphaned=[
            _entry(
                "COMP-REGENERATION-ORPHAN-NODE",
                "warning",
                reattachedTo="/tree",
                cascaded=False,
            )
        ]
    )
    with pytest.raises(ValidationError):
        validator.validate(bad)


def test_orphan_cascade_code_requires_cascade_flags(validator):
    bad = _report(
        orphaned=[
            _entry(
                "COMP-REGENERATION-ORPHAN-REATTACHED-CASCADE",
                "info",
                reattachedTo="/tree",
                cascaded=False,
                detached=False,
            )
        ]
    )
    with pytest.raises(ValidationError):
        validator.validate(bad)


def test_orphan_detached_code_requires_detached_flags(validator):
    bad = _report(
        orphaned=[
            _entry(
                "COMP-REGENERATION-ORPHAN-DETACHED",
                "warning",
                reattachedTo="/tree",
                cascaded=False,
                detached=False,
            )
        ]
    )
    with pytest.raises(ValidationError):
        validator.validate(bad)


def test_exp_two_hop_join_documented(schema):
    """F3: document EXP path -> item:<path> -> anchors, not nodePath join."""
    desc = schema["description"]
    assert "EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM" in desc
    assert "two-hop join" in desc
    assert "item:<path>" in desc
