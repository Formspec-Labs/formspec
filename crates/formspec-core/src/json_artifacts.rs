//! `serde_json::Value` projections for WASM and Python FFI (use with `json_to_python` on the Py side).
//!
//! Private `*_str` helpers stringify changelog enums; `change_to_object` builds each change row.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::{Value, json};

use crate::changelog::{Change, ChangeImpact, ChangeTarget, ChangeType, Changelog, SemverImpact};
use crate::extension_analysis::ExtensionUsageIssue;
use crate::wire_keys::{JsonWireStyle, changelog_change_keys, changelog_root_keys};

fn semver_impact_str(i: SemverImpact) -> &'static str {
    match i {
        SemverImpact::Patch => "patch",
        SemverImpact::Minor => "minor",
        SemverImpact::Major => "major",
    }
}

fn change_type_str(ct: &ChangeType) -> &'static str {
    match ct {
        ChangeType::Added => "added",
        ChangeType::Removed => "removed",
        ChangeType::Modified => "modified",
    }
}

fn change_target_str(t: &ChangeTarget) -> &'static str {
    match t {
        ChangeTarget::Item => "item",
        ChangeTarget::Bind => "bind",
        ChangeTarget::Shape => "shape",
        ChangeTarget::OptionSet => "optionSet",
        ChangeTarget::DataSource => "dataSource",
        ChangeTarget::Screener => "screener",
        ChangeTarget::Migration => "migration",
        ChangeTarget::Metadata => "metadata",
    }
}

fn change_impact_str(i: ChangeImpact) -> &'static str {
    match i {
        ChangeImpact::Cosmetic => "cosmetic",
        ChangeImpact::Compatible => "compatible",
        ChangeImpact::Breaking => "breaking",
    }
}

fn change_to_object(c: &Change, style: JsonWireStyle) -> Value {
    let (type_key, migration_key) = changelog_change_keys(style);
    let mut m = serde_json::Map::new();
    m.insert(type_key.to_string(), json!(change_type_str(&c.change_type)));
    m.insert("target".to_string(), json!(change_target_str(&c.target)));
    m.insert("path".to_string(), json!(c.path));
    m.insert("impact".to_string(), json!(change_impact_str(c.impact)));
    // `key`, `description`, and `migrationHint` are declared as
    // `type: "string"` in `changelog.schema.json` with
    // `additionalProperties: false` on the Change object — emitting `null`
    // would fail schema validation. Since each is optional, absence is the
    // correct encoding when the Rust `Option<String>` is `None`.
    if let Some(key) = &c.key {
        m.insert("key".to_string(), json!(key));
    }
    if let Some(description) = &c.description {
        m.insert("description".to_string(), json!(description));
    }
    // `before`/`after` have no type constraint in the schema — null is fine.
    m.insert("before".to_string(), json!(c.before));
    m.insert("after".to_string(), json!(c.after));
    if let Some(hint) = &c.migration_hint {
        m.insert(migration_key.to_string(), json!(hint));
    }
    Value::Object(m)
}

/// Serialize a generated changelog for FFI consumers.
///
/// Emits `$formspecChangelog: "1.0"` as the first key so
/// `detect_document_type` can classify the output and the linter can
/// validate it against `changelog.schema.json` without tripping E100.
/// The marker field name is identical across wire styles — JSON envelope
/// markers are schema-level discriminators, not translated identifiers.
pub fn changelog_to_json_value(result: &Changelog, style: JsonWireStyle) -> Value {
    let k = changelog_root_keys(style);
    let mut m = serde_json::Map::new();
    m.insert(k.marker.to_string(), json!(k.marker_version));
    m.insert(k.definition_url.to_string(), json!(result.definition_url));
    m.insert(k.from_version.to_string(), json!(result.from_version));
    m.insert(k.to_version.to_string(), json!(result.to_version));
    m.insert(
        k.semver_impact.to_string(),
        json!(semver_impact_str(result.semver_impact)),
    );
    m.insert(
        "changes".to_string(),
        Value::Array(
            result
                .changes
                .iter()
                .map(|c| change_to_object(c, style))
                .collect(),
        ),
    );
    Value::Object(m)
}

/// Serialize extension usage validation issues (camelCase keys for JS).
pub fn extension_usage_issues_to_json_value(issues: &[ExtensionUsageIssue]) -> Value {
    Value::Array(
        issues
            .iter()
            .map(|issue| {
                json!({
                    "path": issue.path,
                    "extension": issue.extension,
                    "severity": issue.severity.as_wire_str(),
                    "code": issue.code.as_wire_str(),
                    "message": issue.message,
                })
            })
            .collect(),
    )
}
