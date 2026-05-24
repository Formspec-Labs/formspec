"""Layer 3: Property-Based / Generative Testing.

Uses Hypothesis to generate random valid Formspec documents, verify they
pass schema validation, then apply targeted mutations and verify the
schema rejects them.  Finds edge cases in the combinatorial space of
if/then, oneOf, anyOf, and additionalProperties interactions.
"""
import copy
import json

import hypothesis
import pytest
from hypothesis import HealthCheck, assume, given, note, settings
from hypothesis import strategies as st
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

# ---------------------------------------------------------------------------
# Schema loading + shared validator registry
# ---------------------------------------------------------------------------

DEFINITION_SCHEMA = load_schema("definition.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")
ISSUER_SCHEMA = load_schema("issuer.schema.json")
RESPONSE_SCHEMA = load_schema("response.schema.json")
VALIDATION_REPORT_SCHEMA = load_schema("validation-report.schema.json")
VALIDATION_RESULT_SCHEMA = load_schema("validation-result.schema.json")
MAPPING_SCHEMA = load_schema("mapping.schema.json")
REGISTRY_SCHEMA = load_schema("registry.schema.json")
ONTOLOGY_SCHEMA = load_schema("ontology.schema.json")

# Pre-build referencing registry so cross-file $refs resolve.
_REF_REGISTRY = build_schema_registry(
    COMMON_SCHEMA,
    ISSUER_SCHEMA,
    DEFINITION_SCHEMA,
    RESPONSE_SCHEMA,
    VALIDATION_REPORT_SCHEMA,
    VALIDATION_RESULT_SCHEMA,
    MAPPING_SCHEMA,
    REGISTRY_SCHEMA,
    ONTOLOGY_SCHEMA,
)

# Cached validator instances (compiled once)
_VALIDATORS = {}


def _validator_for(schema):
    key = id(schema)
    if key not in _VALIDATORS:
        _VALIDATORS[key] = Draft202012Validator(schema, registry=_REF_REGISTRY)
    return _VALIDATORS[key]


def _validator_for_def(parent_schema, def_name):
    """Validator for a $defs sub-schema with parent $defs inlined."""
    sub = parent_schema["$defs"][def_name]
    enriched = {**sub, "$defs": parent_schema["$defs"]}
    return Draft202012Validator(enriched, registry=_REF_REGISTRY)


# Hypothesis settings
SETTINGS = settings(
    max_examples=100,
    deadline=2000,
    suppress_health_check=[HealthCheck.too_slow],
)

SETTINGS_MUTATION = settings(
    max_examples=50,
    deadline=2000,
    suppress_health_check=[HealthCheck.too_slow],
)


# ---------------------------------------------------------------------------
# Primitive strategies
# ---------------------------------------------------------------------------

# Matches ^[a-zA-Z][a-zA-Z0-9_]*$
valid_key = st.from_regex(r"\A[a-zA-Z][a-zA-Z0-9_]{0,10}\Z")

# Matches ^[a-zA-Z][a-zA-Z0-9\-]*$
valid_name = st.from_regex(r"\A[a-zA-Z][a-zA-Z0-9\-]{0,10}\Z")

# Matches ^[a-zA-Z][a-zA-Z0-9_\-]*$
valid_shape_id = st.from_regex(r"\A[a-zA-Z][a-zA-Z0-9_\-]{0,10}\Z")

# Extension keys for propertyNames ^x-
valid_extension_key = st.from_regex(r"\Ax-[a-z][a-z0-9]{0,8}\Z")

# Registry entry names: ^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$
valid_registry_name = st.from_regex(
    r"\Ax-[a-z][a-z0-9]{0,5}(-[a-z][a-z0-9]{0,5}){0,2}\Z"
)

# URIs
valid_uri = st.from_regex(r"\Ahttps://example\.org/[a-z]{1,10}\Z")

# Dates: YYYY-MM-DD
valid_date = st.dates().map(lambda d: d.isoformat())

# DateTimes: ISO 8601
valid_datetime = st.datetimes().map(lambda dt: dt.strftime("%Y-%m-%dT%H:%M:%SZ"))

# Simple FEL expressions
valid_fel = st.sampled_from([
    "true", "false", "$a > 0", "$x != ''", "1 + 1",
    "len($items) > 0", "$startDate <= $endDate",
])

# Semver strings
valid_semver = st.tuples(
    st.integers(0, 20), st.integers(0, 20), st.integers(0, 20)
).map(lambda t: f"{t[0]}.{t[1]}.{t[2]}")

# Non-empty strings
non_empty_str = st.text(min_size=1, max_size=30, alphabet=st.characters(whitelist_categories=("L", "N")))

# Data type enum
DATA_TYPES = [
    "string", "text", "integer", "decimal", "boolean",
    "date", "dateTime", "time", "uri", "attachment",
    "choice", "multiChoice", "money",
]

TRANSFORM_TYPES = [
    "preserve", "drop", "expression", "coerce", "valueMap",
    "flatten", "nest", "constant", "concat", "split",
]

# ---------------------------------------------------------------------------
# Definition schema generators
# ---------------------------------------------------------------------------


@st.composite
def gen_option_entry(draw):
    return {
        "value": draw(non_empty_str),
        "label": draw(non_empty_str),
    }


@st.composite
def gen_display_item(draw):
    return {
        "key": draw(valid_key),
        "type": "display",
        "label": draw(non_empty_str),
    }


@st.composite
def gen_field_item(draw):
    dt = draw(st.sampled_from(DATA_TYPES))
    item = {
        "key": draw(valid_key),
        "type": "field",
        "label": draw(non_empty_str),
        "dataType": dt,
    }
    if dt in ("choice", "multiChoice") and draw(st.booleans()):
        branch = draw(st.sampled_from(["array", "uri"]))
        if branch == "array":
            item["options"] = draw(st.lists(gen_option_entry(), min_size=1, max_size=3))
        else:
            item["options"] = draw(valid_uri)
    if draw(st.booleans()):
        item["description"] = draw(non_empty_str)
    return item


@st.composite
def gen_group_item(draw, depth=0):
    item = {
        "key": draw(valid_key),
        "type": "group",
        "label": draw(non_empty_str),
    }
    # Choose: inline children or $ref
    use_ref = draw(st.booleans()) and depth == 0
    if use_ref:
        item["$ref"] = draw(valid_uri)
        if draw(st.booleans()):
            item["keyPrefix"] = draw(valid_key)
    else:
        # Generate children — allow nesting up to depth 2
        if depth < 2:
            child_strats = [gen_field_item(), gen_display_item()]
            if depth < 1:
                child_strats.append(gen_group_item(depth=depth + 1))
            children = draw(st.lists(st.one_of(*child_strats), min_size=1, max_size=3))
        else:
            children = draw(st.lists(gen_field_item(), min_size=1, max_size=2))
        item["children"] = children
    if draw(st.booleans()):
        item["repeatable"] = True
        item["minRepeat"] = draw(st.integers(0, 3))
        item["maxRepeat"] = draw(st.integers(1, 10))
    return item


@st.composite
def gen_item(draw, depth=0):
    choice = draw(st.sampled_from(["field", "group", "display"]))
    if choice == "field":
        return draw(gen_field_item())
    elif choice == "group":
        return draw(gen_group_item(depth=depth))
    else:
        return draw(gen_display_item())


@st.composite
def gen_bind(draw):
    b = {"path": draw(non_empty_str)}
    if draw(st.booleans()):
        b["required"] = draw(valid_fel)
    if draw(st.booleans()):
        b["relevant"] = draw(valid_fel)
    if draw(st.booleans()):
        b["readonly"] = draw(valid_fel)
    if draw(st.booleans()):
        b["calculate"] = draw(valid_fel)
    if draw(st.booleans()):
        b["whitespace"] = draw(st.sampled_from(["preserve", "trim", "normalize", "remove"]))
    if draw(st.booleans()):
        b["excludedValue"] = draw(st.sampled_from(["preserve", "null"]))
    if draw(st.booleans()):
        b["constraint"] = draw(valid_fel)
        b["constraintMessage"] = draw(non_empty_str)
    return b


@st.composite
def gen_shape(draw):
    shape = {
        "id": draw(valid_shape_id),
        "target": draw(non_empty_str),
        "message": draw(non_empty_str),
    }
    # Must have at least one of: constraint, and, or, not, xone
    ops = draw(st.sets(
        st.sampled_from(["constraint", "and", "or", "not", "xone"]),
        min_size=1, max_size=2,
    ))
    if "constraint" in ops:
        shape["constraint"] = draw(valid_fel)
    if "and" in ops:
        shape["and"] = [draw(valid_shape_id) for _ in range(draw(st.integers(1, 3)))]
    if "or" in ops:
        shape["or"] = [draw(valid_shape_id) for _ in range(draw(st.integers(1, 3)))]
    if "not" in ops:
        shape["not"] = draw(valid_shape_id)
    if "xone" in ops:
        shape["xone"] = [draw(valid_shape_id) for _ in range(draw(st.integers(1, 3)))]
    if draw(st.booleans()):
        shape["severity"] = draw(st.sampled_from(["error", "warning", "info"]))
    if draw(st.booleans()):
        shape["timing"] = draw(st.sampled_from(["continuous", "submit", "demand"]))
    return shape


@st.composite
def gen_instance(draw):
    inst = {}
    branch = draw(st.sampled_from(["source", "data", "both"]))
    if branch in ("source", "both"):
        inst["source"] = draw(valid_uri)
    if branch in ("data", "both"):
        inst["data"] = draw(st.fixed_dictionaries({}, optional={"a": st.just(1)}))
    if draw(st.booleans()):
        inst["description"] = draw(non_empty_str)
    return inst


@st.composite
def gen_variable(draw):
    return {
        "name": draw(valid_key),
        "expression": draw(valid_fel),
    }


@st.composite
def gen_option_set(draw):
    os_obj = {}
    branch = draw(st.sampled_from(["options", "source"]))
    if branch == "options":
        os_obj["options"] = draw(st.lists(gen_option_entry(), min_size=1, max_size=4))
    else:
        os_obj["source"] = draw(valid_uri)
    return os_obj


@st.composite
def gen_route(draw):
    return {
        "condition": draw(valid_fel),
        "target": draw(valid_uri),
    }


@st.composite
def gen_definition(draw):
    defn = {
        "$formspec": "1.0",
        "url": draw(valid_uri),
        "version": draw(valid_semver),
        "status": draw(st.sampled_from(["draft", "active", "retired"])),
        "title": draw(non_empty_str),
        "items": draw(st.lists(gen_item(), min_size=1, max_size=4)),
    }
    if draw(st.booleans()):
        defn["name"] = draw(valid_name)
    if draw(st.booleans()):
        defn["description"] = draw(non_empty_str)
    if draw(st.booleans()):
        defn["date"] = draw(valid_date)
    if draw(st.booleans()):
        defn["binds"] = draw(st.lists(gen_bind(), min_size=1, max_size=3))
    if draw(st.booleans()):
        defn["shapes"] = draw(st.lists(gen_shape(), min_size=1, max_size=3))
    if draw(st.booleans()):
        defn["variables"] = draw(st.lists(gen_variable(), min_size=1, max_size=2))
    if draw(st.booleans()):
        defn["versionAlgorithm"] = draw(
            st.sampled_from(["semver", "date", "integer", "natural"])
        )
    return defn

# ---------------------------------------------------------------------------
# Response + ValidationReport generators
# ---------------------------------------------------------------------------


@st.composite
def gen_validation_result(draw):
    vr = {
        "$formspecValidationResult": "1.0",
        "path": draw(non_empty_str),
        "severity": draw(st.sampled_from(["error", "warning", "info"])),
        "constraintKind": draw(
            st.sampled_from(["required", "type", "cardinality", "constraint", "shape", "external"])
        ),
        "message": draw(non_empty_str),
    }
    if draw(st.booleans()):
        vr["source"] = draw(st.sampled_from(["bind", "shape", "external"]))
    if draw(st.booleans()):
        vr["code"] = draw(non_empty_str)
    return vr


@st.composite
def gen_response(draw):
    resp = {
        "$formspecResponse": "1.0",
        "definitionUrl": draw(valid_uri),
        "definitionVersion": draw(valid_semver),
        "status": draw(st.sampled_from(["in-progress", "completed", "amended", "stopped"])),
        "data": draw(st.fixed_dictionaries({}, optional={"field1": st.just("val")})),
        "authored": draw(valid_datetime),
    }
    if draw(st.booleans()):
        resp["author"] = {"id": draw(non_empty_str)}
        if draw(st.booleans()):
            resp["author"]["name"] = draw(non_empty_str)
    if draw(st.booleans()):
        resp["subject"] = {"id": draw(non_empty_str)}
    if draw(st.booleans()):
        resp["validationResults"] = draw(
            st.lists(gen_validation_result(), min_size=0, max_size=3)
        )
    return resp


@st.composite
def gen_validation_report(draw):
    n_err = draw(st.integers(0, 5))
    n_warn = draw(st.integers(0, 5))
    n_info = draw(st.integers(0, 5))
    results = []
    for _ in range(n_err):
        r = draw(gen_validation_result())
        r["severity"] = "error"
        results.append(r)
    for _ in range(n_warn):
        r = draw(gen_validation_result())
        r["severity"] = "warning"
        results.append(r)
    for _ in range(n_info):
        r = draw(gen_validation_result())
        r["severity"] = "info"
        results.append(r)
    return {
        "$formspecValidationReport": "1.0",
        "valid": n_err == 0,
        "results": results,
        "counts": {"error": n_err, "warning": n_warn, "info": n_info},
        "timestamp": draw(valid_datetime),
    }

# ---------------------------------------------------------------------------
# Mapping schema generators
# ---------------------------------------------------------------------------


@st.composite
def gen_target_schema(draw):
    fmt = draw(st.sampled_from(["json", "xml", "csv"]))
    ts = {"format": fmt}
    if fmt == "xml":
        ts["rootElement"] = draw(non_empty_str)
    if draw(st.booleans()):
        ts["name"] = draw(non_empty_str)
    if draw(st.booleans()):
        ts["url"] = draw(valid_uri)
    return ts


@st.composite
def gen_coerce(draw):
    """Generate valid coerce: object form OR string shorthand."""
    coerce_types = ["string", "number", "boolean", "date", "datetime",
                    "integer", "array", "object", "money"]
    branch = draw(st.sampled_from(["object", "string"]))
    if branch == "object":
        return {
            "from": draw(st.sampled_from(coerce_types)),
            "to": draw(st.sampled_from(coerce_types)),
        }
    else:
        return draw(st.sampled_from(coerce_types))


@st.composite
def gen_value_map(draw):
    """Generate valid structured valueMap with required forward map."""
    vm = {
        "forward": draw(st.fixed_dictionaries(
            {"a": st.just("A")},
            optional={"b": st.just("B"), "c": st.just("C")},
        )),
    }
    if draw(st.booleans()):
        vm["unmapped"] = draw(
            st.sampled_from(["error", "drop", "passthrough", "default"])
        )
    if draw(st.booleans()):
        vm["default"] = draw(non_empty_str)
    return vm


@st.composite
def gen_field_rule(draw):
    transform = draw(st.sampled_from(TRANSFORM_TYPES))
    rule = {"transform": transform}

    # sourcePath / targetPath: at least one required (anyOf)
    has_source = draw(st.booleans()) or transform not in ("constant",)
    has_target = draw(st.booleans()) or transform != "drop"
    if not has_source and not has_target:
        has_source = True  # ensure anyOf satisfied
    if has_source:
        rule["sourcePath"] = draw(non_empty_str)
    if has_target:
        rule["targetPath"] = draw(non_empty_str)
    # drop can have null targetPath
    if transform == "drop" and "targetPath" in rule and draw(st.booleans()):
        rule["targetPath"] = None

    # Conditional requirements
    if transform in ("expression", "constant", "concat", "split"):
        rule["expression"] = draw(valid_fel)
    if transform == "coerce":
        rule["coerce"] = draw(gen_coerce())
    if transform == "valueMap":
        rule["valueMap"] = draw(gen_value_map())

    if draw(st.booleans()):
        rule["description"] = draw(non_empty_str)
    if draw(st.booleans()):
        rule["condition"] = draw(valid_fel)
    if draw(st.booleans()):
        rule["bidirectional"] = draw(st.booleans())
    if draw(st.booleans()):
        rule["separator"] = draw(st.sampled_from([",", ";", "|"]))
    return rule


@st.composite
def gen_mapping_doc(draw):
    return {
        "$formspecMapping": "1.0",
        "version": draw(valid_semver),
        "definitionRef": draw(valid_uri),
        "definitionVersion": draw(valid_semver),
        "targetSchema": draw(gen_target_schema()),
        "rules": draw(st.lists(gen_field_rule(), min_size=1, max_size=4)),
        **({
            "direction": draw(st.sampled_from(["forward", "reverse", "both"]))
        } if draw(st.booleans()) else {}),
    }

# ---------------------------------------------------------------------------
# Registry schema generators
# ---------------------------------------------------------------------------


@st.composite
def gen_registry_entry(draw):
    # Per ADR 0150 §4.1/§4.2: namespace removed; module + 6 contribution
    # categories added. The fuzzer focuses on the dataType/function/constraint/
    # property quadrant (these don't require category-specific payloads), since
    # `module` requires contributes[] and the 6 new categories require their
    # own payload shapes.
    category = draw(st.sampled_from(["dataType", "function", "constraint", "property"]))
    entry = {
        "name": draw(valid_registry_name),
        "category": category,
        "version": draw(valid_semver),
        "status": draw(st.sampled_from(["draft", "stable", "deprecated", "retired"])),
        "description": draw(non_empty_str),
        "compatibility": {"formspecVersion": ">=1.0.0"},
    }
    # Category-specific required fields
    if category == "dataType":
        entry["baseType"] = draw(st.sampled_from(
            ["string", "integer", "decimal", "boolean", "date", "dateTime", "time", "uri"]
        ))
    elif category == "function":
        entry["parameters"] = [{
            "name": draw(non_empty_str),
            "type": draw(st.sampled_from(["string", "integer", "date"])),
        }]
        entry["returns"] = draw(st.sampled_from(["string", "integer", "boolean"]))
    elif category == "constraint":
        entry["parameters"] = [{
            "name": draw(non_empty_str),
            "type": draw(st.sampled_from(["string", "integer", "array"])),
        }]
    # namespace and property need no extra fields
    # Conditional: deprecated status requires deprecationNotice
    if entry["status"] == "deprecated":
        entry["deprecationNotice"] = draw(non_empty_str)
    if draw(st.booleans()):
        entry["license"] = "MIT"
    return entry


@st.composite
def gen_registry_doc(draw):
    return {
        "$formspecRegistry": "1.0",
        "publisher": {
            "name": draw(non_empty_str),
            "url": draw(valid_uri),
        },
        "published": draw(valid_datetime),
        "entries": draw(st.lists(gen_registry_entry(), min_size=0, max_size=3)),
    }

# ---------------------------------------------------------------------------
# Mutation strategies
# ---------------------------------------------------------------------------


def mutate_delete_required(doc, schema):
    """Delete the first present required field from the top-level object."""
    required = schema.get("required", [])
    if not required:
        return None, "no required fields"
    mutated = copy.deepcopy(doc)
    for field in required:
        if field in mutated:
            del mutated[field]
            return mutated, f"deleted required '{field}'"
    return None, "no deletable field found"


def mutate_bad_enum(doc, schema):
    """Find a field with an enum constraint and set an invalid value."""
    props = schema.get("properties", {})
    mutated = copy.deepcopy(doc)
    for field, field_schema in props.items():
        if "enum" in field_schema and field in mutated:
            mutated[field] = "__INVALID_ENUM_VALUE__"
            return mutated, f"bad enum on '{field}'"
    return None, "no enum field found"


def mutate_add_extra_property(doc, _schema):
    """Add an unknown property to an additionalProperties:false object."""
    mutated = copy.deepcopy(doc)
    mutated["__bogus_extra_property"] = True
    return mutated, "added '__bogus_extra_property'"


def mutate_bad_extension_key(doc, schema):
    """Inject a non-x- key into an extensions object (propertyNames schemas)."""
    mutated = copy.deepcopy(doc)
    if "extensions" not in mutated:
        mutated["extensions"] = {}
    mutated["extensions"]["bad_no_x_prefix"] = {"val": 1}
    return mutated, "non-x- key in extensions"


def mutate_empty_required_string(doc, schema):
    """Set a minLength:1 string to empty string."""
    props = schema.get("properties", {})
    mutated = copy.deepcopy(doc)
    for field, fs in props.items():
        if fs.get("minLength") and field in mutated and isinstance(mutated[field], str):
            mutated[field] = ""
            return mutated, f"emptied '{field}'"
    return None, "no minLength field found"


def mutate_empty_array(doc, schema):
    """Set a minItems:1 array to empty."""
    props = schema.get("properties", {})
    mutated = copy.deepcopy(doc)
    for field, fs in props.items():
        if fs.get("minItems") and field in mutated and isinstance(mutated[field], list):
            mutated[field] = []
            return mutated, f"emptied array '{field}'"
    # Check items inside the document
    if "items" in mutated and isinstance(mutated["items"], list):
        mutated["items"] = []
        return mutated, "emptied 'items' array"
    return None, "no minItems array found"


MUTATION_FNS = [
    mutate_delete_required,
    mutate_bad_enum,
    mutate_add_extra_property,
    mutate_bad_extension_key,
    mutate_empty_required_string,
    mutate_empty_array,
]

# ===========================================================================
# TEST CLASSES
# ===========================================================================


class TestGeneratorsProduceValid:
    """Every generator must produce documents that pass schema validation."""

    @SETTINGS
    @given(doc=gen_definition())
    def test_definition(self, doc):
        _validator_for(DEFINITION_SCHEMA).validate(doc)

    @SETTINGS
    @given(doc=gen_response())
    def test_response(self, doc):
        _validator_for(RESPONSE_SCHEMA).validate(doc)

    @SETTINGS
    @given(doc=gen_validation_report())
    def test_validation_report(self, doc):
        _validator_for(VALIDATION_REPORT_SCHEMA).validate(doc)

    @SETTINGS
    @given(doc=gen_mapping_doc())
    def test_mapping_doc(self, doc):
        _validator_for(MAPPING_SCHEMA).validate(doc)

    @SETTINGS
    @given(doc=gen_registry_doc())
    def test_registry_doc(self, doc):
        _validator_for(REGISTRY_SCHEMA).validate(doc)

    @SETTINGS
    @given(doc=gen_field_rule())
    def test_field_rule(self, doc):
        _validator_for_def(MAPPING_SCHEMA, "FieldRule").validate(doc)

    @SETTINGS
    @given(doc=gen_item())
    def test_item(self, doc):
        _validator_for_def(DEFINITION_SCHEMA, "Item").validate(doc)

    @SETTINGS
    @given(doc=gen_shape())
    def test_shape(self, doc):
        _validator_for_def(DEFINITION_SCHEMA, "Shape").validate(doc)

    @SETTINGS
    @given(doc=gen_bind())
    def test_bind(self, doc):
        _validator_for_def(DEFINITION_SCHEMA, "Bind").validate(doc)

    @SETTINGS
    @given(doc=gen_registry_entry())
    def test_registry_entry(self, doc):
        _validator_for_def(REGISTRY_SCHEMA, "RegistryEntry").validate(doc)

class TestMutationsDetected:
    """Targeted mutations on valid docs must be caught by the schema."""

    @SETTINGS_MUTATION
    @given(doc=gen_definition())
    @pytest.mark.parametrize("mutator", [
        mutate_delete_required,
        mutate_bad_enum,
        mutate_add_extra_property,
    ], ids=["delete_required", "bad_enum", "add_extra_prop"])
    def test_definition_mutations(self, doc, mutator):
        mutated, desc = mutator(doc, DEFINITION_SCHEMA)
        assume(mutated is not None)
        assume(mutated != doc)
        note(f"Mutation: {desc}")
        with pytest.raises(ValidationError):
            _validator_for(DEFINITION_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_response())
    @pytest.mark.parametrize("mutator", [
        mutate_delete_required,
        mutate_bad_enum,
        mutate_add_extra_property,
    ], ids=["delete_required", "bad_enum", "add_extra_prop"])
    def test_response_mutations(self, doc, mutator):
        mutated, desc = mutator(doc, RESPONSE_SCHEMA)
        assume(mutated is not None)
        assume(mutated != doc)
        note(f"Mutation: {desc}")
        with pytest.raises(ValidationError):
            _validator_for(RESPONSE_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_validation_report())
    @pytest.mark.parametrize("mutator", [
        mutate_delete_required,
        mutate_add_extra_property,
    ], ids=["delete_required", "add_extra_prop"])
    def test_validation_report_mutations(self, doc, mutator):
        mutated, desc = mutator(doc, VALIDATION_REPORT_SCHEMA)
        assume(mutated is not None)
        assume(mutated != doc)
        note(f"Mutation: {desc}")
        with pytest.raises(ValidationError):
            _validator_for(VALIDATION_REPORT_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_mapping_doc())
    @pytest.mark.parametrize("mutator", [
        mutate_delete_required,
        mutate_bad_enum,
        mutate_add_extra_property,
        mutate_empty_array,
    ], ids=["delete_required", "bad_enum", "add_extra_prop", "empty_array"])
    def test_mapping_mutations(self, doc, mutator):
        mutated, desc = mutator(doc, MAPPING_SCHEMA)
        assume(mutated is not None)
        assume(mutated != doc)
        note(f"Mutation: {desc}")
        with pytest.raises(ValidationError):
            _validator_for(MAPPING_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_registry_doc())
    @pytest.mark.parametrize("mutator", [
        mutate_delete_required,
        mutate_add_extra_property,
    ], ids=["delete_required", "add_extra_prop"])
    def test_registry_mutations(self, doc, mutator):
        mutated, desc = mutator(doc, REGISTRY_SCHEMA)
        assume(mutated is not None)
        assume(mutated != doc)
        note(f"Mutation: {desc}")
        with pytest.raises(ValidationError):
            _validator_for(REGISTRY_SCHEMA).validate(mutated)

class TestConditionalInteractions:
    """Targeted tests for if/then + oneOf + anyOf combinatorial edge cases."""

    # -- Item type discrimination --

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_group_without_children_or_ref_fails(self, data):
        """Group item must have children or $ref."""
        item = {
            "key": data.draw(valid_key),
            "type": "group",
            "label": data.draw(non_empty_str),
        }
        with pytest.raises(ValidationError):
            _validator_for_def(DEFINITION_SCHEMA, "Item").validate(item)

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_field_with_group_props_fails(self, data):
        """Field item cannot have group-only properties."""
        item = {
            "key": data.draw(valid_key),
            "type": "field",
            "label": data.draw(non_empty_str),
            "dataType": "string",
            "repeatable": True,  # group-only
        }
        with pytest.raises(ValidationError):
            _validator_for_def(DEFINITION_SCHEMA, "Item").validate(item)

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_display_with_datatype_fails(self, data):
        """Display item cannot have dataType."""
        item = {
            "key": data.draw(valid_key),
            "type": "display",
            "label": data.draw(non_empty_str),
            "dataType": "string",  # field-only
        }
        with pytest.raises(ValidationError):
            _validator_for_def(DEFINITION_SCHEMA, "Item").validate(item)

    # -- FieldRule transform conditionals --

    @pytest.mark.parametrize("transform", ["expression", "constant", "concat", "split"])
    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_transform_requiring_expression_without_it_fails(self, data, transform):
        rule = {
            "sourcePath": data.draw(non_empty_str),
            "targetPath": data.draw(non_empty_str),
            "transform": transform,
            # deliberately omit "expression"
        }
        with pytest.raises(ValidationError):
            _validator_for_def(MAPPING_SCHEMA, "FieldRule").validate(rule)

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_coerce_transform_without_coerce_field_fails(self, data):
        rule = {
            "sourcePath": data.draw(non_empty_str),
            "targetPath": data.draw(non_empty_str),
            "transform": "coerce",
            # deliberately omit "coerce"
        }
        with pytest.raises(ValidationError):
            _validator_for_def(MAPPING_SCHEMA, "FieldRule").validate(rule)

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_valuemap_transform_without_valuemap_field_fails(self, data):
        rule = {
            "sourcePath": data.draw(non_empty_str),
            "targetPath": data.draw(non_empty_str),
            "transform": "valueMap",
            # deliberately omit "valueMap"
        }
        with pytest.raises(ValidationError):
            _validator_for_def(MAPPING_SCHEMA, "FieldRule").validate(rule)

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_field_rule_without_source_or_target_fails(self, data):
        """FieldRule must have at least sourcePath or targetPath."""
        rule = {"transform": "preserve"}
        with pytest.raises(ValidationError):
            _validator_for_def(MAPPING_SCHEMA, "FieldRule").validate(rule)

    # -- TargetSchema xml conditional --

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_xml_target_without_root_element_fails(self, data):
        ts = {"format": "xml"}  # missing rootElement
        with pytest.raises(ValidationError):
            _validator_for_def(MAPPING_SCHEMA, "TargetSchema").validate(ts)

    def test_json_target_without_root_element_passes(self):
        ts = {"format": "json"}
        _validator_for_def(MAPPING_SCHEMA, "TargetSchema").validate(ts)

    # -- Shape anyOf --

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_shape_without_any_operator_fails(self, data):
        shape = {
            "id": data.draw(valid_shape_id),
            "target": data.draw(non_empty_str),
            "message": data.draw(non_empty_str),
            # no constraint, and, or, not, xone
        }
        with pytest.raises(ValidationError):
            _validator_for_def(DEFINITION_SCHEMA, "Shape").validate(shape)

    # -- Registry category conditionals --

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_registry_datatype_without_basetype_fails(self, data):
        entry = {
            "name": data.draw(valid_registry_name),
            "category": "dataType",
            "version": data.draw(valid_semver),
            "status": "draft",
            "description": data.draw(non_empty_str),
            "compatibility": {"formspecVersion": ">=1.0.0"},
            # deliberately omit baseType
        }
        with pytest.raises(ValidationError):
            _validator_for_def(REGISTRY_SCHEMA, "RegistryEntry").validate(entry)

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_registry_function_without_params_fails(self, data):
        entry = {
            "name": data.draw(valid_registry_name),
            "category": "function",
            "version": data.draw(valid_semver),
            "status": "draft",
            "description": data.draw(non_empty_str),
            "compatibility": {"formspecVersion": ">=1.0.0"},
            # deliberately omit parameters + returns
        }
        with pytest.raises(ValidationError):
            _validator_for_def(REGISTRY_SCHEMA, "RegistryEntry").validate(entry)

    # -- ValueMap strict object edge case --

    @SETTINGS_MUTATION
    @given(data=st.data())
    def test_valuemap_with_extra_key_fails_schema(self, data):
        """A structured valueMap with an unknown key fails additionalProperties."""
        rule = {
            "sourcePath": data.draw(non_empty_str),
            "targetPath": data.draw(non_empty_str),
            "transform": "valueMap",
            "valueMap": {
                "forward": {"a": "A"},  # matches full form shape...
                "extra_bogus": "val",   # ...but extra field breaks additionalProperties
            },
        }
        with pytest.raises(ValidationError):
            _validator_for_def(MAPPING_SCHEMA, "FieldRule").validate(rule)

    # -- Coerce oneOf --

    @SETTINGS_MUTATION
    @given(coerce_obj=gen_coerce())
    def test_coerce_valid_both_forms(self, coerce_obj):
        """Both object and string forms of coerce should validate in a rule."""
        rule = {
            "sourcePath": "a",
            "targetPath": "b",
            "transform": "coerce",
            "coerce": coerce_obj,
        }
        _validator_for_def(MAPPING_SCHEMA, "FieldRule").validate(rule)

    # -- Options oneOf --

    def test_options_as_array(self):
        item = {
            "key": "f",
            "type": "field",
            "label": "F",
            "dataType": "choice",
            "options": [{"value": "a", "label": "A"}],
        }
        _validator_for_def(DEFINITION_SCHEMA, "Item").validate(item)

    def test_options_as_uri(self):
        item = {
            "key": "f",
            "type": "field",
            "label": "F",
            "dataType": "choice",
            "options": "https://example.org/opts",
        }
        _validator_for_def(DEFINITION_SCHEMA, "Item").validate(item)

    def test_options_as_number_fails(self):
        item = {
            "key": "f",
            "type": "field",
            "label": "F",
            "dataType": "choice",
            "options": 42,
        }
        with pytest.raises(ValidationError):
            _validator_for_def(DEFINITION_SCHEMA, "Item").validate(item)


class TestExtensionKeyEnforcement:
    """Test x- prefix enforcement across both mechanisms."""

    @SETTINGS_MUTATION
    @given(doc=gen_definition())
    def test_definition_bad_extension_key(self, doc):
        """Non-x- key in definition extensions (propertyNames pattern)."""
        mutated = copy.deepcopy(doc)
        mutated["extensions"] = {"bad_key": {}}
        with pytest.raises(ValidationError):
            _validator_for(DEFINITION_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_definition())
    def test_definition_valid_extension_key(self, doc):
        """x-prefixed key in definition extensions is accepted."""
        mutated = copy.deepcopy(doc)
        mutated["extensions"] = {"x-test": {"val": 1}}
        _validator_for(DEFINITION_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_mapping_doc())
    def test_mapping_x_key_accepted(self, doc):
        """x-prefixed key on mapping doc (patternProperties) is accepted."""
        mutated = copy.deepcopy(doc)
        mutated["x-custom"] = {"val": 1}
        _validator_for(MAPPING_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_mapping_doc())
    def test_mapping_non_x_key_rejected(self, doc):
        """Non-x- key on mapping doc (additionalProperties:false) is rejected."""
        mutated = copy.deepcopy(doc)
        mutated["bad_key"] = True
        with pytest.raises(ValidationError):
            _validator_for(MAPPING_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_response())
    def test_response_bad_extension_key(self, doc):
        mutated = copy.deepcopy(doc)
        mutated["extensions"] = {"no_prefix": {}}
        with pytest.raises(ValidationError):
            _validator_for(RESPONSE_SCHEMA).validate(mutated)

    @SETTINGS_MUTATION
    @given(doc=gen_registry_doc())
    def test_registry_bad_extension_key(self, doc):
        mutated = copy.deepcopy(doc)
        mutated["extensions"] = {"no_prefix": {}}
        with pytest.raises(ValidationError):
            _validator_for(REGISTRY_SCHEMA).validate(mutated)
