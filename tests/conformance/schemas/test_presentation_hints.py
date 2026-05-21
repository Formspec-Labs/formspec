"""Tests for Presentation Hints — Tier 1 (§4.1.1 formPresentation + §4.2.5 presentation).

111 tests across 9 categories: schema validation, widgetHint compatibility,
layout semantics, accessibility, precedence, and integration.
"""

import json
import copy
import pytest

import jsonschema
from jsonschema import Draft202012Validator

from tests.unit.support.helpers import (
    base_definition as _base_doc,
    minimal_display as _shared_minimal_display,
    minimal_field as _shared_minimal_field,
    minimal_group as _shared_minimal_group,
)
from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

COMMON_SCHEMA = load_schema("common.schema.json")
SCHEMA = load_schema("definition.schema.json")
VALIDATOR = Draft202012Validator(SCHEMA, registry=build_schema_registry(COMMON_SCHEMA, SCHEMA))


def _minimal_def(**overrides):
    """Return a minimal valid definition, with optional overrides merged."""
    d = _base_doc(name="test", url="https://example.com/test")
    d.update(overrides)
    return d


def _minimal_field(key="f1", data_type="string", **field_overrides):
    """Return a minimal field item."""
    return _shared_minimal_field(key=key, data_type=data_type, **field_overrides)


def _minimal_group(key="g1", children=None, **group_overrides):
    """Return a minimal group item."""
    return _shared_minimal_group(key=key, children=children, **group_overrides)


def _minimal_display(key="d1", **display_overrides):
    """Return a minimal display item."""
    return _shared_minimal_display(key=key, **display_overrides)


def _valid(definition):
    """Assert definition is valid against schema."""
    VALIDATOR.validate(definition)


def _invalid(definition):
    """Assert definition is invalid against schema."""
    with pytest.raises(jsonschema.ValidationError):
        VALIDATOR.validate(definition)


# ===========================================================================
# Category A: formPresentation schema validation (12 tests)
# ===========================================================================


class TestFormPresentationValid:
    """Valid formPresentation values."""

    @pytest.mark.parametrize("mode", ["single", "wizard", "tabs"])
    def test_valid_page_mode(self, mode):
        _valid(_minimal_def(formPresentation={"pageMode": mode}))

    @pytest.mark.parametrize("pos", ["top", "start", "hidden"])
    def test_valid_label_position(self, pos):
        _valid(_minimal_def(formPresentation={"labelPosition": pos}))

    @pytest.mark.parametrize("d", ["compact", "comfortable", "spacious"])
    def test_valid_density(self, d):
        _valid(_minimal_def(formPresentation={"density": d}))


class TestFormPresentationInvalid:
    """Invalid formPresentation values."""

    def test_invalid_page_mode(self):
        _invalid(_minimal_def(formPresentation={"pageMode": "carousel"}))

    def test_invalid_label_position(self):
        _invalid(_minimal_def(formPresentation={"labelPosition": "bottom"}))

    def test_invalid_density(self):
        _invalid(_minimal_def(formPresentation={"density": "tight"}))


# ===========================================================================
# Category B: formPresentation edge cases (6 tests)
# ===========================================================================


class TestFormPresentationEdgeCases:
    """Edge cases for formPresentation."""

    def test_empty_object(self):
        _valid(_minimal_def(formPresentation={}))

    def test_omitted_entirely(self):
        _valid(_minimal_def())  # no formPresentation key at all

    def test_string_not_object(self):
        _invalid(_minimal_def(formPresentation="wizard"))

    def test_unknown_key_rejected(self):
        _invalid(_minimal_def(formPresentation={"theme": "dark"}))

    def test_only_page_mode(self):
        _valid(_minimal_def(formPresentation={"pageMode": "wizard"}))

    def test_all_three_properties(self):
        _valid(_minimal_def(formPresentation={
            "pageMode": "tabs",
            "labelPosition": "start",
            "density": "compact",
        }))


# ===========================================================================
# Category C: presentation on Items (18 tests)
# ===========================================================================


class TestPresentationOnItems:
    """§4.2.5 — presentation object on Field, Group, Display items."""

    def test_on_field(self):
        f = _minimal_field(presentation={"widgetHint": "TextInput"})
        _valid(_minimal_def(items=[f]))

    def test_on_group(self):
        g = _minimal_group(presentation={"widgetHint": "Card"})
        _valid(_minimal_def(items=[g]))

    def test_on_display(self):
        d = _minimal_display(presentation={"widgetHint": "Heading"})
        _valid(_minimal_def(items=[d]))

    def test_empty_presentation(self):
        f = _minimal_field(presentation={})
        _valid(_minimal_def(items=[f]))

    def test_omitted_presentation(self):
        _valid(_minimal_def())  # no presentation on any item

    def test_unknown_top_level_key_rejected(self):
        """Presentation is closed; extensions use root x-* or extensions lanes."""
        f = _minimal_field(presentation={"futureKey": "futureValue"})
        _invalid(_minimal_def(items=[f]))

    def test_root_x_annotation_valid(self):
        _valid(_minimal_def(**{"x-authoring": {"source": "studio"}}))

    def test_lowercase_widget_hint_rejected(self):
        f = _minimal_field(presentation={"widgetHint": "textInput"})
        _invalid(_minimal_def(items=[f]))

    def test_layout_flow_invalid(self):
        f = _minimal_field(presentation={"layout": {"flow": "waterfall"}})
        _invalid(_minimal_def(items=[f]))

    def test_layout_columns_zero(self):
        f = _minimal_field(presentation={"layout": {"columns": 0}})
        _invalid(_minimal_def(items=[f]))

    def test_layout_columns_thirteen(self):
        f = _minimal_field(presentation={"layout": {"columns": 13}})
        _invalid(_minimal_def(items=[f]))

    def test_layout_col_span_zero(self):
        f = _minimal_field(presentation={"layout": {"grid": {"span": 0}}})
        _invalid(_minimal_def(items=[f]))

    def test_layout_columns_one(self):
        f = _minimal_field(presentation={"layout": {"columns": 1}})
        _valid(_minimal_def(items=[f]))

    def test_layout_columns_twelve(self):
        f = _minimal_field(presentation={"layout": {"columns": 12}})
        _valid(_minimal_def(items=[f]))

    def test_style_hints_emphasis_invalid(self):
        f = _minimal_field(presentation={"styleHints": {"emphasis": "urgent"}})
        _invalid(_minimal_def(items=[f]))

    def test_style_hints_size_invalid(self):
        f = _minimal_field(presentation={"styleHints": {"size": "huge"}})
        _invalid(_minimal_def(items=[f]))

    def test_accessibility_live_region_invalid(self):
        f = _minimal_field(presentation={"accessibility": {"liveRegion": "immediate"}})
        _invalid(_minimal_def(items=[f]))

    def test_layout_columns_as_string(self):
        f = _minimal_field(presentation={"layout": {"columns": "three"}})
        _invalid(_minimal_def(items=[f]))

    def test_layout_unknown_key_rejected(self):
        f = _minimal_field(presentation={"layout": {"margin": "10px"}})
        _invalid(_minimal_def(items=[f]))

    def test_style_hints_unknown_key_rejected(self):
        f = _minimal_field(presentation={"styleHints": {"color": "red"}})
        _invalid(_minimal_def(items=[f]))


# ===========================================================================
# Category D: widgetHint / dataType compatibility (26 tests)
# ===========================================================================


# Default widgetHint per dataType
DEFAULT_WIDGETS = {
    "string": "TextInput",
    "text": "TextInput",
    "integer": "NumberInput",
    "decimal": "NumberInput",
    "boolean": "Toggle",
    "date": "DatePicker",
    "dateTime": "DatePicker",
    "time": "DatePicker",
    "uri": "TextInput",
    "attachment": "FileUpload",
    "choice": "Select",
    "multiChoice": "CheckboxGroup",
    "money": "MoneyInput",
}

# One alternative (non-default) widgetHint per dataType
ALT_WIDGETS = {
    "string": "TextInput",
    "text": "TextInput",
    "integer": "Slider",
    "decimal": "Slider",
    "boolean": "Toggle",
    "date": "DatePicker",
    "dateTime": "DatePicker",
    "time": "DatePicker",
    "uri": "TextInput",
    "attachment": "FileUpload",
    "choice": "RadioGroup",
    "multiChoice": "Select",
    "money": "MoneyInput",  # only one option
}


class TestWidgetHintDataTypeCompat:
    """widgetHint uses the canonical PascalCase built-in vocabulary."""

    @pytest.mark.parametrize("dt,wh", list(DEFAULT_WIDGETS.items()),
                             ids=[f"{dt}-default" for dt in DEFAULT_WIDGETS])
    def test_default_widget(self, dt, wh):
        """Each dataType with its default widgetHint is schema-valid."""
        f = _minimal_field(data_type=dt, presentation={"widgetHint": wh})
        if dt in ("choice", "multiChoice"):
            f["options"] = [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]
        _valid(_minimal_def(items=[f]))

    @pytest.mark.parametrize("dt,wh", list(ALT_WIDGETS.items()),
                             ids=[f"{dt}-alt" for dt in ALT_WIDGETS])
    def test_alt_widget(self, dt, wh):
        """Each dataType with an alternative widgetHint is schema-valid."""
        f = _minimal_field(data_type=dt, presentation={"widgetHint": wh})
        if dt in ("choice", "multiChoice"):
            f["options"] = [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]
        _valid(_minimal_def(items=[f]))


# ===========================================================================
# Category E: widgetHint on Group and Display items (8 tests)
# ===========================================================================


class TestWidgetHintGroupDisplay:
    """widgetHint values for non-field items."""

    @pytest.mark.parametrize("wh", ["Heading", "Text", "Divider", "Alert"])
    def test_display_widget_hints(self, wh):
        d = _minimal_display(presentation={"widgetHint": wh})
        _valid(_minimal_def(items=[d]))

    @pytest.mark.parametrize("wh", ["Section", "Card", "Accordion", "Tabs"])
    def test_group_widget_hints(self, wh):
        g = _minimal_group(presentation={"widgetHint": wh})
        _valid(_minimal_def(items=[g]))


# ===========================================================================
# Category F: Layout property semantics (15 tests)
# ===========================================================================


class TestLayoutSemantics:
    """Layout properties on various item types."""

    def test_grid_with_columns(self):
        children = [_minimal_field(key=f"f{i}") for i in range(3)]
        g = _minimal_group(children=children, presentation={"layout": {"flow": "grid", "columns": 3}})
        _valid(_minimal_def(items=[g]))

    def test_col_span_on_child(self):
        f = _minimal_field(presentation={"layout": {"grid": {"span": 2, "start": 1}}})
        g = _minimal_group(children=[f], presentation={"layout": {"flow": "grid", "columns": 4}})
        _valid(_minimal_def(items=[g]))

    def test_row_placement_on_child(self):
        f = _minimal_field(presentation={"layout": {"grid": {"rowSpan": 2, "rowStart": 1}}})
        _valid(_minimal_def(items=[f]))

    def test_collapsible_with_default(self):
        g = _minimal_group(presentation={"layout": {"collapsible": True, "collapsedByDefault": True}})
        _valid(_minimal_def(items=[g]))

    def test_collapsed_default_without_collapsible(self):
        """collapsedByDefault without collapsible is valid schema (semantically ignored)."""
        g = _minimal_group(presentation={"layout": {"collapsedByDefault": True}})
        _valid(_minimal_def(items=[g]))

    def test_layout_page_rejected(self):
        g = _minimal_group(presentation={"layout": {"page": "Step 1"}})
        _invalid(_minimal_def(items=[g], formPresentation={"pageMode": "wizard"}))

    def test_layout_col_span_rejected(self):
        f = _minimal_field(presentation={"layout": {"colSpan": 6}})
        _invalid(_minimal_def(items=[f]))

    def test_layout_new_row_rejected(self):
        f = _minimal_field(presentation={"layout": {"newRow": True}})
        _invalid(_minimal_def(items=[f]))

    def test_flow_on_field(self):
        """flow on a Field is schema-valid (semantically for fields it's ignored)."""
        f = _minimal_field(presentation={"layout": {"flow": "inline"}})
        _valid(_minimal_def(items=[f]))

    def test_col_span_exceeds_columns(self):
        """grid.span can use the full 12-column page/grid width."""
        f = _minimal_field(presentation={"layout": {"grid": {"span": 12}}})
        g = _minimal_group(children=[f], presentation={"layout": {"flow": "grid", "columns": 3}})
        _valid(_minimal_def(items=[g]))

    def test_nested_groups_different_flow(self):
        inner = _minimal_group(key="inner", presentation={"layout": {"flow": "inline"}})
        outer = _minimal_group(key="outer", children=[inner], presentation={"layout": {"flow": "grid", "columns": 2}})
        _valid(_minimal_def(items=[outer]))

    def test_all_layout_on_group(self):
        g = _minimal_group(presentation={"layout": {
            "flow": "grid", "columns": 4, "collapsible": True,
            "collapsedByDefault": False,
        }})
        _valid(_minimal_def(items=[g]))

    def test_all_layout_on_field(self):
        f = _minimal_field(presentation={"layout": {
            "grid": {"span": 3, "start": 1, "rowSpan": 1, "rowStart": 1},
        }})
        _valid(_minimal_def(items=[f]))

    def test_no_layout_defaults(self):
        _valid(_minimal_def())  # no layout at all


# ===========================================================================
# Category G: Accessibility properties (8 tests)
# ===========================================================================


class TestAccessibility:
    """Accessibility hints on items."""

    def test_role_on_group(self):
        g = _minimal_group(presentation={"accessibility": {"role": "navigation"}})
        _valid(_minimal_def(items=[g]))

    def test_role_on_display(self):
        d = _minimal_display(presentation={"accessibility": {"role": "alert"}})
        _valid(_minimal_def(items=[d]))

    def test_description_on_field(self):
        """accessibility.description is distinct from Item description."""
        f = _minimal_field(
            presentation={"accessibility": {"description": "Enter your legal name"}},
        )
        f["description"] = "Your full name as it appears on ID."
        _valid(_minimal_def(items=[f]))

    def test_live_region_on_display(self):
        d = _minimal_display(presentation={"accessibility": {"liveRegion": "polite"}})
        _valid(_minimal_def(items=[d]))

    def test_all_accessibility(self):
        f = _minimal_field(presentation={"accessibility": {
            "role": "status", "description": "Calculated total", "liveRegion": "assertive",
        }})
        _valid(_minimal_def(items=[f]))

    def test_empty_accessibility(self):
        f = _minimal_field(presentation={"accessibility": {}})
        _valid(_minimal_def(items=[f]))

    def test_accessibility_on_all_item_types(self):
        f = _minimal_field(key="f1", presentation={"accessibility": {"role": "region"}})
        g = _minimal_group(key="g1", presentation={"accessibility": {"role": "complementary"}})
        d = _minimal_display(key="d1", presentation={"accessibility": {"liveRegion": "polite"}})
        _valid(_minimal_def(items=[f, g, d]))

    def test_custom_role_string(self):
        """Non-standard role — valid because role is free string."""
        f = _minimal_field(presentation={"accessibility": {"role": "x-custom-widget"}})
        _valid(_minimal_def(items=[f]))


# ===========================================================================
# Category H: Precedence and interaction (10 tests)
# ===========================================================================


class TestPrecedenceAndInteraction:
    """Interaction of presentation with existing properties."""

    def test_semantic_type_and_widget_hint(self):
        f = _minimal_field(
            presentation={"widgetHint": "TextInput"},
            semanticType="ietf:email",
        )
        _valid(_minimal_def(items=[f]))

    def test_prefix_and_style_hints(self):
        f = _minimal_field(
            presentation={"styleHints": {"emphasis": "primary"}},
            prefix="$",
        )
        _valid(_minimal_def(items=[f]))

    def test_form_density_and_item_size(self):
        f = _minimal_field(presentation={"styleHints": {"size": "compact"}})
        _valid(_minimal_def(
            items=[f],
            formPresentation={"density": "spacious"},
        ))

    def test_form_and_item_presentation_coexist(self):
        f1 = _minimal_field(key="f1", presentation={"widgetHint": "TextInput"})
        f2 = _minimal_field(key="f2")  # no presentation
        _valid(_minimal_def(
            items=[f1, f2],
            formPresentation={"pageMode": "single", "labelPosition": "start"},
        ))

    def test_unknown_and_known_keys_mixed(self):
        """Known keys validate and unknown presentation keys are rejected."""
        f = _minimal_field(presentation={
            "widgetHint": "TextInput",
            "futureFeature": {"x": 1},
        })
        _invalid(_minimal_def(items=[f]))

    def test_bind_disabled_display_and_presentation(self):
        f = _minimal_field(key="amt", data_type="decimal",
                           presentation={"widgetHint": "Slider"})
        _valid(_minimal_def(
            items=[f],
            binds=[{"path": "amt", "disabledDisplay": "hidden"}],
        ))

    def test_calculated_field_with_live_region(self):
        f = _minimal_field(key="total", data_type="decimal",
                           presentation={"accessibility": {"liveRegion": "polite"}})
        _valid(_minimal_def(
            items=[f],
            binds=[{"path": "total", "calculate": "1 + 2"}],
        ))

    def test_display_with_widget_and_emphasis(self):
        d = _minimal_display(presentation={
            "widgetHint": "Heading",
            "styleHints": {"emphasis": "primary"},
        })
        _valid(_minimal_def(items=[d]))

    def test_group_page_with_child_presentation(self):
        f = _minimal_field(presentation={"widgetHint": "Slider", "layout": {"grid": {"span": 2}}},
                           data_type="integer")
        g = _minimal_group(children=[f], presentation={"layout": {"flow": "grid", "columns": 3}})
        _valid(_minimal_def(items=[g], formPresentation={"pageMode": "wizard"}))

    def test_round_trip_lossless(self):
        """Serialize → deserialize → re-serialize preserves all presentation."""
        defn = _minimal_def(
            formPresentation={"pageMode": "wizard", "density": "compact"},
            items=[
                _minimal_field(key="f1", presentation={
                    "widgetHint": "Slider",
                    "layout": {"grid": {"span": 6, "start": 1}},
                    "styleHints": {"emphasis": "warning", "size": "large"},
                    "accessibility": {"role": "status", "liveRegion": "polite", "description": "Slide to select"},
                }, data_type="integer"),
            ],
        )
        roundtripped = json.loads(json.dumps(defn))
        assert roundtripped == defn


# ===========================================================================
# Category I: Integration / full form definitions (8 tests)
# ===========================================================================


class TestIntegration:
    """Full-form definitions exercising presentation comprehensively."""

    def test_wizard_form(self):
        g1 = _minimal_group(key="personal", children=[
            _minimal_field(key="name", presentation={"widgetHint": "TextInput"}),
            _minimal_field(key="email", presentation={"widgetHint": "TextInput"}, semanticType="ietf:email"),
        ], presentation={"layout": {"flow": "grid", "columns": 2}})
        g2 = _minimal_group(key="payment", children=[
            _minimal_field(key="amount", data_type="money", presentation={"widgetHint": "MoneyInput"}),
        ], presentation={"layout": {"flow": "stack"}})
        _valid(_minimal_def(
            items=[g1, g2],
            formPresentation={"pageMode": "wizard", "labelPosition": "top"},
        ))

    def test_tabbed_form(self):
        g1 = _minimal_group(key="info", presentation={"layout": {"flow": "stack"}}, children=[
            _minimal_field(key="n"),
        ])
        g2 = _minimal_group(key="prefs", presentation={"layout": {"flow": "stack"}}, children=[
            _minimal_field(key="notify", data_type="boolean", presentation={"widgetHint": "Toggle"}),
        ])
        _valid(_minimal_def(items=[g1, g2], formPresentation={"pageMode": "tabs"}))

    def test_grid_layout(self):
        children = [
            _minimal_field(key="first", presentation={"layout": {"grid": {"span": 1}}}),
            _minimal_field(key="middle", presentation={"layout": {"grid": {"span": 1}}}),
            _minimal_field(key="last", presentation={"layout": {"grid": {"span": 1}}}),
        ]
        g = _minimal_group(children=children, presentation={"layout": {"flow": "grid", "columns": 3}})
        _valid(_minimal_def(items=[g]))

    def test_accessible_form(self):
        items = [
            _minimal_display(key="hdr", presentation={"widgetHint": "Heading", "accessibility": {"role": "region"}}),
            _minimal_field(key="total", data_type="decimal",
                           presentation={"accessibility": {"liveRegion": "polite", "description": "Running total"}}),
            _minimal_group(key="nav", presentation={"accessibility": {"role": "navigation"}}),
        ]
        _valid(_minimal_def(items=items))

    def test_kitchen_sink(self):
        """Every presentation property used at least once."""
        defn = _minimal_def(
            formPresentation={"pageMode": "wizard", "labelPosition": "start", "density": "compact"},
            items=[
                _minimal_group(key="main", children=[
                    _minimal_field(key="name", presentation={
                        "widgetHint": "TextInput",
                        "layout": {"grid": {"span": 6, "start": 1}},
                        "styleHints": {"emphasis": "primary", "size": "large"},
                        "accessibility": {"role": "region", "description": "Full name", "liveRegion": "off"},
                    }),
                    _minimal_field(key="agree", data_type="boolean", presentation={"widgetHint": "Toggle"}),
                ], presentation={
                    "widgetHint": "Card",
                    "layout": {"flow": "grid", "columns": 12, "collapsible": True, "collapsedByDefault": False},
                }),
                _minimal_display(key="Divider", presentation={
                    "widgetHint": "Divider",
                    "styleHints": {"emphasis": "muted", "size": "compact"},
                }),
            ],
        )
        _valid(defn)

    def test_minimal_no_presentation(self):
        """Regression: form with zero presentation properties still passes."""
        _valid(_minimal_def())

    def test_existing_features_with_presentation(self):
        """Definition with presentation + binds + shapes + instances + variables."""
        defn = _minimal_def(
            formPresentation={"pageMode": "single"},
            items=[
                _minimal_field(key="a", data_type="integer", presentation={"widgetHint": "NumberInput"}),
                _minimal_field(key="b", data_type="integer"),
            ],
            binds=[{"path": "b", "calculate": "a + 1"}],
            shapes=[{"id": "positiveA", "target": "a", "constraint": "a > 0", "severity": "error", "message": "Must be positive"}],
            instances={"lookup": {"source": "https://example.com/data.json"}},
            variables=[{"name": "threshold", "expression": "42"}],
        )
        _valid(defn)

    def test_presentation_x_prefix_custom(self):
        """Custom x- prefixed widgetHint (for extensibility)."""
        f = _minimal_field(presentation={"widgetHint": "x-custom-map-picker"})
        _valid(_minimal_def(items=[f]))
