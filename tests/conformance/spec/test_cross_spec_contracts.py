"""Layer 5: Cross-Spec Contract Tests.

Verifies that normative prose in spec markdown files matches the actual
JSON schemas.  Each test reads the schema programmatically and asserts
structural properties (required arrays, enum values, patterns, defaults,
conditionals, property sets) match what the spec documents claim.

Naming convention: test_s{section}__{assertion}
"""
import json

import pytest

from tests.unit.support.schema_fixtures import ROOT_DIR, SCHEMA_DIR, SPEC_DIR


def _load(name):
    with open(SCHEMA_DIR / name) as f:
        return json.load(f)


DEF_S = _load("definition.schema.json")
RESP_S = _load("response.schema.json")
VR_S = _load("validation-report.schema.json")
VR_RESULT_S = _load("validation-result.schema.json")
MAP_S = _load("mapping.schema.json")
REG_S = _load("registry.schema.json")
THEME_S = _load("theme.schema.json")
COMP_S = _load("component.schema.json")
CHGLOG_S = _load("changelog.schema.json")
REFS_S = _load("references.schema.json")
LOCALE_S = _load("locale.schema.json")

ALL_SCHEMAS = {
    "definition": DEF_S,
    "response": RESP_S,
    "validationReport": VR_S,
    "validationResult": VR_RESULT_S,
    "mapping": MAP_S,
    "registry": REG_S,
    "theme": THEME_S,
    "component": COMP_S,
    "changelog": CHGLOG_S,
    "references": REFS_S,
    "locale": LOCALE_S,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _def(schema, name):
    """Get a $defs sub-schema."""
    return schema["$defs"][name]


def _find_allof_branch(allof_list, type_field, type_value):
    """Find the allOf branch whose if.properties.{type_field}.const == type_value."""
    for branch in allof_list:
        if "if" in branch:
            props = branch["if"].get("properties", {})
            if props.get(type_field, {}).get("const") == type_value:
                return branch
            # Also check enum
            if type_value in props.get(type_field, {}).get("enum", []):
                return branch
    pytest.fail(
        f"No allOf branch found with if.properties.{type_field}.const == {type_value!r}"
    )


def _prop_keys(schema_obj):
    """Get the set of declared property names on a schema object."""
    return set(schema_obj.get("properties", {}).keys())


# ===========================================================================
# Cross-Schema Consistency
# ===========================================================================


class TestCrossSchemaConsistency:
    """Assertions that span multiple schemas."""

    @pytest.mark.parametrize("name,schema", list(ALL_SCHEMAS.items()))
    def test_all_schemas_use_draft_2020_12(self, name, schema):
        assert schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"

    @pytest.mark.parametrize("name,schema", list(ALL_SCHEMAS.items()))
    def test_all_top_level_objects_closed(self, name, schema):
        """Every top-level schema has additionalProperties: false."""
        assert schema.get("additionalProperties") is False, f"{name} missing additionalProperties:false"

    def test_validation_result_is_shared_schema(self):
        """Both response and validationReport $ref the shared validationResult schema."""
        vr_result_id = VR_RESULT_S["$id"]
        # validationReport.results.items must ref the shared schema
        report_ref = VR_S["properties"]["results"]["items"]["$ref"]
        assert report_ref == vr_result_id, \
            f"validationReport results ref {report_ref!r} != shared schema {vr_result_id!r}"
        # response.validationResults.items must ref the shared schema
        resp_ref = RESP_S["properties"]["validationResults"]["items"]["$ref"]
        assert resp_ref == vr_result_id, \
            f"response validationResults ref {resp_ref!r} != shared schema {vr_result_id!r}"
        # The shared schema must have the expected required fields
        assert set(VR_RESULT_S["required"]) == {"$formspecValidationResult", "path", "severity", "constraintKind", "message"}

    def test_definition_response_use_propertynames_extensions(self):
        """Definition, Response, Registry, Mapping, Component, References, Ontology use extensions.propertyNames pattern."""
        REFS_S = _load("references.schema.json")
        ONT_S = _load("ontology.schema.json")
        COMP_S = _load("component.schema.json")
        for name, schema in [
            ("definition", DEF_S), ("response", RESP_S), ("registry", REG_S),
            ("mapping", MAP_S), ("component", COMP_S), ("references", REFS_S), ("ontology", ONT_S),
        ]:
            ext = schema["properties"].get("extensions", {})
            pn = ext.get("propertyNames", {}).get("pattern")
            assert pn == "^x-", f"{name} extensions missing propertyNames ^x-"

    def test_mapping_uses_extensions_object(self):
        """Mapping schema uses an extensions property with propertyNames pattern."""
        ext = MAP_S["properties"].get("extensions", {})
        pn = ext.get("propertyNames", {}).get("pattern")
        assert pn == "^x-", "mapping extensions missing propertyNames ^x-"

    @pytest.mark.parametrize("name,schema", list(ALL_SCHEMAS.items()))
    def test_all_schemas_have_id(self, name, schema):
        assert "$id" in schema, f"{name} missing $id"


# ===========================================================================
# Definition Schema — Top Level (§4.1)
# ===========================================================================


class TestDefinitionTopLevel:
    """spec.md §4.1 — Top-Level Structure."""

    def test_s4_1__required_fields(self):
        assert set(DEF_S["required"]) == {
            "$formspec", "url", "version", "status", "title", "items"
        }

    def test_s4_1__formspec_const(self):
        assert DEF_S["properties"]["$formspec"]["const"] == "1.0"

    def test_s4_1__status_enum(self):
        assert DEF_S["properties"]["status"]["enum"] == ["draft", "active", "retired"]

    def test_s4_1__version_algorithm_enum_and_default(self):
        va = DEF_S["properties"]["versionAlgorithm"]
        assert va["enum"] == ["semver", "date", "integer", "natural"]
        assert va.get("default") == "semver"

    def test_s4_1__non_relevant_behavior_enum_and_default(self):
        nrb = DEF_S["properties"]["nonRelevantBehavior"]
        assert nrb["enum"] == ["remove", "empty", "keep"]
        assert nrb.get("default") == "remove"

    def test_s4_1__name_pattern(self):
        assert DEF_S["properties"]["name"]["pattern"] == r"^[a-zA-Z][a-zA-Z0-9\-]*$"

    def test_s4_1__url_format_uri(self):
        assert DEF_S["properties"]["url"]["format"] == "uri"

    def test_s4_1__date_format(self):
        assert DEF_S["properties"]["date"]["format"] == "date"

    def test_s4_1__derived_from_oneof_and_optional(self):
        df = DEF_S["properties"]["derivedFrom"]
        assert "oneOf" in df
        # First branch: URI string
        uri_branch = df["oneOf"][0]
        assert uri_branch["type"] == "string"
        assert uri_branch["format"] == "uri"
        # Second branch: object with url
        obj_branch = df["oneOf"][1]
        assert obj_branch["type"] == "object"
        assert "url" in obj_branch["required"]
        assert "derivedFrom" not in DEF_S["required"]

    def test_s4_1__items_is_array(self):
        assert DEF_S["properties"]["items"]["type"] == "array"

    def test_s4_1__extensions_property_names(self):
        ext = DEF_S["properties"]["extensions"]
        assert ext["propertyNames"]["pattern"] == "^x-"

    def test_s4_1__additional_properties_false(self):
        assert DEF_S["additionalProperties"] is False

    def test_s4_1__optional_fields_not_required(self):
        optional = {"name", "description", "date", "derivedFrom", "versionAlgorithm",
                    "nonRelevantBehavior", "binds", "shapes", "instances",
                    "variables", "optionSets", "migrations", "extensions"}
        for field in optional:
            assert field not in DEF_S["required"], f"{field} should not be required"

    def test_s4_1__closed_world_property_set(self):
        expected = {
            "$formspec", "url", "version", "versionAlgorithm", "status",
            "derivedFrom", "name", "title", "description", "date",
            "items", "binds", "shapes", "instances", "variables",
            "nonRelevantBehavior", "optionSets", "migrations",
            "extensions", "formPresentation",
        }
        assert _prop_keys(DEF_S) == expected

# ===========================================================================
# Definition Schema — Item (§4.2)
# ===========================================================================


class TestDefinitionItem:
    """spec.md §4.2 — Item Schema."""

    ITEM = _def(DEF_S, "Item")

    def test_s4_2__required_fields(self):
        assert set(self.ITEM["required"]) == {"key", "type", "label"}

    def test_s4_2__key_pattern(self):
        assert self.ITEM["properties"]["key"]["pattern"] == r"^[a-zA-Z][a-zA-Z0-9_]*$"

    def test_s4_2__type_enum(self):
        assert self.ITEM["properties"]["type"]["enum"] == ["group", "field", "display"]

    def test_s4_2__three_allof_branches(self):
        assert len(self.ITEM["allOf"]) == 3

    # -- Group conditional --

    def test_s4_2_2__group_requires_children_or_ref(self):
        branch = _find_allof_branch(self.ITEM["allOf"], "type", "group")
        then = branch["then"]
        # anyOf: [{required: ["children"]}, {required: ["$ref"]}]
        reqs = [set(alt["required"]) for alt in then["anyOf"]]
        assert {"children"} in reqs
        assert {"$ref"} in reqs

    def test_s4_2_2__group_repeatable_default(self):
        branch = _find_allof_branch(self.ITEM["allOf"], "type", "group")
        rep = branch["then"]["properties"]["repeatable"]
        assert rep["type"] == "boolean"
        assert rep["default"] is False

    def test_s4_2_2__group_additional_properties_false(self):
        branch = _find_allof_branch(self.ITEM["allOf"], "type", "group")
        assert branch["then"]["additionalProperties"] is False

    # -- Field conditional --

    def test_s4_2_3__field_requires_datatype(self):
        branch = _find_allof_branch(self.ITEM["allOf"], "type", "field")
        assert "dataType" in branch["then"]["required"]

    def test_s4_2_3__datatype_enum_13_values(self):
        branch = _find_allof_branch(self.ITEM["allOf"], "type", "field")
        dt = branch["then"]["properties"]["dataType"]
        expected = [
            "string", "text", "integer", "decimal", "boolean",
            "date", "dateTime", "time", "uri", "attachment",
            "choice", "multiChoice", "money",
        ]
        assert dt["enum"] == expected

    def test_s4_2_3__money_datatype_has_description(self):
        """Money dataType must be documented via MoneyValue $def or dataType description.

        Satisfied when definition.schema.json defines MoneyValue with a description,
        or when the field-branch dataType property description names amount/currency.
        """
        branch = _find_allof_branch(self.ITEM["allOf"], "type", "field")
        dt = branch["then"]["properties"]["dataType"]

        # Prefer a dedicated MoneyValue $def (richer; description + examples).
        has_money_def = (
            "MoneyValue" in DEF_S.get("$defs", {})
            and "description" in DEF_S["$defs"]["MoneyValue"]
        )

        # Fallback: the dataType property itself has a description that
        # mentions the money shape.
        dt_description = dt.get("description", "")
        has_dt_description = (
            "money" in dt_description.lower()
            and ("amount" in dt_description.lower() or "currency" in dt_description.lower())
        )

        assert has_money_def or has_dt_description, (
            "definition.schema.json must document the 'money' dataType's "
            "{amount, currency} object shape — either via a MoneyValue $def "
            "with description+examples or via a description on the dataType property."
        )

    def test_s4_2_3__field_additional_properties_false(self):
        branch = _find_allof_branch(self.ITEM["allOf"], "type", "field")
        assert branch["then"]["additionalProperties"] is False

    # -- Display conditional --

    def test_s4_2_4__display_additional_properties_false(self):
        branch = _find_allof_branch(self.ITEM["allOf"], "type", "display")
        assert branch["then"]["additionalProperties"] is False


# ===========================================================================
# Definition Schema — Bind (§4.3)
# ===========================================================================


class TestDefinitionBind:
    """spec.md §4.3 — Bind Schema."""

    BIND = _def(DEF_S, "Bind")

    def test_s4_3__path_required_with_min_length(self):
        assert "path" in self.BIND["required"]
        assert self.BIND["properties"]["path"]["minLength"] == 1

    def test_s4_3__whitespace_enum_and_default(self):
        ws = self.BIND["properties"]["whitespace"]
        assert ws["enum"] == ["preserve", "trim", "normalize", "remove"]
        assert ws.get("default") == "preserve"

    def test_s4_3__excluded_value_enum_and_default(self):
        ev = self.BIND["properties"]["excludedValue"]
        assert ev["enum"] == ["preserve", "null"]
        assert ev.get("default") == "preserve"

    def test_s4_3__disabled_display_enum_and_default(self):
        dd = self.BIND["properties"]["disabledDisplay"]
        assert dd["enum"] == ["hidden", "protected"]
        assert dd.get("default") == "hidden"

    def test_s4_3__non_relevant_behavior_enum(self):
        nrb = self.BIND["properties"]["nonRelevantBehavior"]
        assert nrb["enum"] == ["remove", "empty", "keep"]

    def test_s4_3__additional_properties_false(self):
        assert self.BIND["additionalProperties"] is False

    def test_s4_3__closed_world_property_set(self):
        expected = {
            "path", "required", "relevant", "readonly", "calculate",
            "constraint", "constraintMessage", "default", "whitespace",
            "excludedValue", "nonRelevantBehavior", "disabledDisplay",
            "extensions",
        }
        assert _prop_keys(self.BIND) == expected


# ===========================================================================
# Definition Schema — Shape (§5.2)
# ===========================================================================


class TestDefinitionShape:
    """spec.md §5.2 — Validation Shape Schema."""

    SHAPE = _def(DEF_S, "Shape")

    def test_s5_2__required_fields(self):
        assert set(self.SHAPE["required"]) == {"id", "target", "message"}

    def test_s5_2__id_pattern(self):
        assert self.SHAPE["properties"]["id"]["pattern"] == r"^[a-zA-Z][a-zA-Z0-9_\-]*$"

    def test_s5_2__severity_enum_and_default(self):
        sev = self.SHAPE["properties"]["severity"]
        assert sev["enum"] == ["error", "warning", "info"]
        assert sev.get("default") == "error"

    def test_s5_2__timing_enum_and_default(self):
        tim = self.SHAPE["properties"]["timing"]
        assert tim["enum"] == ["continuous", "submit", "demand"]
        assert tim.get("default") == "continuous"

    def test_s5_2__anyof_requires_operator(self):
        """Shape anyOf requires at least one of constraint/and/or/not/xone."""
        operators = set()
        for branch in self.SHAPE["anyOf"]:
            for key in branch.get("required", []):
                operators.add(key)
        assert operators == {"constraint", "and", "or", "not", "xone"}

    def test_s5_2__additional_properties_false(self):
        assert self.SHAPE["additionalProperties"] is False

    def test_s5_2__closed_world_property_set(self):
        expected = {
            "id", "target", "severity", "constraint", "message", "code",
            "context", "activeWhen", "timing",
            "and", "or", "not", "xone",
            "extensions",
        }
        assert _prop_keys(self.SHAPE) == expected

# ===========================================================================
# Definition Schema — Variable (§4.5)
# ===========================================================================


class TestDefinitionVariable:
    """spec.md §4.5 — Variables."""

    VAR = _def(DEF_S, "Variable")

    def test_s4_5__required_fields(self):
        assert set(self.VAR["required"]) == {"name", "expression"}

    def test_s4_5__name_pattern(self):
        assert self.VAR["properties"]["name"]["pattern"] == r"^[a-zA-Z][a-zA-Z0-9_]*$"

    def test_s4_5__additional_properties_false(self):
        assert self.VAR["additionalProperties"] is False


# ===========================================================================
# Definition Schema — Instance (§4.4)
# ===========================================================================


class TestDefinitionInstance:
    """spec.md §4.4 — Instance Schema."""

    INST = _def(DEF_S, "Instance")

    def test_s4_4__anyof_requires_source_or_data(self):
        reqs = [set(alt["required"]) for alt in self.INST["anyOf"]]
        assert {"source"} in reqs
        assert {"data"} in reqs

    def test_s4_4__source_format_uri_template(self):
        assert self.INST["properties"]["source"]["format"] == "uri-template"

    def test_s4_4__additional_properties_false(self):
        assert self.INST["additionalProperties"] is False


# ===========================================================================
# Definition Schema — OptionSet / OptionEntry (§4.6)
# ===========================================================================


class TestDefinitionOptionSet:
    """spec.md §4.6 — Option Sets."""

    OS = _def(DEF_S, "OptionSet")
    OE = _def(DEF_S, "OptionEntry")

    def test_s4_6__anyof_requires_options_or_source(self):
        reqs = [set(alt["required"]) for alt in self.OS["anyOf"]]
        assert {"options"} in reqs
        assert {"source"} in reqs

    def test_s4_6__source_format_uri(self):
        assert self.OS["properties"]["source"]["format"] == "uri"

    def test_s4_6__option_entry_required(self):
        assert set(self.OE["required"]) == {"value", "label"}

    def test_s4_6__option_entry_additional_properties_false(self):
        assert self.OE["additionalProperties"] is False


# ===========================================================================
# Definition Schema — Migrations (§6.7)
# ===========================================================================


class TestDefinitionMigrations:
    """spec.md §6.7 — Version Migrations."""

    MIG = _def(DEF_S, "MigrationDescriptor")

    def test_s6_7__field_map_item_required(self):
        fm_item = self.MIG["properties"]["fieldMap"]["items"]
        assert set(fm_item["required"]) == {"source", "target", "transform"}

    def test_s6_7__transform_enum_3_values(self):
        fm_item = self.MIG["properties"]["fieldMap"]["items"]
        assert fm_item["properties"]["transform"]["enum"] == [
            "preserve", "drop", "expression"
        ]

    def test_s6_7__target_allows_null(self):
        """MigrationDescriptor target is [string, null]."""
        fm_item = self.MIG["properties"]["fieldMap"]["items"]
        target_type = fm_item["properties"]["target"]["type"]
        assert "null" in target_type
        assert "string" in target_type


# ===========================================================================
# Response Schema (§2.1.6, §5.3)
# ===========================================================================


class TestResponseSchema:
    """spec.md §2.1.6 + §5.3 — Response + ValidationResult."""

    def test_s2_1_6__required_fields(self):
        assert set(RESP_S["required"]) == {
            "$formspecResponse", "definitionUrl", "definitionVersion", "status", "data", "authored"
        }

    def test_s2_1_6__status_enum(self):
        assert RESP_S["properties"]["status"]["enum"] == [
            "in-progress", "completed", "amended", "stopped"
        ]

    def test_s2_1_6__authored_format_datetime(self):
        assert RESP_S["properties"]["authored"]["format"] == "date-time"

    def test_s2_1_6__definition_url_format_uri(self):
        assert RESP_S["properties"]["definitionUrl"]["format"] == "uri"

    def test_s2_1_6__data_type_object(self):
        assert RESP_S["properties"]["data"]["type"] == "object"

    def test_s2_1_6__author_requires_id(self):
        author = RESP_S["properties"]["author"]
        assert "id" in author["required"]
        assert author["additionalProperties"] is False

    def test_s2_1_6__subject_requires_id(self):
        subject = RESP_S["properties"]["subject"]
        assert "id" in subject["required"]
        assert subject["additionalProperties"] is False

    def test_s2_1_6__additional_properties_false(self):
        assert RESP_S["additionalProperties"] is False

    def test_s5_3__validation_result_required(self):
        assert set(VR_RESULT_S["required"]) == {"$formspecValidationResult", "path", "severity", "constraintKind", "message"}

    def test_s5_3__severity_enum(self):
        assert VR_RESULT_S["properties"]["severity"]["enum"] == ["error", "warning", "info"]

    def test_s5_3__constraint_kind_enum(self):
        assert VR_RESULT_S["properties"]["constraintKind"]["enum"] == [
            "required", "type", "cardinality", "constraint", "shape", "external"
        ]

    def test_s5_3__source_enum(self):
        assert VR_RESULT_S["properties"]["source"]["enum"] == ["bind", "shape", "external"]

    def test_s5_3__validation_result_additional_properties_false(self):
        assert VR_RESULT_S["additionalProperties"] is False

    def test_s2_1_6__closed_world_property_set(self):
        expected = {
            "$formspecResponse", "definitionUrl", "definitionVersion", "status", "data",
            "authored", "id", "author", "subject", "authoredSignatures",
            "validationResults", "extensions",
        }
        assert _prop_keys(RESP_S) == expected


# ===========================================================================
# ValidationReport Schema (§5.4)
# ===========================================================================


class TestValidationReportSchema:
    """spec.md §5.4 — Validation Report."""

    def test_s5_4__required_fields(self):
        assert set(VR_S["required"]) == {"$formspecValidationReport", "valid", "results", "counts", "timestamp"}

    def test_s5_4__counts_required(self):
        counts = VR_S["properties"]["counts"]
        assert set(counts["required"]) == {"error", "warning", "info"}

    def test_s5_4__counts_additional_properties_false(self):
        assert VR_S["properties"]["counts"]["additionalProperties"] is False

    def test_s5_4__timestamp_format_datetime(self):
        assert VR_S["properties"]["timestamp"]["format"] == "date-time"

    def test_s5_4__valid_is_boolean(self):
        assert VR_S["properties"]["valid"]["type"] == "boolean"

    def test_s5_4__additional_properties_false(self):
        assert VR_S["additionalProperties"] is False

# ===========================================================================
# Mapping Schema — Top Level (mapping-spec.md §3.1)
# ===========================================================================


class TestMappingTopLevel:
    """mapping-spec.md §3.1 — Mapping Document."""

    def test_ms3_1__required_fields(self):
        assert set(MAP_S["required"]) == {
            "$formspecMapping", "version", "definitionRef", "definitionVersion",
            "targetSchema", "rules",
        }

    def test_ms3_1__direction_enum_and_default(self):
        d = MAP_S["properties"]["direction"]
        assert d["enum"] == ["forward", "reverse", "both"]
        assert d.get("default") == "forward"

    def test_ms3_1__auto_map_default_false(self):
        am = MAP_S["properties"]["autoMap"]
        assert am["type"] == "boolean"
        assert am.get("default") is False

    def test_ms3_1__rules_min_items_1(self):
        assert MAP_S["properties"]["rules"]["minItems"] == 1

    def test_ms3_1__additional_properties_false(self):
        assert MAP_S["additionalProperties"] is False

    def test_ms3_1__extensions_property_x_prefix(self):
        ext = MAP_S["properties"].get("extensions", {})
        pn = ext.get("propertyNames", {}).get("pattern")
        assert pn == "^x-", "mapping extensions property missing propertyNames ^x-"

    def test_ms3_1__closed_world_property_set(self):
        expected = {
            "$formspecMapping", "version", "$schema", "definitionRef", "definitionVersion",
            "targetSchema", "direction", "autoMap", "defaults", "rules",
            "adapters", "conformanceLevel", "extensions",
        }
        assert _prop_keys(MAP_S) == expected


# ===========================================================================
# Mapping Schema — TargetSchema (mapping-spec.md §3.2)
# ===========================================================================


class TestMappingTargetSchema:
    """mapping-spec.md §3.2 — Target Schema."""

    TS = _def(MAP_S, "TargetSchema")

    def test_ms3_2__format_required(self):
        assert "format" in self.TS["required"]

    def test_ms3_2__format_anyof_enum_and_x_pattern(self):
        anyof = self.TS["properties"]["format"]["anyOf"]
        enums = [b["enum"] for b in anyof if "enum" in b]
        patterns = [b["pattern"] for b in anyof if "pattern" in b]
        assert ["json", "xml", "csv"] in enums
        assert "^x-" in patterns

    def test_ms3_2__xml_requires_root_element(self):
        branch = _find_allof_branch(self.TS["allOf"], "format", "xml")
        assert "rootElement" in branch["then"]["required"]

    def test_ms3_2__additional_properties_false(self):
        assert self.TS["additionalProperties"] is False


# ===========================================================================
# Mapping Schema — FieldRule (mapping-spec.md §3.3)
# ===========================================================================


class TestMappingFieldRule:
    """mapping-spec.md §3.3 — Field Rules."""

    FR = _def(MAP_S, "FieldRule")

    def test_ms3_3__transform_required(self):
        assert "transform" in self.FR["required"]

    def test_ms3_3__transform_enum_10_values(self):
        assert self.FR["properties"]["transform"]["enum"] == [
            "preserve", "drop", "expression", "coerce", "valueMap",
            "flatten", "nest", "constant", "concat", "split",
        ]

    def test_ms3_3__anyof_source_or_target(self):
        reqs = [set(alt["required"]) for alt in self.FR["anyOf"]]
        assert {"sourcePath"} in reqs
        assert {"targetPath"} in reqs

    def test_ms3_3__target_path_allows_null(self):
        tp = self.FR["properties"]["targetPath"]
        tp_type = tp["type"]
        assert "null" in tp_type
        assert "string" in tp_type

    def test_ms3_3__expression_conditional(self):
        branch = _find_allof_branch(self.FR["allOf"], "transform", "expression")
        assert "expression" in branch["then"]["required"]

    def test_ms3_3__coerce_conditional(self):
        branch = _find_allof_branch(self.FR["allOf"], "transform", "coerce")
        assert "coerce" in branch["then"]["required"]

    def test_ms3_3__valuemap_conditional(self):
        branch = _find_allof_branch(self.FR["allOf"], "transform", "valueMap")
        assert "valueMap" in branch["then"]["required"]

    def test_ms3_3__additional_properties_false(self):
        assert self.FR["additionalProperties"] is False

    def test_ms3_3__pattern_properties_x_prefix(self):
        assert "^x-" in self.FR.get("patternProperties", {})


# ===========================================================================
# Mapping Schema — Coerce, ValueMap, ArrayDescriptor (mapping-spec.md §3.3)
# ===========================================================================


class TestMappingCoerceValueMapArray:
    """mapping-spec.md §3.3.2–3.3.4."""

    COERCE = _def(MAP_S, "Coerce")
    VMAP = _def(MAP_S, "ValueMap")
    ARR = _def(MAP_S, "ArrayDescriptor")

    def test_ms3_3_2__coerce_required(self):
        assert set(self.COERCE["required"]) == {"from", "to"}

    def test_ms3_3_2__coerce_type_enum(self):
        expected = ["string", "number", "boolean", "date", "datetime",
                    "integer", "array", "object", "money"]
        assert self.COERCE["properties"]["from"]["enum"] == expected
        assert self.COERCE["properties"]["to"]["enum"] == expected

    def test_ms3_3_3__valuemap_requires_forward(self):
        assert "forward" in self.VMAP["required"]

    def test_ms3_3_3__unmapped_enum_and_default(self):
        um = self.VMAP["properties"]["unmapped"]
        assert um["enum"] == ["error", "drop", "passthrough", "default"]
        assert um.get("default") == "error"

    def test_ms3_3_4__array_mode_enum(self):
        assert self.ARR["properties"]["mode"]["enum"] == ["each", "whole", "indexed"]

    def test_ms3_3_4__array_mode_required(self):
        assert "mode" in self.ARR["required"]


# ===========================================================================
# Mapping Schema — InnerRule, ReverseOverride (mapping-spec.md §4.12, §5.3)
# ===========================================================================


class TestMappingInnerRuleAndReverseOverride:
    """mapping-spec.md §4.12 + §5.3."""

    IR = _def(MAP_S, "InnerRule")
    RO = _def(MAP_S, "ReverseOverride")

    def test_ms4_12__inner_rule_has_index_field(self):
        assert "index" in self.IR["properties"]
        assert self.IR["properties"]["index"]["type"] == "integer"

    def test_ms4_12__inner_rule_mirrors_field_rule_transform_enum(self):
        fr_enum = _def(MAP_S, "FieldRule")["properties"]["transform"]["enum"]
        assert self.IR["properties"]["transform"]["enum"] == fr_enum

    def test_ms4_12__inner_rule_has_same_3_conditionals(self):
        fr_allof = _def(MAP_S, "FieldRule")["allOf"]
        ir_allof = self.IR["allOf"]
        assert len(ir_allof) == len(fr_allof) == 3

    def test_ms5_3__reverse_override_has_transform_enum(self):
        fr_enum = _def(MAP_S, "FieldRule")["properties"]["transform"]["enum"]
        assert self.RO["properties"]["transform"]["enum"] == fr_enum

    def test_ms5_3__reverse_override_additional_properties_false(self):
        assert self.RO["additionalProperties"] is False


# ===========================================================================
# Mapping Schema — Adapters (mapping-spec.md §6)
# ===========================================================================


class TestMappingAdapters:
    """mapping-spec.md §6.2–6.4 — Adapters."""

    JSON_A = _def(MAP_S, "JsonAdapter")
    XML_A = _def(MAP_S, "XmlAdapter")
    CSV_A = _def(MAP_S, "CsvAdapter")

    def test_ms6_2__json_null_handling_enum_and_default(self):
        nh = self.JSON_A["properties"]["nullHandling"]
        assert nh["enum"] == ["include", "omit"]
        assert nh.get("default") == "include"

    def test_ms6_3__xml_declaration_default(self):
        assert self.XML_A["properties"]["declaration"].get("default") is True

    def test_ms6_3__xml_indent_default(self):
        assert self.XML_A["properties"]["indent"].get("default") == 2

    def test_ms6_4__csv_delimiter_default_and_min_length(self):
        d = self.CSV_A["properties"]["delimiter"]
        assert d.get("default") == ","
        assert d.get("minLength") == 1

    def test_ms6_4__csv_line_ending_enum_and_default(self):
        le = self.CSV_A["properties"]["lineEnding"]
        assert le["enum"] == ["crlf", "lf"]
        assert le.get("default") == "crlf"

    def test_ms6_4__csv_quote_min_length(self):
        assert self.CSV_A["properties"]["quote"].get("minLength") == 1

    @pytest.mark.parametrize("adapter", ["JsonAdapter", "XmlAdapter", "CsvAdapter"])
    def test_adapters_additional_properties_false(self, adapter):
        assert _def(MAP_S, adapter)["additionalProperties"] is False


# ===========================================================================
# Registry Schema (extension-registry.md §2–4)
# ===========================================================================


class TestRegistrySchema:
    """extension-registry.md §2–4."""

    def test_er2__required_fields(self):
        assert set(REG_S["required"]) == {
            "$formspecRegistry", "publisher", "published", "entries"
        }

    def test_er2__formspec_registry_const(self):
        assert REG_S["properties"]["$formspecRegistry"]["const"] == "1.0"

    def test_er2_1__publisher_required(self):
        pub = _def(REG_S, "Publisher")
        assert set(pub["required"]) == {"name", "url"}

    def test_er2_1__publisher_url_format_uri(self):
        pub = _def(REG_S, "Publisher")
        assert pub["properties"]["url"]["format"] == "uri"

    def test_er3__entry_required_fields(self):
        entry = _def(REG_S, "RegistryEntry")
        assert set(entry["required"]) == {
            "name", "category", "version", "status",
            "description", "compatibility",
        }

    def test_er3__category_enum(self):
        entry = _def(REG_S, "RegistryEntry")
        assert entry["properties"]["category"]["enum"] == [
            "dataType", "function", "constraint", "property", "namespace",
            "concept", "vocabulary"
        ]

    def test_er3__status_enum(self):
        entry = _def(REG_S, "RegistryEntry")
        assert entry["properties"]["status"]["enum"] == [
            "draft", "stable", "deprecated", "retired"
        ]

    def test_er4__name_pattern(self):
        entry = _def(REG_S, "RegistryEntry")
        assert entry["properties"]["name"]["pattern"] == \
            r"^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$"

    def test_er3_1__compatibility_requires_formspec_version(self):
        entry = _def(REG_S, "RegistryEntry")
        compat = entry["properties"]["compatibility"]
        assert "formspecVersion" in compat["required"]
        assert compat["additionalProperties"] is False

    def test_er3_2__datatype_conditional_requires_basetype(self):
        entry = _def(REG_S, "RegistryEntry")
        branch = _find_allof_branch(entry["allOf"], "category", "dataType")
        assert "baseType" in branch["then"]["required"]

    def test_er3_2__function_conditional_requires_params_and_returns(self):
        entry = _def(REG_S, "RegistryEntry")
        branch = _find_allof_branch(entry["allOf"], "category", "function")
        assert set(branch["then"]["required"]) == {"parameters", "returns"}

    def test_er3_2__constraint_conditional_requires_params(self):
        entry = _def(REG_S, "RegistryEntry")
        branch = _find_allof_branch(entry["allOf"], "category", "constraint")
        assert "parameters" in branch["then"]["required"]

    def test_er3_2__basetype_enum(self):
        entry = _def(REG_S, "RegistryEntry")
        assert entry["properties"]["baseType"]["enum"] == [
            "string", "integer", "decimal", "boolean",
            "date", "dateTime", "time", "uri",
        ]

    def test_er3__entry_additional_properties_false(self):
        assert _def(REG_S, "RegistryEntry")["additionalProperties"] is False

    def test_er2__additional_properties_false(self):
        assert REG_S["additionalProperties"] is False


# ===================================================================
# Stage 5A: FEL ↔ Spec Contracts
# ===================================================================


class TestFelSpecContracts:
    """Verify FEL implementation matches spec prose."""

    def test_s7_all_fel_expressions_parse(self):
        """Every FEL expression in §7 examples must parse without error."""
        import re
        import json as json_mod
        from formspec.fel import parse as fel_parse

        spec_path = SPEC_DIR / 'core' / 'spec.md'
        content = spec_path.read_text()

        # Find §7
        s7_start = content.find('## 7.')
        s7_end = content.find('## 8.', s7_start)
        s7 = content[s7_start:s7_end]

        # Extract JSON blocks
        json_blocks = re.findall(r'```json\n(.*?)```', s7, re.DOTALL)

        # Extract FEL expressions from bind/shape properties
        fel_exprs = []
        for block in json_blocks:
            try:
                obj = json_mod.loads(block)
            except Exception:
                continue
            def _find(o):
                if isinstance(o, dict):
                    for k in ('calculate', 'constraint', 'relevant',
                              'required', 'readonly', 'expression'):
                        if k in o and isinstance(o[k], str):
                            fel_exprs.append(o[k])
                    for v in o.values():
                        _find(v)
                elif isinstance(o, list):
                    for v in o:
                        _find(v)
            _find(obj)

        assert len(fel_exprs) > 0, 'No FEL expressions found in §7'

        errors = []
        for expr in fel_exprs:
            # Spec uses 'div' in some examples; replace with '/'
            expr_fixed = expr.replace(' div ', ' / ')
            # Skip bare literals like 'true' used in required/readonly
            if expr_fixed in ('true', 'false'):
                continue
            try:
                fel_parse(expr_fixed)
            except Exception as e:
                errors.append(f'{expr!r}: {e}')

        assert errors == [], f'FEL parse failures:\n' + '\n'.join(errors)

    def test_s3_11_reserved_words_subset_of_parser(self):
        """§3.11 reserved words are a subset of the parser's RESERVED_WORDS."""
        import re
        from formspec.fel import RESERVED_WORDS

        content = (SPEC_DIR / 'core' / 'spec.md').read_text()
        s311_start = content.find('### 3.11 Reserved Words')
        s311_end = content.find('### 3.12', s311_start)
        s311 = content[s311_start:s311_end]

        code = re.search(r'```\n(.*?)```', s311, re.DOTALL)
        spec_reserved = set(code.group(1).split())

        # Spec lists 7 words; parser adds if/then/else/let for control flow
        assert spec_reserved <= RESERVED_WORDS, (
            f'Spec reserved words not in parser: {spec_reserved - RESERVED_WORDS}'
        )

    def test_s3_5_builtin_functions_match_registry(self):
        """All §3.5 function names exist in the built-in registry."""
        import re
        from formspec.fel import BUILTIN_NAMES

        content = (SPEC_DIR / 'core' / 'spec.md').read_text()

        # §3.5 function tables
        s35_start = content.find('### 3.5 Built-in Functions')
        s35_end = content.find('### 3.6 Dependency Tracking')
        s35 = content[s35_start:s35_end]

        spec_funcs = set()
        for m in re.finditer(r'^\| `(\w+)` \| `\w+\(', s35, re.MULTILINE):
            spec_funcs.add(m.group(1))

        # §3.4.3 cast functions (different table format)
        s343_start = content.find('#### 3.4.3 Coercion Rules')
        s343_end = content.find('### 3.5', s343_start)
        s343 = content[s343_start:s343_end]
        for m in re.finditer(r'^\| `(\w+)\(', s343, re.MULTILINE):
            spec_funcs.add(m.group(1))

        registry = set(BUILTIN_NAMES)

        missing_from_registry = spec_funcs - registry
        assert missing_from_registry == set(), (
            f'Spec functions not in registry: {missing_from_registry}'
        )

    def test_s3_4_type_names_from_typeof(self):
        """typeOf returns only the type names defined in §3.4."""
        from formspec.fel import evaluate, FelString
        import datetime
        from decimal import Decimal as D

        expected_types = {
            'null': 'typeOf(null)',
            'number': 'typeOf(42)',
            'string': 'typeOf("hello")',
            'boolean': 'typeOf(true)',
            'date': 'typeOf(@2024-01-01)',
            'array': 'typeOf([1, 2])',
        }

        for expected_name, expr in expected_types.items():
            r = evaluate(expr)
            assert r.value == FelString(expected_name), (
                f'{expr} should return "{expected_name}", got {r.value}'
            )

    def test_s7_3_dependency_graph_acyclic(self):
        """Expressions from §7.3 (repeatable rows) form a DAG."""
        import re
        import json as json_mod
        from formspec.fel import extract_dependencies

        content = (SPEC_DIR / 'core' / 'spec.md').read_text()
        s73_start = content.find('### 7.3')
        s73_end = content.find('### 7.4', s73_start)
        s73 = content[s73_start:s73_end]

        json_blocks = re.findall(r'```json\n(.*?)```', s73, re.DOTALL)

        # Collect field->expression from calculate binds (may be in 'binds' array)
        calc_binds = {}  # key -> expression
        for block in json_blocks:
            try:
                obj = json_mod.loads(block)
            except Exception:
                continue
            def _find_calcs(o):
                if isinstance(o, dict):
                    if 'calculate' in o and isinstance(o['calculate'], str):
                        # Use path or nearby key if available
                        path = o.get('path', o.get('key', str(len(calc_binds))))
                        calc_binds[path] = o['calculate']
                    for v in o.values():
                        _find_calcs(v)
                elif isinstance(o, list):
                    for v in o:
                        _find_calcs(v)
            _find_calcs(obj)

        assert len(calc_binds) > 0, 'No calculate binds found in §7.3'

        # Build dependency graph and check for cycles
        graph = {}
        for key, expr in calc_binds.items():
            expr_fixed = expr.replace(' div ', ' / ')
            deps = extract_dependencies(expr_fixed)
            graph[key] = deps.fields

        visited = set()
        in_stack = set()
        has_cycle = False
        def dfs(node):
            nonlocal has_cycle
            if node in in_stack:
                has_cycle = True
                return
            if node in visited:
                return
            visited.add(node)
            in_stack.add(node)
            for dep in graph.get(node, set()):
                dfs(dep)
            in_stack.discard(node)

        for key in graph:
            dfs(key)

        assert not has_cycle, f'Cycle detected in §7.3 expressions: {graph}'

    def test_s3_5_no_extra_registry_functions(self):
        """Registry doesn't contain functions absent from the spec."""
        import re
        from formspec.fel import BUILTIN_NAMES

        content = (SPEC_DIR / 'core' / 'spec.md').read_text()

        # Collect all function names from spec (both §3.5 tables and §3.4.3 casts)
        spec_funcs = set()
        s35_start = content.find('### 3.5 Built-in Functions')
        s35_end = content.find('### 3.6 Dependency Tracking')
        s35 = content[s35_start:s35_end]
        for m in re.finditer(r'^\| `(\w+)` \| `\w+\(', s35, re.MULTILINE):
            spec_funcs.add(m.group(1))

        s343_start = content.find('#### 3.4.3 Coercion Rules')
        s343_end = content.find('### 3.5', s343_start)
        s343 = content[s343_start:s343_end]
        for m in re.finditer(r'^\| `(\w+)\(', s343, re.MULTILINE):
            spec_funcs.add(m.group(1))

        registry = set(BUILTIN_NAMES)
        extra = registry - spec_funcs
        assert not extra, f'Registry has functions not in spec: {extra}'

    def test_fel_functions_schema_names_are_builtin(self):
        """Every entry in fel-functions.schema.json is implemented (Rust catalog / BUILTIN_NAMES)."""
        from formspec.fel import BUILTIN_NAMES

        fel_fn = _load("fel-functions.schema.json")
        names = {entry["name"] for entry in fel_fn["functions"]}
        missing = names - set(BUILTIN_NAMES)
        assert not missing, (
            f'fel-functions.schema.json lists functions not in BUILTIN_NAMES: {sorted(missing)}'
        )


# ===========================================================================
# Structural Schema Assertions — Bucket 1 schema changes
# ===========================================================================


class TestBucket1SchemaStructure:
    """Structural assertions for bucket-1 schema additions."""

    def test_mapping_version_has_semver_pattern(self):
        pattern = MAP_S["properties"]["version"].get("pattern")
        assert pattern is not None
        assert "\\d" in pattern, "version should have SemVer-style pattern"

    def test_mapping_conformance_level_enum(self):
        cl = MAP_S["properties"]["conformanceLevel"]
        assert cl["enum"] == ["core", "bidirectional", "extended"]

    def test_mapping_definition_ref_has_uri_format(self):
        dr = MAP_S["properties"]["definitionRef"]
        assert dr.get("format") == "uri"

    def test_registry_license_has_pattern(self):
        entry = _def(REG_S, "RegistryEntry")
        lic = entry["properties"]["license"]
        assert "pattern" in lic, "license should have SPDX-like pattern"

    def test_registry_deprecation_conditional_exists(self):
        entry = _def(REG_S, "RegistryEntry")
        found = False
        for branch in entry.get("allOf", []):
            if_block = branch.get("if", {})
            props = if_block.get("properties", {})
            if props.get("status", {}).get("const") == "deprecated":
                then_block = branch.get("then", {})
                if "deprecationNotice" in then_block.get("required", []):
                    found = True
        assert found, "RegistryEntry should have if status=deprecated then require deprecationNotice"

    def test_component_components_has_pascal_case_pattern(self):
        COMP_S = _load("component.schema.json")
        comps = COMP_S["properties"]["components"]
        pp = comps.get("patternProperties", {})
        assert any("A-Z" in key for key in pp), \
            "components should have PascalCase patternProperties"
        assert comps.get("additionalProperties") is False

    def test_component_accessibility_block_exists(self):
        COMP_S = _load("component.schema.json")
        assert "AccessibilityBlock" in COMP_S["$defs"], \
            "component schema should define AccessibilityBlock"
        ab = COMP_S["$defs"]["AccessibilityBlock"]
        assert "role" in ab["properties"]
        assert "description" in ab["properties"]
        assert "liveRegion" in ab["properties"]
        assert ab["properties"]["liveRegion"]["enum"] == ["off", "polite", "assertive"]

    def test_component_all_builtins_have_accessibility(self):
        COMP_S = _load("component.schema.json")
        builtins = [
            "Page", "Stack", "Grid", "Spacer",
            "TextInput", "NumberInput", "DatePicker", "Select",
            "CheckboxGroup", "Toggle", "FileUpload",
            "Heading", "Text", "Divider",
            "Card", "Collapsible", "ConditionalGroup",
            "Columns", "Tabs", "Accordion",
            "RadioGroup", "MoneyInput", "Slider", "Rating", "Signature",
            "Alert", "Badge", "ProgressBar", "Summary", "DataTable",
            "Panel", "Modal", "Popover",
        ]
        base_props = COMP_S["$defs"].get("ComponentBase", {}).get("properties", {})
        for name in builtins:
            own_props = COMP_S["$defs"][name].get("properties", {})
            has_accessibility = "accessibility" in own_props or "accessibility" in base_props
            assert has_accessibility, \
                f"{name} should have accessibility property (directly or via ComponentBase)"

    def test_component_base_properties_documented_in_spec(self):
        """All schema-defined base properties must appear in the §3.1 table in component-spec.md."""
        import re, pathlib
        spec_path = pathlib.Path(__file__).parents[3] / "specs" / "component" / "component-spec.md"
        spec_text = spec_path.read_text()

        # Extract §3.1 table rows — backtick-quoted property names
        table_props = set(re.findall(r"\| `(\w+)` \|", spec_text))

        # Base properties that every component has in the schema (shared $defs used by all)
        # These are the properties present in the base component schema aside from 'component' itself.
        schema_base = {"component", "bind", "when", "responsive", "style", "cssClass",
                       "children", "accessibility"}

        missing = schema_base - table_props
        assert not missing, (
            f"component-spec.md §3.1 table is missing base properties: {sorted(missing)}. "
            "Add them to the table in §3.1 to prevent schema/spec drift."
        )
