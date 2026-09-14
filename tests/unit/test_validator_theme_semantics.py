"""Tests for theme document semantic checks (W705-W711, E710).

Covers cross-artifact checks (items keys -> definition, page region keys -> definition,
targetDefinition URL match) and single-document checks (duplicate page IDs,
responsive keys vs breakpoints).
"""

from __future__ import annotations

import pytest

from formspec._rust import lint


def _minimal_definition(**overrides: object) -> dict:
    """Minimal valid definition with a flat item + nested group for path testing."""
    base: dict = {
        "$formspec": "1.0",
        "url": "https://example.com/forms/test",
        "version": "1.0.0",
        "status": "draft",
        "title": "Test",
        "items": [
            {"key": "name", "type": "field", "label": "Name", "dataType": "string"},
            {
                "key": "address",
                "type": "group",
                "label": "Address",
                "children": [
                    {"key": "street", "type": "field", "label": "Street", "dataType": "string"},
                    {"key": "city", "type": "field", "label": "City", "dataType": "string"},
                ],
            },
        ],
    }
    base.update(overrides)
    return base


def _minimal_theme(**overrides: object) -> dict:
    """Minimal valid theme document."""
    base: dict = {
        "$formspecTheme": "1.0",
        "version": "1.0.0",
        "name": "test-theme",
        "title": "Test Theme",
        "platform": "web",
        "tokens": {},
    }
    base.update(overrides)
    return base


def _paired_theme(**overrides: object) -> dict:
    """Definition-scoped theme targeting ``_minimal_definition()``.

    W705/W706 resolve keys only for a Definition-scoped theme; a theme with no
    ``targetDefinition`` is bundle-scoped and suspends them (theme spec §7.2).
    """
    return _minimal_theme(targetDefinition={"url": "https://example.com/forms/test"}, **overrides)


# -- W705: items keys that don't match definition item paths --


def test_w705_fires_for_unresolved_items_key() -> None:
    theme = _paired_theme(items={"nonexistent.field": {"style": {"color": "red"}}})
    definition = _minimal_definition()

    diagnostics = lint(theme, component_definition=definition)

    w705 = [d for d in diagnostics if d.code == "W705"]
    assert len(w705) == 1
    assert "nonexistent.field" in w705[0].message


def test_w705_clean_for_valid_items_key() -> None:
    theme = _paired_theme(items={"address.street": {"style": {"color": "red"}}})
    definition = _minimal_definition()

    diagnostics = lint(theme, component_definition=definition)

    assert not any(d.code == "W705" for d in diagnostics)


def test_w705_skipped_without_definition() -> None:
    """Without a definition document, W705 should not fire (single-doc lint)."""
    theme = _minimal_theme(items={"bogus": {"style": {"color": "red"}}})

    diagnostics = lint(theme)

    assert not any(d.code == "W705" for d in diagnostics)


def test_w705_accepts_top_level_key() -> None:
    theme = _paired_theme(items={"name": {"style": {"color": "red"}}})
    definition = _minimal_definition()

    diagnostics = lint(theme, component_definition=definition)

    assert not any(d.code == "W705" for d in diagnostics)


# -- W706: page region keys that don't match definition item paths --


def test_w706_fires_for_unresolved_region_key() -> None:
    theme = _paired_theme(
        pages=[
            {
                "id": "p1",
                "title": "Page 1",
                "regions": [{"key": "missingGroup", "span": 12}],
            }
        ]
    )
    definition = _minimal_definition()

    diagnostics = lint(theme, component_definition=definition)

    w706 = [d for d in diagnostics if d.code == "W706"]
    assert len(w706) == 1
    assert "missingGroup" in w706[0].message


def test_w706_clean_for_valid_region_key() -> None:
    theme = _paired_theme(
        pages=[
            {
                "id": "p1",
                "title": "Page 1",
                "regions": [{"key": "address", "span": 12}],
            }
        ]
    )
    definition = _minimal_definition()

    diagnostics = lint(theme, component_definition=definition)

    assert not any(d.code == "W706" for d in diagnostics)


def test_w706_skipped_without_definition() -> None:
    """Without a definition document, W706 should not fire (single-doc lint)."""
    theme = _minimal_theme(
        pages=[
            {
                "id": "p1",
                "title": "Page 1",
                "regions": [{"key": "bogus", "span": 12}],
            }
        ]
    )

    diagnostics = lint(theme)

    assert not any(d.code == "W706" for d in diagnostics)


def test_w705_w706_suspended_for_bundle_scoped_theme() -> None:
    """No targetDefinition: keys are not resolved against a caller-paired Definition."""
    theme = _minimal_theme(
        items={"bogus": {"style": {"color": "red"}}},
        pages=[{"id": "p1", "title": "Page 1", "regions": [{"key": "missingGroup", "span": 12}]}],
    )
    definition = _minimal_definition()

    diagnostics = lint(theme, component_definition=definition)

    assert not any(d.code in ("W705", "W706") for d in diagnostics)


# -- W707: targetDefinition.url doesn't match definition URL --


def test_w707_fires_for_url_mismatch() -> None:
    theme = _minimal_theme(
        targetDefinition={
            "url": "https://example.com/forms/other",
            "compatibleVersions": ">=1.0.0",
        }
    )
    definition = _minimal_definition()

    diagnostics = lint(theme, component_definition=definition)

    w707 = [d for d in diagnostics if d.code == "W707"]
    assert len(w707) == 1


def test_w707_clean_for_matching_url() -> None:
    theme = _minimal_theme(
        targetDefinition={
            "url": "https://example.com/forms/test",
            "compatibleVersions": ">=1.0.0",
        }
    )
    definition = _minimal_definition()

    diagnostics = lint(theme, component_definition=definition)

    assert not any(d.code == "W707" for d in diagnostics)


def test_w707_skipped_without_definition() -> None:
    """Without a definition document, W707 should not fire (single-doc lint)."""
    theme = _minimal_theme(
        targetDefinition={
            "url": "https://example.com/forms/other",
        }
    )

    diagnostics = lint(theme)

    assert not any(d.code == "W707" for d in diagnostics)


# -- E710: duplicate page IDs --


def test_e710_fires_for_duplicate_page_ids() -> None:
    theme = _minimal_theme(
        pages=[
            {"id": "p1", "title": "Page 1", "regions": []},
            {"id": "p1", "title": "Page 2", "regions": []},
        ]
    )

    diagnostics = lint(theme)

    e710 = [d for d in diagnostics if d.code == "E710"]
    assert len(e710) == 1
    assert "p1" in e710[0].message


def test_e710_clean_for_unique_page_ids() -> None:
    theme = _minimal_theme(
        pages=[
            {"id": "p1", "title": "Page 1", "regions": []},
            {"id": "p2", "title": "Page 2", "regions": []},
        ]
    )

    diagnostics = lint(theme)

    assert not any(d.code == "E710" for d in diagnostics)


# -- W711: responsive keys not in breakpoints --


def test_w711_fires_for_unknown_responsive_breakpoint() -> None:
    theme = _minimal_theme(
        breakpoints={"sm": 480, "md": 768},
        pages=[
            {
                "id": "p1",
                "title": "Page 1",
                "regions": [
                    {"key": "name", "span": 12, "responsive": {"xl": {"span": 6}}},
                ],
            }
        ],
    )

    diagnostics = lint(theme)

    w711 = [d for d in diagnostics if d.code == "W711"]
    assert len(w711) == 1
    assert "xl" in w711[0].message


def test_w711_clean_for_known_breakpoint() -> None:
    theme = _minimal_theme(
        breakpoints={"sm": 480, "md": 768},
        pages=[
            {
                "id": "p1",
                "title": "Page 1",
                "regions": [
                    {"key": "name", "span": 12, "responsive": {"sm": {"span": 6}}},
                ],
            }
        ],
    )

    diagnostics = lint(theme)

    assert not any(d.code == "W711" for d in diagnostics)
