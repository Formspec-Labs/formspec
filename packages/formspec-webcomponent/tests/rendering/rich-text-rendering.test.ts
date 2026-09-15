/** @filedesc Rich-text subset and requiredIndicator rendering in the default adapter (core §4.2.1, theme §5.2). */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { singleFieldDef, multiFieldDef } from '../helpers/engine-fixtures';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function render(def: any, themeDoc?: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    if (themeDoc) el.themeDocument = themeDoc;
    el.definition = def;
    el.render();
    return el;
}

const theme = (defaults: Record<string, unknown>) => ({
    $formspecTheme: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'urn:test:form' },
    defaults,
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

describe('hint — rich-text subset', () => {
    it('renders a paragraph plus a bulleted list', () => {
        const el = render(singleFieldDef({
            hint: "Answer 'No' if something is preventing you. Some examples include:\n- Physical or mental health\n- Transportation",
        }));
        const hint = el.querySelector('.formspec-hint') as HTMLElement;
        expect(hint.querySelector('ul')).not.toBeNull();
        expect(hint.querySelectorAll('li')).toHaveLength(2);
        expect(Array.from(hint.querySelectorAll('li'), (li: any) => li.textContent))
            .toEqual(['Physical or mental health', 'Transportation']);
    });

    it('carries the USWDS list class alongside the Formspec one', () => {
        const el = render(singleFieldDef({ hint: '- One\n- Two' }));
        const ul = el.querySelector('.formspec-hint ul') as HTMLElement;
        expect(ul.className).toBe('formspec-rich-list usa-list');
    });

    it('leaves a plain hint as plain text with no added elements', () => {
        const el = render(singleFieldDef({ hint: '200 characters allowed' }));
        const hint = el.querySelector('.formspec-hint') as HTMLElement;
        expect(hint.textContent).toBe('200 characters allowed');
        expect(hint.childElementCount).toBe(0);
    });

    it('hides the hint while empty', () => {
        const el = render(singleFieldDef({}));
        expect((el.querySelector('.formspec-hint') as HTMLElement).hidden).toBe(true);
    });
});

describe('label — rich-text subset', () => {
    it('renders **strong** inside the label without breaking `for`', () => {
        const el = render(singleFieldDef({ label: 'Week of **03/23/2025 to 03/29/2025**' }));
        const label = el.querySelector('label.formspec-label') as HTMLLabelElement;
        expect(label.querySelector('strong')?.textContent).toBe('03/23/2025 to 03/29/2025');
        expect(label.htmlFor).toBe((el.querySelector('input') as HTMLInputElement).id);
    });

    it('renders a link inside the label', () => {
        const el = render(singleFieldDef({
            label: 'I understand that [false information](https://nj.gov/penalties) may apply.',
        }));
        const a = el.querySelector('label.formspec-label a') as HTMLAnchorElement;
        expect(a.getAttribute('href')).toBe('https://nj.gov/penalties');
        expect(a.className).toBe('formspec-rich-link usa-link');
        expect(a.getAttribute('rel')).toBe('noopener');
        expect(a.getAttribute('target')).toBe('_blank');
    });

    it('keeps block structure out of a label — flattened to line-separated runs', () => {
        const el = render(singleFieldDef({ label: 'First.\n\nSecond.' }));
        const label = el.querySelector('label.formspec-label') as HTMLElement;
        expect(label.querySelector('p')).toBeNull();
        expect(label.querySelector('br')).not.toBeNull();
    });

    it('does not open a new tab for a mailto link', () => {
        const el = render(singleFieldDef({ label: 'Write [us](mailto:help@nj.gov).' }));
        const a = el.querySelector('label.formspec-label a') as HTMLAnchorElement;
        expect(a.getAttribute('target')).toBeNull();
        expect(a.getAttribute('rel')).toBe('noopener');
    });

    it('leaves a javascript: link as literal text — no anchor', () => {
        const el = render(singleFieldDef({ label: 'Click [here](javascript:alert(1)) now' }));
        const label = el.querySelector('label.formspec-label') as HTMLElement;
        expect(label.querySelector('a')).toBeNull();
        expect(label.textContent).toContain('[here](javascript:alert(1))');
    });

    it('never builds markup from an interpolated value', () => {
        // Core §4.2.1: interpolate first, then parse — the value is literal text either way.
        const el = render(multiFieldDef([
            { key: 'note', label: 'Note', dataType: 'string' },
            { key: 'echo', label: 'You wrote {{note}}', dataType: 'string' },
        ]));
        el.engine.setValue('note', '**not bold** - not a bullet');
        const label = Array.from(el.querySelectorAll('label.formspec-label'))
            .find((l: any) => l.textContent.startsWith('You wrote')) as HTMLElement;
        expect(label.querySelector('strong')).toBeNull();
        expect(label.querySelector('ul')).toBeNull();
        expect(label.textContent).toContain('**not bold** - not a bullet');
    });
});

describe('theme requiredIndicator', () => {
    it('shows the asterisk by default', () => {
        const el = render(singleFieldDef({ required: true }));
        const label = el.querySelector('.formspec-label') as HTMLElement;
        expect(label.querySelector('.formspec-required')).not.toBeNull();
    });

    it("drops the visible marker under defaults.requiredIndicator 'none'", () => {
        const el = render(singleFieldDef({ required: true }), theme({ requiredIndicator: 'none' }));
        const label = el.querySelector('.formspec-label') as HTMLElement;
        expect(label.querySelector('.formspec-required')).toBeNull();
        expect(label.textContent).not.toContain('*');
    });

    it('keeps aria-required when the marker is suppressed', () => {
        const el = render(singleFieldDef({ required: true }), theme({ requiredIndicator: 'none' }));
        expect((el.querySelector('input') as HTMLInputElement).getAttribute('aria-required')).toBe('true');
    });

    it('lets a per-item override restore the marker', () => {
        const el = render(singleFieldDef({ required: true }), {
            ...theme({ requiredIndicator: 'none' }),
            items: { name: { requiredIndicator: 'marker' } },
        });
        expect((el.querySelector('.formspec-label') as HTMLElement).querySelector('.formspec-required')).not.toBeNull();
    });
});
