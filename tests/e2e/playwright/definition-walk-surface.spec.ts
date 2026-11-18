/** @filedesc Walk every form slot and section on the routes of a synthetic exported Surface app. */
import { expect, test } from '@playwright/test';
import { composeSurfaceApp, createWidgetRegistry, dereferenceBundleExport, planRoute, routeHref } from '@formspec-org/surface';
import { derivePlan, expectClean, runAxePass, walkDefinition } from '../../../packages/formspec-walk/src/index';
import { surfaceWalkExport } from '../fixtures/surface-walk-export';

const bundle = dereferenceBundleExport(surfaceWalkExport);
const app = composeSurfaceApp(bundle.surfaces, { entrySurface: bundle.entrySurface });
const params = { state: 'ny' };
const forms = app.routes.flatMap(handle => {
    const route = routeHref(handle, params);
    const plan = planRoute({ ...bundle, handle, params, registryEntries: [], widgets: createWidgetRegistry() });
    return plan.slots.flatMap(slot => {
        if (slot.slotType !== 'definition-form') return [];
        if (!slot.definition || route.refusal) throw new Error(`Cannot walk ${handle.routeId}/${slot.slotId}`);
        return [{
            definition: slot.definition, routeId: handle.routeId, slotId: slot.slotId,
            url: `/surface-browser.html?walkRoutes#${route.href}`,
            root: `[data-surface="${handle.surfaceId}"][data-route="${handle.routeId}"] [data-slot="${slot.slotId}"] [data-formspec-render-root]`,
        }];
    });
});

test('every exported Definition has a form route to walk', () => {
    expect(forms.length).toBeGreaterThan(0);
    expect(new Set(forms.map(form => form.definition.url))).toEqual(new Set(surfaceWalkExport.manifest.definitions!.map(ref => ref.url)));
});

for (const { definition, routeId, slotId, url, root } of forms) {
    test(`walks ${routeId}/${slotId} through every section`, async ({ page }) => {
        const report = await walkDefinition(page, derivePlan(definition), { url, root });
        expectClean(report);
        expect(report.uncovered).toEqual([]);
        expect(report).toMatchObject({ steps: 2, fields: 2 });

        const axe = await runAxePass(page, { root, documents: { definition } });
        expect(axe.pages).toMatchObject({ kind: 'workspace', expectedMin: 2, drawn: 2, visited: 2 });
        expect(axe.states.map(state => state.id)).toEqual(['page-1', 'page-2', 'errors-1', 'errors-2']);
    });
}
