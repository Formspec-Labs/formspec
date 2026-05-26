import { describe, expect, it } from 'vitest';
import {
  validateAppGraph,
  validateComponentGraphContexts,
  type AppGraphContext,
  type AppGraphEvidenceSchemaValidator,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const COMPONENT_GRAPH_CONTEXT_SCHEMA_ID = 'https://formspec.org/schemas/componentGraphProjectionContext/0.1';
const SURFACE_URL = 'https://example.gov/apps/workspace/surfaces/respondent';
const COMPONENT_URL = 'https://example.gov/apps/workspace/components/respondent';

function loadedHandle(partial: Partial<ResolvedArtifactHandle> = {}): ResolvedArtifactHandle {
  return {
    slot: partial.slot ?? 'app',
    artifactKind: partial.artifactKind ?? 'appManifest',
    status: 'loaded',
    schemaId: partial.schemaId,
    document: partial.document ?? {},
    ref: partial.ref,
    identity: partial.identity,
    source: partial.source,
    diagnostics: partial.diagnostics,
  };
}

function manifestDocument(partial: Record<string, unknown> = {}) {
  return {
    $formspecBundle: '2.2',
    version: '1.0.0',
    id: 'https://example.gov/apps/workspace',
    definitions: [],
    surfaces: [{ url: SURFACE_URL, version: '1.0.0' }],
    components: [{ handle: 'respondent', url: COMPONENT_URL, version: '1.0.0' }],
    ...partial,
  };
}

function surfaceDocument(partial: Record<string, unknown> = {}) {
  return {
    $formspecSurface: '0.1',
    id: 'respondent',
    entry: 'apply',
    routes: [{
      id: 'apply',
      path: '/apply',
      slots: [{
        id: 'main',
        slotType: 'static-content',
        binding: { kind: 'text', content: 'Apply' },
      }],
    }],
    ...partial,
  };
}

function componentDocument(partial: Record<string, unknown> = {}) {
  return {
    $formspecComponent: '1.2',
    version: '1.0.0',
    targetSurfaceRoutes: [{
      surface: { url: SURFACE_URL, version: '1.0.0' },
      route: 'apply',
      slot: 'main',
      role: 'slot',
    }],
    tree: { component: 'Stack', id: 'root', children: [] },
    ...partial,
  };
}

function componentGraphContext(partial: Record<string, unknown> = {}) {
  return {
    component: {
      handle: 'respondent',
      url: COMPONENT_URL,
      version: '1.0.0',
    },
    surface: {
      url: SURFACE_URL,
      version: '1.0.0',
    },
    route: 'apply',
    ...partial,
  };
}

function validSchema() {
  return { ok: true };
}

const validEvidence: AppGraphEvidenceSchemaValidator = () => ({ ok: true });

function reviewSurfaceDocument() {
  return surfaceDocument({
    routes: [
      ...surfaceDocument().routes,
      {
        id: 'review',
        path: '/review',
        slots: [{
          id: 'main',
          slotType: 'static-content',
          binding: { kind: 'text', content: 'Review' },
        }],
      },
    ],
  });
}

function validateWith(
  componentContext = componentGraphContext(),
  surfaceDoc: unknown = surfaceDocument(),
) {
  return validateAppGraph({
    manifest: loadedHandle({
      slot: 'app',
      artifactKind: 'appManifest',
      document: manifestDocument(),
    }),
    artifacts: {
      surfaces: [loadedHandle({
        slot: 'surfaces[0]',
        artifactKind: 'surface',
        ref: { url: SURFACE_URL, version: '1.0.0' },
        document: surfaceDoc,
      })],
      components: [loadedHandle({
        slot: 'components[0]',
        artifactKind: 'component',
        ref: { handle: 'respondent', url: COMPONENT_URL, version: '1.0.0' },
        document: componentDocument(),
      })],
    },
    hostEvidence: {
      componentGraphContexts: [{
        schemaId: COMPONENT_GRAPH_CONTEXT_SCHEMA_ID,
        source: 'host://component-graph/respondent',
        document: componentContext,
      }],
    },
    schemaValidators: validSchema,
    evidenceSchemaValidators: validEvidence,
  });
}

function validationContextForComponentEvidence({
  document = componentGraphContext({ route: 'review' }),
  evidenceSchemaId = COMPONENT_GRAPH_CONTEXT_SCHEMA_ID,
  resultSchemaId = evidenceSchemaId,
  evidenceSource = 'host://component-graph/respondent',
  resultSource = evidenceSource,
}: {
  document?: unknown;
  evidenceSchemaId?: string;
  resultSchemaId?: string;
  evidenceSource?: string;
  resultSource?: string;
} = {}): AppGraphContext {
  const manifest = loadedHandle({
    slot: 'app',
    artifactKind: 'appManifest',
    document: manifestDocument(),
  });
  return {
    manifest,
    handles: [
      loadedHandle({
        slot: 'surfaces[0]',
        artifactKind: 'surface',
        ref: { url: SURFACE_URL, version: '1.0.0' },
        document: reviewSurfaceDocument(),
      }),
      loadedHandle({
        slot: 'components[0]',
        artifactKind: 'component',
        ref: { handle: 'respondent', url: COMPONENT_URL, version: '1.0.0' },
        document: componentDocument(),
      }),
    ],
    schemaResults: [],
    evidenceResults: [{
      evidenceSlot: 'hostEvidence.componentGraphContexts[0]',
      schemaId: resultSchemaId,
      source: resultSource,
      status: 'completed',
      ok: true,
      diagnostics: [],
    }],
    hostEvidence: {
      componentGraphContexts: [{
        schemaId: evidenceSchemaId,
        source: evidenceSource,
        document,
      }],
    },
  };
}

describe('Component graph context host evidence validation', () => {
  it('accepts completed host evidence that matches Component membership, targetSurfaceRoutes, and loaded Surface route', () => {
    const report = validateWith();

    expect(report.ok).toBe(true);
    expect(report.evidenceResults).toEqual([expect.objectContaining({
      evidenceSlot: 'hostEvidence.componentGraphContexts[0]',
      schemaId: COMPONENT_GRAPH_CONTEXT_SCHEMA_ID,
      source: 'host://component-graph/respondent',
      status: 'completed',
      ok: true,
    })]);
    expect(report.diagnostics).toEqual([]);
  });

  it('rejects host context that names a route the Component does not target', () => {
    const report = validateWith(
      componentGraphContext({ route: 'review' }),
      reviewSurfaceDocument(),
    );

    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-TARGET',
      primarySource: expect.objectContaining({
        artifactSlot: 'hostEvidence.componentGraphContexts[0]',
        jsonPointer: '/document/route',
      }),
    }));
  });

  it('rejects host context whose Component handle is not an App Manifest membership', () => {
    const report = validateWith(componentGraphContext({
      component: {
        handle: 'admin',
        url: 'https://example.gov/apps/workspace/components/admin',
        version: '1.0.0',
      },
    }));

    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-MEMBERSHIP',
      primarySource: expect.objectContaining({
        artifactSlot: 'hostEvidence.componentGraphContexts[0]',
        jsonPointer: '/document/component/handle',
      }),
    }));
  });

  it.each([
    [
      'Component URL conflicts with App Manifest membership',
      componentGraphContext({
        component: {
          handle: 'respondent',
          url: 'https://example.gov/apps/workspace/components/other',
          version: '1.0.0',
        },
      }),
      'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-COMPONENT',
      '/document/component/url',
    ],
    [
      'Component version conflicts with App Manifest membership',
      componentGraphContext({
        component: {
          handle: 'respondent',
          url: COMPONENT_URL,
          version: '2.0.0',
        },
      }),
      'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-COMPONENT-VERSION',
      '/document/component/version',
    ],
    [
      'Surface URL is not an App Manifest surface',
      componentGraphContext({
        surface: {
          url: 'https://example.gov/apps/workspace/surfaces/other',
          version: '1.0.0',
        },
      }),
      'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-SURFACE',
      '/document/surface/url',
    ],
    [
      'Surface version conflicts with App Manifest surface',
      componentGraphContext({
        surface: {
          url: SURFACE_URL,
          version: '2.0.0',
        },
      }),
      'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-SURFACE-VERSION',
      '/document/surface/version',
    ],
    [
      'route is not in the loaded Surface route namespace',
      componentGraphContext({ route: 'review' }),
      'APP-GRAPH-COMPONENT-GRAPH-CONTEXT-ROUTE',
      '/document/route',
    ],
  ])('rejects host context when %s', (_name, document, code, jsonPointer) => {
    const report = validateWith(document);

    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code,
      primarySource: expect.objectContaining({
        artifactSlot: 'hostEvidence.componentGraphContexts[0]',
        jsonPointer,
      }),
    }));
  });

  it.each([
    ['source mismatch', { resultSource: 'host://component-graph/other' }],
    ['evidence schema mismatch', { evidenceSchemaId: 'https://formspec.org/schemas/other/0.1' }],
    ['result schema mismatch', { resultSchemaId: 'https://formspec.org/schemas/other/0.1' }],
  ])('does not treat completed evidence as proof when %s', (_name, overrides) => {
    const diagnostics = validateComponentGraphContexts(validationContextForComponentEvidence(overrides));

    expect(diagnostics).toEqual([]);
  });
});
