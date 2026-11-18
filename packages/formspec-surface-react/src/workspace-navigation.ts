/** @filedesc Resolve the form slot that owns section navigation and the page title. */
import type { SurfaceRoutePlan } from '@formspec-org/surface';
import type { SurfaceWidget } from './widget-api.js';

export function activeWorkspaceSlot(
  plan: SurfaceRoutePlan<SurfaceWidget> | undefined,
  requestedSlot: string | undefined,
): string | undefined {
  if (requestedSlot !== undefined) return requestedSlot;
  const formSlots = plan?.slots.filter(slot => slot.slotType === 'definition-form');
  return formSlots?.length === 1 ? formSlots[0]?.slotId : undefined;
}
