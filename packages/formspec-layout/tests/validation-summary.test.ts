/** @filedesc The shared ValidationSummary reader: gate, selection, dedupe, wording and links, with no DOM. */
import { describe, it, expect } from 'vitest';
import { readValidationSummaryRows, type ValidationSummarySource } from '../src/validation-summary.js';
import { UI_STRINGS, fillUiParams } from '../src/ui-strings.js';

const required = (path: string, message = `${path} is required`) =>
    ({ path, severity: 'error', message, source: 'bind', constraintKind: 'required' }) as any;
const shape = (message: string) =>
    ({ path: '', severity: 'error', message, source: 'shape', constraintKind: 'shape' }) as any;

function source(over: Partial<ValidationSummarySource> = {}): ValidationSummarySource {
    return {
        submitted: null,
        touched: false,
        live: () => [],
        message: (r) => r.message ?? '',
        field: (path) => ({ label: `Label of ${path}`, controlId: `field-${path.replace(/[.[\]]+/g, '-')}` }),
        chrome: (key, params) => fillUiParams(UI_STRINGS[key], params),
        ...over,
    };
}

describe('readValidationSummaryRows', () => {
    it('reads the latest submit for source: submit, and nothing before one', () => {
        expect(readValidationSummaryRows({ source: 'submit' }, source(), { showFieldErrorsByDefault: true })).toEqual([]);
        const rows = readValidationSummaryRows({ source: 'submit' }, source({ submitted: [required('name')] }), { showFieldErrorsByDefault: true });
        expect(rows.map((r) => r.path)).toEqual(['name']);
    });

    it('opens a continuous live summary on the first touch, a submit-mode one only on a submit', () => {
        const live = () => [required('name')];
        expect(readValidationSummaryRows({ source: 'live' }, source({ live }), { showFieldErrorsByDefault: true })).toEqual([]);
        expect(readValidationSummaryRows({ source: 'live' }, source({ live, touched: true }), { showFieldErrorsByDefault: true })).toHaveLength(1);
        expect(readValidationSummaryRows({ source: 'live', mode: 'submit' }, source({ live, touched: true }), { showFieldErrorsByDefault: true })).toEqual([]);
        expect(readValidationSummaryRows({ source: 'live', mode: 'submit' }, source({ live, submitted: [required('age')] }), { showFieldErrorsByDefault: true })
            .map((r) => r.path)).toEqual(['age']);
    });

    it("lists field findings by the renderer's default, and only form-level ones when it says not to", () => {
        const s = source({ submitted: [required('name'), shape('Total must match the award')] });
        expect(readValidationSummaryRows({ source: 'submit' }, s, { showFieldErrorsByDefault: true }).map((r) => r.path)).toEqual(['name', '']);
        expect(readValidationSummaryRows({ source: 'submit' }, s, { showFieldErrorsByDefault: false }).map((r) => r.path)).toEqual(['']);
        expect(readValidationSummaryRows({ source: 'submit', showFieldErrors: true }, s, { showFieldErrorsByDefault: false })).toHaveLength(2);
    });

    it('shows one finding once, unless the component asks for every one', () => {
        const s = source({ submitted: [required('name'), required('name')] });
        expect(readValidationSummaryRows({ source: 'submit' }, s, { showFieldErrorsByDefault: true })).toHaveLength(1);
        expect(readValidationSummaryRows({ source: 'submit', dedupe: false }, s, { showFieldErrorsByDefault: true })).toHaveLength(2);
    });

    it("words a field row through $ui.validationSummary.row with the field's live label, a form-level row as its message", () => {
        const rows = readValidationSummaryRows(
            { source: 'submit' },
            source({ submitted: [required('name'), shape('Total must match the award')], chrome: (key, params) => fillUiParams(key === 'validationSummary.row' ? '{{$message}} ({{$label}})' : UI_STRINGS[key], params) }),
            { showFieldErrorsByDefault: true },
        );
        expect(rows[0]).toMatchObject({ label: 'Label of name', text: 'name is required (Label of name)', formLevel: false });
        expect(rows[1]).toMatchObject({ label: null, text: 'Total must match the award', formLevel: true, jumpHref: null });
    });

    it('links a row to its control when the component asks for jump links and the field can take the jump', () => {
        const s = source({ submitted: [required('rows[1].amount')] });
        expect(readValidationSummaryRows({ source: 'submit' }, s, { showFieldErrorsByDefault: true })[0]).toMatchObject({ jumpPath: null, jumpHref: null });
        expect(readValidationSummaryRows({ source: 'submit', jumpLinks: true }, s, { showFieldErrorsByDefault: true })[0])
            .toMatchObject({ jumpPath: 'rows[1].amount', jumpHref: '#field-rows-1-amount' });
        // A renderer that knows the field is not on the page right now says so.
        expect(readValidationSummaryRows({ source: 'submit', jumpLinks: true }, source({ ...s, jumpable: () => false }), { showFieldErrorsByDefault: true })[0])
            .toMatchObject({ jumpPath: null, jumpHref: null });
    });

    it('names a finding by its source when it has one, and falls back to the path as its label', () => {
        const rows = readValidationSummaryRows(
            { source: 'submit', jumpLinks: true },
            source({ submitted: [{ ...required('ignored'), sourceId: 'rows[0].name' }], field: () => null }),
            { showFieldErrorsByDefault: true },
        );
        expect(rows[0]).toMatchObject({ path: 'rows[0].name', label: 'rows.name', jumpHref: null });
    });
});
