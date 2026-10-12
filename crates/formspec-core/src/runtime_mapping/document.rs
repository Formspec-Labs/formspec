//! Full mapping document execution (`autoMap`, `defaults`).
//!
//! Direction checks and auto-map synthesis delegate rule execution to [`execute_mapping`](super::engine_helpers::execute_mapping).

use serde_json::{Value, json};

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
    if doc.source_schema.is_some() {
        return invalid_document(
            direction,
            "External source schema validation is required".to_string(),
        );
    }
    execute_document(doc, source, direction)
}

/// Execute a mapping with independently supplied external source schema validation.
///
/// The validator must compile the schema and validate the instance, returning
/// an error for invalid schemas, unresolved references, or mismatched values.
/// The external identity is validated using the Mapping association schema.
/// Forward execution validates input before evaluating rules. Reverse execution
/// validates the final mapped output. A refusal returns empty output and an
/// `InvalidDocument` diagnostic. Definition-associated documents keep their
/// existing execution behavior and do not call the validator.
pub fn execute_mapping_doc_with_validation(
    doc: &MappingDocument,
    source: &Value,
    direction: MappingDirection,
    validator: impl Fn(&Value, &Value) -> Result<(), String>,
) -> MappingResult {
    let Some(association) = &doc.source_schema else {
        return execute_document(doc, source, direction);
    };
    // Reuse the identity constraints in mapping.schema.json; the host validates
    // formats and patterns without a second URI or semantic-version parser.
    let identity_schema = json!({
        "type": "object", "required": ["url", "version"], "additionalProperties": false,
        "properties": {
            "url": {"type": "string", "minLength": 1, "format": "uri"},
            "version": {"type": "string", "pattern": r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$"}
        }
    });
    if let Err(error) = validator(
        &identity_schema,
        &json!({"url": association.url, "version": association.version}),
    ) {
        return invalid_document(
            direction,
            format!("External source identity validation failed: {error}"),
        );
    }
    if direction == MappingDirection::Forward
        && let Err(error) = validator(&association.schema, source)
    {
        return invalid_document(
            direction,
            format!("External source schema validation failed: {error}"),
        );
    }
    let result = execute_document(doc, source, direction);
    if direction == MappingDirection::Reverse
        && !result
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.error_code == MappingErrorCode::InvalidDocument)
        && let Err(error) = validator(&association.schema, &result.output)
    {
        return invalid_document(
            direction,
            format!("External source schema validation failed: {error}"),
        );
    }
    result
}

fn invalid_document(direction: MappingDirection, message: String) -> MappingResult {
    MappingResult {
        direction,
        output: Value::Object(serde_json::Map::new()),
        rules_applied: 0,
        diagnostics: vec![MappingDiagnostic {
            rule_index: 0,
            source_path: None,
            target_path: String::new(),
            error_code: MappingErrorCode::InvalidDocument,
            message,
        }],
    }
}

fn execute_document(
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
        return invalid_document(direction, message.to_string());
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
