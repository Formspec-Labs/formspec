//! Cross-Definition checks for response-backed instance projections.

use formspec_core::{InstanceProjectionCode as Code, compatible_version_satisfied};
use serde_json::{Value, json};

// These fixtures exercise path and predicate validation independent of consumer items.
fn check_instance_projection(
    instance: &Value,
    subject: Option<&Value>,
    upstream: &[Value],
) -> Vec<formspec_core::InstanceProjectionDiagnostic> {
    let consumer = subject.map(|subject| {
        let definition = json!({"subject": subject});
        if instance["kind"] == "definition-response" {
            formspec_core::ProjectionConsumer::Prefill {
                definition,
                mapped: false,
            }
        } else {
            formspec_core::ProjectionConsumer::Instance {
                definition,
                name: "prior".into(),
            }
        }
    });
    formspec_core::check_instance_projection(instance, consumer.as_ref(), upstream)
}

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
fn catalog_list_checks_root_data_keys_and_route_predicates_across_versions() {
    let source = json!({
        "kind": "definition-response", "runtime": {"delivery": "snapshot"},
        "responseSelection": {
            "definition": {"url": "urn:example:report", "compatibleVersions": "^1.0.0"},
            "subject": [{"key": "unknown", "op": "eq", "from": {"routeParam": "year"}}],
            "cardinality": "latest-per-subject"
        },
        "schema": {"type": "array", "items": {"type": "object", "properties": {
            "rows": {"type": "array"}, "totals": {"type": "object"}
        }}}
    });
    let mut newer = upstream();
    newer["version"] = json!("1.1.0");
    newer["items"][0]["key"] = json!("renamed");
    let findings = check_instance_projection(&source, None, &[upstream(), newer]);
    assert_eq!(findings.len(), 3);
    assert_eq!(findings[0].code, Code::SubjectKeyMissing);
    assert_eq!(findings[0].json_pointer, "/responseSelection/subject/0/key");
    assert_eq!(findings[1].code, Code::PathMissing);
    assert_eq!(findings[1].json_pointer, "/schema/items/properties/totals");
    assert_eq!(findings[1].upstream_version.as_deref(), Some("1.1.0"));
    assert_eq!(findings[2].code, Code::SubjectKeyMissing);
    assert_eq!(findings[2].json_pointer, "/responseSelection/subject/0/key");
    assert_eq!(findings[2].upstream_version.as_deref(), Some("1.1.0"));
}

#[test]
fn catalog_draft_checks_its_schema_without_requiring_an_upstream_subject() {
    let source = json!({
        "kind": "definition-response", "runtime": {"delivery": "draft"},
        "definitionRef": "urn:example:report",
        "schema": {"type": "object", "properties": {"filed": {"type": "integer"}}}
    });
    let mut definition = upstream();
    definition.as_object_mut().unwrap().remove("subject");
    let findings = check_instance_projection(&source, None, &[definition]);
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].code, Code::PathMissing);
    assert_eq!(findings[0].json_pointer, "/schema/properties/filed");
}

#[test]
fn catalog_draft_uses_its_exact_version_without_semver() {
    let source = json!({
        "kind": "definition-response", "runtime": {"delivery": "draft"},
        "definitionRef": "urn:example:report",
        "schema": {"properties": {"totals": {"type": "object"}}}
    });
    let mut definition = upstream();
    definition["version"] = json!("42");
    definition["versionAlgorithm"] = json!("integer");
    assert!(check_instance_projection(&source, None, &[definition]).is_empty());
}

#[test]
fn mapped_catalog_without_output_schema_refuses_unproved_mapping_reads() {
    let source = json!({
        "kind": "definition-response", "runtime": {"delivery": "snapshot"},
        "responseSelection": {
            "definition": {"url": "urn:example:report"}, "subject": [],
            "cardinality": "latest", "mapping": "urn:example:mapping"
        }
    });
    let findings = check_instance_projection(&source, None, &[upstream()]);
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].code, Code::SchemaUnsupported);
    assert_eq!(findings[0].json_pointer, "/responseSelection/mapping");
}

#[test]
fn catalog_list_refuses_a_non_array_payload_schema() {
    let source = json!({
        "kind": "definition-response", "runtime": {"delivery": "snapshot"},
        "responseSelection": {
            "definition": {"url": "urn:example:report"}, "subject": [],
            "cardinality": "latest-per-subject"
        },
        "schema": {"type": "object", "items": {"type": "object"}}
    });
    let findings = check_instance_projection(&source, None, &[upstream()]);
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].code, Code::SchemaUnsupported);
    assert_eq!(findings[0].json_pointer, "/schema/type");
}

#[test]
fn catalog_list_accepts_nullable_array_and_record_schema_types() {
    let source = json!({
        "kind": "definition-response", "runtime": {"delivery": "snapshot"},
        "responseSelection": {
            "definition": {"url": "urn:example:report"}, "subject": [],
            "cardinality": "latest-per-subject"
        },
        "schema": {"type": ["array", "null"], "items": {
            "type": ["object", "null"], "properties": {"totals": {"type": ["object", "null"]}}
        }}
    });
    assert!(check_instance_projection(&source, None, &[upstream()]).is_empty());
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
fn leaves_missing_response_schema_and_consumer_keys_to_single_document_validation() {
    // The Definition schema and lint E307/E308 own these local defects.
    let mut instance = instance();
    instance.as_object_mut().unwrap().remove("schema");
    let consumer = json!({"type": "urn:example:program-year", "keys": {}});
    let mut second = upstream();
    second["version"] = json!("1.1.0");
    let mut third = upstream();
    third["version"] = json!("1.2.0");
    assert!(
        check_instance_projection(&instance, Some(&consumer), &[upstream(), second, third])
            .is_empty()
    );
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
fn checks_integer_and_date_versions_without_a_range() {
    // Unranged selections admit every VersionId; the ranged test above still requires SemVer.
    let mut instance = instance();
    instance["response"]["definition"]
        .as_object_mut()
        .unwrap()
        .remove("compatibleVersions");
    let mut integer_version = upstream();
    integer_version["version"] = json!("42");
    integer_version["items"][0]["children"][0]["key"] = json!("renamed");
    let mut date_version = upstream();
    date_version["version"] = json!("2025.06.01");
    date_version["items"][0]["children"][0]["key"] = json!("renamed");
    let findings = check_instance_projection(
        &instance,
        Some(&consumer_subject()),
        &[upstream(), integer_version, date_version],
    );
    let reported: Vec<_> = findings
        .iter()
        .map(|finding| (finding.code, finding.upstream_version.as_deref()))
        .collect();
    assert_eq!(
        reported,
        [
            (Code::PathMissing, Some("2025.06.01")),
            (Code::PathMissing, Some("42"))
        ]
    );
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
    let original = instance();
    let mut source = json!({
        "kind": "definition-response",
        "responseSelection": original["response"],
    });
    let upstream = [upstream()];
    let findings = check_instance_projection(&source, None, &upstream);
    assert_eq!(findings.len(), 2);
    assert!(
        findings
            .iter()
            .all(|finding| finding.code == Code::SubjectKeyMissing)
    );
    source["responseSelection"]["subject"][0]["from"] = json!({"routeParam": "agency"});
    source["responseSelection"]["subject"][1]["from"] = json!({"routeParam": "year"});
    assert!(check_instance_projection(&source, None, &upstream).is_empty());
}

#[test]
fn reports_each_catalog_source_defect_once_across_three_versions() {
    let source = json!({
        "kind": "definition-response",
        "responseSelection": {
            "definition": {"url": "urn:example:report", "compatibleVersions": "^1.0.0"},
            "subject": [{"key": "ffy", "op": "eq", "from": {"subject": "absent"}}],
        },
        "schema": {"$ref": "urn:example:record"},
    });
    let mut second = upstream();
    second["version"] = json!("1.1.0");
    let mut third = upstream();
    third["version"] = json!("1.2.0");
    let versions = [upstream(), second, third];

    let properties_only = json!({"type": "object"});
    for (mut source, code, pointer) in [
        (
            source.clone(),
            Code::SubjectKeyMissing,
            "/responseSelection/subject/0/from/subject",
        ),
        (source, Code::SchemaUnsupported, "/schema/$ref"),
    ] {
        let consumer = if code == Code::SubjectKeyMissing {
            source["schema"] = properties_only.clone();
            json!({"type": "urn:example:program-year", "keys": {}})
        } else {
            source["responseSelection"]["subject"][0]["from"] = json!({"subject": "year"});
            consumer_subject()
        };
        let findings = check_instance_projection(&source, Some(&consumer), &versions);
        let reported: Vec<_> = findings
            .iter()
            .map(|finding| {
                (
                    finding.code,
                    finding.json_pointer.as_str(),
                    finding.upstream_version.as_deref(),
                )
            })
            .collect();
        assert_eq!(reported, [(code, pointer, None)]);
    }
}

#[test]
fn seeded_multichoice_compares_stored_keys_across_inline_and_named_sets() {
    use formspec_core::ProjectionConsumer;
    let mut source = instance();
    source["schema"] = json!({"rows[*].stage": "multiChoice"});
    let consumer = ProjectionConsumer::Instance {
        name: "prior".into(),
        definition: json!({"subject": consumer_subject(), "items": [{
            "type": "group", "key": "history", "repeatable": true,
            "seedFrom": {"instance": "prior", "path": "rows"}, "children": [{
                "type": "field", "key": "previous", "dataType": "multiChoice",
                "prePopulate": {"instance": "prior", "path": "stage"},
                "options": [{"value":"a","label":"A"},{"value":"b","label":"B"}]
            }]
        }]}),
    };
    let mut first = upstream();
    first["items"][1]["children"] = json!([{"type":"field","key":"stage",
        "dataType":"multiChoice","optionSet":"stages","options":[]}]);
    first["optionSets"] = json!({"stages":{"options":[
        {"value":"b","label":"Second"},{"value":"a","label":"First"}
    ]}});
    let mut second = first.clone();
    second["version"] = json!("1.1.0");
    second["optionSets"]["stages"]["options"][0]["value"] = json!("c");
    let findings =
        formspec_core::check_instance_projection(&source, Some(&consumer), &[first, second]);
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].code, Code::OptionValuesMismatch);
    assert_eq!(findings[0].json_pointer, "/schema/rows[*].stage");
    assert_eq!(findings[0].upstream_version.as_deref(), Some("1.1.0"));
}

#[test]
fn direct_reads_compare_only_static_untransformed_choice_values() {
    use formspec_core::ProjectionConsumer;
    let mut source = instance();
    source["schema"] = json!({"stage":"choice"});
    let mut upstream = upstream();
    upstream["items"] = json!([{"type":"field","key":"stage","dataType":"choice","options":[{"value":"active","label":"Active"}]}]);
    let field = json!({"type":"field","key":"copy","dataType":"choice","options":[{"value":"open","label":"Active"}]});
    let consumer_for = |items| ProjectionConsumer::Instance {
        name: "prior".into(),
        definition: json!({"subject":consumer_subject(),"items":items}),
    };
    for (expression, count) in [
        ("=@instance('prior').stage", 1),
        ("=instance('prior', 'stage')", 1),
        ("=@instance('elsewhere').stage", 0),
        ("=upper(@instance('prior').stage)", 0),
    ] {
        let mut item = field.clone();
        item["initialValue"] = json!(expression);
        let consumer = consumer_for(vec![item]);
        assert_eq!(
            formspec_core::check_instance_projection(
                &source,
                Some(&consumer),
                std::slice::from_ref(&upstream)
            )
            .len(),
            count,
            "{expression}"
        );
    }
    let calculated = ProjectionConsumer::Instance {
        name: "prior".into(),
        definition: json!({"subject":consumer_subject(), "items":[field],
            "binds":[{"path":"copy","calculate":"@instance('prior').stage"}]}),
    };
    let calculated_findings = formspec_core::check_instance_projection(
        &source,
        Some(&calculated),
        std::slice::from_ref(&upstream),
    );
    assert_eq!(calculated_findings.len(), 1);
    assert_eq!(calculated_findings[0].code, Code::OptionValuesMismatch);
    let mut item = field;
    item["prePopulate"] = json!({"instance":"prior","path":"stage"});
    let consumer = consumer_for(vec![item]);
    upstream["items"][0]["options"] = json!("https://example.org/live-options");
    assert!(
        formspec_core::check_instance_projection(&source, Some(&consumer), &[upstream]).is_empty()
    );
}

#[test]
fn catalog_prefill_compares_only_delivered_unmapped_fields() {
    use formspec_core::ProjectionConsumer;
    let mut source = json!({"kind":"definition-response","responseSelection":instance()["response"],
        "schema":{"type":"object","properties":{"stage":{"type":"string"}}}});
    let mut upstream = upstream();
    let field = json!({"key":"stage","type":"field","dataType":"choice","options":[{"value":"a","label":"A"}]});
    upstream["items"] = json!([field]);
    let mut destination = field;
    destination["options"][0]["value"] = json!("b");
    let check = |source: &Value, mapped, url, version| {
        let consumer = ProjectionConsumer::Prefill {
            mapped,
            definition: json!({"url":url, "version":version, "items":[destination], "subject":consumer_subject()}),
        };
        formspec_core::check_instance_projection(
            source,
            Some(&consumer),
            std::slice::from_ref(&upstream),
        )
    };
    let url = "urn:example:report";
    let findings = check(&source, false, url, "1.1.0");
    assert_eq!(findings.len(), 1);
    assert_eq!(findings[0].code, Code::OptionValuesMismatch);
    assert_eq!(findings[0].json_pointer, "/schema/properties/stage");
    assert!(check(&source, true, url, "1.1.0").is_empty());
    assert!(check(&source, false, "urn:example:unrelated", "1.1.0").is_empty());
    assert!(check(&source, false, url, "2.0.0").is_empty());
    source["schema"]["properties"] = json!({});
    assert!(check(&source, false, url, "1.1.0").is_empty());
}
