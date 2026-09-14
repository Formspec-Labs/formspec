/** @filedesc Locale `$component.<id>.<prop>` strings (array elements included) follow the active locale without re-rendering rows. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(async () => {
    const mod = await import('../../src/index');
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', mod.FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

const URL = 'urn:test:component-strings';

const items = [
    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    { key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' },
    { key: 'address', type: 'group', label: 'Address', children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }] },
    {
        key: 'jobs', type: 'group', label: 'Job', repeatable: true, minRepeat: 2,
        children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
    },
];

/** Render `tree` with an inactive French Locale Document holding `strings`. */
function render(tree: unknown, strings: Record<string, string>) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.localeDocuments = {
        $formspecLocale: '2.0', locale: 'fr', version: '1.0.0', target: { kind: 'definition', url: URL }, strings,
    };
    el.initialData = { name: 'Ada' };
    el.componentDocument = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: URL }, tree };
    el.definition = { $formspec: '1.0', url: URL, version: '1.0.0', title: 'Strings', items };
    el.render();
    return el;
}

const texts = (root: ParentNode, selector: string) =>
    Array.from(root.querySelectorAll(selector), (node) => node.textContent);
const attr = (root: ParentNode, selector: string, name: string) => root.querySelector(selector)?.getAttribute(name);

describe('$component Locale strings follow a locale switch', () => {
    it('updates scalar component strings rendered before the switch', () => {
        const el = render(
            {
                component: 'Stack',
                children: [
                    { component: 'Heading', id: 'intro', level: 2, text: 'Hello' },
                    { component: 'Card', id: 'card', title: 'Card', subtitle: 'Sub', children: [] },
                    { component: 'Stack', id: 'block', title: 'Block', description: 'About', children: [] },
                    { component: 'Collapsible', id: 'more', title: 'More', children: [] },
                    { component: 'Panel', id: 'side', title: 'Side', children: [] },
                    { component: 'Modal', id: 'help', title: 'Help', triggerLabel: 'Open help', children: [] },
                    { component: 'Popover', id: 'tip', title: 'Tip', triggerLabel: 'Why?', children: [] },
                    { component: 'ProgressBar', id: 'progress', label: 'Progress', value: 10 },
                    { component: 'Alert', id: 'note', severity: 'info', text: 'Note' },
                    { component: 'Badge', id: 'tag', text: 'New' },
                    { component: 'ActionButton', id: 'go', actionRef: 'none', label: { literal: 'Go' } },
                    { component: 'Stack', id: 'addressBlock', bind: 'address', title: 'Mailing', children: [{ component: 'TextInput', bind: 'city' }] },
                ],
            },
            {
                '$component.intro.text': 'Bonjour {{$name}}',
                '$component.card.title': 'Carte',
                '$component.card.subtitle': 'Sous-titre',
                '$component.block.title': 'Bloc',
                '$component.block.description': 'À propos',
                '$component.more.title': 'Plus',
                '$component.side.title': 'Côté',
                '$component.help.title': 'Aide',
                '$component.help.triggerLabel': "Ouvrir l'aide",
                '$component.tip.title': 'Astuce',
                '$component.tip.triggerLabel': 'Pourquoi ?',
                '$component.progress.label': 'Progression',
                '$component.note.text': 'Remarque',
                '$component.tag.text': 'Nouveau',
                '$component.go.label': 'Aller',
                '$component.addressBlock.title': 'Adresse de {{$name}}',
            },
        );
        expect(texts(el, 'h2.formspec-heading')).toEqual(['Hello']);

        el.locale = 'fr';
        expect(texts(el, 'h2.formspec-heading')).toEqual(['Bonjour Ada']);
        expect(texts(el, '.formspec-card-title')).toEqual(['Carte']);
        expect(texts(el, '.formspec-card-subtitle')).toEqual(['Sous-titre']);
        expect(texts(el, '#block > .formspec-layout-title')).toEqual(['Bloc']);
        expect(texts(el, '#block > .formspec-layout-description')).toEqual(['À propos']);
        expect(texts(el, '#more > summary')).toEqual(['Plus']);
        expect(texts(el, '#side .formspec-panel-header')).toEqual(['Côté']);
        expect(texts(el, '#help .formspec-modal-title')).toEqual(['Aide']);
        expect(texts(el, '.formspec-modal-trigger')).toEqual(["Ouvrir l'aide"]);
        expect(texts(el, '#tip .formspec-popover-trigger')).toEqual(['Pourquoi ?']);
        expect(attr(el, '#tip .formspec-popover-content', 'aria-label')).toBe('Astuce');
        expect(attr(el, '#progress progress', 'aria-label')).toBe('Progression');
        expect(texts(el, '#note span')).toEqual(['Remarque']);
        expect(texts(el, '#tag')).toEqual(['Nouveau']);
        expect(texts(el, '#go')).toEqual(['Aller']);
        expect(texts(el, '.formspec-group-title')).toEqual(['Adresse de Ada']);

        el.getEngine().setValue('name', 'Grace');
        expect(texts(el, '.formspec-group-title')).toEqual(['Adresse de Grace']);
        el.locale = 'en';
        expect(texts(el, '#more > summary')).toEqual(['More']);
        expect(texts(el, '.formspec-group-title')).toEqual(['Mailing']);
    });

    it('keeps repeat rows mounted while their component strings follow the switch', () => {
        const el = render(
            {
                component: 'Stack',
                bind: 'jobs',
                children: [
                    { component: 'Heading', id: 'jobHeading', level: 3, text: 'Job' },
                    { component: 'TextInput', bind: 'employer' },
                ],
            },
            { '$component.jobHeading.text': 'Emploi {{@index}}' },
        );
        const employer = el.querySelector('input[name="jobs[1].employer"]') as HTMLInputElement;
        expect(employer).not.toBeNull();

        el.locale = 'fr';
        expect(texts(el, '.formspec-repeat-instance h3')).toEqual(['Emploi 1', 'Emploi 2']);
        expect(employer.isConnected).toBe(true);
    });
});

describe('$component Locale strings inside array props (Locale §3.1.8)', () => {
    it('resolves tabLabels[N], labels[N], columns[N].header, and items[N].label, and follows the locale', () => {
        const el = render(
            {
                component: 'Stack',
                children: [
                    {
                        component: 'Tabs', id: 'mainTabs', tabLabels: ['Personal', 'Employment'],
                        children: [
                            { component: 'Stack', children: [{ component: 'TextInput', bind: 'name' }] },
                            { component: 'Stack', children: [{ component: 'NumberInput', bind: 'amount' }] },
                        ],
                    },
                    { component: 'Accordion', id: 'faq', labels: ['FAQ', 'More'], children: [{ component: 'Text', text: 'a' }, { component: 'Text', text: 'b' }] },
                    {
                        component: 'DataTable', id: 'jobTable', bind: 'jobs', allowAdd: true,
                        columns: [{ header: 'Employer', bind: 'employer' }],
                    },
                    { component: 'Summary', id: 'recap', items: [{ label: 'Name', bind: 'name' }, { label: 'Amount', bind: 'amount' }] },
                ],
            },
            {
                '$component.mainTabs.tabLabels[1]': 'Emploi de {{$name}}',
                '$component.faq.labels[0]': 'Questions',
                '$component.jobTable.columns[0].header': 'Employeur',
                '$component.recap.items[1].label': 'Montant',
            },
        );
        expect(texts(el, '[role="tab"]')).toEqual(['Personal', 'Employment']);
        const cell = el.querySelector('.formspec-data-table tbody input') as HTMLInputElement;

        el.locale = 'fr';
        expect(texts(el, '[role="tab"]')).toEqual(['Personal', 'Emploi de Ada']);
        expect(texts(el, '#faq > .formspec-accordion-item > summary')).toEqual(['Questions', 'More']);
        expect(texts(el, '.formspec-data-table th')).toEqual(['Employeur']);
        expect(cell.isConnected).toBe(true);
        expect(cell.getAttribute('aria-label')).toBe('Employeur, Row 1');
        expect(texts(el, '.formspec-summary dt')).toEqual(['Name', 'Montant']);
    });

    it('labels repeat-bound Accordion sections from labels[N]', () => {
        const el = render(
            {
                component: 'Accordion', id: 'jobSections', bind: 'jobs', labels: ['First', 'Second'],
                children: [{ component: 'TextInput', bind: 'employer' }],
            },
            { '$component.jobSections.labels[1]': 'Deuxième' },
        );
        expect(texts(el, '.formspec-accordion-item > summary')).toEqual(['First', 'Second']);
        el.locale = 'fr';
        expect(texts(el, '.formspec-accordion-item > summary')).toEqual(['First', 'Deuxième']);
    });
});
