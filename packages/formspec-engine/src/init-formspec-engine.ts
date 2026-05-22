/** @filedesc Public `initFormspecEngine` / `isFormspecEngineInitialized` — runtime WASM only until tools APIs run (ADR 0050). */

import { initWasm, isWasmReady } from './wasm-bridge-runtime.js';
import { initWasmTools, isWasmToolsReady } from './wasm-bridge-tools.js';

/**
 * Initialize the Formspec engine (loads and links the Rust/WASM module).
 *
 * Call once during app startup (e.g. `await initFormspecEngine()` or `await initEngine()`).
 * Safe to call multiple times; concurrent calls share one load.
 *
 * Not required for `formspec-webcomponent` only: importing that package starts WASM load automatically.
 */
export async function initFormspecEngine(): Promise<void> {
    return initWasm();
}

/**
 * Whether {@link initFormspecEngine} has completed successfully in this JS realm.
 */
export function isFormspecEngineInitialized(): boolean {
    return isWasmReady();
}

/**
 * Initialize the tools WASM module used by lint/mapping/registry/changelog helpers.
 * Runtime-first flows do not need this.
 */
export async function initFormspecEngineTools(): Promise<void> {
    return initWasmTools();
}

/** Whether the tools WASM module has completed initialization. */
export function isFormspecEngineToolsInitialized(): boolean {
    return isWasmToolsReady();
}
