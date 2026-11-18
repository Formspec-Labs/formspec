/** @filedesc Walk conditional fields across workspace sections and inside initially empty nested repeats. */
import { expect, test } from '@playwright/test';
import { Walk } from '../../../packages/formspec-walk/src/index';

test('checks the revealed field in its own section even when the trigger is on another section', async ({ page }) => {
    const walk = await Walk.open(page, { url: '/definition-walk-workspace.html?revealCases' });
    await walk.reveal('details.extra', { label: 'Extra' });
    walk.expectClean();
    await expect(page.locator('[data-name="details.extra"]')).toHaveCount(0);
});

test('checks the add and remove controls and a conditional field inside initially empty nested rows', async ({ page }) => {
    const walk = await Walk.open(page, { url: '/definition-walk-workspace.html?revealCases' });
    await walk.repeat('details.people.phones', {
        rowName: 'Phones 1', addLabel: 'Add Phones', removeLabel: 'Remove Phones 1',
    });
    await walk.reveal('details.people.phones.number', { label: 'Number' });
    walk.expectClean();
    expect(await walk.live('details.people.phones.number')).toBeUndefined();
});
