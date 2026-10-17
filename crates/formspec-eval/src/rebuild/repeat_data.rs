//! Repeat-instance counting and wildcard expansion over flat indexed keys.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::Value;
use std::collections::HashMap;

/// Expand wildcard paths against actual repeat data.
/// For example, `items[*].total` with 3 items returns:
/// `["items[0].total", "items[1].total", "items[2].total"]`
pub fn expand_wildcard_path(pattern: &str, data: &HashMap<String, Value>) -> Vec<String> {
    if !pattern.contains("[*]") {
        return vec![pattern.to_string()];
    }

    let parts: Vec<&str> = pattern.splitn(2, "[*]").collect();
    if parts.len() != 2 {
        return vec![pattern.to_string()];
    }

    let base = parts[0];
    let suffix = parts[1].strip_prefix('.').unwrap_or(parts[1]);

    // Find the count by looking at the data for the base path
    let count = detect_repeat_count(base, data);

    let mut expanded = Vec::new();
    for i in 0..count {
        let concrete = if suffix.is_empty() {
            format!("{}[{}]", base, i)
        } else {
            format!("{}[{}].{}", base, i, suffix)
        };
        expanded.extend(expand_wildcard_path(&concrete, data));
    }
    expanded
}

/// Detect the repeat count for a given base path from the flat indexed keys
/// (`base[0].field`, `base[1].field`). Row arrays are flattened away on entry
/// ([`super::flatten_response_data`]); rows with no answered field are counted there.
pub(crate) fn detect_repeat_count(base: &str, data: &HashMap<String, Value>) -> usize {
    let mut max_index = 0usize;
    let prefix = format!("{}[", base);
    for key in data.keys() {
        if let Some(rest) = key.strip_prefix(&prefix)
            && let Some(idx_str) = rest.split(']').next()
            && let Ok(idx) = idx_str.parse::<usize>()
        {
            max_index = max_index.max(idx + 1);
        }
    }
    max_index
}
