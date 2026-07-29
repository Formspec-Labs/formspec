import { describe, expect, it } from 'vitest';
import {
  artifactResolutionGraphInput,
  resolveBundleExportArtifacts,
} from '../src/index.js';

const DEFINITION_URL = 'https://example.gov/forms/intake';
const OTHER_URL = 'https://example.gov/forms/other';
const DATA_SOURCES_URL = 'https://example.gov/data-sources';

function manifest(partial: Record<string, unknown> = {}) {
  return {
    $formspecBundle: '2.2',
    id: 'https://example.gov/app',
    version: '1.0.0',
    definitions: [{ url: DEFINITION_URL, version: '1.0.0' }],
    ...partial,
  };
}

function definition(partial: Record<string, unknown> = {}) {
  return {
    $formspec: '1.0',
    url: DEFINITION_URL,
    version: '1.0.0',
    title: 'Intake',
    items: [],
    ...partial,
  };
}

describe('resolveBundleExportArtifacts', () => {
  it('validates a complete inline bundle and preserves the document as unknown evidence', async () => {
    const document = definition();
    const report = await resolveBundleExportArtifacts({
      manifest: manifest(),
      documents: { [DEFINITION_URL]: document },
      source: 'memory://app-manifest',
    });

    expect(report.ok).toBe(true);
    expect(report.artifacts.definitions?.[0]).toMatchObject({
      status: 'loaded',
      document,
      source: DEFINITION_URL,
    });
  });

  it('reports a missing own key', async () => {
    const report = await resolveBundleExportArtifacts({
      manifest: manifest(),
      documents: {},
    });

    expect(report.ok).toBe(false);
    expect(report.artifacts.definitions?.[0]?.status).toBe('missing');
    expect(report.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-MISSING');
  });

  it('does not accept a document inherited through the map prototype', async () => {
    const documents = Object.create({
      [DEFINITION_URL]: definition(),
    }) as Record<string, unknown>;

    const report = await resolveBundleExportArtifacts({
      manifest: manifest(),
      documents,
    });

    expect(report.artifacts.definitions?.[0]?.status).toBe('missing');
    expect(report.diagnostics.map((entry) => entry.code)).toContain('ARTIFACT-MISSING');
  });

  it('does not discover an inherited manifest sibling array', async () => {
    const inheritedManifest = Object.assign(
      Object.create({
        definitions: [{ url: DEFINITION_URL, version: '1.0.0' }],
      }),
      {
        $formspecBundle: '2.2',
        id: 'https://example.gov/app',
        version: '1.0.0',
      },
    );
    const report = await resolveBundleExportArtifacts({
      manifest: inheritedManifest,
      documents: { [DEFINITION_URL]: definition() },
    });

    expect(report.summary.declaredRefs).toBe(0);
    expect(report.artifacts.definitions).toBeUndefined();
  });

  it('reports a wrong document discriminator', async () => {
    const report = await resolveBundleExportArtifacts({
      manifest: manifest(),
      documents: {
        [DEFINITION_URL]: {
          $formspecTheme: '1.0',
          url: DEFINITION_URL,
          version: '1.0.0',
        },
      },
    });

    expect(report.artifacts.definitions?.[0]?.status).toBe('invalid-discriminator');
    expect(report.diagnostics.map((entry) => entry.code)).toContain(
      'ARTIFACT-DISCRIMINATOR-MISMATCH',
    );
  });

  it('does not accept an inherited artifact discriminator', async () => {
    const inherited = Object.assign(
      Object.create({ $formspec: '1.0' }),
      {
        url: DEFINITION_URL,
        version: '1.0.0',
        title: 'Intake',
        items: [],
      },
    );
    const report = await resolveBundleExportArtifacts({
      manifest: manifest(),
      documents: { [DEFINITION_URL]: inherited },
    });

    expect(report.artifacts.definitions?.[0]?.status).toBe('invalid-discriminator');
    expect(report.diagnostics.map((entry) => entry.code)).toContain(
      'ARTIFACT-DISCRIMINATOR-MISMATCH',
    );
  });

  it('reports exact version and artifact-owned URL identity mismatches', async () => {
    const report = await resolveBundleExportArtifacts({
      manifest: manifest(),
      documents: {
        [DEFINITION_URL]: definition({
          url: OTHER_URL,
          version: '2.0.0',
        }),
      },
    });

    const codes = report.diagnostics.map((entry) => entry.code);
    expect(codes).toContain('ARTIFACT-VERSION-MISMATCH');
    expect(codes).toContain('ARTIFACT-IDENTITY-MISMATCH');
  });

  it('retains manifest-version gates before consulting inline documents', async () => {
    const report = await resolveBundleExportArtifacts({
      manifest: manifest({
        $formspecBundle: '2.0',
        definitions: [],
        dataSources: [{ url: DATA_SOURCES_URL, version: '1.0.0' }],
      }),
      documents: {
        [DATA_SOURCES_URL]: {
          $formspecDataSources: '1.0',
          url: DATA_SOURCES_URL,
          version: '1.0.0',
          sources: [],
        },
      },
    });

    expect(report.diagnostics.map((entry) => entry.code)).toContain(
      'ARTIFACT-DATASOURCES-VERSION-GATE',
    );
    expect(report.artifacts.dataSources?.[0]?.status).toBe('unsupported');
  });

  it('hands the same validated report into AppGraph input construction', async () => {
    const report = await resolveBundleExportArtifacts({
      manifest: manifest(),
      documents: { [DEFINITION_URL]: definition() },
    });
    const graphInput = artifactResolutionGraphInput(report);

    expect(graphInput.manifest.status).toBe('loaded');
    expect(graphInput.handles).toHaveLength(1);
    expect(graphInput.handles[0]).toMatchObject({
      artifactKind: 'definition',
      status: 'loaded',
    });
    expect(graphInput.artifacts.definitions).toHaveLength(1);
    expect(graphInput.artifactResolution.diagnostics).toEqual([]);
  });
});
