/** @filedesc Native Screener Locale isolation and language-switch behavior. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine';
import type { LocaleDocument, ScreenerDocument } from '@formspec-org/types';
import { FormspecScreener } from '../src/screener/FormspecScreener';
beforeAll(() => initFormspecEngine());
const screener: ScreenerDocument = {
    $formspecScreener: '1.0', url: 'urn:test:eligibility', version: '1.0.0', title: 'Eligibility',
    items: [{ key: 'eligible', type: 'field', dataType: 'boolean', label: 'Eligible?' }],
    binds: [{ path: 'eligible', required: 'true' }], routes: [],
};
const spanish: LocaleDocument = {
    $formspecLocale: '2.1', locale: 'es-US', version: '1.0.0',
    target: { kind: 'screener', url: screener.url, compatibleVersions: '1.0.0' },
    strings: { '$form.title': 'Elegibilidad', 'eligible.label': '¿Es elegible?',
        'eligible.requiredMessage': 'Se requiere una respuesta', '$ui.screener.yes': 'Sí',
        '$ui.screener.no': 'No', '$ui.screener.submit': 'Continuar' },
};
function mount(locales: LocaleDocument[] = [spanish]) {
    const div = document.createElement('div'); document.body.append(div);
    const root = createRoot(div);
    const render = (activeLocale: string) => act(() => root.render(<FormspecScreener
        screenerDocument={screener} localeDocuments={locales} activeLocale={activeLocale}
        onDetermination={() => ({ status: 'accepted' })} />));
    return { div, render };
}
describe('native Screener target Locale', () => {
    it('renders Spanish questions and native yes/no text', () => {
        const { div, render } = mount(); render('es-US');
        expect(div.querySelector('h2')?.textContent).toBe('Elegibilidad');
        expect(div.textContent).toContain('¿Es elegible?');
        expect(div.querySelector('option[value="yes"]')?.textContent).toBe('Sí');
        expect(div.querySelector('button')?.textContent).toBe('Continuar');
    });
    it('preserves explicit false across language changes', () => {
        const { div, render } = mount(); render('es-US');
        const select = div.querySelector('select')!;
        act(() => { select.value = 'no'; select.dispatchEvent(new Event('change', { bubbles: true })); });
        render('en'); expect(div.querySelector('h2')?.textContent).toBe('Eligibility');
        expect(div.querySelector('select')?.value).toBe('no');
        render('es-US'); expect(div.querySelector('select')?.value).toBe('no');
    });
    it('updates existing required errors on language change', () => {
        const { div, render } = mount(); render('en');
        act(() => div.querySelector('button')!.click());
        expect(div.textContent).toContain('Eligible? is required');
        render('es-US'); expect(div.textContent).toContain('Se requiere una respuesta');
    });
    it('ignores Definition Locale with the same URL', () => {
        const { div, render } = mount([{ ...spanish, $formspecLocale: '2.0', target: { kind: 'definition', url: screener.url } }]);
        render('es-US'); expect(div.querySelector('h2')?.textContent).toBe('Eligibility');
    });
    it('refuses incompatible target versions', () => {
        const { div, render } = mount([{ ...spanish, target: { ...spanish.target, compatibleVersions: '2.0.0' } }]);
        render('es-US'); expect(div.querySelector('[data-locale-finding]')?.getAttribute('data-locale-finding')).toBe('screener-locale-target-version');
        expect(div.querySelector('select')).toBeNull();
    });
    it('retains unresolved authored text with a visible translation warning', () => {
        const { div, render } = mount([{ ...spanish, strings: { 'eligible.label': 'Value {{unknownFunction()}}' } }]);
        render('es-US');
        expect(div.textContent).toContain('Value {{unknownFunction()}}');
        const warning = div.querySelector('[data-locale-warnings]');
        expect(warning?.textContent).toBe('Some screening text could not be translated.');
        expect(warning?.getAttribute('data-locale-warnings')).toContain('unknownFunction()');
    });

    it('treats every chrome placeholder literally rather than evaluating answers', () => {
        const { div, render } = mount([{ ...spanish, strings: { '$ui.screener.submit': 'Continue {{$eligible}}' } }]);
        render('es-US'); expect(div.querySelector('button')?.textContent).toBe('Continue {{$eligible}}');
        expect(div.querySelector('[data-locale-warnings]')).toBeNull();
    });

    it('preserves a legacy custom submit label without owned Locale resources', () => {
        const div = document.createElement('div'); document.body.append(div); const root = createRoot(div);
        act(() => root.render(<FormspecScreener screenerDocument={{ ...screener, submitLabel: 'Check now' }} />));
        expect(div.querySelector('button')?.textContent).toBe('Check now');
    });

});
