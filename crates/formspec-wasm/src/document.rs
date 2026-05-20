//! Document type detection, schema validation planning, and linting.

#[cfg(feature = "lint")]
use formspec_core::JsonWireStyle;
use formspec_core::{
    DocumentType, detect_document_type, json_pointer_to_jsonpath, schema_validation_plan,
};
#[cfg(feature = "lint")]
use formspec_lint::{LintMode, LintOptions, lint_result_to_json_value, lint_with_options};
use serde::Deserialize;
use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::json_host::{parse_value_str, to_json_string};

// ── Schema Validation ───────────────────────────────────────────

/// Detect the document type of a Formspec JSON document.
/// Returns the document type string or null.
#[wasm_bindgen(js_name = "detectDocumentType")]
pub fn detect_doc_type(doc_json: &str) -> Result<JsValue, JsError> {
    let doc: Value = parse_value_str(doc_json, "JSON").map_err(|e| JsError::new(&e))?;
    match detect_document_type(&doc) {
        Some(dt) => Ok(JsValue::from_str(dt.schema_key())),
        None => Ok(JsValue::NULL),
    }
}

/// Convert a JSON Pointer string into a JSONPath string.
#[wasm_bindgen(js_name = "jsonPointerToJsonPath")]
pub fn json_pointer_to_jsonpath_wasm(pointer: &str) -> String {
    json_pointer_to_jsonpath(pointer)
}

/// Plan schema validation execution for a document.
#[wasm_bindgen(js_name = "planSchemaValidation")]
pub fn plan_schema_validation_wasm(
    doc_json: &str,
    document_type_override: Option<String>,
) -> Result<String, JsError> {
    let doc: Value = parse_value_str(doc_json, "JSON").map_err(|e| JsError::new(&e))?;
    let override_type = document_type_override
        .as_deref()
        .and_then(DocumentType::from_schema_key);
    let plan = schema_validation_plan(&doc, override_type);
    let v = serde_json::to_value(&plan).map_err(|e| JsError::new(&e.to_string()))?;
    to_json_string(&v).map_err(|e| JsError::new(&e))
}

// ── Linting (`feature = "lint"` — tools WASM only) ──────────────

#[cfg(feature = "lint")]
#[derive(Debug, Default, Deserialize)]
struct LintDocumentWasmOptions {
    #[serde(default, alias = "registryDocuments")]
    registry_documents: Vec<Value>,
    mode: Option<String>,
    #[serde(default, alias = "definitionDocument")]
    definition_document: Option<Value>,
    #[serde(default, alias = "themeDocument")]
    theme_document: Option<Value>,
    #[serde(default, alias = "componentDocuments")]
    component_documents: Vec<Value>,
    #[serde(default, alias = "localeDocuments")]
    locale_documents: Vec<Value>,
    #[serde(default, alias = "schemaOnly")]
    schema_only: bool,
    #[serde(default, alias = "noFel")]
    no_fel: bool,
}

#[cfg(feature = "lint")]
fn lint_options_from_wasm_json(options_json: Option<&str>) -> Result<LintOptions, String> {
    let Some(raw) = options_json else {
        return Ok(LintOptions::default());
    };
    if raw.trim().is_empty() {
        return Ok(LintOptions::default());
    }
    let parsed: LintDocumentWasmOptions =
        serde_json::from_str(raw).map_err(|e| format!("lint options JSON: {e}"))?;
    Ok(LintOptions {
        mode: LintMode::from_host_option_str(parsed.mode.as_deref()),
        registry_documents: parsed.registry_documents,
        definition_document: parsed.definition_document,
        theme_document: parsed.theme_document,
        component_documents: parsed.component_documents,
        locale_documents: parsed.locale_documents,
        schema_only: parsed.schema_only,
        no_fel: parsed.no_fel,
    })
}

/// Lint a Formspec document (7-pass static analysis).
/// Returns JSON: { documentType, valid, diagnostics: [...] }
#[cfg(feature = "lint")]
#[wasm_bindgen(js_name = "lintDocument")]
pub fn lint_document(doc_json: &str, options_json: Option<String>) -> Result<String, JsError> {
    let doc: Value = parse_value_str(doc_json, "JSON").map_err(|e| JsError::new(&e))?;
    let options =
        lint_options_from_wasm_json(options_json.as_deref()).map_err(|e| JsError::new(&e))?;
    let result = lint_with_options(&doc, &options);
    let json = lint_result_to_json_value(&result, JsonWireStyle::JsCamel);
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

/// Lint with registry documents for extension resolution.
#[cfg(feature = "lint")]
#[deprecated(note = "use lintDocument(docJson, optionsJson) with registryDocuments")]
#[wasm_bindgen(js_name = "lintDocumentWithRegistries")]
pub fn lint_document_with_registries(
    doc_json: &str,
    registries_json: &str,
) -> Result<String, JsError> {
    lint_document(
        doc_json,
        Some(format!(r#"{{"registryDocuments":{registries_json}}}"#)),
    )
}

#[cfg(all(test, feature = "lint"))]
mod tests {
    use serde_json::json;

    use super::lint_options_from_wasm_json;
    use formspec_lint::LintMode;

    #[test]
    fn lint_options_accept_camel_case_host_keys() {
        let options = lint_options_from_wasm_json(Some(
            r#"{
                "mode": "strict",
                "registryDocuments": [{"$formspecRegistry": "1.0"}],
                "definitionDocument": {"$formspec": "1.0"},
                "themeDocument": {"$formspecTheme": "1.0"},
                "componentDocuments": [{"$formspecComponent": "1.0"}],
                "localeDocuments": [{"$formspecLocale": "1.0"}],
                "schemaOnly": true,
                "noFel": true
            }"#,
        ))
        .expect("camelCase lint options should deserialize");

        assert_eq!(options.mode, LintMode::Strict);
        assert_eq!(options.registry_documents.len(), 1);
        assert_eq!(
            options.definition_document,
            Some(json!({"$formspec": "1.0"}))
        );
        assert_eq!(
            options.theme_document,
            Some(json!({"$formspecTheme": "1.0"}))
        );
        assert_eq!(options.component_documents.len(), 1);
        assert_eq!(options.locale_documents.len(), 1);
        assert!(options.schema_only);
        assert!(options.no_fel);
    }

    #[test]
    fn lint_options_accept_snake_case_host_keys() {
        let options = lint_options_from_wasm_json(Some(
            r#"{
                "registry_documents": [{"$formspecRegistry": "1.0"}],
                "definition_document": {"$formspec": "1.0"},
                "theme_document": {"$formspecTheme": "1.0"},
                "component_documents": [{"$formspecComponent": "1.0"}],
                "locale_documents": [{"$formspecLocale": "1.0"}],
                "schema_only": true,
                "no_fel": true
            }"#,
        ))
        .expect("snake_case lint options should deserialize");

        assert_eq!(options.registry_documents.len(), 1);
        assert_eq!(
            options.definition_document,
            Some(json!({"$formspec": "1.0"}))
        );
        assert_eq!(
            options.theme_document,
            Some(json!({"$formspecTheme": "1.0"}))
        );
        assert_eq!(options.component_documents.len(), 1);
        assert_eq!(options.locale_documents.len(), 1);
        assert!(options.schema_only);
        assert!(options.no_fel);
    }
}
