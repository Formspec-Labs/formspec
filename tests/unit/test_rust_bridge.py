"""Tests for the _rust bridge module — verifies Python↔Rust boundary."""

import inspect
import json
from decimal import Decimal
from pathlib import Path

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


def test_evaluate_definition_preserves_response_subject_keys():
    definition = {
        "subject": {
            "type": "urn:example:agency-year",
            "keys": {"uei": {"dataType": "string"}, "serial": {"dataType": "integer"}},
        },
        "items": [
            {"key": "uei", "type": "field", "dataType": "string"},
            {"key": "year", "type": "field", "dataType": "integer"},
        ],
        "binds": [
            {"path": "uei", "calculate": "subject('uei')"},
            {"path": "year", "calculate": "subject('serial')"},
        ],
    }
    subject = {"type": "urn:example:agency-year", "keys": {"uei": "00123", "serial": 9007199254740991}}
    result = evaluate_definition(
        definition, {}, context={"subjectType": subject["type"], "subjectKeys": subject["keys"]}
    )
    assert result.data == {"uei": "00123", "year": 9007199254740991}
    assert type(result.data["year"]) is int
    assert result.diagnostics == []

    refused = evaluate_definition(
        definition, {}, context={"subjectType": subject["type"], "subjectKeys": {"uei": False, "serial": "2026"}}
    )
    assert refused.data == {}
    assert [(v["path"], v["code"], v["message"]) for v in refused.results] == [
        ("#subjectKeys.serial", "TYPE_MISMATCH", "Subject key must be an integer")
    ]

    for serial in [9007199254740993, -9007199254740992]:
        refused = evaluate_definition(
            definition, {}, context={"subjectType": subject["type"], "subjectKeys": {"uei": "00123", "serial": serial}}
        )
        assert refused.data == {}
        assert [(v["path"], v["code"], v["message"]) for v in refused.results] == [
            ("#subjectKeys.serial", "TYPE_MISMATCH", "Integer subject key must be in the I-JSON range")
        ]


def test_formspec_rust_exports_expected_contract():
    # Version 2 requires the receiving Definition and binding for projection checks.
    assert getattr(formspec_rust, "PY_API_VERSION", None) == 2

    signature = inspect.signature(formspec_rust.evaluate_def)
    assert list(signature.parameters.keys()) == [
        "definition",
        "data",
        "trigger",
        "registry_documents",
        "instances",
        "context",
        "extension_functions",
        "settle",
    ]
    assert signature.parameters["settle"].kind is inspect.Parameter.KEYWORD_ONLY
    assert signature.parameters["settle"].default is False

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


def test_check_instance_projection_reports_consumer_subject_key_type():
    instance = {
        "response": {
            "definition": {"url": "urn:example:report"},
            "subject": [{"key": "year", "op": "eq", "from": {"subject": "period"}}],
            "status": "completed",
            "cardinality": "latest",
            "pin": "none",
        },
        "schema": {},
    }
    upstream = {
        "url": "urn:example:report",
        "version": "1.0.0",
        "items": [
            {"type": "field", "key": "rate", "dataType": "decimal", "initialValue": Decimal("0.1")}
        ],
        "subject": {
            "type": "urn:example:annual-report",
            "keys": {"year": {"dataType": "integer"}},
        },
    }
    consumer_subject = {
        "type": "urn:example:program-period",
        "keys": {"period": {"dataType": "string"}},
    }
    consumer = {"kind": "instance", "name": "prior", "definition": {"subject": consumer_subject}}
    findings = formspec_rust.check_instance_projection(instance, consumer, [upstream])
    assert len(findings) == 1
    assert findings[0]["code"] == "INSTANCE-PROJECTION-SUBJECT-KEY-TYPE-MISMATCH"
    assert findings[0]["jsonPointer"] == "/response/subject/0/from/subject"
    assert findings[0]["upstreamVersion"] == "1.0.0"

    with pytest.raises(TypeError):
        formspec_rust.check_instance_projection(instance, upstream_definitions=[upstream])

    instance["response"]["definition"]["compatibleVersions"] = "^2.0.0"
    findings = formspec_rust.check_instance_projection(instance, consumer, [upstream])
    assert len(findings) == 1
    assert findings[0]["code"] == "INSTANCE-PROJECTION-NO-ELIGIBLE-VERSION"
    assert findings[0]["upstreamVersion"] is None


def test_projection_reports_changed_choice_values_from_native_checker():
    item = {
        "key": "stage", "type": "field", "dataType": "choice",
        "options": [{"value": "open", "label": "Open"}],
    }
    source = {"response": {"definition": {"url": "urn:example:stages"}}, "schema": {"stage": "choice"}}
    consumer = {
        "kind": "instance", "name": "prior", "definition": {"items": [
            {**item, "initialValue": "=@instance('prior').stage"}
        ]},
    }
    upstream = {
        "url": "urn:example:stages", "version": "1", "subject": {"type": "urn:example:case", "keys": {}},
        "items": [{**item, "options": [{"value": "opened", "label": "Open"}]}],
    }
    findings = formspec_rust.check_instance_projection(source, consumer, [upstream])
    assert [(row["code"], row["jsonPointer"], row["upstreamVersion"]) for row in findings] == [
        ("INSTANCE-PROJECTION-OPTION-VALUES-MISMATCH", "/schema/stage", "1")
    ]


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


def test_evaluate_diagnostic_span_repeated_binary_division_by_zero():
    """fs-ign8: division by zero in compound expr points to failing operator, not earlier valid operator."""
    result = evaluate("10 / 2 + 50 / 0")
    assert len(result.diagnostics) == 1
    diag = result.diagnostics[0]
    assert diag.message == "division by zero"
    assert diag.pos is not None
    assert diag.pos.line == 1
    assert diag.pos.col == 13
    assert diag.pos.offset == 12


def test_evaluate_diagnostic_span_cannot_apply_operator_extraction():
    """fs-ign8: cannot apply '+' extracts operator and points accurately to failing token."""
    result = evaluate("1 + 2 + ('abc' + 3)")
    assert len(result.diagnostics) == 1
    diag = result.diagnostics[0]
    assert "cannot apply '+'" in diag.message
    assert diag.pos is not None
    assert diag.pos.line == 1
    assert diag.pos.col == 16
    assert diag.pos.offset == 15


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


def test_evaluate_filed_settles_relevance_chain():
    from formspec import evaluate_filed

    suite = Path(__file__).parents[1] / "conformance/suite"
    case = json.loads((suite / "parity-nrb-relevance-chain.json").read_text())
    definition = json.loads((suite.parents[2] / case["definitionPath"]).read_text())
    data = case["inputData"]

    assert evaluate_definition(definition, data, mode="submit").data == {"y": 6, "z": 7}
    filed = evaluate_filed(definition, data)
    assert filed.valid
    assert filed.data == case["expected"]["data"]
    assert evaluate_definition(definition, filed.data, mode="submit") == filed


def test_evaluate_filed_keeps_a_refusal_for_ambiguous_data():
    from formspec import evaluate_filed

    definition = {
        "items": [{
            "type": "group", "key": "g",
            "children": [{"type": "field", "key": "x", "dataType": "integer"}],
        }],
    }
    result = evaluate_filed(definition, {"g": {"x": 1}, "g.x": 2})
    assert not result.valid
    assert result.data == {}
    assert [finding["code"] for finding in result.results] == ["TYPE_MISMATCH"]


def test_evaluate_filed_refuses_non_convergence():
    from formspec import evaluate_filed

    next_value = iter(range(100))
    definition = {
        "items": [{"type": "field", "key": "x", "dataType": "integer"}],
        "binds": [{"path": "x", "calculate": "unstableTestValue()"}],
    }
    with pytest.raises(ValueError, match="did not converge"):
        evaluate_filed(
            definition,
            {},
            extension_functions={"unstableTestValue": lambda: next(next_value)},
        )


def test_evaluate_filed_reads_settled_calculation_for_relevance():
    from formspec import evaluate_filed

    definition = {
        "items": [{"type": "field", "key": "x", "dataType": "integer"}],
        "binds": [{"path": "x", "relevant": "not(present($x))", "calculate": "1"}],
    }
    # This used to oscillate because relevance read x before the calculation wrote it.
    assert evaluate_definition(definition, {}, mode="submit").data == {}
    assert evaluate_definition(definition, {"x": 1}, mode="submit").data == {}
    assert evaluate_filed(definition, {}).data == {}


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


def test_evaluate_definition_without_extension_refuses_rebuild():
    """Core §3.10.1: an unregistered extension call stays a definition error."""
    result = evaluate_definition(_EXTENSION_DEFINITION, {"qty": 3})
    assert result.refused
    # Both calls are checked at Rebuild, including the calculate call.
    assert [r["code"] for r in result.results] == ["UNDEFINED_FUNCTION"] * 2


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


def test_diagnostics_follow_up_refuses_unknown_and_wrong_arity_before_running_extensions():
    invoked = []

    def called(value, extra):
        invoked.append((value, extra))
        return value

    definition = {
        "items": [{"key": "result", "type": "field", "dataType": "integer"}],
        "binds": [{"path": "result", "calculate": "called(5)"}],
    }
    for extensions, code in [({}, "UNDEFINED_FUNCTION"), ({"called": called}, "ARITY_MISMATCH")]:
        result = evaluate_definition(definition, {}, extension_functions=extensions)
        assert result.data == {}
        assert [(v["path"], v["code"]) for v in result.results] == [
            ("$.binds[0].calculate", code),
        ]
        assert result.diagnostics == []
    assert invoked == []


def test_settled_expression_diagnostics_reach_the_python_bridge():
    fixtures = Path(__file__).resolve().parents[1] / "conformance" / "suite"
    definition = json.loads(
        (fixtures / "fixtures" / "parity-settled-fel-diagnostics.definition.json").read_text()
    )
    expected = json.loads((fixtures / "parity-settled-fel-diagnostics.json").read_text())["expected"]
    default = "sum([79228162514264337593543950335, 6])"
    definition["binds"][0]["default"] = f"={default}"
    result = evaluate_definition(definition, {}, context={"previousNonRelevant": ["amount"]})
    actual = [
        {key: d[key] for key in ("path", "expression", "code", "shapeId") if key in d}
        for d in result.diagnostics
    ]
    assert sorted(actual, key=lambda d: d["expression"]) == [
        *expected["diagnostics"],
        {"path": "amount", "expression": default, "code": "FEL_ARITHMETIC_OVERFLOW"},
    ]


def test_extension_registration_requires_a_positional_signature():
    class Opaque:
        __signature__ = "unavailable"

        def __call__(self, value):
            return value

    with pytest.raises(TypeError, match="positional signature"):
        evaluate_definition(
            _EXTENSION_DEFINITION, {"qty": 3}, extension_functions={"double": Opaque()}
        )
