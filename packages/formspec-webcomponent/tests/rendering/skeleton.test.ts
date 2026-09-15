/** @filedesc The pre-engine skeleton draws the planned tree, so the real render replaces it in place. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

const DEFINITION = {
    $formspec: '1.0',
    url: 'urn:test:skeleton',
    version: '1.0.0',
    title: 'Skeleton',
    items: [
        { key: 'notice', type: 'display', label: 'Read this first' },
        { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
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
};

/** Every planned field, however deep — what the skeleton must account for. */
function plannedFieldCount(items: any[]): number {
    return items.reduce((total, item) => {
        if (item.type === 'field') return total + 1;
        return total + (item.children ? plannedFieldCount(item.children) : 0);
    }, 0);
}

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

function mount(): any {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    return el;
}

describe('pre-engine skeleton', () => {
    it('draws one placeholder per planned field, before any engine exists', () => {
        const el = mount();
        el.engine = null;
        el.definition = DEFINITION;

        const container = el.querySelector('.formspec-container')!;
        expect(container.classList.contains('formspec-skeleton')).toBe(true);
        expect(container.querySelectorAll('.formspec-skeleton-field')).toHaveLength(
            plannedFieldCount(DEFINITION.items),
        );
    });

    it('sizes each placeholder control at its widget’s nominal height', () => {
        const el = mount();
        el.definition = DEFINITION;

        const controls = [...el.querySelectorAll('.formspec-skeleton-control')] as HTMLElement[];
        expect(controls.length).toBeGreaterThan(0);
        for (const control of controls) expect(control.style.height).toMatch(/^\d+(\.\d+)?rem$/);
    });

    it('marks the column busy while it is a skeleton, and clears that on the real render', () => {
        const el = mount();
        el.definition = DEFINITION;
        const container = el.querySelector('.formspec-container')!;
        expect(container.getAttribute('aria-busy')).toBe('true');

        el.render();

        expect(container.hasAttribute('aria-busy')).toBe(false);
        expect(container.classList.contains('formspec-skeleton')).toBe(false);
        expect(container.querySelectorAll('.formspec-skeleton-field')).toHaveLength(0);
    });

    it('keeps the placeholders hidden from assistive technology', () => {
        const el = mount();
        el.definition = DEFINITION;
        const blocks = el.querySelectorAll('.formspec-skeleton-field, .formspec-skeleton-title');
        expect(blocks.length).toBeGreaterThan(0);
        for (const block of blocks) expect(block.getAttribute('aria-hidden')).toBe('true');
    });
});
