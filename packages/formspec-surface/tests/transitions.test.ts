/**
 * @filedesc Transitions — the shell plans them and refuses to invent a trigger.
 *
 * The decision under test: a shell-owned "continue" button would be the
 * inference `surface-spec.md` §5.1 forbids ("MUST NOT infer success from a
 * click"). So a transition is `fireable` only when the trigger resolves against
 * a loaded Response Actions document AND the host supplied an executor.
 */
import { describe, expect, it } from 'vitest';
import { composeSurfaceApp } from '../src/composition.js';
import { planTransitions } from '../src/transitions.js';
import { respondentSurface } from './fixtures.js';

const app = composeSurfaceApp([respondentSurface]);
const apply = app.routes.find((handle) => handle.routeId === 'apply')!;

describe('planTransitions', () => {
  it('refuses when the bundle carries no Response Actions document at all', () => {
    const { transitions, diagnostics } = planTransitions({ handle: apply, app, hasExecutor: true });
    expect(transitions[0]?.status).toBe('no-response-actions-document');
    expect(diagnostics.map((d) => d.code)).toEqual(['TRANSITION-UNFIREABLE']);
  });

  it('refuses when a Response Actions document exists but publishes nothing matching', () => {
    const { transitions } = planTransitions({
      handle: apply,
      app,
      responseActions: [{ actions: [{ id: 'saveDraft', intent: 'save-draft' }] }],
      hasExecutor: true,
    });
    expect(transitions[0]?.status).toBe('trigger-unresolved');
  });

  it('resolves a closed-core intent published by exactly one action', () => {
    const { transitions } = planTransitions({
      handle: apply,
      app,
      responseActions: [{ actions: [{ id: 'submitApplication', intent: 'submit' }] }],
      hasExecutor: true,
    });
    expect(transitions[0]?.status).toBe('fireable');
    expect(transitions[0]?.actionId).toBe('submitApplication');
  });

  it('refuses an ambiguous closed-core intent published by two actions', () => {
    const { transitions } = planTransitions({
      handle: apply,
      app,
      responseActions: [
        { actions: [{ id: 'a', intent: 'submit' }, { id: 'b', intent: 'submit' }] },
      ],
      hasExecutor: true,
    });
    expect(transitions[0]?.status).toBe('trigger-unresolved');
    expect(transitions[0]?.reason).toContain('More than one');
  });

  it('resolves a trigger naming an action id directly', () => {
    const submitById = composeSurfaceApp([
      {
        ...respondentSurface,
        routes: [
          { ...respondentSurface.routes[0], transitions: [{ trigger: 'sendItIn', to: 'receipt' }] },
          respondentSurface.routes[1],
        ],
      } as typeof respondentSurface,
    ]);
    const handle = submitById.routes[0]!;
    const { transitions } = planTransitions({
      handle,
      app: submitById,
      responseActions: [{ actions: [{ id: 'sendItIn', intent: 'submit' }] }],
      hasExecutor: true,
    });
    expect(transitions[0]?.status).toBe('fireable');
  });

  it('defers to a control already on the route rather than drawing a second one', () => {
    const { transitions, diagnostics } = planTransitions({
      handle: apply,
      app,
      responseActions: [{ actions: [{ id: 'submitApplication', intent: 'submit' }] }],
      hasExecutor: false,
      slotSuppliedTriggers: new Set(['submit']),
    });
    // The route carries a definition-form and the bundle publishes a submit
    // Action, so `FormspecForm` draws the real control. Two buttons for one act
    // is worse than none.
    expect(transitions[0]?.status).toBe('supplied-by-slot');
    expect(transitions[0]?.actionId).toBe('submitApplication');
    expect(diagnostics).toEqual([]);
  });

  it('does not defer to a slot for a trigger that slot cannot produce', () => {
    const { transitions } = planTransitions({
      handle: apply,
      app,
      responseActions: [{ actions: [{ id: 'x', intent: 'submit' }] }],
      hasExecutor: false,
      slotSuppliedTriggers: new Set(['review']),
    });
    expect(transitions[0]?.status).toBe('no-executor');
  });

  it('refuses when the trigger resolves and no host executor exists', () => {
    const { transitions } = planTransitions({
      handle: apply,
      app,
      responseActions: [{ actions: [{ id: 'submitApplication', intent: 'submit' }] }],
      hasExecutor: false,
    });
    expect(transitions[0]?.status).toBe('no-executor');
    expect(transitions[0]?.actionId).toBe('submitApplication');
  });

  it('refuses a transition whose target is not a route in the same Surface', () => {
    const dangling = composeSurfaceApp([
      {
        ...respondentSurface,
        routes: [
          { ...respondentSurface.routes[0], transitions: [{ trigger: 'submit', to: 'elsewhere' }] },
          respondentSurface.routes[1],
        ],
      } as typeof respondentSurface,
    ]);
    const { transitions } = planTransitions({
      handle: dangling.routes[0]!,
      app: dangling,
      responseActions: [{ actions: [{ id: 'x', intent: 'submit' }] }],
      hasExecutor: true,
    });
    expect(transitions[0]?.status).toBe('target-unresolved');
  });

  it('gives every refusal a sentence a person can read', () => {
    const { transitions } = planTransitions({ handle: apply, app, hasExecutor: false });
    expect(transitions[0]?.reason.length).toBeGreaterThan(20);
    expect(transitions[0]?.reason).toContain('submit');
  });

  it('says nothing about a route with no transitions', () => {
    const receipt = app.routes.find((handle) => handle.routeId === 'receipt')!;
    const { transitions, diagnostics } = planTransitions({ handle: receipt, app, hasExecutor: true });
    expect(transitions).toEqual([]);
    expect(diagnostics).toEqual([]);
  });
});
