/** @filedesc Display Items render live text (Locale + FEL {{}} in Item scope) and follow Bind relevance (parity with webcomponent). */
import { describe, it, expect, beforeAll } from 'vitest';
import React, { act } from 'react';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

function definition(items: any[], extra: Record<string, unknown> = {}) {
    return { $formspec: '1.0', url: 'urn:test:form', version: '1.0.0', title: 'Test', items, ...extra };
}

function render(def: any, tree?: unknown) {
    const engine = createFormEngine(def);
    const componentDocument = tree
        ? { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test:form' }, tree }
        : undefined;
    const container = actRender(
        <FormspecForm engine={engine} {...(componentDocument ? { componentDocument } : {})} />,
    );
    return { container, engine };
}

const texts = (root: ParentNode, selector = '.formspec-text') =>
    Array.from(root.querySelectorAll<HTMLElement>(selector), (node) => node.textContent ?? '');

const frLocale = (strings: Record<string, string>) => ({
    $formspecLocale: '2.0',
    locale: 'fr',
    version: '1.0.0',
    target: { kind: 'definition', url: 'urn:test:form' },
    strings,
});

describe('display Items — text', () => {
    it('interpolates {{expression}} in the inline label and updates when values change', () => {
        const { container, engine } = render(definition([
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
            { key: 'greeting', type: 'display', label: 'Hello {{$name}}!' },
        ]));
        expect(texts(container)).toEqual(['Hello !']);

        act(() => engine.setValue('name', 'Ada'));
        expect(texts(container)).toEqual(['Hello Ada!']);
    });

    it('uses the Locale `<itemKey>.label` string for a display Item inside a group, interpolated', () => {
        const { container, engine } = render(definition([
            {
                key: 'week',
                type: 'group',
                label: 'Week',
                children: [
                    { key: 'start', type: 'field', dataType: 'string', label: 'Start' },
                    { key: 'weekNotice', type: 'display', label: 'Inline {{$week.start}}' },
                ],
            },
        ]));
        act(() => {
            engine.loadLocale(frLocale({ 'weekNotice.label': 'Semaine du {{$week.start}}' }) as any);
            engine.setValue('week.start', '2025-03-23');
        });
        expect(texts(container)).toEqual(['Inline 2025-03-23']);

        act(() => engine.setLocale('fr'));
        expect(texts(container)).toEqual(['Semaine du 2025-03-23']);
    });

    it('interpolates a localized display Item string in the repeat instance scope', () => {
        const { container, engine } = render(definition([
            {
                key: 'rows',
                type: 'group',
                label: 'Row',
                repeatable: true,
                minRepeat: 2,
                children: [
                    { key: 'rowName', type: 'field', dataType: 'string', label: 'Row name' },
                    { key: 'rowNote', type: 'display', label: 'Row says {{$rowName}}' },
                ],
            },
        ]));
        act(() => {
            engine.setValue('rows[0].rowName', 'first');
            engine.setValue('rows[1].rowName', 'second');
        });
        expect(texts(container)).toEqual(['Row says first', 'Row says second']);

        act(() => {
            engine.loadLocale(frLocale({ 'rowNote.label': 'Ligne {{$rowName}} #{{@index}}' }) as any);
            engine.setLocale('fr');
        });
        expect(texts(container)).toEqual(['Ligne first #1', 'Ligne second #2']);
    });

    it('keeps markdown working for a display Item rendered as markdown Text, escaping interpolated values', () => {
        const { container, engine } = render(
            definition([
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'note', type: 'display', label: '**Hi {{$name}}**' },
            ]),
            { component: 'Stack', children: [{ component: 'Text', bind: 'note', format: 'markdown' }] },
        );
        act(() => engine.setValue('name', '<b>Ada</b>'));
        expect(container.querySelector('.formspec-text--markdown strong')?.textContent).toBe('Hi <b>Ada</b>');
        expect(container.querySelector('.formspec-text--markdown b')).toBeNull();
    });

    it('follows the engine label context: Locale `<key>.label@context`, reactively', () => {
        const { container, engine } = render(definition([
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
            { key: 'note', type: 'display', label: 'A longer note for {{$name}}' },
        ]));
        act(() => {
            engine.loadLocale(frLocale({ 'note.label@short': 'Note {{$name}}' }) as any);
            engine.setLocale('fr');
            engine.setValue('name', 'Ada');
        });
        expect(texts(container)).toEqual(['A longer note for Ada']);

        act(() => engine.setLabelContext('short'));
        expect(texts(container)).toEqual(['Note Ada']);

        act(() => engine.setLabelContext(null));
        expect(texts(container)).toEqual(['A longer note for Ada']);
    });

    it('resolves Heading display Items the same way', () => {
        const { container, engine } = render(definition([
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
            { key: 'title', type: 'display', label: 'About {{$name}}', presentation: { widgetHint: 'Heading' } },
        ]));
        act(() => engine.setValue('name', 'Ada'));
        expect(container.querySelector('h2')?.textContent).toBe('About Ada');
    });
});

describe('display Items — relevance', () => {
    const yesNo = [
        { key: 'answer', type: 'field', dataType: 'string', label: 'Answer' },
        { key: 'ifYes', type: 'display', label: 'You said yes' },
        { key: 'ifNo', type: 'display', label: 'You said no' },
    ];
    const binds = [
        { path: 'ifYes', relevant: "$answer = 'yes'" },
        { path: 'ifNo', relevant: "$answer = 'no'" },
    ];

    it('shows only the display Item whose relevant Bind is true, reactively', () => {
        const { container, engine } = render(definition(yesNo, { binds }));

        act(() => engine.setValue('answer', 'yes'));
        expect(texts(container)).toEqual(['You said yes']);

        act(() => engine.setValue('answer', 'no'));
        expect(texts(container)).toEqual(['You said no']);
    });

    it('applies relevance per repeat instance', () => {
        const { container, engine } = render(definition(
            [
                {
                    key: 'rows',
                    type: 'group',
                    label: 'Row',
                    repeatable: true,
                    minRepeat: 2,
                    children: [
                        { key: 'flag', type: 'field', dataType: 'string', label: 'Flag' },
                        { key: 'flagNote', type: 'display', label: 'Flagged' },
                    ],
                },
            ],
            { binds: [{ path: 'rows[*].flagNote', relevant: "$flag = 'x'" }] },
        ));
        act(() => engine.setValue('rows[1].flag', 'x'));
        const notes = Array.from(container.querySelectorAll('.formspec-repeat-instance'), (instance) => texts(instance));
        expect(notes).toEqual([[], ['Flagged']]);
    });

    it('applies text and relevance to a component-document Text bound to a display Item', () => {
        const { container, engine } = render(
            definition(
                [
                    yesNo[0],
                    { key: 'ifYes', type: 'display', label: 'Yes, {{$answer}}' },
                    { key: 'ifNo', type: 'display', label: 'No, {{$answer}}' },
                ],
                { binds },
            ),
            {
                component: 'Stack',
                children: [
                    { component: 'TextInput', bind: 'answer' },
                    { component: 'Text', bind: 'ifYes' },
                    { component: 'Text', bind: 'ifNo' },
                ],
            },
        );
        act(() => engine.setValue('answer', 'yes'));
        expect(texts(container)).toEqual(['Yes, yes']);
    });
});

describe('Text not planned from a display Item', () => {
    it('shows a bound field value, not a label', () => {
        const { container, engine } = render(
            definition([{ key: 'total', type: 'field', dataType: 'string', label: 'Total {{$total}}' }]),
            { component: 'Stack', children: [{ component: 'Text', bind: 'total' }] },
        );
        act(() => engine.setValue('total', '42'));
        expect(texts(container)).toEqual(['42']);
    });
});

describe('display Items — Divider', () => {
    it('renders a plain rule while the live label is empty, and labels it once interpolation yields text', () => {
        const { container, engine } = render(definition([
            { key: 'employer', type: 'field', dataType: 'string', label: 'Employer' },
            { key: 'rule', type: 'display', label: '{{$employer}}', presentation: { widgetHint: 'Divider' } },
        ]));
        expect(container.querySelector('hr.formspec-divider')).toBeTruthy();
        expect(container.querySelector('.formspec-divider-label')).toBeNull();

        act(() => engine.setValue('employer', 'ACME'));
        expect(texts(container, '.formspec-divider--labeled .formspec-divider-label')).toEqual(['ACME']);

        act(() => engine.setValue('employer', ''));
        expect(container.querySelector('.formspec-divider-label')).toBeNull();
        expect(container.querySelector('hr.formspec-divider')).toBeTruthy();
    });

    it('labels an authored Divider whose Locale label is empty at render once interpolation yields text', () => {
        const { container, engine } = render(
            definition([{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }]),
            {
                component: 'Stack',
                children: [
                    { component: 'TextInput', bind: 'employer' },
                    { component: 'Divider', id: 'rule', label: '' },
                ],
            },
        );
        act(() => {
            engine.loadLocale(frLocale({ '$component.rule.label': '{{$employer}}' }) as any);
            engine.setLocale('fr');
        });
        expect(container.querySelector('.formspec-divider-label')).toBeNull();

        act(() => engine.setValue('employer', 'ACME'));
        expect(texts(container, '.formspec-divider-label')).toEqual(['ACME']);
    });
});
