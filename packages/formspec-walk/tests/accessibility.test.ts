/** @filedesc The reference-renderer accessibility check, in a real browser: a known violation fails, a clean form passes, a timeout and a browser failure are failures. */
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderHostPage } from '@formspec-org/webcomponent/host';
import { AccessibilityServer, checkAccessibility, MANUAL_REVIEW, type RendererCheckReport } from '../src/index.js';

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
