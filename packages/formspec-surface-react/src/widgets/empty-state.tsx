/**
 * @filedesc The empty state every starter widget uses when it has nothing to show.
 *
 * A widget with no content has three options: draw nothing, draw plausible
 * placeholder content, or say it has nothing. The middle one is what the
 * surface-render-v10 spike did — invented queue rows, an invented case
 * reference, invented amounts — and it is the failure mode the whole spike was
 * built to avoid: *a stub that renders convincingly and is not recorded*.
 * Drawing nothing is quieter but no more honest, because the person cannot tell
 * a missing widget from an empty one.
 *
 * So: say it, in the language of the person looking at the page, and mark it in
 * the DOM (`data-widget-empty`) so a probe can find it without reading pixels.
 */
import type { ReactNode } from 'react';

export interface WidgetEmptyStateProps {
  /** What is not here, in product language. One short sentence. */
  children: ReactNode;
}

export function WidgetEmptyState({ children }: WidgetEmptyStateProps) {
  return (
    <p className="fs-surface-empty" data-widget-empty="true" role="status">
      {children}
    </p>
  );
}
