/** @filedesc Admit a preview bundle and compose its scenario and edition-scoped filing adapters. */
import { resolvePageSequence, type PageSequenceEntry } from '@formspec-org/layout';
import {
  bundleIsRenderable, composeSurfaceApp, createSurfacePreviewRuntime, createThemeAuthority, dereferenceBundleExport,
  deriveSurfacePreviewScenario, filingAction, validateSurfacePreviewScenario, type BundleExport, type DataSourcePayloadValidator,
  type ResolvedBundle, type SurfaceDefinitionComponentResolver, type SurfaceScenarioSchemaValidator,
} from '@formspec-org/surface';
import type { ComponentDocument, FormDefinition } from '@formspec-org/types';
import {
  createBrowserFilingStore, previewResponseRecordTools,
  type PreviewFilingStore, type PreviewFilingStoreOptions,
} from './browser-draft-port.js';
import type { SurfacePreviewEdition } from './BrowserSurfaceApp.js';
import { previewFilingInvoker } from './preview-filing-invoker.js';
import { starterWidgetModule } from './widgets/index.js';

function bundleComponentResolver(
  source: BundleExport,
  explicit?: SurfaceDefinitionComponentResolver,
): SurfaceDefinitionComponentResolver | undefined {
  if (explicit) return explicit;
  const manifest = source.manifest as {
    component?: { url: string };
    components?: readonly { url: string }[];
  };
  const refs = [
    ...(manifest.component ? [manifest.component] : []),
    ...(manifest.components ?? []),
  ];
  const docs = refs.flatMap(ref => {
    const doc = source.documents?.[ref.url];
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? [doc as ComponentDocument] : [];
  });
  if (docs.length === 0) return undefined;
  return ({ surfaceRef, routeId, slotId, definition }) => {
    type RouteTarget = { surface: { url: string }; route: string; slot?: string; role?: string };
    const candidates = docs.filter(doc => doc.targetDefinition?.url === definition.url);
    const slotMatch = candidates.find(doc => {
      const targetRoutes = (doc as { targetSurfaceRoutes?: readonly RouteTarget[] }).targetSurfaceRoutes;
      return Boolean(targetRoutes?.some(target =>
        target.role !== 'app-shell' &&
        target.surface.url === surfaceRef &&
        target.route === routeId &&
        target.slot !== undefined &&
        target.slot === slotId));
    });
    if (slotMatch) return slotMatch;
    const routeMatch = candidates.find(doc => {
      const targetRoutes = (doc as { targetSurfaceRoutes?: readonly RouteTarget[] }).targetSurfaceRoutes;
      return Boolean(targetRoutes?.some(target =>
        target.role !== 'app-shell' &&
        target.surface.url === surfaceRef &&
        target.route === routeId &&
        target.slot === undefined));
    });
    if (routeMatch) return routeMatch;
    return candidates.find(doc => {
      const targetRoutes = (doc as { targetSurfaceRoutes?: readonly RouteTarget[] }).targetSurfaceRoutes;
      return !targetRoutes?.length;
    });
  };
}

function bundleSectionPlans(
  bundle: ResolvedBundle,
  resolveDefinitionComponent?: SurfaceDefinitionComponentResolver,
): (definition: FormDefinition) => readonly (readonly PageSequenceEntry[])[] {
  const themeAuthority = createThemeAuthority(
    bundle.tenantTheme ? { tenantTheme: bundle.tenantTheme } : {},
  );
  return definition => {
    const plans: (readonly PageSequenceEntry[])[] = [resolvePageSequence(definition)];
    for (const surface of bundle.surfaces) {
      const surfaceRef = bundle.surfaceRefs?.get(surface);
      for (const route of surface.routes) {
        const theme = themeAuthority.grantFor(route, { surfaceId: surface.id, routeId: route.id }).themeDocument;
        for (const slot of route.slots) {
          if (slot.slotType !== 'definition-form') continue;
          const binding = slot.binding as { definitionRef?: unknown } | undefined;
          if (binding?.definitionRef !== definition.url) continue;
          const component = resolveDefinitionComponent?.({
            surfaceRef,
            routeId: route.id,
            slotId: slot.id,
            definition,
          });
          plans.push(resolvePageSequence(definition, {
            ...(theme ? { theme } : {}),
            ...(component ? { component } : {}),
          }));
        }
      }
    }
    return plans;
  };
}

export async function createSurfacePreviewEdition(input: {
  scope: string;
  source: BundleExport;
  scenario?: unknown;
  validateSchema?: SurfaceScenarioSchemaValidator;
  validatePayload?: (request: Pick<Parameters<DataSourcePayloadValidator>[0], 'schema' | 'value'>) =>
    ReturnType<DataSourcePayloadValidator>;
  resolveDefinitionComponent?: SurfaceDefinitionComponentResolver;
  createFilingStore?: (options: PreviewFilingStoreOptions) => PreviewFilingStore;
}): Promise<SurfacePreviewEdition> {
  const bundle = dereferenceBundleExport(input.source);
  if (!bundleIsRenderable(bundle)) throw new Error(bundle.diagnostics.map(issue => issue.message).join('\n'));
  if (input.scenario !== undefined && !composeSurfaceApp(bundle.surfaces, { entrySurface: bundle.entrySurface }).entry) {
    throw new Error('The preview bundle has no resolved entry route.');
  }
  const validation = await validateSurfacePreviewScenario({
    bundle, scenario: input.scenario === undefined ? deriveSurfacePreviewScenario(bundle) : input.scenario,
    scope: input.scope,
    validateSchema: input.validateSchema, validatePayload: input.validatePayload,
    responseTools: input.scenario === undefined ? undefined : await previewResponseRecordTools(),
  });
  if (!validation.valid) {
    throw new Error(validation.diagnostics.map(issue =>
      `${issue.code}${issue.path ? ` (${issue.path})` : ''}: ${issue.message}`).join('\n'));
  }
  const { scenario } = validation;
  const runtime = createSurfacePreviewRuntime(scenario);
  const resolveDefinitionComponent = bundleComponentResolver(input.source, input.resolveDefinitionComponent);
  const fixtures = scenario.profiles[runtime.profileId]!;
  const store = (input.createFilingStore ?? createBrowserFilingStore)({
    scope: input.scope,
    definitions: bundle.definitions,
    catalogs: bundle.dataSources,
    fixtures,
    sectionPlans: bundleSectionPlans(bundle, resolveDefinitionComponent),
  });
  // Seeding failures reject edition creation when the active profile declares drafts;
  // profiles without draft fixtures still finish legacy summary upgrades when storage is usable,
  // and open with draft storage unavailable when browser storage refuses open.
  if (fixtures.drafts?.length) {
    await store.ready();
  } else if (typeof indexedDB !== 'undefined') {
    await store.ready().catch(() => undefined);
  }
  const filingActions = new Set(bundle.responseActions.flatMap(document =>
    document.actions.filter(action => filingAction(document, action)).map(action => action.id)));
  return {
    scope: input.scope, bundle, initialPath: scenario.initialPath,
    adapters: {
      draftStorage: { scope: input.scope, port: store.drafts }, responses: store.responses,
      withResponseLoader: runtime.withResponseLoader, authorizeDataSource: runtime.authorize,
      validateDataSourcePayload: input.validatePayload,
      ...(resolveDefinitionComponent ? { resolveDefinitionComponent } : {}),
      definitionActionInvoker: previewFilingInvoker(store.submit, runtime.actionOutcome),
      routeParams: scenario.routeParams,
      widgetModules: [...new Set(bundle.manifest.modules?.map(module => module.id))].map(id => starterWidgetModule(id)),
      onFireTransition: (transition, from) => transition.actionId && filingActions.has(transition.actionId)
        ? Promise.resolve({ advanced: false, reason: 'Complete this action on the draft.' })
        : runtime.executeTransition({ transition, from }),
    },
  };
}
