/** @filedesc Locale `$component.<id>.<prop>` strings and group labels in React (parity with webcomponent resolveCompText and itemLabel). */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const URL = 'urn:test:component-strings';

function render(items: any[], strings: Record<string, string>, tree?: unknown) {
    const engine = createFormEngine({ $formspec: '1.0', url: URL, version: '1.0.0', title: 'Strings', items });
    engine.loadLocale({
        $formspecLocale: '2.0',
        locale: 'fr',
        version: '1.0.0',
        target: { kind: 'definition', url: URL },
        strings,
    } as any);
    const componentDocument = tree
        ? { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: URL }, tree }
        : undefined;
    const container = actRender(<FormspecForm engine={engine} {...(componentDocument ? { componentDocument } : {})} />);
    return { container, engine };
}

const texts = (root: ParentNode, selector: string) =>
    Array.from(root.querySelectorAll(selector), (node) => node.textContent);

const jobs = [{
    key: 'jobs', type: 'group', label: 'Job', repeatable: true, minRepeat: 2,
    children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
}];

describe('$component Locale strings', () => {
    it('replace a component string prop in form scope and follow the active locale', () => {
        const { container, engine } = render(
            [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
            { '$component.intro.text': 'Bonjour {{$name}}', '$component.more.title': 'Plus' },
            {
                component: 'Stack',
                children: [
                    { component: 'Heading', id: 'intro', level: 2, text: 'Hello' },
                    { component: 'Collapsible', id: 'more', title: 'More', children: [] },
                    { component: 'TextInput', bind: 'name' },
                ],
            },
        );
        act(() => engine.setValue('name', 'Ada'));
        expect(texts(container, 'h2')).toEqual(['Hello']);
        expect(texts(container, 'summary')).toEqual(['More']);

        act(() => engine.setLocale('fr'));
        expect(texts(container, 'h2')).toEqual(['Bonjour Ada']);
        expect(texts(container, 'summary')).toEqual(['Plus']);
    });

    it('replace array-element strings (tabLabels[N], labels[N], columns[N].header, items[N].label) and follow the locale', () => {
        const { container, engine } = render(
            [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'amount', type: 'field', dataType: 'integer', label: 'Amount' },
                ...jobs,
            ],
            {
                '$component.mainTabs.tabLabels[1]': 'Emploi de {{$name}}',
                '$component.faq.labels[0]': 'Questions',
                '$component.jobTable.columns[0].header': 'Employeur',
                '$component.recap.items[1].label': 'Montant',
            },
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
                    { component: 'DataTable', id: 'jobTable', bind: 'jobs', allowRemove: false, columns: [{ header: 'Employer', bind: 'employer' }] },
                    { component: 'Summary', id: 'recap', items: [{ label: 'Name', bind: 'name' }, { label: 'Amount', bind: 'amount' }] },
                ],
            },
        );
        act(() => engine.setValue('name', 'Ada'));
        expect(texts(container, '[role="tab"]')).toEqual(['Personal', 'Employment']);
        expect(texts(container, '.formspec-accordion summary')).toEqual(['FAQ', 'More']);
        expect(texts(container, '.formspec-data-table th')).toEqual(['Employer']);
        expect(texts(container, '.formspec-summary dt')).toEqual(['Name', 'Amount']);

        act(() => engine.setLocale('fr'));
        expect(texts(container, '[role="tab"]')).toEqual(['Personal', 'Emploi de Ada']);
        expect(texts(container, '.formspec-accordion summary')).toEqual(['Questions', 'More']);
        expect(texts(container, '.formspec-data-table th')).toEqual(['Employeur']);
        expect(texts(container, '.formspec-summary dt')).toEqual(['Name', 'Montant']);
    });

    it('label repeat-bound Accordion sections from labels[N]', () => {
        const { container, engine } = render(jobs, { '$component.jobSections.labels[1]': 'Deuxième' }, {
            component: 'Accordion', id: 'jobSections', bind: 'jobs', labels: ['First', 'Second'],
            children: [{ component: 'TextInput', bind: 'employer' }],
        });
        expect(texts(container, '.formspec-accordion summary')).toEqual(['First', 'Second']);
        act(() => engine.setLocale('fr'));
        expect(texts(container, '.formspec-accordion summary')).toEqual(['First', 'Deuxième']);
    });

    it('interpolate {{}} in each repeat instance scope (Locale §3.3.2)', () => {
        const { container, engine } = render(
            jobs,
            {
                '$component.jobRule.label': 'Poste {{@index}} : {{$employer}}',
                '$component.jobHeading.text': 'Emploi {{@index}}',
                '$component.jobAction.label': 'Valider {{$employer}}',
            },
            {
                component: 'Stack',
                bind: 'jobs',
                children: [
                    { component: 'Divider', id: 'jobRule', label: 'Job details' },
                    { component: 'Heading', id: 'jobHeading', level: 3, text: 'Job' },
                    { component: 'ActionButton', id: 'jobAction', actionRef: 'none', label: { literal: 'Confirm' } },
                    { component: 'TextInput', bind: 'employer' },
                ],
            },
        );
        act(() => {
            engine.setLocale('fr');
            engine.setValue('jobs[0].employer', 'ACME');
            engine.setValue('jobs[1].employer', 'Globex');
        });
        expect(texts(container, '.formspec-divider-label')).toEqual(['Poste 1 : ACME', 'Poste 2 : Globex']);
        expect(texts(container, '.formspec-repeat-instance h3')).toEqual(['Emploi 1', 'Emploi 2']);
        expect(texts(container, '.formspec-repeat-instance button.formspec-action')).toEqual(['Valider ACME', 'Valider Globex']);
    });

    it('localize a group-bound Stack title', () => {
        const { container, engine } = render(
            [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'address', type: 'group', label: 'Address', children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }] },
            ],
            { '$component.addressBlock.title': 'Adresse postale de {{$name}}' },
            {
                component: 'Stack',
                children: [{
                    component: 'Stack', id: 'addressBlock', bind: 'address', title: 'Mailing',
                    children: [{ component: 'TextInput', bind: 'city' }],
                }],
            },
        );
        act(() => {
            engine.setLocale('fr');
            engine.setValue('name', 'Ada');
        });
        expect(texts(container, '.formspec-group-title')).toEqual(['Adresse postale de Ada']);
    });
});

describe('group Item labels', () => {
    it('title a planned group with its live label: Locale, {{}}, and label context', () => {
        const { container, engine } = render(
            [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                {
                    key: 'address', type: 'group', label: 'Address of {{$name}}', labels: { short: 'Address' },
                    children: [{ key: 'city', type: 'field', dataType: 'string', label: 'City' }],
                },
            ],
            { 'address.label': 'Adresse de {{$name}}' },
        );
        act(() => engine.setValue('name', 'Ada'));
        expect(texts(container, '.formspec-group-title')).toEqual(['Address of Ada']);

        act(() => engine.setLabelContext('short'));
        expect(texts(container, '.formspec-group-title')).toEqual(['Address']);

        act(() => {
            engine.setLabelContext(null);
            engine.setLocale('fr');
        });
        expect(texts(container, '.formspec-group-title')).toEqual(['Adresse de Ada']);
    });
});

describe('repeat chrome labels', () => {
    it('label repeat template and repeat-bound Accordion chrome with the localized group label', () => {
        for (const tree of [undefined, { component: 'Accordion', bind: 'jobs', children: [{ component: 'TextInput', bind: 'employer' }] }]) {
            const { container, engine } = render(jobs, { 'jobs.label': 'Emploi' }, tree);
            act(() => {
                engine.setLocale('fr');
                engine.addRepeatInstance('jobs');
            });
            expect(texts(container, '.formspec-repeat-add')).toEqual(['Add Emploi']);
            expect(container.querySelector('.formspec-repeat-remove')?.getAttribute('aria-label')).toBe('Remove Emploi 1');
        }
    });
});
