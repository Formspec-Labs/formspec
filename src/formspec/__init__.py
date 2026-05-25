"""Formspec Python package — Rust-backed form processing, linting, mapping, and tooling."""

# Re-exports are available via formspec._rust directly.
# We use module-level __getattr__ to lazily re-export without triggering
# the circular import: __init__ → _rust → fel.__init__ → _rust.
import importlib as _importlib


def __getattr__(name):
    _rust = _importlib.import_module("formspec._rust")
    try:
        val = getattr(_rust, name)
    except AttributeError:
        raise AttributeError(f"module 'formspec' has no attribute {name!r}") from None
    # Cache on the module so __getattr__ is not called again for this name
    globals()[name] = val
    return val


__all__ = [
    "ProcessingResult",
    "MappingResult",
    "MappingDiagnostic",
    "LintDiagnostic",
    "RegistryInfo",
    "evaluate_definition",
    "lint",
    "lint_report",
    "detect_document_type",
    "execute_mapping",
    "parse_registry",
    "find_registry_entry",
    "validate_lifecycle_transition",
    "well_known_registry_url",
    "generate_changelog",
    "apply_migrations_to_response_data",
    "rewrite_fel_for_assembly",
    "canonical_item_path",
]
