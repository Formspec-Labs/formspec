"""Subject-keyed response selection and retained read evidence (Core §§2.1.6, 4.4)."""

from copy import deepcopy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import SCHEMA_DIR, build_schema_registry, load_schema


FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "response-selection"
DEFINITION = load_schema("definition.schema.json")
RESPONSE = load_schema("response.schema.json")
REGISTRY = build_schema_registry(*(
    load_schema(path.name) for path in SCHEMA_DIR.glob("*.schema.json")
))


def _fixture(name):
    return json.loads((FIXTURES / name).read_text())


def _errors(schema, value):
    return list(Draft202012Validator(
        schema, registry=REGISTRY, format_checker=Draft202012Validator.FORMAT_CHECKER,
    ).iter_errors(value))


def _selection():
    return _fixture("valid-response-instance.definition.json")["instances"]["priorYear"]["response"]


def _selection_schema():
    return {"$ref": RESPONSE["$id"] + "#/$defs/ResponseSelection"}


@pytest.mark.parametrize("name,valid", [
    ("valid-response-instance.definition.json", True),
    ("valid-subject.definition.json", True),
    ("invalid-doubly-sourced.definition.json", False),
])
def test_definition_fixtures(name, valid):
    assert (not _errors(DEFINITION, _fixture(name))) is valid


def test_completed_and_current_record_evidence():
    assert not _errors(RESPONSE, _fixture("valid-resolved-instances.response.json"))


@pytest.mark.parametrize("value", ["A", 2026])
def test_subject_keys_are_typed_scalars(value):
    doc = _fixture("valid-resolved-instances.response.json")
    doc["subject"]["keys"] = {"key": value}
    assert not _errors(RESPONSE, doc)


@pytest.mark.parametrize("value", [None, [], {}, 1.5, True])
def test_subject_keys_reject_non_scalars(value):
    doc = _fixture("valid-resolved-instances.response.json")
    doc["subject"]["keys"] = {"key": value}
    assert _errors(RESPONSE, doc)


@pytest.mark.parametrize("data_type", ["attachment", "money", "multiChoice", "unknown", "text", "decimal", "boolean", "date", "dateTime", "time", "uri", "choice"])
def test_subject_declaration_rejects_non_scalar_types(data_type):
    doc = _fixture("valid-subject.definition.json")
    doc["subject"]["keys"]["ffy"]["dataType"] = data_type
    assert _errors(DEFINITION, doc)


def test_authorization_parent_requires_a_string_key():
    doc = _fixture("valid-subject.definition.json")
    doc["subject"]["keys"]["ffy"]["authorizationParent"] = "year"
    assert _errors(DEFINITION, doc)


@pytest.mark.parametrize("schema,name", [
    (DEFINITION, "valid-subject.definition.json"),
    (RESPONSE, "valid-resolved-instances.response.json"),
])
def test_per_scope_singleton_subject_has_empty_keys(schema, name):
    doc = _fixture(name)
    doc["subject"]["keys"] = {}
    assert not _errors(schema, doc)


def test_response_subject_keys_require_type():
    doc = _fixture("valid-resolved-instances.response.json")
    del doc["subject"]["type"]
    assert _errors(RESPONSE, doc)


@pytest.mark.parametrize("missing", ["type", "keys"])
def test_subject_declaration_requires_type_and_keys(missing):
    doc = _fixture("valid-subject.definition.json")
    del doc["subject"][missing]
    assert _errors(DEFINITION, doc)


def test_response_instance_requires_projection_schema():
    doc = _fixture("valid-response-instance.definition.json")
    del doc["instances"]["priorYear"]["schema"]
    assert _errors(DEFINITION, doc)


@pytest.mark.parametrize("path", ["agencies[*].uei", "totals.employment", "uei"])
def test_response_projection_accepts_field_paths(path):
    doc = _fixture("valid-response-instance.definition.json")
    doc["instances"]["priorYear"]["schema"] = {path: "string"}
    assert not _errors(DEFINITION, doc)


@pytest.mark.parametrize("path,data_type", [("agencies[0].uei", "string"), ("a..b", "string"), ("", "string"), ("uei", "unknown")])
def test_response_projection_rejects_invalid_paths_and_types(path, data_type):
    doc = _fixture("valid-response-instance.definition.json")
    doc["instances"]["priorYear"]["schema"] = {path: data_type}
    assert _errors(DEFINITION, doc)


@pytest.mark.parametrize("instance", [{"data": {}}, {"source": "urn:example:lookup"}, {"source": "urn:example:lookup", "data": {}}])
def test_other_content_sources_remain_valid(instance):
    doc = _fixture("valid-subject.definition.json")
    doc["instances"] = {"lookup": instance}
    assert not _errors(DEFINITION, doc)


@pytest.mark.parametrize("source", ["https://example.org/{{entityId}}", "relative/path", "free text", "https://example.org/a b"])
def test_instance_source_is_a_uri_not_a_template(source):
    doc = _fixture("valid-subject.definition.json")
    doc["instances"] = {"lookup": {"source": source}}
    assert _errors(DEFINITION, doc)


@pytest.mark.parametrize("source", ["https://example.org/{{entityId}}", "relative/path", "free text", "https://example.org/a b"])
def test_instance_source_rejects_non_literal_uri_without_format_checker(source):
    doc = _fixture("valid-subject.definition.json")
    doc["instances"] = {"lookup": {"source": source}}
    assert list(Draft202012Validator(DEFINITION, registry=REGISTRY).iter_errors(doc))


@pytest.mark.parametrize("op", ["eq", "le", "ge"])
@pytest.mark.parametrize("origin", [{"subject": "ffy"}, {"routeParam": "year"}])
def test_shared_selection_predicates(op, origin):
    selection = _selection()
    selection["subject"] = [{"key": "ffy", "op": op, "from": origin, "offset": -1}]
    assert not _errors(_selection_schema(), selection)


def test_shared_selection_optional_mapping_and_disposition():
    selection = _selection()
    selection.update(status="current", cardinality="latest-per-subject", pin="at-open",
                     mapping="urn:example:mapping:carry", disposition="urn:wos:disposition:accepted")
    del selection["whenNone"]
    assert not _errors(_selection_schema(), selection)


@pytest.mark.parametrize("field,value", [
    ("status", "in-progress"), ("whenNone", "ignore"), ("cardinality", "all"),
    ("pin", "forever"), ("mapping", "relative/path"), ("disposition", "accepted"),
    ("orderBy", "authored-desc"),
])
def test_selection_rejects_unknown_vocabulary(field, value):
    selection = _selection()
    selection[field] = value
    assert _errors(_selection_schema(), selection)


@pytest.mark.parametrize("predicate", [
    {"key": "ffy", "op": "lt", "from": {"subject": "ffy"}},
    {"key": "ffy", "op": "eq", "from": {"subject": "ffy", "routeParam": "year"}},
    {"key": "ffy", "op": "eq", "from": {}},
    {"key": "ffy", "op": "eq", "from": {"subject": "ffy"}, "offset": 0.5},
])
def test_selection_rejects_invalid_predicates(predicate):
    selection = _selection()
    selection["subject"] = [predicate]
    assert _errors(_selection_schema(), selection)


@pytest.mark.parametrize("field", ["instance", "records", "valueDigest", "none", "pinned"])
def test_resolved_instance_requires_complete_evidence(field):
    doc = _fixture("valid-resolved-instances.response.json")
    del doc["resolvedInstances"][0][field]
    assert _errors(RESPONSE, doc)


def test_empty_match_retains_digest_and_no_records():
    doc = _fixture("valid-resolved-instances.response.json")
    entry = doc["resolvedInstances"][0]
    entry.update(records=[], none=True)
    assert not _errors(RESPONSE, doc)


@pytest.mark.parametrize("none,records", [(True, [{"responseId": "r", "definitionVersion": "1.0.0"}]), (False, [])])
def test_none_agrees_with_record_presence(none, records):
    doc = _fixture("valid-resolved-instances.response.json")
    doc["resolvedInstances"][0].update(none=none, records=records)
    assert _errors(RESPONSE, doc)


def test_mapping_digest_is_required():
    doc = _fixture("valid-resolved-instances.response.json")
    del doc["resolvedInstances"][0]["mapping"]["digest"]
    assert _errors(RESPONSE, doc)


def test_resolved_instance_is_closed():
    doc = _fixture("valid-resolved-instances.response.json")
    doc["resolvedInstances"][0]["unexpected"] = True
    assert _errors(RESPONSE, doc)


@pytest.mark.parametrize("field", ["responseHash", "valueDigest", "mapping"])
def test_evidence_hashes_are_sha256_prefixed(field):
    doc = _fixture("valid-resolved-instances.response.json")
    entry = doc["resolvedInstances"][0]
    if field == "responseHash":
        entry["records"][0][field] = "a" * 64
    elif field == "mapping":
        entry[field]["digest"] = "a" * 64
    else:
        entry[field] = "a" * 64
    assert _errors(RESPONSE, doc)


def test_schema_examples_resolve_against_their_owning_document():
    """Validate examples on the subject/selection nodes authored for ADR 0172."""
    def visit(node, pointer, owner):
        if isinstance(node, dict):
            for example in node.get("examples", []):
                assert not _errors({"$ref": owner["$id"] + pointer}, deepcopy(example)), pointer
            for key, value in node.items():
                if key != "examples":
                    visit(value, pointer + "/" + key.replace("~", "~0").replace("/", "~1"), owner)
        elif isinstance(node, list):
            for index, value in enumerate(node):
                visit(value, pointer + "/" + str(index), owner)

    for owner, pointers in [
        (DEFINITION, ["#/properties/subject", "#/properties/instances", "#/$defs/Instance"]),
        (RESPONSE, ["#/properties/subject", "#/properties/resolvedInstances",
                    "#/$defs/Sha256Digest", "#/$defs/ResolvedInstanceRecord",
                    "#/$defs/ResolvedInstance", "#/$defs/SubjectPredicate", "#/$defs/ResponseSelection"]),
    ]:
        for pointer in pointers:
            node = owner
            for part in pointer[2:].split("/"):
                node = node[part]
            visit(node, pointer, owner)
