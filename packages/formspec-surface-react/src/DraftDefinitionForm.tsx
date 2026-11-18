/** @filedesc Open, resume and explicitly restart the native Surface form's draft. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { IFormEngine } from '@formspec-org/engine';
import { resolveSurfaceStrings, type DraftKey } from '@formspec-org/surface';
import { deriveDraftSubject, type DraftSession } from './draft-session.js';
import type { DraftWriter } from './draft-writer.js';
import type { SurfaceDefinitionFormRenderInput } from './SurfaceSlot.js';

type Open = Awaited<ReturnType<DraftSession['acquire']>['result']>;
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
  const [confirm, setConfirm] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [conflictChoice, setConflictChoice] = useState<'load' | 'keep'>();
  const [resolving, setResolving] = useState(false);
  const [, saveNotice] = useState<string>();
  const latest = useRef(input);
  const restartBusy = useRef(false);
  const live = useRef(false);
  const strings = input.draftStrings ?? fallbackStrings;
  const definition = input.plan.definition;
  useLayoutEffect(() => {
    latest.current = input;
  });
  useLayoutEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
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
      const acquired = session.acquire(key, opening, notice => {
        saveNotice(notice);
        latest.current.reportSave?.(notice);
      });
      release = acquired.release;
      const result = await acquired.result;
      if (active) setLoaded({ session, result });
    };
    void ready().catch(() => { if (active) setLoaded({ session, result: { status: 'unavailable' } }); });
    return () => { active = false; release?.(); };
  }, [session, definition, attempt, input.draftSeed]);

  async function restart() {
    if (open?.status !== 'version-mismatch' || !session.restart || restartBusy.current) return;
    restartBusy.current = true;
    setRestarting(true);
    try {
      const result = await session.restart(open.key, open.revision);
      if (!live.current) return;
      setConfirm(false);
      if (result.status !== 'discarded') latest.current.reportSave?.(result.status === 'conflict' ? 'draftConflict' : 'saveFailed');
      if (result.status === 'discarded' || result.status === 'conflict') {
        setLoaded(undefined);
        setAttempt(value => value + 1);
      }
    } catch {
      if (live.current) latest.current.reportSave?.('saveFailed');
    } finally {
      restartBusy.current = false;
      if (live.current) setRestarting(false);
    }
  }

  async function resolveConflict(writer: DraftWriter) {
    if (!conflictChoice || resolving) return;
    setResolving(true);
    const resolved = await writer.resolveConflict(conflictChoice);
    if (!live.current) return;
    if (!resolved) latest.current.reportSave?.('draftConflict');
    setResolving(false);
    setConflictChoice(undefined);
  }

  if (!open || open.status === 'loading') {
    return <p className="fs-surface-loading" role="status" aria-busy="true">{strings('transitionPending')}</p>;
  }
  if (open.status === 'ready') return <>
    {open.writer.conflict && <div>
      {conflictChoice ? <>
        <p>{strings(conflictChoice === 'load' ? 'draftDiscardPrompt' : 'draftOverwritePrompt')}</p>
        <button type="button" disabled={resolving} onClick={() => void resolveConflict(open.writer)}>
          {strings(conflictChoice === 'load' ? 'draftConfirmDiscard' : 'draftConfirmOverwrite')}
        </button>
        <button type="button" disabled={resolving} onClick={() => setConflictChoice(undefined)}>{strings('draftCancel')}</button>
      </> : <>
        <button type="button" onClick={() => setConflictChoice('load')}>{strings('draftLoadNewer')}</button>
        <button type="button" onClick={() => setConflictChoice('keep')}>{strings('draftKeepChanges')}</button>
      </>}
    </div>}
    {children(open.engine, open.writer)}
  </>;
  if (open.status !== 'version-mismatch') return <p>{strings('draftUnavailable')}</p>;
  return <div>
    <p>{strings('draftVersionMismatch')}</p>
    {session.restart && (confirm ? <>
      <button type="button" disabled={restarting} onClick={() => void restart()}>{strings('draftConfirmRestart')}</button>
      <button type="button" disabled={restarting} onClick={() => setConfirm(false)}>{strings('draftKeep')}</button>
    </> : <button type="button" onClick={() => setConfirm(true)}>{strings('draftRestart')}</button>)}
  </div>;
}
