/** @filedesc The plan and the emitted spec are pure functions of the documents — checked on the kitchen-sink fixture. */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FormDefinition, LocaleDocument } from '@formspec-org/types';
import { derivePlan, emitSpec, expected, matches, stripMarkdown } from '../src/index.js';

const FIXTURE_DIR = path.resolve(__dirname, '../../../tests/e2e/fixtures/kitchen-sink-holistic');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as T;
const KITCHEN_SINK = read<FormDefinition>('definition.v2.json');
const FRENCH = read<LocaleDocument>('locale.fr.json');

describe('plan derivation', () => {
    it('reads labels, required, options, groups and repeat chrome from the Definition alone', () => {
        const plan = derivePlan(KITCHEN_SINK);
        const byPath = new Map(plan.fields.map((f) => [f.path, f]));
        expect(plan.fields.map((f) => f.path)).toEqual([
            'fullName', 'notes', 'website', 'agreed', 'profileMode', 'priorityLevel', 'contactMethod', 'tags', 'startDate', 'endDate',
            'visitTime', 'visitDateTime', 'budget', 'lineItems.lineName', 'lineItems.lineQty', 'lineItems.linePrice', 'lineItems.lineSubtotal',
            'grandTotal', 'vipEnabled', 'vipCode', 'upload', 'salary',
        ]);
        expect(byPath.get('fullName')).toMatchObject({ label: { text: 'Full Name' }, hint: { text: 'Enter your legal name.' }, required: true, conditional: false });
        expect(byPath.get('priorityLevel')!.required).toBe('engine');
        expect(byPath.get('contactMethod')).toMatchObject({ conditional: true, options: [{ value: 'email', label: { text: 'Email' } }, { value: 'sms', label: { text: 'SMS' } }, { value: 'push', label: { text: 'Push' } }] });
        expect(byPath.get('lineItems.lineQty')).toMatchObject({ repeatOf: 'lineItems', groups: [{ path: 'lineItems' }] });
        const lineItems = plan.groups.find((g) => g.path === 'lineItems')!;
        expect(lineItems.repeat!.addLabel).toEqual({ text: 'Add Line Items' });
        expect(lineItems.repeat!.rowName.pattern!.test('Line Items 2')).toBe(true);
        expect(lineItems.repeat!.rowName.pattern!.test('Line Items 2 of 3')).toBe(true);
        expect(lineItems.repeat!.rowName.pattern!.test('Items 2')).toBe(false);
        expect(lineItems.repeat!.removeLabel!.pattern!.test('Remove Line Items 2')).toBe(true);
        expect(plan.uncovered).toEqual([
            "priorityLevel: required is the expression \"profileMode = 'advanced'\"; the engine decides",
            'vipCode: required is the expression "vipEnabled = true"; the engine decides',
        ]);
    });

    it('a Locale document rewrites exactly the strings it carries, on the Locale §3.1 cascade', () => {
        const plan = derivePlan(KITCHEN_SINK, { locale: FRENCH });
        const byPath = new Map(plan.fields.map((f) => [f.path, f]));
        expect(plan.locale).toBe('fr');
        expect(byPath.get('fullName')).toMatchObject({ label: { text: 'Nom complet' }, hint: { text: 'Saisissez votre nom légal.' } });
        expect(byPath.get('notes')!.label).toEqual({ text: 'Notes' });
        expect(byPath.get('profileMode')!.options!.map((o) => o.label.text)).toEqual(['Simple', 'Advanced']);
        expect(byPath.get('contactMethod')!.options!.map((o) => o.label.text)).toEqual(['Courriel', 'SMS', 'Push']);
        const lineItems = plan.groups.find((g) => g.path === 'lineItems')!;
        expect(lineItems.label).toEqual({ text: 'Lignes' });
        expect(lineItems.repeat!.addLabel).toEqual({ text: 'Ajouter une ligne' });
        expect(lineItems.repeat!.rowName.pattern!.test('Ligne 1')).toBe(true);
        expect(lineItems.repeat!.removeLabel!.pattern!.test('Retirer la ligne 1')).toBe(true);
    });

    it('emits a spec that states every field, repeat and required row in plain words', () => {
        const plan = derivePlan(KITCHEN_SINK, { locale: FRENCH });
        const spec = emitSpec(plan, KITCHEN_SINK, { url: 'http://127.0.0.1:18765/', source: 'kitchen-sink-holistic/', command: 'npx formspec-walk emit …', locale: FRENCH,
            recipes: new Map([['contactMethod', [{ path: 'profileMode', value: 'advanced' }]]]) });
        expect(spec).toContain("test('Nom complet — required, with a hint'");
        expect(spec).toContain("await walk.field('fullName', { label: 'Nom complet', required: true, hint: 'Saisissez votre nom légal.' });");
        expect(spec).toContain("test('Preferred Contact — optional, Courriel / SMS / Push, shown when Mode de profil = \"advanced\"'");
        expect(spec).toContain("shownBy: [{ path: 'profileMode', value: \"advanced\" }]");
        expect(spec).toContain("test('Tags — optional, New / Priority / Follow-up, shown conditionally'");
        expect(spec).toContain("shownBy: 'engine'");
        expect(spec).toContain("test('Lignes — Ajouter une ligne, focus lands in the new row, Retirer la ligne {{@index}}'");
        expect(spec).toContain("{ path: 'profileMode', label: 'Mode de profil' },");
        expect(spec).toContain("chrome: {\n        \"$ui.validationSummary.row\": \"{{$label}} — {{$message}}\"");
        expect(spec).not.toContain('undefined');
    });

    it('a label is text once rendered; an interpolated one is a pattern of its literal parts', () => {
        expect(stripMarkdown('Enter the amount **before any deductions** and [read the rule](https://x.y).')).toBe('Enter the amount before any deductions and read the rule.');
        const want = expected('Any change in what you receive from {{$payerName}}?');
        expect(matches('Any change in what you receive from ACME CORP?', want)).toBe(true);
        expect(matches('Any change in what you get from ACME CORP?', want)).toBe(false);
    });
});
