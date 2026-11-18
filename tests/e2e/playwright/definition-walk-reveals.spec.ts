/** @filedesc Walk conditional fields across workspace sections and inside initially empty nested repeats. */
import { expect, test } from '@playwright/test';
import { Walk } from '../../../packages/formspec-walk/src/index';

test('checks the revealed field in its own section even when the trigger is on another section', async ({ page }) => {
    const walk = await Walk.open(page, { url: '/definition-walk-workspace.html?revealCases' });
    expect(await walk.reveal('details.extra', { label: 'Extra' })).toBe('revealed');
    walk.expectClean();
    await expect(page.locator('[data-name="details.extra"]')).toHaveCount(0);
});

test('checks the add and remove controls and a conditional field inside initially empty nested rows', async ({ page }) => {
    const walk = await Walk.open(page, { url: '/definition-walk-workspace.html?revealCases' });
    expect(await walk.repeat('details.people.phones', {
        rowName: 'Phones 1', addLabel: 'Add Phones', removeLabel: 'Remove Phones 1',
    })).toBe(true);
    expect(await walk.reveal('details.people.phones.number', { label: 'Number' })).toBe('revealed');
    walk.expectClean();
    expect(await walk.live('details.people.phones.number')).toBeUndefined();
});

test('a missing Remove on the new row preserves an earlier answer and reports no completed repeat', async ({ page }) => {
    const walk = await Walk.open(page, { url: '/definition-walk-workspace.html?revealCases' });
    await page.evaluate(() => {
        const engine = (document.querySelector('[data-formspec-render-root]') as any).engine;
        engine.addRepeatInstance('details.people');
        engine.addRepeatInstance('details.people[0].phones');
        engine.setValue('details.people[0].phones[0].show', true);
        engine.setValue('details.people[0].phones[0].number', 'Original');
    });
    expect(await walk.repeat('details.people.phones', { rowName: 'Phones 2', addLabel: 'Add Phones', removeLabel: 'Remove Phones 1' })).toBe(false);
    expect(walk.findings).toContainEqual(expect.stringContaining('no Remove control'));
    expect(await walk.repeat('details.people.phones', { rowName: 'Phones 2', addLabel: 'Add Phones', maxRepeat: 1 })).toBe(false);
    expect(walk.uncovered).toContainEqual(expect.stringContaining('maxRepeat'));
    expect(await walk.live('details.people[0].phones[1].number')).toBeUndefined();
    expect(await page.getByRole('textbox', { name: 'Number', exact: true }).inputValue()).toBe('Original');
});
