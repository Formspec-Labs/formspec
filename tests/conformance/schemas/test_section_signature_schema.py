"""Section signature wire shapes and whole-response compatibility; no byte verification."""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

SCHEMAS = {name: load_schema(f"{name}.schema.json") for name in
           ("response", "common", "definition", "intake-handoff", "verification-receipt")}
REGISTRY = build_schema_registry(*SCHEMAS.values())
FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "section-signatures"


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def validator(name, fragment=None):
    schema = SCHEMAS[name] if fragment is None else {
        "$ref": SCHEMAS[name]["$id"] + "#/$defs/" + fragment,
    }
    return Draft202012Validator(schema, registry=REGISTRY,
                               format_checker=Draft202012Validator.FORMAT_CHECKER)


def test_two_party_response_and_pinned_definition_shapes():
    response = fixture("two-party.response.json")
    definition = fixture("scope.definition.json")
    validator("response").validate(response)
    validator("definition").validate(definition)
    # Retained fixture coherence, not runtime role/coverage enforcement.
    assert (response["definitionUrl"], response["definitionVersion"]) == (
        definition["url"], definition["version"])
    assert {s["partyRole"] for s in response["authoredSignatures"]} == {
        p["roleId"] for p in definition["parties"]}
    assert response["authoredSignatures"][1]["coveredPaths"] == [
        "parents[0].income", "parents[0].familySize"]
    validator("common", "AttachmentValue").validate(response["data"]["photo"])


def test_initial_handoff_references_whole_response_without_party_activation():
    response = fixture("two-party.response.json")
    handoff = fixture("initial-intake.handoff.json")
    validator("intake-handoff").validate(handoff)
    assert handoff["responseRef"] == "urn:formspec:response:" + response["id"]
    assert handoff["definitionRef"] == {"url": response["definitionUrl"],
                                        "version": response["definitionVersion"]}
    assert "parties" not in handoff
    assert all(handoff["responseHash"].split(":", 1)[1] != s["signedPayload"]["digest"]
               for s in response["authoredSignatures"])
    assert {"data", "metadata", "displayedLocale", "authoredSignatures"} <= response.keys()


@pytest.mark.parametrize("field", ["partyRole", "coveredPaths"])
def test_section_requires_role_and_explicit_scope(field):
    response = fixture("two-party.response.json")
    del response["authoredSignatures"][0][field]
    with pytest.raises(ValidationError):
        validator("response").validate(response)


@pytest.mark.parametrize("paths", [[], ["photo", "photo"], ["parents[*].income"],
    ["/parents/0/income"], ["parents[01].income"], ["parents[-1].income"],
    ["parents[@index = 1].income"], ["$student.name"], [""], ["student name"],
    ["#"], ["_student.name"], ["data.student.name[0][1]"], [3]])
def test_rejects_ambiguous_or_invalid_coverage_syntax(paths):
    response = fixture("two-party.response.json")
    response["authoredSignatures"][0]["coveredPaths"] = paths
    with pytest.raises(ValidationError):
        validator("response").validate(response)


@pytest.mark.parametrize("role", ["", "0parent", "parent name", "_parent", "a" * 65])
def test_rejects_invalid_role_slot_syntax(role):
    response = fixture("two-party.response.json")
    response["authoredSignatures"][0]["partyRole"] = role
    with pytest.raises(ValidationError):
        validator("response").validate(response)


def test_role_and_field_resolution_are_not_claimed_as_schema_enforcement():
    response = fixture("two-party.response.json")
    response["authoredSignatures"][0]["partyRole"] = "undeclared"
    response["authoredSignatures"][0]["coveredPaths"] = ["missingField"]
    # Syntax-valid; future Definition-aware engine must reject these bindings.
    validator("response").validate(response)


@pytest.mark.parametrize("name", ["valid-single.response.json", "valid-cosignature.response.json"])
def test_existing_whole_response_fixtures_remain_valid(name):
    response = json.loads((FIXTURES.parent / "signature-responses" / name).read_text())
    validator("response").validate(response)


@pytest.mark.parametrize("field,value", [("partyRole", "student"), ("coveredPaths", ["photo"])])
def test_whole_profile_rejects_partial_scope_fields(field, value):
    response = fixture("two-party.response.json")
    signature = response["authoredSignatures"][0]
    signature["signedPayload"]["canonicalization"] = "formspec-response-signing-v1"
    signature.pop("partyRole")
    signature.pop("coveredPaths")
    signature[field] = value
    with pytest.raises(ValidationError):
        validator("response").validate(response)


@pytest.mark.parametrize("profile", ["other-profile", "formspec-response-section-signing-v2"])
def test_unregistered_profile_shape_is_rejected(profile):
    response = fixture("two-party.response.json")
    response["authoredSignatures"][0]["signedPayload"]["canonicalization"] = profile
    with pytest.raises(ValidationError):
        validator("response").validate(response)


@pytest.mark.parametrize("name", ["id", "definitionVersion", "data", "authored"])
def test_section_profile_does_not_replace_whole_response_required_fields(name):
    response = fixture("two-party.response.json")
    del response[name]
    with pytest.raises(ValidationError):
        validator("response").validate(response)


@pytest.mark.parametrize("attachment", [
    {"contentType": "image/jpeg", "url": "urn:files:photo", "name": "photo.jpg"},
    {"contentType": "text/plain", "data": "aGVsbG8="},
    {"contentType": "text/plain", "url": "urn:files:text", "data": "aGVsbG8="},
])
def test_existing_attachment_representations(attachment):
    validator("common", "AttachmentValue").validate(attachment)


@pytest.mark.parametrize("attachment", [
    {"url": "urn:files:photo"}, {"contentType": "image/jpeg"},
    {"contentType": "image/jpeg", "url": ""},
    {"contentType": "text/plain", "data": "not base64!"},
    {"contentType": "text/plain", "data": "aGVsbG8=", "size": -1},
])
def test_invalid_attachment_shapes(attachment):
    with pytest.raises(ValidationError):
        validator("common", "AttachmentValue").validate(attachment)


def test_handoff_parties_remain_closed_until_coordinated_activation():
    handoff = fixture("initial-intake.handoff.json")
    handoff["parties"] = []
    with pytest.raises(ValidationError):
        validator("intake-handoff").validate(handoff)
