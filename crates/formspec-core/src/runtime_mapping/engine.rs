//! Execute the ordered mapping rule pipeline.

use fel_core::{evaluate, fel_to_json, parse};
use serde_json::Value;

use super::env::build_mapping_env;
use super::path::{get_by_path, merge_flat_into, set_by_path, split_path};
use super::transforms::{
    apply_coerce, apply_value_map, eval_fel_with_dollar, value_to_flat_string,
};
use super::types::*;

/// Execute a set of mapping rules in a given direction.
pub fn execute_mapping(
    rules: &[MappingRule],
    source: &Value,
    direction: MappingDirection,
) -> MappingResult {
    let mut output = Value::Object(serde_json::Map::new());
    let mut diagnostics = Vec::new();
    let mut rules_applied = 0;

    // Sort rules by priority (descending for forward, ascending for reverse)
    let mut sorted_indices: Vec<usize> = (0..rules.len()).collect();
    sorted_indices.sort_by_key(|&i| {
        let r = &rules[i];
        match direction {
            MappingDirection::Forward => std::cmp::Reverse(r.priority),
            MappingDirection::Reverse => {
                std::cmp::Reverse(r.reverse_priority.unwrap_or(r.priority))
            }
        }
    });

    for &rule_idx in &sorted_indices {
        let rule = &rules[rule_idx];

        // Skip non-bidirectional rules during reverse execution
        if direction == MappingDirection::Reverse && !rule.bidirectional {
            continue;
        }

        // Check condition
        if let Some(ref cond) = rule.condition
            && let Ok(expr) = parse(cond)
        {
            let env = build_mapping_env(source, &output, None);
            let result = evaluate(&expr, &env);
            if !result.value.is_truthy() {
                continue; // condition false — skip rule
            }
        }

        // Direction-aware path resolution
        let (src_path, tgt_path) = match direction {
            MappingDirection::Forward => (rule.source_path.as_deref(), rule.target_path.as_str()),
            MappingDirection::Reverse => (
                Some(rule.target_path.as_str()),
                rule.source_path.as_deref().unwrap_or(""),
            ),
        };

        // Get source value, falling back to per-rule default if null/absent
        let source_value = match src_path {
            Some(p) if !p.is_empty() => {
                let v = get_by_path(source, p).clone();
                if v.is_null() {
                    rule.default.clone().unwrap_or(v)
                } else {
                    v
                }
            }
            _ => rule.default.clone().unwrap_or(Value::Null),
        };

        // Handle array descriptor with innerRules
        if let Some(ref arr_desc) = rule.array
            && !arr_desc.inner_rules.is_empty()
        {
            match arr_desc.mode {
                ArrayMode::Each => {
                    if let Value::Array(elements) = &source_value {
                        let mut result_arr = Vec::new();
                        for elem in elements {
                            let inner_result =
                                execute_mapping(&arr_desc.inner_rules, elem, direction);
                            result_arr.push(inner_result.output);
                        }
                        set_by_path(&mut output, tgt_path, Value::Array(result_arr));
                        rules_applied += 1;
                        continue;
                    }
                }
                ArrayMode::Indexed => {
                    if let Value::Array(elements) = &source_value {
                        let mut indexed_output = Value::Object(serde_json::Map::new());
                        for inner_rule in &arr_desc.inner_rules {
                            if let Some(ref sp) = inner_rule.source_path {
                                // sourcePath encodes "index:sub_path"
                                // First segment is the array index
                                if let Ok(idx) = sp.parse::<usize>() {
                                    // Pure index — copy the whole element
                                    if let Some(elem) = elements.get(idx) {
                                        set_by_path(
                                            &mut indexed_output,
                                            &inner_rule.target_path,
                                            elem.clone(),
                                        );
                                    }
                                } else {
                                    // Source path has a sub-path — find index
                                    // from the inner_rule's array field if present,
                                    // otherwise try to parse as "N.subpath"
                                    let parts: Vec<&str> = sp.splitn(2, '.').collect();
                                    if let Ok(idx) = parts[0].parse::<usize>()
                                        && let Some(elem) = elements.get(idx)
                                    {
                                        let sub_val = if parts.len() > 1 {
                                            get_by_path(elem, parts[1]).clone()
                                        } else {
                                            elem.clone()
                                        };
                                        set_by_path(
                                            &mut indexed_output,
                                            &inner_rule.target_path,
                                            sub_val,
                                        );
                                    }
                                }
                            }
                        }
                        set_by_path(&mut output, tgt_path, indexed_output);
                        rules_applied += 1;
                        continue;
                    }
                }
                ArrayMode::Whole => {} // fall through to normal transform
            }
        }

        // Use reverse override transform when in reverse direction
        let using_reverse_override =
            direction == MappingDirection::Reverse && rule.reverse.is_some();
        let active_transform = match direction {
            MappingDirection::Reverse => rule
                .reverse
                .as_ref()
                .map(|r| &r.transform)
                .unwrap_or(&rule.transform),
            MappingDirection::Forward => &rule.transform,
        };

        // Apply transform
        let transformed = match active_transform {
            TransformType::Drop => continue,
            TransformType::Preserve => source_value,
            TransformType::Constant(val) => val.clone(),
            TransformType::ValueMap { forward, unmapped } => {
                let mapped = if direction == MappingDirection::Reverse && !using_reverse_override {
                    // Auto-invert the map for reverse (not used when override provides its own map)
                    let reversed: Vec<(Value, Value)> = forward
                        .iter()
                        .map(|(k, v)| (v.clone(), k.clone()))
                        .collect();
                    apply_value_map(
                        &source_value,
                        &reversed,
                        *unmapped,
                        rule_idx,
                        tgt_path,
                        &mut diagnostics,
                        rule.default.as_ref(),
                    )
                } else {
                    // Forward direction, or reverse override already has the correct map
                    apply_value_map(
                        &source_value,
                        forward,
                        *unmapped,
                        rule_idx,
                        tgt_path,
                        &mut diagnostics,
                        rule.default.as_ref(),
                    )
                };
                match mapped {
                    Some(v) => v,
                    None => continue, // Drop strategy — omit target field
                }
            }
            TransformType::Coerce(target_type) => apply_coerce(
                &source_value,
                *target_type,
                rule_idx,
                tgt_path,
                &mut diagnostics,
            ),
            TransformType::Expression(fel_expr) => match parse(fel_expr) {
                Ok(expr) => {
                    let env = build_mapping_env(source, &output, Some(&source_value));
                    let result = evaluate(&expr, &env);
                    fel_to_json(&result.value)
                }
                Err(e) => {
                    diagnostics.push(MappingDiagnostic {
                        rule_index: rule_idx,
                        source_path: src_path.map(String::from),
                        target_path: tgt_path.to_string(),
                        error_code: MappingErrorCode::FelRuntime,
                        message: format!("FEL parse error: {e}"),
                    });
                    Value::Null
                }
            },
            TransformType::Flatten { separator } => {
                // Flatten writes multiple output keys for arrays (positional) and objects (dot-prefix)
                match &source_value {
                    Value::Array(arr) => {
                        if !separator.is_empty() {
                            // Join array with separator
                            let parts: Vec<String> = arr.iter().map(value_to_flat_string).collect();
                            set_by_path(
                                &mut output,
                                tgt_path,
                                Value::String(parts.join(separator)),
                            );
                        } else {
                            // Positional: write to targetPath_0, targetPath_1, ...
                            for (i, elem) in arr.iter().enumerate() {
                                set_by_path(&mut output, &format!("{tgt_path}_{i}"), elem.clone());
                            }
                        }
                        rules_applied += 1;
                        continue;
                    }
                    Value::Object(map) => {
                        // Dot-prefix: write to container[targetKey.subkey] as flat keys
                        // e.g. flatten address→out.addr produces out["addr.street"], out["addr.city"]
                        let segments = split_path(tgt_path);
                        let last_seg = segments.last().map(|s| s.as_str()).unwrap_or(tgt_path);
                        let flat_entries: Vec<(String, Value)> = map
                            .iter()
                            .map(|(k, v)| (format!("{last_seg}.{k}"), v.clone()))
                            .collect();
                        let parent_path = if segments.len() <= 1 {
                            None
                        } else {
                            Some(segments[..segments.len() - 1].join("."))
                        };
                        merge_flat_into(&mut output, parent_path.as_deref(), flat_entries);
                        rules_applied += 1;
                        continue;
                    }
                    Value::Null => continue,
                    _ => {
                        set_by_path(
                            &mut output,
                            tgt_path,
                            Value::String(value_to_flat_string(&source_value)),
                        );
                        rules_applied += 1;
                        continue;
                    }
                }
            }
            TransformType::Nest { separator } => {
                // Nest has multiple modes:
                // 1. String + separator → split into array
                // 2. No match → try positional keys (sourcePath_0, sourcePath_1, ...)
                // 3. Otherwise pass through
                match &source_value {
                    Value::String(s) if !separator.is_empty() => {
                        let parts: Vec<Value> = s
                            .split(separator.as_str())
                            .map(|p| Value::String(p.to_string()))
                            .collect();
                        set_by_path(&mut output, tgt_path, Value::Array(parts));
                        rules_applied += 1;
                        continue;
                    }
                    _ => {
                        // Try positional: look for sourcePath_0, sourcePath_1, ... in source
                        if let Some(sp) = src_path {
                            let mut positional = Vec::new();
                            let mut i = 0;
                            loop {
                                let key = format!("{sp}_{i}");
                                let val = get_by_path(source, &key);
                                if val.is_null() {
                                    break;
                                }
                                positional.push(val.clone());
                                i += 1;
                            }
                            if !positional.is_empty() {
                                set_by_path(&mut output, tgt_path, Value::Array(positional));
                                rules_applied += 1;
                                continue;
                            }
                        }
                        // Fall through to regular set_by_path
                        if !source_value.is_null() {
                            set_by_path(&mut output, tgt_path, source_value.clone());
                            rules_applied += 1;
                        }
                        continue;
                    }
                }
            }
            TransformType::Concat(fel_expr) => eval_fel_with_dollar(
                fel_expr,
                &source_value,
                source,
                rule_idx,
                src_path,
                tgt_path,
                &mut diagnostics,
            ),
            TransformType::Split(fel_expr) => {
                let result = eval_fel_with_dollar(
                    fel_expr,
                    &source_value,
                    source,
                    rule_idx,
                    src_path,
                    tgt_path,
                    &mut diagnostics,
                );
                // Split writes multiple target paths if result is array or object
                match &result {
                    Value::Array(arr) => {
                        for (i, elem) in arr.iter().enumerate() {
                            let indexed_path = format!("{tgt_path}.{i}");
                            set_by_path(&mut output, &indexed_path, elem.clone());
                        }
                        rules_applied += 1;
                        continue;
                    }
                    Value::Object(map) => {
                        for (k, v) in map {
                            let keyed_path = format!("{tgt_path}.{k}");
                            set_by_path(&mut output, &keyed_path, v.clone());
                        }
                        rules_applied += 1;
                        continue;
                    }
                    _ => result,
                }
            }
        };

        // Set output
        if !tgt_path.is_empty() {
            set_by_path(&mut output, tgt_path, transformed);
            rules_applied += 1;
        }
    }

    MappingResult {
        direction,
        output,
        rules_applied,
        diagnostics,
    }
}
