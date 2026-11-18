//! Python-callable FEL extension functions (Core §3.12) for `evaluate_def`.
//!
//! A host passes `{name: callable}`. Names are checked against the FEL built-in and
//! reserved-word rule at the call; arguments and results convert through the same
//! FEL ↔ Python mapping as `eval_fel`. The evaluator keeps null propagation and
//! turns a raised exception into an error diagnostic (`fel_core::call_extension`).
//! The positional signature determines arity without calling the implementation.
//! Opaque callables can be wrapped in a Python function with an explicit signature.

use pyo3::exceptions::{PyTypeError, PyValueError};
use pyo3::prelude::*;
use pyo3::types::{PyDict, PyTuple};

use fel_core::{ExtensionFunctions, Value, check_extension_name};

use crate::convert::{fel_to_python, python_to_fel};

/// Extension functions backed by Python callables, valid while the GIL is held.
pub(crate) struct PyExtensionFunctions<'py> {
    /// Callables by FEL name.
    functions: Vec<PyExtension<'py>>,
}

struct PyExtension<'py> {
    name: String,
    callable: Bound<'py, PyAny>,
    arity: (usize, Option<usize>),
}

fn positional_arity(
    inspect: &Bound<'_, PyAny>,
    callable: &Bound<'_, PyAny>,
) -> PyResult<(usize, Option<usize>)> {
    let signature = match inspect.call_method1("signature", (callable,)) {
        Ok(signature) => signature,
        Err(error)
            if error.is_instance_of::<PyValueError>(callable.py())
                || error.is_instance_of::<PyTypeError>(callable.py()) =>
        {
            return Err(PyTypeError::new_err(
                "FEL extensions must expose a positional signature. Wrap opaque callables in a Python function.",
            ));
        }
        Err(error) => return Err(error),
    };
    let parameter = inspect.getattr("Parameter")?;
    let empty = parameter.getattr("empty")?;
    let positional_only = parameter.getattr("POSITIONAL_ONLY")?;
    let positional_or_keyword = parameter.getattr("POSITIONAL_OR_KEYWORD")?;
    let var_positional = parameter.getattr("VAR_POSITIONAL")?;
    let keyword_only = parameter.getattr("KEYWORD_ONLY")?;
    let mut minimum = 0;
    let mut maximum = Some(0);
    for entry in signature
        .getattr("parameters")?
        .call_method0("values")?
        .try_iter()?
    {
        let entry = entry?;
        let kind = entry.getattr("kind")?;
        let required = entry.getattr("default")?.is(&empty);
        if kind.is(&positional_only) || kind.is(&positional_or_keyword) {
            minimum += usize::from(required);
            maximum = maximum.map(|count| count + 1);
        } else if kind.is(&var_positional) {
            maximum = None;
        } else if kind.is(&keyword_only) && required {
            return Err(PyTypeError::new_err(
                "FEL extensions cannot require keyword-only arguments",
            ));
        }
    }
    Ok((minimum, maximum))
}

impl<'py> PyExtensionFunctions<'py> {
    /// Reads `{name: callable}`.
    ///
    /// # Errors
    ///
    /// `ValueError` for a built-in or reserved name; `TypeError` for a non-string
    /// name or an incompatible callable signature.
    pub(crate) fn from_dict(dict: &Bound<'py, PyDict>) -> PyResult<Self> {
        let inspect = dict.py().import("inspect")?.into_any();
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
            let arity = positional_arity(&inspect, &value)?;
            functions.push(PyExtension {
                name,
                callable: value,
                arity,
            });
        }
        Ok(Self { functions })
    }

    /// Callable registered under `name`.
    fn get(&self, name: &str) -> Option<&PyExtension<'py>> {
        self.functions
            .iter()
            .find(|extension| extension.name == name)
    }
}

impl ExtensionFunctions for PyExtensionFunctions<'_> {
    fn arity(&self, name: &str) -> Option<(usize, Option<usize>)> {
        self.get(name).map(|extension| extension.arity)
    }

    fn invoke(&self, name: &str, args: &[Value]) -> Result<Value, String> {
        let callable = &self
            .get(name)
            .ok_or_else(|| format!("extension '{name}' is not registered"))?
            .callable;
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
