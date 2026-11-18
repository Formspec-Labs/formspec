/** @filedesc Admit a preview bundle and compose its scenario and edition-scoped filing adapters. */
import {
  bundleIsRenderable, composeSurfaceApp, createSurfacePreviewRuntime, dereferenceBundleExport, deriveSurfacePreviewScenario,
  filingAction, validateSurfacePreviewScenario, type BundleExport, type DataSourcePayloadValidator,
  type SurfaceScenarioSchemaValidator,
} from '@formspec-org/surface';
import { createBrowserFilingStore, previewResponseRecordTools } from './browser-draft-port.js';
import type { SurfacePreviewEdition } from './BrowserSurfaceApp.js';
import { previewFilingInvoker } from './preview-filing-invoker.js';
import { starterWidgetModule } from './widgets/index.js';

export async function createSurfacePreviewEdition(input: {
  scope: string;
  source: BundleExport;
  scenario?: unknown;
  validateSchema?: SurfaceScenarioSchemaValidator;
  validatePayload?: (request: Pick<Parameters<DataSourcePayloadValidator>[0], 'schema' | 'value'>) =>
    ReturnType<DataSourcePayloadValidator>;
}): Promise<SurfacePreviewEdition> {
  const bundle = dereferenceBundleExport(input.source);
  if (!bundleIsRenderable(bundle)) throw new Error(bundle.diagnostics.map(issue => issue.message).join('\n'));
  if (input.scenario !== undefined && !composeSurfaceApp(bundle.surfaces, { entrySurface: bundle.entrySurface }).entry) {
    throw new Error('The preview bundle has no resolved entry route.');
  }
  const validation = await validateSurfacePreviewScenario({
    bundle, scenario: input.scenario === undefined ? deriveSurfacePreviewScenario(bundle) : input.scenario,
    validateSchema: input.validateSchema, validatePayload: input.validatePayload,
    responseTools: input.scenario === undefined ? undefined : await previewResponseRecordTools(),
  });
  if (!validation.valid) throw new Error(validation.diagnostics.map(issue => `${issue.code}: ${issue.message}`).join('\n'));
  const { scenario } = validation;
  const runtime = createSurfacePreviewRuntime(scenario);
  const store = createBrowserFilingStore({
    scope: input.scope, definitions: bundle.definitions, catalogs: bundle.dataSources,
    fixtures: scenario.profiles[runtime.profileId]!,
  });
  const filingActions = new Set(bundle.responseActions.flatMap(document =>
    document.actions.filter(action => filingAction(document, action)).map(action => action.id)));
  return {
    scope: input.scope, bundle, initialPath: scenario.initialPath,
    adapters: {
      draftStorage: { scope: input.scope, port: store.drafts }, responses: store.responses,
      withResponseLoader: runtime.withResponseLoader, authorizeDataSource: runtime.authorize,
      validateDataSourcePayload: input.validatePayload,
      definitionActionInvoker: previewFilingInvoker(store.submit, runtime.actionOutcome),
      routeParams: scenario.routeParams,
      widgetModules: [...new Set(bundle.manifest.modules?.map(module => module.id))].map(id => starterWidgetModule(id)),
      onFireTransition: (transition, from) => transition.actionId && filingActions.has(transition.actionId)
        ? Promise.resolve({ advanced: false, reason: 'Complete this action on the draft.' })
        : runtime.executeTransition({ transition, from }),
    },
  };
}
