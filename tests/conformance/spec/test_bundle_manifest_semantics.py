"""Spec-semantics tests for the App Manifest (formerly Bundle Manifest)
beyond schema acceptance.

Schema validates structural shape. This file enforces semantics that
JSON Schema cannot express: version-specific Locale uniqueness, mapping and
component handles, screener URLs, exact entry-Surface membership, and sibling
URL distinctness from app `id`.

Per ADR 0150 §5.2/§5.3/§11.2 the singular `definition`/`registry`
slots reframe as `definitions[]`/`registries[]`; the URL-collection
helper iterates the array slots accordingly.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "bundle"


def _bundle(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)["bundle"]


def _locale_tags(bundle: dict) -> list[str]:
    return [entry["locale"] for entry in bundle.get("locales", [])]


def _locale_urls(bundle: dict) -> list[str]:
    return [entry["url"] for entry in bundle.get("locales", [])]


def _mapping_handles(bundle: dict) -> list[str]:
    return [entry["handle"] for entry in bundle.get("mappings", [])]


def _component_handles(bundle: dict) -> list[str]:
    return [entry["handle"] for entry in bundle.get("components", [])]


def _screener_urls(bundle: dict) -> list[str]:
    return [entry["url"] for entry in bundle.get("screeners", [])]


class TestBundleArrayUniqueness:
    def test_locales_array_has_unique_tags_positive(self) -> None:
        bundle = _bundle("bundle-with-locales-and-mappings.json")
        tags = _locale_tags(bundle)
        assert len(tags) == len(set(tags))

    def test_locales_array_rejects_duplicate_tags(self) -> None:
        bundle = _bundle("invalid-duplicate-locale-tag.json")
        assert bundle["$formspecBundle"] in {"2.0", "2.1", "2.2", "2.3"}
        tags = _locale_tags(bundle)
        assert len(tags) != len(set(tags)), "fixture must contain a duplicate locale tag"

    def test_v2_4_locales_may_repeat_tag_for_distinct_urls(self) -> None:
        bundle = _bundle("app-locales-target-aware-v2-4.json")
        tags = _locale_tags(bundle)
        urls = _locale_urls(bundle)
        assert len(tags) != len(set(tags))
        assert len(urls) == len(set(urls))

    def test_v2_4_locales_reject_duplicate_urls(self) -> None:
        bundle = _bundle("invalid-duplicate-locale-url-v2-4.json")
        urls = _locale_urls(bundle)
        assert len(urls) != len(set(urls)), (
            "fixture must contain a duplicate Locale reference URL"
        )

    def test_mappings_array_has_unique_handles_positive(self) -> None:
        bundle = _bundle("bundle-with-locales-and-mappings.json")
        handles = _mapping_handles(bundle)
        assert len(handles) == len(set(handles))

    def test_mappings_array_rejects_duplicate_handles(self) -> None:
        bundle = _bundle("invalid-duplicate-mapping-handle.json")
        handles = _mapping_handles(bundle)
        assert len(handles) != len(set(handles)), "fixture must contain a duplicate handle"

    def test_components_array_has_unique_handles_positive(self) -> None:
        bundle = _bundle("app-with-components-v2-2.json")
        handles = _component_handles(bundle)
        assert len(handles) == len(set(handles))

    def test_components_array_rejects_duplicate_handles(self) -> None:
        bundle = _bundle("invalid-duplicate-component-handle.json")
        handles = _component_handles(bundle)
        assert len(handles) != len(set(handles)), "fixture must contain a duplicate handle"

    def test_component_default_handle_conflicts_with_singular_component(self) -> None:
        bundle = _bundle("invalid-component-default-handle-conflict.json")
        assert "component" in bundle
        assert "default" in _component_handles(bundle), (
            "fixture must contain a normalized default-handle conflict"
        )

    def test_screeners_array_has_unique_urls_positive(self) -> None:
        bundle = _bundle("app-with-screeners-v2-3.json")
        urls = _screener_urls(bundle)
        assert len(urls) == len(set(urls))

    def test_screeners_array_rejects_duplicate_urls(self) -> None:
        bundle = _bundle("invalid-duplicate-screener-url.json")
        urls = _screener_urls(bundle)
        assert len(urls) != len(set(urls)), "fixture must contain a duplicate screener URL"


def _all_sibling_urls(bundle: dict) -> list[str]:
    urls: list[str] = []
    # Single-cardinality slots (unchanged by the reframe).
    for key in ("experience", "responseActions", "component",
                "theme", "references", "ontology"):
        if key in bundle:
            urls.append(bundle[key]["url"])
    # Array-cardinality slots — includes the pluralized definitions[] /
    # registries[] / surfaces[] per ADR 0150 §5.2, alongside v2.1
    # dataSources[], v2.2 components[], v2.3 screeners[], and the existing
    # locales[] / mappings[].
    for key in ("definitions", "registries", "surfaces", "dataSources", "components", "screeners", "locales", "mappings"):
        for entry in bundle.get(key, []):
            urls.append(entry["url"])
    return urls


class TestAppManifestIdDistinctness:
    def test_app_id_distinct_from_sibling_urls(self) -> None:
        bundle = _bundle("bundle-full-singles.json")
        assert bundle["id"] not in _all_sibling_urls(bundle), (
            "App Manifest `id` MUST be distinct from any sibling URL"
        )

    def test_app_id_collision_with_sibling_url_rejected(self) -> None:
        bundle = _bundle("invalid-id-equals-sibling-url.json")
        assert bundle["id"] in _all_sibling_urls(bundle), (
            "fixture must collide app `id` with a sibling URL"
        )


class TestAppManifestDataSources:
    def test_data_sources_urls_participate_in_sibling_identity(self) -> None:
        bundle = _bundle("app-with-data-sources-v2-1.json")

        data_source_urls = [entry["url"] for entry in bundle["dataSources"]]

        assert data_source_urls
        assert set(data_source_urls).issubset(set(_all_sibling_urls(bundle)))
        assert bundle["id"] not in data_source_urls


class TestAppManifestComponents:
    def test_component_urls_participate_in_sibling_identity(self) -> None:
        bundle = _bundle("app-with-components-v2-2.json")

        component_urls = [entry["url"] for entry in bundle["components"]]

        assert component_urls
        assert set(component_urls).issubset(set(_all_sibling_urls(bundle)))
        assert bundle["id"] not in component_urls


class TestAppManifestScreeners:
    def test_screener_urls_participate_in_sibling_identity(self) -> None:
        bundle = _bundle("app-with-screeners-v2-3.json")

        screener_urls = _screener_urls(bundle)

        assert screener_urls
        assert set(screener_urls).issubset(set(_all_sibling_urls(bundle)))
        assert bundle["id"] not in screener_urls


class TestAppManifestEntrySurface:
    def test_explicit_entry_surface_matches_exactly_one_reference_url(self) -> None:
        bundle = _bundle("app-entry-explicit-v2-4.json")
        surface_urls = [ref["url"] for ref in bundle["surfaces"]]
        assert surface_urls.count(bundle["entrySurface"]) == 1

    def test_unresolved_entry_surface_fixture_has_no_alias_match(self) -> None:
        fixture_path = FIXTURES_DIR / "invalid-entry-surface-unresolved-v2-4.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
        bundle = fixture["bundle"]
        surface_urls = [ref["url"] for ref in bundle["surfaces"]]
        assert bundle["entrySurface"] not in surface_urls
        assert fixture["expected"] == {
            "valid": False,
            "phase": "cross-artifact",
            "diagnostic": "APP-ENTRY-SURFACE-UNRESOLVED",
        }
