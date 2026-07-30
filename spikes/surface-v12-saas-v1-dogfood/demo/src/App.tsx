/**
 * @filedesc Real browser host for the final v12 Wireframes MCP bundle export.
 *
 * The bundle remains in its replay evidence file. This host reads the last
 * `bundle_export` result, resolves it through the shipped Surface runtime, and
 * supplies only the runtime pieces an exported app cannot contain: data,
 * widget code, action execution, and browser navigation.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  invokeResponseAction,
  type ResponseActionInvocationPorts,
} from '@formspec-org/engine';
import {
  FormspecForm,
  type ResponseActionInvocationResult,
  type SubmitResult,
} from '@formspec-org/react';
import {
  SurfaceApp,
  useBrowserLocation,
  type SurfaceDefinitionFormRenderInput,
  type SurfaceWidget,
  type SurfaceWidgetActionExecutor,
  type SurfaceWidgetActionReport,
} from '@formspec-org/surface-react';
import {
  dereferenceBundleExport,
  type BundleExport,
  type DataSourceAuthorizer,
  type DataSourceLoader,
  type DataSourcePayloadValidator,
  type SurfaceDiagnostic,
} from '@formspec-org/surface';
import type { FormDefinition } from '@formspec-org/types';
import replayEvidenceRaw from '../../evidence/builder-results-structured-attempt-7.json?raw';

const SAAS_MODULE_ID = 'x-saas-shell';

interface ReplayCall {
  call?: {
    name?: string;
  };
  structuredContent?: {
    ok?: boolean;
    value?: unknown;
  };
}

interface ReplayEvidence {
  calls?: ReplayCall[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFinalBundle(raw: string): BundleExport {
  const replay = JSON.parse(raw) as ReplayEvidence;
  const exportCall = replay.calls?.find(
    (call) => call.call?.name === 'formspec_wireframes_export',
  );
  const value = exportCall?.structuredContent?.value;
  if (!isRecord(value) || !isRecord(value.manifest) || !isRecord(value.documents)) {
    throw new Error('The final replay call does not contain a BundleExport.');
  }
  return value as unknown as BundleExport;
}

const bundleExport = readFinalBundle(replayEvidenceRaw);
const bundle = dereferenceBundleExport(bundleExport);

const ROUTE_ACTIONS: Readonly<
  Record<string, readonly { output: string; label: string; emphasis?: boolean }[]>
> = {
  dashboard: [
    { output: 'openForms', label: 'Open forms', emphasis: true },
    { output: 'startOnboarding', label: 'Set up organization' },
    { output: 'openResponses', label: 'View responses' },
    { output: 'openIntegrations', label: 'API & webhooks' },
    { output: 'openAdmin', label: 'Administration' },
    { output: 'openBilling', label: 'Usage & billing' },
    { output: 'openPublicRespond', label: 'Open public form' },
  ],
  onboarding: [{ output: 'submit', label: 'Finish setup', emphasis: true }],
  forms: [{ output: 'review', label: 'Open annual intake', emphasis: true }],
  formDetail: [
    { output: 'saveDraft', label: 'Preview form' },
    { output: 'submit', label: 'View responses', emphasis: true },
  ],
  formPreview: [{ output: 'review', label: 'Back to form' }],
  responses: [
    { output: 'review', label: 'Signature workflows' },
    { output: 'evidence', label: 'Trust center', emphasis: true },
  ],
  signatures: [{ output: 'review', label: 'Back to responses' }],
  integrations: [{ output: 'review', label: 'Review plan usage' }],
  admin: [{ output: 'review', label: 'Organization setup' }],
  billing: [{ output: 'review', label: 'Administration' }],
  supportTrust: [{ output: 'review', label: 'Back to dashboard', emphasis: true }],
  publicRespond: [{ output: 'review', label: 'Review submission', emphasis: true }],
  publicReceipt: [{ output: 'evidence', label: 'View trust center' }],
};

const FORM_PRESENTATION_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  setup: new Set(['organizationName', 'workspaceName', 'environment']),
  mobile: new Set(['fullName', 'email', 'request', 'acceptNotices']),
};

const FORM_ACTION_BY_PRESENTATION: Readonly<Record<string, string>> = {
  setup: 'navSubmit',
  mobile: 'navReview',
};

function definitionForPresentation(
  definition: FormDefinition,
  presentation: string | undefined,
): FormDefinition {
  const fields = presentation ? FORM_PRESENTATION_FIELDS[presentation] : undefined;
  if (!fields) return definition;

  const items = definition.items.filter((item) => fields.has(item.key));
  const binds = definition.binds?.filter((binding) => fields.has(binding.path));
  return {
    ...definition,
    items,
    ...(binds ? { binds } : {}),
  };
}

function DemoDefinitionForm({
  input,
}: {
  input: SurfaceDefinitionFormRenderInput;
}) {
  const presentation = input.plan.presentation;
  const actionId = presentation ? FORM_ACTION_BY_PRESENTATION[presentation] : undefined;
  const definition = useMemo(
    () => definitionForPresentation(input.plan.definition, presentation),
    [input.plan.definition, presentation],
  );
  const responseActionsDocument = useMemo(() => {
    if (!input.responseActionsDocument || !actionId) {
      return input.responseActionsDocument;
    }
    const action = input.responseActionsDocument.actions.find(
      (candidate) => candidate.id === actionId,
    );
    return action
      ? {
          ...input.responseActionsDocument,
          actions: [action] as [typeof action],
        }
      : input.responseActionsDocument;
  }, [input.responseActionsDocument, actionId]);
  const registryEntries = useMemo(
    () => [...input.plan.registryEntries],
    [input.plan.registryEntries],
  );

  return (
    <FormspecForm
      definition={definition}
      themeDocument={input.grant.themeDocument}
      registryEntries={registryEntries}
      responseActionsDocument={responseActionsDocument ?? null}
      emitThemeTokens={false}
      {...(input.onActionCompleted
        ? {
            onSubmit: () => {},
            onActionResult: (
              result: ResponseActionInvocationResult<SubmitResult>,
            ) => {
              const action =
                result.status === 'completed' &&
                result.resolution.resolved &&
                result.detail?.validationReport?.valid === true
                  ? result.resolution.action
                  : null;
              if (action) input.onActionCompleted?.(action);
            },
          }
        : {})}
    />
  );
}

function renderDemoForm(input: SurfaceDefinitionFormRenderInput): ReactNode {
  return <DemoDefinitionForm input={input} />;
}

function featureState(config: Readonly<Record<string, unknown>>): string {
  return typeof config.featureState === 'string' ? config.featureState : 'available';
}

function titleFrom(config: Readonly<Record<string, unknown>>): string {
  return typeof config.title === 'string' ? config.title : 'Route tools';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function ResponseData({ value }: { value: unknown }) {
  const data = asRecord(value);
  const responses = Array.isArray(data?.responses)
    ? data.responses.filter(isRecord)
    : [];
  const formats = stringArray(data?.exportFormats);

  return (
    <div className="route-data" data-demo-data="responses">
      <div className="metric-row">
        <div className="metric">
          <span>Responses</span>
          <strong>{responses.length}</strong>
        </div>
        <div className="metric">
          <span>Proof status</span>
          <strong>{typeof data?.proofStatus === 'string' ? data.proofStatus : 'Unavailable'}</strong>
        </div>
      </div>
      <div className="response-list">
        {responses.map((response, index) => (
          <div className="response-row" key={String(response.id ?? index)}>
            <span>{String(response.form ?? 'Form response')}</span>
            <strong>{String(response.status ?? 'Received')}</strong>
          </div>
        ))}
      </div>
      {formats.length > 0 && (
        <p className="data-note">Export formats: {formats.join(', ')}</p>
      )}
    </div>
  );
}

function BillingData({ value }: { value: unknown }) {
  const data = asRecord(value);
  const usage = asRecord(data?.usage);
  const limits = asRecord(data?.limits);
  return (
    <div className="route-data" data-demo-data="billing">
      <div className="metric-row">
        <div className="metric">
          <span>Plan</span>
          <strong>{String(data?.plan ?? 'Unavailable')}</strong>
        </div>
        <div className="metric">
          <span>Billing</span>
          <strong>{String(data?.billingStatus ?? 'Unavailable')}</strong>
        </div>
      </div>
      <div className="usage-bar">
        <span style={{ width: '42%' }} />
      </div>
      <p className="data-note">
        {String(usage?.responses ?? 0)} of {String(limits?.responses ?? 0)} monthly responses used
      </p>
    </div>
  );
}

function SupportData({ value }: { value: unknown }) {
  const data = asRecord(value);
  const statuses = Array.isArray(data?.serviceStatus)
    ? data.serviceStatus.filter(isRecord)
    : [];
  const documents = stringArray(data?.trustDocuments);
  return (
    <div className="route-data" data-demo-data="support">
      <div className="status-list">
        {statuses.map((status, index) => (
          <div className="status-row" key={String(status.service ?? index)}>
            <span className="status-dot" aria-hidden="true" />
            <span>{String(status.service ?? 'Service')}</span>
            <strong>{String(status.status ?? 'Unknown')}</strong>
          </div>
        ))}
      </div>
      {documents.length > 0 && (
        <p className="data-note">Trust documents: {documents.join(', ')}</p>
      )}
    </div>
  );
}

function RouteData({
  routeId,
  value,
}: {
  routeId: string;
  value: unknown;
}) {
  if (routeId === 'responses') return <ResponseData value={value} />;
  if (routeId === 'billing') return <BillingData value={value} />;
  if (routeId === 'supportTrust') return <SupportData value={value} />;
  return null;
}

const SaaSRoutePanel: SurfaceWidget = ({
  config,
  data,
  emitAction,
  route,
}) => {
  const actions = ROUTE_ACTIONS[route.routeId] ?? [];
  const primaryData = data.primaryData;
  return (
    <div className="saas-panel" data-widget="saas-route-panel">
      <div className="saas-panel__eyebrow">
        <span className={`state state--${featureState(config)}`}>
          {featureState(config)}
        </span>
        <span>{titleFrom(config)}</span>
      </div>
      {route.routeId === 'formDetail' && route.params.formId && (
        <p className="route-context">
          Form ID <code>{route.params.formId}</code>
        </p>
      )}
      {primaryData !== undefined && (
        <RouteData routeId={route.routeId} value={primaryData} />
      )}
      {actions.length > 0 && (
        <div className="saas-panel__actions">
          {actions.map((action) => (
            <button
              className={action.emphasis ? 'action action--primary' : 'action'}
              key={action.output}
              type="button"
              onClick={() => emitAction(action.output)}
            >
              {action.label}
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const widgetModules = [
  {
    moduleId: SAAS_MODULE_ID,
    widgets: { SaaSRoutePanel },
  },
] as const;

const dataSourceLoader: DataSourceLoader = ({ descriptor }) => {
  switch (descriptor.sourceRef) {
    case 'query:responses':
      return {
        status: 'loaded',
        freshness: 'fresh',
        value: {
          responses: [
            { id: 'rsp_1042', form: 'Annual intake', status: 'Verified' },
            { id: 'rsp_1041', form: 'Vendor setup', status: 'Signed' },
            { id: 'rsp_1040', form: 'Annual intake', status: 'Received' },
          ],
          exportFormats: ['CSV', 'JSON'],
          proofStatus: 'Verified',
        },
      };
    case 'host:billing':
      return {
        status: 'loaded',
        freshness: 'fresh',
        value: {
          plan: 'Team',
          usage: { responses: 420 },
          limits: { responses: 1000 },
          billingStatus: 'Current',
        },
      };
    case 'resource:support-trust':
      return {
        status: 'loaded',
        freshness: 'fresh',
        value: {
          serviceStatus: [
            { service: 'Form delivery', status: 'Operational' },
            { service: 'Proof verification', status: 'Operational' },
            { service: 'Webhooks', status: 'Operational' },
          ],
          incidents: [],
          supportAccess: ['Email support', 'Status page'],
          trustDocuments: ['Security overview', 'Subprocessor list'],
        },
      };
    default:
      return {
        status: 'unavailable',
        reason: `The demo host does not implement ${descriptor.sourceRef}.`,
      };
  }
};

const authorizeDataSource: DataSourceAuthorizer = ({ descriptor }) =>
  descriptor.source.runtime.authorizationBoundary === 'host'
    ? { status: 'authorized' }
    : { status: 'refused', reason: 'The demo admits host-authorized data only.' };

const validateDataSourcePayload: DataSourcePayloadValidator = () => ({ valid: true });

const widgetActionExecutor: SurfaceWidgetActionExecutor = ({
  document,
  actionRef,
  invocationId,
}) => {
  const ports: ResponseActionInvocationPorts<SubmitResult> = {
    submit: () => ({
      response: {} as SubmitResult['response'],
      validationReport: { valid: true } as SubmitResult['validationReport'],
    }),
    dispatchHostEvent: () => {
      // The demo has no external host bus. Successful dispatch means the
      // authored event crossed the runtime boundary and was acknowledged here.
    },
  };
  return invokeResponseAction(
    document,
    actionRef,
    ports,
    undefined,
    { invocationId },
  );
};

function RuntimeHeader({
  diagnostics,
}: {
  diagnostics: readonly SurfaceDiagnostic[];
}) {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  return (
    <header className="product-header">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">F</span>
        <div>
          <strong>Formspec Cloud</strong>
          <span>Forms, proof, and signatures</span>
        </div>
      </div>
      <div className="demo-meta">
        <span className="demo-pill">v12 dogfood</span>
        <span
          className={`health ${errors.length === 0 ? 'health--ok' : 'health--error'}`}
          role="status"
        >
          <span aria-hidden="true" />
          {errors.length === 0 ? 'Runtime healthy' : `${errors.length} runtime errors`}
        </span>
      </div>
    </header>
  );
}

function RuntimeFooter({
  diagnostics,
  lastAction,
}: {
  diagnostics: readonly SurfaceDiagnostic[];
  lastAction: string | undefined;
}) {
  return (
    <footer className="runtime-footer">
      <div>
        <strong>Generated, not hand-authored</strong>
        <span>
          13 routes resolved from the final Wireframes MCP v12 bundle export.
        </span>
      </div>
      {lastAction && <output className="activity">{lastAction}</output>}
      {diagnostics.length > 0 && (
        <details className="diagnostics">
          <summary>{diagnostics.length} runtime diagnostic{diagnostics.length === 1 ? '' : 's'}</summary>
          <ul>
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`}>
                <strong>{diagnostic.code}</strong>: {diagnostic.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </footer>
  );
}

function activityMessage(report: SurfaceWidgetActionReport): string | undefined {
  if (report.navigation !== 'advanced') return undefined;
  const action = bundle.responseActions
    .flatMap((document) => document.actions)
    .find((candidate) => candidate.id === report.actionRef);
  const literal =
    action?.label &&
    'literal' in action.label &&
    typeof action.label.literal === 'string'
      ? action.label.literal
      : undefined;
  return `${literal ?? report.outputName} completed`;
}

export function App() {
  const [location, navigate] = useBrowserLocation('/app');
  const [diagnostics, setDiagnostics] = useState<readonly SurfaceDiagnostic[]>(
    bundle.diagnostics,
  );
  const [lastAction, setLastAction] = useState<string>();
  const routeParams = useMemo(() => ({ formId: 'frm_annual-intake' }), []);

  const publicRoute = location === '/respond' || location === '/receipt';

  return (
    <div className={`demo-host ${publicRoute ? 'demo-host--public' : 'demo-host--workspace'}`}>
      <SurfaceApp
        bundle={bundle}
        location={location}
        onNavigate={navigate}
        routeParams={routeParams}
        widgetModules={widgetModules}
        dataSourceLoader={dataSourceLoader}
        authorizeDataSource={authorizeDataSource}
        validateDataSourcePayload={validateDataSourcePayload}
        widgetActionExecutor={widgetActionExecutor}
        renderDefinitionForm={renderDemoForm}
        onDiagnostics={setDiagnostics}
        onWidgetActionReport={(report) => {
          const message = activityMessage(report);
          if (message) setLastAction(message);
        }}
        navigationLabel="Formspec Cloud pages"
        header={<RuntimeHeader diagnostics={diagnostics} />}
        footer={
          <RuntimeFooter diagnostics={diagnostics} lastAction={lastAction} />
        }
      />
    </div>
  );
}
