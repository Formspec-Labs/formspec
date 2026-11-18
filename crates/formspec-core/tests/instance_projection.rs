//! Cross-Definition checks for response-backed instance projections.

use formspec_core::{
    InstanceProjectionCode as Code, check_instance_projection, compatible_version_satisfied,
};
use serde_json::{Value, json};

fn instance() -> Value {
    json!({
        "response": {
            "definition": {"url": "urn:example:report", "compatibleVersions": ">=1.0.0 <2.0.0"},
            "subject": [
                {"key": "uei", "op": "eq", "from": {"subject": "agency"}},
                {"key": "ffy", "op": "eq", "from": {"subject": "year"}, "offset": -1}
            ],
            "status": "completed", "cardinality": "latest", "pin": "none"
        },
        "schema": {"totals.filed": "integer", "rows[*].sites[*].amount": "money"}
    })
}

fn consumer_subject() -> Value {
    json!({"type": "urn:example:program-year", "keys": {
        "agency": {"dataType": "string"}, "year": {"dataType": "integer"}
    }})
}

fn upstream() -> Value {
    json!({
        "$formspec": "1.0", "url": "urn:example:report", "version": "1.0.0", "title": "Report",
        "subject": {"type": "urn:example:agency-year", "keys": {
            "uei": {"dataType": "string"}, "ffy": {"dataType": "integer"}
        }},
        "items": [
            {"key": "totals", "type": "group", "label": "Totals", "children": [
                {"key": "filed", "type": "field", "label": "Filed", "dataType": "integer"}
            ]},
            {"key": "rows", "type": "group", "label": "Rows", "repeatable": true, "children": [
                {"key": "sites", "type": "group", "label": "Sites", "repeatable": true, "children": [
                    {"key": "amount", "type": "field", "label": "Amount", "dataType": "money"}
                ]}
            ]}
        ]
    })
}

#[test]
fn valid_paths_and_subject_keys() {
    let instance = instance();
    assert!(
        check_instance_projection(&instance, Some(&consumer_subject()), &[upstream()]).is_empty()
    );
}

#[test]
fn reports_renamed_paths_in_each_eligible_version() {
    let instance = instance();
    let original = upstream();
    let mut newer = original.clone();
    newer["version"] = json!("1.1.0");
    newer["items"][0]["children"][0]["key"] = json!("renamed");

    let mut outside_range = newer.clone();
    outside_range["version"] = json!("2.0.0");
    let diagnostics = check_instance_projection(
        &instance,
        Some(&consumer_subject()),
        &[outside_range, original, newer],
    );
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, Code::PathMissing);
    assert_eq!(diagnostics[0].json_pointer, "/schema/totals.filed");
    assert_eq!(diagnostics[0].upstream_version.as_deref(), Some("1.1.0"));
}

#[test]
fn reports_wrong_field_type() {
    let mut upstream = upstream();
    upstream["items"][0]["children"][0]["dataType"] = json!("decimal");
    let diagnostics =
        check_instance_projection(&instance(), Some(&consumer_subject()), &[upstream]);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, Code::FieldTypeMismatch);
    assert_eq!(diagnostics[0].json_pointer, "/schema/totals.filed");
}

#[test]
fn requires_a_wildcard_at_each_repeated_group() {
    let mut instance = instance();
    instance["schema"] = json!({
        "rows[*].sites.amount": "money",
        "rows[0].sites[*].amount": "money",
        "totals[*].filed": "integer"
    });
    let diagnostics =
        check_instance_projection(&instance, Some(&consumer_subject()), &[upstream()]);
    assert_eq!(diagnostics.len(), 3);
    assert!(
        diagnostics
            .iter()
            .all(|diagnostic| diagnostic.code == Code::PathMissing)
    );
}

#[test]
fn reports_undeclared_predicate_key() {
    let mut instance = instance();
    instance["response"]["subject"][0]["key"] = json!("unknown");
    let diagnostics =
        check_instance_projection(&instance, Some(&consumer_subject()), &[upstream()]);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, Code::SubjectKeyMissing);
    assert_eq!(diagnostics[0].json_pointer, "/response/subject/0/key");
}

#[test]
fn reports_missing_upstream_subject() {
    let mut upstream = upstream();
    upstream.as_object_mut().unwrap().remove("subject");
    let diagnostics =
        check_instance_projection(&instance(), Some(&consumer_subject()), &[upstream]);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, Code::SubjectMissing);
    assert_eq!(diagnostics[0].json_pointer, "/response/definition");
    assert_eq!(diagnostics[0].upstream_version.as_deref(), Some("1.0.0"));
}

#[test]
fn reports_subject_type_and_key_map_drift_across_eligible_versions() {
    let original = upstream();
    let mut different_type = original.clone();
    different_type["version"] = json!("1.1.0");
    different_type["subject"]["type"] = json!("urn:example:agency");
    let mut different_key_type = original.clone();
    different_key_type["version"] = json!("1.2.0");
    different_key_type["subject"]["keys"]["county"] = json!({"dataType": "integer"});
    let mut outside_range = different_type.clone();
    outside_range["version"] = json!("2.0.0");
    outside_range["subject"]["keys"] = json!({});

    let mut instance = instance();
    instance["response"]["subject"] = json!([
        {"key": "uei", "op": "eq", "from": {"subject": "agency"}}
    ]);
    let diagnostics = check_instance_projection(
        &instance,
        Some(&consumer_subject()),
        &[outside_range, different_key_type, different_type, original],
    );
    assert_eq!(diagnostics.len(), 2);
    for (code, version) in [
        (Code::SubjectTypeMismatch, "1.1.0"),
        (Code::SubjectKeyTypeDrift, "1.2.0"),
    ] {
        let finding = diagnostics
            .iter()
            .find(|finding| finding.code == code)
            .unwrap();
        assert_eq!(finding.json_pointer, "/response/definition");
        assert_eq!(finding.upstream_version.as_deref(), Some(version));
        assert!(finding.message.contains("1.0.0"));
    }
}

#[test]
fn distinguishes_subject_key_type_drift_from_authorization_metadata() {
    let mut original = upstream();
    original["subject"]["keys"]["county"] = json!({"dataType": "string"});
    let mut newer = original.clone();
    newer["version"] = json!("1.1.0");
    newer["subject"]["keys"]["county"]["authorizationParent"] = json!("county");
    let consumer = consumer_subject();
    assert!(
        check_instance_projection(
            &instance(),
            Some(&consumer),
            &[original.clone(), newer.clone()]
        )
        .is_empty()
    );

    newer["subject"]["keys"]["county"]["dataType"] = json!("integer");
    let changed = check_instance_projection(
        &instance(),
        Some(&consumer),
        &[original.clone(), newer.clone()],
    );
    assert_eq!(changed.len(), 1);
    assert_eq!(changed[0].code, Code::SubjectKeyTypeDrift);
    newer["subject"]["keys"]
        .as_object_mut()
        .unwrap()
        .remove("county");
    let removed = check_instance_projection(&instance(), Some(&consumer), &[original, newer]);
    assert_eq!(removed.len(), 1);
    assert_eq!(removed[0].code, Code::SubjectKeyTypeDrift);
}

#[test]
fn reports_incompatible_consumer_key_type_on_equality() {
    let instance = instance();
    let consumer_subject = json!({"type": "urn:example:program-year", "keys": {
        "agency": {"dataType": "integer"}, "year": {"dataType": "integer"}
    }});
    let diagnostics = check_instance_projection(&instance, Some(&consumer_subject), &[upstream()]);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, Code::SubjectKeyTypeMismatch);
    assert_eq!(
        diagnostics[0].json_pointer,
        "/response/subject/0/from/subject"
    );
}

#[test]
fn offset_and_ordering_require_integer_keys() {
    for (op, offset, member) in [
        ("eq", Some(-1), "offset"),
        ("le", None, "op"),
        ("ge", None, "op"),
    ] {
        let mut instance = instance();
        let predicate = &mut instance["response"]["subject"][0];
        predicate["op"] = json!(op);
        if let Some(offset) = offset {
            predicate["offset"] = json!(offset);
        }
        let diagnostics =
            check_instance_projection(&instance, Some(&consumer_subject()), &[upstream()]);
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].code, Code::SubjectIntegerRequired);
        assert_eq!(
            diagnostics[0].json_pointer,
            format!("/response/subject/0/{member}")
        );
    }
}

#[test]
fn accepts_singleton_subject_and_leaves_inline_instances_alone() {
    let mut instance = instance();
    instance["response"]["subject"] = json!([]);
    let mut upstream = upstream();
    upstream["subject"] = json!({"type": "urn:example:singleton", "keys": {}});
    assert!(
        check_instance_projection(&instance, Some(&consumer_subject()), &[upstream]).is_empty()
    );
    assert!(check_instance_projection(&json!({"data": {}}), None, &[]).is_empty());
}

#[test]
fn rejects_malformed_upstream_versions() {
    for version in ["3", "1.0", "garbage", "", "*"] {
        let mut upstream = upstream();
        upstream["version"] = json!(version);
        let diagnostics =
            check_instance_projection(&instance(), Some(&consumer_subject()), &[upstream]);
        assert_eq!(
            diagnostics.first().map(|finding| finding.code),
            Some(Code::VersionInvalid),
            "version {version:?}"
        );
    }
}

#[test]
fn accepts_dependent_sub_question_paths() {
    let mut instance = instance();
    instance["schema"] = json!({"rows[*].answered.detail": "string"});
    let mut upstream = upstream();
    upstream["items"][1]["children"] = json!([{
        "key": "answered", "type": "field", "label": "Answered", "dataType": "boolean",
        "children": [{"key": "detail", "type": "field", "label": "Detail", "dataType": "string"}]
    }]);
    assert!(
        check_instance_projection(&instance, Some(&consumer_subject()), &[upstream]).is_empty()
    );
}

#[test]
fn reports_no_eligible_published_version() {
    let mut outside_range = upstream();
    outside_range["version"] = json!("2.0.0");
    for definitions in [vec![], vec![outside_range]] {
        let findings =
            check_instance_projection(&instance(), Some(&consumer_subject()), &definitions);
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].code, Code::NoEligibleVersion);
        assert_eq!(findings[0].json_pointer, "/response/definition");
        assert_eq!(findings[0].upstream_version, None);
    }
}

#[test]
fn reports_a_definition_url_mismatch_with_its_version() {
    let mut unexpected = upstream();
    unexpected["url"] = json!("urn:example:wrong");
    let diagnostics = check_instance_projection(
        &instance(),
        Some(&consumer_subject()),
        &[upstream(), unexpected],
    );
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, Code::DefinitionMismatch);
    assert_eq!(diagnostics[0].json_pointer, "/response/definition/url");
    assert_eq!(diagnostics[0].upstream_version.as_deref(), Some("1.0.0"));
}

#[test]
fn reports_a_missing_projection_schema() {
    let mut instance = instance();
    instance.as_object_mut().unwrap().remove("schema");
    let diagnostics =
        check_instance_projection(&instance, Some(&consumer_subject()), &[upstream()]);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, Code::SchemaMissing);
    assert_eq!(diagnostics[0].json_pointer, "/schema");
    assert_eq!(diagnostics[0].upstream_version.as_deref(), Some("1.0.0"));
}

#[test]
fn reports_an_invalid_range_even_with_no_published_versions() {
    let mut instance = instance();
    instance["response"]["definition"]["compatibleVersions"] = json!("definitely-not-a-range");
    let diagnostics = check_instance_projection(&instance, Some(&consumer_subject()), &[]);
    assert_eq!(diagnostics.len(), 1);
    assert_eq!(diagnostics[0].code, Code::VersionInvalid);
    assert_eq!(
        diagnostics[0].json_pointer,
        "/response/definition/compatibleVersions"
    );
    assert_eq!(diagnostics[0].upstream_version, None);
}

#[test]
fn reports_malformed_version_without_a_range_and_keeps_checking_valid_versions() {
    let mut instance = instance();
    instance["response"]["definition"]
        .as_object_mut()
        .unwrap()
        .remove("compatibleVersions");
    let mut invalid = upstream();
    invalid["version"] = json!("garbage");
    let mut newer = upstream();
    newer["version"] = json!("2.0.0");
    newer["items"][0]["children"][0]["key"] = json!("renamed");
    let findings = check_instance_projection(
        &instance,
        Some(&consumer_subject()),
        &[upstream(), invalid, newer],
    );
    assert_eq!(findings.len(), 2);
    assert_eq!(findings[0].code, Code::VersionInvalid);
    assert_eq!(findings[0].upstream_version.as_deref(), Some("garbage"));
    assert_eq!(findings[1].code, Code::PathMissing);
    assert_eq!(findings[1].upstream_version.as_deref(), Some("2.0.0"));
}

#[test]
fn shared_matcher_rejects_invalid_versions_and_includes_prereleases() {
    for version in ["3", "1.0", "garbage", "", "*"] {
        assert_eq!(
            compatible_version_satisfied("<2.0.0", version),
            None,
            "{version:?}"
        );
    }
    assert_eq!(
        compatible_version_satisfied(">=1.0.0 <2.0.0", "2.0.0-rc.1"),
        Some(true)
    );
    assert_eq!(
        compatible_version_satisfied(">=1.0.0 <2.0.0", "2.0.0"),
        Some(false)
    );

    let mut prerelease = upstream();
    prerelease["version"] = json!("2.0.0-rc.1");
    assert!(
        check_instance_projection(&instance(), Some(&consumer_subject()), &[prerelease]).is_empty()
    );
}

#[test]
fn catalog_route_parameters_need_no_consumer_subject() {
    let mut instance = instance();
    let upstream = [upstream()];
    let findings = check_instance_projection(&instance, None, &upstream);
    assert_eq!(findings.len(), 2);
    assert!(
        findings
            .iter()
            .all(|finding| finding.code == Code::SubjectKeyMissing)
    );
    instance["response"]["subject"][0]["from"] = json!({"routeParam": "agency"});
    instance["response"]["subject"][1]["from"] = json!({"routeParam": "year"});
    assert!(check_instance_projection(&instance, None, &upstream).is_empty());
}
