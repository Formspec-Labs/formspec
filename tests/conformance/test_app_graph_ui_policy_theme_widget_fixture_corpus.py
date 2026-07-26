"""Integrity checks for executable UI Graph Policy Theme widget fixtures."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import load_schema


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = (
    ROOT
    / "tests"
    / "conformance"
    / "fixtures"
    / "app-graph-validator"
    / "ui-graph-policy-theme-widgets.case.json"
)

REQUIRED_CASES = {
    "ambiguous-loaded-theme-evidence",
    "valid-theme-widget-with-resolved-contribution",
    "valid-custom-token-category-evidence",
    "missing-custom-token-category-evidence",
    "conflicting-custom-token-category-evidence",
    "shape-mismatch-custom-token-category-evidence",
    "unsupported-token-category-prefix",
    "missing-loaded-theme-evidence",
    "missing-theme-token-ref",
    "theme-token-category-mismatch",
    "undeclared-theme-token-slot",
    "missing-theme-token-slot-evidence",
    "missing-theme-widget-ref",
    "unadmitted-theme-widget-ref",
    "module-resolution-absent-skips-theme-widget",
    "module-resolution-not-run-skips-theme-widget",
    "module-resolution-skipped-skips-theme-widget",
    "surface-target-mismatch-skips-theme-widget",
    "widget-owner-module-mismatch",
    "theme-assignment-on-proof-route-class",
    "theme-assignment-on-intake-route-class",
    "theme-assignment-on-unclassified-route",
    "theme-assignment-spanning-intake-and-proof-route-classes",
    "theme-assignment-through-embed-route-composition",
}

EXPECTED_CODES = {
    "ambiguous-loaded-theme-evidence": ["THEME-TOKEN-REF"],
    "missing-loaded-theme-evidence": ["THEME-TOKEN-REF"],
    "missing-theme-token-ref": ["THEME-TOKEN-REF"],
    "missing-custom-token-category-evidence": ["THEME-TOKEN-CATEGORY-REF"],
    "conflicting-custom-token-category-evidence": [
        "MODULE-TOKEN-CATEGORY-CONFLICT",
        "THEME-TOKEN-CATEGORY-REF",
    ],
    "shape-mismatch-custom-token-category-evidence": [
        "MODULE-TOKEN-CATEGORY-SHAPE",
        "THEME-TOKEN-CATEGORY-REF",
    ],
    "unsupported-token-category-prefix": ["THEME-TOKEN-CATEGORY-REF"],
    "theme-token-category-mismatch": ["THEME-TOKEN-CATEGORY"],
    "undeclared-theme-token-slot": ["THEME-TOKEN-SLOT"],
    "missing-theme-token-slot-evidence": ["THEME-TOKEN-SLOT"],
    "missing-theme-widget-ref": ["THEME-TOKEN-WIDGET"],
    "unadmitted-theme-widget-ref": [
        "MODULE-CONTRIBUTION-UNADMITTED",
        "THEME-TOKEN-WIDGET",
    ],
    "surface-target-mismatch-skips-theme-widget": ["UI-POLICY-SURFACE-TARGET"],
    "widget-owner-module-mismatch": ["THEME-TOKEN-WIDGET"],
    "theme-assignment-on-proof-route-class": ["THEME-ROUTE-CLASS"],
    "theme-assignment-on-intake-route-class": [],
    "theme-assignment-on-unclassified-route": [],
    "theme-assignment-spanning-intake-and-proof-route-classes": ["THEME-ROUTE-CLASS"],
    "theme-assignment-through-embed-route-composition": ["THEME-ROUTE-CLASS"],
}

SUMMARY_KEYS = {
    "artifacts",
    "loadedArtifacts",
    "schemaFailures",
    "unvalidatedArtifacts",
    "graphErrors",
    "errors",
    "warnings",
    "infos",
    "importedDiagnostics",
    "unsupportedFeatures",
    "skippedPhases",
}

FORBIDDEN_KEYS = {
    "$wireframeUiPolicy",
    "actor",
    "actors",
    "allowedActors",
    "authorization",
    "fieldPolicy",
    "filename",
    "identityFromPath",
    "localPath",
    "pathIdentity",
    "permission",
    "permissions",
    "routeAuthorization",
    "sourcePath",
    "trace",
    "traceIndex",
    "uiPolicy",
    "widgetPolicy",
}

FORBIDDEN_STRING_FRAGMENTS = (
    "/Users/",
    "\\Users\\",
    "tests/conformance",
    ".case.json",
    ".fixture",
    "semantics.themeTokenSlots",
)

DEFERRED_CODES = {
    "AUTHORIZATION-BOUNDARY",
}

UI_POLICY_SCHEMA = load_schema("ui-graph-policy.schema.json")
UI_POLICY_VALIDATOR = Draft202012Validator(UI_POLICY_SCHEMA)
MODULE_REPORT_SCHEMA = load_schema("module-resolution-report.schema.json")
MODULE_REPORT_VALIDATOR = Draft202012Validator(MODULE_REPORT_SCHEMA)


def _corpus() -> dict[str, Any]:
    return json.loads(FIXTURE_PATH.read_text())


def _walk(value: Any) -> Any:
    if isinstance(value, dict):
        for key, child in value.items():
            yield key, child
            yield from _walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk(child)


def _case(case_id: str) -> dict[str, Any]:
    for case in _corpus()["cases"]:
        if case["id"] == case_id:
            return case
    raise AssertionError(f"missing case {case_id}")


def _assert_policy_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("hostEvidence.uiGraphPolicies[")
    assert set(source).issubset({"artifactSlot", "source", "jsonPointer"})
    assert isinstance(source.get("source"), str)
    assert isinstance(source.get("jsonPointer"), str)


def _assert_surface_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("surfaces[")
    assert source["artifactKind"] == "surface"
    assert "ref" in source
    assert "url" in source["ref"]


def _assert_registry_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"].startswith("registries[")
    assert source["artifactKind"] == "registry"
    assert "module" not in source
    assert isinstance(source.get("jsonPointer"), str)


def _assert_theme_pointer(source: dict[str, Any]) -> None:
    assert source["artifactSlot"] == "theme"
    assert source["artifactKind"] == "theme"
    assert "ref" in source
    assert "url" in source["ref"]
    assert isinstance(source.get("jsonPointer"), str)


def test_ui_graph_policy_theme_widget_fixture_covers_required_cases() -> None:
    ids = {case["id"] for case in _corpus()["cases"]}
    assert ids == REQUIRED_CASES


def test_ui_graph_policy_theme_widget_fixture_sources_are_explicit() -> None:
    corpus = _corpus()
    handles = corpus["handles"]
    policies = corpus["policies"]
    module_reports = corpus["moduleResolutionReports"]
    for handle in handles.values():
        assert handle["status"] == "loaded"
        assert isinstance(handle.get("slot"), str)
        assert isinstance(handle.get("artifactKind"), str)
        assert isinstance(handle.get("source"), str)
        assert "document" in handle
    for policy in policies.values():
        assert policy["schemaId"] == "https://formspec.org/schemas/uiGraphPolicy/0.1"
        assert policy["source"].startswith("host://policy/")
        UI_POLICY_VALIDATOR.validate(policy["document"])

    for case in corpus["cases"]:
        assert case["request"]["manifest"] in handles
        for group_refs in case["request"].get("artifacts", {}).values():
            for handle_ref in group_refs:
                assert handle_ref in handles
        for policy_ref in case["request"]["hostEvidence"]["uiGraphPolicies"]:
            assert policy_ref in policies
        module_report_ref = case["request"].get("moduleResolution")
        if module_report_ref is not None:
            assert module_report_ref in module_reports


def test_ui_graph_policy_theme_widget_module_resolution_reports_are_valid() -> None:
    for report in _corpus()["moduleResolutionReports"].values():
        MODULE_REPORT_VALIDATOR.validate(report)


def test_ui_graph_policy_theme_widget_fixtures_carry_token_slot_evidence() -> None:
    report = _corpus()["moduleResolutionReports"]["resolved-theme-widget"]
    token_slots = report["contributions"][0].get("widgetTokenSlots")
    assert token_slots == [
        {
            "name": "accent",
            "acceptedTokenCategories": ["color"],
            "source": {
                "artifactSlot": "registries[0]",
                "artifactKind": "registry",
                "source": "memory://registry",
                "jsonPointer": "/entries/1/widgetShape/tokenSlots/0",
            },
        }
    ]


def test_ui_graph_policy_theme_widget_fixtures_carry_token_category_evidence() -> None:
    report = _corpus()["moduleResolutionReports"]["resolved-theme-widget-custom-category"]
    assert report["tokenCategories"] == [
        {
            "prefix": "x-agency",
            "status": "admitted",
            "entryName": "x-agency-token-category",
            "entryVersion": "1.0.0",
            "owningModules": [
                {
                    "id": "x-reviewer",
                    "version": "1.0.0",
                }
            ],
            "source": {
                "artifactSlot": "registries[0]",
                "artifactKind": "registry",
                "source": "memory://registry",
                "jsonPointer": "/entries/2/categoryShape",
            },
        }
    ]


def test_ui_graph_policy_theme_widget_slot_diagnostics_are_policy_owned() -> None:
    undeclared = _case("undeclared-theme-token-slot")["expected"]["diagnostics"][0]
    assert undeclared["code"] == "THEME-TOKEN-SLOT"
    assert undeclared["primarySource"]["jsonPointer"] == "/theme/assignments/0/slot"
    assert undeclared["details"] == {
        "moduleId": "x-reviewer",
        "widgetName": "x-review-panel",
        "slot": "surface",
        "reason": "undeclared-slot",
        "declaredSlots": ["accent"],
    }
    assert len(undeclared["relatedSources"]) == 1
    _assert_registry_pointer(undeclared["relatedSources"][0])

    missing_evidence = _case("missing-theme-token-slot-evidence")["expected"]["diagnostics"][0]
    assert missing_evidence["code"] == "THEME-TOKEN-SLOT"
    assert missing_evidence["primarySource"]["jsonPointer"] == "/theme/assignments/0/slot"
    assert "relatedSources" not in missing_evidence
    assert missing_evidence["details"] == {
        "moduleId": "x-reviewer",
        "widgetName": "x-review-panel",
        "slot": "accent",
        "reason": "no-token-slot-evidence",
    }


def test_ui_graph_policy_theme_widget_token_diagnostics_are_policy_owned() -> None:
    missing_theme = _case("missing-loaded-theme-evidence")["expected"]["diagnostics"][0]
    assert missing_theme["code"] == "THEME-TOKEN-REF"
    assert missing_theme["primarySource"]["jsonPointer"] == "/theme/assignments/0/token"
    assert "relatedSources" not in missing_theme
    assert missing_theme["details"]["reason"] == "missing-theme-evidence"

    ambiguous_theme = _case("ambiguous-loaded-theme-evidence")["expected"]["diagnostics"][0]
    assert ambiguous_theme["code"] == "THEME-TOKEN-REF"
    assert ambiguous_theme["details"]["reason"] == "ambiguous-theme-evidence"
    assert len(ambiguous_theme["relatedSources"]) == 2
    for related in ambiguous_theme["relatedSources"]:
        _assert_theme_pointer(related)
        assert related["jsonPointer"] == "/tokens"

    missing_token = _case("missing-theme-token-ref")["expected"]["diagnostics"][0]
    assert missing_token["code"] == "THEME-TOKEN-REF"
    assert missing_token["details"]["reason"] == "missing-token"
    assert len(missing_token["relatedSources"]) == 1
    _assert_theme_pointer(missing_token["relatedSources"][0])

    category = _case("theme-token-category-mismatch")["expected"]["diagnostics"][0]
    assert category["code"] == "THEME-TOKEN-CATEGORY"
    assert category["primarySource"]["jsonPointer"] == "/theme/assignments/0/token"
    assert category["details"] == {
        "moduleId": "x-reviewer",
        "widgetName": "x-review-panel",
        "slot": "accent",
        "token": "spacing.md",
        "reason": "category-not-accepted",
        "acceptedTokenCategories": ["color"],
    }
    assert len(category["relatedSources"]) == 2
    assert {source["artifactKind"] for source in category["relatedSources"]} == {
        "registry",
        "theme",
    }

    custom_missing = _case("missing-custom-token-category-evidence")["expected"]["diagnostics"][0]
    assert custom_missing["code"] == "THEME-TOKEN-CATEGORY-REF"
    assert custom_missing["details"]["reason"] == "missing-token-category-evidence"
    assert custom_missing["details"]["categoryPrefix"] == "x-agency"
    assert len(custom_missing["relatedSources"]) == 2
    _assert_registry_pointer(custom_missing["relatedSources"][0])
    _assert_theme_pointer(custom_missing["relatedSources"][1])

    custom_conflict = _case("conflicting-custom-token-category-evidence")["expected"]["diagnostics"][1]
    assert custom_conflict["code"] == "THEME-TOKEN-CATEGORY-REF"
    assert custom_conflict["details"]["reason"] == "conflicting-token-category-evidence"
    assert custom_conflict["details"]["tokenCategoryStatuses"] == ["conflict"]
    assert len(custom_conflict["relatedSources"]) == 3
    _assert_registry_pointer(custom_conflict["relatedSources"][0])
    _assert_registry_pointer(custom_conflict["relatedSources"][1])
    _assert_theme_pointer(custom_conflict["relatedSources"][2])

    custom_shape = _case("shape-mismatch-custom-token-category-evidence")["expected"]["diagnostics"][1]
    assert custom_shape["code"] == "THEME-TOKEN-CATEGORY-REF"
    assert custom_shape["details"]["reason"] == "token-category-shape-mismatch"
    assert custom_shape["details"]["tokenCategoryStatuses"] == ["shape-mismatch"]
    assert len(custom_shape["relatedSources"]) == 3
    _assert_registry_pointer(custom_shape["relatedSources"][0])
    _assert_registry_pointer(custom_shape["relatedSources"][1])
    _assert_theme_pointer(custom_shape["relatedSources"][2])

    unsupported = _case("unsupported-token-category-prefix")["expected"]["diagnostics"][0]
    assert unsupported["code"] == "THEME-TOKEN-CATEGORY-REF"
    assert unsupported["details"]["reason"] == "unsupported-category-prefix"
    assert unsupported["details"]["categoryPrefix"] == "typography"


def test_ui_graph_policy_theme_widget_expected_diagnostics_are_policy_owned() -> None:
    for case in _corpus()["cases"]:
        expected = case["expected"]
        assert isinstance(expected["ok"], bool)
        assert isinstance(expected["summary"], dict)
        assert set(expected["summary"]) == SUMMARY_KEYS
        diagnostics = expected["diagnostics"]
        if case["id"] in EXPECTED_CODES:
            assert [diagnostic["code"] for diagnostic in diagnostics] == EXPECTED_CODES[case["id"]]
        else:
            assert diagnostics == []
        for diagnostic in diagnostics:
            origin = diagnostic.get("origin", "ui-graph-policy")
            phase = diagnostic.get("phase", "cross-artifact")
            if origin == "module-resolver":
                assert phase == "module-resolution"
            else:
                assert origin == "ui-graph-policy"
                assert phase == "cross-artifact"
            primary = diagnostic.get("primarySource")
            assert isinstance(primary, dict)
            if primary["artifactSlot"].startswith("hostEvidence."):
                _assert_policy_pointer(primary)
            for related in diagnostic.get("relatedSources", []):
                if related["artifactSlot"].startswith("hostEvidence."):
                    _assert_policy_pointer(related)
                if related["artifactSlot"].startswith("surfaces["):
                    _assert_surface_pointer(related)
                if related["artifactSlot"].startswith("registries["):
                    _assert_registry_pointer(related)
                if related["artifactSlot"] == "theme":
                    _assert_theme_pointer(related)


def test_theme_route_class_refuses_tenant_theming_on_proof_bearing_routes() -> None:
    """Route class is authored on Surface; theme authority derives from it.

    The refusing set is `proof | ceremony | verification` — the surfaces whose
    rendered appearance a third party relies on. `intake` admits tenant chrome
    theming, `operation` carries no substrate trust claim.
    """
    caught = _case("theme-assignment-on-proof-route-class")["expected"]["diagnostics"][0]
    assert caught["code"] == "THEME-ROUTE-CLASS"
    # Primary source is the POLICY assignment; related source is the SURFACE
    # slot binding that put the widget on the protected route. The constraint
    # lives on the platform's Surface, never on the tenant-authored policy.
    _assert_policy_pointer(caught["primarySource"])
    assert caught["primarySource"]["jsonPointer"] == "/theme/assignments/0/widgetRef"
    assert len(caught["relatedSources"]) == 1
    _assert_surface_pointer(caught["relatedSources"][0])
    assert caught["details"] == {
        "moduleId": "x-reviewer",
        "widgetName": "x-review-panel",
        "slot": "accent",
        "token": "color.accent",
        "routeId": "certificate",
        "routeClass": "proof",
        "embedChain": ["certificate"],
        "reason": "tenant-theming-refused-by-route-class",
    }


def test_theme_route_class_follows_embed_route_composition() -> None:
    """`embed-route` renders another route INSIDE the host, so the host's theme
    authority reaches the embedded route's slots.

    Without this, one schema-valid hop restored the whole violation: a `proof`
    route whose only slot embeds an unclassified route that binds the widget
    validated clean. `embedChain` names the composition path from the
    class-bearing route to the route whose slot actually binds the widget, so
    the diagnostic stays readable when the two differ. The fixture's embedded
    route also embeds its host back — an authorable cycle the walk terminates on.
    """
    corpus = _corpus()
    routes = corpus["handles"]["surface-embedded-proof-composition"]["document"]["routes"]
    assert routes[0]["routeClass"] == "proof"
    assert routes[0]["slots"][0]["slotType"] == "embed-route"
    # The class-bearing route binds NO widget directly.
    assert all(slot["slotType"] != "module-widget" for slot in routes[0]["slots"])
    # The route that does bind it states no class of its own, and embeds back.
    assert "routeClass" not in routes[1]
    assert routes[1]["slots"][1]["binding"]["routeRef"] == routes[0]["id"]

    caught = _case("theme-assignment-through-embed-route-composition")["expected"]["diagnostics"][0]
    assert caught["code"] == "THEME-ROUTE-CLASS"
    _assert_policy_pointer(caught["primarySource"])
    # Related source names the EMBEDDED route's slot — where the binding is —
    # while details name the protected route that renders it.
    assert len(caught["relatedSources"]) == 1
    _assert_surface_pointer(caught["relatedSources"][0])
    assert caught["relatedSources"][0]["jsonPointer"] == "/routes/1/slots/0/binding"
    assert caught["details"]["routeId"] == "certificate"
    assert caught["details"]["routeClass"] == "proof"
    assert caught["details"]["embedChain"] == ["certificate", "certificate-body"]


def test_theme_route_class_admits_intake_and_distinguishes_unclassified() -> None:
    """Absence of `routeClass` is *unclassified*, never `operation`.

    Both cases emit nothing, so the fixture alone cannot tell them apart. The
    documents can: the intake route states a class and the unclassified route
    states none. Collapsing them — a schema `default`, or a processor reading
    absence as `operation` — is what this asserts against.
    """
    corpus = _corpus()
    intake_case = _case("theme-assignment-on-intake-route-class")
    unclassified_case = _case("theme-assignment-on-unclassified-route")
    assert intake_case["expected"]["diagnostics"] == []
    assert unclassified_case["expected"]["diagnostics"] == []

    def sole_route(case: dict[str, Any]) -> dict[str, Any]:
        handle_key = case["request"]["artifacts"]["surfaces"][0]
        routes = corpus["handles"][handle_key]["document"]["routes"]
        assert len(routes) == 1
        return routes[0]

    assert sole_route(intake_case)["routeClass"] == "intake"
    assert "routeClass" not in sole_route(unclassified_case)


def test_theme_route_class_over_approximates_across_mixed_route_classes() -> None:
    """Assignments are widget-scoped, so one protected binding taints the widget.

    The mixed Surface binds one widget on an `intake` route AND a `proof` route.
    The assignment is refused, because it would in fact repaint the widget on
    the proof route. Narrowing this needs route-scoped assignments — a UI Graph
    Policy schema revision, not a validator change.
    """
    case = _case("theme-assignment-spanning-intake-and-proof-route-classes")
    routes = _corpus()["handles"]["surface-mixed-route-classes"]["document"]["routes"]
    assert [route["routeClass"] for route in routes] == ["intake", "proof"]
    diagnostics = case["expected"]["diagnostics"]
    assert [diagnostic["code"] for diagnostic in diagnostics] == ["THEME-ROUTE-CLASS"]
    assert diagnostics[0]["details"]["routeClass"] == "proof"


def test_ui_graph_policy_theme_widget_fixture_keeps_deferred_families_out() -> None:
    emitted_codes = {
        diagnostic["code"]
        for case in _corpus()["cases"]
        for diagnostic in case["expected"]["diagnostics"]
    }
    assert emitted_codes.isdisjoint(DEFERRED_CODES)
    assert _case("missing-theme-widget-ref")["expected"]["diagnostics"][0]["code"] == (
        "THEME-TOKEN-WIDGET"
    )
    for case in _corpus()["cases"]:
        for diagnostic in case["expected"]["diagnostics"]:
            if diagnostic["code"] == "THEME-TOKEN-WIDGET":
                assert "relatedSources" not in diagnostic
                assert diagnostic["primarySource"]["jsonPointer"].startswith("/theme/assignments/")
            if diagnostic["code"] == "THEME-TOKEN-SLOT":
                assert diagnostic["primarySource"]["jsonPointer"].startswith("/theme/assignments/")
                assert diagnostic["primarySource"]["jsonPointer"].endswith("/slot")
            if diagnostic["code"] in {
                "THEME-TOKEN-REF",
                "THEME-TOKEN-CATEGORY",
                "THEME-TOKEN-CATEGORY-REF",
            }:
                assert diagnostic["primarySource"]["jsonPointer"].startswith("/theme/assignments/")
                assert diagnostic["primarySource"]["jsonPointer"].endswith("/token")
            if diagnostic["code"] == "THEME-ROUTE-CLASS":
                assert diagnostic["primarySource"]["jsonPointer"].startswith("/theme/assignments/")
                assert diagnostic["primarySource"]["jsonPointer"].endswith("/widgetRef")
                assert diagnostic["details"]["routeClass"] in {
                    "proof",
                    "ceremony",
                    "verification",
                }
            if diagnostic["code"] == "MODULE-CONTRIBUTION-UNADMITTED":
                primary = diagnostic["primarySource"]
                assert set(primary).issubset({"artifactSlot", "source", "jsonPointer"})


def test_ui_graph_policy_theme_widget_fixtures_do_not_encode_path_trace_or_auth() -> None:
    for key, value in _walk(_corpus()):
        assert key not in FORBIDDEN_KEYS, f"forbidden key {key}"
        if isinstance(value, str):
            for fragment in FORBIDDEN_STRING_FRAGMENTS:
                assert fragment not in value, f"forbidden string {fragment}"
