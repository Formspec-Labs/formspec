//! Build [`ExtensionConstraint`](crate::ExtensionConstraint) vectors from registry JSON documents.

use fel_core::exact_json::Value;

use crate::ExtensionConstraint;

/// Extract extension constraint payloads from raw registry documents (`entries` arrays).
pub fn extension_constraints_from_registry_documents(docs: &[Value]) -> Vec<ExtensionConstraint> {
    let mut constraints = Vec::new();

    for doc_val in docs {
        let entries = match doc_val.get("entries").and_then(|v| v.as_array()) {
            Some(arr) => arr,
            None => continue,
        };

        for entry in entries {
            let name = match entry.get("name").and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            let status = entry
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("stable")
                .to_string();

            let display_name = entry
                .get("metadata")
                .and_then(|m| m.get("displayName"))
                .and_then(|v| v.as_str())
                .map(String::from);

            let base_type = entry
                .get("baseType")
                .and_then(|v| v.as_str())
                .map(String::from);

            let deprecation_notice = entry
                .get("deprecationNotice")
                .and_then(|v| v.as_str())
                .map(String::from);

            let compatibility_version = entry
                .get("compatibility")
                .and_then(|c| c.get("formspecVersion"))
                .and_then(|v| v.as_str())
                .map(String::from);

            let constraint_obj = entry.get("constraints");

            let pattern = constraint_obj
                .and_then(|c| c.get("pattern"))
                .and_then(|v| v.as_str())
                .map(String::from);

            let max_length = constraint_obj
                .and_then(|c| c.get("maxLength"))
                .and_then(|v| v.as_u64());

            let minimum = constraint_obj
                .and_then(|c| c.get("minimum"))
                .and_then(|v| v.as_decimal());

            let maximum = constraint_obj
                .and_then(|c| c.get("maximum"))
                .and_then(|v| v.as_decimal());

            constraints.push(ExtensionConstraint {
                name,
                display_name,
                pattern,
                max_length,
                minimum,
                maximum,
                base_type,
                status,
                deprecation_notice,
                compatibility_version,
            });
        }
    }

    constraints
}
