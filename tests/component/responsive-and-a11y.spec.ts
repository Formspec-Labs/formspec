import { test, expect } from '@playwright/test';
import { waitForWasm } from '../e2e/browser/helpers/harness';

test.describe('Components: Accessibility and Responsive Overrides', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://127.0.0.1:8080/');
        await page.waitForSelector('formspec-render', { state: 'attached' });
        await waitForWasm(page);
    });

    test('should set aria-required, aria-invalid, and aria-readonly attributes when rendering required and readonly inputs', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0",
                "url": "http://example.org/test",
                "version": "1.0.0",
                "title": "A11y Test",
                "items": [
                    { "key": "name", "type": "field", "dataType": "string", "label": "Name" },
                    { "key": "email", "type": "field", "dataType": "string", "label": "Email" }
                ],
                "binds": [
                    { "path": "name", "required": true },
                    { "path": "email", "readonly": true }
                ]
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Stack",
                    "children": [
                        { "component": "TextInput", "bind": "name" },
                        { "component": "TextInput", "bind": "email" }
                    ]
                }
            };
        });

        const nameInput = page.locator('#field-name');
        const emailInput = page.locator('#field-email');

        // name is required
        await expect(nameInput).toHaveAttribute('aria-required', 'true');
        // email is readonly
        await expect(emailInput).toHaveAttribute('aria-readonly', 'true');
        // name starts empty but untouched -> aria-invalid is false (errors hidden until interaction)
        await expect(nameInput).toHaveAttribute('aria-invalid', 'false');

        // Click into name, then blur without filling -> now touched and invalid
        await nameInput.click();
        await emailInput.click(); // blur name by focusing another field
        await expect(nameInput).toHaveAttribute('aria-invalid', 'true');

        // Fill name -> aria-invalid should become false
        await nameInput.fill('John');
        await expect(nameInput).toHaveAttribute('aria-invalid', 'false');
    });

    test('should merge responsive props when the active viewport breakpoint changes', async ({ page }) => {
        // Set viewport to a wide size first
        await page.setViewportSize({ width: 1200, height: 800 });

        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0",
                "url": "http://example.org/test",
                "version": "1.0.0",
                "title": "Responsive Test",
                "items": []
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "breakpoints": {
                    "mobile": 0,
                    "tablet": 600,
                    "desktop": 901
                },
                "tree": {
                    "component": "Grid",
                    "columns": 4,
                    "responsive": {
                        "mobile": { "columns": 1 },
                        "tablet": { "columns": 2 },
                        "desktop": { "columns": 4 }
                    },
                    "children": [
                        { "component": "Text", "text": "A" },
                        { "component": "Text", "text": "B" },
                        { "component": "Text", "text": "C" },
                        { "component": "Text", "text": "D" }
                    ]
                }
            };
        });

        // At 1200px width, desktop breakpoint resets the mobile-first cascade to 4 columns.
        const grid = page.locator('.formspec-grid').first();
        let colCount = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(colCount).toBe(4);

        // Resize to tablet
        await page.setViewportSize({ width: 800, height: 800 });
        await page.waitForTimeout(200); // wait for matchMedia to fire

        colCount = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(colCount).toBe(2);
    });
});
