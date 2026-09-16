//! Apply a Definition's `migrations` (core spec §6.7) to Response data pinned to an earlier version.
//!
//! `migrations.from[<version>]` names the descriptor for Responses pinned to that version: an ordered
//! `fieldMap` of `preserve` / `drop` / `expression` rules plus `defaults` for new fields. A source field the
//! map does not name is carried forward when its path (indices aside) is an item of this Definition, and
//! dropped when it is not. An `expression` rule evaluates FEL with `$` bound to the source field's value and
//! `@source` bound to the whole source data. The result is new data; the source is left as it was.
//!
//! One implementation for every host: TS (`migrateResponseData`) and Python
//! (`apply_migrations_to_response_data`) call this through WASM / PyO3.

use std::collections::HashSet;

use serde_json::{Map, Value};

use fel_core::{
    evaluate, fel_to_json, formspec_environment_from_json_map, parse, reject_undefined_functions,
};

/// One step of a `a.b[0].c` path.
#[derive(Debug, Clone, PartialEq)]
enum Segment {
    Key(String),
    Index(usize),
}

/// `a.b[0].c` → `[Key(a), Key(b), Index(0), Key(c)]`. Bracket indices may follow any key.
fn parse_path(path: &str) -> Vec<Segment> {
    let mut segments = Vec::new();
    for part in path.split('.') {
        let mut rest = part;
        if let Some(open) = rest.find('[') {
            if open > 0 {
                segments.push(Segment::Key(rest[..open].to_string()));
            }
            rest = &rest[open..];
            while let Some(close) = rest.find(']') {
                if let Ok(index) = rest[1..close].parse::<usize>() {
                    segments.push(Segment::Index(index));
                }
                rest = &rest[close + 1..];
                if !rest.starts_with('[') {
                    break;
                }
            }
        } else if !rest.is_empty() {
            segments.push(Segment::Key(rest.to_string()));
        }
    }
    segments
}

/// The path with every `[n]` removed: the item path a response path instantiates.
fn strip_indices(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    let mut in_index = false;
    for c in path.chars() {
        match c {
            '[' => in_index = true,
            ']' => in_index = false,
            _ if !in_index => out.push(c),
            _ => {}
        }
    }
    out
}

fn get_path<'a>(root: &'a Value, path: &str) -> Option<&'a Value> {
    let mut current = root;
    for segment in parse_path(path) {
        current = match (&segment, current) {
            (Segment::Key(key), Value::Object(map)) => map.get(key)?,
            (Segment::Index(index), Value::Array(items)) => items.get(*index)?,
            _ => return None,
        };
    }
    Some(current)
}

/// Write `value` at `path`, creating objects and arrays on the way; an array grows with nulls to reach an index.
fn set_path(root: &mut Value, path: &str, value: Value) {
    let segments = parse_path(path);
    if segments.is_empty() {
        return;
    }
    let mut current = root;
    for (position, segment) in segments.iter().enumerate() {
        let last = position + 1 == segments.len();
        let next_is_index = matches!(segments.get(position + 1), Some(Segment::Index(_)));
        let empty = || if next_is_index { Value::Array(Vec::new()) } else { Value::Object(Map::new()) };
        match segment {
            Segment::Key(key) => {
                if !current.is_object() {
                    *current = Value::Object(Map::new());
                }
                let map = current.as_object_mut().expect("object");
                if last {
                    map.insert(key.clone(), value);
                    return;
                }
                current = map.entry(key.clone()).or_insert_with(empty);
            }
            Segment::Index(index) => {
                if !current.is_array() {
                    *current = Value::Array(Vec::new());
                }
                let items = current.as_array_mut().expect("array");
                while items.len() <= *index {
                    items.push(Value::Null);
                }
                if last {
                    items[*index] = value;
                    return;
                }
                if items[*index].is_null() {
                    items[*index] = empty();
                }
                current = &mut items[*index];
            }
        }
    }
}

/// Every leaf of the source data as `(path, value)`, arrays of records descending, arrays of scalars as one leaf.
fn leaves<'a>(value: &'a Value, prefix: &str, out: &mut Vec<(String, &'a Value)>) {
    match value {
        Value::Object(map) => {
            for (key, entry) in map {
                let path = if prefix.is_empty() { key.clone() } else { format!("{prefix}.{key}") };
                leaves(entry, &path, out);
            }
        }
        Value::Array(items) if items.iter().any(|item| item.is_object()) => {
            for (index, item) in items.iter().enumerate() {
                leaves(item, &format!("{prefix}[{index}]"), out);
            }
        }
        _ => {
            if !prefix.is_empty() {
                out.push((prefix.to_string(), value));
            }
        }
    }
}

/// Dotted paths of every item in the Definition, groups included.
fn item_paths(definition: &Value) -> HashSet<String> {
    fn walk(items: &[Value], prefix: &str, out: &mut HashSet<String>) {
        for item in items {
            let Some(key) = item.get("key").and_then(Value::as_str) else { continue };
            let path = if prefix.is_empty() { key.to_string() } else { format!("{prefix}.{key}") };
            if let Some(children) = item.get("children").and_then(Value::as_array) {
                walk(children, &path, out);
            }
            out.insert(path);
        }
    }
    let mut out = HashSet::new();
    if let Some(items) = definition.get("items").and_then(Value::as_array) {
        walk(items, "", &mut out);
    }
    out
}

/// FEL for an `expression` rule: `$` is the source field's value, `@source` the whole source data.
fn eval_rule(expression: &str, source_value: &Value, source: &Value, now_iso: &str) -> Value {
    let mut fields = Map::new();
    fields.insert(String::new(), source_value.clone());
    let mut variables = Map::new();
    variables.insert("source".to_string(), source.clone());
    let mut ctx = Map::new();
    ctx.insert("fields".to_string(), Value::Object(fields));
    ctx.insert("variables".to_string(), Value::Object(variables));
    ctx.insert("nowIso".to_string(), Value::String(now_iso.to_string()));

    let env = formspec_environment_from_json_map(&ctx);
    let Ok(expr) = parse(expression) else {
        return Value::Null;
    };
    let result = evaluate(&expr, &env);
    if reject_undefined_functions(&result.diagnostics).is_err() {
        return Value::Null;
    }
    fel_to_json(&result.value)
}

/// Apply `definition.migrations.from[from_version]` to `response_data` (core spec §6.7).
///
/// Returns the data unchanged when it is not an object or no descriptor names `from_version`.
pub fn apply_migrations_to_response_data(
    definition: &Value,
    response_data: Value,
    from_version: &str,
    now_iso: &str,
) -> Value {
    let Some(descriptor) = definition
        .get("migrations")
        .and_then(|m| m.get("from"))
        .and_then(|from| from.get(from_version))
        .and_then(Value::as_object)
    else {
        return response_data;
    };
    if !response_data.is_object() {
        return response_data;
    }
    let source = response_data;

    let rules: Vec<&Map<String, Value>> = descriptor
        .get("fieldMap")
        .and_then(Value::as_array)
        .map(|rules| rules.iter().filter_map(Value::as_object).collect())
        .unwrap_or_default();
    let named: HashSet<String> = rules
        .iter()
        .filter_map(|rule| rule.get("source").and_then(Value::as_str))
        .map(strip_indices)
        .collect();

    // Carry forward what the map does not name and this Definition still has a place for.
    let items = item_paths(definition);
    let mut output = Value::Object(Map::new());
    let mut source_leaves = Vec::new();
    leaves(&source, "", &mut source_leaves);
    for (path, value) in source_leaves {
        let item = strip_indices(&path);
        if !named.contains(&item) && items.contains(&item) {
            set_path(&mut output, &path, value.clone());
        }
    }

    for rule in rules {
        let transform = rule.get("transform").and_then(Value::as_str).unwrap_or("preserve");
        let target = rule.get("target").and_then(Value::as_str);
        let source_path = rule.get("source").and_then(Value::as_str);
        match (transform, target) {
            ("drop", _) | (_, None) => {}
            ("preserve", Some(target)) => {
                if let Some(value) = source_path.and_then(|path| get_path(&source, path)) {
                    set_path(&mut output, target, value.clone());
                }
            }
            ("expression", Some(target)) => {
                let Some(expression) = rule.get("expression").and_then(Value::as_str) else { continue };
                let source_value = source_path.and_then(|path| get_path(&source, path)).cloned().unwrap_or(Value::Null);
                set_path(&mut output, target, eval_rule(expression, &source_value, &source, now_iso));
            }
            _ => {}
        }
    }

    if let Some(defaults) = descriptor.get("defaults").and_then(Value::as_object) {
        for (path, value) in defaults {
            if get_path(&output, path).is_none() {
                set_path(&mut output, path, value.clone());
            }
        }
    }

    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// v2 of a form whose v1 had a flat `hours` and an `employer`, and a `severance` question v2 dropped.
    fn definition() -> Value {
        json!({
            "url": "urn:test:certification",
            "version": "2.0.0",
            "items": [
                { "key": "able", "type": "field", "dataType": "choice" },
                { "key": "work", "type": "group", "children": [
                    { "key": "worked", "type": "field", "dataType": "choice" },
                    { "key": "jobs", "type": "group", "repeatable": true, "children": [
                        { "key": "employer", "type": "field", "dataType": "string" },
                        { "key": "hoursWorked", "type": "group", "children": [
                            { "key": "hours", "type": "field", "dataType": "integer" },
                            { "key": "minutes", "type": "field", "dataType": "integer" }
                        ] }
                    ] }
                ] },
                { "key": "certified", "type": "field", "dataType": "boolean" }
            ],
            "migrations": { "from": { "1.0.0": {
                "description": "Jobs became a repeat; hours split into hours and minutes; severance question removed",
                "fieldMap": [
                    { "source": "work.employer", "target": "work.jobs[0].employer", "transform": "preserve" },
                    { "source": "work.hours", "target": "work.jobs[0].hoursWorked.hours", "transform": "expression", "expression": "floor($)" },
                    { "source": "work.hours", "target": "work.jobs[0].hoursWorked.minutes", "transform": "expression", "expression": "round(($ - floor($)) * 60, 0)" },
                    { "source": "severance", "target": null, "transform": "drop" }
                ],
                "defaults": { "certified": false }
            } } }
        })
    }

    fn migrate(data: Value, from: &str) -> Value {
        apply_migrations_to_response_data(&definition(), data, from, "2026-01-01T00:00:00Z")
    }

    #[test]
    fn preserve_moves_a_field_into_a_repeat_row() {
        let out = migrate(json!({ "work": { "employer": "ACME" } }), "1.0.0");
        assert_eq!(out["work"]["jobs"][0]["employer"], json!("ACME"));
    }

    #[test]
    fn expression_binds_the_source_value_to_dollar() {
        let out = migrate(json!({ "work": { "hours": 7.5 } }), "1.0.0");
        assert_eq!(out["work"]["jobs"][0]["hoursWorked"]["hours"], json!(7));
        assert_eq!(out["work"]["jobs"][0]["hoursWorked"]["minutes"], json!(30));
    }

    #[test]
    fn expression_reads_the_whole_source_through_at_source() {
        let mut def = definition();
        def["migrations"]["from"]["1.0.0"]["fieldMap"] = json!([
            { "source": "work.hours", "target": "work.jobs[0].employer", "transform": "expression",
              "expression": "@source.work.employer & ' (' & string($) & 'h)'" }
        ]);
        let out = apply_migrations_to_response_data(
            &def, json!({ "work": { "employer": "ACME", "hours": 8 } }), "1.0.0", "2026-01-01T00:00:00Z");
        assert_eq!(out["work"]["jobs"][0]["employer"], json!("ACME (8h)"));
    }

    #[test]
    fn drop_discards_and_unnamed_fields_follow_the_definition() {
        let out = migrate(
            json!({ "able": "yes", "severance": "yes", "severanceAmount": 500, "work": { "worked": "no" } }),
            "1.0.0",
        );
        assert_eq!(out["able"], json!("yes"), "carried forward: still an item");
        assert_eq!(out["work"]["worked"], json!("no"), "carried forward inside a group");
        assert!(out.get("severance").is_none(), "dropped by rule");
        assert!(out.get("severanceAmount").is_none(), "not an item of this version");
    }

    #[test]
    fn defaults_fill_only_what_is_absent() {
        let out = migrate(json!({ "certified": true }), "1.0.0");
        assert_eq!(out["certified"], json!(true));
        let out = migrate(json!({}), "1.0.0");
        assert_eq!(out["certified"], json!(false));
    }

    #[test]
    fn carried_rows_keep_their_indices() {
        let out = migrate(json!({ "work": { "jobs": [{ "employer": "A" }, { "employer": "B" }] } }), "1.0.0");
        assert_eq!(out["work"]["jobs"][1]["employer"], json!("B"));
    }

    #[test]
    fn no_descriptor_for_the_version_leaves_the_data_alone() {
        let data = json!({ "severance": "yes" });
        assert_eq!(migrate(data.clone(), "1.5.0"), data);
        let mut def = definition();
        def.as_object_mut().unwrap().remove("migrations");
        assert_eq!(apply_migrations_to_response_data(&def, data.clone(), "1.0.0", "now"), data);
    }

    #[test]
    fn the_source_is_not_changed() {
        let data = json!({ "work": { "employer": "ACME", "hours": 8 } });
        let _ = migrate(data.clone(), "1.0.0");
        assert_eq!(data["work"]["hours"], json!(8));
    }

    #[test]
    fn paths_parse_and_write_through_indices() {
        assert_eq!(parse_path("a.b[2].c"), vec![Segment::Key("a".into()), Segment::Key("b".into()), Segment::Index(2), Segment::Key("c".into())]);
        assert_eq!(strip_indices("a.b[2].c[0]"), "a.b.c");
        let mut v = json!({});
        set_path(&mut v, "a.b[1].c", json!(1));
        assert_eq!(v, json!({ "a": { "b": [null, { "c": 1 }] } }));
    }
}
