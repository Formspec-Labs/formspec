"""FEL error hierarchy and diagnostics — SourcePos-tagged exceptions and non-fatal warnings.

Three exception tiers: FelSyntaxError (parse), FelDefinitionError (load), FelEvaluationError (runtime).
Diagnostic is a non-fatal record collected during evaluation without halting it.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


@dataclass(frozen=True)
class SourcePos:
    """Character position in FEL source text (offset, line, col) for error location reporting."""
    offset: int
    line: int
    col: int

    def __str__(self) -> str:
        return f"{self.line}:{self.col}"


class Severity(Enum):
    """Diagnostic severity — ERROR halts nothing but signals a problem; WARNING is advisory."""
    ERROR = "error"
    WARNING = "warning"


@dataclass(frozen=True)
class Diagnostic:
    """Non-fatal issue collected during evaluation — returned alongside the result in EvalResult."""
    message: str
    pos: SourcePos | None
    severity: Severity = Severity.ERROR
    code: str | None = None

    def __str__(self) -> str:
        loc = f" at {self.pos}" if self.pos else ""
        return f"[{self.severity.value}]{loc}: {self.message}"


class FelError(Exception):
    """Base exception for all FEL errors — carries an optional SourcePos for location reporting."""
    def __init__(self, message: str, pos: SourcePos | None = None):
        self.pos = pos
        loc = f" at {pos}" if pos else ""
        super().__init__(f"{message}{loc}")


class FelSyntaxError(FelError):
    """Parse-time error — unterminated strings, invalid literals, unexpected tokens."""
    pass


class FelDefinitionError(FelError):
    """Load-time structural error — dependency cycles, unknown functions, arity mismatches."""
    pass


class FelEvaluationError(FelError):
    """Runtime evaluation error — type mismatches, division by zero, index out of bounds."""
    pass
