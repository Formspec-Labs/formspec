/** @filedesc Assert render-only bundle does not fetch tools WASM on startup (ADR 0050 §8). */
import { test, expect } from '@playwright/test';

const SLIM_HARNESS = '/wasm-runtime-network.html';

test.describe('WASM runtime-only network (slim harness)', () => {
    test('does not request tools wasm/glue during runtime init', async ({ page }) => {
        const wasmRelatedUrls: string[] = [];

        page.on('response', (response) => {
            const url = response.url();
            if (
                url.includes('.wasm')
                || url.includes('formspec_wasm_runtime')
                || url.includes('formspec_wasm_tools')
                || url.includes('wasm-pkg-runtime')
                || url.includes('wasm-pkg-tools')
            ) {
                wasmRelatedUrls.push(url);
            }
        });

        await page.goto(SLIM_HARNESS);
        await page.waitForFunction(
            () => {
                const fn = (window as unknown as { isFormspecEngineInitialized?: () => boolean }).isFormspecEngineInitialized;
                return typeof fn === 'function' && fn() === true;
            },
            {},
            { timeout: 15000 },
        );

        const toolsHits = wasmRelatedUrls.filter(
            (u) => u.includes('formspec_wasm_tools') || u.includes('wasm-pkg-tools'),
        );
        expect(
            toolsHits,
            `Expected no tools WASM or wasm-pkg-tools URLs; got: ${toolsHits.join('\n')}`,
        ).toEqual([]);

        const runtimeHits = wasmRelatedUrls.filter(
            (u) => u.includes('formspec_wasm_runtime') || u.includes('wasm-pkg-runtime'),
        );
        expect(
            runtimeHits.length,
            `Expected at least one runtime WASM-related request; saw: ${wasmRelatedUrls.join('\n')}`,
        ).toBeGreaterThan(0);
    });
});
