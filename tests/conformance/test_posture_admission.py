"""Conformance tests for ADR 0150 §4.4 / §5.4: posture-declaration gains
`allowedModules: ModuleRef[]` + `allowedActors: string[]` (URN list).

**Admission semantics (§4.4 — field-equality):** every field present on the
posture entry MUST equal the corresponding field on the document's
`modules[]` entry; fields absent on the posture entry admit any value on the
document side. Bare `{id, version}` on the posture admits any publisher /
lockHash; pinning `lockHash` requires byte-identical match.

**Actor admission (§5.4 — binary):** flat URN list; not provenance-pinned the
way modules are. An act from an actor whose URN isn't in the allowlist is
refused.

Schema-side coverage here proves field shape + URN pattern. Runtime
field-equality admission is enforced by lint codes **E608** / **E609** when
hosts pass `posture_declaration` (see
`tests/conformance/fixtures/posture-admission/` and `for-n8c4`).
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

SCHEMAS_DIR = Path(__file__).parents[2] / "schemas"
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())
POSTURE_SCHEMA = json.loads((SCHEMAS_DIR / "posture-declaration.schema.json").read_text())


def _build_registry() -> Registry:
    return Registry().with_resources([
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
        (POSTURE_SCHEMA["$id"], Resource.from_contents(POSTURE_SCHEMA, default_specification=DRAFT202012)),
    ])


REGISTRY = _build_registry()
VALIDATOR = Draft202012Validator(POSTURE_SCHEMA, registry=REGISTRY)


def _minimal_posture() -> dict:
    """Minimal valid posture-declaration document — pre-Task-10 baseline."""
    return {
        "$postureDeclaration": "1.0",
        "url": "https://example.org/posture/test.json",
        "version": "1.0.0",
        "signaturePolicy": {
            "allowedMethods": ["urn:formspec:sig-method:ed25519-cose-sign1@1"],
            "minimumPrimitiveVerification": "verified",
            "receiptSigningRequired": False,
        },
    }


# ─── Backward-compat: posture without the new fields still validates ────────


def test_minimal_posture_without_new_fields_validates():
    """ADR §4.4 / §5.4: `allowedModules` and `allowedActors` are OPTIONAL.
    Existing posture documents (no Task-10 fields) validate identically."""
    VALIDATOR.validate(_minimal_posture())


# ─── allowedModules accepts ModuleRef[] ──────────────────────────────────────


def test_posture_with_bare_allowed_modules_validates():
    """Bare `{id, version}` posture entry — admits any document entry with
    the same id+version regardless of publisher/lockHash (§4.4)."""
    doc = _minimal_posture()
    doc["allowedModules"] = [
        {"id": "x-formspec-core-task", "version": "^1.0.0"},
    ]
    VALIDATOR.validate(doc)


def test_posture_with_full_allowed_modules_validates():
    """Full `{id, version, publisher, lockHash}` posture entry — pins all
    four fields; document entry must equal all four to be admitted (§4.4)."""
    doc = _minimal_posture()
    doc["allowedModules"] = [
        {
            "id": "x-formspec-presentation",
            "version": "0.1.0",
            "publisher": "https://example.org/",
            "lockHash": "sha256:abc123",
        },
    ]
    VALIDATOR.validate(doc)


def test_posture_allowed_modules_empty_array_validates():
    """Explicit `allowedModules: []` declaration validates — semantically
    'no modules admitted' (deployment refuses any module-bearing document)."""
    doc = _minimal_posture()
    doc["allowedModules"] = []
    VALIDATOR.validate(doc)


# ─── allowedModules entries follow ModuleRef shape ──────────────────────────


def test_posture_allowed_modules_rejects_missing_id():
    doc = _minimal_posture()
    doc["allowedModules"] = [{"version": "1.0.0"}]
    with pytest.raises(ValidationError):
        VALIDATOR.validate(doc)


def test_posture_allowed_modules_rejects_missing_version():
    doc = _minimal_posture()
    doc["allowedModules"] = [{"id": "x-foo"}]
    with pytest.raises(ValidationError):
        VALIDATOR.validate(doc)


def test_posture_allowed_modules_rejects_bad_id_pattern():
    doc = _minimal_posture()
    doc["allowedModules"] = [{"id": "not-x-prefixed", "version": "1.0.0"}]
    with pytest.raises(ValidationError):
        VALIDATOR.validate(doc)


def test_posture_allowed_modules_rejects_bad_lockhash_pattern():
    doc = _minimal_posture()
    doc["allowedModules"] = [
        {"id": "x-foo", "version": "1.0.0", "lockHash": "not-a-digest"},
    ]
    with pytest.raises(ValidationError):
        VALIDATOR.validate(doc)


# ─── allowedActors accepts URN list ─────────────────────────────────────────


def test_posture_with_allowed_actors_validates():
    """ADR §5.4: `allowedActors` is a flat URN list (not ModuleRef shape)."""
    doc = _minimal_posture()
    doc["allowedActors"] = [
        "urn:formspec:actor:human:alice",
        "urn:formspec:actor:ai-agent:mcp:wireframes:agent-7",
    ]
    VALIDATOR.validate(doc)


def test_posture_allowed_actors_empty_array_validates():
    """Explicit `allowedActors: []` declaration validates — semantically
    'no actors admitted' (deployment refuses any authored act)."""
    doc = _minimal_posture()
    doc["allowedActors"] = []
    VALIDATOR.validate(doc)


# ─── allowedActors entries must match URN pattern ───────────────────────────


def test_posture_allowed_actors_rejects_bare_name():
    """ADR §5.4: actor entries are URN-typed; bare names are rejected."""
    doc = _minimal_posture()
    doc["allowedActors"] = ["alice"]
    with pytest.raises(ValidationError):
        VALIDATOR.validate(doc)


def test_posture_allowed_actors_rejects_wrong_urn_scheme():
    """ADR §5.4: actor URNs use the `urn:formspec:actor:` prefix. Other
    URN schemes (urn:ietf:..., urn:wos:..., etc.) are not admitted."""
    doc = _minimal_posture()
    doc["allowedActors"] = ["urn:wos:role:reviewer"]
    with pytest.raises(ValidationError):
        VALIDATOR.validate(doc)


def test_posture_allowed_actors_rejects_non_string_entry():
    doc = _minimal_posture()
    doc["allowedActors"] = [{"id": "urn:formspec:actor:human:alice"}]
    with pytest.raises(ValidationError):
        VALIDATOR.validate(doc)


# ─── Both fields together compose without conflict ──────────────────────────


def test_posture_with_both_fields_validates():
    doc = _minimal_posture()
    doc["allowedModules"] = [
        {"id": "x-formspec-core-task", "version": "^1.0.0"},
        {"id": "x-formspec-presentation", "version": "0.1.0", "lockHash": "sha256:def456"},
    ]
    doc["allowedActors"] = [
        "urn:formspec:actor:human:alice",
    ]
    VALIDATOR.validate(doc)
