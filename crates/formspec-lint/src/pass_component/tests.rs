#![allow(clippy::missing_docs_in_private_items)]

use super::classification::{CONTAINER_NO_BIND, LAYOUT_NO_BIND, LAYOUT_ROOTS};
use super::{lint_component, PASS};
use crate::types::LintDiagnostic;
use serde_json::json;

fn with_code<'a>(diags: &'a [LintDiagnostic], code: &str) -> Vec<&'a LintDiagnostic> {
    diags.iter().filter(|d| d.code == code).collect()
}

    // 1. Empty component — no diagnostics
    #[test]
    fn empty_component_no_diagnostics() {
        let comp = json!({});
        let diags = lint_component(&comp, None);
        assert!(diags.is_empty());
    }

    // 2. Layout root (Stack) — no E800
    #[test]
    fn layout_root_no_e800() {
        let comp = json!({
            "tree": { "component": "Stack", "children": [] }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "E800").is_empty());
    }

    #[test]
    fn all_layout_roots_accepted() {
        for root in LAYOUT_ROOTS {
            let comp = json!({
                "tree": { "component": root, "children": [] }
            });
            let diags = lint_component(&comp, None);
            assert!(
                with_code(&diags, "E800").is_empty(),
                "{root} should be accepted as a layout root"
            );
        }
    }

    // 3. Non-layout root (TextInput) — E800
    #[test]
    fn non_layout_root_emits_e800() {
        let comp = json!({
            "tree": { "component": "TextInput", "bind": "name" }
        });
        let diags = lint_component(&comp, None);
        let e800 = with_code(&diags, "E800");
        assert_eq!(e800.len(), 1);
        assert!(e800[0].message.contains("TextInput"));
    }

    #[test]
    fn missing_component_type_emits_e800() {
        let comp = json!({
            "tree": { "children": [] }
        });
        let diags = lint_component(&comp, None);
        assert_eq!(with_code(&diags, "E800").len(), 1);
    }

    // 4. Unknown component — E801
    #[test]
    fn unknown_component_emits_e801() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "FancyWidget", "bind": "x" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        let e801 = with_code(&diags, "E801");
        assert_eq!(e801.len(), 1);
        assert!(e801[0].message.contains("FancyWidget"));
    }

    #[test]
    fn custom_component_not_flagged_as_unknown() {
        let comp = json!({
            "components": {
                "AddressBlock": {
                    "tree": { "component": "Stack", "children": [] },
                    "params": ["label"]
                }
            },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "AddressBlock", "label": "Home" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "E801").is_empty());
    }

    // 5. Custom component missing params — E806
    #[test]
    fn custom_component_missing_params_emits_e806() {
        let comp = json!({
            "components": {
                "LabeledField": {
                    "tree": { "component": "Stack", "children": [] },
                    "params": ["field", "label"]
                }
            },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "LabeledField", "params": { "field": "name" } }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        let e806 = with_code(&diags, "E806");
        assert_eq!(e806.len(), 1);
        assert!(e806[0].message.contains("label"));
    }

    #[test]
    fn custom_component_all_params_no_e806() {
        let comp = json!({
            "components": {
                "LabeledField": {
                    "tree": { "component": "Stack", "children": [] },
                    "params": ["field", "label"]
                }
            },
            "tree": {
                "component": "Stack",
                "children": [
                    {
                        "component": "LabeledField",
                        "params": { "field": "name", "label": "Name" }
                    }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "E806").is_empty());
    }

    // 7. Custom component cycle — E807
    #[test]
    fn custom_component_self_reference_emits_e807() {
        let comp = json!({
            "components": {
                "Recursive": {
                    "tree": {
                        "component": "Stack",
                        "children": [
                            { "component": "Recursive" }
                        ]
                    }
                }
            },
            "tree": { "component": "Stack", "children": [] }
        });
        let diags = lint_component(&comp, None);
        let e807 = with_code(&diags, "E807");
        assert_eq!(e807.len(), 1);
        assert!(e807[0].message.contains("Recursive"));
    }

    #[test]
    fn custom_component_mutual_cycle_emits_e807() {
        let comp = json!({
            "components": {
                "Alpha": {
                    "tree": {
                        "component": "Stack",
                        "children": [{ "component": "Beta" }]
                    }
                },
                "Beta": {
                    "tree": {
                        "component": "Stack",
                        "children": [{ "component": "Alpha" }]
                    }
                }
            },
            "tree": { "component": "Stack", "children": [] }
        });
        let diags = lint_component(&comp, None);
        let e807 = with_code(&diags, "E807");
        assert!(!e807.is_empty(), "Mutual cycle should emit E807");
    }

    #[test]
    fn custom_component_no_cycle_no_e807() {
        let comp = json!({
            "components": {
                "Wrapper": {
                    "tree": {
                        "component": "Stack",
                        "children": [{ "component": "TextInput", "bind": "x" }]
                    }
                }
            },
            "tree": { "component": "Stack", "children": [] }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "E807").is_empty());
    }

    // 8. Duplicate bind in tree — W804
    #[test]
    fn duplicate_bind_emits_w804() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "name" },
                    { "component": "TextInput", "bind": "name" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        let w804 = with_code(&diags, "W804");
        assert_eq!(w804.len(), 1);
        assert!(w804[0].message.contains("name"));
    }

    #[test]
    fn unique_binds_no_w804() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "first_name" },
                    { "component": "TextInput", "bind": "last_name" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "W804").is_empty());
    }

    // 9. Layout component with bind — W801
    #[test]
    fn layout_with_bind_emits_w801() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "bind": "oops",
                "children": []
            }
        });
        let diags = lint_component(&comp, None);
        let w801 = with_code(&diags, "W801");
        assert_eq!(w801.len(), 1);
        assert!(w801[0].message.contains("Stack"));
    }

    #[test]
    fn container_with_bind_emits_w801() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "Card", "bind": "oops", "children": [] }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        let w801 = with_code(&diags, "W801");
        assert_eq!(w801.len(), 1);
        assert!(w801[0].message.contains("Card"));
    }

    #[test]
    fn data_table_bind_no_w801() {
        // DataTable is a special container that CAN bind
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "DataTable", "bind": "items" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "W801").is_empty());
    }

    #[test]
    fn accordion_bind_no_w801() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "Accordion", "bind": "items", "children": [] }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "W801").is_empty());
    }

    // 10. With definition: bind resolves, compatible — no warnings
    #[test]
    fn compatible_bind_no_warnings() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "name" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "name", "dataType": "string" }]
        });
        let diags = lint_component(&comp, Some(&def));
        assert!(with_code(&diags, "W800").is_empty());
        assert!(with_code(&diags, "E802").is_empty());
        assert!(with_code(&diags, "W802").is_empty());
    }

    // 11. With definition: bind doesn't resolve — W800
    #[test]
    fn unresolved_bind_emits_w800() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "ghost" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "name", "dataType": "string" }]
        });
        let diags = lint_component(&comp, Some(&def));
        let w800 = with_code(&diags, "W800");
        assert_eq!(w800.len(), 1);
        assert!(w800[0].message.contains("ghost"));
    }

    // 12. With definition: incompatible type — E802
    #[test]
    fn incompatible_type_emits_e802() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "Toggle", "bind": "name" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "name", "dataType": "string" }]
        });
        let diags = lint_component(&comp, Some(&def));
        let e802 = with_code(&diags, "E802");
        assert_eq!(e802.len(), 1);
        assert!(e802[0].message.contains("Toggle"));
        assert!(e802[0].message.contains("string"));
    }

    #[test]
    fn compatible_with_warning_emits_w802() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "age" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "age", "dataType": "integer" }]
        });
        let diags = lint_component(&comp, Some(&def));
        let w802 = with_code(&diags, "W802");
        assert_eq!(w802.len(), 1);
        assert!(w802[0].message.contains("TextInput"));
        assert!(w802[0].message.contains("integer"));
    }

    // 13. Without definition: skip resolution checks
    #[test]
    fn no_definition_skips_resolution_checks() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "Toggle", "bind": "ghost" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "W800").is_empty());
        assert!(with_code(&diags, "E802").is_empty());
        assert!(with_code(&diags, "E803").is_empty());
    }

    // E803: Requires options but field has none
    #[test]
    fn select_without_options_emits_e803() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "Select", "bind": "color" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "color", "dataType": "choice" }]
        });
        let diags = lint_component(&comp, Some(&def));
        let e803 = with_code(&diags, "E803");
        assert_eq!(e803.len(), 1);
        assert!(e803[0].message.contains("Select"));
    }

    #[test]
    fn select_with_option_set_no_e803() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "Select", "bind": "color" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "color", "dataType": "choice", "optionSet": "colors" }],
            "optionSets": { "colors": { "options": [{ "value": "red" }] } }
        });
        let diags = lint_component(&comp, Some(&def));
        assert!(with_code(&diags, "E803").is_empty());
    }

    #[test]
    fn select_with_inline_options_no_e803() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "Select", "bind": "color" }
                ]
            }
        });
        let def = json!({
            "items": [{
                "key": "color", "dataType": "choice",
                "options": [{ "value": "red", "label": "Red" }]
            }]
        });
        let diags = lint_component(&comp, Some(&def));
        assert!(with_code(&diags, "E803").is_empty());
    }

    // E804: richtext TextInput must bind string
    #[test]
    fn richtext_non_string_emits_e804() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "count", "variant": "richtext" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "count", "dataType": "integer" }]
        });
        let diags = lint_component(&comp, Some(&def));
        let e804 = with_code(&diags, "E804");
        assert_eq!(e804.len(), 1);
        assert!(e804[0].message.contains("richtext"));
        assert!(e804[0].message.contains("integer"));
    }

    #[test]
    fn richtext_string_no_e804() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "bio", "variant": "richtext" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "bio", "dataType": "string" }]
        });
        let diags = lint_component(&comp, Some(&def));
        assert!(with_code(&diags, "E804").is_empty());
    }

    // W803: Multiple editable inputs bind same field
    #[test]
    fn multiple_editable_inputs_same_bind_emits_w803() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "name" },
                    { "component": "NumberInput", "bind": "name" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        let w803 = with_code(&diags, "W803");
        assert_eq!(w803.len(), 1);
        assert!(w803[0].message.contains("name"));
    }

    #[test]
    fn display_and_input_same_bind_no_w803() {
        // Heading is a display component, not input — only the input triggers W803
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "Heading", "bind": "name" },
                    { "component": "TextInput", "bind": "name" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(with_code(&diags, "W803").is_empty());
    }

    // ── Finding 62: W801 for ALL no-bind components ────────────

    /// Spec: component-spec.md §4.2 — layout components should not declare a bind.
    #[test]
    fn w801_all_layout_no_bind_components() {
        for comp_type in LAYOUT_NO_BIND {
            let comp = json!({
                "tree": {
                    "component": "Stack",
                    "children": [
                        { "component": comp_type, "bind": "oops", "children": [] }
                    ]
                }
            });
            let diags = lint_component(&comp, None);
            let w801 = with_code(&diags, "W801");
            assert!(
                !w801.is_empty(),
                "Layout component '{comp_type}' with bind should emit W801"
            );
            assert!(
                w801[0].message.contains(comp_type),
                "W801 message should mention '{comp_type}'"
            );
        }
    }

    /// Spec: component-spec.md §4.2 — container components without repeat-group bind
    /// exceptions emit W801.
    #[test]
    fn w801_all_container_no_bind_components() {
        for comp_type in CONTAINER_NO_BIND {
            let comp = json!({
                "tree": {
                    "component": "Stack",
                    "children": [
                        { "component": comp_type, "bind": "oops", "children": [] }
                    ]
                }
            });
            let diags = lint_component(&comp, None);
            let w801 = with_code(&diags, "W801");
            assert!(
                !w801.is_empty(),
                "Container component '{comp_type}' with bind should emit W801"
            );
        }
    }

    // ── Finding 64: richtext TextInput with "text" dataType ──────

    /// Spec: core/spec.md §4.2.3 — "text" is an alias for "string" in richtext context.
    /// The code at line 247 already accepts both "string" and "text" — this test
    /// verifies the acceptance path.
    #[test]
    fn richtext_text_datatype_no_e804() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "notes", "variant": "richtext" }
                ]
            }
        });
        let def = json!({
            "items": [{ "key": "notes", "dataType": "text" }]
        });
        let diags = lint_component(&comp, Some(&def));
        assert!(
            with_code(&diags, "E804").is_empty(),
            "richtext TextInput with 'text' dataType should NOT emit E804"
        );
    }

    // All diagnostics use pass 7
    #[test]
    fn all_diagnostics_are_pass_7() {
        let comp = json!({
            "tree": {
                "component": "TextInput",
                "bind": "x",
                "children": [
                    { "component": "FancyWidget" },
                    { "component": "TextInput", "bind": "x" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(!diags.is_empty());
        for d in &diags {
            assert_eq!(
                d.pass, PASS,
                "Diagnostic {} should be pass {}",
                d.code, PASS
            );
        }
    }

    // Nested tree walking
    #[test]
    fn deeply_nested_bind_tracked() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    {
                        "component": "Card",
                        "children": [
                            { "component": "TextInput", "bind": "name" }
                        ]
                    },
                    { "component": "TextInput", "bind": "name" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert_eq!(with_code(&diags, "W804").len(), 1);
    }

    // ── Custom component with empty params array ──────────────

    /// Spec: component-spec.md §8.2 — custom component with "params": [] means no required params
    #[test]
    fn custom_component_empty_params_no_e806() {
        let comp = json!({
            "components": {
                "EmptyParamsWidget": {
                    "tree": { "component": "Stack", "children": [] },
                    "params": []
                }
            },
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "EmptyParamsWidget" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(
            with_code(&diags, "E806").is_empty(),
            "Empty params array means no required params — no E806"
        );
        assert!(
            with_code(&diags, "E801").is_empty(),
            "Custom component should not be flagged as unknown"
        );
    }

    // ── SubmitButton component ──────────────────────────────────

    /// Spec: component-spec.md §7.33 — SubmitButton is a built-in component
    #[test]
    fn submit_button_is_recognized_builtin() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "SubmitButton" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        assert!(
            with_code(&diags, "E801").is_empty(),
            "SubmitButton should be recognized as a built-in component"
        );
    }

    /// Spec: component-spec.md §7.33 — SubmitButton should not declare a bind (it's not an input)
    #[test]
    fn submit_button_with_bind_not_input_component() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "SubmitButton", "bind": "field1" }
                ]
            }
        });
        let diags = lint_component(&comp, None);
        // SubmitButton is not in LAYOUT_NO_BIND or CONTAINER_NO_BIND, and it's not an input component.
        // So W801 should NOT fire (it's not a layout/container), and W803 should NOT fire (it's not input).
        // But W804 duplicate bind tracking still applies.
        assert!(
            with_code(&diags, "W801").is_empty(),
            "SubmitButton is not layout/container, so no W801"
        );
    }

    // ── W804 semantic divergence documentation ──────────────────
    //
    // NOTE: In Rust, W804 means "duplicate bind in the component tree" — any
    // two nodes (regardless of type) sharing the same bind value triggers it.
    //
    // In the Python linter, W804 means "unresolved Summary/DataTable bind" —
    // a completely different semantic. If the Python-equivalent checks are
    // added to this crate in the future, they should use a different code.

    // Field lookup finds nested definition items
    #[test]
    fn field_lookup_finds_nested_items() {
        let comp = json!({
            "tree": {
                "component": "Stack",
                "children": [
                    { "component": "TextInput", "bind": "amount" }
                ]
            }
        });
        let def = json!({
            "items": [{
                "key": "lines",
                "children": [{ "key": "amount", "dataType": "string" }]
            }]
        });
        let diags = lint_component(&comp, Some(&def));
        assert!(
            with_code(&diags, "W800").is_empty(),
            "Nested field 'amount' should resolve"
        );
    }
