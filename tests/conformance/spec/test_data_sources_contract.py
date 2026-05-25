"""Data Sources contract fixtures for ADR 0153 gate 5."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "data-sources"
DATA_SOURCES_SCHEMA = load_schema("data-sources.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")

PREFIX_BY_KIND = {
    "host-state": "host:",
    "definition-response": "response:",
    "document-resource": "resource:",
    "conversation-stream": "conversation:",
    "query-result": "query:",
    "route-params": "route:",
}


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        DATA_SOURCES_SCHEMA,
        registry=build_schema_registry(COMMON_SCHEMA, DATA_SOURCES_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _semantic_codes(doc: dict) -> set[str]:
    codes: set[str] = set()
    ids = [source["id"] for source in doc.get("sources", [])]
    if any(count > 1 for count in Counter(ids).values()):
        codes.add("DATA-SOURCE-ID-COLLISION")

    for source in doc.get("sources", []):
        expected_prefix = PREFIX_BY_KIND[source["kind"]]
        if not source["id"].startswith(expected_prefix):
            codes.add("DATA-SOURCE-ID-PREFIX")

        runtime = source["runtime"]
        cache = runtime["cache"]
        if cache["mode"] == "none" and "staleAfter" in cache:
            codes.add("DATA-SOURCE-CACHE-STALENESS")
        if runtime["delivery"] == "live" and cache["mode"] != "subscribe":
            codes.add("DATA-SOURCE-RUNTIME-CACHE")
        if runtime["delivery"] == "draft" and (
            source["kind"] != "definition-response" or cache["mode"] != "draft"
        ):
            codes.add("DATA-SOURCE-RUNTIME-DRAFT")
        if runtime["provenance"]["kind"] != source["kind"]:
            codes.add("DATA-SOURCE-PROVENANCE")

        availability = source["availability"]
        if (
            availability["level"] == "surface"
            or "routeRef" in availability
            or "slotId" in availability
        ) and "surfaceRef" not in availability:
            codes.add("DATA-SOURCE-SURFACE-REF")
        if "slotId" in availability and "routeRef" not in availability:
            codes.add("DATA-SOURCE-SLOT-REF")

        if "actorRules" in runtime or "authorizationRules" in source:
            codes.add("DATA-SOURCE-FINE-GRAINED-AUTH")

    return codes


def test_valid_catalog_schema_and_semantic_contract() -> None:
    doc = _fixture_doc("valid-catalog.json")

    _validator().validate(doc)

    assert _semantic_codes(doc) == set()


def test_duplicate_ids_are_semantic_errors() -> None:
    doc = _fixture_doc("duplicate-id.json")

    _validator().validate(doc)

    assert "DATA-SOURCE-ID-COLLISION" in _semantic_codes(doc)


def test_definition_instances_remain_separate_from_peer_catalog() -> None:
    schema_description = DATA_SOURCES_SCHEMA["description"]

    assert "Definition-local instances remain the authority for @instance()" in schema_description
    assert "app-level catalog" in schema_description


def test_availability_requires_surface_ref_for_route_and_slot_selectors() -> None:
    availability = DATA_SOURCES_SCHEMA["$defs"]["Availability"]
    surface_rule = availability["allOf"][1]["then"]["required"]
    route_rule = availability["allOf"][2]["then"]["required"]
    slot_rule = availability["allOf"][3]["then"]["required"]

    assert surface_rule == ["surfaceRef"]
    assert route_rule == ["surfaceRef", "routeRef"]
    assert slot_rule == ["surfaceRef", "routeRef", "slotId"]


def test_authorization_boundary_forbids_fine_grained_fields() -> None:
    runtime = DATA_SOURCES_SCHEMA["$defs"]["RuntimeBehavior"]

    assert runtime["additionalProperties"] is False
    assert runtime["properties"]["authorizationBoundary"]["enum"] == [
        "host",
        "formspec-session",
        "module",
    ]
