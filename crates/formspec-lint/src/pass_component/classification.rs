//! Built-in component names and bind/layout classification.

/// Components that may appear as the root of a component tree.
pub(crate) const LAYOUT_ROOTS: &[&str] = &[
    "Page", "Stack", "Grid", "Columns", "Tabs", "Accordion", "Panel", "Card",
    "Collapsible", "ConditionalGroup", "Modal",
];

pub(crate) const LAYOUT_NO_BIND: &[&str] = &["Page", "Stack", "Grid", "Spacer"];

pub(crate) const CONTAINER_NO_BIND: &[&str] = &[
    "Card", "Collapsible", "ConditionalGroup", "Columns", "Tabs", "Panel", "Modal", "Popover",
];

const ALL_BUILTINS: &[&str] = &[
    "Page", "Stack", "Grid", "Spacer", "TextInput", "NumberInput", "DatePicker", "Select",
    "CheckboxGroup", "Toggle", "FileUpload", "Heading", "Text", "Divider", "Card", "Collapsible",
    "ConditionalGroup", "Columns", "Tabs", "Accordion", "RadioGroup", "MoneyInput", "Slider",
    "Rating", "Signature", "Alert", "Badge", "ProgressBar", "Summary", "ValidationSummary",
    "DataTable", "Panel", "Modal", "Popover", "SubmitButton",
];

pub(crate) fn is_builtin(name: &str) -> bool {
    ALL_BUILTINS.contains(&name)
}

pub(crate) fn should_not_bind(name: &str) -> bool {
    LAYOUT_NO_BIND.contains(&name) || CONTAINER_NO_BIND.contains(&name)
}
