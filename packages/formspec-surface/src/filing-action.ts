/** @filedesc Identify Definition actions that operate on a committed draft revision. */
import { resolveServiceRequest, type ResponseAction } from '@formspec-org/engine/render';
import type { ResponseActionsDocument } from '@formspec-org/types';

export type DraftFencedAction = 'prepare' | 'sign' | 'submit';

export function filingAction(
  document: ResponseActionsDocument | null | undefined, action: ResponseAction | null | undefined,
): DraftFencedAction | undefined {
  if (!action || document?.scope === 'app') return undefined;
  const catalog = document?.['x-formspec-runtime'];
  for (const effect of action.effects ?? []) {
    if (!catalog || effect.type !== 'serviceRequest') continue;
    const operation = resolveServiceRequest(catalog, effect.requestRef).operation;
    if (operation === 'prepare' || operation === 'sign') return operation;
  }
  return action.intent === 'submit' ? 'submit' : undefined;
}
