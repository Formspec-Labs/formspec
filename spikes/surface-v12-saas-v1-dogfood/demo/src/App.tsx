/**
 * @filedesc Fixed browser host for data-only Surface preview bundles.
 *
 * Product content, routes, runtime data, and simulated action outcomes come
 * only from the preview set. This file supplies generic browser and runtime
 * adapters without interpreting any product identifier.
 */
import { useCallback, useMemo } from 'react';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import {
  invokeResponseAction,
  resolveResponseAction,
  resolveResponseActionValidationTuple,
  type ResponseActionInvocationPorts,
  type ResponseActionInvocationResult,
} from '@formspec-org/engine';
import type { SubmitResult } from '@formspec-org/react';
import {
  executeBrowserResourceEffect,
  SurfaceApp,
  starterWidgetModule,
  useBrowserLocation,
  type FireTransition,
  type SurfaceWidgetActionDetail,
  type SurfaceWidgetActionExecutor,
  type SurfaceWidgetModule,
} from '@formspec-org/surface-react';
import {
  createSurfacePreviewRuntime,
  dereferenceBundleExport,
  validateSurfacePreviewScenario,
  type BundleExport,
  type DataSourcePayloadValidationResult,
  type DataSourcePayloadValidator,
  type ResolvedBundle,
  type SurfacePreviewRuntime,
  type SurfaceScenarioPayloadValidator,
} from '@formspec-org/surface';
import type {
  SurfacePreviewScenario,
  SurfaceScenarioActionOutcome,
} from '@formspec-org/types';
import previewSetRaw from '../../artifacts/preview-set.json?raw';

interface PreviewEntry {
  bundle: BundleExport;
  scenario: unknown;
}

interface SurfacePreviewSet {
  $formspecSurfacePreviewSet: '0.1';
  defaultPreview: string;
  previews: Readonly<Record<string, PreviewEntry>>;
}

export interface PreviewSelection {
  previewId: string;
  profileId: string;
  bundle: ResolvedBundle;
  scenario: SurfacePreviewScenario;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new WeakMap<object, ValidateFunction>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPreviewSet(raw: string): SurfacePreviewSet {
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value) ||
    value.$formspecSurfacePreviewSet !== '0.1' ||
    typeof value.defaultPreview !== 'string' ||
    !isRecord(value.previews)
  ) {
    throw new Error('The Surface preview set has an invalid top-level shape.');
  }

  const previews: Record<string, PreviewEntry> = {};
  for (const [previewId, candidate] of Object.entries(value.previews)) {
    if (
      !isRecord(candidate) ||
      !isRecord(candidate.bundle) ||
      !isRecord(candidate.bundle.manifest) ||
      !isRecord(candidate.bundle.documents) ||
      !Object.prototype.hasOwnProperty.call(candidate, 'scenario')
    ) {
      throw new Error(`Preview "${previewId}" has an invalid entry shape.`);
    }
    previews[previewId] = {
      bundle: candidate.bundle as unknown as BundleExport,
      scenario: candidate.scenario,
    };
  }

  if (!Object.prototype.hasOwnProperty.call(previews, value.defaultPreview)) {
    throw new Error('The default preview does not name an available entry.');
  }

  return {
    $formspecSurfacePreviewSet: '0.1',
    defaultPreview: value.defaultPreview,
    previews,
  };
}

const previewSet = readPreviewSet(previewSetRaw);

function selectedKey<T>(
  values: Readonly<Record<string, T>>,
  requested: string | null,
  fallback: string,
  kind: string,
): string {
  const selected = requested ?? fallback;
  if (!Object.prototype.hasOwnProperty.call(values, selected)) {
    const available = Object.keys(values).join(', ');
    throw new Error(
      `Unknown ${kind} "${selected}". Available ${kind} values: ${available}.`,
    );
  }
  return selected;
}

function validateJsonPayload(
  schema: object,
  value: unknown,
): DataSourcePayloadValidationResult {
  try {
    let validate = validators.get(schema);
    if (!validate) {
      validate = ajv.compile(schema);
      validators.set(schema, validate);
    }
    if (validate(value)) return { valid: true };
    return {
      valid: false,
      reason: ajv.errorsText(validate.errors, { separator: '; ' }),
    };
  } catch (error) {
    return {
      valid: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

const validateDataSourcePayload: DataSourcePayloadValidator = ({
  schema,
  value,
}) => validateJsonPayload(schema, value);

const validateScenarioPayload: SurfaceScenarioPayloadValidator = ({
  schema,
  value,
}) => validateJsonPayload(schema, value);

export async function loadPreviewSelection(
  search: string,
): Promise<PreviewSelection> {
  const query = new URLSearchParams(search);
  const previewId = selectedKey(
    previewSet.previews,
    query.get('preview'),
    previewSet.defaultPreview,
    'preview',
  );
  const entry = previewSet.previews[previewId];
  if (!entry) throw new Error('The selected preview is unavailable.');

  const bundle = dereferenceBundleExport(entry.bundle);
  const scenarioResult = await validateSurfacePreviewScenario({
    scenario: entry.scenario,
    bundle,
    validatePayload: validateScenarioPayload,
  });
  if (!scenarioResult.valid) {
    const details = scenarioResult.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join('\n');
    throw new Error(`The selected preview scenario is invalid.\n${details}`);
  }

  const profileId = selectedKey(
    scenarioResult.scenario.profiles,
    query.get('profile'),
    scenarioResult.scenario.defaultProfile,
    'profile',
  );

  return {
    previewId,
    profileId,
    bundle,
    scenario: scenarioResult.scenario,
  };
}

/** Replace only the generic root URL with the scenario's authored entry path. */
export function applyInitialPath(initialPath: string): void {
  if (window.location.pathname !== '/' || initialPath === '/') return;
  const address = new URL(window.location.href);
  address.pathname = initialPath;
  window.history.replaceState(window.history.state, '', address);
}

function widgetModulesFor(bundle: ResolvedBundle): readonly SurfaceWidgetModule[] {
  const moduleIds = [
    ...new Set((bundle.manifest.modules ?? []).map((module) => module.id)),
  ];
  return moduleIds.map((moduleId) => starterWidgetModule(moduleId));
}

function simulatedActionResult(
  document: Parameters<SurfaceWidgetActionExecutor>[0]['document'],
  actionRef: string,
  outcome: Exclude<SurfaceScenarioActionOutcome, { status: 'complete' }>,
): ResponseActionInvocationResult<SurfaceWidgetActionDetail> {
  const resolution = resolveResponseAction(document, actionRef);
  return {
    status: outcome.status === 'defer' ? 'deferred' : 'failed',
    resolution,
    validationTuple: resolution.action
      ? resolveResponseActionValidationTuple(resolution.action)
      : null,
    detail: null,
    effectTrace: [],
    failureReason:
      outcome.message ??
      (outcome.status === 'defer'
        ? 'The preview deferred this action.'
        : 'The preview failed this action.'),
  };
}

function widgetActionExecutorFor(
  runtime: SurfacePreviewRuntime,
  navigate: (href: string) => void,
): SurfaceWidgetActionExecutor {
  return ({ document: actionsDocument, actionRef, invocationId, input }) => {
    const outcome = runtime.actionOutcome(actionRef);
    if (outcome.status !== 'complete') {
      return simulatedActionResult(actionsDocument, actionRef, outcome);
    }

    const ports: ResponseActionInvocationPorts<SurfaceWidgetActionDetail> = {
      submit: () => ({
        response: {} as SubmitResult['response'],
        validationReport: {
          valid: true,
        } as SubmitResult['validationReport'],
      }),
      prepareAppAction: () => input ?? Object.freeze({}),
      dispatchHostEvent: () => {},
      dispatchEffect: (effect, detail) =>
        effect.type === 'browserResource'
          ? executeBrowserResourceEffect(effect, detail, {
              open: (href, target) => {
                if (target === 'self' && href.startsWith('/')) {
                  navigate(href);
                  return;
                }
                window.open(
                  href,
                  target === 'new' ? '_blank' : '_self',
                  target === 'new' ? 'noopener,noreferrer' : undefined,
                );
              },
              download: ({ content, filename, mediaType }) => {
                const href = URL.createObjectURL(
                  new Blob([content], { type: mediaType }),
                );
                const link = document.createElement('a');
                link.href = href;
                link.download = filename;
                link.hidden = true;
                document.body.append(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(href);
              },
            })
          : {
              type: effect.type,
              status: 'succeeded',
            },
      evaluatePrecondition: () => true,
      resolveIdempotencyKey: (_effect, action, context) =>
        `${invocationId}:${action.id}:${context.effectIndex}`,
    };
    return invokeResponseAction(
      actionsDocument,
      actionRef,
      ports,
      undefined,
      { invocationId },
    );
  };
}

export function App({ selection }: { selection: PreviewSelection }) {
  const [location, navigate] = useBrowserLocation(
    selection.scenario.initialPath,
  );
  const runtime = useMemo(
    () =>
      createSurfacePreviewRuntime(
        selection.scenario,
        selection.profileId,
      ),
    [selection.profileId, selection.scenario],
  );
  const widgetModules = useMemo(
    () => widgetModulesFor(selection.bundle),
    [selection.bundle],
  );
  const fireTransition: FireTransition = useCallback(
    (transition, from) => runtime.executeTransition({ transition, from }),
    [runtime],
  );
  const navigatePreservingSelection = useCallback(
    (href: string) => {
      const search = window.location.search;
      navigate(href);
      if (search) {
        window.history.replaceState(
          window.history.state,
          '',
          `${href}${search}`,
        );
      }
    },
    [navigate],
  );
  const widgetActionExecutor = useMemo(
    () => widgetActionExecutorFor(runtime, navigatePreservingSelection),
    [navigatePreservingSelection, runtime],
  );

  return (
    <SurfaceApp
      bundle={selection.bundle}
      location={location}
      onNavigate={navigatePreservingSelection}
      routeParams={selection.scenario.routeParams}
      widgetModules={widgetModules}
      dataSourceLoader={runtime.loader}
      authorizeDataSource={runtime.authorize}
      validateDataSourcePayload={validateDataSourcePayload}
      widgetActionExecutor={widgetActionExecutor}
      onFireTransition={fireTransition}
      sessionGeneration={`${selection.previewId}:${selection.profileId}`}
    />
  );
}
