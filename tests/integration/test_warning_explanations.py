"""Check the public Python evaluator against the shared workshop filing."""

import json
from pathlib import Path

import pytest

from formspec import assemble_candidate_json, evaluate_definition, evaluate_filed


def test_python_recomputes_group_and_instance_bases():
    fixtures = Path(__file__).parents[1] / "conformance/fixtures/explanations"
    definition = json.loads((fixtures / "first-slice.definition.json").read_text())
    entries = json.loads((fixtures / "first-slice.entries.json").read_text())["entries"]
    saved = [entries["originalGroup"], entries["valueExplanation"]]
    data = {"partner": "Library", "attendance": 125}

    report = evaluate_definition(
        definition, data, mode="submit", registry_documents=[], context={"explanations": saved}
    )
    assert report.valid
    assert report.candidate_explanations == saved
    assert [
        row["basis"] for row in report.explanation_findings if row["mode"] == "explain"
    ] == [saved[1]["basis"]]
    assert {
        row["groupBasis"] for row in report.explanation_findings if row["mode"] == "acknowledge"
    } == {saved[0]["basis"]}

    data = {"venue": "Hall", "attendance": 125}
    changed = evaluate_definition(
        definition, data, mode="submit", registry_documents=[], context={"explanations": saved}
    )
    assert not changed.valid
    errors = [row for row in changed.results if row["severity"] == "error"]
    assert [(row["path"], row["code"], row["context"]) for row in errors] == [
        ("#", "EXPLANATION_STALE", {"code": "WORKSHOP_NOT_ANSWERED"})
    ]


def test_warning_with_blank_dynamic_instance_can_be_answered():
    definition = {
        "$formspec": "1.0",
        "id": "dynamic-instance",
        "version": "1.0.0",
        "title": "Dynamic",
        "warningExplanation": "explain",
        "items": [{"key": "source", "type": "field", "dataType": "string", "label": "Source"}],
        "shapes": [
            {
                "id": "checkDynamic",
                "target": "source",
                "severity": "warning",
                "timing": "submit",
                "code": "MISSING_SOURCE",
                "constraint": "present(instance($source))",
                "message": "Pick a valid source.",
            }
        ],
    }
    report = evaluate_definition(definition, {}, mode="submit", registry_documents=[])
    codes = [row["code"] for row in report.results]
    assert "CONSTRAINT_PARSE_ERROR" not in codes
    assert "EXPLANATION_REQUIRED" in codes
    assert len(report.explanation_findings) == 1


def test_rust_assembly_prunes_unused_entry_without_response_instances():
    fixtures = Path(__file__).parents[1] / "conformance/fixtures/explanations"
    definition = json.loads((fixtures / "first-slice.definition.json").read_text())
    entries = json.loads((fixtures / "first-slice.entries.json").read_text())["entries"]
    unused = {**entries["valueExplanation"], "shapeId": "resolvedWarning"}
    saved = [entries["originalGroup"], entries["valueExplanation"]]
    draft = {
        "id": "r1",
        "definitionUrl": definition["url"],
        "definitionVersion": definition["version"],
        "status": "completed",
        "data": {"partner": "Library", "attendance": 125},
        "explanations": [unused, *saved],
    }
    report = evaluate_definition(
        definition,
        draft["data"],
        mode="submit",
        registry_documents=[],
        context={"explanations": draft["explanations"]},
    )
    assert report.valid
    eval_json = json.dumps({"candidateExplanations": report.candidate_explanations})
    assembled = assemble_candidate_json(
        json.dumps(definition),
        json.dumps(draft),
        eval_json,
        "{}",
    )
    assert json.loads(assembled)["explanations"] == saved
    assert (
        assemble_candidate_json(json.dumps(definition), assembled, eval_json, "{}")
        == assembled
    )


def _evaluate_reads_probe(constraint: str, instance_payload: dict) -> dict:
    definition = {
        "$formspec": "1.0",
        "url": "urn:review:reads",
        "version": "1.0.0",
        "title": "Review",
        "warningExplanation": "confirm",
        "items": [
            {
                "type": "group",
                "key": "rows",
                "repeatable": True,
                "children": [{"type": "field", "key": "src", "dataType": "string"}],
            },
            {"type": "field", "key": "selection", "dataType": "string"},
        ],
        "shapes": [
            {
                "id": "warn",
                "target": "#",
                "severity": "warning",
                "timing": "submit",
                "constraint": constraint,
                "message": "Review",
            }
        ],
        "instances": {"prior": {"data": instance_payload}},
    }
    report = evaluate_filed(
        definition,
        {"rows": [{"src": "prior"}], "selection": "x"},
        registry_documents=[],
        instances={"prior": instance_payload},
    )
    assert [v["code"] for v in report.results if v["severity"] == "error"] == [
        "EXPLANATION_REQUIRED"
    ], report.results
    return report.explanation_findings[0]


def test_parenthesized_predicate_element_and_keyed_lookup_and_zero_index_probes():
    direct = _evaluate_reads_probe("every($rows, instance($.src).v > 9)", {"v": 1})
    paren_one = _evaluate_reads_probe("every($rows, instance(($).src).v > 9)", {"v": 1})
    paren_two = _evaluate_reads_probe("every($rows, instance(($).src).v > 9)", {"v": 2})
    assert direct["inputs"] == paren_one["inputs"]
    assert paren_one["basis"] != paren_two["basis"]

    lookup_expr = "instance('prior').rows[id = $selection].label == 'future'"
    lookup_one = _evaluate_reads_probe(
        lookup_expr, {"rows": [{"id": "x", "label": "current", "count": 1}]}
    )
    lookup_two = _evaluate_reads_probe(
        lookup_expr, {"rows": [{"id": "x", "label": "current", "count": 2}]}
    )
    assert '@instance("prior").rows' in lookup_one["inputs"]
    assert lookup_one["basis"] != lookup_two["basis"]

    zero_idx = _evaluate_reads_probe("false and present($rows[0].src)", {})
    assert zero_idx["shapeId"] == "warn"


@pytest.mark.parametrize("settled", [None, {}, {"candidateExplanations": None}])
def test_rust_assembly_refuses_omitted_settled_evidence_when_explanations_present(settled):
    fixtures = Path(__file__).parents[1] / "conformance/fixtures/explanations"
    definition = json.loads((fixtures / "first-slice.definition.json").read_text())
    entries = json.loads((fixtures / "first-slice.entries.json").read_text())["entries"]
    retired = {**entries["valueExplanation"], "shapeId": "retired"}
    with pytest.raises((ValueError, RuntimeError)):
        assemble_candidate_json(
            json.dumps(definition),
            json.dumps({"data": {"partner": "Library", "attendance": 125}, "explanations": [retired]}),
            json.dumps(settled),
            "{}",
        )


def test_basis_vector_definitions_pass_schema_before_evaluation():
    from jsonschema import Draft202012Validator, FormatChecker
    from referencing import Registry, Resource

    repo = Path(__file__).parents[2]
    vectors = json.loads(
        (repo / "tests/conformance/fixtures/explanations/basis-vectors.json").read_text()
    )
    schemas = {
        name: json.loads((repo / f"schemas/{name}.schema.json").read_text())
        for name in ("common", "definition", "locale", "component")
    }
    registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema)) for schema in schemas.values()
    )
    validator = Draft202012Validator(
        schemas["definition"], registry=registry, format_checker=FormatChecker()
    )
    for case in vectors["evaluatedCases"]:
        errors = [
            (err.json_path, err.message)
            for err in validator.iter_errors(case["definition"])
        ]
        assert not errors, f"{case['name']}: {errors}"
        report = evaluate_definition(
            case["definition"],
            case["data"],
            mode="submit",
            registry_documents=[],
        )
        assert len(report.explanation_findings) == 1, (
            case["name"],
            report.explanation_findings,
            report.results,
        )
        finding = report.explanation_findings[0]
        expected = case["expectedInstance"]
        assert finding["shapeId"] == expected["input"]["shapeId"], case["name"]
        assert finding["path"] == expected["input"]["path"], case["name"]
        assert finding["basis"] == expected["digest"], case["name"]
        assert [[k, v] for k, v in sorted(finding["inputs"].items())] == expected["input"][
            "inputs"
        ], case["name"]
    by_name = {c["name"]: c["expectedInstance"]["digest"] for c in vectors["evaluatedCases"]}
    assert by_name["shiftedRepeatRowBefore"] != by_name["shiftedRepeatRowAfter"]
