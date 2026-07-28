/**
 * @filedesc `ReceiptPanel` — what a person keeps after they submit.
 *
 * A receipt is the artifact someone shows a landlord, a caseworker, or a court.
 * It is the reason the `proof` route class exists and refuses tenant branding:
 * *nobody can be shown a receipt styled to look more official than it is.*
 *
 * ## Every field here comes from the host, and there is a reason that is not lazy
 *
 * The spike's receipt invented a case reference and a layout, and showed the
 * signature facts it happened to have. What a receipt actually needs — the
 * submitted answers, the case reference, the issued artifact — is runtime state,
 * and a bundle export has `sessions: []` and no response documents (gap ledger
 * `no-runtime-state`). So this widget takes its facts from the host data
 * resolver, renders exactly what it is handed, and says plainly when it is
 * handed nothing. A receipt panel that fabricates a reference number is worse
 * than an empty one: the empty one cannot be mistaken for proof.
 *
 * The route's own parameters are the one exception, and only because the URL is
 * the fact: if the route is `/receipt/{caseRef}`, the reference in the address
 * bar IS the reference, and it is shown as such.
 */
import { Heading } from '../heading.js';
import { WidgetEmptyState } from './empty-state.js';
import type { SurfaceWidgetProps } from '../widget-api.js';

export interface ReceiptFact {
  label: string;
  value: string;
}

export interface ReceiptPanelData {
  /** The reference the person quotes. Falls back to a route parameter. */
  caseRef?: string;
  /** ISO timestamp of the submission, if the host knows one. */
  submittedAt?: string;
  /** Who issued the receipt. */
  issuer?: string;
  /** Anything else worth keeping — one row each. */
  facts?: readonly ReceiptFact[];
}

function readData(data: unknown): ReceiptPanelData {
  if (typeof data !== 'object' || data === null) return {};
  const record = data as Record<string, unknown>;
  const text = (key: string): string | undefined =>
    typeof record[key] === 'string' && record[key] !== '' ? (record[key] as string) : undefined;
  const facts = Array.isArray(record.facts)
    ? record.facts.flatMap((entry): ReceiptFact[] => {
        if (typeof entry !== 'object' || entry === null) return [];
        const row = entry as Record<string, unknown>;
        return typeof row.label === 'string' && typeof row.value === 'string'
          ? [{ label: row.label, value: row.value }]
          : [];
      })
    : [];
  const parsed: ReceiptPanelData = {};
  const caseRef = text('caseRef');
  const submittedAt = text('submittedAt');
  const issuer = text('issuer');
  if (caseRef !== undefined) parsed.caseRef = caseRef;
  if (submittedAt !== undefined) parsed.submittedAt = submittedAt;
  if (issuer !== undefined) parsed.issuer = issuer;
  if (facts.length > 0) parsed.facts = facts;
  return parsed;
}

function formatWhen(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

export function ReceiptPanel({ data, route, headingLevel, slot, config }: SurfaceWidgetProps) {
  const parsed = readData(data);
  // The address bar is a fact about this page, not invented content: a
  // `/receipt/{caseRef}` route IS addressed by the reference.
  const caseRefParamName = typeof config.caseRefParam === 'string' ? config.caseRefParam : 'caseRef';
  const caseRef = parsed.caseRef ?? route.params[caseRefParamName];

  const rows: ReceiptFact[] = [
    ...(caseRef ? [{ label: 'Your reference', value: caseRef }] : []),
    ...(parsed.submittedAt ? [{ label: 'Sent', value: formatWhen(parsed.submittedAt) }] : []),
    ...(parsed.issuer ? [{ label: 'Issued by', value: parsed.issuer }] : []),
    ...(parsed.facts ?? []),
  ];

  return (
    <div className="fs-surface-receipt" data-widget="receipt-panel">
      {slot.title && (
        <Heading level={headingLevel} className="fs-surface-receipt__title">
          {slot.title}
        </Heading>
      )}

      {rows.length === 0 ? (
        <WidgetEmptyState>
          There is no receipt to show. Nothing has been submitted through this release yet.
        </WidgetEmptyState>
      ) : (
        <dl className="fs-surface-receipt__facts" data-probe="receipt-facts">
          {rows.map((row) => (
            <div className="fs-surface-receipt__row" key={`${row.label}:${row.value}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
