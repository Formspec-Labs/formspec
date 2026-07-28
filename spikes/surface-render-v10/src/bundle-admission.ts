/**
 * @filedesc Loads shell core and the React binding only after host admission.
 *
 * The boolean is the host's completed verification decision. A false decision
 * returns before either dynamic loader runs, so unverified bundle-derived data
 * cannot enter core or binding through module initialization.
 */
import type { ComponentType } from 'react';
import type {
  BundleExport,
  ResolvedBundle,
} from '@formspec-org/surface';
import type { VerificationOutcome } from './verify.ts';

export interface VerifiedAppProps {
  bundle: ResolvedBundle;
  verification: VerificationOutcome;
}

interface SurfaceCoreModule {
  resolveVerifiedBundle: (bundleExport: BundleExport) => ResolvedBundle;
}

interface SurfaceBindingModule {
  App: ComponentType<VerifiedAppProps>;
}

export interface BundleAdmissionLoaders {
  loadCore: () => Promise<SurfaceCoreModule>;
  loadBinding: () => Promise<SurfaceBindingModule>;
}

export interface AdmittedSurfaceApp {
  App: ComponentType<VerifiedAppProps>;
  bundle: ResolvedBundle;
}

const defaultLoaders: BundleAdmissionLoaders = {
  loadCore: () => import('./bundle.ts'),
  loadBinding: () => import('./app.tsx'),
};

export async function loadAdmittedSurfaceApp(
  admitted: boolean,
  bundleExport: BundleExport,
  loaders: BundleAdmissionLoaders = defaultLoaders,
): Promise<AdmittedSurfaceApp | undefined> {
  if (!admitted) return undefined;
  const [core, binding] = await Promise.all([
    loaders.loadCore(),
    loaders.loadBinding(),
  ]);
  return {
    App: binding.App,
    bundle: core.resolveVerifiedBundle(bundleExport),
  };
}
