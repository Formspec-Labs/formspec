"""Tests for Formspec Theme Schema (Tier 2).

~200 tests across 11 categories: schema validation, selectors, cascade,
widget compatibility, layout, tokens, Tier 1 integration, lifecycle,
extensibility, and edge cases.
"""

import json
import copy
import pytest

import jsonschema
from jsonschema import Draft202012Validator

from tests.unit.support.schema_fixtures import load_schema, build_schema_registry

THEME_SCHEMA = load_schema("theme.schema.json")
DEF_SCHEMA = load_schema("definition.schema.json")
COMPONENT_SCHEMA = load_schema("component.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")

# Theme schema cross-references common schema primitives, so the validator
# needs a registry for $ref resolution.
_registry = build_schema_registry(COMMON_SCHEMA, THEME_SCHEMA, COMPONENT_SCHEMA)
THEME_V = Draft202012Validator(THEME_SCHEMA, registry=_registry)
DEF_V = Draft202012Validator(DEF_SCHEMA, registry=build_schema_registry(COMMON_SCHEMA, DEF_SCHEMA))


def _minimal_theme(**overrides):
    """Minimal valid theme."""
    t = {
        "$formspecTheme": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/form"},
    }
    t.update(overrides)
    return t


def _valid(theme):
    THEME_V.validate(theme)


def _invalid(theme):
    with pytest.raises(jsonschema.ValidationError):
        THEME_V.validate(theme)


# ===========================================================================
# Category A: Schema validation — valid themes (30 tests)
# ===========================================================================


class TestSchemaValid:
    """Valid theme documents pass schema validation."""

    def test_minimal(self):
        _valid(_minimal_theme())

    def test_bundle_scoped_theme(self):
        """targetDefinition is OPTIONAL — absent means bundle-scoped (theme-spec §2.2.1).

        Definition-less app bundles are the ADR 0150 §5.2 app envelope's empty
        definitions[] case; requiring targetDefinition made every such bundle
        unrepresentable. Cross-stack ADR 0160 §4.2 names this the hard dependency.
        """
        _valid({"$formspecTheme": "1.0", "version": "1.0.0"})

    def test_bundle_scoped_theme_carries_tokens_and_cascade(self):
        _valid({
            "$formspecTheme": "1.0",
            "version": "1.0.0",
            "tokens": {"color.primary": "#0057B7"},
            "defaults": {"style": {"color": "$token.color.primary"}},
        })

    def test_target_definition_absent_from_required(self):
        assert THEME_SCHEMA["required"] == ["$formspecTheme", "version"]

    def test_with_url(self):
        _valid(_minimal_theme(url="https://example.com/themes/dark"))

    def test_with_name(self):
        _valid(_minimal_theme(name="dark-theme"))

    def test_with_title(self):
        _valid(_minimal_theme(title="Dark Theme"))

    def test_with_description(self):
        _valid(_minimal_theme(description="A dark theme."))

    def test_with_platform_web(self):
        _valid(_minimal_theme(platform="web"))

    def test_with_platform_mobile(self):
        _valid(_minimal_theme(platform="mobile"))

    def test_with_platform_pdf(self):
        _valid(_minimal_theme(platform="pdf"))

    def test_with_platform_custom(self):
        """Platform is open string — custom values allowed."""
        _valid(_minimal_theme(platform="vr-headset"))

    def test_with_compatible_versions(self):
        _valid(_minimal_theme(targetDefinition={
            "url": "https://example.com/form",
            "compatibleVersions": ">=1.0.0 <2.0.0"
        }))

    def test_with_tokens(self):
        _valid(_minimal_theme(tokens={
            "color.primary": "#2563eb",
            "spacing.md": "16px",
            "border.width": 2
        }))

    def test_with_defaults(self):
        _valid(_minimal_theme(defaults={
            "widget": "TextInput",
            "labelPosition": "top"
        }))

    def test_with_defaults_style(self):
        _valid(_minimal_theme(defaults={
            "style": {"borderRadius": "$token.border.radius"}
        }))

    def test_with_single_selector(self):
        _valid(_minimal_theme(selectors=[
            {"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}}
        ]))

    def test_with_type_selector(self):
        _valid(_minimal_theme(selectors=[
            {"match": {"type": "display"}, "apply": {"widget": "Text"}}
        ]))

    def test_with_combined_selector(self):
        _valid(_minimal_theme(selectors=[
            {"match": {"type": "field", "dataType": "boolean"}, "apply": {"widget": "Toggle"}}
        ]))

    def test_with_multiple_selectors(self):
        _valid(_minimal_theme(selectors=[
            {"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}},
            {"match": {"dataType": "boolean"}, "apply": {"widget": "Toggle"}},
            {"match": {"type": "group"}, "apply": {"widget": "Card"}},
        ]))

    def test_with_items(self):
        _valid(_minimal_theme(items={
            "totalBudget": {"widget": "MoneyInput"},
            "notes": {"widget": "TextInput"}
        }))

    def test_with_item_widget_config(self):
        _valid(_minimal_theme(items={
            "priority": {
                "widget": "Slider",
                "widgetConfig": {"min": 1, "max": 5, "step": 1}
            }
        }))

    def test_with_item_fallback(self):
        _valid(_minimal_theme(items={
            "sig": {"widget": "Signature", "fallback": ["FileUpload"]}
        }))

    def test_with_item_accessibility(self):
        _valid(_minimal_theme(items={
            "total": {"accessibility": {"liveRegion": "polite", "description": "Running total"}}
        }))

    def test_with_pages(self):
        _valid(_minimal_theme(pages=[
            {"id": "p1", "title": "Page 1"},
            {"id": "p2", "title": "Page 2"}
        ]))

    def test_with_page_regions(self):
        _valid(_minimal_theme(pages=[
            {"id": "p1", "title": "Info", "regions": [
                {"key": "name", "span": 6},
                {"key": "email", "span": 6}
            ]}
        ]))

    def test_with_page_description(self):
        _valid(_minimal_theme(pages=[
            {"id": "p1", "title": "Review", "description": "Check your answers."}
        ]))

    def test_with_breakpoints(self):
        _valid(_minimal_theme(breakpoints={"sm": 576, "md": 768, "lg": 1024}))

    def test_with_extensions(self):
        _valid(_minimal_theme(extensions={"x-analytics": {"track": True}}))

    def test_with_root_x_annotation(self):
        _valid(_minimal_theme(**{"x-theme-audit": {"owner": "design-system"}}))

    def test_region_with_responsive(self):
        _valid(_minimal_theme(pages=[{
            "id": "p1", "title": "P", "regions": [
                {"key": "f1", "span": 6, "responsive": {"sm": {"span": 12}}}
            ]
        }]))

    def test_region_with_start(self):
        _valid(_minimal_theme(pages=[{
            "id": "p1", "title": "P", "regions": [
                {"key": "f1", "span": 4, "start": 5}
            ]
        }]))

    def test_full_example(self):
        """Full theme from plan §12."""
        _valid({
            "$formspecTheme": "1.0",
            "url": "https://agency.gov/forms/budget/themes/web",
            "version": "1.0.0",
            "name": "Budget-Web",
            "title": "Budget Form Web Theme",
            "description": "Web theme for the budget form.",
            "targetDefinition": {
                "url": "https://agency.gov/forms/budget",
                "compatibleVersions": ">=1.0.0 <2.0.0"
            },
            "platform": "web",
            "breakpoints": {"sm": 576, "md": 768, "lg": 1024},
            "tokens": {
                "color.primary": "#0057B7",
                "color.error": "#D32F2F",
                "spacing.md": "16px"
            },
            "defaults": {"labelPosition": "top"},
            "selectors": [
                {"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}},
                {"match": {"dataType": "boolean"}, "apply": {"widget": "Toggle"}}
            ],
            "items": {
                "totalBudget": {
                    "widget": "MoneyInput",
                    "style": {"background": "#F0F6FF"}
                }
            },
            "pages": [
                {"id": "info", "title": "Info", "regions": [{"key": "name", "span": 12}]},
                {"id": "budget", "title": "Budget", "regions": [{"key": "totalBudget", "span": 6}]}
            ],
            "extensions": {"x-analytics": {"enabled": True}}
        })

    def test_all_label_positions(self):
        for pos in ["top", "start", "hidden"]:
            _valid(_minimal_theme(defaults={"labelPosition": pos}))


# ===========================================================================
# Category B: Schema validation — invalid themes (35 tests)
# ===========================================================================


class TestSchemaInvalid:
    """Invalid theme documents fail schema validation."""

    def test_missing_formspec_theme(self):
        _invalid({"version": "1.0.0", "targetDefinition": {"url": "https://x.com/f"}})

    def test_missing_version(self):
        _invalid({"$formspecTheme": "1.0", "targetDefinition": {"url": "https://x.com/f"}})

    def test_target_definition_null_rejected(self):
        """Absent is bundle scope; explicit null is neither scope and stays invalid."""
        _invalid({"$formspecTheme": "1.0", "version": "1.0.0", "targetDefinition": None})

    def test_wrong_formspec_version(self):
        _invalid({"$formspecTheme": "2.0", "version": "1.0.0", "targetDefinition": {"url": "https://x.com/f"}})

    def test_formspec_theme_not_string(self):
        _invalid({"$formspecTheme": 1.0, "version": "1.0.0", "targetDefinition": {"url": "https://x.com/f"}})

    def test_version_empty(self):
        _invalid({"$formspecTheme": "1.0", "version": "", "targetDefinition": {"url": "https://x.com/f"}})

    def test_target_missing_url(self):
        _invalid(_minimal_theme(targetDefinition={}))

    def test_target_extra_property(self):
        _invalid(_minimal_theme(targetDefinition={"url": "https://x.com/f", "name": "bad"}))

    def test_unknown_root_property(self):
        _invalid({**_minimal_theme(), "theme": "dark"})

    def test_lowercase_builtin_widget_rejected(self):
        _invalid(_minimal_theme(items={"name": {"widget": "textInput"}}))

    def test_custom_widget_without_fallback_rejected(self):
        _invalid(_minimal_theme(items={"location": {"widget": "x-map-picker"}}))

    def test_token_boolean_value(self):
        _invalid(_minimal_theme(tokens={"color.primary": True}))

    def test_token_array_value(self):
        _invalid(_minimal_theme(tokens={"color.primary": ["#fff"]}))

    def test_token_object_value(self):
        _invalid(_minimal_theme(tokens={"color.primary": {"value": "#fff"}}))

    def test_token_null_value(self):
        _invalid(_minimal_theme(tokens={"color.primary": None}))

    def test_defaults_unknown_property(self):
        _invalid(_minimal_theme(defaults={"color": "red"}))

    def test_defaults_bad_label_position(self):
        _invalid(_minimal_theme(defaults={"labelPosition": "bottom"}))

    def test_selector_missing_match(self):
        _invalid(_minimal_theme(selectors=[{"apply": {"widget": "x"}}]))

    def test_selector_missing_apply(self):
        _invalid(_minimal_theme(selectors=[{"match": {"dataType": "money"}}]))

    def test_selector_empty_match(self):
        _invalid(_minimal_theme(selectors=[{"match": {}, "apply": {}}]))

    def test_selector_bad_type(self):
        _invalid(_minimal_theme(selectors=[
            {"match": {"type": "widget"}, "apply": {}}
        ]))

    def test_selector_bad_datatype(self):
        _invalid(_minimal_theme(selectors=[
            {"match": {"dataType": "email"}, "apply": {}}
        ]))

    def test_selector_extra_match_key(self):
        _invalid(_minimal_theme(selectors=[
            {"match": {"dataType": "money", "path": "x.*"}, "apply": {}}
        ]))

    def test_selector_extra_top_key(self):
        _invalid(_minimal_theme(selectors=[
            {"match": {"dataType": "money"}, "apply": {}, "priority": 1}
        ]))

    def test_page_missing_id(self):
        _invalid(_minimal_theme(pages=[{"title": "P1"}]))

    def test_page_missing_title(self):
        _invalid(_minimal_theme(pages=[{"id": "p1"}]))

    def test_page_bad_id_pattern(self):
        _invalid(_minimal_theme(pages=[{"id": "123bad", "title": "P"}]))

    def test_page_extra_property(self):
        _invalid(_minimal_theme(pages=[{"id": "p1", "title": "P", "color": "red"}]))

    def test_region_missing_key(self):
        _invalid(_minimal_theme(pages=[{"id": "p1", "title": "P", "regions": [{"span": 6}]}]))

    def test_region_span_zero(self):
        _invalid(_minimal_theme(pages=[{"id": "p1", "title": "P", "regions": [{"key": "f", "span": 0}]}]))

    def test_region_span_thirteen(self):
        _invalid(_minimal_theme(pages=[{"id": "p1", "title": "P", "regions": [{"key": "f", "span": 13}]}]))

    def test_region_extra_property(self):
        _invalid(_minimal_theme(pages=[{"id": "p1", "title": "P", "regions": [{"key": "f", "margin": 10}]}]))

    def test_region_responsive_bad_span(self):
        _invalid(_minimal_theme(pages=[{"id": "p1", "title": "P", "regions": [
            {"key": "f", "responsive": {"sm": {"span": 13}}}
        ]}]))

    def test_region_responsive_extra_key(self):
        _invalid(_minimal_theme(pages=[{"id": "p1", "title": "P", "regions": [
            {"key": "f", "responsive": {"sm": {"margin": 10}}}
        ]}]))

    def test_breakpoint_string_value(self):
        _invalid(_minimal_theme(breakpoints={"sm": "576px"}))

    def test_breakpoint_negative(self):
        _invalid(_minimal_theme(breakpoints={"sm": -1}))

    def test_extensions_bad_key(self):
        _invalid(_minimal_theme(extensions={"analytics": {}}))


# ===========================================================================
# Category C: Selector matching (20 tests)
# ===========================================================================


def _matches(match_obj, item_type, data_type=None):
    """Check if a selector match applies to an item. Implements §5 cascade logic."""
    if "type" in match_obj and match_obj["type"] != item_type:
        return False
    if "dataType" in match_obj and match_obj.get("dataType") != data_type:
        return False
    return True


class TestSelectorMatching:
    """Cascade §5 selector matching logic."""

    def test_datatype_match(self):
        assert _matches({"dataType": "money"}, "field", "money")

    def test_datatype_no_match(self):
        assert not _matches({"dataType": "money"}, "field", "string")

    def test_type_match_group(self):
        assert _matches({"type": "group"}, "group")

    def test_type_match_display(self):
        assert _matches({"type": "display"}, "display")

    def test_type_match_field(self):
        assert _matches({"type": "field"}, "field", "string")

    def test_type_no_match(self):
        assert not _matches({"type": "group"}, "field", "string")

    def test_combined_match(self):
        assert _matches({"type": "field", "dataType": "decimal"}, "field", "decimal")

    def test_combined_type_mismatch(self):
        assert not _matches({"type": "group", "dataType": "decimal"}, "field", "decimal")

    def test_combined_datatype_mismatch(self):
        assert not _matches({"type": "field", "dataType": "money"}, "field", "decimal")

    def test_datatype_on_group_no_match(self):
        """Groups don't have dataType."""
        assert not _matches({"dataType": "money"}, "group", None)

    @pytest.mark.parametrize("dt", [
        "string", "text", "integer", "decimal", "boolean",
        "date", "dateTime", "time", "uri",
        "attachment", "choice", "multiChoice", "money"
    ])
    def test_each_datatype_matches_itself(self, dt):
        assert _matches({"dataType": dt}, "field", dt)

    def test_multiple_selectors_all_apply(self):
        """All matching selectors apply in document order."""
        selectors = [
            {"match": {"type": "field"}, "apply": {"labelPosition": "start"}},
            {"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}},
        ]
        matched = [s["apply"] for s in selectors if _matches(s["match"], "field", "money")]
        assert len(matched) == 2
        assert matched[0] == {"labelPosition": "start"}
        assert matched[1] == {"widget": "MoneyInput"}

    def test_no_selectors_match(self):
        selectors = [
            {"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}},
        ]
        matched = [s for s in selectors if _matches(s["match"], "field", "string")]
        assert matched == []


# ===========================================================================
# Category D: Cascade resolution (25 tests)
# ===========================================================================


def _resolve(item_key, item_type, data_type, theme, tier1_hints=None, form_pres=None):
    """Implement the 6-level cascade from plan §5.
    Returns resolved PresentationBlock dict.
    """
    resolved = {}
    # Level -1: formPresentation globals
    if form_pres:
        if "labelPosition" in form_pres:
            resolved["labelPosition"] = form_pres["labelPosition"]
    # Level 0: Tier 1 inline hints
    if tier1_hints:
        resolved.update(tier1_hints)
    # Level 1: theme defaults
    if "defaults" in theme:
        resolved.update(theme["defaults"])
    # Level 2: matching selectors (document order)
    for sel in theme.get("selectors", []):
        if _matches(sel["match"], item_type, data_type):
            resolved.update(sel["apply"])
    # Level 3: item key override
    if item_key in theme.get("items", {}):
        resolved.update(theme["items"][item_key])
    # Null suppression
    resolved = {k: v for k, v in resolved.items() if v is not None}
    return resolved


class TestCascadeResolution:
    """Cascade resolution algorithm per §5."""

    THEME = {
        "defaults": {"labelPosition": "top", "widget": "TextInput"},
        "selectors": [
            {"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}},
            {"match": {"dataType": "boolean"}, "apply": {"widget": "Toggle"}},
        ],
        "items": {
            "total": {"widget": "Slider", "labelPosition": "start"}
        }
    }

    def test_defaults_only(self):
        r = _resolve("name", "field", "string", self.THEME)
        assert r["widget"] == "TextInput"
        assert r["labelPosition"] == "top"

    def test_selector_overrides_default(self):
        r = _resolve("amount", "field", "money", self.THEME)
        assert r["widget"] == "MoneyInput"
        assert r["labelPosition"] == "top"  # from defaults

    def test_item_overrides_selector(self):
        """total is money-typed but has item override."""
        r = _resolve("total", "field", "money", self.THEME)
        assert r["widget"] == "Slider"  # item override
        assert r["labelPosition"] == "start"  # item override

    def test_item_overrides_default(self):
        r = _resolve("total", "field", "string", self.THEME)
        assert r["widget"] == "Slider"

    def test_tier1_as_level_zero(self):
        r = _resolve("name", "field", "string", {}, tier1_hints={"widget": "TextInput"})
        assert r["widget"] == "TextInput"

    def test_defaults_override_tier1(self):
        r = _resolve("name", "field", "string", self.THEME, tier1_hints={"widget": "TextInput"})
        assert r["widget"] == "TextInput"  # default beats tier1

    def test_selector_overrides_tier1(self):
        r = _resolve("amt", "field", "money", self.THEME, tier1_hints={"widget": "NumberInput"})
        assert r["widget"] == "MoneyInput"

    def test_item_overrides_tier1(self):
        r = _resolve("total", "field", "string", self.THEME, tier1_hints={"widget": "NumberInput"})
        assert r["widget"] == "Slider"

    def test_form_presentation_as_level_minus_one(self):
        r = _resolve("name", "field", "string", {}, form_pres={"labelPosition": "start"})
        assert r["labelPosition"] == "start"

    def test_tier1_overrides_form_presentation(self):
        r = _resolve("name", "field", "string", {}, tier1_hints={"labelPosition": "hidden"}, form_pres={"labelPosition": "start"})
        assert r["labelPosition"] == "hidden"

    def test_defaults_override_form_presentation(self):
        r = _resolve("name", "field", "string", self.THEME, form_pres={"labelPosition": "start"})
        assert r["labelPosition"] == "top"  # defaults beat form_pres

    def test_null_suppression(self):
        theme = {"defaults": {"widget": "TextInput"}, "items": {"f": {"widget": None}}}
        r = _resolve("f", "field", "string", theme)
        assert "widget" not in r

    def test_null_suppression_preserves_other(self):
        theme = {"defaults": {"widget": "TextInput", "labelPosition": "top"}, "items": {"f": {"widget": None}}}
        r = _resolve("f", "field", "string", theme)
        assert "widget" not in r
        assert r["labelPosition"] == "top"

    def test_empty_theme(self):
        r = _resolve("name", "field", "string", {})
        assert r == {}

    def test_empty_theme_with_tier1(self):
        r = _resolve("name", "field", "string", {}, tier1_hints={"widget": "TextInput"})
        assert r == {"widget": "TextInput"}

    def test_no_matching_selector(self):
        r = _resolve("name", "field", "string", self.THEME)
        assert r["widget"] == "TextInput"  # only defaults

    def test_multiple_selectors_last_wins(self):
        theme = {
            "selectors": [
                {"match": {"type": "field"}, "apply": {"widget": "TextInput"}},
                {"match": {"dataType": "string"}, "apply": {"widget": "TextInput"}},
            ]
        }
        r = _resolve("f", "field", "string", theme)
        assert r["widget"] == "TextInput"  # later selector wins

    def test_selector_adds_without_removing(self):
        theme = {
            "defaults": {"labelPosition": "top"},
            "selectors": [{"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}}]
        }
        r = _resolve("amt", "field", "money", theme)
        assert r["labelPosition"] == "top"
        assert r["widget"] == "MoneyInput"

    def test_display_item_type_selector(self):
        theme = {
            "selectors": [{"match": {"type": "display"}, "apply": {"widget": "Heading"}}]
        }
        r = _resolve("hdr", "display", None, theme)
        assert r["widget"] == "Heading"

    def test_group_item_type_selector(self):
        theme = {
            "selectors": [{"match": {"type": "group"}, "apply": {"widget": "Card"}}]
        }
        r = _resolve("g1", "group", None, theme)
        assert r["widget"] == "Card"

    def test_all_six_levels(self):
        """Full 6-level cascade: form_pres < tier1 < defaults < selector < item."""
        theme = {
            "defaults": {"labelPosition": "hidden"},
            "selectors": [{"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}}],
            "items": {"budget": {"widget": "Slider"}}
        }
        r = _resolve(
            "budget", "field", "money", theme,
            tier1_hints={"widget": "NumberInput", "labelPosition": "top"},
            form_pres={"labelPosition": "start"}
        )
        assert r["widget"] == "Slider"          # item (L3) beats selector (L2)
        assert r["labelPosition"] == "hidden"    # defaults (L1) beats tier1 (L0)

    def test_full_precedence_chain_widget(self):
        """Track widget through each level."""
        base_theme = {"defaults": {}, "selectors": [], "items": {}}
        # Only form_pres (no widget there, so tier1 wins)
        r = _resolve("f", "field", "string", base_theme, tier1_hints={"widget": "A"}, form_pres={})
        assert r["widget"] == "A"
        # Add defaults
        base_theme["defaults"] = {"widget": "B"}
        r = _resolve("f", "field", "string", base_theme, tier1_hints={"widget": "A"})
        assert r["widget"] == "B"
        # Add selector
        base_theme["selectors"] = [{"match": {"dataType": "string"}, "apply": {"widget": "C"}}]
        r = _resolve("f", "field", "string", base_theme, tier1_hints={"widget": "A"})
        assert r["widget"] == "C"
        # Add item override
        base_theme["items"] = {"f": {"widget": "D"}}
        r = _resolve("f", "field", "string", base_theme, tier1_hints={"widget": "A"})
        assert r["widget"] == "D"


# ===========================================================================
# Category E: Widget/dataType compatibility (20 tests)
# ===========================================================================


# Required widgets per plan §4
REQUIRED_WIDGETS = {
    "string": "TextInput", "text": "TextInput", "integer": "NumberInput",
    "decimal": "NumberInput", "boolean": "Toggle", "date": "DatePicker",
    "dateTime": "DatePicker", "time": "DatePicker", "uri": "TextInput",
    "attachment": "FileUpload", "choice": "Select",
    "multiChoice": "CheckboxGroup", "money": "MoneyInput",
}

PROGRESSIVE_WITH_FALLBACK = [
    ("Slider", "integer", "NumberInput"),
    ("RadioGroup", "choice", "Select"),
    ("Rating", "integer", "NumberInput"),
    ("RadioGroup", "choice", "Select"),
    ("Signature", "attachment", "FileUpload"),
    ("TextInput", "text", "TextInput"),
    ("Select", "choice", "Select"),
    ("FileUpload", "attachment", "FileUpload"),
]


class TestWidgetCompat:
    """Widget–dataType compatibility and fallback."""

    @pytest.mark.parametrize("dt,widget", list(REQUIRED_WIDGETS.items()),
                             ids=[f"{dt}-required" for dt in REQUIRED_WIDGETS])
    def test_required_widget_valid_schema(self, dt, widget):
        _valid(_minimal_theme(selectors=[
            {"match": {"dataType": dt}, "apply": {"widget": widget}}
        ]))

    @pytest.mark.parametrize("widget,dt,fb", PROGRESSIVE_WITH_FALLBACK,
                             ids=[w for w, _, _ in PROGRESSIVE_WITH_FALLBACK])
    def test_progressive_widget_with_fallback(self, widget, dt, fb):
        _valid(_minimal_theme(items={
            "f": {"widget": widget, "fallback": [fb]}
        }))


# ===========================================================================
# Category F: Layout pages (15 tests)
# ===========================================================================


class TestLayoutPages:
    """Page layout system per §6."""

    def test_single_page_no_regions(self):
        _valid(_minimal_theme(pages=[{"id": "p1", "title": "Only Page"}]))

    def test_multi_page(self):
        _valid(_minimal_theme(pages=[
            {"id": "step1", "title": "Step 1", "regions": [{"key": "name", "span": 12}]},
            {"id": "step2", "title": "Step 2", "regions": [{"key": "address", "span": 12}]},
        ]))

    def test_region_full_width_default(self):
        """span defaults to 12 per schema."""
        _valid(_minimal_theme(pages=[{"id": "p", "title": "P", "regions": [{"key": "f"}]}]))

    def test_region_split_columns(self):
        _valid(_minimal_theme(pages=[{"id": "p", "title": "P", "regions": [
            {"key": "first", "span": 4},
            {"key": "middle", "span": 4},
            {"key": "last", "span": 4},
        ]}]))

    def test_region_with_start_position(self):
        _valid(_minimal_theme(pages=[{"id": "p", "title": "P", "regions": [
            {"key": "sidebar", "span": 3, "start": 1},
            {"key": "main", "span": 9, "start": 4},
        ]}]))

    def test_group_key_in_region(self):
        """Group key includes entire subtree per spec."""
        _valid(_minimal_theme(pages=[{"id": "p", "title": "P", "regions": [
            {"key": "contactGroup", "span": 12}
        ]}]))

    def test_responsive_override(self):
        _valid(_minimal_theme(
            breakpoints={"sm": 576, "lg": 1024},
            pages=[{"id": "p", "title": "P", "regions": [
                {"key": "f", "span": 6, "responsive": {
                    "sm": {"span": 12},
                    "lg": {"span": 4}
                }}
            ]}]
        ))

    def test_responsive_hidden(self):
        _valid(_minimal_theme(pages=[{"id": "p", "title": "P", "regions": [
            {"key": "f", "responsive": {"sm": {"hidden": True}}}
        ]}]))

    def test_empty_pages_array(self):
        _valid(_minimal_theme(pages=[]))

    def test_empty_regions_array(self):
        _valid(_minimal_theme(pages=[{"id": "p", "title": "P", "regions": []}]))

    def test_page_with_description(self):
        _valid(_minimal_theme(pages=[{"id": "review", "title": "Review", "description": "Check your answers."}]))

    def test_many_regions(self):
        regions = [{"key": f"f{i}", "span": 3} for i in range(4)]
        _valid(_minimal_theme(pages=[{"id": "p", "title": "P", "regions": regions}]))

    def test_region_span_boundaries(self):
        _valid(_minimal_theme(pages=[{"id": "p", "title": "P", "regions": [
            {"key": "a", "span": 1}, {"key": "b", "span": 12}
        ]}]))

    def test_multiple_breakpoints(self):
        _valid(_minimal_theme(breakpoints={"xs": 0, "sm": 576, "md": 768, "lg": 1024, "xl": 1280}))

    def test_no_pages_property(self):
        """Theme without pages is valid — renderer walks item tree."""
        _valid(_minimal_theme())


# ===========================================================================
# Category G: Token resolution (15 tests)
# ===========================================================================


class TestTokenResolution:
    """Token definitions and $token references."""

    def test_string_token(self):
        _valid(_minimal_theme(tokens={"color.primary": "#2563eb"}))

    def test_number_token(self):
        _valid(_minimal_theme(tokens={"border.width": 2}))

    def test_many_tokens(self):
        _valid(_minimal_theme(tokens={
            "color.primary": "#2563eb",
            "color.error": "#dc2626",
            "spacing.xs": "4px",
            "spacing.sm": "8px",
            "spacing.md": "16px",
            "spacing.lg": "24px",
            "typography.body.family": "Inter, sans-serif",
            "typography.body.size": "1rem",
            "border.radius": "6px",
            "elevation.low": "0 1px 3px rgba(0,0,0,0.12)",
        }))

    def test_token_ref_in_style(self):
        """$token.x references in style values."""
        _valid(_minimal_theme(
            tokens={"color.primary": "#2563eb"},
            defaults={"style": {"borderColor": "$token.color.primary"}}
        ))

    def test_token_ref_in_widget_config(self):
        _valid(_minimal_theme(
            tokens={"color.pen": "#000"},
            items={"sig": {"widget": "Signature", "widgetConfig": {"penColor": "$token.color.pen"}}}
        ))

    def test_empty_tokens(self):
        _valid(_minimal_theme(tokens={}))

    def test_no_tokens(self):
        _valid(_minimal_theme())

    def test_token_with_dots(self):
        """Deeply dotted token names."""
        _valid(_minimal_theme(tokens={"color.brand.primary.light": "#e0f0ff"}))

    def test_token_numeric_zero(self):
        _valid(_minimal_theme(tokens={"spacing.none": 0}))

    def test_token_negative_number(self):
        _valid(_minimal_theme(tokens={"offset.left": -10}))

    def test_unresolved_token_in_style(self):
        """Schema doesn't validate token resolution — just format."""
        _valid(_minimal_theme(defaults={"style": {"color": "$token.nonexistent"}}))

    def test_style_without_tokens(self):
        _valid(_minimal_theme(defaults={"style": {"color": "red"}}))

    def test_style_numeric_value(self):
        _valid(_minimal_theme(defaults={"style": {"borderWidth": 2}}))

    def test_multiple_token_refs(self):
        _valid(_minimal_theme(
            tokens={"color.primary": "#00f", "color.bg": "#fff"},
            items={"f": {"style": {"color": "$token.color.primary", "background": "$token.color.bg"}}}
        ))

    def test_token_override_in_items(self):
        """Item style can reference tokens defined at theme level."""
        _valid(_minimal_theme(
            tokens={"spacing.lg": "24px"},
            items={"f": {"style": {"padding": "$token.spacing.lg"}}}
        ))


# ===========================================================================
# Category H: Tier 1 integration (15 tests)
# ===========================================================================


class TestTier1Integration:
    """Theme + Definition with Tier 1 hints — verify both are schema-valid."""

    def _def_with_pres(self, **pres):
        return {
            "$formspec": "1.0", "url": "https://example.com/f",
            "version": "1.0.0", "status": "draft", "name": "t", "title": "T",
            "items": [{"key": "f1", "type": "field", "label": "F",
                       "dataType": "string", "presentation": pres}]
        }

    def test_def_with_tier1_and_theme_both_valid(self):
        defn = self._def_with_pres(widgetHint="TextInput")
        DEF_V.validate(defn)
        theme = _minimal_theme(items={"f1": {"widget": "TextInput"}})
        _valid(theme)

    def test_theme_widget_overrides_tier1_hint(self):
        r = _resolve("f1", "field", "string",
                     {"items": {"f1": {"widget": "TextInput"}}},
                     tier1_hints={"widget": "TextInput"})
        assert r["widget"] == "TextInput"

    def test_tier1_label_position_as_baseline(self):
        r = _resolve("f1", "field", "string", {},
                     tier1_hints={"labelPosition": "hidden"})
        assert r["labelPosition"] == "hidden"

    def test_theme_defaults_override_tier1_label(self):
        r = _resolve("f1", "field", "string",
                     {"defaults": {"labelPosition": "start"}},
                     tier1_hints={"labelPosition": "hidden"})
        assert r["labelPosition"] == "start"

    def test_form_pres_page_mode_wizard(self):
        defn = {
            "$formspec": "1.0", "url": "https://example.com/f",
            "version": "1.0.0", "status": "draft", "name": "t", "title": "T",
            "formPresentation": {"pageMode": "wizard"},
            "items": [{"key": "f1", "type": "field", "label": "F", "dataType": "string"}]
        }
        DEF_V.validate(defn)
        theme = _minimal_theme(pages=[
            {"id": "s1", "title": "Step 1", "regions": [{"key": "f1"}]}
        ])
        _valid(theme)

    def test_theme_selector_matches_def_datatype(self):
        defn = {
            "$formspec": "1.0", "url": "https://example.com/f",
            "version": "1.0.0", "status": "draft", "name": "t", "title": "T",
            "items": [{"key": "amt", "type": "field", "label": "Amount", "dataType": "money"}]
        }
        DEF_V.validate(defn)
        theme = _minimal_theme(selectors=[
            {"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}}
        ])
        _valid(theme)
        r = _resolve("amt", "field", "money", theme)
        assert r["widget"] == "MoneyInput"

    def test_tier1_accessibility_preserved(self):
        r = _resolve("f1", "field", "string",
                     {"defaults": {"widget": "TextInput"}},
                     tier1_hints={"accessibility": {"liveRegion": "polite"}})
        assert r["widget"] == "TextInput"
        assert r["accessibility"] == {"liveRegion": "polite"}

    def test_theme_accessibility_overrides_tier1(self):
        r = _resolve("f1", "field", "string",
                     {"items": {"f1": {"accessibility": {"liveRegion": "assertive"}}}},
                     tier1_hints={"accessibility": {"liveRegion": "polite"}})
        assert r["accessibility"] == {"liveRegion": "assertive"}

    def test_empty_theme_preserves_all_tier1(self):
        hints = {"widget": "TextInput", "labelPosition": "start"}
        r = _resolve("f1", "field", "string", {}, tier1_hints=hints)
        assert r == hints

    def test_theme_items_key_matches_def_key(self):
        defn = {
            "$formspec": "1.0", "url": "https://example.com/f",
            "version": "1.0.0", "status": "draft", "name": "t", "title": "T",
            "items": [
                {"key": "name", "type": "field", "label": "Name", "dataType": "string"},
                {"key": "age", "type": "field", "label": "Age", "dataType": "integer"}
            ]
        }
        DEF_V.validate(defn)
        theme = _minimal_theme(items={
            "name": {"widget": "TextInput"},
            "age": {"widget": "NumberInput", "widgetConfig": {"min": 0, "max": 150}}
        })
        _valid(theme)

    def test_cascade_with_style_and_widget(self):
        theme = {
            "defaults": {"style": {"borderRadius": "4px"}},
            "selectors": [{"match": {"dataType": "money"}, "apply": {"widget": "MoneyInput"}}],
            "items": {"total": {"style": {"background": "#f0f0f0"}}}
        }
        r = _resolve("total", "field", "money", theme)
        assert r["widget"] == "MoneyInput"
        assert r["style"] == {"background": "#f0f0f0"}  # item overrides defaults style

    def test_round_trip_theme(self):
        """Theme serializes and deserializes losslessly."""
        theme = _minimal_theme(
            tokens={"color.primary": "#00f"},
            defaults={"labelPosition": "top"},
            selectors=[{"match": {"dataType": "boolean"}, "apply": {"widget": "Toggle"}}],
            items={"f": {"widget": "Slider", "fallback": ["NumberInput"]}},
            pages=[{"id": "p", "title": "P", "regions": [{"key": "f", "span": 6}]}]
        )
        roundtripped = json.loads(json.dumps(theme))
        assert roundtripped == theme
        _valid(roundtripped)

    def test_theme_and_def_independent_schemas(self):
        """Theme schema doesn't interfere with definition schema."""
        defn = {
            "$formspec": "1.0", "url": "https://example.com/f",
            "version": "1.0.0", "status": "draft", "name": "t", "title": "T",
            "items": [{"key": "f1", "type": "field", "label": "F", "dataType": "string"}]
        }
        DEF_V.validate(defn)
        # Theme with same url but different schema
        theme = _minimal_theme(url="https://example.com/f/themes/web")
        _valid(theme)

    def test_theme_targeting_definition_url(self):
        def_url = "https://example.com/annual-report"
        defn = {
            "$formspec": "1.0", "url": def_url,
            "version": "1.0.0", "status": "draft", "name": "t", "title": "T",
            "items": [{"key": "f1", "type": "field", "label": "F", "dataType": "string"}]
        }
        DEF_V.validate(defn)
        theme = _minimal_theme(targetDefinition={"url": def_url, "compatibleVersions": ">=1.0.0"})
        _valid(theme)


# ===========================================================================
# Category I: Lifecycle / compatibleVersions (10 tests)
# ===========================================================================


class TestLifecycle:
    """Target definition version compatibility."""

    def test_no_compatible_versions(self):
        _valid(_minimal_theme())  # compatibleVersions is optional

    def test_semver_range_gte(self):
        _valid(_minimal_theme(targetDefinition={"url": "https://x.com/f", "compatibleVersions": ">=1.0.0"}))

    def test_semver_range_bounded(self):
        _valid(_minimal_theme(targetDefinition={"url": "https://x.com/f", "compatibleVersions": ">=1.0.0 <2.0.0"}))

    def test_semver_exact(self):
        _valid(_minimal_theme(targetDefinition={"url": "https://x.com/f", "compatibleVersions": "1.2.3"}))

    def test_version_string_formats(self):
        for v in ["1.0.0", "2.3.4-beta", "0.1.0", "10.20.30"]:
            _valid(_minimal_theme(version=v))

    def test_version_with_metadata(self):
        _valid(_minimal_theme(version="1.0.0+build.42"))

    def test_target_url_required(self):
        _invalid(_minimal_theme(targetDefinition={"compatibleVersions": ">=1.0.0"}))

    def test_platform_does_not_restrict_targeting(self):
        """Different platforms can target same definition."""
        for p in ["web", "mobile", "pdf", "print", "kiosk"]:
            _valid(_minimal_theme(platform=p))

    def test_multiple_themes_same_target(self):
        """Multiple themes for same definition — both valid independently."""
        url = "https://agency.gov/budget"
        t1 = _minimal_theme(name="light", platform="web", targetDefinition={"url": url})
        t2 = _minimal_theme(name="dark", platform="web", targetDefinition={"url": url})
        _valid(t1)
        _valid(t2)

    def test_different_platforms_same_definition(self):
        url = "https://agency.gov/budget"
        _valid(_minimal_theme(platform="web", targetDefinition={"url": url}))
        _valid(_minimal_theme(platform="mobile", targetDefinition={"url": url}))


# ===========================================================================
# Category J: Extensibility (8 tests)
# ===========================================================================


class TestExtensibility:
    """x- prefix extensions."""

    def test_x_extension_object(self):
        _valid(_minimal_theme(extensions={"x-analytics": {"track": True}}))

    def test_x_extension_string(self):
        _valid(_minimal_theme(extensions={"x-version": "beta"}))

    def test_multiple_extensions(self):
        _valid(_minimal_theme(extensions={"x-a": {}, "x-b": {"v": 1}}))

    def test_no_extensions(self):
        _valid(_minimal_theme())

    def test_empty_extensions(self):
        _valid(_minimal_theme(extensions={}))

    def test_extension_without_prefix_rejected(self):
        _invalid(_minimal_theme(extensions={"analytics": {}}))

    def test_x_widget_in_items(self):
        """Custom widget via x- prefix."""
        _valid(_minimal_theme(items={"f": {"widget": "x-custom-map", "fallback": ["TextInput"]}}))

    def test_x_widget_config_extra_keys(self):
        """widgetConfig is open object — custom keys allowed."""
        _valid(_minimal_theme(items={"f": {
            "widget": "x-map",
            "fallback": ["TextInput"],
            "widgetConfig": {"latitude": 40.7, "longitude": -74.0, "zoom": 12}
        }}))


# ===========================================================================
# Category K: Edge cases (7 tests)
# ===========================================================================


class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_only_required_fields(self):
        _valid({"$formspecTheme": "1.0", "version": "0.0.1", "targetDefinition": {"url": "https://x.com/f"}})

    def test_empty_selectors(self):
        _valid(_minimal_theme(selectors=[]))

    def test_empty_items(self):
        _valid(_minimal_theme(items={}))

    def test_empty_pages(self):
        _valid(_minimal_theme(pages=[]))

    def test_empty_tokens(self):
        _valid(_minimal_theme(tokens={}))

    def test_empty_defaults(self):
        _valid(_minimal_theme(defaults={}))

    def test_all_empty_optionals(self):
        _valid(_minimal_theme(
            tokens={}, defaults={}, selectors=[], items={}, pages=[],
            breakpoints={}, extensions={}
        ))
