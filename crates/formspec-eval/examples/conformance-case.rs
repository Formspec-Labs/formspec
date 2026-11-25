//! Run one or a batch of expanded conformance cases against the native evaluator,
//! or compute conservative Rust scoped dependency cones (`--deps`) for mutation selection.
//!
//! Usage:
//! - `conformance-case --root DIR < case.json`
//! - `conformance-case --root DIR --batch < batch.json`
//! - `conformance-case --deps < deps-request.json`

#[path = "../conformance/mod.rs"]
mod conformance;

use std::collections::BTreeMap;
use std::path::Path;

use fel_core::exact_json::Value;
use formspec_eval::{DependencyQuery, definition_dependency_scopes};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BatchEntry {
    doc: Value,
    filed_data: Option<Value>,
    definition_override: Option<Value>,
}

#[derive(Deserialize)]
struct DepsRequest {
    definition: Value,
    queries: Vec<DependencyQuery>,
}

#[derive(Serialize)]
struct BatchResult {
    id: String,
    legs: BTreeMap<String, Vec<String>>,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut root: Option<String> = None;
    let mut batch = false;
    let mut deps = false;
    let mut i = 0;
    while i < args.len() {
        match args[i].as_str() {
            "--root" => {
                i += 1;
                root = args.get(i).cloned();
            }
            "--batch" => {
                batch = true;
            }
            "--deps" => {
                deps = true;
            }
            other => {
                return Err(format!("unexpected argument: {other}").into());
            }
        }
        i += 1;
    }
    if deps {
        let request: DepsRequest = serde_json::from_reader(std::io::stdin().lock())?;
        let scopes = definition_dependency_scopes(&request.definition, &request.queries);
        serde_json::to_writer(std::io::stdout().lock(), &scopes)?;
        return Ok(());
    }
    let Some(root) = root else {
        return Err("usage: conformance-case --root DIR [--batch] | --deps < input.json".into());
    };
    let root_path = Path::new(&root);

    if batch {
        let entries: Vec<BatchEntry> = serde_json::from_reader(std::io::stdin().lock())?;
        let results: Vec<BatchResult> = entries
            .into_iter()
            .map(|entry| {
                let id = entry.doc["id"]
                    .as_str()
                    .unwrap_or_default()
                    .to_owned();
                let legs = conformance::run_case_with_overrides(
                    root_path,
                    &entry.doc,
                    entry.filed_data.as_ref(),
                    entry.definition_override.as_ref(),
                );
                BatchResult { id, legs }
            })
            .collect();
        serde_json::to_writer(std::io::stdout().lock(), &results)?;
    } else {
        let case: Value = serde_json::from_reader(std::io::stdin().lock())?;
        let legs = conformance::run_case(root_path, &case);
        serde_json::to_writer(std::io::stdout().lock(), &legs)?;
    }
    Ok(())
}
