//! FEL path rewriting for definition assembly (fragment `$ref` / `keyPrefix` semantics).
//!
//! Shared by the assembler and the WASM `rewriteFelForAssembly` entry point.

use std::collections::HashSet;

use serde_json::Value;

use crate::{RewriteOptions, rewrite_fel_source_references, rewrite_message_template};

/// Maps fragment item keys to host paths during `$ref` assembly (see TS `RewriteMap`).
#[derive(Debug, Clone)]
pub struct AssemblyFelRewriteMap {
    /// Selected fragment root item key, or empty when the whole definition is imported.
    pub fragment_root_key: String,
    /// Host group key that replaces the fragment root in `$` field references.
    pub host_group_key: String,
    /// All item keys in the imported subtree (for `keyPrefix` decisions).
    pub imported_keys: HashSet<String>,
    /// Prefix applied to imported keys (e.g. `proj_`).
    pub key_prefix: String,
}

/// Parse a JSON object into [`AssemblyFelRewriteMap`] (camelCase or snake_case keys).
pub fn assembly_fel_rewrite_map_from_value(v: &Value) -> Result<AssemblyFelRewriteMap, String> {
    let obj = v
        .as_object()
        .ok_or_else(|| "assembly rewrite map must be a JSON object".to_string())?;

    let fragment_root_key = obj
        .get("fragmentRootKey")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    let host_group_key = obj
        .get("hostGroupKey")
        .and_then(|x| x.as_str())
        .ok_or_else(|| "hostGroupKey is required".to_string())?
        .to_string();

    let key_prefix = obj
        .get("keyPrefix")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();

    let imported_keys: HashSet<String> =
        match obj.get("importedKeys") {
            Some(Value::Array(arr)) => arr
                .iter()
                .filter_map(|x| x.as_str().map(String::from))
                .collect(),
            _ => {
                return Err("importedKeys must be a JSON array of strings".to_string());
            }
        };

    Ok(AssemblyFelRewriteMap {
        fragment_root_key,
        host_group_key,
        imported_keys,
        key_prefix,
    })
}

/// Rewrite a FEL expression using assembly fragment/host key rules (TS `rewriteFEL`).
pub fn rewrite_fel_for_assembly(expression: &str, map: &AssemblyFelRewriteMap) -> String {
    let options = make_rewrite_options(map);
    rewrite_fel_source_references(expression, &options)
}

/// Rewrite `{{...}}` FEL segments in a message using the same assembly map.
pub fn rewrite_message_template_for_assembly(message: &str, map: &AssemblyFelRewriteMap) -> String {
    let options = make_rewrite_options(map);
    rewrite_message_template(message, &options)
}

/// Prefix dotted path segments whose base key is in `imported_keys` (bind / shape paths).
pub(crate) fn assembly_prefix_path(
    path: &str,
    prefix: &str,
    imported_keys: &HashSet<String>,
) -> String {
    let segments = split_path_segments(path);
    let rewritten: Vec<String> = segments
        .into_iter()
        .map(|segment| {
            let base = segment_base(&segment);
            if imported_keys.contains(base) {
                format!("{prefix}{segment}")
            } else {
                segment
            }
        })
        .collect();
    join_path_segments(&rewritten)
}

fn make_rewrite_options(map: &AssemblyFelRewriteMap) -> RewriteOptions {
    let field_map = map.clone();
    let current_map = map.clone();
    let navigation_map = map.clone();

    RewriteOptions {
        rewrite_field_path: Some(Box::new(move |path| {
            Some(rewrite_field_path(path, &field_map))
        })),
        rewrite_current_path: Some(Box::new(move |path| {
            Some(rewrite_current_path(path, &current_map))
        })),
        rewrite_variable: None,
        rewrite_instance_name: None,
        rewrite_navigation_target: Some(Box::new(move |name, _fn_name| {
            if navigation_map.imported_keys.contains(name) {
                Some(format!("{}{}", navigation_map.key_prefix, name))
            } else {
                None
            }
        })),
    }
}

fn rewrite_field_path(path: &str, map: &AssemblyFelRewriteMap) -> String {
    let segments = split_path_segments(path);
    if segments.is_empty() {
        return path.to_string();
    }

    let first_base = segment_base(&segments[0]);
    let should_replace_root = (!map.fragment_root_key.is_empty()
        && first_base == map.fragment_root_key)
        || (map.fragment_root_key.is_empty()
            && segments.len() > 1
            && map.imported_keys.contains(first_base));

    let mut rewritten = Vec::new();
    let mut iter = segments.into_iter();
    if should_replace_root {
        rewritten.push(map.host_group_key.clone());
        iter.next();
    }

    for segment in iter {
        let base = segment_base(&segment);
        if map.imported_keys.contains(base) {
            rewritten.push(format!("{}{}", map.key_prefix, segment));
        } else {
            rewritten.push(segment);
        }
    }

    if !should_replace_root && rewritten.is_empty() {
        rewritten.push(path.to_string());
    } else if !should_replace_root {
        return join_path_segments(
            &split_path_segments(path)
                .into_iter()
                .map(|segment| {
                    let base = segment_base(&segment);
                    if map.imported_keys.contains(base) {
                        format!("{}{}", map.key_prefix, segment)
                    } else {
                        segment
                    }
                })
                .collect::<Vec<_>>(),
        );
    }

    join_path_segments(&rewritten)
}

fn rewrite_current_path(path: &str, map: &AssemblyFelRewriteMap) -> String {
    let segments = split_path_segments(path);
    let rewritten: Vec<String> = segments
        .into_iter()
        .map(|segment| {
            let base = segment_base(&segment);
            if map.imported_keys.contains(base) {
                format!("{}{}", map.key_prefix, segment)
            } else {
                segment
            }
        })
        .collect();
    join_path_segments(&rewritten)
}

fn split_path_segments(path: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut current = String::new();
    let mut bracket_depth = 0usize;
    for ch in path.chars() {
        match ch {
            '.' if bracket_depth == 0 => {
                if !current.is_empty() {
                    segments.push(current.clone());
                    current.clear();
                }
            }
            '[' => {
                bracket_depth += 1;
                current.push(ch);
            }
            ']' => {
                bracket_depth = bracket_depth.saturating_sub(1);
                current.push(ch);
            }
            _ => current.push(ch),
        }
    }
    if !current.is_empty() {
        segments.push(current);
    }
    segments
}

fn join_path_segments(segments: &[String]) -> String {
    let mut result = String::new();
    for (index, segment) in segments.iter().enumerate() {
        if index > 0 && !segment.starts_with('[') {
            result.push('.');
        }
        result.push_str(segment);
    }
    result
}

fn segment_base(segment: &str) -> &str {
    segment.split('[').next().unwrap_or(segment)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn common_map() -> AssemblyFelRewriteMap {
        AssemblyFelRewriteMap {
            fragment_root_key: "budget".into(),
            host_group_key: "projectBudget".into(),
            imported_keys: ["budget", "amount"].into_iter().map(String::from).collect(),
            key_prefix: "proj_".into(),
        }
    }

    #[test]
    fn matches_ts_assembler_fel_rewrite_1_1() {
        let m = common_map();
        assert_eq!(rewrite_fel_for_assembly("$amount", &m), "$proj_amount");
    }

    #[test]
    fn matches_ts_1_2_dotted_fragment_root() {
        let m = common_map();
        assert_eq!(
            rewrite_fel_for_assembly("$budget.amount", &m),
            "$projectBudget.proj_amount"
        );
    }

    #[test]
    fn matches_ts_1_7_current_path() {
        let m = common_map();
        assert_eq!(
            rewrite_fel_for_assembly("@index > 0 and @count < 10 and @current.amount > 0", &m,),
            "@index > 0 and @count < 10 and @current.proj_amount > 0"
        );
    }

    #[test]
    fn matches_ts_1_12_prev() {
        let m = AssemblyFelRewriteMap {
            fragment_root_key: "budget".into(),
            host_group_key: "projectBudget".into(),
            imported_keys: ["budget", "runningTotal"]
                .into_iter()
                .map(String::from)
                .collect(),
            key_prefix: "proj_".into(),
        };
        assert_eq!(
            rewrite_fel_for_assembly("prev('runningTotal')", &m),
            "prev('proj_runningTotal')"
        );
    }

    #[test]
    fn parse_map_from_json() {
        let v = json!({
            "fragmentRootKey": "budget",
            "hostGroupKey": "projectBudget",
            "importedKeys": ["budget", "amount"],
            "keyPrefix": "proj_"
        });
        let m = assembly_fel_rewrite_map_from_value(&v).unwrap();
        assert_eq!(rewrite_fel_for_assembly("$amount", &m), "$proj_amount");
    }
}
