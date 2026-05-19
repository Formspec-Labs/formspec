"""Conformance tests for the Formspec mapping.schema.json."""

import pytest
from jsonschema import Draft202012Validator, ValidationError, validate

from tests.unit.support.schema_fixtures import load_schema

SCHEMA = load_schema("mapping.schema.json")


def _validate(instance):
    """Validate *instance* against the mapping schema using Draft 2020-12."""
    validate(instance, SCHEMA, cls=Draft202012Validator)


def _minimal_mapping(**overrides):
    """Return the smallest valid mapping document, with optional overrides."""
    doc = {
        "$formspecMapping": "1.0",
        "version": "1.0.0",
        "definitionRef": "https://example.com/def",
        "definitionVersion": ">=1.0.0 <2.0.0",
        "targetSchema": {"format": "json"},
        "rules": [
            {
                "sourcePath": "a",
                "targetPath": "b",
                "transform": "preserve",
            }
        ],
    }
    doc.update(overrides)
    return doc


def _minimal_rule(**overrides):
    """Return the smallest valid FieldRule, with optional overrides."""
    rule = {
        "sourcePath": "a",
        "targetPath": "b",
        "transform": "preserve",
    }
    rule.update(overrides)
    return rule


# ---------------------------------------------------------------------------
# TestMappingMinimalValid
# ---------------------------------------------------------------------------


class TestMappingMinimalValid:
    """Positive tests for minimal and full mapping documents."""

    def test_minimal_mapping(self):
        _validate(_minimal_mapping())

    def test_full_mapping_all_optional_fields(self):
        doc = _minimal_mapping(
            **{
                "$schema": "https://formspec.org/schemas/mapping/1.0",
                "direction": "forward",
                "defaults": {"foo": "bar"},
                "autoMap": True,
                "adapters": {
                    "json": {"pretty": True},
                },
                "x-custom": "hello",
            }
        )
        _validate(doc)


# ---------------------------------------------------------------------------
# TestMappingDirection
# ---------------------------------------------------------------------------


class TestMappingDirection:
    """Direction enum and default."""

    @pytest.mark.parametrize("direction", ["forward", "reverse", "both"])
    def test_valid_direction(self, direction):
        _validate(_minimal_mapping(direction=direction))

    def test_invalid_direction(self):
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(direction="sideways"))

    def test_default_direction_omitted_is_valid(self):
        doc = _minimal_mapping()
        assert "direction" not in doc
        _validate(doc)


# ---------------------------------------------------------------------------
# TestTargetSchema
# ---------------------------------------------------------------------------


class TestTargetSchema:
    """TargetSchema object validation."""

    @pytest.mark.parametrize("fmt", ["json", "xml", "csv"])
    def test_valid_core_format(self, fmt):
        ts = {"format": fmt}
        if fmt == "xml":
            ts["rootElement"] = "Root"
        _validate(_minimal_mapping(targetSchema=ts))

    def test_valid_custom_x_format(self):
        _validate(_minimal_mapping(targetSchema={"format": "x-custom"}))

    def test_invalid_format(self):
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(targetSchema={"format": "yaml"}))

    def test_xml_requires_root_element(self):
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(targetSchema={"format": "xml"}))

    def test_json_does_not_require_root_element(self):
        _validate(_minimal_mapping(targetSchema={"format": "json"}))

    def test_additional_properties_rejected(self):
        with pytest.raises(ValidationError):
            _validate(
                _minimal_mapping(targetSchema={"format": "json", "extra": True})
            )


# ---------------------------------------------------------------------------
# TestFieldRule
# ---------------------------------------------------------------------------


class TestFieldRule:
    """FieldRule constraints."""

    def test_valid_rule_preserve(self):
        _validate(_minimal_mapping())

    def test_must_have_source_or_target(self):
        """Having at least one of sourcePath / targetPath is fine."""
        # only sourcePath
        _validate(
            _minimal_mapping(
                rules=[{"sourcePath": "a", "transform": "drop"}]
            )
        )
        # only targetPath
        _validate(
            _minimal_mapping(
                rules=[
                    {
                        "targetPath": "b",
                        "transform": "constant",
                        "expression": "'hello'",
                    }
                ]
            )
        )

    def test_missing_both_source_and_target_fails(self):
        with pytest.raises(ValidationError):
            _validate(
                _minimal_mapping(rules=[{"transform": "preserve"}])
            )

    def test_null_target_path_valid(self):
        _validate(
            _minimal_mapping(
                rules=[{"sourcePath": "a", "targetPath": None, "transform": "drop"}]
            )
        )

    @pytest.mark.parametrize(
        "transform",
        [
            "preserve",
            "drop",
            "expression",
            "coerce",
            "valueMap",
            "flatten",
            "nest",
            "constant",
            "concat",
            "split",
        ],
    )
    def test_all_transform_values(self, transform):
        rule = {"sourcePath": "a", "targetPath": "b", "transform": transform}
        # Some transforms require companion fields
        if transform in ("expression", "constant", "concat", "split"):
            rule["expression"] = "$ + 1"
        elif transform == "coerce":
            rule["coerce"] = {"from": "string", "to": "integer"}
        elif transform == "valueMap":
            rule["valueMap"] = {"forward": {"yes": "true", "no": "false"}}
        _validate(_minimal_mapping(rules=[rule]))

    def test_invalid_transform(self):
        with pytest.raises(ValidationError):
            _validate(
                _minimal_mapping(
                    rules=[{"sourcePath": "a", "targetPath": "b", "transform": "magic"}]
                )
            )


# ---------------------------------------------------------------------------
# TestProjectionHint
# ---------------------------------------------------------------------------


class TestProjectionHint:
    """Static projection metadata on FieldRule and InnerRule."""

    def test_valid_projection_hint_on_field_rule(self):
        rule = _minimal_rule(
            transform="expression",
            expression="formatCurrency($, 'USD')",
            projection={
                "targetType": "string",
                "required": True,
                "lossy": False,
                "emit": True,
                "notes": "Formatted for the target API.",
            },
        )
        _validate(_minimal_mapping(rules=[rule]))

    def test_valid_projection_hint_with_source_paths_and_target_enum(self):
        rule = _minimal_rule(
            projection={
                "sourcePaths": ["firstName", "lastName"],
                "targetEnum": ["low", "medium", "high"],
            }
        )
        _validate(_minimal_mapping(rules=[rule]))

    def test_valid_projection_hint_with_x_extension(self):
        rule = _minimal_rule(
            projection={
                "targetType": "string",
                "x-jsonSchema": {"type": "string", "format": "email"},
            }
        )
        _validate(_minimal_mapping(rules=[rule]))

    def test_invalid_projection_target_type(self):
        rule = _minimal_rule(projection={"targetType": "currency"})
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))

    def test_projection_rejects_unknown_properties(self):
        rule = _minimal_rule(projection={"targetType": "string", "runtime": True})
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))


# ---------------------------------------------------------------------------
# TestFieldRuleConditionals  (if/then on transform)
# ---------------------------------------------------------------------------


class TestFieldRuleConditionals:
    """Conditional requirements triggered by transform value."""

    @pytest.mark.parametrize("transform", ["expression", "constant", "concat", "split"])
    def test_expression_required(self, transform):
        rule = {"sourcePath": "a", "targetPath": "b", "transform": transform}
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))

    def test_coerce_requires_coerce_field(self):
        rule = {"sourcePath": "a", "targetPath": "b", "transform": "coerce"}
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))

    def test_valuemap_requires_valuemap_field(self):
        rule = {"sourcePath": "a", "targetPath": "b", "transform": "valueMap"}
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))

    def test_preserve_does_not_require_extras(self):
        """preserve works with just sourcePath + targetPath + transform."""
        _validate(_minimal_mapping())


# ---------------------------------------------------------------------------
# TestCoerce
# ---------------------------------------------------------------------------


class TestCoerce:
    """Coerce object and string shorthand."""

    def test_coerce_as_object(self):
        rule = _minimal_rule(
            transform="coerce", coerce={"from": "string", "to": "integer"}
        )
        _validate(_minimal_mapping(rules=[rule]))

    def test_coerce_as_string_shorthand(self):
        rule = _minimal_rule(transform="coerce", coerce="boolean")
        _validate(_minimal_mapping(rules=[rule]))

    def test_invalid_coerce_string(self):
        rule = _minimal_rule(transform="coerce", coerce="unknown")
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))

    def test_coerce_object_missing_from(self):
        rule = _minimal_rule(transform="coerce", coerce={"to": "integer"})
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))

    def test_coerce_object_missing_to(self):
        rule = _minimal_rule(transform="coerce", coerce={"from": "string"})
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))

    @pytest.mark.parametrize(
        "type_val",
        ["string", "integer", "number", "boolean", "date", "datetime", "money", "array", "object"],
    )
    def test_valid_coerce_type_values(self, type_val):
        rule = _minimal_rule(
            transform="coerce", coerce={"from": type_val, "to": type_val}
        )
        _validate(_minimal_mapping(rules=[rule]))


# ---------------------------------------------------------------------------
# TestValueMap
# ---------------------------------------------------------------------------


class TestValueMap:
    """ValueMap full and flat forms."""

    def test_full_valuemap_with_forward(self):
        vm = {"forward": {"yes": "true", "no": "false"}}
        rule = _minimal_rule(transform="valueMap", valueMap=vm)
        _validate(_minimal_mapping(rules=[rule]))

    def test_flat_valuemap_shorthand_rejected(self):
        vm = {"yes": "true", "no": "false"}
        rule = _minimal_rule(transform="valueMap", valueMap=vm)
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))

    @pytest.mark.parametrize("unmapped", ["error", "drop", "passthrough", "default"])
    def test_valuemap_unmapped_enum(self, unmapped):
        vm = {"forward": {"a": "1"}, "unmapped": unmapped}
        rule = _minimal_rule(transform="valueMap", valueMap=vm)
        _validate(_minimal_mapping(rules=[rule]))

    def test_invalid_unmapped_value(self):
        vm = {"forward": {"a": "1"}, "unmapped": "ignore"}
        rule = _minimal_rule(transform="valueMap", valueMap=vm)
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))


# ---------------------------------------------------------------------------
# TestArrayDescriptor
# ---------------------------------------------------------------------------


class TestArrayDescriptor:
    """ArrayDescriptor mode enum."""

    def test_valid_array_descriptor(self):
        rule = _minimal_rule(array={"mode": "each"})
        _validate(_minimal_mapping(rules=[rule]))

    @pytest.mark.parametrize("mode", ["each", "whole", "indexed"])
    def test_mode_enum(self, mode):
        rule = _minimal_rule(array={"mode": mode})
        _validate(_minimal_mapping(rules=[rule]))

    def test_invalid_mode(self):
        rule = _minimal_rule(array={"mode": "unknown"})
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))


# ---------------------------------------------------------------------------
# TestInnerRule
# ---------------------------------------------------------------------------


class TestInnerRule:
    """InnerRule inside array.innerRules."""

    def test_valid_inner_rule(self):
        rule = _minimal_rule(
            array={
                "mode": "each",
                "innerRules": [
                    {
                        "sourcePath": "x",
                        "targetPath": "y",
                        "transform": "preserve",
                    }
                ],
            }
        )
        _validate(_minimal_mapping(rules=[rule]))

    def test_inner_rule_with_index(self):
        rule = _minimal_rule(
            array={
                "mode": "indexed",
                "innerRules": [
                    {
                        "sourcePath": "x",
                        "targetPath": "y",
                        "transform": "preserve",
                        "index": 0,
                    }
                ],
            }
        )
        _validate(_minimal_mapping(rules=[rule]))

    def test_inner_rule_with_projection_hint(self):
        rule = _minimal_rule(
            array={
                "mode": "each",
                "innerRules": [
                    {
                        "sourcePath": "amount",
                        "targetPath": "amountText",
                        "transform": "coerce",
                        "coerce": "string",
                        "projection": {"targetType": "string"},
                    }
                ],
            }
        )
        _validate(_minimal_mapping(rules=[rule]))


# ---------------------------------------------------------------------------
# TestReverseOverride
# ---------------------------------------------------------------------------


class TestReverseOverride:
    """ReverseOverride object."""

    def test_valid_reverse_override(self):
        rule = _minimal_rule(
            reverse={
                "transform": "expression",
                "expression": "$ * 2",
            }
        )
        _validate(_minimal_mapping(rules=[rule]))

    def test_reverse_override_rejects_projection(self):
        rule = _minimal_rule(reverse={"projection": {"targetType": "string"}})
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(rules=[rule]))


# ---------------------------------------------------------------------------
# TestAdapters
# ---------------------------------------------------------------------------


class TestAdapters:
    """JsonAdapter, XmlAdapter, CsvAdapter."""

    def test_valid_json_adapter(self):
        _validate(
            _minimal_mapping(adapters={"json": {"pretty": True, "sortKeys": True}})
        )

    @pytest.mark.parametrize("null_handling", ["omit", "include"])
    def test_json_null_handling_enum(self, null_handling):
        _validate(
            _minimal_mapping(
                adapters={"json": {"nullHandling": null_handling}}
            )
        )

    def test_valid_xml_adapter(self):
        _validate(
            _minimal_mapping(
                targetSchema={"format": "xml", "rootElement": "Root"},
                adapters={
                    "xml": {
                        "declaration": True,
                        "indent": 4,
                        "cdata": ["body"],
                    }
                },
            )
        )

    def test_valid_csv_adapter(self):
        _validate(
            _minimal_mapping(
                targetSchema={"format": "csv"},
                adapters={
                    "csv": {
                        "delimiter": ",",
                        "quote": '"',
                        "header": True,
                        "encoding": "utf-8",
                        "lineEnding": "crlf",
                    }
                },
            )
        )

    def test_csv_delimiter_min_length(self):
        with pytest.raises(ValidationError):
            _validate(
                _minimal_mapping(
                    adapters={"csv": {"delimiter": ""}}
                )
            )

    def test_csv_quote_min_length(self):
        with pytest.raises(ValidationError):
            _validate(
                _minimal_mapping(
                    adapters={"csv": {"quote": ""}}
                )
            )

    @pytest.mark.parametrize("ending", ["lf", "crlf"])
    def test_csv_line_ending_enum(self, ending):
        _validate(
            _minimal_mapping(
                adapters={"csv": {"lineEnding": ending}}
            )
        )

    def test_json_adapter_additional_properties_rejected(self):
        with pytest.raises(ValidationError):
            _validate(
                _minimal_mapping(
                    adapters={"json": {"extra": True}}
                )
            )

    def test_xml_adapter_additional_properties_rejected(self):
        with pytest.raises(ValidationError):
            _validate(
                _minimal_mapping(
                    adapters={"xml": {"extra": True}}
                )
            )

    def test_csv_adapter_additional_properties_rejected(self):
        with pytest.raises(ValidationError):
            _validate(
                _minimal_mapping(
                    adapters={"csv": {"extra": True}}
                )
            )


# ---------------------------------------------------------------------------
# TestMappingExtensions
# ---------------------------------------------------------------------------


class TestMappingExtensions:
    """x- prefixed extension properties."""

    def test_valid_x_extension_on_mapping(self):
        _validate(_minimal_mapping(**{"x-vendor": {"foo": 1}}))

    def test_valid_x_extension_on_field_rule(self):
        rule = _minimal_rule(**{"x-annotation": "note"})
        _validate(_minimal_mapping(rules=[rule]))

    def test_non_x_prefixed_property_fails_on_mapping(self):
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(**{"vendor": True}))


# ---------------------------------------------------------------------------
# TestMappingVersion
# ---------------------------------------------------------------------------


class TestMappingVersion:
    """Mapping version must be valid SemVer."""

    @pytest.mark.parametrize("ver", ["1.0.0", "0.1.0", "10.20.30"])
    def test_valid_semver(self, ver):
        _validate(_minimal_mapping(version=ver))

    @pytest.mark.parametrize("ver", ["1.0", "v1.0.0", "1", "01.0.0", "1.02.0"])
    def test_invalid_semver(self, ver):
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(version=ver))


# ---------------------------------------------------------------------------
# TestMappingConformanceLevel
# ---------------------------------------------------------------------------


class TestMappingConformanceLevel:
    """conformanceLevel enum."""

    @pytest.mark.parametrize("level", ["core", "bidirectional", "extended"])
    def test_valid_conformance_level(self, level):
        _validate(_minimal_mapping(conformanceLevel=level))

    def test_invalid_conformance_level(self):
        with pytest.raises(ValidationError):
            _validate(_minimal_mapping(conformanceLevel="full"))

    def test_omitted_conformance_level_valid(self):
        doc = _minimal_mapping()
        assert "conformanceLevel" not in doc
        _validate(doc)


# ---------------------------------------------------------------------------
# TestFieldRuleAdvanced
# ---------------------------------------------------------------------------


class TestFieldRuleAdvanced:
    """Advanced FieldRule properties: condition, bidirectional, priority."""

    def test_rule_with_condition(self):
        rule = _minimal_rule(condition="$status = 'active'")
        _validate(_minimal_mapping(rules=[rule]))

    def test_rule_with_bidirectional_false(self):
        rule = _minimal_rule(bidirectional=False)
        _validate(_minimal_mapping(rules=[rule]))

    def test_rule_with_priority(self):
        rule = _minimal_rule(priority=10)
        _validate(_minimal_mapping(rules=[rule]))

    def test_rule_with_reverse_priority(self):
        rule = _minimal_rule(reversePriority=5)
        _validate(_minimal_mapping(rules=[rule]))
