/** @filedesc Public engine inventory matches the shared Definition fixture. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getDefinitionInstanceReads } from '../dist/index.js';

test('reports relative seed columns and FEL reads through tools WASM', () => {
    const fixture = JSON.parse(readFileSync(new URL('../../../tests/fixtures/fel/definition-instance-reads.json', import.meta.url), 'utf8'));
    assert.deepEqual(getDefinitionInstanceReads(fixture.definition), fixture.instanceReads);
});
