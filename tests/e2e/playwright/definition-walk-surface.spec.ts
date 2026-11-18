/** @filedesc Walk every form mount in an exported app through the same checks as the emitted suite. */
import { expect, test } from '@playwright/test';
import { checkSurfaceForm } from '../../../packages/formspec-walk/src/index';
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
        expect(axe.pages).toMatchObject({ kind: 'workspace', expectedMin: 2, drawn: 2, visited: 2 });
        expect(axe.states.map(state => state.id)).toEqual(['page-1', 'page-2', 'errors-1', 'errors-2']);
    });
}
