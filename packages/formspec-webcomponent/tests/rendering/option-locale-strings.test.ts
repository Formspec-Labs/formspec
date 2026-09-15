/** @filedesc Option labels follow the Locale cascade (field key, $optionSet, inline) and a locale switch (Locale spec §3.1). */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

const definition = {
    $formspec: '1.0',
    url: 'urn:test:form',
    version: '1.0.0',
    title: 'Options',
    optionSets: { yesNo: { options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] } },
    items: [
        { key: 'able', type: 'field', dataType: 'choice', label: 'Able?', optionSet: 'yesNo' },
        { key: 'kind', type: 'field', dataType: 'choice', label: 'Kind', options: [{ value: 'regular', label: 'Regular' }, { value: 'gig', label: 'Gig' }] },
        { key: 'state', type: 'field', dataType: 'choice', label: 'State', options: [{ value: 'nj', label: 'New Jersey' }, { value: 'ny', label: 'New York' }] },
    ],
};

const es = {
    $formspecLocale: '2.0',
    locale: 'es',
    version: '1.0.0',
    target: { kind: 'definition', url: 'urn:test:form' },
    strings: {
        '$optionSet.yesNo.yes.label': 'Sí',
        'kind.options.regular.label': 'Regular (es)',
        'kind.options.gig.label': 'Por encargo',
        'state.options.nj.label': 'Nueva Jersey',
    },
};

const theme = {
    $formspecTheme: '1.0',
    version: '1.0.0',
    name: 'test',
    targetDefinition: { url: 'urn:test:form' },
    selectors: [{ match: { dataType: 'choice' }, apply: { widget: 'RadioGroup' } }],
    items: { state: { widget: 'Select' } },
};

function render() {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.localeDocuments = [es];
    el.themeDocument = theme;
    el.definition = definition;
    el.render();
    return el;
}

// The default adapter wraps each radio in its label: `<label><input type=radio> Yes</label>`.
const radioLabels = (el: HTMLElement, key: string) =>
    Array.from(el.querySelectorAll(`[data-name="${key}"] label`))
        .filter((label) => label.querySelector('input[type=radio]'))
        .map((label) => label.textContent?.trim());
const selectLabels = (el: HTMLElement, key: string) =>
    Array.from(el.querySelectorAll(`[data-name="${key}"] option`)).map((o) => o.textContent?.trim()).filter((t) => t && !/Select|Clear/.test(t));

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((e) => e.remove());
});

describe('option labels and the Locale', () => {
    it('render the Definition labels until a locale is active', () => {
        const el = render();
        expect(radioLabels(el, 'able')).toEqual(['Yes', 'No']);
        expect(radioLabels(el, 'kind')).toEqual(['Regular', 'Gig']);
    });

    it('follow a locale switch through the field-key and $optionSet keys, leaving unauthored options alone', () => {
        const el = render();
        el.locale = 'es';
        expect(radioLabels(el, 'able')).toEqual(['Sí', 'No']);
        expect(radioLabels(el, 'kind')).toEqual(['Regular (es)', 'Por encargo']);
        expect(selectLabels(el, 'state')).toEqual(['Nueva Jersey', 'New York']);
        el.locale = 'en';
        expect(radioLabels(el, 'able')).toEqual(['Yes', 'No']);
    });
});
