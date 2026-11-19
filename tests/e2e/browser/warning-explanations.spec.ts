/** @filedesc A respondent explains a value warning and renews it after the filed value changes. */
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import definition from '../../conformance/fixtures/explanations/first-slice.definition.json';
import { gotoHarness, mountDefinition } from './helpers/harness';

function warningCodes(page: Page, openReview = false) {
    return page.evaluate(openReview => {
        const render = document.querySelector('formspec-render') as import('../../../packages/formspec-webcomponent/src/element').FormspecRender;
        if (openReview) render.submit({ profile: 'on-submit', emitEvent: false });
        const report = render.getEngine()!.getValidationReport({ profile: 'on-submit' });
        return report.results.filter(result => result.constraintKind === 'explanation').map(result => result.code);
    }, openReview);
}

test('a submit-only attendance warning accepts an explanation and becomes stale on the next value', async ({ page }) => {
    await gotoHarness(page);
    await mountDefinition(page, definition);
    for (const label of ['Venue', 'Topic', 'Outcome', 'Partner']) {
        await page.getByRole('textbox', { name: label, exact: true }).fill('Workshop');
    }
    const attendance = page.getByLabel('Attendance', { exact: true });
    await attendance.fill('101');
    await attendance.blur();
    const warning = page.getByRole('group', { name: 'Attendance exceeded 100.' });
    await expect(warning).toHaveCount(0);
    expect(await warningCodes(page, true)).toEqual(['EXPLANATION_REQUIRED']);
    await expect(warning).toBeVisible();

    const useExplanation = warning.getByRole('button', { name: 'Use explanation' });
    await expect(useExplanation).toBeDisabled();
    await warning.getByRole('textbox', { name: 'Explain this warning.' }).fill('Two workshops were combined.');
    await useExplanation.click();
    await expect(warning.getByRole('button', { name: 'Explanation entered' })).toBeDisabled();
    expect(await warningCodes(page)).toEqual([]);
    const accessibility = await new AxeBuilder({ page }).include('.formspec-warning-explanation').analyze();
    expect(accessibility.violations).toEqual([]);

    await attendance.fill('102');
    await attendance.blur();
    expect(await warningCodes(page)).toEqual(['EXPLANATION_STALE']);
    await expect(warning.getByRole('textbox')).toHaveValue('Two workshops were combined.');
    await useExplanation.click();
    expect(await warningCodes(page)).toEqual([]);
});

test('grouped blank-answer acknowledgement lists unanswered questions, shows set difference on change, and re-accepts', async ({ page }) => {
    await gotoHarness(page);
    await mountDefinition(page, definition);
    await page.getByRole('textbox', { name: 'Partner', exact: true }).fill('Library');
    const attendance = page.getByLabel('Attendance', { exact: true });
    await attendance.fill('125');
    await attendance.blur();

    const groupPanel = page.getByRole('group', { name: '3 unanswered questions' });
    await expect(groupPanel).toHaveCount(0);
    expect(await warningCodes(page, true)).toEqual(['EXPLANATION_REQUIRED', 'EXPLANATION_REQUIRED']);
    await expect(groupPanel).toBeVisible();
    await expect(groupPanel.getByRole('link', { name: 'Outcome' })).toBeVisible();
    await expect(groupPanel.getByRole('link', { name: 'Topic' })).toBeVisible();
    await expect(groupPanel.getByRole('link', { name: 'Venue' })).toBeVisible();

    await groupPanel.getByRole('link', { name: 'Venue' }).click();
    await expect(page.getByRole('textbox', { name: 'Venue', exact: true })).toBeFocused();

    await groupPanel.getByRole('button', { name: 'Accept 3 unanswered questions' }).click();
    await expect(groupPanel.getByRole('button', { name: 'Accepted 3 unanswered questions' })).toBeDisabled();

    const attendanceWarning = page.getByRole('group', { name: 'Attendance exceeded 100.' });
    await attendanceWarning.getByRole('textbox', { name: 'Explain this warning.' }).fill('Combined workshops.');
    await attendanceWarning.getByRole('button', { name: 'Use explanation' }).click();
    expect(await warningCodes(page)).toEqual([]);

    const axeInitial = await new AxeBuilder({ page }).include('.formspec-warning-explanation').analyze();
    expect(axeInitial.violations).toEqual([]);

    // Answer Venue and clear Partner: count stays 3, set changes, acknowledgement turns stale.
    await page.getByRole('textbox', { name: 'Venue', exact: true }).fill('Hall');
    const partner = page.getByRole('textbox', { name: 'Partner', exact: true });
    await partner.fill('');
    await partner.blur();

    expect(await warningCodes(page)).toEqual(['EXPLANATION_STALE']);
    await expect(groupPanel).toContainText('Newly unanswered');
    await expect(groupPanel).toContainText('Partner');
    await expect(groupPanel).toContainText('Now answered');
    await expect(groupPanel).toContainText('Venue');

    await groupPanel.getByRole('button', { name: 'Accept 3 unanswered questions' }).click();
    expect(await warningCodes(page)).toEqual([]);

    const axeAfter = await new AxeBuilder({ page }).include('.formspec-warning-explanation').analyze();
    expect(axeAfter.violations).toEqual([]);
});

for (const invalid of ['visible', 'earlier'] as const) {
    test(`wizard fallback submit focuses the invalid field on submit: ${invalid}`, async ({ page }) => {
        await page.goto(`/wizard-submit.html?invalid=${invalid}`);
        await page.locator('.formspec-wizard-skip').focus();
        await page.locator('.formspec-wizard-skip').click();
        await page.locator('.formspec-wizard-submit').focus();
        await page.locator('.formspec-wizard-submit').click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { wizardSubmitEvents: { results: unknown[] } }).wizardSubmitEvents.results))
            .toEqual([['blocked', 'validation', ['not-invoked']]]);
        await expect.poll(() => page.evaluate(() => ({
            focused: document.activeElement?.closest('[data-name]')?.getAttribute('data-name') ?? document.activeElement?.textContent?.trim(),
            mounted: document.querySelector('.formspec-wizard-panel')?.getAttribute('aria-label'),
        }))).toEqual({ focused: invalid, mounted: invalid });
    });
}

for (const event of ['formspec-submit', 'checkpoint-ready'] as const) {
    test(`wizard fallback submit and placed checkpoint honor declared callback event: ${event}`, async ({ page }) => {
        await page.goto(`/wizard-submit.html?invalid=earlier&checkpoint&event=${event}`);
        await page.getByRole('button', { name: 'Placed' }).focus();
        await page.getByRole('button', { name: 'Placed' }).click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { wizardSubmitEvents: { results: unknown[] } }).wizardSubmitEvents.results.length)).toBe(1);
        const placed = await page.evaluate(() => {
            const log = (window as unknown as { wizardSubmitEvents: Record<string, unknown[]> }).wizardSubmitEvents;
            return Object.fromEntries(Object.entries(log).map(([k, items]) => [k, items.splice(0)]));
        });
        await page.locator('.formspec-wizard-skip').focus();
        await page.locator('.formspec-wizard-skip').click();
        await page.locator('.formspec-wizard-submit').focus();
        await page.locator('.formspec-wizard-submit').click();
        await expect.poll(() => page.evaluate(() => (window as unknown as { wizardSubmitEvents: { results: unknown[] } }).wizardSubmitEvents.results.length)).toBe(1);
        expect(placed).toEqual({
            results: [['completed', null, ['succeeded']]],
            events: [[event, 'in-progress']],
            submitted: event === 'formspec-submit' ? ['in-progress'] : [],
        });
        expect(await page.evaluate(() => (window as unknown as { wizardSubmitEvents: unknown }).wizardSubmitEvents)).toEqual(placed);
    });
}
