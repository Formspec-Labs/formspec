/** @filedesc Asserts runtime-only init does not load tools WASM (ADR 0050). No global test setup import. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { afterEach, before, describe, it } from 'node:test';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import {
    initFormspecEngine,
    initFormspecEngineTools,
    isFormspecEngineToolsInitialized,
} from '../../dist/init-formspec-engine.js';
import {
    getToolsWasmDynamicImportCountForTest,
    isWasmToolsReady,
    resetToolsWasmDynamicImportCountForTest,
    wasmTokenizeFel,
} from '../../dist/wasm-bridge-tools.js';
import { getWasmModule } from '../../dist/wasm-bridge-runtime.js';
import { createMappingEngine, isValidResponseAuthored, selectResponses } from '../../dist/index.js';
import * as render from '../../dist/engine-render-entry.js';

test('initFormspecEngine leaves tools WASM unloaded', async () => {
    await initFormspecEngine();
    assert.equal(isWasmToolsReady(), false);
    assert.equal(isFormspecEngineToolsInitialized(), false);
});

test('respondent WASM has no preview selection exports', async () => {
    await initFormspecEngine();
    const runtime = getWasmModule();
    // Subject identity left this list on purpose (fs-aght): every subject-declaring form needs it.
    for (const name of ['selectResponsesJson', 'isValidResponseAuthored']) {
        assert.equal(runtime[name], undefined, name);
    }
    assert.equal(render.selectResponses, undefined);
    assert.equal(render.isValidResponseAuthored, undefined);
});

const subjectIds = parseJsonExact(readFileSync(
    new URL('../../../../tests/conformance/fixtures/subject-id/vectors.json', import.meta.url), 'utf8',
));
const declaring = (type, keys) => ({
    $formspec: '1.0', url: 'urn:test:subject-runtime', version: '1.0.0', title: 'Subject', items: [],
    subject: { type, keys: Object.fromEntries(Object.entries(keys).map(([name, value]) =>
        [name, { dataType: typeof value === 'string' ? 'string' : 'integer' }])) },
});

describe('subject identity on the runtime path', () => {
    // A tools import counts as soon as it starts; readiness flips only after it finishes.
    const toolsImportsStarted = () => getToolsWasmDynamicImportCountForTest();
    before(() => resetToolsWasmDynamicImportCountForTest());
    afterEach(() => assert.equal(toolsImportsStarted(), 0));

    it('derives Core vector ids in the engine and the render entry', async () => {
        await initFormspecEngine();
        for (const { name, type, keys, id } of subjectIds.vectors) {
            assert.equal(render.responseSubjectId(type, keys), id, name);
            const engine = render.createFormEngine(declaring(type, keys), { responseSubject: { type, keys } });
            assert.deepEqual(engine.getResponse().subject, { type, keys, id }, name);
            engine.dispose();
        }
        for (const { name, type, keys, expectedError } of subjectIds.refusals) {
            assert.throws(() => render.responseSubjectId(type, keys), new RegExp(expectedError), name);
        }
        assert.equal(isWasmToolsReady(), false);
    });

    it('ignores a caller-supplied id for a subject-declaring Definition', async () => {
        await initFormspecEngine();
        const [{ type, keys, id }] = subjectIds.vectors;
        const engine = render.createFormEngine(declaring(type, keys), {
            responseSubject: { type, keys, id: 'f'.repeat(64) },
        });
        assert.equal(engine.getResponse().subject.id, id);
        assert.equal(engine.getResponse({ profile: 'on-submit' }).subject.id, id);
        engine.dispose();
        assert.equal(isWasmToolsReady(), false);
    });

    it('keeps typed refusals and derives no id for a refused subject', async () => {
        await initFormspecEngine();
        const type = 'urn:example:subject:agency-year';
        const definition = declaring(type, { ffy: 2026, uei: 'A' });
        const cases = [
            ['wrong key type', definition, { ffy: '2026', uei: 'A' }, '#subjectKeys.ffy'],
            ['missing key', definition, { ffy: 2026 }, '#subjectKeys.uei'],
            ['undeclared key', definition, { extra: 'B', ffy: 2026, uei: 'A' }, '#subjectKeys.extra'],
            ['integer outside the I-JSON range', definition, { ffy: JSON.rawJSON('9007199254740993'), uei: 'A' }, '#subjectKeys.ffy'],
        ];
        for (const [name, form, keys, path] of cases) {
            const engine = render.createFormEngine(form, { responseSubject: { type, keys, id: 'f'.repeat(64) } });
            assert.equal(engine.hasSubjectRefusal(), true, name);
            assert.deepEqual(engine.getValidationReport().results.map(result => [result.path, result.code]),
                [[path, 'TYPE_MISMATCH']], name);
            // A refused filing unit has no Core id, so no reader may hand out its schema-invalid Response.
            const refusal = new RegExp(`Response subject refused: ${path.replace(/[.#]/g, '\\$&')}: `);
            assert.throws(() => engine.getResponse(), refusal, name);
            assert.throws(() => engine.getResponseSnapshot({ profile: 'on-submit' }), refusal, name);
            assert.throws(() => engine.captureSubmitSnapshot(), refusal, name);
            engine.dispose();
        }
    });

    it('refuses a host entity without an id at construction', async () => {
        await initFormspecEngine();
        const definition = { ...declaring('unused', {}), subject: undefined };
        assert.throws(() => render.createFormEngine(definition, { responseSubject: { type: 'Grant' } }),
            /responseSubject\.id/);
    });

    it('keeps an undeclared host entity id without hashing it', async () => {
        await initFormspecEngine();
        const host = { id: 'host-entity', type: 'Grant' };
        const definition = { ...declaring('unused', {}), subject: undefined };
        const engine = render.createFormEngine(definition, { responseSubject: host });
        assert.deepEqual(engine.getResponse().subject, host);
        engine.dispose();
    });

    it('executes standard prefill Mappings in runtime WASM without loading tools WASM (fs-tco0)', async () => {
        await initFormspecEngine();
        const standardMapping = {
            $formspecMapping: '1.0',
            version: '1.0.0',
            definitionRef: 'urn:test:prefill',
            definitionVersion: '1.0.0',
            targetSchema: { format: 'json' },
            direction: 'both',
            rules: [{ sourcePath: 'displayName', targetPath: 'display_name', transform: 'preserve' }],
        };
        const reversed = createMappingEngine(standardMapping).reverse({ display_name: 'Cold Grace' });
        assert.deepEqual(reversed.diagnostics, []);
        assert.deepEqual(reversed.output, { displayName: 'Cold Grace' });
        assert.equal(isWasmToolsReady(), false);

        // External sourceSchema validation still stays in tools WASM until explicitly loaded.
        const externalSchemaMapping = {
            ...standardMapping,
            sourceSchema: {
                url: 'urn:test:source-schema',
                version: '1.0.0',
                schema: { type: 'object', properties: { displayName: { type: 'string' } } },
            },
        };
        const blocked = createMappingEngine(externalSchemaMapping).reverse({ display_name: 'Needs tools' });
        assert.equal(blocked.diagnostics[0]?.errorCode, 'WASM_NOT_READY');
        assert.equal(isWasmToolsReady(), false);
    });
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
