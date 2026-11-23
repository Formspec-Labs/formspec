/** @filedesc Verify native date requirements and the error announced after a summary jump. */
import { expect, test, type Locator, type Page } from '@playwright/test';

const route = '/surface-browser.html?workspace&accessibleFields#/filing/ny';
const errorText = 'Choose a due date to continue.';
const requiredDateControl = /(?=.*\bdue date\b)(?=.*\b(?:date edit|edit text|stepper)\b)/i;

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

async function submit(page: Page, root: Locator): Promise<Locator> {
  await root.evaluate(el => (el as HTMLElement & { submit(options: { emitEvent: boolean }): void }).submit({ emitEvent: false }));
  const summary = root.locator('.formspec-validation-summary');
  await expect(summary.getByRole('link', { name: /Follow-up date/i })).toHaveCount(0);
  const jump = summary.getByRole('link', { name: `Due date: ${errorText}`, exact: true });
  await expect(jump).toBeVisible();
  return jump;
}

async function enterAndCheckError(page: Page, due: Locator) {
  await page.keyboard.press('Enter');
  await expect(due).toBeFocused();
  await expect(due).toHaveAttribute('aria-invalid', 'true');
  await expect(due).toHaveAccessibleDescription(errorText);
}

if (process.env.FORMSPEC_WALK_SR === 'os') {
  const { screenReaderTest } = require('@guidepup/playwright') as typeof import('@guidepup/playwright');
  const nativeTest = screenReaderTest.extend({
    // Guidepup uses this fixture to activate the desktop app. Launch Chromium ourselves so
    // Playwright still gets the installed Chrome channel while Guidepup uses its `chrome` app key.
    browserName: 'chrome' as 'chromium',
    browser: [async ({ playwright, launchOptions, headless }, use) => {
      const browser = await playwright.chromium.launch({ ...launchOptions, headless, channel: 'chrome' });
      try { await use(browser); } finally { await browser.close(); }
    }, { scope: 'worker' }],
  });
  nativeTest.use({ headless: false });
  nativeTest('native date speech names the required date and announces its error after Enter', async ({ page, screenReader }, info) => {
    const { root, due, optional } = await open(page);
    const userAgent = await page.evaluate(() => navigator.userAgent);
    const onMac = process.platform === 'darwin';
    expect(userAgent).toMatch(onMac ? /Macintosh/ : /Windows NT/);
    await expect(due).toHaveAccessibleName(onMac ? 'Due date Required' : 'Due date *');
    await screenReader.navigateToWebContent();
    const announce = expect.configure({ soft: true });
    const listen = async (stage: string, action: () => Promise<void>) => {
      const { spokenPhrase } = await screenReader.capture(action, { capture: true });
      await info.attach(stage, { body: spokenPhrase, contentType: 'text/plain' });
      return spokenPhrase;
    };
    const optionalSpeech = await listen('optional-date', () => optional.focus());
    announce(optionalSpeech).toMatch(/(?=.*\bfollow-up date\b)(?=.*\b(?:date edit|edit text|stepper)\b)/i);
    announce(optionalSpeech).not.toMatch(/\brequired\b/i);
    let requiredSpeech: string;
    if (onMac) {
      // Tab into the first date segment from the preceding form control.
      await page.getByRole('button', { name: /Evidence.*Upload a file/i }).focus();
      requiredSpeech = await listen('required-date', () => page.keyboard.press('Tab'));
      await expect(due).toBeFocused();
      if (!requiredDateControl.test(requiredSpeech)) {
        // Guidepup polls the last phrase. An interaction hint can replace the date's
        // first utterance before polling sees it. Keep both captures and ask VoiceOver
        // to describe the same keyboard-focused item when the first capture missed it.
        const { voiceOverKeyCodeCommands } = require('@guidepup/guidepup') as typeof import('@guidepup/guidepup');
        await screenReader.perform(voiceOverKeyCodeCommands.describeItemWithKeyboardFocus, { capture: true });
        requiredSpeech = (await screenReader.spokenPhraseLog()).at(-1) ?? '';
        await info.attach('required-date-focus-description', { body: requiredSpeech, contentType: 'text/plain' });
        await expect(due).toBeFocused();
      }
    } else {
      requiredSpeech = await listen('required-date', () => due.focus());
      await expect(due).toBeFocused();
    }
    announce(requiredSpeech).toMatch(requiredDateControl);
    announce(requiredSpeech.match(/\brequired\b/gi) ?? []).toHaveLength(1);
    // Let the live summary finish before focusing its link. Keep that link and the date spoken
    // after Enter in separate captures so the same message cannot satisfy both checks.
    const { result: jump, spokenPhrase: summarySpeech } = await screenReader.capture(() => submit(page, root), { capture: true });
    await info.attach('summary-live', { body: summarySpeech, contentType: 'text/plain' });
    const linkSpeech = await listen('summary-link', async () => {
      await jump.focus();
      await expect(jump).toBeFocused();
    });
    announce(linkSpeech).toMatch(/(?=.*choose a due date to continue)(?=.*\blink\b)/i);
    const invalidSpeech = await listen('invalid-date', () => enterAndCheckError(page, due));
    announce(invalidSpeech).toMatch(requiredDateControl);
    announce(invalidSpeech).toMatch(/choose a due date to continue/i);
    announce(invalidSpeech).not.toMatch(/\blink\b/i);
  });
} else {
  test('the date summary link focuses the invalid required date with its associated error', async ({ page }) => {
    const { root, due } = await open(page);
    const jump = await submit(page, root);
    await jump.focus();
    await expect(jump).toBeFocused();
    await enterAndCheckError(page, due);
  });
}
