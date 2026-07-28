/**
 * @filedesc Route advancement consumes the Response Actions terminal result.
 *
 * A click and an `onSubmit` callback happen before durable effects finish. The
 * shell advances only after a completed terminal with a valid report.
 */
import { describe, expect, it } from 'vitest';
import { completedFormAction } from '../src/SurfaceSlot.js';

const action = { id: 'submitApplication', intent: 'submit' };

function result(overrides: Record<string, unknown> = {}) {
  return {
    status: 'completed',
    resolution: { resolved: true, action },
    validationTuple: null,
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
