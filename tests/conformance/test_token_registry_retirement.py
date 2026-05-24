"""Tests for ADR 0150 §2.3/§4.2/§10 Task 12 — token-registry.schema.json retirement.

The standalone token-registry.schema.json is retired. The runtime canonical token
document at packages/formspec-layout/src/token-registry.json (mirrored under
schemas/token-registry.json) survives unchanged. Structural validation of the
Category shape re-routes to theme.schema.json#/$defs/Category (inlined from the
retired schema) so theme.tokenMeta validation continues to work and the runtime
token-registry.json validates against the same inlined shape.

Asserts:
1. The retired schema file is gone.
2. The Category $def lives on theme.schema.json with the same structural shape.
3. The runtime token-registry.json validates against theme.schema.json#/$defs/Category
   for each category.
4. A malformed category (bogus TokenType) fails validation.
5. theme.tokenMeta authoring still works (regression — pre-existing contract).
"""

from __future__ import annotations

import json
from pathlib import Path

import jsonschema
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import (
    ROOT_DIR,
    SCHEMA_DIR,
    build_schema_registry,
    load_schema,
)


THEME_SCHEMA = load_schema("theme.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")
COMPONENT_SCHEMA = load_schema("component.schema.json")

_registry = build_schema_registry(COMMON_SCHEMA, THEME_SCHEMA, COMPONENT_SCHEMA)


# ─── 1. Retired schema is gone ────────────────────────────────────────

def test_canonical_token_registry_schema_deleted():
    assert not (SCHEMA_DIR / "token-registry.schema.json").exists(), (
        "schemas/token-registry.schema.json retires per ADR 0150 §2.3/§10 row 9"
    )


def test_lint_mirror_token_registry_schema_deleted():
    mirror = ROOT_DIR / "crates" / "formspec-lint" / "schemas" / "token-registry.schema.json"
    assert not mirror.exists(), (
        "crates/formspec-lint/schemas/token-registry.schema.json mirror retires"
    )


# ─── 2. Category $def lives on theme.schema.json ─────────────────────

def test_theme_schema_defs_carries_category():
    defs = THEME_SCHEMA.get("$defs", {})
    assert "Category" in defs, (
        "theme.schema.json must inline the Category $def previously sourced from "
        "token-registry.schema.json#/$defs/Category (tokenMeta.categories items)"
    )


def test_theme_schema_defs_carries_token_entry():
    defs = THEME_SCHEMA.get("$defs", {})
    assert "TokenEntry" in defs


def test_theme_schema_defs_carries_token_type():
    defs = THEME_SCHEMA.get("$defs", {})
    assert "TokenType" in defs
    assert defs["TokenType"]["enum"] == [
        "color",
        "dimension",
        "fontFamily",
        "fontWeight",
        "duration",
        "opacity",
        "shadow",
        "number",
    ]


def test_theme_token_meta_ref_targets_local_defs():
    token_meta = THEME_SCHEMA["properties"]["tokenMeta"]
    cat_ref = token_meta["properties"]["categories"]["additionalProperties"]["$ref"]
    assert cat_ref == "#/$defs/Category", (
        "tokenMeta.categories items must $ref the inlined #/$defs/Category, not "
        "the retired token-registry.schema.json URI"
    )


# ─── 3. Runtime token-registry.json validates against inlined Category ─

def _category_validator():
    """Validator for the Category $def, using the theme schema registry."""
    cat_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$ref": "https://formspec.org/schemas/theme/1.0#/$defs/Category",
    }
    return Draft202012Validator(cat_schema, registry=_registry)


def test_runtime_token_registry_categories_validate():
    """Each category in the runtime registry validates against #/$defs/Category."""
    registry = json.loads((SCHEMA_DIR / "token-registry.json").read_text())
    v = _category_validator()
    for cat_key, category in registry["categories"].items():
        errors = list(v.iter_errors(category))
        assert errors == [], (
            f"Runtime category '{cat_key}' must validate against the inlined "
            f"theme.schema.json#/$defs/Category shape. Errors: "
            f"{[e.message for e in errors]}"
        )


def test_malformed_token_type_fails_validation():
    """A category with a bogus TokenType must fail validation."""
    bad_category = {
        "type": "not-a-known-type",
        "tokens": {"color.primary": {"default": "#000"}},
    }
    v = _category_validator()
    errors = list(v.iter_errors(bad_category))
    assert errors, "Category with invalid TokenType must fail validation"


def test_malformed_token_entry_fails_validation():
    """A category with a TokenEntry containing an unknown property must fail."""
    bad_category = {
        "type": "color",
        "tokens": {
            "color.primary": {
                "default": "#000",
                "unknownField": "boom",
            }
        },
    }
    v = _category_validator()
    errors = list(v.iter_errors(bad_category))
    assert errors, (
        "TokenEntry sets additionalProperties: false; unknown fields must fail"
    )


# ─── 4. Regression: theme.tokenMeta still works ──────────────────────

def test_theme_with_tokenmeta_still_validates():
    """Theme document with custom tokenMeta.categories must still validate."""
    theme = {
        "$formspecTheme": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/form"},
        "tokenMeta": {
            "categories": {
                "x-agency": {
                    "description": "Agency branding tokens",
                    "type": "color",
                    "tokens": {
                        "x-agency.seal-color": {
                            "description": "Official agency seal color",
                            "type": "color",
                            "default": "#27594f",
                        }
                    },
                }
            }
        },
    }
    theme_v = Draft202012Validator(THEME_SCHEMA, registry=_registry)
    errors = list(theme_v.iter_errors(theme))
    assert errors == [], (
        f"Theme with tokenMeta must validate. Errors: "
        f"{[e.message for e in errors]}"
    )


def test_theme_with_tokenmeta_bogus_type_fails():
    """Theme document with tokenMeta carrying a bogus TokenType must fail."""
    theme = {
        "$formspecTheme": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/form"},
        "tokenMeta": {
            "categories": {
                "x-agency": {
                    "type": "bogus",
                    "tokens": {"x-agency.foo": {"default": "x"}},
                }
            }
        },
    }
    theme_v = Draft202012Validator(THEME_SCHEMA, registry=_registry)
    errors = list(theme_v.iter_errors(theme))
    assert errors, "Theme with tokenMeta carrying bogus TokenType must fail"


# ─── 5. No remaining stack-internal refs to the retired schema ────────

def test_no_remaining_loadbearing_schema_references():
    """Final-sweep guard: zero LOAD-BEARING references to the retired schema
    file in stack-internal source. Comments documenting the retirement are
    allowed (and expected) — what's forbidden is code that tries to actually
    load, include, or $ref the file.

    Excluded paths:
      - /dist/, /__pycache__/, /target/ — build/cache artifacts
      - generated/registry.ts — historical prose carried over from
        registry.schema.json's categoryShape description (a comment, not code)
      - schema_validation.rs, generate-theme-from-registry.mjs — the migration's
        own retirement-marker comments (lines starting with // or *)
    """
    import re
    import subprocess

    result = subprocess.run(
        [
            "grep",
            "-rn",
            "token-registry\\.schema\\.json",
            str(ROOT_DIR),
            "--include=*.rs",
            "--include=*.mjs",
            "--include=*.ts",
        ],
        capture_output=True,
        text=True,
    )

    loadbearing = []
    for line in result.stdout.strip().splitlines():
        if not line:
            continue
        path, _, rest = line.partition(":")
        if any(skip in path for skip in ("/dist/", "/__pycache__/", "/target/")):
            continue
        if path.endswith("packages/formspec-types/src/generated/registry.ts"):
            continue
        _, _, body = rest.partition(":")
        # Treat any line whose code content (post-leading-whitespace) starts
        # with a comment marker as documentation, not load-bearing.
        stripped = body.strip()
        if re.match(r"^(//|/\*|\*|#)", stripped):
            continue
        loadbearing.append(line)

    assert loadbearing == [], (
        f"Load-bearing references to retired schema file remain: {loadbearing}"
    )
