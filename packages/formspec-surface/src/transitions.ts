/**
 * @filedesc Transitions — and the decision the surface-render-v10 spike forced.
 *
 * ## The question
 *
 * The spike's `/apply` route declares `transitions: [{trigger: "submit", to:
 * "certify"}]`. The bundle carries no Response Actions document, so nothing can
 * fire it: the shipped renderer injects a submit button only when a Response
 * Actions document publishes an Action with `submit` intent. The transition is
 * authored, schema-valid and signed, and the app as described cannot leave its
 * own first page. The spike hand-built a "Continue" button and recorded it as
 * gap ledger `transition-has-no-trigger-source`, with the open question:
 * **does the shell own a default trigger affordance, or must the bundle declare
 * one?**
 *
 * ## The answer: the bundle declares it. The shell does not.
 *
 * This is not a taste call — `surface-spec.md` §4 "Transition trigger semantics"
 * and §5.1 "Runtime Route State Ownership" already answer it, twice:
 *
 * > A router MAY advance a Surface transition **only after** the referenced
 * > action or closed-core intent has completed successfully under Response
 * > Actions authority.
 *
 * > it **MUST NOT infer success from a click**, a rendered button, or a
 * > validation summary.
 *
 * A shell-owned "Continue" button is precisely the prohibited inference: a click
 * standing in for an action that never ran. Shipping one as a default would put
 * a spec violation in every host by construction, and would do it on exactly the
 * routes where it matters — a `submit` transition off an intake route means a
 * submission happened.
 *
 * So this module **plans** transitions and refuses to fire them. Each authored
 * transition resolves to one of {@link TransitionStatus}, and only `fireable`
 * gets an affordance:
 *
 * - the trigger resolves against a loaded Response Actions document (an
 *   `actions[*].id`, or a closed-core intent published by exactly one action —
 *   the same rule `validateSurfaceResponseActionTriggers` enforces at authoring
 *   time, using the same imported intent set), **and**
 * - the host supplied a {@link TransitionExecutor} that can run it under
 *   Response Actions authority.
 *
 * Everything else renders as a stated refusal naming which half is missing. The
 * refusal is the product: a signed bundle describing an app that cannot run is a
 * fact the person on the page, and the author who signed it, should both be able
 * to see.
 *
 * ## What this leaves open, and where it belongs
 *
 * Nothing checks, before signing, that a transition trigger has anything that
 * could produce it. Surface lint walks the route graph for reachability (E606)
 * and never asks whether an edge can be traversed;
 * `validateSurfaceResponseActionTriggers` does ask — but only when a Response
 * Actions document is loaded, so a bundle carrying none has no trigger to
 * contradict. That check belongs in lint or the app-graph validator, and it
 * would have caught this bundle before the signing ceremony. Recorded in the gap
 * ledger; not a renderer's to fix.
 */
import { CLOSED_RESPONSE_ACTION_INTENTS } from '@formspec-org/app-graph';
import { surfaceDiagnostic, type SurfaceDiagnostic } from './diagnostics.js';
import { routeInSurface, type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import type { SlotPlan } from './slot-plan.js';
import { resolveSurfaceStrings, type SurfaceStringOverrides, type SurfaceStrings } from './strings.js';

export type TransitionStatus =
  /** Trigger resolves and an executor exists. The shell renders the control. */
  | 'fireable'
  /**
   * Trigger resolves and something already ON this route renders the control —
   * a `definition-form` slot whose Response Actions document publishes the
   * trigger's intent, so `FormspecForm` injects a real submit button. The shell
   * MUST NOT draw a second one beside it; it advances when that action reports
   * success.
   */
  | 'supplied-by-slot'
  /** The bundle carries no Response Actions document, so no trigger can resolve. */
  | 'no-response-actions-document'
  /** A Response Actions document exists and does not publish this trigger. */
  | 'trigger-unresolved'
  /** The trigger resolves; no host executor can run it under Response Actions authority. */
  | 'no-executor'
  /** `to` names no route in this Surface. */
  | 'target-unresolved';

export interface PlannedTransition {
  trigger: string;
  to: string;
  when?: string;
  status: TransitionStatus;
  /** One sentence a person can read, naming what is missing. */
  reason: string;
  /** Resolved target, when `to` names a route in the same Surface. */
  target?: SurfaceRouteHandle;
  /** The Response Actions action id that would run, when one resolves. */
  actionId?: string;
}

/**
 * The host's seam to Response Actions. The shell never implements one: firing a
 * transition means running an action with preconditions, validation-tuple
 * selection, effects, idempotency, replay and retry — all of which Response
 * Actions owns and a renderer must not re-derive.
 *
 * Returning `{ advanced: false }` is a legitimate outcome: the action ran and
 * did not succeed. The shell stays put, which is the same rule as never
 * inferring success from the click.
 */
export type TransitionExecutor = (request: {
  transition: PlannedTransition;
  from: SurfaceRouteHandle;
}) => Promise<{ advanced: boolean; reason?: string }>;

/** Minimal read of a Response Actions document — the fields a trigger resolves against. */
export interface ResponseActionsDocumentLike {
  /** The Definition this document binds to. `E611`'s "targeting the Definition that slot binds". */
  targetDefinition?: { url?: unknown } | undefined;
  actions?: readonly { id?: unknown; intent?: unknown }[];
}

export interface TransitionPlanInput {
  handle: SurfaceRouteHandle;
  app: SurfaceApp;
  responseActions?: readonly ResponseActionsDocumentLike[] | undefined;
  /** Whether the host supplied an executor. The shell never assumes one. */
  hasExecutor: boolean;
  /**
   * Triggers a slot on this route already renders a control for. Compute it
   * with {@link slotSuppliedTriggers} rather than by hand — a binding that
   * hardcodes one intent reports every other intent as dead, and one that scans
   * only the route's own `slots[]` reports a working page as dead
   * (surface-shell-spec §5.3).
   */
  slotSuppliedTriggers?: ReadonlySet<string> | undefined;
  /** Host overrides for the shell's own person-facing strings (§3.0). */
  strings?: SurfaceStrings | SurfaceStringOverrides | undefined;
}

export interface TransitionPlanResult {
  transitions: readonly PlannedTransition[];
  diagnostics: readonly SurfaceDiagnostic[];
}

interface ResolvedTriggers {
  actionIds: Set<string>;
  /** intent → action ids publishing it. A trigger resolves only at exactly one. */
  byIntent: Map<string, string[]>;
  documentCount: number;
}

function indexTriggers(documents: readonly ResponseActionsDocumentLike[]): ResolvedTriggers {
  const actionIds = new Set<string>();
  const byIntent = new Map<string, string[]>();
  for (const document of documents) {
    for (const action of document.actions ?? []) {
      const id = typeof action.id === 'string' ? action.id : undefined;
      if (!id) continue;
      actionIds.add(id);
      const intent = typeof action.intent === 'string' ? action.intent : undefined;
      if (intent && CLOSED_RESPONSE_ACTION_INTENTS.has(intent)) {
        byIntent.set(intent, [...(byIntent.get(intent) ?? []), id]);
      }
    }
  }
  return { actionIds, byIntent, documentCount: documents.length };
}

function targetDefinitionUrl(document: ResponseActionsDocumentLike): string | undefined {
  const url = document.targetDefinition?.url;
  return typeof url === 'string' ? url : undefined;
}

/**
 * Every trigger a control **already on this route** can raise.
 *
 * `surface-shell-spec.md` §5.3: "Resolving `supplied-by-slot` is a walk, not a
 * lookup." Two halves, and getting either wrong is the same defect —
 * substituting a shortcut for the resolution rule surface-spec §4 already
 * states:
 *
 * 1. **The scan descends `embed-route` transitively.** An embedded route's
 *    slots render on the host route's surface, so a control it renders is a
 *    control the host route renders — the same transitivity §4.4 applies to the
 *    theme grant. A shell that scans only a route's own `slots[]` reports a
 *    working page as dead.
 * 2. **Triggers resolve through the loaded Response Actions documents**, not
 *    against a hardcoded intent string: every `actions[*].id`, plus every
 *    closed-core intent published by exactly one action. A shell that hardcodes
 *    `submit` reports every other intent as dead.
 *
 * Only `definition-form` slots contribute (§5.2). A `module-widget` cannot:
 * the Registry `widget` contribution has no channel to declare that a widget
 * fires an action, and inferring one would silence the check on exactly the
 * case that motivated it — recorded as **finding F4** (owner: Registry).
 * `experience-unit` cannot either: a Unit's `actionRefs` name actions and do
 * not place controls, and drawing a button from one would derive layout from
 * Experience (experience-spec §1.4.1 prohibition 2).
 */
export function slotSuppliedTriggers(
  slots: readonly SlotPlan<unknown>[],
  responseActions: readonly ResponseActionsDocumentLike[] = [],
): ReadonlySet<string> {
  const supplied = new Set<string>();
  if (responseActions.length === 0) return supplied;

  const walk = (entries: readonly SlotPlan<unknown>[]): void => {
    for (const entry of entries) {
      if (entry.slotType === 'embed-route') {
        // Transitive. The visited set that terminates cycles lives in
        // `planRoute`, so by the time a plan exists this walk is finite.
        walk(entry.slots);
        continue;
      }
      if (entry.slotType !== 'definition-form') continue;
      // An unresolved Definition renders an unavailable placeholder, not a
      // form, so it renders no control and supplies no trigger.
      if (entry.status !== 'ready') continue;

      for (const document of responseActions) {
        const target = targetDefinitionUrl(document);
        // A Response Actions document that names its target Definition only
        // supplies triggers to the slot bound to that Definition (§5.4). One
        // that names none is the pre-`targetDefinition` shape and applies to
        // any form slot — the honest read of a document that declined to say.
        if (target !== undefined && target !== entry.definitionRef) continue;
        const index = indexTriggers([document]);
        for (const id of index.actionIds) supplied.add(id);
        for (const [intent, publishers] of index.byIntent) {
          if (publishers.length === 1) supplied.add(intent);
        }
      }
    }
  };

  walk(slots);
  return supplied;
}

export function planTransitions(input: TransitionPlanInput): TransitionPlanResult {
  const { handle, app } = input;
  const documents = input.responseActions ?? [];
  const resolved = indexTriggers(documents);
  const diagnostics: SurfaceDiagnostic[] = [];
  const text: SurfaceStrings =
    typeof input.strings === 'function' ? input.strings : resolveSurfaceStrings(input.strings);

  const transitions = (handle.route.transitions ?? []).map((authored): PlannedTransition => {
    const trigger = String(authored.trigger);
    const to = String(authored.to);
    const target = routeInSurface(app, handle.surfaceId, to);
    const base: PlannedTransition = { trigger, to, status: 'fireable', reason: '' };
    if (typeof authored.when === 'string') base.when = authored.when;
    if (target) base.target = target;

    if (!target) {
      return {
        ...base,
        status: 'target-unresolved',
        reason: text('transitionTargetUnresolved', { to, trigger }),
      };
    }

    if (resolved.documentCount === 0) {
      return {
        ...base,
        status: 'no-response-actions-document',
        reason: text('transitionNoResponseActions', { to, trigger }),
      };
    }

    const byId = resolved.actionIds.has(trigger);
    const publishers = resolved.byIntent.get(trigger) ?? [];
    const actionId = byId ? trigger : publishers.length === 1 ? publishers[0] : undefined;

    if (actionId === undefined) {
      return {
        ...base,
        status: 'trigger-unresolved',
        reason: text(
          publishers.length > 1 ? 'transitionTriggerAmbiguous' : 'transitionTriggerUnresolved',
          { to, trigger },
        ),
      };
    }

    if (input.slotSuppliedTriggers?.has(trigger)) {
      return {
        ...base,
        actionId,
        status: 'supplied-by-slot',
        reason: text('transitionSuppliedBySlot', { to, trigger }),
      };
    }

    if (!input.hasExecutor) {
      return {
        ...base,
        actionId,
        status: 'no-executor',
        reason: text('transitionNoExecutor', { to, trigger }),
      };
    }

    return {
      ...base,
      actionId,
      status: 'fireable',
      reason: text('transitionFireable', { to, trigger }),
    };
  });

  for (const transition of transitions) {
    if (transition.status === 'fireable' || transition.status === 'supplied-by-slot') continue;
    diagnostics.push(
      surfaceDiagnostic(
        'TRANSITION-UNFIREABLE',
        `Route "${handle.surfaceId}/${handle.routeId}" declares a "${transition.trigger}" transition to "${transition.to}" that nothing can fire (${transition.status}).`,
        { surfaceId: handle.surfaceId, routeId: handle.routeId },
        { trigger: transition.trigger, to: transition.to, status: transition.status },
      ),
    );
  }

  return { transitions, diagnostics };
}
