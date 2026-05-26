/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * Host-evidence source contract for a Component graph projection context. The context lets projection consumers emit inert graph identity metadata after AppGraphValidator proves the Component membership, Component targetSurfaceRoutes entry, Surface identity, and route coverage. It is not an App Manifest artifact, not a renderer instruction, not runtime route state, not authorization, and not source-path identity.
 */
export interface ComponentGraphProjectionContext {
  component: ComponentMembershipRef;
  surface: SurfaceRef;
  /**
   * Surface routes[].id active for the projection context. AppGraphValidator proves the loaded Component declares this route in targetSurfaceRoutes[] before consumers trust the context.
   */
  route: string;
}
/**
 * App Manifest Component membership selected for projection identity.
 */
export interface ComponentMembershipRef {
  /**
   * App Manifest components[].handle, or the compatibility handle default for singular component.
   */
  handle: string;
  /**
   * Optional Component URL. When present, AppGraphValidator compares it to the App Manifest membership and loaded Component handle; source paths and filenames are never identity.
   */
  url?: string;
  /**
   * Optional Component version. Exact SemVer values are compared to the App Manifest membership and loaded Component handle when both sides pin exact SemVer.
   */
  version?: string;
}
/**
 * Surface identity whose route anchors the projection context.
 */
export interface SurfaceRef {
  /**
   * Surface URL. AppGraphValidator resolves this against App Manifest surfaces[] and one loaded Surface handle.
   */
  url: string;
  /**
   * Optional Surface version. Exact SemVer values are compared to App Manifest and loaded Surface handle versions when both sides pin exact SemVer.
   */
  version?: string;
}
