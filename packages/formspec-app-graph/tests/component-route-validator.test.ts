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

function surfaceWithDefinitionForm(definitionRef = DEFINITION_URL) {
  return surfaceDocument({
    routes: [{
      id: 'review',
      path: '/review',
      slots: [
        {
          id: 'main',
          slotType: 'static-content',
          binding: { kind: 'text', content: 'Review workspace' },
        },
        {
          id: 'form',
          slotType: 'definition-form',
          binding: { definitionRef },
        },
      ],
    }],
  });
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
    tree: { component: 'Stack', id: 'reviewLayout', children: [] },
    ...partial,
  };
}

function boundRouteComponentDocument(partial: Record<string, unknown> = {}) {
  return routeComponentDocument({
    targetDefinition: { url: DEFINITION_URL },
    tree: {
      component: 'Stack',
      id: 'reviewLayout',
      children: [{ component: 'TextInput', bind: 'applicantName' }],
    },
    ...partial,
  });
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

function definitionHandle(): ResolvedArtifactHandle {
  return loadedHandle({
    slot: 'definitions[0]',
    artifactKind: 'definition',
    ref: { url: DEFINITION_URL, version: '1.0.0' },
    document: { $formspec: '1.0', url: DEFINITION_URL },
    identity: { url: DEFINITION_URL, version: '1.0.0' },
  });
}

describe('built-in Component route target validation', () => {
  it('runs without injected cross-artifact validators after schema-valid loaded inputs', () => {
    const report = validateWith(manifestDocument(), baseArtifacts(routeComponentDocument()));

    expect(report.ok).toBe(true);
    expect(report.diagnostics).toEqual([]);
    expect(report.phases).toContainEqual({ phase: 'cross-artifact', status: 'completed' });
  });

  it('accepts route-bound Components with bound controls when the route references the same Definition', () => {
    const report = validateWith(
      manifestDocument({ definitions: [{ url: DEFINITION_URL, version: '1.0.0' }] }),
      {
        ...baseArtifacts(boundRouteComponentDocument()),
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          ref: { url: SURFACE_URL, version: '1.0.0' },
          document: surfaceWithDefinitionForm(),
        })],
        definitions: [definitionHandle()],
      },
    );

    expect(report.ok).toBe(true);
    expect(report.diagnostics).toEqual([]);
  });

  it('requires targetDefinition for route-bound Components with bound controls', () => {
    const report = validateWith(
      manifestDocument(),
      baseArtifacts(boundRouteComponentDocument({ targetDefinition: undefined })),
    );

    const missingTarget = report.diagnostics.find((entry) =>
      entry.code === 'APP-GRAPH-COMPONENT-BOUND-CONTROLS-TARGET-DEFINITION'
    );
    expect(missingTarget).toBeDefined();
    expect(missingTarget?.primarySource).toMatchObject({ artifactSlot: 'components[0]', jsonPointer: '/targetDefinition' });
    expect(missingTarget?.relatedSources).toEqual([
      expect.objectContaining({ artifactSlot: 'components[0]', jsonPointer: '/tree/children/0/bind' }),
    ]);
  });

  it('requires resolved target routes to contain a matching definition-form slot for bound controls', () => {
    const noDefinitionForm = validateWith(
      manifestDocument({ definitions: [{ url: DEFINITION_URL, version: '1.0.0' }] }),
      {
        ...baseArtifacts(boundRouteComponentDocument()),
        definitions: [definitionHandle()],
      },
    );
    expect(noDefinitionForm.diagnostics.map((entry) => entry.code))
      .toContain('APP-GRAPH-COMPONENT-BOUND-CONTROLS-ROUTE-DEFINITION');

    const mismatchedDefinitionForm = validateWith(
      manifestDocument({ definitions: [{ url: DEFINITION_URL, version: '1.0.0' }] }),
      {
        ...baseArtifacts(boundRouteComponentDocument()),
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          ref: { url: SURFACE_URL, version: '1.0.0' },
          document: surfaceWithDefinitionForm('https://example.gov/forms/other'),
        })],
        definitions: [definitionHandle()],
      },
    );
    const mismatch = mismatchedDefinitionForm.diagnostics.find((entry) =>
      entry.code === 'APP-GRAPH-COMPONENT-BOUND-CONTROLS-ROUTE-DEFINITION'
    );
    expect(mismatch?.relatedSources).toEqual([
      expect.objectContaining({ artifactSlot: 'components[0]', jsonPointer: '/targetDefinition/url' }),
      expect.objectContaining({ artifactSlot: 'components[0]', jsonPointer: '/tree/children/0/bind' }),
      expect.objectContaining({ artifactSlot: 'surfaces[0]', jsonPointer: '/routes/0/slots/1/binding/definitionRef' }),
    ]);
  });

  it('ignores bind-like fields outside document.tree for route-bound control checks', () => {
    const report = validateWith(
      manifestDocument(),
      baseArtifacts(routeComponentDocument({
        components: {
          customTemplate: {
            tree: { component: 'TextInput', bind: 'applicantName' },
          },
        },
      })),
    );

    expect(report.ok).toBe(true);
    expect(report.diagnostics.map((entry) => entry.code))
      .not.toContain('APP-GRAPH-COMPONENT-BOUND-CONTROLS-TARGET-DEFINITION');
  });

  it('checks definition-form context for each resolved route target independently', () => {
    const report = validateWith(
      manifestDocument({ definitions: [{ url: DEFINITION_URL, version: '1.0.0' }] }),
      {
        ...baseArtifacts(boundRouteComponentDocument({
          targetSurfaceRoutes: [
            {
              surface: { url: SURFACE_URL, version: '1.0.0' },
              route: 'review',
              slot: 'main',
              role: 'slot',
            },
            {
              surface: { url: SURFACE_URL, version: '1.0.0' },
              route: 'details',
              slot: 'main',
              role: 'slot',
            },
          ],
        })),
        surfaces: [loadedHandle({
          slot: 'surfaces[0]',
          artifactKind: 'surface',
          ref: { url: SURFACE_URL, version: '1.0.0' },
          document: surfaceDocument({
            routes: [
              {
                id: 'review',
                path: '/review',
                slots: [
                  {
                    id: 'main',
                    slotType: 'definition-form',
                    binding: { definitionRef: DEFINITION_URL },
                  },
                ],
              },
              {
                id: 'details',
                path: '/details',
                slots: [
                  {
                    id: 'main',
                    slotType: 'static-content',
                    binding: { kind: 'text', content: 'Details' },
                  },
                ],
              },
            ],
          }),
        })],
        definitions: [definitionHandle()],
      },
    );

    expect(report.diagnostics.map((entry) => entry.code)).toEqual([
      'APP-GRAPH-COMPONENT-BOUND-CONTROLS-ROUTE-DEFINITION',
    ]);
    expect(report.diagnostics[0]?.primarySource).toMatchObject({
      artifactSlot: 'components[0]',
      jsonPointer: '/targetSurfaceRoutes/1',
    });
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

    const boundFake = validateWith(
      manifestDocument({ definitions: [] }),
      baseArtifacts(boundRouteComponentDocument()),
    );
    expect(boundFake.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-FAKE-TARGET-DEFINITION');
    expect(boundFake.diagnostics.map((entry) => entry.code)).not.toContain('APP-GRAPH-COMPONENT-BOUND-CONTROLS-ROUTE-DEFINITION');

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
        tree: { component: 'Stack', children: [{ component: 'TextInput', bind: 'applicantName' }] },
      })),
    );
    expect(unmanifested.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-TARGET-DEFINITION-UNMANIFESTED');
    expect(unmanifested.diagnostics.map((entry) => entry.code)).not.toContain('APP-GRAPH-COMPONENT-BOUND-CONTROLS-ROUTE-DEFINITION');

    const unloaded = validateWith(
      manifestDocument({ definitions: [{ url: DEFINITION_URL, version: '1.0.0' }] }),
      baseArtifacts(routeComponentDocument({
        targetDefinition: { url: DEFINITION_URL },
        tree: { component: 'Stack', children: [{ component: 'TextInput', bind: 'applicantName' }] },
      })),
    );
    expect(unloaded.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-COMPONENT-TARGET-DEFINITION-UNLOADED');
    expect(unloaded.diagnostics.map((entry) => entry.code)).not.toContain('APP-GRAPH-COMPONENT-BOUND-CONTROLS-ROUTE-DEFINITION');
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

  it('requires stable route-scoped nodePath segments for graph-wide Component identity', () => {
    const report = validateWith(
      manifestDocument(),
      baseArtifacts(routeComponentDocument({
        tree: { component: 'Stack', children: [] },
      })),
    );

    const missing = report.diagnostics.find((entry) =>
      entry.code === 'APP-GRAPH-COMPONENT-NODE-PATH-MISSING'
    );
    expect(missing).toBeDefined();
    expect(missing?.primarySource).toMatchObject({ artifactSlot: 'components[0]', jsonPointer: '/tree' });
    expect(missing?.details).toMatchObject({ componentHandle: 'reviewRoute' });
  });

  it('rejects ambiguous sibling nodePath segments', () => {
    const report = validateWith(
      manifestDocument(),
      baseArtifacts(routeComponentDocument({
        tree: {
          component: 'Stack',
          id: 'reviewLayout',
          children: [
            { component: 'Text', id: 'duplicateLabel' },
            { component: 'Text', id: 'duplicateLabel' },
          ],
        },
      })),
    );

    const ambiguous = report.diagnostics.find((entry) =>
      entry.code === 'APP-GRAPH-COMPONENT-NODE-PATH-AMBIGUOUS'
    );
    expect(ambiguous).toBeDefined();
    expect(ambiguous?.primarySource).toMatchObject({
      artifactSlot: 'components[0]',
      jsonPointer: '/tree/children/1/id',
    });
    expect(ambiguous?.relatedSources).toEqual([
      expect.objectContaining({ artifactSlot: 'components[0]', jsonPointer: '/tree/children/0/id' }),
    ]);
  });

  it('rejects duplicate constructed graph-wide Component node identity keys', () => {
    const report = validateWith(
      manifestDocument(),
      baseArtifacts(routeComponentDocument({
        targetSurfaceRoutes: [
          {
            surface: { url: SURFACE_URL, version: '1.0.0' },
            route: 'review',
            role: 'primary',
          },
          {
            surface: { url: SURFACE_URL, version: '1.0.0' },
            route: 'review',
            role: 'secondary',
          },
        ],
      })),
    );

    const duplicate = report.diagnostics.find((entry) =>
      entry.code === 'APP-GRAPH-COMPONENT-NODE-IDENTITY-DUPLICATE'
    );
    expect(duplicate).toBeDefined();
    expect(duplicate?.primarySource).toMatchObject({
      artifactSlot: 'components[0]',
      jsonPointer: '/targetSurfaceRoutes/1',
    });
    expect(duplicate?.details).toMatchObject({
      componentHandle: 'reviewRoute',
      surfaceUrl: SURFACE_URL,
      surfaceVersion: '1.0.0',
      route: 'review',
      nodePath: '/reviewLayout',
      id: 'reviewLayout',
    });
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
