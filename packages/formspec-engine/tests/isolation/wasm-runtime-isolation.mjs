/** @filedesc Asserts runtime-only init does not load tools WASM (ADR 0050). No global test setup import. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    initFormspecEngine,
    initFormspecEngineTools,
    isFormspecEngineToolsInitialized,
} from '../../dist/init-formspec-engine.js';
import { isWasmToolsReady, wasmTokenizeFEL } from '../../dist/wasm-bridge-tools.js';

test('initFormspecEngine leaves tools WASM unloaded', async () => {
    await initFormspecEngine();
    assert.equal(isWasmToolsReady(), false);
    assert.equal(isFormspecEngineToolsInitialized(), false);
});

test('tools bridge throws until initFormspecEngineTools', async () => {
    await initFormspecEngine();
    assert.throws(
        () => wasmTokenizeFEL('$a + 1'),
        /tools WASM/,
    );
});

test('initFormspecEngineTools enables tokenizeFEL bridge', async () => {
    await initFormspecEngine();
    await initFormspecEngineTools();
    assert.equal(isWasmToolsReady(), true);
    assert.equal(isFormspecEngineToolsInitialized(), true);
    const tokens = wasmTokenizeFEL('1 + 2');
    assert.ok(Array.isArray(tokens));
    assert.ok(tokens.length > 0);
});
