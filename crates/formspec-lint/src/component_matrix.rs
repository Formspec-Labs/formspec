//! Component/dataType compatibility matrix for the 12 built-in input components.
//!
//! Pure data module — no tree walking, no diagnostics. Consumed by `pass_component.rs`.
//!
//! Static `COMPAT_RULES` and `CompatRule` rows back the public classifiers; keep matrix tables maintainable.
#![allow(clippy::missing_docs_in_private_items)]

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

struct CompatRule {
    component: &'static str,
    strict_allowed: &'static [&'static str],
    authoring_allowed: &'static [&'static str],
    requires_options: bool,
}

/// The 12 built-in input components.
pub const INPUT_COMPONENTS: &[&str] = &[
    "TextInput",
    "NumberInput",
    "DatePicker",
    "Select",
    "CheckboxGroup",
    "Toggle",
    "FileUpload",
    "RadioGroup",
    "MoneyInput",
    "Slider",
    "Rating",
    "Signature",
];

static COMPAT_RULES: &[CompatRule] = &[
    CompatRule {
        component: "TextInput",
        strict_allowed: &["string", "text", "uri"],
        authoring_allowed: &[
            "integer",
            "decimal",
            "boolean",
            "date",
            "dateTime",
            "time",
            "attachment",
            "choice",
            "multiChoice",
            "money",
        ],
        requires_options: false,
    },
    CompatRule {
        component: "NumberInput",
        strict_allowed: &["integer", "decimal"],
        authoring_allowed: &["money"],
        requires_options: false,
    },
    CompatRule {
        component: "DatePicker",
        strict_allowed: &["date", "dateTime", "time"],
        authoring_allowed: &[],
        requires_options: false,
    },
    CompatRule {
        component: "Select",
        strict_allowed: &["choice"],
        authoring_allowed: &[],
        requires_options: true,
    },
    CompatRule {
        component: "CheckboxGroup",
        strict_allowed: &["multiChoice"],
        authoring_allowed: &[],
        requires_options: true,
    },
    CompatRule {
        component: "Toggle",
        strict_allowed: &["boolean"],
        authoring_allowed: &[],
        requires_options: false,
    },
    CompatRule {
        component: "FileUpload",
        strict_allowed: &["attachment"],
        authoring_allowed: &[],
        requires_options: false,
    },
    CompatRule {
        component: "RadioGroup",
        strict_allowed: &["choice"],
        authoring_allowed: &[],
        requires_options: true,
    },
    CompatRule {
        component: "MoneyInput",
        strict_allowed: &["integer", "decimal", "money"],
        authoring_allowed: &[],
        requires_options: false,
    },
    CompatRule {
        component: "Slider",
        strict_allowed: &["integer", "decimal"],
        authoring_allowed: &[],
        requires_options: false,
    },
    CompatRule {
        component: "Rating",
        strict_allowed: &["integer", "decimal"],
        authoring_allowed: &[],
        requires_options: false,
    },
    CompatRule {
        component: "Signature",
        strict_allowed: &["attachment"],
        authoring_allowed: &[],
        requires_options: false,
    },
];

fn find_rule(component: &str) -> Option<&'static CompatRule> {
    COMPAT_RULES.iter().find(|r| r.component == component)
}

/// Classify how compatible a component is with a given dataType.
///
/// Returns `NotApplicable` if the component is not one of the 12 input components.
pub fn classify_compatibility(component: &str, data_type: &str) -> Compatibility {
    match find_rule(component) {
        None => Compatibility::NotApplicable,
        Some(rule) => {
            if rule.strict_allowed.contains(&data_type) {
                Compatibility::Compatible
            } else if rule.authoring_allowed.contains(&data_type) {
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
    find_rule(component).is_some_and(|r| r.requires_options)
}

/// Whether this component is one of the 12 built-in input components.
pub fn is_input_component(component: &str) -> bool {
    find_rule(component).is_some()
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
        assert_eq!(INPUT_COMPONENTS.len(), 12);
        for &comp in INPUT_COMPONENTS {
            assert!(
                is_input_component(comp),
                "{comp} is in INPUT_COMPONENTS but not in COMPAT_RULES"
            );
        }
    }

    #[test]
    fn compat_rules_and_constant_are_in_sync() {
        // Every rule in the table should appear in INPUT_COMPONENTS and vice versa.
        for rule in COMPAT_RULES {
            assert!(
                INPUT_COMPONENTS.contains(&rule.component),
                "{} is in COMPAT_RULES but not INPUT_COMPONENTS",
                rule.component
            );
        }
        for &comp in INPUT_COMPONENTS {
            assert!(
                COMPAT_RULES.iter().any(|r| r.component == comp),
                "{comp} is in INPUT_COMPONENTS but has no CompatRule"
            );
        }
    }

    #[test]
    fn non_input_component_does_not_require_options() {
        assert!(!requires_options_source("Stack"));
        assert!(!requires_options_source("Card"));
    }

    // ── Parameterized compatibility matrix ───────────────────────
    //
    // This test iterates ALL rules in COMPAT_RULES and verifies that:
    //   - Every entry in `strict_allowed` returns Compatible
    //   - Every entry in `authoring_allowed` returns CompatibleWithWarning
    // This catches drift when components or data types are added to the rules
    // but the matrix was not updated consistently.

    /// Spec: component-spec.md §6.1 — exhaustive compatibility matrix
    #[test]
    fn parameterized_compat_matrix_covers_all_rules() {
        for rule in COMPAT_RULES {
            // Verify every strict_allowed type returns Compatible
            for &dt in rule.strict_allowed {
                let result = classify_compatibility(rule.component, dt);
                assert_eq!(
                    result,
                    Compatibility::Compatible,
                    "Component '{}' with dataType '{}' should be Compatible (strict_allowed), got {:?}",
                    rule.component,
                    dt,
                    result,
                );
            }

            // Verify every authoring_allowed type returns CompatibleWithWarning
            for &dt in rule.authoring_allowed {
                let result = classify_compatibility(rule.component, dt);
                assert_eq!(
                    result,
                    Compatibility::CompatibleWithWarning,
                    "Component '{}' with dataType '{}' should be CompatibleWithWarning (authoring_allowed), got {:?}",
                    rule.component,
                    dt,
                    result,
                );
            }
        }
    }

    /// Spec: component-spec.md §6.1 — types not in either list should be Incompatible
    #[test]
    fn unlisted_data_type_is_incompatible() {
        // Pick a data type that's definitely not in any rule's allowed lists
        for rule in COMPAT_RULES {
            // "unknown_type_xyz" is not a real data type, so it should be Incompatible
            let result = classify_compatibility(rule.component, "unknown_type_xyz");
            assert_eq!(
                result,
                Compatibility::Incompatible,
                "Component '{}' with unknown dataType should be Incompatible",
                rule.component,
            );
        }
    }
}
