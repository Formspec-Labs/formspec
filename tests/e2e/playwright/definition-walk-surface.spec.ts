/** @filedesc Walk every form mount in an exported app through the same checks as the emitted suite. */
import { expect, test } from '@playwright/test';
import { checkSurfaceForm, runAxePass, Walk } from '../../../packages/formspec-walk/src/index';
import { surfaceWalkTargets } from '../../../packages/formspec-walk/bin/surface-walk.mjs';
import { FORMSPEC_E2E_ORIGIN } from '../harness-server';
import { surfaceWalkExport } from '../fixtures/surface-walk-export';

const targets = surfaceWalkTargets(surfaceWalkExport, {
    url: `${FORMSPEC_E2E_ORIGIN}/surface-browser.html?walkRoutes`, params: { state: 'ny' },
});

test('walks each exported form, including both forms on the equipment route', () => {
    expect(targets.map(target => target.title)).toEqual([
        'registration/contact/details', 'registration/equipment/details', 'registration/equipment/inventory',
    ]);
});

for (const target of targets) {
    test(target.title, async ({ page }) => {
        const { report, axe } = await checkSurfaceForm(page, target);
        expect(report.uncovered).toEqual([]);
        expect(report).toMatchObject({ steps: 2, fields: 2 });
        expect(axe.pages).toMatchObject({ kind: target.definition.formPresentation.pageMode, expectedMin: 2, drawn: 2, visited: 2 });
        expect(axe.states.map(state => state.id)).toEqual(['page-1', 'page-2', 'errors-1', 'errors-2']);
    });
}

test('a violation belongs to the form slot where it occurs', async ({ page }) => {
    const [contact, inventory] = targets.filter(target => target.title.startsWith('registration/equipment/'));
    await page.goto(inventory.url);
    const inventorySlot = page.locator(inventory.root);
    await inventorySlot.locator('[data-name]:visible').first().waitFor();
    await inventorySlot.evaluate(root => {
        const input = document.createElement('input');
        input.id = 'unlabelled-inventory-input';
        root.appendChild(input);
    });
    const scan = async (target: typeof inventory) => {
        const result = await runAxePass(page, { root: target.root, documents: target });
        return result.violations.flatMap(rule => rule.nodes.map(node => node.html));
    };
    expect(await scan(contact)).not.toContainEqual(expect.stringContaining('unlabelled-inventory-input'));
    expect(await scan(inventory)).toContainEqual(expect.stringContaining('unlabelled-inventory-input'));
});

test('the walk refuses a tab that ignores activation', async ({ page }) => {
    const inventory = targets.find(target => target.title.endsWith('/inventory'))!;
    const walk = await Walk.open(page, { url: inventory.url, root: inventory.root });
    try {
        const tabs = walk.root.getByRole('tab');
        await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
        expect(await walk.nextStep()).toBe(false);
        expect(await walk.previousStep()).toBe(true);
        expect(await walk.previousStep()).toBe(false);
        await tabs.nth(1).evaluate(el => el.addEventListener('click', e => e.stopPropagation(), { capture: true }));
        await expect(walk.nextStep()).rejects.toThrow(/tab.*did not activate/);
    } finally {
        await walk.sr.stop();
    }
});
