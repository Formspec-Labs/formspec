/** @filedesc Bundle-export dereference — typed artifacts, and absences reported not thrown. */
import { describe, expect, it } from 'vitest';
import { bundleIsRenderable, dereferenceBundleExport } from '../src/bundle.js';
import {
  bundleExport,
  respondentSurface,
  staffSurface,
  tenantTheme,
} from './fixtures.js';

describe('dereferenceBundleExport', () => {
  it('resolves every manifest slot into a typed artifact', () => {
    const resolved = dereferenceBundleExport(bundleExport());
    expect(resolved.surfaces.map((surface) => surface.id)).toEqual(['respondent', 'staff']);
    expect(resolved.registries).toHaveLength(1);
    expect(resolved.tenantTheme).toBe(tenantTheme);
    expect(resolved.definitions.get('https://example.test/def')).toBeDefined();
    expect(resolved.title).toBe('Test app');
    expect(resolved.diagnostics).toEqual([]);
    expect(bundleIsRenderable(resolved)).toBe(true);
  });

  it('reports a listed document the export does not carry, and keeps going', () => {
    const broken = bundleExport({
      surfaces: [{ url: 'surface:respondent' }, { url: 'surface:ghost' }],
    });
    const resolved = dereferenceBundleExport(broken);
    expect(resolved.surfaces).toHaveLength(1);
    expect(resolved.diagnostics.map((d) => d.code)).toEqual(['BUNDLE-DOCUMENT-MISSING']);
    expect(bundleIsRenderable(resolved)).toBe(false);
  });

  it('is only a structural helper and does not turn authenticity into a verdict', () => {
    const resolved = Object.assign(dereferenceBundleExport(bundleExport()), {
      verification: 'failed',
    });
    expect(bundleIsRenderable(resolved)).toBe(true);
    expect(bundleIsRenderable(resolved)).toEqual(expect.any(Boolean));
  });

  it('reports a manifest slot pointing at something that is not a document', () => {
    const bundle = bundleExport();
    const bent = { ...bundle, documents: { ...bundle.documents, 'theme:tenant': 'not a document' } };
    const resolved = dereferenceBundleExport(bent);
    expect(resolved.tenantTheme).toBeUndefined();
    expect(resolved.diagnostics.map((d) => d.code)).toEqual(['BUNDLE-DOCUMENT-SHAPE']);
  });

  it('handles a manifest with no theme, no registries and no experience', () => {
    const minimal = dereferenceBundleExport({
      manifest: { surfaces: [{ url: 'surface:respondent' }] },
      documents: bundleExport().documents,
    });
    expect(minimal.tenantTheme).toBeUndefined();
    expect(minimal.registries).toEqual([]);
    expect(minimal.experiences).toEqual([]);
    expect(minimal.diagnostics).toEqual([]);
  });

  it('reads the singular `experience` slot the App Manifest actually ships', () => {
    const withExperience = bundleExport({ experience: { url: 'exp:1' } });
    const experience = { $formspecExperience: '1.0', version: '1.0.0', units: [] };
    const resolved = dereferenceBundleExport({
      ...withExperience,
      documents: { ...withExperience.documents, 'exp:1': experience },
    });
    expect(resolved.experiences).toHaveLength(1);
    expect(resolved.experienceHandles).toEqual([
      { experienceRef: 'exp:1', document: experience },
    ]);
    expect(Object.prototype.hasOwnProperty.call(experience, 'url')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(experience, 'id')).toBe(false);
  });

  it('selects the exact second Surface URL without changing route-table order in 2.4', () => {
    const resolved = dereferenceBundleExport(bundleExport({
      $formspecBundle: '2.4',
      entrySurface: 'surface:staff',
    }));

    expect(resolved.surfaces).toEqual([respondentSurface, staffSurface]);
    expect(resolved.entrySurface).toBe(staffSurface);
    expect(resolved.diagnostics).toEqual([]);
  });

  it('keeps exact entry selection stable when manifest Surface order changes', () => {
    const resolved = dereferenceBundleExport(bundleExport({
      $formspecBundle: '2.4',
      surfaces: [{ url: 'surface:staff' }, { url: 'surface:respondent' }],
      entrySurface: 'surface:respondent',
    }));

    expect(resolved.surfaces).toEqual([staffSurface, respondentSurface]);
    expect(resolved.entrySurface).toBe(respondentSurface);
  });

  it('implicitly selects the sole loaded Surface in 2.4', () => {
    const resolved = dereferenceBundleExport(bundleExport({
      $formspecBundle: '2.4',
      surfaces: [{ url: 'surface:staff' }],
    }));

    expect(resolved.entrySurface).toBe(staffSurface);
    expect(resolved.diagnostics).toEqual([]);
  });

  it('refuses a multi-Surface 2.4 manifest that omits entrySurface', () => {
    const resolved = dereferenceBundleExport(bundleExport({ $formspecBundle: '2.4' }));

    expect(resolved.entrySurface).toBeNull();
    expect(resolved.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'APP-ENTRY-AMBIGUOUS',
    );
  });

  it('refuses an explicit selector that is unresolved instead of falling back', () => {
    const resolved = dereferenceBundleExport(bundleExport({
      $formspecBundle: '2.4',
      entrySurface: 'surface:missing',
    }));

    expect(resolved.entrySurface).toBeNull();
    expect(resolved.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'APP-ENTRY-SURFACE-UNRESOLVED',
    );
  });

  it('refuses an explicit selector that ambiguously matches duplicate refs', () => {
    const resolved = dereferenceBundleExport(bundleExport({
      $formspecBundle: '2.4',
      surfaces: [{ url: 'surface:respondent' }, { url: 'surface:respondent' }],
      entrySurface: 'surface:respondent',
    }));

    expect(resolved.entrySurface).toBeNull();
    expect(resolved.diagnostics.find(
      (diagnostic) => diagnostic.code === 'APP-ENTRY-SURFACE-UNRESOLVED',
    )?.details).toMatchObject({ manifestMatches: 2, loadedMatches: 2 });
  });

  it('does not apply the 2.4 selector to an older App Manifest', () => {
    const resolved = dereferenceBundleExport(bundleExport({
      $formspecBundle: '2.3',
      entrySurface: 'surface:staff',
    }));

    expect(Object.prototype.hasOwnProperty.call(resolved, 'entrySurface')).toBe(false);
  });
});
