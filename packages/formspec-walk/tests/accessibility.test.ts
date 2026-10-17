/** @filedesc The reference-renderer accessibility check, in a real browser: a known violation fails, a clean form passes, a timeout and a browser failure are failures. */
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderHostPage } from '@formspec-org/webcomponent/host';
import { createServer } from 'node:http';
import { checkAccessibility, expectedPages, MANUAL_REVIEW, type RendererCheckReport } from '../src/index.js';
import { AccessibilityServer } from '../src/serve.js';

const field = (key: string, label: string) => ({ key, type: 'field', dataType: 'string', label });

/** Two wizard pages, every field labelled: nothing for axe to flag. */
const CLEAN = {
    $formspec: '1.0', url: 'urn:test:a11y-clean', version: '1.0.0', status: 'draft', title: 'Clean form',
    formPresentation: { pageMode: 'wizard' },
    binds: [{ path: 'name', required: 'true' }, { path: 'email', required: 'true' }, { path: 'employer', required: 'true' }],
    items: [
        { key: 'about', type: 'group', label: 'About you', children: [field('name', 'Full name'), field('email', 'Email address')] },
        { key: 'work', type: 'group', label: 'Your work', children: [field('employer', 'Employer')] },
    ],
};

/** A field with no label: the input has no accessible name. */
const UNLABELLED = {
    $formspec: '1.0', url: 'urn:test:a11y-unlabelled', version: '1.0.0', status: 'draft', title: 'Unlabelled field',
    items: [field('name', ''), field('email', 'Email address')],
};

let server: AccessibilityServer;

beforeAll(async () => {
    server = new AccessibilityServer({ timeoutMs: 60_000 });
    await server.listen(0);
});
afterAll(() => server.close());

const post = (body: unknown) => fetch(`${server.url}/check`, { method: 'POST', body: JSON.stringify(body) });

describe('reference-renderer accessibility check', () => {
    it('a form with a known violation fails with axe\'s finding in the report', async () => {
        const res = await post({ definition: UNLABELLED });
        expect(res.status).toBe(200);
        const report = await res.json() as RendererCheckReport;
        expect(report.status).toBe('completed');
        const rules = report.violations.map((v) => v.rule);
        expect(rules).toContain('label');
        const label = report.violations.find((v) => v.rule === 'label')!;
        expect(label.wcag).toContain('4.1.2');
        expect(label.nodes[0].target.join(' ')).toContain('#field-name');
        expect(report).not.toHaveProperty('passed');
    });

    it('a clean form reports no violations on every page and in the validation-error state', async () => {
        const res = await post({ definition: CLEAN });
        const report = await res.json() as RendererCheckReport;
        expect(report.status).toBe('completed');
        expect(report.violations).toEqual([]);
        expect(report.states.map((s) => s.id)).toEqual(['page-1', 'page-2', 'errors-1', 'errors-2']);
        expect(report.axeVersion).toMatch(/^\d+\.\d+\.\d+/);
        expect(report.tags).toEqual(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
        // Per-page axe time on this two-field page, for the record.
        for (const s of report.states) expect(s.axeMs).toBeLessThan(30_000);
    });

    it('the validation-error state is really the errors shown', async () => {
        const report = await (await post({ definition: CLEAN })).json() as RendererCheckReport;
        expect(report.status).toBe('completed');
        const page = await server.check({ definition: CLEAN });
        expect(page.states.filter((s) => s.kind === 'validation-errors')).toHaveLength(2);
    });

    it('lists the criteria that still need a person, and axe\'s incomplete results as needing review', async () => {
        const report = await server.check({ definition: CLEAN });
        expect(report.manualReview).toEqual(MANUAL_REVIEW);
        expect(report.manualReview.length).toBeGreaterThan(5);
        expect(Array.isArray(report.needsReview)).toBe(true);
    });

    it('a low-contrast Theme is a violation too', async () => {
        const theme = { $formspecTheme: '1.0', url: 'urn:test:theme', version: '1.0.0', tokens: { 'color.foreground': '#cfcfcf' } };
        const report = await server.check({ definition: CLEAN, theme: theme as never });
        expect(report.status).toBe('completed');
        expect(report.violations.map((v) => v.rule)).toContain('color-contrast');
    });
});

describe('failure is never a pass', () => {
    let browser: Browser;
    beforeAll(async () => { browser = await chromium.launch(); });
    afterAll(() => browser.close());

    it('a check that outlives its cap is reported as a timeout failure and stops the page', async () => {
        const page = await browser.newPage();
        const started = Date.now();
        const report = await checkAccessibility(page, { open: () => new Promise(() => undefined), timeoutMs: 300 });
        expect(report.status).toBe('failed');
        expect(report.failure?.reason).toBe('timeout');
        expect(report.violations).toEqual([]);
        expect(Date.now() - started).toBeLessThan(5_000);
        await expect.poll(() => page.isClosed()).toBe(true);
    });

    it('a page that does not draw the form is a renderer failure', async () => {
        const page = await browser.newPage();
        const html = renderHostPage({ definition: { ...CLEAN, items: 'not an array' } as never });
        const report = await checkAccessibility(page, {
            open: async (p) => { await p.setContent('<html data-formspec-host="error"><body></body></html>'); await p.evaluate(() => { (window as any).__formspecHost = { error: 'form not drawn' }; }); void html; },
            timeoutMs: 10_000,
        });
        expect(report.status).toBe('failed');
        expect(report.failure).toMatchObject({ reason: 'renderer', message: 'form not drawn' });
        await page.close();
    });

    it('a browser that will not start is a 503 with Retry-After and a failed report', async () => {
        const broken = new AccessibilityServer({ launch: async () => { throw new Error('browserType.launch: Executable doesn\'t exist'); } });
        await broken.listen(0);
        try {
            const res = await fetch(`${broken.url}/check`, { method: 'POST', body: JSON.stringify({ definition: CLEAN }) });
            expect(res.status).toBe(503);
            expect(res.headers.get('retry-after')).toBeTruthy();
            const report = await res.json() as RendererCheckReport;
            expect(report.status).toBe('failed');
            expect(report.failure?.reason).toBe('browser');
            expect(report.violations).toEqual([]);
        } finally {
            await broken.close();
        }
    });

    it('a launch that exceeds the cap is a timeout failure', async () => {
        const slow = new AccessibilityServer({ timeoutMs: 200, launch: (t) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout ${t}ms exceeded`)), 250)) });
        const report = await slow.check({ definition: CLEAN });
        expect(report.status).toBe('failed');
        expect(report.failure?.reason).toBe('timeout');
    });

    it('a request that is not documents is a 400, not a pass', async () => {
        const res = await post({ nothing: true });
        expect(res.status).toBe(400);
    });
});

describe('forms the product ships pass the check', () => {
    const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

    it('the D1 passport-renewal form (with its file upload) has no violations', async () => {
        const report = await server.check({
            definition: read('./fixtures/d1-passport/passport-renewal.definition.json'),
            locales: [read('./fixtures/d1-passport/passport-renewal.en.locale.json')],
            locale: 'en',
        });
        expect(report.status).toBe('completed');
        expect(report.violations.map((v) => `${v.state} ${v.rule}`)).toEqual([]);
    });

    it('the NJ kitchen-sink form (two pages, drop zones) has no violations', async () => {
        const dir = '../../../tests/e2e/fixtures/kitchen-sink-holistic';
        const report = await server.check({ definition: read(`${dir}/definition.v2.json`) });
        expect(report.status).toBe('completed');
        expect(report.states.length).toBeGreaterThanOrEqual(4);
        expect(report.violations.map((v) => `${v.state} ${v.rule}`)).toEqual([]);
    });
});

describe('every page is visited, or the check fails', () => {
    const unlabelled = (key: string) => ({ key, type: 'field', dataType: 'string', label: '' });
    const group = (key: string, children: unknown[]) => ({ key, type: 'group', label: key, children });
    const form = (pageMode: string, items: unknown[], extra: object = {}) => ({
        $formspec: '1.0', url: `urn:test:${pageMode}`, version: '1.0.0', status: 'draft', title: pageMode,
        formPresentation: { pageMode }, items, ...extra,
    });

    it('a violation on the second tab is found (hidden panels are shown one by one)', async () => {
        const report = await server.check({ definition: form('tabs', [group('one', [field('a', 'A field')]), group('two', [unlabelled('b')])]) });
        expect(report.status).toBe('completed');
        expect(report.pages).toMatchObject({ kind: 'tabs', drawn: 2, visited: 2, expectedMin: 2 });
        expect(report.violations.some((v) => v.rule === 'label' && v.state === 'page-2')).toBe(true);
    });

    it('a wizard under a fallback Locale is stepped by its buttons, not their translated names', async () => {
        const target = { kind: 'definition', url: 'urn:test:wizard' };
        const wizardWords = { '$ui.wizard.next': 'Étape suivante', '$ui.wizard.nextStep': 'Aller à l’étape suivante', '$ui.wizard.previous': 'Précédent', '$ui.wizard.previousStep': 'Étape précédente' };
        const fr = { $formspecLocale: '2.0', version: '1.0.0', locale: 'fr', target, strings: wizardWords };
        const frCA = { $formspecLocale: '2.0', version: '1.0.0', locale: 'fr-CA', fallback: 'fr', target, strings: { 'one.label': 'Un' } };
        const report = await server.check({
            definition: form('wizard', [group('one', [field('a', 'A field')]), group('two', [unlabelled('b')])]),
            locales: [fr, frCA] as never, locale: 'fr-CA',
        });
        expect(report.status).toBe('completed');
        expect(report.pages).toMatchObject({ kind: 'wizard', drawn: 2, visited: 2 });
        expect(report.violations.some((v) => v.rule === 'label' && v.state === 'page-2')).toBe(true);
    });

    it('a form with more pages than the cap fails instead of ending as completed', async () => {
        await withHostPage(form('wizard', [group('one', [field('a', 'A')]), group('two', [field('b', 'B')]), group('three', [field('c', 'C')])]), async (page, url) => {
            const report = await checkAccessibility(page, { open: async (p) => { await p.goto(url); }, maxPages: 2 });
            expect(report.status).toBe('failed');
            expect(report.failure?.reason).toBe('pages');
            expect(report.violations).toEqual([]);
        });
    });

    it('fewer pages drawn than the Definition guarantees fails the check', async () => {
        const definition = form('wizard', [group('one', [field('a', 'A')]), group('two', [field('b', 'B')])]);
        await withHostPage(definition, async (page, url) => {
            const report = await checkAccessibility(page, { open: async (p) => { await p.goto(url); }, expectedPages: 3 });
            expect(report.status).toBe('failed');
            expect(report.failure).toMatchObject({ reason: 'pages' });
        });
    });

    it('counts the pages a Definition guarantees, leaving out conditional ones', () => {
        const d = form('wizard', [group('one', []), group('two', []), field('loose', 'L')], { binds: [{ path: 'two', relevant: '$x = 1' }] });
        expect(expectedPages(d)).toBe(2);
        expect(expectedPages({ ...d, formPresentation: {} })).toBe(1);
        expect(expectedPages(form('tabs', [group('one', []), group('two', [])]))).toBe(2);
        const themed = { pages: [{ regions: [{ key: 'one' }] }, { regions: [{ key: 'two' }] }] };
        expect(expectedPages(form('wizard', [group('one', []), group('two', [])]), themed)).toBe(2);
    });

    it('a field hidden by relevance is shown by the value that reveals it, and checked', async () => {
        const definition = {
            $formspec: '1.0', url: 'urn:test:reveal', version: '1.0.0', status: 'draft', title: 'reveal',
            items: [
                { key: 'kind', type: 'field', dataType: 'choice', label: 'Kind', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
                unlabelled('extra'),
            ],
            binds: [{ path: 'extra', relevant: "$kind = 'b'" }],
        };
        const report = await server.check({ definition });
        expect(report.status).toBe('completed');
        expect(report.pages?.revealedFields).toBe(1);
        expect(report.violations.some((v) => v.rule === 'label' && v.state === 'reveal-extra')).toBe(true);
        // It was put back: the base page states were checked with it hidden.
        expect(report.states.map((s) => s.id)).toEqual(['page-1', 'errors-1', 'reveal-extra']);
    });
});

describe('nothing hides inside an empty repeat or behind an ancestor rule', () => {
    const unlabelled = (key: string) => ({ key, type: 'field', dataType: 'string', label: '' });
    const base = (items: unknown[], binds: unknown[] = []) => ({
        $formspec: '1.0', url: 'urn:test:hidden', version: '1.0.0', status: 'draft', title: 'hidden', items, binds,
    });
    const choice = (key: string) => ({ key, type: 'field', dataType: 'choice', label: key, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });

    it('a repeatable group with no rows is checked with one row, and the row is taken out again', async () => {
        const definition = base([{ key: 'people', type: 'group', label: 'People', repeatable: true, children: [unlabelled('name')] }]);
        const report = await server.check({ definition: definition as never });
        expect(report.status).toBe('completed');
        expect(report.violations.some((v) => v.rule === 'label' && v.state === 'page-1')).toBe(true);
    });

    it('a repeat inside a new row gets a row too', async () => {
        const inner = { key: 'pets', type: 'group', label: 'Pets', repeatable: true, children: [unlabelled('petName')] };
        const definition = base([{ key: 'people', type: 'group', label: 'People', repeatable: true, children: [inner] }]);
        const report = await server.check({ definition: definition as never });
        expect(report.violations.some((v) => v.rule === 'label')).toBe(true);
    });

    it('a repeat that cannot take a row is listed for review, never passed silently', async () => {
        const definition = base([{ key: 'people', type: 'group', label: 'People', repeatable: true, maxRepeat: 0, children: [unlabelled('name')] }]);
        const report = await server.check({ definition: definition as never });
        expect(report.status).toBe('completed');
        const listed = report.needsReview.filter((f) => f.rule === 'formspec-unreached-repeat');
        expect(listed.map((f) => f.nodes[0].target[0])).toEqual(['people']);
    });

    it('fields behind relevance on an ancestor group, or on two nested ones, are reached', async () => {
        const nested = { key: 'g2', type: 'group', label: 'G2', children: [{ key: 'sub', type: 'group', label: 'Sub', children: [unlabelled('inner')] }] };
        const one = await server.check({ definition: base([choice('kind'), nested], [{ path: 'g2', relevant: "$kind = 'b'" }]) as never });
        expect(one.violations.some((v) => v.state === 'reveal-g2.sub.inner' && v.rule === 'label')).toBe(true);
        const two = await server.check({
            definition: base([choice('kind'), choice('kind2'), nested], [{ path: 'g2', relevant: "$kind = 'b'" }, { path: 'g2.sub', relevant: "$kind2 = 'b'" }]) as never,
        });
        expect(two.violations.some((v) => v.state === 'reveal-g2.sub.inner' && v.rule === 'label')).toBe(true);
        expect(two.needsReview.filter((f) => f.rule === 'formspec-unreached-field')).toEqual([]);
    });
});

describe('the page is fenced from the network', () => {
    it('a Theme stylesheet and a Definition data source are never fetched and are listed for review', async () => {
        const hits: string[] = [];
        const listener = createServer((req, res) => { hits.push(req.url ?? ''); res.writeHead(200, { 'content-type': 'text/css' }); res.end('body{}'); });
        await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
        const base = `http://127.0.0.1:${(listener.address() as { port: number }).port}`;
        try {
            const definition = {
                ...CLEAN, formPresentation: {}, binds: [], url: 'urn:test:fence',
                items: [field('name', 'Name')],
                instances: { people: { source: `${base}/instance.json`, static: false } },
            };
            const theme = { $formspecTheme: '1.0', url: 'urn:test:fence-theme', version: '1.0.0', tokens: {}, stylesheets: [`${base}/theme.css`] };
            const report = await server.check({ definition: definition as never, theme: theme as never });
            expect(report.status).toBe('completed');
            expect(hits).toEqual([]);
            const refused = report.needsReview.filter((f) => f.rule === 'formspec-blocked-request').flatMap((f) => f.nodes.map((n) => n.target[0]));
            expect(refused).toContain(`${base}/theme.css`);
            expect(refused).toContain(`${base}/instance.json`);
        } finally {
            listener.close();
        }
    });

    it('a Theme that names a render adapter the host does not have is refused, not drawn with another', async () => {
        const theme = { $formspecTheme: '1.0', url: 'urn:test:uswds-theme', version: '1.0.0', tokens: {}, adapter: 'uswds' };
        const report = await server.check({ definition: CLEAN, theme: theme as never });
        expect(report.status).toBe('failed');
        expect(report.failure?.reason).toBe('renderer');
        expect(report.failure?.message).toContain("'uswds'");
        // Retrying can never help: 422 with no Retry-After, unlike a dead browser (503).
        const res = await post({ definition: CLEAN, theme });
        expect(res.status).toBe(422);
        expect(res.headers.get('retry-after')).toBeNull();
    });

    it('the report says which adapter was tested', async () => {
        expect((await server.check({ definition: CLEAN })).adapter).toBe('default');
    });

    it('a page that never answers is a timeout, not a browser failure', async () => {
        const silent = createServer(() => undefined);
        await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
        const browser = await chromium.launch();
        try {
            const page = await browser.newPage();
            const url = `http://127.0.0.1:${(silent.address() as { port: number }).port}/`;
            const report = await checkAccessibility(page, { open: async (p) => { await p.goto(url); }, timeoutMs: 1_500 });
            expect(report.status).toBe('failed');
            expect(report.failure?.reason).toBe('timeout');
        } finally {
            await browser.close();
            silent.closeAllConnections();
            silent.close();
        }
    });
});

/** Serve `definition`'s host page and give `fn` a browser page and its URL. */
async function withHostPage(definition: object, fn: (page: import('@playwright/test').Page, url: string) => Promise<void>): Promise<void> {
    const html = renderHostPage({ definition: definition as never });
    const http = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch();
    try {
        await fn(await browser.newPage(), `http://127.0.0.1:${(http.address() as { port: number }).port}/`);
    } finally {
        await browser.close();
        http.close();
    }
}
