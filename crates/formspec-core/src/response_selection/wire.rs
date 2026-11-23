//! Wire admission for the selector.

use serde::{Deserialize, Deserializer, de::Error};
use serde_json::value::RawValue;

use super::{SelectionContext, SelectionRecord, select};

/// Read a signed offset without rounding.
pub(super) fn deserialize_offset<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<i64>, D::Error> {
    let raw = Box::<RawValue>::deserialize(deserializer)?;
    crate::subject_key::json_integer(&raw)
        .map(Some)
        .map_err(D::Error::custom)
}

/// Runs the shared selector on its JSON wire inputs.
///
/// # Errors
///
/// Returns an error if any of the JSON inputs cannot be decoded or the result cannot
/// be serialized. Valid input with an unavailable resolution returns a JSON outcome.
pub fn select_json(
    records_json: &str,
    selection_json: &str,
    context_json: &str,
) -> Result<String, String> {
    let records: Vec<SelectionRecord> = serde_json::from_str(records_json)
        .map_err(|error| format!("invalid selection records: {error}"))?;
    let selection = serde_json::from_str(selection_json)
        .map_err(|error| format!("invalid Response selection: {error}"))?;
    let context: SelectionContext = serde_json::from_str(context_json)
        .map_err(|error| format!("invalid selection context: {error}"))?;
    serde_json::to_string(&select(&records, &selection, &context))
        .map_err(|error| error.to_string())
}
