//! JSON text bindings for the preview Response selector.

use wasm_bindgen::prelude::*;

/// Select an authorized Response read and return its exact JSON value and evidence.
///
/// # Errors
///
/// Returns an error for invalid input JSON, including an omitted `upstreamSubject`.
/// Supply JSON null when the upstream Definition declares no subject.
#[wasm_bindgen(js_name = selectResponsesJson)]
pub fn select_responses_json(
    records_json: &str,
    selection_json: &str,
    context_json: &str,
) -> Result<String, String> {
    formspec_core::response_selection::select_json(records_json, selection_json, context_json)
}

/// Derive the canonical id of a typed Response subject.
#[wasm_bindgen(js_name = subjectIdJson)]
pub fn subject_id_json(subject_type: &str, keys_json: &str) -> Result<String, String> {
    formspec_core::response_selection::subject_id_json(subject_type, keys_json)
}

/// Check whether a Response's authored timestamp identifies an instant.
#[wasm_bindgen(js_name = isValidResponseAuthored)]
pub fn is_valid_response_authored(authored: &str) -> bool {
    formspec_core::response_selection::valid_authored_instant(authored)
}
