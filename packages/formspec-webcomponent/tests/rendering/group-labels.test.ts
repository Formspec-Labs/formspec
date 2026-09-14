/** @filedesc Group Item labels render through Locale `<key>.label` and FEL `{{}}`, live, like display Items. */
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

const french = {
    $formspecLocale: '2.0',
    locale: 'fr',
    version: '1.0.0',
    target: { kind: 'definition', url: 'urn:test:groups' },
    strings: { 'address.label': 'Adresse de {{$name}}', 'jobs.label': 'Emploi' },
};

const items = [
    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    {
        key: 'address',
        type: 'group',
        label: 'Address of {{$name}}',
        children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }],
    },
    {
        key: 'jobs',
        type: 'group',
        label: 'Job',
        repeatable: true,
        minRepeat: 1,
        maxRepeat: 3,
        children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
    },
];

function render(tree?: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.localeDocuments = french;
    if (tree) {
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:groups' },
            tree,
        };
    }
    el.definition = { $formspec: '1.0', url: 'urn:test:groups', version: '1.0.0', title: 'Groups', items };
    el.render();
    return { el, engine: el.getEngine() };
}

const text = (node: Element | null) => node?.textContent ?? null;

describe('group Item labels', () => {
    it('interpolate the group heading and follow the Locale live', () => {
        const { el, engine } = render();
        const heading = el.querySelector('.formspec-group[data-bind="address"] .formspec-group-title, .formspec-group .formspec-group-title');
        engine.setValue('name', 'Ada');
        expect(text(heading)).toBe('Address of Ada');

        el.locale = 'fr';
        expect(text(heading)).toBe('Adresse de Ada');
    });

    it('label repeat chrome with the localized group label', () => {
        const { el, engine } = render();
        el.locale = 'fr';
        const repeat = el.querySelector('.formspec-repeat[data-bind="jobs"]');
        expect(text(repeat.querySelector('.formspec-repeat-add'))).toBe('Add Emploi');
        expect(text(repeat.querySelector('.formspec-repeat-instance-label'))).toBe('Emploi 1');

        engine.addRepeatInstance('jobs');
        expect(text(repeat.querySelector('.formspec-repeat-remove'))).toBe('Remove Emploi');
        expect(repeat.querySelector('.formspec-repeat-remove').getAttribute('aria-label')).toBe('Remove Emploi 1');
    });

    it('label a repeat-bound Accordion with the localized group label', () => {
        const { el, engine } = render({
            component: 'Stack',
            children: [{ component: 'Accordion', bind: 'jobs', children: [{ component: 'TextInput', bind: 'employer' }] }],
        });
        el.locale = 'fr';
        const repeat = el.querySelector('.formspec-repeat--accordion');
        expect(text(repeat.querySelector('.formspec-repeat-add'))).toBe('Add Emploi');

        engine.addRepeatInstance('jobs');
        expect(repeat.querySelector('.formspec-repeat-remove').getAttribute('aria-label')).toBe('Remove Emploi 1');
    });
});
