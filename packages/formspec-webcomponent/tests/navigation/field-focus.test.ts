/** @filedesc focusField opens the disclosure (Collapsible, Accordion item) hiding its target before focusing. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function render(tree: any, items: any[]) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:focus' },
        tree,
    };
    el.definition = { $formspec: '1.0', url: 'urn:test:focus', version: '1.0.0', title: 'Focus', items };
    el.render();
    return el;
}

describe('focusField — closed Accordion', () => {
    it('opens the Accordion item holding the field', () => {
        const el = render(
            {
                component: 'Accordion',
                labels: ['Name', 'Contact'],
                children: [{ component: 'TextInput', bind: 'name' }, { component: 'TextInput', bind: 'email' }],
            },
            [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
            ],
        );
        const item = el.querySelector('[data-name="email"]').closest('details') as HTMLDetailsElement;
        expect(item.open).toBe(false);

        expect(el.focusField('email')).toBe(true);

        expect(item.open).toBe(true);
        expect(document.activeElement).toBe(el.querySelector('[data-name="email"] input'));
    });

    it('opens the repeat Accordion item holding an instance field', () => {
        const el = render(
            { component: 'Accordion', bind: 'jobs', children: [{ component: 'TextInput', bind: 'employer' }] },
            [{
                key: 'jobs', type: 'group', label: 'Job', repeatable: true, minRepeat: 2,
                children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
            }],
        );
        const first = el.querySelector('[data-name="jobs[0].employer"]').closest('details') as HTMLDetailsElement;
        expect(first.open).toBe(false);

        expect(el.focusField('jobs[0].employer')).toBe(true);

        expect(first.open).toBe(true);
    });
});
