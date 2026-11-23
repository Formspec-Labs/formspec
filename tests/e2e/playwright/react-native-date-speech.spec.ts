/** @filedesc Verify native date requirements and the error announced after a summary jump. */
import { expect, test, type Locator, type Page } from '@playwright/test';

const route = '/surface-browser.html?workspace&accessibleFields#/filing/ny';
const errorText = 'Choose a due date to continue.';

async function open(page: Page) {
  await page.goto(route);
  const root = page.locator('[data-formspec-render-root]');
  await root.evaluate(el => el.setAttribute('show-validation-summary', ''));
  const due = page.getByLabel(/^Due date\b/);
  const optional = page.getByLabel('Follow-up date', { exact: true });
  await expect(due).toHaveAttribute('type', 'date');
  await expect(due).toHaveJSProperty('required', true);
  await expect(optional).toHaveAttribute('type', 'date');
  await expect(optional).toHaveJSProperty('required', false);
  return { root, due, optional };
}

async function submitToLink(page: Page, root: Locator) {
  await root.evaluate(el => (el as HTMLElement & { submit(options: { emitEvent: boolean }): void }).submit({ emitEvent: false }));
  const summary = root.locator('.formspec-validation-summary');
  await expect(summary.getByRole('link', { name: /Follow-up date/i })).toHaveCount(0);
  const jump = summary.getByRole('link', { name: `Due date: ${errorText}`, exact: true });
  await jump.focus();
  await expect(jump).toBeFocused();
}

async function enterAndCheckError(page: Page, due: Locator) {
  await page.keyboard.press('Enter');
  await expect(due).toBeFocused();
  await expect(due).toHaveAttribute('aria-invalid', 'true');
  await expect(due).toHaveAccessibleDescription(errorText);
}

if (process.env.FORMSPEC_WALK_SR === 'os') {
  const { screenReaderTest } = require('@guidepup/playwright') as typeof import('@guidepup/playwright');
  screenReaderTest.use({ headless: false });
  screenReaderTest('native date speech names the required date and announces its error after Enter', async ({ page, screenReader }, info) => {
    const { root, due, optional } = await open(page);
    await screenReader.navigateToWebContent();
    let stage = 'optional-date';
    const speech = async () => (await screenReader.spokenPhraseLog()).join(' ');
    const announce = expect.configure({ soft: true, timeout: 6_000 });
    const record = async () => {
      await info.attach(stage, { body: (await screenReader.spokenPhraseLog()).join('\n'), contentType: 'text/plain' });
    };
    try {
      await screenReader.clearSpokenPhraseLog();
      await optional.focus();
      await announce.poll(speech).toMatch(/follow-up date/i);
      announce(await speech()).not.toMatch(/\brequired\b/i);
    } finally { await record(); }
    stage = 'required-date';
    try {
      await screenReader.clearSpokenPhraseLog();
      await due.focus();
      await announce.poll(speech).toMatch(/(?=.*due date)(?=.*\brequired\b)/i);
    } finally { await record(); }
    stage = 'invalid-date';
    try {
      await screenReader.clearSpokenPhraseLog();
      await submitToLink(page, root);
      // Drain the link's announcement before checking speech after the focus jump.
      await expect.poll(speech).toMatch(/(?=.*choose a due date to continue)(?=.*\blink\b)/i);
      await screenReader.clearSpokenPhraseLog();
      await enterAndCheckError(page, due);
      await expect.poll(speech).toMatch(/choose a due date to continue/i);
    } finally { await record(); }
  });
} else {
  test('the date summary link focuses the invalid required date with its associated error', async ({ page }) => {
    const { root, due } = await open(page);
    await submitToLink(page, root);
    await enterAndCheckError(page, due);
  });
}
