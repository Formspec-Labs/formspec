/** @filedesc Display Items render live text (Locale + FEL {{}} in Item scope) and follow Bind relevance. */
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

function definition(items: any[], extra: Record<string, unknown> = {}) {
    return { $formspec: '1.0', url: 'urn:test:form', version: '1.0.0', title: 'Test', items, ...extra };
}

function render(def: any, setup?: (el: any) => void) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    setup?.(el);
    el.definition = def;
    el.render();
    return el;
}

function renderTree(tree: any, items: any[], extra: Record<string, unknown> = {}) {
    return render(definition(items, extra), (el) => {
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            tree,
        };
    });
}

/** Text of display elements the respondent can see (not inside a hidden ancestor). */
function visibleTexts(el: HTMLElement, selector = '.formspec-text'): string[] {
    return Array.from(el.querySelectorAll<HTMLElement>(selector))
        .filter((node) => node.closest('.formspec-hidden') === null)
        .map((node) => node.textContent ?? '');
}

describe('display Items — text', () => {
    it('interpolates {{expression}} in the inline label and updates when values change', () => {
        const el = render(definition([
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
            { key: 'greeting', type: 'display', label: 'Hello {{$name}}!' },
        ]));
        expect(visibleTexts(el)).toEqual(['Hello !']);

        el.getEngine().setValue('name', 'Ada');
        expect(visibleTexts(el)).toEqual(['Hello Ada!']);
    });

    it('resolves @instance references (demo: benefit week notice)', () => {
        const el = render(definition(
            [{ key: 'weekNotice', type: 'display', label: 'Week of {{@instance(\'claimant\').week}}' }],
            { instances: { claimant: { data: { week: '2025-03-23' } } } },
        ));
        expect(visibleTexts(el)).toEqual(['Week of 2025-03-23']);
    });

    it('uses the Locale `<itemKey>.label` string for a display Item inside a group, interpolated', () => {
        const el = render(
            definition([
                {
                    key: 'week',
                    type: 'group',
                    label: 'Week',
                    children: [
                        { key: 'start', type: 'field', dataType: 'string', label: 'Start' },
                        { key: 'weekNotice', type: 'display', label: 'Inline {{$week.start}}' },
                    ],
                },
            ]),
            (host) => {
                host.localeDocuments = {
                    $formspecLocale: '2.0',
                    locale: 'fr',
                    version: '1.0.0',
                    target: { kind: 'definition', url: 'urn:test:form' },
                    strings: { 'weekNotice.label': 'Semaine du {{$week.start}}' },
                };
            },
        );
        el.getEngine().setValue('week.start', '2025-03-23');
        expect(visibleTexts(el)).toEqual(['Inline 2025-03-23']);

        el.locale = 'fr';
        expect(visibleTexts(el)).toEqual(['Semaine du 2025-03-23']);
    });

    it('interpolates in the repeat instance scope', () => {
        const el = render(definition([
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
        const engine = el.getEngine();
        engine.setValue('rows[0].rowName', 'first');
        engine.setValue('rows[1].rowName', 'second');
        expect(visibleTexts(el)).toEqual(['Row says first', 'Row says second']);
    });

    it('interpolates a localized display Item string in the repeat instance scope', () => {
        const el = render(
            definition([
                {
                    key: 'rows',
                    type: 'group',
                    label: 'Row',
                    repeatable: true,
                    minRepeat: 2,
                    children: [
                        { key: 'rowName', type: 'field', dataType: 'string', label: 'Row name' },
                        { key: 'rowNote', type: 'display', label: 'Row {{$rowName}} #{{@index}}' },
                    ],
                },
            ]),
            (host) => {
                host.localeDocuments = {
                    $formspecLocale: '2.0',
                    locale: 'fr',
                    version: '1.0.0',
                    target: { kind: 'definition', url: 'urn:test:form' },
                    strings: { 'rowNote.label': 'Ligne {{$rowName}} #{{@index}}' },
                };
            },
        );
        const engine = el.getEngine();
        engine.setValue('rows[0].rowName', 'first');
        el.locale = 'fr';
        expect(visibleTexts(el)).toEqual(['Ligne first #1', 'Ligne  #2']);

        engine.setValue('rows[1].rowName', 'second');
        expect(visibleTexts(el)).toEqual(['Ligne first #1', 'Ligne second #2']);
    });

    it('keeps markdown working for a display Item rendered as markdown Text, escaping interpolated values', () => {
        const el = renderTree(
            { component: 'Stack', children: [{ component: 'Text', bind: 'note', format: 'markdown' }] },
            [
                { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                { key: 'note', type: 'display', label: '**Hi {{$name}}**' },
            ],
        );
        el.getEngine().setValue('name', '<b>Ada</b>');
        expect(el.querySelector('.formspec-text--markdown strong')?.textContent).toBe('Hi <b>Ada</b>');
        expect(el.querySelector('.formspec-text--markdown b')).toBeNull();
    });

    it('resolves Heading display Items the same way', () => {
        const el = render(definition([
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
            { key: 'title', type: 'display', label: 'About {{$name}}', presentation: { widgetHint: 'Heading' } },
        ]));
        el.getEngine().setValue('name', 'Ada');
        expect(el.querySelector('.formspec-heading')?.textContent).toBe('About Ada');
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
        const el = render(definition(yesNo, { binds }));
        const engine = el.getEngine();

        engine.setValue('answer', 'yes');
        expect(visibleTexts(el)).toEqual(['You said yes']);

        engine.setValue('answer', 'no');
        expect(visibleTexts(el)).toEqual(['You said no']);
    });

    it('applies relevance per repeat instance', () => {
        const el = render(definition(
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
        el.getEngine().setValue('rows[1].flag', 'x');
        const notes = Array.from(el.querySelectorAll<HTMLElement>('.formspec-repeat-instance')).map(
            (instance) => visibleTexts(instance),
        );
        expect(notes).toEqual([[], ['Flagged']]);
    });

    it('labels a Divider display Item with its live label', () => {
        const el = render(definition([
            yesNo[0],
            { key: 'rule', type: 'display', label: 'About {{$answer}}', presentation: { widgetHint: 'Divider' } },
        ]));
        el.getEngine().setValue('answer', 'pets');
        expect(el.querySelector('.formspec-divider-label')?.textContent).toBe('About pets');
    });

    it('hides a display Item rendered as a Divider while it is not relevant', () => {
        const el = render(definition(
            [
                yesNo[0],
                { key: 'rule', type: 'display', label: 'More', presentation: { widgetHint: 'Divider' } },
            ],
            { binds: [{ path: 'rule', relevant: "$answer = 'yes'" }] },
        ));
        const divider = el.querySelector('.formspec-divider') as HTMLElement;
        expect(divider).not.toBeNull();
        expect(divider.closest('.formspec-hidden')).not.toBeNull();

        el.getEngine().setValue('answer', 'yes');
        expect(divider.closest('.formspec-hidden')).toBeNull();
    });

    it('applies text and relevance to a component-document Text bound to a display Item', () => {
        const el = renderTree(
            {
                component: 'Stack',
                children: [
                    { component: 'TextInput', bind: 'answer' },
                    { component: 'Text', bind: 'ifYes' },
                    { component: 'Text', bind: 'ifNo' },
                ],
            },
            [
                yesNo[0],
                { key: 'ifYes', type: 'display', label: 'Yes, {{$answer}}' },
                { key: 'ifNo', type: 'display', label: 'No, {{$answer}}' },
            ],
            { binds },
        );
        el.getEngine().setValue('answer', 'yes');
        expect(visibleTexts(el)).toEqual(['Yes, yes']);
    });
});

describe('Text not planned from a display Item', () => {
    it('shows a bound field value, not a label', () => {
        const el = renderTree(
            { component: 'Stack', children: [{ component: 'Text', bind: 'total' }] },
            [{ key: 'total', type: 'field', dataType: 'string', label: 'Total {{$total}}' }],
        );
        el.getEngine().setValue('total', '42');
        expect(visibleTexts(el)).toEqual(['42']);
    });

    it('renders static markdown text', () => {
        const el = renderTree(
            { component: 'Stack', children: [{ component: 'Text', text: '**Read** this', format: 'markdown' }] },
            [],
        );
        expect(el.querySelector('.formspec-text--markdown strong')?.textContent).toBe('Read');
    });

});

describe('Divider — label empty at render', () => {
    /** The Divider label a respondent sees, or null while the Divider shows as a plain rule. */
    const shownLabel = (el: HTMLElement): string | null => {
        const label = el.querySelector<HTMLElement>('.formspec-divider-label');
        return label && !label.hidden && label.closest('.formspec-divider--labeled') ? label.textContent : null;
    };
    const plainRules = (el: HTMLElement) =>
        Array.from(el.querySelectorAll('hr')).filter((hr) => !hr.hidden && !hr.closest('.formspec-divider--labeled'));

    it('gains its label when a display Item label interpolates to text, and loses it again', () => {
        const el = render(definition([
            { key: 'employer', type: 'field', dataType: 'string', label: 'Employer' },
            { key: 'rule', type: 'display', label: '{{$employer}}', presentation: { widgetHint: 'Divider' } },
        ]));
        expect(shownLabel(el)).toBeNull();
        expect(plainRules(el)).toHaveLength(1);

        el.getEngine().setValue('employer', 'ACME');
        expect(shownLabel(el)).toBe('ACME');
        expect(plainRules(el)).toHaveLength(0);

        el.getEngine().setValue('employer', '');
        expect(shownLabel(el)).toBeNull();
        expect(plainRules(el)).toHaveLength(1);
    });

    it('gains its label when an authored Divider Locale label interpolates to text', () => {
        const el = renderTree(
            { component: 'Stack', children: [{ component: 'TextInput', bind: 'employer' }, { component: 'Divider', id: 'rule', label: '' }] },
            [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
        );
        const engine = el.getEngine();
        engine.loadLocale({
            $formspecLocale: '2.0', locale: 'fr', version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:form' },
            strings: { '$component.rule.label': '{{$employer}}' },
        });
        engine.setLocale('fr');
        expect(shownLabel(el)).toBeNull();

        engine.setValue('employer', 'ACME');
        expect(shownLabel(el)).toBe('ACME');
    });
});
