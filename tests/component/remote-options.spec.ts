// ADR-0023 Exception: Tests the remoteOptions data-loading infrastructure contract
// (fetch + 500 error fallback). Requires a mock server; not representable in domain data.
import { test, expect } from '@playwright/test';
import { gotoHarness, mountDefinition, submitAndGetResponse } from '../e2e/browser/helpers/harness';

test.describe('Components: Remote Options Binding', () => {
  test('loads bind.remoteOptions data into Select at runtime', async ({ page }) => {
    await gotoHarness(page);

    await page.route('**/api/options/states', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { value: 'ca', label: 'California' },
          { value: 'ny', label: 'New York' },
        ]),
      });
    });

    await mountDefinition(page, {
      $formspec: '1.0',
      url: 'http://example.org/remote-options-select',
      version: '1.0.0',
      title: 'Remote Select',
      items: [
        {
          key: 'state',
          type: 'field',
          dataType: 'choice',
          label: 'State',
          options: [{ value: 'fallback', label: 'Fallback' }],
        },
      ],
      binds: [
        { path: 'state', remoteOptions: 'http://127.0.0.1:8080/api/options/states' },
      ],
    });

    await page.evaluate(() => {
      const renderer: any = document.querySelector('formspec-render');
      renderer.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'http://example.org/remote-options-select' },
        tree: {
          component: 'Section',
          children: [{ component: 'Select', bind: 'state', placeholder: 'Choose state' }],
        },
      };
    });

    const select = page.locator('select[name="state"]');
    await expect(select).toBeVisible();
    await expect(page.locator('option[value="ca"]')).toHaveText('California');
    await expect(page.locator('option[value="ny"]')).toHaveText('New York');
    await expect(page.locator('option[value="fallback"]')).toHaveCount(0);

    await select.selectOption('ny');
    const response = await submitAndGetResponse<{ data: { state: string } }>(page);
    expect(response.data.state).toBe('ny');
  });

  test('surfaces remote options failure and preserves fallback option list', async ({ page }) => {
    await gotoHarness(page);

    await page.route('**/api/options/countries', async (route) => {
      await route.fulfill({ status: 500, body: 'oops' });
    });

    await mountDefinition(page, {
      $formspec: '1.0',
      url: 'http://example.org/remote-options-failure',
      version: '1.0.0',
      title: 'Remote Select Failure',
      items: [
        {
          key: 'country',
          type: 'field',
          dataType: 'choice',
          label: 'Country',
          options: [{ value: 'us', label: 'United States' }],
        },
      ],
      binds: [
        { path: 'country', remoteOptions: 'http://127.0.0.1:8080/api/options/countries' },
      ],
    });

    await page.evaluate(() => {
      const renderer: any = document.querySelector('formspec-render');
      renderer.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'http://example.org/remote-options-failure' },
        tree: {
          component: 'Section',
          children: [{ component: 'Select', bind: 'country' }],
        },
      };
    });

    await expect(page.locator('option[value="us"]')).toHaveText('United States');
    await expect(page.locator('.formspec-remote-options-status')).toContainText('fallback');
  });
});
