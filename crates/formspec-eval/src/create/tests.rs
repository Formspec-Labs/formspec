//! Creation-only behavior shared by the browser and the parity runner.

use super::{CreateOptions, create_repeat_row, create_response};
use fel_core::exact_json::{Value, native_json as json};

#[test]
fn continuation_only_creates_pending_paths_and_their_new_descendants() {
    let def = definition(
        json!({"data":{"name":"Loaded","items":[{"name":"A"}]}}),
        1,
        2,
    );
    let result = create_response(
        &def,
        json!({}),
        &CreateOptions {
            pending_paths: Some(["rows".to_owned()].into()),
            ..CreateOptions::default()
        },
    );
    assert_eq!(result.data, json!({"rows":[{"name":"A","nested":[{}]}]}));
    assert!(result.pending.is_empty());
}

fn definition(source: Value, min: usize, max: usize) -> Value {
    json!({
        "instances": { "record": source },
        "items": [
            {"key":"name", "type":"field", "dataType":"string", "initialValue":"Default",
             "prePopulate":{"instance":"record", "path":"name"}},
            {"key":"copy", "type":"field", "dataType":"string", "initialValue":"=coalesce($name, 'Missing')"},
            {"key":"rows", "type":"group", "repeatable":true, "minRepeat":min, "maxRepeat":max,
             "seedFrom":{"instance":"record", "path":"items"}, "children":[
                 {"key":"name", "type":"field", "dataType":"string", "prePopulate":{"instance":"record", "path":"name"}},
                 {"key":"nested", "type":"group", "repeatable":true, "minRepeat":1, "children":[]}
             ]}
        ]
    })
}

#[test]
fn creation_preserves_host_values_and_applies_relative_and_absolute_reads_once() {
    let def = definition(
        json!({"data":{"name":"Root", "items":[{"name":"A"},{}, {"name":"C"}]}}),
        1,
        2,
    );
    let created = create_response(&def, json!({}), &CreateOptions::default());
    assert_eq!(
        created.data,
        json!({"name":"Root", "copy":"Root", "rows":[{"name":"A", "nested":[{}]},{"nested":[{}]}]})
    );

    let host = create_response(
        &def,
        json!({"name":null,"rows":[]}),
        &CreateOptions::default(),
    );
    assert_eq!(host.data, json!({"name":null,"copy":"Missing","rows":[]}));
    let changed = create_response(
        &def,
        json!({"name":"Changed", "copy":"Root", "rows":[]}),
        &CreateOptions::default(),
    );
    assert_eq!(changed.data["copy"], json!("Root"));
}

#[test]
fn creation_defers_pending_values_and_uses_arrival_or_fallback() {
    let def = definition(
        json!({"source":"https://example.invalid", "data":{"name":"Fallback", "items":[{"name":"A"}]}}),
        2,
        3,
    );
    let pending = create_response(
        &def,
        json!({}),
        &CreateOptions {
            pending_instances: ["record".to_owned()].into(),
            ..CreateOptions::default()
        },
    );
    assert_eq!(pending.pending, ["name", "rows"]);
    assert!(pending.data.get("name").is_none());
    assert!(pending.data.get("rows").is_none());

    let fallback = create_response(&def, pending.data.clone(), &CreateOptions::default());
    assert_eq!(
        fallback.data,
        json!({"name":"Fallback", "copy":"Missing", "rows":[{"name":"A", "nested":[{}]},{}]})
    );
    let resolved = create_response(
        &def,
        pending.data,
        &CreateOptions {
            instances: [(
                "record".into(),
                json!({"name":"Loaded", "items":[{"name":"B"},{"name":"C"},{"name":"D"}]}),
            )]
            .into(),
            ..CreateOptions::default()
        },
    );
    assert_eq!(resolved.data["name"], json!("Loaded"));
    assert_eq!(resolved.data["rows"].as_array().unwrap().len(), 3);
    assert!(resolved.pending.is_empty());
}

#[test]
fn a_manually_added_row_never_uses_a_relative_source() {
    let mut def = definition(
        json!({"data":{"name":"Root", "items":[{"name":"A"},{"name":"B"}]}}),
        1,
        3,
    );
    def["items"][2]["children"][0]["initialValue"] = json!("=string(@index) & ' added'");
    let row = create_repeat_row(
        &def,
        json!({"rows":[{"name":"A"}]}),
        "rows",
        &CreateOptions::default(),
    )
    .unwrap();
    assert_eq!(row.data, json!({"name":"2 added","nested":[{}]}));
}

#[test]
fn a_failed_seed_without_fallback_reports_a_diagnostic_and_pads() {
    let def = definition(json!({"source": "https://example.invalid"}), 2, 3);
    let result = create_response(&def, json!({}), &CreateOptions::default());
    assert_eq!(result.data["rows"], json!([{}, {}]));
    assert_eq!(result.diagnostics.len(), 1);
    assert!(result.diagnostics[0].message.contains("record.items"));
    assert!(result.pending.is_empty());
}

#[test]
fn expression_initial_waits_for_its_visible_variable_source() {
    let def = json!({
        "variables":[{"name":"answer","expression":"@source + 2"},
                     {"name":"source","expression":"instance($sourceName, 'amount')"}],
        "items":[{"type":"field","key":"sourceName","dataType":"string","initialValue":"p"},
                 {"type":"field","key":"value","dataType":"integer","initialValue":"=@answer"},
                 {"type":"field","key":"direct","dataType":"integer","initialValue":"=@instance('p').amount"}]
    });
    let pending = create_response(
        &def,
        json!({}),
        &CreateOptions {
            pending_instances: ["p".into()].into(),
            ..Default::default()
        },
    );
    assert_eq!(pending.data, json!({"sourceName":"p"}));
    assert_eq!(pending.pending, ["value", "direct"]);
    let options = CreateOptions {
        instances: [("p".into(), json!({"amount":20}))].into(),
        pending_paths: Some(pending.pending.into_iter().collect()),
        ..Default::default()
    };
    let ready = create_response(&def, json!({"direct":null,"sourceName":"p"}), &options);
    assert_eq!(
        ready.data,
        json!({"sourceName":"p","value":22,"direct":null})
    );
}

#[test]
fn filtered_seed_waits_for_its_instances_and_ignores_editing_data() {
    let mut def = definition(json!({"source":"https://example.invalid/records"}), 1, 1);
    def["instances"]["policy"] = json!({"source":"https://example.invalid/policy"});
    def["items"][2]["seedFrom"]["where"] =
        json!("$.name = subject('name') and $.age >= @instance('policy').minimum");
    let records = json!({"items":[{"name":"A","age":2},{"name":"A","age":6}]});
    let policy = json!({"minimum":4});
    let subject = crate::EvalSubject {
        keys: Some([("name".into(), fel_core::Value::String("A".into()))].into()),
        ..Default::default()
    };
    let prefill = json!({"name":"Host value"});
    let eager = create_response(
        &def,
        prefill.clone(),
        &CreateOptions {
            subject: Some(subject.clone()),
            instances: [
                ("record".into(), records.clone()),
                ("policy".into(), policy.clone()),
            ]
            .into(),
            ..Default::default()
        },
    );
    for (available, value, waiting) in [
        ("record", records.clone(), "policy"),
        ("policy", policy.clone(), "record"),
    ] {
        let waiting_result = create_response(
            &def,
            prefill.clone(),
            &CreateOptions {
                subject: Some(subject.clone()),
                instances: [(available.into(), value)].into(),
                pending_instances: [waiting.into()].into(),
                ..Default::default()
            },
        );
        assert!(waiting_result.data.get("rows").is_none());
        assert!(waiting_result.pending.iter().any(|path| path == "rows"));
        let mut edited = waiting_result.data;
        edited["name"] = json!("Edited while loading");
        let late = create_response(
            &def,
            edited,
            &CreateOptions {
                subject: Some(subject.clone()),
                instances: [
                    ("record".into(), records.clone()),
                    ("policy".into(), policy.clone()),
                ]
                .into(),
                pending_paths: Some(waiting_result.pending.into_iter().collect()),
                ..Default::default()
            },
        );
        assert_eq!(late.data["rows"], eager.data["rows"]);
        assert_eq!(late.data["name"], json!("Edited while loading"));
        assert!(late.diagnostics.is_empty());
    }
    assert_eq!(eager.data["rows"], json!([{"name":"A","nested":[{}]}]));
}

#[test]
fn filtered_seed_refuses_invalid_predicates_even_without_candidates() {
    for (source, code, rows) in [
        ("$.name =", "SYNTAX_ERROR", json!([])),
        ("@shared", "SEED_PREDICATE_SCOPE", json!([])),
        (
            "instance('unlisted') = null",
            "SEED_PREDICATE_SCOPE",
            json!([]),
        ),
        ("'yes'", "SEED_PREDICATE_TYPE", json!([{}])),
        (
            "1 / $.divisor > 0",
            "SEED_PREDICATE_EVALUATION",
            json!([{"divisor":1},{"divisor":0}]),
        ),
    ] {
        let mut def = definition(json!({"data":{"items":rows}}), 1, 1);
        def["items"][2]["seedFrom"]["where"] = json!(source);
        let created = create_response(&def, json!({}), &Default::default());
        assert!(created.data.get("rows").is_none(), "{source}");
        let diagnostics = serde_json::to_value(created.diagnostics).unwrap();
        assert_eq!(diagnostics[0]["code"], code, "{source}");
        assert_eq!(diagnostics[0]["path"], "rows", "{source}");
    }
}

#[test]
fn filtered_seed_uses_let_bindings_and_preserves_json_objects() {
    let mut def = definition(
        json!({"data":{"items":[{"name":"A","amount":20,"currency":"USD","closed":null}]}}),
        1,
        1,
    );
    def["instances"]["policy"] = json!({"data":{"minimum":10}});
    for source in [
        "let floor = 10 in $.amount >= $floor",
        "empty($.closed) and @instance('policy').minimum = 10",
        "empty(@instance('policy').minimum.missing) and empty(instance('policy', 'minimum.missing'))",
    ] {
        def["items"][2]["seedFrom"]["where"] = json!(source);
        let created = create_response(&def, json!({}), &Default::default());
        assert!(
            created.diagnostics.is_empty(),
            "{source}: {:?}",
            created.diagnostics
        );
        assert_eq!(
            created.data["rows"],
            json!([{"name":"A","nested":[{}]}]),
            "{source}"
        );
    }
}
