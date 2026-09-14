//! JavaScript-backed FEL extension functions (Core §3.12) for the engine bridge.
//!
//! The TypeScript engine keeps its registrations and hands evaluating exports a
//! `FelExtensionHost`: the `fel_core::ExtensionFunctions` port shaped for JS
//! (`arity` lookup plus `invoke`). Arguments and results cross as JSON text. Arity
//! bounds, null propagation, and a throw becoming a diagnostic stay in the evaluator
//! (`fel_core::call_extension`); `checkFELExtensionName` keeps the built-in and
//! reserved-word rule in `fel-core` for registration.

use fel_core::{ExtensionFunctions, Value, check_extension_name, fel_to_json, json_to_fel};
use wasm_bindgen::JsCast;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(typescript_custom_section)]
const FEL_EXTENSION_HOST_TS: &str = r#"
/** Host extension functions (Core §3.12), shaped like fel-core's `ExtensionFunctions`. */
export interface FelExtensionHost {
    /** Arity bounds for a registered name; `undefined` when `name` is not an extension. */
    arity(name: string): { minArgs: number; maxArgs?: number } | undefined;
    /** Calls `name` with a JSON array of non-null arguments; returns the result as JSON. */
    invoke(name: string, argsJson: string): string;
}
"#;

#[wasm_bindgen]
extern "C" {
    /// JS object implementing `FelExtensionHost`.
    #[wasm_bindgen(typescript_type = "FelExtensionHost")]
    pub type FelExtensionHost;

    #[wasm_bindgen(method, catch, js_name = "arity")]
    fn js_arity(this: &FelExtensionHost, name: &str) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(method, catch, js_name = "invoke")]
    fn js_invoke(this: &FelExtensionHost, name: &str, args_json: &str) -> Result<JsValue, JsValue>;
}

/// Throws when `name` may not be registered: a FEL built-in or reserved word (Core §3.12 rule 1).
#[wasm_bindgen(js_name = "checkFELExtensionName")]
pub fn check_fel_extension_name(name: &str) -> Result<(), JsError> {
    check_extension_name(name).map_err(|e| JsError::new(&e.to_string()))
}

impl ExtensionFunctions for FelExtensionHost {
    fn arity(&self, name: &str) -> Option<(usize, Option<usize>)> {
        let bounds = self.js_arity(name).ok().filter(JsValue::is_object)?;
        let count = |key: &str| {
            js_sys::Reflect::get(&bounds, &JsValue::from_str(key))
                .ok()
                .and_then(|value| value.as_f64())
                .filter(|n| n.is_finite() && *n >= 0.0)
                .map(|n| n as usize)
        };
        Some((count("minArgs").unwrap_or(0), count("maxArgs")))
    }

    fn invoke(&self, name: &str, args: &[Value]) -> Result<Value, String> {
        let args_json = serde_json::Value::Array(args.iter().map(fel_to_json).collect());
        let result = self
            .js_invoke(name, &args_json.to_string())
            .map_err(|thrown| thrown_message(&thrown))?;
        let result_json = result
            .as_string()
            .ok_or("extension host must return a JSON string")?;
        serde_json::from_str(&result_json)
            .map(|json| json_to_fel(&json))
            .map_err(|e| format!("extension result is not JSON: {e}"))
    }
}

/// Message of a thrown JavaScript value.
fn thrown_message(thrown: &JsValue) -> String {
    thrown
        .dyn_ref::<js_sys::Error>()
        .map(|error| String::from(error.message()))
        .or_else(|| thrown.as_string())
        .unwrap_or_else(|| "extension function threw a non-Error value".to_string())
}
