/** @filedesc Checks stable section ownership and evaluated progress shared by runtime consumers. */
import { describe, expect, it } from 'vitest';
import * as layout from '../src/index';
import { validationResultIdentity } from '@formspec-org/types';
import type { ComponentDocument, FormDefinition, ThemeDocument, ValidationResult } from '@formspec-org/types';

const url = 'https://example.org/section-progress';
const definition = {
    $formspec: '1.0', url, version: '1.0.0', title: 'Progress',
    items: [
        { key: 'welcome', type: 'display', label: 'Welcome' },
        { key: 'Accounts', type: 'group', label: 'Account details', repeatable: true, children: [
            { key: 'rows', type: 'group', repeatable: true, children: [
                ...['amount', 'agreed', 'locked', 'required', 'hidden'].map(key => ({ key, type: 'field', dataType: 'string' })),
            ] },
        ] },
        { key: 'note', type: 'field', dataType: 'string' },
    ],
} as FormDefinition;

const component = {
    $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url },
    tree: { component: 'Stack', children: [
        { component: 'Heading', text: 'Introduction' },
        { component: 'Section', id: 'Accounts.V1', children: [
            { component: 'Stack', bind: 'Accounts', children: [
                { component: 'Stack', bind: 'rows', children: ['amount', 'agreed', 'locked', 'required', 'hidden']
                    .map(bind => ({ component: 'TextInput', bind })) },
            ] },
        ] },
        { component: 'ActionButton', actionRef: 'save' },
        { component: 'Section', id: 'ReviewOnly', children: [
            { component: 'TextInput', bind: 'Accounts[0].rows[0].amount' },
            { component: 'Text', text: 'Review details' },
        ] },
        { component: 'TextInput', bind: 'note' },
    ] },
} as ComponentDocument;

const theme = {
    $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url },
    pages: [
        { id: 'Summary.V1', title: 'Summary', regions: [{ key: 'note' }] },
        { id: 'Accounts_Page', title: 'Accounts', regions: [{ key: 'Accounts' }] },
    ],
} as ThemeDocument;

describe('section plan', () => {
    it('uses the generated group key when its label is empty', () => {
        const [group] = layout.resolvePageSequence({ ...definition, items: [
            { ...definition.items[1], label: '' },
        ] });
        expect(group).toMatchObject({ id: 'Accounts', title: 'Accounts' });
    });

    it('retains Component sections, loose subtrees, duplicate placements and shared actions in authored order', () => {
        const plan = layout.resolvePageSequence(definition, { component, theme });
        expect(plan.map(section => section.id)).toEqual([undefined, 'Accounts.V1', undefined, 'ReviewOnly', 'note']);
        expect(plan.flatMap(section => section.nodes.map(node => node.component)))
            .toEqual(['Heading', 'Section', 'ActionButton', 'Section', 'TextInput']);
        expect(plan[1].fields).toContain('Accounts[*].rows[*].amount');
        expect(plan[3].fields).toEqual([]);
        expect(plan[3].nodes[0].children).toHaveLength(2);
        expect(layout.workspaceSections(plan).map(section => section.nodes.map(node => node.component)))
            .toEqual([['Heading', 'Section', 'ActionButton'], ['Section'], ['TextInput']]);
    });

    it('uses Theme IDs and generated Item keys while retaining display-only loose content', () => {
        expect(layout.resolvePageSequence(definition, { theme }).map(section => section.id))
            .toEqual(['Summary.V1', 'Accounts_Page', 'welcome']);
        const generated = layout.resolvePageSequence(definition);
        expect(generated.map(section => section.id)).toEqual(['welcome', 'Accounts', 'note']);
        expect(generated[1]).toMatchObject({ title: 'Account details', titleBind: 'Accounts' });
    });

    it('preserves a regionless authored Theme page with display content', () => {
        const overview = { id: 'Overview', title: 'Overview', description: 'Before sending, review the instructions.' };
        const plan = layout.resolvePageSequence(definition, { theme: { ...theme, pages: [overview, ...theme.pages!] } });
        expect(plan[0]).toMatchObject({ id: overview.id, fields: [], nodes: [{ props: overview }] });
    });

    it('groups unwrapped Component field placements under unique Definition groups in Definition order', () => {
        const authored = { ...definition, items: ['First', 'Second'].map(key => ({
            key, type: 'group', children: [{ key: 'answer', type: 'field', dataType: 'string' }],
        })) } as FormDefinition;
        const tree = { component: 'Stack', children: [
            { component: 'Grid', children: [
                { component: 'TextInput', bind: 'Second.answer' },
                { component: 'TextInput', bind: 'First.answer' },
            ] },
            { component: 'Stack', bind: 'First', children: [{ component: 'TextInput', bind: 'answer' }] },
        ] } as ComponentDocument['tree'];
        const plan = layout.resolvePageSequence(authored, { component: { ...component, tree } });
        expect(plan.map(section => section.id)).toEqual(['First', 'Second']);
        expect(plan.map(section => section.fields)).toEqual([['First.answer'], ['Second.answer']]);
        expect(plan[0].nodes.map(node => node.component)).toEqual(['Grid', 'Stack']);
    });

    it('keeps authored Theme placements and Component loose subtrees and actions', () => {
        const withoutSections = {
            ...component,
            tree: { component: 'Stack', children: [
                { component: 'Heading', text: 'Introduction' },
                { component: 'TextInput', bind: 'note' },
                { component: 'ActionButton', actionRef: 'save' },
            ] },
        } as ComponentDocument;
        const plan = layout.resolvePageSequence(definition, { component: withoutSections, theme });
        expect(plan.map(section => section.id)).toEqual(['Summary.V1', 'Accounts_Page', 'welcome']);
        expect(plan[2].nodes.map(node => node.component)).toEqual(['Heading', 'ActionButton', 'Text']);
    });

    it('keeps a wholly unkeyed form continuous and preserves an unkeyed authored Section', () => {
        const tree = { component: 'Stack', children: [
            { component: 'Section', title: 'Intro', children: [{ component: 'Text', text: 'Start' }] },
            { component: 'ActionButton', actionRef: 'save' },
        ] } as ComponentDocument['tree'];
        const plan = layout.resolvePageSequence({ ...definition, items: [] }, { component: { ...component, tree } });
        expect(plan.map(section => section.id)).toEqual([undefined, undefined]);
        expect(plan.flatMap(section => section.nodes.map(node => node.component))).toEqual(['Section', 'ActionButton']);
        expect(layout.workspaceSections(plan).map(section => section.id)).toEqual([undefined]);
    });

    it('keeps nested Theme siblings and responsive hidden placements in the same structural sections', () => {
        const nested = { ...theme, pages: [{
            id: 'Nested', title: 'Detail',
            regions: [{ key: 'Accounts.rows.amount', responsive: { sm: { hidden: true } } }],
        }] } as ThemeDocument;
        const base = layout.resolvePageSequence(definition, { theme: nested });
        const narrow = layout.resolvePageSequence(definition, { theme: nested, context: { activeBreakpoint: 'sm' } });
        expect(base.map(section => section.fields)).toEqual([
            ['Accounts[*].rows[*].amount'],
            ['Accounts[*].rows[*].agreed', 'Accounts[*].rows[*].locked', 'Accounts[*].rows[*].required', 'Accounts[*].rows[*].hidden', 'note'],
        ]);
        expect(narrow.map(({ id, fields }) => ({ id, fields }))).toEqual(base.map(({ id, fields }) => ({ id, fields })));
        expect(narrow[0].nodes[0].children[0].children[0].style).toMatchObject({ display: 'none' });
    });

    it('assigns DataTable field templates and leaves loose IDs distinct from authored IDs', () => {
        const table = { ...component, tree: { component: 'Stack', children: [
            { component: 'Section', id: 'welcome', children: [
                { component: 'Stack', bind: 'Accounts', children: [
                    { component: 'DataTable', bind: 'rows', columns: [{ bind: 'amount' }] },
                ] },
            ] },
            { component: 'Text', bind: 'welcome' },
            { component: 'TextInput', bind: 'note' },
        ] } } as ComponentDocument;
        const plan = layout.resolvePageSequence(definition, { component: table });
        expect(plan.map(section => section.id)).toEqual(['welcome', 'note']);
        expect(plan[0].fields).toEqual(['Accounts[*].rows[*].amount']);
        expect(plan[0].fieldTemplates).toEqual(['Accounts.rows.amount']);
    });
});

it('counts and displays each outstanding acknowledgement group once', () => {
    const acknowledgement = (code: string) => result('#', 'error', 'EXPLANATION_REQUIRED', {
        constraintKind: 'explanation', source: 'shape', context: { code },
    });
    const first = acknowledgement('MISSING_TOTALS');
    const second = acknowledgement('MISSING_CONTACTS');
    const summary = layout.summarizeFormProgress([], {
        fields: [],
        report: { $formspecValidationReport: '1.0', valid: false, timestamp: '2026-01-01T00:00:00Z',
            results: [first, { ...first, message: 'A different message for the same group' }, second] },
    });
    expect(summary.form.toFix).toBe(2);
    const source = {
        field: () => null,
        message: (finding: ValidationResult) => finding.message,
        chrome: () => '',
    };
    const rows = layout.readFormProgressFindingRows(summary, source);
    expect(rows.map(({ identity, formLevel, jumpPath }) => [identity, formLevel, jumpPath])).toEqual([
        [validationResultIdentity(first), true, null],
        [validationResultIdentity(second), true, null],
    ]);
    expect(new Set(rows.map(row => row.identity)).size).toBe(2);
});

it('keeps finding identity on rendered summary rows when an earlier finding is filtered', () => {
    const shape = result('#', 'error', 'CHECK', { shapeId: 'check' });
    const rows = layout.readValidationSummaryRows({ showFieldErrors: false }, {
        submitted: null, touched: true,
        live: () => [result('note', 'error', 'REQUIRED', { source: 'bind', constraintKind: 'required' }), shape],
        field: () => null,
        message: finding => finding.message,
        chrome: () => '',
    }, { showFieldErrorsByDefault: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ identity: validationResultIdentity(shape) });
});

it('reports form readiness independently of an optional blank in a section', () => {
    const plan = layout.resolvePageSequence({ ...definition, items: [definition.items[2]] });
    const summary = layout.summarizeFormProgress(plan, {
        fields: [{ path: 'note', relevant: true, readonly: false, required: false, empty: true }],
        report: { $formspecValidationReport: '1.0', valid: true, timestamp: '2026-01-01T00:00:00Z', results: [] },
    });
    const counts = summary.sections[0].counts;
    expect(layout.pageProgressIssue(counts)).toBe('empty');
    expect(summary.sections[0].filled).toBe(false);
    expect(summary.form.ready).toBe(true);
});

function result(path: string, severity: ValidationResult['severity'], code: string, extra = {}): ValidationResult {
    return { $formspecValidationResult: '1.0', path, severity, code, message: 'Check this', constraintKind: 'shape', ...extra };
}

it('counts live nested instances, ignores hidden values, and owns findings by concrete path', () => {
    const plan = layout.resolvePageSequence(definition, { component });
    const row = 'Accounts[0].rows[0]';
    const fields = [
        { path: `${row}.amount`, empty: false },
        { path: `${row}.agreed`, empty: false },
        { path: `${row}.locked`, empty: true, required: true, readonly: true },
        { path: `${row}.required`, empty: true, required: true },
        { path: `${row}.hidden`, empty: false, relevant: false },
        { path: 'Accounts[1].rows[2].locked', empty: false, readonly: true },
    ].map(field => ({ relevant: true, readonly: false, required: false, ...field }));
    const results = [
        result(`${row}.locked`, 'error', 'REQUIRED', { constraintKind: 'required' }),
        result(`${row}.required`, 'error', 'REQUIRED', { constraintKind: 'required' }),
        result(`${row}.amount`, 'error', 'x-error', { sourceId: 'external-origin' }),
        result(`${row}.amount`, 'warning', 'x-check', { shapeId: 'check-one' }),
        result(`${row}.amount`, 'warning', 'x-check', { shapeId: 'check-two' }),
        result('Accounts[1].rows', 'warning', 'x-group'),
        result('#', 'error', 'x-form'),
        result('unplaced', 'warning', 'x-unplaced'),
        result('#', 'info', 'x-info'),
    ];
    const summary = layout.summarizeFormProgress(plan, {
        fields, report: { $formspecValidationReport: '1.0', timestamp: '2026-01-01T00:00:00Z', valid: false, results },
    });
    expect(summary.form).toMatchObject({ total: 3, filled: 2, prefilled: 1, missing: 2, missingReadonly: 1, toFix: 2, toCheck: 4, ready: false });
    expect(summary.sections.find(section => section.id === 'Accounts.V1')?.counts)
        .toMatchObject({ total: 3, filled: 2, missing: 2, toFix: 1, toCheck: 3 });
    expect(summary.sections.find(section => section.id === 'ReviewOnly')?.counts).toMatchObject({ total: 0, toFix: 0 });
    const rows = layout.readFormProgressFindingRows(summary, {
        field: path => path === `${row}.amount` ? { label: 'Montant', controlId: 'amount' } : null,
        message: finding => finding.message,
        chrome: (_key, params) => `${params?.label} : ${params?.message}`,
    });
    expect(rows.filter(finding => finding.path === `${row}.amount`)).toHaveLength(3);
    expect(rows.find(finding => finding.code === 'x-error')).toMatchObject({ label: 'Montant', jumpPath: `${row}.amount`, sectionId: 'Accounts.V1' });
    expect(rows.filter(finding => finding.formLevel).map(finding => [finding.code, finding.jumpPath]))
        .toEqual([['x-form', null], ['x-unplaced', null], ['x-info', null]]);
    expect(layout.summarizeFormProgress(plan, { fields, report: null }).form)
        .toMatchObject({ total: 3, filled: 2, missing: 2, toFix: null, toCheck: null, ready: false });
});
