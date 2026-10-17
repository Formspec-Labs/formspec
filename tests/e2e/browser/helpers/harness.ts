/** @filedesc Low-level Playwright harness: navigate, mount, submit, and inspect formspec-render. */
// ADR-0023: Low-level harness used only by tests that require synthetic inline fixtures
// (compatibility matrices, Tab-based layouts, and other non-grant-app scenarios).
import type { Page } from '@playwright/test';
import { FORMSPEC_E2E_ORIGIN } from '../../harness-server';

export const HARNESS_ORIGIN = FORMSPEC_E2E_ORIGIN;
const DEFAULT_HARNESS_URL = `${HARNESS_ORIGIN}/`;

/**
 * The renderer hides itself (visibility:hidden, aria-busy) until the stylesheets it linked have loaded
 * (7c32f8dc). Tab skips a hidden control and getComputedStyle reads unstyled rules, so a test that acts
 * before the reveal races the network. This is the one place that waits for it.
 */
export async function waitForRevealed(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const el = document.querySelector('formspec-render');
    return !!el && !el.hasAttribute('aria-busy') && getComputedStyle(el).visibility !== 'hidden';
  }, null, { timeout: 10000 });
}

export async function waitForWasm(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).__wasmReady === true, null, { timeout: 10000 });
  await waitForRevealed(page);
}

export async function gotoHarness(page: Page, url = DEFAULT_HARNESS_URL): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
}

/** Run `setup` in the page (it assigns documents to formspec-render), then wait for the reveal that assignment may start. */
export async function mountInRenderer(page: Page, setup: () => void): Promise<void> {
  await page.evaluate(setup);
  await waitForRevealed(page);
}

export async function mountDefinition(page: Page, definition: unknown): Promise<void> {
  await page.evaluate((data) => {
    const renderer: any = document.querySelector('formspec-render');
    renderer.definition = data;
  }, definition);
  await waitForRevealed(page);
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
