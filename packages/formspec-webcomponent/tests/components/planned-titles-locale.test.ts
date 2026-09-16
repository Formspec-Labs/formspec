/** @filedesc A wizard or tabs step planned from a group is titled by that group's live label; the step nobody authored by `$ui.wizard.otherItems`. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

const DEFINITION = {
    $formspec: '1.0', url: 'urn:test:planned-titles', version: '1.0.0', title: 'Planned titles',
    items: [
        { key: 'contact', type: 'group', label: 'Contact', children: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }] },
        { key: 'notes', type: 'field', dataType: 'string', label: 'Notes' },
    ],
};

const LOCALE = {
    $formspecLocale: '2.0', locale: 'fr', version: '1.0.0',
    target: { kind: 'definition', url: 'urn:test:planned-titles' },
    strings: { 'contact.label': 'Coordonnées', '$ui.wizard.otherItems': 'Autres éléments' },
};

function mount(pageMode: 'wizard' | 'tabs', locale?: string): any {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.localeDocuments = [LOCALE];
    el.definition = { ...DEFINITION, formPresentation: { pageMode } };
    if (locale) el.locale = locale;
    el.render();
    return el;
}

const texts = (el: any, selector: string) => [...el.querySelectorAll(selector)].map((n: HTMLElement) => n.textContent?.trim());

describe('planned titles follow the Locale', () => {
    it('a wizard names its steps, panels and in-panel headings by the group label the Locale gives, and its fallback step by $ui.wizard.otherItems', () => {
        const el = mount('wizard', 'fr');
        expect(texts(el, '.formspec-wizard-panel .formspec-section-title')).toEqual(['Coordonnées', 'Autres éléments']);
        expect(texts(el, '.formspec-wizard-panel').length).toBe(2);
        expect([...el.querySelectorAll('.formspec-wizard-panel')].map((p: HTMLElement) => p.getAttribute('aria-label'))).toEqual(['Coordonnées', 'Autres éléments']);
        el.locale = 'en';
        el.render();
        expect(texts(el, '.formspec-wizard-panel .formspec-section-title')).toEqual(['Contact', 'Additional items']);
    });

    it('tabs are labelled the same way', () => {
        const el = mount('tabs', 'fr');
        expect(texts(el, '.formspec-tab')).toEqual(['Coordonnées', 'Autres éléments']);
    });
});
