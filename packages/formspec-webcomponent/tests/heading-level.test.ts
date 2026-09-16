/** @filedesc `heading-level`: every heading the form draws takes the depth the page hands it; a section is structural, not a number. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

const DEFINITION = {
    $formspec: '1.0',
    url: 'urn:test:heading-level',
    version: '1.0.0',
    title: 'Heading level',
    items: [
        {
            key: 'eligibility',
            type: 'group',
            label: 'Eligibility',
            children: [
                { key: 'able', type: 'field', dataType: 'string', label: 'Able' },
                {
                    key: 'retirement',
                    type: 'group',
                    label: 'Retirement',
                    children: [{ key: 'pension', type: 'field', dataType: 'string', label: 'Pension' }],
                },
            ],
        },
        { key: 'certification', type: 'group', label: 'Certification', children: [{ key: 'ok', type: 'field', dataType: 'boolean', label: 'OK' }] },
    ],
    binds: [{ path: 'eligibility.able', required: 'true' }],
};

beforeAll(async () => {
    const mod = await import('../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function mount(attrs: Record<string, string> = {}, componentDocument?: unknown): any {
    const el = document.createElement('formspec-render') as any;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    document.body.appendChild(el);
    if (componentDocument) el.componentDocument = componentDocument;
    el.definition = DEFINITION;
    el.render();
    return el;
}

const titles = (el: any) => [...el.querySelectorAll('.formspec-group-title')].map((h: HTMLElement) =>
    `${h.tagName.toLowerCase()} ${h.textContent}${h.parentElement!.classList.contains('formspec-group--section') ? ' [section]' : ''}`);

/** Every heading in document order — the outline a screen reader lists. */
const outline = (el: any) => [...el.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h: HTMLElement) => `${h.tagName.toLowerCase()} ${h.textContent}`);

/** A layout the adapters head: a titled Section holding a titled Card holding a bound group, and a Stack whose title heads only a row. */
const LAYOUT = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'urn:test:heading-level' },
    tree: {
        component: 'Stack',
        children: [
            {
                component: 'Section',
                title: 'About you',
                children: [
                    {
                        component: 'Card',
                        title: 'Your record',
                        children: [{
                            component: 'Group',
                            bind: 'eligibility',
                            title: 'Eligibility',
                            children: [
                                { component: 'TextInput', bind: 'able' },
                                { component: 'Group', bind: 'retirement', title: 'Retirement', children: [{ component: 'TextInput', bind: 'pension' }] },
                            ],
                        }],
                    },
                    {
                        component: 'Stack',
                        title: 'Also',
                        children: [{ component: 'Group', bind: 'certification', title: 'Certification', children: [{ component: 'Checkbox', bind: 'ok' }] }],
                    },
                ],
            },
        ],
    },
};

describe('heading-level', () => {
    it('starts sections at h3 by default, one level deeper per titled group', () => {
        expect(titles(mount())).toEqual(['h3 Eligibility [section]', 'h4 Retirement', 'h3 Certification [section]']);
    });

    it('takes the depth the page hands it, so the outline runs unbroken from the page into the form', () => {
        // A page whose h1 titles the form: sections are h2, and still the sections — the nested h3 is not one.
        expect(titles(mount({ 'heading-level': '2' }))).toEqual(['h2 Eligibility [section]', 'h3 Retirement', 'h2 Certification [section]']);
    });

    it('heads every heading a component draws at its depth: a Section and a Card nest what they head, a Stack title does not', () => {
        // Section h2 → Card h3 → the group it heads h4 → its sub-group h5; the Stack's title is a row heading at
        // the Section's content depth, so the group after it stays at h3 — a flat step, never a skipped one.
        expect(outline(mount({ 'heading-level': '2' }, LAYOUT))).toEqual([
            'h2 About you', 'h3 Your record', 'h4 Eligibility', 'h5 Retirement', 'h3 Also', 'h3 Certification',
        ]);
    });

    it('draws the validation summary the page asks for at the depth of the form itself', () => {
        const el = mount({ 'heading-level': '2', 'show-validation-summary': '' });
        el.submit();
        const summary = el.querySelector('.formspec-validation-summary-title') as HTMLElement;
        expect(summary?.tagName).toBe('H2');
        expect(outline(el).slice(0, 2)).toEqual([`h2 ${summary.textContent}`, 'h2 Eligibility']);
    });

    it('re-renders when the level changes, and clamps to h1–h6', () => {
        const el = mount();
        el.headingLevel = 5;
        el.render();
        expect(titles(el)).toEqual(['h5 Eligibility [section]', 'h6 Retirement', 'h5 Certification [section]']);
        el.headingLevel = 9;
        expect(el.headingLevel).toBe(6);
        el.headingLevel = Number.NaN;
        expect(el.headingLevel).toBe(3);
    });
});
