/** @filedesc Low-level Playwright harness: navigate, mount, submit, and inspect formspec-render. */
// ADR-0023: Low-level harness used only by tests that require synthetic inline fixtures
// (compatibility matrices, Tab-based layouts, and other non-grant-app scenarios).
import type { Page } from '@playwright/test';
import { FORMSPEC_E2E_ORIGIN } from '../../harness-server';

export const HARNESS_ORIGIN = FORMSPEC_E2E_ORIGIN;
const DEFAULT_HARNESS_URL = `${HARNESS_ORIGIN}/`;

export async function waitForWasm(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__wasmReady === true, null, { timeout: 10000 });
}

export async function gotoHarness(page: Page, url = DEFAULT_HARNESS_URL): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
}

export async function mountDefinition(page: Page, definition: unknown): Promise<void> {
  await page.evaluate((data) => {
    const renderer: any = document.querySelector('formspec-render');
    renderer.definition = data;
  }, definition);
}

export async function submitAndGetResponse<T = any>(page: Page): Promise<T> {
  return await page.evaluate(() => {
    const renderer: any = document.querySelector('formspec-render');
    if (!renderer || typeof renderer.submit !== 'function') {
      throw new Error('formspec-render.submit() is unavailable');
    }
    const detail = renderer.submit({ emitEvent: false, profile: 'on-submit' });
    if (!detail) {
      throw new Error('submit() returned null');
    }
    return detail.response;
  }) as T;
}
