"""Schema conformance for definition-level validation findings."""

import pytest
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import load_schema


@pytest.mark.parametrize(("code", "path"), [
    ("UNSUBSCRIPTED_REPEAT_REFERENCE", "$.binds[0].constraint"),
    ("CIRCULAR_DEPENDENCY", ""),
])
def test_definition_validation_result(code, path):
    validator = Draft202012Validator(load_schema("validation-result.schema.json"))
    validator.validate({
        "$formspecValidationResult": "1.0",
        "severity": "error",
        "constraintKind": "definition",
        "source": "definition",
        "code": code,
        "path": path,
        "message": "Check the authored expression.",
    })
