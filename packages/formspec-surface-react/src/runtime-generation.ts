/** @filedesc Exact route/session identity shared by the Surface shell and qualified hosts. */
import {
  matchRoute,
  type SurfaceApp as ComposedSurfaceApp,
} from "@formspec-org/surface";

export interface SurfaceRuntimeGenerationInput {
  /** Same admitted composition and options exposed by useSurfaceApp. */
  app: ComposedSurfaceApp;
  /** Opaque host marker, not the derived Data Source request identity. */
  sessionGeneration?: string | number | undefined;
  location: string;
  /** Same explicit SurfaceApp props; do not merge parameters parsed from the path. */
  routeParams?: Readonly<Record<string, string>> | undefined;
}

/**
 * Derive the exact identity carried by Data Source requests and action guards.
 * Hosts register it before loading; equality supplies no authority or freshness.
 * Use a host visit/invalidation marker to distinguish a return to the same route.
 */
export function deriveSurfaceRuntimeGeneration(
  input: SurfaceRuntimeGenerationInput
): string {
  const match = matchRoute(input.app, input.location).match;
  const params = Object.entries(input.routeParams ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key.length}:${key}${value.length}:${value}`)
    .join("|");
  const parts = [
    String(input.sessionGeneration ?? "default"),
    input.location,
    match?.handle.surfaceId ?? "",
    match?.handle.routeId ?? "",
    params,
  ];
  return parts.map((part) => `${part.length}:${part}`).join("|");
}
