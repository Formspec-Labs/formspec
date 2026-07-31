/**
 * @filedesc `supplied-by-slot` is a WALK, not a lookup — `surface-shell-spec.md`
 * §5.2, §5.3.
 *
 * The shipped React binding derived supplied triggers with a hardcoded literal
 * intent and a scan of top-level `definition-form` slots only (divergence D13),
 * so a form inside an `embed-route` was not counted and no intent other than
 * `submit` was ever supplied-by-slot. Both are the same defect: substituting a
 * shortcut for the resolution rule surface-spec §4 already states. The
 * Definition renderer now places every literal-labeled response Action, so
 * this walk must credit the same exact controls without adding shell copies.
 */
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
const definition = { $formspec: '1.0', url: DEF, items: [] } as unknown as FormDefinition;
const other = { $formspec: '1.0', url: OTHER_DEF, items: [] } as unknown as FormDefinition;

const definitions = new Map([
  [DEF, definition],
  [OTHER_DEF, other],
]);

function slotsFor(surfaceDocument: ReturnType<typeof surface>, routeId: string): readonly SlotPlan<unknown>[] {
  const app = composeSurfaceApp([surfaceDocument]);
  const handle = app.routes.find((candidate) => candidate.routeId === routeId)!;
  return planRoute<unknown>({
    handle,
    experiences: [],
    definitions,
    registryEntries: [],
    widgets: createWidgetRegistry<unknown>({}),
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
      {
        targetDefinition: { url: DEF },
        actions: [{ id: 'submitApplication', intent: 'submit', label: { literal: 'Submit' } }],
      },
    ]);
    expect([...supplied].sort()).toEqual(['submit', 'submitApplication']);
  });

  it('credits a literal-labeled review action that the Definition renderer places', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      {
        targetDefinition: { url: DEF },
        actions: [{ id: 'sendForReview', intent: 'review', label: { literal: 'Review form' } }],
      },
    ]);
    expect([...supplied].sort()).toEqual(['review', 'sendForReview']);
  });

  it('does not claim an action id when no literal-labeled control will be rendered', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      { targetDefinition: { url: DEF }, actions: [{ id: 'countersign' }] },
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('does not supply an intent two actions both publish — that is ambiguous, not available', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      {
        targetDefinition: { url: DEF },
        actions: [
          { id: 'a', intent: 'submit', label: { literal: 'Submit A' } },
          { id: 'b', intent: 'submit', label: { literal: 'Submit B' } },
        ],
      },
    ]);
    expect(supplied.has('submit')).toBe(false);
    expect([...supplied].sort()).toEqual(['a', 'b']);
  });

  it('does not credit duplicate action ids as rendered controls', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      {
        targetDefinition: { url: DEF },
        actions: [
          { id: 'same-action', intent: 'review', label: { literal: 'Review' } },
          { id: 'same-action', intent: 'submit', label: { literal: 'Submit' } },
        ],
      },
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
      {
        targetDefinition: { url: DEF },
        actions: [{ id: 'submitApplication', intent: 'submit', label: { literal: 'Submit' } }],
      },
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
      {
        targetDefinition: { url: 'urn:absent' },
        actions: [{ id: 'x', intent: 'submit', label: { literal: 'Submit' } }],
      },
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('honours targetDefinition — a document only supplies the slot it binds', () => {
    // `E611`'s "targeting the Definition that slot binds" (§5.4), at runtime.
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      {
        targetDefinition: { url: OTHER_DEF },
        actions: [{ id: 'x', intent: 'submit', label: { literal: 'Submit' } }],
      },
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('supplies nothing when no Response Actions document is loaded', () => {
    expect([...slotSuppliedTriggers(slotsFor(embedding, 'host'), [])]).toEqual([]);
  });

  it('supplies nothing when more than one document targets the same Definition', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      {
        targetDefinition: { url: DEF },
        actions: [{ id: 'one', intent: 'submit', label: { literal: 'Submit one' } }],
      },
      {
        targetDefinition: { url: DEF },
        actions: [{ id: 'two', intent: 'submit', label: { literal: 'Submit two' } }],
      },
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('uses the same exact-one document selection the renderer consumes', () => {
    const selected = responseActionsDocumentForDefinition(
      [
        {
          targetDefinition: { url: OTHER_DEF },
          actions: [{ id: 'other', intent: 'submit' }],
        },
        {
          targetDefinition: { url: DEF },
          actions: [{ id: 'submitApplication', intent: 'submit' }],
        },
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
      {
        targetDefinition: { url: DEF },
        actions: [{ id: 'submitApplication', intent: 'submit', label: { literal: 'Submit' } }],
      },
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
    const responseActions = [{
      targetDefinition: { url: DEF },
      actions: [{ id: 'reviewForm', intent: 'review', label: { literal: 'Review form' } }],
    }];

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
