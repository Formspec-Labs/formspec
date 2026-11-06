"""Read and write Formspec JSON without rounding Decimal values or quoting numbers."""

import json as _json
import math
from decimal import Decimal

import msgspec

_encoder = msgspec.json.Encoder(decimal_format="number")


def _check_finite(value):
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("JSON numbers must be finite")
    if isinstance(value, Decimal) and not value.is_finite():
        raise ValueError("JSON numbers must be finite")
    if isinstance(value, dict):
        for key, child in value.items():
            if not isinstance(key, str):
                raise TypeError("JSON object keys must be strings")
            _check_finite(child)
    elif isinstance(value, (list, tuple)):
        for child in value:
            _check_finite(child)
    elif value is not None and not isinstance(value, (str, bool, int, float, Decimal)):
        raise TypeError(f"Expected JSON-compatible value, got {type(value).__name__}")


def dumps(value, *, indent=None):
    """Encode Decimal as an unquoted JSON number; reject nonfinite numbers."""
    _check_finite(value)
    encoded = _encoder.encode(value)
    if indent is not None:
        encoded = msgspec.json.format(encoded, indent=indent)
    return encoded.decode("utf-8")


def _reject_constant(value):
    raise ValueError(f"Invalid JSON number: {value}")


def loads(value):
    """Decode fractional JSON numbers as Decimal and integer tokens as int."""
    return _json.loads(value, parse_float=Decimal, parse_constant=_reject_constant)
