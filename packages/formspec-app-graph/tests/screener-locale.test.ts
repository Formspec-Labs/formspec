/** @filedesc Exact manifest membership for freestanding Screener Locale targets. */
import { describe, expect, it } from 'vitest';
import { validateLocaleAssociations } from '../src/locale-associations.js';
import type { AppGraphContext } from '../src/types.js';
function context(): AppGraphContext {
  return { manifest: { slot: 'manifest', artifactKind: 'app', status: 'loaded', document: {
    $formspecBundle: '2.4', id: 'urn:test:app', version: '1.0.0',
    screeners: [{ url: 'urn:test:gate', version: '1.0.0' }],
    locales: [{ url: 'urn:test:es', version: '1.0.0', locale: 'es-US' }],
  } }, handles: [
    { slot: 'screeners[0]', artifactKind: 'screener', status: 'loaded', ref: { url: 'urn:test:gate', version: '1.0.0' },
      document: { url: 'urn:test:gate', version: '1.0.0' } },
    { slot: 'locales[0]', artifactKind: 'locale', status: 'loaded', ref: { url: 'urn:test:es', version: '1.0.0' },
      document: { $formspecLocale: '2.1', locale: 'es-US', target: { kind: 'screener', url: 'urn:test:gate', compatibleVersions: '1.0.0' } } },
  ], schemaResults: [], evidenceResults: [] };
}
describe('Screener Locale association', () => {
  it('accepts one declared, loaded and pinned Screener', () => expect(validateLocaleAssociations(context())).toEqual([]));
  it('refuses a loaded Screener absent from the manifest', () => {
    const c = context(); (c.manifest.document as any).screeners = [];
    expect(validateLocaleAssociations(c).some(d => d.code === 'APP-GRAPH-LOCALE-TARGET')).toBe(true);
  });
  it('refuses a reference/document version mismatch', () => {
    const c = context(); (c.handles[0]!.document as any).version = '2.0.0';
    expect(validateLocaleAssociations(c).some(d => d.code === 'APP-GRAPH-LOCALE-TARGET')).toBe(true);
  });
  it('refuses a declared semver range despite a compatible document', () => {
    const c = context(); (c.manifest.document as any).screeners[0].version = '^1.0.0'; c.handles[0]!.ref!.version = '^1.0.0';
    expect(validateLocaleAssociations(c).some(d => d.code === 'APP-GRAPH-LOCALE-TARGET')).toBe(true);
  });
  it('refuses missing manifest and loaded reference pins', () => {
    const c = context(); delete (c.manifest.document as any).screeners[0].version; delete c.handles[0]!.ref!.version;
    expect(validateLocaleAssociations(c).some(d => d.code === 'APP-GRAPH-LOCALE-TARGET')).toBe(true);
  });
});
