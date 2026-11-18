"""Public FEL runtime API for Python — Rust-backed via formspec_rust."""

from __future__ import annotations

import importlib as _importlib

# Eagerly import leaf modules that have no circular dependencies
from .errors import (
    Diagnostic,
    FelDefinitionError,
    FelError,
    FelEvaluationError,
    FelSyntaxError,
    Severity,
    SourcePos,
)
from .keywords import RESERVED_WORDS
from .types import (
    FelArray,
    FelBoolean,
    FelDate,
    FelFalse,
    FelMoney,
    FelNull,
    FelNumber,
    FelObject,
    FelString,
    FelTrue,
    FelValue,
    fel_bool,
    from_python,
    is_null,
    to_python,
    typeof,
)

__version__ = "1.0.0"

# Names that come from _rust — lazily resolved to break the circular import
_RUST_NAMES = frozenset({
    "BUILTIN_NAMES",
    "DependencySet",
    "EvalResult",
    "ParsedExpression",
    "builtin_function_catalog",
    "definition_instance_reads",
    "evaluate",
    "extract_dependencies",
    "parse",
})


def __getattr__(name):
    if name in _RUST_NAMES:
        _rust = _importlib.import_module("formspec._rust")
        val = getattr(_rust, name)
        globals()[name] = val
        return val
    raise AttributeError(f"module 'formspec.fel' has no attribute {name!r}")


__all__ = [
    "BUILTIN_NAMES",
    "DependencySet",
    "Diagnostic",
    "EvalResult",
    "FelArray",
    "FelBoolean",
    "FelDate",
    "FelDefinitionError",
    "FelError",
    "FelEvaluationError",
    "FelFalse",
    "FelMoney",
    "FelNull",
    "FelNumber",
    "FelObject",
    "FelString",
    "FelSyntaxError",
    "FelTrue",
    "FelValue",
    "ParsedExpression",
    "RESERVED_WORDS",
    "Severity",
    "SourcePos",
    "builtin_function_catalog",
    "definition_instance_reads",
    "evaluate",
    "extract_dependencies",
    "fel_bool",
    "from_python",
    "is_null",
    "parse",
    "to_python",
    "typeof",
]
