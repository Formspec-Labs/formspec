/** @filedesc Asserts runtime-only init does not load tools WASM (ADR 0050). No global test setup import. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
    initFormspecEngine,
    initFormspecEngineTools,
    isFormspecEngineToolsInitialized,
} from '../../dist/init-formspec-engine.js';
import { isWasmToolsReady, wasmTokenizeFel } from '../../dist/wasm-bridge-tools.js';
import { getWasmModule } from '../../dist/wasm-bridge-runtime.js';
import { isValidResponseAuthored, selectResponses } from '../../dist/index.js';
import * as render from '../../dist/engine-render-entry.js';

test('initFormspecEngine leaves tools WASM unloaded', async () => {
    await initFormspecEngine();
    assert.equal(isWasmToolsReady(), false);
    assert.equal(isFormspecEngineToolsInitialized(), false);
});

test('respondent WASM has no preview selection exports', async () => {
    await initFormspecEngine();
    const runtime = getWasmModule();
    for (const name of ['selectResponsesJson', 'subjectIdJson', 'isValidResponseAuthored']) {
        assert.equal(runtime[name], undefined, name);
    }
    assert.equal(render.selectResponses, undefined);
    assert.equal(render.responseSubjectId, undefined);
    assert.equal(render.isValidResponseAuthored, undefined);
});

test('tools bridge throws until initFormspecEngineTools', async () => {
    await initFormspecEngine();
    assert.throws(
        () => wasmTokenizeFel('$a + 1'),
        /tools WASM/,
    );
});

test('preview selector requires the lazy tools module', async () => {
    await initFormspecEngine();
    const selection = {
        definition: { url: 'urn:example:filing' },
        subject: [],
        status: 'completed',
        whenNone: 'empty',
        cardinality: 'latest',
        pin: 'none',
    };
    const context = {
        scope: 'example',
        authorized: true,
        source: 'catalog',
        upstreamSubject: null,
    };
    assert.throws(() => selectResponses([], selection, context), /tools WASM/);
    assert.equal(isWasmToolsReady(), false);

    await initFormspecEngineTools();
    assert.equal(selectResponses([], selection, context).none, true);
    assert.equal(isValidResponseAuthored('2025-07-08T00:00:00-00:00'), true);
});

test('initFormspecEngineTools enables tokenizeFEL bridge', async () => {
    await initFormspecEngine();
    await initFormspecEngineTools();
    assert.equal(isWasmToolsReady(), true);
    assert.equal(isFormspecEngineToolsInitialized(), true);
    const tokens = wasmTokenizeFel('1 + 2');
    assert.ok(Array.isArray(tokens));
    assert.ok(tokens.length > 0);
});
