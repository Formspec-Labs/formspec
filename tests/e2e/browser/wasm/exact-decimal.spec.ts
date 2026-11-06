/** @filedesc Real-browser exact decimal rendering, validation, and response read-back. */
import { expect, test } from '@playwright/test';

test('calculated thirds survive numeric controls, serialization, and reload', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/wasm-runtime-network.html');
    await page.waitForFunction(() => (window as any).isFormspecEngineInitialized?.());
    await page.evaluate(() => {
        const renderer = (window as any).renderer;
        renderer.definition = { $formspec: '1.0', url: 'urn:test:browser-decimal', version: '1', items: [
            { key: 'input', label: 'Input', type: 'field', dataType: 'decimal', initialValue: 1 },
            { key: 'ratio', label: 'Ratio', type: 'field', dataType: 'decimal' },
        ], binds: [{ path: 'ratio', calculate: '$input / 3' }] };
        renderer.render();
    });
    const third = '0.3333333333333333333333333333';
    await expect(page.locator('input[name="ratio"]')).toHaveValue(third);
    const result = await page.evaluate(() => {
        const engine = (window as any).renderer.getEngine();
        const response = engine.getResponse({ profile: 'on-submit' });
        const text = JSON.stringify(response);
        engine.loadResponseData((window as any).parseJsonExact(text).data);
        return { text, reloaded: JSON.stringify(engine.getResponse().data.ratio), status: response.status };
    });
    expect(result.text).toContain(`"ratio":${third}`);
    expect(result.reloaded).toBe(third);
    expect(result.status).toBe('completed');
    await page.locator('input[name="input"]').fill(third);
    await expect(page.locator('input[name="ratio"]')).toHaveValue('0.1111111111111111111111111111');
    await page.locator('input[name="input"]').fill('1e-100');
    const invalid = await page.evaluate(() => (window as any).renderer.getEngine().getResponseSnapshot({ profile: 'on-submit' }));
    expect(invalid.response.data.input).toBe('1e-100');
    expect(invalid.response.status).toBe('in-progress');
    expect(invalid.validationReport.results).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'TYPE_MISMATCH' })]));
    expect(errors).toEqual([]);
});
