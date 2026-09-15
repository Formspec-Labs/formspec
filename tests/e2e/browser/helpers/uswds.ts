/** @filedesc E2E helper: mount a minimal form through the USWDS adapter (registered in test-harness.ts). */
import type { Page } from '@playwright/test';
import { gotoHarness, mountDefinition } from './harness';

/** Mount `items` on the shared harness page with the USWDS render adapter active. */
export async function mountUswdsForm(page: Page, items: unknown[]): Promise<void> {
  await gotoHarness(page);
  await page.evaluate(() => {
    (window as any).globalRegistry.setAdapter('uswds');
  });
  await mountDefinition(page, {
    $formspec: '1.0',
    url: 'urn:test:uswds-e2e',
    version: '1.0.0',
    title: 'USWDS E2E fixture',
    items,
  });
}
