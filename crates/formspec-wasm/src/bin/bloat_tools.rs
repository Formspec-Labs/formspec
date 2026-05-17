//! Native size anchor for `cargo bloat` including **`formspec-lint`** (tools WASM graph).
//!
//! Run: `cargo bloat --release -p formspec-wasm --bin formspec-wasm-bloat-tools --crates`

use std::collections::HashMap;

use serde_json::json;

fn main() {
    let doc = json!({});
    let _ = formspec_lint::lint(&doc);
    let _ = fel_core::tokenize("");
    let _ = formspec_core::detect_document_type(&doc);
    let data = HashMap::new();
    let _ = formspec_eval::evaluate(&doc, &data, &formspec_eval::EvalOptions::default());
}
