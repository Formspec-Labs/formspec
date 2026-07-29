/** @filedesc Tests for locale integration on <formspec-render>. */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { singleFieldDef } from './helpers/engine-fixtures';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

describe('locale integration', () => {
    let el: InstanceType<any>;

    beforeEach(() => {
        el = document.createElement('formspec-render');
        document.body.appendChild(el);
    });

    afterEach(() => {
        el.remove();
    });

    // -- localeDocuments setter --

    it('buffers locale documents set before definition', () => {
        const localeDoc = {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: { 'name.label': 'Nom' },
        };
        // Set locale docs before definition — should not throw
        el.localeDocuments = localeDoc;
        expect(el.getEngine()).toBeNull();
    });

    it('loads buffered locale documents when engine is created', () => {
        const localeDoc = {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: { 'name.label': 'Nom' },
        };
        el.localeDocuments = localeDoc;
        el.definition = singleFieldDef();
        el.render();
        const engine = el.getEngine();
        expect(engine).not.toBeNull();
        expect(engine.getAvailableLocales()).toContain('fr');
    });

    it('loads locale documents directly when engine exists', () => {
        el.definition = singleFieldDef();
        el.render();
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'de',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: { 'name.label': 'Name (DE)' },
        };
        expect(el.getEngine().getAvailableLocales()).toContain('de');
    });

    it('accepts an array of locale documents', () => {
        el.definition = singleFieldDef();
        el.render();
        el.localeDocuments = [
            {
                $formspecLocale: '2.0',
                locale: 'fr',
                version: '1.0.0',
                target: { kind: 'definition', url: 'urn:test:form' },
                strings: { 'name.label': 'Nom' },
            },
            {
                $formspecLocale: '2.0',
                locale: 'es',
                version: '1.0.0',
                target: { kind: 'definition', url: 'urn:test:form' },
                strings: { 'name.label': 'Nombre' },
            },
        ];
        const locales = el.getEngine().getAvailableLocales();
        expect(locales).toContain('fr');
        expect(locales).toContain('es');
    });

    // -- locale setter --

    it('sets the active locale on the engine', () => {
        el.definition = singleFieldDef();
        el.render();
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: {},
        };
        el.locale = 'fr';
        expect(el.getEngine().getActiveLocale()).toBe('fr');
    });

    it('sets lang attribute for accessibility', () => {
        el.definition = singleFieldDef();
        el.render();
        el.locale = 'fr';
        expect(el.getAttribute('lang')).toBe('fr');
    });

    it('sets dir attribute from engine locale direction', () => {
        // Use a definition with direction: 'auto' so RTL detection works
        el.definition = {
            ...singleFieldDef(),
            formPresentation: { direction: 'auto' },
        };
        el.render();
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'ar',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: {},
        };
        el.locale = 'ar';
        expect(el.getAttribute('dir')).toBe('rtl');
    });

    it('sets dir=ltr for non-RTL locales', () => {
        el.definition = {
            ...singleFieldDef(),
            formPresentation: { direction: 'auto' },
        };
        el.render();
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'en',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: {},
        };
        el.locale = 'en';
        expect(el.getAttribute('dir')).toBe('ltr');
    });

    it('buffers locale set before definition and applies after engine creation', () => {
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: {},
        };
        el.locale = 'fr';
        el.definition = singleFieldDef();
        el.render();
        expect(el.getEngine().getActiveLocale()).toBe('fr');
        expect(el.getAttribute('lang')).toBe('fr');
    });

    it('locale getter returns the current locale code', () => {
        el.locale = 'fr';
        expect(el.locale).toBe('fr');
    });
});
