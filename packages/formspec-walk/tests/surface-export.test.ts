/** @filedesc An exported app produces nonempty, scoped walks and refuses unresolved destinations. */
import { expect, it } from 'vitest';
import { surfaceWalkExport } from '../../../tests/e2e/fixtures/surface-walk-export';
import { surfaceWalkTargets, emitSurfaceWalk } from '../bin/surface-walk.mjs';

const options = { url: 'http://localhost/preview/index.html?app=filing#/?edition=sample&slot=old&section=last', params: { state: 'New York' } };

it('derives each form mount and preserves the preview base, encoded parameters and slot scope', () => {
    const targets = surfaceWalkTargets(surfaceWalkExport, options);
    expect(targets.map(t => t.title)).toEqual(['registration/contact/details', 'registration/equipment/details', 'registration/equipment/inventory']);
    expect(targets[2].url).toBe('http://localhost/preview/index.html?app=filing#/equipment/New%20York?edition=sample&slot=inventory');
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

it('walks mounted forms when the export also contains a supporting Definition', () => {
    const bundle = structuredClone(surfaceWalkExport);
    const url = 'urn:example:form:support';
    bundle.manifest.definitions!.push({ url });
    (bundle.documents as Record<string, unknown>)[url] = {
        $formspec: '1.0', version: '1.0.0', url, title: 'Supporting Definition', items: [],
    };
    expect(surfaceWalkTargets(bundle, options)).toHaveLength(3);
});

it('derives sparse regional wording and navigation from the engine Locale cascade', () => {
    const bundle = structuredClone(surfaceWalkExport);
    for (const form of ['contact', 'equipment']) {
        for (const [locale, strings] of [
            ['fr', { 'name.label': 'Nom', '$ui.wizard.next': 'Suivant' }],
            ['fr-CA', { 'city.label': 'Ville' }],
        ] as const) {
            const url = `urn:example:locale:${form}:${locale}`;
            (bundle.manifest.locales ??= []).push({ url, locale });
            (bundle.documents as Record<string, unknown>)[url] = {
                $formspecLocale: '2.0', version: '1.0.0', locale,
                target: { kind: 'definition', url: `urn:example:form:${form}` }, strings,
            };
        }
    }
    const targets = surfaceWalkTargets(bundle, { ...options, locale: 'fr-CA' });
    expect(targets).toHaveLength(3);
    expect(targets[0].locale.strings).toEqual({ 'name.label': 'Nom', 'city.label': 'Ville', '$ui.wizard.next': 'Suivant' });
});
