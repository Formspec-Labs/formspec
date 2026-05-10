//! Native unit tests for wasm binding helpers (string JSON API); no wasm runtime required.

#[cfg(test)]
mod tests {
    use fel_core::{Value as FelVal, fel_to_json, json_to_fel};
    use rust_decimal::Decimal;
    use serde_json::{Value, json};

    #[cfg(feature = "changelog-api")]
    use crate::changelog::generate_changelog_inner;
    use crate::definition::{
        apply_migrations_to_response_data_wasm, resolve_option_sets_on_definition_wasm,
    };
    use crate::evaluate::evaluate_definition_inner;
    use crate::fel::{eval_fel_inner, eval_fel_with_trace_inner, prepare_expression_inner};
    #[cfg(feature = "fel-authoring")]
    use crate::fel::{rewrite_fel_for_assembly_inner, tokenize_fel_inner};
    #[cfg(feature = "mapping-api")]
    use crate::mapping::execute_mapping_inner;
    #[cfg(feature = "registry-api")]
    use crate::registry::find_registry_entry_inner;
    use crate::value_coerce::coerce_field_value_inner;
    use formspec_core::{
        DocumentType, detect_document_type, parse_coerce_type,
        parse_mapping_document_from_value as parse_mapping_document_inner,
        parse_mapping_rules_from_value as parse_mapping_rules_inner,
    };

    fn minimal_definition() -> Value {
        json!({
            "title": "Test",
            "items": [
                { "key": "name", "label": "Name", "dataType": "string" }
            ]
        })
    }

    #[cfg(feature = "registry-api")]
    fn minimal_registry() -> String {
        json!({
            "publisher": { "name": "Test Org", "url": "https://example.com" },
            "published": "2026-01-01",
            "entries": [
                {
                    "name": "x-test-url",
                    "category": "dataType",
                    "version": "1.0.0",
                    "status": "active",
                    "description": "URL validation extension",
                    "baseType": "string"
                }
            ]
        })
        .to_string()
    }

    // ── Finding 67+68: eval_fel_inner ───────────────────────────

    /// Spec: specs/core/spec.md §3.2 — FEL evaluation returns JSON-serialized result.
    #[test]
    fn eval_fel_inner_arithmetic() {
        let result = eval_fel_inner("1 + 2", "{}").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val, json!(3));
    }

    /// `analyzeFEL` JSON mirrors `fel_analysis_to_json_value` — errors are structured objects.
    #[test]
    fn analyze_fel_wasm_invalid_expression_errors_are_objects() {
        use crate::fel::analyze_fel_wasm;

        let raw = analyze_fel_wasm("$a +").expect("analyzeFEL");
        let v: Value = serde_json::from_str(&raw).expect("JSON");
        assert_eq!(v["valid"], false);
        let err0 = &v["errors"][0];
        assert!(err0["message"].as_str().is_some());
    }

    /// Spec: specs/core/spec.md §3.2 — FEL field references resolve against injected fields.
    #[test]
    fn eval_fel_inner_with_field_injection() {
        let fields = json!({"age": 25}).to_string();
        let result = eval_fel_inner("$age + 5", &fields).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val, json!(30));
    }

    /// Spec: specs/core/spec.md §3.2 — String concatenation via & operator.
    #[test]
    fn eval_fel_inner_string_concat() {
        let fields = json!({"first": "Jane", "last": "Doe"}).to_string();
        let result = eval_fel_inner("$first & ' ' & $last", &fields).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val, json!("Jane Doe"));
    }

    /// Spec: specs/core/spec.md §3.2 — Invalid FEL expression returns parse error.
    #[test]
    fn eval_fel_inner_parse_error() {
        let result = eval_fel_inner("1 +", "{}");
        assert!(result.is_err());
    }

    /// Spec: specs/core/spec.md §3.2 — Invalid fields JSON returns error.
    #[test]
    fn eval_fel_inner_invalid_fields_json() {
        let result = eval_fel_inner("1 + 2", "not json");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid fields JSON"));
    }

    /// Spec: specs/core/spec.md §3.2 — Empty fields string treated as empty map.
    #[test]
    fn eval_fel_inner_empty_fields() {
        let result = eval_fel_inner("42", "").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val, json!(42));
    }

    // ── evalFELWithTrace: bridges `fel_core::evaluate_with_trace` through WASM ──

    /// Wire contract: `{ value, diagnostics, trace }`. Trace steps carry PascalCase
    /// `kind` discriminants from `fel_core::TraceStep` (serde default).
    #[test]
    fn eval_fel_with_trace_inner_addition() {
        let fields = json!({"a": 3, "b": 4}).to_string();
        let result = eval_fel_with_trace_inner("$a + $b", &fields).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val["value"], json!(7));
        assert!(val["diagnostics"].is_array());
        let trace = val["trace"].as_array().expect("trace is array");
        assert_eq!(trace.len(), 3, "expected 3 steps, got {:?}", trace);
        assert_eq!(trace[0]["kind"], "FieldResolved");
        assert_eq!(trace[0]["path"], "a");
        assert_eq!(trace[0]["value"], json!(3));
        assert_eq!(trace[1]["kind"], "FieldResolved");
        assert_eq!(trace[1]["path"], "b");
        assert_eq!(trace[2]["kind"], "BinaryOp");
        assert_eq!(trace[2]["op"], "+");
        assert_eq!(trace[2]["result"], json!(7));
    }

    /// A parse error should still surface as an `Err` through the WASM layer.
    #[test]
    fn eval_fel_with_trace_inner_parse_error() {
        assert!(eval_fel_with_trace_inner("1 +", "{}").is_err());
    }

    /// Short-circuit paths emit the `ShortCircuit` step and skip the undefined ref.
    #[test]
    fn eval_fel_with_trace_inner_short_circuit() {
        let result = eval_fel_with_trace_inner("false and $undefined", "{}").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        let trace = val["trace"].as_array().unwrap();
        let has_short = trace
            .iter()
            .any(|s| s["kind"] == "ShortCircuit" && s["op"] == "and");
        assert!(has_short, "expected ShortCircuit step: {:?}", trace);
    }

    // ── Finding 68: evaluate_definition_inner output shape ──────

    /// Spec: specs/core/spec.md §5.4 — ValidationReport output shape contract.
    /// The result must contain keys: values, validations, nonRelevant, variables.
    #[test]
    fn evaluate_definition_inner_output_shape() {
        let def = minimal_definition().to_string();
        let data = json!({"name": "Alice"}).to_string();
        let result = evaluate_definition_inner(&def, &data, None).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();

        // Top-level keys
        assert!(val.get("values").is_some(), "missing 'values' key");
        assert!(
            val.get("validations").is_some(),
            "missing 'validations' key"
        );
        assert!(
            val.get("nonRelevant").is_some(),
            "missing 'nonRelevant' key"
        );
        assert!(val.get("variables").is_some(), "missing 'variables' key");
        assert!(val.get("required").is_some(), "missing 'required' key");
        assert!(val.get("readonly").is_some(), "missing 'readonly' key");

        // values is an object
        assert!(val["values"].is_object());
        // validations is an array
        assert!(val["validations"].is_array());
        // nonRelevant is an array
        assert!(val["nonRelevant"].is_array());
        // variables is an object
        assert!(val["variables"].is_object());
        assert!(val["required"].is_object());
        assert!(val["readonly"].is_object());
    }

    /// Spec: specs/core/spec.md §5.4 — Each validation has path, severity, kind, message.
    #[test]
    fn evaluate_definition_inner_validation_shape() {
        // Definition with a required field, no data → validation error
        let def = json!({
            "title": "Test",
            "items": [
                { "key": "name", "label": "Name", "dataType": "string" }
            ],
            "bind": {
                "name": { "required": true }
            }
        })
        .to_string();
        let data = json!({}).to_string();
        let result = evaluate_definition_inner(&def, &data, None).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();

        let validations = val["validations"].as_array().unwrap();
        // With a required field and no data, expect at least one validation
        if !validations.is_empty() {
            let v = &validations[0];
            assert!(v.get("path").is_some(), "validation missing 'path'");
            assert!(v.get("severity").is_some(), "validation missing 'severity'");
            assert!(
                v.get("constraintKind").is_some(),
                "validation missing 'constraintKind'"
            );
            assert!(v.get("code").is_some(), "validation missing 'code'");
            assert!(v.get("message").is_some(), "validation missing 'message'");
            assert!(v.get("source").is_some(), "validation missing 'source'");

            // Severity, constraintKind, code, source are strings
            assert!(v["severity"].is_string());
            assert!(v["constraintKind"].is_string());
            assert!(v["code"].is_string());
            assert!(v["message"].is_string());
            assert!(v["source"].is_string());
        }
    }

    /// Spec: specs/core/spec.md §5.4 — Invalid definition JSON returns error.
    #[test]
    fn evaluate_definition_inner_invalid_json() {
        let result = evaluate_definition_inner("not json", "{}", None);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid definition JSON"));
    }

    #[test]
    fn evaluate_definition_inner_uses_runtime_context() {
        let def = json!({
            "title": "Test",
            "items": [
                { "key": "d", "label": "Date", "dataType": "date" }
            ],
            "binds": [
                { "path": "d", "calculate": "today()" }
            ]
        })
        .to_string();
        let data = json!({}).to_string();
        let context = json!({ "nowIso": "2025-06-15T00:00:00" }).to_string();

        let result = evaluate_definition_inner(&def, &data, Some(context)).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val["values"]["d"], json!("2025-06-15"));
    }

    #[test]
    fn evaluate_definition_inner_uses_previous_validations_context() {
        let def = json!({
            "$formspec": "1.0",
            "title": "Test",
            "items": [
                { "key": "age", "label": "Age", "dataType": "decimal" },
                { "key": "ageStatus", "label": "Status", "dataType": "string" }
            ],
            "binds": [
                { "path": "age", "constraint": "$age >= 0", "required": "true" },
                { "path": "ageStatus", "calculate": "if(valid($age), 'ok', 'invalid')" }
            ]
        })
        .to_string();
        let data = json!({}).to_string();

        let first_result = evaluate_definition_inner(&def, &data, None).unwrap();
        let first_val: Value = serde_json::from_str(&first_result).unwrap();
        let context = json!({
            "previousValidations": first_val["validations"]
        })
        .to_string();

        let second_result = evaluate_definition_inner(&def, &data, Some(context)).unwrap();
        let second_val: Value = serde_json::from_str(&second_result).unwrap();
        assert_eq!(second_val["values"]["ageStatus"], json!("invalid"));
    }

    #[cfg(feature = "fel-authoring")]
    #[test]
    fn tokenize_fel_returns_positioned_tokens() {
        let result = tokenize_fel_inner("sum($items[*].qty)").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        let tokens = val.as_array().unwrap();

        assert_eq!(tokens[0]["tokenType"], json!("Identifier"));
        assert_eq!(tokens[0]["text"], json!("sum"));
        assert_eq!(tokens[1]["tokenType"], json!("LRound"));
        assert_eq!(tokens[2]["tokenType"], json!("Dollar"));
        assert_eq!(tokens[4]["tokenType"], json!("LSquare"));
        assert_eq!(tokens[5]["tokenType"], json!("Asterisk"));
        assert_eq!(tokens[8]["tokenType"], json!("Identifier"));
        assert_eq!(tokens[8]["text"], json!("qty"));
    }

    #[cfg(feature = "fel-authoring")]
    #[test]
    fn rewrite_fel_for_assembly_inner_fragment_and_prefix() {
        let map = json!({
            "fragmentRootKey": "budget",
            "hostGroupKey": "projectBudget",
            "importedKeys": ["budget", "amount"],
            "keyPrefix": "proj_"
        });
        let out = rewrite_fel_for_assembly_inner("$budget.amount", &map.to_string()).unwrap();
        assert_eq!(out, "$projectBudget.proj_amount");
    }

    #[test]
    fn prepare_expression_inner_repeat_aliases_from_values_by_path() {
        let opt = json!({
            "expression": "rows.score",
            "valuesByPath": { "rows[0].score": 1, "rows[1].score": 2 },
        });
        let out = prepare_expression_inner(&opt.to_string()).unwrap();
        assert_eq!(out, "$rows[*].score");
    }

    #[test]
    fn coerce_field_value_inner_decimal_precision_round_trip() {
        let item = json!({ "dataType": "decimal" });
        let out =
            coerce_field_value_inner(&item.to_string(), r#"{"precision":1}"#, "{}", "\"42.26\"")
                .unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v, json!(42.3));
    }

    #[test]
    fn coerce_field_value_inner_money_number_wraps_default_currency() {
        let item = json!({ "dataType": "money" });
        let def = json!({ "formPresentation": { "defaultCurrency": "USD" } });
        let out =
            coerce_field_value_inner(&item.to_string(), "", &def.to_string(), "42.26").unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["amount"], json!(42.26));
        assert_eq!(v["currency"], json!("USD"));
    }

    #[test]
    fn resolve_option_sets_on_definition_wasm_inlines_array_set() {
        let def = json!({
            "items": [{ "key": "c", "optionSet": "o" }],
            "optionSets": { "o": [{ "value": "1", "label": "One" }] },
        });
        let out = resolve_option_sets_on_definition_wasm(&def.to_string()).unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["items"][0]["options"].as_array().unwrap().len(), 1);
        assert_eq!(v["items"][0]["options"][0]["label"], json!("One"));
    }

    #[test]
    fn apply_migrations_to_response_data_wasm_rename_and_transform() {
        let def = json!({
            "migrations": [{
                "fromVersion": "1.0.0",
                "changes": [
                    { "type": "rename", "from": "givenName", "to": "name" },
                    { "type": "transform", "path": "nickname", "expression": "upper(name)" }
                ]
            }]
        });
        let data = json!({ "givenName": "alice", "nickname": "legacy" });
        let out = apply_migrations_to_response_data_wasm(
            &def.to_string(),
            &data.to_string(),
            "1.0.0",
            "2020-01-01T00:00:00Z",
        )
        .unwrap();
        let v: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(v["name"], json!("alice"));
        assert_eq!(v["nickname"], json!("ALICE"));
    }

    // ── Finding 69: generate_changelog_inner output shape ───────

    /// Spec: specs/registry/changelog-spec.md §2 — Changelog output shape.
    /// Must contain: definitionUrl, fromVersion, toVersion, semverImpact, changes[].
    #[cfg(feature = "changelog-api")]
    #[test]
    fn generate_changelog_inner_output_shape() {
        let old_def = json!({
            "title": "Form v1",
            "version": "1.0.0",
            "items": [
                { "key": "name", "label": "Name", "dataType": "string" }
            ]
        })
        .to_string();
        let new_def = json!({
            "title": "Form v2",
            "version": "2.0.0",
            "items": [
                { "key": "name", "label": "Full Name", "dataType": "string" },
                { "key": "email", "label": "Email", "dataType": "string" }
            ]
        })
        .to_string();

        let result =
            generate_changelog_inner(&old_def, &new_def, "https://example.com/form").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();

        // Envelope marker — required for document-type detection & schema validation.
        assert_eq!(
            val["$formspecChangelog"], "1.0",
            "missing or wrong '$formspecChangelog' envelope marker"
        );

        assert_eq!(val["definitionUrl"], "https://example.com/form");
        assert!(val.get("fromVersion").is_some(), "missing 'fromVersion'");
        assert!(val.get("toVersion").is_some(), "missing 'toVersion'");
        assert!(val.get("semverImpact").is_some(), "missing 'semverImpact'");

        let impact = val["semverImpact"].as_str().unwrap();
        assert!(
            ["patch", "minor", "major"].contains(&impact),
            "semverImpact must be patch/minor/major, got: {impact}"
        );

        assert!(val.get("changes").is_some(), "missing 'changes'");
        assert!(val["changes"].is_array());
    }

    /// Regression: generated changelog must round-trip through
    /// `detect_document_type` so the linter's pass-1 does not emit E100.
    #[cfg(feature = "changelog-api")]
    #[test]
    fn generate_changelog_round_trips_document_type_detection() {
        let old_def = json!({
            "title": "Form v1",
            "version": "1.0.0",
            "items": [ { "key": "name", "label": "Name", "dataType": "string" } ]
        })
        .to_string();
        let new_def = json!({
            "title": "Form v2",
            "version": "2.0.0",
            "items": [
                { "key": "name", "label": "Name", "dataType": "string" },
                { "key": "email", "label": "Email", "dataType": "string" }
            ]
        })
        .to_string();

        let result =
            generate_changelog_inner(&old_def, &new_def, "https://example.com/form").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();

        assert_eq!(
            detect_document_type(&val),
            Some(DocumentType::Changelog),
            "generated changelog must be detectable as DocumentType::Changelog"
        );
    }

    /// Spec: specs/registry/changelog-spec.md §2 — Each change has type, target, path, impact.
    #[cfg(feature = "changelog-api")]
    #[test]
    fn generate_changelog_inner_change_shape() {
        let old_def = json!({
            "title": "Form v1",
            "version": "1.0.0",
            "items": [
                { "key": "name", "label": "Name", "dataType": "string" }
            ]
        })
        .to_string();
        let new_def = json!({
            "title": "Form v2",
            "version": "2.0.0",
            "items": [
                { "key": "name", "label": "Name", "dataType": "string" },
                { "key": "email", "label": "Email", "dataType": "string" }
            ]
        })
        .to_string();

        let result =
            generate_changelog_inner(&old_def, &new_def, "https://example.com/form").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        let changes = val["changes"].as_array().unwrap();

        if !changes.is_empty() {
            let c = &changes[0];
            assert!(c.get("type").is_some(), "change missing 'type'");
            assert!(c.get("target").is_some(), "change missing 'target'");
            assert!(c.get("path").is_some(), "change missing 'path'");
            assert!(c.get("impact").is_some(), "change missing 'impact'");

            let change_type = c["type"].as_str().unwrap();
            assert!(
                ["added", "removed", "modified"].contains(&change_type),
                "type must be added/removed/modified, got: {change_type}"
            );

            let target = c["target"].as_str().unwrap();
            let valid_targets = [
                "item",
                "bind",
                "shape",
                "optionSet",
                "dataSource",
                "screener",
                "migration",
                "metadata",
            ];
            assert!(
                valid_targets.contains(&target),
                "unexpected target: {target}"
            );

            let impact = c["impact"].as_str().unwrap();
            assert!(
                ["cosmetic", "compatible", "breaking"].contains(&impact),
                "impact must be cosmetic/compatible/breaking, got: {impact}"
            );
        }
    }

    /// Spec: specs/registry/changelog-spec.md §2 — Invalid old definition JSON returns error.
    #[cfg(feature = "changelog-api")]
    #[test]
    fn generate_changelog_inner_invalid_json() {
        let result = generate_changelog_inner("not json", "{}", "url");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid old definition JSON"));
    }

    // ── Finding 70: find_registry_entry_inner output shape ──────

    /// Spec: specs/registry/extension-registry.md §3 — Entry output has name, category, version, status, description.
    #[cfg(feature = "registry-api")]
    #[test]
    fn find_registry_entry_inner_output_shape() {
        let registry = minimal_registry();
        let result = find_registry_entry_inner(&registry, "x-test-url", "").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();

        assert_eq!(val["name"], "x-test-url");
        assert_eq!(val["category"], "dataType");
        assert!(val["version"].is_string(), "version must be a string");
        assert!(val["status"].is_string(), "status must be a string");
        assert!(
            val["description"].is_string(),
            "description must be a string"
        );
    }

    /// Spec: specs/registry/extension-registry.md §3 — Not found returns "null" string.
    #[cfg(feature = "registry-api")]
    #[test]
    fn find_registry_entry_inner_not_found() {
        let registry = minimal_registry();
        let result = find_registry_entry_inner(&registry, "x-nonexistent", "").unwrap();
        assert_eq!(result, "null");
    }

    /// Spec: specs/registry/extension-registry.md §3 — Invalid JSON returns error.
    #[cfg(feature = "registry-api")]
    #[test]
    fn find_registry_entry_inner_invalid_json() {
        let result = find_registry_entry_inner("not json", "x-test", "");
        assert!(result.is_err());
    }

    // ── Finding 67: execute_mapping_inner ────────────────────────

    /// Spec: specs/mapping/mapping-spec.md §3 — Mapping execution returns direction, output, rulesApplied, diagnostics.
    #[cfg(feature = "mapping-api")]
    #[test]
    fn execute_mapping_inner_output_shape() {
        let rules = json!([
            {
                "sourcePath": "firstName",
                "targetPath": "first_name",
                "transform": "preserve"
            }
        ])
        .to_string();
        let source = json!({"firstName": "Jane"}).to_string();

        let result = execute_mapping_inner(&rules, &source, "forward").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();

        assert_eq!(val["direction"], "forward");
        assert!(val.get("output").is_some(), "missing 'output'");
        assert!(val.get("rulesApplied").is_some(), "missing 'rulesApplied'");
        assert!(val.get("diagnostics").is_some(), "missing 'diagnostics'");
        assert!(val["diagnostics"].is_array());
        assert_eq!(val["output"]["first_name"], "Jane");
    }

    /// Spec: specs/mapping/mapping-spec.md §3 — Invalid direction returns error.
    #[cfg(feature = "mapping-api")]
    #[test]
    fn execute_mapping_inner_invalid_direction() {
        let result = execute_mapping_inner("[]", "{}", "sideways");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid direction"));
    }

    // ── Finding 71: parse_coerce_type ────────────────────────────

    /// Spec: specs/mapping/mapping-spec.md §3.3.2 — String shorthand: known types resolve.
    #[test]
    fn parse_coerce_type_string_known() {
        assert!(matches!(
            parse_coerce_type(&json!("string")),
            Some(formspec_core::CoerceType::String)
        ));
        assert!(matches!(
            parse_coerce_type(&json!("number")),
            Some(formspec_core::CoerceType::Number)
        ));
        assert!(matches!(
            parse_coerce_type(&json!("integer")),
            Some(formspec_core::CoerceType::Integer)
        ));
        assert!(matches!(
            parse_coerce_type(&json!("boolean")),
            Some(formspec_core::CoerceType::Boolean)
        ));
        assert!(matches!(
            parse_coerce_type(&json!("date")),
            Some(formspec_core::CoerceType::Date)
        ));
        assert!(matches!(
            parse_coerce_type(&json!("datetime")),
            Some(formspec_core::CoerceType::DateTime)
        ));
        assert!(matches!(
            parse_coerce_type(&json!("array")),
            Some(formspec_core::CoerceType::Array)
        ));
    }

    /// Spec: specs/mapping/mapping-spec.md §3.3.2 — Unknown string shorthand returns None.
    #[test]
    fn parse_coerce_type_string_unknown() {
        assert!(parse_coerce_type(&json!("uuid")).is_none());
        assert!(parse_coerce_type(&json!("money")).is_none());
        assert!(parse_coerce_type(&json!("")).is_none());
    }

    /// Spec: specs/mapping/mapping-spec.md §3.3.2, schemas/mapping.schema.json $defs/Coerce
    /// Object form with valid `to` field resolves.
    #[test]
    fn parse_coerce_type_object_valid() {
        let val = json!({"from": "date", "to": "string"});
        assert!(matches!(
            parse_coerce_type(&val),
            Some(formspec_core::CoerceType::String)
        ));

        let val = json!({"from": "string", "to": "number"});
        assert!(matches!(
            parse_coerce_type(&val),
            Some(formspec_core::CoerceType::Number)
        ));
    }

    /// Spec: specs/mapping/mapping-spec.md §3.3.2 — Object form missing `to` returns None.
    #[test]
    fn parse_coerce_type_object_missing_to() {
        let val = json!({"from": "date"});
        assert!(parse_coerce_type(&val).is_none());
    }

    /// Spec: specs/mapping/mapping-spec.md §3.3.2 — Object form with unknown `to` returns None.
    #[test]
    fn parse_coerce_type_object_unknown_to() {
        let val = json!({"from": "string", "to": "uuid"});
        assert!(parse_coerce_type(&val).is_none());
    }

    /// Spec: specs/mapping/mapping-spec.md §3.3.2 — Non-string non-object input returns None.
    #[test]
    fn parse_coerce_type_non_string_non_object() {
        assert!(parse_coerce_type(&json!(42)).is_none());
        assert!(parse_coerce_type(&json!(true)).is_none());
        assert!(parse_coerce_type(&json!(null)).is_none());
        assert!(parse_coerce_type(&json!([1, 2])).is_none());
    }

    /// Spec: specs/mapping/mapping-spec.md §3.3.2 — Object form: `from` is ignored for dispatch.
    /// The `from` field is used for validation (which pairs are valid), not for coerce dispatch.
    /// Two objects with same `to` but different `from` produce the same CoerceType.
    #[test]
    fn parse_coerce_type_object_from_ignored() {
        let a = json!({"from": "date", "to": "string"});
        let b = json!({"from": "number", "to": "string"});
        // Both resolve to String regardless of `from`
        assert!(matches!(
            parse_coerce_type(&a),
            Some(formspec_core::CoerceType::String)
        ));
        assert!(matches!(
            parse_coerce_type(&b),
            Some(formspec_core::CoerceType::String)
        ));
    }

    // ── Finding 73: parse_mapping_document_inner error path ─────

    /// Spec: specs/mapping/mapping-spec.md §2 — Non-object mapping document returns error.
    #[test]
    fn parse_mapping_document_inner_rejects_non_object() {
        let result = parse_mapping_document_inner(&json!("not an object"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("must be an object"));
    }

    /// Spec: specs/mapping/mapping-spec.md §2 — Array input returns error.
    #[test]
    fn parse_mapping_document_inner_rejects_array() {
        let result = parse_mapping_document_inner(&json!([1, 2, 3]));
        assert!(result.is_err());
    }

    /// Spec: specs/mapping/mapping-spec.md §2 — Valid document parses successfully.
    #[test]
    fn parse_mapping_document_inner_valid() {
        let doc = json!({
            "rules": [
                { "sourcePath": "a", "targetPath": "b", "transform": "preserve" }
            ],
            "autoMap": true
        });
        let result = parse_mapping_document_inner(&doc).unwrap();
        assert_eq!(result.rules.len(), 1);
        assert!(result.auto_map);
    }

    // ── Finding 73: parse_mapping_rules_inner error path ────────

    /// Spec: specs/mapping/mapping-spec.md §3 — Non-array rules input returns error.
    #[test]
    fn parse_mapping_rules_inner_rejects_non_array() {
        let result = parse_mapping_rules_inner(&json!("not an array"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("rules must be an array"));
    }

    /// Spec: specs/mapping/mapping-spec.md §3 — Unknown transform type returns error.
    #[test]
    fn parse_mapping_rules_inner_unknown_transform() {
        let rules = json!([{"transform": "teleport", "targetPath": "x"}]);
        let result = parse_mapping_rules_inner(&rules);
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .contains("unknown transform type: teleport")
        );
    }

    // ── Finding 74: fel_to_json Decimal::MAX ────────────────────

    /// Spec: host-facing FEL JSON uses UI encoding, preserving non-representable
    /// decimals as strings rather than lossy f64 conversion.
    #[test]
    fn fel_to_json_decimal_max_produces_string() {
        let val = FelVal::Number(Decimal::MAX);
        let json = fel_to_json(&val);
        assert!(
            json.is_string(),
            "Decimal::MAX should produce a JSON string under UI encoding"
        );
        let expected = Decimal::MAX.normalize().to_string();
        assert_eq!(json.as_str(), Some(expected.as_str()));
    }

    // ── Finding 75: json_to_fel/fel_to_json large integer ───────

    /// Spec: UI JSON encoding preserves large Decimal values as strings; parsing UI JSON
    /// back to FEL without tags yields a string value (lossless text, not typed number).
    #[test]
    fn json_fel_roundtrip_large_integer_is_lossless_string() {
        let d = Decimal::MAX;
        let json = fel_to_json(&FelVal::Number(d));
        let roundtripped = json_to_fel(&json);
        assert_eq!(json, json!(d.normalize().to_string()));
        assert_eq!(roundtripped, FelVal::String(d.normalize().to_string()));
    }

    // ── Finding 77: eval_fel_inner field injection edge cases ────

    /// Spec: specs/core/spec.md §3.2 — Whitespace-only fields JSON is invalid JSON.
    #[test]
    fn eval_fel_inner_whitespace_only_fields() {
        // Whitespace-only string is not valid JSON, should error
        let result = eval_fel_inner("1 + 1", " ");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid fields JSON"));
    }

    /// Spec: specs/core/spec.md §3.2 — "null" as fields string is valid JSON null.
    /// A JSON null is not an object, so json_to_field_map returns an empty map.
    #[test]
    fn eval_fel_inner_null_fields_string() {
        let result = eval_fel_inner("42", "null").unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val, json!(42));
    }

    /// Spec: specs/core/spec.md §3.8.3 — Non-ASCII field names and values.
    #[test]
    fn eval_fel_inner_non_ascii_field_values() {
        let fields = json!({"greeting": "Bonjour"}).to_string();
        let result = eval_fel_inner("$greeting", &fields).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val, json!("Bonjour"));
    }

    /// Spec: specs/core/spec.md §3.8.3 — Unicode field values (CJK, emoji).
    #[test]
    fn eval_fel_inner_unicode_field_values() {
        let fields = json!({"name": "\u{4F60}\u{597D}\u{4E16}\u{754C}"}).to_string();
        let result = eval_fel_inner("$name", &fields).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        assert_eq!(val, json!("\u{4F60}\u{597D}\u{4E16}\u{754C}"));
    }

    // ── Conversion helpers: json_to_fel and fel_to_json ─────────

    /// Verify null roundtrip.
    #[test]
    fn json_to_fel_null() {
        let val = json_to_fel(&json!(null));
        assert!(matches!(val, FelVal::Null));
        assert_eq!(fel_to_json(&val), json!(null));
    }

    /// Verify boolean roundtrip.
    #[test]
    fn json_to_fel_boolean() {
        assert!(matches!(json_to_fel(&json!(true)), FelVal::Boolean(true)));
        assert!(matches!(json_to_fel(&json!(false)), FelVal::Boolean(false)));
    }

    /// Verify integer roundtrip.
    #[test]
    fn json_to_fel_integer_roundtrip() {
        let val = json_to_fel(&json!(42));
        let back = fel_to_json(&val);
        assert_eq!(back, json!(42));
    }

    /// Verify string roundtrip.
    #[test]
    fn json_to_fel_string() {
        let val = json_to_fel(&json!("hello"));
        assert!(matches!(val, FelVal::String(ref s) if s == "hello"));
        assert_eq!(fel_to_json(&val), json!("hello"));
    }

    /// Verify array roundtrip.
    #[test]
    fn json_to_fel_array() {
        let val = json_to_fel(&json!([1, "two", null]));
        let back = fel_to_json(&val);
        assert_eq!(back, json!([1, "two", null]));
    }

    /// Verify object roundtrip.
    #[test]
    fn json_to_fel_object() {
        let val = json_to_fel(&json!({"a": 1, "b": "two"}));
        let back = fel_to_json(&val);
        assert_eq!(back["a"], json!(1));
        assert_eq!(back["b"], json!("two"));
    }

    // ── Task 1: instances + extensions through WASM evaluate ─────

    /// Instance references in calculate expressions resolve through WASM evaluation.
    #[test]
    fn evaluate_definition_with_instances() {
        let def = json!({
            "$formspec": "1.0",
            "title": "Test",
            "items": [
                { "key": "rate", "label": "Rate", "dataType": "decimal" }
            ],
            "binds": [
                { "path": "rate", "calculate": "@instance('config').defaultRate" }
            ]
        })
        .to_string();
        let data = json!({}).to_string();
        let context = json!({
            "instances": {
                "config": { "defaultRate": 0.05 }
            }
        })
        .to_string();

        let result = evaluate_definition_inner(&def, &data, Some(context)).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        // Instance ref should resolve — rate gets 0.05
        assert_eq!(val["values"]["rate"], json!(0.05));
    }

    /// Extension constraints from registryDocuments produce pattern-match validation errors.
    /// Without registry passthrough, only UNRESOLVED_EXTENSION fires (no pattern check).
    #[test]
    fn evaluate_definition_with_extension_constraints() {
        let def = json!({
            "$formspec": "1.0",
            "title": "Test",
            "items": [
                {
                    "key": "email",
                    "label": "Email",
                    "dataType": "string",
                    "extensions": { "x-formspec-email": true }
                }
            ]
        })
        .to_string();
        let data = json!({ "email": "not-an-email" }).to_string();
        let context = json!({
            "registryDocuments": [{
                "publisher": { "name": "Test", "url": "https://example.com" },
                "published": "2026-01-01",
                "entries": [{
                    "name": "x-formspec-email",
                    "category": "dataType",
                    "version": "1.0.0",
                    "status": "active",
                    "description": "Email validation",
                    "baseType": "string",
                    "metadata": { "displayName": "Email address" },
                    "constraints": {
                        "pattern": "^[^@]+@[^@]+\\.[^@]+$"
                    }
                }]
            }]
        })
        .to_string();

        let result = evaluate_definition_inner(&def, &data, Some(context)).unwrap();
        let val: Value = serde_json::from_str(&result).unwrap();
        let validations = val["validations"].as_array().unwrap();
        // Must have PATTERN_MISMATCH from extension constraint, not just UNRESOLVED_EXTENSION
        let pattern_errors: Vec<_> = validations
            .iter()
            .filter(|v| {
                v["code"].as_str() == Some("PATTERN_MISMATCH")
                    && v["source"].as_str() == Some("external")
            })
            .collect();
        assert!(
            !pattern_errors.is_empty(),
            "expected PATTERN_MISMATCH extension error, got: {validations:?}"
        );
        // Must NOT have UNRESOLVED_EXTENSION (registry was loaded)
        let unresolved: Vec<_> = validations
            .iter()
            .filter(|v| v["code"].as_str() == Some("UNRESOLVED_EXTENSION"))
            .collect();
        assert!(
            unresolved.is_empty(),
            "should not have UNRESOLVED_EXTENSION when registry is loaded, got: {validations:?}"
        );
    }
}
