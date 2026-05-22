//! Pass 9: Issuer semantic checks.
#![allow(clippy::missing_docs_in_private_items)]

use serde_json::Value;

use crate::semantic_helpers::warning;
use crate::types::LintDiagnostic;

pub(crate) const PASS: u8 = 9;

pub(crate) fn lint_issuer(doc: &Value) -> Vec<LintDiagnostic> {
    let mut diagnostics = Vec::new();
    let kind = doc.get("kind").and_then(Value::as_str);
    let has_parent = doc.get("parentOrganization").is_some();

    if kind == Some("department") && !has_parent {
        diagnostics.push(warning(
            crate::LintCode::W1600,
            PASS,
            "$.parentOrganization",
            "Issuer kind department should declare parentOrganization",
        ));
    }

    if kind == Some("individual") && has_parent {
        diagnostics.push(warning(
            crate::LintCode::W1600,
            PASS,
            "$.parentOrganization",
            "Issuer kind individual should not declare parentOrganization",
        ));
    }

    diagnostics
}

#[cfg(test)]
mod tests {
    #![allow(clippy::missing_docs_in_private_items)]

    use serde_json::json;

    use super::*;

    #[test]
    fn department_without_parent_warns() {
        let issuer = json!({
            "$formspecIssuer": "1.0",
            "url": "https://example.com/issuers/department.json",
            "version": "1.0.0",
            "name": "Department",
            "kind": "department"
        });

        let diagnostics = lint_issuer(&issuer);

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, crate::LintCode::W1600);
        assert_eq!(diagnostics[0].path, "$.parentOrganization");
    }

    #[test]
    fn individual_with_parent_warns() {
        let issuer = json!({
            "$formspecIssuer": "1.0",
            "url": "https://example.com/issuers/individual.json",
            "version": "1.0.0",
            "name": "Individual",
            "kind": "individual",
            "parentOrganization": "https://example.com/issuers/org.json"
        });

        let diagnostics = lint_issuer(&issuer);

        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, crate::LintCode::W1600);
        assert_eq!(diagnostics[0].path, "$.parentOrganization");
    }

    #[test]
    fn organization_without_parent_does_not_warn() {
        let issuer = json!({
            "$formspecIssuer": "1.0",
            "url": "https://example.com/issuers/org.json",
            "version": "1.0.0",
            "name": "Organization",
            "kind": "organization"
        });

        assert!(lint_issuer(&issuer).is_empty());
    }
}
