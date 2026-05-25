"""Schema acceptance tests for the App Manifest (formerly Bundle Manifest) spec.

Per ADR 0150 §5.2/§5.3/§11.2: the Bundle Manifest reframes as the App Manifest
-- singular `definition` becomes `definitions[]` (MAY be empty for non-form apps);
singular `registry` becomes `registries[]`; `surfaces[]` and `modules[]` and
`sessions[]` arrive. `$formspecBundle` bumps "1.0" -> "2.0" so strict-validating
consumers fail-loud rather than silently mis-parse the structurally different
document. App Manifest v2.1 adds `dataSources[]` as an additive minor slot.
App Manifest v2.2 adds `components[]` as the next additive minor slot.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "bundle"
BUNDLE_SCHEMA = load_schema("bundle-manifest.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")


def _validator() -> Draft202012Validator:
    # App Manifest's modules[] / sessions[] $ref common.schema; the registry
    # makes those cross-schema references resolvable.
    registry = build_schema_registry(BUNDLE_SCHEMA, COMMON_SCHEMA)
    return Draft202012Validator(
        BUNDLE_SCHEMA,
        format_checker=Draft202012Validator.FORMAT_CHECKER,
        registry=registry,
    )


def _fixture_bundle(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)["bundle"]


class TestAppManifestSchemaShape:
    def test_schema_is_well_formed(self) -> None:
        Draft202012Validator.check_schema(BUNDLE_SCHEMA)

    def test_title_reframed_as_app_manifest(self) -> None:
        assert "App Manifest" in BUNDLE_SCHEMA["title"]

    def test_required_top_level_properties(self) -> None:
        # `definitions` is REQUIRED (MAY be empty array for non-form apps);
        # singular `definition` is retired per ADR §5.2.
        assert set(BUNDLE_SCHEMA["required"]) == {
            "$formspecBundle",
            "version",
            "id",
            "definitions",
        }

    def test_formspec_bundle_accepts_current_two_x_versions(self) -> None:
        assert BUNDLE_SCHEMA["properties"]["$formspecBundle"]["enum"] == ["2.0", "2.1", "2.2"]

    def test_singular_definition_property_retired(self) -> None:
        assert "definition" not in BUNDLE_SCHEMA["properties"]

    def test_singular_registry_property_retired(self) -> None:
        assert "registry" not in BUNDLE_SCHEMA["properties"]

    def test_definitions_is_an_array(self) -> None:
        assert BUNDLE_SCHEMA["properties"]["definitions"]["type"] == "array"

    def test_registries_is_an_array(self) -> None:
        assert BUNDLE_SCHEMA["properties"]["registries"]["type"] == "array"

    def test_surfaces_is_an_array(self) -> None:
        assert BUNDLE_SCHEMA["properties"]["surfaces"]["type"] == "array"

    def test_data_sources_is_an_array_and_v2_1_or_later(self) -> None:
        assert BUNDLE_SCHEMA["properties"]["dataSources"]["type"] == "array"
        assert BUNDLE_SCHEMA["allOf"][0]["then"]["properties"]["$formspecBundle"]["enum"] == ["2.1", "2.2"]

    def test_components_is_an_array_and_v2_2_only(self) -> None:
        assert BUNDLE_SCHEMA["properties"]["components"]["type"] == "array"
        assert BUNDLE_SCHEMA["properties"]["components"]["items"]["$ref"] == "#/$defs/ComponentRef"
        assert BUNDLE_SCHEMA["allOf"][1]["then"]["properties"]["$formspecBundle"]["const"] == "2.2"

    def test_component_ref_requires_handle(self) -> None:
        component_ref = BUNDLE_SCHEMA["$defs"]["ComponentRef"]
        assert component_ref["required"] == ["url", "handle"]
        assert component_ref["properties"]["handle"]["$ref"] == "#/$defs/Slug"

    def test_modules_field_present(self) -> None:
        assert BUNDLE_SCHEMA["properties"]["modules"]["type"] == "array"

    def test_sessions_field_present(self) -> None:
        assert BUNDLE_SCHEMA["properties"]["sessions"]["type"] == "array"

    def test_additional_properties_false(self) -> None:
        assert BUNDLE_SCHEMA["additionalProperties"] is False


class TestAppManifestPositiveFixtures:
    def test_definition_only_validates(self) -> None:
        _validator().validate(_fixture_bundle("bundle-definition-only.json"))

    def test_full_singles_validates(self) -> None:
        _validator().validate(_fixture_bundle("bundle-full-singles.json"))

    def test_locales_and_mappings_validate(self) -> None:
        _validator().validate(_fixture_bundle("bundle-with-locales-and-mappings.json"))

    def test_multi_definition_app_validates(self) -> None:
        """ADR §5.2: definitions[] MAY hold more than one Definition."""
        _validator().validate(_fixture_bundle("app-multi-definition.json"))

    def test_non_form_app_validates(self) -> None:
        """ADR §5.2/§5.3: non-form apps carry definitions: []."""
        _validator().validate(_fixture_bundle("app-non-form.json"))

    def test_app_with_modules_and_sessions_validates(self) -> None:
        """ADR §5.2/§5.5: modules[] (ModuleRef) and sessions[] (SessionRef)."""
        _validator().validate(_fixture_bundle("app-with-modules-and-sessions.json"))

    def test_app_with_data_sources_v2_1_validates(self) -> None:
        """ADR 0153 gate 5: dataSources[] is an App Manifest v2.1 additive slot."""
        _validator().validate(_fixture_bundle("app-with-data-sources-v2-1.json"))

    def test_app_with_components_v2_2_validates(self) -> None:
        """ADR 0154 gate 3: components[] is an App Manifest v2.2 additive slot."""
        _validator().validate(_fixture_bundle("app-with-components-v2-2.json"))


class TestAppManifestNegativeFixtures:
    def test_missing_definitions_rejected(self) -> None:
        with pytest.raises(ValidationError) as excinfo:
            _validator().validate(_fixture_bundle("invalid-missing-definition.json"))
        assert "definitions" in str(excinfo.value)

    def test_unknown_property_rejected(self) -> None:
        with pytest.raises(ValidationError) as excinfo:
            _validator().validate(_fixture_bundle("invalid-unknown-property.json"))
        msg = str(excinfo.value).lower()
        assert "additional propert" in msg or "screener" in msg

    def test_bad_version_rejected(self) -> None:
        with pytest.raises(ValidationError) as excinfo:
            _validator().validate(_fixture_bundle("invalid-bad-version.json"))
        assert "version" in str(excinfo.value).lower() or "pattern" in str(excinfo.value).lower()

    def test_formspec_bundle_1_0_rejected(self) -> None:
        """ADR §11.2: $formspecBundle const bumps 1.0 -> 2.0 so strict-validating
        consumers fail-loud rather than silently mis-parse."""
        with pytest.raises(ValidationError) as excinfo:
            _validator().validate(_fixture_bundle("invalid-formspec-bundle-1-0.json"))
        assert "formspecBundle" in str(excinfo.value) or "2.0" in str(excinfo.value)

    def test_data_sources_on_two_zero_rejected(self) -> None:
        """dataSources[] is valid only for `$formspecBundle: "2.1"` or later."""
        with pytest.raises(ValidationError) as excinfo:
            _validator().validate(_fixture_bundle("invalid-data-sources-in-2-0.json"))
        assert "2.1" in str(excinfo.value) or "$formspecBundle" in str(excinfo.value)

    def test_components_on_two_one_rejected(self) -> None:
        """components[] is valid only for `$formspecBundle: "2.2"`."""
        with pytest.raises(ValidationError) as excinfo:
            _validator().validate(_fixture_bundle("invalid-components-in-2-1.json"))
        assert "2.2" in str(excinfo.value) or "$formspecBundle" in str(excinfo.value)
