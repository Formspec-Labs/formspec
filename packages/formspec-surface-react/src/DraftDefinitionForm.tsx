/** @filedesc Open, resume and explicitly restart the native Surface form's draft. */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { IFormEngine } from '@formspec-org/engine';
import { resolveSurfaceStrings, type DraftKey } from '@formspec-org/surface';
import { isPlainLinkClick } from './browser-location.js';
import { deriveDraftSubject, type DraftSession, type FiledObservation } from './draft-session.js';
import type { DraftWriter } from './draft-writer.js';
import { FormattedReceiptRef, filingStatusLabel } from './receipt-ref.js';
import type { SurfaceDefinitionFormRenderInput, SurfaceSaveNotice } from './SurfaceSlot.js';

type Open = Awaited<ReturnType<DraftSession['acquire']>['result']>;
type RecoveryAction = 'load' | 'keep' | 'restart';
const fallbackStrings = resolveSurfaceStrings();

function filingBannerLead(status: FiledObservation['status']): string {
  switch (status) {
    case 'returned':
      return 'This filing was returned for revision. Review the feedback below, update your answers, and resubmit.';
    case 'reopened':
      return 'This filing was reopened for updates. Review any notes below before resubmitting.';
    case 'accepted':
      return 'This filing has been accepted.';
    case 'closed-without-acceptance':
      return 'This filing was closed without acceptance.';
    case 'filed':
      return 'This form has been submitted.';
  }
}

export function DraftDefinitionForm({
  input, session, children,
}: {
  input: SurfaceDefinitionFormRenderInput;
  session: DraftSession;
  children: (engine: IFormEngine, writer: DraftWriter) => ReactNode;
}) {
  const [loaded, setLoaded] = useState<{ session: DraftSession; result: Open }>();
  const open = loaded?.session === session ? loaded.result : undefined;
  const [attempt, setAttempt] = useState(0);
  const [allowReviseFiled, setAllowReviseFiled] = useState(false);
  const [decision, setDecision] = useState<{ action: RecoveryAction; confirming: boolean }>();
  const [recovering, setRecovering] = useState(false);
  const [notice, setNotice] = useState<{ kind: SurfaceSaveNotice; focusConflict?: boolean }>();
  const latest = useRef(input);
  const recoveryBusy = useRef(false);
  const live = useRef(false);
  const recoveryGroup = useRef<HTMLDivElement>(null);
  const recoveryButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLDivElement>(null);
  const returnToForm = useRef(false);
  const messageId = useId();
  const promptId = useId();
  const strings = input.draftStrings ?? fallbackStrings;
  const definition = input.plan.definition;
  const status = open?.status;
  const conflict = open?.status === 'ready' && open.writer.conflict;
  const canRestart = status === 'version-mismatch' && !!session.restart;
  const selected = canRestart ? 'restart' : decision?.action;
  const confirming = decision?.action === selected && decision?.confirming;
  useLayoutEffect(() => {
    latest.current = input;
  });
  useLayoutEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  useLayoutEffect(() => {
    if (canRestart && !decision) recoveryGroup.current?.focus();
    else if (conflict || canRestart) recoveryButton.current?.focus();
    else if (status === 'ready' && returnToForm.current) {
      returnToForm.current = false;
      form.current?.focus();
    }
  }, [conflict, canRestart, decision, status]);
  useLayoutEffect(() => {
    if (notice?.kind === 'draftConflict' && notice.focusConflict) recoveryGroup.current?.focus();
  }, [notice]);
  useEffect(() => {
    const report = latest.current.onDraftAvailabilityChange;
    if (!open || open.status === 'loading') {
      report?.('loading');
    } else if (open.status === 'ready') {
      report?.('ready');
    } else if (open.status === 'filed') {
      report?.('filed');
      latest.current.reportSave?.('cleared');
    } else {
      report?.('blocked');
    }
  }, [open?.status]);
  useEffect(() => {
    const report = latest.current.onDraftAvailabilityChange;
    return () => { report?.(undefined); };
  }, []);
  const acquiredRef = useRef<ReturnType<DraftSession['acquire']> | undefined>(undefined);
  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;
    const opening = latest.current;
    const ready = async () => {
      // The planned subject names the filing unit; a renderer-supplied id never keys the draft.
      const subject = await deriveDraftSubject(opening.plan.subject);
      if (!active) return;
      const key: DraftKey = { scope: session.scope, definitionUrl: definition.url, subject };
      const currentInput = latest.current;
      const acquired = session.acquire(key, {
        ...opening,
        responseActionsDocument: currentInput.responseActionsDocument,
        onActionFinding: (finding) => latest.current.onActionFinding?.(finding),
      }, (kind, options) => {
        setNotice({ kind, ...options });
        latest.current.reportSave?.(kind);
      }, () => {
        if (!active) return;
        setLoaded(undefined);
        setAttempt(value => value + 1);
      }, allowReviseFiled ? { allowReviseFiled: true } : undefined);
      acquiredRef.current = acquired;
      release = () => {
        if (acquiredRef.current === acquired) acquiredRef.current = undefined;
        acquired.release();
      };
      const result = await acquired.result;
      if (active) setLoaded({ session, result });
    };
    void ready().catch(() => { if (active) setLoaded({ session, result: { status: 'unavailable' } }); });
    return () => { active = false; release?.(); };
  }, [session, definition, attempt, input.draftSeed, allowReviseFiled]);
  useEffect(() => {
    if (acquiredRef.current) {
      const finding = acquiredRef.current.setActions(input.responseActionsDocument);
      if (finding) latest.current.onActionFinding?.(finding);
      return;
    }
    if (open?.status !== 'ready') return;
    const finding = session.syncActions(open.writer, input.responseActionsDocument);
    if (finding) latest.current.onActionFinding?.(finding);
  }, [open, session, input.responseActionsDocument]);

  async function restart() {
    if (open?.status !== 'version-mismatch' || !session.restart) return;
    try {
      const result = await session.restart(open.key, open.revision);
      if (!live.current) return;
      if (result.status !== 'discarded') latest.current.reportSave?.(result.status === 'conflict' ? 'draftConflict' : 'saveFailed');
      if (result.status === 'discarded' || result.status === 'conflict') {
        setLoaded(undefined);
        setAttempt(value => value + 1);
      }
    } catch {
      if (live.current) latest.current.reportSave?.('saveFailed');
    }
  }

  async function recover(action: RecoveryAction) {
    if (recoveryBusy.current) return;
    recoveryBusy.current = true;
    setRecovering(true);
    returnToForm.current = true;
    try {
      if (action === 'restart') await restart();
      else if (open?.status === 'ready') {
        const result = await open.writer.resolveConflict(action);
        if (live.current && result === 'reopen') {
          session.discardForReopen(open.writer);
        } else if (live.current && !result) latest.current.reportSave?.('draftConflict');
      }
    } finally {
      recoveryBusy.current = false;
      if (live.current) {
        setRecovering(false);
        setDecision(open?.status === 'ready' && open.writer.conflict ? { action, confirming: false } : undefined);
      }
    }
  }

  if (!open || open.status === 'loading') {
    return <p className="fs-surface-loading" role="status" aria-busy="true">{strings('transitionPending')}</p>;
  }
  const message = strings(conflict ? 'draftConflict' : 'draftVersionMismatch');
  const prompt = selected === 'load' ? strings('draftDiscardPrompt')
    : selected === 'keep' ? strings('draftOverwritePrompt') : undefined;
  const primaryAction = conflict ? 'load' : 'restart';
  const controls = (conflict || canRestart) && (
    <div ref={recoveryGroup} role="group" aria-labelledby={messageId} tabIndex={-1}>
      <p id={messageId}>{message}</p>
      {confirming && selected ? <>
        {prompt && <p id={promptId}>{prompt}</p>}
        <button ref={recoveryButton} type="button" aria-disabled={recovering}
          aria-describedby={prompt ? `${messageId} ${promptId}` : messageId} onClick={() => void recover(selected)}>
          {strings(selected === 'restart' ? 'draftConfirmRestart'
            : selected === 'load' ? 'draftConfirmDiscard' : 'draftConfirmOverwrite')}
        </button>
        <button type="button" aria-disabled={recovering} onClick={() => {
          if (!recoveryBusy.current) setDecision({ action: selected, confirming: false });
        }}>{strings(conflict ? 'draftCancel' : 'draftKeep')}</button>
      </> : <>
        <button ref={selected === primaryAction ? recoveryButton : undefined} type="button"
          aria-describedby={messageId} onClick={() => setDecision({ action: primaryAction, confirming: true })}>
          {strings(conflict ? 'draftLoadNewer' : 'draftRestart')}
        </button>
        {conflict && <button ref={selected === 'keep' ? recoveryButton : undefined} type="button"
          aria-describedby={messageId} onClick={() => setDecision({ action: 'keep', confirming: true })}>
          {strings('draftKeepChanges')}
        </button>}
      </>}
    </div>
  );
  const navigate = input.navigate;
  const formatHref = input.formatHref;
  const overviewDest = input.overviewDestination;
  const overviewHref = overviewDest !== undefined ? (formatHref ? formatHref(overviewDest) : overviewDest) : undefined;
  const reviewDest = input.reviewDestination;
  const reviewHref = reviewDest !== undefined ? (formatHref ? formatHref(reviewDest) : reviewDest) : undefined;

  if (open.status === 'filed') {
    const filing = open.filing;
    const badgeLabel = filingStatusLabel(filing.status, strings);
    return (
      <section
        className="fs-surface-filed-summary"
        data-filing-status={filing.status}
        aria-labelledby={messageId}
      >
        <div className="fs-surface-filed-summary__header">
          <span className="fs-surface-filing__badge" data-filing-status={filing.status}>
            {badgeLabel}
          </span>
          <p id={messageId} className="fs-surface-filed-summary__lead">
            {filingBannerLead(filing.status)}
          </p>
        </div>
        <p className="fs-surface-filing__meta fs-surface-filed-summary__receipt" data-receipt-ref="">
          Receipt reference: <FormattedReceiptRef reference={filing.receiptRef} />
        </p>
        {filing.sample && (
          <p className="fs-surface-filing__meta">
            {strings(filing.sample === 'fixture' ? 'filingFixture' : 'filingPreviewSubmit')}
          </p>
        )}
        {filing.comments.length > 0 && (
          <div className="fs-surface-filed-summary__comments">
            {filing.comments.map((comment, index) => (
              <p key={index} className="fs-surface-filing__comment">{comment}</p>
            ))}
          </div>
        )}
        <div className="fs-surface-filed-summary__actions">
          {reviewDest && reviewHref && (
            <a
              className="fs-surface-action-link fs-surface-action-link--primary"
              href={reviewHref}
              onClick={event => {
                if (!navigate || !isPlainLinkClick(event)) return;
                event.preventDefault();
                void navigate(reviewDest);
              }}
            >
              Review submitted answers
            </a>
          )}
          {open.canRevise && (
            <button
              type="button"
              className="fs-surface-action-button fs-surface-action-button--secondary"
              onClick={() => {
                returnToForm.current = true;
                setAllowReviseFiled(true);
              }}
            >
              Revise filing
            </button>
          )}
          {overviewDest && overviewHref && (
            <a
              className="fs-surface-action-link fs-surface-action-link--quiet"
              href={overviewHref}
              onClick={event => {
                if (!navigate || !isPlainLinkClick(event)) return;
                event.preventDefault();
                void navigate(overviewDest);
              }}
            >
              Return to overview
            </a>
          )}
        </div>
      </section>
    );
  }

  if (open.status === 'ready') {
    const filing = open.filing;
    const showFilingBanner = Boolean(
      filing && (
        filing.status === 'returned'
        || filing.status === 'reopened'
        || filing.comments.length > 0
        || allowReviseFiled
      ),
    );
    return <>
      {controls}
      {showFilingBanner && filing && (
        <section
          className="fs-surface-filing-banner"
          data-filing-status={filing.status}
          role="region"
          aria-label={filingStatusLabel(filing.status, strings)}
        >
          <div className="fs-surface-filing-banner__header">
            <span className="fs-surface-filing__badge" data-filing-status={filing.status}>
              {filingStatusLabel(filing.status, strings)}
            </span>
            <p className="fs-surface-filing-banner__lead">
              {allowReviseFiled && (filing.status === 'filed' || filing.status === 'accepted')
                ? 'Revising a submitted filing. Your previously filed answers are loaded below.'
                : filingBannerLead(filing.status)}
            </p>
          </div>
          <p className="fs-surface-filing__meta" data-receipt-ref="">
            Receipt reference: <FormattedReceiptRef reference={filing.receiptRef} />
          </p>
          {filing.comments.map((comment, index) => (
            <p key={index} className="fs-surface-filing__comment">{comment}</p>
          ))}
        </section>
      )}
      <div ref={form} role="form" aria-label={definition.title} tabIndex={-1}>
        {children(open.engine, open.writer)}
      </div>
    </>;
  }
  if (open.status === 'pin-unavailable') {
    const target = open.prerequisiteTitle ?? open.instance;
    const detail = open.requiresAccepted
      ? `Waiting for an accepted "${target}" before this form can be started.`
      : `Waiting for "${target}" to be filed before this form can be started.`;
    return (
      <section
        className="fs-surface-prerequisite-notice"
        data-draft-status="pin-unavailable"
        role="status"
      >
        <p className="fs-surface-prerequisite-notice__title">{strings('draftUnavailable')}</p>
        <p className="fs-surface-prerequisite-notice__detail">{detail}</p>
        {overviewDest && overviewHref && (
          <div className="fs-surface-prerequisite-notice__actions">
            <a
              className="fs-surface-action-link fs-surface-action-link--secondary"
              href={overviewHref}
              onClick={event => {
                if (!navigate || !isPlainLinkClick(event)) return;
                event.preventDefault();
                void navigate(overviewDest);
              }}
            >
              Return to overview
            </a>
          </div>
        )}
      </section>
    );
  }
  if (open.status !== 'version-mismatch') {
    return (
      <section className="fs-surface-prerequisite-notice" data-draft-status={open.status} role="status">
        <p className="fs-surface-prerequisite-notice__title">{strings('draftUnavailable')}</p>
        {overviewDest && overviewHref && (
          <div className="fs-surface-prerequisite-notice__actions">
            <a
              className="fs-surface-action-link fs-surface-action-link--secondary"
              href={overviewHref}
              onClick={event => {
                if (!navigate || !isPlainLinkClick(event)) return;
                event.preventDefault();
                void navigate(overviewDest);
              }}
            >
              Return to overview
            </a>
          </div>
        )}
      </section>
    );
  }
  return controls || <p>{message}</p>;
}
