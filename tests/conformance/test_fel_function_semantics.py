import json
from pathlib import Path

from formspec.fel import evaluate
from formspec.fel.types import to_python


def _fixture():
    root = Path(__file__).resolve().parents[1]
    return json.loads((root / "conformance" / "fel-function-semantics.json").read_text())


def test_fel_function_semantics_fixture():
    for case in _fixture():
        result = evaluate(case["expr"], case.get("data", {}))
        assert to_python(result.value) == case["expected_value"], case["id"]
        codes = [getattr(d, "code", None) for d in result.diagnostics]
        codes = [c for c in codes if c]
        assert codes == case.get("expected_diagnostic_codes", []), case["id"]
