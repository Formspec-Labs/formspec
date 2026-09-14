/** @filedesc A component `when` inside a repeat row resolves `$sibling` in that row (Core §3.2.1). */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

describe('component when inside a repeat row', () => {
    afterEach(() => {
        document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
    });

    it('shows the conditional component only in rows whose sibling matches', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:row-when' },
            tree: {
                component: 'Stack',
                children: [
                    {
                        component: 'Stack',
                        bind: 'jobs',
                        children: [
                            { component: 'TextInput', bind: 'employer' },
                            { component: 'TextInput', bind: 'supervisor', when: "$employer = 'Acme'" },
                        ],
                    },
                ],
            },
        };
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:row-when',
            version: '1.0.0',
            title: 'Jobs',
            items: [
                { key: 'employer', type: 'field', dataType: 'string', label: 'Your own employer' },
                {
                    key: 'jobs',
                    type: 'group',
                    label: 'Jobs',
                    repeatable: true,
                    minRepeat: 2,
                    children: [
                        { key: 'employer', type: 'field', dataType: 'string', label: 'Employer' },
                        { key: 'supervisor', type: 'field', dataType: 'string', label: 'Supervisor' },
                    ],
                },
            ],
        };
        el.render();
        const engine = el.getEngine();
        engine.setValue('employer', 'Acme');
        engine.setValue('jobs[0].employer', 'Acme');
        engine.setValue('jobs[1].employer', 'Beta');

        const whenWrapper = (row: number) =>
            el.querySelector(`[data-name="jobs[${row}].supervisor"]`)?.closest('.formspec-when') as HTMLElement | null;
        expect(whenWrapper(0)?.classList.contains('formspec-hidden')).toBe(false);
        expect(whenWrapper(1)?.classList.contains('formspec-hidden')).toBe(true);
    });
});
