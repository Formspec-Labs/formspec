//! Lockstep ABI marker shared by runtime and tools WASM artifacts.
//!
//! Bump when the JS↔WASM contract between paired artifacts must change.

use wasm_bindgen::prelude::*;

/// Returns the split-module ABI version string (must match across runtime/tools builds).
#[wasm_bindgen(js_name = "formspecWasmSplitAbiVersion")]
pub fn formspec_wasm_split_abi_version() -> String {
    // Magic: paired with formspec-engine bridge expectations; document bumps in ADR 0050.
    "1".to_string()
}
