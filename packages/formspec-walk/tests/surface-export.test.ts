/** @filedesc An exported app produces nonempty, scoped walks and refuses unresolved destinations. */
import { expect, it } from 'vitest';
import { surfaceWalkExport } from '../../../tests/e2e/fixtures/surface-walk-export';
import { surfaceWalkTargets, emitSurfaceWalk } from '../bin/surface-walk.mjs';

const options = { url: 'http://localhost/preview/index.html?app=filing#/?edition=sample&slot=old&section=last', params: { state: 'New York' } };

it('derives each form mount and preserves the preview base, encoded parameters and slot scope', () => {
    const targets = surfaceWalkTargets(surfaceWalkExport, options);
    expect(targets.map(t => t.title)).toEqual(['registration/contact/details', 'registration/equipment/details', 'registration/equipment/inventory']);
    expect(targets[2].url).toBe('http://localhost/preview/index.html?app=filing#/equipment/New%20York?edition=sample');
    expect(targets[2].root).toContain('[data-slot="inventory"]');
    expect(emitSurfaceWalk(targets)).toContain('checkSurfaceForm(page, target)');
});

it('refuses an unresolved parameter, missing Definition or empty walk', () => {
    expect(() => surfaceWalkTargets(surfaceWalkExport, { ...options, params: {} })).toThrow(/state/);
    const missing = structuredClone(surfaceWalkExport);
    delete (missing.documents as Record<string, unknown>)['urn:example:form:contact'];
    expect(() => surfaceWalkTargets(missing, options)).toThrow(/urn:example:form:contact/);
    const empty = structuredClone(surfaceWalkExport);
    for (const route of (empty.documents['urn:example:surface:registration'] as any).routes) route.slots = [];
    expect(() => surfaceWalkTargets(empty, options)).toThrow(/no form routes/i);
});
