"""Type stubs for formspec._native (Rust extension module via PyO3)."""

from typing import Any

PY_API_VERSION: int
CRATE_VERSION: str

def eval_fel(
    expression: str,
    fields: dict[str, Any] | None = None,
) -> Any: ...

def eval_fel_with_trace(
    expression: str,
    fields: dict[str, Any] | None = None,
) -> dict[str, Any]: ...

def eval_fel_detailed(
    expression: str,
    fields: dict[str, Any] | None = None,
    instances: dict[str, Any] | None = None,
    mip_states: dict[str, dict[str, bool]] | None = None,
    variables: dict[str, Any] | None = None,
    now_iso: str | None = None,
) -> dict[str, Any]: ...

def parse_fel(expression: str) -> str | None: ...

def get_dependencies(expression: str) -> list[str]: ...

def extract_deps(expression: str) -> dict[str, Any]: ...

def analyze_expression(expression: str) -> dict[str, Any]: ...

def list_builtin_functions() -> list[dict[str, str]]: ...

def prepare_expression(options: dict[str, Any]) -> str: ...

def rewrite_fel_for_assembly(expression: str, map: dict[str, str]) -> str: ...

def detect_type(document: dict[str, Any]) -> str | None: ...

def lint_document(
    document: dict[str, Any],
    mode: str | None = None,
    registry_documents: list[dict[str, Any]] | None = None,
    definition_document: dict[str, Any] | None = None,
    theme_document: dict[str, Any] | None = None,
    component_documents: list[dict[str, Any]] | None = None,
    locale_documents: list[dict[str, Any]] | None = None,
    bundle_component_documents: list[dict[str, Any]] | None = None,
    app_graph_validation_report: dict[str, Any] | None = None,
    posture_declaration: dict[str, Any] | None = None,
    schema_only: bool | None = None,
    no_fel: bool | None = None,
) -> dict[str, Any]: ...

def evaluate_def(
    definition: dict[str, Any],
    data: dict[str, Any],
    trigger: str | None = None,
    registry_documents: list[dict[str, Any]] | None = None,
    instances: dict[str, Any] | None = None,
    context: dict[str, Any] | None = None,
    extension_functions: dict[str, Any] | None = None,
) -> dict[str, Any]: ...

def coerce_field_value(
    item: dict[str, Any],
    definition: dict[str, Any],
    value: Any,
    bind: dict[str, Any] | None = None,
) -> Any: ...

def resolve_option_sets_on_definition(definition: dict[str, Any]) -> dict[str, Any]: ...

def apply_migrations_to_response_data(
    definition: dict[str, Any],
    data: dict[str, Any],
    from_version: str,
    now_iso: str,
) -> dict[str, Any]: ...

def evaluate_screener_document_py(
    screener: dict[str, Any],
    answers: dict[str, Any],
    context: dict[str, Any] | None = None,
    extension_functions: dict[str, Any] | None = None,
) -> dict[str, Any]: ...

def parse_registry(registry: dict[str, Any]) -> dict[str, Any]: ...

def find_registry_entry(
    registry: dict[str, Any],
    name: str,
    version_constraint: str = "",
) -> dict[str, Any] | None: ...

def validate_lifecycle(from_status: str, to_status: str) -> bool: ...

def well_known_url(base_url: str) -> str: ...

def generate_changelog(
    old_def_obj: dict[str, Any],
    new_def_obj: dict[str, Any],
    definition_url: str,
    wire_style: str | None = None,
) -> dict[str, Any]: ...

def execute_mapping_doc(
    doc_obj: dict[str, Any],
    source_obj: dict[str, Any],
    direction: str,
) -> dict[str, Any]: ...
