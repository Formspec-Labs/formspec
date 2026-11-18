//! E500 dependency cycles follow Core §3.6.1: one vertex per Item value and one per Bind expression.
//!
//! Only an expression that writes an Item's value can close a cycle through that value:
//! `calculate` and an `=`-prefixed `default` always do; `relevant` does only for a field whose
//! effective `excludedValue` is `"null"` (§4.3.1), and relevance inherits from ancestors (§4.3.2);
//! `required`, `readonly` and `constraint` write nothing. The MIP query functions read the
//! queried Item's expression vertex, not its value.
use formspec_lint::{LintCode, lint};
use serde_json::{Value, json};

fn definition(items: Value, binds: Value) -> Value {
    json!({
        "$formspec": "1.0",
        "url": "urn:test:cycles",
        "version": "1.0.0",
        "status": "draft",
        "title": "Cycles",
        "items": items,
        "binds": binds,
    })
}

fn text(key: &str) -> Value {
    json!({ "key": key, "type": "field", "dataType": "string", "label": key })
}

fn number(key: &str) -> Value {
    json!({ "key": key, "type": "field", "dataType": "decimal", "label": key })
}

fn cycles(document: &Value) -> Vec<String> {
    lint(document)
        .diagnostics
        .into_iter()
        .filter(|diagnostic| diagnostic.code == LintCode::E500)
        .map(|diagnostic| diagnostic.message)
        .collect()
}

#[test]
fn lint_does_not_treat_a_different_index_as_the_same_writer() {
    let document = definition(
        json!([{"key":"rows", "type":"group", "label":"Rows", "repeatable":true, "children":[number("amount")]}]),
        json!([{"path":"rows[@index = 2].amount", "calculate":"($rows[*].amount)[1] + 1"}]),
    );
    let diagnostics = lint(&document).diagnostics;
    assert!(
        !diagnostics
            .iter()
            .any(|d| matches!(d.code, LintCode::E300 | LintCode::E500)),
        "{diagnostics:?}"
    );
}

#[test]
fn lint_sees_the_calculated_field_inside_a_group_value() {
    let document = definition(
        json!([{"key":"g", "type":"group", "label":"Group", "children":[number("a")]}]),
        json!([{"path":"g.a", "calculate":"if($g = {a: 1}, 2, 1)"}]),
    );
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn required_rules_naming_each_other_are_not_a_cycle() {
    let document = definition(
        json!([text("c"), text("d")]),
        json!([
            { "path": "c", "required": "$d != ''" },
            { "path": "d", "required": "$c != ''" }
        ]),
    );
    assert_eq!(cycles(&document), Vec::<String>::new());
}

#[test]
fn readonly_rules_naming_each_other_are_not_a_cycle() {
    let document = definition(
        json!([text("c"), text("d")]),
        json!([
            { "path": "c", "readonly": "$d != ''" },
            { "path": "d", "readonly": "$c != ''" }
        ]),
    );
    assert_eq!(cycles(&document), Vec::<String>::new());
}

#[test]
fn relevant_rules_naming_each_other_are_not_a_cycle_when_values_are_preserved() {
    let document = definition(
        json!([text("c"), text("d")]),
        json!([
            { "path": "c", "relevant": "$d != ''" },
            { "path": "d", "relevant": "$c != ''" }
        ]),
    );
    assert_eq!(cycles(&document), Vec::<String>::new());
}

#[test]
fn relevant_rules_naming_each_other_are_a_cycle_when_non_relevant_values_read_null() {
    let document = definition(
        json!([text("c"), text("d")]),
        json!([
            { "path": "c", "relevant": "$d != ''", "excludedValue": "null" },
            { "path": "d", "relevant": "$c != ''", "excludedValue": "null" }
        ]),
    );
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn group_relevant_reading_a_null_excluded_descendant_is_a_cycle() {
    let items = json!([{
        "key": "household", "type": "group", "label": "Household",
        "children": [text("members")]
    }]);
    let null_excluded = definition(
        items.clone(),
        json!([
            { "path": "household", "relevant": "$members != ''" },
            { "path": "household.members", "excludedValue": "null" }
        ]),
    );
    assert_eq!(
        cycles(&null_excluded).len(),
        1,
        "{:?}",
        cycles(&null_excluded)
    );

    let preserved = definition(
        items,
        json!([{ "path": "household", "relevant": "$members != ''" }]),
    );
    assert_eq!(cycles(&preserved), Vec::<String>::new());
}

#[test]
fn readonly_query_reads_the_readonly_expression() {
    let document = definition(
        json!([text("a"), text("b")]),
        json!([
            { "path": "a", "calculate": "readonly($b)" },
            { "path": "b", "readonly": "$a != ''" }
        ]),
    );
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn calculate_cycle_is_still_reported() {
    let document = definition(
        json!([number("a"), number("b")]),
        json!([
            { "path": "a", "calculate": "$b + 1" },
            { "path": "b", "calculate": "$a + 1" }
        ]),
    );
    let found = cycles(&document);
    assert_eq!(found.len(), 1, "{found:?}");
    assert!(found[0].contains("a \u{2192} b \u{2192} a"), "{found:?}");
}

#[test]
fn self_referencing_constraint_is_not_a_cycle() {
    let document = definition(
        json!([number("age")]),
        json!([{ "path": "age", "constraint": "$ >= 0 and $age < 150" }]),
    );
    assert_eq!(cycles(&document), Vec::<String>::new());
}

#[test]
fn cycle_through_a_repeated_field_is_found() {
    let document = definition(
        json!([
            { "key": "lines", "type": "group", "label": "Lines", "repeatable": true,
              "children": [number("amount")] },
            number("total")
        ]),
        json!([
            { "path": "total", "calculate": "sum($lines[*].amount)" },
            { "path": "lines[*].amount", "calculate": "$total" }
        ]),
    );
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn cycle_between_nested_fields_is_found() {
    let items = json!([{
        "key": "applicant", "type": "group", "label": "Applicant",
        "children": [number("first"), number("second")]
    }]);
    let cyclic = definition(
        items.clone(),
        json!([
            { "path": "applicant.first", "calculate": "$applicant.second" },
            { "path": "applicant.second", "calculate": "$applicant.first" }
        ]),
    );
    assert_eq!(cycles(&cyclic).len(), 1, "{:?}", cycles(&cyclic));

    let acyclic = definition(
        items,
        json!([{ "path": "applicant.first", "calculate": "$applicant.second" }]),
    );
    assert_eq!(cycles(&acyclic), Vec::<String>::new());
}

#[test]
fn object_form_and_screener_binds_follow_the_same_rule() {
    let object_form = definition(
        json!([text("c"), text("d")]),
        json!({
            "c": { "required": "$d != ''" },
            "d": { "required": "$c != ''" }
        }),
    );
    assert_eq!(cycles(&object_form), Vec::<String>::new());

    let screener = json!({
        "$formspecScreener": "1.0",
        "url": "urn:test:gate",
        "version": "1.0.0",
        "title": "Gate",
        "items": [
            { "key": "c", "type": "field", "dataType": "boolean", "label": "C" },
            { "key": "d", "type": "field", "dataType": "boolean", "label": "D" }
        ],
        "binds": [
            { "path": "c", "required": "$d = true" },
            { "path": "d", "required": "$c = true" }
        ],
        "evaluation": []
    });
    assert_eq!(cycles(&screener), Vec::<String>::new());
}

// ── Review fixes ─────────────────────────────────────────────────

fn boolean(key: &str) -> Value {
    json!({ "key": key, "type": "field", "dataType": "boolean", "label": key })
}

fn with_shapes(mut document: Value, shapes: Value) -> Value {
    document["shapes"] = shapes;
    document
}

// Core §4.3.1 and §5.6 rule 5: a field with a `default` gets that value back when it
// becomes relevant again, so its `relevant` writes its value even when values are preserved.
#[test]
fn relevant_writes_a_field_value_when_its_bind_declares_a_default() {
    let document = definition(
        json!([number("a"), number("b")]),
        json!([
            { "path": "a", "relevant": "$b > 0", "default": "5" },
            { "path": "b", "calculate": "$a * 2" }
        ]),
    );
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn group_relevant_writes_a_descendant_that_declares_a_default() {
    let document = definition(
        json!([
            { "key": "g", "type": "group", "label": "G", "children": [number("m")] },
            number("t")
        ]),
        json!([
            { "path": "g", "relevant": "$t < 10" },
            { "path": "g.m", "default": "5" },
            { "path": "t", "calculate": "$m + 1" }
        ]),
    );
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

// MIP query reads (Core §5.6 rules 1 and 3): required() and valid() see the queried field's
// inherited relevance; valid() also reads its value, constraint and every Shape targeting it.
#[test]
fn required_query_reads_the_queried_fields_relevance() {
    let document = definition(
        json!([boolean("a"), number("b")]),
        json!([
            { "path": "a", "calculate": "required($b)" },
            { "path": "b", "relevant": "$a = true", "required": "true" }
        ]),
    );
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn valid_query_reads_the_queried_fields_relevance() {
    let document = definition(
        json!([boolean("a"), number("b")]),
        json!([
            { "path": "a", "calculate": "valid($b)" },
            { "path": "b", "relevant": "$a = true", "required": "true" }
        ]),
    );
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn valid_query_reads_every_shape_targeting_the_field() {
    let shape = |slot: &str| {
        let mut shape = json!({ "id": "s1", "target": "b", "severity": "error", "message": "m" });
        shape[slot] = match slot {
            "and" => json!(["$a = true"]),
            _ => json!("$a = true"),
        };
        shape
    };
    for slot in ["constraint", "activeWhen", "and"] {
        let document = with_shapes(
            definition(
                json!([boolean("a"), number("b")]),
                json!([{ "path": "a", "calculate": "valid($b)" }]),
            ),
            json!([shape(slot)]),
        );
        assert_eq!(
            cycles(&document).len(),
            1,
            "{slot}: {:?}",
            cycles(&document)
        );
    }
}

// A member of a field's value (`$price.amount` on a money field) is that field, never an
// unrelated field that happens to share the member's name.
#[test]
fn value_member_paths_resolve_to_their_field() {
    let items = json!([
        { "key": "price", "type": "field", "dataType": "money", "label": "Price" },
        number("amount"),
        number("total")
    ]);
    let unrelated = definition(
        items.clone(),
        json!([
            { "path": "total", "calculate": "$price.amount" },
            { "path": "amount", "calculate": "$total" }
        ]),
    );
    assert_eq!(cycles(&unrelated), Vec::<String>::new());

    let through_price = definition(
        items,
        json!([
            { "path": "total", "calculate": "$price.amount" },
            { "path": "price", "calculate": "$total" }
        ]),
    );
    assert_eq!(
        cycles(&through_price).len(),
        1,
        "{:?}",
        cycles(&through_price)
    );
}

#[test]
fn current_reads_resolve_nested_items_and_value_members() {
    let document = definition(
        json!([{ "key": "rows", "type": "group", "label": "Rows", "repeatable": true,
            "children": [number("a"), { "key": "price", "type": "field", "dataType": "money", "label": "Price" }] }, number("amount")]),
        json!([{ "path": "rows[*].a", "calculate": "@current.price.amount" },
            { "path": "rows[*].price", "calculate": "$a" }]),
    );
    let found = cycles(&document);
    assert_eq!(found.len(), 1, "{found:?}");
    assert!(found[0].contains("a → price → a"), "{found:?}");
}

#[test]
fn calculate_through_a_variable_is_a_cycle() {
    let mut document = definition(
        json!([{ "key": "group", "type": "group", "label": "Group", "children": [number("amount")] }]),
        json!([{ "path": "group.amount", "calculate": "@total" }]),
    );
    document["variables"] = json!([{ "name": "total", "expression": "$group.amount + 1" }]);
    let found = cycles(&document);
    assert_eq!(found.len(), 1, "{found:?}");
    assert!(found[0].contains("amount"), "{found:?}");
}

#[test]
fn variables_resolve_lexically_without_merging_same_named_items() {
    let mut document = definition(
        json!([number("total"), { "key": "group", "type": "group", "label": "Group", "children": [number("amount")] }]),
        json!([{ "path": "group.amount", "calculate": "@total" }, { "path": "total", "calculate": "$amount" }]),
    );
    document["variables"] = json!([
        { "name": "total", "expression": "$amount" },
        { "name": "total", "scope": "group", "expression": "1" }
    ]);
    assert!(cycles(&document).is_empty(), "{:?}", cycles(&document));
    document["variables"][1]["expression"] = json!("$amount");
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn bare_self_in_value_writers_is_a_cycle_but_predicate_self_is_not() {
    for (property, expression) in [("calculate", "$ + 1"), ("default", "=$ + 1")] {
        let mut bind = json!({ "path": "a" });
        bind[property] = json!(expression);
        let document = definition(json!([number("a")]), json!([bind]));
        assert_eq!(
            cycles(&document).len(),
            1,
            "{property}: {:?}",
            cycles(&document)
        );
    }
    let document = definition(
        json!([number("a"), number("b")]),
        json!([{ "path": "a", "calculate": "countWhere($b, $ > 0)" }]),
    );
    assert!(cycles(&document).is_empty());
}

#[test]
fn shape_composition_ids_are_references_and_follow_nested_shapes() {
    for operator in ["and", "or", "xone", "not"] {
        let mut parent =
            json!({ "id": "parent", "target": "b", "severity": "error", "message": "m" });
        parent[operator] = if operator == "not" {
            json!("a")
        } else {
            json!(["a"])
        };
        let mut document = with_shapes(
            definition(
                json!([boolean("a"), number("b"), number("c")]),
                json!([{ "path": "a", "calculate": "valid($b)" }]),
            ),
            json!([
                parent,
                { "id": "a", "target": "c", "constraint": "true", "severity": "error", "message": "m" }
            ]),
        );
        assert!(
            cycles(&document).is_empty(),
            "{operator}: {:?}",
            cycles(&document)
        );
        document["shapes"][1]["constraint"] = json!("$a = true");
        assert_eq!(
            cycles(&document).len(),
            1,
            "{operator}: {:?}",
            cycles(&document)
        );
    }
}

#[test]
fn shape_cycle_messages_name_the_targeted_item_keys() {
    let document = with_shapes(
        definition(
            json!([boolean("a"), number("b")]),
            json!([{ "path": "a", "calculate": "valid($b)" }]),
        ),
        json!([
            { "id": "rule", "target": "b", "constraint": "$a = true", "severity": "error", "message": "m" }
        ]),
    );
    let found = cycles(&document);
    // Shape ids now distinguish validity rules that target the same Item.
    assert_eq!(
        found,
        vec!["Dependency cycle detected: a → b (Shape: rule) → a"]
    );
}

#[test]
fn shapes_querying_each_others_validity_are_a_cycle_without_binds() {
    let document = with_shapes(
        definition(json!([number("a"), number("b")]), json!([])),
        json!([
            { "id": "one", "target": "a", "constraint": "valid($b)", "severity": "error", "message": "m" },
            { "id": "two", "target": "b", "constraint": "valid($a)", "severity": "error", "message": "m" }
        ]),
    );
    // Shape ids now distinguish validity rules that target the same Item.
    assert_eq!(
        cycles(&document),
        vec!["Dependency cycle detected: a (Shape: one) → b (Shape: two) → a (Shape: one)"]
    );
}

#[test]
fn shape_reference_cycles_without_fel_are_reported() {
    let document = with_shapes(
        definition(json!([number("a"), number("b")]), json!([])),
        json!([
            { "id": "one", "target": "a", "and": ["two"], "severity": "error", "message": "m" },
            { "id": "two", "target": "b", "not": "one", "severity": "error", "message": "m" }
        ]),
    );
    // Shape ids now distinguish validity rules that target the same Item.
    assert_eq!(
        cycles(&document),
        vec!["Dependency cycle detected: a (Shape: one) → b (Shape: two) → a (Shape: one)"]
    );
}

#[test]
fn shape_reference_cycles_on_the_same_target_name_each_shape() {
    let document = with_shapes(
        definition(json!([number("a")]), json!([])),
        json!([
            { "id": "one", "target": "a", "and": ["two"], "severity": "error", "message": "m" },
            { "id": "two", "target": "a", "not": "one", "severity": "error", "message": "m" }
        ]),
    );
    assert_eq!(
        cycles(&document),
        vec!["Dependency cycle detected: a (Shape: one) → a (Shape: two) → a (Shape: one)"]
    );
}

#[test]
fn variable_only_cycles_in_distinct_scopes_are_not_deduplicated() {
    let mut document = definition(
        json!([
            { "key": "left", "type": "group", "label": "Left", "children": [number("a")] },
            { "key": "right", "type": "group", "label": "Right", "children": [number("b")] }
        ]),
        json!([]),
    );
    document["variables"] = json!([
        { "name": "total", "scope": "left", "expression": "@total" },
        { "name": "total", "scope": "right", "expression": "@total" }
    ]);
    let found = cycles(&document);
    assert_eq!(found.len(), 2, "{found:?}");
    assert!(
        found.iter().any(|message| message.contains("left")),
        "{found:?}"
    );
    assert!(
        found.iter().any(|message| message.contains("right")),
        "{found:?}"
    );
}

#[test]
fn variable_members_and_variable_chains_remain_separate_from_item_names() {
    let mut document = definition(
        json!([number("a"), number("total")]),
        json!([
            { "path": "a", "calculate": "@total.value" }, { "path": "total", "calculate": "$a" }
        ]),
    );
    document["variables"] = json!([
        { "name": "total", "expression": "@other" },
        { "name": "other", "expression": "1" }
    ]);
    assert!(cycles(&document).is_empty(), "{:?}", cycles(&document));
    document["variables"][1]["expression"] = json!("$a");
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}

#[test]
fn shape_ids_take_precedence_even_when_the_id_is_not_fel() {
    let document = with_shapes(
        definition(json!([number("a"), number("b")]), json!([])),
        json!([
            { "id": "parent", "target": "a", "and": ["rule:child"], "severity": "error", "message": "m" },
            { "id": "rule:child", "target": "b", "constraint": "true", "severity": "error", "message": "m" }
        ]),
    );
    let diagnostics = lint(&document).diagnostics;
    assert!(
        !diagnostics
            .iter()
            .any(|d| matches!(d.code, LintCode::E400 | LintCode::E500)),
        "{diagnostics:?}"
    );
}

#[test]
fn reserved_repeat_contexts_do_not_read_same_named_variables() {
    for name in ["index", "count", "current"] {
        // Bare @current reads the whole row, including this calculate's output.
        // Select an input sibling to test the namespace without that real cycle.
        let expression = if name == "current" { "@current.input".to_owned() } else { format!("@{name}") };
        let mut document = definition(
            json!([
                { "key": "rows", "type": "group", "label": "Rows", "repeatable": true, "children": [number("a"), number("input")] }
            ]),
            json!([{ "path": "rows[*].a", "calculate": expression }]),
        );
        document["variables"] = json!([{ "name": name, "expression": "$a" }]);
        assert!(
            cycles(&document).is_empty(),
            "{name}: {:?}",
            cycles(&document)
        );
    }
}

#[test]
fn a_scoped_variables_bare_self_reads_its_scope_item() {
    let mut document = definition(
        json!([number("a")]),
        json!([{ "path": "a", "calculate": "@total" }]),
    );
    document["variables"] = json!([{ "name": "total", "scope": "a", "expression": "$ + 1" }]);
    assert_eq!(cycles(&document).len(), 1, "{:?}", cycles(&document));
}
