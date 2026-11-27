// ADR-0023 Exception: Tests the remote options data-loading infrastructure contract
// (URI options fetch + 500 error surfacing). Requires a mock server; not representable in domain data.
import { test, expect } from '@playwright/test';
import { gotoHarness, HARNESS_ORIGIN, mountDefinition, submitAndGetResponse } from '../e2e/browser/helpers/harness';

test.describe('Components: Remote Options Binding', () => {
  test('loads URI Item.options data into Select at runtime', async ({ page }) => {
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
      status: 'active',
      title: 'Remote Select',
      items: [
        {
          key: 'state',
          type: 'field',
          dataType: 'choice',
          label: 'State',
          options: `${HARNESS_ORIGIN}/api/options/states`,
        },
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

    await select.selectOption('ny');
    const response = await submitAndGetResponse<{ data: { state: string } }>(page);
    expect(response.data.state).toBe('ny');
  });

  test('surfaces remote options failure when URL optionSet fetch returns 500', async ({ page }) => {
    await gotoHarness(page);

    await page.route('**/api/options/countries', async (route) => {
      await route.fulfill({ status: 500, body: 'oops' });
    });

    await mountDefinition(page, {
      $formspec: '1.0',
      url: 'http://example.org/remote-options-failure',
      version: '1.0.0',
      status: 'active',
      title: 'Remote Select Failure',
      optionSets: {
        countries: {
          source: `${HARNESS_ORIGIN}/api/options/countries`,
        },
      },
      items: [
        {
          key: 'country',
          type: 'field',
          dataType: 'choice',
          label: 'Country',
          optionSet: 'countries',
        },
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

    await expect(page.locator('.formspec-remote-options-status')).toContainText('500');
  });
});
