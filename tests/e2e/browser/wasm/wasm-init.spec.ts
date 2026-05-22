import { test, expect } from '@playwright/test';

test('WASM initializes in browser', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/');
    await page.waitForFunction(() => (window as any).__wasmReady !== undefined, {}, { timeout: 10000 });

    const wasmReady = await page.evaluate(() => (window as any).__wasmReady);
    const engineReady = await page.evaluate(() => (window as any).isFormspecEngineInitialized());

    expect(wasmReady).toBe(true);
    expect(engineReady).toBe(true);
});

test('createFormEngine evaluates correctly when WASM is ready', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/');
    await page.waitForFunction(() => (window as any).__wasmReady === true, {}, { timeout: 10000 });

    const result = await page.evaluate(() => {
        const engine = (window as any).createFormEngine({
            $formspec: '1.0',
            version: '1.0',
            title: 'Test',
            url: 'test://wasm-ready',
            items: [
                { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
                { key: 'price', type: 'field', dataType: 'decimal', label: 'Price' },
                { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' },
            ],
            binds: [{ path: 'total', calculate: '$qty * $price' }],
        });

        engine.setValue('qty', 4);
        engine.setValue('price', 5);
        return engine.signals.total.value;
    });

    expect(result).toBe(20);
});

test('WASM FEL evaluation produces correct results via engine', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/');
    await page.waitForFunction(() => (window as any).__wasmReady === true, {}, { timeout: 10000 });

    const result = await page.evaluate(() => {
        const engine = (window as any).createFormEngine({
            $formspec: '1.0',
            version: '1.0',
            title: 'Calc Test',
            url: 'test://calc',
            items: [
                { key: 'qty', type: 'field', dataType: 'integer', label: 'Qty' },
                { key: 'price', type: 'field', dataType: 'decimal', label: 'Price' },
                { key: 'total', type: 'field', dataType: 'decimal', label: 'Total' },
            ],
            binds: [
                { path: 'total', calculate: '$qty * $price' },
            ],
        });

        engine.setValue('qty', 3);
        engine.setValue('price', 10);

        const snapshot = engine.getDiagnosticsSnapshot();
        return {
            values: snapshot.values,
        };
    });

    expect(result.values.qty).toBe(3);
    expect(result.values.price).toBe(10);
    expect(result.values.total).toBe(30);
});

test('WASM FEL validation constraints work', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/');
    await page.waitForFunction(() => (window as any).__wasmReady === true, {}, { timeout: 10000 });

    const result = await page.evaluate(() => {
        const engine = (window as any).createFormEngine({
            $formspec: '1.0',
            version: '1.0',
            title: 'Validation Test',
            url: 'test://validation',
            items: [
                { key: 'age', type: 'field', dataType: 'integer', label: 'Age' },
            ],
            binds: [
                { path: 'age', required: true, constraint: '$age >= 0 and $age <= 150' },
            ],
        });

        engine.setValue('age', 200);
        const report = engine.getValidationReport({ profile: 'on-submit' });
        const snapshot = engine.getDiagnosticsSnapshot({ profile: 'on-submit' });
        return {
            valid: report.valid,
            errorCount: report.counts?.error ?? 0,
            mips: snapshot.mips,
        };
    });

    expect(result.valid).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
});

test('WASM FEL relevance (conditional visibility) works', async ({ page }) => {
    await page.goto('http://127.0.0.1:8080/');
    await page.waitForFunction(() => (window as any).__wasmReady === true, {}, { timeout: 10000 });

    const result = await page.evaluate(() => {
        const engine = (window as any).createFormEngine({
            $formspec: '1.0',
            version: '1.0',
            title: 'Relevance Test',
            url: 'test://relevance',
            items: [
                { key: 'hasEmail', type: 'field', dataType: 'boolean', label: 'Has Email?' },
                { key: 'email', type: 'field', dataType: 'text', label: 'Email' },
            ],
            binds: [
                { path: 'email', relevant: '$hasEmail = true' },
            ],
        });

        // Initially hasEmail is false, so email should be non-relevant
        const initialRelevant = engine.relevantSignals['email']?.peek?.();

        engine.setValue('hasEmail', true);
        const afterRelevant = engine.relevantSignals['email']?.peek?.();

        return {
            initialRelevant,
            afterRelevant,
        };
    });

    expect(result.initialRelevant).toBe(false);
    expect(result.afterRelevant).toBe(true);
});
