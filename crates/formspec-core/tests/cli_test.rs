//! Tests for the formspec-core CLI binary entrypoint.

use std::process::Command;

#[test]
fn test_cli_help() {
    let output = Command::new(env!("CARGO_BIN_EXE_formspec_core"))
        .arg("help")
        .output()
        .expect("failed to execute formspec-core");

    assert!(output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Usage: formspec-core"));
    assert!(stderr.contains("validate"));
    assert!(stderr.contains("registry"));
    assert!(stderr.contains("report"));
}

#[test]
fn test_cli_version() {
    let output = Command::new(env!("CARGO_BIN_EXE_formspec_core"))
        .arg("version")
        .output()
        .expect("failed to execute formspec-core");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("formspec-core"));
}

#[test]
fn test_cli_validate_definition() {
    let output = Command::new(env!("CARGO_BIN_EXE_formspec_core"))
        .arg("validate")
        .arg("examples/grant-application/definition.json")
        .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .output()
        .expect("failed to execute formspec-core");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("\"status\":\"ok\"") || stdout.contains("\"status\": \"ok\""));
    assert!(stdout.contains("Definition"));
}

#[test]
fn test_cli_registry_inspect() {
    let output = Command::new(env!("CARGO_BIN_EXE_formspec_core"))
        .arg("registry")
        .arg("examples/grant-application/registry.json")
        .current_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/../.."))
        .output()
        .expect("failed to execute formspec-core");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Grant Application Example"));
    assert!(stdout.contains("x-formspec-ein"));
}

#[test]
fn test_cli_missing_file_errors() {
    let output = Command::new(env!("CARGO_BIN_EXE_formspec_core"))
        .arg("validate")
        .arg("non_existent_file.json")
        .output()
        .expect("failed to execute formspec-core");

    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("Error: Failed to read"));
}
