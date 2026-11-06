"""Exact number transport through Python's public and native engine boundaries."""
from decimal import Decimal

import pytest

from formspec import _native
from formspec._rust import evaluate_definition
from formspec.json import dumps, loads

THIRD = "0.3333333333333333333333333333"


def definition(expression="$input / 3", data_type="decimal"):
    return {
        "$formspec": "1.0", "url": "urn:test:exact-python", "version": "1.0.0",
        "items": [
            {"key": "input", "type": "field", "dataType": "decimal"},
            {"key": "result", "type": "field", "dataType": data_type},
        ],
        "binds": [{"path": "result", "calculate": expression}],
    }


def test_exact_numeric_output_and_reload():
    result = _native.evaluate_def(definition(), {"input": 1})
    assert result["data"]["result"] == Decimal(THIRD)
    assert result["validations"] == []
    assert f'"result":{THIRD}' in dumps(result)
    data = loads(dumps(result["data"]))
    assert _native.evaluate_def(definition(), data)["data"] == data
    assert _native.eval_fel("$n * 3", {"n": Decimal(THIRD)}) == Decimal("0.9999999999999999999999999999")
    public = evaluate_definition(definition(), {"input": 1})
    assert public.valid
    assert public.data["result"] == Decimal(THIRD)
    assert f'"result":{THIRD}' in dumps(public.data)


@pytest.mark.parametrize("amount", [Decimal(THIRD), 18446744073709551616])
def test_extension_callbacks_keep_exact_scalars_and_money(amount):
    result = _native.evaluate_def(definition("identity($input)"), {"input": amount},
        extension_functions={"identity": lambda value: value})
    assert result["data"]["result"] == amount
    result = _native.evaluate_def(definition("payment($input)", "money"), {"input": amount},
        extension_functions={"payment": lambda value: {"amount": value, "currency": "USD"}})
    assert result["data"]["result"] == {"amount": str(amount), "currency": "USD"}
    assert result["validations"] == []


@pytest.mark.parametrize("token", ["1e-100", "1e100", "0.123456789012345678901234567891"])
def test_unrepresentable_values_are_refused_without_successful_null(token):
    result = _native.evaluate_def(definition(), {"input": Decimal(token)})
    assert result["data"] == {}
    assert any(v["code"] == "TYPE_MISMATCH" for v in result["validations"])


@pytest.mark.parametrize("value", [float("nan"), float("inf"), Decimal("NaN"), Decimal("Infinity")])
def test_writer_refuses_nonfinite_numbers(value):
    with pytest.raises(ValueError, match="finite"):
        dumps({"value": value})


def test_writer_and_reader_keep_json_kinds():
    value = {"number": Decimal(THIRD), "text": THIRD,
        "lookalike": {"$type": "number", "value": THIRD}}
    assert loads(dumps(value)) == value
    assert f'"number":{THIRD}' in dumps(value)
    assert f'"text":"{THIRD}"' in dumps(value)


def test_writer_refuses_non_json_values_instead_of_converting_their_type():
    from datetime import date

    for value in [date(2026, 11, 6), {1, 2}, {1: "not a string key"}]:
        with pytest.raises(TypeError):
            dumps(value)
