//! Exact JSON binding for the pre-signing Response assembler.

use wasm_bindgen::prelude::*;

/// Attach the evidence from available Response instance resolutions.
///
/// # Errors
/// Returns a JavaScript error if input cannot be decoded or delivery validation fails.
#[wasm_bindgen(js_name = assembleCandidate)]
pub fn assemble_candidate_wasm(
    definition_json: &str,
    response_json: &str,
    evaluation_json: &str,
    resolution_json: &str,
) -> Result<String, JsError> {
    formspec_eval::assemble_candidate_json(
        definition_json,
        response_json,
        evaluation_json,
        resolution_json,
    )
    .map_err(|error| JsError::new(&error))
}
