/** @filedesc Create on activation and navigate only after the store returns a complete subject. */
import { useLayoutEffect, useRef, useState } from 'react';
import { draftStartHref, type DraftStartPlan, type SurfaceStrings } from '@formspec-org/surface';
import type { FilingStatusNavigation } from './FilingStatus.js';
import { deriveDraftSubject, type DraftSession } from './draft-session.js';

export function DraftStart({ plan, session, navigate, strings }: {
  plan: DraftStartPlan;
  session: DraftSession;
  navigate: FilingStatusNavigation['navigate'];
  strings: SurfaceStrings;
}) {
  const visit = useRef<{ attemptId?: string; busy: boolean }>({ busy: false });
  const [status, setStatus] = useState<'ready' | 'pending' | 'failed'>('ready');
  const [missingInstance, setMissingInstance] = useState<string>();
  useLayoutEffect(() => {
    visit.current = { busy: false };
    setStatus('ready');
    return () => { visit.current = { busy: false }; };
  }, [session]);

  async function start() {
    const current = visit.current;
    if (current.busy || !session.port.start) return;
    current.busy = true;
    setStatus('pending');
    setMissingInstance(undefined);
    try {
      const result = await session.port.start({
        scope: session.scope, definitionUrl: plan.definitionUrl, definitionVersion: plan.definitionVersion,
        subject: plan.subject, attemptId: current.attemptId ??= crypto.randomUUID(),
      });
      if (visit.current !== current) return;
      const href = result.status === 'started' && draftStartHref(plan, result.subject);
      const derived = result.status === 'started' && href ? await deriveDraftSubject(result.subject) : undefined;
      if (visit.current !== current) return;
      if (result.status !== 'started' || !href || derived?.id !== result.subject.id) {
        if (result.status === 'pin-unavailable') setMissingInstance(result.instance);
        setStatus('failed');
        return;
      }
      const navigated = await navigate(href);
      if (visit.current === current) setStatus(navigated === false ? 'failed' : 'ready');
    } catch {
      if (visit.current === current) setStatus('failed');
    } finally {
      current.busy = false;
    }
  }
  return <>
    <button type="button" disabled={status === 'pending'} onClick={() => void start()}>{plan.label}</button>
    {status === 'failed' && <p role="status">{strings('draftUnavailable')}{missingInstance && <> <code>{missingInstance}</code></>}</p>}
  </>;
}
