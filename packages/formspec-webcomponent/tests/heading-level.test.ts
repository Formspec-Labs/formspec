/** @filedesc `heading-level`: the form's sections take the depth the page hands them; a section is structural, not a number. */
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
};

beforeAll(async () => {
    const mod = await import('../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function mount(attrs: Record<string, string> = {}): any {
    const el = document.createElement('formspec-render') as any;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    document.body.appendChild(el);
    el.definition = DEFINITION;
    el.render();
    return el;
}

const titles = (el: any) => [...el.querySelectorAll('.formspec-group-title')].map((h: HTMLElement) =>
    `${h.tagName.toLowerCase()} ${h.textContent}${h.parentElement!.classList.contains('formspec-group--section') ? ' [section]' : ''}`);

describe('heading-level', () => {
    it('starts sections at h3 by default, one level deeper per titled group', () => {
        expect(titles(mount())).toEqual(['h3 Eligibility [section]', 'h4 Retirement', 'h3 Certification [section]']);
    });

    it('takes the depth the page hands it, so the outline runs unbroken from the page into the form', () => {
        // A page whose h1 titles the form: sections are h2, and still the sections — the nested h3 is not one.
        expect(titles(mount({ 'heading-level': '2' }))).toEqual(['h2 Eligibility [section]', 'h3 Retirement', 'h2 Certification [section]']);
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
