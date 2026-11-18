/** @filedesc Open, resume and explicitly restart the native Surface form's draft. */
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { IFormEngine } from '@formspec-org/engine';
import { resolveSurfaceStrings, type DraftKey } from '@formspec-org/surface';
import { deriveDraftSubject, type DraftSession } from './draft-session.js';
import type { DraftWriter } from './draft-writer.js';
import type { SurfaceDefinitionFormRenderInput, SurfaceSaveNotice } from './SurfaceSlot.js';

type Open = Awaited<ReturnType<DraftSession['acquire']>['result']>;
type RecoveryAction = 'load' | 'keep' | 'restart';
const fallbackStrings = resolveSurfaceStrings();

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
    let active = true;
    let release: (() => void) | undefined;
    const opening = latest.current;
    const ready = async () => {
      const subject = opening.responseSubject && opening.plan.subject
        ? { ...opening.plan.subject, id: opening.responseSubject.id }
        : await deriveDraftSubject(opening.plan.subject);
      if (!active) return;
      const key: DraftKey = { scope: session.scope, definitionUrl: definition.url, subject };
      const acquired = session.acquire(key, opening, (kind, options) => {
        setNotice({ kind, ...options });
        latest.current.reportSave?.(kind);
      }, () => {
        if (!active) return;
        setLoaded(undefined);
        setAttempt(value => value + 1);
      });
      release = acquired.release;
      const result = await acquired.result;
      if (active) setLoaded({ session, result });
    };
    void ready().catch(() => { if (active) setLoaded({ session, result: { status: 'unavailable' } }); });
    return () => { active = false; release?.(); };
  }, [session, definition, attempt, input.draftSeed]);

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
  if (open.status === 'ready') return <>
    {controls}
    <div ref={form} role="form" aria-label={definition.title} tabIndex={-1}>
      {children(open.engine, open.writer)}
    </div>
  </>;
  if (open.status !== 'version-mismatch') return <p>{strings('draftUnavailable')}</p>;
  return controls || <p>{message}</p>;
}
