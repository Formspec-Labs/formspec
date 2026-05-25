//! ADR 0150 §4.4/§5.4 posture admission matchers — Rust authority for lint;
//! semantics mirrored in `packages/formspec-app-graph/src/posture-admission.ts`.

use serde_json::Value;

/// Parsed module reference fields used by posture admission.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModuleRefFields {
    /// Module URN id.
    pub id: String,
    /// Semver string on the document/posture entry.
    pub version: String,
    /// Optional publisher URI asserted on the document side.
    pub publisher: Option<String>,
    /// Optional digest pin asserted on the document side.
    pub lock_hash: Option<String>,
}

/// Why a document module failed posture admission.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModulePostureAdmissionFailure {
    /// No posture entry matched the document module id.
    NotListed,
    /// Id matched an entry but a populated posture field differed.
    FieldMismatch(&'static str),
}

/// Evaluate whether `document_module` is admitted by posture `allowed_modules`.
///
/// When `allowed_modules` is empty, admission is permissive (no posture constraint).
pub fn evaluate_module_posture_admission(
    document_module: &ModuleRefFields,
    allowed_modules: &[ModuleRefFields],
) -> Result<(), ModulePostureAdmissionFailure> {
    if allowed_modules.is_empty() {
        return Ok(());
    }

    for posture_entry in allowed_modules {
        match posture_entry_field_mismatch(posture_entry, document_module) {
            PostureCompare::IdMismatch => continue,
            PostureCompare::Match => return Ok(()),
            PostureCompare::FieldMismatch(field) => {
                return Err(ModulePostureAdmissionFailure::FieldMismatch(field));
            }
        }
    }

    Err(ModulePostureAdmissionFailure::NotListed)
}

enum PostureCompare {
    IdMismatch,
    Match,
    FieldMismatch(&'static str),
}

fn posture_entry_field_mismatch(
    posture_entry: &ModuleRefFields,
    document_module: &ModuleRefFields,
) -> PostureCompare {
    if posture_entry.id != document_module.id {
        return PostureCompare::IdMismatch;
    }
    if posture_entry.version != document_module.version {
        return PostureCompare::FieldMismatch("version");
    }
    if let Some(expected) = &posture_entry.publisher {
        if document_module.publisher.as_deref() != Some(expected.as_str()) {
            return PostureCompare::FieldMismatch("publisher");
        }
    }
    if let Some(expected) = &posture_entry.lock_hash {
        if document_module.lock_hash.as_deref() != Some(expected.as_str()) {
            return PostureCompare::FieldMismatch("lockHash");
        }
    }
    PostureCompare::Match
}

/// Binary actor URN admission per ADR 0150 §5.4.
pub fn evaluate_actor_posture_admission(actor_urn: &str, allowed_actors: &[String]) -> bool {
    if allowed_actors.is_empty() {
        return true;
    }
    allowed_actors.iter().any(|allowed| allowed == actor_urn)
}

/// Parse a JSON `ModuleRef` object for posture checks.
pub fn module_ref_fields_from_value(value: &Value) -> Option<ModuleRefFields> {
    let id = value.get("id")?.as_str()?.to_string();
    let version = value.get("version")?.as_str()?.to_string();
    Some(ModuleRefFields {
        id,
        version,
        publisher: value
            .get("publisher")
            .and_then(Value::as_str)
            .map(str::to_string),
        lock_hash: value
            .get("lockHash")
            .and_then(Value::as_str)
            .map(str::to_string),
    })
}

/// Parse posture `allowedModules[]` from a posture-declaration document.
pub fn allowed_modules_from_posture(posture: &Value) -> Vec<ModuleRefFields> {
    posture
        .get("allowedModules")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(module_ref_fields_from_value)
                .collect()
        })
        .unwrap_or_default()
}

/// Parse posture `allowedActors[]` URNs.
pub fn allowed_actors_from_posture(posture: &Value) -> Vec<String> {
    posture
        .get("allowedActors")
        .and_then(Value::as_array)
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]

    use super::*;

    fn module(id: &str, version: &str) -> ModuleRefFields {
        ModuleRefFields {
            id: id.to_string(),
            version: version.to_string(),
            publisher: None,
            lock_hash: None,
        }
    }

    #[test]
    fn absent_posture_allowlist_is_permissive() {
        let doc = module("x-a", "1.0.0");
        assert!(evaluate_module_posture_admission(&doc, &[]).is_ok());
    }

    #[test]
    fn posture_id_version_admits_extra_document_provenance() {
        let doc = ModuleRefFields {
            publisher: Some("https://example.org/".to_string()),
            lock_hash: Some("sha256:abc".to_string()),
            ..module("x-a", "1.0.0")
        };
        let allowed = vec![module("x-a", "1.0.0")];
        assert!(evaluate_module_posture_admission(&doc, &allowed).is_ok());
    }

    #[test]
    fn posture_lock_hash_mismatch_denies() {
        let doc = ModuleRefFields {
            lock_hash: Some("sha256:module".to_string()),
            ..module("x-a", "1.0.0")
        };
        let allowed = vec![ModuleRefFields {
            lock_hash: Some("sha256:other".to_string()),
            ..module("x-a", "1.0.0")
        }];
        assert_eq!(
            evaluate_module_posture_admission(&doc, &allowed),
            Err(ModulePostureAdmissionFailure::FieldMismatch("lockHash"))
        );
    }

    #[test]
    fn module_id_not_in_allowlist_denies() {
        let doc = module("x-other", "1.0.0");
        let allowed = vec![module("x-a", "1.0.0")];
        assert_eq!(
            evaluate_module_posture_admission(&doc, &allowed),
            Err(ModulePostureAdmissionFailure::NotListed)
        );
    }
}
