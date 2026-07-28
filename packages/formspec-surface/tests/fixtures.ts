/** @filedesc Small hand-built Surface/Registry/bundle fixtures for the shell tests. */
import type { RegistryDocument, SurfaceDocument, ThemeDocument } from '@formspec-org/types';
import type { BundleExport } from '../src/bundle.js';

type Route = SurfaceDocument['routes'][number];
type Slot = Route['slots'][number];

export function slot(partial: Partial<Slot> & Pick<Slot, 'id' | 'slotType' | 'binding'>): Slot {
  return partial as Slot;
}

export function route(partial: Partial<Route> & Pick<Route, 'id' | 'path' | 'slots'>): Route {
  return partial as Route;
}

export function surface(
  id: string,
  entry: string,
  routes: readonly Route[],
  extra: Partial<SurfaceDocument> = {},
): SurfaceDocument {
  return {
    $formspecSurface: '0.1',
    id,
    entry,
    routes: routes as SurfaceDocument['routes'],
    ...extra,
  } as SurfaceDocument;
}

/** A tenant theme whose values are unmistakable if they ever escape. */
export const TENANT_SENTINEL_VALUE = '#7A1F3D';
export const tenantTheme = {
  $formspecTheme: '1.0',
  tokens: { 'color.accent': TENANT_SENTINEL_VALUE, 'color.primary': TENANT_SENTINEL_VALUE },
} as unknown as ThemeDocument;

export const registryDocument: RegistryDocument = {
  $formspecRegistry: '1.0',
  entries: [
    {
      name: 'x-acme-chrome',
      category: 'module',
      version: '0.1.0',
      status: 'stable',
      contributes: ['x-acme-banner', 'x-acme-panel'],
    },
    {
      name: 'x-acme-banner',
      category: 'widget',
      version: '0.1.0',
      status: 'stable',
      // The Surface binding writes THIS value, not `name`. ADR 0160 §2.4.
      widgetShape: { widgetName: 'IntakeBanner', props: { type: 'object' }, childrenPolicy: 'no-children' },
    },
    {
      name: 'x-acme-panel',
      category: 'widget',
      version: '0.1.0',
      status: 'stable',
      widgetShape: { widgetName: 'x-acme-panel', props: { type: 'object' }, childrenPolicy: 'no-children' },
    },
  ],
} as unknown as RegistryDocument;

export const respondentSurface = surface('respondent', 'apply', [
  route({
    id: 'apply',
    path: '/apply',
    title: 'Apply',
    routeClass: 'intake',
    slots: [
      slot({ id: 'lead', slotType: 'static-content', binding: { kind: 'heading', content: 'Start here', level: 1 } }),
      slot({
        id: 'chrome',
        slotType: 'module-widget',
        binding: { moduleId: 'x-acme-chrome', widgetName: 'IntakeBanner' },
      }),
      slot({ id: 'form', slotType: 'definition-form', binding: { definitionRef: 'https://example.test/def' } }),
    ] as unknown as Route['slots'],
    transitions: [{ trigger: 'submit', to: 'receipt' }],
  }),
  route({
    id: 'receipt',
    path: '/receipt/:caseRef',
    title: 'Receipt',
    routeClass: 'proof',
    slots: [
      slot({ id: 'body', slotType: 'module-widget', binding: { moduleId: 'x-acme-chrome', widgetName: 'x-acme-panel' } }),
    ] as unknown as Route['slots'],
  }),
]);

export const staffSurface = surface('staff', 'queue', [
  route({
    id: 'queue',
    path: '/queue',
    title: 'Queue',
    routeClass: 'operation',
    slots: [
      slot({ id: 'unclassified-note', slotType: 'static-content', binding: { kind: 'text', content: 'Work list' } }),
    ] as unknown as Route['slots'],
  }),
]);

export function bundleExport(overrides: Partial<BundleExport['manifest']> = {}): BundleExport {
  return {
    manifest: {
      $formspecBundle: '2.0',
      title: 'Test app',
      surfaces: [{ url: 'surface:respondent' }, { url: 'surface:staff' }],
      registries: [{ url: 'registry:main' }],
      theme: { url: 'theme:tenant' },
      definitions: [{ url: 'https://example.test/def' }],
      ...overrides,
    },
    documents: {
      'surface:respondent': respondentSurface,
      'surface:staff': staffSurface,
      'registry:main': registryDocument,
      'theme:tenant': tenantTheme,
      'https://example.test/def': { $formspec: '1.0', url: 'https://example.test/def', items: [] },
    },
  };
}
