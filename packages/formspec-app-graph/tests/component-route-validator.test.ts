import { describe, expect, it } from 'vitest';
import {
  componentNodeIdentityKey,
  validateAppGraph,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const SURFACE_URL = 'https://example.gov/apps/workspace/surfaces/respondent';
const COMPONENT_A_URL = 'https://example.gov/apps/workspace/components/review-route';
const COMPONENT_B_URL = 'https://example.gov/apps/workspace/components/review-alt';
const DEFINITION_URL = 'https://example.gov/forms/intake';

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
    components: [{ handle: 'reviewRoute', url: COMPONENT_A_URL, version: '1.0.0' }],
    ...partial,
  };
}

function surfaceDocument(partial: Record<string, unknown> = {}) {
  return {
    $formspecSurface: '0.1',
    id: 'respondent',
    entry: 'review',
    routes: [{
      id: 'review',
      path: '/review',
      slots: [{
        id: 'main',
        slotType: 'static-content',
        binding: { kind: 'text', content: 'Review workspace' },
      }],
    }],
    ...partial,
  };
}

function routeComponentDocument(partial: Record<string, unknown> = {}) {
  return {
    $formspecComponent: '1.2',
    version: '1.0.0',
    targetSurfaceRoutes: [{
      surface: { url: SURFACE_URL, version: '1.0.0' },
      route: 'review',
      slot: 'main',
      role: 'slot',
    }],
    tree: { component: 'Stack', children: [] },
    ...partial,
  };
}

function validSchema() {
  return { ok: true };
}

function validateWith(
  manifest: unknown,
  artifacts: Record<string, ResolvedArtifactHandle[]>,
) {
  return validateAppGraph({
    manifest: loadedHandle({
      slot: 'app',
      artifactKind: 'appManifest',
      document: manifest,
    }),
    artifacts,
    schemaValidators: validSchema,
  });
}

function baseArtifacts(componentDoc: unknown, componentRef: Record<string, unknown> = { url: COMPONENT_A_URL, version: '1.0.0' }) {
  return {
    surfaces: [loadedHandle({
      slot: 'surfaces[0]',
      artifactKind: 'surface',
      ref: { url: SURFACE_URL, version: '1.0.0' },
      document: surfaceDocument(),
    })],
    components: [loadedHandle({
      slot: 'components[0]',
      artifactKind: 'component',
      ref: componentRef,
      document: componentDoc,
    })],
  };
}

describe('built-in Component route target validation', () => {
  it('runs without injected cross-artifact validators after schema-valid loaded inputs', () => {
    const report = validateWith(manifestDocument(), baseArtifacts(routeComponentDocument()));

    expect(report.ok).toBe(true);
    expect(report.diagnostics).toEqual([]);
    expect(report.phases).toContainEqual({ phase: 'cross-artifact', status: 'completed' });
  });

  it('rejects unresolved Surface routes and route slots', () => {
    const missingRoute = validateWith(
      manifestDocument(),
      baseArtifacts(routeComponentDocument({
        targetSurfaceRoutes: [{
          surface: { url: SURFACE_URL, version: '1.0.0' },
          route: 'missing',
          role: 'route',
        }],
      })),
    );
    expect(missingRoute.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-ROUTE-UNRESOLVED');

    const missingSlot = validateWith(
      manifestDocument(),
      baseArtifacts(routeComponentDocument({
        targetSurfaceRoutes: [{
          surface: { url: SURFACE_URL, version: '1.0.0' },
          route: 'review',
          slot: 'missing',
          role: 'slot',
        }],
      })),
    );
    expect(missingSlot.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-SLOT-UNRESOLVED');
  });

  it('detects duplicate route claims and normalizes singular component as default', () => {
    const report = validateWith(
      manifestDocument({
        component: { url: COMPONENT_A_URL, version: '1.0.0' },
        components: [{ handle: 'reviewAlt', url: COMPONENT_B_URL, version: '1.0.0' }],
      }),
      {
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          ref: { url: SURFACE_URL, version: '1.0.0' },
          document: surfaceDocument(),
        })],
        components: [
          loadedHandle({
            slot: 'component',
            artifactKind: 'component',
            ref: { url: COMPONENT_A_URL, version: '1.0.0' },
            document: routeComponentDocument(),
          }),
          loadedHandle({
            slot: 'components[0]',
            artifactKind: 'component',
            ref: { url: COMPONENT_B_URL, version: '1.0.0' },
            document: routeComponentDocument(),
          }),
        ],
      },
    );

    const duplicate = report.diagnostics.find((entry) => entry.code === 'APP-GRAPH-COMPONENT-ROUTE-CLAIM-DUPLICATE');
    expect(duplicate).toBeDefined();
    expect(duplicate?.details).toMatchObject({
      priorOwner: `default (${COMPONENT_A_URL})`,
      duplicateOwner: `reviewAlt (${COMPONENT_B_URL})`,
    });
  });

  it('diagnoses ref-less Component handles instead of guessing from document identity', () => {
    const report = validateWith(
      manifestDocument(),
      baseArtifacts(routeComponentDocument({ url: COMPONENT_A_URL }), {}),
    );

    expect(report.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-REF-MISSING');
  });

  it('rejects loaded Component handles that do not resolve to App Manifest membership', () => {
    const report = validateWith(
      manifestDocument(),
      baseArtifacts(routeComponentDocument(), { url: COMPONENT_B_URL, version: '1.0.0' }),
    );

    expect(report.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-MEMBERSHIP');
  });

  it('rejects unmanifested, unloaded, and ambiguous Surface route targets', () => {
    const unmanifested = validateWith(
      manifestDocument({ surfaces: [{ url: 'https://example.gov/apps/workspace/surfaces/admin' }] }),
      baseArtifacts(routeComponentDocument()),
    );
    expect(unmanifested.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-SURFACE-UNMANIFESTED');

    const unloaded = validateWith(
      manifestDocument(),
      {
        components: [loadedHandle({
          slot: 'components[0]',
          artifactKind: 'component',
          ref: { url: COMPONENT_A_URL, version: '1.0.0' },
          document: routeComponentDocument(),
        })],
      },
    );
    expect(unloaded.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-SURFACE-UNLOADED');

    const ambiguous = validateWith(
      manifestDocument(),
      {
        surfaces: [
          loadedHandle({
            slot: 'surfaces[0]',
            artifactKind: 'surface',
            ref: { url: SURFACE_URL, version: '1.0.0' },
            document: surfaceDocument(),
          }),
          loadedHandle({
            slot: 'surfaces[1]',
            artifactKind: 'surface',
            ref: { url: SURFACE_URL, version: '1.0.0' },
            document: surfaceDocument({ id: 'duplicateRespondent' }),
          }),
        ],
        components: [loadedHandle({
          slot: 'components[0]',
          artifactKind: 'component',
          ref: { url: COMPONENT_A_URL, version: '1.0.0' },
          document: routeComponentDocument(),
        })],
      },
    );
    expect(ambiguous.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-SURFACE-AMBIGUOUS');
  });

  it('limits fake targetDefinition rejection to objective graph evidence', () => {
    const fake = validateWith(
      manifestDocument({ definitions: [] }),
      baseArtifacts(routeComponentDocument({
        targetDefinition: { url: DEFINITION_URL },
      })),
    );
    expect(fake.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-FAKE-TARGET-DEFINITION');

    const mixed = validateWith(
      manifestDocument({ definitions: [{ url: DEFINITION_URL, version: '1.0.0' }] }),
      {
        ...baseArtifacts(routeComponentDocument({
          targetDefinition: { url: DEFINITION_URL },
        })),
        definitions: [loadedHandle({
          slot: 'definitions[0]',
          artifactKind: 'definition',
          ref: { url: DEFINITION_URL, version: '1.0.0' },
          document: { $formspec: '1.0' },
          identity: { url: DEFINITION_URL, version: '1.0.0' },
        })],
      },
    );
    expect(mixed.diagnostics.map((entry) => entry.code)).not.toContain('APP-GRAPH-COMPONENT-FAKE-TARGET-DEFINITION');
    expect(mixed.diagnostics.map((entry) => entry.code)).not.toContain('APP-GRAPH-COMPONENT-TARGET-DEFINITION-UNMANIFESTED');
    expect(mixed.diagnostics.map((entry) => entry.code)).not.toContain('APP-GRAPH-COMPONENT-TARGET-DEFINITION-UNLOADED');
  });

  it('rejects unmanifested and unloaded targetDefinition values', () => {
    const unmanifested = validateWith(
      manifestDocument({ definitions: [{ url: 'https://example.gov/forms/other', version: '1.0.0' }] }),
      baseArtifacts(routeComponentDocument({
        targetDefinition: { url: DEFINITION_URL },
      })),
    );
    expect(unmanifested.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-TARGET-DEFINITION-UNMANIFESTED');

    const unloaded = validateWith(
      manifestDocument({ definitions: [{ url: DEFINITION_URL, version: '1.0.0' }] }),
      baseArtifacts(routeComponentDocument({
        targetDefinition: { url: DEFINITION_URL },
      })),
    );
    expect(unloaded.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-TARGET-DEFINITION-UNLOADED');
  });

  it('keeps Surface version checks exact-only until a shared range policy exists', () => {
    const exactMismatch = validateWith(
      manifestDocument({ surfaces: [{ url: SURFACE_URL, version: '2.0.0' }] }),
      {
        ...baseArtifacts(routeComponentDocument()),
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          ref: { url: SURFACE_URL, version: '2.0.0' },
          document: surfaceDocument(),
        })],
      },
    );
    expect(exactMismatch.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-SURFACE-VERSION');

    const rangeDeferred = validateWith(
      manifestDocument({ surfaces: [{ url: SURFACE_URL, version: '^2.0.0' }] }),
      {
        ...baseArtifacts(routeComponentDocument({
          targetSurfaceRoutes: [{
            surface: { url: SURFACE_URL, version: '^1.0.0' },
            route: 'review',
            slot: 'main',
            role: 'slot',
          }],
        })),
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          ref: { url: SURFACE_URL, version: '^2.0.0' },
          document: surfaceDocument(),
        })],
      },
    );
    expect(rangeDeferred.diagnostics.map((entry) => entry.code)).not.toContain('APP-GRAPH-COMPONENT-SURFACE-VERSION');
  });
});

describe('componentNodeIdentityKey', () => {
  it('includes Component membership, Surface, route, and node scope', () => {
    expect(componentNodeIdentityKey({
      component: { handle: 'reviewRoute', url: COMPONENT_A_URL, version: '1.0.0' },
      surface: { url: SURFACE_URL, version: '1.0.0' },
      route: 'review',
      nodePath: '/reviewLayout/submit',
      id: 'submitButton',
      nodeId: 'submitNode',
    })).toBe([
      'reviewRoute',
      COMPONENT_A_URL,
      '1.0.0',
      SURFACE_URL,
      '1.0.0',
      'review',
      '/reviewLayout/submit',
      'submitButton',
      'submitNode',
    ].join('\u0000'));
  });
});
