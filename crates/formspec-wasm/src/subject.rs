//! Subject identity, exported by both the runtime and the tools WASM builds.
// Rust guideline compliant 2026-02-21

use wasm_bindgen::prelude::*;

/// Derive the canonical id of a typed Response subject.
///
/// Respondent hosts key drafts by this id before an engine exists; the engine derives
/// `Response.subject.id` through the same function.
///
/// # Errors
///
/// Returns an error for malformed or untyped keys JSON or an out-of-range integer key.
#[wasm_bindgen(js_name = subjectIdJson)]
pub fn subject_id_json(subject_type: &str, keys_json: &str) -> Result<String, String> {
    formspec_core::subject_key::subject_id_json(subject_type, keys_json)
}
