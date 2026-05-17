//! Full mapping document execution (`autoMap`, `defaults`).
//!
//! Direction checks and auto-map synthesis delegate rule execution to [`execute_mapping`](super::engine_helpers::execute_mapping).

use serde_json::Value;

use super::engine_helpers::execute_mapping;
use super::path::{get_by_path, set_by_path};
use super::types::{
    MappingDiagnostic, MappingDirection, MappingDocument, MappingErrorCode, MappingResult,
    MappingRule, TransformType,
};

/// Execute a full mapping document (rules + defaults + autoMap).
pub fn execute_mapping_doc(
    doc: &MappingDocument,
    source: &Value,
    direction: MappingDirection,
) -> MappingResult {
    if let Some(allowed) = doc.direction_restriction
        && allowed != direction
    {
        let message = if allowed == MappingDirection::Forward {
            "This mapping document is forward-only; reverse execution is not permitted"
        } else {
            "This mapping document is reverse-only; forward execution is not permitted"
        };
        return MappingResult {
            direction,
            output: Value::Object(serde_json::Map::new()),
            rules_applied: 0,
            diagnostics: vec![MappingDiagnostic {
                rule_index: 0,
                source_path: None,
                target_path: String::new(),
                error_code: MappingErrorCode::InvalidDocument,
                message: message.to_string(),
            }],
        };
    }

    // Build the effective rule set
    let mut rules = doc.rules.clone();

    // autoMap: generate synthetic preserve rules for unmapped top-level source keys (forward only)
    if doc.auto_map
        && direction == MappingDirection::Forward
        && let Some(obj) = source.as_object()
    {
        let mut covered: std::collections::HashSet<String> = std::collections::HashSet::new();
        for r in &doc.rules {
            if let Some(ref sp) = r.source_path {
                covered.insert(sp.clone());
                // Also cover the top-level segment for dotted paths
                if let Some(top) = sp.split('.').next() {
                    covered.insert(top.to_string());
                }
            }
        }
        for key in obj.keys() {
            if !covered.contains(key) {
                rules.push(MappingRule {
                    source_path: Some(key.clone()),
                    target_path: key.clone(),
                    transform: TransformType::Preserve,
                    condition: None,
                    priority: -1,
                    reverse_priority: None,
                    default: None,
                    bidirectional: true,
                    array: None,
                    reverse: None,
                });
            }
        }
    }

    // Execute rules
    let mut result = execute_mapping(&rules, source, direction);

    // Apply defaults for paths where no rule wrote a value. Forward only.
    // Uses set_by_path for dotted defaults (e.g. "meta.source" → nested meta.source).
    if direction == MappingDirection::Forward
        && let Some(ref defaults) = doc.defaults
    {
        for (k, v) in defaults {
            let existing = get_by_path(&result.output, k);
            if existing.is_null() {
                set_by_path(&mut result.output, k, v.clone());
            }
        }
    }

    result
}
