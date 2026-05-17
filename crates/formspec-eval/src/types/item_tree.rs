//! Item tree nodes built from the definition.

use serde_json::Value;

use super::modes::{ExcludedValueMode, NrbMode, WhitespaceMode};

/// A node in the evaluation item tree.
#[derive(Debug, Clone)]
pub struct ItemInfo {
    /// Item key (leaf name, not full path).
    pub key: String,
    /// Full dotted path from root (e.g. "address.city").
    pub path: String,
    /// Normalized item type ("field", "group", "display", etc.).
    pub item_type: String,
    /// Data type (string, number, boolean, date, etc.).
    pub data_type: Option<String>,
    /// Fixed currency for money fields, or the definition default currency.
    pub currency: Option<String>,
    /// Current value.
    pub value: Value,
    /// Whether the item is relevant (visible).
    pub relevant: bool,
    /// Whether the item is required.
    pub required: bool,
    /// Whether the item is readonly.
    pub readonly: bool,
    /// Calculated expression (if any).
    pub calculate: Option<String>,
    /// Numeric precision for calculated values.
    pub precision: Option<u32>,
    /// Constraint expression (if any).
    pub constraint: Option<String>,
    /// Author-provided constraint failure message (if any).
    pub constraint_message: Option<String>,
    /// Relevance expression (if any).
    pub relevance: Option<String>,
    /// Required expression (if any).
    pub required_expr: Option<String>,
    /// Readonly expression (if any).
    pub readonly_expr: Option<String>,
    /// Whitespace normalization mode (if any).
    pub whitespace: Option<WhitespaceMode>,
    /// Non-relevant behavior override for this bind.
    pub nrb: Option<NrbMode>,
    /// Excluded value behavior when non-relevant.
    pub excluded_value: Option<ExcludedValueMode>,
    /// Default value to apply on non-relevant → relevant transition when field is empty.
    pub default_value: Option<Value>,
    /// FEL expression default (without `=` prefix) for relevance transitions.
    pub default_expression: Option<String>,
    /// Initial value for field seeding (literal or "=expr").
    pub initial_value: Option<Value>,
    /// Previous relevance state (for tracking transitions).
    pub prev_relevant: bool,
    /// Parent path (None for top-level items).
    pub parent_path: Option<String>,
    /// Whether this group is repeatable.
    pub repeatable: bool,
    /// Minimum repeat count (for repeatable groups).
    pub repeat_min: Option<u64>,
    /// Maximum repeat count (for repeatable groups).
    pub repeat_max: Option<u64>,
    /// Valid option values for choice/multiChoice fields.
    pub option_values: Vec<String>,
    /// Accepted MIME types for attachment fields (e.g. ["image/*", "application/pdf"]).
    pub accept_types: Vec<String>,
    /// Extension names declared on this item (only enabled ones, value=true).
    pub extensions: Vec<String>,
    /// Pre-populate instance name (e.g. "userProfile").
    pub pre_populate_instance: Option<String>,
    /// Pre-populate path within the instance (e.g. "contactEmail").
    pub pre_populate_path: Option<String>,
    /// Child items.
    pub children: Vec<ItemInfo>,
}
