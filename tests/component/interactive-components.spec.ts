import { test, expect } from '@playwright/test';
import { waitForWasm } from '../e2e/browser/helpers/harness';

test.describe('Components: Core Props and Regression Fixes', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://127.0.0.1:8080/');
        await page.waitForSelector('formspec-render', { state: 'attached' });
        await waitForWasm(page);
    });

    test('should render subtitle and elevation styling when Card props are provided', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0",
                "url": "http://example.org/test",
                "version": "1.0.0",
                "title": "Card Props Test",
                "items": [
                    { "key": "x", "type": "field", "dataType": "string", "label": "X" }
                ]
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Section",
                    "children": [
                        {
                            "component": "Card",
                            "title": "Details",
                            "subtitle": "Enter your details",
                            "elevation": 3,
                            "children": [{ "component": "TextInput", "bind": "x" }]
                        }
                    ]
                }
            };
        });

        const card = page.locator('.formspec-card');
        await expect(card.locator('h3')).toHaveText('Details');
        await expect(card.locator('.formspec-card-subtitle')).toHaveText('Enter your details');
        // elevation 3 → box-shadow should be set
        const boxShadow = await card.evaluate(el => getComputedStyle(el).boxShadow);
        expect(boxShadow).not.toBe('none');
    });

    test('should remove alert content when the dismissible Alert close button is clicked', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0",
                "url": "http://example.org/test",
                "version": "1.0.0",
                "title": "Alert Dismiss Test",
                "items": []
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Section",
                    "children": [
                        { "component": "Alert", "text": "Warning!", "severity": "warning", "dismissible": true }
                    ]
                }
            };
        });

        const alert = page.locator('.formspec-alert');
        await expect(alert).toBeVisible();
        await expect(alert.locator('.formspec-alert-close')).toBeVisible();

        // Click close
        await alert.locator('.formspec-alert-close').click();
        await expect(alert).toHaveCount(0);
    });

    test('should apply row-gap styling when Grid rowGap is provided', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0",
                "url": "http://example.org/test",
                "version": "1.0.0",
                "title": "Grid Props Test",
                "items": []
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Grid",
                    "columns": 3,
                    "rowGap": "2rem",
                    "children": [
                        { "component": "Text", "text": "A" },
                        { "component": "Text", "text": "B" }
                    ]
                }
            };
        });

        const grid = page.locator('.formspec-grid');
        const rowGap = await grid.evaluate(el => getComputedStyle(el).rowGap);
        expect(rowGap).toBe('32px'); // 2rem = 32px at default font size
    });
});

test.describe('Components: Progressive Component Rendering', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://127.0.0.1:8080/');
        await page.waitForSelector('formspec-render', { state: 'attached' });
        await waitForWasm(page);
    });

    test('should render a grid with the configured column count when using Grid', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0", "url": "http://example.org/test",
                "version": "1.0.0", "title": "Grid Test", "items": []
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Grid",
                    "columns": 3,
                    "children": [
                        { "component": "Text", "text": "A" },
                        { "component": "Text", "text": "B" },
                        { "component": "Text", "text": "C" }
                    ]
                }
            };
        });

        const columns = page.locator('.formspec-grid');
        const display = await columns.evaluate(el => getComputedStyle(el).display);
        expect(display).toBe('grid');
        const colCount = await columns.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(colCount).toBe(3);
    });

    test('should open and close modal content when trigger and close controls are used', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0", "url": "http://example.org/test",
                "version": "1.0.0", "title": "Modal Test", "items": []
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Stack",
                    "children": [
                        {
                            "component": "Modal",
                            "triggerLabel": "Open Modal",
                            "size": "small",
                            "children": [{ "component": "Text", "text": "Modal content" }]
                        }
                    ]
                }
            };
        });

        const trigger = page.locator('.formspec-modal-trigger');
        await expect(trigger).toHaveText('Open Modal');

        // Open modal
        await trigger.click();
        const dialog = page.locator('.formspec-modal');
        await expect(dialog).toBeVisible();

        // Close via close button
        await dialog.locator('.formspec-modal-close').click();
        await expect(dialog).not.toBeVisible();
    });

    test('should render popover content and support triggerBind-driven label updates', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0", "url": "http://example.org/test",
                "version": "1.0.0", "title": "Popover Test",
                "items": [{ "key": "name", "type": "field", "dataType": "string", "label": "Name" }]
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Stack",
                    "children": [
                        { "component": "TextInput", "bind": "name" },
                        {
                            "component": "Popover",
                            "triggerBind": "name",
                            "triggerLabel": "Open Details",
                            "placement": "right",
                            "children": [{ "component": "Text", "text": "Popover content" }]
                        }
                    ]
                }
            };
        });

        const nameInput = page.locator('input[name="name"]');
        await nameInput.fill('Alice');

        const trigger = page.locator('.formspec-popover-trigger');
        await expect(trigger).toHaveText('Alice');
        await trigger.click();

        const popover = page.locator('.formspec-popover-content');
        await expect(popover).toContainText('Popover content');
        await expect(popover).toBeVisible();
    });

    test('should update the bound numeric value when Slider input changes', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0", "url": "http://example.org/test",
                "version": "1.0.0", "title": "Slider Test",
                "items": [{ "key": "vol", "type": "field", "dataType": "integer", "label": "Volume" }]
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Section",
                    "children": [
                        { "component": "Slider", "bind": "vol", "min": 0, "max": 100, "step": 5, "showValue": true }
                    ]
                }
            };
        });

        const slider = page.locator('.formspec-slider input[type="range"]');
        await expect(slider).toHaveAttribute('min', '0');
        await expect(slider).toHaveAttribute('max', '100');
        await expect(slider).toHaveAttribute('step', '5');

        // Set value and check display
        await slider.fill('75');
        const value = await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            return el.getEngine().signals['vol'].value;
        });
        expect(value).toBe(75);

        await expect(page.locator('.formspec-slider-value')).toHaveText('75');
    });

    test('should set rating value and star styling when a star is clicked', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0", "url": "http://example.org/test",
                "version": "1.0.0", "title": "Rating Test",
                "items": [{ "key": "score", "type": "field", "dataType": "integer", "label": "Score" }]
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Section",
                    "children": [
                        { "component": "Rating", "bind": "score", "max": 5 }
                    ]
                }
            };
        });

        const stars = page.locator('.formspec-rating-star');
        await expect(stars).toHaveCount(5);

        // Click 3rd star
        await stars.nth(2).click();
        const value = await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            return el.getEngine().signals['score'].value;
        });
        expect(value).toBe(3);

        // First 3 stars should be selected, last 2 should be unselected
        await expect(stars.nth(2)).toHaveClass(/formspec-rating-star--selected/);
        await expect(stars.nth(3)).not.toHaveClass(/formspec-rating-star--selected/);
    });

    test('should support icon mapping and half-step selection when allowHalf is true', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0", "url": "http://example.org/test",
                "version": "1.0.0", "title": "Rating Half Test",
                "items": [{ "key": "score", "type": "field", "dataType": "decimal", "label": "Score" }]
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Section",
                    "children": [
                        { "component": "Rating", "bind": "score", "max": 5, "icon": "heart", "allowHalf": true }
                    ]
                }
            };
        });

        const stars = page.locator('.formspec-rating-star');
        await expect(stars).toHaveCount(5);
        await expect(stars.first()).toHaveText('♡');

        await stars.first().click({ position: { x: 2, y: 8 } });

        const value = await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            return el.getEngine().signals['score'].value;
        });
        expect(value).toBe(0.5);
        await expect(stars.first()).toHaveClass(/formspec-rating-star--half/);
        await expect(stars.nth(1)).not.toHaveClass(/formspec-rating-star--selected/);
    });

    test('should update ProgressBar percentage when its bound field value changes', async ({ page }) => {
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.definition = {
                "$formspec": "1.0", "url": "http://example.org/test",
                "version": "1.0.0", "title": "ProgressBar Bind Test",
                "items": [{ "key": "progress", "type": "field", "dataType": "integer", "label": "Progress", "initialValue": 25 }]
            };
            el.componentDocument = {
                "$formspecComponent": "1.0",
                "tree": {
                    "component": "Stack",
                    "children": [
                        { "component": "ProgressBar", "bind": "progress", "max": 100, "showPercent": true }
                    ]
                }
            };
        });

        const percent = page.locator('.formspec-progress-percent');
        await expect(percent).toHaveText('25%');

        // Update value via engine
        await page.evaluate(() => {
            const el = document.querySelector('formspec-render') as any;
            el.getEngine().setValue('progress', 75);
        });
        await expect(percent).toHaveText('75%');
    });
});
