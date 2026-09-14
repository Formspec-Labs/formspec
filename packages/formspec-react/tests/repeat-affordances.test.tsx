/** @filedesc Repeat chrome gated on group relevance and minRepeat/maxRepeat (parity with the webcomponent repeat-affordances suite). */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

/** Jobs repeat (1..2) shown only when `worked` is 'yes' — core §4.2.2 cardinality + Bind `relevant`. */
const jobsDefinition = {
    $formspec: '1.0',
    url: 'urn:test:jobs',
    version: '1.0.0',
    title: 'Jobs',
    items: [
        { key: 'worked', type: 'field', dataType: 'string', label: 'Worked' },
        {
            key: 'jobs',
            type: 'group',
            label: 'Job',
            repeatable: true,
            minRepeat: 1,
            maxRepeat: 2,
            children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
        },
    ],
    binds: [{ path: 'jobs', relevant: "$worked = 'yes'" }],
};

function componentDocument(tree: unknown) {
    return {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:jobs' },
        tree,
    };
}

const suites = [
    { name: 'repeat template (definition fallback)', tree: undefined },
    {
        name: 'Accordion bound to the repeat',
        tree: {
            component: 'Stack',
            children: [
                { component: 'TextInput', bind: 'worked' },
                { component: 'Accordion', bind: 'jobs', children: [{ component: 'TextInput', bind: 'employer' }] },
            ],
        },
    },
];

function render(tree: unknown) {
    const engine = createFormEngine(jobsDefinition);
    const container = actRender(
        <FormspecForm
            engine={engine}
            {...(tree ? { componentDocument: componentDocument(tree) } : {})}
        />,
    );
    return { container, engine };
}

for (const suite of suites) {
    describe(`repeat affordances — ${suite.name}`, () => {
        it('renders no repeat chrome while the group is not relevant', () => {
            const { container, engine } = render(suite.tree);
            expect(container.querySelector('.formspec-repeat[data-bind="jobs"]')).toBeNull();
            expect(container.querySelector('.formspec-repeat-add')).toBeNull();

            act(() => engine.setValue('worked', 'yes'));
            expect(container.querySelector('.formspec-repeat[data-bind="jobs"]')).toBeTruthy();

            act(() => engine.setValue('worked', 'no'));
            expect(container.querySelector('.formspec-repeat[data-bind="jobs"]')).toBeNull();
        });

        it('hides Add once the count reaches maxRepeat and shows it again below', () => {
            const { container, engine } = render(suite.tree);
            act(() => engine.setValue('worked', 'yes'));
            const addButton = () => container.querySelector<HTMLButtonElement>('.formspec-repeat-add');
            expect(addButton()).toBeTruthy();

            act(() => addButton()!.click());
            expect(engine.repeats.jobs.value).toBe(2);
            expect(addButton()).toBeNull();

            act(() => engine.removeRepeatInstance('jobs', 1));
            expect(addButton()).toBeTruthy();
        });

        it('offers Remove only while the count is above minRepeat', () => {
            const { container, engine } = render(suite.tree);
            act(() => engine.setValue('worked', 'yes'));
            expect(engine.repeats.jobs.value).toBe(1);
            expect(container.querySelectorAll('.formspec-repeat-remove')).toHaveLength(0);

            act(() => engine.addRepeatInstance('jobs'));
            expect(container.querySelectorAll('.formspec-repeat-remove')).toHaveLength(2);
        });
    });
}

describe('repeat affordances — DataTable bound to the repeat', () => {
    const tree = {
        component: 'Stack',
        children: [
            { component: 'TextInput', bind: 'worked' },
            {
                component: 'DataTable',
                bind: 'jobs',
                allowAdd: true,
                allowRemove: true,
                columns: [{ header: 'Employer', bind: 'employer' }],
            },
        ],
    };

    it('renders no table while the group is not relevant', () => {
        const { container, engine } = render(tree);
        expect(container.querySelector('.formspec-data-table-wrapper')).toBeNull();

        act(() => engine.setValue('worked', 'yes'));
        expect(container.querySelector('.formspec-data-table-wrapper')).toBeTruthy();
    });

    it('hides Add Row at maxRepeat and Remove at or below minRepeat', () => {
        const { container, engine } = render(tree);
        act(() => engine.setValue('worked', 'yes'));
        const add = () => container.querySelector<HTMLButtonElement>('.formspec-datatable-add');
        expect(container.querySelectorAll('.formspec-datatable-remove')).toHaveLength(0);

        act(() => add()!.click());
        expect(engine.repeats.jobs.value).toBe(2);
        expect(add()).toBeNull();
        expect(container.querySelectorAll('.formspec-datatable-remove')).toHaveLength(2);
    });
});
