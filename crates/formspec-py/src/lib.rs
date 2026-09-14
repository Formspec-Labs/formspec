//! PyO3 bindings for Formspec — FEL, linting, definition evaluation, registry, changelog, and mapping to Python.
//!
//! ## Layout
//! - `convert` — Python ↔ FEL / JSON, `depythonize_json`, `parse_fel_expr`, string helpers
//! - `fel` — `eval_fel`, parse, dependencies, analysis, builtins
//! - `document` — detect type, lint, `evaluate_def`, screener
//! - `extensions` — Python callables as FEL extension functions for `evaluate_def`
//! - `registry` — parse registry, find entry, lifecycle, well-known URL
//! - `changelog` — `generate_changelog`
//! - `mapping` — mapping document parse + `execute_mapping_doc`
//! - `native_tests` — Rust unit tests (mapping parse, string helpers; `#[cfg(test)]` only)

pub(crate) const PY_API_VERSION: u32 = 1;

pub(crate) type PyObject = pyo3::Py<pyo3::PyAny>;

mod changelog;
mod convert;
mod document;
mod extensions;
mod fel;
mod mapping;
mod registry;

#[cfg(test)]
mod native_tests;

use pyo3::prelude::*;

/// Native Rust implementation of Formspec processing.
#[pymodule(name = "_native")]
fn formspec_rust(m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add("PY_API_VERSION", PY_API_VERSION)?;
    m.add("CRATE_VERSION", env!("CARGO_PKG_VERSION"))?;
    m.add_function(wrap_pyfunction!(fel::eval_fel, m)?)?;
    m.add_function(wrap_pyfunction!(fel::eval_fel_with_trace, m)?)?;
    m.add_function(wrap_pyfunction!(fel::eval_fel_detailed, m)?)?;
    m.add_function(wrap_pyfunction!(fel::parse_fel, m)?)?;
    m.add_function(wrap_pyfunction!(fel::get_dependencies, m)?)?;
    m.add_function(wrap_pyfunction!(fel::extract_deps, m)?)?;
    m.add_function(wrap_pyfunction!(fel::analyze_expression, m)?)?;
    m.add_function(wrap_pyfunction!(fel::list_builtin_functions, m)?)?;
    m.add_function(wrap_pyfunction!(fel::prepare_expression, m)?)?;
    m.add_function(wrap_pyfunction!(fel::rewrite_fel_for_assembly_py, m)?)?;
    m.add_function(wrap_pyfunction!(document::detect_type, m)?)?;
    m.add_function(wrap_pyfunction!(document::lint_document, m)?)?;
    m.add_function(wrap_pyfunction!(document::evaluate_def, m)?)?;
    m.add_function(wrap_pyfunction!(document::coerce_field_value, m)?)?;
    m.add_function(wrap_pyfunction!(
        document::resolve_option_sets_on_definition,
        m
    )?)?;
    m.add_function(wrap_pyfunction!(
        document::apply_migrations_to_response_data,
        m
    )?)?;
    m.add_function(wrap_pyfunction!(
        document::evaluate_screener_document_py,
        m
    )?)?;
    m.add_function(wrap_pyfunction!(registry::parse_registry, m)?)?;
    m.add_function(wrap_pyfunction!(registry::find_registry_entry, m)?)?;
    m.add_function(wrap_pyfunction!(registry::validate_lifecycle, m)?)?;
    m.add_function(wrap_pyfunction!(registry::well_known_url, m)?)?;
    m.add_function(wrap_pyfunction!(changelog::generate_changelog, m)?)?;
    m.add_function(wrap_pyfunction!(mapping::execute_mapping_doc, m)?)?;
    Ok(())
}
