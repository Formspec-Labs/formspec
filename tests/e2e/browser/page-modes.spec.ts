/** @filedesc E2E tests for formPresentation.pageMode: single, wizard, and tabs. */
import { test, expect } from '@playwright/test';
import { gotoHarness, mountDefinition } from './helpers/harness';

/** Minimal definition with two groups for page testing. */
const BASE_DEFINITION = {
    $formspec: '1.0',
    url: 'urn:test:page-modes',
    version: '1.0.0',
    title: 'Page Mode Test',
    items: [
        { key: 'name', type: 'field', label: 'Full Name', dataType: 'string' },
        { key: 'email', type: 'field', label: 'Email', dataType: 'string' },
        { key: 'notes', type: 'field', label: 'Notes', dataType: 'string' },
    ],
};

/** Stack > Page* component tree reused across modes. */
const THREE_PAGE_TREE = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'urn:test:page-modes' },
    tree: {
        component: 'Stack',
        children: [
            {
                component: 'Section',
                title: 'Personal',
                children: [{ component: 'TextInput', bind: 'name' }],
            },
            {
                component: 'Section',
                title: 'Contact',
                children: [{ component: 'TextInput', bind: 'email' }],
            },
            {
                component: 'Section',
                title: 'Extra',
                children: [{ component: 'TextInput', bind: 'notes' }],
            },
        ],
    },
};

async function mountPageMode(
    page: import('@playwright/test').Page,
    pageMode: 'single' | 'wizard' | 'tabs',
    extraPres?: Record<string, unknown>,
) {
    await gotoHarness(page);
    await page.evaluate(
        ({ def, comp }) => {
            const el: any = document.querySelector('formspec-render');
            el.componentDocument = comp;
            el.definition = def;
        },
        {
            def: {
                ...BASE_DEFINITION,
                formPresentation: { pageMode, ...extraPres },
            },
            comp: THREE_PAGE_TREE,
        },
    );
    // Let the render cycle complete
    await page.waitForTimeout(200);
}

// ── Single mode ──────────────────────────────────────────────────────────────

test.describe('pageMode: single', () => {
    test('all pages visible simultaneously', async ({ page }) => {
        await mountPageMode(page, 'single');

        // In single mode there is no wizard or tabs — all content is rendered inline
        const wizardContainer = page.locator('.formspec-wizard');
        await expect(wizardContainer).toHaveCount(0);
        const tabsContainer = page.locator('.formspec-tabs');
        await expect(tabsContainer).toHaveCount(0);

        // All three text inputs should be visible
        const nameInput = page.locator('input[name="name"]');
        const emailInput = page.locator('input[name="email"]');
        const notesInput = page.locator('input[name="notes"]');
        await expect(nameInput).toBeVisible();
        await expect(emailInput).toBeVisible();
        await expect(notesInput).toBeVisible();
    });

    test('fields are interactive in single mode', async ({ page }) => {
        await mountPageMode(page, 'single');

        await page.fill('input[name="name"]', 'Alice');
        const value = await page.evaluate(() => {
            const el: any = document.querySelector('formspec-render');
            return el.getEngine().signals['name']?.value;
        });
        expect(value).toBe('Alice');
    });
});

// ── Wizard mode ──────────────────────────────────────────────────────────────

test.describe('pageMode: wizard', () => {
    test('renders wizard with first page visible', async ({ page }) => {
        await mountPageMode(page, 'wizard', { showProgress: true });

        const wizard = page.locator('.formspec-wizard');
        await expect(wizard).toBeVisible();

        // First panel visible
        const panels = page.locator('.formspec-wizard-panel');
        await expect(panels.nth(0)).toBeVisible();
        await expect(panels.nth(1)).toBeHidden();
        await expect(panels.nth(2)).toBeHidden();
    });

    test('Next and Previous navigate between pages', async ({ page }) => {
        await mountPageMode(page, 'wizard');

        // Click Next → page 2
        await page.locator('button.formspec-wizard-next').click();
        await page.waitForTimeout(100);

        const panels = page.locator('.formspec-wizard-panel');
        await expect(panels.nth(0)).toBeHidden();
        await expect(panels.nth(1)).toBeVisible();

        // Click Previous → back to page 1
        await page.locator('button.formspec-wizard-prev').click();
        await page.waitForTimeout(100);

        await expect(panels.nth(0)).toBeVisible();
        await expect(panels.nth(1)).toBeHidden();
    });

    test('last step shows Submit button', async ({ page }) => {
        await mountPageMode(page, 'wizard');

        const nextBtn = page.locator('button.formspec-wizard-next');
        await nextBtn.click(); // page 2
        await nextBtn.click(); // page 3 (last)
        await page.waitForTimeout(100);

        await expect(nextBtn).toHaveText('Submit');
    });

    test('field input persists after navigating away and back', async ({ page }) => {
        await mountPageMode(page, 'wizard');

        await page.fill('input[name="name"]', 'Alice');
        await page.locator('button.formspec-wizard-next').click();
        await page.waitForTimeout(100);
        await page.locator('button.formspec-wizard-prev').click();
        await page.waitForTimeout(100);

        await expect(page.locator('input[name="name"]')).toHaveValue('Alice');
    });
});

// ── Tabs mode ────────────────────────────────────────────────────────────────

test.describe('pageMode: tabs', () => {
    test('renders tab bar with one tab per page', async ({ page }) => {
        await mountPageMode(page, 'tabs');

        const tabs = page.locator('.formspec-tabs');
        await expect(tabs).toBeVisible();

        const buttons = page.locator('.formspec-tab');
        await expect(buttons).toHaveCount(3);
        await expect(buttons.nth(0)).toHaveText('Personal');
        await expect(buttons.nth(1)).toHaveText('Contact');
        await expect(buttons.nth(2)).toHaveText('Extra');
    });

    test('first tab selected by default', async ({ page }) => {
        await mountPageMode(page, 'tabs');

        const buttons = page.locator('.formspec-tab');
        await expect(buttons.nth(0)).toHaveAttribute('aria-selected', 'true');
        await expect(buttons.nth(1)).toHaveAttribute('aria-selected', 'false');

        const panels = page.locator('.formspec-tab-panel');
        await expect(panels.nth(0)).toBeVisible();
        await expect(panels.nth(1)).toBeHidden();
    });

    test('clicking tab switches visible panel', async ({ page }) => {
        await mountPageMode(page, 'tabs');

        await page.locator('.formspec-tab').nth(1).click();
        await page.waitForTimeout(100);

        const panels = page.locator('.formspec-tab-panel');
        await expect(panels.nth(0)).toBeHidden();
        await expect(panels.nth(1)).toBeVisible();
        await expect(panels.nth(2)).toBeHidden();

        // ARIA state updated
        const buttons = page.locator('.formspec-tab');
        await expect(buttons.nth(1)).toHaveAttribute('aria-selected', 'true');
        await expect(buttons.nth(0)).toHaveAttribute('aria-selected', 'false');
    });

    test('defaultTab selects specified tab on initial render', async ({ page }) => {
        await mountPageMode(page, 'tabs', { defaultTab: 2 });

        const panels = page.locator('.formspec-tab-panel');
        await expect(panels.nth(0)).toBeHidden();
        await expect(panels.nth(1)).toBeHidden();
        await expect(panels.nth(2)).toBeVisible();

        const buttons = page.locator('.formspec-tab');
        await expect(buttons.nth(2)).toHaveAttribute('aria-selected', 'true');
    });

    test('field input persists when switching tabs', async ({ page }) => {
        await mountPageMode(page, 'tabs');

        await page.fill('input[name="name"]', 'Bob');

        // Switch to second tab
        await page.locator('.formspec-tab').nth(1).click();
        await page.waitForTimeout(100);

        // Switch back to first tab
        await page.locator('.formspec-tab').nth(0).click();
        await page.waitForTimeout(100);

        await expect(page.locator('input[name="name"]')).toHaveValue('Bob');
    });

    test('keyboard arrow navigation moves between tabs', async ({ page }) => {
        await mountPageMode(page, 'tabs');

        // Focus the first tab button
        await page.locator('.formspec-tab').nth(0).focus();

        // ArrowRight → second tab
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);

        const buttons = page.locator('.formspec-tab');
        await expect(buttons.nth(1)).toHaveAttribute('aria-selected', 'true');

        const panels = page.locator('.formspec-tab-panel');
        await expect(panels.nth(1)).toBeVisible();
    });

    test('ARIA tabpanel and tab roles are present', async ({ page }) => {
        await mountPageMode(page, 'tabs');

        const tablist = page.locator('[role="tablist"]');
        await expect(tablist).toHaveCount(1);

        const tabButtons = page.locator('[role="tab"]');
        await expect(tabButtons).toHaveCount(3);

        const tabPanels = page.locator('[role="tabpanel"]');
        await expect(tabPanels).toHaveCount(3);

        // First tab controls first panel
        const firstTabId = await tabButtons.nth(0).getAttribute('id');
        const firstPanelLabelledBy = await tabPanels.nth(0).getAttribute('aria-labelledby');
        expect(firstPanelLabelledBy).toBe(firstTabId);
    });
});
