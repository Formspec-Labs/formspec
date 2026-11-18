//! Shape identity and warning-answer declarations (Core §5.2).
use formspec_lint::lint;
use serde_json::Value;

#[test]
fn shape_declarations_report_only_the_offending_slots() {
    for (fixture, code, path) in [
        (
            include_str!("../../../tests/fixtures/lint/E315-duplicate-shape-id.json"),
            "E315",
            "$.shapes[1].id",
        ),
        (
            include_str!("../../../tests/fixtures/lint/E314-non-warning-explanation.json"),
            "E314",
            "$.shapes[0].explanation",
        ),
    ] {
        let doc: Value = serde_json::from_str(fixture).unwrap();
        let paths: Vec<_> = lint(&doc)
            .diagnostics
            .into_iter()
            .filter(|d| d.code.as_wire_str() == code)
            .map(|d| {
                assert!(d.spec_ref.is_some() && d.suggested_fix.is_some());
                d.path
            })
            .collect();
        assert_eq!(paths, [path]);
    }
}
