/** @filedesc Browser checks for read-only values, required markers, and validation summary targets. */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from '@playwright/test';
import { renderHostPage } from '@formspec-org/webcomponent/host';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { orderFieldPaths, Walk } from '../src/index.js';
import virtualBuild from '../src/virtual-build.cjs';

const date = (key: string) => ({ key, type: 'field', dataType: 'date', label: 'Visit date:' });
const group = (key: string) => ({ key, type: 'group', label: key, children: [date('visit')] });
const definition = {
    $formspec: '1.0', url: 'urn:test:walk-semantics', version: '1.0.0', title: 'Visit',
    items: [
        group('first'), group('second'),
        { key: 'kind', type: 'field', dataType: 'choice', label: 'Visit type', initialValue: 'remote',
            options: [{ value: 'remote', label: 'Remote' }, { value: 'in_person', label: 'In person' }] },
        { key: 'notices', type: 'field', dataType: 'multiChoice', label: 'Notices (as required by the provider)',
            options: [{ value: 'email', label: 'Email' }, { value: 'text', label: 'Text' }] },
        { key: 'hidden', type: 'group', label: 'Hidden', children: [date('internal')] },
        date('unknown'),
    ],
    binds: [
        { path: 'first.visit', required: 'true' }, { path: 'second.visit', required: 'true' },
        { path: 'kind', readonly: 'true', relevant: 'true' },
        { path: 'hidden', relevant: 'false' }, { path: 'unknown', relevant: "$kind = 'unknown'" },
    ],
};
const orderDefinition = { ...definition, binds: [], items: [{
    key: 'visits', type: 'group', label: 'Visits', repeatable: true, minRepeat: 2, children: [
        { key: 'lastName', type: 'field', dataType: 'string', label: 'Last name' },
        { key: 'firstName', type: 'field', dataType: 'string', label: 'First name' },
    ],
}] };

let browser: Browser;
const http = createServer((req, res) => {
    if (req.url === '/reader.js') {
        res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(virtualBuild.virtualBrowserBuild()));
    } else {
        res.writeHead(200, { 'content-type': 'text/html' })
            .end(renderHostPage({ definition: req.url === '/ordered' ? orderDefinition : definition } as never));
    }
});
beforeAll(async () => {
    await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); http.close(); });

async function open(path = '/') {
    const page = await browser.newPage({ bypassCSP: true });
    const url = `http://127.0.0.1:${(http.address() as { port: number }).port}/`;
    await page.goto(new URL(path, url).href);
    // Vitest rewrites dynamic imports in page.evaluate callbacks. Load the same reader as a browser module.
    await page.addScriptTag({ type: 'module', content: "import { virtual } from '/reader.js'; window.__formspecVirtualScreenReader = virtual;" });
    await page.waitForFunction(() => Boolean(window.__formspecVirtualScreenReader));
    return { page, walk: await Walk.open(page, {}) };
}

it('reads and tabs through one complete repeat row before the next', async () => {
    const { page, walk } = await open('/ordered');
    const authored = ['visits.lastName', 'visits.firstName'];
    const label = (path: string) => path.endsWith('.lastName') ? 'Last name' : 'First name';
    try {
        const live = (await walk.state()).map(f => f.path);
        const oldFieldOrder = authored.flatMap(p => live.filter(path => path.replace(/\[\d+\]/g, '') === p));
        await walk.readingOrder(oldFieldOrder.map(path => ({ path, label: label(path) })));
        expect(walk.findings).toContain('visits[0].firstName: read before the field the Definition puts ahead of it');
        const fixed = await Walk.open(page, {});
        const ordered = orderFieldPaths(authored, live);
        expect(ordered).toEqual(['visits[0].lastName', 'visits[0].firstName', 'visits[1].lastName', 'visits[1].firstName']);
        await fixed.readingOrder(ordered.map(path => ({ path, label: label(path) })));
        await fixed.tabOrder(ordered);
        fixed.expectClean();
    } finally { await page.close(); }
});

it('checks a disabled choice in reading order without requiring focus and leaves optional wording alone', async () => {
    const { page, walk } = await open();
    try {
        await walk.field('first.visit', { label: 'Visit date:', required: true });
        const paths = ['first.visit', 'second.visit', 'kind'];
        expect(await walk.reveal('kind', { label: 'Visit type', options: ['Remote', 'In person'] })).toBe('visible');
        await walk.tabOrder(paths);
        await walk.readingOrder(paths.map((path, i) => ({ path, label: i < 2 ? 'Visit date:' : 'Visit type' })));
        await walk.field('notices', { label: 'Notices (as required by the provider)', required: false, options: ['Email', 'Text'] });
        walk.expectClean();
    } finally { await page.close(); }
});

it('keeps authored hidden paths distinct from unexercised dynamic paths', async () => {
    const { page, walk } = await open();
    try {
        expect(await walk.reveal('hidden.internal', { label: 'Visit date:' })).toBe(false);
        expect(await walk.reveal('unknown', { label: 'Visit date:' })).toBe(false);
        expect(walk.intentionallyHidden).toEqual(['hidden.internal']);
        expect(walk.uncovered).toEqual([expect.stringContaining('unknown:')]);
        expect(walk.findings).toEqual([expect.stringContaining('unknown:')]);
    } finally { await page.close(); }
});

it('still reports a missing required state and missing read-only value', async () => {
    const { page, walk } = await open();
    try {
        await page.locator('[data-name="first.visit"] input').evaluate(el => {
            el.removeAttribute('required');
            el.removeAttribute('aria-required');
        });
        await walk.field('first.visit', { label: 'Visit date:', required: true });
        await page.locator('[data-name="kind"] select').evaluate(el => { (el as HTMLSelectElement).selectedIndex = -1; });
        await walk.field('kind', { label: 'Visit type' });
        expect(walk.findings).toEqual([
            'first.visit: expected required state true, found false',
            'kind: the read-only choice has no accessible selected value',
        ]);
    } finally { await page.close(); }
});

const summaryRows = ['second.visit', 'first.visit'].map(path => ({ path, label: 'Visit date:' }));
it('matches same-named summary links by target and checks Enter and error semantics', async () => {
    const { page, walk } = await open();
    try {
        expect(await walk.summary(summaryRows)).toBe(2);
        walk.expectClean();
    } finally { await page.close(); }
});

it('reports a broken summary jump even with the right link text and target', async () => {
    const { page, walk } = await open();
    try {
        await page.evaluate(() => document.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.target as Element)?.closest('.formspec-validation-summary')) e.preventDefault();
        }, true));
        expect(await walk.summary(summaryRows)).toBe(0);
        expect(walk.findings).toEqual(summaryRows.map(({ path }) => `${path}: Enter on its summary link did not move focus to the field`));
    } finally { await page.close(); }
});

it('reports missing invalid state and error association even when Enter focuses the right field', async () => {
    const { page, walk } = await open();
    try {
        await page.evaluate(() => document.addEventListener('focusin', e => {
            const control = e.target as HTMLElement;
            if (control.closest('[data-name="second.visit"]')) {
                for (const attr of ['aria-invalid', 'aria-describedby', 'aria-errormessage']) control.removeAttribute(attr);
            }
        }, true));
        await walk.summary([summaryRows[0]]);
        expect(walk.findings).toEqual([
            'second.visit: focused from the summary, but the control is not marked aria-invalid',
            "second.visit: the summary message is missing from the control's accessible error description",
        ]);
    } finally { await page.close(); }
});
