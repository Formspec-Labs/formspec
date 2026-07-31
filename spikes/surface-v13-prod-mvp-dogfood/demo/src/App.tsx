/**
 * @filedesc Fixed browser host for one data-only Formspec bundle export.
 *
 * Product content, routes, widgets, styling, and data-source identities come
 * from the bundle. This file supplies only generic browser, authorization,
 * loading, and Response Actions ports.
 */
import { useCallback, useMemo, useState } from 'react';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import {
  extractServiceRequestOutputs,
  invokeResponseActionAsync,
  planServiceRequest,
  resolveServiceRequest,
  type ResponseActionAsyncInvocationPorts,
  type ResponseActionEffectDispatchContext,
  type ResponseActionEffectDispatchResult,
  type ResponseActionInvocationResult,
} from '@formspec-org/engine';
import {
  createSemanticControlRegistry,
  type SemanticArtifactIdentity,
} from '@formspec-org/react';
import { sha256Digest } from '@formspec-org/outcome-verification';
import {
  createSurfaceSemanticControlScopeResolver,
  executeBrowserResourceEffect,
  renderDefaultDefinitionForm,
  responseActionsDocumentForAction,
  SurfaceApp,
  starterWidgetModule,
  useBrowserLocation,
  type FireTransition,
  type SurfaceDefinitionFormRenderInput,
  type SurfaceDefinitionFormRenderer,
  type SurfaceSemanticControlScopeRequest,
  type SurfaceWidgetActionDetail,
  type SurfaceWidgetActionExecutor,
  type SurfaceWidgetModule,
} from '@formspec-org/surface-react';
import {
  bundleIsRenderable,
  composeSurfaceApp,
  createPreviewDefinitionResponseStore,
  dereferenceBundleExport,
  routeHref,
  type BundleExport,
  type DataSourceAuthorizer,
  type DataSourceLoadRequest,
  type DataSourceLoader,
  type DataSourcePayloadValidationResult,
  type DataSourcePayloadValidator,
  type ResolvedBundle,
} from '@formspec-org/surface';
import type {
  EffectRequest,
  FormDefinition,
  FormResponse,
  ResponseActionsDocument,
  ServiceRequestEffect,
} from '@formspec-org/types';
import bundleRaw from '../../artifacts/prod-mvp.bundle.json?raw';

type StringMap = Readonly<Record<string, string>>;

interface HostRuntimeConfig {
  baseUrl: string;
  headers: StringMap;
}

export interface BundleHostModel {
  source: BundleExport;
  bundle: ResolvedBundle;
  definitionArtifacts: ReadonlyMap<FormDefinition, SemanticArtifactIdentity>;
  responseActionsArtifacts: ReadonlyMap<
    ResponseActionsDocument,
    SemanticArtifactIdentity
  >;
  initialPath: string;
  routeParams: StringMap;
  runtime: HostRuntimeConfig;
  sessionGeneration: string;
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new WeakMap<object, ValidateFunction>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function own(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readBundleExport(raw: string): BundleExport {
  const value: unknown = JSON.parse(raw);
  if (
    !isRecord(value) ||
    !isRecord(value.manifest) ||
    !isRecord(value.documents)
  ) {
    throw new Error(
      'The bundle export must contain object-valued "manifest" and "documents" properties.',
    );
  }
  return value as unknown as BundleExport;
}

function readStringMap(raw: string | undefined, variableName: string): StringMap {
  if (raw === undefined || raw.trim() === '') return Object.freeze({});
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${variableName} must be a JSON object: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(value)) {
    throw new Error(`${variableName} must be a JSON object.`);
  }
  const entries = Object.entries(value);
  if (entries.some(([, candidate]) => typeof candidate !== 'string')) {
    throw new Error(`${variableName} values must all be strings.`);
  }
  return Object.freeze(Object.fromEntries(entries) as Record<string, string>);
}

function routeParamExamples(bundle: ResolvedBundle): StringMap {
  const candidates = new Map<string, Set<string>>();
  for (const surface of bundle.surfaces) {
    for (const route of surface.routes) {
      for (const param of route.params ?? []) {
        if (typeof param.example !== 'string' || param.example.length === 0) {
          continue;
        }
        const values = candidates.get(param.name) ?? new Set<string>();
        values.add(param.example);
        candidates.set(param.name, values);
      }
    }
  }
  return Object.freeze(
    Object.fromEntries(
      [...candidates.entries()].flatMap(([name, values]) =>
        values.size === 1 ? [[name, [...values][0] as string]] : [],
      ),
    ),
  );
}

function readRouteParams(search: string): StringMap {
  const params: Record<string, string> = {
    ...readStringMap(
      import.meta.env.VITE_FORMSPEC_ROUTE_PARAMS_JSON,
      'VITE_FORMSPEC_ROUTE_PARAMS_JSON',
    ),
  };
  for (const [key, value] of new URLSearchParams(search)) {
    if (!key.startsWith('routeParam.')) continue;
    const name = key.slice('routeParam.'.length);
    if (name.length > 0) params[name] = value;
  }
  return Object.freeze(params);
}

function readRuntimeConfig(): HostRuntimeConfig {
  const configuredBaseUrl =
    import.meta.env.VITE_FORMSPEC_SERVER_URL?.trim() ||
    'http://127.0.0.1:8080';
  const address = new URL(configuredBaseUrl);
  if (address.protocol !== 'http:' && address.protocol !== 'https:') {
    throw new Error('VITE_FORMSPEC_SERVER_URL must use HTTP or HTTPS.');
  }
  const scopeHeaders = Object.fromEntries(
    [
      ['x-formspec-tenant-id', import.meta.env.VITE_FORMSPEC_TENANT_ID],
      ['x-formspec-workspace-id', import.meta.env.VITE_FORMSPEC_WORKSPACE_ID],
      ['x-formspec-environment-id', import.meta.env.VITE_FORMSPEC_ENVIRONMENT_ID],
      ['x-formspec-cell-id', import.meta.env.VITE_FORMSPEC_CELL_ID],
    ].flatMap(([name, value]) =>
      typeof value === 'string' && value.length > 0 ? [[name, value]] : [],
    ),
  );
  return {
    baseUrl: address.href.replace(/\/$/u, ''),
    headers: Object.freeze({
      ...readStringMap(
        import.meta.env.VITE_FORMSPEC_SERVER_HEADERS_JSON,
        'VITE_FORMSPEC_SERVER_HEADERS_JSON',
      ),
      ...scopeHeaders,
    }),
  };
}

function diagnosticText(bundle: ResolvedBundle): string {
  return bundle.diagnostics
    .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
    .join('\n');
}

interface ArtifactEntry<T extends object> {
  artifactRef: string;
  document: T;
}

/** Pair only an exact loaded object with one canonical bundle artifact. */
async function exactArtifactIdentities<T extends object>(
  entries: readonly ArtifactEntry<T>[],
): Promise<ReadonlyMap<T, SemanticArtifactIdentity>> {
  const entriesByObject = new Map<T, ArtifactEntry<T>[]>();
  for (const entry of entries) {
    const matches = entriesByObject.get(entry.document) ?? [];
    matches.push(entry);
    entriesByObject.set(entry.document, matches);
  }
  const exactEntries = [...entriesByObject.values()].flatMap((matches) =>
    matches.length === 1 && matches[0] ? [matches[0]] : [],
  );
  const identities = await Promise.all(
    exactEntries.map(async ({ artifactRef, document }) => [
      document,
      {
        artifactRef,
        artifactDigest: await sha256Digest(document),
      },
    ] as const),
  );
  return new Map(identities);
}

/** Compute canonical identities without interpreting any product identifier. */
async function semanticArtifactIdentities(
  source: BundleExport,
  bundle: ResolvedBundle,
): Promise<Pick<
  BundleHostModel,
  'definitionArtifacts' | 'responseActionsArtifacts'
>> {
  const definitionEntries = [...bundle.definitions.entries()].map(
    ([artifactRef, document]) => ({ artifactRef, document }),
  );
  const responseActions = new Set(bundle.responseActions);
  const responseActionRefs = [
    ...(bundle.manifest.responseActions ? [bundle.manifest.responseActions] : []),
    ...(bundle.manifest.responseActionDocuments ?? []),
  ];
  const responseActionEntries = responseActionRefs.flatMap((ref) => {
    const document = source.documents[ref.url];
    return (
      isRecord(document) &&
      responseActions.has(document as unknown as ResponseActionsDocument)
    )
      ? [{
          artifactRef: ref.url,
          document: document as unknown as ResponseActionsDocument,
        }]
      : [];
  });
  const [definitionArtifacts, responseActionsArtifacts] = await Promise.all([
    exactArtifactIdentities(definitionEntries),
    exactArtifactIdentities(responseActionEntries),
  ]);
  if (
    definitionArtifacts.size !== definitionEntries.length ||
    responseActionsArtifacts.size !== responseActionEntries.length
  ) {
    throw new Error(
      'The bundle does not pair every Definition and Response Actions document to one exact canonical artifact.',
    );
  }
  return { definitionArtifacts, responseActionsArtifacts };
}

const sourceBundle = readBundleExport(bundleRaw);

/** Resolve the bundle and derive its entry URL without a hand-authored scenario. */
export async function loadBundleHost(search: string): Promise<BundleHostModel> {
  const bundle = dereferenceBundleExport(sourceBundle);
  if (!bundleIsRenderable(bundle)) {
    throw new Error(`The bundle is not structurally renderable.\n${diagnosticText(bundle)}`);
  }

  const routeParams = readRouteParams(search);
  const app = composeSurfaceApp(bundle.surfaces, {
    entrySurface: bundle.entrySurface,
  });
  if (!app.entry) {
    const details = [...bundle.diagnostics, ...app.diagnostics]
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join('\n');
    throw new Error(`The bundle does not resolve one entry route.${details ? `\n${details}` : ''}`);
  }
  const entryRouteParams = Object.freeze({
    ...routeParamExamples(bundle),
    ...routeParams,
  });
  const entry = routeHref(app.entry, entryRouteParams);
  if (entry.refusal !== undefined) {
    const details = entry.diagnostics
      .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
      .join('\n');
    throw new Error(`The bundle entry route cannot be addressed.${details ? `\n${details}` : ''}`);
  }

  const runtime = readRuntimeConfig();
  const artifactIdentities = await semanticArtifactIdentities(sourceBundle, bundle);
  return {
    source: sourceBundle,
    bundle,
    ...artifactIdentities,
    initialPath: entry.href,
    routeParams,
    runtime,
    sessionGeneration: JSON.stringify([
      bundle.manifest.id ?? '',
      bundle.manifest.version ?? '',
      runtime.baseUrl,
      runtime.headers,
      routeParams,
    ]),
  };
}

/** Replace only a generic root URL with the bundle-derived entry path. */
export function applyInitialPath(initialPath: string): void {
  if (window.location.pathname !== '/' || initialPath === '/') return;
  const address = new URL(window.location.href);
  address.pathname = initialPath;
  window.history.replaceState(window.history.state, '', address);
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

type DataSourceRuntimeAdapter =
  | Readonly<{ adapter: 'embedded-json'; value: unknown }>
  | Readonly<{
      adapter: 'http-json';
      request: Readonly<{ method: 'GET'; pathTemplate: string }>;
    }>;

function isHostLocalDraft(request: DataSourceLoadRequest): boolean {
  return (
    request.descriptor.source.kind === 'definition-response' &&
    request.descriptor.source.runtime.delivery === 'draft' &&
    request.descriptor.source['x-formspec-runtime'] === undefined
  );
}

function dataSourceRuntime(request: DataSourceLoadRequest): DataSourceRuntimeAdapter {
  const value = request.descriptor.source['x-formspec-runtime'];
  if (!isRecord(value) || typeof value.adapter !== 'string') {
    throw new Error(
      `Data Source "${request.descriptor.catalogRef}#${request.descriptor.sourceRef}" has no valid x-formspec-runtime adapter.`,
    );
  }
  if (value.adapter === 'embedded-json' && own(value, 'value')) {
    return { adapter: 'embedded-json', value: value.value };
  }
  if (
    value.adapter === 'http-json' &&
    isRecord(value.request) &&
    value.request.method === 'GET' &&
    typeof value.request.pathTemplate === 'string' &&
    value.request.pathTemplate.startsWith('/') &&
    !value.request.pathTemplate.startsWith('//')
  ) {
    return {
      adapter: 'http-json',
      request: {
        method: 'GET',
        pathTemplate: value.request.pathTemplate,
      },
    };
  }
  throw new Error(
    `Data Source "${request.descriptor.catalogRef}#${request.descriptor.sourceRef}" declares an unsupported x-formspec-runtime adapter.`,
  );
}

function fillRuntimePath(
  template: string,
  params: StringMap,
): string {
  const missing = new Set<string>();
  const path = template.replace(
    /\{([A-Za-z][A-Za-z0-9_]*)\}/gu,
    (_marker, name: string) => {
      const value = params[name];
      if (value === undefined) {
        missing.add(name);
        return `{${name}}`;
      }
      return encodeURIComponent(value);
    },
  );
  if (missing.size > 0) {
    throw new Error(
      `The Data Source path needs route parameter values for ${[...missing]
        .map((name) => `"${name}"`)
        .join(', ')}.`,
    );
  }
  return path;
}

async function loadHttpJson(
  config: HostRuntimeConfig,
  runtime: Extract<DataSourceRuntimeAdapter, { adapter: 'http-json' }>,
  request: DataSourceLoadRequest,
): Promise<unknown> {
  const path = fillRuntimePath(runtime.request.pathTemplate, request.context.params);
  const address = new URL(path, `${config.baseUrl}/`);
  const base = new URL(config.baseUrl);
  if (address.origin !== base.origin) {
    throw new Error('The Data Source path resolves outside the configured server origin.');
  }
  const response = await fetch(address, {
    method: runtime.request.method,
    credentials: 'same-origin',
    headers: {
      ...config.headers,
      accept: 'application/json',
    },
  });
  const value: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const reason = isRecord(value)
      ? [value.detail, value.reason, value.title].find(
          (candidate): candidate is string => typeof candidate === 'string',
        )
      : undefined;
    throw new Error(
      `The Formspec server returned HTTP ${response.status}.${reason ? ` ${reason}` : ''}`,
    );
  }
  if (value === undefined) {
    throw new Error('The Formspec server returned no JSON payload.');
  }
  return value;
}

function runtimeAdapters(config: HostRuntimeConfig): {
  authorize: DataSourceAuthorizer;
  loader: DataSourceLoader;
} {
  const authorize: DataSourceAuthorizer = (request) => {
    try {
      if (isHostLocalDraft(request)) return { status: 'authorized' };
      dataSourceRuntime(request);
      return { status: 'authorized' };
    } catch (error) {
      return {
        status: 'refused',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  const loader: DataSourceLoader = async (request) => {
    try {
      const runtime = dataSourceRuntime(request);
      const value = runtime.adapter === 'embedded-json'
        ? runtime.value
        : await loadHttpJson(config, runtime, request);
      return {
        status: 'loaded',
        value,
        freshness: 'fresh',
      };
    } catch (error) {
      return {
        status: 'unavailable',
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  return { authorize, loader };
}

function widgetModulesFor(bundle: ResolvedBundle): readonly SurfaceWidgetModule[] {
  const moduleIds = [
    ...new Set((bundle.manifest.modules ?? []).map((module) => module.id)),
  ];
  return moduleIds.map((moduleId) => starterWidgetModule(moduleId));
}

interface HostActionSession {
  readonly values: Record<string, string>;
}

interface InvocationActionState {
  readonly internal: Record<string, unknown>;
  readonly pendingSession: Record<string, string>;
}

function serviceRequestFailure(
  effect: ServiceRequestEffect,
  context: ResponseActionEffectDispatchContext,
  reason: string,
): ResponseActionEffectDispatchResult {
  return {
    outcome: {
      type: effect.type,
      status: 'failed',
      ...(context.idempotencyKey
        ? { idempotencyKey: context.idempotencyKey }
        : {}),
      reason,
    },
  };
}

function responseProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return [value.detail, value.reason, value.title].find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.length > 0,
  );
}

async function executeServiceRequest(
  document: ResponseActionsDocument,
  effect: ServiceRequestEffect,
  detail: unknown,
  context: ResponseActionEffectDispatchContext,
  route: StringMap,
  config: HostRuntimeConfig,
  session: HostActionSession,
  invocation: InvocationActionState,
): Promise<ResponseActionEffectDispatchResult> {
  try {
    const request = resolveServiceRequest(
      document['x-formspec-runtime'],
      effect.requestRef,
    );
    const planned = planServiceRequest(request, {
      input: detail,
      route,
      session: session.values,
      result: invocation.internal,
    });
    const address = new URL(planned.path, `${config.baseUrl}/`);
    const base = new URL(config.baseUrl);
    if (address.origin !== base.origin) {
      throw new Error('The service request resolves outside the configured server origin.');
    }
    const response = await fetch(address, {
      method: planned.method,
      credentials: 'same-origin',
      headers: {
        ...config.headers,
        ...planned.headers,
        accept: 'application/json',
        ...(planned.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(context.idempotencyKey
          ? { 'idempotency-key': context.idempotencyKey }
          : {}),
      },
      ...(planned.body !== undefined
        ? { body: JSON.stringify(planned.body) }
        : {}),
    });
    const responseText = await response.text();
    let responseBody: unknown;
    if (responseText.length > 0) {
      try {
        responseBody = JSON.parse(responseText) as unknown;
      } catch {
        throw new Error('The Formspec server returned a non-JSON response.');
      }
    }
    const successful = planned.successStatuses
      ? planned.successStatuses.includes(response.status)
      : response.status >= 200 && response.status < 300;
    if (!successful) {
      const reason = responseProblem(responseBody);
      throw new Error(
        `The Formspec server returned HTTP ${response.status}.${reason ? ` ${reason}` : ''}`,
      );
    }
    const outputs = extractServiceRequestOutputs(request, responseBody);
    Object.assign(invocation.internal, outputs.internal);
    Object.assign(invocation.pendingSession, outputs.sessionBindings);
    return {
      outcome: {
        type: effect.type,
        status: 'succeeded',
        ...(context.idempotencyKey
          ? { idempotencyKey: context.idempotencyKey }
          : {}),
        outcomeRef: request.id,
      },
      ...(Object.keys(outputs.transitionBindings).length > 0
        ? { transitionBindings: outputs.transitionBindings }
        : {}),
    };
  } catch (error) {
    return serviceRequestFailure(
      effect,
      context,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function browserResourcePorts(navigate: (href: string) => void) {
  return {
    open: (href: string, target: 'self' | 'new') => {
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
    download: ({
      content,
      filename,
      mediaType,
    }: {
      content: string;
      filename: string;
      mediaType: string;
    }) => {
      const href = URL.createObjectURL(new Blob([content], { type: mediaType }));
      const link = document.createElement('a');
      link.href = href;
      link.download = filename;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
    },
  };
}

function actionPorts<TDetail>(
  document: ResponseActionsDocument,
  basePorts: ResponseActionAsyncInvocationPorts<TDetail>,
  invocationId: string,
  route: StringMap,
  config: HostRuntimeConfig,
  session: HostActionSession,
  invocation: InvocationActionState,
  navigate: (href: string) => void,
): ResponseActionAsyncInvocationPorts<TDetail> {
  return {
    ...basePorts,
    dispatchHostEvent: (eventName, detail) => {
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
    },
    dispatchEffect: (effect, effectDetail, _action, context) => {
      if (effect.type === 'browserResource') {
        return executeBrowserResourceEffect(
          effect,
          effectDetail,
          browserResourcePorts(navigate),
        );
      }
      if (effect.type === 'serviceRequest') {
        return executeServiceRequest(
          document,
          effect,
          effectDetail,
          context,
          route,
          config,
          session,
          invocation,
        );
      }
      return {
        type: effect.type,
        status: 'failed',
        reason: 'The fixed browser host has no adapter for this durable effect.',
      };
    },
    evaluatePrecondition:
      basePorts.evaluatePrecondition ??
      (() => ({
        passed: false,
        reason: 'The fixed browser host has no Formspec Expression Language evaluator.',
      })),
    resolveIdempotencyKey: (
      _effect: EffectRequest,
      action,
      context,
    ) => `${invocationId}:${action.id}:${context.effectIndex}`,
  };
}

async function invokeActionWithRuntime<TDetail>(
  document: ResponseActionsDocument,
  actionRef: string,
  basePorts: ResponseActionAsyncInvocationPorts<TDetail>,
  invocationId: string,
  route: StringMap,
  config: HostRuntimeConfig,
  session: HostActionSession,
  navigate: (href: string) => void,
  nodeId?: string,
): Promise<ResponseActionInvocationResult<TDetail>> {
  const invocation: InvocationActionState = {
    internal: Object.create(null) as Record<string, unknown>,
    pendingSession: Object.create(null) as Record<string, string>,
  };
  const result = await invokeResponseActionAsync(
    document,
    actionRef,
    actionPorts(
      document,
      basePorts,
      invocationId,
      route,
      config,
      session,
      invocation,
      navigate,
    ),
    nodeId,
    { invocationId },
  );
  if (result.status === 'completed') {
    Object.assign(session.values, invocation.pendingSession);
  }
  return result;
}

function widgetActionExecutorFor(
  config: HostRuntimeConfig,
  session: HostActionSession,
  navigate: (href: string) => void,
): SurfaceWidgetActionExecutor {
  return ({ document, actionRef, invocationId, source, input }) => {
    const detail = (input ?? Object.freeze({})) as SurfaceWidgetActionDetail;
    return invokeActionWithRuntime(
      document,
      actionRef,
      {
        submit: () => null,
        prepareAppAction: () => detail,
        dispatchHostEvent: () => undefined,
      },
      invocationId,
      source.route.params,
      config,
      session,
      navigate,
    );
  };
}

function definitionActionInvokerFor(
  config: HostRuntimeConfig,
  session: HostActionSession,
  route: StringMap,
  navigate: (href: string) => void,
): NonNullable<SurfaceDefinitionFormRenderInput['responseActionInvoker']> {
  return ({
    document,
    actionRef,
    nodeId,
    ports,
    invocationContext,
  }) => {
    if (!document) {
      return invokeResponseActionAsync(
        document,
        actionRef,
        ports,
        nodeId,
        invocationContext,
      );
    }
    const invocationId =
      invocationContext?.invocationId ?? `definition:${crypto.randomUUID()}`;
    return invokeActionWithRuntime(
      document,
      actionRef,
      ports,
      invocationId,
      route,
      config,
      session,
      navigate,
      nodeId,
    );
  };
}

/**
 * Bind Definition actions to the route the shell actually matched. Bundle
 * examples and query defaults can address the entry route, but they are not
 * the runtime identity of a Definition mounted on a later route.
 */
function renderBundleDefinitionFormFor(
  config: HostRuntimeConfig,
  session: HostActionSession,
  navigate: (href: string) => void,
): SurfaceDefinitionFormRenderer {
  return (input) => renderDefaultDefinitionForm({
    ...input,
    responseActionInvoker: definitionActionInvokerFor(
      config,
      session,
      input.route.params,
      navigate,
    ),
  });
}

function hostRenderInstanceId(
  sessionId: string,
  request: SurfaceSemanticControlScopeRequest,
): string {
  return [
    'bundle-render',
    sessionId,
    request.route.surfaceId,
    request.route.routeId,
    request.plan.slotId,
  ].join(':');
}

function hostResponseId(
  sessionId: string,
  request: SurfaceSemanticControlScopeRequest,
): string {
  return [
    'bundle-response',
    sessionId,
    request.plan.definitionRef,
  ].join(':');
}

function transitionExecutorFor(
  bundle: ResolvedBundle,
  config: HostRuntimeConfig,
  session: HostActionSession,
  navigate: (href: string) => void,
): FireTransition {
  return async (transition, from) => {
    const actionRef = transition.actionId;
    if (!actionRef) {
      return { advanced: false, reason: 'The transition does not resolve one action.' };
    }
    const document = responseActionsDocumentForAction(
      bundle.responseActions,
      actionRef,
    );
    if (!document) {
      return { advanced: false, reason: 'The transition action is not unique in the bundle.' };
    }
    const invocationId = `transition:${crypto.randomUUID()}`;
    const detail = Object.freeze({
      route: Object.freeze({
        surfaceId: from.surfaceId,
        routeId: from.routeId,
        params: from.params,
      }),
    });
    const result = await invokeActionWithRuntime(
      document,
      actionRef,
      {
        submit: () => null,
        prepareAppAction: () => detail,
        dispatchHostEvent: () => undefined,
      },
      invocationId,
      from.params,
      config,
      session,
      navigate,
    );
    return result.status === 'completed'
      ? {
          advanced: true,
          ...(result.transitionBindings
            ? { transitionBindings: result.transitionBindings }
            : {}),
        }
      : {
          advanced: false,
          reason: result.failureReason ?? 'The transition action did not complete.',
        };
  };
}

export function App({ model }: { model: BundleHostModel }) {
  return <SessionBoundApp key={model.sessionGeneration} model={model} />;
}

/** One private action session per explicit host-model generation. */
function SessionBoundApp({ model }: { model: BundleHostModel }) {
  const [location, navigate] = useBrowserLocation(model.initialPath);
  const navigatePreservingSearch = useCallback(
    (href: string) => {
      const search = window.location.search;
      navigate(href);
      if (search) {
        window.history.replaceState(window.history.state, '', `${href}${search}`);
      }
    },
    [navigate],
  );
  const [actionSession] = useState<HostActionSession>(
    () => ({ values: { ...model.routeParams } }),
  );
  const [semanticSessionId] = useState(() => crypto.randomUUID());
  const [semanticControlRegistry] = useState(
    () => createSemanticControlRegistry(),
  );
  const resolveSemanticControlScope = useMemo(
    () => createSurfaceSemanticControlScopeResolver({
      registry: semanticControlRegistry,
      definitionArtifacts: model.definitionArtifacts,
      responseActionsArtifacts: model.responseActionsArtifacts,
      renderInstanceIdFor: (request) =>
        hostRenderInstanceId(semanticSessionId, request),
      responseBindingFor: (request) => ({
        responseId: hostResponseId(semanticSessionId, request),
        responseRevision: 0,
      }),
    }),
    [
      model.definitionArtifacts,
      model.responseActionsArtifacts,
      semanticControlRegistry,
      semanticSessionId,
    ],
  );
  const definitionResponseStore = useMemo(
    () => createPreviewDefinitionResponseStore(model.bundle.dataSources ?? []),
    [model.bundle.dataSources],
  );
  const runtime = useMemo(
    () => {
      const adapters = runtimeAdapters(model.runtime);
      return {
        ...adapters,
        loader: definitionResponseStore.wrapLoader(adapters.loader),
      };
    },
    [definitionResponseStore, model.runtime],
  );
  const widgetModules = useMemo(
    () => widgetModulesFor(model.bundle),
    [model.bundle],
  );
  const widgetActionExecutor = useMemo(
    () => widgetActionExecutorFor(
      model.runtime,
      actionSession,
      navigatePreservingSearch,
    ),
    [actionSession, model.runtime, navigatePreservingSearch],
  );
  const renderBundleDefinitionForm = useMemo(
    () => renderBundleDefinitionFormFor(
      model.runtime,
      actionSession,
      navigatePreservingSearch,
    ),
    [
      actionSession,
      model.runtime,
      navigatePreservingSearch,
    ],
  );
  const fireTransition = useMemo(
    () => transitionExecutorFor(
      model.bundle,
      model.runtime,
      actionSession,
      navigatePreservingSearch,
    ),
    [
      actionSession,
      model.bundle,
      model.runtime,
      navigatePreservingSearch,
    ],
  );
  const onDefinitionActionResult = useCallback<
    NonNullable<SurfaceDefinitionFormRenderInput['onDefinitionActionResult']>
  >(
    (result) => {
      const invocationId = result.invocationId;
      const response: FormResponse | undefined = result.detail?.response;
      if (
        result.status !== 'completed' ||
        !invocationId ||
        !response
      ) {
        return;
      }
      for (const catalog of model.bundle.dataSources ?? []) {
        for (const source of catalog.document.sources) {
          if (
            source.kind !== 'definition-response' ||
            source.runtime.delivery !== 'draft' ||
            source.definitionRef !== response.definitionUrl
          ) {
            continue;
          }
          definitionResponseStore.record({
            binding: {
              catalogRef: catalog.catalogRef,
              sourceRef: source.id,
            },
            invocationId,
            response,
          });
        }
      }
    },
    [definitionResponseStore, model.bundle.dataSources],
  );

  return (
    <SurfaceApp
      bundle={model.bundle}
      location={location}
      onNavigate={navigatePreservingSearch}
      routeParams={model.routeParams}
      widgetModules={widgetModules}
      dataSourceLoader={runtime.loader}
      authorizeDataSource={runtime.authorize}
      validateDataSourcePayload={validateDataSourcePayload}
      widgetActionExecutor={widgetActionExecutor}
      onFireTransition={fireTransition}
      renderDefinitionForm={renderBundleDefinitionForm}
      resolveSemanticControlScope={resolveSemanticControlScope}
      onDefinitionActionResult={onDefinitionActionResult}
      sessionGeneration={model.sessionGeneration}
    />
  );
}
