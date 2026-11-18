//! Core §6.2 version syntax through the document lint entry point.

use formspec_lint::lint;
use serde_json::{Value, json};

#[test]
fn definition_version_follows_its_algorithm() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../tests/fixtures/lint/E202-definition-version.json"
    ))
    .unwrap();
    for (algorithm, version, valid) in [
        (None, "0.1.0-rc.1+build.01", true),
        (None, "release", false),
        (Some("semver"), "v1.2.3", false),
        (Some("semver"), "1.0.0-01", false),
        (Some("semver"), "123456789012345678901234567890.0.0", true),
        (Some("integer"), "0.1.0", false),
        (Some("integer"), "-2", false),
        (Some("integer"), "000000000000000000000000000000", true),
        (Some("date"), "2024.02.29", true),
        (Some("date"), "2023.02.29", false),
        (Some("date"), "2024.2.29", false),
        (Some("natural"), "release candidate A", true),
    ] {
        let mut doc = fixture.clone();
        doc["version"] = json!(version);
        if let Some(algorithm) = algorithm {
            doc["versionAlgorithm"] = json!(algorithm);
        } else {
            doc.as_object_mut().unwrap().remove("versionAlgorithm");
        }
        let result = lint(&doc);
        assert_eq!(
            result.valid, valid,
            "{algorithm:?} {version}: {:?}",
            result.diagnostics
        );
        assert_eq!(
            result
                .diagnostics
                .iter()
                .filter(|d| d.code.as_wire_str() == "E202"
                    && d.path == "$.version"
                    && d.suggested_fix.is_some())
                .count(),
            usize::from(!valid)
        );
    }
}
