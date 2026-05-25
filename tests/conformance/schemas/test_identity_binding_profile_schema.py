"""Schema acceptance tests for the Identity Binding Profile sidecar."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "identity-binding-profile"

COMMON_SCHEMA = load_schema("common.schema.json")
IDENTITY_BINDING_PROFILE_SCHEMA = load_schema("identity-binding-profile.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        IDENTITY_BINDING_PROFILE_SCHEMA,
        registry=build_schema_registry(COMMON_SCHEMA, IDENTITY_BINDING_PROFILE_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def _assert_webauthn_origins_match_rpid_scope(doc: dict) -> None:
    for profile in doc.get("profiles", []):
        webauthn = profile.get("webAuthn")
        if not webauthn:
            continue

        rp_id = webauthn["rpId"]
        for origin in webauthn["origins"]:
            host = urlparse(origin).hostname
            if rp_id == "localhost":
                allowed = host == "localhost"
            else:
                allowed = host == rp_id or (host is not None and host.endswith(f".{rp_id}"))

            if not allowed:
                raise AssertionError(f"origin {origin!r} is outside RP ID scope {rp_id!r}")


def test_schema_is_well_formed() -> None:
    Draft202012Validator.check_schema(IDENTITY_BINDING_PROFILE_SCHEMA)


def test_schema_references_existing_artifact_contracts_without_forking_them() -> None:
    defs = IDENTITY_BINDING_PROFILE_SCHEMA["$defs"]

    assert "WebAuthnBinding" in defs
    assert "SignatureArtifact" not in defs
    assert "ValidationArtifact" not in defs
    assert "AuthoredSignature" not in defs
    assert "IdentityClaim" not in defs


def test_webauthn_binding_pins_challenge_and_artifact_values() -> None:
    assertion = IDENTITY_BINDING_PROFILE_SCHEMA["$defs"]["WebAuthnAssertionBinding"]
    challenge = IDENTITY_BINDING_PROFILE_SCHEMA["$defs"]["WebAuthnChallengeBinding"]

    assert (
        assertion["properties"]["signatureMethod"]["const"]
        == "urn:formspec:sig-method:webauthn-fido2@1"
    )
    assert assertion["properties"]["signatureArtifactKind"]["const"] == "webauthn"
    assert (
        assertion["properties"]["validationArtifactKind"]["const"]
        == "webauthn-server-attestation"
    )
    assert challenge["properties"]["domainSeparator"]["const"] == "formspec.webauthn.challenge.v1"
    assert (
        challenge["properties"]["signedPayloadDigestBinding"]["const"]
        == "AuthoredSignature.signedPayload.digest"
    )


def test_valid_webauthn_fixture_passes() -> None:
    doc = _fixture_doc("valid-webauthn-profile.json")

    _validator().validate(doc)
    _assert_webauthn_origins_match_rpid_scope(doc)


def test_webauthn_localhost_profile_passes() -> None:
    doc = _fixture_doc("valid-webauthn-profile.json")
    webauthn = doc["profiles"][0]["webAuthn"]
    webauthn["rpId"] = "localhost"
    webauthn["origins"] = ["https://localhost:3000"]

    _validator().validate(doc)
    _assert_webauthn_origins_match_rpid_scope(doc)


def test_webauthn_subdomain_origin_matches_rpid_scope() -> None:
    doc = _fixture_doc("valid-webauthn-profile.json")
    webauthn = doc["profiles"][0]["webAuthn"]
    webauthn["rpId"] = "springfield.gov"
    webauthn["origins"] = ["https://benefits.springfield.gov:8443"]

    _validator().validate(doc)
    _assert_webauthn_origins_match_rpid_scope(doc)


def test_webauthn_unrelated_origin_fails_rpid_scope_rule() -> None:
    doc = _fixture_doc("invalid-webauthn-unrelated-origin.json")

    _validator().validate(doc)
    with pytest.raises(AssertionError):
        _assert_webauthn_origins_match_rpid_scope(doc)


@pytest.mark.parametrize(
    "fixture_name",
    [
        "invalid-extension-profile-native-evidence.json",
        "invalid-extension-raw-evidence-innocuous-key.json",
        "invalid-extension-top-level-native-evidence.json",
        "invalid-extension-webauthn-native-evidence.json",
        "invalid-webauthn-missing-binding.json",
        "invalid-webauthn-origin-path-query.json",
        "invalid-webauthn-preferred-uv.json",
        "invalid-raw-webauthn-bytes.json",
        "invalid-webauthn-rpid-space.json",
        "invalid-webauthn-rpid-url.json",
    ],
)
def test_invalid_fixtures_fail_schema(fixture_name: str) -> None:
    with pytest.raises(ValidationError):
        _validator().validate(_fixture_doc(fixture_name))
