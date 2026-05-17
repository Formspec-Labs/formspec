//! Mapping rule pipeline and per-rule execution helpers.

use fel_core::{evaluate, fel_to_json, parse};
use serde_json::Value;

use super::env::build_mapping_env;
use super::path::{get_by_path, merge_flat_into, set_by_path};
use super::transforms::{
    apply_coerce, apply_value_map, eval_fel_with_dollar, value_to_flat_string,
};
use super::types::*;
use crate::path_utils::Path;

/// Outcome of applying a rule transform before writing the target path.
enum TransformStep {
    /// Output already written; rule is finished.
    Completed,
    /// Value to assign at the rule target path.
    Pending(Value),
    /// Omit the target field (drop / unmapped drop).
    Omit,
}

/// Execute a set of mapping rules in a given direction.
pub fn execute_mapping(
    rules: &[MappingRule],
    source: &Value,
    direction: MappingDirection,
) -> MappingResult {
    let mut output = Value::Object(serde_json::Map::new());
    let mut diagnostics = Vec::new();
    let mut rules_applied = 0;

    for rule_idx in sorted_rule_indices(rules, direction) {
        let rule = &rules[rule_idx];

        if skip_rule_in_reverse(rule, direction) {
            continue;
        }

        if !rule_condition_met(rule.condition.as_deref(), source, &output) {
            continue;
        }

        let (src_path, tgt_path) = direction_paths(rule, direction);
        let source_value = resolve_source_value(rule, source, src_path);

        if let Some(ref arr_desc) = rule.array
            && try_apply_array_descriptor(
                arr_desc,
                &source_value,
                direction,
                tgt_path,
                &mut output,
            )
            .is_some()
        {
            rules_applied += 1;
            continue;
        }

        let (active_transform, using_reverse_override) = active_transform(rule, direction);
        match apply_rule_transform(
            active_transform,
            direction,
            using_reverse_override,
            source,
            &mut output,
            &source_value,
            rule,
            rule_idx,
            src_path,
            tgt_path,
            &mut diagnostics,
        ) {
            TransformStep::Completed => rules_applied += 1,
            TransformStep::Omit => {}
            TransformStep::Pending(transformed) if !tgt_path.is_empty() => {
                set_by_path(&mut output, tgt_path, transformed);
                rules_applied += 1;
            }
            TransformStep::Pending(_) => {}
        }
    }

    MappingResult {
        direction,
        output,
        rules_applied,
        diagnostics,
    }
}

/// Rule indices sorted by forward or reverse priority.
fn sorted_rule_indices(rules: &[MappingRule], direction: MappingDirection) -> Vec<usize> {
    let mut indices: Vec<usize> = (0..rules.len()).collect();
    indices.sort_by_key(|&i| {
        let r = &rules[i];
        match direction {
            MappingDirection::Forward => std::cmp::Reverse(r.priority),
            MappingDirection::Reverse => std::cmp::Reverse(r.reverse_priority.unwrap_or(r.priority)),
        }
    });
    indices
}

/// Whether a bidirectional rule should run in reverse direction.
fn skip_rule_in_reverse(rule: &MappingRule, direction: MappingDirection) -> bool {
    direction == MappingDirection::Reverse && !rule.bidirectional
}

/// Evaluate an optional FEL condition against source and partial output.
fn rule_condition_met(
    condition: Option<&str>,
    source: &Value,
    output: &Value,
) -> bool {
    let Some(cond) = condition else {
        return true;
    };
    let Ok(expr) = parse(cond) else {
        return true;
    };
    let env = build_mapping_env(source, output, None);
    evaluate(&expr, &env).value.is_truthy()
}

/// Resolve source and target paths for the active mapping direction.
fn direction_paths<'a>(
    rule: &'a MappingRule,
    direction: MappingDirection,
) -> (Option<&'a str>, &'a str) {
    match direction {
        MappingDirection::Forward => (
            rule.source_path.as_deref(),
            rule.target_path.as_str(),
        ),
        MappingDirection::Reverse => (
            Some(rule.target_path.as_str()),
            rule.source_path.as_deref().unwrap_or(""),
        ),
    }
}

/// Read the rule source value, applying per-rule default when absent or null.
fn resolve_source_value(
    rule: &MappingRule,
    source: &Value,
    src_path: Option<&str>,
) -> Value {
    match src_path {
        Some(p) if !p.is_empty() => {
            let v = get_by_path(source, p).clone();
            if v.is_null() {
                rule.default.clone().unwrap_or(v)
            } else {
                v
            }
        }
        _ => rule.default.clone().unwrap_or(Value::Null),
    }
}

/// Apply array descriptor inner rules when mode is `each` or `indexed`.
///
/// Returns `Some(())` when the array branch handled the rule (including no-op when source is not an array).
fn try_apply_array_descriptor(
    arr_desc: &ArrayDescriptor,
    source_value: &Value,
    direction: MappingDirection,
    tgt_path: &str,
    output: &mut Value,
) -> Option<()> {
    if arr_desc.inner_rules.is_empty() {
        return None;
    }
    match arr_desc.mode {
        ArrayMode::Each => apply_array_each(arr_desc, source_value, direction, tgt_path, output),
        ArrayMode::Indexed => apply_array_indexed(arr_desc, source_value, tgt_path, output),
        ArrayMode::Whole => None,
    }
}

fn apply_array_each(
    arr_desc: &ArrayDescriptor,
    source_value: &Value,
    direction: MappingDirection,
    tgt_path: &str,
    output: &mut Value,
) -> Option<()> {
    let Value::Array(elements) = source_value else {
        return None;
    };
    let result_arr: Vec<Value> = elements
        .iter()
        .map(|elem| execute_mapping(&arr_desc.inner_rules, elem, direction).output)
        .collect();
    set_by_path(output, tgt_path, Value::Array(result_arr));
    Some(())
}

fn apply_array_indexed(
    arr_desc: &ArrayDescriptor,
    source_value: &Value,
    tgt_path: &str,
    output: &mut Value,
) -> Option<()> {
    let Value::Array(elements) = source_value else {
        return None;
    };
    let mut indexed_output = Value::Object(serde_json::Map::new());
    for inner_rule in &arr_desc.inner_rules {
        let Some(ref sp) = inner_rule.source_path else {
            continue;
        };
        if let Ok(idx) = sp.parse::<usize>() {
            if let Some(elem) = elements.get(idx) {
                set_by_path(
                    &mut indexed_output,
                    &inner_rule.target_path,
                    elem.clone(),
                );
            }
            continue;
        }
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
    set_by_path(output, tgt_path, indexed_output);
    Some(())
}

/// Transform active for this direction (reverse override when present).
fn active_transform<'a>(
    rule: &'a MappingRule,
    direction: MappingDirection,
) -> (&'a TransformType, bool) {
    let using_reverse_override =
        direction == MappingDirection::Reverse && rule.reverse.is_some();
    let transform = match direction {
        MappingDirection::Reverse => rule
            .reverse
            .as_ref()
            .map(|r| &r.transform)
            .unwrap_or(&rule.transform),
        MappingDirection::Forward => &rule.transform,
    };
    (transform, using_reverse_override)
}

/// Apply the rule transform, possibly writing directly to `output`.
fn apply_rule_transform(
    transform: &TransformType,
    direction: MappingDirection,
    using_reverse_override: bool,
    source: &Value,
    output: &mut Value,
    source_value: &Value,
    rule: &MappingRule,
    rule_idx: usize,
    src_path: Option<&str>,
    tgt_path: &str,
    diagnostics: &mut Vec<MappingDiagnostic>,
) -> TransformStep {
    match transform {
        TransformType::Drop => TransformStep::Omit,
        TransformType::Preserve => TransformStep::Pending(source_value.clone()),
        TransformType::Constant(val) => TransformStep::Pending(val.clone()),
        TransformType::ValueMap { forward, unmapped } => {
            let mapped = if direction == MappingDirection::Reverse && !using_reverse_override {
                let inverted: Vec<_> = forward
                    .iter()
                    .map(|(k, v)| (v.clone(), k.clone()))
                    .collect();
                apply_value_map(
                    source_value,
                    &inverted,
                    *unmapped,
                    rule_idx,
                    tgt_path,
                    diagnostics,
                    rule.default.as_ref(),
                )
            } else {
                apply_value_map(
                    source_value,
                    forward,
                    *unmapped,
                    rule_idx,
                    tgt_path,
                    diagnostics,
                    rule.default.as_ref(),
                )
            };
            match mapped {
                Some(v) => TransformStep::Pending(v),
                None => TransformStep::Omit,
            }
        }
        TransformType::Coerce(target_type) => TransformStep::Pending(apply_coerce(
            source_value,
            *target_type,
            rule_idx,
            tgt_path,
            diagnostics,
        )),
        TransformType::Expression(fel_expr) => TransformStep::Pending(eval_expression_transform(
            fel_expr,
            source,
            output,
            source_value,
            rule_idx,
            src_path,
            tgt_path,
            diagnostics,
        )),
        TransformType::Flatten { separator } => apply_flatten_transform(
            source_value,
            separator,
            tgt_path,
            output,
        ),
        TransformType::Nest { separator } => apply_nest_transform(
            source_value,
            separator,
            source,
            src_path,
            tgt_path,
            output,
        ),
        TransformType::Concat(fel_expr) => TransformStep::Pending(eval_fel_with_dollar(
            fel_expr,
            source_value,
            source,
            rule_idx,
            src_path,
            tgt_path,
            diagnostics,
        )),
        TransformType::Split(fel_expr) => apply_split_transform(
            fel_expr,
            source_value,
            source,
            rule_idx,
            src_path,
            tgt_path,
            output,
            diagnostics,
        ),
    }
}

fn eval_expression_transform(
    fel_expr: &str,
    source: &Value,
    output: &Value,
    source_value: &Value,
    rule_idx: usize,
    src_path: Option<&str>,
    tgt_path: &str,
    diagnostics: &mut Vec<MappingDiagnostic>,
) -> Value {
    match parse(fel_expr) {
        Ok(expr) => {
            let env = build_mapping_env(source, output, Some(source_value));
            fel_to_json(&evaluate(&expr, &env).value)
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
    }
}

fn apply_flatten_transform(
    source_value: &Value,
    separator: &str,
    tgt_path: &str,
    output: &mut Value,
) -> TransformStep {
    match source_value {
        Value::Array(arr) => {
            if !separator.is_empty() {
                let parts: Vec<String> = arr.iter().map(value_to_flat_string).collect();
                set_by_path(
                    output,
                    tgt_path,
                    Value::String(parts.join(separator)),
                );
            } else {
                for (i, elem) in arr.iter().enumerate() {
                    set_by_path(output, &format!("{tgt_path}_{i}"), elem.clone());
                }
            }
            TransformStep::Completed
        }
        Value::Object(map) => {
            let p = Path::parse(tgt_path);
            let last_seg = p
                .segments
                .last()
                .map(|s| s.flat_key())
                .unwrap_or_else(|| tgt_path.to_string());
            let flat_entries: Vec<(String, Value)> = map
                .iter()
                .map(|(k, v)| (format!("{last_seg}.{k}"), v.clone()))
                .collect();
            let parent_path = if p.segments.len() <= 1 {
                None
            } else {
                Some(p.parent_string())
            };
            merge_flat_into(output, parent_path.as_deref(), flat_entries);
            TransformStep::Completed
        }
        Value::Null => TransformStep::Omit,
        _ => {
            set_by_path(
                output,
                tgt_path,
                Value::String(value_to_flat_string(source_value)),
            );
            TransformStep::Completed
        }
    }
}

fn apply_nest_transform(
    source_value: &Value,
    separator: &str,
    source: &Value,
    src_path: Option<&str>,
    tgt_path: &str,
    output: &mut Value,
) -> TransformStep {
    if let Value::String(s) = source_value
        && !separator.is_empty()
    {
        let parts: Vec<Value> = s
            .split(separator)
            .map(|p| Value::String(p.to_string()))
            .collect();
        set_by_path(output, tgt_path, Value::Array(parts));
        return TransformStep::Completed;
    }
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
            set_by_path(output, tgt_path, Value::Array(positional));
            return TransformStep::Completed;
        }
    }
    if source_value.is_null() {
        TransformStep::Omit
    } else {
        set_by_path(output, tgt_path, source_value.clone());
        TransformStep::Completed
    }
}

fn apply_split_transform(
    fel_expr: &str,
    source_value: &Value,
    source: &Value,
    rule_idx: usize,
    src_path: Option<&str>,
    tgt_path: &str,
    output: &mut Value,
    diagnostics: &mut Vec<MappingDiagnostic>,
) -> TransformStep {
    let result = eval_fel_with_dollar(
        fel_expr,
        source_value,
        source,
        rule_idx,
        src_path,
        tgt_path,
        diagnostics,
    );
    match &result {
        Value::Array(arr) => {
            for (i, elem) in arr.iter().enumerate() {
                set_by_path(output, &format!("{tgt_path}.{i}"), elem.clone());
            }
            TransformStep::Completed
        }
        Value::Object(map) => {
            for (k, v) in map {
                set_by_path(output, &format!("{tgt_path}.{k}"), v.clone());
            }
            TransformStep::Completed
        }
        _ => TransformStep::Pending(result),
    }
}
