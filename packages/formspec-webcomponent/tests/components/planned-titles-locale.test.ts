/** @filedesc Wizard and tabs follow the shared section order and localized titles. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

import DEFINITION from '../../../../tests/fixtures/interleaved-pages.definition.json';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

const LOCALE = {
    $formspecLocale: '2.0', locale: 'fr', version: '1.0.0',
    target: { kind: 'definition', url: 'urn:test:planned-titles' },
    strings: { 'contact.label': 'Coordonnées', 'intro.label': 'Consignes', '$ui.wizard.otherItems': 'Autres éléments', '$ui.wizard.stepTitle': 'Étape {{$index}}' },
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
    it('a wizard names its steps, panels and in-panel headings by the group label the Locale gives, in authored order, with loose fields beside their group', () => {
        const el = mount('wizard', 'fr');
        expect(texts(el, '.formspec-wizard-panel .formspec-section-title')).toEqual(['Consignes', 'Coordonnées']);
        expect(texts(el, '.formspec-wizard-panel').length).toBe(2);
        expect([...el.querySelectorAll('.formspec-wizard-panel')].map((p: HTMLElement) => p.getAttribute('aria-label'))).toEqual(['Consignes', 'Coordonnées']);
        expect(el.querySelectorAll('.formspec-wizard-panel')[1].querySelector('[data-name="notes"]')).toBeTruthy();
        el.locale = 'en';
        el.render();
        expect(texts(el, '.formspec-wizard-panel .formspec-section-title')).toEqual(['Instructions', 'Contact']);
    });

    it('tabs are labelled the same way', () => {
        const el = mount('tabs', 'fr');
        expect(texts(el, '.formspec-tab')).toEqual(['Consignes', 'Coordonnées']);
    });

    it('localizes a Theme remainder section', () => {
        const el = mount('tabs', 'fr');
        el.themeDocument = { pages: [{ id: 'details', title: 'Details', regions: [{ key: 'intro' }, { key: 'contact' }] }] };
        el.render();
        expect(texts(el, '.formspec-tab')).toEqual(['Details', 'Autres éléments']);
    });

    it('uses the shared localized ordinal for an untitled authored section', () => {
        const el = mount('tabs', 'fr');
        el.componentDocument = {
            $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: DEFINITION.url },
            tree: { component: 'Stack', children: [{ component: 'Section', id: 'first',
                children: [{ component: 'Section', title: 'Details', children: [{ component: 'TextInput', bind: 'notes' }] }] }] },
        };
        el.render();
        expect(texts(el, '.formspec-tab')).toEqual(['Étape 1']);
        const title = el.querySelector('.formspec-section-title');
        const heading = [...el.querySelectorAll('h1,h2,h3,h4,h5,h6')].find(node => node.textContent === 'Details');
        expect(Number(heading?.tagName.slice(1))).toBe(Number(title?.tagName.slice(1)) + 1);
    });

    it('preserves one authored Grid ID when both tab panels are mounted', () => {
        const el = mount('tabs');
        el.componentDocument = {
            $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: DEFINITION.url },
            tree: { component: 'Grid', id: 'form-grid', columns: 2, children: [
                { component: 'Section', title: 'Contact', children: [{ component: 'TextInput', bind: 'contact.name' }] },
                { component: 'Section', title: 'Notes', children: [{ component: 'TextInput', bind: 'notes' }] },
            ] },
        };
        el.render();
        expect(texts(el, '.formspec-tab')).toEqual(['Contact', 'Notes']);
        expect(el.querySelectorAll('#form-grid')).toHaveLength(1);
    });
});
