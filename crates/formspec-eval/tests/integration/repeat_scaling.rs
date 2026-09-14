//! Timing benchmark: batch evaluation cost as a repeat group grows.
//!
//! Run with `cargo nextest run -p formspec-eval --run-ignored only repeat_scaling`.
//! Per-row work should be O(row), so doubling rows should roughly double time.

use formspec_eval::{EvalOptions, evaluate};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// Fields per row, matching the review's 200 rows x 10 fields probe.
const FIELDS: usize = 10;

fn definition() -> Value {
    let mut children: Vec<Value> = (0..FIELDS - 2)
        .map(|i| json!({ "key": format!("f{i}"), "type": "field", "dataType": "integer", "label": "F" }))
        .collect();
    children.push(json!({ "key": "due", "type": "field", "dataType": "date", "label": "Due" }));
    children
        .push(json!({ "key": "total", "type": "field", "dataType": "integer", "label": "Total" }));
    json!({
        "$formspec": "1.0",
        "url": "test",
        "version": "1.0.0",
        "title": "T",
        "items": [
            { "key": "rows", "type": "group", "label": "Rows", "repeatable": true, "children": children },
            { "key": "grand", "type": "field", "dataType": "integer", "label": "Grand" }
        ],
        "binds": [
            { "path": "rows[*].total", "calculate": "$f0 + $f1 + @current.f2" },
            { "path": "rows[*].f3", "relevant": "$f0 >= 0", "constraint": "$ >= 0" },
            { "path": "rows[*].due", "constraint": "$due > date('2020-01-01')" },
            { "path": "grand", "calculate": "sum($rows[*].total)" }
        ],
        "shapes": [
            { "id": "grandPositive", "target": "grand", "constraint": "$grand >= 0", "message": "g" },
            { "id": "rowTotal", "target": "rows[*].total", "constraint": "$total >= $f0", "message": "r" }
        ]
    })
}

fn data(rows: usize) -> HashMap<String, Value> {
    let mut data = HashMap::new();
    for row in 0..rows {
        for field in 0..FIELDS - 2 {
            data.insert(format!("rows[{row}].f{field}"), json!(row + field));
        }
        data.insert(format!("rows[{row}].due"), json!("2025-03-01"));
    }
    data
}

/// Best of `runs` evaluations, to damp scheduler noise.
fn best_time(rows: usize, runs: usize) -> Duration {
    let def = definition();
    let data = data(rows);
    (0..runs)
        .map(|_| {
            let start = Instant::now();
            let result = evaluate(&def, &data, &EvalOptions::default());
            let elapsed = start.elapsed();
            assert!(result.validations.is_empty(), "{:?}", result.validations);
            elapsed
        })
        .min()
        .expect("runs > 0")
}

#[test]
#[ignore = "timing benchmark; run explicitly with --run-ignored only"]
fn repeat_scaling() {
    let half = best_time(100, 3);
    let full = best_time(200, 3);
    let ratio = full.as_secs_f64() / half.as_secs_f64();
    println!("100 rows: {half:?}; 200 rows: {full:?}; ratio {ratio:.2}");
    // Linear work doubles (ratio ~2); quadratic quadruples (~4).
    assert!(
        ratio < 3.0,
        "200 rows cost {ratio:.2}x 100 rows: superlinear"
    );
}
