/**
 * @filedesc The ONE exemplar — a rent-assistance application, declared once and
 * consumed by every stage.
 *
 * It is the ADR 0152 §9 acceptance bundle (`demo-beats-adr-0152.test.ts`),
 * extended with the two routes the later stages need and the bundle did not
 * have: a `ceremony` route (the app's own signature moment) and a `proof` route
 * (the artifact a third party relies on, and the refusing side of the
 * THEME-ROUTE-CLASS measurement). Extending the acceptance bundle rather than
 * picking a fresh corpus member is what makes the delta against ADR 0159
 * follow-on 1's "2 of 6 stages" legible.
 *
 * The brief lines are load-bearing, not decoration: each one is the origin of
 * exactly one Experience unit, and bar 1 walks that mapping.
 */

export const BUNDLE_ID = 'https://benefits.example.gov/apps/assistance';
export const SURFACE_URL = `${BUNDLE_ID}/surfaces/respondent`;
export const SURFACE_ID = 'respondent';
/**
 * The staff console is its own Surface, not a fourth route on the respondent's.
 *
 * Not a stylistic choice — the route-graph lint requires every route to be
 * reachable from the Surface entry, and a caseworker queue reachable from an
 * applicant's receipt would be a lie about the app to satisfy a linter. Two
 * surfaces in one bundle is the truthful shape, and it is what
 * `bundle-manifest.schema.json` `surfaces[]` is plural for.
 */
export const STAFF_SURFACE_URL = `${BUNDLE_ID}/surfaces/staff`;
export const STAFF_SURFACE_ID = 'staff';
export const DEFINITION_URL = `${BUNDLE_ID}/definitions/rent-assistance`;
export const TENANT_MODULE = 'x-formspec-tenant-chrome';
export const APP_TITLE = 'Rent assistance application';

/** One line of the brief. `unitId` is the Experience unit it becomes at stage 1. */
export interface BriefLine {
  id: string;
  text: string;
  unitId: string;
}

/**
 * The brief, as a person would write it. Stage 1 turns each line into one
 * Experience unit; nothing else in the walk invents a unit.
 *
 * **No verb persists this text.** `wireframeFromBrief` takes a `brief` string
 * and discards it — it forwards only `id`, `version` and `title` to
 * `createBundle`. The brief therefore survives into the substrate only as the
 * units it produced, which is precisely the hop bar 1 has to measure rather
 * than assume.
 */
export const BRIEF: readonly BriefLine[] = [
  {
    id: 'B1',
    text: 'A tenant behind on rent tells us about their household and what went wrong.',
    unitId: 'applyForHelp',
  },
  {
    id: 'B2',
    text: 'Before it counts, they sign a declaration that what they said is true.',
    unitId: 'certifyDeclaration',
  },
  {
    id: 'B3',
    text: 'They get a receipt they can show a landlord or a court.',
    unitId: 'collectReceipt',
  },
  {
    id: 'B4',
    text: 'A caseworker works through the queue and decides.',
    unitId: 'reviewApplication',
  },
];

/** The full brief text handed to `wireframeFromBrief`. */
export const BRIEF_TEXT = BRIEF.map((line) => line.text).join(' ');

export interface UnitSpec {
  unitId: string;
  /** `experience.schema.json` `$defs/UnitKind` closed-core value. */
  kind: 'data-entry' | 'review' | 'confirmation' | 'evidence-collection' | 'attestation' | 'error-resolution' | 'assistance';
  title: string;
  actorRef: string;
  taskRefs: string[];
  fromBrief: string;
}

export const UNITS: readonly UnitSpec[] = [
  { unitId: 'applyForHelp', kind: 'data-entry', title: 'Tell us about your household', actorRef: 'applicant', taskRefs: ['submitApplication'], fromBrief: 'B1' },
  { unitId: 'certifyDeclaration', kind: 'attestation', title: 'Sign your declaration', actorRef: 'applicant', taskRefs: ['certifyTruth'], fromBrief: 'B2' },
  { unitId: 'collectReceipt', kind: 'confirmation', title: 'Keep your receipt', actorRef: 'applicant', taskRefs: ['proveSubmission'], fromBrief: 'B3' },
  { unitId: 'reviewApplication', kind: 'review', title: 'Work the queue', actorRef: 'caseworker', taskRefs: ['decideApplication'], fromBrief: 'B4' },
];

export interface ItemSpec {
  path: string;
  label: string;
  dataType: string;
  /** The brief line whose unit this item serves. */
  fromBrief: string;
}

export const ITEMS: readonly ItemSpec[] = [
  { path: 'householdSize', label: 'Household size', dataType: 'integer', fromBrief: 'B1' },
  { path: 'monthlyRent', label: 'Monthly rent', dataType: 'decimal', fromBrief: 'B1' },
  { path: 'monthsBehind', label: 'Months behind on rent', dataType: 'integer', fromBrief: 'B1' },
  { path: 'hardshipReason', label: 'What happened', dataType: 'text', fromBrief: 'B1' },
];

/** ADR 0161 §6 closed vocabulary. */
export type RouteClass = 'intake' | 'proof' | 'ceremony' | 'verification' | 'attestation' | 'authentication' | 'operation';

export interface SlotSpec {
  slotId: string;
  slotType: 'definition-form' | 'experience-unit' | 'module-widget' | 'static-content' | 'embed-route';
  binding: Record<string, unknown>;
  title?: string;
}

export interface RouteSpec {
  routeId: string;
  /** Which Surface this route lives on. */
  surfaceId: string;
  path: string;
  title: string;
  routeClass: RouteClass;
  /** Why this class and no other — quoted into the walkthrough. */
  why: string;
  /** The widget the tenant theme is pushed at. */
  chromeWidget: string;
  slots: SlotSpec[];
  transitionTo?: string;
}

export const ROUTES: readonly RouteSpec[] = [
  {
    routeId: 'apply',
    surfaceId: SURFACE_ID,
    path: '/apply',
    title: 'Apply for rent assistance',
    routeClass: 'intake',
    why: 'A Definition-backed capture from the person applying. The one class that admits a tenant putting their own brand on the page.',
    chromeWidget: 'x-intake-banner',
    slots: [
      { slotId: 'applyForm', slotType: 'definition-form', binding: { definitionRef: DEFINITION_URL }, title: 'Application form' },
      { slotId: 'applyJourney', slotType: 'experience-unit', binding: { unitRef: 'applyForHelp' }, title: 'Where you are' },
      { slotId: 'applyChrome', slotType: 'module-widget', binding: { moduleId: TENANT_MODULE, widgetName: 'x-intake-banner' } },
    ],
    transitionTo: 'certify',
  },
  {
    routeId: 'certify',
    surfaceId: SURFACE_ID,
    path: '/certify',
    title: 'Sign your declaration',
    routeClass: 'ceremony',
    why: 'The act of signing, as it happens. What the signer sees IS what is signed, so nobody else gets to restyle it.',
    chromeWidget: 'x-ceremony-frame',
    slots: [
      { slotId: 'certifyJourney', slotType: 'static-content', binding: { kind: 'heading', content: 'Your declaration', level: 1 }, title: 'Your declaration' },
      { slotId: 'certifyChrome', slotType: 'module-widget', binding: { moduleId: TENANT_MODULE, widgetName: 'x-ceremony-frame' } },
    ],
    transitionTo: 'receipt',
  },
  {
    routeId: 'receipt',
    surfaceId: SURFACE_ID,
    path: '/receipt/:caseRef',
    title: 'Your receipt',
    routeClass: 'proof',
    why: 'The page a landlord or a court reads as evidence. How it looks is part of what they rely on, so a tenant cannot restyle it.',
    chromeWidget: 'x-receipt-panel',
    slots: [
      { slotId: 'receiptJourney', slotType: 'static-content', binding: { kind: 'heading', content: 'What you submitted', level: 1 }, title: 'What you submitted' },
      { slotId: 'receiptChrome', slotType: 'module-widget', binding: { moduleId: TENANT_MODULE, widgetName: 'x-receipt-panel' } },
    ],
  },
  {
    routeId: 'queue',
    surfaceId: STAFF_SURFACE_ID,
    path: '/queue',
    title: 'Caseworker queue',
    routeClass: 'operation',
    why: 'Staff-facing product UI. It makes no claim to anyone outside the building — which is a statement in itself, not an absence of one.',
    chromeWidget: 'x-queue-panel',
    slots: [
      { slotId: 'queueJourney', slotType: 'static-content', binding: { kind: 'heading', content: 'Applications waiting for a decision', level: 1 }, title: 'The queue' },
      { slotId: 'queueChrome', slotType: 'module-widget', binding: { moduleId: TENANT_MODULE, widgetName: 'x-queue-panel' } },
    ],
  },
];

/**
 * Only the intake route mounts an `experience-unit` slot, and that is a
 * constraint rather than a choice.
 *
 * `surface-experience-units.ts` fires `APP-GRAPH-SURFACE-EXPERIENCE-UNIT-DEFINITION`
 * when a route mounts a unit from an Experience carrying a `targetDefinition`
 * and that route has no `definition-form` slot naming the same Definition. The
 * kernel stamps `targetDefinition` on the Experience automatically as soon as a
 * Definition is declared, so on a Definition-bearing bundle **every route that
 * mounts any unit must also carry that Definition's form** — including a
 * receipt, a signing screen, and a staff queue, none of which collect anything.
 *
 * A first run mounted units on all four routes and measured 3 of these errors,
 * all `verb-family`-scoped on a graph authored entirely through the verb family.
 * The truthful shape is the one here: the form route mounts its unit; the other
 * three carry static content. Recorded as a finding, not worked around silently
 * — the rule reads `targetDefinition` as "every unit collects for this form",
 * which is false of `attestation`, `confirmation` and `review` units.
 *
 */

/**
 * The routes the AI produces when it regenerates from the AMENDED brief.
 *
 * The change request splits the form across two pages, so regeneration is a
 * real structural change to the Surface rather than a re-run of the same
 * script. That matters for the moat measurement: a first run's change request
 * touched only the Definition, so `new-generated` came back byte-identical to
 * `old-generated` and a reader could fairly say the designer's edits were never
 * given a chance to be carried through. Here the regenerated Surface genuinely
 * differs — a new route, a rewired transition chain — and the question is
 * whether the two hand-made edits ride along.
 */
export const REGENERATED_ROUTES: readonly RouteSpec[] = ROUTES.flatMap((route) => {
  if (route.routeId !== 'apply') return [route];
  return [
    { ...route, title: 'About your household', transitionTo: 'applyMoney' },
    {
      routeId: 'applyMoney',
      surfaceId: SURFACE_ID,
      path: '/apply/money',
      title: 'Rent and income',
      routeClass: 'intake' as const,
      why: 'The second half of the same Definition-backed capture.',
      chromeWidget: 'x-intake-banner',
      slots: [
        { slotId: 'moneyForm', slotType: 'definition-form' as const, binding: { definitionRef: DEFINITION_URL }, title: 'Rent and income' },
        { slotId: 'moneyChrome', slotType: 'module-widget' as const, binding: { moduleId: TENANT_MODULE, widgetName: 'x-intake-banner' } },
      ],
      transitionTo: 'certify',
    },
  ];
});

/** The token every route's chrome widget is assigned — the tenant's brand colour. */
export const TENANT_TOKEN = 'color.accent';
export const TENANT_TOKEN_VALUE = '#7A1F3D';

/**
 * Every widget in this exemplar is named in the `^x-[a-z]…` contribution-id
 * form, and the same string is used as the Registry entry `name`, the
 * `widgetShape.widgetName`, the Surface binding's `widgetName`, and the UI Graph
 * Policy's `theme.assignments[].widgetRef.widgetName`.
 *
 * **That is forced, and the reason is ADR 0160 §8.1's naming hazard measured on
 * this exemplar.** The two constraints pull opposite ways:
 *
 * - `ui-graph-policy.schema.json` requires `theme.assignments[].widgetRef.widgetName`
 *   to match `^x-[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$` — the CONTRIBUTION-ID
 *   vocabulary. A PascalCase name there is `APP-GRAPH-SCHEMA`, which skips the
 *   whole `cross-artifact` phase (`reason: schema-errors`) and silences the guard.
 * - `validateThemeRouteClass` (`ui-graph-policy.ts`) joins an assignment to a
 *   route by `routeSlot.moduleWidget.widgetName === widgetRef.widgetName` — the
 *   SURFACE BINDING's vocabulary. Rewriting only the policy to `x-` form clears
 *   the schema and breaks the join, so the guard goes silent the other way.
 *
 * A first run of this spike took the PascalCase branch and measured exactly
 * what v9 measured: 4 `APP-GRAPH-SCHEMA` + 4 `MODULE-CONTRIBUTION-MISSING`, all
 * `host-evidence`-scoped, `cross-artifact` skipped, and ZERO `THEME-ROUTE-CLASS`
 * fires. Naming the widget in `x-` form everywhere is the only shape in which
 * the schema passes AND the trust guard can fire, so this exemplar takes it —
 * and records that ADR 0160 §8.1's closing trigger is still open.
 */
export function contributionIdFor(widgetName: string): string {
  return widgetName;
}

/**
 * The `submit` action the route transitions fire.
 *
 * `APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER` requires a route transition's
 * trigger to resolve to a loaded Response Actions action id, or to exactly one
 * action carrying that closed intent. `submit` is a closed VM `ActionIntent`,
 * so one action covers both transitions. There is no `declareResponseActions`
 * verb in the ADR 0160 v1 family; the kernel op `addAction` mints the document
 * on first call, which is rule 4.2(b) working.
 */
export const SUBMIT_ACTION = {
  id: 'submitApplication',
  intent: 'submit',
  effects: [{ type: 'hostEvent', eventName: 'application.submitted' }],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// The deliberate human edit — stage 3, and the subject of the moat bar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Two edits on the intake route, both landing in the exported Surface document
 * so survival at stage 6 is measurable byte-for-byte rather than inferred.
 *
 * They are separated because `regeneration-merge-spec.md` §5.3 classifies
 * insertion and modification as different delta classes with different merge
 * outcomes. A merge preserving one and dropping the other would be invisible if
 * only one edit existed.
 */
export const DESIGNER_INSERTION: SlotSpec = {
  slotId: 'applyReassurance',
  slotType: 'static-content',
  binding: {
    kind: 'text',
    content: 'You can apply even if you have already received help this year.',
  },
  title: 'Before you start',
};

export const DESIGNER_RETITLE = {
  slotId: 'applyForm',
  generatedTitle: 'Application form',
  designerTitle: 'About your household',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Stage 6 — the change request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The feedback that triggers regeneration. It changes the substrate (a new
 * question, a new unit) without touching either designer edit — which is what
 * makes preservation the only thing under test. A change request that also
 * rewrote the edited slot would confound the measurement.
 */
export const CHANGE_REQUEST = {
  id: 'CR1',
  from: 'Caseworker feedback after two weeks live',
  text: 'People are dropping out halfway through. Split the form: ask about the household on one page and about the money on the next. And we need to know whether any children live in the household.',
  addsItem: { path: 'childrenInHousehold', label: 'Children in the household', dataType: 'integer' } as ItemSpec & { fromBrief?: string },
  addsBriefLine: {
    id: 'B5',
    text: 'We also need to know whether any children live in the household.',
    unitId: 'declareChildren',
  } satisfies BriefLine,
  addsUnit: {
    unitId: 'declareChildren',
    kind: 'data-entry',
    title: 'Who else lives with you',
    actorRef: 'applicant',
    taskRefs: ['submitApplication'],
    fromBrief: 'B5',
  } satisfies UnitSpec,
} as const;
