//! CLI entrypoint for formspec-core operations: schema detection, registry inspection, and report assembly.

use std::fs;
use std::process::ExitCode;

use formspec_core::registry_client::Registry;
use formspec_core::schema_validator::detect_document_type;
use formspec_core::validation_report::build_validation_report;
use serde_json::Value;

fn print_usage() {
    eprintln!(
        "Usage: formspec-core <command> [options]\n\n\
         Commands:\n\
           validate <file.json>          Detect document type and report schema key\n\
           registry <file.json>          Parse and inspect a Formspec registry document\n\
           report <results.json>         Assemble a validation report from findings\n\
           version                       Print version info\n\
           help                          Print this help message"
    );
}

fn run_validate(path: &str) -> Result<String, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let json: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON in {path}: {e}"))?;

    match detect_document_type(&json) {
        Some(doc_type) => Ok(serde_json::json!({
            "status": "ok",
            "documentType": format!("{doc_type:?}"),
            "schemaKey": doc_type.schema_key(),
        })
        .to_string()),
        None => Err("Unknown or unrecognized Formspec document type".to_string()),
    }
}

fn run_registry(path: &str) -> Result<String, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let json: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON in {path}: {e}"))?;

    let registry = Registry::from_json(&json)
        .map_err(|e| format!("Registry parse error: {e:?}"))?;

    let issues = registry.validate();
    let publisher_name = registry.publisher.name.as_str().unwrap_or("Unknown");

    Ok(serde_json::json!({
        "status": "ok",
        "publisher": publisher_name,
        "published": registry.published,
        "entryCount": registry.entries().len(),
        "entries": registry.entries().iter().map(|e| {
            serde_json::json!({
                "name": e.name,
                "category": format!("{:?}", e.category),
                "version": e.version,
                "status": format!("{:?}", e.status),
            })
        }).collect::<Vec<_>>(),
        "warnings": registry.warnings.len(),
        "validationIssues": issues,
    })
    .to_string())
}

fn run_report(path: &str) -> Result<String, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
    let json: Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON in {path}: {e}"))?;

    let results = json
        .as_array()
        .ok_or_else(|| "Input must be a JSON array of validation results".to_string())?;

    let report = build_validation_report(results, "2026-10-23T00:00:00Z", None, None)
        .map_err(|e| format!("Report assembly error: {e}"))?;

    serde_json::to_string_pretty(&report)
        .map_err(|e| format!("Serialization error: {e}"))
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        print_usage();
        return ExitCode::from(1);
    }

    let command = args[1].as_str();
    match command {
        "help" | "--help" | "-h" => {
            print_usage();
            ExitCode::SUCCESS
        }
        "version" | "--version" | "-v" => {
            println!("formspec-core {}", env!("CARGO_PKG_VERSION"));
            ExitCode::SUCCESS
        }
        "validate" => {
            if args.len() < 3 {
                eprintln!("Error: 'validate' requires a file path argument.");
                return ExitCode::from(1);
            }
            match run_validate(&args[2]) {
                Ok(output) => {
                    println!("{output}");
                    ExitCode::SUCCESS
                }
                Err(err) => {
                    eprintln!("Error: {err}");
                    ExitCode::from(1)
                }
            }
        }
        "registry" => {
            if args.len() < 3 {
                eprintln!("Error: 'registry' requires a file path argument.");
                return ExitCode::from(1);
            }
            match run_registry(&args[2]) {
                Ok(output) => {
                    println!("{output}");
                    ExitCode::SUCCESS
                }
                Err(err) => {
                    eprintln!("Error: {err}");
                    ExitCode::from(1)
                }
            }
        }
        "report" => {
            if args.len() < 3 {
                eprintln!("Error: 'report' requires a file path argument.");
                return ExitCode::from(1);
            }
            match run_report(&args[2]) {
                Ok(output) => {
                    println!("{output}");
                    ExitCode::SUCCESS
                }
                Err(err) => {
                    eprintln!("Error: {err}");
                    ExitCode::from(1)
                }
            }
        }
        other => {
            eprintln!("Unknown command: {other}");
            print_usage();
            ExitCode::from(1)
        }
    }
}
