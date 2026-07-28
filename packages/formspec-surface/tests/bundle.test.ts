/** @filedesc Bundle-export dereference — typed artifacts, and absences reported not thrown. */
import { describe, expect, it } from 'vitest';
import { bundleIsRenderable, dereferenceBundleExport } from '../src/bundle.js';
import { bundleExport, tenantTheme } from './fixtures.js';

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
    const resolved = dereferenceBundleExport({
      ...withExperience,
      documents: { ...withExperience.documents, 'exp:1': { $formspecExperience: '1.0', units: [] } },
    });
    expect(resolved.experiences).toHaveLength(1);
  });
});
