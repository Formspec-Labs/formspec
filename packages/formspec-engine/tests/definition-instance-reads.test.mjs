/** @filedesc Public engine inventory matches the shared Definition fixture. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getDefinitionInstanceReads } from '../dist/index.js';

test('reports relative seed columns and FEL reads through tools WASM', () => {
    const fixture = JSON.parse(readFileSync(new URL('../../../tests/fixtures/fel/definition-instance-reads.json', import.meta.url), 'utf8'));
    assert.deepEqual(getDefinitionInstanceReads(fixture.definition), fixture.instanceReads);
});

test('keeps literal object keys distinct from array subscripts in Definition inventory (fs-xe4t)', () => {
    const definition = {
        $formspec: '1.0', url: 'urn:test:literal-vs-indexed', version: '1.0.0', status: 'draft', title: 'Reads',
        instances: { source: { data: {} } },
        items: [
            { type: 'field', key: 'lit', dataType: 'string', label: 'Lit', initialValue: "=instance('source', 'rows[1].code')" },
            { type: 'field', key: 'idx', dataType: 'string', label: 'Idx', initialValue: "=@instance('source').rows[1].code" },
        ],
    };
    assert.deepEqual(getDefinitionInstanceReads(definition), {
        source: ['["rows[1]"].code', 'rows[1].code'],
    });
});
