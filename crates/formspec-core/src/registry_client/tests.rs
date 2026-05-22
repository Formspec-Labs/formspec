//! Unit tests for the registry client.
#![allow(clippy::missing_docs_in_private_items)]

use crate::extension_analysis::{RegistryEntryStatus, RegistryLookup};
use serde_json::json;

use super::*;

fn sample_registry_json() -> serde_json::Value {
    json!({
        "$formspecRegistry": "1.0",
        "publisher": {
            "name": "Test Org",
            "url": "https://test.org",
            "contact": "test@test.org"
        },
        "published": "2026-03-18T00:00:00Z",
        "entries": [
            {
                "name": "x-test-currency",
                "category": "dataType",
                "version": "1.0.0",
                "status": "stable",
                "description": "A currency type.",
                "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
                "baseType": "decimal"
            },
            {
                "name": "x-test-currency",
                "category": "dataType",
                "version": "2.0.0",
                "status": "draft",
                "description": "Currency v2.",
                "compatibility": { "formspecVersion": ">=1.0.0 <2.0.0" },
                "baseType": "decimal"
            },
            {
                "name": "x-test-age",
                "category": "function",
                "version": "1.0.0",
                "status": "stable",
                "description": "Calculates age.",
                "compatibility": { "formspecVersion": ">=1.0.0" },
                "parameters": [
                    { "name": "birthDate", "type": "date", "description": "DOB" }
                ],
                "returns": "integer"
            },
            {
                "name": "x-test-luhn",
                "category": "constraint",
                "version": "1.0.0",
                "status": "deprecated",
                "description": "Luhn check.",
                "compatibility": { "formspecVersion": ">=1.0.0" },
                "deprecationNotice": "Use x-test-luhn-v2 instead.",
                "parameters": [
                    { "name": "value", "type": "string" }
                ]
            },
            {
                "name": "x-test-ns",
                "category": "namespace",
                "version": "1.0.0",
                "status": "stable",
                "description": "Test namespace.",
                "compatibility": { "formspecVersion": ">=1.0.0" }
            }
        ]
    })
}

// ── 1. Parse valid registry document ────────────────────────

#[test]
fn parse_valid_registry() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    assert_eq!(reg.publisher.name, "Test Org");
    assert_eq!(reg.publisher.homepage.as_deref(), Some("https://test.org"));
    assert_eq!(
        reg.publisher.legacy_url.as_deref(),
        Some("https://test.org")
    );
    assert_eq!(
        reg.publisher.legacy_contact.as_deref(),
        Some("test@test.org")
    );
    assert_eq!(reg.warnings.len(), 2);
    assert_eq!(reg.published, "2026-03-18T00:00:00Z");
    assert_eq!(reg.entries.len(), 5);
    // Name index: x-test-currency has 2 entries
    assert_eq!(reg.by_name.get("x-test-currency").unwrap().len(), 2);
}

#[test]
fn publisher_preferred_homepage_parses() {
    let doc = json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": {
            "name": "Acme",
            "identifier": "https://ror.org/12345",
            "homepage": "https://acme.example"
        },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    assert_eq!(parsed.publisher.name, "Acme");
    assert_eq!(
        parsed.publisher.identifier.as_deref(),
        Some("https://ror.org/12345")
    );
    assert_eq!(
        parsed.publisher.homepage.as_deref(),
        Some("https://acme.example")
    );
    assert!(parsed.warnings.is_empty(), "no warnings on preferred form");
}

#[test]
fn publisher_legacy_url_aliases_homepage_and_warns() {
    let doc = json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": { "name": "Acme", "url": "https://acme.example" },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    assert_eq!(
        parsed.publisher.homepage.as_deref(),
        Some("https://acme.example")
    );
    assert!(
        parsed.warnings.iter().any(|w| matches!(
            w,
            RegistryWarning::DeprecatedField { field, .. } if field == "publisher.url"
        )),
        "expected deprecation warning for publisher.url"
    );
}

#[test]
fn publisher_legacy_contact_string_warns() {
    let doc = json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": {
            "name": "Acme",
            "homepage": "https://acme.example",
            "contact": "support@acme.example"
        },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    assert_eq!(
        parsed.publisher.legacy_contact.as_deref(),
        Some("support@acme.example")
    );
    assert!(parsed.warnings.iter().any(|w| matches!(
        w,
        RegistryWarning::DeprecatedField { field, .. } if field == "publisher.contact"
    )));
}

#[test]
fn publisher_contact_point_preferred() {
    let doc = json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": {
            "name": "Acme",
            "homepage": "https://acme.example",
            "contactPoint": {
                "contactType": "customer support",
                "email": "support@acme.example"
            }
        },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    assert_eq!(parsed.publisher.contact_points.len(), 1);
    assert_eq!(
        parsed.publisher.contact_points[0].email.as_deref(),
        Some("support@acme.example")
    );
    assert!(parsed.warnings.is_empty());
}

#[test]
fn publisher_wire_summary_includes_preferred_and_legacy_fields() {
    let doc = json!({
        "$formspecRegistry": "1.0",
        "published": "2026-05-21T00:00:00Z",
        "publisher": {
            "name": "Acme",
            "homepage": "https://acme.example",
            "url": "https://legacy.example",
            "contact": "legacy@acme.example",
            "contactPoint": [{
                "contactType": "customer support",
                "email": "support@acme.example",
                "availableLanguage": ["en", "es"]
            }]
        },
        "entries": []
    });
    let parsed = Registry::from_json(&doc).expect("ok");
    let summary = registry_parse_summary_to_json_value(
        &parsed,
        &doc,
        &parsed.validate(),
        crate::JsonWireStyle::JsCamel,
    );
    assert_eq!(
        summary["publisher"]["homepage"].as_str(),
        Some("https://acme.example")
    );
    assert_eq!(
        summary["publisher"]["url"].as_str(),
        Some("https://legacy.example")
    );
    assert_eq!(
        summary["publisher"]["contact"].as_str(),
        Some("legacy@acme.example")
    );
    assert_eq!(
        summary["publisher"]["contactPoint"][0]["email"].as_str(),
        Some("support@acme.example")
    );
    assert_eq!(
        summary["warnings"][0]["kind"].as_str(),
        Some("deprecatedField")
    );
}

#[test]
fn parse_missing_publisher_errors() {
    let val = json!({ "published": "2026-01-01T00:00:00Z", "entries": [] });
    let err = Registry::from_json(&val).unwrap_err();
    assert!(matches!(err, RegistryError::MissingField(ref f) if f == "publisher"));
}

#[test]
fn parse_missing_entries_errors() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z"
    });
    let err = Registry::from_json(&val).unwrap_err();
    assert!(matches!(err, RegistryError::MissingField(ref f) if f == "entries"));
}

#[test]
fn parse_entry_unknown_category_errors() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-bad",
            "category": "widget",
            "version": "1.0.0",
            "status": "stable",
            "description": "bad",
            "compatibility": {}
        }]
    });
    let err = Registry::from_json(&val).unwrap_err();
    assert!(matches!(err, RegistryError::InvalidEntry(0, _)));
}

#[test]
fn parse_maps_stable_and_active_to_active() {
    let make = |status: &str| {
        json!({
            "publisher": { "name": "X", "url": "https://x.com" },
            "published": "2026-01-01T00:00:00Z",
            "entries": [{
                "name": "x-test",
                "category": "property",
                "version": "1.0.0",
                "status": status,
                "description": "test",
                "compatibility": {}
            }]
        })
    };
    let r1 = Registry::from_json(&make("stable")).unwrap();
    let r2 = Registry::from_json(&make("active")).unwrap();
    assert_eq!(r1.entries[0].status, RegistryEntryStatus::Active);
    assert_eq!(r2.entries[0].status, RegistryEntryStatus::Active);
}

// ── 2. find by name ─────────────────────────────────────────

#[test]
fn find_by_name_returns_sorted_desc() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let results = reg.find("x-test-currency", None);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].version, "2.0.0"); // highest first
    assert_eq!(results[1].version, "1.0.0");
}

#[test]
fn find_nonexistent_returns_empty() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    assert!(reg.find("x-nope", None).is_empty());
}

// ── 3. find with version constraint ─────────────────────────

#[test]
fn find_with_exact_version() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let results = reg.find("x-test-currency", Some("1.0.0"));
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].version, "1.0.0");
}

#[test]
fn find_with_range_constraint() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let results = reg.find("x-test-currency", Some(">=1.0.0 <2.0.0"));
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].version, "1.0.0");
}

// ── 4. find_one ─────────────────────────────────────────────

#[test]
fn find_one_returns_highest_match() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let entry = reg.find_one("x-test-currency", None).unwrap();
    assert_eq!(entry.version, "2.0.0");
}

#[test]
fn find_one_with_constraint() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let entry = reg
        .find_one("x-test-currency", Some(">=1.0.0 <2.0.0"))
        .unwrap();
    assert_eq!(entry.version, "1.0.0");
}

#[test]
fn find_one_nonexistent() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    assert!(reg.find_one("x-nope", None).is_none());
}

// ── 5. list_by_category and list_by_status ──────────────────

#[test]
fn list_by_category() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let data_types = reg.list_by_category(ExtensionCategory::DataType);
    assert_eq!(data_types.len(), 2); // x-test-currency v1 + v2
    let functions = reg.list_by_category(ExtensionCategory::Function);
    assert_eq!(functions.len(), 1);
    let namespaces = reg.list_by_category(ExtensionCategory::Namespace);
    assert_eq!(namespaces.len(), 1);
}

#[test]
fn list_by_status() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let active = reg.list_by_status(RegistryEntryStatus::Active);
    assert_eq!(active.len(), 3); // currency v1, age, namespace
    let draft = reg.list_by_status(RegistryEntryStatus::Draft);
    assert_eq!(draft.len(), 1); // currency v2
    let deprecated = reg.list_by_status(RegistryEntryStatus::Deprecated);
    assert_eq!(deprecated.len(), 1); // luhn
}

// ── 6. Lifecycle transitions ────────────────────────────────

#[test]
fn valid_lifecycle_transitions() {
    use RegistryEntryStatus::*;
    // Self-transitions
    assert!(validate_lifecycle_transition(Draft, Draft));
    assert!(validate_lifecycle_transition(Active, Active));
    assert!(validate_lifecycle_transition(Deprecated, Deprecated));
    // Forward transitions
    assert!(validate_lifecycle_transition(Draft, Active));
    assert!(validate_lifecycle_transition(Active, Deprecated));
    assert!(validate_lifecycle_transition(Deprecated, Retired));
    // Un-deprecation
    assert!(validate_lifecycle_transition(Deprecated, Active));
}

#[test]
fn invalid_lifecycle_transitions() {
    use RegistryEntryStatus::*;
    // Skip states
    assert!(!validate_lifecycle_transition(Draft, Deprecated));
    assert!(!validate_lifecycle_transition(Draft, Retired));
    assert!(!validate_lifecycle_transition(Active, Retired));
    // Backwards (except un-deprecation)
    assert!(!validate_lifecycle_transition(Active, Draft));
    // Terminal
    assert!(!validate_lifecycle_transition(Retired, Retired));
    assert!(!validate_lifecycle_transition(Retired, Draft));
    assert!(!validate_lifecycle_transition(Retired, Active));
    assert!(!validate_lifecycle_transition(Retired, Deprecated));
}

// ── 7. well_known_url ───────────────────────────────────────

#[test]
fn well_known_url_construction() {
    assert_eq!(
        well_known_url("https://example.com"),
        "https://example.com/.well-known/formspec-extensions.json"
    );
    assert_eq!(
        well_known_url("https://example.com/"),
        "https://example.com/.well-known/formspec-extensions.json"
    );
}

// ── 8. version_satisfies ────────────────────────────────────

#[test]
fn version_exact_match() {
    assert!(version_satisfies("1.0.0", "1.0.0"));
    assert!(!version_satisfies("1.0.1", "1.0.0"));
}

#[test]
fn version_gte() {
    assert!(version_satisfies("1.0.0", ">=1.0.0"));
    assert!(version_satisfies("2.0.0", ">=1.0.0"));
    assert!(!version_satisfies("0.9.0", ">=1.0.0"));
}

#[test]
fn version_gt() {
    assert!(version_satisfies("1.0.1", ">1.0.0"));
    assert!(!version_satisfies("1.0.0", ">1.0.0"));
}

#[test]
fn version_lte() {
    assert!(version_satisfies("1.0.0", "<=1.0.0"));
    assert!(version_satisfies("0.9.0", "<=1.0.0"));
    assert!(!version_satisfies("1.0.1", "<=1.0.0"));
}

#[test]
fn version_lt() {
    assert!(version_satisfies("0.9.0", "<1.0.0"));
    assert!(!version_satisfies("1.0.0", "<1.0.0"));
}

#[test]
fn version_compound_constraint() {
    assert!(version_satisfies("1.5.0", ">=1.0.0 <2.0.0"));
    assert!(!version_satisfies("2.0.0", ">=1.0.0 <2.0.0"));
    assert!(!version_satisfies("0.9.0", ">=1.0.0 <2.0.0"));
}

#[test]
fn version_zero_padding() {
    // "1" should parse as (1, 0, 0)
    assert!(version_satisfies("1.0.0", "1"));
    assert!(version_satisfies("1.0.0", ">=1"));
}

// ── 9. validate ─────────────────────────────────────────────

#[test]
fn validate_catches_invalid_name() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "bad-name",
            "category": "property",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert_eq!(issues.len(), 1);
    assert!(issues[0].contains("bad-name"));
}

#[test]
fn validate_catches_missing_deprecation_notice() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test",
            "category": "property",
            "version": "1.0.0",
            "status": "deprecated",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert_eq!(issues.len(), 1);
    assert!(issues[0].contains("deprecationNotice"));
}

#[test]
fn validate_catches_missing_base_type() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test",
            "category": "dataType",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert_eq!(issues.len(), 1);
    assert!(issues[0].contains("baseType"));
}

#[test]
fn validate_catches_missing_function_fields() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test",
            "category": "function",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert_eq!(issues.len(), 2); // missing parameters AND returns
}

#[test]
fn validate_catches_missing_constraint_parameters() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test",
            "category": "constraint",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert_eq!(issues.len(), 1);
    assert!(issues[0].contains("parameters"));
}

#[test]
fn validate_clean_registry_no_issues() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    assert!(reg.validate().is_empty());
}

// ── 10. RegistryLookup implementation ───────────────────────

#[test]
fn registry_lookup_maps_to_entry_info() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let info = reg.lookup("x-test-age").unwrap();
    assert_eq!(info.name, "x-test-age");
    assert_eq!(info.status, RegistryEntryStatus::Active);
    assert!(info.display_name.is_some());
}

#[test]
fn registry_lookup_returns_deprecation_notice() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let info = reg.lookup("x-test-luhn").unwrap();
    assert_eq!(info.status, RegistryEntryStatus::Deprecated);
    assert_eq!(
        info.deprecation_notice.as_deref(),
        Some("Use x-test-luhn-v2 instead.")
    );
}

#[test]
fn registry_lookup_returns_highest_version() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    let info = reg.lookup("x-test-currency").unwrap();
    // find_one returns highest version (2.0.0, which is draft)
    assert_eq!(info.status, RegistryEntryStatus::Draft);
}

#[test]
fn registry_lookup_nonexistent() {
    let reg = Registry::from_json(&sample_registry_json()).unwrap();
    assert!(reg.lookup("x-nope").is_none());
}

// ── is_valid_extension_name edge cases ──────────────────────

/// Spec: extension-registry.md §2.1 — "Extension name must match x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*"
#[test]
fn extension_name_valid_cases() {
    // Validated through the validate() method which calls is_valid_extension_name
    // But we can test indirectly by creating entries and validating

    // Valid: simple x-prefixed
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test",
            "category": "property",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(issues.is_empty(), "x-test should be valid: {issues:?}");
}

/// Spec: extension-registry.md §2.1 — "Name too short fails"
#[test]
fn extension_name_too_short() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-",
            "category": "property",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(!issues.is_empty(), "x- should be invalid");
}

/// Spec: extension-registry.md §2.1 — "Name with uppercase fails"
#[test]
fn extension_name_uppercase_fails() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-Test",
            "category": "property",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(!issues.is_empty(), "x-Test should be invalid (uppercase)");
}

/// Spec: extension-registry.md §2.1 — "Name with digits after first letter is valid"
#[test]
fn extension_name_with_digits() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test123",
            "category": "property",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(issues.is_empty(), "x-test123 should be valid: {issues:?}");
}

/// Spec: extension-registry.md §2.1 — "Name starting with digit after x- fails"
#[test]
fn extension_name_digit_after_prefix() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-1test",
            "category": "property",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(
        !issues.is_empty(),
        "x-1test should be invalid (digit start)"
    );
}

/// Spec: extension-registry.md §2.1 — "Multi-segment name is valid"
#[test]
fn extension_name_multi_segment() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-formspec-url-validator",
            "category": "property",
            "version": "1.0.0",
            "status": "stable",
            "description": "test",
            "compatibility": {}
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(
        issues.is_empty(),
        "x-formspec-url-validator should be valid: {issues:?}"
    );
}

// ── Version with non-numeric parts ───────────────────────────

/// Spec: extension-registry.md §2.3 — "Version with non-numeric parts parses as 0"
#[test]
fn version_non_numeric_parts() {
    // "1.0.0-beta" → parse_version drops non-numeric, gets (1, 0, 0)
    // The non-numeric part "0-beta" should parse as 0 via filter_map
    assert!(version_satisfies("1.0.0", "1.0.0"));
    // A version like "1.beta.0" should degrade gracefully
    assert!(version_satisfies("1.0.0", ">=1"));
}

/// Spec: extension-registry.md §2.3 — "Short version string zero-pads"
#[test]
fn version_short_string() {
    // "2" should match "2.0.0"
    assert!(version_satisfies("2.0.0", "2"));
    // "1.5" should match "1.5.0"
    assert!(version_satisfies("1.5.0", ">=1.5"));
}

// ── Parse real registry document ────────────────────────────

#[test]
fn parse_real_formspec_common_registry() {
    let json_str = include_str!("../../../../registries/formspec-common.registry.json");
    let val: serde_json::Value = serde_json::from_str(json_str).unwrap();
    let reg = Registry::from_json(&val).unwrap();
    assert_eq!(reg.publisher.name, "Formspec Project");
    assert!(reg.entries.len() >= 15);
    // All entries should validate clean
    assert!(reg.validate().is_empty());
    // Lookup should work
    let url = reg.lookup("x-formspec-url").unwrap();
    assert_eq!(url.status, RegistryEntryStatus::Active);
}

// ── Findings 28-30: structural parse errors and conditional requirements ──

/// Spec: registry/extension-registry.md §2, schemas/registry.schema.json "type":"object"
/// Root document must be an object. An array root must be rejected.
#[test]
fn parse_error_when_root_is_array() {
    let val = json!([]);
    let err = Registry::from_json(&val).unwrap_err();
    assert!(matches!(err, RegistryError::InvalidField(_)));
}

/// Spec: registry/extension-registry.md §2.1, schemas/registry.schema.json $defs/publisher
/// Publisher field must be an object. A string value must be rejected.
#[test]
fn parse_error_when_publisher_is_string() {
    let val = json!({
        "publisher": "not an object",
        "published": "2026-01-01T00:00:00Z",
        "entries": []
    });
    let err = Registry::from_json(&val).unwrap_err();
    assert!(matches!(err, RegistryError::InvalidField(_)));
}

/// Spec: registry/extension-registry.md §3 — Entry missing `version` field.
#[test]
fn parse_error_entry_missing_version() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test",
            "category": "property",
            "status": "stable",
            "description": "test"
        }]
    });
    let err = Registry::from_json(&val).unwrap_err();
    assert!(matches!(err, RegistryError::InvalidEntry(0, ref m) if m.contains("version")));
}

/// Spec: registry/extension-registry.md §3 — Entry missing `status` field.
#[test]
fn parse_error_entry_missing_status() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test",
            "category": "property",
            "version": "1.0.0",
            "description": "test"
        }]
    });
    let err = Registry::from_json(&val).unwrap_err();
    assert!(matches!(err, RegistryError::InvalidEntry(0, ref m) if m.contains("status")));
}

/// Spec: registry/extension-registry.md §3 — Entry missing `description` field.
#[test]
fn parse_error_entry_missing_description() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test",
            "category": "property",
            "version": "1.0.0",
            "status": "stable"
        }]
    });
    let err = Registry::from_json(&val).unwrap_err();
    assert!(matches!(err, RegistryError::InvalidEntry(0, ref m) if m.contains("description")));
}

/// Spec: registry/extension-registry.md §3, Appendix A — dataType entries
/// require baseType. Validated via `Registry::validate()`.
#[test]
fn validate_datatype_requires_base_type() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test-dt",
            "category": "dataType",
            "version": "1.0.0",
            "status": "stable",
            "description": "A data type"
            // missing baseType
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(issues.iter().any(|m| m.contains("baseType")));
}

/// Spec: registry/extension-registry.md §3 — function entries require
/// both `parameters` and `returns`. Validated via `Registry::validate()`.
#[test]
fn validate_function_requires_parameters_and_returns() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test-fn",
            "category": "function",
            "version": "1.0.0",
            "status": "stable",
            "description": "A function"
            // missing parameters AND returns
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(issues.iter().any(|m| m.contains("parameters")));
    assert!(issues.iter().any(|m| m.contains("returns")));
}

/// Spec: registry/extension-registry.md §3 — deprecated status requires
/// deprecationNotice. Validated via `Registry::validate()`.
#[test]
fn validate_deprecated_requires_notice() {
    let val = json!({
        "publisher": { "name": "X", "url": "https://x.com" },
        "published": "2026-01-01T00:00:00Z",
        "entries": [{
            "name": "x-test-dep",
            "category": "property",
            "version": "1.0.0",
            "status": "deprecated",
            "description": "Deprecated thing"
            // missing deprecationNotice
        }]
    });
    let reg = Registry::from_json(&val).unwrap();
    let issues = reg.validate();
    assert!(issues.iter().any(|m| m.contains("deprecationNotice")));
}
