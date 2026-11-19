/**
 * @filedesc `supplied-by-slot` is a WALK, not a lookup — `surface-shell-spec.md`
 * §5.2, §5.3.
 *
 * The shipped React binding derived supplied triggers with a hardcoded literal
 * intent and a scan of top-level `definition-form` slots only (divergence D13),
 * so a form inside an `embed-route` was not counted and no intent other than
 * `submit` was ever supplied-by-slot. Both are the same defect: substituting a
 * shortcut for the resolution rule surface-spec §4 already states. The
 * Definition renderer now places every structurally labeled response Action, so
 * this walk must credit the same exact controls without adding shell copies.
 */
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { composeSurfaceApp } from '../src/composition.js';
import { createWidgetRegistry } from '../src/registry.js';
import { planRoute, type SlotPlan } from '../src/slot-plan.js';
import {
  planTransitions,
  responseActionsDocumentForDefinition,
  slotSuppliedTriggers,
} from '../src/transitions.js';
import type { FormDefinition } from '@formspec-org/types';
import { route, slot, surface } from './fixtures.js';

const DEF = 'https://example.test/def';
const OTHER_DEF = 'https://example.test/other';
const definition = { $formspec: '1.0', url: DEF, version: '1.0.0', items: [] } as unknown as FormDefinition;
const other = { $formspec: '1.0', url: OTHER_DEF, version: '1.0.0', items: [] } as unknown as FormDefinition;

const EFFECT = [{ type: 'hostEvent' as const, eventName: 'action-fired' }];
function actionsDoc(
  actions: Array<Record<string, unknown>>,
  targetUrl = DEF,
) {
  return {
    $formspecResponseActions: '1.0' as const,
    version: '1.0.0',
    scope: 'response' as const,
    targetDefinition: { url: targetUrl },
    actions: actions.map((action) => ({ effects: EFFECT, ...action })),
  };
}

const definitions = new Map([
  [DEF, definition],
  [OTHER_DEF, other],
]);

function slotsFor(
  surfaceDocument: ReturnType<typeof surface>,
  routeId: string,
  resolveDefinitionComponent?: Parameters<typeof planRoute>[0]['resolveDefinitionComponent'],
): readonly SlotPlan<unknown>[] {
  const app = composeSurfaceApp([surfaceDocument]);
  const handle = app.routes.find((candidate) => candidate.routeId === routeId)!;
  return planRoute<unknown>({
    handle,
    experiences: [],
    definitions,
    registryEntries: [],
    widgets: createWidgetRegistry<unknown>({}),
    ...(resolveDefinitionComponent ? { resolveDefinitionComponent } : {}),
  }).slots;
}

/** `host` embeds `inner`; `inner` carries the only form on the page. */
const embedding = surface('s', 'host', [
  route({
    id: 'host',
    path: '/host',
    slots: [slot({ id: 'panel', slotType: 'embed-route', binding: { routeRef: 'inner' } })] as never,
    transitions: [{ trigger: 'submit', to: 'done' }],
  }),
  route({
    id: 'inner',
    path: '/inner',
    slots: [slot({ id: 'form', slotType: 'definition-form', binding: { definitionRef: DEF } })] as never,
  }),
  route({ id: 'done', path: '/done', slots: [] as never }),
]);

describe('slotSuppliedTriggers', () => {
  it('descends an embed-route to find the form that renders the control', () => {
    // D13's first half: a shell that scans only a route's own slots[] reports a
    // working page as dead.
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      actionsDoc([{ id: 'submitApplication', intent: 'submit', label: { literal: 'Submit' } }]),
    ]);
    expect([...supplied].sort()).toEqual(['submitApplication']);
  });

  it('credits a literal-labeled review action that the Definition renderer places', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      actionsDoc([{ id: 'sendForReview', intent: 'review', label: { literal: 'Review form' } }]),
    ]);
    expect([...supplied].sort()).toEqual(['sendForReview']);
  });

  it('does not claim an action id when no labeled control will be rendered', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      actionsDoc([{ id: 'countersign', intent: 'review' }]),
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('supplies exact action ids while planTransitions still rejects an ambiguous intent trigger', () => {
    const responseActions = [
      actionsDoc([
        { id: 'a', intent: 'submit', label: { literal: 'Submit A' } },
        { id: 'b', intent: 'submit', label: { literal: 'Submit B' } },
      ]),
    ];
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), responseActions);
    expect(supplied.has('submit')).toBe(false);
    expect([...supplied].sort()).toEqual(['a', 'b']);
    const app = composeSurfaceApp([embedding]);
    const handle = app.routes.find((candidate) => candidate.routeId === 'host')!;
    const planned = planTransitions({ handle, app, responseActions, hasExecutor: false, slotSuppliedTriggers: supplied });
    expect(planned.transitions[0]).toMatchObject({ status: 'unfireable', unfireableReason: 'trigger-unresolved' });
  });

  it('does not credit duplicate action ids as rendered controls', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      actionsDoc([
        { id: 'same-action', intent: 'review', label: { literal: 'Review' } },
        { id: 'same-action', intent: 'submit', label: { literal: 'Submit' } },
      ]),
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('supplies nothing from a slot type §5.2 excludes', () => {
    // This module widget has no resolved Registry declaration or mapped output,
    // and an Experience unit's actionRefs name actions without placing
    // controls. Neither is a trigger source.
    const nonForm = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        slots: [
          slot({ id: 'w', slotType: 'module-widget', binding: { moduleId: 'm', widgetName: 'w' } }),
          slot({ id: 'u', slotType: 'experience-unit', binding: { unitRef: 'u' } }),
          slot({ id: 't', slotType: 'static-content', binding: { kind: 'text', content: 'x' } }),
        ] as never,
      }),
    ]);
    const supplied = slotSuppliedTriggers(slotsFor(nonForm, 'r'), [
      actionsDoc([{ id: 'submitApplication', intent: 'submit', label: { literal: 'Submit' } }]),
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('supplies nothing from a form whose Definition did not resolve', () => {
    const dangling = surface('s', 'r', [
      route({
        id: 'r',
        path: '/r',
        slots: [
          slot({ id: 'f', slotType: 'definition-form', binding: { definitionRef: 'urn:absent' } }),
        ] as never,
      }),
    ]);
    const supplied = slotSuppliedTriggers(slotsFor(dangling, 'r'), [
      actionsDoc([{ id: 'x', intent: 'submit', label: { literal: 'Submit' } }], 'urn:absent'),
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('honours targetDefinition — a document only supplies the slot it binds', () => {
    // `E611`'s "targeting the Definition that slot binds" (§5.4), at runtime.
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      actionsDoc([{ id: 'x', intent: 'submit', label: { literal: 'Submit' } }], OTHER_DEF),
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('supplies nothing when no Response Actions document is loaded', () => {
    expect([...slotSuppliedTriggers(slotsFor(embedding, 'host'), [])]).toEqual([]);
  });

  it('supplies nothing when more than one document targets the same Definition', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      actionsDoc([{ id: 'one', intent: 'submit', label: { literal: 'Submit one' } }]),
      actionsDoc([{ id: 'two', intent: 'submit', label: { literal: 'Submit two' } }]),
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('uses the same exact-one document selection the renderer consumes', () => {
    const selected = responseActionsDocumentForDefinition(
      [
        actionsDoc([{ id: 'other', intent: 'submit' }], OTHER_DEF),
        actionsDoc([{ id: 'submitApplication', intent: 'submit' }]),
      ],
      DEF,
    );
    expect(selected?.actions?.[0]?.id).toBe('submitApplication');
  });
});

describe('the walk, wired into planTransitions', () => {
  it('classifies a transition fired from inside an embed as supplied-by-slot', () => {
    const app = composeSurfaceApp([embedding]);
    const handle = app.routes.find((candidate) => candidate.routeId === 'host')!;
    const responseActions = [
      actionsDoc([{ id: 'submitApplication', intent: 'submit', label: { literal: 'Submit' } }]),
    ];
    const { transitions, diagnostics } = planTransitions({
      handle,
      app,
      responseActions,
      hasExecutor: false,
      slotSuppliedTriggers: slotSuppliedTriggers(slotsFor(embedding, 'host'), responseActions),
    });
    expect(transitions[0]?.status).toBe('supplied-by-slot');
    expect(diagnostics).toEqual([]);
  });

  it('suppresses a duplicate shell control for a rendered review action', () => {
    const reviewSurface = surface('s', 'review-host', [
      route({
        id: 'review-host',
        path: '/review',
        slots: [slot({
          id: 'form',
          slotType: 'definition-form',
          binding: { definitionRef: DEF },
        })] as never,
        transitions: [{ trigger: 'review', to: 'done' }],
      }),
      route({ id: 'done', path: '/done', slots: [] as never }),
    ]);
    const app = composeSurfaceApp([reviewSurface]);
    const handle = app.routes.find((candidate) => candidate.routeId === 'review-host')!;
    const responseActions = [
      actionsDoc([{ id: 'reviewForm', intent: 'review', label: { literal: 'Review form' } }]),
    ];

    const { transitions, diagnostics } = planTransitions({
      handle,
      app,
      responseActions,
      hasExecutor: false,
      slotSuppliedTriggers: slotSuppliedTriggers(
        slotsFor(reviewSurface, 'review-host'),
        responseActions,
      ),
    });

    expect(transitions[0]).toMatchObject({
      status: 'supplied-by-slot',
      actionId: 'reviewForm',
    });
    expect(diagnostics).toEqual([]);
  });
});

it('credits a Locale-reference-labelled action through the maintained embedded form walk', () => {
  const candidate = structuredClone(embedding);
  candidate.routes[0]!.transitions![0]!.trigger = 'prepare';
  const app = composeSurfaceApp([candidate]);
  const handle = app.routes.find(candidate => candidate.routeId === 'host')!;
  const responseActions = [
    actionsDoc([{ id: 'prepare', intent: 'submit', label: { ref: 'action.prepare' } }]),
  ];
  const supplied = slotSuppliedTriggers(slotsFor(candidate, 'host'), responseActions);
  expect([...supplied].sort()).toEqual(['prepare']);
  const result = planTransitions({ handle, app, responseActions, hasExecutor: false,
    slotSuppliedTriggers: supplied });
  expect(result.transitions[0]?.status).toBe('supplied-by-slot');
  expect(result.diagnostics).toEqual([]);
});

it.each([undefined, {}, [], { ref: '' }, { ref: ' ' }, { ref: 5 },
  { literal: '', ref: 'action.prepare' }, { literal: 'Prepare', ref: '' },
  { literal: 'Prepare', ref: 'action.prepare' }, { literal: false, ref: 'action.prepare' }])(
  'does not credit an invalid or ambiguous structured action label %s', label => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      actionsDoc([{ id: 'prepare', intent: 'submit', label }]),
    ]);
    expect([...supplied]).toEqual([]);
  },
);

it('does not credit background autosave actions as slot-supplied manual controls unless explicitly authored in ComponentDocument', () => {
  const responseActions = [
    actionsDoc([
      { id: 'save-draft', intent: 'save-draft', label: { literal: 'Save draft' } },
      { id: 'checkpoint', intent: 'autosave', label: { literal: 'Save as I go' } },
      { id: 'submit-form', intent: 'submit', label: { literal: 'Submit' } },
    ]),
  ];
  const autoSupplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), responseActions);
  expect([...autoSupplied].sort()).toEqual(['save-draft', 'submit-form']);
  expect(autoSupplied.has('autosave')).toBe(false);
  expect(autoSupplied.has('checkpoint')).toBe(false);

  // When ComponentDocument explicitly authors an ActionButton for checkpoint, it IS supplied-by-slot.
  const authoredSlots = slotsFor(embedding, 'host', () => ({
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: DEF },
    tree: {
      component: 'Stack',
      children: [
        { component: 'ActionButton', actionRef: 'checkpoint', label: { literal: 'Checkpoint now' } },
      ],
    },
  }) as never);
  const authoredSupplied = slotSuppliedTriggers(authoredSlots, responseActions);
  expect([...authoredSupplied].sort()).toEqual(['checkpoint', 'save-draft', 'submit-form']);

  const autosaveRoute = structuredClone(embedding);
  autosaveRoute.routes[0]!.transitions = [{ trigger: 'autosave', to: 'done' }];
  const app = composeSurfaceApp([autosaveRoute]);
  const handle = app.routes.find(c => c.routeId === 'host')!;
  const planned = planTransitions({
    handle,
    app,
    responseActions,
    hasExecutor: false,
    slotSuppliedTriggers: authoredSupplied,
  });
  expect(planned.transitions[0]).toMatchObject({
    status: 'supplied-by-slot',
    actionId: 'checkpoint',
  });
});

it('fails closed on invalid Response Actions documents (invalid validation override, missing effects, or unprefixed custom intent)', () => {
  const invalidTuple = actionsDoc([
    {
      id: 'autosave',
      intent: 'autosave',
      validation: { profile: 'off', blocking: 'block-on-error', persistence: 'draft-checkpoint' },
    },
    { id: 'submit-form', intent: 'submit', label: { literal: 'Submit' } },
  ]);
  expect([...slotSuppliedTriggers(slotsFor(embedding, 'host'), [invalidTuple])]).toEqual([]);

  const invalidIntent = actionsDoc([
    {
      id: 'autosav',
      intent: 'autosav',
      label: { literal: 'Save' },
      validation: { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' },
    },
    { id: 'submit-form', intent: 'submit', label: { literal: 'Submit' } },
  ]);
  expect([...slotSuppliedTriggers(slotsFor(embedding, 'host'), [invalidIntent])]).toEqual([]);

  const missingEffects = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    scope: 'response',
    targetDefinition: { url: DEF },
    actions: [{ id: 'submit-form', intent: 'submit', label: { literal: 'Submit' }, effects: [] }],
  };
  expect([...slotSuppliedTriggers(slotsFor(embedding, 'host'), [missingEffects])]).toEqual([]);
});

it('preserves exact-ID precedence: manual intent=save-draft button does not supply a transition bound by exact ID save-draft to a hidden autosave action', () => {
  const collisionSurface = structuredClone(embedding);
  collisionSurface.routes[0]!.transitions = [{ trigger: 'save-draft', to: 'done' }];
  const app = composeSurfaceApp([collisionSurface]);
  const handle = app.routes.find(c => c.routeId === 'host')!;
  const responseActions = [
    actionsDoc([
      { id: 'save-draft', intent: 'autosave' },
      { id: 'save', intent: 'save-draft', label: { literal: 'Save' } },
    ]),
  ];
  const supplied = slotSuppliedTriggers(slotsFor(collisionSurface, 'host'), responseActions);
  expect([...supplied]).toEqual(['save']);

  const planned = planTransitions({
    handle,
    app,
    responseActions,
    hasExecutor: false,
    slotSuppliedTriggers: supplied,
  });
  expect(planned.transitions[0]).toMatchObject({
    actionId: 'save-draft',
    status: 'unfireable',
    unfireableReason: 'no-executor',
  });
});

it('rejects incomplete preconditions identically to canonical JSON Schema and handles non-array actions containers without throwing', async () => {
  const { readFileSync } = await import('node:fs');
  const { default: Ajv2020 } = await import('ajv/dist/2020.js');
  const { isValidDefinitionResponseActionsDocument, autoPlacedDefinitionActions } = await import('@formspec-org/engine');

  const load = (name: string) =>
    JSON.parse(readFileSync(new URL(`../../../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
  const ajv = new Ajv2020({ strict: false, logger: false });
  ajv.addSchema(load('common'));
  ajv.addSchema(load('validation-mapping'));
  const validateSchema = ajv.compile(load('response-actions'));

  const incompletePrecondition = actionsDoc([
    {
      id: 'manual',
      intent: 'review',
      label: { literal: 'Review' },
      preconditions: [{ id: 'only-id' }],
    },
  ]);
  expect(validateSchema(incompletePrecondition)).toBe(false);
  expect(isValidDefinitionResponseActionsDocument(incompletePrecondition, { url: DEF })).toBe(false);
  expect([...slotSuppliedTriggers(slotsFor(embedding, 'host'), [incompletePrecondition])]).toEqual([]);
  expect(autoPlacedDefinitionActions(incompletePrecondition as never, { url: DEF })).toEqual([]);

  const nonArrayActions = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: DEF },
    actions: {},
  };
  expect(validateSchema(nonArrayActions)).toBe(false);
  expect([...slotSuppliedTriggers(slotsFor(embedding, 'host'), [nonArrayActions as never])]).toEqual([]);

  const app = composeSurfaceApp([embedding]);
  const handle = app.routes.find(c => c.routeId === 'host')!;
  expect(() =>
    planTransitions({
      handle,
      app,
      responseActions: [nonArrayActions as never],
      hasExecutor: false,
      slotSuppliedTriggers: slotSuppliedTriggers(slotsFor(embedding, 'host'), [nonArrayActions as never]),
    }),
  ).not.toThrow();
});

it('derives slot-supplied action IDs from the effective Theme grant and active responsive breakpoint in planMatchedRoute', async () => {
  const { planMatchedRoute } = await import('../src/route-plan.js');
  const { createThemeAuthority } = await import('../src/theme-authority.js');
  const { createWidgetRegistry } = await import('../src/registry.js');

  const definition = {
    $formspec: '1.0',
    url: DEF,
    version: '1.0.0',
    title: 'Filing',
    items: [{ key: 'answer', type: 'field' as const, dataType: 'string' as const, label: 'Answer' }],
  };
  const responseActions = [
    actionsDoc([
      { id: 'save', intent: 'save-draft', label: { literal: 'Save draft' } },
      { id: 'autosave', intent: 'autosave', label: { literal: 'Autosave' } },
    ]),
  ];

  // Case 1: Authored Theme pages rebuild root children from Definition items/regions, dropping unbound authored Checkpoint button.
  // Surface must see the same themed plan and keep the shell transition fireable instead of hiding both controls.
  const themedSurface = structuredClone(embedding);
  themedSurface.routes = [
    {
      id: 'filing',
      path: '/filing',
      title: 'Filing',
      routeClass: 'intake',
      slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: DEF } }],
      transitions: [{ trigger: 'autosave', to: 'done' }],
    },
    { id: 'done', path: '/done', title: 'Done', routeClass: 'proof', slots: [] },
  ];
  const themedApp = composeSurfaceApp([themedSurface]);
  const filingHandle = themedApp.routes.find(r => r.routeId === 'filing')!;
  const themedComponent = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: DEF },
    tree: {
      component: 'Stack',
      children: [
        { component: 'TextInput', bind: 'answer' },
        { component: 'ActionButton', actionRef: 'save' },
        { component: 'ActionButton', actionRef: 'autosave', label: { literal: 'Checkpoint now' } },
      ],
    },
  };
  const tenantThemeWithPages = {
    $formspecTheme: '1.0' as const,
    version: '1.0.0',
    targetDefinition: { url: DEF },
    pages: [{ id: 'answers', title: 'Themed page probe', regions: [{ key: 'answer', span: 12 }] }],
  };

  const themedPlan = planMatchedRoute({
    handle: filingHandle,
    app: themedApp,
    experiences: [],
    definitions: new Map([[DEF, definition]]),
    registryEntries: [],
    widgets: createWidgetRegistry({ modules: [], registryEntries: [] }),
    resolveDefinitionComponent: () => themedComponent as never,
    responseActions,
    themeAuthority: createThemeAuthority({ tenantTheme: tenantThemeWithPages as never }),
    hasExecutor: true,
  });
  expect(themedPlan.transitions[0]).toMatchObject({
    actionId: 'autosave',
    status: 'fireable',
  });

  // Case 2: Responsive ComponentDocument swaps actionRef from 'save' to 'autosave' at wide >= 700px.
  const responsiveComponent = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: DEF },
    breakpoints: { wide: 700 },
    tree: {
      component: 'Stack',
      children: [
        { component: 'TextInput', bind: 'answer' },
        {
          component: 'ActionButton',
          actionRef: 'save',
          responsive: {
            wide: { actionRef: 'autosave', label: { literal: 'Responsive checkpoint' } },
          },
        },
      ],
    },
  };

  const narrowPlan = planMatchedRoute({
    handle: filingHandle,
    app: themedApp,
    experiences: [],
    definitions: new Map([[DEF, definition]]),
    registryEntries: [],
    widgets: createWidgetRegistry({ modules: [], registryEntries: [] }),
    resolveDefinitionComponent: () => responsiveComponent as never,
    responseActions,
    themeAuthority: createThemeAuthority(),
    hasExecutor: true,
    matchesMinWidth: (px: number) => 500 >= px,
  } as never);
  expect(narrowPlan.transitions[0]).toMatchObject({
    actionId: 'autosave',
    status: 'fireable',
  });

  const widePlan = planMatchedRoute({
    handle: filingHandle,
    app: themedApp,
    experiences: [],
    definitions: new Map([[DEF, definition]]),
    registryEntries: [],
    widgets: createWidgetRegistry({ modules: [], registryEntries: [] }),
    resolveDefinitionComponent: () => responsiveComponent as never,
    responseActions,
    themeAuthority: createThemeAuthority(),
    hasExecutor: true,
    matchesMinWidth: (px: number) => 1000 >= px,
  });
  expect(widePlan.transitions[0]).toMatchObject({
    actionId: 'autosave',
    status: 'supplied-by-slot',
  });
});

it('matches canonical JSON Schema + format validation, enforces compatibleVersions, tolerates malformed sibling documents, and respects conditional when:false visibility', async () => {
  const { readFileSync } = await import('node:fs');
  const { default: Ajv2020 } = await import('ajv/dist/2020.js');
  const { default: addFormats } = await import('ajv-formats');
  const {
    autoPlacedDefinitionActions,
    initFormspecEngine,
    isValidDefinitionResponseActionsDocument,
    resolveAutosaveResponseAction,
  } = await import('@formspec-org/engine');
  const { planMatchedRoute } = await import('../src/route-plan.js');
  const { createThemeAuthority } = await import('../src/theme-authority.js');
  const { createWidgetRegistry } = await import('../src/registry.js');

  await initFormspecEngine();

  const load = (name: string) =>
    JSON.parse(readFileSync(new URL(`../../../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
  const ajv = new Ajv2020({ strict: false, logger: false });
  addFormats(ajv);
  ajv.addSchema(load('common'));
  ajv.addSchema(load('validation-mapping'));
  const validateSchema = ajv.compile(load('response-actions'));

  const def = { $formspec: '1.0', url: 'urn:review:act', version: '1.0.0', title: 'Review', items: [] };
  const hostEffect = { type: 'hostEvent' as const, eventName: 'checked' };
  const check = { id: 'checkpoint', intent: 'autosave' as const, effects: [hostEffect] };
  const button = { id: 'manual', intent: 'review' as const, label: { literal: 'Review' }, effects: [hostEffect] };
  const doc = {
    $formspecResponseActions: '1.0' as const,
    version: '1.0.0',
    targetDefinition: { url: def.url },
    actions: [check, button],
  };

  for (const effect of [
    { type: 'mappingExecution', mappingRef: 'map', idempotencyKey: 'id' },
    { type: 'ledgerAppend', eventKind: 'checkpoint', idempotencyKey: 'id' },
    { type: 'handoffAssembly', handoffProfileRef: 'p', recipientRef: 'r', idempotencyKey: 'id' },
    { type: 'evidenceRequest', requestRef: 'request', idempotencyKey: 'id' },
    { type: 'serviceRequest', requestRef: 'request', idempotencyKey: 'id' },
    hostEffect,
    { type: 'browserResource', operation: 'open', resourceRef: 'document.link' },
  ]) {
    for (const [val, expected] of [[effect, true], [{ ...effect, extra: true }, false]] as const) {
      const sidecar = { ...doc, actions: [{ ...check, effects: [val] }] };
      expect(validateSchema(sidecar)).toBe(expected);
      expect(isValidDefinitionResponseActionsDocument(sidecar, def)).toBe(expected);
    }
  }

  for (const [, sidecar, active] of [
    ['module publisher URI', { ...doc, modules: [{ id: 'x-example', version: '1', publisher: 'not a URI' }] }, def],
    ['target URI', { ...doc, targetDefinition: { url: 'no uri' } }, { ...def, url: 'no uri' }],
    ['provenance Component URI', {
      ...doc,
      actions: [{
        ...check,
        'x-generation': {
          movedFrom: {
            component: { handle: 'C', url: 'bad url' },
            surface: { url: 'urn:surface' },
            route: 'main',
            nodePath: '/s',
          },
        },
      }, button],
    }, def],
    ['provenance node path', {
      ...doc,
      actions: [{
        ...check,
        'x-generation': {
          copiedFrom: {
            component: { handle: 'C' },
            surface: { url: 'urn:surface' },
            route: 'main',
            nodePath: '/\n',
          },
        },
      }, button],
    }, def],
  ] as const) {
    expect(validateSchema(sidecar)).toBe(false);
    expect(isValidDefinitionResponseActionsDocument(sidecar, active)).toBe(false);
    expect(autoPlacedDefinitionActions(sidecar as never, active)).toEqual([]);
    expect(resolveAutosaveResponseAction(sidecar as never, active).action).toBeNull();
  }

  // Active Definition version range compatibility check
  const incompatibleVersionSidecar = {
    ...doc,
    targetDefinition: { url: def.url, compatibleVersions: '>=9.0.0' },
  };
  expect(validateSchema(incompatibleVersionSidecar)).toBe(true);
  expect(isValidDefinitionResponseActionsDocument(incompatibleVersionSidecar, def)).toBe(false);
  expect(autoPlacedDefinitionActions(incompatibleVersionSidecar as never, def)).toEqual([]);
  expect(resolveAutosaveResponseAction(incompatibleVersionSidecar as never, def).action).toBeNull();

  // Malformed sibling document (`actions: [null]`) must not throw when resolving a valid Definition's slot
  const slot = { slotType: 'definition-form', definition: def, definitionRef: def.url, status: 'ready' };
  const malformedSibling = { ...doc, targetDefinition: { url: 'urn:other' }, actions: [null] };
  expect(validateSchema(malformedSibling)).toBe(false);
  expect([...slotSuppliedTriggers([slot] as never, [doc, malformedSibling] as never)]).toEqual(['manual']);

  // Authored ActionButton hidden by `when: 'false'` must not be credited as supplied-by-slot
  const conditionalSurface = structuredClone(embedding);
  conditionalSurface.routes = [
    {
      id: 'filing',
      path: '/filing',
      title: 'Filing',
      routeClass: 'intake',
      slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: def.url } }],
      transitions: [{ trigger: 'autosave', to: 'done' }],
    },
    { id: 'done', path: '/done', title: 'Done', routeClass: 'proof', slots: [] },
  ];
  const conditionalApp = composeSurfaceApp([conditionalSurface]);
  const filingHandle = conditionalApp.routes.find((r) => r.routeId === 'filing')!;
  const conditionalPlan = planMatchedRoute({
    handle: filingHandle,
    app: conditionalApp,
    experiences: [],
    definitions: new Map([[def.url, def as never]]),
    registryEntries: [],
    widgets: createWidgetRegistry({ modules: [], registryEntries: [] }),
    resolveDefinitionComponent: () => ({
      $formspecComponent: '1.0',
      version: '1.0.0',
      targetDefinition: { url: def.url },
      tree: {
        component: 'Stack',
        children: [
          { component: 'ActionButton', actionRef: 'checkpoint', label: { literal: 'Checkpoint now' }, when: 'false' },
        ],
      },
    }) as never,
    responseActions: [doc],
    themeAuthority: createThemeAuthority(),
    hasExecutor: true,
  });
  expect(conditionalPlan.transitions[0]).toMatchObject({
    actionId: 'checkpoint',
    status: 'fireable',
  });

  // Shared in-memory JSON objects (DAG, non-cyclic) must be accepted identically to serialized JSON
  const sharedDefaults = { language: 'en' };
  const sharedDagDoc = {
    $formspecResponseActions: '1.0' as const,
    version: '1.0.0',
    targetDefinition: { url: def.url },
    actions: [button, check],
    'x-formspec-runtime': {
      version: '1.0' as const,
      requests: [{
        id: 'prepare',
        adapter: 'http-json' as const,
        request: {
          method: 'POST' as const,
          pathTemplate: '/forms',
          bodyDefaults: { source: sharedDefaults, destination: sharedDefaults },
        },
      }],
    },
  };
  expect(validateSchema(sharedDagDoc)).toBe(true);
  expect({
    guard: isValidDefinitionResponseActionsDocument(sharedDagDoc, def),
    manual: autoPlacedDefinitionActions(sharedDagDoc as never, def).map((a) => a.id),
    auto: resolveAutosaveResponseAction(sharedDagDoc as never, def).action?.id,
  }).toEqual({ guard: true, manual: ['manual'], auto: 'checkpoint' });

  // True cycles in runtime JSON values still fail closed without throwing
  const cyclicDefaults: Record<string, unknown> = {};
  cyclicDefaults.self = cyclicDefaults;
  const cyclicDoc = {
    ...sharedDagDoc,
    'x-formspec-runtime': {
      version: '1.0' as const,
      requests: [{
        id: 'prepare',
        adapter: 'http-json' as const,
        request: { method: 'POST' as const, pathTemplate: '/forms', bodyDefaults: cyclicDefaults },
      }],
    },
  };
  expect(isValidDefinitionResponseActionsDocument(cyclicDoc, def)).toBe(false);

  // `visibility: 'hidden'`, uppercase `display: 'NONE'`, and closed auto-Modal (`when: 'false'`) do not supply transitions
  for (const hiddenTree of [
    {
      component: 'Stack',
      children: [{ component: 'ActionButton', actionRef: 'checkpoint', label: { literal: 'Checkpoint now' }, style: { visibility: 'hidden' } }],
    },
    {
      component: 'Stack',
      children: [{ component: 'ActionButton', actionRef: 'checkpoint', label: { literal: 'Checkpoint now' }, style: { display: 'NONE' } }],
    },
    {
      component: 'Stack',
      children: [{
        component: 'Modal',
        title: 'Checkpoint',
        trigger: 'auto',
        when: 'false',
        children: [{ component: 'ActionButton', actionRef: 'checkpoint', label: { literal: 'Checkpoint now' } }],
      }],
    },
  ]) {
    const hiddenPlan = planMatchedRoute({
      handle: filingHandle,
      app: conditionalApp,
      experiences: [],
      definitions: new Map([[def.url, def as never]]),
      registryEntries: [],
      widgets: createWidgetRegistry({ modules: [], registryEntries: [] }),
      resolveDefinitionComponent: () => ({
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: def.url },
        tree: hiddenTree,
      }) as never,
      responseActions: [doc],
      themeAuthority: createThemeAuthority(),
      hasExecutor: true,
    });
    expect(hiddenPlan.transitions[0]).toMatchObject({
      actionId: 'checkpoint',
      status: 'fireable',
    });
  }

  // CSS `visibility: initial` below inherited `visibility: collapse` restores visibility statically
  const initialBelowCollapsePlan = planMatchedRoute({
    handle: filingHandle,
    app: conditionalApp,
    experiences: [],
    definitions: new Map([[def.url, def as never]]),
    registryEntries: [],
    widgets: createWidgetRegistry({ modules: [], registryEntries: [] }),
    resolveDefinitionComponent: () => ({
      $formspecComponent: '1.0',
      version: '1.0.0',
      targetDefinition: { url: def.url },
      tree: {
        component: 'Stack',
        style: { visibility: '  CoLlApSe ' },
        children: [{
          component: 'ActionButton',
          actionRef: 'checkpoint',
          label: { literal: 'Checkpoint now' },
          style: { visibility: 'initial' },
        }],
      },
    }) as never,
    responseActions: [doc],
    themeAuthority: createThemeAuthority(),
    hasExecutor: true,
  });
  expect(initialBelowCollapsePlan.transitions[0]).toMatchObject({
    actionId: 'checkpoint',
    status: 'supplied-by-slot',
  });

  // Cross-realm plain JSON values are admitted, while sparse arrays, getters, non-plain objects, and cycles fail closed
  const makeRuntimeDoc = (bodyDefaults: unknown) => ({
    $formspecResponseActions: '1.0' as const,
    version: '1.0.0',
    targetDefinition: { url: def.url },
    actions: [button, check],
    'x-formspec-runtime': {
      version: '1.0' as const,
      requests: [{
        id: 'prepare',
        adapter: 'http-json' as const,
        request: { method: 'POST' as const, pathTemplate: '/forms', bodyDefaults },
      }],
    },
  });

  const crossRealmDefaults = vm.runInNewContext('JSON.parse(\'{"ok":true,"nested":{"items":[1,"two",null]}}\')');
  const crossRealmDoc = makeRuntimeDoc(crossRealmDefaults);
  expect({
    guard: isValidDefinitionResponseActionsDocument(crossRealmDoc, def),
    manual: autoPlacedDefinitionActions(crossRealmDoc as never, def).map((a) => a.id),
    auto: resolveAutosaveResponseAction(crossRealmDoc as never, def).action?.id,
  }).toEqual({ guard: true, manual: ['manual'], auto: 'checkpoint' });

  const sparseList = new Array(1);
  const arrayCycle: unknown[] = [];
  arrayCycle.push(arrayCycle);
  const mixedCycle: { items: unknown[] } = { items: [] };
  mixedCycle.items.push(mixedCycle);
  const getterObj = Object.defineProperty({}, 'sneaky', { enumerable: true, get: () => 'ok' });

  for (const invalidDefaults of [
    { sparse: sparseList },
    { missing: undefined },
    { nan: Number.NaN },
    { inf: Number.POSITIVE_INFINITY },
    { date: new Date(0) },
    { map: new Map() },
    { arrayCycle },
    { mixedCycle },
    getterObj,
  ]) {
    const invalidDoc = makeRuntimeDoc(invalidDefaults);
    expect({
      guard: isValidDefinitionResponseActionsDocument(invalidDoc, def),
      manual: autoPlacedDefinitionActions(invalidDoc as never, def).map((a) => a.id),
      auto: resolveAutosaveResponseAction(invalidDoc as never, def).action?.id ?? null,
    }).toEqual({ guard: false, manual: [], auto: null });
  }

  // Sparse `actions` and `effects` arrays fail closed without throwing
  const sparseActions = [undefined, button];
  delete sparseActions[0];
  expect(isValidDefinitionResponseActionsDocument({
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: def.url },
    actions: sparseActions,
  }, def)).toBe(false);

  const sparseEffects = [undefined, { type: 'hostEvent', eventName: 'manual' }];
  delete sparseEffects[0];
  expect(isValidDefinitionResponseActionsDocument({
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: def.url },
    actions: [{ ...button, effects: sparseEffects }],
  }, def)).toBe(false);

  // Structural getters, non-plain class instances, non-plain Array subclasses, and inherited docs fail closed without invoking getters
  const addGetter = (obj: object, key: string, enumerable = true) =>
    Object.defineProperty(obj, key, {
      enumerable,
      get: () => {
        throw new Error(`getter read: ${key}`);
      },
    });
  const makeBadRecord = (obj: Record<string, unknown>) => Object.assign(new (class {})(), obj);
  const makeArraySubclass = (arr: unknown[]) => Object.assign(new (class extends Array {})(), arr);
  const baseStructuralDoc = (): any => ({
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: def.url },
    actions: [
      { id: 'save', intent: 'save-draft', label: { literal: 'Save draft' }, effects: [{ type: 'hostEvent', eventName: 'saved' }] },
      { id: 'auto0', intent: 'autosave', effects: [{ type: 'hostEvent', eventName: 'autosave0' }] },
    ],
    'x-formspec-runtime': {
      version: '1.0',
      requests: [{ id: 'prepare', adapter: 'http-json', request: { method: 'POST', pathTemplate: '/form' } }],
    },
  });
  const reqOf = (d: any) => d['x-formspec-runtime'].requests[0].request;
  const captureResult = (fn: () => unknown) => {
    try {
      return fn();
    } catch (error) {
      return String(error);
    }
  };
  const allThree = (d: unknown) => [
    captureResult(() => isValidDefinitionResponseActionsDocument(d, def)),
    captureResult(() => autoPlacedDefinitionActions(d as never, def).map((a) => a.id)),
    captureResult(() => resolveAutosaveResponseAction(d as never, def).action?.id ?? null),
  ];

  const adversarialShapes: Array<[string, (d: any) => void]> = [
    ['getter on document targetDefinition', (d) => { addGetter(d, 'targetDefinition'); }],
    ['getter on action id', (d) => { addGetter(d.actions[0], 'id'); }],
    ['non-enumerable getter on action id', (d) => { addGetter(d.actions[0], 'id', false); }],
    ['getter on request output map entry', (d) => { d['x-formspec-runtime'].requests[0].outputs = addGetter({}, 'receipt'); }],
    ['getter on request method', (d) => { addGetter(reqOf(d), 'method'); }],
    ['getter on selector from', (d) => { reqOf(d).bodyBindings = { '/v': addGetter({ value: 1 }, 'from') }; }],
    ['getter on actions array filter property', (d) => { addGetter(d.actions, 'filter'); }],
    ['in-memory class instance standing in for action', (d) => { d.actions[0] = makeBadRecord(d.actions[0]); }],
    ['non-plain array subclass as actions', (d) => { d.actions = makeArraySubclass(d.actions); }],
  ];
  for (const [label, mutate] of adversarialShapes) {
    const candidate = baseStructuralDoc();
    mutate(candidate);
    expect(allThree(candidate), label).toEqual([false, [], null]);
  }

  // Complete cross-realm document + shared DAG + null-prototype map still passes
  const crossRealmFull = vm.runInNewContext(`JSON.parse(${JSON.stringify(JSON.stringify(baseStructuralDoc()))})`);
  const crossRealmBranch = vm.runInNewContext('({ x: [1, 2] })');
  reqOf(crossRealmFull).bodyDefaults = Object.assign(Object.create(null), {
    a: crossRealmBranch,
    b: crossRealmBranch,
  });
  expect(allThree(crossRealmFull)).toEqual([true, ['save'], 'auto0']);

  // Surface slotSuppliedTriggers rejects target accessor without reading getter and rejects inherited docs
  const directSlot = {
    status: 'ready',
    slotId: 'filingForm',
    slotType: 'definition-form',
    definition: def,
    definitionRef: def.url,
  };
  expect([...slotSuppliedTriggers([directSlot] as never, [baseStructuralDoc()])]).toEqual(['save']);
  const getterTargetDoc = baseStructuralDoc();
  addGetter(getterTargetDoc, 'targetDefinition');
  expect(captureResult(() => [...slotSuppliedTriggers([directSlot] as never, [getterTargetDoc])])).toEqual([]);
  const inheritedDoc = Object.create(baseStructuralDoc());
  expect(captureResult(() => [...slotSuppliedTriggers([directSlot] as never, [inheritedDoc])])).toEqual([]);
});
