//! Exact JSON binding for the pre-signing Response assembler.

use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

/// Assemble the signed Response instance evidence from host deliveries.
///
/// Invalid input or delivery validation failure raises ValueError.
#[pyfunction]
pub fn assemble_candidate_json(
    definition_json: &str,
    response_json: &str,
    evaluation_json: &str,
    resolution_json: &str,
) -> PyResult<String> {
    formspec_eval::assemble_candidate_json(
        definition_json,
        response_json,
        evaluation_json,
        resolution_json,
    )
    .map_err(PyValueError::new_err)
}
