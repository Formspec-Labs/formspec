/**
 * @filedesc `QueueTable` — the operator's work list.
 *
 * A queue table is the most obvious candidate for a first-party widget: every
 * operator surface in every tenant needs one. It is also the widget the platform
 * was furthest from having, because a table is nothing without rows. Surface
 * 0.2 now supplies them only through Registry-declared named Data Sources
 * inputs; configuration remains a separate channel.
 *
 * So the contract is narrow and honest: **it renders whatever rows it is given.**
 * Columns come from `binding.config` when the author declared them, and from the
 * rows' own keys when they did not. No rows means an empty state that says the
 * queue is empty — not four plausible applications with invented rents and
 * invented waiting times, which is what the surface-render-v10 spike drew and
 * recorded as its most convincing lie.
 *
 * Accessibility is not optional in an operator tool that people use all day: a
 * real `<caption>`, `scope` on every header, a row header per row, and a scroll
 * container that is focusable and labelled so the table can be reached by
 * keyboard when it overflows.
 */
import { useState } from 'react';
import { generationNeedAnchors } from '@formspec-org/surface';
import { needTraceAttributes } from '../need-trace.js';
import { admitSurfaceWidgetActionInput } from '../widget-action-runtime.js';
import { WidgetEmptyState } from './empty-state.js';
import type {
  SurfaceWidgetAction,
  SurfaceWidgetActionInput,
  SurfaceWidgetProps,
} from '../widget-api.js';

export interface QueueColumn {
  /** Key into each row object. */
  key: string;
  label: string;
  /** Right-align numeric columns. */
  numeric?: boolean;
}

export type QueueRow = Readonly<Record<string, unknown>>;

export interface QueueTableActionPayloadSelector {
  /** Dot-separated safe path relative to the row. An empty path selects the row. */
  path: string;
}

export type QueueTableActionPayloadConfig = Readonly<
  Record<string, QueueTableActionPayloadSelector>
>;

export interface QueueTableRowActionConfig {
  outputName: string;
  /** Visible column heading for the action controls. */
  columnLabel: string;
  /** Flat named selectors evaluated relative to the selected row. */
  payload?: QueueTableActionPayloadConfig;
  emphasis?: 'primary' | 'secondary' | 'danger';
  pendingLabel?: string;
  successMessage?: string;
  failureMessage?: string;
  'x-generation'?: {
    anchors?: readonly string[];
  };
}

export interface QueueTableConfig {
  columns?: readonly QueueColumn[];
  caption?: string;
  /** Stable row identity. This may differ from the human-readable row header. */
  rowKey?: string;
  /** Which column identifies the row. Defaults to the first column. */
  rowHeaderKey?: string;
  /** Sentence shown when there are no rows. */
  emptyMessage?: string;
  /** One generic action control rendered for each row. */
  rowAction?: QueueTableRowActionConfig;
}

export interface QueueTableData {
  rows?: readonly QueueRow[];
}

function readColumns(config: Readonly<Record<string, unknown>>): QueueColumn[] {
  if (!Array.isArray(config.columns)) return [];
  return config.columns.flatMap((entry): QueueColumn[] => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.key !== 'string' || row.key === '') return [];
    const label = typeof row.label === 'string' ? row.label : row.key;
    return row.numeric === true
      ? [{ key: row.key, label, numeric: true }]
      : [{ key: row.key, label }];
  });
}

/** Column set derived from the rows themselves, in first-seen key order. */
function inferColumns(rows: readonly QueueRow[]): QueueColumn[] {
  const keys: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  }
  return keys.map((key) => ({ key, label: key }));
}

function readRows(data: unknown): QueueRow[] {
  if (Array.isArray(data)) return data.filter((row): row is QueueRow => typeof row === 'object' && row !== null);
  if (typeof data === 'object' && data !== null && Array.isArray((data as QueueTableData).rows)) {
    return ((data as QueueTableData).rows ?? []).filter(
      (row): row is QueueRow => typeof row === 'object' && row !== null,
    );
  }
  return [];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const SAFE_PATH_PART = /^[a-zA-Z0-9_-]+$/;
const SAFE_PAYLOAD_NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRowPath(row: QueueRow, path: string): unknown {
  if (path === '') return row;
  const parts = path.split('.');
  if (
    parts.some(
      (part) => !SAFE_PATH_PART.test(part) || UNSAFE_PATH_PARTS.has(part),
    )
  ) {
    return undefined;
  }

  let current: unknown = row;
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

type SelectedRowActionInput =
  | { accepted: true; input?: SurfaceWidgetActionInput | undefined }
  | { accepted: false };

function selectedRowActionInput(
  configured: unknown,
  row: QueueRow,
): SelectedRowActionInput {
  if (configured === undefined) return { accepted: true };
  const selectors = record(configured);
  if (!selectors) return { accepted: false };

  const selected: Record<string, unknown> = {};
  for (const [name, candidate] of Object.entries(selectors)) {
    const selector = record(candidate);
    if (!SAFE_PAYLOAD_NAME.test(name) || !selector) return { accepted: false };
    const path = selector.path;
    if (typeof path !== 'string') return { accepted: false };
    const value = readRowPath(row, path);
    if (value === undefined) return { accepted: false };
    selected[name] = value;
  }

  const admission = admitSurfaceWidgetActionInput(selected);
  return admission.accepted
    ? { accepted: true, input: admission.input }
    : { accepted: false };
}

function resolvedRowAction(
  configured: UnknownRecord | undefined,
  available: readonly SurfaceWidgetAction[],
): SurfaceWidgetAction | undefined {
  const outputName = nonEmptyString(configured?.outputName);
  if (!outputName) return undefined;
  const matches = available.filter((action) => action.outputName === outputName);
  return matches.length === 1 ? matches[0] : undefined;
}

function literalActionLabel(action: SurfaceWidgetAction): string | undefined {
  const label = action.label;
  return label && 'literal' in label ? nonEmptyString(label.literal) : undefined;
}

interface QueueRowActionButtonProps {
  action: SurfaceWidgetAction;
  rowLabel?: string | undefined;
  input?: SurfaceWidgetActionInput | undefined;
  emphasis: 'primary' | 'secondary' | 'danger';
  pendingLabel?: string | undefined;
  successMessage?: string | undefined;
  failureMessage?: string | undefined;
  anchors: readonly string[];
  emitAction: SurfaceWidgetProps['emitAction'];
}

function QueueRowActionButton({
  action,
  rowLabel,
  input,
  emphasis,
  pendingLabel,
  successMessage,
  failureMessage,
  anchors,
  emitAction,
}: QueueRowActionButtonProps) {
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'completed' | 'failed'
  >('idle');
  const label = literalActionLabel(action)!;
  const visibleLabel =
    status === 'pending'
      ? pendingLabel ?? label
      : status === 'completed'
        ? successMessage ?? label
        : status === 'failed'
          ? failureMessage ?? label
          : label;

  return (
    <button
      className="fs-surface-queue__action"
      type="button"
      data-row-action=""
      data-action-output={action.outputName}
      data-action-ref={action.actionRef}
      data-action-intent={action.intent}
      data-action-status={status}
      data-emphasis={emphasis}
      aria-label={rowLabel ? `${label}: ${rowLabel}` : label}
      aria-busy={status === 'pending' ? 'true' : undefined}
      disabled={status === 'pending'}
      onClick={() => {
        const emission = input === undefined
          ? emitAction(action.outputName)
          : emitAction(action.outputName, input);
        if (!emission) return;
        setStatus('pending');
        void emission.completion
          .then((feedback) => {
            setStatus(
              feedback.status === 'completed'
                ? 'completed'
                : feedback.status === 'obsolete'
                  ? 'idle'
                  : 'failed',
            );
          })
          .catch(() => setStatus('failed'));
      }}
      {...needTraceAttributes(anchors, action.needAnchors)}
    >
      <span aria-live="polite">{visibleLabel}</span>
    </button>
  );
}

export function QueueTable({
  config,
  data,
  slot,
  actions = [],
  emitAction,
}: SurfaceWidgetProps) {
  const rows = readRows(data);
  const declared = readColumns(config);
  const columns = declared.length > 0 ? declared : inferColumns(rows);
  const caption = typeof config.caption === 'string' ? config.caption : undefined;
  const emptyMessage =
    typeof config.emptyMessage === 'string'
      ? config.emptyMessage
      : 'Nothing is waiting. When applications arrive, they appear here.';
  const rowHeaderKey =
    typeof config.rowHeaderKey === 'string' ? config.rowHeaderKey : columns[0]?.key;
  const rowKey = typeof config.rowKey === 'string' ? config.rowKey : undefined;
  const rowActionConfig = record(config.rowAction);
  const rowActionAnchors = generationNeedAnchors(rowActionConfig);
  const rowAction = rowActionAnchors.length > 0
    ? resolvedRowAction(rowActionConfig, actions)
    : undefined;
  const rowActionLabel = rowAction ? literalActionLabel(rowAction) : undefined;
  const rowActionColumnLabel = nonEmptyString(rowActionConfig?.columnLabel);
  const rowActionEmphasis =
    rowActionConfig?.emphasis === 'primary' ||
    rowActionConfig?.emphasis === 'danger'
      ? rowActionConfig.emphasis
      : 'secondary';
  const rendersRowAction =
    rowAction !== undefined &&
    rowActionLabel !== undefined &&
    rowActionColumnLabel !== undefined;

  return (
    <div className="fs-surface-queue" data-widget="queue-table" data-row-count={rows.length}>
      {rows.length === 0 || columns.length === 0 ? (
        <WidgetEmptyState>{emptyMessage}</WidgetEmptyState>
      ) : (
        <div
          className="fs-surface-queue__scroll"
          // A scrolling region needs to be reachable and named, or a keyboard
          // user cannot scroll it at all.
          tabIndex={0}
          role="region"
          aria-label={caption ?? slot.title ?? 'Queue'}
        >
          <table className="fs-surface-queue__table" data-probe="queue-table">
            {caption && <caption className="fs-surface-queue__caption">{caption}</caption>}
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" data-numeric={column.numeric ? 'true' : undefined}>
                    {column.label}
                  </th>
                ))}
                {rendersRowAction ? (
                  <th
                    scope="col"
                    data-action-column=""
                    {...needTraceAttributes(rowActionAnchors, rowAction.needAnchors)}
                  >
                    {rowActionColumnLabel}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const rowLabel = cellText(
                  rowHeaderKey ? row[rowHeaderKey] : undefined,
                );
                const selectedInput = selectedRowActionInput(
                  rowActionConfig?.payload,
                  row,
                );
                return (
                  <tr
                    key={
                      (rowKey ? cellText(row[rowKey]) : '') ||
                      `row-${index}:${rowLabel}`
                    }
                  >
                    {columns.map((column) =>
                      column.key === rowHeaderKey ? (
                        <th key={column.key} scope="row">
                          {cellText(row[column.key])}
                        </th>
                      ) : (
                        <td key={column.key} data-numeric={column.numeric ? 'true' : undefined}>
                          {cellText(row[column.key])}
                        </td>
                      ),
                    )}
                    {rendersRowAction ? (
                      <td
                        data-action-column=""
                        {...needTraceAttributes(rowActionAnchors, rowAction.needAnchors)}
                      >
                        {selectedInput.accepted ? (
                          <QueueRowActionButton
                            action={rowAction}
                            rowLabel={rowLabel || undefined}
                            input={selectedInput.input}
                            emphasis={rowActionEmphasis}
                            pendingLabel={nonEmptyString(rowActionConfig?.pendingLabel)}
                            successMessage={nonEmptyString(rowActionConfig?.successMessage)}
                            failureMessage={nonEmptyString(rowActionConfig?.failureMessage)}
                            anchors={rowActionAnchors}
                            emitAction={emitAction}
                          />
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
