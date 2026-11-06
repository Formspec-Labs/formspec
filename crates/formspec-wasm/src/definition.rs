//! Definition helpers for `wasm_bindgen` — option sets + migrations always; `$ref` assembly behind `definition-assembly`.

#[cfg(feature = "definition-assembly")]
use formspec_core::{
    JsonWireStyle, MapResolver, assemble_definition, assembly_result_to_json_value,
};
use formspec_core::{apply_migrations_to_response_data, resolve_option_sets_on_definition};
use serde_json::Value;
use wasm_bindgen::prelude::*;

use crate::json_host::{parse_json_as, parse_value_str, to_json_string};

#[cfg(feature = "definition-assembly")]
#[wasm_bindgen(js_name = "assembleDefinition")]
pub fn assemble_definition_wasm(
    definition_json: &str,
    fragments_json: &str,
) -> Result<String, JsError> {
    let definition: Value =
        parse_value_str(definition_json, "definition JSON").map_err(|e| JsError::new(&e))?;
    let fragments: Value =
        parse_value_str(fragments_json, "fragments JSON").map_err(|e| JsError::new(&e))?;

    let mut resolver = MapResolver::new();
    resolver.merge_from_json_object(&fragments);

    let result = assemble_definition(&definition, &resolver);
    let json = assembly_result_to_json_value(&result, JsonWireStyle::JsCamel);
    to_json_string(&json).map_err(|e| JsError::new(&e))
}

/// Copy `optionSets` entries onto fields that reference `optionSet` (mutates a JSON clone).
#[wasm_bindgen(js_name = "resolveOptionSetsOnDefinition")]
pub fn resolve_option_sets_on_definition_wasm(definition_json: &str) -> Result<String, JsError> {
    let mut definition: fel_core::exact_json::Value =
        parse_json_as(definition_json, "definition JSON").map_err(|e| JsError::new(&e))?;
    resolve_option_sets_on_definition(&mut definition);
    to_json_string(&definition).map_err(|e| JsError::new(&e))
}

/// Apply `definition.migrations` to flat response `data` (FEL `transform` steps run in Rust).
#[wasm_bindgen(js_name = "applyMigrationsToResponseData")]
pub fn apply_migrations_to_response_data_wasm(
    definition_json: &str,
    response_data_json: &str,
    from_version: &str,
    now_iso: &str,
) -> Result<String, JsError> {
    let definition: fel_core::exact_json::Value =
        parse_json_as(definition_json, "definition JSON").map_err(|e| JsError::new(&e))?;
    let response_data: fel_core::exact_json::Value =
        parse_json_as(response_data_json, "response data JSON").map_err(|e| JsError::new(&e))?;
    let out = apply_migrations_to_response_data(&definition, response_data, from_version, now_iso);
    to_json_string(&out).map_err(|e| JsError::new(&e))
}
