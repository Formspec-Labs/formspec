/** @filedesc Generic, traced module-widget loading, empty, and failure views. */
import type { ReactNode } from 'react';
import { generationNeedAnchors } from '@formspec-org/surface';
import { Heading } from './heading.js';
import { needTraceAttributes } from './need-trace.js';
import type {
  SurfaceWidgetAction,
  SurfaceWidgetProps,
} from './widget-api.js';

type UnknownRecord = Readonly<Record<string, unknown>>;

export type ModuleWidgetStateName =
  | 'loading'
  | 'empty'
  | 'unavailable'
  | 'error';

/** Registry inventory entries required by the generic shell state renderer. */
export const MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES = [
  { pointerPattern: '/stateViews/*', kind: 'module-widget-state-view' },
  { pointerPattern: '/stateViews/*/actions/*', kind: 'module-widget-state-action' },
] as const;

export interface ModuleWidgetEmptyWhen {
  inputName: string;
  path?: string;
}

interface ModuleWidgetGeneratedStateNode {
  'x-generation'?: {
    anchors?: readonly string[];
  };
}

export interface ModuleWidgetRetryStateAction
  extends ModuleWidgetGeneratedStateNode {
  kind: 'retry';
  label: string;
  emphasis?: 'primary' | 'secondary' | 'danger';
}

export interface ModuleWidgetOutputStateAction
  extends ModuleWidgetGeneratedStateNode {
  kind: 'output';
  outputName: string;
  emphasis?: 'primary' | 'secondary' | 'danger';
}

export type ModuleWidgetStateAction =
  | ModuleWidgetRetryStateAction
  | ModuleWidgetOutputStateAction;

export interface ModuleWidgetStateViewConfig
  extends ModuleWidgetGeneratedStateNode {
  heading?: string;
  body?: string;
  actions?: readonly ModuleWidgetStateAction[];
}

export type ModuleWidgetStateViewsConfig = Readonly<
  Partial<Record<ModuleWidgetStateName, ModuleWidgetStateViewConfig>>
>;

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

const SAFE_PATH_PART = /^[a-zA-Z0-9_-]+$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

function readOwnPath(root: unknown, path: string): unknown {
  if (path === '') return root;
  const parts = path.split('.');
  if (
    parts.some((part) =>
      !SAFE_PATH_PART.test(part) || UNSAFE_PATH_PARTS.has(part))
  ) {
    return undefined;
  }
  let current = root;
  for (const part of parts) {
    if (
      typeof current !== 'object' ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function emptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return record(value) !== undefined && Object.keys(value as object).length === 0;
}

/** True only when an explicit safe selector resolves to an empty value. */
export function widgetDataMatchesEmptyWhen(
  config: Readonly<Record<string, unknown>>,
  data: Readonly<Record<string, unknown>>,
): boolean {
  const selector = record(config.emptyWhen);
  const inputName = nonEmptyString(selector?.inputName);
  if (
    !selector ||
    !inputName ||
    !SAFE_PATH_PART.test(inputName) ||
    UNSAFE_PATH_PARTS.has(inputName) ||
    !Object.prototype.hasOwnProperty.call(data, inputName)
  ) {
    return false;
  }
  const path = selector.path === undefined
    ? ''
    : typeof selector.path === 'string'
      ? selector.path
      : undefined;
  if (path === undefined) return false;
  return emptyValue(readOwnPath(data[inputName], path));
}

function literalActionLabel(action: SurfaceWidgetAction): string | undefined {
  return action.label && 'literal' in action.label
    ? nonEmptyString(action.label.literal)
    : undefined;
}

export interface ModuleWidgetStateViewProps {
  state: ModuleWidgetStateName;
  config: Readonly<Record<string, unknown>>;
  headingLevel: SurfaceWidgetProps['headingLevel'];
  actions: readonly SurfaceWidgetAction[];
  emitAction: SurfaceWidgetProps['emitAction'];
  onRetry: () => void;
  fallback: ReactNode;
}

type RenderedStateAction =
  | {
      key: string;
      kind: 'retry';
      label: string;
      emphasis: 'primary' | 'secondary' | 'danger';
      anchors: readonly string[];
    }
  | {
      key: string;
      kind: 'output';
      label: string;
      emphasis: 'primary' | 'secondary' | 'danger';
      anchors: readonly string[];
      action: SurfaceWidgetAction;
    };

/**
 * Render only independently traced state and action objects. A parent config
 * trace never authorizes state copy or controls.
 */
export function ModuleWidgetStateView({
  state,
  config,
  headingLevel,
  actions,
  emitAction,
  onRetry,
  fallback,
}: ModuleWidgetStateViewProps): ReactNode {
  const stateViews = record(config.stateViews);
  const view = record(stateViews?.[state]);
  const viewAnchors = generationNeedAnchors(view);
  if (!view || viewAnchors.length === 0) return fallback;

  const heading = nonEmptyString(view.heading);
  const body = nonEmptyString(view.body);
  const configuredActions = Array.isArray(view.actions) ? view.actions : [];
  const renderedActions: RenderedStateAction[] = [];
  configuredActions.forEach((candidate, index) => {
    const actionView = record(candidate);
    const anchors = generationNeedAnchors(actionView);
    if (!actionView || anchors.length === 0) return;
    const emphasis =
      actionView.emphasis === 'primary' ||
      actionView.emphasis === 'danger'
        ? actionView.emphasis
        : 'secondary';
    if (actionView.kind === 'retry') {
      const label = nonEmptyString(actionView.label);
      if (label) {
        renderedActions.push({
          key: `retry:${index}`,
          kind: 'retry',
          label,
          emphasis,
          anchors,
        });
      }
      return;
    }
    if (actionView.kind !== 'output') return;
    const outputName = nonEmptyString(actionView.outputName);
    const matches = actions.filter((action) => action.outputName === outputName);
    const action = matches.length === 1 ? matches[0] : undefined;
    const label = action ? literalActionLabel(action) : undefined;
    if (action && label) {
      renderedActions.push({
        key: `output:${outputName}:${index}`,
        kind: 'output',
        label,
        emphasis,
        anchors,
        action,
      });
    }
  });
  if (!heading && !body && renderedActions.length === 0) return fallback;

  return (
    <section
      className="fs-surface-widget-state"
      data-widget-state={state}
      aria-busy={state === 'loading' ? 'true' : undefined}
      {...needTraceAttributes(viewAnchors)}
    >
      {heading ? (
        <Heading level={headingLevel} className="fs-surface-widget-state__heading">
          {heading}
        </Heading>
      ) : null}
      {body ? <p className="fs-surface-widget-state__body">{body}</p> : null}
      {renderedActions.length > 0 ? (
        <div className="fs-surface-widget-state__actions">
          {renderedActions.map((action) => (
            <button
              key={action.key}
              className="fs-surface-widget-state__action"
              type="button"
              data-state-action={action.kind}
              data-state-action-output={
                action.kind === 'output' ? action.action.outputName : undefined
              }
              data-emphasis={action.emphasis}
              onClick={
                action.kind === 'retry'
                  ? onRetry
                  : () => emitAction(action.action.outputName)
              }
              {...needTraceAttributes(
                action.anchors,
                action.kind === 'output' ? action.action.needAnchors : undefined,
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
