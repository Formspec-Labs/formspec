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
    lint_report,
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
        "extension_functions",
    ]

    signature = inspect.signature(formspec_rust.lint_document)
    assert list(signature.parameters.keys()) == [
        "document",
        "mode",
        "registry_documents",
        "definition_document",
        "theme_document",
        "component_documents",
        "locale_documents",
        "bundle_component_documents",
        "app_graph_validation_report",
        "posture_declaration",
        "schema_only",
        "no_fel",
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


def _app_graph_error_report():
    return {
        "ok": False,
        "summary": {
            "artifacts": 1,
            "loadedArtifacts": 1,
            "schemaFailures": 0,
            "unvalidatedArtifacts": 0,
            "graphErrors": 1,
            "errors": 1,
            "warnings": 0,
            "infos": 0,
            "importedDiagnostics": 1,
            "unsupportedFeatures": 0,
            "skippedPhases": 0,
        },
        "schemaResults": [],
        "evidenceResults": [],
        "diagnostics": [
            {
                "code": "MODULE-CONTRIBUTION-OWNER",
                "severity": "error",
                "phase": "module-resolution",
                "origin": "module-resolver",
                "message": "Widget evidence is owned by a different module.",
            }
        ],
        "phases": [{"phase": "module-resolution", "status": "completed"}],
    }


def test_lint_report_exposes_app_graph_report_for_graph_root_doc():
    raw = lint_report(
        {"$formspecApp": "2.2"},
        app_graph_validation_report=_app_graph_error_report(),
    )
    assert raw["valid"] is False
    assert any(d["code"] == "E100" for d in raw["diagnostics"])
    assert raw["app_graph_report"]["diagnostics"][0]["code"] == (
        "MODULE-CONTRIBUTION-OWNER"
    )
    assert raw["app_graph_report"]["diagnostics"][0]["origin"] == "module-resolver"
    assert "appGraphReport" not in raw


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


_EXTENSION_DEFINITION = {
    "url": "test://extensions",
    "version": "1.0.0",
    "items": [
        {"type": "field", "key": "qty", "dataType": "integer", "label": "Qty"},
        {"type": "field", "key": "total", "dataType": "integer", "label": "Total"},
    ],
    "binds": [
        {"path": "total", "calculate": "double($qty)"},
        {"path": "qty", "constraint": "double($qty) < 10"},
    ],
}


def test_evaluate_definition_calls_python_extension_functions():
    """Core §3.12: Python callables back Definition extension functions."""
    seen = []

    def double(n):
        seen.append(n)
        return n * 2

    result = evaluate_definition(
        _EXTENSION_DEFINITION, {"qty": 3}, extension_functions={"double": double}
    )
    assert result.data["total"] == 6
    assert result.results == []
    assert seen and all(arg == 3 for arg in seen)


def test_evaluate_definition_extension_failure_is_null_with_diagnostic():
    """Core §3.12 totality: a raising callable yields null (passing) plus an author diagnostic."""

    def double(_n):
        raise RuntimeError("boom")

    result = evaluate_definition(
        _EXTENSION_DEFINITION, {"qty": 3}, extension_functions={"double": double}
    )
    assert result.results == []
    assert result.data.get("total") is None
    assert any("boom" in d["message"] for d in result.diagnostics), result.diagnostics


def test_evaluate_definition_without_extension_is_parse_error():
    """Core §3.10.1: an unregistered extension call stays a definition error."""
    result = evaluate_definition(_EXTENSION_DEFINITION, {"qty": 3})
    assert [r["code"] for r in result.results] == ["CONSTRAINT_PARSE_ERROR"]


def test_evaluate_definition_rejects_builtin_extension_name():
    """Core §3.12 rule 1: an extension may not shadow a built-in."""
    with pytest.raises(ValueError, match="sum"):
        evaluate_definition(
            _EXTENSION_DEFINITION, {"qty": 3}, extension_functions={"sum": lambda *a: 0}
        )


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


def test_screener_availability_without_parseable_now_is_unavailable():
    """When availability is declared, missing nowIso must not evaluate routes (SC-04)."""
    screener = {
        "$formspecScreener": "1.0",
        "url": "urn:test:screener",
        "version": "1.0.0",
        "title": "Test",
        "items": [],
        "availability": {"from": "2026-01-01", "until": "2026-12-31"},
        "evaluation": [{"id": "p1", "strategy": "first-match", "routes": []}],
    }
    record = evaluate_screener_document(screener, {}, {})
    assert record["status"] == "unavailable"
    assert record["phases"] == []


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


def test_apply_migrations_to_response_data_follows_core_6_7():
    """`migrations.from[<version>].fieldMap` (core §6.7): preserve into a nested target, drop, an
    expression over `$`, a default for a new field, carry-forward only of paths this version has."""
    definition = {
        "items": [
            {"key": "fullName", "type": "field", "dataType": "string"},
            {"key": "jobs", "type": "group", "repeatable": True, "children": [
                {"key": "employer", "type": "field", "dataType": "string"},
                {"key": "hours", "type": "field", "dataType": "integer"},
            ]},
            {"key": "consent", "type": "field", "dataType": "boolean"},
        ],
        "migrations": {"from": {"1.0.0": {
            "fieldMap": [
                {"source": "name", "target": "fullName", "transform": "preserve"},
                {"source": "employer", "target": "jobs[0].employer", "transform": "preserve"},
                {"source": "hours", "target": "jobs[0].hours", "transform": "expression", "expression": "floor($)"},
                {"source": "severance", "target": None, "transform": "drop"},
            ],
            "defaults": {"consent": False},
        }}},
    }
    out = apply_migrations_to_response_data(
        definition,
        {"name": "Ada", "employer": "ACME", "hours": 7.5, "severance": "yes", "email": "ada@example.com"},
        "1.0.0",
        now_iso="2020-01-01T00:00:00Z",
    )
    assert out == {"fullName": "Ada", "jobs": [{"employer": "ACME", "hours": 7}], "consent": False}


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


_ITEM_TEXT_DEFINITION = {
    "$formspec": "1.0",
    "url": "urn:test:item-text",
    "version": "1.0.0",
    "title": "Item text",
    "items": [
        {
            "key": "qty",
            "type": "field",
            "dataType": "integer",
            "label": "Qty {{$qty}}",
            "labels": {"short": "Q{{$qty}}"},
            "hint": "Up to {{$qty}}",
            "description": "Ordered {{$qty}}",
        }
    ],
}


def test_evaluate_definition_resolves_item_text_on_request():
    """Core §4.2.1: `context.itemText` asks for resolved Item text; without it nothing is resolved."""
    plain = evaluate_definition(_ITEM_TEXT_DEFINITION, {"qty": 2})
    assert plain.item_text == {}

    result = evaluate_definition(
        _ITEM_TEXT_DEFINITION, {"qty": 2}, context={"itemText": {}}
    )
    assert result.item_text["qty"] == {
        "label": "Qty 2",
        "labels": {"short": "Q2"},
        "description": "Ordered 2",
        "hint": "Up to 2",
    }


def test_evaluate_definition_item_text_prefers_locale_strings():
    """Locale §3.1.1: a Locale string wins over the Definition's inline text, then interpolates."""
    result = evaluate_definition(
        _ITEM_TEXT_DEFINITION,
        {"qty": 2},
        context={"itemText": {"localeStrings": {"qty.label": "Quantité {{$qty}}"}}},
    )
    assert result.item_text["qty"]["label"] == "Quantité 2"


def test_evaluate_definition_item_text_resolves_context_hint_and_description():
    """Locale §3.1.2: `@context` applies to hint and description, not just label."""
    result = evaluate_definition(
        _ITEM_TEXT_DEFINITION,
        {"qty": 2},
        context={
            "itemText": {
                "localeStrings": {
                    "qty.label@short": "Q{{$qty}}",
                    "qty.hint@short": "Max {{$qty}}",
                    "qty.description@short": "Ordre {{$qty}}",
                }
            }
        },
    )
    assert result.item_text["qty"]["labels"] == {"short": "Q2"}
    assert result.item_text["qty"]["hints"] == {"short": "Max 2"}
    assert result.item_text["qty"]["descriptions"] == {"short": "Ordre 2"}
    # The context-less resolution still falls back to the Definition's inline text.
    assert result.item_text["qty"]["hint"] == "Up to 2"
