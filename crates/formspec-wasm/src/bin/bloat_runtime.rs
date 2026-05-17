//! Native size anchor for `cargo bloat` (host target).
//!
//! `cargo-bloat` cannot parse `wasm32` outputs. This binary links the same **default runtime**
//! dependency graph as `wasm-pack … -- --no-default-features` (no `formspec-lint`).
//! Run: `cargo bloat --release -p formspec-wasm --bin formspec-wasm-bloat-runtime --no-default-features --crates`

use std::collections::HashMap;

use serde_json::json;

fn main() {
    let _ = fel_core::tokenize("");
    let doc = json!({});
    let _ = formspec_core::detect_document_type(&doc);
    let data = HashMap::new();
    let _ = formspec_eval::evaluate(&doc, &data, &formspec_eval::EvalOptions::default());
}
