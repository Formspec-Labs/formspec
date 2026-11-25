//! WASM bindings for inbound field coercion (`coerceFieldValue`) and whole-Response
//! data canonicalization (`canonicalizeResponseData`).

use fel_core::exact_json::Value;
use formspec_core::{canonicalize_response_data, coerce_field_value};
use wasm_bindgen::prelude::*;

use crate::json_host::{parse_json_as, to_json_string};

/// Coerce a field value using item + bind + definition metadata (JSON in/out).
///
/// `bind_json` may be empty, `"null"`, or a JSON object. Mirrors TS `coerceFieldValue`.
#[wasm_bindgen(js_name = "coerceFieldValue")]
pub fn coerce_field_value_wasm(
    item_json: &str,
    bind_json: &str,
    definition_json: &str,
    value_json: &str,
) -> Result<String, JsError> {
    coerce_field_value_inner(item_json, bind_json, definition_json, value_json)
        .map_err(|e| JsError::new(&e))
}

/// Canonicalize Response `data` against a Definition's declared fields and authored Binds.
#[wasm_bindgen(js_name = "canonicalizeResponseData")]
pub fn canonicalize_response_data_wasm(
    definition_json: &str,
    data_json: &str,
) -> Result<String, JsError> {
    canonicalize_response_data_inner(definition_json, data_json).map_err(|e| JsError::new(&e))
}

pub(crate) fn canonicalize_response_data_inner(
    definition_json: &str,
    data_json: &str,
) -> Result<String, String> {
    let definition: Value = parse_json_as(definition_json, "definition JSON")?;
    let data: Value = parse_json_as(data_json, "data JSON")?;
    let out = canonicalize_response_data(&definition, data);
    to_json_string(&out)
}

pub(crate) fn coerce_field_value_inner(
    item_json: &str,
    bind_json: &str,
    definition_json: &str,
    value_json: &str,
) -> Result<String, String> {
    let item: Value = parse_json_as(item_json, "item JSON")?;
    let definition: Value = parse_json_as(definition_json, "definition JSON")?;
    let value: Value = parse_json_as(value_json, "value JSON")?;
    let bind_owned = {
        let t = bind_json.trim();
        if t.is_empty() || t == "null" {
            None
        } else {
            let b: Value = parse_json_as(bind_json, "bind JSON")?;
            if b.is_null() { None } else { Some(b) }
        }
    };
    let out = coerce_field_value(&item, bind_owned.as_ref(), &definition, value);
    to_json_string(&out)
}
