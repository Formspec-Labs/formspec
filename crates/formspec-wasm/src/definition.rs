//! Definition helpers for WASM, including authoring checks in the tools build.

#[cfg(feature = "document-api")]
use formspec_core::check_instance_projection;
#[cfg(feature = "definition-assembly")]
use formspec_core::{
    JsonWireStyle, MapResolver, assemble_definition, assembly_result_to_json_value,
};
use formspec_core::{apply_migrations_to_response_data, resolve_option_sets_on_definition};
#[cfg(any(feature = "definition-assembly", feature = "document-api"))]
use serde_json::Value;
use wasm_bindgen::prelude::*;

#[cfg(any(feature = "definition-assembly", feature = "document-api"))]
use crate::json_host::parse_value_str;
use crate::json_host::{parse_json_as, to_json_string};

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

/// Collect instance reads from every authored expression and creation declaration.
///
/// # Errors
///
/// Returns the authored location of an invalid expression or an input JSON error.
#[cfg(feature = "document-api")]
#[wasm_bindgen(js_name = "getDefinitionInstanceReads")]
pub fn definition_instance_reads_wasm(definition_json: &str) -> Result<String, JsError> {
    let definition =
        parse_value_str(definition_json, "definition JSON").map_err(|e| JsError::new(&e))?;
    let reads = formspec_core::definition_instance_reads::definition_instance_reads(&definition)
        .map_err(|e| JsError::new(&e))?;
    to_json_string(&reads).map_err(|e| JsError::new(&e))
}

/// Return projection diagnostics for every eligible published upstream Definition version.
///
/// Pass the instance or prefill consumer as JSON, or `null` for widget route
/// parameters. Pass all published Definitions for the upstream URL as a JSON array.
///
/// # Errors
///
/// Returns a JavaScript error on invalid input JSON.
#[cfg(feature = "document-api")]
#[wasm_bindgen(js_name = "checkResponseProjection")]
pub fn check_instance_projection_wasm(
    instance_json: &str,
    consumer_json: &str,
    upstream_definitions_json: &str,
) -> Result<String, JsError> {
    let instance = parse_value_str(instance_json, "instance JSON").map_err(|e| JsError::new(&e))?;
    let consumer: Option<formspec_core::ProjectionConsumer> =
        parse_json_as(consumer_json, "projection consumer JSON").map_err(|e| JsError::new(&e))?;
    let upstream_definitions: Vec<Value> =
        parse_json_as(upstream_definitions_json, "upstream Definitions JSON")
            .map_err(|e| JsError::new(&e))?;
    let diagnostics =
        check_instance_projection(&instance, consumer.as_ref(), &upstream_definitions);
    to_json_string(&diagnostics).map_err(|e| JsError::new(&e))
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
