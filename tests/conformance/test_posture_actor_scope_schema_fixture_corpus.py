"""Schema conformance corpus for ADR 0152 §5.1 — `posture.extensions.x-formspec-actor-scope`.

Fixtures live under tests/conformance/fixtures/posture-actor-scope/*.case.json and
carry two independent verdicts per case:

* ``expectSchemaValid`` — owned here. Whether the whole posture document validates
  against ``schemas/posture-declaration.schema.json``.
* ``expectedAdmission`` — owned by studio-core's ``parseActorScopeDeclaration`` /
  branch-open gate (``formspec-studio-core/src/actor-posture-admission.ts``). Carried
  in the fixture so the evaluation half of §5.1 reads the same corpus rather than
  forking one.

The two disagree on exactly the rows JSON Schema cannot express (duplicate handles)
or that belong to a different gate (a malformed posture document vs a malformed actor
scope). Those rows carry a ``note`` explaining the divergence — see
``test_divergent_verdicts_are_documented``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / "tests" / "conformance" / "fixtures" / "posture-actor-scope"
SCHEMAS_DIR = ROOT / "schemas"

COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text(encoding="utf-8"))
POSTURE_SCHEMA = json.loads(
    (SCHEMAS_DIR / "posture-declaration.schema.json").read_text(encoding="utf-8")
)

REGISTRY = Registry().with_resources([
    (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
    (POSTURE_SCHEMA["$id"], Resource.from_contents(POSTURE_SCHEMA, default_specification=DRAFT202012)),
])
VALIDATOR = Draft202012Validator(POSTURE_SCHEMA, registry=REGISTRY)

# Branch-open outcomes: `admit` attaches parsed rules, `binary-fallback` opens with
# `allowedActors[]` only, the rest are `ActorAdmissionDeniedReason` members.
ADMISSION_VERDICTS = {
    "admit",
    "binary-fallback",
    "posture-config-invalid",
    "class-scope-deferred",
}

# One per schema-expressible row of the §5.1 matrix, plus the two rows that prove
# the seam stays open (`^x-` passthrough, reserved class-scope hook).
REQUIRED_CASES = {
    "valid-minimal-declaration",
    "valid-empty-protects-noop",
    "valid-freeze-empty-writable-by",
    "valid-freeze-empty-selector-arrays",
    "valid-values-narrowing-route-class",
    "valid-null-payload-binary-fallback",
    "valid-absent-hook-binary-fallback",
    "valid-unknown-extension-key-passthrough",
    "valid-class-scope-reserved-hook-still-deferred",
    "valid-class-scope-null-explicit-no-config",
    "duplicate-vocabulary-handles",
    "invalid-empty-object-payload",
    "invalid-unknown-actor-scope-version",
    "invalid-absent-protects",
    "invalid-unknown-vocabulary-handle",
    "invalid-values-on-operation-handle",
    "invalid-unknown-values-key",
    "invalid-extra-sibling-keys",
    "invalid-class-scope-empty-object",
    "invalid-typo-reserved-key",
    "invalid-whitespace-only-id",
}


def _fixture_cases() -> list[tuple[Path, dict[str, Any]]]:
    return [
        (path, json.loads(path.read_text(encoding="utf-8")))
        for path in sorted(FIXTURE_DIR.glob("*.case.json"))
    ]


def test_posture_actor_scope_fixture_corpus_covers_required_cases() -> None:
    present = {case["id"] for _, case in _fixture_cases()}
    missing = REQUIRED_CASES - present
    assert not missing, f"missing posture-actor-scope fixture cases: {sorted(missing)}"


@pytest.mark.parametrize(
    ("path", "case"),
    _fixture_cases(),
    ids=[case["id"] for _, case in _fixture_cases()],
)
def test_posture_actor_scope_schema_fixture_corpus(path: Path, case: dict[str, Any]) -> None:
    assert case["id"] == path.name.removesuffix(".case.json"), (
        f"{path.name}: case id must match the filename stem"
    )
    assert case["expectedAdmission"] in ADMISSION_VERDICTS, (
        f"{case['id']}: unknown expectedAdmission {case['expectedAdmission']!r}"
    )

    errors = sorted(VALIDATOR.iter_errors(case["postureDeclaration"]), key=lambda e: e.json_path)

    if case["expectSchemaValid"]:
        assert not errors, (
            f"{case['id']}: expected schema-valid, got "
            f"{[(e.json_path, e.message) for e in errors]} from {path.name}"
        )
    else:
        assert errors, (
            f"{case['id']}: expected schema-invalid, but the document validated "
            f"({case['adrRow']}) from {path.name}"
        )


# The only two verdict pairs where schema and branch-open agree. Schema-valid
# admits the document, and the gate either enforces the parsed rules (`admit`)
# or has nothing to enforce (`binary-fallback`); schema-invalid means the
# declaration is unenforceable, which the gate spells `posture-config-invalid`.
# EVERY other pair is a divergence and MUST carry a `note` — including the
# `binary-fallback` ones, where the gate cannot see the defect the schema
# rejects (a misspelled reserved key, a `{}` class scope) and would otherwise
# fall back to binary admission.
AGREEING_VERDICT_PAIRS = {
    (True, "admit"),
    (True, "binary-fallback"),
    (False, "posture-config-invalid"),
}


def test_divergent_verdicts_are_documented() -> None:
    """A schema verdict that disagrees with the branch-open verdict MUST say why.

    These are the rows §5.1 assigns to one layer because the other cannot carry
    them: duplicate handles JSON Schema cannot express, and reserved-namespace
    defects the gate cannot see because it looks up exact keys. An undocumented
    divergence is a drift bug, not a design choice.
    """
    for path, case in _fixture_cases():
        pair = (bool(case["expectSchemaValid"]), case["expectedAdmission"])
        if pair not in AGREEING_VERDICT_PAIRS:
            assert case.get("note"), (
                f"{case['id']}: schema and branch-open verdicts diverge "
                f"(schemaValid={case['expectSchemaValid']}, "
                f"admission={case['expectedAdmission']}) with no `note` explaining why "
                f"— see {path.name}"
            )


def test_duplicate_handle_rejection_is_not_schema_expressible() -> None:
    """Pins the known gap: §5.1 rejects duplicate handles, JSON Schema cannot.

    If a future schema rev closes it, this test fails and the fixture's
    `expectSchemaValid` flips with it — the gap never closes silently.
    """
    case = json.loads((FIXTURE_DIR / "duplicate-vocabulary-handles.case.json").read_text(encoding="utf-8"))
    assert case["expectSchemaValid"] is True
    assert case["expectedAdmission"] == "posture-config-invalid"
    assert not list(VALIDATOR.iter_errors(case["postureDeclaration"]))


def test_route_class_value_grain_vocabulary_matches_surface_schema() -> None:
    """The `surface.routeClass` value grain copies a vocabulary it does not own.

    ADR 0152 §4.2 binds the handle to `Route.routeClass` — the closed enum in
    `surface.schema.json`. This schema re-declares that enum inline (JSON Schema
    `propertyNames` cannot `$ref` a sibling document's enum through the lint
    crate's flat schema mirror), so the copy is drift-prone by construction:
    add a route class upstream and the posture schema silently keeps refusing
    `values` keys naming it. Read both at test time so the drift fails loudly.
    """
    surface_schema = json.loads(
        (SCHEMAS_DIR / "surface.schema.json").read_text(encoding="utf-8")
    )
    surface_enum = surface_schema["$defs"]["Route"]["properties"]["routeClass"]["enum"]

    value_grain_rules = [
        rule
        for rule in POSTURE_SCHEMA["$defs"]["ProtectedVocabulary"]["allOf"]
        if rule.get("if", {}).get("properties", {}).get("vocabulary", {}).get("const")
        == "surface.routeClass"
    ]
    assert len(value_grain_rules) == 1, (
        "posture-declaration.schema.json must carry exactly one `surface.routeClass` "
        f"value-grain rule; found {len(value_grain_rules)}"
    )
    posture_enum = (
        value_grain_rules[0]["then"]["properties"]["values"]["propertyNames"]["enum"]
    )

    assert posture_enum == surface_enum, (
        "routeClass vocabulary drift: posture-declaration.schema.json value-grain enum "
        f"{posture_enum} != surface.schema.json Route.routeClass enum {surface_enum}. "
        "Update the posture copy (and ADR 0152 §4.2) when the route-class vocabulary changes."
    )
