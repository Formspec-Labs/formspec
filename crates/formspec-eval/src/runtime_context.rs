//! Instance hydration and previous relevance state for evaluation.

use crate::types::ItemInfo;
use fel_core::exact_json::Value;
use std::collections::HashMap;

/// Copy `definition.instances.*.data` into the instance map when the host omitted that name.
pub(crate) fn hydrate_inline_instances(definition: &Value, instances: &mut HashMap<String, Value>) {
    let Some(declared) = definition.get("instances").and_then(Value::as_object) else {
        return;
    };
    for (name, instance) in declared {
        if instances.contains_key(name) {
            continue;
        }
        if let Some(data) = instance.get("data") {
            instances.insert(name.clone(), data.clone());
        }
    }
}

/// Mark items as previously non-relevant for transition detection.
pub(crate) fn apply_previous_non_relevant(items: &mut [ItemInfo], non_relevant_paths: &[String]) {
    for item in items.iter_mut() {
        if non_relevant_paths.contains(&item.path) {
            item.mip.prev_relevant = false;
        }
        apply_previous_non_relevant(&mut item.children, non_relevant_paths);
    }
}
