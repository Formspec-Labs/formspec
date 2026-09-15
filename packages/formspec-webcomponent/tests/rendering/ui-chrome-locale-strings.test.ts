/** @filedesc Renderer chrome strings (Locale §3.1.10 $ui.<ChromeStringKey>) switch on a locale change and back. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { singleFieldDef, minimalTheme } from '../helpers/engine-fixtures';

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

/** English (empty strings) + Spanish, both bound to the same `urn:test:form` target. */
function localeDocs(esStrings: Record<string, string>) {
    return [
        {
            $formspecLocale: '2.0',
            locale: 'en',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: {},
        },
        {
            $formspecLocale: '2.0',
            locale: 'es',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: esStrings,
        },
    ];
}

describe('$ui.repeat.add — switches the rendered Add button', () => {
    function renderJobs(esStrings: Record<string, string>) {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.localeDocuments = localeDocs(esStrings);
        el.locale = 'en';
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
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
        return el;
    }

    it('follows $ui.repeat.add on locale switch, and back', () => {
        const el = renderJobs({ '$ui.repeat.add': 'Agregar {{$label}}' });
        const addBtn = () => el.querySelector('.formspec-repeat-add') as HTMLElement;

        expect(addBtn().textContent).toBe('Add Job');
        el.locale = 'es';
        expect(addBtn().textContent).toBe('Agregar Job');
        el.locale = 'en';
        expect(addBtn().textContent).toBe('Add Job');
    });

    it('an authored <key>.addLabel still beats $ui.repeat.add', () => {
        const el = renderJobs({ '$ui.repeat.add': 'Agregar {{$label}}', 'jobs.addLabel': 'Agregar otro empleo' });
        const addBtn = () => el.querySelector('.formspec-repeat-add') as HTMLElement;

        el.locale = 'es';
        expect(addBtn().textContent).toBe('Agregar otro empleo');
    });

    it("names an authored row through $ui.repeat.rowNamed, so the ' of ' glue follows the Locale too", () => {
        const el = renderJobs({ 'jobs.rowLabel': 'Empleo {{@index}}', '$ui.repeat.rowNamed': '{{$label}} de {{$total}}' });
        const rowName = () => el.querySelector('.formspec-repeat-instance')?.getAttribute('aria-label');

        expect(rowName()).toBe('Job 1 of 1');
        el.locale = 'es';
        expect(rowName()).toBe('Empleo 1 de 1');
        el.locale = 'en';
        expect(rowName()).toBe('Job 1 of 1');
    });
});

describe('$ui.select.placeholder — switches the native Select placeholder', () => {
    function renderSelect(esStrings: Record<string, string>) {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.localeDocuments = localeDocs(esStrings);
        el.locale = 'en';
        el.definition = singleFieldDef({
            dataType: 'choice',
            options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
        });
        el.definition = { ...el.definition, url: 'urn:test:form' };
        el.render();
        return el;
    }

    it('follows $ui.select.placeholder on locale switch, and back', () => {
        const el = renderSelect({ '$ui.select.placeholder': 'Seleccione…' });
        const placeholder = () =>
            (el.querySelector('select option[value=""]') as HTMLOptionElement).textContent;

        expect(placeholder()).toBe('Select…');
        el.locale = 'es';
        expect(placeholder()).toBe('Seleccione…');
        el.locale = 'en';
        expect(placeholder()).toBe('Select…');
    });
});

describe('$ui.characterCount.left — switches the counter status', () => {
    function renderCounted(esStrings: Record<string, string>) {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.localeDocuments = localeDocs(esStrings);
        el.locale = 'en';
        el.themeDocument = minimalTheme({
            selectors: [{ match: { dataType: 'text' }, apply: { widget: 'TextInput', widgetConfig: { maxLength: 10 } } }],
        });
        el.definition = { ...singleFieldDef({ dataType: 'text' }), url: 'urn:test:form' };
        el.render();
        return el;
    }

    it('follows $ui.characterCount.left on locale switch, and back', () => {
        const el = renderCounted({ '$ui.characterCount.left': 'Quedan {{$count}} caracteres' });
        const status = () => (el.querySelector('.formspec-character-count') as HTMLElement).textContent;
        const textarea = el.querySelector('textarea') as HTMLTextAreaElement;
        textarea.value = 'abc';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));

        expect(status()).toBe('7 characters left');
        el.locale = 'es';
        expect(status()).toBe('Quedan 7 caracteres');
        el.locale = 'en';
        expect(status()).toBe('7 characters left');
    });
});

describe('$ui.wizard.next — switches the wizard Next button', () => {
    function renderWizard(esStrings: Record<string, string>) {
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.localeDocuments = localeDocs(esStrings);
        el.locale = 'en';
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            tree: {
                component: 'Stack',
                children: [
                    { component: 'Section', children: [{ component: 'Text', text: 'Step 1' }] },
                    { component: 'Section', children: [{ component: 'Text', text: 'Step 2' }] },
                ],
            },
        };
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Test',
            items: [],
            formPresentation: { pageMode: 'wizard' },
        };
        el.render();
        return el;
    }

    it('follows $ui.wizard.next on locale switch, and back', () => {
        const el = renderWizard({ '$ui.wizard.next': 'Siguiente' });
        const nextBtn = () => el.querySelector('.formspec-wizard-next') as HTMLElement;

        expect(nextBtn().textContent).toBe('Next');
        el.locale = 'es';
        expect(nextBtn().textContent).toBe('Siguiente');
        el.locale = 'en';
        expect(nextBtn().textContent).toBe('Next');
    });
});
