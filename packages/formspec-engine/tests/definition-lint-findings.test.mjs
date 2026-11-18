/** @filedesc Engine lint exposes the canonical Rust fixtures at their authored Definition slots. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { lintDocument } from '../dist/index.js';

test('FEL and Shape diagnostics survive the tools WASM boundary in every lint mode', () => {
    const registry = JSON.parse(readFileSync(new URL('../../../specs/lint-codes.json', import.meta.url), 'utf8'));
    const expectedPaths = {
        E315: '$.shapes[1].id', E314: '$.shapes[0].explanation',
        E401: '$.items[0].initialValue', E402: '$.items[0].initialValue',
        E403: '$.items[0].initialValue', E404: '$.items[0].initialValue',
        E405: '$.items[0].initialValue', W405: '$.items[0].initialValue',
        E407: '$.items[0].initialValue',
    };
    for (const [code, path] of Object.entries(expectedPaths)) {
        const rule = registry.rules.find(entry => entry.code === code);
        const fixture = new URL('../../../' + rule.fixtures[0], import.meta.url);
        const definition = JSON.parse(readFileSync(fixture, 'utf8'));
        for (const mode of ['runtime', 'authoring', 'strict']) {
            const matches = lintDocument(definition, { mode }).diagnostics.filter(finding => finding.code === code);
            assert.deepEqual(matches.map(finding => [finding.path, finding.severity]), [[path, rule.severity]], code + ' in ' + mode);
        }
    }
});
