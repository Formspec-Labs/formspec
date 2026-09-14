//! Python-callable FEL extension functions (Core §3.12) for `evaluate_def`.
//!
//! A host passes `{name: callable}`. Names are checked against the FEL built-in and
//! reserved-word rule at the call; arguments and results convert through the same
//! FEL ↔ Python mapping as `eval_fel`. The evaluator keeps null propagation and
//! turns a raised exception into an error diagnostic (`fel_core::call_extension`).
//! Arity is unbounded: a callable that rejects its argument count raises, which the
//! evaluator records the same way.

use pyo3::prelude::*;
use pyo3::types::{PyDict, PyTuple};

use fel_core::{ExtensionFunctions, Value, check_extension_name};

use crate::convert::{fel_to_python, python_to_fel};

/// Extension functions backed by Python callables, valid while the GIL is held.
pub(crate) struct PyExtensionFunctions<'py> {
    /// Callables by FEL name.
    functions: Vec<(String, Bound<'py, PyAny>)>,
}

impl<'py> PyExtensionFunctions<'py> {
    /// Reads `{name: callable}`.
    ///
    /// # Errors
    ///
    /// `ValueError` for a built-in or reserved name; `TypeError` for a non-string
    /// name or a non-callable value.
    pub(crate) fn from_dict(dict: &Bound<'py, PyDict>) -> PyResult<Self> {
        let mut functions = Vec::with_capacity(dict.len());
        for (key, value) in dict.iter() {
            let name: String = key.extract()?;
            check_extension_name(&name)
                .map_err(|e| pyo3::exceptions::PyValueError::new_err(e.to_string()))?;
            if !value.is_callable() {
                return Err(pyo3::exceptions::PyTypeError::new_err(format!(
                    "extension function '{name}' is not callable"
                )));
            }
            functions.push((name, value));
        }
        Ok(Self { functions })
    }

    /// Callable registered under `name`.
    fn get(&self, name: &str) -> Option<&Bound<'py, PyAny>> {
        self.functions
            .iter()
            .find_map(|(registered, callable)| (registered == name).then_some(callable))
    }
}

impl ExtensionFunctions for PyExtensionFunctions<'_> {
    fn arity(&self, name: &str) -> Option<(usize, Option<usize>)> {
        self.get(name).map(|_| (0, None))
    }

    fn invoke(&self, name: &str, args: &[Value]) -> Result<Value, String> {
        let callable = self
            .get(name)
            .ok_or_else(|| format!("extension '{name}' is not registered"))?;
        let py = callable.py();
        let py_args = args
            .iter()
            .map(|arg| fel_to_python(py, arg))
            .collect::<PyResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;
        let result = PyTuple::new(py, py_args)
            .and_then(|tuple| callable.call1(tuple))
            .map_err(|e| e.to_string())?;
        python_to_fel(py, &result).map_err(|e| e.to_string())
    }
}
