/**
 * @filedesc A reusable, data-only panel for declarative application surfaces.
 *
 * The panel has no product vocabulary. JSON configuration chooses generic
 * presentation blocks, qualified widget data supplies values, route parameters
 * supply URL facts, and resolved Response Actions supply button labels and
 * intents. Product-specific React, CSS, sample data, and action copy do not
 * belong here.
 *
 * Product content also fails closed on Needs traceability. The only accepted
 * citation form is the canonical generated-artifact anchor
 * `need:<id>@<revision>` under `x-generation.anchors`. The panel header, every
 * block, every authored field or column, and every action presentation carries
 * its own anchor. Parent anchors never authorize untraced child content.
 * Invalid or absent anchors never become DOM claims.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type {
  SurfaceSemanticOutputDeclaration,
  SurfaceSemanticValue,
} from '@formspec-org/surface';
import { Heading, nextLevel } from '../heading.js';
import type {
  SurfaceWidgetAction,
  SurfaceWidgetActionInput,
  SurfaceWidgetProps,
} from '../widget-api.js';
import { admitSurfaceWidgetActionInput } from '../widget-action-runtime.js';
import type {
  ModuleWidgetEmptyWhen,
  ModuleWidgetStateViewsConfig,
} from '../widget-state.js';
import { WidgetEmptyState } from './empty-state.js';
import {
  surfaceSemanticOutputSubjectRef,
  useSurfaceSemanticOutputs,
} from '../semantic-output.js';

interface GeneratedFromNeeds {
  'x-generation'?: {
    anchors?: readonly string[];
  };
}

interface StructuredBlockBase extends GeneratedFromNeeds {
  id: string;
  title?: string;
  emptyMessage?: string;
}

export interface StructuredMetricBlockConfig extends StructuredBlockBase {
  type: 'metric';
  label?: string;
  path: string;
  prefix?: string;
  suffix?: string;
}

export interface StructuredKeyValueItemConfig extends GeneratedFromNeeds {
  id: string;
  label: string;
  path?: string;
  routeParam?: string;
}

export interface StructuredKeyValueBlockConfig extends StructuredBlockBase {
  type: 'key-value';
  items: readonly StructuredKeyValueItemConfig[];
}

export interface StructuredListBlockConfig extends StructuredBlockBase {
  type: 'list';
  path: string;
  itemPath?: string;
  ordered?: boolean;
}

export interface StructuredTableColumnConfig extends GeneratedFromNeeds {
  id: string;
  label: string;
  path: string;
  numeric?: boolean;
}

export interface StructuredTableBlockConfig extends StructuredBlockBase {
  type: 'table';
  path: string;
  caption?: string;
  responsiveMode?: 'stack' | 'scroll';
  columns: readonly StructuredTableColumnConfig[];
  rowAction?: StructuredTableRowActionConfig;
}

export interface StructuredProgressBlockConfig extends StructuredBlockBase {
  type: 'progress';
  label?: string;
  path: string;
  max?: number;
  maxPath?: string;
  suffix?: string;
}

export type StructuredPanelBlockConfig =
  | StructuredMetricBlockConfig
  | StructuredKeyValueBlockConfig
  | StructuredListBlockConfig
  | StructuredTableBlockConfig
  | StructuredProgressBlockConfig;

export interface StructuredPanelActionConfig extends GeneratedFromNeeds {
  outputName: string;
  order?: number;
  emphasis?: 'primary' | 'secondary' | 'danger';
  payload?: StructuredActionPayloadConfig;
  pendingLabel?: string;
  successMessage?: string;
  failureMessage?: string;
}

export interface StructuredActionPayloadSelector {
  /** Dot-separated safe path. An empty path selects the current object. */
  path: string;
}

export type StructuredActionPayloadConfig = Readonly<
  Record<string, StructuredActionPayloadSelector>
>;

export interface StructuredTableRowActionConfig extends GeneratedFromNeeds {
  outputName: string;
  columnLabel: string;
  emphasis?: 'primary' | 'secondary' | 'danger';
  /** Paths are relative to the selected row. */
  payload?: StructuredActionPayloadConfig;
  pendingLabel?: string;
  successMessage?: string;
  failureMessage?: string;
  confirmation?: StructuredActionConfirmationConfig;
}

/** Explicit two-step confirmation for a destructive authored action. */
export interface StructuredActionConfirmationConfig extends GeneratedFromNeeds {
  heading: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface StructuredPanelConfig extends GeneratedFromNeeds {
  id?: string;
  eyebrow?: string;
  state?: string;
  title?: string;
  body?: string;
  emptyMessage?: string;
  emptyWhen?: ModuleWidgetEmptyWhen;
  stateViews?: ModuleWidgetStateViewsConfig;
  blocks?: readonly StructuredPanelBlockConfig[];
  actions?: readonly StructuredPanelActionConfig[];
}

type UnknownRecord = Readonly<Record<string, unknown>>;

type NeedTraceAttributes = {
  'data-need-anchors'?: string;
  'data-need-ids'?: string;
};

const NEED_ANCHOR = /^need:([a-zA-Z][a-zA-Z0-9_-]*)@[1-9][0-9]*$/;
const SAFE_PATH_PART = /^[a-zA-Z0-9_-]+$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function safeId(value: unknown): string | undefined {
  const id = nonEmptyString(value);
  return id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id) ? id : undefined;
}

function needAnchors(value: unknown): string[] {
  const candidate = record(value);
  const generation = record(candidate?.['x-generation']);
  const anchors = generation?.anchors;
  if (!Array.isArray(anchors)) return [];
  return anchors.flatMap((anchor) =>
    typeof anchor === 'string' && NEED_ANCHOR.test(anchor) ? [anchor] : [],
  );
}

type AdmittedActionConfirmation = NonNullable<
  StructuredActionButtonProps['confirmation']
>;

/** Every label present and the confirmation's own Need trace, or nothing. */
function admittedActionConfirmation(
  value: unknown,
): AdmittedActionConfirmation | undefined {
  const config = record(value);
  const anchors = needAnchors(config);
  const heading = nonEmptyString(config?.heading);
  const body = nonEmptyString(config?.body);
  const confirmLabel = nonEmptyString(config?.confirmLabel);
  const cancelLabel = nonEmptyString(config?.cancelLabel);
  return anchors.length > 0 && heading && body && confirmLabel && cancelLabel
    ? { heading, body, confirmLabel, cancelLabel, anchors }
    : undefined;
}

function mergeAnchors(...groups: readonly (readonly string[])[]): string[] {
  const merged: string[] = [];
  for (const group of groups) {
    for (const anchor of group) {
      if (!merged.includes(anchor)) merged.push(anchor);
    }
  }
  return merged;
}

function traceAttributes(anchors: readonly string[]): NeedTraceAttributes {
  if (anchors.length === 0) return {};
  const ids = anchors.flatMap((anchor) => {
    const match = NEED_ANCHOR.exec(anchor);
    return match?.[1] ? [match[1]] : [];
  });
  return {
    'data-need-anchors': anchors.join(' '),
    'data-need-ids': [...new Set(ids)].join(' '),
  };
}

/**
 * Reads only own properties through a dot-separated path. Brackets, empty
 * segments, and prototype-bearing names are rejected.
 */
export function readStructuredPanelPath(root: unknown, path: unknown): unknown {
  if (typeof path !== 'string' || path.length === 0) return undefined;
  const parts = path.split('.');
  if (
    parts.some(
      (part) =>
        !SAFE_PATH_PART.test(part) ||
        UNSAFE_PATH_PARTS.has(part),
    )
  ) {
    return undefined;
  }

  let current: unknown = root;
  for (const part of parts) {
    if (
      (typeof current !== 'object' && typeof current !== 'function') ||
      current === null ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

type StructuredScalarValue = string | boolean | number;

function scalarValue(value: unknown): StructuredScalarValue | undefined {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function scalarText(value: unknown): string | undefined {
  const scalar = scalarValue(value);
  return scalar === undefined ? undefined : String(scalar);
}

function selectedActionPayload(
  configured: unknown,
  root: unknown,
): SurfaceWidgetActionInput | undefined {
  if (configured === undefined) return undefined;
  const mapping = record(configured);
  if (!mapping) return undefined;
  const selected: Record<string, unknown> = {};
  for (const [name, candidate] of Object.entries(mapping)) {
    if (!safeId(name)) return undefined;
    const selector = record(candidate);
    if (!selector || typeof selector.path !== 'string') return undefined;
    const value = selector.path === ''
      ? root
      : readStructuredPanelPath(root, selector.path);
    if (value === undefined) return undefined;
    selected[name] = value;
  }
  const admission = admitSurfaceWidgetActionInput(selected);
  return admission.accepted ? admission.input : undefined;
}

function resolvedAction(
  outputName: string | undefined,
  available: readonly SurfaceWidgetAction[],
): SurfaceWidgetAction | undefined {
  if (!outputName) return undefined;
  const matches = available.filter((action) => action.outputName === outputName);
  return matches.length === 1 ? matches[0] : undefined;
}

interface StructuredActionButtonProps {
  action: SurfaceWidgetAction;
  label: string;
  emphasis: 'primary' | 'secondary' | 'danger';
  anchors: readonly string[];
  input?: SurfaceWidgetActionInput | undefined;
  emitAction: SurfaceWidgetProps['emitAction'];
  rowAction?: boolean | undefined;
  pendingLabel?: string | undefined;
  successMessage?: string | undefined;
  failureMessage?: string | undefined;
  confirmation?: Readonly<{
    heading: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    anchors: readonly string[];
  }> | undefined;
}

function StructuredActionButton({
  action,
  label,
  emphasis,
  anchors,
  input,
  emitAction,
  rowAction,
  pendingLabel,
  successMessage,
  failureMessage,
  confirmation,
}: StructuredActionButtonProps): ReactNode {
  const confirmationHeadingId = useId();
  const actionButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const restoreActionFocus = useRef(false);
  const [status, setStatus] = useState<
    'idle' | 'confirming' | 'pending' | 'completed' | 'failed'
  >('idle');
  useEffect(() => {
    if (status === 'confirming') {
      confirmButton.current?.focus();
      return;
    }
    if (status === 'idle' && restoreActionFocus.current) {
      restoreActionFocus.current = false;
      actionButton.current?.focus();
    }
  }, [status]);
  const visibleLabel =
    status === 'pending'
      ? pendingLabel ?? label
      : status === 'completed'
        ? successMessage ?? label
        : status === 'failed'
          ? failureMessage ?? label
          : label;
  const invoke = () => {
    const emission = input === undefined
      ? emitAction(action.outputName)
      : emitAction(action.outputName, input);
    if (!emission) return;
    setStatus('pending');
    void emission.completion.then((feedback) => {
      setStatus(
        feedback.status === 'completed'
          ? 'completed'
          : feedback.status === 'obsolete'
            ? 'idle'
            : 'failed',
      );
    }).catch(() => setStatus('failed'));
  };

  if (status === 'confirming' && confirmation) {
    return (
      <div
        className="fs-structured-panel__confirmation"
        role="group"
        aria-labelledby={confirmationHeadingId}
        data-action-confirmation=""
        {...traceAttributes(confirmation.anchors)}
      >
        <strong id={confirmationHeadingId}>{confirmation.heading}</strong>
        <p>{confirmation.body}</p>
        <div className="fs-structured-panel__confirmation-actions">
          <button
            ref={confirmButton}
            className="fs-structured-panel__action"
            type="button"
            data-emphasis="danger"
            onClick={invoke}
            {...traceAttributes(confirmation.anchors)}
          >
            {confirmation.confirmLabel}
          </button>
          <button
            className="fs-structured-panel__action"
            type="button"
            data-emphasis="secondary"
            onClick={() => {
              restoreActionFocus.current = true;
              setStatus('idle');
            }}
            {...traceAttributes(confirmation.anchors)}
          >
            {confirmation.cancelLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      ref={actionButton}
      className="fs-structured-panel__action"
      type="button"
      data-row-action={rowAction ? '' : undefined}
      data-action-output={action.outputName}
      data-action-ref={action.actionRef}
      data-action-intent={action.intent}
      data-action-status={status}
      data-emphasis={emphasis}
      aria-busy={status === 'pending' ? 'true' : undefined}
      disabled={status === 'pending'}
      onClick={() => {
        if (confirmation) {
          setStatus('confirming');
          return;
        }
        invoke();
      }}
      {...traceAttributes(anchors)}
    >
      {visibleLabel}
    </button>
  );
}

function blockFrame(
  block: UnknownRecord,
  headingLevel: SurfaceWidgetProps['headingLevel'],
  content: (anchors: readonly string[]) => ReactNode,
): ReactNode {
  const id = safeId(block.id);
  if (!id) return null;
  const anchors = needAnchors(block);
  if (anchors.length === 0) return null;
  const title = nonEmptyString(block.title);
  const renderedContent = content(anchors);
  if (renderedContent === null || renderedContent === undefined) return null;
  return (
    <section
      className="fs-structured-panel__block"
      data-block-id={id}
      data-block-type={nonEmptyString(block.type)}
      key={id}
      {...traceAttributes(anchors)}
    >
      {title ? (
        <Heading level={headingLevel} className="fs-structured-panel__block-title">
          {title}
        </Heading>
      ) : null}
      {renderedContent}
    </section>
  );
}

function blockEmpty(block: UnknownRecord, anchors: readonly string[]): ReactNode {
  const message = nonEmptyString(block.emptyMessage);
  return message ? (
    <WidgetEmptyState>
      <span {...traceAttributes(anchors)}>{message}</span>
    </WidgetEmptyState>
  ) : null;
}

function renderMetric(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  headingLevel: SurfaceWidgetProps['headingLevel'],
): ReactNode {
  return blockFrame(block, headingLevel, (anchors) => {
    const value = scalarText(readStructuredPanelPath(data, block.path));
    if (value === undefined) return blockEmpty(block, anchors);
    const label = nonEmptyString(block.label);
    const prefix = typeof block.prefix === 'string' ? block.prefix : '';
    const suffix = typeof block.suffix === 'string' ? block.suffix : '';
    return (
      <div className="fs-structured-panel__metric" {...traceAttributes(anchors)}>
        {label ? <span className="fs-structured-panel__metric-label">{label}</span> : null}
        <strong className="fs-structured-panel__metric-value">
          {prefix}{value}{suffix}
        </strong>
      </div>
    );
  });
}

interface RenderedKeyValueItem {
  id: string;
  label: string;
  value: string;
  semanticValue: StructuredScalarValue;
  anchors: readonly string[];
}

function valueForFact(
  item: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  routeParams: Readonly<Record<string, string>>,
): Readonly<{
  value: string;
  semanticValue: StructuredScalarValue;
}> | undefined {
  const path = nonEmptyString(item.path);
  const routeParam = nonEmptyString(item.routeParam);
  if ((path === undefined) === (routeParam === undefined)) return undefined;
  const semanticValue = scalarValue(
    path
      ? readStructuredPanelPath(data, path)
      : readStructuredPanelPath(routeParams, routeParam),
  );
  return semanticValue === undefined
    ? undefined
    : { value: String(semanticValue), semanticValue };
}

function renderedKeyValueItems(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  routeParams: Readonly<Record<string, string>>,
): RenderedKeyValueItem[] {
  if (!Array.isArray(block.items)) return [];
  return block.items.flatMap((candidate) => {
    const item = record(candidate);
    const id = safeId(item?.id);
    const label = nonEmptyString(item?.label);
    const anchors = item ? needAnchors(item) : [];
    if (!item || !id || !label || anchors.length === 0) return [];
    const value = valueForFact(item, data, routeParams);
    return value === undefined
      ? []
      : [{ id, label, ...value, anchors }];
  });
}

function renderKeyValue(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  routeParams: Readonly<Record<string, string>>,
  headingLevel: SurfaceWidgetProps['headingLevel'],
): ReactNode {
  return blockFrame(block, headingLevel, (anchors) => {
    const items = renderedKeyValueItems(block, data, routeParams);
    if (items.length === 0) return blockEmpty(block, anchors);
    return (
      <dl className="fs-structured-panel__facts">
        {items.map((item) => (
          <div
            className="fs-structured-panel__fact"
            data-field-id={item.id}
            key={item.id}
            {...traceAttributes(item.anchors)}
          >
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    );
  });
}

function renderList(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  headingLevel: SurfaceWidgetProps['headingLevel'],
): ReactNode {
  return blockFrame(block, headingLevel, (anchors) => {
    const value = readStructuredPanelPath(data, block.path);
    const itemPath = nonEmptyString(block.itemPath);
    const items = Array.isArray(value)
      ? value.flatMap((item) => {
          const display = scalarText(
            itemPath ? readStructuredPanelPath(item, itemPath) : item,
          );
          return display === undefined ? [] : [display];
        })
      : [];
    if (items.length === 0) return blockEmpty(block, anchors);
    const List = block.ordered === true ? 'ol' : 'ul';
    return (
      <List className="fs-structured-panel__list">
        {items.map((item, index) => (
          <li key={`${index}:${item}`} {...traceAttributes(anchors)}>{item}</li>
        ))}
      </List>
    );
  });
}

interface RenderedTableColumn {
  id: string;
  label: string;
  path: string;
  numeric: boolean;
  anchors: readonly string[];
}

function renderedTableRows(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
): UnknownRecord[] {
  const rawRows = readStructuredPanelPath(data, block.path);
  return Array.isArray(rawRows)
    ? rawRows.filter((row): row is UnknownRecord => record(row) !== undefined)
    : [];
}

function renderedTableColumns(block: UnknownRecord): RenderedTableColumn[] {
  if (!Array.isArray(block.columns)) return [];
  return block.columns.flatMap((candidate) => {
    const column = record(candidate);
    const id = safeId(column?.id);
    const label = nonEmptyString(column?.label);
    const path = nonEmptyString(column?.path);
    const anchors = column ? needAnchors(column) : [];
    if (!column || !id || !label || !path || anchors.length === 0) return [];
    return [{
      id,
      label,
      path,
      numeric: column.numeric === true,
      anchors,
    }];
  });
}

function renderTable(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  headingLevel: SurfaceWidgetProps['headingLevel'],
  availableActions: readonly SurfaceWidgetAction[],
  emitAction: SurfaceWidgetProps['emitAction'],
): ReactNode {
  return blockFrame(block, headingLevel, (anchors) => {
    const rows = renderedTableRows(block, data);
    const columns = renderedTableColumns(block);
    if (rows.length === 0 || columns.length === 0) return blockEmpty(block, anchors);
    const caption = nonEmptyString(block.caption);
    const responsiveMode = block.responsiveMode === 'scroll' ? 'scroll' : 'stack';
    const rowActionConfig = record(block.rowAction);
    const rowActionAnchors = rowActionConfig ? needAnchors(rowActionConfig) : [];
    const rowAction = rowActionAnchors.length > 0
      ? resolvedAction(nonEmptyString(rowActionConfig?.outputName), availableActions)
      : undefined;
    const rowActionLabel = rowAction ? literalActionLabel(rowAction) : undefined;
    const rowActionColumnLabel = nonEmptyString(rowActionConfig?.columnLabel);
    const rowActionEmphasis =
      rowActionConfig?.emphasis === 'primary' ||
      rowActionConfig?.emphasis === 'danger'
        ? rowActionConfig.emphasis
        : 'secondary';
    const confirmationDeclared = rowActionConfig?.confirmation !== undefined;
    const admittedConfirmation = admittedActionConfirmation(
      rowActionConfig?.confirmation,
    );
    // A declared confirmation that cannot render withholds the action rather
    // than degrading it into a one-click destructive control.
    const rendersRowAction =
      rowAction !== undefined &&
      rowActionLabel !== undefined &&
      rowActionColumnLabel !== undefined &&
      (!confirmationDeclared || admittedConfirmation !== undefined);
    return (
      <div
        className="fs-structured-panel__table-scroll"
        data-responsive-mode={responsiveMode}
        role="region"
        tabIndex={0}
        aria-label={caption ?? nonEmptyString(block.title) ?? safeId(block.id)}
      >
        <table className="fs-structured-panel__table">
          {caption ? <caption>{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  data-column-id={column.id}
                  data-numeric={column.numeric ? 'true' : undefined}
                  {...traceAttributes(column.anchors)}
                >
                  {column.label}
                </th>
              ))}
              {rendersRowAction ? (
                <th
                  scope="col"
                  data-column-id="action"
                  {...traceAttributes(mergeAnchors(
                    rowActionAnchors,
                    rowAction.needAnchors ?? [],
                  ))}
                >
                  {rowActionColumnLabel}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    data-column-id={column.id}
                    data-column-label={column.label}
                    data-numeric={column.numeric ? 'true' : undefined}
                    {...traceAttributes(column.anchors)}
                  >
                    {scalarText(readStructuredPanelPath(row, column.path)) ?? ''}
                  </td>
                ))}
                {rendersRowAction ? (
                  <td
                    data-column-id="action"
                    data-column-label={rowActionColumnLabel}
                    {...traceAttributes(mergeAnchors(
                      rowActionAnchors,
                      rowAction.needAnchors ?? [],
                    ))}
                  >
                    {rowActionConfig?.payload !== undefined &&
                    selectedActionPayload(rowActionConfig.payload, row) === undefined
                      ? null
                      : (
                        <StructuredActionButton
                          action={rowAction}
                          label={rowActionLabel}
                          emphasis={rowActionEmphasis}
                          anchors={mergeAnchors(
                            rowActionAnchors,
                            rowAction.needAnchors ?? [],
                          )}
                          input={selectedActionPayload(rowActionConfig?.payload, row)}
                          emitAction={emitAction}
                          rowAction
                          pendingLabel={nonEmptyString(rowActionConfig?.pendingLabel)}
                          successMessage={nonEmptyString(rowActionConfig?.successMessage)}
                          failureMessage={nonEmptyString(rowActionConfig?.failureMessage)}
                          confirmation={admittedConfirmation}
                        />
                      )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  });
}

function renderProgress(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  headingLevel: SurfaceWidgetProps['headingLevel'],
): ReactNode {
  return blockFrame(block, headingLevel, (anchors) => {
    const value = readStructuredPanelPath(data, block.path);
    const dynamicMax = nonEmptyString(block.maxPath)
      ? readStructuredPanelPath(data, block.maxPath)
      : undefined;
    const max =
      typeof dynamicMax === 'number' &&
      Number.isFinite(dynamicMax) &&
      dynamicMax > 0
        ? dynamicMax
        : typeof block.max === 'number' &&
            Number.isFinite(block.max) &&
            block.max > 0
          ? block.max
          : 100;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return blockEmpty(block, anchors);
    }
    const label = nonEmptyString(block.label);
    const suffix = typeof block.suffix === 'string' ? block.suffix : '';
    return (
      <div className="fs-structured-panel__progress" {...traceAttributes(anchors)}>
        {label ? <span>{label}</span> : null}
        <progress value={Math.min(Math.max(value, 0), max)} max={max} />
        <strong>{value}{suffix}</strong>
      </div>
    );
  });
}

function renderBlock(
  candidate: unknown,
  data: Readonly<Record<string, unknown>>,
  routeParams: Readonly<Record<string, string>>,
  headingLevel: SurfaceWidgetProps['headingLevel'],
  availableActions: readonly SurfaceWidgetAction[],
  emitAction: SurfaceWidgetProps['emitAction'],
): ReactNode {
  const block = record(candidate);
  if (!block) return null;
  switch (block.type) {
    case 'metric':
      return renderMetric(block, data, headingLevel);
    case 'key-value':
      return renderKeyValue(block, data, routeParams, headingLevel);
    case 'list':
      return renderList(block, data, headingLevel);
    case 'table':
      return renderTable(
        block,
        data,
        headingLevel,
        availableActions,
        emitAction,
      );
    case 'progress':
      return renderProgress(block, data, headingLevel);
    default:
      return null;
  }
}

function literalActionLabel(action: SurfaceWidgetAction): string | undefined {
  return action.label && 'literal' in action.label
    ? nonEmptyString(action.label.literal)
    : undefined;
}

interface RenderedActionPresentation {
  action: SurfaceWidgetAction;
  label: string;
  anchors: readonly string[];
  authoredOrder: number;
  index: number;
  emphasis: 'primary' | 'secondary' | 'danger';
  input: SurfaceWidgetActionInput | undefined;
  pendingLabel: string | undefined;
  successMessage: string | undefined;
  failureMessage: string | undefined;
}

function renderedActionPresentations(
  configured: unknown,
  available: readonly SurfaceWidgetAction[],
  data: Readonly<Record<string, unknown>>,
): RenderedActionPresentation[] {
  if (!Array.isArray(configured)) return [];
  const presentations = configured.flatMap((candidate, index) => {
    const presentation = record(candidate);
    const outputName = nonEmptyString(presentation?.outputName);
    const anchors = presentation ? needAnchors(presentation) : [];
    if (!presentation || !outputName || anchors.length === 0) return [];
    const action = resolvedAction(outputName, available);
    const label = action ? literalActionLabel(action) : undefined;
    if (!action || !label) return [];
    const authoredOrder =
      typeof presentation.order === 'number' && Number.isFinite(presentation.order)
        ? presentation.order
        : index;
    const emphasis: 'primary' | 'secondary' | 'danger' =
      presentation.emphasis === 'primary' ||
      presentation.emphasis === 'secondary' ||
      presentation.emphasis === 'danger'
        ? presentation.emphasis
        : 'secondary';
    const input = selectedActionPayload(presentation.payload, data);
    if (presentation.payload !== undefined && input === undefined) return [];
    return [{
      action,
      label,
      anchors: mergeAnchors(anchors, action.needAnchors ?? []),
      authoredOrder,
      index,
      emphasis,
      input,
      pendingLabel: nonEmptyString(presentation.pendingLabel),
      successMessage: nonEmptyString(presentation.successMessage),
      failureMessage: nonEmptyString(presentation.failureMessage),
    }];
  });
  presentations.sort(
    (left, right) => left.authoredOrder - right.authoredOrder || left.index - right.index,
  );
  return presentations;
}

function renderActions(
  presentations: readonly RenderedActionPresentation[],
  emitAction: SurfaceWidgetProps['emitAction'],
): ReactNode {
  if (presentations.length === 0) return null;
  return (
    <div className="fs-structured-panel__actions">
      {presentations.map(({
        action,
        label,
        anchors,
        emphasis,
        input,
        pendingLabel,
        successMessage,
        failureMessage,
      }) => {
        return (
          <StructuredActionButton
            key={action.outputName}
            action={action}
            label={label}
            emphasis={emphasis}
            anchors={anchors}
            input={input}
            emitAction={emitAction}
            pendingLabel={pendingLabel}
            successMessage={successMessage}
            failureMessage={failureMessage}
          />
        );
      })}
    </div>
  );
}

interface RenderedBlockEntry {
  block: UnknownRecord;
  id: string;
  node: ReactNode;
}

function semanticDeclaration(
  segments: readonly string[],
  details: Readonly<{
    operable?: boolean | undefined;
    semanticValue?: SurfaceSemanticValue | undefined;
  }> = {},
): SurfaceSemanticOutputDeclaration | undefined {
  const subjectRef = surfaceSemanticOutputSubjectRef(...segments);
  if (!subjectRef) return undefined;
  return {
    subjectRef,
    ...(details.operable === undefined ? {} : { operable: details.operable }),
    ...(details.semanticValue === undefined
      ? {}
      : { semanticValue: details.semanticValue }),
  };
}

function structuredBlockSemanticOutputs(
  entry: RenderedBlockEntry,
  baseSegments: readonly string[],
  data: Readonly<Record<string, unknown>>,
  routeParams: Readonly<Record<string, string>>,
  actions: readonly SurfaceWidgetAction[],
): SurfaceSemanticOutputDeclaration[] {
  const { block, id } = entry;
  const blockSegments = [...baseSegments, id];
  const outputs: SurfaceSemanticOutputDeclaration[] = [];
  const blockOutput = semanticDeclaration(blockSegments);
  if (blockOutput) outputs.push(blockOutput);

  if (block.type === 'key-value') {
    for (const item of renderedKeyValueItems(block, data, routeParams)) {
      const output = semanticDeclaration(
        [...blockSegments, item.id],
        { semanticValue: item.semanticValue },
      );
      if (output) outputs.push(output);
    }
  }

  if (block.type === 'table') {
    const rows = renderedTableRows(block, data);
    const columns = renderedTableColumns(block);
    if (rows.length === 0 || columns.length === 0) return outputs;
    for (const column of columns) {
      const output = semanticDeclaration([...blockSegments, column.id]);
      if (output) outputs.push(output);
    }

    const rowActionConfig = record(block.rowAction);
    const rowAction =
      rowActionConfig
      && needAnchors(rowActionConfig).length > 0
        ? resolvedAction(
            nonEmptyString(rowActionConfig.outputName),
            actions,
          )
        : undefined;
    if (
      rowAction
      && literalActionLabel(rowAction)
      && nonEmptyString(rowActionConfig?.columnLabel)
    ) {
      const output = semanticDeclaration(
        [...blockSegments, rowAction.outputName],
        {
          semanticValue: {
            outputName: rowAction.outputName,
            actionRef: rowAction.actionRef,
            intent: rowAction.intent,
          },
        },
      );
      if (output) outputs.push(output);
    }
  }

  return outputs;
}

function omitDuplicateSemanticSubjects(
  outputs: readonly SurfaceSemanticOutputDeclaration[],
): SurfaceSemanticOutputDeclaration[] {
  const counts = new Map<string, number>();
  for (const output of outputs) {
    counts.set(output.subjectRef, (counts.get(output.subjectRef) ?? 0) + 1);
  }
  return outputs.filter((output) => counts.get(output.subjectRef) === 1);
}

export function StructuredPanel({
  actions = [],
  config,
  data,
  emitAction,
  headingLevel,
  route,
  slot,
  semanticOutputScope,
}: SurfaceWidgetProps) {
  const panel = record(config) ?? {};
  const panelAnchors = needAnchors(panel);
  const configuredBlocks = Array.isArray(panel.blocks) ? panel.blocks : [];
  const blockAnchors = configuredBlocks.flatMap(needAnchors);
  const configuredActions = Array.isArray(panel.actions) ? panel.actions : [];
  const actionAnchors = configuredActions.flatMap(needAnchors);
  const allAnchors = mergeAnchors(panelAnchors, blockAnchors, actionAnchors);
  const authoredPanelId = safeId(panel.id);
  const panelId = authoredPanelId ?? slot.id;

  const eyebrow = panelAnchors.length > 0 ? nonEmptyString(panel.eyebrow) : undefined;
  const state = panelAnchors.length > 0 ? nonEmptyString(panel.state) : undefined;
  const title = panelAnchors.length > 0 ? nonEmptyString(panel.title) : undefined;
  const body = panelAnchors.length > 0 ? nonEmptyString(panel.body) : undefined;
  const header = eyebrow || state || title || body;
  const blockHeadingLevel = title ? nextLevel(headingLevel) : headingLevel;
  const renderedBlockEntries = configuredBlocks.flatMap((candidate) => {
    const block = record(candidate);
    const id = safeId(block?.id);
    if (!block || !id) return [];
    const node = renderBlock(
        block,
        data,
        route.params,
        blockHeadingLevel,
        actions,
        emitAction,
      );
    return node === null || node === undefined
      ? []
      : [{ block, id, node }];
  });
  const renderedBlocks = renderedBlockEntries.map((entry) => entry.node);
  const actionPresentations = renderedActionPresentations(
    configuredActions,
    actions,
    data,
  );
  const renderedActions = renderActions(actionPresentations, emitAction);
  const emptyMessage =
    panelAnchors.length > 0
      ? nonEmptyString(panel.emptyMessage)
      : undefined;
  const panelRenders =
    Boolean(header)
    || renderedBlocks.length > 0
    || actionPresentations.length > 0
    || emptyMessage !== undefined;

  const baseSegments =
    panelRenders && authoredPanelId
      ? [route.routeId, slot.id, authoredPanelId]
      : undefined;
  const semanticOutputs: SurfaceSemanticOutputDeclaration[] = [];
  if (baseSegments) {
    const panelOutput = semanticDeclaration(baseSegments);
    if (panelOutput) semanticOutputs.push(panelOutput);
    for (const entry of renderedBlockEntries) {
      semanticOutputs.push(...structuredBlockSemanticOutputs(
        entry,
        baseSegments,
        data,
        route.params,
        actions,
      ));
    }
    for (const presentation of actionPresentations) {
      const output = semanticDeclaration(
        [...baseSegments, presentation.action.outputName],
        {
          semanticValue: {
            outputName: presentation.action.outputName,
            actionRef: presentation.action.actionRef,
            intent: presentation.action.intent,
          },
        },
      );
      if (output) semanticOutputs.push(output);
    }
  }
  useSurfaceSemanticOutputs(
    semanticOutputScope,
    omitDuplicateSemanticSubjects(semanticOutputs),
  );

  if (!header && renderedBlocks.length === 0 && !renderedActions) {
    if (!emptyMessage) return null;
    return (
      <div
        className="fs-structured-panel"
        data-widget="structured-panel"
        data-panel-id={panelId}
        data-trace-state="present"
        {...traceAttributes(allAnchors)}
      >
        <WidgetEmptyState>
          {emptyMessage}
        </WidgetEmptyState>
      </div>
    );
  }

  return (
    <article
      className="fs-structured-panel"
      data-widget="structured-panel"
      data-panel-id={panelId}
      data-trace-state="present"
      {...traceAttributes(allAnchors)}
    >
      {header ? (
        <header className="fs-structured-panel__header" {...traceAttributes(panelAnchors)}>
          <div className="fs-structured-panel__meta">
            {eyebrow ? <span data-panel-field="eyebrow">{eyebrow}</span> : null}
            {state ? <span data-panel-field="state">{state}</span> : null}
          </div>
          {title ? (
            <Heading level={headingLevel} className="fs-structured-panel__title">
              {title}
            </Heading>
          ) : null}
          {body ? <p className="fs-structured-panel__body">{body}</p> : null}
        </header>
      ) : null}
      {renderedBlocks.length > 0 ? (
        <div className="fs-structured-panel__blocks">{renderedBlocks}</div>
      ) : null}
      {renderedActions}
    </article>
  );
}
