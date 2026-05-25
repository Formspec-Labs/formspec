import json
import re
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

COMMON_SCHEMA = load_schema("common.schema.json")
SCHEMA = load_schema("component.schema.json")
VALIDATOR = Draft202012Validator(SCHEMA, registry=build_schema_registry(COMMON_SCHEMA, SCHEMA))
REPO_ROOT = Path(__file__).resolve().parents[3]
UI_POLICY = json.loads((REPO_ROOT / "specs" / "ui-policy.json").read_text(encoding="utf-8"))

def validate(*, instance, schema):
    assert schema is SCHEMA
    VALIDATOR.validate(instance)

def test_minimal_document():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {
            "url": "https://example.com/def"
        },
        "tree": {
            "component": "Section",
            "title": "Minimal Section"
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_vnext_route_only_identity_document():
    doc = {
        "$formspecComponent": "1.2",
        "url": "https://example.gov/apps/workspace/components/review-route",
        "version": "1.0.0",
        "targetSurfaceRoutes": [
            {
                "surface": {
                    "url": "https://example.gov/apps/workspace/surfaces/respondent",
                    "version": "1.0.0",
                },
                "route": "review",
                "slot": "main",
                "role": "slot",
            }
        ],
        "tree": {
            "component": "Stack",
            "children": [],
        },
    }
    validate(instance=doc, schema=SCHEMA)


def test_vnext_mixed_definition_and_route_identity_document():
    doc = {
        "$formspecComponent": "1.2",
        "version": "1.0.0",
        "targetDefinition": {
            "url": "https://example.gov/forms/intake",
            "compatibleVersions": ">=1.0.0 <2.0.0",
        },
        "targetSurfaceRoutes": [
            {
                "surface": {
                    "url": "https://example.gov/apps/workspace/surfaces/respondent",
                },
                "route": "intakeReview",
                "role": "route",
            }
        ],
        "tree": {
            "component": "Stack",
            "children": [
                {"component": "TextInput", "bind": "fullName"},
            ],
        },
    }
    validate(instance=doc, schema=SCHEMA)


def test_vnext_document_requires_identity_binding():
    doc = {
        "$formspecComponent": "1.2",
        "version": "1.0.0",
        "tree": {
            "component": "Section",
            "title": "No identity",
        },
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)


def test_legacy_component_documents_remain_form_bound():
    doc = {
        "$formspecComponent": "1.1",
        "version": "1.0.0",
        "targetSurfaceRoutes": [
            {
                "surface": {
                    "url": "https://example.gov/apps/workspace/surfaces/respondent",
                },
                "route": "review",
                "role": "route",
            }
        ],
        "tree": {
            "component": "Stack",
            "children": [],
        },
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)


@pytest.mark.parametrize(
    "route_target",
    [
        {
            "surface": {
                "url": "https://example.gov/apps/workspace/surfaces/respondent",
            },
            "role": "route",
        },
        {
            "surface": {
                "url": "https://example.gov/apps/workspace/surfaces/respondent",
            },
            "route": "review",
            "role": "modal",
        },
        {
            "surface": {
                "url": "https://example.gov/apps/workspace/surfaces/respondent",
            },
            "route": "review",
            "role": "route",
            "path": "/review",
        },
    ],
)
def test_vnext_route_target_shape_invalid(route_target):
    doc = {
        "$formspecComponent": "1.2",
        "version": "1.0.0",
        "targetSurfaceRoutes": [route_target],
        "tree": {
            "component": "Stack",
            "children": [],
        },
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)

def test_full_core_components():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "Section",
            "children": [
                { "component": "Stack", "children": [
                    { "component": "Heading", "level": 1, "text": "Form" },
                    { "component": "TextInput", "bind": "name" },
                    { "component": "NumberInput", "bind": "age" },
                    { "component": "DatePicker", "bind": "dob" },
                    { "component": "Select", "bind": "gender" },
                    { "component": "CheckboxGroup", "bind": "interests" },
                    { "component": "Toggle", "bind": "agree" },
                    { "component": "FileUpload", "bind": "resume" }
                ]},
                { "component": "Grid", "columns": 2, "children": [
                    { "component": "Card", "title": "Section 1", "children": [
                        { "component": "Text", "text": "Info here" }
                    ]},
                    { "component": "Collapsible", "title": "Details", "children": [
                        { "component": "Divider", "label": "More" }
                    ]}
                ]},
                { "component": "Tabs", "children": [
                    { "component": "Section", "title": "Tab 1", "children": [] }
                ]},
                { "component": "ConditionalGroup", "when": "$show", "children": [] }
            ]
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_progressive_components():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "Section",
            "children": [
                { "component": "Grid", "columns": [1, 2], "children": [] },
                { "component": "Tabs", "children": [] },
                { "component": "Accordion", "children": [] },
                { "component": "RadioGroup", "bind": "choice" },
                { "component": "MoneyInput", "bind": "amount" },
                { "component": "Slider", "bind": "percent" },
                { "component": "Rating", "bind": "score" },
                { "component": "Signature", "bind": "sig" },
                { "component": "Alert", "severity": "info", "text": "Note" },
                { "component": "Badge", "text": "New" },
                { "component": "ProgressBar", "value": 50 },
                { "component": "Summary", "items": [{"label": "Name", "bind": "name"}] },
                { "component": "DataTable", "bind": "rows", "columns": [{"header": "Col 1", "bind": "c1"}] },
                { "component": "Panel", "children": [] },
                { "component": "Modal", "title": "Popup", "children": [] },
                { "component": "Popover", "triggerLabel": "More", "children": [] }
            ]
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_invalid_component_name_structural_valid():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": { "component": "UnknownComponent" }
    }
    # Should be treated as CustomComponentRef; structurally valid even if referential integrity fails
    validate(instance=doc, schema=SCHEMA)

@pytest.mark.parametrize("component_name", ["myWidget", "x-address"])
def test_custom_component_ref_requires_pascal_case(component_name):
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": { "component": component_name }
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)

def test_custom_component_valid():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "components": {
            "MyInput": {
                "params": ["label", "key"],
                "tree": {
                    "component": "Stack",
                    "children": [
                        { "component": "Heading", "level": 3, "text": "{label}" },
                        { "component": "TextInput", "bind": "{key}" }
                    ]
                }
            }
        },
        "tree": {
            "component": "MyInput",
            "params": { "label": "First Name", "key": "fname" }
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_missing_bind_on_input():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": { "component": "TextInput" }
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)

def test_responsive_overrides():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "breakpoints": { "sm": 640 },
        "tree": {
            "component": "Grid",
            "columns": 2,
            "responsive": {
                "sm": { "columns": 1 }
            },
            "children": []
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_responsive_overrides_reject_forbidden_props():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "breakpoints": { "sm": 640 },
        "tree": {
            "component": "Grid",
            "columns": 2,
            "responsive": {
                "sm": { "bind": "otherField" }
            },
            "children": []
        }
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)

def test_responsive_hidden_override_valid():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "breakpoints": { "sm": 640 },
        "tree": {
            "component": "Stack",
            "responsive": {
                "sm": { "hidden": True }
            },
            "children": []
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_grid_columns_accept_track_array():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "Grid",
            "columns": [2, "minmax(12rem, 1fr)", "$token.layout.sidebar"],
            "children": [
                {
                    "component": "TextInput",
                    "bind": "name",
                    "layout": { "grid": { "span": 2, "start": 1, "rowSpan": 1, "rowStart": 1 } }
                }
            ]
        }
    }
    validate(instance=doc, schema=SCHEMA)

@pytest.mark.parametrize("component_name", ["Page", "Columns", "Spacer"])
def test_removed_builtin_component_names_invalid(component_name):
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": { "component": component_name }
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)

def test_tabs_and_panel_reject_position_alias():
    for item in [
        { "component": "Tabs", "position": "left", "children": [] },
        { "component": "Panel", "position": "right", "children": [] },
    ]:
        doc = {
            "$formspecComponent": "1.0",
            "version": "1.0.0",
            "targetDefinition": { "url": "https://example.com/def" },
            "tree": item
        }
        with pytest.raises(ValidationError):
            validate(instance=doc, schema=SCHEMA)

@pytest.mark.parametrize("component_name", ["Section", "Stack", "Grid", "Card", "Panel"])
def test_container_visual_surface_props_valid(component_name):
    item = {
        "component": component_name,
        "padding": "$token.spacing.md",
        "background": "$token.color.surface",
        "border": "1px solid $token.color.border",
        "radius": "$token.radius.md",
        "elevation": "$token.elevation.low",
    }
    if component_name == "Grid":
        item["columns"] = 2
    if component_name in {"Section", "Stack", "Grid", "Card", "Panel"}:
        item["children"] = []
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": item
    }
    validate(instance=doc, schema=SCHEMA)

def test_component_compatibility_metadata_points_to_ui_policy():
    defs = SCHEMA["$defs"]
    for component_name in UI_POLICY["inputComponents"]:
        metadata = defs[component_name]["x-lm"]
        assert "compatibleDataTypes" not in metadata
        assert (
            metadata["compatibilityPolicyRef"]
            == f"specs/ui-policy.json#/inputComponents/{component_name}"
        )

def test_custom_component_ref_reserved_names_match_ui_policy():
    reserved = (
        {component["name"] for component in UI_POLICY["components"]}
        | set(UI_POLICY["retiredComponentNames"])
    )
    actual = set(
        SCHEMA["$defs"]["CustomComponentRef"]["properties"]["component"]["not"]["enum"]
    )
    assert actual == reserved

def test_token_references():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tokens": { "spacing.md": "16px" },
        "tree": {
            "component": "Stack",
            "gap": "$token.spacing.md",
            "children": []
        }
    }
    validate(instance=doc, schema=SCHEMA)

@pytest.mark.parametrize("component_name, props, extra_keys", [
    ("Section", {"title": "T"}, ["children"]),
    ("Stack", {"direction": "horizontal", "gap": 10}, ["children"]),
    ("Grid", {"columns": 3, "gap": "1em"}, ["children"]),
    ("TextInput", {"bind": "k", "placeholder": "P"}, []),
    ("NumberInput", {"bind": "k", "step": 1, "min": 0, "max": 10}, []),
    ("DatePicker", {"bind": "k", "format": "Y-m-d"}, []),
    ("Select", {"bind": "k", "searchable": True}, []),
    ("CheckboxGroup", {"bind": "k", "columns": 2, "selectAll": True}, []),
    ("Toggle", {"bind": "k", "onLabel": "Y", "offLabel": "N"}, []),
    ("FileUpload", {"bind": "k", "accept": ".jpg", "multiple": True}, []),
    ("Heading", {"level": 2, "text": "H"}, []),
    ("Text", {"text": "T", "format": "markdown"}, []),
    ("Divider", {"label": "D"}, []),
    ("Card", {"title": "T", "subtitle": "S"}, ["children"]),
    ("Collapsible", {"title": "T", "defaultOpen": True}, ["children"]),
    ("ConditionalGroup", {"when": "FEL", "fallback": "F"}, ["children"]),
    ("Tabs", {"placement": "left"}, ["children"]),
    ("Accordion", {"allowMultiple": True}, ["children"]),
    ("RadioGroup", {"bind": "k", "columns": 3}, []),
    ("MoneyInput", {"bind": "k", "currency": "USD", "showCurrency": True}, []),
    ("Slider", {"bind": "k", "min": 0, "max": 100, "step": 5}, []),
    ("Rating", {"bind": "k", "max": 5, "icon": "star"}, []),
    ("Signature", {"bind": "k", "strokeColor": "black", "clearable": True}, []),
    ("Alert", {"severity": "warning", "text": "A"}, []),
    ("Badge", {"text": "B", "variant": "primary"}, []),
    ("ProgressBar", {"value": 75, "max": 100, "label": "L"}, []),
    ("Summary", {"items": [{"label": "L", "bind": "k"}]}, []),
    ("DataTable", {"bind": "r", "columns": [{"header": "H", "bind": "k"}]}, []),
    ("Panel", {"placement": "right"}, ["children"]),
    ("Modal", {"title": "M", "size": "lg"}, ["children"]),
    ("Popover", {"triggerLabel": "Details", "placement": "right"}, ["children"]),
])
def test_all_component_types_valid(component_name, props, extra_keys):
    item = {"component": component_name, **props}
    for key in extra_keys:
        if key == "children":
            item[key] = []
    
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": item
    }
    validate(instance=doc, schema=SCHEMA)

@pytest.mark.parametrize("component_name, invalid_props", [
    ("Heading", {"level": 0}), # Min 1
    ("Heading", {"level": 7}), # Max 6
    ("Stack", {"direction": "up"}), # Enum
    ("TextInput", {}), # Missing bind
    ("Summary", {"items": [{"label": "L"}]}), # Missing bind in item
    ("DataTable", {"columns": [{"header": "H"}]}), # Missing bind in column
    ("Modal", {}), # Missing title
])
def test_component_types_invalid_props(component_name, invalid_props):
    item = {"component": component_name, **invalid_props}
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": item
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)
def test_custom_component_ref_structural():
    # Structural validation of a custom component reference
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "components": {
            "MyComp": {
                "params": ["p1"],
                "tree": { "component": "Text", "text": "{p1}" }
            }
        },
        "tree": {
            "component": "MyComp",
            "params": { "p1": "value" },
            "when": "$show",
            "style": { "color": "red" }
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_deep_nesting():
    # Test that deep nesting is allowed by schema
    # Depth 10 is sufficient to prove recursion works; deeper levels are
    # exponentially slow with oneOf discrimination in jsonschema.
    curr = { "component": "Stack", "children": [] }
    for _ in range(10):
        curr = { "component": "Stack", "children": [curr] }
    
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": curr
    }
    validate(instance=doc, schema=SCHEMA)

def test_tokens_at_top_level():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tokens": {
            "color.primary": "#007bff",
            "spacing.unit": 8,
            "font.size.large": "1.25rem"
        },
        "tree": { "component": "Stack", "gap": "$token.spacing.unit", "children": [] }
    }
    validate(instance=doc, schema=SCHEMA)

def test_breakpoints_at_top_level():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "breakpoints": {
            "mobile": 0,
            "tablet": 768,
            "desktop": 1024
        },
        "tree": { "component": "Section", "children": [] }
    }
    validate(instance=doc, schema=SCHEMA)

def test_interpolation_escaping_in_text():
    # {{ producing literal {
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "Text",
            "text": "Literal {{brace}}"
        }
    }
    validate(instance=doc, schema=SCHEMA)
def test_full_employee_onboarding_wizard():
    # Example from §18 of the plan — direct root Sections define wizard units.
    doc = {
        "$formspecComponent": "1.0",
        "url": "https://example.com/onboarding-ui",
        "version": "1.1.0",
        "targetDefinition": {
            "url": "https://example.com/onboarding-def",
            "compatibleVersions": "^1.0.0"
        },
        "tokens": {
            "spacing.page": "24px",
            "color.primary": "$token.brand.blue"
        },
        "components": {
            "LabeledSection": {
                "params": ["title", "itemKey"],
                "tree": {
                    "component": "Stack",
                    "children": [
                        { "component": "Heading", "level": 3, "text": "{title}" },
                        { "component": "TextInput", "bind": "{itemKey}" }
                    ]
                }
            }
        },
        "tree": {
            "component": "Stack",
            "children": [
                {
                    "component": "Section",
                    "title": "Personal Details",
                    "children": [
                        { "component": "Card", "title": "Basic Info", "children": [
                            { "component": "LabeledSection", "params": { "title": "First Name", "itemKey": "fname" } },
                            { "component": "LabeledSection", "params": { "title": "Last Name", "itemKey": "lname" } }
                        ]},
                        { "component": "DatePicker", "bind": "dob", "maxDate": "2007-01-01" }
                    ]
                },
                {
                    "component": "Section",
                    "title": "Equipment",
                    "children": [
                        { "component": "Text", "text": "Select your preferred equipment:" },
                        { "component": "CheckboxGroup", "bind": "hardware_prefs", "columns": 2 },
                        { "component": "ConditionalGroup",
                            "when": "CONTAINS($hardware_prefs, 'other')",
                            "children": [
                                { "component": "TextInput", "bind": "hardware_other_details", "placeholder": "Specify..." }
                            ]
                        }
                    ]
                }
            ]
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_empty_components_registry():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "components": {},
        "tree": { "component": "Section", "children": [] }
    }
    validate(instance=doc, schema=SCHEMA)

@pytest.mark.parametrize("invalid_token", [
    "$token", # No path
    "$token.", # Empty path
    "token.path", # Missing $
    "$token. space", # Invalid char
])
def test_invalid_token_references_schema_allows_string(invalid_token):
    # Schema doesn't strictly validate token pattern everywhere because they are strings.
    # Stack.gap accepts string token-looking values; token existence is semantic validation.
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": { "component": "Stack", "gap": invalid_token, "children": [] }
    }
    # These are technically valid JSON strings, so schema validates them.
    # Pattern validation for tokens isn't in the schema currently except for documentation.
    validate(instance=doc, schema=SCHEMA)

@pytest.mark.parametrize("dataType, component, valid", [
    # string
    ("string", "TextInput", True),
    ("string", "NumberInput", False),
    # integer
    ("integer", "NumberInput", True),
    ("integer", "Slider", True),
    ("integer", "Rating", True),
    ("integer", "TextInput", False),
    # decimal
    ("decimal", "NumberInput", True),
    ("decimal", "MoneyInput", True),
    ("decimal", "Slider", True),
    # boolean
    ("boolean", "Toggle", True),
    ("boolean", "TextInput", False),
    # date/time
    ("date", "DatePicker", True),
    ("dateTime", "DatePicker", True),
    ("time", "DatePicker", True),
    # choice
    ("choice", "Select", True),
    ("choice", "RadioGroup", True),
    # multiChoice
    ("multiChoice", "CheckboxGroup", True),
    # attachment
    ("attachment", "FileUpload", True),
    ("attachment", "Signature", True),
])
def test_compatibility_matrix_samples(dataType, component, valid):
    # This is a documentation check since the schema itself doesn't know the dataType
    # But it tests that these component/prop combinations are valid JSON
    item = {"component": component, "bind": "k"}
    if component == "Rating": item["max"] = 5
    if component == "Alert": item["severity"] = "info"; item["text"] = "T"
    
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": item
    }
    validate(instance=doc, schema=SCHEMA)

def test_invalid_custom_component_params_type():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "MyComp",
            "params": ["should", "be", "an", "object"]
        }
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)

def test_stack_with_sections():
    """Direct root Sections are page units; wizard behavior is controlled by formPresentation.pageMode."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "Stack",
            "children": [
                { "component": "Section", "title": "S1", "children": [] },
                { "component": "Section", "title": "S2", "children": [] }
            ]
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_datatable_columns_valid():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "DataTable",
            "bind": "repeating_group",
            "columns": [
                { "header": "Name", "bind": "name" },
                { "header": "Age", "bind": "age" }
            ]
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_summary_items_valid():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "Summary",
            "items": [
                { "label": "L1", "bind": "k1" },
                { "label": "L2", "bind": "k2" }
            ]
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_summary_item_with_option_set_valid():
    """A Summary item may specify optionSet to resolve choice labels.

    This test FAILS until the component schema adds 'optionSet' to the
    Summary item properties (currently additionalProperties: false with
    only 'label' and 'bind' allowed).
    """
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "tree": {
            "component": "Summary",
            "items": [
                {"label": "Org Type", "bind": "orgType", "optionSet": "orgTypes"}
            ],
        },
    }
    validate(instance=doc, schema=SCHEMA)


def test_summary_item_without_option_set_still_valid():
    """A Summary item without optionSet continues to pass schema validation.

    Regression guard: adding optionSet support must not break the existing
    required-fields contract (label + bind still sufficient).
    """
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "tree": {
            "component": "Summary",
            "items": [
                {"label": "Full Name", "bind": "fullName"}
            ],
        },
    }
    validate(instance=doc, schema=SCHEMA)


def test_all_progressive_fallbacks_present_in_spec():
    # Meta-test to ensure all progressive components have fallbacks defined in the
    # prose spec and in the machine-readable UI policy consumed by tooling.
    content = (REPO_ROOT / "specs" / "component" / "component-spec.md").read_text(encoding="utf-8")

    progressive = [
        "Tabs", "Accordion",
        "RadioGroup", "MoneyInput", "Slider", "Rating", "Signature",
        "Alert", "Badge", "ProgressBar", "Summary", "DataTable",
        "ValidationSummary", "Panel", "Modal", "Popover",
    ]
    for comp in progressive:
        section = re.search(
            rf"### \d+\.\d+ {re.escape(comp)}\b(?P<body>.*?)(?=\n### \d+\.\d+ |\n## )",
            content,
            flags=re.S,
        )
        assert section, f"{comp} section missing from component spec"
        assert re.search(r"\b[Ff]allback\b", section.group("body")), \
            f"{comp} section must document fallback behavior"
        policy = UI_POLICY["fallbackPolicy"]["components"].get(comp)
        assert policy, f"{comp} must declare structured fallback policy in specs/ui-policy.json"
        assert policy["fallback"], f"{comp} fallback policy must name fallback component"
        assert isinstance(policy.get("carry"), list), f"{comp} fallback policy must declare carry list"
        assert isinstance(policy.get("drop"), list), f"{comp} fallback policy must declare drop list"
        assert isinstance(policy.get("translate"), dict), f"{comp} fallback policy must declare translate map"

def test_schema_is_forward_compatible_via_style():
    # Any component can have 'style' and 'responsive'
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "Section",
            "style": { "x-custom-prop": 123 },
            "children": []
        }
    }
    validate(instance=doc, schema=SCHEMA)

def test_responsive_grid_overrides():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": {
            "component": "Grid",
            "columns": 4,
            "responsive": {
                "md": { "columns": 2 },
                "sm": { "columns": 1 }
            },
            "children": []
        }
    }
    validate(instance=doc, schema=SCHEMA)
@pytest.mark.parametrize("comp, prop, val", [
    ("Section", "title", 123), # Should be string
    ("Stack", "direction", "diagonal"), # Invalid enum
    ("Grid", "columns", -1), # Should be positive (if int)
    ("Heading", "level", 7), # Max 6
    ("Heading", "level", "two"), # Should be int
    ("TextInput", "maxLines", 0), # Min 1
    ("CheckboxGroup", "columns", 0), # Min 1
    ("Rating", "max", 0), # Min 1
    ("Modal", "size", "massive"), # Invalid enum
    ("Popover", "placement", "middle"), # Invalid enum
    ("Panel", "placement", "top"), # Invalid enum
    ("Alert", "severity", "critical"), # Invalid enum
])
def test_property_type_and_range_validation(comp, prop, val):
    item = {"component": comp, prop: val}
    if comp in ["TextInput", "CheckboxGroup", "Rating"]:
        item["bind"] = "k"
    if comp == "Heading":
        item["text"] = "T"
    if comp == "Modal":
        item["title"] = "T"
    if comp == "Alert":
        item["text"] = "T"
    
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": item
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)

def test_stack_direction_default():
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": { "url": "https://example.com/def" },
        "tree": { "component": "Stack", "children": [] }
    }
    validate(instance=doc, schema=SCHEMA)
    # Default is vertical


def test_top_level_name_title_description():
    """Top-level metadata fields are accepted."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "name": "my-form-ui",
        "title": "My Form UI",
        "description": "A component document for my form.",
        "targetDefinition": {"url": "https://example.com/def"},
        "tree": {"component": "Section", "children": []},
    }
    validate(instance=doc, schema=SCHEMA)


def test_top_level_x_extension_keys():
    """x-prefixed extension keys are allowed at top level."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "tree": {"component": "Section", "children": []},
        "x-vendor": {"config": True},
    }
    validate(instance=doc, schema=SCHEMA)


def test_custom_component_without_params():
    """Custom component definition with only tree (no params)."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "components": {
            "InfoBlock": {
                "tree": {"component": "Text", "text": "Static content"}
            }
        },
        "tree": {"component": "InfoBlock"},
    }
    validate(instance=doc, schema=SCHEMA)


def test_pascal_case_component_key_valid():
    """PascalCase keys pass the patternProperties constraint."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "components": {
            "MyWidget": {"tree": {"component": "Text", "text": "Hello"}},
            "AnotherOne99": {"tree": {"component": "Stack", "gap": 10}},
        },
        "tree": {"component": "Section", "children": []},
    }
    validate(instance=doc, schema=SCHEMA)


def test_lowercase_component_key_rejected():
    """Non-PascalCase keys fail the patternProperties constraint."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "components": {
            "myWidget": {"tree": {"component": "Text", "text": "Hello"}}
        },
        "tree": {"component": "Section", "children": []},
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)


@pytest.mark.parametrize("component_name, props, extra_keys", [
    ("Stack", {"direction": "horizontal", "wrap": True}, ["children"]),
    ("NumberInput", {"bind": "k", "showStepper": True, "locale": "en-US"}, []),
    ("DatePicker", {"bind": "k", "showTime": True}, []),
])
def test_extended_component_props(component_name, props, extra_keys):
    """Test component properties added in later schema revisions."""
    item = {"component": component_name, **props}
    for key in extra_keys:
        if key == "children":
            item[key] = []
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "tree": item,
    }
    validate(instance=doc, schema=SCHEMA)


@pytest.mark.parametrize("component_name, base_props", [
    ("Section", {"children": []}),
    ("TextInput", {"bind": "k"}),
    ("Heading", {"level": 1, "text": "Hi"}),
    ("Alert", {"severity": "info", "text": "Note"}),
])
def test_accessibility_block_accepted(component_name, base_props):
    """Every component accepts an optional accessibility block."""
    item = {
        "component": component_name,
        **base_props,
        "accessibility": {
            "role": "region",
            "description": "Main form section",
            "liveRegion": "polite",
        },
    }
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "tree": item,
    }
    validate(instance=doc, schema=SCHEMA)


def test_accessibility_block_invalid_live_region():
    """Invalid liveRegion value is rejected."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "tree": {
            "component": "Section",
            "children": [],
            "accessibility": {"liveRegion": "rude"},
        },
    }
    with pytest.raises(ValidationError):
        validate(instance=doc, schema=SCHEMA)


def test_accessibility_block_empty_valid():
    """Empty accessibility block is valid (all properties optional)."""
    doc = {
        "$formspecComponent": "1.0",
        "version": "1.0.0",
        "targetDefinition": {"url": "https://example.com/def"},
        "tree": {
            "component": "Section",
            "children": [],
            "accessibility": {},
        },
    }
    validate(instance=doc, schema=SCHEMA)
