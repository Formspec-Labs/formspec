/** @filedesc Assert tools WASM is not fetched until tools init; single fetch reused (ADR 0050 §8). */
import { test, expect } from '@playwright/test';

function isToolsWasmAssetUrl(url: string): boolean {
    if (!url.includes('.wasm')) {
        return false;
    }
    return url.includes('formspec_wasm_tools') || url.includes('wasm-pkg-tools');
}

test.describe('WASM tools network (main harness)', () => {
    test('tools .wasm not loaded until initFormspecEngineTools; one fetch for two tokenize calls', async ({ page }) => {
        const toolsWasmUrls: string[] = [];

        page.on('response', (response) => {
            const url = response.url();
            if (isToolsWasmAssetUrl(url)) {
                toolsWasmUrls.push(url);
            }
        });

        await page.goto('/');
        await page.waitForFunction(() => (window as unknown as { __wasmReady?: boolean }).__wasmReady === true, {}, {
            timeout: 15000,
        });

        expect(
            toolsWasmUrls,
            'Runtime-only init should not fetch tools WASM yet',
        ).toEqual([]);

        const tokenized = await page.evaluate(async () => {
            const w = window as unknown as {
                initFormspecEngineTools: () => Promise<void>;
                tokenizeFEL: (expr: string) => unknown;
            };
            await w.initFormspecEngineTools();
            return [w.tokenizeFEL('1 + 2'), w.tokenizeFEL('3 + 4')].map(Array.isArray);
        });
        expect(tokenized, 'tokenizeFEL should return token arrays').toEqual([true, true]);

        expect(
            toolsWasmUrls.length,
            `Expected exactly one tools WASM request; got ${toolsWasmUrls.length}: ${toolsWasmUrls.join(' | ')}`,
        ).toBe(1);
    });
});
