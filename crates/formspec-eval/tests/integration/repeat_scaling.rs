//! Timing benchmark: batch evaluation cost as a repeat group grows.
//!
//! Run with `cargo nextest run -p formspec-eval --run-ignored only repeat_scaling`.
//! Per-row work should be O(row), so doubling rows should roughly double time.
//! `constraint_scaling` puts a Bind constraint on every field of every row, so
//! per-constraint work that reads every value shows up as O(rows^2).

use fel_core::exact_json::{Value, native_json as json};
use formspec_eval::{EvalOptions, evaluate};
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

/// Best of `runs` creations, to damp scheduler noise.
fn best_time(rows: usize, runs: usize) -> Duration {
    best_time_for(&definition(), rows, runs)
}

fn best_time_for(def: &Value, rows: usize, runs: usize) -> Duration {
    let data = data(rows);
    (0..runs)
        .map(|_| {
            let start = Instant::now();
            let result = evaluate(def, &data, &EvalOptions::default());
            let elapsed = start.elapsed();
            assert!(result.validations.is_empty(), "{:?}", result.validations);
            assert_eq!(result.values["grand"], json!(3 * rows * (rows + 1) / 2));
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

/// [`definition`] plus a constraint on every integer field: constraints grow with rows.
fn constrained_definition() -> Value {
    let mut def = definition();
    let binds = def["binds"].as_array_mut().expect("binds array");
    for field in 0..FIELDS - 2 {
        binds.push(
            json!({ "path": format!("rows[*].f{field}"), "constraint": "$ >= 0 and $f0 >= 0" }),
        );
    }
    def
}

#[test]
#[ignore = "timing benchmark; run explicitly with --run-ignored only"]
fn constraint_scaling() {
    let def = constrained_definition();
    let half = best_time_for(&def, 400, 3);
    let full = best_time_for(&def, 800, 3);
    let ratio = full.as_secs_f64() / half.as_secs_f64();
    println!("400 rows: {half:?}; 800 rows: {full:?}; ratio {ratio:.2}");
    assert!(
        ratio < 3.0,
        "800 rows cost {ratio:.2}x 400 rows: superlinear"
    );
}

#[test]
#[ignore = "timing benchmark; run explicitly with --run-ignored only"]
fn row_site_aggregate_scaling() {
    let options = EvalOptions::default();
    let workload = std::env::var("FORMSPEC_REPEAT_WORKLOAD").ok();
    let size = std::env::var("FORMSPEC_REPEAT_ROWS")
        .ok()
        .map(|rows| rows.parse::<usize>().expect("positive row count"));
    let sizes = size.map_or_else(|| vec![200, 400, 800], |rows| vec![rows]);
    let mut failures = Vec::new();
    for (label, path, expression) in [
        ("share", "rows[*].share", "$amt / sum($rows[*].amt)"),
        (
            "running",
            "rows[*].running",
            "coalesce(prev().running, 0) + $amt",
        ),
        ("deep", "rows[*].one.two.three.copy", "$source"),
    ] {
        if workload
            .as_deref()
            .is_some_and(|workload| workload != label)
        {
            continue;
        }
        let def = json!({
            "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
            "items": [{"key": "rows", "type": "group", "label": "Rows", "repeatable": true,
                "children": [
                    {"key": "amt", "type": "field", "dataType": "integer", "label": "Amount"},
                    {"key": "share", "type": "field", "dataType": "decimal", "label": "Share"},
                    {"key": "running", "type": "field", "dataType": "integer", "label": "Running"},
                    {"key": "one", "type": "group", "label": "One", "children": [
                        {"key": "two", "type": "group", "label": "Two", "children": [
                            {"key": "three", "type": "group", "label": "Three", "children": [
                                {"key": "source", "type": "field", "dataType": "integer", "label": "Source"},
                                {"key": "copy", "type": "field", "dataType": "integer", "label": "Copy"}
                            ]}
                        ]}
                    ]}
                ]}],
            "binds": [{"path": path, "calculate": expression}]
        });
        let times: Vec<_> = sizes
            .iter()
            .copied()
            .map(|rows| {
                let input: HashMap<_, _> = (0..rows)
                    .flat_map(|row| {
                        [
                            (
                                format!("rows[{row}].amt"),
                                json!([1, 3].get(row).copied().unwrap_or(0)),
                            ),
                            (format!("rows[{row}].one.two.three.source"), json!(row)),
                        ]
                    })
                    .collect();
                let (key, expected) = match label {
                    "share" => ("rows[1].share".to_string(), json!(0.75)),
                    "running" => (format!("rows[{}].running", rows - 1), json!(4)),
                    _ => (
                        format!("rows[{}].one.two.three.copy", rows - 1),
                        json!(rows - 1),
                    ),
                };
                let mut best = Duration::MAX;
                for _ in 0..3 {
                    let start = Instant::now();
                    let result = evaluate(&def, &input, &options);
                    best = best.min(start.elapsed());
                    if result.values.get(&key) != Some(&expected) {
                        failures.push(format!(
                            "{key}: expected {expected}, got {:?}",
                            result.values.get(&key)
                        ));
                    }
                }
                best
            })
            .collect();
        check_ratios(label, &sizes, &times, &mut failures);
    }
    if workload
        .as_deref()
        .is_none_or(|workload| workload == "constraint")
    {
        let def = constrained_definition();
        let times: Vec<_> = sizes
            .iter()
            .copied()
            .map(|rows| best_time_for(&def, rows, 3))
            .collect();
        check_ratios("constraint", &sizes, &times, &mut failures);
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

fn check_ratios(label: &str, sizes: &[usize], times: &[Duration], failures: &mut Vec<String>) {
    let ratios: Vec<_> = times
        .windows(2)
        .map(|p| p[1].div_duration_f64(p[0]))
        .collect();
    println!("{label} {sizes:?}: {times:?}, ratios {ratios:.2?}");
    if ratios.iter().any(|ratio| *ratio >= 3.0) {
        failures.push(format!("{label}: superlinear scaling {ratios:.2?}"));
    }
}

#[test]
#[ignore = "timing benchmark; run explicitly with --run-ignored only"]
fn calculated_column_aggregate_scaling() {
    let def = json!({
        "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T",
        "items": [{ "key": "rows", "type": "group", "repeatable": true, "children": [
            { "key": "input", "type": "field", "dataType": "integer" },
            { "key": "amt", "type": "field", "dataType": "integer" },
            { "key": "share", "type": "field", "dataType": "decimal" }
        ] }],
        "binds": [
            { "path": "rows[*].amt", "calculate": "$input * 2" },
            { "path": "rows[*].share", "calculate": "$amt / sum($rows[*].amt)" }
        ]
    });
    let sizes = std::env::var("FORMSPEC_REPEAT_ROWS").map_or_else(
        |_| vec![200, 400, 800, 1600],
        |rows| vec![rows.parse().expect("positive row count")],
    );
    let options = EvalOptions::default();
    let times: Vec<_> = sizes
        .iter()
        .map(|&rows| {
            let data = (0..rows)
                .map(|row| {
                    (
                        format!("rows[{row}].input"),
                        json!([1, 3].get(row).copied().unwrap_or(0)),
                    )
                })
                .collect();
            let samples: Vec<_> = (0..3)
                .map(|_| {
                    let start = Instant::now();
                    let result = evaluate(&def, &data, &options);
                    let elapsed = start.elapsed();
                    assert!(result.validations.is_empty(), "{:?}", result.validations);
                    for row in 0..rows {
                        let amount = [2, 6].get(row).copied().unwrap_or(0);
                        let share = [json!(0.25), json!(0.75)]
                            .get(row)
                            .cloned()
                            .unwrap_or(json!(0));
                        assert_eq!(result.values[&format!("rows[{row}].amt")], json!(amount));
                        assert_eq!(result.values[&format!("rows[{row}].share")], share);
                    }
                    elapsed
                })
                .collect();
            println!("{rows} rows: {samples:?}");
            *samples.iter().min().unwrap()
        })
        .collect();
    let mut failures = Vec::new();
    check_ratios("calculated column", &sizes, &times, &mut failures);
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

/// A definition whose only per-item work is the seed pass (9e): `n` plain fields, each with a FEL
/// `initialValue`, beside a repeat group that carries `n` rows of data. The seed pass runs before
/// repeat expansion, so it evaluates one expression per field against the whole flat data map.
fn seeded_definition(fields: usize) -> Value {
    let mut items: Vec<Value> = (0..fields)
        .map(|i| {
            json!({
                "key": format!("f{i}"),
                "type": "field",
                "dataType": "integer",
                "label": "F",
                "initialValue": format!("={i} + 1")
            })
        })
        .collect();
    items.push(json!({
        "key": "rows",
        "type": "group",
        "label": "Rows",
        "repeatable": true,
        "children": [{ "key": "v", "type": "field", "dataType": "integer", "label": "V" }]
    }));
    json!({ "$formspec": "1.0", "url": "test", "version": "1.0.0", "title": "T", "items": items })
}

/// Seeding rebuilt the FEL environment from every value in `data` for each `=` initial value, so
/// the pass cost the product of two independent inputs: O(seeded items x data). Growing both
/// together doubled the time once the environment is built one per pass and updated in place;
/// before, it quadrupled.
#[test]
#[ignore = "timing benchmark; run explicitly with --run-ignored only"]
fn initial_value_seed_scaling() {
    let half = best_seed_time(200, 3);
    let full = best_seed_time(400, 3);
    let ratio = full.as_secs_f64() / half.as_secs_f64();
    println!("200 fields x 200 rows: {half:?}; 400 x 400: {full:?}; ratio {ratio:.2}");
    assert!(ratio < 3.0, "doubling both cost {ratio:.2}x: superlinear");
}

/// Best of `runs` evaluations of `n` seeded fields against `n` rows of data.
fn best_seed_time(n: usize, runs: usize) -> Duration {
    let def = seeded_definition(n);
    let data = json!({"rows": (0..n).map(|row| json!({"v": row})).collect::<Vec<_>>()});
    (0..runs)
        .map(|_| {
            let start = Instant::now();
            let result = formspec_eval::create_response(
                &def,
                data.clone(),
                &formspec_eval::CreateOptions::default(),
            );
            let elapsed = start.elapsed();
            assert_eq!(result.data["f1"], json!(2));
            elapsed
        })
        .min()
        .expect("runs > 0")
}
