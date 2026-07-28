/**
 * @filedesc `supplied-by-slot` is a WALK, not a lookup — `surface-shell-spec.md`
 * §5.2, §5.3.
 *
 * The shipped React binding derived supplied triggers with a hardcoded literal
 * intent and a scan of top-level `definition-form` slots only (divergence D13),
 * so a form inside an `embed-route` was not counted and no intent other than
 * `submit` was ever supplied-by-slot. Both are the same defect: substituting a
 * shortcut for the resolution rule surface-spec §4 already states.
 */
import { describe, expect, it } from 'vitest';
import { composeSurfaceApp } from '../src/composition.js';
import { createWidgetRegistry } from '../src/registry.js';
import { planRoute, type SlotPlan } from '../src/slot-plan.js';
import { planTransitions, slotSuppliedTriggers } from '../src/transitions.js';
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
      { actions: [{ id: 'submitApplication', intent: 'submit' }] },
    ]);
    expect([...supplied].sort()).toEqual(['submit', 'submitApplication']);
  });

  it('supplies an intent that is NOT `submit`', () => {
    // D13's second half: a hardcoded intent reports every other intent as dead.
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      { actions: [{ id: 'sendForReview', intent: 'review' }] },
    ]);
    expect(supplied.has('review')).toBe(true);
    expect(supplied.has('sendForReview')).toBe(true);
  });

  it('supplies an action by id even when it publishes no closed-core intent', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      { actions: [{ id: 'countersign' }] },
    ]);
    expect(supplied.has('countersign')).toBe(true);
  });

  it('does not supply an intent two actions both publish — that is ambiguous, not available', () => {
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      { actions: [{ id: 'a', intent: 'submit' }, { id: 'b', intent: 'submit' }] },
    ]);
    expect(supplied.has('submit')).toBe(false);
  });

  it('supplies nothing from a slot type §5.2 excludes', () => {
    // A module widget has no channel to declare that it fires an action
    // (finding F4), and an Experience unit's actionRefs name actions without
    // placing controls. Exempting them would silence the check on exactly the
    // case that motivated it.
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
      { actions: [{ id: 'submitApplication', intent: 'submit' }] },
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
      { actions: [{ id: 'x', intent: 'submit' }] },
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('honours targetDefinition — a document only supplies the slot it binds', () => {
    // `E611`'s "targeting the Definition that slot binds" (§5.4), at runtime.
    const supplied = slotSuppliedTriggers(slotsFor(embedding, 'host'), [
      { targetDefinition: { url: OTHER_DEF }, actions: [{ id: 'x', intent: 'submit' }] },
    ]);
    expect([...supplied]).toEqual([]);
  });

  it('supplies nothing when no Response Actions document is loaded', () => {
    expect([...slotSuppliedTriggers(slotsFor(embedding, 'host'), [])]).toEqual([]);
  });
});

describe('the walk, wired into planTransitions', () => {
  it('classifies a transition fired from inside an embed as supplied-by-slot', () => {
    const app = composeSurfaceApp([embedding]);
    const handle = app.routes.find((candidate) => candidate.routeId === 'host')!;
    const responseActions = [{ actions: [{ id: 'submitApplication', intent: 'submit' }] }];
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
});
