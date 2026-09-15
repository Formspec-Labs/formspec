/** @filedesc Per-element adapter resolution, THEME-ADAPTER-MISSING findings, and ref-counted stylesheet linking. */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

let FormspecRender: any;
let globalRegistry: any;
let LAYOUT_HREF: string;
let DEFAULT_ADAPTER_HREF: string;

const DS_CSS = 'https://cdn.example.org/wp2-ds.css';
const OTHER_CSS = 'https://cdn.example.org/wp2-other.css';
const THEME_CSS = 'https://cdn.example.org/wp2-theme.css';

beforeAll(async () => {
    const mod = await import('../../src/index');
    const sheets = await import('../../src/styling/stylesheets');
    const { defaultAdapter } = await import('../../src/adapters/default/index');
    FormspecRender = mod.FormspecRender;
    globalRegistry = mod.globalRegistry;
    LAYOUT_HREF = sheets.LAYOUT_STYLESHEET_HREF;
    DEFAULT_ADAPTER_HREF = defaultAdapter.stylesheets![0];
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
    globalRegistry.registerAdapter({ name: 'wp2-ds', components: {}, stylesheets: [DS_CSS] });
    globalRegistry.registerAdapter({ name: 'wp2-other', components: {}, stylesheets: [OTHER_CSS] });
});

const shadowHosts: HTMLDivElement[] = [];

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
    shadowHosts.splice(0).forEach((host) => {
        host.shadowRoot?.querySelectorAll('formspec-render').forEach((el) => el.remove());
        host.remove();
    });
    globalRegistry.setAdapter('default');
});

function theme(extra: Record<string, unknown> = {}) {
    return {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:adapter' },
        ...extra,
    };
}

/** Linked Formspec stylesheets in document order, within one root. */
function linkedHrefs(root: ParentNode = document.head): string[] {
    return [...root.querySelectorAll('link[data-formspec-theme-href]')]
        .map((link) => (link as HTMLLinkElement).dataset.formspecThemeHref!);
}

function mount(): any {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    return el;
}

/** A connected shadow root, the arrangement a host uses when it wants CSS isolation. */
function mountShadow(count = 1): { shadow: ShadowRoot; elements: any[] } {
    const host = document.createElement('div');
    document.body.appendChild(host);
    shadowHosts.push(host);
    const shadow = host.attachShadow({ mode: 'open' });
    const elements = Array.from({ length: count }, () => {
        const el = document.createElement('formspec-render') as any;
        shadow.appendChild(el);
        return el;
    });
    return { shadow, elements };
}

describe('adapter resolution precedence', () => {
    it('falls back to the default adapter when nothing names one', () => {
        const el = mount();
        el.themeDocument = theme();
        expect(el.resolvedAdapterName).toBe('default');
    });

    it('uses the adapter the theme names', () => {
        const el = mount();
        el.themeDocument = theme({ adapter: 'wp2-ds' });
        expect(el.resolvedAdapterName).toBe('wp2-ds');
    });

    it('lets the element adapter property override the theme', () => {
        const el = mount();
        el.adapter = 'wp2-other';
        el.themeDocument = theme({ adapter: 'wp2-ds' });
        expect(el.resolvedAdapterName).toBe('wp2-other');
    });

    it('uses the global active adapter when the theme names none', () => {
        globalRegistry.setAdapter('wp2-ds');
        const el = mount();
        el.themeDocument = theme();
        expect(el.resolvedAdapterName).toBe('wp2-ds');
    });

    it('prefers the theme adapter over the global active adapter', () => {
        globalRegistry.setAdapter('wp2-other');
        const el = mount();
        el.themeDocument = theme({ adapter: 'wp2-ds' });
        expect(el.resolvedAdapterName).toBe('wp2-ds');
    });

    it('resolves per element — two themes on one page get two adapters', () => {
        const a = mount();
        const b = mount();
        a.themeDocument = theme({ adapter: 'wp2-ds' });
        b.themeDocument = theme({ adapter: 'wp2-other' });
        expect(a.resolvedAdapterName).toBe('wp2-ds');
        expect(b.resolvedAdapterName).toBe('wp2-other');
        expect(linkedHrefs()).toContain(DS_CSS);
        expect(linkedHrefs()).toContain(OTHER_CSS);
    });
});

describe('THEME-ADAPTER-MISSING', () => {
    it('emits a finding event and renders with the fallback adapter', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount();
        const findings: any[] = [];
        el.addEventListener('formspec-theme-finding', (e: any) => findings.push(e));

        el.themeDocument = theme({ adapter: 'not-registered' });

        expect(el.resolvedAdapterName).toBe('default');
        expect(findings).toHaveLength(1);
        expect(findings[0].bubbles).toBe(true);
        expect(findings[0].composed).toBe(true);
        expect(findings[0].detail.finding).toMatchObject({
            code: 'THEME-ADAPTER-MISSING',
            severity: 'error',
            adapter: 'not-registered',
        });
        expect(typeof findings[0].detail.finding.message).toBe('string');
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    it('warns once per theme set, not once per resolution', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount();
        el.themeDocument = theme({ adapter: 'not-registered' });
        void el.resolvedAdapterName;
        void el.resolvedAdapterName;
        expect(warn).toHaveBeenCalledTimes(1);

        el.themeDocument = theme({ adapter: 'not-registered' });
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });

    it('links the fallback adapter stylesheet, not the missing one', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = mount();
        el.themeDocument = theme({ adapter: 'not-registered' });
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DEFAULT_ADAPTER_HREF]);
        warn.mockRestore();
    });
});

describe('stylesheet linking', () => {
    it('links layout, then the adapter, then the theme stylesheets', () => {
        const el = mount();
        el.themeDocument = theme({ adapter: 'wp2-ds', stylesheets: [THEME_CSS] });
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DS_CSS, THEME_CSS]);
    });

    it('links the default adapter stylesheet when no adapter is named', () => {
        const el = mount();
        el.themeDocument = theme();
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DEFAULT_ADAPTER_HREF]);
    });

    it('links structural layout CSS even before any theme is set', () => {
        mount();
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DEFAULT_ADAPTER_HREF]);
    });

    it('does not duplicate a href the theme and the adapter both declare', () => {
        const el = mount();
        el.themeDocument = theme({ adapter: 'wp2-ds', stylesheets: [DS_CSS] });
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DS_CSS]);
    });

    it('ref-counts shared hrefs across two elements and unlinks on disconnect', () => {
        const a = mount();
        const b = mount();
        a.themeDocument = theme({ adapter: 'wp2-ds' });
        b.themeDocument = theme({ adapter: 'wp2-ds' });
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DS_CSS]);

        a.remove();
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DS_CSS]);

        b.remove();
        expect(linkedHrefs()).toEqual([]);
    });

    it('swaps adapter stylesheets when the element adapter changes', () => {
        const el = mount();
        el.themeDocument = theme({ adapter: 'wp2-ds' });
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DS_CSS]);

        el.adapter = 'wp2-other';
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, OTHER_CSS]);
    });

    it('links into the shadow root hosting the element, never the document head', () => {
        const { shadow, elements: [el] } = mountShadow();
        el.themeDocument = theme({ adapter: 'wp2-ds', stylesheets: [THEME_CSS] });
        expect(linkedHrefs(shadow)).toEqual([LAYOUT_HREF, DS_CSS, THEME_CSS]);
        expect(linkedHrefs()).toEqual([]);
    });

    it('ref-counts within one shadow root', () => {
        const { shadow, elements: [a, b] } = mountShadow(2);
        a.themeDocument = theme({ adapter: 'wp2-ds' });
        b.themeDocument = theme({ adapter: 'wp2-ds' });
        expect(linkedHrefs(shadow)).toEqual([LAYOUT_HREF, DS_CSS]);

        a.remove();
        expect(linkedHrefs(shadow)).toEqual([LAYOUT_HREF, DS_CSS]);

        b.remove();
        expect(linkedHrefs(shadow)).toEqual([]);
    });

    it('counts each root separately — the last element in one root leaves the other linked', () => {
        const inDocument = mount();
        const { shadow, elements: [inShadow] } = mountShadow();
        inDocument.themeDocument = theme({ adapter: 'wp2-ds' });
        inShadow.themeDocument = theme({ adapter: 'wp2-ds' });
        expect(linkedHrefs()).toEqual([LAYOUT_HREF, DS_CSS]);
        expect(linkedHrefs(shadow)).toEqual([LAYOUT_HREF, DS_CSS]);

        inDocument.remove();
        expect(linkedHrefs()).toEqual([]);
        expect(linkedHrefs(shadow)).toEqual([LAYOUT_HREF, DS_CSS]);
    });

    it('unloads the theme stylesheet when the theme is replaced', () => {
        const el = mount();
        el.themeDocument = theme({ stylesheets: [THEME_CSS] });
        expect(linkedHrefs()).toContain(THEME_CSS);

        el.themeDocument = theme();
        expect(linkedHrefs()).not.toContain(THEME_CSS);
    });
});
