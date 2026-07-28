/**
 * @filedesc Wrapper that marks a hand-stubbed region on screen.
 *
 * The spike's rule is that a stub which renders convincingly and is not
 * recorded is a failure. Recording it in `gaps.ts` covers the reader of the
 * report; this covers the reader of the screenshot. Every stub says so, in
 * place, with the ledger id that describes it.
 */
import type { ReactNode } from 'react';
import { GAP_LEDGER } from '../gaps.ts';

export function StubFrame({ gapId, children }: { gapId: string; children: ReactNode }) {
  const entry = GAP_LEDGER.find((candidate) => candidate.id === gapId);
  return (
    <div className="stub" data-stub={gapId}>
      <p className="stub__tag">
        <span className="stub__dot" aria-hidden="true" />
        Hand-built for this spike — the platform ships nothing for this
        <code>{entry?.id ?? gapId}</code>
      </p>
      <div className="stub__body">{children}</div>
    </div>
  );
}
