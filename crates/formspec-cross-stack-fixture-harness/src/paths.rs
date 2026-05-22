//! Filesystem anchors for formspec repo fixtures consumed by this harness.
use std::path::PathBuf;

/// Resolves the formspec repo root for shared cross-stack fixtures.
///
/// Uses this crate's **compile-time** `CARGO_MANIFEST_DIR` so fixture paths
/// stay stable when the harness is linked from another workspace (for example
/// `formspec-server`). Runtime `CARGO_MANIFEST_DIR` refers to the package under
/// test, not this crate. `FORMSPEC_ROOT_DIR` overrides the walk when the repo
/// layout moves or tests run from a non-default checkout.
pub fn formspec_root() -> PathBuf {
    if let Some(override_path) = std::env::var_os("FORMSPEC_ROOT_DIR") {
        return PathBuf::from(override_path);
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("crate dir has a parent")
        .parent()
        .expect("crates dir has a parent")
        .to_path_buf()
}

/// Cross-stack fixture corpus under `formspec/tests/fixtures/cross-stack/`.
///
/// # Panics
///
/// Panics when the manifest schema is absent — usually a stale checkout, crate
/// move, or wrong `FORMSPEC_ROOT_DIR`.
pub fn cross_stack_fixtures_root() -> PathBuf {
    let root = formspec_root()
        .join("tests")
        .join("fixtures")
        .join("cross-stack");
    assert!(
        root.join("manifest.schema.json").exists(),
        "cross-stack fixtures not found at {root:?} — crate may have moved; set FORMSPEC_ROOT_DIR to override",
    );
    root
}
