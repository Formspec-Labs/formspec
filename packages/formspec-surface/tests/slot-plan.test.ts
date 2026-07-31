/** @filedesc Slot dispatch — one assertion per closed slot type, plus embed composition. */
import { describe, expect, it } from 'vitest';
import type { ExperienceDocument, FormDefinition } from '@formspec-org/types';
import type { DataSourcesDocument, RegistryDocument } from '@formspec-org/types';
import { composeSurfaceApp } from '../src/composition.js';
import { planRoute } from '../src/slot-plan.js';
import { createWidgetRegistry, flattenRegistryEntries } from '../src/registry.js';
import { registryDocument, respondentSurface, route, slot, surface } from './fixtures.js';

const Banner = () => 'banner';
const definition = { $formspec: '1.0', url: 'https://example.test/def', items: [] } as unknown as FormDefinition;

const experience = {
  $formspecExperience: '1.0',
  units: [
    {
      id: 'applyForHelp',
      kind: 'data-entry',
      title: 'Tell us about your household',
      needRefs: [{ id: 'works-offline', description: 'Internal note about the respondent.' }],
    },
  ],
} as unknown as ExperienceDocument;

function contextFor(surfaceDocument = respondentSurface, routeId = 'apply') {
  const app = composeSurfaceApp([surfaceDocument]);
  const handle = app.routes.find((candidate) => candidate.routeId === routeId);
  if (!handle) throw new Error(`no route ${routeId}`);
  const registry = flattenRegistryEntries([registryDocument]);
  return {
    handle,
    experiences: [experience],
    definitions: new Map([['https://example.test/def', definition]]),
    registryEntries: registry.entries,
    widgets: createWidgetRegistry({
      modules: [{ moduleId: 'x-acme-chrome', widgets: { IntakeBanner: Banner } }],
      registryEntries: registry.entries,
    }),
  };
}

describe('planRoute — dispatch over the closed taxonomy', () => {
  it('plans static-content, resolving the heading level against the route title', () => {
    const plan = planRoute(contextFor());
    const lead = plan.slots.find((entry) => entry.slotId === 'lead');
    expect(lead?.slotType).toBe('static-content');
    if (lead?.slotType !== 'static-content') return;
    // Authored `level: 1`, but the route title is the page h1 — so h2.
    expect(lead.content).toEqual({ kind: 'heading', content: 'Start here', level: 2 });
  });

  it('plans module-widget through the registry', () => {
    const plan = planRoute(contextFor());
    const chrome = plan.slots.find((entry) => entry.slotId === 'chrome');
    expect(chrome?.slotType).toBe('module-widget');
    if (chrome?.slotType !== 'module-widget') return;
    expect(chrome.resolution.status).toBe('resolved');
    expect(chrome.key).toEqual({ moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' });
  });

  it('plans definition-form and carries the flattened registry entries with it', () => {
    const plan = planRoute(contextFor());
    const form = plan.slots.find((entry) => entry.slotId === 'form');
    expect(form?.slotType).toBe('definition-form');
    if (form?.slotType !== 'definition-form') return;
    expect(form.status).toBe('ready');
    expect(form.definition).toBe(definition);
    expect(form.registryEntries.length).toBeGreaterThan(0);
  });

  it('reports a definition-form whose Definition the bundle does not carry', () => {
    const context = contextFor();
    const plan = planRoute({ ...context, definitions: new Map() });
    const form = plan.slots.find((entry) => entry.slotId === 'form');
    expect(form?.slotType === 'definition-form' && form.status).toBe('unresolved');
    expect(plan.diagnostics.map((d) => d.code)).toContain('BUNDLE-DOCUMENT-MISSING');
  });

  it('plans experience-unit and keeps needs separate from the title', () => {
    const withUnit = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        title: 'R',
        slots: [slot({ id: 'why', slotType: 'experience-unit', binding: { unitRef: 'applyForHelp' } })] as never,
      }),
    ]);
    const plan = planRoute(contextFor(withUnit, 'r'));
    const why = plan.slots[0];
    expect(why?.slotType).toBe('experience-unit');
    if (why?.slotType !== 'experience-unit') return;
    expect(why.unit.status).toBe('resolved');
    expect(why.unit.title).toBe('Tell us about your household');
    expect(why.unit.needs).toHaveLength(1);
  });

  it('uses the exact manifested Experience source for a qualified unit binding', () => {
    const otherExperience = {
      $formspecExperience: '1.0',
      version: '1.0.0',
      units: [
        {
          id: 'applyForHelp',
          kind: 'review',
          title: 'Review the submitted household',
          needRefs: [{ id: 'review-record' }],
        },
      ],
    } as unknown as ExperienceDocument;
    const withQualifiedUnit = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        title: 'R',
        slots: [
          slot({
            id: 'why',
            slotType: 'experience-unit',
            binding: {
              experienceRef: 'experience:review',
              unitRef: 'applyForHelp',
            },
          }),
        ] as never,
      }),
    ]);
    const plan = planRoute({
      ...contextFor(withQualifiedUnit, 'r'),
      experiences: [experience, otherExperience],
      experienceHandles: [
        { experienceRef: 'experience:respondent', document: experience },
        { experienceRef: 'experience:review', document: otherExperience },
      ],
    });
    const why = plan.slots[0];

    expect(why?.slotType).toBe('experience-unit');
    if (why?.slotType !== 'experience-unit') return;
    expect(why.unit.status).toBe('resolved');
    expect(why.unit.title).toBe('Review the submitted household');
    expect(why.unit.needs).toEqual([{ id: 'review-record' }]);
  });

  it('fails closed when a qualified Experience source is missing or ambiguous', () => {
    const withQualifiedUnit = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        slots: [
          slot({
            id: 'why',
            slotType: 'experience-unit',
            binding: {
              experienceRef: 'experience:review',
              unitRef: 'applyForHelp',
            },
          }),
        ] as never,
      }),
    ]);
    const context = contextFor(withQualifiedUnit, 'r');
    const missing = planRoute(context);
    const ambiguous = planRoute({
      ...context,
      experienceHandles: [
        { experienceRef: 'experience:review', document: experience },
        { experienceRef: 'experience:review', document: experience },
      ],
    });

    expect(missing.slots[0]?.slotType === 'experience-unit' && missing.slots[0].unit.status)
      .toBe('unresolved');
    expect(ambiguous.slots[0]?.slotType === 'experience-unit' && ambiguous.slots[0].unit.status)
      .toBe('unresolved');
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'EXPERIENCE-UNIT-UNRESOLVED',
    );
    expect(ambiguous.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'EXPERIENCE-UNIT-UNRESOLVED',
    );
  });

  it('reports an experience-unit the bundle does not carry', () => {
    const missing = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        slots: [slot({ id: 'why', slotType: 'experience-unit', binding: { unitRef: 'ghost' } })] as never,
      }),
    ]);
    const plan = planRoute(contextFor(missing, 'r'));
    // D20. An intra-document miss gets its own code. Reusing
    // `BUNDLE-DOCUMENT-MISSING` left a host unable to tell an absent Experience
    // document from a present one that has no such unit.
    expect(plan.diagnostics.map((d) => d.code)).toEqual(['EXPERIENCE-UNIT-UNRESOLVED']);
    expect(plan.diagnostics.map((d) => d.code)).not.toContain('BUNDLE-DOCUMENT-MISSING');
    expect(plan.diagnostics[0]?.severity).toBe('error');
  });

  it('plans embed-route by planning the embedded route’s own slots', () => {
    const embedding = surface('s', 'host', [
      route({
        id: 'host',
        path: '/host',
        title: 'Host',
        routeClass: 'proof',
        slots: [slot({ id: 'panel', slotType: 'embed-route', binding: { routeRef: 'inner', mode: 'panel' } })] as never,
      }),
      route({
        id: 'inner',
        path: '/inner',
        routeClass: 'intake',
        slots: [slot({ id: 'innerHeading', slotType: 'static-content', binding: { kind: 'heading', content: 'Inner', level: 1 } })] as never,
      }),
    ]);
    const plan = planRoute(contextFor(embedding, 'host'));
    const embed = plan.slots[0];
    expect(embed?.slotType).toBe('embed-route');
    if (embed?.slotType !== 'embed-route') return;
    expect(embed.status).toBe('ready');
    expect(embed.slots).toHaveLength(1);
    const inner = embed.slots[0];
    // The embedded heading steps down: the host's content starts at 2, so the
    // embed's starts at 3. An embed never outranks its host.
    expect(inner?.slotType === 'static-content' && inner.content).toEqual({
      kind: 'heading',
      content: 'Inner',
      level: 3,
    });
  });

  it('terminates on an embed cycle instead of recursing forever', () => {
    const cyclic = surface('s', 'a', [
      route({ id: 'a', path: '/a', slots: [slot({ id: 'sa', slotType: 'embed-route', binding: { routeRef: 'b' } })] as never }),
      route({ id: 'b', path: '/b', slots: [slot({ id: 'sb', slotType: 'embed-route', binding: { routeRef: 'a' } })] as never }),
    ]);
    const plan = planRoute(contextFor(cyclic, 'a'));
    expect(plan.diagnostics.map((d) => d.code)).toContain('EMBED-ROUTE-CYCLE');
  });

  it('reports an embed-route naming a route the Surface does not declare', () => {
    const dangling = surface('s', 'a', [
      route({ id: 'a', path: '/a', slots: [slot({ id: 'sa', slotType: 'embed-route', binding: { routeRef: 'nope' } })] as never }),
    ]);
    const plan = planRoute(contextFor(dangling, 'a'));
    expect(plan.diagnostics.map((d) => d.code)).toContain('EMBED-ROUTE-UNRESOLVED');
  });

  it('reports a module-widget nothing implements without dropping the slot', () => {
    const context = contextFor();
    const plan = planRoute({
      ...context,
      widgets: createWidgetRegistry({ modules: [], registryEntries: context.registryEntries }),
    });
    const chrome = plan.slots.find((entry) => entry.slotId === 'chrome');
    expect(chrome?.slotType === 'module-widget' && chrome.resolution.status).toBe('unimplemented');
    expect(plan.diagnostics.map((d) => d.code)).toContain('WIDGET-UNIMPLEMENTED');
  });

  it('returns an unavailable plan for an unknown runtime slot type instead of throwing', () => {
    const malformed = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        slots: [
          {
            id: 'future',
            slotType: 'video-player',
            binding: {},
          },
        ] as never,
      }),
    ]);

    const plan = planRoute(contextFor(malformed, 'r'));
    expect(plan.slots[0]).toMatchObject({
      slotId: 'future',
      slotType: 'unknown',
      authoredSlotType: 'video-player',
    });
    expect(plan.diagnostics.map((d) => d.code)).toEqual(['SLOT-TYPE-UNKNOWN']);
  });

  it('carries binding.config through as the only authored widget channel', () => {
    const configured = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        slots: [
          slot({
            id: 'w',
            slotType: 'module-widget',
            binding: { moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner', config: { headline: 'Hi' } },
          }),
        ] as never,
      }),
    ]);
    const plan = planRoute(contextFor(configured, 'r'));
    const widget = plan.slots[0];
    expect(widget?.slotType === 'module-widget' && widget.config).toEqual({ headline: 'Hi' });
  });

  it('plans declared data inputs and action outputs through exact authored bindings', () => {
    const surfaceRef = 'https://example.test/surfaces/s';
    const catalogRef = 'https://example.test/data/widgets';
    const widgetSurface = surface(
      's',
      'r',
      [
        route({
          id: 'r',
          path: '/r',
          slots: [
            slot({
              id: 'w',
              slotType: 'module-widget',
              binding: {
                moduleId: 'x-runtime',
                widgetName: 'RuntimeWidget',
                dataBindings: {
                  receipt: { catalogRef, sourceRef: 'resource:receipt' },
                },
                actionBindings: {
                  accepted: { actionRef: 'acceptReceipt' },
                },
              },
            }),
          ] as never,
        }),
      ],
      { modules: [{ id: 'x-runtime', version: '1.0.0' }] },
    );
    const registry = {
      $formspecRegistry: '1.1',
      publisher: { name: 'Test', url: 'https://example.test' },
      published: '2026-07-28T00:00:00Z',
      entries: [
        {
          name: 'x-runtime',
          category: 'module',
          version: '1.0.0',
          status: 'stable',
          contributes: ['x-runtime-widget'],
        },
        {
          name: 'x-runtime-widget',
          category: 'widget',
          version: '1.0.0',
          status: 'stable',
          widgetShape: {
            widgetName: 'RuntimeWidget',
            dataInputs: [{ name: 'receipt', required: true }],
            actionOutputs: [{ name: 'accepted' }],
          },
        },
      ],
    } as unknown as RegistryDocument;
    const data = {
      $formspecDataSources: '1.0',
      id: catalogRef,
      version: '1.0.0',
      sources: [
        {
          id: 'resource:receipt',
          kind: 'document-resource',
          owner: 'host',
          scope: 'route',
          availability: {
            level: 'slot',
            surfaceRef,
            routeRef: 'r',
            slotId: 'w',
          },
          runtime: {
            delivery: 'snapshot',
            cache: { mode: 'snapshot' },
            authorizationBoundary: 'host',
            failureMode: 'block-render',
            provenance: {
              kind: 'document-resource',
              source: 'https://api.example.test/receipt',
            },
          },
        },
      ],
    } as DataSourcesDocument;
    const entries = flattenRegistryEntries([registry]).entries;
    const context = contextFor(widgetSurface, 'r');
    const plan = planRoute({
      ...context,
      registryEntries: entries,
      widgets: createWidgetRegistry({
        modules: [{ moduleId: 'x-runtime', widgets: { RuntimeWidget: Banner } }],
        registryEntries: entries,
      }),
      surfaceRef,
      dataSources: [{ catalogRef, document: data }],
      responseActions: [
        {
          scope: 'app',
          actions: [
            {
              id: 'acceptReceipt',
              intent: 'review',
              label: { literal: 'Accept receipt' },
              'x-generation': {
                anchors: ['need:accept-receipt@3'],
              },
            },
          ],
        },
      ],
    });
    const widget = plan.slots[0];
    expect(widget?.slotType).toBe('module-widget');
    if (widget?.slotType !== 'module-widget') return;
    expect(widget.dataInputs).toMatchObject([
      {
        name: 'receipt',
        required: true,
        status: 'ready',
        descriptor: { catalogRef, sourceRef: 'resource:receipt' },
      },
    ]);
    expect(widget.actionOutputs).toEqual([
      {
        name: 'accepted',
        actionRef: 'acceptReceipt',
        action: {
          actionRef: 'acceptReceipt',
          intent: 'review',
          label: { literal: 'Accept receipt' },
          needAnchors: ['need:accept-receipt@3'],
        },
      },
    ]);
    expect(plan.diagnostics).toEqual([]);
  });

  it('reports a required declared input that the Surface does not bind', () => {
    const registry = {
      $formspecRegistry: '1.1',
      publisher: { name: 'Test', url: 'https://example.test' },
      published: '2026-07-28T00:00:00Z',
      entries: [
        {
          name: 'x-runtime',
          category: 'module',
          version: '1.0.0',
          status: 'stable',
          contributes: ['x-runtime-widget'],
        },
        {
          name: 'x-runtime-widget',
          category: 'widget',
          version: '1.0.0',
          status: 'stable',
          widgetShape: {
            widgetName: 'RuntimeWidget',
            dataInputs: [{ name: 'requiredValue', required: true }],
          },
        },
      ],
    } as unknown as RegistryDocument;
    const widgetSurface = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        slots: [
          slot({
            id: 'w',
            slotType: 'module-widget',
            binding: { moduleId: 'x-runtime', widgetName: 'RuntimeWidget' },
          }),
        ] as never,
      }),
    ]);
    const entries = flattenRegistryEntries([registry]).entries;
    const context = contextFor(widgetSurface, 'r');
    const plan = planRoute({
      ...context,
      registryEntries: entries,
      widgets: createWidgetRegistry({
        modules: [{ moduleId: 'x-runtime', widgets: { RuntimeWidget: Banner } }],
        registryEntries: entries,
      }),
    });
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'WIDGET-DATA-REQUIRED-UNAVAILABLE',
    );
  });
});
