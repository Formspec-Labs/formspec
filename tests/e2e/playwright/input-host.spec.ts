/** @filedesc Native keyboard choices survive a React host input rerender, including repeats. */
import { expect, test } from '@playwright/test';
import { Walk } from '../../../packages/formspec-walk/src/index.js';

test('one browser action keeps each native choice in DOM and response, including Add row', async ({ page }) => {
    await page.goto('/input-host.html');
    const select = page.locator('[data-name="state"] select');
    await select.focus();
    await page.keyboard.press('c');
    await expect(select).toHaveValue('CA');
    const response = () => page.evaluate(() => (document.querySelector('[data-formspec-render-root]') as any).engine.getResponse().data);
    expect((await response()).state).toBe('CA');
    const row = page.locator('[data-name="offices[0].state"] select');
    await row.focus();
    await page.keyboard.press('a');
    await expect(row).toHaveValue('AK');
    await page.locator('.formspec-repeat-add').click();
    const added = page.locator('[data-name="offices[1].state"] select');
    await added.focus();
    await page.keyboard.press('c');
    await expect(added).toHaveValue('CA');
    expect((await response()).offices).toEqual([{ state: 'AK' }, { state: 'CA' }]);
    await expect(page.locator('[data-edits]')).toHaveAttribute('data-edits', '3');
});

test('Definition Walk detects the same one-action failure in the actual React host', async ({ page }) => {
    const walk = await Walk.open(page, { url: '/input-host.html' });
    await walk.field('state', { label: 'State', required: false, options: ['Alaska', 'California'] });
    walk.expectClean();
    await expect(page.locator('[data-edits]')).toHaveAttribute('data-edits', '1');
});

for (const [key, shown, saved] of [['f', '1.0', 1], ['o', '1.50', 1.5], ['t', '02', 2]] as const) {
    test(`numeric choice ${shown} keeps its authored spelling and saved number through a host input rerender`, async ({ page }) => {
        // A fresh page gives each one-action case a fresh native typeahead search buffer.
        await page.goto('/input-host.html?numeric');
        const select = page.locator('select');
        await select.focus();
        await page.keyboard.press(key);
        await expect(select).toHaveValue(shown);
        expect(await page.evaluate(() => (document.querySelector('[data-formspec-render-root]') as any).engine.getResponse().data.amount)).toBe(saved);
        await expect(page.locator('[data-edits]')).toHaveAttribute('data-edits', '1');
    });
}

test('editable DataTable choices survive a host rerender in existing and added rows', async ({ page }) => {
    await page.goto('/input-host.html?table');
    const row = page.locator('select[name="offices[0].state"]');
    await row.focus();
    await page.keyboard.press('c');
    await expect(row).toHaveValue('CA');
    await page.locator('.formspec-datatable-add').click();
    const added = page.locator('select[name="offices[1].state"]');
    await added.focus();
    await page.keyboard.press('a');
    await expect(added).toHaveValue('AK');
    expect(await page.evaluate(() => (document.querySelector('[data-formspec-render-root]') as any).engine.getResponse().data.offices)).toEqual([{ state: 'CA' }, { state: 'AK' }]);
    await expect(page.locator('[data-edits]')).toHaveAttribute('data-edits', '2');
});

for (const adapter of ['default', 'uswds']) {
    test(`${adapter} webcomponent keeps its focused choice during a host status rerender`, async ({ page }) => {
        page.on('pageerror', error => console.error('browser page error:', error.message));
        await page.goto(`/input-host-webcomponent.html${adapter === 'uswds' ? '?uswds' : ''}`);
        await expect(page.locator('[data-input-count]')).toHaveAttribute('data-input-count', '0');
        const select = page.locator('formspec-render select');
        if (adapter === 'uswds') await expect(select).toHaveClass(/usa-select/);
        await expect(select.locator('option')).toHaveCount(3);
        await expect(select).toBeVisible();
        await select.focus();
        await page.keyboard.press('c');
        await expect(select).toHaveValue('CA');
        await expect(page.locator('[data-input-count]')).toHaveAttribute('data-input-count', '1');
        expect(await page.evaluate(() => (document.querySelector('formspec-render') as any).engine.getResponse().data.state)).toBe('CA');
    });
}
