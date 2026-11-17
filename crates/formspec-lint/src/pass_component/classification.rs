//! Built-in component names and bind/layout classification.

/// Components that may appear as the root of a component tree.
pub(crate) const LAYOUT_ROOTS: &[&str] = &[
    "Section",
    "Stack",
    "Grid",
    "Tabs",
    "Accordion",
    "Panel",
    "Card",
    "Collapsible",
    "ConditionalGroup",
    "Modal",
    "Popover",
];

const ALL_BUILTINS: &[&str] = &[
    "Section",
    "Stack",
    "Grid",
    "TextInput",
    "NumberInput",
    "DatePicker",
    "Select",
    "CheckboxGroup",
    "Toggle",
    "FileUpload",
    "Heading",
    "Text",
    "Divider",
    "Card",
    "Collapsible",
    "ConditionalGroup",
    "Tabs",
    "Accordion",
    "RadioGroup",
    "MoneyInput",
    "Slider",
    "Rating",
    "Signature",
    "Alert",
    "Badge",
    "ProgressBar",
    "Summary",
    "ValidationSummary",
    "ActionButton",
    "DataTable",
    "Panel",
    "Modal",
    "Popover",
];

pub(crate) fn is_builtin(name: &str) -> bool {
    ALL_BUILTINS.contains(&name)
}
