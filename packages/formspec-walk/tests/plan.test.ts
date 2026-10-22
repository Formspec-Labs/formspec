/** @filedesc The plan and the emitted spec are pure functions of the documents — checked on the kitchen-sink fixture and synthetic multi-form package manifests. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FormDefinition, LocaleDocument } from '@formspec-org/types';
import { derivePlan, emitSpec, expected, matches, stripMarkdown } from '../src/index.js';
// @ts-expect-error — untyped CLI bin module exported for unit testing
import { planA11yChecks, readPackageForms } from '../bin/formspec-walk.mjs';

const FIXTURE_DIR = path.resolve(__dirname, '../../../tests/e2e/fixtures/kitchen-sink-holistic');
const CLI_BIN = path.resolve(__dirname, '../bin/formspec-walk.mjs');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8')) as T;
const KITCHEN_SINK = read<FormDefinition>('definition.v2.json');
const FRENCH = read<LocaleDocument>('locale.fr.json');

let tempPkgDir = '';
let tempManifestPath = '';
let singleFormManifestPath = '';

beforeAll(() => {
    tempPkgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'formspec-walk-pkg-'));
    const formsDir = path.join(tempPkgDir, 'forms');
    fs.mkdirSync(formsDir, { recursive: true });

    const intakeDef: FormDefinition = {
        $formspec: '1.0',
        url: 'https://example.org/forms/intake-application',
        version: '1.0.0',
        title: 'Applicant Intake',
        items: [
            { key: 'applicantName', type: 'field', dataType: 'string', label: 'Applicant full name' },
            { key: 'referenceNumber', type: 'field', dataType: 'string', label: 'Reference number' },
        ],
        binds: [{ path: 'applicantName', required: 'true' }],
    };
    const intakeEn: LocaleDocument = {
        $formspecLocale: '2.0',
        version: '1.0.0',
        locale: 'en',
        target: { kind: 'definition', url: intakeDef.url },
        strings: {
            '$form.title': 'Applicant Intake',
            'applicantName.label': 'Applicant legal name',
            'referenceNumber.label': 'Case reference number',
        },
    };
    const intakeEs: LocaleDocument = {
        $formspecLocale: '2.0',
        version: '1.0.0',
        locale: 'es-US',
        target: { kind: 'definition', url: intakeDef.url },
        strings: {
            '$form.title': 'Solicitud de ingreso',
            'applicantName.label': 'Nombre legal del solicitante',
            'referenceNumber.label': 'Número de referencia',
        },
    };

    const reviewDef: FormDefinition = {
        $formspec: '1.0',
        url: 'https://example.org/forms/caseworker-review',
        version: '1.0.0',
        title: 'Caseworker Review',
        items: [
            {
                key: 'reviewOutcome',
                type: 'field',
                dataType: 'string',
                label: 'Review outcome',
                options: [
                    { value: 'approve', label: 'Approve filing' },
                    { value: 'requestCorrection', label: 'Request correction' },
                ],
            },
            { key: 'reviewerNotes', type: 'field', dataType: 'string', label: 'Reviewer rationale' },
        ],
        binds: [{ path: 'reviewOutcome', required: 'true' }],
    };
    const reviewEn: LocaleDocument = {
        $formspecLocale: '2.0',
        version: '1.0.0',
        locale: 'en',
        target: { kind: 'definition', url: reviewDef.url },
        strings: {
            '$form.title': 'Caseworker Review',
            'reviewOutcome.label': 'Review outcome',
            'reviewOutcome.options.approve.label': 'Approve filing',
            'reviewOutcome.options.requestCorrection.label': 'Request correction',
            'reviewerNotes.label': 'Reviewer rationale',
        },
    };
    const reviewEs: LocaleDocument = {
        $formspecLocale: '2.0',
        version: '1.0.0',
        locale: 'es-US',
        target: { kind: 'definition', url: reviewDef.url },
        strings: {
            '$form.title': 'Revisión del caso',
            'reviewOutcome.label': 'Decisión de revisión',
            'reviewOutcome.options.approve.label': 'Aprobar solicitud',
            'reviewOutcome.options.requestCorrection.label': 'Solicitar corrección',
            'reviewerNotes.label': 'Fundamento del revisor',
        },
    };

    const escalationDef: FormDefinition = {
        $formspec: '1.0',
        url: 'https://example.org/forms/escalation-note',
        version: '1.0.0',
        title: 'Escalation Note',
        items: [
            { key: 'escalationSummary', type: 'field', dataType: 'string', label: 'Escalation summary' },
        ],
    };

    fs.writeFileSync(path.join(formsDir, 'intake.definition.json'), JSON.stringify(intakeDef, null, 2));
    fs.writeFileSync(path.join(formsDir, 'intake.en.locale.json'), JSON.stringify(intakeEn, null, 2));
    fs.writeFileSync(path.join(formsDir, 'intake.es-US.locale.json'), JSON.stringify(intakeEs, null, 2));
    fs.writeFileSync(path.join(formsDir, 'review.definition.json'), JSON.stringify(reviewDef, null, 2));
    fs.writeFileSync(path.join(formsDir, 'review.en.locale.json'), JSON.stringify(reviewEn, null, 2));
    fs.writeFileSync(path.join(formsDir, 'review.es-US.locale.json'), JSON.stringify(reviewEs, null, 2));
    fs.writeFileSync(path.join(formsDir, 'escalation.definition.json'), JSON.stringify(escalationDef, null, 2));

    const multiFormManifest = {
        packageId: 'synthetic-multi-form-package',
        version: '1.0.0',
        forms: [
            {
                formId: 'intake-application',
                slug: 'intake',
                displayName: 'Applicant Intake Form',
                definition: { file: 'forms/intake.definition.json' },
                locales: [
                    { locale: 'en', file: 'forms/intake.en.locale.json' },
                    { locale: 'es-US', file: 'forms/intake.es-US.locale.json' },
                ],
            },
            {
                formId: 'caseworker-review',
                slug: 'review',
                displayName: 'Caseworker Review Form',
                definition: { file: 'forms/review.definition.json' },
                locales: [
                    { locale: 'en', file: 'forms/review.en.locale.json' },
                    { locale: 'es-US', file: 'forms/review.es-US.locale.json' },
                ],
            },
            {
                formId: 'escalation-note',
                slug: 'escalation',
                displayName: 'Escalation Note',
                definition: { file: 'forms/escalation.definition.json' },
            },
        ],
    };
    tempManifestPath = path.join(tempPkgDir, 'package-manifest.json');
    fs.writeFileSync(tempManifestPath, JSON.stringify(multiFormManifest, null, 2));

    singleFormManifestPath = path.join(tempPkgDir, 'single-form-manifest.json');
    fs.writeFileSync(
        singleFormManifestPath,
        JSON.stringify(
            {
                packageId: 'synthetic-single-form-package',
                version: '1.0.0',
                forms: [multiFormManifest.forms[0]],
            },
            null,
            2,
        ),
    );
});

afterAll(() => {
    if (tempPkgDir) {
        fs.rmSync(tempPkgDir, { recursive: true, force: true });
    }
});

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

    it('emits the Playwright spec for a selected form (--manifest + --form + --locale en) with zero cross-form locale contamination', () => {
        const res = spawnSync(
            process.execPath,
            [CLI_BIN, 'emit', '--manifest', tempManifestPath, '--form', 'intake-application', '--locale', 'en', '--url', 'http://127.0.0.1:8099/'],
            { encoding: 'utf8' },
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('intake-application (Applicant Intake Form)');
        expect(res.stdout).toContain('Applicant Intake 1.0.0 — en wording.');
        expect(res.stdout).toContain('--form intake-application');
        expect(res.stdout).toContain("label: 'Applicant legal name'");
        expect(res.stdout).toContain("label: 'Case reference number'");
        expect(res.stdout).not.toContain('Review outcome');
        expect(res.stdout).not.toContain('reviewerNotes');
        expect(res.stdout).not.toContain('Escalation summary');
    });

    it('auto-detects package-manifest.json in --docs and emits the Spanish spec when matched by slug', () => {
        const res = spawnSync(
            process.execPath,
            [CLI_BIN, 'emit', '--docs', tempPkgDir, '--form', 'review', '--locale', 'es-US', '--url', 'http://127.0.0.1:8099/'],
            { encoding: 'utf8' },
        );
        expect(res.status).toBe(0);
        expect(res.stdout).toContain('caseworker-review (Caseworker Review Form)');
        expect(res.stdout).toContain('--form review');
        expect(res.stdout).toContain("label: 'Decisión de revisión'");
        expect(res.stdout).toContain("'Solicitar corrección'");
        expect(res.stdout).toContain("label: 'Fundamento del revisor'");
        expect(res.stdout).not.toContain('Applicant legal name');
        expect(res.stdout).not.toContain('applicantName');
        expect(res.stdout).not.toContain('escalationSummary');
    });

    it('exits 2 and lists all available form IDs when emit is called on a multi-form package without --form', () => {
        const res = spawnSync(
            process.execPath,
            [CLI_BIN, 'emit', '--manifest', tempManifestPath, '--url', 'http://127.0.0.1:8099/'],
            { encoding: 'utf8' },
        );
        expect(res.status).toBe(2);
        for (const id of ['intake-application', 'caseworker-review', 'escalation-note']) {
            expect(res.stderr).toContain(id);
        }
    });

    it('plans a11y checks across inline and all declared locales even for single-form manifests or --form filters, and filters untranslated forms when --locale is passed without --form', () => {
        const singleForms = readPackageForms(singleFormManifestPath, undefined, undefined, { requireSingle: false });
        const singleChecks = planA11yChecks(singleForms, { manifestPath: singleFormManifestPath, code: undefined });
        expect(singleChecks.map((c: any) => ({ formId: c.form.formId, locale: c.localeCode }))).toEqual([
            { formId: 'intake-application', locale: undefined },
            { formId: 'intake-application', locale: 'en' },
            { formId: 'intake-application', locale: 'es-US' },
        ]);

        const filteredForm = readPackageForms(tempManifestPath, 'caseworker-review', undefined, { requireSingle: false });
        const filteredChecks = planA11yChecks(filteredForm, { manifestPath: tempManifestPath, code: undefined });
        expect(filteredChecks.map((c: any) => ({ formId: c.form.formId, locale: c.localeCode }))).toEqual([
            { formId: 'caseworker-review', locale: undefined },
            { formId: 'caseworker-review', locale: 'en' },
            { formId: 'caseworker-review', locale: 'es-US' },
        ]);

        // Multi-form package with partial locale coverage (escalation-note has no locales):
        const esForms = readPackageForms(tempManifestPath, undefined, 'es-US', { requireSingle: false });
        const esChecks = planA11yChecks(esForms, { manifestPath: tempManifestPath, code: 'es-US' });
        expect(esChecks.map((c: any) => ({ formId: c.form.formId, locale: c.localeCode }))).toEqual([
            { formId: 'intake-application', locale: 'es-US' },
            { formId: 'caseworker-review', locale: 'es-US' },
        ]);

        // Explicitly targeting an untranslated form with --form + --locale exits 2:
        const res = spawnSync(
            process.execPath,
            [CLI_BIN, 'emit', '--manifest', tempManifestPath, '--form', 'escalation-note', '--locale', 'es-US', '--url', 'http://127.0.0.1:8099/'],
            { encoding: 'utf8' },
        );
        expect(res.status).toBe(2);
        expect(res.stderr).toContain('escalation-note');
        expect(res.stderr).toContain('es-US');
    });
});
