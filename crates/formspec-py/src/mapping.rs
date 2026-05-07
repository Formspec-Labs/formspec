//! Mapping document parsing and `execute_mapping_doc` PyO3 binding.

use pyo3::prelude::*;

use formspec_core::{
    JsonWireStyle, execute_mapping_doc as run_mapping_document, mapping_result_to_json_value,
    parse_mapping_direction_wire, parse_mapping_document_from_value,
};

use crate::PyObject;
use crate::convert::{depythonize_json, json_to_python, normalize_wire_json_for_python};

#[pyfunction]
pub fn execute_mapping_doc(
    py: Python,
    doc_obj: &Bound<'_, PyAny>,
    source_obj: &Bound<'_, PyAny>,
    direction: &str,
) -> PyResult<PyObject> {
    let doc_val = depythonize_json(doc_obj)?;
    let source = depythonize_json(source_obj)?;
    let dir = parse_mapping_direction_wire(direction).map_err(|e| {
        pyo3::exceptions::PyValueError::new_err(format!("{e}, expected 'forward' or 'reverse'"))
    })?;
    let mapping_doc = parse_mapping_document_from_value(&doc_val)
        .map_err(|e| pyo3::exceptions::PyValueError::new_err(e))?;
    let result = run_mapping_document(&mapping_doc, &source, dir);
    let json = mapping_result_to_json_value(&result, JsonWireStyle::PythonSnake);
    let normalized = normalize_wire_json_for_python(&json);
    json_to_python(py, &normalized)
}
