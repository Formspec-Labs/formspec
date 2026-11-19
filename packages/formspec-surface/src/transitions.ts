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
import {
  autoPlacedDefinitionActions,
  createFormEngine,
  isFormspecEngineInitialized,
  isPlainJsonArray,
  isPlainJsonObject,
  isValidDefinitionResponseActionsDocument,
  resolveResponseAction,
  type IFormEngine,
} from '@formspec-org/engine';
import {
  extractBreakpointEntries,
  matchBreakpoint,
  planDefinitionLayout,
  type BreakpointSpec,
  type LayoutNode,
  type ThemeDocument as LayoutThemeDocument,
} from '@formspec-org/layout';
import type { ComponentDocument, FormDefinition, ThemeDocument } from '@formspec-org/types';
import { surfaceDiagnostic, type SurfaceDiagnostic } from './diagnostics.js';
import {
  routeHref,
  routeInSurface,
  type SurfaceApp,
  type SurfaceRouteHandle,
} from './composition.js';
import type { SlotPlan } from './slot-plan.js';
import { resolveSurfaceStrings, type SurfaceStringOverrides, type SurfaceStrings } from './strings.js';
import { generationNeedAnchors } from './need-trace.js';

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
  /**
   * Authored target-route parameter mapping. Keys are parameters declared by
   * the target route; values name allowlisted runtime bindings returned by the
   * completed Response Action.
   */
  params?: Readonly<Record<string, string>>;
  /** Direct authored Need anchors for this rendered transition feature. */
  needAnchors?: readonly string[];
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
  /** Explicit application scope is required before a module-widget may invoke an action. */
  scope?: unknown;
  /** The Definition this document binds to. `E611`'s "targeting the Definition that slot binds". */
  targetDefinition?: { url?: unknown } | undefined;
  actions?: readonly {
    id?: unknown;
    intent?: unknown;
    label?: unknown;
    'x-generation'?: unknown;
  }[];
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
  /** action id -> one entry per declaration; repeated ids remain ambiguous. */
  byId: Map<string, number>;
  /** intent → action ids publishing it. A trigger resolves only at exactly one. */
  byIntent: Map<string, string[]>;
  documentCount: number;
}

function ownDataPropertyValue(obj: unknown, key: string): { present: boolean; value: unknown } {
  if (!isPlainJsonObject(obj)) return { present: false, value: undefined };
  const descriptor = Object.getOwnPropertyDescriptor(obj, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return { present: false, value: undefined };
  }
  return { present: true, value: descriptor.value };
}

function ownPlainActions(document: unknown): readonly Record<string, unknown>[] {
  const prop = ownDataPropertyValue(document, 'actions');
  if (!prop.present || !isPlainJsonArray(prop.value)) return [];
  const actions: Record<string, unknown>[] = [];
  for (let index = 0; index < prop.value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(prop.value, String(index));
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return [];
    if (!isPlainJsonObject(descriptor.value)) continue;
    actions.push(descriptor.value);
  }
  return actions;
}

function indexTriggers(documents: readonly ResponseActionsDocumentLike[]): ResolvedTriggers {
  const byId = new Map<string, number>();
  const byIntent = new Map<string, string[]>();
  for (const document of documents) {
    for (const action of ownPlainActions(document)) {
      const idProp = ownDataPropertyValue(action, 'id');
      const id = idProp.present && typeof idProp.value === 'string' ? idProp.value : undefined;
      if (!id) continue;
      byId.set(id, (byId.get(id) ?? 0) + 1);
      const intentProp = ownDataPropertyValue(action, 'intent');
      const intent = intentProp.present && typeof intentProp.value === 'string' ? intentProp.value : undefined;
      if (intent && CLOSED_RESPONSE_ACTION_INTENTS.has(intent)) {
        byIntent.set(intent, [...(byIntent.get(intent) ?? []), id]);
      }
    }
  }
  return { byId, byIntent, documentCount: documents.length };
}

function targetDefinitionUrl(document: ResponseActionsDocumentLike): string | undefined {
  const targetProp = ownDataPropertyValue(document, 'targetDefinition');
  if (!targetProp.present) return undefined;
  const urlProp = ownDataPropertyValue(targetProp.value, 'url');
  return urlProp.present && typeof urlProp.value === 'string' ? urlProp.value : undefined;
}

function isApplicationScoped(document: ResponseActionsDocumentLike): boolean {
  if (!isPlainJsonObject(document)) return false;
  const scopeProp = ownDataPropertyValue(document, 'scope');
  return scopeProp.present && scopeProp.value === 'app' && targetDefinitionUrl(document) === undefined;
}

function isDefinitionScoped(document: ResponseActionsDocumentLike): boolean {
  if (!isPlainJsonObject(document)) return false;
  const hasScope = Object.prototype.hasOwnProperty.call(document, 'scope');
  if (hasScope) {
    const scopeProp = ownDataPropertyValue(document, 'scope');
    if (!scopeProp.present || (scopeProp.value !== undefined && scopeProp.value !== 'response')) {
      return false;
    }
  }
  return targetDefinitionUrl(document) !== undefined;
}

/**
 * The one Response Actions document the form renderer may use for a Definition.
 *
 * Missing and repeated targets both fail closed. Choosing the first document
 * would let `slotSuppliedTriggers` claim one control while the binding renders
 * another, which recreates the silent dead edge this check exists to prevent.
 */
export function responseActionsDocumentForDefinition<
  TDocument extends ResponseActionsDocumentLike,
>(
  documents: readonly TDocument[],
  definitionRef: string,
): TDocument | undefined {
  const matching = documents.filter(
    (document) =>
      isDefinitionScoped(document)
      && targetDefinitionUrl(document) === definitionRef,
  );
  return matching.length === 1 ? matching[0] : undefined;
}

/**
 * Every resolved `Action.id` a control **already on this route** can raise.
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
 * 2. **The check follows the exact controls this binding actually places.**
 *    First, the Definition-scoped Response Actions document is validated
 *    fail-closed with the renderer's own document predicate. Then the slot's
 *    layout plan (explicit `ComponentDocument` tree when selected, plus
 *    `autoPlacedDefinitionActions` fallback controls) determines the exact
 *    rendered `ActionButton` `actionRef`s — crediting explicitly authored
 *    `autosave` buttons while excluding unauthored background actions. Only
 *    exact resolved `Action.id` values enter this set so `planTransitions` and
 *    completion matching preserve exact-ID precedence over intent triggers.
 *
 * A module widget contributes only through the complete declared chain:
 * Registry action output -> Surface action binding -> exact loaded action.
 * Private widget behaviour and coincident names contribute nothing.
 * `experience-unit` cannot contribute: a Unit's `actionRefs` name actions and
 * do not place controls, and drawing a button from one would derive layout from
 * Experience (experience-spec §1.4.1 prohibition 2).
 */
export interface SlotSuppliedTriggersOptions {
  includeWidgetActions?: boolean | undefined;
  /** Effective route Theme grant used by mounted Definition forms. */
  themeDocument?: ThemeDocument | undefined;
  /** Explicit active breakpoint override when already known by the caller. */
  activeBreakpoint?: string | null | undefined;
  /** Pure viewport predicate `(minWidthPx) => boolean` for responsive Component/Theme planning. */
  matchesMinWidth?: ((minWidthPx: number) => boolean) | undefined;
  /** Mounted Definition form engines keyed by slot path (`slotId` or `embedSlotId/childSlotId`) for live visibility evaluation. */
  slotFormEngines?: ReadonlyMap<string, IFormEngine> | undefined;
  /** Mounted Definition form reachable action refs keyed by slot path (`slotId` or `embedSlotId/childSlotId`), measured from live DOM/computed styles. */
  slotRenderedActionRefs?: ReadonlyMap<string, ReadonlySet<string>> | undefined;
}

/**
 * Collect sorted unique numeric `minWidth` thresholds declared across a route's
 * granted Theme and all `definition-form` Component documents (descending `embed-route`).
 */
export function collectSlotBreakpointThresholds(
  slots: readonly SlotPlan<unknown>[],
  themeDocument?: ThemeDocument | undefined,
): readonly number[] {
  const thresholds = new Set<number>();
  const themeBreakpoints = (themeDocument as { breakpoints?: Record<string, BreakpointSpec> } | undefined)?.breakpoints;
  for (const [, width] of extractBreakpointEntries(themeBreakpoints, undefined)) {
    thresholds.add(width);
  }
  const walk = (entries: readonly SlotPlan<unknown>[]): void => {
    for (const entry of entries) {
      if (entry.slotType === 'embed-route') {
        walk(entry.slots);
        continue;
      }
      if (entry.slotType !== 'definition-form') continue;
      const componentBreakpoints = (
        entry.componentDocument as { breakpoints?: Record<string, BreakpointSpec> } | undefined
      )?.breakpoints;
      for (const [, width] of extractBreakpointEntries(themeBreakpoints, componentBreakpoints)) {
        thresholds.add(width);
      }
    }
  };
  walk(slots);
  return [...thresholds].sort((a, b) => a - b);
}

export function slotSuppliedTriggers(
  slots: readonly SlotPlan<unknown>[],
  responseActions: readonly ResponseActionsDocumentLike[] = [],
  options: SlotSuppliedTriggersOptions = {},
): ReadonlySet<string> {
  const supplied = new Set<string>();
  if (responseActions.length === 0) return supplied;
  const actionDeclarations = responseActions.flatMap((document) =>
    ownPlainActions(document).map((action) => ({
      document,
      action,
      id: (() => {
        const prop = ownDataPropertyValue(action, 'id');
        return prop.present && typeof prop.value === 'string' ? prop.value : undefined;
      })(),
    })),
  );

  const walk = (entries: readonly SlotPlan<unknown>[], prefix = ''): void => {
    for (const entry of entries) {
      const slotKey = `${prefix}${entry.slotId}`;
      if (entry.slotType === 'embed-route') {
        // Transitive. The visited set that terminates cycles lives in
        // `planRoute`, so by the time a plan exists this walk is finite.
        walk(entry.slots, `${slotKey}/`);
        continue;
      }
      if (entry.slotType === 'module-widget') {
        if (options.includeWidgetActions === false) continue;
        for (const output of entry.actionOutputs) {
          if (!output.actionRef) continue;
          const matches = actionDeclarations.filter(
            ({ id }) => typeof id === 'string' && id === output.actionRef,
          );
          if (matches.length !== 1) continue;
          const match = matches[0];
          if (!match || !output.action) continue;
          if (!isApplicationScoped(match.document) && (!output.responseContext
            || output.responseContext.definition.url !== targetDefinitionUrl(match.document))) continue;
          if (typeof match.id !== 'string') continue;
          supplied.add(match.id);
        }
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
      const definitionTarget: FormDefinition = entry.definition ?? {
        $formspec: '1.0',
        url: entry.definitionRef,
        version: '1.0.0',
        title: '',
        items: [],
      };
      const validationTarget = entry.definition
        ? { url: entry.definitionRef, version: entry.definition.version }
        : { url: entry.definitionRef };
      if (!isValidDefinitionResponseActionsDocument(document, validationTarget)) {
        continue;
      }

      const mountedActionRefs = options.slotRenderedActionRefs?.get(slotKey);
      const slotEngine = options.slotFormEngines?.get(slotKey);
      const actionRefs = mountedActionRefs ?? plannedDefinitionFormActionRefs(
        definitionTarget,
        entry.componentDocument,
        document,
        {
          ...options,
          ...(slotEngine !== undefined ? { evalEngine: slotEngine } : {}),
        },
      );
      for (const actionRef of actionRefs) {
        if (!resolveResponseAction(document, actionRef).resolved) continue;
        const idMatches = actionDeclarations.filter(
          ({ id }) => typeof id === 'string' && id === actionRef,
        );
        if (idMatches.length !== 1) continue;
        supplied.add(actionRef);
      }
    }
  };

  walk(slots);
  return supplied;
}

function layoutNeedsEngineEvaluation(node: LayoutNode): boolean {
  if (typeof node.when === 'string' && node.when.length > 0) return true;
  if (node.isRepeatTemplate && node.repeatPath) return true;
  if (node.component === 'Accordion' && typeof node.props?.bind === 'string') return true;
  if (
    node.bindPath
    && node.category !== 'field'
    && node.category !== 'display'
    && node.component !== 'ActionButton'
    && node.component !== 'DataTable'
  ) {
    return true;
  }
  return node.children.some(layoutNeedsEngineEvaluation);
}

function rewriteRepeatInstance(node: LayoutNode, repeatPath: string, instanceIdx: number): LayoutNode {
  const templatePrefix = `${repeatPath}[0]`;
  const groupScopePrefix = `${repeatPath}.`;
  const instancePrefix = `${repeatPath}[${instanceIdx}]`;

  function instantiate(path: string | undefined): string | undefined {
    if (path === templatePrefix || path?.startsWith(`${templatePrefix}.`)) {
      return instancePrefix + path.slice(templatePrefix.length);
    }
    if (path?.startsWith(groupScopePrefix)) {
      return `${instancePrefix}.${path.slice(groupScopePrefix.length)}`;
    }
    return path;
  }

  const bind = typeof node.props?.bind === 'string' ? node.props.bind : undefined;
  const resolvedBind = instantiate(bind);
  const nextBindPath = instantiate(node.bindPath);
  const nextRepeatPath = instantiate(node.repeatPath);
  const nextWhenPrefix = instantiate(node.whenPrefix);
  const { bindPath: _bp, repeatPath: _rp, whenPrefix: _wp, ...rest } = node;
  return {
    ...rest,
    id: `${node.id}-${instanceIdx}`,
    ...(nextBindPath !== undefined ? { bindPath: nextBindPath } : {}),
    ...(nextRepeatPath !== undefined ? { repeatPath: nextRepeatPath } : {}),
    ...(nextWhenPrefix !== undefined ? { whenPrefix: nextWhenPrefix } : {}),
    props: resolvedBind === bind ? node.props : { ...node.props, bind: resolvedBind },
    children: node.children.map((child) => rewriteRepeatInstance(child, repeatPath, instanceIdx)),
  };
}

function collectRenderedActionRefs(
  node: LayoutNode,
  out: Set<string>,
  evalEngine: IFormEngine | undefined,
  inheritedHiddenVisibility = false,
): void {
  const rawDisplay = typeof node.style?.display === 'string'
    ? node.style.display.trim().toLowerCase()
    : '';
  if (node.props?.hidden === true || rawDisplay === 'none') {
    return;
  }
  const rawVisibility = typeof node.style?.visibility === 'string'
    ? node.style.visibility.trim().toLowerCase()
    : '';
  const hiddenVisibility = rawVisibility === 'hidden' || rawVisibility === 'collapse'
    ? true
    : rawVisibility === 'visible' || rawVisibility === 'initial' || rawVisibility === 'revert'
      ? false
      : inheritedHiddenVisibility;

  const repeatPath = node.isRepeatTemplate && node.repeatPath
    ? node.repeatPath
    : node.component === 'Accordion' && typeof node.props?.bind === 'string'
      ? node.props.bind
      : undefined;
  if (repeatPath) {
    if (!evalEngine) return;
    const count = evalEngine.repeats[repeatPath]?.value ?? 0;
    for (let index = 0; index < count; index += 1) {
      for (const child of node.children) {
        collectRenderedActionRefs(
          rewriteRepeatInstance(child, repeatPath, index),
          out,
          evalEngine,
          hiddenVisibility,
        );
      }
    }
    return;
  }

  if (typeof node.when === 'string' && node.when.length > 0) {
    if (!evalEngine) return;
    try {
      if (!evalEngine.compileExpression(node.when, node.whenPrefix ?? '')()) {
        return;
      }
    } catch {
      return;
    }
  }

  if (
    node.bindPath
    && node.category !== 'field'
    && node.category !== 'display'
    && node.component !== 'ActionButton'
    && node.component !== 'DataTable'
  ) {
    const relevance = evalEngine?.relevantSignals[node.bindPath];
    if (relevance && !relevance.value) {
      return;
    }
  }

  if (node.component === 'ActionButton') {
    if (!hiddenVisibility) {
      const actionRef = node.props?.actionRef;
      if (typeof actionRef === 'string' && actionRef.length > 0) {
        out.add(actionRef);
      }
    }
    // ActionButton is a leaf widget; it never renders `node.children`.
    return;
  }

  for (const child of node.children) {
    collectRenderedActionRefs(child, out, evalEngine, hiddenVisibility);
  }
}

export function plannedDefinitionFormActionRefs(
  definition: FormDefinition,
  componentDocument: ComponentDocument | undefined,
  responseActionsDocument: Parameters<typeof autoPlacedDefinitionActions>[0],
  options: Pick<SlotSuppliedTriggersOptions, 'themeDocument' | 'activeBreakpoint' | 'matchesMinWidth'> & {
    evalEngine?: IFormEngine | undefined;
  } = {},
): ReadonlySet<string> {
  const themeBreakpoints = (options.themeDocument as { breakpoints?: Record<string, BreakpointSpec> } | undefined)?.breakpoints;
  const componentBreakpoints = (componentDocument as { breakpoints?: Record<string, BreakpointSpec> } | undefined)?.breakpoints;
  const activeBreakpoint = options.activeBreakpoint !== undefined
    ? options.activeBreakpoint
    : options.matchesMinWidth
      ? matchBreakpoint(themeBreakpoints, componentBreakpoints, options.matchesMinWidth)
      : null;

  const { root } = planDefinitionLayout({
    definition,
    componentDocument,
    themeDocument: options.themeDocument as LayoutThemeDocument | undefined,
    activeBreakpoint,
    autoPlacedActionRefs: autoPlacedDefinitionActions(responseActionsDocument, definition).map((action) => action.id),
    autoPlaceControls: 'always',
  });

  const refs = new Set<string>();
  let ownedEngine: IFormEngine | undefined;
  try {
    let evalEngine = options.evalEngine;
    if (!evalEngine && layoutNeedsEngineEvaluation(root) && isFormspecEngineInitialized()) {
      try {
        ownedEngine = createFormEngine(definition);
        evalEngine = ownedEngine;
      } catch {
        evalEngine = undefined;
      }
    }
    collectRenderedActionRefs(root, refs, evalEngine);
  } finally {
    ownedEngine?.dispose();
  }
  return refs;
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
    const base: PlannedTransitionFields = {
      trigger,
      to,
      needAnchors: generationNeedAnchors(authored),
      reason: '',
    };
    if (typeof authored.when === 'string') base.when = authored.when;
    if (authored.params && typeof authored.params === 'object') {
      base.params = Object.freeze({ ...authored.params });
    }
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

    const idMatches = resolved.byId.get(trigger) ?? 0;
    const publishers = resolved.byIntent.get(trigger) ?? [];
    const actionId = idMatches > 0
      ? idMatches === 1 ? trigger : undefined
      : publishers.length === 1 ? publishers[0] : undefined;

    if (actionId === undefined) {
      return {
        ...base,
        status: 'unfireable',
        unfireableReason: 'trigger-unresolved',
        reason: text(
          idMatches > 1 || publishers.length > 1
            ? 'transitionTriggerAmbiguous'
            : 'transitionTriggerUnresolved',
          { to, trigger },
        ),
      };
    }

    if (input.slotSuppliedTriggers?.has(actionId)) {
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
