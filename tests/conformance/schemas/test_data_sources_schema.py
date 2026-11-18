"""Schema acceptance tests for the Data Sources peer artifact."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "data-sources"
DATA_SOURCES_SCHEMA = load_schema("data-sources.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")
RESPONSE_SCHEMA = load_schema("response.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        DATA_SOURCES_SCHEMA,
        registry=build_schema_registry(
            COMMON_SCHEMA,
            DATA_SOURCES_SCHEMA,
            RESPONSE_SCHEMA,
        ),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


class TestDataSourcesSchemaShape:
    def test_schema_is_well_formed(self) -> None:
        Draft202012Validator.check_schema(DATA_SOURCES_SCHEMA)

    def test_top_level_discriminator_and_required_fields(self) -> None:
        assert DATA_SOURCES_SCHEMA["properties"]["$formspecDataSources"]["const"] == "1.0"
        assert set(DATA_SOURCES_SCHEMA["required"]) == {
            "$formspecDataSources",
            "version",
            "id",
            "sources",
        }

    def test_kind_taxonomy_is_closed(self) -> None:
        kinds = DATA_SOURCES_SCHEMA["$defs"]["DataSourceKind"]["enum"]
        assert kinds == [
            "host-state",
            "definition-response",
            "document-resource",
            "conversation-stream",
            "query-result",
            "route-params",
        ]

    def test_runtime_authorization_boundary_is_coarse_only(self) -> None:
        boundary = DATA_SOURCES_SCHEMA["$defs"]["RuntimeBehavior"]["properties"]["authorizationBoundary"]
        assert boundary["enum"] == ["host", "formspec-session", "module"]
        assert "Fine-grained" in boundary["description"]

    def test_response_selection_reuses_core(self) -> None:
        # ADR 0172 replaces the catalog's local, fixed selection vocabulary.
        definitions = DATA_SOURCES_SCHEMA["$defs"]
        selection = definitions["DataSource"]["properties"]["responseSelection"]

        assert "ResponseSelection" not in definitions
        assert selection["$ref"] == RESPONSE_SCHEMA["$id"] + "#/$defs/ResponseSelection"

    def test_valid_catalog_fixture_passes(self) -> None:
        _validator().validate(_fixture_doc("valid-catalog.json"))


@pytest.mark.parametrize(
    "fixture_name",
    [
        "id-prefix-mismatch.json",
        "cache-none-stale-after.json",
        "live-with-snapshot-cache.json",
        "draft-not-definition-response.json",
        "provenance-kind-mismatch.json",
        "surface-without-surface-ref.json",
        "slot-without-surface-ref.json",
        "fine-grained-auth.json",
    ],
)
def test_negative_fixtures_fail_schema(fixture_name: str) -> None:
    with pytest.raises(ValidationError):
        _validator().validate(_fixture_doc(fixture_name))


def test_duplicate_id_fixture_is_schema_valid_but_semantically_invalid() -> None:
    _validator().validate(_fixture_doc("duplicate-id.json"))


def _source(doc: dict, source_id: str) -> dict:
    return next(source for source in doc["sources"] if source["id"] == source_id)


def test_draft_definition_response_remains_valid_without_selection() -> None:
    doc = _fixture_doc("valid-catalog.json")
    source = _source(doc, "response:new-matter-draft")

    assert "definitionVersion" not in source
    assert "responseSelection" not in source
    _validator().validate(doc)


def test_draft_definition_response_rejects_completed_selection_policy() -> None:
    doc = _fixture_doc("valid-catalog.json")
    source = _source(doc, "response:new-matter-draft")
    source["responseSelection"] = _source(doc, "response:latest-completed-matter")["responseSelection"]

    with pytest.raises(ValidationError):
        _validator().validate(doc)


@pytest.mark.parametrize(
    ("delivery", "cache_mode"),
    [("snapshot", "snapshot"), ("live", "subscribe")],
)
def test_non_draft_definition_response_requires_complete_selection(
    delivery: str,
    cache_mode: str,
) -> None:
    doc = _fixture_doc("valid-catalog.json")
    source = _source(doc, "response:latest-completed-matter")
    source["runtime"]["delivery"] = delivery
    source["runtime"]["cache"]["mode"] = cache_mode

    _validator().validate(doc)

    del source["responseSelection"]
    with pytest.raises(ValidationError):
        _validator().validate(doc)


@pytest.mark.parametrize("source_id", ["response:latest-completed-matter", "response:new-matter-draft"])
def test_catalog_rejects_source_level_definition_version(source_id: str) -> None:
    # The source-level exact version is replaced by the selector's version range.
    doc = _fixture_doc("valid-catalog.json")
    _source(doc, source_id)["definitionVersion"] = "1.0.0"

    with pytest.raises(ValidationError):
        _validator().validate(doc)


def test_catalog_uses_definition_ref_only_for_session_drafts() -> None:
    doc = _fixture_doc("valid-catalog.json")
    source = _source(doc, "response:latest-completed-matter")
    source["definitionRef"] = source["responseSelection"]["definition"]["url"]
    with pytest.raises(ValidationError):
        _validator().validate(doc)

    del source["definitionRef"]
    del _source(doc, "response:new-matter-draft")["definitionRef"]
    with pytest.raises(ValidationError):
        _validator().validate(doc)


def test_catalog_selection_allows_current_list_and_default_when_none() -> None:
    doc = _fixture_doc("valid-catalog.json")
    selection = _source(doc, "response:latest-completed-matter")["responseSelection"]
    selection.update(status="current", cardinality="latest-per-subject")
    del selection["whenNone"]

    _validator().validate(doc)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("status", "amended"),
        ("cardinality", "all"),
        ("orderBy", "authored-desc"),
        ("tieBreak", "response-id-asc"),
        ("partitionBy", "definition"),
        ("whenNone", "skip"),
    ],
)
def test_response_selection_policy_is_exact(field: str, value: str) -> None:
    doc = _fixture_doc("valid-catalog.json")
    selection = _source(
        doc,
        "response:latest-completed-matter",
    )["responseSelection"]
    selection[field] = value

    with pytest.raises(ValidationError):
        _validator().validate(doc)


def test_response_selection_rejects_extra_fields() -> None:
    doc = _fixture_doc("valid-catalog.json")
    selection = _source(
        doc,
        "response:latest-completed-matter",
    )["responseSelection"]
    selection["limit"] = 1

    with pytest.raises(ValidationError):
        _validator().validate(doc)


def test_non_response_source_rejects_response_selection_fields() -> None:
    doc = _fixture_doc("valid-catalog.json")
    source = _source(doc, "host:open-matters")
    source["responseSelection"] = _source(doc, "response:latest-completed-matter")["responseSelection"]

    with pytest.raises(ValidationError):
        _validator().validate(doc)
