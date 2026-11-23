//! Core selection for the synthetic agency-year filing journey (ADR 0172 §7).
#![cfg(feature = "response-selection")]

use formspec_core::{
    ProjectionConsumer, check_instance_projection,
    response_selection::{SelectionRecordKind, select_json},
    subject_key::subject_id_json,
};
use serde_json::{Value, json};

const MODULE_2: &str =
    include_str!("../../../tests/fixtures/response-selection/agency-year/module-2.definition.json");
const PEOPLE_SERVED: &str = include_str!(
    "../../../tests/fixtures/response-selection/agency-year/people-served.definition.json"
);

fn record(
    definition: &Value,
    id: &str,
    kind: SelectionRecordKind,
    uei: &str,
    ffy: i64,
    data: Value,
) -> Value {
    let status = match kind {
        SelectionRecordKind::OpenDraft => "in-progress",
        SelectionRecordKind::Filing => "completed",
    };
    let subject_type = definition["subject"]["type"].as_str().unwrap();
    let keys = json!({"uei": uei, "ffy": ffy});
    let subject_id = subject_id_json(subject_type, &keys.to_string()).unwrap();
    json!({"scope": "sample", "kind": kind, "response": {
        "$formspecResponse": "1.0",
        "definitionUrl": definition["url"], "definitionVersion": definition["version"],
        "id": id, "authored": "2025-10-01T00:00:00Z", "status": status,
        "subject": {"type": subject_type, "keys": keys, "id": subject_id},
        "data": data
    }})
}

fn read(instance: &Value, upstream: &Value, records: &[Value]) -> Value {
    let paths: Vec<_> = instance["schema"].as_object().unwrap().keys().collect();
    let context = json!({
        "scope": "sample", "authorized": true, "source": "definition",
        "upstreamSubject": upstream["subject"],
        "consumerSubject": {"uei": "A", "ffy": 2025},
        "projection": paths, "fallback": instance["data"]
    });
    let result = select_json(
        &serde_json::to_string(records).unwrap(),
        &instance["response"].to_string(),
        &context.to_string(),
    )
    .unwrap();
    serde_json::from_str(&result).unwrap()
}

#[test]
fn people_served_reads_the_current_sibling_and_previous_filing_for_the_same_agency() {
    let module: Value = serde_json::from_str(MODULE_2).unwrap();
    let report: Value = serde_json::from_str(PEOPLE_SERVED).unwrap();
    let current = &report["instances"]["module_2"];
    let prior = &report["instances"]["prior_year"];
    for (name, upstream) in [("module_2", &module), ("prior_year", &report)] {
        let consumer = ProjectionConsumer::Instance {
            definition: report.clone(),
            name: name.into(),
        };
        let findings = check_instance_projection(
            &report["instances"][name],
            Some(&consumer),
            std::slice::from_ref(upstream),
        );
        assert!(findings.is_empty(), "{findings:?}");
    }

    let mut records = vec![
        record(
            &module,
            "open",
            SelectionRecordKind::OpenDraft,
            "A",
            2025,
            json!({"capacity": 12, "note": "draft"}),
        ),
        record(
            &module,
            "filed",
            SelectionRecordKind::Filing,
            "A",
            2025,
            json!({"capacity": 8}),
        ),
        record(
            &module,
            "other-agency",
            SelectionRecordKind::OpenDraft,
            "B",
            2025,
            json!({"capacity": 29}),
        ),
        record(
            &module,
            "other-year",
            SelectionRecordKind::OpenDraft,
            "A",
            2024,
            json!({"capacity": 51}),
        ),
        record(
            &report,
            "other-prior",
            SelectionRecordKind::Filing,
            "B",
            2024,
            json!({"people": 61}),
        ),
        record(
            &report,
            "this-year",
            SelectionRecordKind::Filing,
            "A",
            2025,
            json!({"people": 24}),
        ),
    ];
    let first = read(current, &module, &records);
    assert_eq!(first["status"], "available");
    assert_eq!(first["value"], json!({"capacity": 12}));
    records[0]["response"]["data"]["note"] = json!("revised");
    assert_eq!(read(current, &module, &records), first);
    records[0]["response"]["data"]["capacity"] = json!(13);
    let changed = read(current, &module, &records);
    assert_eq!(changed["value"], json!({"capacity": 13}));
    assert_ne!(changed["valueDigest"], first["valueDigest"]);

    let missing = read(prior, &report, &records);
    assert_eq!(missing["status"], "available");
    assert_eq!(missing["none"], true);
    assert_eq!(missing["records"], json!([]));
    records.push(record(
        &report,
        "last-year",
        SelectionRecordKind::Filing,
        "A",
        2024,
        json!({"people": 7}),
    ));
    let matched = read(prior, &report, &records);
    assert_eq!(matched["value"], json!({"people": 7}));
    assert_eq!(matched["none"], false);
    assert!(matched["records"][0]["responseHash"].is_string());
}
