//! Centralized JSON field names for host bindings (`JsonWireStyle`).

pub use fel_core::JsonWireStyle;

/// Keys for [`crate::runtime_mapping::mapping_result_to_json_value`].
pub fn mapping_result_host_keys(
    style: JsonWireStyle,
) -> (
    &'static str,
    &'static str,
    &'static str,
    &'static str,
    &'static str,
) {
    match style {
        JsonWireStyle::JsCamel => (
            "rulesApplied",
            "ruleIndex",
            "sourcePath",
            "targetPath",
            "errorCode",
        ),
        JsonWireStyle::PythonSnake => (
            "rules_applied",
            "rule_index",
            "source_path",
            "target_path",
            "error_code",
        ),
    }
}

/// Keys for [`crate::registry_client::registry_parse_summary_to_json_value`].
pub fn registry_parse_summary_keys(style: JsonWireStyle) -> (&'static str, &'static str) {
    match style {
        JsonWireStyle::JsCamel => ("entryCount", "validationIssues"),
        JsonWireStyle::PythonSnake => ("entry_count", "validation_issues"),
    }
}

/// Keys for [`crate::registry_client::registry_entry_to_json_value`].
pub fn registry_entry_keys(style: JsonWireStyle) -> (&'static str, &'static str) {
    match style {
        JsonWireStyle::JsCamel => ("deprecationNotice", "baseType"),
        JsonWireStyle::PythonSnake => ("deprecation_notice", "base_type"),
    }
}

/// Keys for [`crate::assembler::assembly_result_to_json_value`] provenance rows + root.
pub fn assembly_provenance_keys(style: JsonWireStyle) -> (&'static str, &'static str) {
    match style {
        JsonWireStyle::JsCamel => ("keyPrefix", "assembledFrom"),
        JsonWireStyle::PythonSnake => ("key_prefix", "assembled_from"),
    }
}

/// Parent path key for [`crate::path_utils::definition_item_location_to_json_value`].
pub fn item_location_parent_key(style: JsonWireStyle) -> &'static str {
    match style {
        JsonWireStyle::JsCamel => "parentPath",
        JsonWireStyle::PythonSnake => "parent_path",
    }
}

/// Batch evaluation JSON keys: non-relevant paths, validation `constraintKind`, `shapeId`.
pub fn evaluation_batch_keys(style: JsonWireStyle) -> (&'static str, &'static str, &'static str) {
    match style {
        JsonWireStyle::JsCamel => ("nonRelevant", "constraintKind", "shapeId"),
        JsonWireStyle::PythonSnake => ("non_relevant", "constraint_kind", "shape_id"),
    }
}

/// Envelope marker field name for changelog documents.
/// Identical across wire styles — JSON envelope markers (`$formspec*`) are
/// never translated to snake_case, they're document-type discriminators
/// defined by the schema.
pub const CHANGELOG_MARKER_FIELD: &str = "$formspecChangelog";

/// Value required by `changelog.schema.json` for the marker field (`const: "1.0"`).
pub const CHANGELOG_MARKER_VERSION: &str = "1.0";

/// Top-level changelog object keys for [`crate::json_artifacts::changelog_to_json_value`].
#[allow(missing_docs)]
pub struct ChangelogRootKeys {
    pub marker: &'static str,
    pub marker_version: &'static str,
    pub definition_url: &'static str,
    pub from_version: &'static str,
    pub to_version: &'static str,
    pub semver_impact: &'static str,
}

/// Field names for the changelog root object in the given wire style.
pub fn changelog_root_keys(style: JsonWireStyle) -> ChangelogRootKeys {
    match style {
        JsonWireStyle::JsCamel => ChangelogRootKeys {
            marker: CHANGELOG_MARKER_FIELD,
            marker_version: CHANGELOG_MARKER_VERSION,
            definition_url: "definitionUrl",
            from_version: "fromVersion",
            to_version: "toVersion",
            semver_impact: "semverImpact",
        },
        JsonWireStyle::PythonSnake => ChangelogRootKeys {
            marker: CHANGELOG_MARKER_FIELD,
            marker_version: CHANGELOG_MARKER_VERSION,
            definition_url: "definition_url",
            from_version: "from_version",
            to_version: "to_version",
            semver_impact: "semver_impact",
        },
    }
}

/// Per-change object keys inside changelog JSON.
pub fn changelog_change_keys(style: JsonWireStyle) -> (&'static str, &'static str) {
    match style {
        JsonWireStyle::JsCamel => ("type", "migrationHint"),
        JsonWireStyle::PythonSnake => ("change_type", "migration_hint"),
    }
}

/// Document type field for lint result JSON.
pub fn lint_document_type_key(style: JsonWireStyle) -> &'static str {
    match style {
        JsonWireStyle::JsCamel => "documentType",
        JsonWireStyle::PythonSnake => "document_type",
    }
}
