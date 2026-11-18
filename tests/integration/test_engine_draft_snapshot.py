"""The exact editable draft fixture can be evaluated through the Python batch API."""

from decimal import Decimal
from pathlib import Path

from formspec import evaluate_definition
from formspec.json import loads


def test_evaluate_draft_data_keeps_exact_input_and_resolves_empty_repeat_rows():
    fixture_path = Path(__file__).parents[1] / "fixtures" / "engine-draft-snapshot.json"
    fixture = loads(fixture_path.read_text(encoding="utf-8"))
    definition, draft = fixture["definition"], fixture["snapshot"]
    data = draft["data"]

    hidden = evaluate_definition(definition, data, mode="submit")
    assert hidden.data == {"show": False}
    assert set(hidden.non_relevant) >= {"amount", "entries"}
    assert data["amount"] == Decimal("0.3333333333333333333333333333")

    visible = evaluate_definition(definition, {**data, "show": True}, mode="submit")
    assert visible.valid
    assert visible.data == {**data, "show": True}
