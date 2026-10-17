import { test, expect } from '@playwright/test';

const TOOLS_URL = 'http://localhost:8082/tools.html';

test.describe('Download & Export Tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOOLS_URL);
    await page.waitForSelector('html[data-formspec-wasm-ready="1"]', { timeout: 30_000 });
    await expect(page.locator('.export-card')).toHaveCount(3);
    await page.locator('.tools-tab[data-tab="export"]').click();
    // The grant-application mappings read applicantInfo.orgName; a rule whose source is absent emits nothing
    // (Mapping spec 7.3), so a flat {"orgName"} leaves the CSV with no column at all.
    await page.locator('#export-input-data').fill('{"applicantInfo":{"orgName":"Community Health Partners"}}');
  });

  test('shows three export format cards', async ({ page }) => {
    await expect(page.locator('.export-card')).toHaveCount(3);
    await expect(page.locator('.export-card h4').nth(0)).toHaveText('JSON');
    await expect(page.locator('.export-card h4').nth(1)).toHaveText('CSV');
    await expect(page.locator('.export-card h4').nth(2)).toHaveText('XML');
  });

  test('clicking JSON export runs mapping and shows output', async ({ page }) => {
    await page.locator('button[data-format="json"]').click();
    await expect(page.locator('#export-result')).toBeVisible();
    await expect(page.locator('#export-result-format')).toContainText('JSON');
    const content = await page.locator('#export-result-content').textContent();
    expect(content).toBeTruthy();
    const parsed = JSON.parse(content!);
    expect(parsed).not.toBeNull();
    expect(typeof parsed).toBe('object');
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  test('clicking CSV export runs mapping and shows output', async ({ page }) => {
    await page.locator('button[data-format="csv"]').click();
    await expect(page.locator('#export-result')).toBeVisible();
    await expect(page.locator('#export-result-format')).toContainText('CSV');
    const content = await page.locator('#export-result-content').textContent();
    expect(content).toBeTruthy();
    const lines = content!.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(content).toContain('Community Health Partners');
  });

  test('clicking XML export runs mapping and shows output', async ({ page }) => {
    await page.locator('button[data-format="xml"]').click();
    await expect(page.locator('#export-result')).toBeVisible();
    await expect(page.locator('#export-result-format')).toContainText('XML');
    const content = await page.locator('#export-result-content').textContent();
    expect(content).toBeTruthy();
    expect(content).toContain('<?xml');
  });
});
