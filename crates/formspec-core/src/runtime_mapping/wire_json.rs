//! JSON projections for mapping execution (host bindings).

use serde_json::{Map, Value, json};

use crate::JsonWireStyle;
use crate::wire_keys::mapping_result_host_keys;

use super::types::{MappingDirection, MappingResult};

/// Serialize [`MappingDirection`] to the wire string (`forward` / `reverse`).
pub fn mapping_direction_wire(d: MappingDirection) -> &'static str {
    match d {
        MappingDirection::Forward => "forward",
        MappingDirection::Reverse => "reverse",
    }
}

/// Parse wire direction string into [`MappingDirection`].
pub fn parse_mapping_direction_wire(s: &str) -> Result<MappingDirection, String> {
    match s {
        "forward" => Ok(MappingDirection::Forward),
        "reverse" => Ok(MappingDirection::Reverse),
        _ => Err(format!("invalid direction: {s}")),
    }
}

/// Mapping execute result (`executeMappingRules` / `executeMappingDocument`).
pub fn mapping_result_to_json_value(result: &MappingResult, style: JsonWireStyle) -> Value {
    let (rules_key, rule_idx_k, src_k, tgt_k, code_k) = mapping_result_host_keys(style);

    let diagnostics: Vec<Value> = result
        .diagnostics
        .iter()
        .map(|d| {
            let mut m = Map::new();
            m.insert(rule_idx_k.into(), json!(d.rule_index));
            m.insert(src_k.into(), json!(d.source_path));
            m.insert(tgt_k.into(), json!(d.target_path));
            m.insert(code_k.into(), json!(d.error_code.as_str()));
            m.insert("message".into(), json!(d.message));
            Value::Object(m)
        })
        .collect();

    let mut root = Map::new();
    root.insert(
        "direction".into(),
        json!(mapping_direction_wire(result.direction)),
    );
    root.insert("output".into(), result.output.clone());
    root.insert(rules_key.into(), json!(result.rules_applied));
    root.insert("diagnostics".into(), Value::Array(diagnostics));
    Value::Object(root)
}
