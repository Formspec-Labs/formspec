//! `FelContext`: a WASM-resident FEL context the engine loads once per evaluation and reads many times.
//!
//! `evalFELWithContext` takes the whole form context as JSON on every call, so an ad-hoc read
//! (`compileExpression`, a component `when`, one `{{}}` segment) costs O(form size). This handle
//! holds [`HostFelContext`] across calls: the host loads a form-scope snapshot when its evaluation,
//! structure, or instance version changes, and each read passes only the expression and the Item path.
//!
//! Every method mirrors a free function in [`crate::fel`] — same envelopes, same rules — so a host
//! can use either path. Behavior lives in `formspec-eval`; this module is JSON in, JSON out.

use fel_core::{ExtensionFunctions, fel_diagnostics_to_json_value, fel_to_ui_json};
use formspec_eval::HostFelContext;
use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::extensions::FelExtensionHost;
use crate::fel::{fel_eval_envelope_json, interpolated_json};
use crate::json_host::{parse_value_str, to_json_string};

/// One form's FEL state, resident across calls.
///
/// `new` takes the Definition's leaf typing; `load` replaces the per-evaluation snapshot;
/// `evaluate`, `evaluateTrace`, `interpolate`, and `prepare` read it by Item path.
#[wasm_bindgen(js_name = "FelContext")]
pub struct FelContextHandle {
    /// The resident context every read resolves against.
    inner: HostFelContext,
}

/// Parses a JSON object argument, naming it in the error.
fn object_arg<'a>(
    json: &'a Value,
    label: &str,
) -> Result<&'a serde_json::Map<String, Value>, String> {
    json.as_object()
        .ok_or_else(|| format!("{label} must be a JSON object"))
}

#[wasm_bindgen(js_class = "FelContext")]
impl FelContextHandle {
    /// Context for a Definition: `{ dataTypes: { path: dataType }, excludedValueNull: [path] }`.
    #[wasm_bindgen(constructor)]
    pub fn new(schema_json: &str) -> Result<FelContextHandle, JsError> {
        Self::new_inner(schema_json).map_err(|e| JsError::new(&e))
    }

    /// Replaces the form-scope snapshot: `{ values, mips, repeatCounts, variables, instances, locale, meta }`.
    #[wasm_bindgen(js_name = "load")]
    pub fn load(&mut self, snapshot_json: &str) -> Result<(), JsError> {
        self.load_inner(snapshot_json).map_err(|e| JsError::new(&e))
    }

    /// Normalizes `expression` for `item_path` (bare `$`, `$group.field`, repeat aliases).
    #[wasm_bindgen(js_name = "prepare")]
    pub fn prepare(&self, expression: &str, item_path: &str, replace_self_ref: bool) -> String {
        self.inner.prepare(expression, item_path, replace_self_ref)
    }

    /// Evaluates `expression` in the binding scope of `item_path`; JSON `{ value, hasErrorDiagnostics }`.
    #[wasm_bindgen(js_name = "evaluate")]
    pub fn evaluate(
        &self,
        expression: &str,
        item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<String>,
        extensions: Option<FelExtensionHost>,
    ) -> Result<String, JsError> {
        self.evaluate_inner(
            expression,
            item_path,
            replace_self_ref,
            now_iso.as_deref(),
            extensions.as_ref().map(|e| e as &dyn ExtensionFunctions),
        )
        .map_err(|e| JsError::new(&e))
    }

    /// [`FelContextHandle::evaluate`] plus `diagnostics` and an ordered `trace`.
    #[wasm_bindgen(js_name = "evaluateTrace")]
    pub fn evaluate_trace(
        &self,
        expression: &str,
        item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<String>,
        extensions: Option<FelExtensionHost>,
    ) -> Result<String, JsError> {
        self.evaluate_trace_inner(
            expression,
            item_path,
            replace_self_ref,
            now_iso.as_deref(),
            extensions.as_ref().map(|e| e as &dyn ExtensionFunctions),
        )
        .map_err(|e| JsError::new(&e))
    }

    /// Resolves every `{{expression}}` in `template` in the scope of `item_path` (Locale §3.3.1).
    #[wasm_bindgen(js_name = "interpolate")]
    pub fn interpolate(
        &self,
        template: &str,
        item_path: &str,
        now_iso: Option<String>,
        extensions: Option<FelExtensionHost>,
    ) -> Result<String, JsError> {
        self.interpolate_inner(
            template,
            item_path,
            now_iso.as_deref(),
            extensions.as_ref().map(|e| e as &dyn ExtensionFunctions),
        )
        .map_err(|e| JsError::new(&e))
    }
}

impl FelContextHandle {
    pub(crate) fn new_inner(schema_json: &str) -> Result<FelContextHandle, String> {
        let schema: Value = parse_value_str(schema_json, "FelContext schema JSON")?;
        Ok(FelContextHandle {
            inner: HostFelContext::from_schema_json(object_arg(&schema, "FelContext schema")?),
        })
    }

    pub(crate) fn load_inner(&mut self, snapshot_json: &str) -> Result<(), String> {
        let snapshot: Value = parse_value_str(snapshot_json, "FelContext snapshot JSON")?;
        self.inner
            .load(object_arg(&snapshot, "FelContext snapshot")?)
    }

    pub(crate) fn evaluate_inner(
        &self,
        expression: &str,
        item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Result<String, String> {
        let result =
            self.inner
                .evaluate(expression, item_path, replace_self_ref, now_iso, extensions)?;
        fel_core::reject_undefined_functions(&result.diagnostics)?;
        fel_eval_envelope_json(&result.value, &result.diagnostics)
    }

    pub(crate) fn evaluate_trace_inner(
        &self,
        expression: &str,
        item_path: &str,
        replace_self_ref: bool,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Result<String, String> {
        let (result, trace) = self.inner.evaluate_traced(
            expression,
            item_path,
            replace_self_ref,
            now_iso,
            extensions,
        )?;
        fel_core::reject_undefined_functions(&result.diagnostics)?;
        to_json_string(&serde_json::json!({
            "value": fel_to_ui_json(&result.value),
            "hasErrorDiagnostics": fel_core::has_error_diagnostics(&result.diagnostics),
            "diagnostics": fel_diagnostics_to_json_value(&result.diagnostics),
            "trace": trace.steps,
        }))
    }

    pub(crate) fn interpolate_inner(
        &self,
        template: &str,
        item_path: &str,
        now_iso: Option<&str>,
        extensions: Option<&dyn ExtensionFunctions>,
    ) -> Result<String, String> {
        interpolated_json(
            &self
                .inner
                .interpolate(template, item_path, now_iso, extensions),
        )
    }
}
