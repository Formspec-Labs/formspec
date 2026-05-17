//! Apply definition `migrations` to flat response data (parity with TS `migrateResponseData`).

use serde_json::{Map, Value};

use fel_core::{
    evaluate, fel_to_json, formspec_environment_from_json_map, parse, reject_undefined_functions,
};

fn clone_json(value: &Value) -> Value {
    value.clone()
}

/// Flatten nested JSON into dotted / bracket paths (matches `flattenObject` in `helpers.ts`).
fn flatten_object(value: &Value, prefix: &str, output: &mut Map<String, Value>) {
    match value {
        Value::Array(arr) => {
            for (index, entry) in arr.iter().enumerate() {
                let path = if prefix.is_empty() {
                    format!("[{index}]")
                } else {
                    format!("{prefix}[{index}]")
                };
                flatten_object(entry, &path, output);
            }
            if !prefix.is_empty() {
                output.insert(prefix.to_string(), clone_json(value));
            }
        }
        Value::Object(map) => {
            for (key, entry) in map {
                let path = if prefix.is_empty() {
                    key.clone()
                } else {
                    format!("{prefix}.{key}")
                };
                flatten_object(entry, &path, output);
            }
            if !prefix.is_empty() {
                output.insert(prefix.to_string(), clone_json(value));
            }
        }
        _ => {
            if !prefix.is_empty() {
                output.insert(prefix.to_string(), clone_json(value));
            }
        }
    }
}

fn migration_from_version(m: &Map<String, Value>) -> Option<&str> {
    m.get("fromVersion")
        .and_then(|v| v.as_str())
}

fn change_kind(change: &Map<String, Value>) -> Option<&str> {
    change
        .get("type")
        .and_then(|v| v.as_str())
}

fn eval_transform(expression: &str, data: &Value, now_iso: &str) -> Value {
    let mut flat = Map::new();
    flatten_object(data, "", &mut flat);

    let mut ctx = Map::new();
    ctx.insert("fields".to_string(), Value::Object(flat));
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

fn parse_semver_tuple(v: &str) -> (u32, u32, u32) {
    let mut parts = v.splitn(3, '.');
    let major = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minor = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    (major, minor, patch)
}

/// Apply ordered definition migrations to response field data.
///
/// Expects `definition.migrations` as an array of objects with camelCase `fromVersion` and
/// `changes`. Each change uses `type`: `rename`, `remove`, `add`, or `transform`. Snake_case
/// keys are not read here — normalize at the FFI boundary if a host still emits them.
/// Matches `migrateResponseData` in `packages/formspec-engine/src/engine/response-assembly.ts`.
///
/// Non-object `response_data` is returned unchanged. Missing or non-array `migrations` returns a
/// clone of `response_data` when it is an object, otherwise the original value.
pub fn apply_migrations_to_response_data(
    definition: &Value,
    response_data: Value,
    from_version: &str,
    now_iso: &str,
) -> Value {
    let Value::Object(def_root) = definition else {
        return response_data;
    };
    let Some(Value::Array(migrations)) = def_root.get("migrations") else {
        return match response_data {
            Value::Object(_) => clone_json(&response_data),
            _ => response_data,
        };
    };

    let mut applicable: Vec<&Value> = migrations
        .iter()
        .filter(|m| {
            let Some(obj) = m.as_object() else {
                return false;
            };
            migration_from_version(obj)
                .is_some_and(|v| parse_semver_tuple(v) >= parse_semver_tuple(from_version))
        })
        .collect();

    applicable.sort_by(|a, b| {
        let va = a
            .as_object()
            .and_then(migration_from_version)
            .map(parse_semver_tuple)
            .unwrap_or((0, 0, 0));
        let vb = b
            .as_object()
            .and_then(migration_from_version)
            .map(parse_semver_tuple)
            .unwrap_or((0, 0, 0));
        va.cmp(&vb)
    });

    let Value::Object(mut data) = response_data else {
        return response_data;
    };

    for migration in applicable {
        let Some(mobj) = migration.as_object() else {
            continue;
        };
        let changes = mobj
            .get("changes")
            .and_then(|c| c.as_array())
            .map(Vec::as_slice)
            .unwrap_or_default();

        for change in changes {
            let Some(cobj) = change.as_object() else {
                continue;
            };
            let Some(kind) = change_kind(cobj) else {
                continue;
            };

            match kind {
                "rename" => {
                    let (Some(from), Some(to)) = (
                        cobj.get("from").and_then(|v| v.as_str()),
                        cobj.get("to").and_then(|v| v.as_str()),
                    ) else {
                        continue;
                    };
                    if let Some(v) = data.remove(from) {
                        data.insert(to.to_string(), v);
                    }
                }
                "remove" => {
                    if let Some(path) = cobj.get("path").and_then(|v| v.as_str()) {
                        data.remove(path);
                    }
                }
                "add" => {
                    if let Some(path) = cobj.get("path").and_then(|v| v.as_str()) {
                        if !data.contains_key(path) {
                            let default_val = cobj.get("default").cloned().unwrap_or(Value::Null);
                            data.insert(path.to_string(), default_val);
                        }
                    }
                }
                "transform" => {
                    let Some(path) = cobj.get("path").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    if data.contains_key(path) {
                        let Some(expr) = cobj.get("expression").and_then(|v| v.as_str()) else {
                            continue;
                        };
                        let snapshot = Value::Object(data.clone());
                        let new_val = eval_transform(expr, &snapshot, now_iso);
                        data.insert(path.to_string(), new_val);
                    }
                }
                _ => {}
            }
        }
    }

    Value::Object(data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn def_rename_remove_add() -> Value {
        json!({
            "items": [],
            "migrations": [{
                "fromVersion": "1.0.0",
                "changes": [
                    { "type": "rename", "from": "name", "to": "fullName" },
                    { "type": "remove", "path": "legacy_field" },
                    { "type": "add", "path": "consent", "default": false }
                ]
            }]
        })
    }

    #[test]
    fn rename_remove_add_matches_engine_fixture() {
        let def = def_rename_remove_add();
        let data = json!({
            "name": "John Doe",
            "legacy_field": "old_value",
            "email": "john@example.com"
        });
        let out = apply_migrations_to_response_data(&def, data, "1.0.0", "2020-01-01T00:00:00Z");
        assert_eq!(out["fullName"], json!("John Doe"));
        assert_eq!(out.get("name"), None);
        assert_eq!(out.get("legacy_field"), None);
        assert_eq!(out["consent"], json!(false));
        assert_eq!(out["email"], json!("john@example.com"));
    }

    #[test]
    fn skips_migrations_before_from_version() {
        let def = json!({
            "items": [],
            "migrations": [
                { "fromVersion": "1.0.0", "changes": [{ "type": "rename", "from": "a", "to": "b" }] },
                { "fromVersion": "2.0.0", "changes": [{ "type": "rename", "from": "b", "to": "c" }] }
            ]
        });
        let data = json!({ "b": "value" });
        let out = apply_migrations_to_response_data(&def, data, "2.0.0", "2020-01-01T00:00:00Z");
        assert_eq!(out["c"], json!("value"));
        assert_eq!(out.get("b"), None);
    }

    #[test]
    fn transform_uses_flattened_fields() {
        let def = json!({
            "items": [],
            "migrations": [{
                "fromVersion": "1.0.0",
                "changes": [
                    { "type": "rename", "from": "givenName", "to": "name" },
                    { "type": "transform", "path": "nickname", "expression": "upper(name)" }
                ]
            }]
        });
        let data = json!({ "givenName": "alice", "nickname": "legacy" });
        let out = apply_migrations_to_response_data(&def, data, "1.0.0", "2020-01-01T00:00:00Z");
        assert_eq!(out["name"], json!("alice"));
        assert_eq!(out["nickname"], json!("ALICE"));
    }

    /// Migrations use camelCase keys only; snake_case `from_version` is not matched (SWEEP-002).
    #[test]
    fn snake_case_from_version_is_ignored() {
        let def = json!({
            "items": [],
            "migrations": [{
                "from_version": "1.0.0",
                "changes": [{ "type": "rename", "from": "name", "to": "fullName" }]
            }]
        });
        let data = json!({ "name": "John" });
        let out = apply_migrations_to_response_data(&def, data.clone(), "1.0.0", "2020-01-01T00:00:00Z");
        assert_eq!(out["name"], json!("John"));
        assert!(out.get("fullName").is_none());
    }

    #[test]
    fn no_migrations_returns_clone_of_object() {
        let def = json!({ "items": [] });
        let data = json!({ "x": 1 });
        let out =
            apply_migrations_to_response_data(&def, data.clone(), "1.0.0", "2020-01-01T00:00:00Z");
        assert_eq!(out, data);
    }

    #[test]
    fn multi_digit_versions_sort_numerically() {
        let def = json!({
            "items": [],
            "migrations": [
                { "fromVersion": "9.0.0", "changes": [{ "type": "rename", "from": "a", "to": "b" }] },
                { "fromVersion": "10.0.0", "changes": [{ "type": "rename", "from": "b", "to": "c" }] }
            ]
        });
        let data = json!({ "a": "value" });
        let out = apply_migrations_to_response_data(&def, data, "9.0.0", "2020-01-01T00:00:00Z");
        assert_eq!(out["c"], json!("value"));
        assert_eq!(out.get("a"), None);
        assert_eq!(out.get("b"), None);
    }

    #[test]
    fn multi_digit_version_filter_excludes_lower_versions() {
        let def = json!({
            "items": [],
            "migrations": [
                { "fromVersion": "2.0.0", "changes": [{ "type": "rename", "from": "a", "to": "b" }] },
                { "fromVersion": "10.0.0", "changes": [{ "type": "rename", "from": "b", "to": "c" }] }
            ]
        });
        let data2 = json!({ "a": "low", "b": "high" });
        let out = apply_migrations_to_response_data(&def, data2, "10.0.0", "2020-01-01T00:00:00Z");
        assert_eq!(
            out["a"],
            json!("low"),
            "2.0.0 migration should NOT have run"
        );
        assert_eq!(out["c"], json!("high"));
        assert_eq!(out.get("b"), None);
    }
}
