/** @filedesc Display and group labels follow the engine label context: Locale `label@context` and `labels[context]`. */
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

describe('item labels under a label context', () => {
    it('re-render display text and group headings when the label context changes', () => {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:label-context' },
            strings: { 'note.label@short': 'Note {{$name}}' },
        };
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:label-context',
            version: '1.0.0',
            title: 'Label context',
            items: [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'note', type: 'display', label: 'A longer note for {{$name}}' },
                {
                    key: 'address',
                    type: 'group',
                    label: 'Mailing address',
                    labels: { short: 'Address' },
                    children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }],
                },
            ],
        };
        el.render();
        const engine = el.getEngine();
        engine.setValue('name', 'Ada');
        el.locale = 'fr';

        const note = () => el.querySelector('.formspec-text')?.textContent;
        const heading = () => el.querySelector('.formspec-group-title')?.textContent;
        expect(note()).toBe('A longer note for Ada');
        expect(heading()).toBe('Mailing address');

        engine.setLabelContext('short');
        expect(note()).toBe('Note Ada');
        expect(heading()).toBe('Address');

        engine.setLabelContext(null);
        expect(note()).toBe('A longer note for Ada');
        expect(heading()).toBe('Mailing address');
    });
});
