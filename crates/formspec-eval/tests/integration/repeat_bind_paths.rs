//! Bind paths with `[*]` (Core §4.3.3 path syntax) resolve to every concrete repeat instance.

use formspec_eval::{EvalOptions, evaluate};
use serde_json::{Value, json};
use std::collections::HashMap;

fn jobs_definition(binds: Value) -> Value {
    json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [{
            "key": "jobs",
            "type": "group",
            "label": "Jobs",
            "repeatable": true,
            "minRepeat": 1,
            "children": [
                { "key": "hours", "type": "field", "dataType": "integer", "label": "Hours" },
                { "key": "label", "type": "field", "dataType": "string", "label": "Label" }
            ]
        }],
        "binds": binds
    })
}

/// Binds stored with `[*]` paths (`jobs[*].hours`) apply to every repeat instance,
/// in array-style and object-style binds, for nested-array and flat data, and for
/// `minRepeat` instances that have no data yet.
#[test]
fn wildcard_bind_paths_apply_to_every_instance() {
    let array_binds = json!([
        { "path": "jobs[*].hours", "required": "true", "constraint": "$ <= 24" },
        { "path": "jobs[*].label", "calculate": "'h' & string($hours)" }
    ]);
    let object_binds = json!({
        "jobs[*].hours": { "required": "true", "constraint": "$ <= 24" },
        "jobs[*].label": { "calculate": "'h' & string($hours)" }
    });
    let nested = HashMap::from([("jobs".to_string(), json!([{ "hours": 30 }, { "hours": 8 }]))]);
    let flat = HashMap::from([
        ("jobs[0].hours".to_string(), json!(30)),
        ("jobs[1].hours".to_string(), json!(8)),
    ]);

    for binds in [&array_binds, &object_binds] {
        for data in [&nested, &flat] {
            let result = evaluate(
                &jobs_definition(binds.clone()),
                data,
                &EvalOptions::default(),
            );
            let failures: Vec<(&str, String)> = result
                .validations
                .iter()
                .map(|v| (v.path.as_str(), v.code.to_string()))
                .collect();
            assert_eq!(
                failures,
                vec![("jobs[0].hours", "CONSTRAINT_FAILED".to_string())],
                "binds={binds} data={data:?}"
            );
            assert_eq!(result.values.get("jobs[0].label"), Some(&json!("h30")));
            assert_eq!(result.values.get("jobs[1].label"), Some(&json!("h8")));
        }

        let empty = evaluate(
            &jobs_definition(binds.clone()),
            &HashMap::new(),
            &EvalOptions::default(),
        );
        let failures: Vec<(&str, String)> = empty
            .validations
            .iter()
            .map(|v| (v.path.as_str(), v.code.to_string()))
            .collect();
        assert_eq!(
            failures,
            vec![("jobs[0].hours", "REQUIRED".to_string())],
            "binds={binds}"
        );
    }
}

#[test]
fn nested_wildcard_bind_path_applies_to_inner_instances() {
    let def = json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [{
            "key": "jobs",
            "type": "group",
            "label": "Jobs",
            "repeatable": true,
            "children": [{
                "key": "tasks",
                "type": "group",
                "label": "Tasks",
                "repeatable": true,
                "children": [
                    { "key": "mins", "type": "field", "dataType": "integer", "label": "Minutes" }
                ]
            }]
        }],
        "binds": [{ "path": "jobs[*].tasks[*].mins", "constraint": "$ < 60" }]
    });
    let data = HashMap::from([(
        "jobs".to_string(),
        json!([{ "tasks": [{ "mins": 10 }, { "mins": 90 }] }, { "tasks": [{ "mins": 75 }] }]),
    )]);
    let result = evaluate(&def, &data, &EvalOptions::default());
    let mut paths: Vec<&str> = result.validations.iter().map(|v| v.path.as_str()).collect();
    paths.sort_unstable();
    assert_eq!(
        paths,
        vec!["jobs[0].tasks[1].mins", "jobs[1].tasks[0].mins"]
    );
}
