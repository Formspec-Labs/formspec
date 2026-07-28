/**
 * @filedesc Transition affordances — and the refusal that is the default.
 *
 * The call is recorded in `@formspec-org/surface`'s `transitions.ts`: the shell
 * does **not** own a default "continue" trigger. `surface-spec.md` §5.1 says a
 * router "MUST NOT infer success from a click, a rendered button, or a
 * validation summary", and a shell-supplied Continue button is that inference
 * wearing a label.
 *
 * So this renders a control only for a `fireable` transition — one whose trigger
 * resolves against a loaded Response Actions document AND for which the host
 * supplied an executor. Pressing it does not navigate; it asks the executor to
 * run the action, and navigation happens only if the executor reports the action
 * succeeded.
 *
 * Every other status renders a sentence saying what is missing. That sentence is
 * the product: a signed bundle describing an app that cannot leave its first
 * page is a fact worth putting on the page, for the person stuck on it and for
 * the author who signed it.
 */
import { useState } from 'react';
import {
  resolveSurfaceStrings,
  type PlannedTransition,
  type SurfaceRouteHandle,
  type SurfaceStrings,
} from '@formspec-org/surface';

export interface SurfaceTransitionsProps {
  from: SurfaceRouteHandle;
  transitions: readonly PlannedTransition[];
  /** The shell's own person-facing strings. Defaults to the shipped English. */
  strings?: SurfaceStrings | undefined;
  /**
   * Runs the transition's action under Response Actions authority and reports
   * whether it succeeded. Absent ⇒ every transition is `no-executor` and no
   * control renders.
   */
  onFire?:
    | ((transition: PlannedTransition, from: SurfaceRouteHandle) => Promise<{ advanced: boolean; reason?: string }>)
    | undefined;
  /** Navigate. Called only after `onFire` reports the action actually succeeded. */
  onAdvance?: ((transition: PlannedTransition) => void) | undefined;
}

export function SurfaceTransitions({
  from,
  transitions,
  strings,
  onFire,
  onAdvance,
}: SurfaceTransitionsProps) {
  // A `supplied-by-slot` transition already has its control on the page — the
  // form's own submit button. Drawing a second one beside it would give a person
  // two things that look like the same act.
  const shown = transitions.filter((transition) => transition.status !== 'supplied-by-slot');
  if (shown.length === 0) return null;
  const text = strings ?? resolveSurfaceStrings();
  return (
    <div className="fs-surface-transitions" data-probe="transitions">
      {shown.map((transition) => (
        <SurfaceTransition
          key={`${transition.trigger}->${transition.to}`}
          from={from}
          transition={transition}
          strings={text}
          {...(onFire ? { onFire } : {})}
          {...(onAdvance ? { onAdvance } : {})}
        />
      ))}
    </div>
  );
}

function SurfaceTransition({
  from,
  transition,
  strings,
  onFire,
  onAdvance,
}: {
  from: SurfaceRouteHandle;
  transition: PlannedTransition;
  strings: SurfaceStrings;
  onFire?: (transition: PlannedTransition, from: SurfaceRouteHandle) => Promise<{ advanced: boolean; reason?: string }>;
  onAdvance?: (transition: PlannedTransition) => void;
}) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);

  if (transition.status !== 'fireable' || !onFire) {
    return (
      <p
        className="fs-surface-transition fs-surface-transition--blocked"
        data-transition-status={transition.status}
        data-probe="transition-blocked"
        role="status"
      >
        {transition.reason}
      </p>
    );
  }

  const label = transition.target?.route.title ?? transition.to;

  return (
    <div
      className="fs-surface-transition"
      data-transition-status={transition.status}
      data-probe="transition-fireable"
    >
      <button
        type="button"
        className="fs-surface-transition__button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          setFailure(undefined);
          void onFire(transition, from)
            .then((outcome) => {
              if (outcome.advanced) onAdvance?.(transition);
              else setFailure(outcome.reason ?? strings('transitionFailed'));
            })
            .catch((error: unknown) => {
              setFailure(error instanceof Error ? error.message : String(error));
            })
            .finally(() => setPending(false));
        }}
      >
        {pending ? strings('transitionPending') : strings('transitionContinue', { target: label })}
      </button>
      {failure && (
        <p className="fs-surface-transition__failure" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}
