/** @filedesc applyResponseDataToEngine keeps every saved repeat row, including rows past maxRepeat. */
import { describe, it, expect } from 'vitest';
import { createFormEngine } from '@formspec-org/engine/render';
import { applyResponseDataToEngine } from '../src/hydrate-response-data';

const definition = {
    $formspec: '1.0',
    url: 'urn:test:hydrate',
    version: '1.0.0',
    title: 'Hydrate',
    items: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
        {
            key: 'jobs',
            type: 'group',
            label: 'Job',
            repeatable: true,
            maxRepeat: 2,
            children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
        },
    ],
} as any;

describe('applyResponseDataToEngine', () => {
    it('keeps saved repeat rows past maxRepeat and reports MAX_REPEAT', () => {
        const engine = createFormEngine(definition);

        applyResponseDataToEngine(engine, {
            name: 'Ada',
            jobs: [{ employer: 'ACME' }, { employer: 'Globex' }, { employer: 'Initech' }],
        });

        expect(engine.signals.name.value).toBe('Ada');
        expect(engine.repeats.jobs.value).toBe(3);
        expect(engine.signals['jobs[2].employer'].value).toBe('Initech');
        expect(engine.getResponse().data.jobs).toEqual([
            { employer: 'ACME' },
            { employer: 'Globex' },
            { employer: 'Initech' },
        ]);
        expect(engine.getValidationReport().results.map((result) => result.code)).toContain('MAX_REPEAT');
    });
});
