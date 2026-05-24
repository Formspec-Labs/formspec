"""Spec-semantics tests for the App Manifest (formerly Bundle Manifest)
beyond schema acceptance.

Schema validates structural shape. This file enforces semantics that
JSON Schema cannot express: per-array uniqueness keys (locale tag,
mapping handle) and sibling-URL distinctness from app `id`.

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


def _mapping_handles(bundle: dict) -> list[str]:
    return [entry["handle"] for entry in bundle.get("mappings", [])]


class TestBundleArrayUniqueness:
    def test_locales_array_has_unique_tags_positive(self) -> None:
        bundle = _bundle("bundle-with-locales-and-mappings.json")
        tags = _locale_tags(bundle)
        assert len(tags) == len(set(tags))

    def test_locales_array_rejects_duplicate_tags(self) -> None:
        bundle = _bundle("invalid-duplicate-locale-tag.json")
        tags = _locale_tags(bundle)
        assert len(tags) != len(set(tags)), "fixture must contain a duplicate locale tag"

    def test_mappings_array_has_unique_handles_positive(self) -> None:
        bundle = _bundle("bundle-with-locales-and-mappings.json")
        handles = _mapping_handles(bundle)
        assert len(handles) == len(set(handles))

    def test_mappings_array_rejects_duplicate_handles(self) -> None:
        bundle = _bundle("invalid-duplicate-mapping-handle.json")
        handles = _mapping_handles(bundle)
        assert len(handles) != len(set(handles)), "fixture must contain a duplicate handle"


def _all_sibling_urls(bundle: dict) -> list[str]:
    urls: list[str] = []
    # Single-cardinality slots (unchanged by the reframe).
    for key in ("experience", "responseActions", "component",
                "theme", "references", "ontology"):
        if key in bundle:
            urls.append(bundle[key]["url"])
    # Array-cardinality slots — includes the pluralized definitions[] /
    # registries[] / surfaces[] per ADR 0150 §5.2, alongside the existing
    # locales[] / mappings[].
    for key in ("definitions", "registries", "surfaces", "locales", "mappings"):
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
