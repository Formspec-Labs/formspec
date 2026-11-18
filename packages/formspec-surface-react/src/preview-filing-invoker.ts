/** @filedesc Run preview actions with the authored dispatcher and commit local Submit. */
import { invokeResponseActionAsync, resolveResponseAction, resolveResponseActionValidationTuple } from '@formspec-org/engine';
import { filingAction } from '@formspec-org/surface';
import type { SurfaceScenarioActionOutcome } from '@formspec-org/types';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import type { PreviewFilingStore } from './browser-draft-port.js';
import type { DraftActionInvoker } from './draft-writer.js';

export function previewFilingInvoker(
  submit: PreviewFilingStore['submit'],
  actionOutcome?: (actionId: string) => SurfaceScenarioActionOutcome,
): DraftActionInvoker {
  return async ({ document, actionRef, nodeId, invocationContext, ports, draftFence }) => {
    const resolution = resolveResponseAction(document, actionRef, nodeId);
    const { action } = resolution;
    const filing = filingAction(document, action) === 'submit';
    const outcome = action && !filing ? actionOutcome?.(action.id) : undefined;
    if (action && outcome && outcome.status !== 'complete') {
      return {
        status: outcome.status === 'defer' ? 'deferred' : 'failed',
        resolution, validationTuple: resolveResponseActionValidationTuple(action),
        detail: null, effectTrace: [], failureReason: outcome.message ?? 'Preview action did not complete.',
      };
    }

    const localPorts: typeof ports = filing ? {
      ...ports,
      dispatchHostEvent: () => {},
      // Filing effects stay local. The completed Response is stored below.
      dispatchEffect: effect => ({ type: effect.type, status: 'succeeded' }),
    } : ports;
    const invocation = await invokeResponseActionAsync(document, actionRef, localPorts, nodeId, invocationContext);
    if (!filing || invocation.status !== 'completed') return invocation;
    if (!draftFence || !invocation.detail) {
      return { ...invocation, status: 'failed', failureReason: 'Preview filing requires a saved draft.' };
    }
    const candidate = invocation.detail.response;
    const response = candidate.id === undefined
      ? { ...candidate, id: (parseJsonExact(draftFence.responseJson) as { id: string }).id }
      : candidate;
    const result = await submit(draftFence, JSON.stringify(response));
    return result.status === 'filed'
      ? { ...invocation, detail: { ...invocation.detail, response, previewFiling: { receiptRef: result.receiptRef, label: result.label } } }
      : { ...invocation, status: 'failed', failureReason: `Preview filing failed (${result.status}).` };
  };
}
