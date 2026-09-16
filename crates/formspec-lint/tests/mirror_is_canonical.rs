//! The JSON the lint compiles in — every schema under `schemas/` and the spec files under `specs/` —
//! is a copy of the repository's canonical file, kept because a published crate cannot reach outside
//! itself. `make sync-lint-schemas` refreshes the copies; this test fails the moment one is stale.

use std::fs;
use std::path::Path;

fn assert_mirror(mirror_dir: &str, canonical_dir: &str) {
    let crate_root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let repo_root = crate_root.join("../..");
    let mut checked = 0;
    for entry in fs::read_dir(crate_root.join(mirror_dir)).expect("mirror directory") {
        let entry = entry.expect("entry");
        let name = entry.file_name();
        if !name.to_string_lossy().ends_with(".json") {
            continue;
        }
        let mirrored = fs::read(entry.path()).expect("mirrored file");
        let canonical_path = repo_root.join(canonical_dir).join(&name);
        let canonical = fs::read(&canonical_path)
            .unwrap_or_else(|_| panic!("{} has no canonical file at {}", name.to_string_lossy(), canonical_path.display()));
        assert!(
            mirrored == canonical,
            "crates/formspec-lint/{mirror_dir}/{} differs from {canonical_dir}/{}; run `make sync-lint-schemas`",
            name.to_string_lossy(),
            name.to_string_lossy()
        );
        checked += 1;
    }
    assert!(checked > 0, "nothing mirrored under {mirror_dir}");
}

#[test]
fn schemas_mirror_is_canonical() {
    assert_mirror("schemas", "schemas");
}

#[test]
fn specs_mirror_is_canonical() {
    assert_mirror("specs", "specs");
}
