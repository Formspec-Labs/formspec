/** @filedesc A Hidden field renders nothing and still carries its value into the Response and other expressions. */
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

/** One repeat row carrying the payer name as data the question text reads. */
function render(hidden: boolean) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    if (hidden) {
        el.themeDocument = { $formspecTheme: '1.0', version: '1.0.0', items: { payerName: { widget: 'Hidden' } } };
    }
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:jobs',
        version: '1.0.0',
        title: 'Jobs',
        items: [
            {
                key: 'jobs',
                type: 'group',
                label: 'Job',
                repeatable: true,
                minRepeat: 1,
                children: [
                    { key: 'payerName', type: 'field', dataType: 'string', label: 'Payer name' },
                    { key: 'hours', type: 'field', dataType: 'integer', label: 'Hours worked for {{$payerName}}' },
                ],
            },
        ],
    };
    el.render();
    return { el: el as HTMLElement, engine: el.getEngine() };
}

const labels = (el: HTMLElement) => [...el.querySelectorAll('label')].map((node) => node.textContent);

describe('Hidden field widget', () => {
    it('emits no DOM for the field — no control, no label, not even a hidden input', () => {
        const { el } = render(true);

        expect(el.querySelector('[name="jobs[0].payerName"]')).toBeNull();
        expect(el.querySelectorAll('input')).toHaveLength(1);
        expect(el.querySelector('input[type="hidden"]')).toBeNull();
        expect(labels(el)).toEqual(['Hours worked for ']);
    });

    it('keeps the value in the Response', () => {
        const { el, engine } = render(true);
        engine.setValue('jobs[0].payerName', 'ACME CORP');

        expect(engine.getResponse().data.jobs[0].payerName).toBe('ACME CORP');
        expect(el.querySelector('[name="jobs[0].payerName"]')).toBeNull();
    });

    it('still feeds {{$payerName}} in its sibling question', () => {
        const { el, engine } = render(true);
        engine.setValue('jobs[0].payerName', 'ACME CORP');

        expect(labels(el)).toEqual(['Hours worked for ACME CORP']);
    });

    it('renders the field normally without the widget', () => {
        const { el } = render(false);

        expect(el.querySelector('[name="jobs[0].payerName"]')).not.toBeNull();
        expect(labels(el)).toEqual(['Payer name', 'Hours worked for ']);
    });
});
