/**
 * @filedesc `QueueTable` — the operator's work list.
 *
 * A queue table is the most obvious candidate for a first-party widget: every
 * operator surface in every tenant needs one. It is also the widget the platform
 * was furthest from having, because a table is nothing without rows and a
 * `module-widget` binding has no channel to supply them (gap ledger
 * `widget-data-binding`).
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
import { Heading } from '../heading.js';
import { WidgetEmptyState } from './empty-state.js';
import type { SurfaceWidgetProps } from '../widget-api.js';

export interface QueueColumn {
  /** Key into each row object. */
  key: string;
  label: string;
  /** Right-align numeric columns. */
  numeric?: boolean;
}

export type QueueRow = Readonly<Record<string, unknown>>;

export interface QueueTableConfig {
  columns?: readonly QueueColumn[];
  caption?: string;
  /** Which column identifies the row. Defaults to the first column. */
  rowHeaderKey?: string;
  /** Sentence shown when there are no rows. */
  emptyMessage?: string;
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

export function QueueTable({ config, data, headingLevel, slot }: SurfaceWidgetProps) {
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

  return (
    <div className="fs-surface-queue" data-widget="queue-table" data-row-count={rows.length}>
      {slot.title && (
        <Heading level={headingLevel} className="fs-surface-queue__title">
          {slot.title}
        </Heading>
      )}

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
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={cellText(rowHeaderKey ? row[rowHeaderKey] : undefined) || `row-${index}`}>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
