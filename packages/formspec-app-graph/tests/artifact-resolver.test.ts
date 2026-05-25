import { describe, expect, it, vi } from 'vitest';
import {
  resolveArtifacts,
  type ArtifactLoader,
} from '../src/index.js';

const DEFINITION_URL = 'https://example.gov/forms/intake';
const COMPONENT_URL = 'https://example.gov/components/review';
const SECOND_COMPONENT_URL = 'https://example.gov/components/summary';
const DATASOURCES_URL = 'https://example.gov/data-sources';
const LOCALE_URL = 'https://example.gov/locales/en';
const MAPPING_URL = 'https://example.gov/mappings/default';

function manifest(partial: Record<string, unknown> = {}) {
  return {
    $formspecBundle: '2.2',
    id: 'https://example.gov/app',
    version: '1.0.0',
    definitions: [{ url: DEFINITION_URL, version: '1.0.0' }],
    ...partial,
  };
}

function memoryLoader(documents: Record<string, unknown | 'missing' | 'unsupported'>, calls: string[] = []): ArtifactLoader {
  return ({ slot, ref, artifactKind }) => {
    calls.push(`${slot}:${artifactKind}:${ref.url ?? ''}`);
    const document = ref.url ? documents[ref.url] : undefined;
    if (document === undefined || document === 'missing') return { status: 'missing', source: `memory://${slot}` };
    if (document === 'unsupported') return { status: 'unsupported', source: `memory://${slot}` };
    return { status: 'loaded', document, source: `memory://${slot}`, digest: `sha256:${slot}` };
  };
}

describe('resolveArtifacts', () => {
  it('loads manifest refs in order and preserves handle, locale, and mapping ref evidence', async () => {
    const calls: string[] = [];
    const report = await resolveArtifacts({
      manifest: manifest({
        component: { url: COMPONENT_URL, version: '1.0.0' },
        components: [{ url: SECOND_COMPONENT_URL, version: '1.0.0', handle: 'summary' }],
        dataSources: [{ url: DATASOURCES_URL, version: '1.0.0' }],
        locales: [{ url: LOCALE_URL, version: '1.0.0', locale: 'en-US' }],
        mappings: [{ url: MAPPING_URL, version: '1.0.0', handle: 'default' }],
        modules: [{ id: 'x-module', version: '1.0.0' }],
        sessions: [{ id: 'respondent', actors: ['respondent'] }],
      }),
      loader: memoryLoader({
        [DEFINITION_URL]: { $formspec: '1.0', url: DEFINITION_URL, version: '1.0.0' },
        [COMPONENT_URL]: { $formspecComponent: '1.2', url: COMPONENT_URL, version: '1.0.0', tree: { component: 'Stack', children: [] } },
        [SECOND_COMPONENT_URL]: { $formspecComponent: '1.2', url: SECOND_COMPONENT_URL, version: '1.0.0', tree: { component: 'Stack', children: [] } },
        [DATASOURCES_URL]: { $formspecDataSources: '1.0', url: DATASOURCES_URL, version: '1.0.0', sources: [] },
        [LOCALE_URL]: { $formspecLocale: '1.0', url: LOCALE_URL, version: '1.0.0', locale: 'en-US', strings: {} },
        [MAPPING_URL]: { $formspecMapping: '1.0', url: MAPPING_URL, version: '1.0.0', mappings: [] },
      }, calls),
      source: 'memory://app',
    });

    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      declaredRefs: 6,
      loadedArtifacts: 6,
      errors: 0,
    });
    expect(report.artifacts.components?.[0]?.ref).toMatchObject({ handle: 'summary' });
    expect(report.artifacts.locales?.[0]?.ref).toMatchObject({ locale: 'en-US' });
    expect(report.artifacts.mappings?.[0]?.ref).toMatchObject({ handle: 'default' });
    expect(report.artifacts.component?.[0]?.ref?.url).toBe(COMPONENT_URL);
    expect(calls).toEqual([
      `definitions[0]:definition:${DEFINITION_URL}`,
      `component:component:${COMPONENT_URL}`,
      `components[0]:component:${SECOND_COMPONENT_URL}`,
      `dataSources[0]:dataSources:${DATASOURCES_URL}`,
      `locales[0]:locale:${LOCALE_URL}`,
      `mappings[0]:mapping:${MAPPING_URL}`,
    ]);
    expect(calls.join(' ')).not.toContain('modules');
    expect(calls.join(' ')).not.toContain('sessions');
  });

  it('diagnoses malformed refs without calling the loader', async () => {
    const loader = vi.fn(memoryLoader({}));
    const report = await resolveArtifacts({
      manifest: manifest({ definitions: [{ version: '1.0.0', fixture: 'definition.json' }] }),
      loader,
    });

    expect(loader).not.toHaveBeenCalled();
    expect(report.ok).toBe(false);
    expect(report.artifacts.definitions?.[0]).toMatchObject({ status: 'unsupported' });
    expect(report.diagnostics.map((entry) => entry.code)).toEqual(['ARTIFACT-REF-MALFORMED']);
    expect(JSON.stringify(report.artifacts.definitions?.[0]?.ref ?? {})).not.toContain('fixture');
  });

  it('normalizes missing, unsupported, invalid-discriminator, and thrown loader outcomes into resolver diagnostics', async () => {
    const missing = await resolveArtifacts({
      manifest: manifest(),
      loader: memoryLoader({ [DEFINITION_URL]: 'missing' }),
    });
    expect(missing.summary).toMatchObject({ missingArtifacts: 1, errors: 1 });
    expect(missing.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-MISSING');

    const unsupported = await resolveArtifacts({
      manifest: manifest(),
      loader: memoryLoader({ [DEFINITION_URL]: 'unsupported' }),
    });
    expect(unsupported.summary).toMatchObject({ unsupportedRefs: 1, errors: 1 });
    expect(unsupported.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-UNSUPPORTED-SCHEME');

    const invalidDiscriminator = await resolveArtifacts({
      manifest: manifest(),
      loader: () => ({ status: 'invalid-discriminator' }),
    });
    expect(invalidDiscriminator.ok).toBe(false);
    expect(invalidDiscriminator.summary).toMatchObject({ discriminatorMismatches: 1, errors: 1 });
    expect(invalidDiscriminator.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-DISCRIMINATOR-MISMATCH');

    const failed = await resolveArtifacts({
      manifest: manifest(),
      loader: () => {
        throw new Error('parse failed');
      },
    });
    expect(failed.artifacts.definitions?.[0]).toMatchObject({ status: 'x-load-failed' });
    expect(failed.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-LOAD-FAILED');
  });

  it('checks discriminator, exact version, and artifact-owned URL identity evidence', async () => {
    const discriminator = await resolveArtifacts({
      manifest: manifest(),
      loader: memoryLoader({ [DEFINITION_URL]: { $formspecTheme: '1.0', url: DEFINITION_URL, version: '1.0.0' } }),
    });
    expect(discriminator.artifacts.definitions?.[0]).toMatchObject({ status: 'invalid-discriminator' });
    expect(discriminator.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-DISCRIMINATOR-MISMATCH');

    const version = await resolveArtifacts({
      manifest: manifest(),
      loader: memoryLoader({ [DEFINITION_URL]: { $formspec: '1.0', url: DEFINITION_URL, version: '2.0.0' } }),
    });
    expect(version.artifacts.definitions?.[0]).toMatchObject({ status: 'loaded' });
    expect(version.summary).toMatchObject({ versionMismatches: 1, errors: 1 });
    expect(version.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-VERSION-MISMATCH');

    const identity = await resolveArtifacts({
      manifest: manifest(),
      loader: memoryLoader({ [DEFINITION_URL]: { $formspec: '1.0', url: 'https://example.gov/forms/other', version: '1.0.0' } }),
    });
    expect(identity.artifacts.definitions?.[0]).toMatchObject({ status: 'loaded' });
    expect(identity.summary).toMatchObject({ identityMismatches: 1, errors: 1 });
    expect(identity.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-IDENTITY-MISMATCH');
  });

  it('enforces Data Sources and Component manifest version gates before loading', async () => {
    const loader = vi.fn(memoryLoader({
      [DATASOURCES_URL]: { $formspecDataSources: '1.0' },
      [SECOND_COMPONENT_URL]: { $formspecComponent: '1.2' },
    }));

    const dataSources = await resolveArtifacts({
      manifest: manifest({
        $formspecBundle: '2.0',
        definitions: [],
        dataSources: [{ url: DATASOURCES_URL, version: '1.0.0' }],
      }),
      loader,
    });
    expect(dataSources.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-DATASOURCES-VERSION-GATE');

    const components = await resolveArtifacts({
      manifest: manifest({
        $formspecBundle: '2.1',
        definitions: [],
        components: [{ url: SECOND_COMPONENT_URL, version: '1.0.0', handle: 'summary' }],
      }),
      loader,
    });
    expect(components.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-COMPONENTS-VERSION-GATE');
    expect(loader).not.toHaveBeenCalled();
  });

  it('honors support profile artifact kinds and URI schemes before loading', async () => {
    const loader = vi.fn(memoryLoader({}));
    const unsupportedKind = await resolveArtifacts({
      manifest: manifest(),
      support: { artifactKinds: ['component'] },
      loader,
    });
    expect(unsupportedKind.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-UNSUPPORTED-SLOT');

    const unsupportedScheme = await resolveArtifacts({
      manifest: manifest(),
      support: { uriSchemes: ['urn'] },
      loader,
    });
    expect(unsupportedScheme.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-UNSUPPORTED-SCHEME');
    expect(loader).not.toHaveBeenCalled();
  });
});
