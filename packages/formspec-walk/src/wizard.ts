/** @filedesc Moving a wizard one step with its own Next / Previous buttons, named as the active Locale names them. */
import type { Locator, Page } from '@playwright/test';
import type { UI_STRINGS } from '@formspec-org/layout';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Click the form's Next or Previous button; false when it has none or it is disabled.
 * `chrome` gives a `$ui.wizard.*` string as the active Locale writes it.
 */
export async function stepWizard(
    page: Page,
    root: Locator,
    direction: 'next' | 'previous',
    chrome: (key: keyof typeof UI_STRINGS) => string,
): Promise<boolean> {
    const keys = direction === 'next' ? ['wizard.next', 'wizard.nextStep'] : ['wizard.previous', 'wizard.previousStep'];
    const names = keys.map((k) => escapeRe(chrome(k as keyof typeof UI_STRINGS))).join('|');
    const button = root.getByRole('button', { name: new RegExp(`^(${names})$`, 'i') });
    if (!(await button.count()) || (await button.first().isDisabled())) return false;
    await button.first().click();
    await page.waitForTimeout(100);
    return true;
}
