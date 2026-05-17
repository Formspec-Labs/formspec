//! `serde_json::Value` projection for lint results (WASM / Python FFI).

use serde_json::{Map, Value, json};

use formspec_core::JsonWireStyle;
use formspec_core::wire_keys::lint_document_type_key;

use crate::LintResult;

/// Wire keys for the authoring-loop metadata fields on diagnostics.
fn diagnostic_metadata_keys(style: JsonWireStyle) -> (&'static str, &'static str) {
    match style {
        JsonWireStyle::JsCamel => ("suggestedFix", "specRef"),
        JsonWireStyle::PythonSnake => ("suggested_fix", "spec_ref"),
    }
}

/// Serialize a [`LintResult`] for host bindings.
pub fn lint_result_to_json_value(result: &LintResult, style: JsonWireStyle) -> Value {
    let doc_type_key = lint_document_type_key(style);
    let (fix_key, ref_key) = diagnostic_metadata_keys(style);
    let diagnostics: Vec<Value> = result
        .diagnostics
        .iter()
        .map(|d| {
            let mut obj = Map::new();
            obj.insert("code".to_string(), json!(d.code.as_wire_str()));
            obj.insert("pass".to_string(), json!(d.pass));
            obj.insert("severity".to_string(), json!(d.severity.as_wire_str()));
            obj.insert("path".to_string(), json!(d.path));
            obj.insert("message".to_string(), json!(d.message));
            if let Some(fix) = &d.suggested_fix {
                obj.insert(fix_key.to_string(), json!(fix));
            }
            if let Some(spec_ref) = &d.spec_ref {
                obj.insert(ref_key.to_string(), json!(spec_ref));
            }
            Value::Object(obj)
        })
        .collect();

    let mut m = Map::new();
    m.insert(
        doc_type_key.to_string(),
        json!(result.document_type.map(|dt| dt.schema_key().to_string())),
    );
    m.insert("valid".to_string(), json!(result.valid));
    m.insert("diagnostics".to_string(), Value::Array(diagnostics));
    Value::Object(m)
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]
    use super::*;
    use crate::types::{LintDiagnostic, LintResult};

    fn result_with_diag(d: LintDiagnostic) -> LintResult {
        LintResult {
            document_type: None,
            diagnostics: vec![d],
            valid: false,
        }
    }

    /// Spec: diagnostics without authoring metadata omit `suggestedFix` / `specRef`
    /// from the wire payload — existing consumers see no shape change.
    #[test]
    fn wire_omits_authoring_fields_when_absent() {
        let result = result_with_diag(LintDiagnostic::error(crate::LintCode::E300, 3, "$", "bad"));
        let json = lint_result_to_json_value(&result, JsonWireStyle::JsCamel);
        let diag = &json["diagnostics"][0];
        assert!(diag.get("suggestedFix").is_none());
        assert!(diag.get("specRef").is_none());
    }

    /// Spec: camelCase wire emits `suggestedFix` / `specRef`.
    #[test]
    fn wire_emits_camel_case_metadata_when_present() {
        let diag = LintDiagnostic::error(crate::LintCode::E300, 3, "$", "bad")
            .with_suggested_fix("rename to 'quantity'")
            .with_spec_ref("specs/core/spec.md#bind-target");
        let json = lint_result_to_json_value(&result_with_diag(diag), JsonWireStyle::JsCamel);
        let wire = &json["diagnostics"][0];
        assert_eq!(wire["suggestedFix"], json!("rename to 'quantity'"));
        assert_eq!(wire["specRef"], json!("specs/core/spec.md#bind-target"));
    }

    /// Spec: snake_case wire emits `suggested_fix` / `spec_ref`.
    #[test]
    fn wire_emits_snake_case_metadata_when_present() {
        let diag = LintDiagnostic::warning(crate::LintCode::W704, 6, "$.tokens", "unresolved")
            .with_suggested_fix("define token 'brand.primary'")
            .with_spec_ref("specs/theme/theme-spec.md#token-cascade");
        let json = lint_result_to_json_value(&result_with_diag(diag), JsonWireStyle::PythonSnake);
        let wire = &json["diagnostics"][0];
        assert_eq!(wire["suggested_fix"], json!("define token 'brand.primary'"));
        assert_eq!(
            wire["spec_ref"],
            json!("specs/theme/theme-spec.md#token-cascade")
        );
    }
}
