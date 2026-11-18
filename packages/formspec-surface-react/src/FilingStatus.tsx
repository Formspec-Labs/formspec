/** @filedesc Presents an authored filing task list from a batch of draft observations. */
import { useEffect, useId, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import {
  type FilingDraftQuery, type FilingProgressCounts, type FilingStatusObservation, type FilingStatusReader,
  type FilingStatusPlan, type HeadingLevel, type SlotPlan, type SurfaceStringKey, type SurfaceStrings,
} from '@formspec-org/surface';
import { Heading } from './heading.js';
import { isPlainLinkClick } from './browser-location.js';
import { needTraceAttributes } from './need-trace.js';
import { presentedRouteLabel, type SurfaceRouteTitleResolver } from './title-presentation.js';

type Observation = Omit<FilingStatusObservation, 'draft'> & {
  draft: FilingStatusObservation['draft'] | { status: 'loading' };
};
type DraftReads = (query: FilingDraftQuery) => Observation;
const unavailable = { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } } as const;

export interface FilingStatusNavigation {
  navigate: (href: string) => void;
  formatHref?: ((href: string) => string | undefined) | undefined;
  resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
}

export interface FilingStatusOptions extends FilingStatusNavigation {
  readSummaries?: FilingStatusReader | undefined;
  revision?: string | number | undefined;
}

export interface FilingStatusViewContext extends FilingStatusNavigation {
  observe: DraftReads;
}

export function useFilingDraftObservations(
  slots: readonly SlotPlan<unknown>[],
  readSummaries: FilingStatusReader | undefined,
  previewScope: string | undefined,
  revision: string | number | undefined,
  generation: string | undefined,
  draftRevision: number | undefined,
): DraftReads {
  const queries = useMemo(() => {
    const unique = new Map<string, FilingDraftQuery>();
    function visit(plans: readonly SlotPlan<unknown>[]) {
      for (const slot of plans) {
        if (slot.slotType === 'embed-route') visit(slot.slots);
        if (slot.slotType === 'filing-status' && slot.tracker.status === 'ready') {
          for (const group of slot.tracker.groups) {
            for (const row of group.rows) if (row.status === 'ready') unique.set(row.query.key, row.query);
          }
        }
      }
    }
    visit(slots);
    return [...unique.values()];
  }, [slots]);

  const request = useMemo(() => ({ queries, readSummaries, previewScope }),
    [queries, readSummaries, previewScope, revision, generation, draftRevision]);
  const [completed, setCompleted] = useState<{
    request: typeof request;
    observations: ReadonlyMap<string, FilingStatusObservation>;
  }>();

  useEffect(() => {
    if (!request.readSummaries || request.queries.length === 0) return;
    const read = request.readSummaries;
    const controller = new AbortController();
    const result = (observations: ReadonlyMap<string, FilingStatusObservation>) => {
      if (!controller.signal.aborted) setCompleted({ request, observations });
    };
    void Promise.resolve()
      .then(() => controller.signal.aborted ? new Map() : read(request.queries, {
        previewScope: request.previewScope, signal: controller.signal,
      }))
      .then(result, () => result(new Map()));
    return () => controller.abort();
  }, [request]);

  return (query) => {
    if (!readSummaries) return unavailable;
    if (completed?.request !== request) return { ...unavailable, draft: { status: 'loading' } };
    return completed.observations.get(query.key) ?? unavailable;
  };
}

function filingLinkFor(destination: string, navigation: FilingStatusNavigation | undefined) {
  const href = navigation?.formatHref ? navigation.formatHref(destination) : destination;
  return href === undefined ? undefined : { href, destination };
}

function FilingLink({ link, navigation, describedBy, className, style, children, ...anchorProps }: {
  link: ReturnType<typeof filingLinkFor>;
  navigation: FilingStatusNavigation | undefined;
  describedBy?: string;
  children: ReactNode;
} & Pick<ComponentPropsWithoutRef<'a'>, 'className' | 'style' | 'tabIndex' | 'title' | 'onMouseDown'>) {
  if (!link) return <span className={className} style={style} role="link" aria-disabled="true" aria-describedby={describedBy}>{children}</span>;
  return <a {...anchorProps} className={className} style={style} href={link.href} aria-describedby={describedBy} onClick={navigation && (event => {
    if (!isPlainLinkClick(event)) return;
    event.preventDefault();
    navigation.navigate(link.destination);
  })}>{children}</a>;
}

function filingFillCount({ filled, total }: FilingProgressCounts, text: SurfaceStrings) {
  return text('filingFillCount', { filled: String(filled), total: String(total) });
}

function filingFindings(counts: FilingProgressCounts, text: SurfaceStrings) {
  const findings: { kind?: 'fix' | 'check'; label: string }[] = [];
  if (counts.toFix !== null && counts.toFix > 0) {
    findings.push({ kind: 'fix', label: text('filingFixCount', { count: String(counts.toFix) }) });
  }
  if (counts.toCheck !== null && counts.toCheck > 0) {
    findings.push({ kind: 'check', label: text('filingCheckCount', { count: String(counts.toCheck) }) });
  }
  if (counts.toFix === null || counts.toCheck === null) findings.push({ label: text('filingChecksUnavailable') });
  return findings;
}

const observationLabel = {
  loading: 'filingLoading',
  absent: 'filingNotStarted',
  denied: 'filingDenied',
  stale: 'filingStale',
  unavailable: 'filingUnavailable',
} as const;

type Row = Extract<FilingStatusPlan, { status: 'ready' }>['groups'][number]['rows'][number];
const filingLabel = {
  filed: 'filingFiled', returned: 'filingReturned', accepted: 'filingAccepted',
  'closed-without-acceptance': 'filingClosedWithoutAcceptance', reopened: 'filingReopened',
} as const;

const refusalLabel = {
  'route-address-unavailable': 'filingAddressUnavailable',
  'definition-unresolved': 'filingDefinitionUnavailable',
  'slot-unresolved': 'slotUnavailableDefinitionForm',
  'subject-unavailable': 'filingSubjectUnavailable',
  'invalid-binding': 'filingUnavailable',
} as const satisfies Record<Extract<Row, { status: 'disabled' }>['reason'], SurfaceStringKey>;

function sectionFinding(counts: FilingProgressCounts | undefined) {
  if (counts && counts.toFix !== null && counts.toFix > 0) return 'fix';
  if (counts && counts.toCheck !== null && counts.toCheck > 0) return 'check';
  return undefined;
}

function FilingRow({ row, observation, largest, context, text }: {
  row: Row;
  observation: Observation;
  largest: number;
  context?: FilingStatusViewContext | undefined;
  text: SurfaceStrings;
}) {
  const statusId = useId();
  const { draft, filing } = observation;
  const receipt = 'receiptRef' in filing ? filing : undefined;
  const label = row.route ? presentedRouteLabel(row.route, context?.resolveRouteTitle)
    : row.status === 'disabled' && row.routeRef;
  const status = row.status === 'disabled' ? text(refusalLabel[row.reason])
    : draft.status === 'absent' && filing.status === 'none' && row.weight > 0
      ? text('filingNotStartedWithSize', { count: String(row.weight) })
    : draft.status === 'current'
      ? text(draft.form.ready === null ? 'filingReadinessUnavailable' : draft.form.ready ? 'filingReady' : 'filingInProgress')
    : draft.status === 'absent' && filing.status !== 'none' ? text('filingUnavailable')
    : text(observationLabel[draft.status]);
  const sections = row.status === 'ready' ? row.sections.map(section => {
    const counts = draft.status === 'absent' && filing.status === 'none' ? { filled: 0, total: section.weight, toFix: 0, toCheck: 0 }
      : draft.status === 'current' && Object.hasOwn(draft.sections, section.id)
        ? draft.sections[section.id] : undefined;
    const countLabels = counts ? [filingFillCount(counts, text), ...filingFindings(counts, text).map(finding => finding.label)] : [];
    return { ...section, link: filingLinkFor(section.href, context), counts, countLabels };
  }) : [];
  const segments = sections.filter(section => section.weight > 0);
  return <li className="fs-surface-filing__row" {...needTraceAttributes(row.needAnchors)}>
    <div className="fs-surface-filing__form">
      {label && <FilingLink link={row.status === 'ready' ? filingLinkFor(row.href, context) : undefined}
        navigation={context} describedBy={statusId}>{label}</FilingLink>}
      {row.description && <p>{row.description}</p>}
      {row.hint && <p>{row.hint}</p>}
    </div>
    {sections.length > 0 && <div className="fs-surface-filing__section-nav">
      {row.status === 'ready' && segments.length > 0 && <div className="fs-surface-filing__strip" aria-hidden="true"
        style={{ inlineSize: `${100 * Math.max(Math.sqrt(row.weight / largest), 0.08)}%` }}>
        {segments.map(({ id, label, weight, counts, countLabels, link }) => {
          const percent = counts && counts.total > 0 ? Math.min(100, 100 * counts.filled / counts.total) : 0;
          const finding = sectionFinding(counts);
          const title = countLabels.length > 0 ? `${label}: ${countLabels.join(', ')}` : label;
          return <FilingLink key={id} link={link} navigation={context} className="fs-surface-filing__segment"
            style={{ flexGrow: weight }} tabIndex={-1} title={title}
            onMouseDown={event => event.preventDefault()}>
            <span className="fs-surface-filing__fill" style={{ inlineSize: `${percent}%` }} />
            {finding && <span className="fs-surface-filing__mark" data-finding={finding} />}
          </FilingLink>;
        })}
      </div>}
      <details>
        <summary>
          {text('filingSections', { count: String(sections.length) })}
          {label && <span className="fs-surface-visually-hidden"> {label}</span>}
        </summary>
        <ul className="fs-surface-filing__sections" role="list">
          {sections.map(({ id, label, link, countLabels }) => <li key={id}>
            <FilingLink link={link} navigation={context}>
              {label}
              {countLabels.length > 0 && <span className="fs-surface-visually-hidden"> {countLabels.join(' ')}</span>}
            </FilingLink>
          </li>)}
        </ul>
      </details>
    </div>}
    <div className="fs-surface-filing__progress">
      <div id={statusId}>
        {receipt ? text(filingLabel[receipt.status]) : status}
        {receipt && draft.status === 'current' && <div>{status}</div>}
      </div>
      {receipt && <>
        <div>{text('filingReceiptReference', { reference: receipt.receiptRef })}</div>
        {receipt.sample && <div>{text(receipt.sample === 'fixture' ? 'filingFixture' : 'filingPreviewSubmit')}</div>}
        {receipt.review === 'unavailable' && <div>{text('filingReviewUnavailable')}</div>}
        {receipt.comments.map((comment, index) => <p key={index}>{comment}</p>)}
      </>}
      {draft.status === 'current' && <div className="fs-surface-filing__counts">
        <span>{filingFillCount(draft.form, text)}</span>
        {filingFindings(draft.form, text).map(({ kind, label }) => (
          <span key={kind ?? 'unavailable'} className={kind && `fs-surface-filing__${kind}`}>{label}</span>
        ))}
        {sections.some(section => section.counts === undefined) && <span>{text('filingSectionCountsUnavailable')}</span>}
      </div>}
    </div>
  </li>;
}

const legend = [
  { key: 'filingAnswered', filled: true },
  { key: 'filingStillToAnswer' },
  { key: 'filingHasFix', finding: 'fix' },
  { key: 'filingHasCheck', finding: 'check' },
] as const;

export function FilingStatus({ plan, context, level, text }: {
  plan: FilingStatusPlan;
  context?: FilingStatusViewContext | undefined;
  level: HeadingLevel;
  text: SurfaceStrings;
}) {
  if (plan.status === 'unresolved') return <p>{text('filingUnavailable')}</p>;
  const seen = new Set<string>();
  const totals = { filled: 0, total: 0, toFix: null as number | null, toCheck: null as number | null };
  let known = 0;
  let partial = false;
  let largest = 0;
  const groups = plan.groups.map(group => ({ ...group, rows: group.rows.map(row => {
    const observation: Observation = row.status === 'ready'
      ? context?.observe(row.query) ?? unavailable : unavailable;
    const { draft, filing } = observation;
    if (row.status === 'disabled') partial = true;
    else {
      largest = Math.max(largest, row.weight);
      if (!seen.has(row.query.key)) {
        seen.add(row.query.key);
        const counts = draft.status === 'current' ? draft.form : draft.status === 'absent' && filing.status === 'none'
          ? { filled: 0, total: row.weight, toFix: 0, toCheck: 0 } : undefined;
        if (counts) {
          known++;
          totals.filled += counts.filled;
          totals.total += counts.total;
          if (counts.toFix !== null) totals.toFix = (totals.toFix ?? 0) + counts.toFix;
          if (counts.toCheck !== null) totals.toCheck = (totals.toCheck ?? 0) + counts.toCheck;
        }
        const filedWithoutDraft = draft.status === 'absent' && 'receiptRef' in filing;
        if (!filedWithoutDraft && (!counts || counts.toFix === null || counts.toCheck === null)) partial = true;
      }
    }
    return { row, observation };
  }) }));
  return <div className="fs-surface-filing" {...needTraceAttributes(plan.needAnchors)}>
    {known > 0 && <div className="fs-surface-filing__totals">
      <dl>
        <div>
          <dt>{text('filingAnswered')}</dt>
          <dd>{text('filingSummaryAnswered', { filled: String(totals.filled), total: String(totals.total) })}</dd>
        </div>
        {totals.toFix !== null && <div>
          <dt>{text('filingSummaryToFix')}</dt>
          <dd data-finding={totals.toFix > 0 ? 'fix' : undefined}>{totals.toFix}</dd>
        </div>}
        {totals.toCheck !== null && <div>
          <dt>{text('filingSummaryToCheck')}</dt>
          <dd data-finding={totals.toCheck > 0 ? 'check' : undefined}>{totals.toCheck}</dd>
        </div>}
      </dl>
      {partial && <p>{text('filingSomeProgressUnavailable')}</p>}
      {(totals.toFix === null || totals.toCheck === null) && <p>{text('filingChecksUnavailable')}</p>}
    </div>}
    {groups.map(group => (
      <div key={group.id} className="fs-surface-filing__group" {...needTraceAttributes(group.needAnchors)}>
        <Heading level={level}>{group.label}</Heading>
        <ul className="fs-surface-filing__tasks" role="list">
          {group.rows.map(({ row, observation }) => <FilingRow key={row.key} row={row} observation={observation}
            largest={largest} context={context} text={text} />)}
        </ul>
      </div>
    ))}
    {largest > 0 && <div className="fs-surface-filing__key">
      <ul className="fs-surface-filing__legend" role="list">
        {legend.map(item => <li key={item.key}>
          <span className="fs-surface-filing__swatch" aria-hidden="true">
            {'filled' in item && <span className="fs-surface-filing__fill" />}
            {'finding' in item && <span className="fs-surface-filing__mark" data-finding={item.finding} />}
          </span>
          {text(item.key)}
        </li>)}
      </ul>
      <p>{text('filingLegendCaption')}</p>
    </div>}
  </div>;
}
