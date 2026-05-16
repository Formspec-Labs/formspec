//! Dot-path splitting and JSON get/set helpers.

use serde_json::Value;

// ── Path utilities ──────────────────────────────────────────────

/// Split a dotted/bracketed path into segments.
pub(crate) fn split_path(path: &str) -> Vec<String> {
    let mut segments = Vec::new();
    let mut current = String::new();

    for c in path.chars() {
        match c {
            '.' => {
                if !current.is_empty() {
                    segments.push(std::mem::take(&mut current));
                }
            }
            '[' => {
                if !current.is_empty() {
                    segments.push(std::mem::take(&mut current));
                }
            }
            ']' => {
                if !current.is_empty() {
                    segments.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(c),
        }
    }
    if !current.is_empty() {
        segments.push(current);
    }
    segments
}

/// Get a value at a path in a JSON object.
/// Supports `[*]` wildcard: when `*` is encountered on an array, returns the array itself.
pub(crate) fn get_by_path<'a>(obj: &'a Value, path: &str) -> &'a Value {
    let segments = split_path(path);
    let mut current = obj;
    for seg in &segments {
        if seg == "*" {
            // Wildcard: return the current value if it's an array, else null
            return if current.is_array() {
                current
            } else {
                &Value::Null
            };
        }
        match current {
            Value::Object(map) => {
                current = map.get(seg.as_str()).unwrap_or(&Value::Null);
            }
            Value::Array(arr) => {
                if let Ok(idx) = seg.parse::<usize>() {
                    current = arr.get(idx).unwrap_or(&Value::Null);
                } else {
                    return &Value::Null;
                }
            }
            _ => return &Value::Null,
        }
    }
    current
}

/// Write flat key/value entries into `output`, either at the root or under
/// `parent_path`. Backs the Flatten transform (mapping spec §4.7) by attaching
/// dot-prefixed flat keys to a target container.
///
/// **Asymmetric semantics — preserved from the pre-extraction inline code:**
///
/// - `parent_path = None`: entries are inserted at the root via
///   `out_map.insert(k, v)`. Pre-existing root keys are **preserved** unless a
///   new entry collides (new wins).
/// - `parent_path = Some(p)`: the parent at `p` is **overwritten** with a
///   fresh empty object first (via `set_by_path`), then entries are written
///   under it. Pre-existing sibling keys under `p` are **NOT preserved**.
///
/// The asymmetry comes from `set_by_path` doing an unconditional `map.insert`
/// at the leaf segment. Whether Flatten *should* preserve siblings under a
/// parent path is an open Mapping Spec §4.7 question; the regression-pinned
/// test `merge_flat_into_parent_path_replaces_existing_object` guards the
/// current behavior so any change is intentional.
pub(crate) fn merge_flat_into(
    output: &mut Value,
    parent_path: Option<&str>,
    flat_entries: Vec<(String, Value)>,
) {
    match parent_path {
        None => {
            if let Value::Object(out_map) = output {
                for (flat_key, val) in flat_entries {
                    out_map.insert(flat_key, val);
                }
            }
        }
        Some(parent_path) => {
            // Ensure parent container exists.
            set_by_path(output, parent_path, Value::Object(serde_json::Map::new()));
            // Clone the existing parent map (works around mutable+immutable
            // borrow conflict on `output`), merge in new entries, write back.
            let existing = match get_by_path(output, parent_path) {
                Value::Object(map) => map.clone(),
                _ => return,
            };
            let mut merged = existing;
            for (flat_key, val) in flat_entries {
                merged.insert(flat_key, val);
            }
            set_by_path(output, parent_path, Value::Object(merged));
        }
    }
}

/// Set a value at a path in a JSON object, creating intermediate objects as needed.
pub(crate) fn set_by_path(obj: &mut Value, path: &str, value: Value) {
    let segments = split_path(path);
    if segments.is_empty() {
        return;
    }

    let mut current = obj;
    for (i, seg) in segments.iter().enumerate() {
        if i == segments.len() - 1 {
            // Last segment — set the value
            match current {
                Value::Object(map) => {
                    map.insert(seg.clone(), value);
                    return;
                }
                Value::Array(arr) => {
                    if let Ok(idx) = seg.parse::<usize>() {
                        while arr.len() <= idx {
                            arr.push(Value::Null);
                        }
                        arr[idx] = value;
                        return;
                    }
                }
                _ => return,
            }
        } else {
            // Intermediate segment — ensure container exists
            let next_is_index = segments
                .get(i + 1)
                .is_some_and(|s| s.parse::<usize>().is_ok());
            match current {
                Value::Object(map) => {
                    if !map.contains_key(seg.as_str()) {
                        if next_is_index {
                            map.insert(seg.clone(), Value::Array(vec![]));
                        } else {
                            map.insert(seg.clone(), Value::Object(serde_json::Map::new()));
                        }
                    }
                    current = map.get_mut(seg.as_str()).unwrap();
                }
                Value::Array(arr) => {
                    if let Ok(idx) = seg.parse::<usize>() {
                        while arr.len() <= idx {
                            arr.push(Value::Null);
                        }
                        if arr[idx].is_null() {
                            if next_is_index {
                                arr[idx] = Value::Array(vec![]);
                            } else {
                                arr[idx] = Value::Object(serde_json::Map::new());
                            }
                        }
                        current = &mut arr[idx];
                    } else {
                        return;
                    }
                }
                _ => return,
            }
        }
    }
}
