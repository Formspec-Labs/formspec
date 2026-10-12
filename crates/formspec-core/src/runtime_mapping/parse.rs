//! Deserialize mapping documents and rules from `serde_json::Value`.
//!
//! Used by WASM and PyO3 bindings; keeps JSON shape handling out of FFI crates.
//!
//! Private `coerce_type_from_str` / `parse_*` helpers deserialize nested rule shapes.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::Value;

use super::types::{
    ArrayDescriptor, ArrayMode, CoerceType, MappingDirection, MappingDocument, MappingRule,
    MappingSourceSchema, ReverseOverride, TransformType, UnmappedStrategy,
};

/// Parse a coerce type from a mapping rule JSON `coerce` field.
///
/// Accepts string shorthand (`"number"`) or object form (`{"from": "string", "to": "number"}`).
/// The object `"from"` field is ignored for runtime dispatch.
pub fn parse_coerce_type(val: &Value) -> Option<CoerceType> {
    match val {
        Value::String(s) => coerce_type_from_str(s),
        Value::Object(obj) => obj
            .get("to")
            .and_then(|v| v.as_str())
            .and_then(coerce_type_from_str),
        _ => None,
    }
}

fn coerce_type_from_str(s: &str) -> Option<CoerceType> {
    match s {
        "string" => Some(CoerceType::String),
        "number" => Some(CoerceType::Number),
        "integer" => Some(CoerceType::Integer),
        "boolean" => Some(CoerceType::Boolean),
        "date" => Some(CoerceType::Date),
        "datetime" => Some(CoerceType::DateTime),
        "array" => Some(CoerceType::Array),
        _ => None,
    }
}

/// Parse optional top-level `"direction"` restriction on a mapping document.
pub fn parse_mapping_direction_field(val: &Value) -> Option<MappingDirection> {
    val.as_object()?
        .get("direction")
        .and_then(|v| v.as_str())
        .and_then(|s| match s {
            "forward" => Some(MappingDirection::Forward),
            "reverse" => Some(MappingDirection::Reverse),
            _ => None,
        })
}

/// Parse a full mapping document (rules, defaults, autoMap, optional direction lock).
pub fn parse_mapping_document_from_value(val: &Value) -> Result<MappingDocument, String> {
    let obj = val
        .as_object()
        .ok_or_else(|| "mapping document must be an object".to_string())?;

    let rules_val = obj
        .get("rules")
        .ok_or_else(|| "mapping document missing 'rules'".to_string())?;
    let rules = parse_mapping_rules_from_value(rules_val)?;

    let defaults = obj.get("defaults").and_then(|v| v.as_object()).cloned();

    let auto_map = obj
        .get("autoMap")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let direction_restriction = parse_mapping_direction_field(val);

    let source_schema = obj
        .get("sourceSchema")
        .map(|value| {
            if obj.contains_key("definitionRef") || obj.contains_key("definitionVersion") {
                return Err(
                    "sourceSchema and Definition association are mutually exclusive".to_string(),
                );
            }
            let association = value
                .as_object()
                .ok_or_else(|| "sourceSchema must be an object".to_string())?;
            if association
                .keys()
                .any(|key| !matches!(key.as_str(), "url" | "version" | "schema"))
            {
                return Err("sourceSchema contains an unsupported property".to_string());
            }
            let string = |key: &str| {
                association
                    .get(key)
                    .and_then(Value::as_str)
                    .filter(|value| !value.trim().is_empty())
                    .map(str::to_owned)
                    .ok_or_else(|| format!("sourceSchema.{key} must be a nonempty string"))
            };
            let schema = association
                .get("schema")
                .filter(|value| value.is_object())
                .ok_or_else(|| "sourceSchema.schema must be an object".to_string())?
                .clone();
            Ok(MappingSourceSchema {
                url: string("url")?,
                version: string("version")?,
                schema,
            })
        })
        .transpose()?;

    Ok(MappingDocument {
        source_schema,
        rules,
        defaults,
        auto_map,
        direction_restriction,
    })
}

/// True when the rule carries a non-empty `array.innerRules` array (outer `transform` is unused).
fn has_nonempty_array_inner_rules(obj: &serde_json::Map<String, Value>) -> bool {
    obj.get("array")
        .and_then(|v| v.as_object())
        .and_then(|a| a.get("innerRules"))
        .and_then(|v| v.as_array())
        .is_some_and(|a| !a.is_empty())
}

fn parse_array_descriptor(
    obj: &serde_json::Map<String, Value>,
    rule_idx: usize,
) -> Result<Option<ArrayDescriptor>, String> {
    let arr_val = match obj.get("array") {
        Some(v) => v,
        None => return Ok(None),
    };
    let arr_obj = arr_val
        .as_object()
        .ok_or_else(|| format!("rule[{rule_idx}]: 'array' must be an object"))?;

    let mode = match arr_obj.get("mode").and_then(|v| v.as_str()) {
        Some("each") => ArrayMode::Each,
        Some("indexed") => ArrayMode::Indexed,
        Some("whole") | None => ArrayMode::Whole,
        Some(other) => {
            return Err(format!("rule[{rule_idx}]: unknown array mode: {other}"));
        }
    };

    let inner_rules = if let Some(inner_val) = arr_obj.get("innerRules") {
        parse_inner_rules(inner_val, rule_idx, mode)?
    } else {
        vec![]
    };

    Ok(Some(ArrayDescriptor { mode, inner_rules }))
}

fn parse_inner_rules(
    val: &Value,
    _parent_idx: usize,
    mode: ArrayMode,
) -> Result<Vec<MappingRule>, String> {
    let mut rules = parse_mapping_rules_from_value(val)?;
    if mode == ArrayMode::Indexed {
        let empty = vec![];
        let arr = val.as_array().unwrap_or(&empty);
        for (i, rule) in rules.iter_mut().enumerate() {
            if let Some(idx) = arr
                .get(i)
                .and_then(|v| v.as_object())
                .and_then(|obj| obj.get("index"))
                .and_then(|v| v.as_u64())
            {
                rule.source_path = match &rule.source_path {
                    Some(sp) if !sp.is_empty() => Some(format!("{idx}.{sp}")),
                    _ => Some(idx.to_string()),
                };
            }
        }
    }
    Ok(rules)
}

fn parse_reverse_override(
    obj: &serde_json::Map<String, Value>,
    rule_idx: usize,
) -> Result<Option<Box<ReverseOverride>>, String> {
    let rev_val = match obj.get("reverse") {
        Some(v) => v,
        None => return Ok(None),
    };
    let rev_obj = rev_val
        .as_object()
        .ok_or_else(|| format!("rule[{rule_idx}]: 'reverse' must be an object"))?;

    let transform_str = rev_obj
        .get("transform")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("rule[{rule_idx}]: reverse override requires 'transform'"))?;

    let transform = match transform_str {
        "expression" => {
            let expr = rev_obj
                .get("expression")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    format!(
                        "rule[{rule_idx}]: reverse 'expression' transform requires 'expression'"
                    )
                })?;
            TransformType::Expression(expr.to_string())
        }
        "preserve" => TransformType::Preserve,
        "constant" => {
            let expr = rev_obj
                .get("expression")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    format!("rule[{rule_idx}]: reverse 'constant' transform requires 'expression'")
                })?;
            TransformType::Expression(expr.to_string())
        }
        "valueMap" => {
            let vm = rev_obj.get("valueMap").and_then(|v| v.as_object());
            let (forward, unmapped_strategy) = if let Some(m) = vm {
                let fwd_val = m.get("forward").ok_or_else(|| {
                    format!("rule[{rule_idx}]: reverse valueMap requires 'valueMap.forward'")
                })?;
                let fwd: Vec<(Value, Value)> = fwd_val
                    .as_object()
                    .map(|fwd_map| {
                        fwd_map
                            .iter()
                            .map(|(k, v)| (Value::String(k.clone()), v.clone()))
                            .collect()
                    })
                    .unwrap_or_default();
                let strategy = match m.get("unmapped").and_then(|v| v.as_str()) {
                    Some("error") => UnmappedStrategy::Error,
                    Some("drop") => UnmappedStrategy::Drop,
                    Some("default") => UnmappedStrategy::Default,
                    Some("passthrough") => UnmappedStrategy::PassThrough,
                    None => UnmappedStrategy::Error,
                    _ => UnmappedStrategy::PassThrough,
                };
                (fwd, strategy)
            } else {
                return Err(format!(
                    "rule[{rule_idx}]: reverse transform 'valueMap' requires 'valueMap'"
                ));
            };
            TransformType::ValueMap {
                forward,
                unmapped: unmapped_strategy,
            }
        }
        "coerce" => {
            let coerce_val = rev_obj.get("coerce").ok_or_else(|| {
                format!("rule[{rule_idx}]: reverse 'coerce' requires 'coerce' property")
            })?;
            let coerce_type = parse_coerce_type(coerce_val)
                .ok_or_else(|| format!("rule[{rule_idx}]: invalid reverse coerce value"))?;
            TransformType::Coerce(coerce_type)
        }
        "concat" => {
            let expr = rev_obj
                .get("expression")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    format!("rule[{rule_idx}]: reverse 'concat' requires 'expression'")
                })?;
            TransformType::Concat(expr.to_string())
        }
        "split" => {
            let expr = rev_obj
                .get("expression")
                .and_then(|v| v.as_str())
                .ok_or_else(|| {
                    format!("rule[{rule_idx}]: reverse 'split' requires 'expression'")
                })?;
            TransformType::Split(expr.to_string())
        }
        "flatten" => TransformType::Flatten {
            separator: rev_obj
                .get("separator")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
        },
        "nest" => TransformType::Nest {
            separator: rev_obj
                .get("separator")
                .and_then(|v| v.as_str())
                .unwrap_or(".")
                .to_string(),
        },
        "drop" => TransformType::Drop,
        other => {
            return Err(format!(
                "rule[{rule_idx}]: unsupported reverse transform: {other}"
            ));
        }
    };

    Ok(Some(Box::new(ReverseOverride { transform })))
}

/// Parse a JSON array of mapping rules into runtime structures.
pub fn parse_mapping_rules_from_value(val: &Value) -> Result<Vec<MappingRule>, String> {
    let arr = val
        .as_array()
        .ok_or_else(|| "rules must be an array".to_string())?;

    let mut rules = Vec::new();
    for (i, rule_val) in arr.iter().enumerate() {
        let obj = rule_val
            .as_object()
            .ok_or_else(|| format!("rule[{i}]: must be an object"))?;

        let transform_str = match obj.get("transform").and_then(|v| v.as_str()) {
            Some(s) => s,
            None if has_nonempty_array_inner_rules(obj) => "preserve",
            None => {
                return Err(format!("rule[{i}]: missing required field 'transform'"));
            }
        };

        let mut vm_default: Option<Value> = None;

        let transform = match transform_str {
            "preserve" => TransformType::Preserve,
            "drop" => TransformType::Drop,
            "constant" => {
                let expr = obj
                    .get("expression")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        format!("rule[{i}]: transform 'constant' requires 'expression'")
                    })?;
                TransformType::Expression(expr.to_string())
            }
            "coerce" => {
                let coerce_val = obj.get("coerce").ok_or_else(|| {
                    format!("rule[{i}]: transform 'coerce' requires 'coerce' property")
                })?;
                let coerce_type = parse_coerce_type(coerce_val)
                    .ok_or_else(|| format!("rule[{i}]: invalid coerce value"))?;
                TransformType::Coerce(coerce_type)
            }
            "expression" => {
                let expr = obj
                    .get("expression")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        format!("rule[{i}]: transform 'expression' requires 'expression'")
                    })?;
                TransformType::Expression(expr.to_string())
            }
            "valueMap" => {
                let vm = obj.get("valueMap").and_then(|v| v.as_object());
                let (forward, unmapped_strategy) = if let Some(m) = vm {
                    let fwd_val = m.get("forward").ok_or_else(|| {
                        format!("rule[{i}]: transform 'valueMap' requires 'valueMap.forward'")
                    })?;
                    let fwd: Vec<(Value, Value)> = fwd_val
                        .as_object()
                        .map(|fwd_map| {
                            fwd_map
                                .iter()
                                .map(|(k, v)| (Value::String(k.clone()), v.clone()))
                                .collect()
                        })
                        .unwrap_or_default();
                    let strategy = match m.get("unmapped").and_then(|v| v.as_str()) {
                        Some("error") => UnmappedStrategy::Error,
                        Some("drop") => UnmappedStrategy::Drop,
                        Some("default") => UnmappedStrategy::Default,
                        Some("passthrough") => UnmappedStrategy::PassThrough,
                        None => UnmappedStrategy::Error,
                        _ => UnmappedStrategy::PassThrough,
                    };
                    (fwd, strategy)
                } else {
                    return Err(format!(
                        "rule[{i}]: transform 'valueMap' requires 'valueMap'"
                    ));
                };
                vm_default = vm.and_then(|m| m.get("default")).cloned();
                TransformType::ValueMap {
                    forward,
                    unmapped: unmapped_strategy,
                }
            }
            "flatten" => TransformType::Flatten {
                separator: obj
                    .get("separator")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string(),
            },
            "nest" => TransformType::Nest {
                separator: obj
                    .get("separator")
                    .and_then(|v| v.as_str())
                    .unwrap_or(".")
                    .to_string(),
            },
            "concat" => {
                let expr = obj
                    .get("expression")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| {
                        format!("rule[{i}]: transform 'concat' requires 'expression'")
                    })?;
                TransformType::Concat(expr.to_string())
            }
            "split" => {
                let expr = obj
                    .get("expression")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| format!("rule[{i}]: transform 'split' requires 'expression'"))?;
                TransformType::Split(expr.to_string())
            }
            other => return Err(format!("rule[{i}]: unknown transform type: {other}")),
        };

        let source_path = obj
            .get("sourcePath")
            .and_then(|v| v.as_str())
            .map(String::from);
        let target_path = obj
            .get("targetPath")
            .and_then(|v| v.as_str())
            .map(String::from);
        if source_path.is_none() && target_path.is_none() {
            return Err(format!(
                "rule[{i}]: at least one of 'sourcePath' or 'targetPath' must be present"
            ));
        }

        rules.push(MappingRule {
            source_path,
            target_path: target_path.unwrap_or_default(),
            transform,
            condition: obj
                .get("condition")
                .and_then(|v| v.as_str())
                .map(String::from),
            priority: obj
                .get("priority")
                .and_then(|v| v.as_i64())
                .and_then(|n| i32::try_from(n).ok())
                .unwrap_or(0),
            reverse_priority: obj
                .get("reversePriority")
                .and_then(|v| v.as_i64())
                .map(|n| n as i32),
            default: obj.get("default").cloned().or(vm_default),
            bidirectional: obj
                .get("bidirectional")
                .and_then(|v| v.as_bool())
                .unwrap_or(true),
            array: parse_array_descriptor(obj, i)?,
            reverse: parse_reverse_override(obj, i)?,
        });
    }
    Ok(rules)
}
