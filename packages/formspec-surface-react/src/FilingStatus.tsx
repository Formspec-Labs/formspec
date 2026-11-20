/** @filedesc Presents an authored filing task list from a batch of draft observations. */
import { Fragment, useEffect, useId, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import {
  type CurrentDraftProgress, type FilingDraftQuery, type FilingProgressCounts, type FilingStatusObservation, type FilingStatusReader,
  type FilingStatusPlan, type HeadingLevel, type SlotPlan, type SurfaceStringKey, type SurfaceStrings,
} from '@formspec-org/surface';
import { currentEffectDataSourcePorts, type EffectDataSourcePorts } from './data-source-effect.js';
import { selectDataSourceRevisions, type DataSourceRevisionSelector } from './data-source-revision.js';
import { Heading, nextLevel } from './heading.js';
import { isPlainLinkClick } from './browser-location.js';
import { needTraceAttributes } from './need-trace.js';
import { presentedRouteLabel, type SurfaceRouteTitleResolver } from './title-presentation.js';
import { FormattedReceiptRef } from './receipt-ref.js';

type Observation = FilingStatusObservation | {
  readonly draft: { readonly status: 'loading' };
  readonly filing: { readonly status: 'unavailable' };
};
type DraftReads = (query: FilingDraftQuery) => Observation;
const unavailable = { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } } as const;

export interface FilingStatusNavigation {
  navigate: (href: string) => void | boolean | Promise<void | boolean>;
  formatHref?: ((href: string) => string | undefined) | undefined;
  resolveRouteTitle?: SurfaceRouteTitleResolver | undefined;
}

export interface FilingStatusOptions extends FilingStatusNavigation {
  readSummaries?: FilingStatusReader | undefined;
  revision?: string | number | undefined;
}

export interface FilingStatusViewContext extends Partial<FilingStatusNavigation> {
  observe: DraftReads;
  rosters?: ReadonlyMap<FilingStatusPlan, FilingStatusPlan> | undefined;
}

export function useFilingDraftObservations(
  slots: readonly SlotPlan<unknown>[],
  readSummaries: FilingStatusReader | undefined,
  previewScope: string | undefined,
  revision: string | number | undefined,
  generation: string | undefined,
  draftRevision: number | undefined,
  { loader, authorize, validatePayload }: EffectDataSourcePorts,
  selectRevision: DataSourceRevisionSelector | undefined,
) {
  const trackers = useMemo(() => {
    const plans = new Set<FilingStatusPlan>();
    function visit(items: readonly SlotPlan<unknown>[]) {
      for (const slot of items) {
        if (slot.slotType === 'embed-route') visit(slot.slots);
        if (slot.slotType === 'filing-status') plans.add(slot.tracker);
      }
    }
    visit(slots);
    return [...plans];
  }, [slots]);

  const rosters = useMemo(() => trackers.filter(plan => plan.status === 'roster'), [trackers]);
  const revisions = rosters.map(plan => selectDataSourceRevisions(plan.requests.map(request => ({
    ...request, context: { ...request.context, sessionGeneration: generation },
  })), selectRevision));
  const revisionKey = JSON.stringify(revisions.map(result => result.key));
  const visit = useMemo(() => ({ rosters, failures: revisions.map(result => new Set(result.failures.map(request => request.descriptor))) }),
    [rosters, revisionKey, generation, draftRevision, revision, previewScope, loader, authorize, validatePayload]);
  const [delivery, setDelivery] = useState<{
    visit: typeof visit; plans: ReadonlyMap<FilingStatusPlan, FilingStatusPlan>;
  }>();
  useEffect(() => {
    if (!visit.rosters.length) return;
    let current = true;
    const ports = currentEffectDataSourcePorts(() => current, { loader, authorize, validatePayload });
    const refused = { status: 'unresolved', reason: 'roster-unavailable' } as const;
    void Promise.all(visit.rosters.map(async (plan, index) => {
      try {
        const failed = visit.failures[index];
        const availablePorts = failed?.size && ports.loader ? {
          ...ports,
          loader: (request: Parameters<NonNullable<typeof loader>>[0]) => failed.has(request.descriptor)
            ? { status: 'unavailable' as const, reason: 'The source revision is unavailable.' }
            : ports.loader!(request),
        } : ports;
        return [plan, await plan.load(availablePorts, generation)] as const;
      } catch {
        return [plan, refused] as const;
      }
    })).then(entries => { if (current) setDelivery({ visit, plans: new Map(entries) }); });
    return () => { current = false; };
  }, [visit]);
  const expanded = delivery?.visit === visit ? delivery.plans : undefined;
  const queries = useMemo(() => {
    const unique = new Map<string, FilingDraftQuery>();
    if (rosters.length && !expanded) return [];
    for (const tracker of trackers) {
      const plan = expanded?.get(tracker) ?? tracker;
      if (plan.status !== 'ready') continue;
      for (const group of plan.groups) {
        for (const row of group.rows) if (row.status === 'ready') unique.set(row.query.key, row.query);
      }
    }
    return [...unique.values()];
  }, [trackers, rosters, expanded]);

  const request = useMemo(() => ({ queries, readSummaries, previewScope, generation }),
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

  const observe: DraftReads = (query) => {
    if (!readSummaries) return unavailable;
    let observation: FilingStatusObservation | undefined;
    if (completed?.request === request) {
      observation = completed.observations.get(query.key) ?? unavailable;
    } else if (
      completed !== undefined
      && completed.request.readSummaries === readSummaries
      && completed.request.previewScope === previewScope
      && completed.request.generation === generation
      && completed.observations.has(query.key)
    ) {
      observation = completed.observations.get(query.key);
    } else {
      return { ...unavailable, draft: { status: 'loading' } };
    }
    if (!observation) return unavailable;
    if (query.subjectMatch !== undefined && 'subjectMatch' in observation && observation.subjectMatch === 'matched'
        && ((observation.draft as { status: string }).status === 'denied' || (observation.filing as { status: string }).status === 'denied')) {
      return { draft: { status: 'denied' }, filing: { status: 'unavailable' } };
    }
    return observation;
  };
  return { observe, rosters: expanded };
}

function filingLinkFor(destination: string | undefined, navigation: Partial<FilingStatusNavigation> | undefined) {
  if (destination === undefined) return undefined;
  const href = navigation?.formatHref ? navigation.formatHref(destination) : destination;
  return href === undefined ? undefined : { href, destination };
}

function FilingLink({ link, navigation, describedBy, className, style, children, ...anchorProps }: {
  link: ReturnType<typeof filingLinkFor>;
  navigation: Partial<FilingStatusNavigation> | undefined;
  describedBy?: string;
  children: ReactNode;
} & Pick<ComponentPropsWithoutRef<'a'>, 'className' | 'style' | 'tabIndex' | 'title' | 'onMouseDown'>) {
  if (!link) return <span className={className} style={style} role="link" aria-disabled="true" aria-describedby={describedBy}>{children}</span>;
  return <a {...anchorProps} className={className} style={style} href={link.href} aria-describedby={describedBy} onClick={event => {
    if (!navigation?.navigate || !isPlainLinkClick(event)) return;
    event.preventDefault();
    navigation.navigate(link.destination);
  }}>{children}</a>;
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

function observationProgress(observation: Observation): CurrentDraftProgress | undefined {
  if (observation.draft.status === 'current') return observation.draft;
  if (
    observation.draft.status === 'absent'
    && 'receiptRef' in observation.filing
    && (observation.filing.status === 'returned' || observation.filing.status === 'reopened')
  ) {
    return observation.filing.progress;
  }
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
  const activeProgress = observationProgress(observation);
  const label = row.route ? presentedRouteLabel(row.route, context?.resolveRouteTitle)
    : row.status === 'disabled' && row.routeRef;
  const status = row.status === 'disabled' ? text(refusalLabel[row.reason])
    : draft.status === 'absent' && filing.status === 'none' && row.weight > 0
      ? text('filingNotStartedWithSize', { count: String(row.weight) })
    : draft.status === 'current'
      ? text(draft.form.ready === null ? 'filingReadinessUnavailable' : draft.form.ready ? 'filingReady' : 'filingInProgress')
    : draft.status === 'absent' && filing.status !== 'none' ? text('filingUnavailable')
    : text(observationLabel[draft.status]);
  const completedReceipt =
    receipt && (receipt.status === 'filed' || receipt.status === 'accepted') && draft.status !== 'current'
      ? receipt
      : undefined;
  const sections = row.status === 'ready' ? row.sections.map(section => {
    const counts = draft.status === 'absent' && filing.status === 'none' ? { filled: 0, total: section.weight, toFix: 0, toCheck: 0 }
      : activeProgress && Object.hasOwn(activeProgress.sections, section.id)
        ? activeProgress.sections[section.id] : undefined;
    const countLabels = counts
      ? [filingFillCount(counts, text), ...filingFindings(counts, text).map(finding => finding.label)]
      : completedReceipt
        ? [text(filingLabel[completedReceipt.status])]
        : [];
    return { ...section, link: filingLinkFor(section.href, context), counts, countLabels };
  }) : [];
  const segments = sections.filter(section => section.weight > 0);
  const filingState = receipt ? receipt.status
    : row.status === 'disabled' ? 'disabled'
    : draft.status === 'current' ? (draft.form.ready === null ? 'unavailable' : draft.form.ready ? 'ready' : 'in-progress')
    : draft.status;
  const receiptReferenceParts = receipt
    ? text('filingReceiptReference', { reference: '\u0000' }).split('\u0000')
    : undefined;
  return <li className="fs-surface-filing__row" data-filing-status={filingState} {...needTraceAttributes(row.needAnchors)}>
    <div className="fs-surface-filing__form">
      {label && <FilingLink link={row.status === 'ready' ? filingLinkFor(row.href, context) : undefined}
        navigation={context} describedBy={statusId}>{label}</FilingLink>}
      {row.description && <p>{row.description}</p>}
      {row.hint && <p>{row.hint}</p>}
    </div>
    {sections.length > 0 && <div className="fs-surface-filing__section-nav">
      {row.status === 'ready' && segments.length > 0 && <div className="fs-surface-filing__strip" aria-hidden="true"
        data-strip-state={completedReceipt ? completedReceipt.status : undefined}
        style={{ inlineSize: `${100 * Math.max(Math.sqrt(row.weight / largest), 0.08)}%` }}>
        {segments.map(({ id, label, weight, counts, countLabels, link }) => {
          const percent = completedReceipt
            ? 100
            : counts && counts.total > 0 ? Math.min(100, 100 * counts.filled / counts.total) : 0;
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
      <div id={statusId} className="fs-surface-filing__status" data-filing-status={filingState}>
        {receipt
          ? <span className="fs-surface-filing__badge" data-filing-status={receipt.status}>{text(filingLabel[receipt.status])}</span>
          : status}
        {receipt && draft.status === 'current' && <div className="fs-surface-filing__draft-note">{status}</div>}
      </div>
      {receipt && <>
        <div className="fs-surface-filing__meta" data-receipt-ref="">
          {receiptReferenceParts && receiptReferenceParts.length === 2 ? (
            <>
              {receiptReferenceParts[0]}
              <FormattedReceiptRef reference={receipt.receiptRef} />
              {receiptReferenceParts[1]}
            </>
          ) : (
            text('filingReceiptReference', { reference: receipt.receiptRef })
          )}
        </div>
        {receipt.sample && <div className="fs-surface-filing__meta">{text(receipt.sample === 'fixture' ? 'filingFixture' : 'filingPreviewSubmit')}</div>}
        {receipt.review === 'unavailable' && <div className="fs-surface-filing__meta">{text('filingReviewUnavailable')}</div>}
        {receipt.comments.map((comment, index) => <p key={index} className="fs-surface-filing__comment">{comment}</p>)}
      </>}
      {activeProgress && <div className="fs-surface-filing__counts">
        <span>{filingFillCount(activeProgress.form, text)}</span>
        {filingFindings(activeProgress.form, text).map(({ kind, label }) => (
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

function subjectKeyString(subject: { readonly type: string; readonly keys: Readonly<Record<string, string | number>> } | null): string {
  if (subject === null) return 'null';
  return JSON.stringify([
    subject.type,
    Object.entries(subject.keys).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  ]);
}

function destinationTupleString(
  route: { readonly surfaceId: string; readonly routeId: string },
  slotId: string,
  params: Readonly<Record<string, string>>,
): string {
  return JSON.stringify([
    route.surfaceId,
    route.routeId,
    slotId,
    Object.entries(params).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  ]);
}

function disablePlannedRow(
  row: Extract<Row, { status: 'ready' }>,
  reason: Extract<Row, { status: 'disabled' }>['reason'],
): Extract<Row, { status: 'disabled' }> {
  return {
    key: row.key,
    ...(row.hint === undefined ? {} : { hint: row.hint }),
    ...(row.description === undefined ? {} : { description: row.description }),
    needAnchors: row.needAnchors,
    status: 'disabled',
    route: row.route,
    routeRef: row.route.routeId,
    reason,
  };
}

interface ResolvedTrackerRow {
  row: Row;
  observation: Observation;
  countEligible: boolean;
  resolvedSubject?: string | undefined;
  destinationTuple?: string | undefined;
  unitKey?: string | undefined;
}

export function FilingStatus({ plan: originalPlan, context, level, text }: {
  plan: FilingStatusPlan;
  context?: FilingStatusViewContext | undefined;
  level: HeadingLevel;
  text: SurfaceStrings;
}) {
  const plan = context?.rosters?.get(originalPlan) ?? originalPlan;
  if (plan.status === 'roster') return <p>{text('filingLoading')}</p>;
  if (plan.status === 'unresolved') return <p>{text('filingUnavailable')}</p>;
  const resolvedGroups = plan.groups.map(group => {
    let rows = group.rows.map((plannedRow): ResolvedTrackerRow => {
      if (plannedRow.status !== 'ready') {
        return { row: plannedRow, observation: unavailable, countEligible: false };
      }
      if (plannedRow.query.subjectMatch !== undefined) {
        const raw: Observation = context?.observe(plannedRow.query) ?? unavailable;
        if (raw.draft.status === 'loading') {
          return {
            row: { ...plannedRow, href: undefined, sections: [] },
            observation: { draft: { status: 'loading' }, filing: { status: 'unavailable' } },
            countEligible: false,
          };
        }
        if ('subjectMatch' in raw && raw.subjectMatch === 'matched' && raw.subject !== undefined) {
          if ((raw.draft as { status: string }).status === 'denied' || (raw.filing as { status: string }).status === 'denied') {
            return {
              row: disablePlannedRow(plannedRow, 'subject-unavailable'),
              observation: unavailable,
              countEligible: false,
            };
          }
          const links = plannedRow.resolveLinks?.(raw.subject);
          if (!links) {
            return {
              row: disablePlannedRow(plannedRow, 'route-address-unavailable'),
              observation: unavailable,
              countEligible: false,
            };
          }
          const resolvedSubject = subjectKeyString(raw.subject);
          return {
            row: {
              ...plannedRow,
              params: links.params,
              href: links.href,
              sections: plannedRow.sections.map(section => ({ ...section, href: links.sections[section.id] })),
            },
            observation: { draft: raw.draft, filing: raw.filing },
            countEligible: true,
            resolvedSubject,
            destinationTuple: destinationTupleString(plannedRow.route, plannedRow.slotId, links.params),
            unitKey: JSON.stringify([plannedRow.query.definitionUrl, resolvedSubject]),
          };
        }
        if ('subjectMatch' in raw && (raw.subjectMatch === 'none' || raw.subjectMatch === 'ambiguous')) {
          return {
            row: disablePlannedRow(plannedRow, 'subject-unavailable'),
            observation: unavailable,
            countEligible: false,
          };
        }
        return {
          row: { ...plannedRow, href: undefined, sections: [] },
          observation: {
            draft: { status: raw.draft.status === 'denied' ? 'denied' : 'unavailable' },
            filing: { status: 'unavailable' },
          },
          countEligible: false,
        };
      }
      const observation = context?.observe(plannedRow.query) ?? unavailable;
      const resolvedSubject = subjectKeyString(plannedRow.query.subject ?? null);
      return {
        row: plannedRow,
        observation,
        countEligible: true,
        resolvedSubject,
        destinationTuple: plannedRow.params !== undefined
          ? destinationTupleString(plannedRow.route, plannedRow.slotId, plannedRow.params)
          : undefined,
        unitKey: JSON.stringify([plannedRow.query.definitionUrl, resolvedSubject]),
      };
    });
    const groupSubjects = new Set<string>();
    for (const entry of rows) {
      if (entry.resolvedSubject !== undefined) groupSubjects.add(entry.resolvedSubject);
    }
    if (groupSubjects.size > 1) {
      rows = rows.map((entry): ResolvedTrackerRow => entry.row.status === 'ready'
        ? { row: disablePlannedRow(entry.row, 'subject-unavailable'), observation: unavailable, countEligible: false }
        : entry);
    }
    return { ...group, rows };
  });

  const seenDestinations = new Set<string>();
  const seenRepeatGroupSubjects = new Map<string, Set<string>>();
  for (const group of resolvedGroups) {
    let memberSubject: string | undefined;
    for (const entry of group.rows) {
      if (entry.destinationTuple !== undefined) {
        if (seenDestinations.has(entry.destinationTuple)) {
          return <p>{text('filingUnavailable')}</p>;
        }
        seenDestinations.add(entry.destinationTuple);
      }
      if (entry.resolvedSubject !== undefined) {
        memberSubject ??= entry.resolvedSubject;
      }
    }
    if (group.member && memberSubject !== undefined) {
      const seenForRepeat = seenRepeatGroupSubjects.get(group.member.groupId) ?? new Set<string>();
      if (seenForRepeat.has(memberSubject)) {
        return <p>{text('filingUnavailable')}</p>;
      }
      seenForRepeat.add(memberSubject);
      seenRepeatGroupSubjects.set(group.member.groupId, seenForRepeat);
    }
  }

  const unitEntries = new Map<string, { row: Extract<Row, { status: 'ready' }>; observation: Observation }[]>();
  const totals = { filled: 0, total: 0, toFix: null as number | null, toCheck: null as number | null };
  let known = 0;
  let completedUnits = 0;
  let partial = resolvedGroups.some(group => group.unavailable);
  let largest = 0;
  const groups = resolvedGroups.map(group => ({
    ...group,
    rows: group.rows.map(({ row, observation, unitKey, countEligible }) => {
      if (row.status === 'disabled' || !countEligible) {
        partial = true;
        return { row, observation };
      }
      largest = Math.max(largest, row.weight);
      const dedupKey = unitKey ?? row.query.key;
      const entries = unitEntries.get(dedupKey);
      if (entries) entries.push({ row, observation });
      else unitEntries.set(dedupKey, [{ row, observation }]);
      return { row, observation };
    }),
  }));
  const totalUnits = unitEntries.size;
  for (const entries of unitEntries.values()) {
    const currentComplete = entries.find(({ observation }) => {
      const progress = observationProgress(observation);
      return progress !== undefined && progress.form.toFix !== null && progress.form.toCheck !== null;
    });
    const currentAny = currentComplete ?? entries.find(({ observation }) => observationProgress(observation) !== undefined);
    const absentEntries = entries.filter(({ observation: { draft, filing } }) =>
      draft.status === 'absent' && filing.status === 'none');
    const absentTotal = absentEntries.length > 0
      ? absentEntries.every(({ row }) => row.fieldTemplates !== undefined)
        ? new Set(absentEntries.flatMap(({ row }) => row.fieldTemplates)).size
        : Math.max(...absentEntries.map(({ row }) => row.weight))
      : undefined;
    const activeUnitProgress = currentAny ? observationProgress(currentAny.observation) : undefined;
    const counts = activeUnitProgress
      ? activeUnitProgress.form
      : absentTotal !== undefined
        ? { filled: 0, total: absentTotal, toFix: 0, toCheck: 0 }
        : undefined;
    if (counts) {
      known++;
      totals.filled += counts.filled;
      totals.total += counts.total;
      if (counts.toFix !== null) totals.toFix = (totals.toFix ?? 0) + counts.toFix;
      if (counts.toCheck !== null) totals.toCheck = (totals.toCheck ?? 0) + counts.toCheck;
    }
    const filedWithoutDraft = entries.some(({ observation: { draft, filing } }) =>
      draft.status === 'absent' && 'receiptRef' in filing);
    const isCompletedUnit = entries.some(({ observation: { draft, filing } }) =>
      draft.status !== 'current' && 'receiptRef' in filing && (filing.status === 'filed' || filing.status === 'accepted'));
    if (isCompletedUnit) completedUnits++;
    if (!filedWithoutDraft && (!counts || counts.toFix === null || counts.toCheck === null)) partial = true;
  }
  type AuthoredGroup = { entries: typeof groups; waiting: string[] };
  const authoredGroups = new Map<string, AuthoredGroup>();
  for (const group of groups) {
    const id = group.member?.groupId ?? group.id;
    const section: AuthoredGroup = authoredGroups.get(id) ?? { entries: [], waiting: [] };
    section.entries.push(group);
    if (group.member && group.rows.some(({ row, observation: { draft, filing } }) => row.status === 'ready'
      && filing.status === 'none' && (draft.status === 'absent' || draft.status === 'current'))) {
      section.waiting.push(group.member.label);
    }
    authoredGroups.set(id, section);
  }
  return <div className="fs-surface-filing" {...needTraceAttributes(plan.needAnchors)}>
    {(known > 0 || completedUnits > 0) && <div className="fs-surface-filing__totals">
      <dl>
        {known > 0 && <div>
          <dt>{text('filingAnswered')}</dt>
          <dd>{text('filingSummaryAnswered', { filled: String(totals.filled), total: String(totals.total) })}</dd>
        </div>}
        {completedUnits > 0 && <div>
          <dt>{text('filingFiled')}</dt>
          <dd data-filing-completed="">{text('filingSummaryAnswered', { filled: String(completedUnits), total: String(totalUnits) })}</dd>
        </div>}
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
      {known > 0 && (totals.toFix === null || totals.toCheck === null) && <p>{text('filingChecksUnavailable')}</p>}
    </div>}
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
    {[...authoredGroups].map(([id, { entries, waiting }]) => {
      const first = entries[0]!;
      return <div key={id} className="fs-surface-filing__group" {...needTraceAttributes(first.needAnchors)}>
        <Heading level={level}>{first.label}</Heading>
        {first.member && waiting.length > 0 && <div data-state="waiting-on-named-members">
          <p>{first.member.waitingLabel}</p>
          <ul aria-label={first.member.waitingLabel}>{waiting.map((name, index) => <li key={index}>{name}</li>)}</ul>
        </div>}
        {entries.map(group => <Fragment key={group.id}>
          {group.member && <Heading level={nextLevel(level)}>{group.member.label}</Heading>}
          {group.unavailable && <p>{text('filingUnavailable')}</p>}
          {!group.unavailable && group.rows.length === 0 && (
            <p className="fs-surface-filing__empty">None added yet.</p>
          )}
          {group.rows.length > 0 && <ul className="fs-surface-filing__tasks" role="list">
            {group.rows.map(({ row, observation }) => <FilingRow key={row.key} row={row} observation={observation}
              largest={largest} context={context} text={text} />)}
          </ul>}
        </Fragment>)}
      </div>;
    })}
  </div>;
}
