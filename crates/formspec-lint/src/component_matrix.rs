//! Component/dataType compatibility accessors for built-in input components.
//!
//! Pure data module — no tree walking, no diagnostics. Consumed by
//! `pass_component.rs` and `pass_theme.rs`.
//!
//! The matrix is loaded from `specs/ui-policy.json` so TypeScript helpers and
//! Rust lint consume the same policy artifact.
#![allow(clippy::missing_docs_in_private_items)]

use crate::ui_policy::input_component_policy;

/// Result of checking a component against a dataType.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Compatibility {
    /// Fully compatible — no diagnostic needed.
    Compatible,
    /// Compatible in authoring mode only — emit warning in runtime mode.
    CompatibleWithWarning,
    /// Incompatible — always an error.
    Incompatible,
    /// Not an input component (layout, display, etc.) — skip check.
    NotApplicable,
}

/// The built-in input components declared by the shared UI policy.
pub fn input_components() -> Vec<&'static str> {
    crate::ui_policy::ui_policy()
        .input_components
        .keys()
        .map(String::as_str)
        .collect()
}

/// Classify how compatible a component is with a given dataType.
///
/// Returns `NotApplicable` if the component is not one of the 12 input components.
pub fn classify_compatibility(component: &str, data_type: &str) -> Compatibility {
    match input_component_policy(component) {
        None => Compatibility::NotApplicable,
        Some(policy) => {
            if policy.strict_data_types.contains(data_type) {
                Compatibility::Compatible
            } else if policy.authoring_data_types.contains(data_type) {
                Compatibility::CompatibleWithWarning
            } else {
                Compatibility::Incompatible
            }
        }
    }
}

/// Whether this component requires an optionSet or inline options.
///
/// Returns `false` for non-input components.
pub fn requires_options_source(component: &str) -> bool {
    input_component_policy(component).is_some_and(|policy| policy.requires_options)
}

/// Whether this component is one of the 12 built-in input components.
pub fn is_input_component(component: &str) -> bool {
    input_component_policy(component).is_some()
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;

    #[test]
    fn text_input_string_is_compatible() {
        assert_eq!(
            classify_compatibility("TextInput", "string"),
            Compatibility::Compatible
        );
    }

    #[test]
    fn text_input_uri_is_compatible() {
        assert_eq!(
            classify_compatibility("TextInput", "uri"),
            Compatibility::Compatible
        );
    }

    #[test]
    fn text_input_integer_is_compatible_with_warning() {
        assert_eq!(
            classify_compatibility("TextInput", "integer"),
            Compatibility::CompatibleWithWarning
        );
    }

    #[test]
    fn toggle_string_is_incompatible() {
        assert_eq!(
            classify_compatibility("Toggle", "string"),
            Compatibility::Incompatible
        );
    }

    #[test]
    fn non_input_component_returns_not_applicable() {
        assert_eq!(
            classify_compatibility("Stack", "string"),
            Compatibility::NotApplicable
        );
    }

    #[test]
    fn select_requires_options() {
        assert!(requires_options_source("Select"));
    }

    #[test]
    fn checkbox_group_requires_options() {
        assert!(requires_options_source("CheckboxGroup"));
    }

    #[test]
    fn radio_group_requires_options() {
        assert!(requires_options_source("RadioGroup"));
    }

    #[test]
    fn text_input_does_not_require_options() {
        assert!(!requires_options_source("TextInput"));
    }

    #[test]
    fn rating_integer_and_decimal_both_compatible() {
        assert_eq!(
            classify_compatibility("Rating", "integer"),
            Compatibility::Compatible
        );
        assert_eq!(
            classify_compatibility("Rating", "decimal"),
            Compatibility::Compatible
        );
    }

    #[test]
    fn number_input_money_is_compatible_with_warning() {
        assert_eq!(
            classify_compatibility("NumberInput", "money"),
            Compatibility::CompatibleWithWarning
        );
    }

    #[test]
    fn all_twelve_components_in_input_components() {
        let components = input_components();
        assert_eq!(components.len(), 12);
        for comp in components {
            assert!(
                is_input_component(comp),
                "{comp} is in ui-policy inputComponents but not classified as input"
            );
        }
    }

    #[test]
    fn input_components_are_declared_components() {
        let known_components = crate::ui_policy::known_component_names();
        for comp in input_components() {
            assert!(
                known_components.contains(comp),
                "{comp} is an input component but not a declared UI policy component"
            );
        }
    }

    #[test]
    fn non_input_component_does_not_require_options() {
        assert!(!requires_options_source("Stack"));
        assert!(!requires_options_source("Card"));
    }

    /// Spec: component-spec.md §6.1 — exhaustive compatibility matrix
    #[test]
    fn parameterized_compat_matrix_covers_all_policy_rows() {
        for comp in input_components() {
            let policy = input_component_policy(comp).expect("input component policy exists");
            for dt in &policy.strict_data_types {
                let result = classify_compatibility(comp, dt);
                assert_eq!(
                    result,
                    Compatibility::Compatible,
                    "Component '{comp}' with dataType '{dt}' should be Compatible, got {result:?}",
                );
            }

            for dt in &policy.authoring_data_types {
                let result = classify_compatibility(comp, dt);
                assert_eq!(
                    result,
                    Compatibility::CompatibleWithWarning,
                    "Component '{comp}' with dataType '{dt}' should be CompatibleWithWarning, got {result:?}",
                );
            }
        }
    }

    /// Spec: component-spec.md §6.1 — types not in either list should be Incompatible
    #[test]
    fn unlisted_data_type_is_incompatible() {
        for comp in input_components() {
            let result = classify_compatibility(comp, "unknown_type_xyz");
            assert_eq!(
                result,
                Compatibility::Incompatible,
                "Component '{comp}' with unknown dataType should be Incompatible",
            );
        }
    }
}
