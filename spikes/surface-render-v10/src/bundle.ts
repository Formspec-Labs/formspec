/**
 * @filedesc The sole signed-export admission point into shell core.
 *
 * This module is dynamically imported only after the host has verified the
 * committed bytes. Module evaluation does not dereference them: the explicit
 * function call below is the moment verified input enters shell core.
 */
import {
  dereferenceBundleExport,
  type BundleExport,
  type ResolvedBundle,
} from '@formspec-org/surface';

/**
 * Every artifact the manifest names, typed, plus a diagnostic for anything it
 * names and does not carry.
 *
 * `tenantTheme` lives on this object and enters the shipped shell once.
 * `SurfaceApp` passes it to `createThemeAuthority`, then route rendering receives
 * only the resulting grant. That boundary makes bar R3 structural.
 */
export function resolveVerifiedBundle(bundleExport: BundleExport): ResolvedBundle {
  return dereferenceBundleExport(bundleExport);
}
