/** @filedesc Shared FormEngine accessors for example-form E2E helpers. */
import type { Page } from '@playwright/test';

/** Wait until formspec-render has a live FormEngine (after mount). */
export async function waitForFormEngine(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const el: any = document.querySelector('formspec-render');
      return Boolean(el?.getEngine?.());
    },
    null,
    { timeout }
  );
}

/** Wait until a field signal value deep-equals expected (JSON compare). */
export async function waitForEngineValue(
  page: Page,
  fieldPath: string,
  expected: unknown,
  options?: { timeout?: number }
): Promise<void> {
  const expJson = JSON.stringify(expected);
  await page.waitForFunction(
    ({ p, expJson: want }) => {
      const el: any = document.querySelector('formspec-render');
      const v = el?.getEngine()?.signals[p]?.value;
      return JSON.stringify(v) === want;
    },
    { p: fieldPath, expJson },
    { timeout: options?.timeout ?? 5000 }
  );
}

/** Wait until repeat group instance count matches. */
export async function waitForRepeatCount(
  page: Page,
  itemName: string,
  count: number,
  options?: { timeout?: number }
): Promise<void> {
  await page.waitForFunction(
    ({ name, n }) => {
      const el: any = document.querySelector('formspec-render');
      return (el?.getEngine()?.repeats[name]?.value ?? 0) === n;
    },
    { name: itemName, n: count },
    { timeout: options?.timeout ?? 5000 }
  );
}

/** Wait until relevance signal is defined and matches expected. */
export async function waitForRelevant(
  page: Page,
  fieldPath: string,
  relevant: boolean,
  options?: { timeout?: number }
): Promise<void> {
  await page.waitForFunction(
    ({ p, want }) => {
      const el: any = document.querySelector('formspec-render');
      const v = el?.getEngine()?.relevantSignals[p]?.value;
      return v === want;
    },
    { p: fieldPath, want: relevant },
    { timeout: options?.timeout ?? 5000 }
  );
}

type ValidationMatch = { path?: string; code?: string; id?: string; severity?: string };

/** Wait until validation report contains a matching result. */
export async function waitForValidationMatch(
  page: Page,
  match: ValidationMatch,
  mode: 'continuous' | 'submit' | 'demand' = 'continuous',
  options?: { timeout?: number }
): Promise<void> {
  await page.waitForFunction(
    ({ m, mode: validationMode }) => {
      const el: any = document.querySelector('formspec-render');
      const results = el?.getEngine()?.getValidationReport({ mode: validationMode })?.results ?? [];
      return results.some(
        (r: any) =>
          (m.path == null || r.path === m.path) &&
          (m.code == null || r.code === m.code) &&
          (m.id == null || r.id === m.id || r.shapeId === m.id) &&
          (m.severity == null || r.severity === m.severity)
      );
    },
    { m: match, mode },
    { timeout: options?.timeout ?? 5000 }
  );
}

/** Wait until visible wizard panel h2 matches title. */
export async function waitForWizardPageTitle(
  page: Page,
  title: string,
  options?: { timeout?: number }
): Promise<void> {
  await page
    .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
    .filter({ hasText: title })
    .first()
    .waitFor({ state: 'visible', timeout: options?.timeout ?? 5000 });
}

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
    await page
      .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
      .filter({ hasText: title })
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => undefined);
  }
  const finalHeading = await page
    .locator('.formspec-wizard-panel:not(.formspec-hidden) h2')
    .first()
    .textContent()
    .catch(() => '');
  if (finalHeading?.trim() !== title) {
    throw new Error(`Could not navigate to wizard page "${title}"`);
  }
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
