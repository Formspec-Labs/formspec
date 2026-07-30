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
import type { ReactNode } from 'react';
import { Heading, nextLevel } from '../heading.js';
import type {
  SurfaceWidgetAction,
  SurfaceWidgetProps,
} from '../widget-api.js';
import { WidgetEmptyState } from './empty-state.js';

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
  columns: readonly StructuredTableColumnConfig[];
}

export interface StructuredProgressBlockConfig extends StructuredBlockBase {
  type: 'progress';
  label?: string;
  path: string;
  max?: number;
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
}

export interface StructuredPanelConfig extends GeneratedFromNeeds {
  id?: string;
  eyebrow?: string;
  state?: string;
  title?: string;
  body?: string;
  emptyMessage?: string;
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

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
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

function valueForFact(
  item: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  routeParams: Readonly<Record<string, string>>,
): string | undefined {
  const path = nonEmptyString(item.path);
  const routeParam = nonEmptyString(item.routeParam);
  if ((path === undefined) === (routeParam === undefined)) return undefined;
  return path
    ? scalarText(readStructuredPanelPath(data, path))
    : scalarText(readStructuredPanelPath(routeParams, routeParam));
}

function renderKeyValue(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  routeParams: Readonly<Record<string, string>>,
  headingLevel: SurfaceWidgetProps['headingLevel'],
): ReactNode {
  return blockFrame(block, headingLevel, (anchors) => {
    const items = Array.isArray(block.items)
      ? block.items.flatMap((candidate) => {
          const item = record(candidate);
          const id = safeId(item?.id);
          const label = nonEmptyString(item?.label);
          const itemAnchors = item ? needAnchors(item) : [];
          if (!item || !id || !label || itemAnchors.length === 0) return [];
          const value = valueForFact(item, data, routeParams);
          return value === undefined
            ? []
            : [{ id, label, value, anchors: itemAnchors }];
        })
      : [];
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

function renderTable(
  block: UnknownRecord,
  data: Readonly<Record<string, unknown>>,
  headingLevel: SurfaceWidgetProps['headingLevel'],
): ReactNode {
  return blockFrame(block, headingLevel, (anchors) => {
    const rawRows = readStructuredPanelPath(data, block.path);
    const rows = Array.isArray(rawRows)
      ? rawRows.filter((row): row is UnknownRecord => record(row) !== undefined)
      : [];
    const columns = Array.isArray(block.columns)
      ? block.columns.flatMap((candidate) => {
          const column = record(candidate);
          const id = safeId(column?.id);
          const label = nonEmptyString(column?.label);
          const path = nonEmptyString(column?.path);
          const columnAnchors = column ? needAnchors(column) : [];
          if (!column || !id || !label || !path || columnAnchors.length === 0) {
            return [];
          }
          return [{
            id,
            label,
            path,
            numeric: column.numeric === true,
            anchors: columnAnchors,
          }];
        })
      : [];
    if (rows.length === 0 || columns.length === 0) return blockEmpty(block, anchors);
    const caption = nonEmptyString(block.caption);
    return (
      <div
        className="fs-structured-panel__table-scroll"
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {columns.map((column) => (
                  <td
                    key={column.id}
                    data-column-id={column.id}
                    data-numeric={column.numeric ? 'true' : undefined}
                    {...traceAttributes(column.anchors)}
                  >
                    {scalarText(readStructuredPanelPath(row, column.path)) ?? ''}
                  </td>
                ))}
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
    const max = typeof block.max === 'number' && Number.isFinite(block.max) && block.max > 0
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
      return renderTable(block, data, headingLevel);
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

function renderActions(
  configured: unknown,
  available: readonly SurfaceWidgetAction[],
  emitAction: SurfaceWidgetProps['emitAction'],
): ReactNode {
  if (!Array.isArray(configured)) return null;
  const presentations = configured.flatMap((candidate, index) => {
    const presentation = record(candidate);
    const outputName = nonEmptyString(presentation?.outputName);
    const anchors = presentation ? needAnchors(presentation) : [];
    if (!presentation || !outputName || anchors.length === 0) return [];
    const matches = available.filter((action) => action.outputName === outputName);
    const action = matches.length === 1 ? matches[0] : undefined;
    const label = action ? literalActionLabel(action) : undefined;
    if (!action || !label) return [];
    const authoredOrder =
      typeof presentation.order === 'number' && Number.isFinite(presentation.order)
        ? presentation.order
        : index;
    const emphasis =
      presentation.emphasis === 'primary' ||
      presentation.emphasis === 'secondary' ||
      presentation.emphasis === 'danger'
        ? presentation.emphasis
        : 'secondary';
    return [{
      action,
      label,
      anchors: mergeAnchors(anchors, action.needAnchors ?? []),
      authoredOrder,
      index,
      emphasis,
    }];
  });
  presentations.sort(
    (left, right) => left.authoredOrder - right.authoredOrder || left.index - right.index,
  );
  if (presentations.length === 0) return null;
  return (
    <div className="fs-structured-panel__actions">
      {presentations.map(({ action, label, anchors, emphasis }) => (
        <button
          className="fs-structured-panel__action"
          type="button"
          data-action-output={action.outputName}
          data-action-ref={action.actionRef}
          data-action-intent={action.intent}
          data-emphasis={emphasis}
          key={action.outputName}
          onClick={() => emitAction(action.outputName)}
          {...traceAttributes(anchors)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function StructuredPanel({
  actions = [],
  config,
  data,
  emitAction,
  headingLevel,
  route,
  slot,
}: SurfaceWidgetProps) {
  const panel = record(config) ?? {};
  const panelAnchors = needAnchors(panel);
  const configuredBlocks = Array.isArray(panel.blocks) ? panel.blocks : [];
  const blockAnchors = configuredBlocks.flatMap(needAnchors);
  const configuredActions = Array.isArray(panel.actions) ? panel.actions : [];
  const actionAnchors = configuredActions.flatMap(needAnchors);
  const allAnchors = mergeAnchors(panelAnchors, blockAnchors, actionAnchors);
  const panelId = safeId(panel.id) ?? slot.id;

  const eyebrow = panelAnchors.length > 0 ? nonEmptyString(panel.eyebrow) : undefined;
  const state = panelAnchors.length > 0 ? nonEmptyString(panel.state) : undefined;
  const title = panelAnchors.length > 0 ? nonEmptyString(panel.title) : undefined;
  const body = panelAnchors.length > 0 ? nonEmptyString(panel.body) : undefined;
  const header = eyebrow || state || title || body;
  const blockHeadingLevel = title ? nextLevel(headingLevel) : headingLevel;
  const renderedBlocks = configuredBlocks
    .map((block) =>
      renderBlock(block, data, route.params, blockHeadingLevel),
    )
    .filter((block) => block !== null);
  const renderedActions = renderActions(
    configuredActions,
    actions,
    emitAction,
  );

  if (!header && renderedBlocks.length === 0 && !renderedActions) {
    const emptyMessage =
      panelAnchors.length > 0
        ? nonEmptyString(panel.emptyMessage)
        : undefined;
    return (
      <div
        className="fs-structured-panel"
        data-widget="structured-panel"
        data-panel-id={panelId}
        data-trace-state={allAnchors.length === 0 ? 'missing' : 'present'}
        {...traceAttributes(allAnchors)}
      >
        <WidgetEmptyState>
          {emptyMessage ?? 'This panel has no traceable content to show.'}
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
