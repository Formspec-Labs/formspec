//! Dot-path splitting and JSON get/set helpers.

use serde_json::Value;

use crate::path_utils::{Path, PathSegment};

// ── Path utilities ──────────────────────────────────────────────

/// Get a value at a path in a JSON object.
/// Supports `[*]` wildcard: when `*` is encountered on an array, returns the array itself.
pub(crate) fn get_by_path<'a>(obj: &'a Value, path: &str) -> &'a Value {
    let p = Path::parse(path);
    let mut current = obj;
    for seg in &p.segments {
        match seg {
            PathSegment::Wildcard => {
                // Wildcard: return the current value if it's an array, else null
                return if current.is_array() {
                    current
                } else {
                    &Value::Null
                };
            }
            PathSegment::Exact(key) => match current {
                Value::Object(map) => {
                    current = map.get(key).unwrap_or(&Value::Null);
                }
                _ => return &Value::Null,
            },
            PathSegment::Indexed(idx) => match current {
                Value::Array(arr) => {
                    current = arr.get(*idx).unwrap_or(&Value::Null);
                }
                _ => return &Value::Null,
            },
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
    let p = Path::parse(path);
    if p.segments.is_empty() {
        return;
    }

    let mut current = obj;
    for (i, seg) in p.segments.iter().enumerate() {
        if i == p.segments.len() - 1 {
            // Last segment — set the value
            match current {
                Value::Object(map) => {
                    if let PathSegment::Exact(key) = seg {
                        map.insert(key.clone(), value);
                    }
                    return;
                }
                Value::Array(arr) => {
                    if let PathSegment::Indexed(idx) = seg {
                        while arr.len() <= *idx {
                            arr.push(Value::Null);
                        }
                        arr[*idx] = value;
                    }
                    return;
                }
                _ => return,
            }
        } else {
            // Intermediate segment — ensure container exists
            let next_is_index = matches!(p.segments.get(i + 1), Some(PathSegment::Indexed(_)));
            match current {
                Value::Object(map) => {
                    if let PathSegment::Exact(key) = seg {
                        if !map.contains_key(key) {
                            if next_is_index {
                                map.insert(key.clone(), Value::Array(vec![]));
                            } else {
                                map.insert(key.clone(), Value::Object(serde_json::Map::new()));
                            }
                        }
                        current = map.get_mut(key).unwrap();
                    } else {
                        return;
                    }
                }
                Value::Array(arr) => {
                    if let PathSegment::Indexed(idx) = seg {
                        while arr.len() <= *idx {
                            arr.push(Value::Null);
                        }
                        if arr[*idx].is_null() {
                            if next_is_index {
                                arr[*idx] = Value::Array(vec![]);
                            } else {
                                arr[*idx] = Value::Object(serde_json::Map::new());
                            }
                        }
                        current = &mut arr[*idx];
                    } else {
                        return;
                    }
                }
                _ => return,
            }
        }
    }
}
