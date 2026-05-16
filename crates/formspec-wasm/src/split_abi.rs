//! Lockstep ABI marker shared by runtime and tools WASM artifacts.
//!
//! Bump when the JS↔WASM byte-protocol contract between paired runtime/tools
//! artifacts changes — JSON shapes, error envelope, CBOR tagging, the
//! marshalling seam. NOT the version of the JS-surface API (renamed exports,
//! added exports, deprecations): npm semver carries that. Mixing the two
//! roles is a future-bumper foot-gun; see ADR 0050.

use wasm_bindgen::prelude::*;

/// Returns the split-module ABI version string (must match across runtime/tools builds).
#[wasm_bindgen(js_name = "formspecWasmSplitAbiVersion")]
pub fn formspec_wasm_split_abi_version() -> String {
    // Magic: paired with formspec-engine bridge expectations; document bumps in ADR 0050.
    "1".to_string()
}
