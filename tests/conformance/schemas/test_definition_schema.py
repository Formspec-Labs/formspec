"""Conformance tests for Formspec definition.schema.json.

Tests are organised into classes that mirror the schema's top-level
and nested structures.  Every positive test calls ``jsonschema.validate``
directly; every negative test asserts that ``ValidationError`` is raised.
"""

import copy
import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError, validate

from tests.unit.support.helpers import (
    base_definition as _base_doc,
    minimal_display as _minimal_display,
    minimal_field as _shared_minimal_field,
    minimal_group as _minimal_group,
)
from tests.unit.support.schema_fixtures import load_schema, build_schema_registry

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

COMMON_SCHEMA = load_schema("common.schema.json")
FIXTURE_DIR = Path(__file__).resolve().parents[2] / "fixtures"

@pytest.fixture(scope="session")
def schema():
    """Load and return the Formspec definition JSON Schema."""
    return load_schema("definition.schema.json")


def _validate(instance, schema):
    """Validate *instance* against *schema* using Draft 2020-12."""
    registry = build_schema_registry(COMMON_SCHEMA, schema)
    Draft202012Validator(schema, registry=registry).validate(instance)


# ---------------------------------------------------------------------------
# Helpers – reusable document fragments
# ---------------------------------------------------------------------------

def _minimal_field(key="f1", dataType="string", **overrides):
    item = _shared_minimal_field(key=key, data_type=dataType, label="F")
    item.update(overrides)
    return item


# ===================================================================
# TestMinimalValid
# ===================================================================

class TestMinimalValid:
    """Minimal documents that MUST validate."""

    def test_minimal_definition(self, schema):
        _validate(_base_doc(), schema)

    def test_root_x_annotation_is_allowed(self, schema):
        doc = _base_doc()
        doc["x-local-note"] = {"owner": "platform"}
        _validate(doc, schema)

    def test_unknown_non_x_root_key_is_rejected(self, schema):
        doc = _base_doc()
        doc["localNote"] = {"owner": "platform"}
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_minimal_group_item(self, schema):
        doc = _base_doc(items=[_minimal_group()])
        _validate(doc, schema)

    def test_minimal_display_item(self, schema):
        doc = _base_doc(items=[_minimal_display()])
        _validate(doc, schema)

    @pytest.mark.parametrize("relative_path", [
        "items/consequences/referral-warning.definition.json",
        "items/purpose/authority-citation.definition.json",
        "definition/preparation-fees/fel-fees.definition.json",
        "definition/assurance/required-assurance.definition.json",
        "definition/assurance/ial-only.definition.json",
        "definition/assurance/aal-only.definition.json",
        "definition/assurance/jurisdiction-only.definition.json",
        "definition/assurance/full-l4-assurance.definition.json",
        "definition/multi-party/coequal-joint-tax.definition.json",
        "definition/multi-party/asymmetric-immigration-sponsorship.definition.json",
    ])
    def test_ext_ratification_fixtures_validate(self, schema, relative_path):
        doc = json.loads((FIXTURE_DIR / relative_path).read_text(encoding="utf-8"))
        _validate(doc, schema)

    def test_ext28_unknown_role_class_fixture_is_rejected(self, schema):
        """EXT-28 / ADR-0155 MP-02: role-class enum is closed; documents with
        unknown class values (e.g., `witness`, `notary`) MUST fail schema
        validation. Domain-specific party metadata belongs in `extensions`."""
        doc = json.loads(
            (FIXTURE_DIR / "definition/multi-party/unknown-role-class-rejected.definition.json").read_text(encoding="utf-8")
        )
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    ALL_DATA_TYPES = [
        "string", "text", "integer", "decimal", "boolean",
        "date", "dateTime", "time", "uri", "attachment",
        "choice", "multiChoice", "money",
    ]

    @pytest.mark.parametrize("dt", ALL_DATA_TYPES)
    def test_minimal_field_each_datatype(self, schema, dt):
        doc = _base_doc(items=[_minimal_field(dataType=dt)])
        _validate(doc, schema)


# ===================================================================
# TestTopLevelEnums
# ===================================================================

class TestTopLevelEnums:
    """Invalid enum values at the top level."""

    def test_invalid_status(self, schema):
        doc = _base_doc(status="archived")
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("val", ["random", "sha256", ""])
    def test_invalid_version_algorithm(self, schema, val):
        doc = _base_doc(versionAlgorithm=val)
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("val", ["hide", "delete", ""])
    def test_invalid_non_relevant_behavior(self, schema, val):
        doc = _base_doc(nonRelevantBehavior=val)
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_invalid_assurance_level(self, schema):
        doc = _base_doc(metadata={"assurance": {"ial": "L5"}})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_assurance_rejects_unknown_subkey(self, schema):
        # AssuranceRequirement is additionalProperties: false — only ial/aal/jurisdiction allowed.
        doc = _base_doc(metadata={"assurance": {"ial": "L2", "fal": "L2"}})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_assurance_rejects_empty_object(self, schema):
        # AssuranceRequirement has minProperties: 1 — empty {} is not a declaration.
        doc = _base_doc(metadata={"assurance": {}})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_assurance_rejects_empty_jurisdiction(self, schema):
        # jurisdiction minLength: 1 — empty string is not a valid policy namespace.
        doc = _base_doc(metadata={"assurance": {"ial": "L2", "jurisdiction": ""}})
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestTopLevelFormats
# ===================================================================

class TestTopLevelFormats:
    """Format validation for top-level string fields."""

    def test_valid_url(self, schema):
        doc = _base_doc(url="https://example.com/form/1")
        _validate(doc, schema)

    def test_valid_date(self, schema):
        doc = _base_doc(date="2025-01-15")
        _validate(doc, schema)


class TestMetadataAndFees:
    """EXT-7 and EXT-8 form-level metadata validation."""

    def test_preparation_and_fel_fees_are_valid(self, schema):
        doc = _base_doc(
            metadata={
                "preparation": {
                    "documents": [{"id": "taxReturn", "label": "Prior-year tax return"}],
                    "expectedAcquisitionWindows": {
                        "taxReturn": {"label": "2-5 business days", "minDays": 2, "maxDays": 5}
                    },
                }
            },
            fees={
                "currency": "USD",
                "lineItems": [
                    {"id": "baseFee", "label": "Base fee", "calculate": "25"},
                    {"id": "rushFee", "label": "Rush fee", "calculate": "if($rush = true, 15, 0)"},
                ],
            },
        )
        _validate(doc, schema)

    def test_fee_line_item_requires_calculate(self, schema):
        doc = _base_doc(fees={"lineItems": [{"id": "baseFee", "label": "Base fee"}]})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_metadata_rejects_extension_seam(self, schema):
        doc = _base_doc(metadata={"extensions": {"x-vendor": True}})
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestParties — EXT-28 / ADR-0155 §4 multi-party intake
# ===================================================================


class TestParties:
    """EXT-28 / ADR-0155 §4: parties[] declarations + per-item partyPolicy.

    Locks MP-01 (slot identity), MP-02 (closed role-class enum), MP-03
    (party-role object closure), MP-04 (cardinality), MP-07 (closed tier
    enum), MP-08 (closed visibility-kind set), MP-10 (no empty arrays).
    Cross-resolution clauses (MP-09 / MP-11 / MP-12..14 / MP-05) are
    out-of-schema — they belong to static lint and runtime validators.
    """

    def _minimal_role(self, **overrides):
        role = {
            "roleId": "primary",
            "label": "Primary",
            "role": "coEqual",
            "cardinality": {"min": 1, "max": 1},
        }
        role.update(overrides)
        return role

    def _minimal_two_coequal(self):
        return [
            self._minimal_role(roleId="primary"),
            self._minimal_role(roleId="secondary"),
        ]

    def test_minimal_parties_block_validates(self, schema):
        doc = _base_doc(parties=self._minimal_two_coequal())
        _validate(doc, schema)

    def test_multi_party_tier_coequal_validates(self, schema):
        doc = _base_doc(
            parties=self._minimal_two_coequal(),
            multiParty={"tier": "coEqual"},
        )
        _validate(doc, schema)

    def test_multi_party_tier_asymmetric_validates(self, schema):
        doc = _base_doc(
            parties=[
                self._minimal_role(roleId="primary", role="asymmetricPrimary"),
                self._minimal_role(roleId="secondary", role="asymmetricSecondary"),
            ],
            multiParty={"tier": "asymmetric"},
        )
        _validate(doc, schema)

    # --- MP-02 closed role-class enum ----------------------------------

    @pytest.mark.parametrize("bad_class", ["witness", "notary", "coSigner", "", "COEQUAL"])
    def test_unknown_role_class_rejected(self, schema, bad_class):
        doc = _base_doc(parties=[self._minimal_role(role=bad_class)])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize(
        "class_value",
        ["coEqual", "asymmetricPrimary", "asymmetricSecondary", "guardianFor"],
    )
    def test_all_four_role_classes_accepted(self, schema, class_value):
        doc = _base_doc(parties=[self._minimal_role(role=class_value)])
        _validate(doc, schema)

    # --- MP-01 roleId pattern + uniqueness (lexical only) -------------

    @pytest.mark.parametrize(
        "bad_role_id", ["1leading", "has space", "_leading", "has.dot", "has/slash", ""]
    )
    def test_role_id_pattern_violations_rejected(self, schema, bad_role_id):
        doc = _base_doc(parties=[self._minimal_role(roleId=bad_role_id)])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize(
        "role_id", ["primary", "primary1", "primary-with-dashes", "primary_with_underscores", "P", "Z9"]
    )
    def test_role_id_pattern_accepts_valid(self, schema, role_id):
        doc = _base_doc(parties=[self._minimal_role(roleId=role_id)])
        _validate(doc, schema)

    # --- MP-03 party-role object closure -------------------------------

    def test_party_role_rejects_unknown_property(self, schema):
        role = self._minimal_role()
        role["unknownProperty"] = "value"
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_party_role_extensions_accepted(self, schema):
        role = self._minimal_role(extensions={"x-jurisdiction-witness-rule": True})
        doc = _base_doc(parties=[role])
        _validate(doc, schema)

    def test_party_role_rejects_non_x_extension(self, schema):
        role = self._minimal_role(extensions={"witness": True})
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    # --- MP-04 cardinality --------------------------------------------

    def test_cardinality_required(self, schema):
        role = {"roleId": "primary", "role": "coEqual"}
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_cardinality_unbounded_max_accepted(self, schema):
        role = self._minimal_role(cardinality={"min": 0, "max": "unbounded"})
        doc = _base_doc(parties=[role])
        _validate(doc, schema)

    def test_cardinality_negative_min_rejected(self, schema):
        role = self._minimal_role(cardinality={"min": -1, "max": 1})
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_cardinality_zero_max_rejected(self, schema):
        role = self._minimal_role(cardinality={"min": 0, "max": 0})
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_cardinality_unknown_string_max_rejected(self, schema):
        role = self._minimal_role(cardinality={"min": 0, "max": "many"})
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    # --- MP-07 closed tier enum ---------------------------------------

    @pytest.mark.parametrize("bad_tier", ["coequal", "asym", "", "hybrid"])
    def test_unknown_tier_rejected(self, schema, bad_tier):
        doc = _base_doc(
            parties=self._minimal_two_coequal(),
            multiParty={"tier": bad_tier},
        )
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_multi_party_block_requires_tier(self, schema):
        doc = _base_doc(
            parties=self._minimal_two_coequal(),
            multiParty={},
        )
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_multi_party_block_rejects_unknown_property(self, schema):
        doc = _base_doc(
            parties=self._minimal_two_coequal(),
            multiParty={"tier": "coEqual", "unknown": True},
        )
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    # --- parties[] cannot be empty -------------------------------------

    def test_parties_empty_array_rejected(self, schema):
        doc = _base_doc(parties=[])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    # --- MP-08 closed per-item visibility-kind set --------------------

    def test_party_policy_visible_to_valid(self, schema):
        item = _minimal_field(
            partyPolicy={"visibleTo": ["primary", "secondary"]}
        )
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[item])
        _validate(doc, schema)

    def test_party_policy_all_three_kinds_valid(self, schema):
        item = _minimal_field(
            partyPolicy={
                "visibleTo": ["primary", "secondary"],
                "editableBy": ["primary"],
                "signedBy": ["primary", "secondary"],
            }
        )
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[item])
        _validate(doc, schema)

    def test_party_policy_rejects_unknown_kind(self, schema):
        # MP-08: additionalProperties: false on ItemPartyPolicy. New
        # visibility kinds (e.g., `archiveBy`, `redactFor`) belong in
        # Item.extensions, NOT as new top-level partyPolicy keys.
        item = _minimal_field(
            partyPolicy={
                "visibleTo": ["primary"],
                "archiveBy": ["primary"],
            }
        )
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    # --- MP-10 empty arrays forbidden ---------------------------------

    @pytest.mark.parametrize("kind", ["visibleTo", "editableBy", "signedBy"])
    def test_party_policy_empty_array_rejected(self, schema, kind):
        item = _minimal_field(partyPolicy={kind: []})
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_party_policy_minproperties_one(self, schema):
        # Empty ItemPartyPolicy {} is meaningless — at least one kind required.
        item = _minimal_field(partyPolicy={})
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("kind", ["visibleTo", "editableBy", "signedBy"])
    def test_party_policy_duplicate_role_ref_rejected(self, schema, kind):
        item = _minimal_field(partyPolicy={kind: ["primary", "primary"]})
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_party_policy_on_group_item(self, schema):
        group = _minimal_group()
        group["partyPolicy"] = {"visibleTo": ["primary"]}
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[group])
        _validate(doc, schema)

    def test_party_policy_on_display_item(self, schema):
        display = _minimal_display()
        display["partyPolicy"] = {"visibleTo": ["primary"]}
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[display])
        _validate(doc, schema)

    # --- PartyRoleRef pattern ------------------------------------------

    def test_party_policy_role_ref_pattern_enforced(self, schema):
        # PartyRoleRef enforces the same pattern as PartyRole.roleId.
        # Cross-resolution (does the referenced roleId exist in parties[]?)
        # is a static-lint pass — out of schema scope.
        item = _minimal_field(partyPolicy={"visibleTo": ["1bad"]})
        doc = _base_doc(parties=self._minimal_two_coequal(), items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    # --- PartyAssuranceFloor closure ----------------------------------

    def test_assurance_floor_accepts_ial_aal_fal(self, schema):
        role = self._minimal_role(
            assuranceFloor={"ial": "L3", "aal": "L2", "fal": "L1"}
        )
        doc = _base_doc(parties=[role])
        _validate(doc, schema)

    def test_assurance_floor_rejects_unknown_axis(self, schema):
        role = self._minimal_role(assuranceFloor={"ial": "L2", "unknown": "L1"})
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_assurance_floor_minproperties_one(self, schema):
        role = self._minimal_role(assuranceFloor={})
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    # --- PartyVisibilityScope closed enum -----------------------------

    @pytest.mark.parametrize("scope", ["shared", "scoped"])
    def test_visibility_scope_accepts_known(self, schema, scope):
        role = self._minimal_role(visibilityScope=scope)
        doc = _base_doc(parties=[role])
        _validate(doc, schema)

    @pytest.mark.parametrize("scope", ["public", "private", "", "Shared"])
    def test_visibility_scope_rejects_unknown(self, schema, scope):
        role = self._minimal_role(visibilityScope=scope)
        doc = _base_doc(parties=[role])
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestItemDiscrimination
# ===================================================================

class TestItemDiscrimination:
    """if/then/else discrimination on item type."""

    def test_group_requires_children(self, schema):
        item = {"key": "g1", "type": "group", "label": "G"}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_group_with_datatype_fails(self, schema):
        item = {"key": "g1", "type": "group", "label": "G",
                "children": [_minimal_field()], "dataType": "string"}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_field_requires_datatype(self, schema):
        item = {"key": "f1", "type": "field", "label": "F"}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_field_with_invalid_datatype(self, schema):
        item = {"key": "f1", "type": "field", "label": "F", "dataType": "blob"}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_display_with_children_fails(self, schema):
        item = {"key": "d1", "type": "display", "label": "D",
                "children": [_minimal_field()]}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_display_with_datatype_fails(self, schema):
        item = {"key": "d1", "type": "display", "label": "D",
                "dataType": "string"}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_retired_privacy_item_block_is_rejected(self, schema):
        item = _minimal_field(privacy={"protectable": True, "class": "safe-address"})
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_item_consequences_referral_block_is_valid(self, schema):
        item = _minimal_field(consequences={
            "summary": "This answer may notify another agency.",
            "externalActions": [{
                "kind": "referral",
                "label": "Notify downstream agency",
                "recipient": "Downstream agency",
            }],
        })
        doc = _base_doc(items=[item])
        _validate(doc, schema)

    def test_item_purpose_authority_block_is_valid(self, schema):
        item = _minimal_field(purpose={
            "summary": "Used to determine eligibility.",
            "authorityRef": "urn:example.gov:authority:eligibility:v1",
            "citationRefs": ["urn:example.gov:citation:eligibility-1"],
        })
        doc = _base_doc(items=[item])
        _validate(doc, schema)


# ===================================================================
# TestItemKeyPattern
# ===================================================================

class TestItemKeyPattern:
    """Item key must match ^[a-zA-Z][a-zA-Z0-9_]*$."""

    @pytest.mark.parametrize("key", ["a", "myField", "Section1", "a_b_c", "Z9"])
    def test_valid_keys(self, schema, key):
        doc = _base_doc(items=[_minimal_field(key=key)])
        _validate(doc, schema)

    @pytest.mark.parametrize("key", ["1start", "has space", "no-dash", "_leading", ""])
    def test_invalid_keys(self, schema, key):
        doc = _base_doc(items=[_minimal_field(key=key)])
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestBind
# ===================================================================

class TestBind:
    """Bind object validation."""

    def test_valid_bind_all_properties(self, schema):
        doc = _base_doc(binds=[{
            "path": "/f1",
            "calculate": "1 + 1",
            "relevant": "true",
            "required": "true",
            "readonly": "false",
            "constraint": ". > 0",
            "constraintMessage": "Must be positive",
            "default": "hello",
            "whitespace": "trim",
            "excludedValue": "null",
            "nonRelevantBehavior": "empty",
            "disabledDisplay": "protected",
        }])
        _validate(doc, schema)

    @pytest.mark.parametrize("val", ["strip", "collapse", ""])
    def test_invalid_whitespace(self, schema, val):
        doc = _base_doc(binds=[{"path": "/f1", "whitespace": val}])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("val", ["drop", "clear", ""])
    def test_invalid_excluded_value(self, schema, val):
        doc = _base_doc(binds=[{"path": "/f1", "excludedValue": val}])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("val", ["hide", "delete", ""])
    def test_invalid_non_relevant_behavior(self, schema, val):
        doc = _base_doc(binds=[{"path": "/f1", "nonRelevantBehavior": val}])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("val", ["grayed", "visible", ""])
    def test_invalid_disabled_display(self, schema, val):
        doc = _base_doc(binds=[{"path": "/f1", "disabledDisplay": val}])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_path_min_length(self, schema):
        doc = _base_doc(binds=[{"path": ""}])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_additional_properties_rejected(self, schema):
        doc = _base_doc(binds=[{"path": "/f1", "extra": True}])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_bind_with_extensions(self, schema):
        doc = _base_doc(binds=[{"path": "/f1", "extensions": {"x-custom": 1}}])
        _validate(doc, schema)


# ===================================================================
# TestShape
# ===================================================================

class TestShape:
    """Shape (validation rule) object."""

    def test_valid_shape_with_constraint(self, schema):
        doc = _base_doc(shapes=[{
            "id": "s1", "target": "/f1", "message": "bad",
            "constraint": ". > 0",
        }])
        _validate(doc, schema)

    @pytest.mark.parametrize("combo_key,combo_val", [
        ("and", ["a > 0", "b > 0"]),
        ("or",  ["a > 0", "b > 0"]),
        ("not", "a > 0"),
        ("xone", ["a > 0", "b > 0"]),
    ])
    def test_valid_shape_logical_combos(self, schema, combo_key, combo_val):
        doc = _base_doc(shapes=[{
            "id": "s1", "target": "/f1", "message": "bad",
            combo_key: combo_val,
        }])
        _validate(doc, schema)

    @pytest.mark.parametrize("missing", ["id", "target", "message"])
    def test_shape_missing_required(self, schema, missing):
        shape = {"id": "s1", "target": "/f1", "message": "bad",
                 "constraint": ". > 0"}
        del shape[missing]
        doc = _base_doc(shapes=[shape])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_shape_without_any_rule_fails(self, schema):
        """Must have at least one of constraint/and/or/not/xone."""
        doc = _base_doc(shapes=[{
            "id": "s1", "target": "/f1", "message": "bad",
        }])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("val", ["fatal", "notice", ""])
    def test_invalid_severity(self, schema, val):
        doc = _base_doc(shapes=[{
            "id": "s1", "target": "/f1", "message": "bad",
            "constraint": "true", "severity": val,
        }])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("val", ["blur", "realtime", ""])
    def test_invalid_timing(self, schema, val):
        doc = _base_doc(shapes=[{
            "id": "s1", "target": "/f1", "message": "bad",
            "constraint": "true", "timing": val,
        }])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("bad_id", ["1abc", "has space", "", "$nope"])
    def test_invalid_id_pattern(self, schema, bad_id):
        doc = _base_doc(shapes=[{
            "id": bad_id, "target": "/f1", "message": "bad",
            "constraint": "true",
        }])
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestInstance
# ===================================================================

class TestInstance:
    """Instance object validation."""

    def test_valid_with_source(self, schema):
        doc = _base_doc(instances={"lookup": {
            "source": "https://api.example.com/data/{id}",
        }})
        _validate(doc, schema)

    def test_valid_with_data(self, schema):
        doc = _base_doc(instances={"static": {
            "data": {"key": "value"},
        }})
        _validate(doc, schema)

    def test_must_have_source_or_data(self, schema):
        doc = _base_doc(instances={"empty": {"description": "nothing"}})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_additional_properties_rejected(self, schema):
        doc = _base_doc(instances={"x": {
            "source": "https://example.com", "extra": True,
        }})
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestVariable
# ===================================================================

class TestVariable:
    """Variable object validation."""

    def test_valid_variable(self, schema):
        doc = _base_doc(variables=[{
            "name": "myVar", "expression": "1 + 2",
        }])
        _validate(doc, schema)

    @pytest.mark.parametrize("missing", ["name", "expression"])
    def test_missing_required(self, schema, missing):
        var = {"name": "v1", "expression": "1"}
        del var[missing]
        doc = _base_doc(variables=[var])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("bad_name", ["1abc", "has space", "a-b", ""])
    def test_invalid_name_pattern(self, schema, bad_name):
        doc = _base_doc(variables=[{
            "name": bad_name, "expression": "1",
        }])
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestOptionSet
# ===================================================================

class TestOptionSet:
    """OptionSet object validation."""

    def test_valid_with_options_array(self, schema):
        doc = _base_doc(optionSets={"colors": {
            "options": [{"value": "r", "label": "Red"}],
        }})
        _validate(doc, schema)

    def test_valid_with_source_uri(self, schema):
        doc = _base_doc(optionSets={"colors": {
            "source": "https://api.example.com/colors",
        }})
        _validate(doc, schema)

    def test_must_have_options_or_source(self, schema):
        doc = _base_doc(optionSets={"empty": {"valueField": "v"}})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_option_entry_missing_value(self, schema):
        doc = _base_doc(optionSets={"x": {
            "options": [{"label": "Red"}],
        }})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_option_entry_missing_label(self, schema):
        doc = _base_doc(optionSets={"x": {
            "options": [{"value": "r"}],
        }})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

# TestScreener — removed: screener is now a standalone document type,
# not a property of Definition. See schemas/screener.schema.json.

# ===================================================================
# TestMigrations
# ===================================================================

class TestMigrations:
    """Migrations object validation."""

    def test_valid_migration(self, schema):
        doc = _base_doc(migrations={
            "from": {
                "0.9.0": {
                    "description": "Upgrade from 0.9",
                    "fieldMap": [{
                        "source": "oldField",
                        "target": "newField",
                        "transform": "preserve",
                    }],
                    "defaults": {"newField2": "default_val"},
                },
            },
        })
        _validate(doc, schema)

    @pytest.mark.parametrize("val", ["rename", "copy", "map", ""])
    def test_invalid_transform_enum(self, schema, val):
        doc = _base_doc(migrations={
            "from": {
                "0.9.0": {
                    "fieldMap": [{
                        "source": "a", "target": "b", "transform": val,
                    }],
                },
            },
        })
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    @pytest.mark.parametrize("missing", ["source", "target", "transform"])
    def test_field_map_missing_required(self, schema, missing):
        fm = {"source": "a", "target": "b", "transform": "preserve"}
        del fm[missing]
        doc = _base_doc(migrations={
            "from": {"0.9.0": {"fieldMap": [fm]}},
        })
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_field_map_target_null_allowed(self, schema):
        """target may be null (for drops)."""
        doc = _base_doc(migrations={
            "from": {
                "0.9.0": {
                    "fieldMap": [{
                        "source": "a", "target": None, "transform": "drop",
                    }],
                },
            },
        })
        _validate(doc, schema)


# ===================================================================
# TestExtensions
# ===================================================================

class TestExtensions:
    """Extension property (x-*) enforcement."""

    def test_valid_top_level_extension(self, schema):
        doc = _base_doc(extensions={"x-vendor": {"flag": True}})
        _validate(doc, schema)

    def test_non_x_prefix_top_level_fails(self, schema):
        doc = _base_doc(extensions={"vendor": True})
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_extension_on_bind(self, schema):
        doc = _base_doc(binds=[{
            "path": "/f1",
            "extensions": {"x-audit": True},
        }])
        _validate(doc, schema)

    def test_extension_on_shape(self, schema):
        doc = _base_doc(shapes=[{
            "id": "s1", "target": "/f1", "message": "m",
            "constraint": "true",
            "extensions": {"x-custom": 1},
        }])
        _validate(doc, schema)

    def test_extension_on_item(self, schema):
        item = _minimal_field()
        item["extensions"] = {"x-render": "slider"}
        doc = _base_doc(items=[item])
        _validate(doc, schema)

    def test_non_x_prefix_on_item_extension_fails(self, schema):
        item = _minimal_field()
        item["extensions"] = {"render": "slider"}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_extension_on_variable(self, schema):
        doc = _base_doc(variables=[{
            "name": "v1", "expression": "1",
            "extensions": {"x-debug": True},
        }])
        _validate(doc, schema)

    def test_extension_on_option_set(self, schema):
        doc = _base_doc(optionSets={"os1": {
            "options": [{"value": "a", "label": "A"}],
            "extensions": {"x-sort": "asc"},
        }})
        _validate(doc, schema)


# ===================================================================
# TestFieldOptions
# ===================================================================

class TestFieldOptions:
    """Field-level options can be an array or a URI string."""

    def test_options_as_array(self, schema):
        item = _minimal_field(dataType="choice")
        item["options"] = [{"value": "a", "label": "A"}]
        doc = _base_doc(items=[item])
        _validate(doc, schema)

    def test_options_as_uri_string(self, schema):
        item = _minimal_field(dataType="choice")
        item["options"] = "https://api.example.com/options"
        doc = _base_doc(items=[item])
        _validate(doc, schema)

    def test_options_invalid_type(self, schema):
        item = _minimal_field(dataType="choice")
        item["options"] = 42
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestPrePopulate
# ===================================================================

class TestPrePopulate:
    """prePopulate sub-object on a field."""

    def test_valid_prepopulate(self, schema):
        item = _minimal_field()
        item["prePopulate"] = {
            "instance": "lookup",
            "path": "/patient/name",
            "editable": False,
        }
        doc = _base_doc(items=[item])
        _validate(doc, schema)

    def test_prepopulate_missing_instance(self, schema):
        item = _minimal_field()
        item["prePopulate"] = {"path": "/x"}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_prepopulate_missing_path(self, schema):
        item = _minimal_field()
        item["prePopulate"] = {"instance": "lookup"}
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_prepopulate_additional_props_rejected(self, schema):
        item = _minimal_field()
        item["prePopulate"] = {
            "instance": "lookup", "path": "/x", "extra": True,
        }
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestGroupSpecific
# ===================================================================

class TestGroupSpecific:
    """Group-specific properties: repeatable, minRepeat, maxRepeat, $ref, keyPrefix."""

    def test_group_with_repeat_props(self, schema):
        item = _minimal_group()
        item["repeatable"] = True
        item["minRepeat"] = 1
        item["maxRepeat"] = 5
        doc = _base_doc(items=[item])
        _validate(doc, schema)

    def test_group_with_ref_and_key_prefix(self, schema):
        item = {
            "key": "imported",
            "type": "group",
            "label": "Imported",
            "children": [_minimal_field()],
            "$ref": "https://example.com/shared-section",
            "keyPrefix": "imp",
        }
        doc = _base_doc(items=[item])
        _validate(doc, schema)

    def test_field_cannot_have_repeatable(self, schema):
        item = _minimal_field()
        item["repeatable"] = True
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_min_repeat_minimum_zero(self, schema):
        item = _minimal_group()
        item["repeatable"] = True
        item["minRepeat"] = -1
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_max_repeat_minimum_one(self, schema):
        item = _minimal_group()
        item["repeatable"] = True
        item["maxRepeat"] = 0
        doc = _base_doc(items=[item])
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestRecursiveChildren
# ===================================================================

class TestRecursiveChildren:
    """Nested / recursive item structures."""

    def test_group_containing_fields(self, schema):
        group = _minimal_group(children=[
            _minimal_field(key="f1"),
            _minimal_field(key="f2", dataType="integer"),
        ])
        doc = _base_doc(items=[group])
        _validate(doc, schema)

    def test_two_levels_deep(self, schema):
        inner = _minimal_group(key="inner", children=[
            _minimal_field(key="deep"),
        ])
        outer = _minimal_group(key="outer", children=[inner])
        doc = _base_doc(items=[outer])
        _validate(doc, schema)

    def test_group_display_field_mix(self, schema):
        group = _minimal_group(children=[
            _minimal_field(key="f1"),
            _minimal_display(key="d1"),
            _minimal_group(key="sub", children=[_minimal_field(key="f2")]),
        ])
        doc = _base_doc(items=[group])
        _validate(doc, schema)

    def test_field_with_children(self, schema):
        """Fields may also have children (sub-items)."""
        item = _minimal_field(key="parent")
        item["children"] = [_minimal_field(key="child")]
        doc = _base_doc(items=[item])
        _validate(doc, schema)


# ===================================================================
# TestDerivedFrom
# ===================================================================

class TestDerivedFrom:
    """derivedFrom oneOf: URI string or {url, version} object."""

    def test_derived_from_uri_string(self, schema):
        doc = _base_doc(derivedFrom="https://example.com/forms/parent")
        _validate(doc, schema)

    def test_derived_from_object_with_url_and_version(self, schema):
        doc = _base_doc(derivedFrom={"url": "https://example.com/forms/parent", "version": "1.0.0"})
        _validate(doc, schema)

    def test_derived_from_object_url_only(self, schema):
        doc = _base_doc(derivedFrom={"url": "https://example.com/forms/parent"})
        _validate(doc, schema)

    def test_derived_from_invalid_number(self, schema):
        doc = _base_doc(derivedFrom=42)
        with pytest.raises(ValidationError):
            _validate(doc, schema)

    def test_derived_from_invalid_empty_object(self, schema):
        doc = _base_doc(derivedFrom={})
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestFormPresentation
# ===================================================================

class TestFormPresentation:
    """formPresentation advisory object."""

    def test_valid_with_all_three_props(self, schema):
        doc = _base_doc(formPresentation={
            "pageMode": "wizard",
            "labelPosition": "start",
            "density": "compact",
        })
        _validate(doc, schema)

    def test_empty_valid(self, schema):
        doc = _base_doc(formPresentation={})
        _validate(doc, schema)

    def test_invalid_page_mode(self, schema):
        doc = _base_doc(formPresentation={"pageMode": "carousel"})
        with pytest.raises(ValidationError):
            _validate(doc, schema)


# ===================================================================
# TestShapeContext
# ===================================================================

class TestShapeContext:
    """Shape context as string map."""

    def test_shape_with_context(self, schema):
        doc = _base_doc(shapes=[{
            "id": "s1", "target": "/f1", "message": "bad",
            "constraint": ". > 0",
            "context": {"fieldValue": "$f1", "limit": "100"},
        }])
        _validate(doc, schema)


# ===================================================================
# TestGroupRefOnly
# ===================================================================

class TestGroupRefOnly:
    """Group with $ref only (no children)."""

    def test_group_with_ref_only(self, schema):
        item = {
            "key": "imported",
            "type": "group",
            "label": "Imported Section",
            "$ref": "https://example.com/shared-section",
        }
        doc = _base_doc(items=[item])
        _validate(doc, schema)
