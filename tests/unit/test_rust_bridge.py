"""Tests for the _rust bridge module — verifies Python↔Rust boundary."""

import inspect

import pytest
from formspec import _native as formspec_rust
from formspec._rust import (
    parse,
    ParsedExpression,
    evaluate,
    extract_dependencies,
    EvalResult,
    DependencySet,
    lint,
    detect_document_type,
    LintDiagnostic,
    evaluate_definition,
    evaluate_screener_document,
    ProcessingResult,
    execute_mapping,
    MappingResult,
    parse_registry,
    RegistryInfo,
    find_registry_entry,
    validate_lifecycle_transition,
    well_known_registry_url,
    generate_changelog,
    apply_migrations_to_response_data,
    rewrite_fel_for_assembly,
    canonical_item_path,
    _severity_from_str,
)
from formspec.fel.errors import FelSyntaxError, Severity
from formspec.fel.types import FelNumber, FelString, is_null


def test_formspec_rust_exports_expected_contract():
    assert getattr(formspec_rust, "PY_API_VERSION", None) == 1

    signature = inspect.signature(formspec_rust.evaluate_def)
    assert list(signature.parameters.keys()) == [
        "definition",
        "data",
        "trigger",
        "registry_documents",
        "instances",
        "context",
    ]

    for name in (
        "eval_fel_detailed",
        "eval_fel_with_trace",
        "extract_deps",
        "detect_type",
        "lint_document",
        "evaluate_def",
        "evaluate_screener_document_py",
        "execute_mapping_doc",
        "generate_changelog",
        "apply_migrations_to_response_data",
    ):
        assert hasattr(formspec_rust, name), f"missing formspec_rust export: {name}"


# ── FEL parse ────────────────────────────────────────────────────


def test_parse_valid_expression():
    result = parse("1 + 2")
    assert isinstance(result, ParsedExpression)
    assert result.source == "1 + 2"


def test_parse_invalid_expression_raises():
    with pytest.raises(FelSyntaxError):
        parse("1 +")


# ── FEL evaluate ─────────────────────────────────────────────────


def test_evaluate_simple_arithmetic():
    result = evaluate("1 + 2")
    assert isinstance(result, EvalResult)
    assert isinstance(result.value, FelNumber)
    assert float(result.value.value) == 3.0


def test_evaluate_with_data():
    result = evaluate("$x + $y", {"x": 10, "y": 20})
    assert isinstance(result.value, FelNumber)
    assert float(result.value.value) == 30.0


def test_evaluate_null_field():
    result = evaluate("$missing", {})
    assert is_null(result.value)


def test_evaluate_string():
    result = evaluate("'hello'")
    assert isinstance(result.value, FelString)
    assert result.value.value == "hello"


# ── FEL eval_fel_with_trace ──────────────────────────────────────


def test_eval_fel_with_trace_returns_value_diagnostics_and_trace():
    payload = formspec_rust.eval_fel_with_trace("$a + $b", {"a": 3, "b": 4})
    # `value` is projected through fel_to_python; for an integer result it may be
    # int or Decimal-like — just check numeric equality.
    assert float(payload["value"]) == 7.0
    assert payload["diagnostics"] == []
    trace = payload["trace"]
    assert len(trace) == 3, trace
    assert trace[0]["kind"] == "FieldResolved"
    assert trace[0]["path"] == "a"
    assert trace[1]["kind"] == "FieldResolved"
    assert trace[1]["path"] == "b"
    assert trace[2]["kind"] == "BinaryOp"
    assert trace[2]["op"] == "+"
    assert trace[2]["result"] == 7


def test_eval_fel_with_trace_short_circuit_and():
    payload = formspec_rust.eval_fel_with_trace("false and $undefined", {})
    trace = payload["trace"]
    assert any(
        step["kind"] == "ShortCircuit" and step["op"] == "and" for step in trace
    ), trace
    # Right side must never resolve.
    assert not any(
        step["kind"] == "FieldResolved" and step.get("path") == "undefined"
        for step in trace
    )


# ── FEL extract_dependencies ─────────────────────────────────────


def test_extract_dependencies_fields():
    deps = extract_dependencies("$x + $y")
    assert isinstance(deps, DependencySet)
    assert "x" in deps.fields
    assert "y" in deps.fields


def test_extract_dependencies_variables():
    deps = extract_dependencies("@myVar")
    assert "myVar" in deps.context_refs


# ── Linting ──────────────────────────────────────────────────────


def test_detect_document_type_definition():
    doc = {"$formspec": "1.0", "url": "test://def", "version": "1.0.0", "items": []}
    assert detect_document_type(doc) == "definition"


def test_detect_document_type_unknown():
    assert detect_document_type({"random": True}) is None


def test_lint_valid_definition():
    doc = {
        "url": "test://example",
        "version": "1.0.0",
        "items": [{"type": "field", "key": "name", "dataType": "string"}],
    }
    results = lint(doc)
    assert isinstance(results, list)
    assert all(isinstance(d, LintDiagnostic) for d in results)


def test_lint_returns_diagnostics_for_bad_doc():
    doc = {"url": "test://bad"}  # missing required fields
    results = lint(doc)
    assert len(results) > 0
    assert any(d.severity == "error" for d in results)


# ── Evaluation ───────────────────────────────────────────────────


def test_evaluate_definition_simple():
    definition = {
        "url": "test://eval",
        "version": "1.0.0",
        "items": [{"type": "field", "key": "name", "dataType": "string"}],
    }
    result = evaluate_definition(definition, {"name": "Alice"})
    assert isinstance(result, ProcessingResult)
    assert isinstance(result.valid, bool)
    assert isinstance(result.data, dict)


def test_evaluate_definition_validation_keys_match_wasm_camel_case():
    """PyO3 must emit constraintKind / shapeId (JsCamel) so Python matches Node fuzzing and unit tests."""
    definition = {
        "url": "test://wire-keys",
        "version": "1.0.0",
        "items": [{"type": "field", "key": "name", "dataType": "string"}],
        "binds": [{"path": "name", "required": True}],
    }
    result = evaluate_definition(definition, {})
    assert result.results, "expected at least one validation"
    keys = set(result.results[0].keys())
    assert "constraintKind" in keys, (
        "expected constraintKind on validation dicts (reinstall formspec-py if you see "
        f"constraint_kind only: pip install --no-build-isolation ./crates/formspec-py). keys={sorted(keys)}"
    )
    assert "constraint_kind" not in keys


# ── Screener (fs-zs72) ───────────────────────────────────────────


def test_screener_malformed_route_condition_emits_fel_warning_and_expression_error():
    """Malformed route FEL must surface fel-expression-error, not silent condition-false."""
    screener = {
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "evaluation": [
            {
                "id": "routing",
                "strategy": "first-match",
                "routes": [
                    {
                        "condition": "$x ==",
                        "target": "urn:broken",
                    }
                ],
            }
        ],
    }
    record = evaluate_screener_document(
        screener, {}, {"nowIso": "2026-04-01T10:00:00Z"}
    )
    assert isinstance(record, dict)
    phase = record["phases"][0]
    assert phase["matched"] == []
    assert len(phase["eliminated"]) == 1
    assert phase["eliminated"][0]["reason"] == "expression-error"
    assert "fel-expression-error" in phase["warnings"]


# ── Mapping ──────────────────────────────────────────────────────


def test_execute_mapping_forward():
    mapping_doc = {
        "rules": [
            {
                "sourcePath": "name",
                "targetPath": "fullName",
                "transform": "preserve",
            }
        ]
    }
    result = execute_mapping(mapping_doc, {"name": "Alice"}, "forward")
    assert isinstance(result, MappingResult)
    assert result.direction == "forward"
    assert result.output.get("fullName") == "Alice"


# ── Registry ─────────────────────────────────────────────────────


def test_validate_lifecycle_valid():
    assert validate_lifecycle_transition("draft", "stable") is True


def test_validate_lifecycle_invalid():
    assert validate_lifecycle_transition("retired", "draft") is False


def test_well_known_registry_url():
    url = well_known_registry_url("https://example.com")
    assert isinstance(url, str)
    assert "example.com" in url


# ── Changelog ────────────────────────────────────────────────────


def test_generate_changelog_returns_dict():
    old_def = {"url": "test://def", "version": "1.0.0", "items": []}
    new_def = {
        "url": "test://def",
        "version": "2.0.0",
        "items": [{"type": "field", "key": "name", "dataType": "string"}],
    }
    result = generate_changelog(old_def, new_def, "test://def")
    assert isinstance(result, dict)


def test_rewrite_fel_for_assembly_prefixes_imported_key():
    out = rewrite_fel_for_assembly(
        "$amount",
        {
            "fragmentRootKey": "budget",
            "hostGroupKey": "projectBudget",
            "importedKeys": ["budget", "amount"],
            "keyPrefix": "proj_",
        },
    )
    assert out == "$proj_amount"


def test_apply_migrations_to_response_data_rename():
    definition = {
        "migrations": [
            {
                "fromVersion": "1.0.0",
                "changes": [{"type": "rename", "from": "name", "to": "fullName"}],
            }
        ]
    }
    out = apply_migrations_to_response_data(
        definition,
        {"name": "Ada"},
        "1.0.0",
        now_iso="2020-01-01T00:00:00Z",
    )
    assert out.get("fullName") == "Ada"
    assert "name" not in out


# ── Path utility ─────────────────────────────────────────────────


def test_canonical_item_path():
    assert canonical_item_path("$.foo.bar") == "foo.bar"
    assert canonical_item_path("/foo/bar") == "foo.bar"
    assert canonical_item_path("foo.bar") == "foo.bar"


# ── Severity mapping ─────────────────────────────────────────────


def test_severity_from_str_distinguishes_all_three_levels():
    """Spec defines three severities; the Python bridge must not collapse info into warning."""
    assert _severity_from_str("error") is Severity.ERROR
    assert _severity_from_str("warning") is Severity.WARNING
    assert _severity_from_str("info") is Severity.INFO
    # Unknown / missing severities fall back to ERROR (preserves prior fail-loud behavior).
    assert _severity_from_str(None) is Severity.ERROR
    assert _severity_from_str("nonsense") is Severity.ERROR


def test_severity_info_and_warning_are_distinct_enum_members():
    """Regression guard: Severity.INFO must not be aliased to Severity.WARNING."""
    assert Severity.INFO is not Severity.WARNING
    assert Severity.INFO.value == "info"
    assert Severity.WARNING.value == "warning"
