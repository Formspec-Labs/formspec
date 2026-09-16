/** @filedesc Assist draft.3 C6: a field the assistant wrote is marked, validated at once, and announced; §8.2 tool text is plain and capped. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

const DEFINITION = {
    $formspec: '1.0',
    url: 'urn:test:assist-filled',
    version: '1.0.0',
    title: 'Grant application',
    description: 'Apply for a **community** grant.',
    items: [
        { key: 'name', type: 'field', dataType: 'string', label: 'Legal name' },
        { key: 'ein', type: 'field', dataType: 'string', label: 'Employer **ID**', hint: 'Nine digits.' },
        { key: 'region', type: 'field', dataType: 'choice', label: 'Region', options: [{ value: 'n', label: 'North' }, { value: 's', label: 'South' }] },
    ],
    binds: [
        { path: 'name', required: 'true' },
        { path: 'ein', required: 'true', constraint: 'length($) == 9', constraintMessage: 'Enter nine digits.' },
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

function mount(definition: Record<string, unknown> = DEFINITION, attrs: Record<string, string> = {}): any {
    const el = document.createElement('formspec-render') as any;
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    document.body.appendChild(el);
    el.definition = definition;
    el.render();
    return el;
}

const fieldRoot = (el: any, path: string): HTMLElement => el.querySelector(`.formspec-field[data-name="${path}"], [data-name="${path}"]`);
const errorText = (el: any, path: string): string => fieldRoot(el, path).querySelector('.formspec-error')?.textContent ?? '';
const liveRegion = (el: any): HTMLElement | null => el.querySelector('[aria-live="polite"][data-formspec-assist-announcer]');
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('assistant-written fields (assist-spec §8, draft.3 C6)', () => {
    it('marks the field root when the assistant writes it, and shows its validation without a blur', () => {
        const el = mount();
        expect(fieldRoot(el, 'ein').hasAttribute('data-formspec-agent-filled')).toBe(false);
        expect(errorText(el, 'ein')).toBe('');

        el.engine.setValue('ein', '12', { source: 'assist' });

        expect(fieldRoot(el, 'ein').getAttribute('data-formspec-agent-filled')).toBe('');
        expect(errorText(el, 'ein')).toBe('Enter nine digits.');
        expect(fieldRoot(el, 'ein').querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
        // Only the written field is touched: its sibling stays quiet until the respondent reaches it.
        expect(errorText(el, 'name')).toBe('');
    });

    it('clears the mark when the respondent edits the field; the validation stays shown', () => {
        const el = mount();
        el.engine.setValue('ein', '12', { source: 'assist' });
        el.engine.setValue('ein', '123', { source: 'user' });
        expect(fieldRoot(el, 'ein').hasAttribute('data-formspec-agent-filled')).toBe(false);
        expect(errorText(el, 'ein')).toBe('Enter nine digits.');
    });

    it('a respondent write never marks the field', () => {
        const el = mount();
        el.engine.setValue('name', 'Ada', { source: 'user' });
        el.engine.setValue('region', 'n');
        expect(fieldRoot(el, 'name').hasAttribute('data-formspec-agent-filled')).toBe(false);
        expect(fieldRoot(el, 'region').hasAttribute('data-formspec-agent-filled')).toBe(false);
    });

    it('announces one assist write through a polite live region on the render root, by plain label', async () => {
        const el = mount();
        const region = liveRegion(el);
        expect(region).not.toBeNull();
        expect(region!.classList.contains('formspec-sr-only')).toBe(true);
        expect(region!.textContent).toBe('');

        el.engine.setValue('ein', '123456789', { source: 'assist' });
        expect(region!.textContent).toBe('');
        await nextFrame();
        expect(region!.textContent).toBe('Employer ID filled by your assistant');
    });

    it('announces a write batch once, every label in one message', async () => {
        const el = mount();
        el.engine.setValue('name', 'Ada', { source: 'assist' });
        el.engine.setValue('ein', '123456789', { source: 'assist' });
        el.engine.setValue('region', 'n', { source: 'assist' });
        await nextFrame();
        expect(liveRegion(el)!.textContent).toBe('Legal name, Employer ID, Region filled by your assistant');
    });

    it('announces again when the assistant rewrites a field it already wrote (the value changed, the source did not)', async () => {
        const el = mount();
        const region = liveRegion(el)!;
        el.engine.setValue('ein', '123456789', { source: 'assist' });
        await nextFrame();
        expect(region.textContent).toBe('Employer ID filled by your assistant');
        region.textContent = '';

        el.engine.setValue('ein', '987654321', { source: 'assist' });
        await nextFrame();
        expect(region.textContent).toBe('Employer ID filled by your assistant');
    });

    it('does not re-announce a field that is re-rendered while still assistant-written, and keeps its mark', async () => {
        const el = mount();
        el.engine.setValue('ein', '123456789', { source: 'assist' });
        await nextFrame();
        const region = liveRegion(el)!;
        region.textContent = '';
        el.render();
        await nextFrame();
        expect(region.textContent).toBe('');
        expect(fieldRoot(el, 'ein').getAttribute('data-formspec-agent-filled')).toBe('');
    });

    it('takes the announcement wording from the Locale ($ui.assist.filled) when one authors it', async () => {
        const el = mount();
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:assist-filled' },
            strings: { 'name.label': 'Nom légal', '$ui.assist.filled': '{{$label}} rempli par votre assistant' },
        };
        el.locale = 'fr';
        el.engine.setValue('name', 'Ada', { source: 'assist' });
        await nextFrame();
        expect(liveRegion(el)!.textContent).toBe('Nom légal rempli par votre assistant');
    });
});

describe('declarative tool text caps (assist-spec §8.2)', () => {
    const root = (el: any): HTMLElement => el.querySelector('.formspec-container');

    it('strips markup from tooldescription and caps it at 500 characters with an ellipsis', () => {
        expect(root(mount(DEFINITION, { 'tool-name': '' })).getAttribute('tooldescription')).toBe('Apply for a community grant.');

        const long = 'word '.repeat(200).trim();
        const description = root(mount({ ...DEFINITION, description: long }, { 'tool-name': '' })).getAttribute('tooldescription')!;
        // Cut at a character boundary, trailing space trimmed before the ellipsis: never over the cap, never far under it.
        expect(description.length).toBeLessThanOrEqual(500);
        expect(description.length).toBeGreaterThan(490);
        expect(description.endsWith('…')).toBe(true);
        expect(description.startsWith('word word')).toBe(true);
    });

    it('caps toolparamdescription at 150 characters with an ellipsis', () => {
        const hint = 'x'.repeat(300);
        const el = mount({ ...DEFINITION, items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Legal name', hint }] });
        const description = el.querySelector('input[name="name"]').getAttribute('toolparamdescription');
        expect(description.length).toBe(150);
        expect(description).toBe(`${'x'.repeat(149)}…`);
    });
});
