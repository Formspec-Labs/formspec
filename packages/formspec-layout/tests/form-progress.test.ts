/** @filedesc Checks stable section ownership and evaluated progress shared by runtime consumers. */
import { describe, expect, it } from 'vitest';
import * as layout from '../src/index';
import { validationResultIdentity } from '@formspec-org/types';
import type { ComponentDocument, FormDefinition, ThemeDocument, ValidationResult } from '@formspec-org/types';

const url = 'https://example.org/section-progress';
const definition = {
    $formspec: '1.0', url, version: '1.0.0', title: 'Progress',
    items: [
        { key: 'welcome', type: 'display', label: 'Welcome', presentation: { widgetHint: 'Heading' } },
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
        // Loose content without a named, keyed section attaches in authored order.
        expect(plan.map(section => section.id)).toEqual(['Accounts.V1', 'ReviewOnly']);
        expect(plan.flatMap(section => section.nodes.map(node => node.component)))
            .toEqual(['Heading', 'Section', 'ActionButton', 'Section', 'TextInput']);
        expect(plan[0].fields).toContain('Accounts[*].rows[*].amount');
        expect(plan[1].fields).toEqual(['note']);
        expect(plan[1].nodes[0].children).toHaveLength(2);
        expect(plan.map(section => section.nodes.map(node => node.component)))
            .toEqual([['Heading', 'Section', 'ActionButton'], ['Section', 'TextInput']]);
    });

    it('uses Theme IDs and generated Item keys while retaining display-only loose content', () => {
        expect(layout.resolvePageSequence(definition, { theme }).map(section => section.id))
            .toEqual(['Summary.V1', 'Accounts_Page', 'welcome']);
        const generated = layout.resolvePageSequence(definition);
        // The display heading starts its own section and the trailing unheaded field belongs to Accounts.
        expect(generated.map(section => section.id)).toEqual(['welcome', 'Accounts']);
        expect(generated[0]).toMatchObject({ title: 'Welcome', titleBind: 'welcome', groups: [] });
        expect(generated[1]).toMatchObject({ title: 'Account details', titleBind: 'Accounts' });
    });

    it('counts unheaded Theme Items in the trailing section that owns them', () => {
        const plan = layout.resolvePageSequence({ ...definition, items: definition.items.slice(1) }, {
            theme: { ...theme, pages: theme.pages!.slice(1) },
        });
        expect(plan.map(({ id, titleLocaleKey, fields }) => ({ id, titleLocaleKey, fields }))).toEqual([
            { id: 'Accounts_Page', titleLocaleKey: '$page.Accounts_Page.title',
                fields: ['Accounts[*].rows[*].amount', 'Accounts[*].rows[*].agreed', 'Accounts[*].rows[*].locked',
                    'Accounts[*].rows[*].required', 'Accounts[*].rows[*].hidden'] },
            // The trailing section persists its progress under the first available Item key.
            { id: 'note', titleLocaleKey: '$ui.wizard.otherItems', fields: ['note'] },
        ]);
        const summary = layout.summarizeFormProgress(plan, {
            fields: [{ path: 'note', relevant: true, readonly: false, required: false, empty: false }],
            report: null,
        });
        expect(summary.sections.map(({ id, counts }) => [id, counts.filled])).toEqual([
            ['Accounts_Page', 0], ['note', 1],
        ]);
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
        expect(plan[1].nodes.map(node => node.component)).toEqual(['Section', 'Heading']);
        expect(plan[2].nodes.map(node => node.component)).toEqual(['Heading']);
        expect(plan[2].sharedNodes?.map(node => node.component)).toEqual(['ActionButton']);
    });

    it('keeps a wholly unkeyed form continuous and preserves an unkeyed authored Section', () => {
        const tree = { component: 'Stack', children: [
            { component: 'Section', title: 'Intro', children: [{ component: 'Text', text: 'Start' }] },
            { component: 'ActionButton', actionRef: 'save' },
        ] } as ComponentDocument['tree'];
        const plan = layout.resolvePageSequence({ ...definition, items: [] }, { component: { ...component, tree } });
        // The shared action attaches without creating a second unkeyed page.
        expect(plan.map(section => section.id)).toEqual([undefined]);
        expect(plan[0].nodes.map(node => node.component)).toEqual(['Section']);
        expect(plan[0].sharedNodes?.map(node => node.component)).toEqual(['ActionButton']);
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
            // The heading supplies a title, and the next available key avoids the authored ID.
            { component: 'Heading', bind: 'welcome' },
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

describe('warning follow-ups in the progress summary and findings margin', () => {
    const warning = (path: string, shapeId: string, code: string) =>
        result(path, 'warning', code, { shapeId, source: 'shape' });
    const plan = layout.resolvePageSequence(definition, { component });
    const path = 'Accounts[1].rows[2].amount';
    const sibling = 'Accounts[1].rows[3].amount';
    function summarize(results: ValidationResult[]) {
        const fields = [path, sibling, 'note'].map(path => ({
            path, relevant: true, required: false, readonly: false, empty: false,
        }));
        return layout.summarizeFormProgress(plan, { fields, report: {
            $formspecValidationReport: '1.0', valid: results.every(row => row.severity !== 'error'),
            timestamp: '2026-01-01T00:00:00Z', results,
        } });
    }

    it.each(['EXPLANATION_REQUIRED', 'EXPLANATION_STALE'])('pairs %s only with its exact repeat instance', code => {
        const underlying = warning(path, 'checkValue', 'CHECK_VALUE');
        const paired = result(path, 'error', code, { source: 'shape', constraintKind: 'explanation', shapeId: 'checkValue' });
        const otherShape = warning(path, 'otherCheck', 'CHECK_VALUE');
        const otherInstance = warning(sibling, 'checkValue', 'CHECK_VALUE');
        const progress = summarize([underlying, otherShape, paired, otherInstance]);
        expect(progress.form).toMatchObject({ toFix: 1, toCheck: 2, ready: false });
        expect(progress.sections.find(section => section.id === 'Accounts.V1')?.counts)
            .toMatchObject({ toFix: 1, toCheck: 2 });
        const rows = layout.readFormProgressFindingRows(progress, {
            field: () => ({ label: 'Amount', controlId: 'amount' }),
            message: finding => finding.message, chrome: () => '',
        });
        expect(rows.map(row => row.identity)).toEqual([otherShape, paired, otherInstance].map(validationResultIdentity));
        expect(rows[1].jumpPath).toBe(path);
    });

    it('uses a single group follow-up across sections and keeps an independent external warning', () => {
        const grouped = result('#', 'error', 'EXPLANATION_STALE', {
            source: 'shape', constraintKind: 'explanation', context: { code: 'CHECK_VALUE' },
        });
        const outside = result(path, 'warning', 'CHECK_VALUE', { source: 'external', constraintKind: 'external' });
        const progress = summarize([grouped, warning(path, 'checkValue', 'CHECK_VALUE'),
            warning('note', 'checkNote', 'CHECK_VALUE'), outside]);
        expect(progress.form).toMatchObject({ toFix: 1, toCheck: 1 });
        expect(progress.findings.map(finding => finding.result)).toEqual([grouped, outside]);
        expect(progress.findings[0].formLevel).toBe(true);
        expect(progress.sections.reduce((sum, section) => sum + (section.counts.toFix ?? 0), 0)).toBe(0);
    });

    it('retains the original warning when its explanation is current and filing is permitted', () => {
        const resolved = warning(path, 'checkValue', 'CHECK_VALUE');
        const progress = summarize([resolved]);
        expect(progress.form).toMatchObject({ toFix: 0, toCheck: 1, ready: true });
        expect(progress.findings.map(finding => finding.result)).toEqual([resolved]);
    });
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
    expect(layout.summarizeFormProgress(plan, {
        fields: [{ path: 'note', relevant: true, readonly: false, required: false, empty: true }],
        report: null,
    }).form.ready).toBeNull();
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
    // Required blanks establish a blocker even when validation counts are unavailable.
    expect(layout.summarizeFormProgress(plan, { fields, report: null }).form)
        .toMatchObject({ total: 3, filled: 2, missing: 2, toFix: null, toCheck: null, ready: false });
});

it('decrements toCheck and flags findings as explained when current explanations or group acknowledgements exist', () => {
    const plan = layout.resolvePageSequence(definition, { component });
    const row = 'Accounts[0].rows[0]';
    const fields = [
        { path: `${row}.amount`, relevant: true, readonly: false, required: false, empty: false },
        { path: 'note', relevant: true, readonly: false, required: false, empty: true },
    ];
    const results = [
        result(`${row}.amount`, 'warning', 'VARIANCE', { shapeId: 'variance-check' }),
        result(`${row}.amount`, 'warning', 'STALE_CHECK', { shapeId: 'stale-check' }),
        result('note', 'warning', 'UNANSWERED_ITEMS', { shapeId: 'blank-check' }),
    ];
    const report = { $formspecValidationReport: '1.0' as const, timestamp: '2026-01-01T00:00:00Z', valid: true, results };

    // Before explanations: 3 unresolved warnings.
    const before = layout.summarizeFormProgress(plan, { fields, report });
    expect(before.form.toCheck).toBe(3);

    // After explaining variance-check (current: true), leaving stale-check stale (current: false),
    // and acknowledging UNANSWERED_ITEMS (current: true): only 1 unresolved warning remains.
    const after = layout.summarizeFormProgress(plan, { fields, report }, {
        instances: [
            { shapeId: 'variance-check', path: `${row}.amount`, current: true },
            { shapeId: 'stale-check', path: `${row}.amount`, current: false },
        ],
        groups: [
            { code: 'UNANSWERED_ITEMS', paths: ['note'], current: true },
        ],
    });
    expect(after.form.toCheck).toBe(1);
    expect(after.sections.find(s => s.id === 'Accounts.V1')?.counts.toCheck).toBe(1);
    expect(after.sections.find(s => s.id === 'ReviewOnly')?.counts.toCheck).toBe(0);

    const rows = layout.readFormProgressFindingRows(after, {
        field: path => path === `${row}.amount` ? { label: 'Amount', controlId: 'amount' } : null,
        message: finding => finding.message,
        chrome: (_key, params) => `${params?.label}: ${params?.message}`,
    });
    expect(rows.find(r => r.code === 'VARIANCE')?.explained).toBe(true);
    expect(rows.find(r => r.code === 'STALE_CHECK')?.explained).toBeFalsy();
    expect(rows.find(r => r.code === 'UNANSWERED_ITEMS')?.explained).toBe(true);
});

it('tags blank required findings as untouchedRequired until surfaced and attributes multi-section errors without cross-section leakage', () => {
    const multiSectionDef = {
        $formspec: '1.0', url: 'https://example.org/multi-section-progress', version: '1.0.0', title: 'Multi Section',
        items: [
            { key: 'secOne', type: 'group', label: 'Section One', children: [
                { key: 'a', type: 'field', dataType: 'string', label: 'Field A' },
                { key: 'b', type: 'field', dataType: 'string', label: 'Field B' },
            ] },
            { key: 'secTwo', type: 'group', label: 'Section Two', children: [
                { key: 'rows', type: 'group', label: 'Rows', repeatable: true, children: [
                    { key: 'amount', type: 'field', dataType: 'money', label: 'Amount' },
                ] },
            ] },
            { key: 'secThree', type: 'group', label: 'Section Three', children: [
                { key: 'total', type: 'field', dataType: 'money', label: 'Total' },
            ] },
        ],
    } as FormDefinition;

    const plan = layout.resolvePageSequence(multiSectionDef);
    const fields = [
        { path: 'secOne.a', relevant: true, readonly: false, required: true, empty: true },
        { path: 'secOne.b', relevant: true, readonly: false, required: true, empty: true },
        { path: 'secTwo.rows[0].amount', relevant: true, readonly: false, required: false, empty: false },
        { path: 'secThree.total', relevant: true, readonly: false, required: false, empty: false },
    ];
    const results: ValidationResult[] = [
        result('secOne.a', 'error', 'REQUIRED', { constraintKind: 'required' }),
        result('secOne.b', 'error', 'REQUIRED', { constraintKind: 'required' }),
        result('secTwo.rows.amount', 'error', 'INVALID_ROW_TEMPLATE', { shapeId: 'row-check' }),
        result('secTwo.rows[*]', 'error', 'ROW_GROUP_CHECK', { shapeId: 'row-group' }),
        result('secThree.total', 'error', 'TOTAL_MISMATCH', { shapeId: 'total-check' }),
    ];
    const report = { $formspecValidationReport: '1.0' as const, timestamp: '2026-01-01T00:00:00Z', valid: false, results };

    // Untouched: blank required errors stay deferred; secTwo & secThree keep accurate per-section counts.
    const initial = layout.summarizeFormProgress(plan, { fields, report });
    expect(initial.form).toMatchObject({ missing: 2, toFix: 3 });
    expect(initial.sections.map(s => [s.id, s.counts.toFix])).toEqual([
        ['secOne', 0],
        ['secTwo', 2],
        ['secThree', 1],
    ]);
    const initialRows = layout.readFormProgressFindingRows(initial, {
        field: p => ({ label: p, controlId: null }),
        message: r => r.message,
        chrome: (_k, params) => `${params?.label}: ${params?.message}`,
    });
    expect(initialRows.filter(r => r.untouchedRequired).map(r => r.resultPath)).toEqual(['secOne.a', 'secOne.b']);
    expect(initialRows.filter(r => !r.untouchedRequired)).toHaveLength(3);

    // Touching one blank required field promotes only that path into toFix and its own section.
    const oneTouched = layout.summarizeFormProgress(plan, { fields, report }, null, {
        surfacedRequiredPaths: new Set(['secOne.a']),
    });
    expect(oneTouched.form).toMatchObject({ missing: 2, toFix: 4 });
    expect(oneTouched.sections.map(s => [s.id, s.counts.toFix])).toEqual([
        ['secOne', 1],
        ['secTwo', 2],
        ['secThree', 1],
    ]);
    expect(oneTouched.findings.find(f => f.result.path === 'secOne.a')?.untouchedRequired).toBeUndefined();
    expect(oneTouched.findings.find(f => f.result.path === 'secOne.b')?.untouchedRequired).toBe(true);

    // Submitting ('all') surfaces every blank required error in toFix and its owning section.
    const submitted = layout.summarizeFormProgress(plan, { fields, report }, null, {
        surfacedRequiredPaths: 'all',
    });
    expect(submitted.form).toMatchObject({ missing: 2, toFix: 5 });
    expect(submitted.sections.map(s => [s.id, s.counts.toFix])).toEqual([
        ['secOne', 2],
        ['secTwo', 2],
        ['secThree', 1],
    ]);
    expect(submitted.findings.some(f => f.untouchedRequired)).toBe(false);
});
