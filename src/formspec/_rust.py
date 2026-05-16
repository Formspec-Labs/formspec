"""Thin wrappers over formspec_rust (PyO3) — the only Rust bridge in the package."""

from __future__ import annotations

from datetime import date, datetime
import inspect
import sys

import msgspec
from formspec import _native as formspec_rust  # noqa: E402 — maturin-built extension

# Direct leaf imports — bypass fel/__init__.py to avoid circular import
# (formspec.__init__ → _rust → fel.__init__ → _rust would deadlock)
from formspec.fel.errors import Diagnostic, FelSyntaxError, Severity  # noqa: E402
from formspec.fel.types import (  # noqa: E402
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
    fel_decimal,
    from_python,
    is_null,
    to_python,
)

EXPECTED_PY_API_VERSION = 1
_REQUIRED_EXPORTS = (
    "eval_fel_detailed",
    "extract_deps",
    "detect_type",
    "lint_document",
    "evaluate_def",
    "evaluate_screener_document_py",
    "execute_mapping_doc",
    "generate_changelog",
    "apply_migrations_to_response_data",
    "rewrite_fel_for_assembly",
)


def _assert_rust_extension_contract() -> None:
    api_version = getattr(formspec_rust, "PY_API_VERSION", None)
    crate_version = getattr(formspec_rust, "CRATE_VERSION", "<unknown>")
    module_file = getattr(formspec_rust, "__file__", "<unknown>")
    env_hint = (
        f"python={sys.executable}; "
        f"formspec_rust={module_file}; "
        f"crate_version={crate_version}"
    )
    if api_version != EXPECTED_PY_API_VERSION:
        raise ImportError(
            "formspec_rust is incompatible with src/formspec/_rust.py: "
            f"expected PY_API_VERSION={EXPECTED_PY_API_VERSION}, got {api_version!r} "
            f"({env_hint}). "
            "Reinstall the local extension with: python3 -m pip install --no-build-isolation ./crates/formspec-py"
        )

    missing = [name for name in _REQUIRED_EXPORTS if not hasattr(formspec_rust, name)]
    if missing:
        raise ImportError(
            "formspec_rust is missing required exports: "
            + ", ".join(sorted(missing))
            + f" ({env_hint}). "
            + "Reinstall the local extension with: python3 -m pip install --no-build-isolation ./crates/formspec-py"
        )

    try:
        signature = inspect.signature(formspec_rust.evaluate_def)
    except (TypeError, ValueError) as exc:
        raise ImportError(
            "formspec_rust.evaluate_def signature could not be inspected; "
            "the installed extension may be stale. "
            f"({env_hint}). "
            "Reinstall the local extension with: python3 -m pip install --no-build-isolation ./crates/formspec-py"
        ) from exc

    expected_params = [
        "definition",
        "data",
        "trigger",
        "registry_documents",
        "instances",
        "context",
    ]
    actual_params = list(signature.parameters.keys())
    if actual_params != expected_params:
        raise ImportError(
            "formspec_rust.evaluate_def has an incompatible signature: "
            f"expected {expected_params}, got {actual_params} ({env_hint}). "
            "Reinstall the local extension with: python3 -m pip install --no-build-isolation ./crates/formspec-py"
        )


_assert_rust_extension_contract()


# ── Result types ─────────────────────────────────────────────────


class ProcessingResult(msgspec.Struct, frozen=True):
    """Output of evaluate_definition()."""
    valid: bool
    results: list[dict]
    data: dict
    variables: dict
    non_relevant: list[str]


class MappingDiagnostic(msgspec.Struct, frozen=True):
    rule_index: int
    source_path: str | None
    target_path: str
    message: str


class MappingResult(msgspec.Struct, frozen=True):
    direction: str
    output: dict
    rules_applied: int
    diagnostics: list[MappingDiagnostic]


class LintDiagnostic(msgspec.Struct, frozen=True):
    code: str
    severity: str
    path: str
    message: str
    suggested_fix: str | None = None
    spec_ref: str | None = None


class RegistryInfo(msgspec.Struct, frozen=True):
    publisher: dict
    published: str
    entry_count: int
    validation_issues: list[str]


class ParsedExpression(msgspec.Struct, frozen=True):
    """Opaque syntax-validated handle — source only, no AST exposed."""
    source: str


class EvalResult(msgspec.Struct, frozen=True):
    # Note: EvalResult is constructed manually, NOT via msgspec.convert(),
    # because FelValue is a custom union type that msgspec cannot auto-hydrate.
    value: FelValue
    diagnostics: list[Diagnostic]


class DependencySet(msgspec.Struct, frozen=True):
    fields: set[str]
    instance_refs: set[str]
    context_refs: set[str]
    mip_deps: set[str]
    has_self_ref: bool
    has_wildcard: bool
    uses_prev_next: bool


# ── Private helpers ──────────────────────────────────────────────


def _severity_from_str(raw: str | None) -> Severity:
    if raw == "warning":
        return Severity.WARNING
    if raw == "info":
        return Severity.INFO
    return Severity.ERROR


def _deserialize_value(value: object) -> FelValue:
    """Convert Rust's tagged return value to a FEL type."""
    if isinstance(value, dict) and "__fel_type__" in value:
        tagged_type = value["__fel_type__"]
        if tagged_type == "number":
            return FelNumber(fel_decimal(value.get("value")))
        if tagged_type in {"date", "datetime"}:
            return from_python(_parse_iso_date_like(value.get("value")))
        if tagged_type == "money":
            return from_python(
                {"amount": value.get("amount"), "currency": value.get("currency")}
            )
    if isinstance(value, list):
        return from_python([to_python(_deserialize_value(item)) for item in value])
    if isinstance(value, dict):
        return from_python(
            {key: to_python(_deserialize_value(item)) for key, item in value.items()}
        )
    return from_python(value)


def _parse_iso_date_like(value: object) -> object:
    if not isinstance(value, str):
        return value
    if "T" in value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return value
    try:
        return date.fromisoformat(value)
    except ValueError:
        return value


def _normalize_context_ref(ref: str) -> str:
    bare = ref.lstrip("@")
    if "." in bare:
        return bare.split(".", 1)[0]
    return bare


def _normalize_diagnostic_message(message: str) -> str:
    if message.startswith("undefined function: "):
        return "Undefined function: " + message.split(": ", 1)[1]
    return message


def _serialize_value(value: object) -> object:
    """Convert FEL type to Python-native for Rust consumption."""
    if is_null(value) or isinstance(
        value,
        (FelNumber, FelString, FelBoolean, FelDate, FelArray, FelMoney, FelObject),
    ):
        return to_python(value)
    return value


def _serialize_mip_states(
    mip_states: dict[str, object] | None,
) -> dict[str, dict[str, bool]] | None:
    if mip_states is None:
        return None
    serialized: dict[str, dict[str, bool]] = {}
    for path, state in mip_states.items():
        if isinstance(state, dict):
            required_keys = {"valid", "relevant", "readonly", "required"}
            if not required_keys.issubset(set(state.keys())):
                missing = sorted(required_keys - set(state.keys()))
                raise TypeError(
                    f"mip_states[{path!r}] missing keys: {', '.join(missing)}"
                )
            serialized[path] = {
                "valid": bool(state["valid"]),
                "relevant": bool(state["relevant"]),
                "readonly": bool(state["readonly"]),
                "required": bool(state["required"]),
            }
        else:
            for attr in ("valid", "relevant", "readonly", "required"):
                if not hasattr(state, attr):
                    raise TypeError(f"mip_states[{path!r}] missing attribute: {attr}")
            serialized[path] = {
                "valid": bool(getattr(state, "valid")),
                "relevant": bool(getattr(state, "relevant")),
                "readonly": bool(getattr(state, "readonly")),
                "required": bool(getattr(state, "required")),
            }
    return serialized


def _serialize_variables(
    data: dict[str, object],
    variables: dict[str, FelValue] | None,
) -> dict[str, object] | None:
    serialized: dict[str, object] = {}
    if variables:
        serialized.update(
            {name: _serialize_value(value) for name, value in variables.items()}
        )
    for contextual_name in ("source", "target"):
        if contextual_name in data and contextual_name not in serialized:
            serialized[contextual_name] = data[contextual_name]
    return serialized or None


# ── FEL functions ────────────────────────────────────────────────


def parse(source: str) -> ParsedExpression:
    """Validate FEL syntax and return an opaque handle."""
    valid = formspec_rust.parse_fel(source)
    if not valid:
        raise FelSyntaxError(f"FEL parse error: {source!r}")
    return ParsedExpression(source=source)


def evaluate(
    source: str,
    data: dict | None = None,
    *,
    instances: dict[str, dict] | None = None,
    mip_states: dict[str, object] | None = None,
    extensions: dict[str, object] | None = None,
    variables: dict[str, FelValue] | None = None,
) -> EvalResult:
    """Evaluate a FEL expression through the Rust runtime."""
    if extensions:
        raise NotImplementedError(
            "Dynamic Python FEL extensions are no longer supported by the Rust runtime."
        )

    payload = formspec_rust.eval_fel_detailed(
        source,
        data or {},
        instances or None,
        _serialize_mip_states(mip_states),
        _serialize_variables(data or {}, variables),
        datetime.now().isoformat(timespec="seconds"),
    )
    value = _deserialize_value(payload.get("value"))
    diagnostics = [
        Diagnostic(
            message=_normalize_diagnostic_message(str(raw.get("message", ""))),
            pos=None,
            severity=_severity_from_str(raw.get("severity")),
            code=(str(raw.get("code")) if raw.get("code") is not None else None),
        )
        for raw in payload.get("diagnostics", [])
        if isinstance(raw, dict)
    ]
    return EvalResult(value=value, diagnostics=diagnostics)


def extract_dependencies(source: str) -> DependencySet:
    """Extract static dependencies from a FEL expression."""
    raw = formspec_rust.extract_deps(source)
    return DependencySet(
        fields={field.replace("[*]", "") for field in raw.get("fields", [])},
        instance_refs=set(raw.get("instance_refs", [])),
        context_refs={_normalize_context_ref(r) for r in raw.get("context_refs", [])},
        mip_deps=set(raw.get("mip_deps", [])),
        has_self_ref=bool(raw.get("has_self_ref", False)),
        has_wildcard=bool(raw.get("has_wildcard", False)),
        uses_prev_next=bool(raw.get("uses_prev_next", False)),
    )


def builtin_function_catalog() -> list[dict[str, str]]:
    """Return Rust-exported builtin function metadata."""
    return list(formspec_rust.list_builtin_functions())


BUILTIN_NAMES: frozenset[str] = frozenset(
    entry["name"] for entry in builtin_function_catalog()
)


# ── Linting ──────────────────────────────────────────────────────


def detect_document_type(document: dict) -> str | None:
    """Detect document type from a Formspec document dict."""
    return formspec_rust.detect_type(document)


def lint(
    document: dict,
    *,
    mode: str = "runtime",
    schema_only: bool = False,
    no_fel: bool = False,
    component_definition: dict | None = None,
    registry_documents: list[dict] | None = None,
) -> list[LintDiagnostic]:
    """Run the Rust linter on a Formspec document.

    Args:
        document: The Formspec document dict to lint.
        mode: Lint mode — "runtime" (default), "authoring", or "strict".
        schema_only: When True, run only schema-level validation (skip semantic passes).
        no_fel: When True, skip FEL expression passes.
        component_definition: Optional definition document for cross-artifact checks.
        registry_documents: Optional list of registry documents for extension resolution.
    """
    raw = formspec_rust.lint_document(
        document,
        mode=mode,
        registry_documents=registry_documents,
        definition_document=component_definition,
        schema_only=schema_only,
        no_fel=no_fel,
    )
    diagnostics = raw.get("diagnostics", [])
    return [
        LintDiagnostic(
            code=d.get("code", ""),
            severity=d.get("severity", "error"),
            path=d.get("path", ""),
            message=d.get("message", ""),
            suggested_fix=d.get("suggested_fix"),
            spec_ref=d.get("spec_ref"),
        )
        for d in diagnostics
    ]


# ── Evaluation ───────────────────────────────────────────────────


def evaluate_definition(
    definition: dict,
    data: dict,
    *,
    mode: str = "continuous",
    registry_documents: list[dict] | None = None,
    instances: dict[str, dict] | None = None,
    context: dict | None = None,
) -> ProcessingResult:
    """Evaluate a definition against data using the Rust batch evaluator.

    Args:
        definition: The Formspec definition dict.
        data: Field values dict.
        mode: Shape timing mode — "continuous" (default), "submit", or "disabled".
        registry_documents: Optional list of registry document dicts for extension
            constraint enforcement. Pass an empty list to disable registry loading.
        instances: Optional dict of named instance data for prePopulate seeding.
            Keys are instance names, values are dicts of field data.
        context: Optional evaluator context (e.g. now_iso, repeat_counts, previous_validations).
    """
    raw = formspec_rust.evaluate_def(
        definition, data, mode, registry_documents, instances, context
    )
    validations = raw.get("validations", [])
    is_valid = not any(v.get("severity") == "error" for v in validations)
    return ProcessingResult(
        valid=is_valid,
        results=validations,
        data=raw.get("values", {}),
        variables=raw.get("variables", {}),
        non_relevant=raw.get("nonRelevant", raw.get("non_relevant", [])),
    )


def evaluate_screener_document(
    screener_doc: dict,
    answers: dict,
    context: dict | None = None,
) -> dict:
    """Evaluate a standalone Screener Document against respondent inputs.

    Returns a Determination Record dict (always non-None).

    Args:
        screener_doc: The Screener Document (dict with $formspecScreener marker).
        answers: Flat dict of item key → value.
        context: Optional dict with ``answerStates`` and ``nowIso``.
    """
    return formspec_rust.evaluate_screener_document_py(screener_doc, answers, context)


# ── Mapping ──────────────────────────────────────────────────────


def execute_mapping(
    mapping_doc: dict,
    source: dict,
    direction: str = "forward",
) -> MappingResult:
    """Execute a mapping document against source data."""
    raw = formspec_rust.execute_mapping_doc(mapping_doc, source, direction)
    diags = [
        MappingDiagnostic(
            rule_index=d.get("rule_index", 0),
            source_path=d.get("source_path"),
            target_path=d.get("target_path", ""),
            message=d.get("message", ""),
        )
        for d in raw.get("diagnostics", [])
    ]
    # Raise on unmapped-error diagnostics (spec §4.6: unmapped:"error" is a hard failure)
    for d in diags:
        if "No value map entry" in d.message:
            raise ValueError(d.message)
    return MappingResult(
        direction=raw.get("direction", direction),
        output=raw.get("output", {}),
        rules_applied=raw.get("rules_applied", 0),
        diagnostics=diags,
    )


# ── Registry ─────────────────────────────────────────────────────


def parse_registry(registry: dict) -> RegistryInfo:
    """Parse a registry document and return summary info."""
    raw = formspec_rust.parse_registry(registry)
    return RegistryInfo(
        publisher=raw.get("publisher", {}),
        published=raw.get("published", ""),
        entry_count=raw.get("entry_count", 0),
        validation_issues=raw.get("validation_issues", []),
    )


def find_registry_entry(
    registry: dict,
    name: str,
    version: str | None = None,
) -> dict | None:
    """Find a registry entry by name and optional version constraint."""
    return formspec_rust.find_registry_entry(registry, name, version or "")


def validate_lifecycle_transition(from_status: str, to_status: str) -> bool:
    """Check if a lifecycle status transition is valid."""
    return formspec_rust.validate_lifecycle(from_status, to_status)


def well_known_registry_url(base_url: str) -> str:
    """Return the well-known URL for a registry base URL."""
    return formspec_rust.well_known_url(base_url)


# ── Changelog ────────────────────────────────────────────────────


def generate_changelog(
    old_def: dict,
    new_def: dict,
    definition_url: str = "",
    *,
    wire_style: str = "snake",
) -> dict:
    """Generate a changelog between two definition versions.

    Args:
        old_def: The prior definition document.
        new_def: The successor definition document.
        definition_url: Canonical URL identifying the definition being diffed.
        wire_style: Key casing for the returned dict. ``"snake"`` (default)
            emits Python-friendly snake_case keys. ``"camel"`` emits the
            canonical camelCase wire format defined by
            ``schemas/changelog.schema.json`` — use this when the output
            will be handed to ``lint()`` or serialized across runtimes.
    """
    return formspec_rust.generate_changelog(old_def, new_def, definition_url, wire_style)


def apply_migrations_to_response_data(
    definition: dict,
    data: dict,
    from_version: str,
    *,
    now_iso: str,
) -> dict:
    """Apply definition `migrations` to flat response field data (FEL transforms in Rust)."""
    return formspec_rust.apply_migrations_to_response_data(
        definition, data, from_version, now_iso
    )


def rewrite_fel_for_assembly(expression: str, map: dict) -> str:
    """Rewrite FEL using assembly RewriteMap (fragment + host keys)."""
    return formspec_rust.rewrite_fel_for_assembly(expression, map)


# ── Path utility (inlined from deleted validator.references) ─────


def canonical_item_path(path: str) -> str:
    """Normalize bind/target path ($.foo, /foo, foo.bar) to dot-separated key form."""
    trimmed = path.strip()
    if trimmed.startswith("$."):
        trimmed = trimmed[2:]
    if trimmed.startswith("/"):
        trimmed = trimmed[1:]
    trimmed = trimmed.replace("/", ".")
    return ".".join(segment for segment in trimmed.split(".") if segment)
