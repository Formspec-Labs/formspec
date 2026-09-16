/** @filedesc The pre-engine skeleton is the real markup, inert — so the engine swap is controls going live. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

const LONG_HINT = 'Full legal name as it appears on your IRS determination letter, including any suffix.';

const DEFINITION = {
    $formspec: '1.0',
    url: 'urn:test:skeleton',
    version: '1.0.0',
    title: 'Skeleton',
    items: [
        { key: 'notice', type: 'display', label: 'Read this first' },
        { key: 'name', type: 'field', dataType: 'string', label: 'Organization legal name', hint: LONG_HINT },
        { key: 'age', type: 'field', dataType: 'integer', label: 'Age' },
        {
            key: 'address',
            type: 'group',
            label: 'Address',
            children: [
                { key: 'street', type: 'field', dataType: 'string', label: 'Street' },
                { key: 'city', type: 'field', dataType: 'string', label: 'City' },
            ],
        },
    ],
    binds: [{ path: 'age', relevant: 'name != null' }],
};

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    mod.globalRegistry.registerAdapter({ name: 'skeleton-ds', components: {}, rootClasses: ['ds-form', 'ds-form--large'] });
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function mount(): any {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    return el;
}

describe('pre-engine skeleton', () => {
    it('draws every unconditional field as the adapter would, with its real label and hint', () => {
        const el = mount();
        el.definition = DEFINITION;

        const container = el.querySelector('.formspec-container')!;
        expect(container.classList.contains('formspec-skeleton')).toBe(true);
        // name, street, city — `age` is gated by a Bind `relevant`, which only the engine can answer.
        expect(container.querySelectorAll('.formspec-field')).toHaveLength(3);
        expect(container.textContent).toContain('Organization legal name');
        // The hint is what makes a field two lines tall; reserving it is the point.
        expect(container.textContent).toContain(LONG_HINT);
    });

    it('shows a value as pending, never its expression', () => {
        const el = mount();
        el.definition = {
            ...DEFINITION,
            items: [
                {
                    key: 'week',
                    type: 'display',
                    label: "Claiming for the week of **{{formatDate(@instance('claimant').start, 'medium')}} to {{formatDate(@instance('claimant').end, 'medium')}}**",
                },
                { key: 'pension', type: 'field', dataType: 'boolean', label: 'Any pension from {{$payerName}}?', hint: 'Paid by {{$payerName}}' },
                {
                    key: 'jobs',
                    type: 'group',
                    label: 'Jobs',
                    repeatable: true,
                    children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
                },
            ],
            binds: [],
        };
        const text = el.querySelector('.formspec-container')!.textContent!;
        // The engine owns every `{{}}` value. Until it lands the skeleton marks the place, at a value's
        // length rather than an expression's, so what the reader sees is a form loading, not its source.
        expect(text).not.toContain('{{');
        expect(text).not.toContain('}}');
        expect(text).toContain('Claiming for the week of … to …');
        expect(text).toContain('Any pension from …?');
        expect(text).toContain('Paid by …');
        // Repeat chrome comes from the shared inventory, filled — the same words the live render draws.
        expect(text).toContain('Add Jobs');
    });

    it('renders text, not bars — nothing is left to animate', () => {
        const el = mount();
        el.definition = DEFINITION;
        const container = el.querySelector('.formspec-container')!;
        expect(container.querySelector('[class^="formspec-skeleton-"]')).toBeNull();
        expect(container.textContent).toContain('Read this first');
    });

    it('leaves every control inert while the engine boots', () => {
        const el = mount();
        el.definition = DEFINITION;
        const container = el.querySelector('.formspec-container')!;
        expect(container.getAttribute('aria-busy')).toBe('true');
        const controls = container.querySelectorAll('input, select, textarea, button');
        expect(controls.length).toBeGreaterThan(0);
        for (const control of controls) expect((control as HTMLInputElement).disabled).toBe(true);
    });

    it("carries the adapter's root classes before and after the engine arrives, so the column never changes width", () => {
        const el = mount();
        el.adapter = 'skeleton-ds';
        el.definition = DEFINITION;
        const container = el.querySelector('.formspec-container')!;
        expect([...container.classList]).toEqual(expect.arrayContaining(['ds-form', 'ds-form--large', 'formspec-skeleton']));

        el.render();

        expect([...container.classList]).toEqual(expect.arrayContaining(['formspec-container', 'ds-form', 'ds-form--large']));
        expect(container.classList.contains('formspec-skeleton')).toBe(false);
    });

    it('hands the column over on the real render', () => {
        const el = mount();
        el.definition = DEFINITION;
        const container = el.querySelector('.formspec-container')!;

        el.render();

        expect(container.hasAttribute('aria-busy')).toBe(false);
        expect(container.classList.contains('formspec-skeleton')).toBe(false);
        for (const control of container.querySelectorAll('input, select, textarea')) {
            expect((control as HTMLInputElement).disabled).toBe(false);
        }
    });
});
