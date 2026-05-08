"""Respondent Ledger semantic validation helpers."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def validate_response_correction_event_semantics(event: Mapping[str, Any]) -> list[str]:
    """Return semantic diagnostics for a ResponseCorrection ledger event.

    JSON Schema validates the shape. This helper enforces cross-field rules that
    require comparing values across arrays.
    """
    if event.get("eventType") != "response.correction-recorded":
        return []

    data = event.get("data")
    if not isinstance(data, Mapping):
        return ["response.correction-recorded requires object data"]

    corrected_field_set = data.get("correctedFieldSet")
    field_values = data.get("fieldValues")
    if not isinstance(corrected_field_set, list) or not isinstance(field_values, list):
        return []

    declared_paths = {path for path in corrected_field_set if isinstance(path, str)}
    diagnostics: list[str] = []
    for index, row in enumerate(field_values):
        if not isinstance(row, Mapping):
            continue
        path = row.get("path")
        if isinstance(path, str) and path not in declared_paths:
            diagnostics.append(
                "response.correction-recorded data.fieldValues"
                f"[{index}].path is not declared in correctedFieldSet"
            )
    return diagnostics
