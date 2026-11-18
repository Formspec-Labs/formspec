/** @filedesc Shared selection and subject identity vectors through tools WASM. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { responseSubjectId, selectResponses } from '../dist/index.js';

const readFixture = (path) => parseJsonExact(readFileSync(
    new URL(`../../../tests/conformance/fixtures/${path}.json`, import.meta.url), 'utf8'
));
const suite = readFixture('response-selection/selection');
const { vectors, refusals } = readFixture('subject-id/vectors');

describe('Response selection through WASM', () => {
    for (const fixture of suite.cases) {
        it(fixture.name, () => {
            const actual = selectResponses(
                fixture.records.map((name) => suite.records[name]),
                { ...suite.selection, ...fixture.selection },
                { ...suite.context, ...fixture.context },
            );
            assert.deepEqual(actual, fixture.expected);
            if (fixture.name === 'projected decimal retains exact source digits') {
                // JSON.rawJSON leaves retain their spelling under JSON.stringify.
                assert.match(JSON.stringify(actual), /1\.234567890123456789/);
            }
        });
    }
    it('requires the upstream subject declaration even for empty reads', () => {
        const fixture = suite.missingUpstreamSubject;
        assert.throws(
            () => selectResponses(
                [],
                { ...suite.selection, ...fixture.selection },
                fixture.context,
            ),
            new RegExp(fixture.expectedError),
        );
    });
    for (const vector of vectors) {
        it(`subject id: ${vector.name}`, () => {
            assert.equal(responseSubjectId(vector.type, vector.keys), vector.id);
        });
    }
    for (const fixture of refusals) {
        it(`subject id refuses: ${fixture.name}`, () => {
            assert.throws(
                () => responseSubjectId(fixture.type, fixture.keys),
                new RegExp(fixture.expectedError),
            );
        });
    }
});
