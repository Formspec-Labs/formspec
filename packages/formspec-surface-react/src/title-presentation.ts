/** @filedesc Host-owned route presentation with authored defaults. */
import type { SurfaceRouteHandle } from '@formspec-org/surface';

/** Pure presentation lookup for an exact admitted route; never routing or authority. */
export type SurfaceRouteTitleResolver = (
  handle: SurfaceRouteHandle,
) => string | undefined;

export function presentedRouteTitle(
  handle: SurfaceRouteHandle,
  resolve: SurfaceRouteTitleResolver | undefined,
): string {
  return resolve?.(handle) ?? handle.route.title ?? handle.routeId;
}
