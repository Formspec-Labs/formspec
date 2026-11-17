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
