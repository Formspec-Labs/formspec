/** @filedesc Real-browser walk checks distinguish kept, lost, and unsaved native choices. */
import { createServer } from 'node:http';
import { chromiumChannel } from '../src/chromium-channel.js';
import { chromium, type Browser, type Page } from '@playwright/test';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { renderHostPage } from '@formspec-org/webcomponent/host';
import { Walk } from '../src/index.js';

const options = [{ value: 'AK', label: 'Alaska' }, { value: 'CA', label: 'California' }];
const field = (key: string) => ({ key, type: 'field', dataType: 'choice', label: 'State', options });
const definition = { $formspec: '1.0', url: 'urn:test:walk-choice', version: '1.0.0', title: 'Choice', items: [
    field('state'),
    { key: 'offices', type: 'group', label: 'Offices', repeatable: true, minRepeat: 0, children: [field('state')] },
] };
const numericDefinition = { ...definition, items: [{ key: 'state', type: 'field', label: 'State', dataType: 'decimal', options: [{ value: '0', label: 'Zero' }, { value: '1.50', label: 'One and a half' }] }] };
const server = createServer((req, res) => {
    const numeric = req.url?.startsWith('/numeric');
    const precise = req.url?.includes('precise');
    const numericDoc = precise ? { ...numericDefinition, items: [{ ...numericDefinition.items[0], options: [
        { value: '0', label: 'Zero' }, { value: '9007199254740993.50', label: 'Big' },
    ] }] } : numericDefinition;
    const documents = numeric ? { definition: numericDoc, component: { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition.url }, tree: { component: 'Select', bind: 'state' } },
        ...(req.url?.includes('filled') ? { initialData: { state: 0 } } : {}) } : { definition };
    res.writeHead(200, { 'content-type': 'text/html' }).end(renderHostPage(documents as never));
});
let browser: Browser;
let url: string;
beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    browser = await chromium.launch(chromiumChannel());
});
afterAll(async () => { await browser?.close(); await new Promise<void>(resolve => server.close(() => resolve())); });
async function open(before?: (page: Page) => Promise<void>, route = '/') {
    const page = await browser.newPage({ bypassCSP: true });
    await page.goto(url + route);
    await page.waitForSelector('formspec-render [data-name]');
    const walk = await Walk.open(page, {
        // Choice persistence is independent of speech; the E2E test uses the real virtual reader.
        screenReader: { name: 'choice-test', start: async () => {}, stop: async () => {}, next: async () => false, clearSpokenPhraseLog: async () => {}, lastSpokenPhrase: async () => 'State, combobox', spokenPhraseLog: async () => ['State, combobox'] },
    });
    await before?.(page);
    return { page, walk };
}
const want = { label: 'State', required: false, options: ['Alaska', 'California'] };

it('exercises a native choice and restores its original answer', async () => {
    const { page, walk } = await open(async page => { await page.evaluate(() => {
        (window as any).inputs = 0;
        document.addEventListener('input', () => (window as any).inputs++);
    }); });
    try {
        await walk.field('state', want);
        expect(walk.findings).toEqual([]);
        expect(await page.evaluate(() => (window as any).inputs)).toBe(1);
        expect(await page.evaluate(() => (document.querySelector('formspec-render') as any).engine.getResponse().data.state ?? null)).toBeNull();
        expect(await page.locator('[data-name="state"] select').inputValue()).toBe('');
    } finally { await page.close(); }
});
for (const failure of ['dropped', 'rerendered', 'response', 'dom'] as const) {
    it(`finds a ${failure} choice, including inside an initially empty repeat`, async () => {
        const { page, walk } = await open(async page => { await page.evaluate(how => {
            if (how === 'dropped') document.addEventListener('change', e => {
                if ((e.target as Element).tagName === 'SELECT') e.stopImmediatePropagation();
            }, true);
            if (how === 'rerendered') document.addEventListener('input', e => {
                const select = e.target as HTMLSelectElement;
                if (select.tagName === 'SELECT') queueMicrotask(() => { select.value = ''; });
            }, true);
            if (how === 'dom') document.addEventListener('change', e => {
                const select = e.target as HTMLSelectElement;
                if (select.tagName === 'SELECT') queueMicrotask(() => { select.value = ''; });
            });
            if (how === 'response') {
                const engine = (document.querySelector('formspec-render') as any).engine;
                const response = engine.getResponse.bind(engine);
                engine.getResponse = () => ({ ...response(), data: {} });
            }
        }, failure); });
        try {
            await walk.field('state', want);
            await walk.field('offices.state', want);
            expect(new Set(walk.findings.filter(f => f.includes(': chose "')).map(f => f.split(': chose')[0])).size).toBe(2);
            expect(() => walk.expectClean()).toThrow(/chose/);
        } finally { await page.close(); }
    });
}
it('fails when the browser never exercised the promised choice', async () => {
    const { page, walk } = await open(async page => { await page.evaluate(() => {
        document.addEventListener('keydown', e => e.preventDefault(), true);
    }); });
    try {
        await walk.field('state', want);
        expect(walk.findings).toContainEqual(expect.stringContaining('chose no option'));
    } finally { await page.close(); }
});

it('accepts numeric normalization and restores an existing zero answer', async () => {
    const { page, walk } = await open(undefined, '/numeric-filled');
    try {
        await walk.choice('state');
        expect(walk.findings).toEqual([]);
        expect(await page.locator('select').inputValue()).toBe('0');
        expect(await page.evaluate(() => (document.querySelector('formspec-render') as any).engine.getResponse().data.state)).toBe(0);
    } finally { await page.close(); }
});
it('a missing response cannot pass as numeric option zero', async () => {
    const { page, walk } = await open(async page => { await page.evaluate(() => {
        const engine = (document.querySelector('formspec-render') as any).engine;
        const response = engine.getResponse.bind(engine);
        engine.getResponse = () => ({ ...response(), data: { state: null } });
    }); }, '/numeric');
    try {
        await walk.choice('state');
        expect(walk.findings).toContainEqual(expect.stringContaining('chose "Zero" with one keyboard action, but the response kept null'));
    } finally { await page.close(); }
});
it.each([
    ['9007199254740993.5000', true],
    ['9007199254740993.51', false],
] as const)('compares exact numeric choice spellings without rounding: %s', async (saved, equal) => {
    const { page, walk } = await open(async page => { await page.evaluate(text => {
        const engine = (document.querySelector('formspec-render') as any).engine;
        const response = engine.getResponse.bind(engine);
        engine.getResponse = () => ({ ...response(), data: { state: { rawJSON: text } } });
    }, saved); }, '/numeric-precise-filled');
    try {
        await walk.choice('state');
        expect(walk.findings.some(f => f.includes('response kept'))).toBe(!equal);
        expect(walk.findings.some(f => f.includes('field kept'))).toBe(false);
    } finally { await page.close(); }
});
it('restores the original answer and removes the capture listener after a keyboard error', async () => {
    const { page, walk } = await open(async page => { await page.evaluate(() => (document.querySelector('formspec-render') as any).engine.setValue('state', 'CA')); });
    const type = page.keyboard.type.bind(page.keyboard);
    const failing = vi.spyOn(page.keyboard, 'type').mockImplementation(async key => { await type(key); throw new Error('keyboard failed'); });
    try {
        await expect(walk.choice('state')).rejects.toThrow('keyboard failed');
        expect(await page.evaluate(() => window.__formspecWalkChoice)).toBeUndefined();
        expect(await page.locator('[data-name="state"] select').inputValue()).toBe('CA');
        expect(await page.evaluate(() => (document.querySelector('formspec-render') as any).engine.getResponse().data.state)).toBe('CA');
    } finally { failing.mockRestore(); await page.close(); }
});

it('exercises localized and punctuation-leading option labels without a false finding', async () => {
    const { page, walk } = await open(async page => { await page.evaluate(() => {
        const select = document.querySelector('select')!;
        select.options[1].textContent = '中文';
        select.options[2].textContent = '(École)';
        (window as any).inputs = 0;
        select.addEventListener('input', () => (window as any).inputs++);
    }); });
    try {
        await walk.choice('state');
        expect(walk.findings).toEqual([]);
        expect(await page.evaluate(() => (window as any).inputs)).toBe(1);
    } finally { await page.close(); }
});

it('reports unsupported native typeahead as uncovered instead of failing a correct localized control', async () => {
    const { page, walk } = await open(async page => { await page.evaluate(() => {
        const select = document.querySelector('select')!;
        select.options[1].textContent = 'École';
        select.options[2].textContent = '中文';
    }); });
    try {
        await walk.choice('state');
        expect(walk.findings).toEqual([]);
        expect(walk.uncovered).toContainEqual(expect.stringContaining('native typeahead'));
    } finally { await page.close(); }
});
