//! Shape identity and warning-answer declarations (Core §5.2).
use formspec_lint::{LintSeverity, lint};
use serde_json::{Value, json};

/// Lint `doc` and return every error as `CODE at PATH`, in report order.
///
/// Each error must carry the registry's spec pointer and repair hint.
fn errors(doc: &Value) -> Vec<String> {
    lint(doc)
        .diagnostics
        .into_iter()
        .filter(|d| d.severity == LintSeverity::Error)
        .map(|d| {
            assert!(d.spec_ref.is_some() && d.suggested_fix.is_some(), "{d:?}");
            format!("{} at {}", d.code.as_wire_str(), d.path)
        })
        .collect()
}

#[test]
fn shape_declarations_report_only_the_offending_slots() {
    let mut failures = Vec::new();
    for (fixture, expected) in [
        (
            include_str!("../../../tests/fixtures/lint/E315-duplicate-shape-id.json"),
            &["E315 at $.shapes[1].id"][..],
        ),
        // An error or info Shape that declares acknowledge gets E314; its missing or empty code
        // stays the schema's E101, because E317's repair (add a code) would not help it.
        (
            include_str!("../../../tests/fixtures/lint/E314-non-warning-explanation.json"),
            &[
                "E101 at $.shapes[3]",
                "E101 at $.shapes[4].code",
                "E314 at $.shapes[0].explanation",
                "E314 at $.shapes[3].explanation",
                "E314 at $.shapes[4].explanation",
            ][..],
        ),
        // Missing and empty codes, inherited and declared; a code, an explicit `none`, and error
        // or info Shapes are clean.
        (
            include_str!("../../../tests/fixtures/lint/E317-acknowledge-without-code.json"),
            &[
                "E317 at $.shapes[0].code",
                "E317 at $.shapes[5].code",
                "E317 at $.shapes[6].code",
                "E317 at $.shapes[7].code",
            ][..],
        ),
        // Once per code, at the first warning Shape that is not acknowledge-mode. Two acknowledge
        // Shapes, two explain Shapes, and an error Shape sharing the code are clean. A code-less
        // Shape's results carry the default code `SHAPE_FAILED` (Core §2.5.1).
        (
            include_str!("../../../tests/fixtures/lint/E318-mixed-modes-within-code.json"),
            &[
                "E318 at $.shapes[1].explanation",
                "E318 at $.shapes[9].explanation",
            ][..],
        ),
    ] {
        let doc: Value = serde_json::from_str(fixture).unwrap();
        let found = errors(&doc);
        if found != expected {
            failures.push(format!("{}: got {found:?}, want {expected:?}", doc["url"]));
        }
    }
    assert!(failures.is_empty(), "{failures:#?}");
}

/// The 2026-11-21 review case: one inherited acknowledge Shape and one explicit `none` Shape, both
/// without a code, would share `SHAPE_FAILED`. The missing code is the one defect to repair.
#[test]
fn inherited_acknowledge_without_code_is_reported_once_at_its_code_slot() {
    let doc = json!({
        "$formspec": "1.0", "url": "urn:test:entangled", "version": "1.0.0", "status": "draft",
        "title": "Entangled", "warningExplanation": "acknowledge",
        "items": [{"type": "field", "key": "a", "label": "A", "dataType": "string"}],
        "shapes": [
            {"id": "blankA", "target": "a", "severity": "warning", "constraint": "present($)", "message": "A is blank"},
            {"id": "longA", "target": "a", "severity": "warning", "explanation": "none",
             "constraint": "$ != 'x'", "message": "A is x"}
        ]
    });
    assert_eq!(errors(&doc), ["E317 at $.shapes[0].code"]);
}

#[test]
fn first_slice_definition_passes_schema_and_lint() {
    let doc: Value = serde_json::from_str(include_str!(
        "../../../tests/conformance/fixtures/explanations/first-slice.definition.json"
    ))
    .unwrap();
    assert_eq!(errors(&doc), Vec::<String>::new());
}

#[test]
fn basis_vector_definitions_pass_schema_and_lint() {
    let vectors: Value = serde_json::from_str(include_str!(
        "../../../tests/conformance/fixtures/explanations/basis-vectors.json"
    ))
    .unwrap();
    for case in vectors["evaluatedCases"].as_array().unwrap() {
        let found = errors(&case["definition"]);
        assert!(found.is_empty(), "basis vector {}: {found:?}", case["name"]);
    }
}
