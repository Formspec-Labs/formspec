//! JSON text bindings for the pure Response selector.

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Select an authorized Response read and return its exact JSON value and evidence.
///
/// Records require a store-owned `kind` of `open-draft` or `filing`.
/// The context requires `upstreamSubject`. Supply JSON null when the upstream
/// Definition declares no subject. Invalid input raises ValueError.
#[pyfunction]
pub fn select_responses_json(
    records_json: &str,
    selection_json: &str,
    context_json: &str,
) -> PyResult<String> {
    formspec_core::response_selection::select_json(records_json, selection_json, context_json)
        .map_err(PyValueError::new_err)
}

/// Derive the canonical id of a typed Response subject.
#[pyfunction]
pub fn subject_id_json(subject_type: &str, keys_json: &str) -> PyResult<String> {
    formspec_core::subject_key::subject_id_json(subject_type, keys_json)
        .map_err(PyValueError::new_err)
}
