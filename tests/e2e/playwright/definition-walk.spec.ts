/** @filedesc Definition walk: every field, group, repeat, reveal and required rule a Definition + Locale promise, checked in the rendered form by keyboard and screen reader. */
//
// What this can see: whether the renderer and adapters present the documents faithfully — accessible
// names from labels and Locale strings, required state, hints as descriptions, options offered, groups
// announced, repeat chrome named and focus-managed, conditional fields entering and leaving the tab order,
// the submit summary linking to invalid controls — in Definition order, per locale, as Playwright's name
// computation and Guidepup's virtual screen reader (a second, independent implementation) each see it.
//
// What it cannot see: whether a label is good for a human, or whether a FEL relevance / required
// expression is right (the conformance fixtures own that; here an expression-valued `required` uses
// the engine as its oracle and the plan says so under `uncovered`).
//
// The checks live in @formspec-org/walk (packages/formspec-walk): `derivePlan` reads the documents, `Walk`
// checks one promise at a time, `walkDefinition` runs them all, `emitSpec` / `formspec-walk emit` writes them
// out as a spec of their own. FORMSPEC_WALK_URL=<page with a mounted formspec-render> FORMSPEC_WALK_DOCS=<dir
// of definition + locale + theme json> walks an already-built page (the NJ demo) instead of the harness.
// FORMSPEC_WALK_SR=os swaps the virtual reader for the OS's own (VoiceOver, NVDA) through @guidepup/playwright:
// it starts that screen reader on this machine, so it is opt-in.
import { expect, test as base, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import type { FormDefinition, LocaleDocument, ThemeDocument } from '@formspec-org/types';
import {
    derivePlan, expectClean, guidepupScreenReader, virtualScreenReader, walkDefinition, type GuidepupLike, type ScreenReader,
} from '@formspec-org/walk';
import { gotoHarness, mountDefinition } from '../browser/helpers/harness';

const OS_READER = process.env.FORMSPEC_WALK_SR === 'os';
/** The OS reader's fixture when asked for; otherwise a `screenReader` that is simply absent. */
const test = OS_READER
    ? (require('@guidepup/playwright') as typeof import('@guidepup/playwright')).screenReaderTest
    : base.extend<{ screenReader: GuidepupLike | null }>({ screenReader: null });
if (OS_READER) test.use({ headless: false });
const readerFor = (page: Page, screenReader: GuidepupLike | null): ScreenReader =>
    screenReader ? guidepupScreenReader(screenReader) : virtualScreenReader(page);

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/kitchen-sink-holistic');
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
const KITCHEN_SINK = read<FormDefinition>(path.join(FIXTURE_DIR, 'definition.v2.json'));
const FRENCH = read<LocaleDocument>(path.join(FIXTURE_DIR, 'locale.fr.json'));

async function mountKitchenSink(page: Page, adapter: 'default' | 'uswds', locale?: LocaleDocument): Promise<void> {
    await gotoHarness(page);
    if (adapter === 'uswds') await page.evaluate(() => (window as any).globalRegistry.setAdapter('uswds'));
    if (locale) {
        await page.evaluate((doc) => {
            const renderer: any = document.querySelector('formspec-render');
            renderer.localeDocuments = [doc];
            renderer.locale = doc.locale;
        }, locale);
    }
    await mountDefinition(page, KITCHEN_SINK);
    await page.waitForSelector('formspec-render [data-name]');
}

for (const adapter of ['default', 'uswds'] as const) {
    test.describe(`kitchen sink, ${adapter} adapter`, () => {
        test('inline wording', async ({ page, screenReader }) => {
            await mountKitchenSink(page, adapter);
            expectClean(await walkDefinition(page, derivePlan(KITCHEN_SINK), { screenReader: readerFor(page, screenReader) }));
        });
        test('French wording', async ({ page, screenReader }) => {
            await mountKitchenSink(page, adapter, FRENCH);
            expectClean(await walkDefinition(page, derivePlan(KITCHEN_SINK, { locale: FRENCH }), { screenReader: readerFor(page, screenReader), chrome: FRENCH.strings as Record<string, string> }));
        });
    });
}

/**
 * Shapes a correct renderer produces that once fooled the walk: two rows whose Remove buttons read alike
 * (a Tab walk keyed on text stopped early), a repeat that moves focus (a Tab walk that did not start
 * from the top skipped the rows), a field gated by a value inside a group (`g.gon = true`, which the
 * engine reports as depending on `g`), and wizard steps around all of that. A clean walk here is the
 * walk's own test.
 */
const SELF_TEST: FormDefinition = {
    $formspec: '1.0',
    url: 'urn:test:walk-self-test',
    version: '1.0.0',
    title: 'Walk self-test',
    formPresentation: { pageMode: 'wizard' },
    items: [
        { key: 'first', type: 'group', label: 'First things', children: [
            { key: 'a', type: 'field', dataType: 'string', label: 'A' },
            { key: 'rows', type: 'group', label: 'Rows', repeatable: true, minRepeat: 2, maxRepeat: 4, children: [
                { key: 'r', type: 'field', dataType: 'string', label: 'R' },
            ] },
        ] },
        { key: 'g', type: 'group', label: 'Gate', children: [
            { key: 'gon', type: 'field', dataType: 'boolean', label: 'Gate on' },
            { key: 'gx', type: 'field', dataType: 'string', label: 'Gated' },
        ] },
        { key: 'second', type: 'group', label: 'Second things', children: [
            { key: 'z', type: 'field', dataType: 'string', label: 'Z' },
        ] },
    ],
    binds: [{ path: 'g.gx', relevant: 'g.gon = true', required: 'true' }, { path: 'second.z', required: 'true' }],
} as unknown as FormDefinition;

test('the walk itself: rows that read alike, focus that moved, a gate inside a group, a second step', async ({ page, screenReader }) => {
    await gotoHarness(page);
    await mountDefinition(page, SELF_TEST);
    await page.waitForSelector('formspec-render [data-name]');
    const report = await walkDefinition(page, derivePlan(SELF_TEST), { screenReader: readerFor(page, screenReader) });
    expectClean(report);
    expect(report).toMatchObject({ steps: 3, fields: 5, revealed: 1, repeats: 1, summaryRows: 1 });
});

const EXTERNAL_URL = process.env.FORMSPEC_WALK_URL;
const EXTERNAL_DOCS = process.env.FORMSPEC_WALK_DOCS;
test.describe('an already-built page', () => {
    test.skip(!EXTERNAL_URL || !EXTERNAL_DOCS, 'set FORMSPEC_WALK_URL and FORMSPEC_WALK_DOCS');
    const docs = EXTERNAL_DOCS ? fs.readdirSync(EXTERNAL_DOCS).map((f) => path.join(EXTERNAL_DOCS, f)).filter((f) => f.endsWith('.json')).map((f) => read<any>(f)) : [];
    const definition = docs.find((d) => d.$formspec) as FormDefinition | undefined;
    const theme = docs.find((d) => d.$formspecTheme) as ThemeDocument | undefined;
    const locales = docs.filter((d) => d.$formspecLocale) as LocaleDocument[];
    // A page that ships Locale documents always shows one of them; a page without shows the inline wording.
    for (const locale of locales.length ? locales : [undefined]) {
        test(`${locale?.locale ?? 'inline'} wording`, async ({ page, screenReader }) => {
            expectClean(await walkDefinition(page, derivePlan(definition!, { locale, theme }), {
                url: EXTERNAL_URL!, locale: locale?.locale, chrome: locale?.strings as Record<string, string> | undefined, screenReader: readerFor(page, screenReader),
            }));
        });
    }
});
