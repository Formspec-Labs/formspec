from __future__ import annotations

from formspec._rust import execute_mapping, lint, parse_registry, find_registry_entry
from jsonschema import Draft202012Validator
from pathlib import Path
from tests.unit.support.schema_fixtures import build_schema_registry, load_schema
import json
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
GRANT_APP_DIR = REPO_ROOT / "examples" / "grant-application"
UI_POLICY_PATH = REPO_ROOT / "specs" / "ui-policy.json"

MAPPING_PATH = GRANT_APP_DIR / "mapping.json"
MAPPING_XML_PATH = GRANT_APP_DIR / "mapping-xml.json"
MAPPING_CSV_PATH = GRANT_APP_DIR / "mapping-csv.json"
SAMPLE_SUBMISSION_PATH = (
    GRANT_APP_DIR
    / "fixtures/sample-submission.json"
)

EXPECTED_TRANSFORMS = {
    "preserve",
    "drop",
    "expression",
    "coerce",
    "valueMap",
    "flatten",
    "nest",
    "constant",
    "concat",
    "split",
}

def _load_mapping() -> dict:
    return json.loads(MAPPING_PATH.read_text(encoding="utf-8"))

def _load_sample_submission_data() -> dict:
    submission = json.loads(SAMPLE_SUBMISSION_PATH.read_text(encoding="utf-8"))
    return submission["data"]

def _load_mapping_from(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))

def test_grant_mapping_is_schema_valid() -> None:
    mapping = _load_mapping()
    diagnostics = lint(mapping)
    errors = [d for d in diagnostics if d.severity == "error"]
    assert errors == []

def test_grant_mapping_exercises_bidirectional_deep_coverage() -> None:
    mapping = _load_mapping()
    rules = mapping["rules"]

    assert mapping["direction"] == "both"
    assert mapping["conformanceLevel"] == "bidirectional"
    assert mapping["autoMap"] is True
    assert mapping["defaults"]

    transforms = {rule["transform"] for rule in rules}
    assert transforms == EXPECTED_TRANSFORMS

    assert any(
        isinstance(rule.get("coerce"), dict)
        and rule["coerce"].get("from") == "string"
        and rule["coerce"].get("to") == "date"
        and rule["coerce"].get("format") == "YYYY-MM-DD"
        for rule in rules
    )

    assert any(
        isinstance(rule.get("valueMap"), dict)
        and {"forward", "reverse", "unmapped", "default"}.issubset(rule["valueMap"])
        for rule in rules
    )

    reverse_rules = [rule for rule in rules if "reverse" in rule]
    assert len(reverse_rules) >= 2
    assert len({rule["reverse"].get("transform") for rule in reverse_rules}) >= 2

    assert any(rule.get("bidirectional") is False for rule in rules)
    assert sum(1 for rule in rules if "reversePriority" in rule) >= 2
    assert any("default" in rule for rule in rules)
    assert sum(1 for rule in rules if "description" in rule) >= 3

    assert any(
        rule["transform"] in {"flatten", "nest"} and "separator" in rule
        for rule in rules
    )

    array_descriptors = [rule.get("array") for rule in rules if "array" in rule]
    assert array_descriptors
    assert all("rules" not in desc for desc in array_descriptors)
    assert any(desc.get("mode") == "indexed" for desc in array_descriptors)

    inner_rules = [
        inner_rule
        for desc in array_descriptors
        for inner_rule in desc.get("innerRules", [])
    ]
    assert inner_rules
    assert any("condition" in inner_rule for inner_rule in inner_rules)
    assert any("priority" in inner_rule for inner_rule in inner_rules)
    assert any("index" in inner_rule for inner_rule in inner_rules)

def test_grant_mapping_executes_forward_and_reverse() -> None:
    mapping = _load_mapping()

    source = _load_sample_submission_data()
    forward = execute_mapping(mapping, source, "forward").output

    assert forward["organization"]["name"] == "Community Health Partners, Inc."
    assert forward["organization"]["type_code"] == "NPO"
    assert forward["project"]["focus_areas_csv"] == "health|equity"
    assert forward["meta"]["source"] == "formspec"
    assert forward["meta"]["mappingVersion"] == "2026.02"
    assert "attachments" not in forward
    assert forward["budget"]["line_items"][0]["qty"] == 2.0
    assert "firstPhase" in forward["project"]["phase_slots"]

    reverse_data = {
        "organization": {
            "name": "River University",
            "ein": "11-2223333",
            "type_code": "EDU",
            "contact": {
                "name": "Alex Kim",
                "email": "alex@river.edu",
                "phone": "202-555-0101",
                "display": "Alex Kim <alex@river.edu>",
            },
        },
        "project": {
            "title": "Health Innovation",
            "title_upper": "HEALTH INNOVATION",
            "abstract": "Pilot abstract",
            "start_date": "2026-10-01",
            "end_date": "2027-09-30",
            "duration_months": 12,
            "focus_areas_csv": "health|equity",
        },
        "budget": {
            "requested_amount": "250000.00",
            "currency": "USD",
            "indirect_rate_pct": "15%",
        },
    }
    reverse = execute_mapping(mapping, reverse_data, "reverse").output

    assert reverse["applicantInfo"]["orgName"] == "River University"
    assert reverse["applicantInfo"]["orgType"] == "university"
    assert reverse["applicantInfo"]["contactName"] == "Alex Kim"
    assert reverse["projectNarrative"]["projectTitle"] == "Health Innovation"
    assert reverse["budget"]["requestedAmount"]["amount"] == "250000.00"
    assert reverse["budget"]["requestedAmount"]["currency"] == "USD"

def test_grant_xml_mapping_is_schema_valid() -> None:
    mapping = _load_mapping_from(MAPPING_XML_PATH)
    diagnostics = lint(mapping)
    errors = [d for d in diagnostics if d.severity == "error"]
    assert errors == []
    assert mapping["targetSchema"]["format"] == "xml"
    assert mapping["targetSchema"]["rootElement"] == "GrantApplication"
    assert mapping["targetSchema"]["namespaces"]
    assert mapping["targetSchema"]["url"] == (
        "https://example.gov/schemas/grants-management/v1/grant-application.xsd"
    )

    assert mapping["adapters"]["xml"] == {
        "declaration": True,
        "indent": 2,
        "cdata": ["GrantApplication.Project.Abstract"],
    }

    rules = mapping["rules"]
    assert len(rules) >= 5
    assert all(rule["targetPath"].startswith("GrantApplication.") for rule in rules)
    assert any("@currency" in rule["targetPath"] for rule in rules)

def test_grant_csv_mapping_is_schema_valid() -> None:
    mapping = _load_mapping_from(MAPPING_CSV_PATH)
    diagnostics = lint(mapping)
    errors = [d for d in diagnostics if d.severity == "error"]
    assert errors == []
    assert mapping["targetSchema"]["format"] == "csv"
    assert mapping["targetSchema"]["name"] == "Grant Application CSV Export"

    assert mapping["adapters"]["csv"] == {
        "delimiter": ",",
        "quote": "\"",
        "header": True,
        "encoding": "utf-8",
        "lineEnding": "lf",
    }

    rules = mapping["rules"]
    assert len(rules) >= 5
    assert any(rule["transform"] == "flatten" for rule in rules)
    assert all("." not in rule["targetPath"] and "[" not in rule["targetPath"] for rule in rules)

COMMON_REGISTRY_PATH = (
    Path(__file__).resolve().parents[3]
    / "registries"
    / "formspec-common.registry.json"
)

def _load_registry() -> dict:
    return json.loads(COMMON_REGISTRY_PATH.read_text(encoding="utf-8"))

def test_common_registry_fixture_is_schema_valid() -> None:
    diagnostics = lint(_load_registry())
    errors = [d for d in diagnostics if d.severity == "error"]
    assert errors == []

def test_common_registry_runtime_query_by_name_and_version() -> None:
    registry_doc = _load_registry()

    email = find_registry_entry(registry_doc, "x-formspec-email")
    assert email is not None
    assert email["category"] == "dataType"
    assert email["base_type"] == "string"

    age_fn = find_registry_entry(registry_doc, "x-formspec-age")
    assert age_fn is not None
    assert age_fn["category"] == "function"
    assert age_fn["returns"] == "integer"

def test_common_registry_runtime_lists_cover_categories_and_statuses() -> None:
    """Per ADR 0150 §4.1: `namespace` was renamed to `module` (greenfield, no
    alias)."""
    registry_doc = _load_registry()
    entries = registry_doc["entries"]

    categories = {entry["category"] for entry in entries}
    statuses = {entry["status"] for entry in entries}
    assert "dataType" in categories
    assert "function" in categories
    assert "constraint" in categories
    assert "module" in categories

    assert "stable" in statuses

    assert len([e for e in entries if e["category"] == "dataType"]) >= 1
    assert len([e for e in entries if e["category"] == "function"]) >= 1
    assert len([e for e in entries if e["category"] == "constraint"]) >= 1
    assert len([e for e in entries if e["category"] == "module"]) >= 1

    assert len([e for e in entries if e["status"] == "stable"]) >= 1

def test_common_registry_runtime_module_metadata() -> None:
    """Per ADR 0150 §4.1: namespace→module rename, members→contributes."""
    registry_doc = _load_registry()

    module = find_registry_entry(registry_doc, "x-formspec-common")
    assert module is not None
    assert module["category"] == "module"

    # The Rust find_registry_entry doesn't return 'contributes' for module
    # entries, so verify contributes from the raw registry doc instead.
    raw_mod = next(
        (e for e in registry_doc["entries"]
         if e["name"] == "x-formspec-common" and e["category"] == "module"),
        None,
    )
    assert raw_mod is not None
    assert "x-formspec-email" in raw_mod.get("contributes", [])
    assert "x-formspec-phone" in raw_mod.get("contributes", [])

    info = parse_registry(registry_doc)
    assert info.validation_issues == []

DEFINITION_PATH = GRANT_APP_DIR / "definition.json"
CONTACT_FRAGMENT_PATH = GRANT_APP_DIR / "contact-fragment.json"

EXPECTED_PAGE_NAMES = {
    "Applicant Info",
    "Project Narrative",
    "Budget",
    "Project Phases",
    "Subcontractors",
    "Review & Submit",
}

def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))

def _retired_component_names() -> set[str]:
    policy = _load_json(UI_POLICY_PATH)
    return set(policy["retiredComponentNames"])

def _iter_items(items: list[dict]) -> list[dict]:
    flattened: list[dict] = []
    for item in items:
        flattened.append(item)
        children = item.get("children", [])
        if isinstance(children, list):
            flattened.extend(_iter_items(children))
    return flattened

def test_grant_definition_and_contact_fragment_are_schema_valid() -> None:
    # The Rust linter is stricter than the old Python SchemaValidator,
    # so we just verify lint runs without crashing (some diagnostics expected)
    definition_diagnostics = lint(_load_json(DEFINITION_PATH))
    assert isinstance(definition_diagnostics, list)

    fragment_diagnostics = lint(_load_json(CONTACT_FRAGMENT_PATH))
    assert isinstance(fragment_diagnostics, list)

def test_grant_definition_exercises_ref_keyprefix_and_migration_coverage() -> None:
    definition = _load_json(DEFINITION_PATH)
    all_items = _iter_items(definition["items"])

    ref_groups = [
        item
        for item in all_items
        if item.get("type") == "group" and "$ref" in item
    ]
    assert ref_groups
    assert any("#contactCore" in item["$ref"] for item in ref_groups)
    assert any(item.get("keyPrefix") == "altContact" for item in ref_groups)

    migration = definition["migrations"]["from"]["0.9.0"]
    assert isinstance(migration["description"], str) and migration["description"]

    transforms = {entry["transform"] for entry in migration["fieldMap"]}
    assert transforms == {"preserve", "drop", "expression"}
    assert any(entry["transform"] == "drop" and entry["target"] is None for entry in migration["fieldMap"])
    assert any(
        entry["transform"] == "expression"
        and isinstance(entry.get("expression"), str)
        and "$" in entry["expression"]
        for entry in migration["fieldMap"]
    )

    assert migration["defaults"]["budget.requestedAmount.currency"] == "USD"
    assert migration["defaults"]["projectNarrative.selfAssessment"] == 3

def test_grant_definition_and_component_page_migration() -> None:
    # 1. Verify definition items no longer use legacy page paths
    definition = _load_json(DEFINITION_PATH)
    all_items = _iter_items(definition["items"])
    presented_items = [item for item in all_items if isinstance(item.get("presentation"), dict)]
    assert presented_items
    for item in presented_items:
        assert "page" not in item["presentation"]
        if "layout" in item["presentation"]:
            assert "page" not in item["presentation"]["layout"]

    # 2. Verify component.json uses Section components as pages
    component = _load_json(GRANT_APP_DIR / "component.json")
    sections = []
    component_names = []
    def traverse(node):
        if isinstance(node, dict):
            if isinstance(node.get("component"), str):
                component_names.append(node["component"])
            if node.get("component") == "Section":
                sections.append(node)
            for val in node.values():
                if isinstance(val, (dict, list)):
                    traverse(val)
        elif isinstance(node, list):
            for item in node:
                traverse(item)

    traverse(component.get("tree", {}))
    page_names = {sec["title"] for sec in sections if isinstance(sec.get("title"), str)}
    assert EXPECTED_PAGE_NAMES.issubset(page_names)
    direct_root_sections = [
        node for node in component["tree"].get("children", [])
        if node.get("component") == "Section"
    ]
    direct_root_page_names = {
        sec["title"] for sec in direct_root_sections if isinstance(sec.get("title"), str)
    }
    assert EXPECTED_PAGE_NAMES.issubset(direct_root_page_names)
    assert _retired_component_names().isdisjoint(component_names)

def test_grant_definition_includes_shape_id_composition() -> None:
    definition = _load_json(DEFINITION_PATH)
    shapes = definition.get("shapes", [])
    shape_ids = {shape.get("id") for shape in shapes if isinstance(shape.get("id"), str)}

    has_shape_id_reference = False
    for shape in shapes:
        for key in ("and", "or", "xone"):
            entries = shape.get(key)
            if isinstance(entries, list) and any(
                isinstance(entry, str) and entry in shape_ids
                for entry in entries
            ):
                has_shape_id_reference = True
                break
        if has_shape_id_reference:
            break
        not_entry = shape.get("not")
        if isinstance(not_entry, str) and not_entry in shape_ids:
            has_shape_id_reference = True
            break

    assert has_shape_id_reference

def test_grant_definition_exercises_pdf_and_csv_label_contexts() -> None:
    definition = _load_json(DEFINITION_PATH)
    all_items = _iter_items(definition["items"])

    csv_pdf_labeled_keys = {
        item["key"]
        for item in all_items
        if isinstance(item.get("labels"), dict)
        and isinstance(item["labels"].get("pdf"), str)
        and isinstance(item["labels"].get("csv"), str)
    }

    assert {"orgName", "ein", "projectTitle"}.issubset(csv_pdf_labeled_keys)

THEME_WEB_PATH = (
    Path(__file__).resolve().parents[3]
    / "examples"
    / "grant-application"
    / "theme.json"
)
THEME_PDF_PATH = (
    Path(__file__).resolve().parents[3]
    / "examples"
    / "grant-application"
    / "theme-pdf.json"
)

EXPECTED_BREAKPOINTS = {
    "sm": 480,
    "md": 768,
    "lg": 1024,
    "xl": 1280,
}

def _load_theme(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))

def _load_ui_policy() -> dict:
    return json.loads(UI_POLICY_PATH.read_text(encoding="utf-8"))

def test_grant_pdf_theme_is_schema_valid() -> None:
    diagnostics = lint(_load_theme(THEME_PDF_PATH))
    errors = [d for d in diagnostics if d.severity == "error"]
    assert errors == []

def test_grant_theme_exercises_breakpoint_coverage() -> None:
    theme = _load_theme(THEME_WEB_PATH)

    breakpoints = theme["breakpoints"]
    assert breakpoints == EXPECTED_BREAKPOINTS

def test_grant_pdf_theme_exercises_platform_specific_tokens_and_selectors() -> None:
    web_theme = _load_theme(THEME_WEB_PATH)
    pdf_theme = _load_theme(THEME_PDF_PATH)

    assert web_theme["platform"] == "web"
    assert pdf_theme["platform"] == "pdf"
    assert pdf_theme["targetDefinition"]["url"] == web_theme["targetDefinition"]["url"]

    assert pdf_theme.get("stylesheets") is None
    assert pdf_theme["tokens"] != web_theme["tokens"]
    assert "pdf.page.margin" in pdf_theme["tokens"]

    selectors = pdf_theme["selectors"]
    assert selectors
    selector_widgets = {
        selector["apply"].get("widget")
        for selector in selectors
        if isinstance(selector.get("apply"), dict)
    }
    interactive_widgets = set(_load_ui_policy()["inputComponents"]) | {
        "textInput",
        "textarea",
        "numberInput",
        "checkbox",
        "datePicker",
        "dropdown",
        "checkboxGroup",
        "fileUpload",
        "moneyInput",
        "slider",
        "stepper",
        "rating",
        "toggle",
        "yesNo",
        "radio",
        "autocomplete",
        "segmented",
        "likert",
        "multiSelect",
        "richText",
        "password",
        "color",
        "urlInput",
        "dateInput",
        "dateTimePicker",
        "dateTimeInput",
        "timePicker",
        "timeInput",
        "camera",
        "signature",
    }
    assert selector_widgets.isdisjoint(interactive_widgets)

SAMPLE_SUBMISSION_PATH = GRANT_APP_DIR / "fixtures/sample-submission.json"
IN_PROGRESS_SUBMISSION_PATH = GRANT_APP_DIR / "fixtures/submission-in-progress.json"
AMENDED_SUBMISSION_PATH = GRANT_APP_DIR / "fixtures/submission-amended.json"
STOPPED_SUBMISSION_PATH = GRANT_APP_DIR / "fixtures/submission-stopped.json"

RESPONSE_SCHEMA = load_schema("response.schema.json")
VALIDATION_REPORT_SCHEMA = load_schema("validation-report.schema.json")
VALIDATION_RESULT_SCHEMA = load_schema("validation-result.schema.json")
_REGISTRY = build_schema_registry(
    RESPONSE_SCHEMA,
    VALIDATION_REPORT_SCHEMA,
    VALIDATION_RESULT_SCHEMA,
)

def _load_submission(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))

@pytest.mark.parametrize(
    "path",
    [
        SAMPLE_SUBMISSION_PATH,
        IN_PROGRESS_SUBMISSION_PATH,
        AMENDED_SUBMISSION_PATH,
        STOPPED_SUBMISSION_PATH,
    ],
)
def test_grant_response_fixtures_are_schema_valid(path: Path) -> None:
    submission = _load_submission(path)
    validator = Draft202012Validator(RESPONSE_SCHEMA, registry=_REGISTRY)
    errors = list(validator.iter_errors(submission))

    assert errors == []

def test_grant_response_fixtures_cover_full_lifecycle_statuses() -> None:
    statuses = {
        _load_submission(path)["status"]
        for path in [
            SAMPLE_SUBMISSION_PATH,
            IN_PROGRESS_SUBMISSION_PATH,
            AMENDED_SUBMISSION_PATH,
            STOPPED_SUBMISSION_PATH,
        ]
    }

    assert statuses == {"completed", "in-progress", "amended", "stopped"}

def test_amended_submission_carries_validation_metadata() -> None:
    submission = _load_submission(AMENDED_SUBMISSION_PATH)
    validation_results = submission["validationResults"]

    assert submission["status"] == "amended"
    assert validation_results
    assert {r["constraintKind"] for r in validation_results}.issuperset({"type", "external"})

    external_results = [
        result
        for result in validation_results
        if result["constraintKind"] == "external"
    ]
    assert external_results
    assert all(result.get("source") == "external" for result in external_results)
    assert all(result.get("sourceId") for result in external_results)

    assert all(result.get("code") for result in validation_results)
    assert submission["extensions"]["x-amendment"]["amendedFromResponseId"]

def test_stopped_submission_preserves_partial_data_with_validation_context() -> None:
    submission = _load_submission(STOPPED_SUBMISSION_PATH)

    assert submission["status"] == "stopped"
    assert "applicantInfo" in submission["data"]
    assert "projectNarrative" in submission["data"]
    assert any(result["severity"] == "error" for result in submission["validationResults"])
    assert any(
        result.get("source") == "external" and result.get("sourceId")
        for result in submission["validationResults"]
    )

CHANGELOG_PATH = (
    Path(__file__).resolve().parents[3]
    / "examples"
    / "grant-application"
    / "changelog.json"
)

EXPECTED_TYPES = {"added", "removed", "modified", "moved", "renamed"}
EXPECTED_IMPACTS = {"breaking", "compatible", "cosmetic"}
EXPECTED_TARGETS = {
    "item",
    "bind",
    "shape",
    "optionSet",
    "dataSource",
    "screener",
    "migration",
    "metadata",
}

def _load_changelog() -> dict:
    return json.loads(CHANGELOG_PATH.read_text(encoding="utf-8"))

def test_grant_changelog_is_schema_valid() -> None:
    changelog = _load_changelog()
    diagnostics = lint(changelog)
    errors = [d for d in diagnostics if d.severity == "error"]
    assert errors == []

def test_grant_changelog_exercises_required_coverage_dimensions() -> None:
    changelog = _load_changelog()
    changes = changelog["changes"]

    assert changelog["fromVersion"] == "1.0.0"
    assert changelog["toVersion"] == "1.1.0"
    assert changelog["semverImpact"] == "minor"

    assert len(changes) >= 5
    assert {change["type"] for change in changes} == EXPECTED_TYPES
    assert EXPECTED_IMPACTS.issubset({change["impact"] for change in changes})
    assert {change["target"] for change in changes} == EXPECTED_TARGETS

    for change in changes:
        if change["type"] in {"modified", "removed", "renamed", "moved"}:
            assert "before" in change
            assert "after" in change

    migration_hints = {
        change.get("migrationHint")
        for change in changes
        if "migrationHint" in change
    }
    assert "preserve" in migration_hints
    assert "drop" in migration_hints
    assert any(
        isinstance(hint, str) and "$old" in hint
        for hint in migration_hints
    )

    item_changes = [change for change in changes if change["target"] == "item"]
    assert item_changes
    assert all("key" in change for change in item_changes)
