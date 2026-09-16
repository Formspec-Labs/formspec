//! JSON-LD context derivation for Ontology documents (`wasm_bindgen`, `ontology-api`).

use formspec_core::{derive_json_ld_context, json_ld_derivation_to_json_value};
use wasm_bindgen::prelude::*;

use crate::json_host::{parse_value_str, to_json_string};

/// Derive the JSON-LD `@context` for a Definition from an Ontology document's bindings.
///
/// Returns JSON `{ "context": {...}, "diagnostics": [{ kind, path, key, existingId?, newId? }] }`
/// (Ontology spec §6.2). Errors when either argument is not JSON.
#[wasm_bindgen(js_name = "deriveJsonLdContext")]
pub fn derive_json_ld_context_wasm(
    definition_json: &str,
    ontology_json: &str,
) -> Result<String, JsError> {
    derive_json_ld_context_inner(definition_json, ontology_json).map_err(|e| JsError::new(&e))
}

pub(crate) fn derive_json_ld_context_inner(
    definition_json: &str,
    ontology_json: &str,
) -> Result<String, String> {
    let definition = parse_value_str(definition_json, "definition JSON")?;
    let ontology = parse_value_str(ontology_json, "ontology JSON")?;
    let derivation = derive_json_ld_context(&definition, &ontology);
    to_json_string(&json_ld_derivation_to_json_value(&derivation))
}
