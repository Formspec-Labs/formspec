/** @filedesc Shared FormEngine accessors for example-form E2E helpers. */
import type { Page } from '@playwright/test';

/** Navigate wizard to a named page (by visible h2 text). */
export async function goToPage(page: Page, title: string): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const heading = await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .first()
      .textContent()
      .catch(() => '');
    if (heading?.trim() === title) return;
    const nextBtn = page.locator('button.formspec-wizard-next').first();
    await nextBtn.click();
    await page.waitForTimeout(100);
  }
  throw new Error(`Could not navigate to wizard page "${title}"`);
}

/** Get raw field signal value from the engine. */
export async function engineValue(page: Page, fieldPath: string): Promise<any> {
  return page.evaluate((p) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().signals[p]?.value;
  }, fieldPath);
}

/** Get a global variable value from the engine. */
export async function engineVariable(page: Page, name: string): Promise<any> {
  return page.evaluate((n) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().variableSignals[`#:${n}`]?.value;
  }, name);
}

/** Set a field value via engine (bypasses UI). */
export async function engineSetValue(page: Page, fieldPath: string, value: any): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const el: any = document.querySelector('formspec-render');
    el.getEngine().setValue(p, v);
  }, { p: fieldPath, v: value });
}

/** Get the full validation report. */
export async function getValidationReport(
  page: Page,
  mode: 'continuous' | 'submit' | 'demand' = 'continuous'
) {
  return page.evaluate((m) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().getValidationReport({ mode: m });
  }, mode);
}

/** Get the full response object. */
export async function getResponse(page: Page, mode: 'continuous' | 'submit' = 'submit') {
  return page.evaluate((m) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().getResponse({ mode: m });
  }, mode);
}
