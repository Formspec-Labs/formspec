//! Small JSON helpers shared across bindings.

use std::collections::HashMap;

use fel_core::exact_json::JsonTree;

/// Clone a JSON object into a `String` → `Value` map; non-objects yield an empty map.
pub fn json_object_to_string_map<V: JsonTree>(val: &V) -> HashMap<String, V> {
    val.members().map(|(k, v)| (k.clone(), v.clone())).collect()
}
