/** @filedesc Walk conditional fields across workspace sections and inside initially empty nested repeats. */
import { expect, test } from '@playwright/test';
import { derivePlan, Walk } from '../../../packages/formspec-walk/src/index';
import { lockedRepeatComponent, lockedRepeatDefinition } from '../fixtures/definition-walk-workspace.definition';

test('honors the bound Accordion repeat locks while exercising the separate editable repeat', async ({ page }) => {
    const plan = derivePlan(lockedRepeatDefinition, { component: lockedRepeatComponent });
    const records = plan.groups.find(group => group.path === 'review.records')!.repeat!;
    const notes = plan.groups.find(group => group.path === 'review.notes')!.repeat!;
    expect(records.addLabel).toBeUndefined();
    expect(records.removeLabel).toBeUndefined();
    const walk = await Walk.open(page, { url: '/definition-walk-workspace.html?lockedRepeat' });
    const roster = page.locator('[data-repeat-path="review.records"]');
    await expect(roster.getByRole('textbox', { name: 'Record title' })).toHaveValue('Existing record');
    await expect(roster.getByRole('button', { name: /^(Add|Remove) / })).toHaveCount(0);
    expect(await walk.repeat('review.notes', notes), walk.findings.join('\n')).toBe(true);
    walk.expectClean();
    await expect(roster.getByRole('textbox', { name: 'Record title' })).toHaveValue('Existing record');
});

test('Walk opens a closed seeded Accordion row by keyboard and restores the previous row', async ({ page }) => {
    const walk = await Walk.open(page, { url: '/definition-walk-workspace.html?lockedRepeat&multipleRows' });
    const rows = page.locator('[data-repeat-path="review.records"] details');
    const openRows = () => rows.evaluateAll(nodes => nodes.map(node => (node as HTMLDetailsElement).open));
    await expect.poll(openRows).toEqual([false, false, true]);
    const first = rows.first();
    await first.locator('summary').evaluate(summary => {
        summary.addEventListener('keydown', event => {
            if ((event as KeyboardEvent).key === 'Enter') summary.setAttribute('data-entered-by-keyboard', 'true');
        });
    });

    expect(await walk.field('review.records.title', { label: 'Record title' }), walk.findings.join('\n')).toBe(true);
    await expect(first.locator('summary')).toHaveAttribute('data-entered-by-keyboard', 'true');
    await expect.poll(openRows).toEqual([false, false, true]);

    expect(await walk.show('review.records[0].title')).toBe(true);
    await expect(first.getByRole('textbox', { name: 'Record title' })).toHaveValue('First record');
    await walk.readingOrder([{ path: 'review.records[0].title', label: 'Record title' }]);
    walk.expectClean();
});

test('Walk does not credit a closed Accordion row when its Enter action is blocked', async ({ page }) => {
    const walk = await Walk.open(page, { url: '/definition-walk-workspace.html?lockedRepeat&multipleRows' });
    const first = page.locator('[data-repeat-path="review.records[0]"]');
    await first.locator('summary').evaluate(summary => {
        summary.addEventListener('keydown', event => {
            if ((event as KeyboardEvent).key === 'Enter') event.preventDefault();
        }, true);
    });
    expect(await walk.field('review.records.title', { label: 'Record title' })).toBe(false);
    expect(walk.findings).toContain('review.records[0]: Enter did not open the repeat row');
    await expect(first.getByRole('textbox')).toHaveCount(0);
});

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
