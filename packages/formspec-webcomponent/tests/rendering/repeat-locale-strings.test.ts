/** @filedesc A repeatable group's row, Add and Remove text comes from the Locale (§3.1.1), derived only when it is silent. */
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

function render(strings: Record<string, string>, locale = 'en') {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.localeDocuments = [
        {
            $formspecLocale: '2.0',
            locale: 'en',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:jobs' },
            strings: locale === 'en' ? strings : {},
        },
        {
            $formspecLocale: '2.0',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:jobs' },
            strings: locale === 'fr' ? strings : {},
        },
    ];
    el.locale = locale;
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:jobs',
        version: '1.0.0',
        title: 'Jobs',
        items: [
            {
                key: 'jobs',
                type: 'group',
                label: 'Job',
                repeatable: true,
                minRepeat: 1,
                children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
            },
        ],
    };
    el.render();
    // Two rows, so `{{@count}}` and the per-row aria names have something to distinguish.
    el.getEngine().addRepeatInstance('jobs');
    return { el: el as HTMLElement, engine: el.getEngine() };
}

const rowLabels = (el: HTMLElement) =>
    [...el.querySelectorAll('.formspec-repeat-instance-label')].map((node) => node.textContent);
const removeLabels = (el: HTMLElement) =>
    [...el.querySelectorAll('.formspec-repeat-remove')].map((node) => node.textContent);

describe('repeat chrome Locale strings', () => {
    it('derives row, Add and Remove text from the group label when the Locale is silent', () => {
        const { el } = render({});

        expect(rowLabels(el)).toEqual(['Job 1', 'Job 2']);
        expect(el.querySelector('.formspec-repeat-add')?.textContent).toBe('Add Job');
        expect(removeLabels(el)).toEqual(['Remove Job', 'Remove Job']);
    });

    it('takes rowLabel, addLabel and removeLabel from the Locale, interpolated per instance', () => {
        const { el } = render({
            'jobs.rowLabel': 'Job {{@index}} of {{@count}}',
            'jobs.addLabel': 'Add another job',
            'jobs.removeLabel': 'Delete this job',
        });

        expect(rowLabels(el)).toEqual(['Job 1 of 2', 'Job 2 of 2']);
        expect(el.querySelector('.formspec-repeat-add')?.textContent).toBe('Add another job');
        expect(removeLabels(el)).toEqual(['Delete this job', 'Delete this job']);
    });

    it('keeps an authored Remove label as the accessible name, and derives the row index otherwise', () => {
        const authored = render({ 'jobs.removeLabel': 'Delete job {{@index}}' });
        expect([...authored.el.querySelectorAll('.formspec-repeat-remove')]
            .map((node) => node.getAttribute('aria-label')))
            .toEqual(['Delete job 1', 'Delete job 2']);

        const derived = render({});
        expect([...derived.el.querySelectorAll('.formspec-repeat-remove')]
            .map((node) => node.getAttribute('aria-label')))
            .toEqual(['Remove Job 1', 'Remove Job 2']);
    });

    it('suppresses the visible row heading on an empty rowLabel and keeps the accessible name', () => {
        const { el } = render({ 'jobs.rowLabel': '' });

        expect(rowLabels(el)).toEqual(['', '']);
        expect([...el.querySelectorAll('.formspec-repeat-instance')].map((r) => r.getAttribute('aria-label')))
            .toEqual(['Job 1 of 2', 'Job 2 of 2']);
    });

    it('follows a locale switch without re-rendering the rows', () => {
        const { el } = render({ 'jobs.rowLabel': 'Emploi {{@index}}', 'jobs.addLabel': 'Ajouter' }, 'fr');
        const input = el.querySelector('input') as HTMLInputElement;

        expect(rowLabels(el)).toEqual(['Emploi 1', 'Emploi 2']);
        (el as any).locale = 'en';
        expect(rowLabels(el)).toEqual(['Job 1', 'Job 2']);
        expect(input.isConnected).toBe(true);
    });
});
