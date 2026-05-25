"""Schema acceptance tests for the UI Graph Policy structural contract."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "ui-graph-policy"
SCHEMA = load_schema("ui-graph-policy.schema.json")
BUNDLE_SCHEMA = load_schema("bundle-manifest.schema.json")

VALID_FIXTURES = [
    "valid-route-policy.json",
    "valid-minimal-policy.json",
]

INVALID_FIXTURES = [
    "invalid-authorization-field.json",
    "invalid-path-identity.json",
    "invalid-spike-discriminator.json",
    "invalid-locale-prefix.json",
]

FORBIDDEN_SCHEMA_TERMS = {
    "actor",
    "actors",
    "allowedActors",
    "permission",
    "permissions",
    "rolePolicy",
    "routeAuthorization",
    "fieldPolicy",
    "widgetPolicy",
    "$wireframeUiPolicy",
    "sourcePath",
    "filename",
    "localPath",
    "pathIdentity",
    "identityFromPath",
}


def _load_fixture(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES_DIR / name).read_text())


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        SCHEMA,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _walk(value: Any) -> Any:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def test_ui_graph_policy_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(SCHEMA)


def test_ui_graph_policy_schema_pins_structural_contract_only() -> None:
    assert SCHEMA["$id"] == "https://formspec.org/schemas/uiGraphPolicy/0.1"
    assert SCHEMA["additionalProperties"] is False
    assert set(SCHEMA["required"]) == {
        "$formspecUiGraphPolicy",
        "version",
        "targetSurface",
        "routePolicies",
    }
    assert SCHEMA["properties"]["$formspecUiGraphPolicy"]["const"] == "0.1"
    description = SCHEMA["description"]
    assert "host-loaded evidence only" in description
    assert "not an App Manifest sibling slot" in description
    assert "not an authorization policy" in description


def test_app_manifest_does_not_define_ui_graph_policy_slot() -> None:
    assert "uiGraphPolicy" not in BUNDLE_SCHEMA["properties"]
    assert "uiPolicy" not in BUNDLE_SCHEMA["properties"]
    assert BUNDLE_SCHEMA["additionalProperties"] is False


@pytest.mark.parametrize("fixture_name", VALID_FIXTURES)
def test_valid_ui_graph_policy_fixtures_validate(fixture_name: str) -> None:
    _validator().validate(_load_fixture(fixture_name))


@pytest.mark.parametrize("fixture_name", INVALID_FIXTURES)
def test_invalid_ui_graph_policy_fixtures_fail(fixture_name: str) -> None:
    with pytest.raises(ValidationError):
        _validator().validate(_load_fixture(fixture_name))


def test_locale_owner_module_match_is_semantic_not_structural() -> None:
    policy = _load_fixture("valid-minimal-policy.json")
    policy["localeKeyOwners"] = [
        {
            "keyPrefix": "$module.x-reviewer.",
            "moduleId": "x-applicant",
        }
    ]

    _validator().validate(policy)


def test_theme_assignment_token_is_raw_theme_token_key() -> None:
    policy = _load_fixture("valid-minimal-policy.json")
    policy["theme"] = {
        "assignments": [
            {
                "widgetRef": {
                    "moduleId": "x-reviewer",
                    "widgetName": "x-review-panel",
                },
                "slot": "accent",
                "token": "color.accent",
            }
        ]
    }
    _validator().validate(policy)

    policy["theme"]["assignments"][0]["token"] = "$token.color.accent"
    with pytest.raises(ValidationError):
        _validator().validate(policy)


def test_ui_graph_policy_schema_rejects_auth_and_path_identity_fields() -> None:
    for key, value in _walk(SCHEMA):
        assert key not in FORBIDDEN_SCHEMA_TERMS, f"forbidden schema key {key}"
        if key in {"properties", "$defs"}:
            assert isinstance(value, dict)
            assert FORBIDDEN_SCHEMA_TERMS.isdisjoint(value.keys())
