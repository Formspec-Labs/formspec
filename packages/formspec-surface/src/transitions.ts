/**
 * @filedesc Transitions — and the decision the surface-render-v10 spike forced.
 *
 * ## The question
 *
 * The spike's `/certify` route declares
 * `transitions: [{trigger: "submit", to: "receipt"}]`. The bundle does carry a
 * Response Actions document, but this route renders only static content and a
 * module widget. Neither loaded artifact declares a control that can invoke the
 * submit action. The transition is authored, schema-valid and signed, yet the
 * route cannot traverse it. The spike hand-built a "Continue" button and
 * recorded it as gap ledger `transition-has-no-trigger-source`, with the
 * question:
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
 * ## What validation catches before runtime
 *
 * Surface lint walks the route graph for reachability (E606). App-graph
 * validation separately emits E611 when a resolved trigger has no
 * validator-readable control source on the route, including one reached through
 * an embed. E611 is a warning because validation cannot see a host executor or
 * private widget behaviour. Runtime planning still fails closed and reports the
 * actual posture.
 */
import { CLOSED_RESPONSE_ACTION_INTENTS } from '@formspec-org/app-graph';
import { surfaceDiagnostic, type SurfaceDiagnostic } from './diagnostics.js';
import {
  routeHref,
  routeInSurface,
  type SurfaceApp,
  type SurfaceRouteHandle,
} from './composition.js';
import type { SlotPlan } from './slot-plan.js';
import { resolveSurfaceStrings, type SurfaceStringOverrides, type SurfaceStrings } from './strings.js';

/**
 * The five runtime states pinned by Surface Shell §5.3.
 *
 * Refusal causes do not extend this state machine. They live in
 * {@link TransitionUnfireableReason}, so every binding can switch exhaustively
 * over the same five states while still telling the host why an edge is
 * unavailable.
 */
export type TransitionStatus =
  | 'supplied-by-slot'
  | 'fireable'
  | 'unfireable'
  | 'condition-false'
  | 'condition-unevaluable';

/** Closed reasons for the normative `unfireable` state. */
export type TransitionUnfireableReason =
  /** No Response Actions document is loaded, so no trigger can resolve. */
  | 'no-response-actions-document'
  /** A Response Actions document exists and does not publish this trigger. */
  | 'trigger-unresolved'
  /** The trigger resolves; no host executor can run it under Response Actions authority. */
  | 'no-executor'
  /** `to` names no route in this Surface. */
  | 'target-unresolved'
  /** `to` resolves, but its URL is refused because another route claims it. */
  | 'target-path-collision';

interface PlannedTransitionFields {
  trigger: string;
  to: string;
  when?: string;
  /** One sentence a person can read, naming what is missing. */
  reason: string;
  /** Resolved target, when `to` names a route in the same Surface. */
  target?: SurfaceRouteHandle;
  /** The Response Actions action id that would run, when one resolves. */
  actionId?: string;
  /** Exception text from the host evaluator, retained for the diagnostic. */
  conditionFailureReason?: string;
}

/**
 * A planned edge with the normative state separated from its refusal cause.
 * `unfireableReason` is required exactly when `status` is `unfireable`.
 */
export type PlannedTransition =
  | (PlannedTransitionFields & {
      status: Exclude<TransitionStatus, 'unfireable'>;
      unfireableReason?: never;
    })
  | (PlannedTransitionFields & {
      status: 'unfireable';
      unfireableReason: TransitionUnfireableReason;
    });

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

/**
 * Evaluates a Surface FEL condition against validated bundle state owned by the
 * host. `undefined` means the host could not evaluate the expression.
 */
export type TransitionConditionEvaluator = (request: {
  expression: string;
  transition: { trigger: string; to: string; when: string };
  from: SurfaceRouteHandle;
  params: Readonly<Record<string, string>>;
}) => boolean | undefined;

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
  /** Host-owned FEL evaluation over the validated bundle state. */
  evaluateCondition?: TransitionConditionEvaluator | undefined;
  /** Route parameters available to the FEL evaluator. */
  params?: Readonly<Record<string, string>> | undefined;
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
 * The one Response Actions document the form renderer may use for a Definition.
 *
 * Missing and repeated targets both fail closed. Choosing the first document
 * would let `slotSuppliedTriggers` claim one control while the binding renders
 * another, which recreates the silent dead edge this check exists to prevent.
 */
export function responseActionsDocumentForDefinition(
  documents: readonly ResponseActionsDocumentLike[],
  definitionRef: string,
): ResponseActionsDocumentLike | undefined {
  const matching = documents.filter(
    (document) => targetDefinitionUrl(document) === definitionRef,
  );
  return matching.length === 1 ? matching[0] : undefined;
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
 * 2. **The check follows the control this binding actually places.**
 *    `FormspecForm` auto-places one submit-intent Action and no other action.
 *    A plan that credited every published action would report a control that
 *    does not exist. The selected document and submit Action must each be
 *    unique, and the document must target the rendered Definition.
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

      const document = responseActionsDocumentForDefinition(
        responseActions,
        entry.definitionRef,
      );
      if (!document) continue;
      const submitActions = (document.actions ?? []).filter(
        (action) => action.intent === 'submit' && typeof action.id === 'string',
      );
      if (submitActions.length !== 1) continue;
      supplied.add('submit');
      supplied.add(submitActions[0]!.id as string);
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
    const base: PlannedTransitionFields = { trigger, to, reason: '' };
    if (typeof authored.when === 'string') base.when = authored.when;
    if (target) base.target = target;

    if (typeof authored.when === 'string') {
      let condition: boolean | undefined;
      let reason: string | undefined;
      try {
        condition = input.evaluateCondition?.({
          expression: authored.when,
          transition: { trigger, to, when: authored.when },
          from: handle,
          params: input.params ?? {},
        });
      } catch (error) {
        reason = error instanceof Error ? error.message : String(error);
      }

      if (condition === false) {
        return {
          ...base,
          status: 'condition-false',
          reason: 'This transition is dormant because its condition is false.',
        };
      }
      if (condition !== true) {
        return {
          ...base,
          status: 'condition-unevaluable',
          reason: 'This transition is unavailable because its condition could not be evaluated.',
          ...(reason === undefined ? {} : { conditionFailureReason: reason }),
        };
      }
    }

    if (!target) {
      return {
        ...base,
        status: 'unfireable',
        unfireableReason: 'target-unresolved',
        reason: text('transitionTargetUnresolved', { to, trigger }),
      };
    }

    if (routeHref(target, input.params ?? {}).refusal === 'collision') {
      return {
        ...base,
        status: 'unfireable',
        unfireableReason: 'target-path-collision',
        reason: text('transitionTargetCollision', { to, trigger }),
      };
    }

    if (resolved.documentCount === 0) {
      return {
        ...base,
        status: 'unfireable',
        unfireableReason: 'no-response-actions-document',
        reason: text('transitionNoResponseActions', { to, trigger }),
      };
    }

    const byId = resolved.actionIds.has(trigger);
    const publishers = resolved.byIntent.get(trigger) ?? [];
    const actionId = byId ? trigger : publishers.length === 1 ? publishers[0] : undefined;

    if (actionId === undefined) {
      return {
        ...base,
        status: 'unfireable',
        unfireableReason: 'trigger-unresolved',
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
        status: 'unfireable',
        unfireableReason: 'no-executor',
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
    if (
      transition.status === 'fireable' ||
      transition.status === 'supplied-by-slot' ||
      transition.status === 'condition-false'
    ) {
      continue;
    }
    if (transition.status === 'condition-unevaluable') {
      const reason =
        'conditionFailureReason' in transition &&
        typeof transition.conditionFailureReason === 'string'
          ? transition.conditionFailureReason
          : undefined;
      diagnostics.push(
        surfaceDiagnostic(
          'TRANSITION-CONDITION-UNEVALUABLE',
          `Route "${handle.surfaceId}/${handle.routeId}" declares a condition on its "${transition.trigger}" transition that the host could not evaluate. The transition is unavailable.`,
          { surfaceId: handle.surfaceId, routeId: handle.routeId },
          {
            trigger: transition.trigger,
            to: transition.to,
            when: transition.when,
            ...(reason === undefined ? {} : { reason }),
          },
        ),
      );
      continue;
    }
    diagnostics.push(
      surfaceDiagnostic(
        'TRANSITION-UNFIREABLE',
        `Route "${handle.surfaceId}/${handle.routeId}" declares a "${transition.trigger}" transition to "${transition.to}" that nothing can fire (${transition.unfireableReason}).`,
        { surfaceId: handle.surfaceId, routeId: handle.routeId },
        {
          trigger: transition.trigger,
          to: transition.to,
          status: transition.status,
          unfireableReason: transition.unfireableReason,
        },
      ),
    );
  }

  return { transitions, diagnostics };
}
