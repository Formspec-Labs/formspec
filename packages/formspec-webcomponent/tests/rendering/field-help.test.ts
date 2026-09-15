/** @filedesc Per-item help link from a References Document (References spec §7). */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { multiFieldDef } from '../helpers/engine-fixtures';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

const def = () => multiFieldDef([
    { key: 'workType', label: 'What type of work was this job?', dataType: 'string' },
    { key: 'other', label: 'Something else', dataType: 'string' },
]);

function render(references: unknown[] | null, options?: { locale?: any; targetUrl?: string }) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.definition = def();
    if (options?.locale) {
        el.localeDocuments = options.locale;
        el.locale = options.locale.locale;
    }
    if (references) {
        el.referencesDocuments = {
            $formspecReferences: '1.0',
            version: '1.0.0',
            targetDefinition: { url: options?.targetUrl ?? 'urn:test:form' },
            references,
        };
    }
    el.render();
    return el;
}

const helpLinks = (el: HTMLElement) => Array.from(el.querySelectorAll('a.formspec-field-help-link')) as HTMLAnchorElement[];

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((e) => e.remove());
});

describe('field help link', () => {
    it('renders nothing when no References Document is loaded', () => {
        expect(helpLinks(render(null))).toHaveLength(0);
    });

    it('renders one link on the field a human reference targets', () => {
        const el = render([
            { target: 'workType', audience: 'human', type: 'documentation', title: 'Types of work', uri: 'https://nj.gov/help/work-types' },
        ]);
        const links = helpLinks(el);
        expect(links).toHaveLength(1);
        expect(links[0].textContent).toBe('Help me answer this question');
        expect(links[0].getAttribute('href')).toBe('https://nj.gov/help/work-types');
        expect(links[0].getAttribute('target')).toBe('_blank');
        expect(links[0].getAttribute('rel')).toBe('noopener');
        expect(links[0].classList.contains('usa-link')).toBe(true);
    });

    it('sits in its own block row below the control, so it never runs into the options above it', () => {
        const el = render([
            { target: 'workType', audience: 'human', title: 'Types of work', uri: 'https://nj.gov/help/work-types' },
        ]);
        const link = helpLinks(el)[0];
        const row = link.parentElement as HTMLElement;
        // A block of its own (not an inline anchor appended to the field root): spacing is the row's, and the
        // structural sheet owns it, so both adapters get the same gap.
        expect(row.classList.contains('formspec-field-help-row')).toBe(true);
        expect(row.tagName).toBe('DIV');
        expect(row.parentElement?.getAttribute('data-name')).toBe('workType');
        expect(row.lastElementChild).toBe(link);
    });

    it('puts the link inside its own field, after the hint', () => {
        const el = render([
            { target: 'workType', audience: 'human', title: 'Types of work', uri: 'https://nj.gov/help/work-types' },
        ]);
        const field = el.querySelector('[data-name="workType"]') as HTMLElement;
        const link = field.querySelector('a.formspec-field-help-link') as HTMLElement;
        expect(link).not.toBeNull();
        const hint = field.querySelector('.formspec-hint') as HTMLElement;
        expect(hint.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect((el.querySelector('[data-name="other"]') as HTMLElement).querySelector('a.formspec-field-help-link')).toBeNull();
    });

    it('ignores an agent-audience reference', () => {
        expect(helpLinks(render([
            { target: 'workType', audience: 'agent', type: 'vector-store', title: 'KB', uri: 'https://nj.gov/kb' },
        ]))).toHaveLength(0);
    });

    it('ignores a form-level reference', () => {
        expect(helpLinks(render([
            { target: '#', audience: 'human', title: 'Form guide', uri: 'https://nj.gov/guide' },
        ]))).toHaveLength(0);
    });

    it('refuses a non-HTTPS destination rather than rendering a dead link', () => {
        expect(helpLinks(render([
            { target: 'workType', audience: 'human', title: 'Bad', uri: 'javascript:alert(1)' },
        ]))).toHaveLength(0);
    });

    it('takes the first reference with an admissible URI, in priority order', () => {
        const el = render([
            { target: 'workType', audience: 'human', title: 'Supplementary', uri: 'https://nj.gov/second' },
            { target: 'workType', audience: 'both', title: 'Primary', priority: 'primary', uri: 'https://nj.gov/first' },
        ]);
        expect(helpLinks(el)[0].getAttribute('href')).toBe('https://nj.gov/first');
    });

    it('labels the link from Locale <key>.helpLabel', () => {
        const el = render(
            [{ target: 'workType', audience: 'human', title: 'Types', uri: 'https://nj.gov/help' }],
            {
                locale: {
                    $formspecLocale: '2.0',
                    locale: 'en',
                    version: '1.0.0',
                    target: { kind: 'definition', url: 'urn:test:form' },
                    strings: { 'workType.helpLabel': 'What counts as gig work?' },
                },
            },
        );
        expect(helpLinks(el)[0].textContent).toBe('What counts as gig work?');
    });

    it('refuses a References Document written for another Definition', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const el = render(
            [{ target: 'workType', audience: 'human', title: 'Types', uri: 'https://nj.gov/help' }],
            { targetUrl: 'urn:test:other-form' },
        );
        expect(helpLinks(el)).toHaveLength(0);
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });
});
