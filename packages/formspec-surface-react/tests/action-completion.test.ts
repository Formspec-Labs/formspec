/**
 * @filedesc Route advancement consumes the Response Actions terminal result.
 *
 * A click and an `onSubmit` callback happen before durable effects finish. The
 * shell advances only after a completed terminal under the declared validation policy.
 */
import { describe, expect, it } from 'vitest';
import {
  completedFormAction,
  completedWidgetAction,
} from '../src/SurfaceSlot.js';

const action = { id: 'submitApplication', intent: 'submit' };

function result(overrides: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    resolution: { resolved: true, action },
    validationTuple: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
    detail: { response: {}, validationReport: { valid: true } },
    effectTrace: [],
    ...overrides,
  } as never;
}

describe('completedFormAction', () => {
  it('returns the action only after a completed terminal with a valid report', () => {
    expect(completedFormAction(result())).toEqual(action);
  });

  it.each(['blocked', 'failed', 'deferred', 'unresolved'])(
    'does not report %s as successful',
    (status) => {
      expect(completedFormAction(result({ status }))).toBeUndefined();
    },
  );

  it('does not advance a completed non-blocking action with an invalid report', () => {
    expect(
      completedFormAction(
        result({ detail: { response: {}, validationReport: { valid: false } } }),
      ),
    ).toBeUndefined();
  });

  it('fails closed when the terminal has no resolved action or validation report', () => {
    expect(
      completedFormAction(
        result({
          resolution: { resolved: false, action: null },
          detail: { response: {}, validationReport: null },
        }),
      ),
    ).toBeUndefined();
  });
});

describe('completedWidgetAction', () => {
  it('accepts a completed app action without manufacturing a Response', () => {
    const appResult = result({
      detail: {
        resource: {
          href: '/records/response-1',
          label: 'Review response',
        },
      },
    });
    expect(completedWidgetAction(appResult, {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      scope: 'app',
      actions: [action],
    } as never)).toEqual(action);
  });

  it('keeps the validation-report gate for response-scoped widget actions', () => {
    const responseDocument = {
      $formspecResponseActions: '1.0',
      version: '1.0.0',
      targetDefinition: { url: 'urn:def' },
      actions: [action],
    } as never;
    expect(completedWidgetAction(result(), responseDocument)).toEqual(action);
    expect(completedWidgetAction(result({
      detail: { response: {}, validationReport: { valid: false } },
    }), responseDocument)).toBeUndefined();
  });
});

const draftAction = { id: 'saveDraft', intent: 'save-draft' };
const draftTuple = { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' };
const draftDocument = { $formspecResponseActions: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:def' }, actions: [draftAction] } as never;

describe('response action completion follows the resolved validation tuple', () => {
  const gates = [
    (r: never) => completedFormAction(r),
    (r: never) => completedWidgetAction(r, draftDocument),
  ];
  it.each(gates)('accepts an off draft checkpoint without a manufactured report', (gate) => {
    expect(gate(result({ resolution: { resolved: true, action: draftAction }, validationTuple: draftTuple,
      detail: { response: { status: 'in-progress', data: {} } } }))).toEqual(draftAction);
  });
  it.each(gates)('accepts nonblocking invalidity but requires evidence when validation runs', (gate) => {
    const validation = { profile: 'live', blocking: 'non-blocking', persistence: 'draft-checkpoint' };
    const a = { ...draftAction, validation };
    const facts = { resolution: { resolved: true, action: a }, validationTuple: validation };
    expect(gate(result({ ...facts, detail: { validationReport: { valid: false } } }))).toEqual(a);
    expect(gate(result({ ...facts, detail: {} }))).toBeUndefined();
  });
  it.each(gates)('refuses missing or mismatched tuples, malformed actions, and absent detail', (gate) => {
    const facts = { resolution: { resolved: true, action: draftAction }, validationTuple: draftTuple, detail: {} };
    expect(gate(result({ ...facts, validationTuple: null }))).toBeUndefined();
    expect(gate(result({ ...facts, validationTuple: { ...draftTuple, persistence: 'none' } }))).toBeUndefined();
    expect(gate(result({ ...facts, detail: null }))).toBeUndefined();
    expect(gate(result({ ...facts, resolution: { resolved: true, action: { id: 'bad', intent: 'x-bad' } } }))).toBeUndefined();
  });
});
