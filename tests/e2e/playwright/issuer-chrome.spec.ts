/** @filedesc Browser E2E coverage for Issuer chrome, overrides, and parent degradation. */
import { expect, test, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { gotoHarness } from '../browser/helpers/harness';

const FIXTURE_DIR = path.resolve(__dirname, '../fixtures/issuer');

const DEFINITION = fixture('definition.json');
const SPRINGFIELD = fixture('springfield-issuer.json');
const CITY = fixture('city-issuer.json');
const STATE = fixture('state-issuer.json');
const ALLOWED = fixture('allowed-issuer.json');

test.describe('Issuer chrome - browser', () => {
    test('Definition-declared Issuer renders chrome', async ({ page }) => {
        await routeIssuers(page);
        await gotoHarness(page);
        await mountDefinition(page, DEFINITION);

        await expect(page.locator('.fs-issuer-name')).toHaveText('Springfield Public Health');
        await expect(page.locator('.fs-issuer-org-breadcrumb')).toContainText('City of Springfield');
        await expect(page.locator('.fs-issuer-support')).toHaveText('health@springfield.example');
    });

    test('Embed-time override replaces chrome', async ({ page }) => {
        await routeIssuers(page);
        await gotoHarness(page);
        await page.evaluate((issuer) => {
            const el: any = document.querySelector('formspec-render');
            el.issuerOverride = { kind: 'inline', issuer };
        }, STATE);
        await mountDefinition(page, DEFINITION);

        await expect(page.locator('.fs-issuer-name')).toHaveText('State of Massachusetts');
        await expect(page.locator('.fs-issuer-query-indicator')).toHaveCount(0);
    });

    test('Allowlisted ?_issuer= overrides chrome and shows visible indicator', async ({ page }) => {
        await routeIssuers(page);
        await gotoHarness(
            page,
            'http://127.0.0.1:8080/?_issuer=https%3A%2F%2Fallowed%2Fissuer.json',
        );
        await page.evaluate(() => {
            const el: any = document.querySelector('formspec-render');
            el.issuerAllowedOrigins = ['https://allowed'];
        });
        await mountDefinition(page, DEFINITION);

        await expect(page.locator('.fs-issuer-name')).toHaveText('Allowlisted Org');
        await expect(page.locator('.fs-issuer-query-indicator')).toBeVisible();
    });

    test('Non-allowlisted ?_issuer= is ignored', async ({ page }) => {
        await routeIssuers(page);
        await gotoHarness(
            page,
            'http://127.0.0.1:8080/?_issuer=https%3A%2F%2Fbad%2Fissuer.json',
        );
        await page.evaluate(() => {
            const el: any = document.querySelector('formspec-render');
            el.issuerAllowedOrigins = ['https://allowed'];
        });
        await mountDefinition(page, DEFINITION);

        await expect(page.locator('.fs-issuer-name')).toHaveText('Springfield Public Health');
        await expect(page.locator('.fs-issuer-query-indicator')).toHaveCount(0);
    });

    test('Parent fetch failure degrades gracefully', async ({ page }) => {
        await routeIssuers(page, { failCity: true });
        await gotoHarness(page);
        await mountDefinition(page, DEFINITION);

        await expect(page.locator('.fs-issuer-name')).toHaveText('Springfield Public Health');
        await expect(page.locator('.fs-issuer-org-breadcrumb')).toHaveText('City of Springfield');
    });
});

async function mountDefinition(page: Page, definition: unknown): Promise<void> {
    await page.evaluate((data) => {
        const el: any = document.querySelector('formspec-render');
        el.definition = data;
    }, definition);
}

async function routeIssuers(page: Page, options: { failCity?: boolean } = {}): Promise<void> {
    await page.route('https://issuer.test/springfield.json', async (route) => {
        await route.fulfill({ json: SPRINGFIELD });
    });
    await page.route('https://issuer.test/city.json', async (route) => {
        if (options.failCity) {
            await route.fulfill({ status: 404, body: 'not found' });
            return;
        }
        await route.fulfill({ json: CITY });
    });
    await page.route('https://allowed/issuer.json', async (route) => {
        await route.fulfill({ json: ALLOWED });
    });
}

function fixture(name: string): unknown {
    return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}
