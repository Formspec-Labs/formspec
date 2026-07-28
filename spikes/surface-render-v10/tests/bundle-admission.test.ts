/** @filedesc The host admits verified bytes before shell core or binding loads. */
import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  BundleExport,
  ResolvedBundle,
} from '@formspec-org/surface';
import {
  loadAdmittedSurfaceApp,
  type BundleAdmissionLoaders,
} from '../src/bundle-admission.ts';

const bundleExport: BundleExport = {
  manifest: {},
  documents: {},
};

const resolvedBundle: ResolvedBundle = {
  manifest: {},
  title: undefined,
  surfaces: [],
  experiences: [],
  tenantTheme: undefined,
  registries: [],
  responseActions: [],
  definitions: new Map(),
  diagnostics: [],
};

function FakeApp() {
  return null;
}

test('does not load core or binding when host verification refuses admission', async () => {
  let coreLoads = 0;
  let bindingLoads = 0;
  const loaders: BundleAdmissionLoaders = {
    loadCore: async () => {
      coreLoads += 1;
      throw new Error('core loader must not run');
    },
    loadBinding: async () => {
      bindingLoads += 1;
      throw new Error('binding loader must not run');
    },
  };

  const admitted = await loadAdmittedSurfaceApp(
    false,
    bundleExport,
    loaders,
  );

  assert.equal(admitted, undefined);
  assert.equal(coreLoads, 0);
  assert.equal(bindingLoads, 0);
});

test('dereferences the exact verified export only after both admitted loaders run', async () => {
  const events: string[] = [];
  let received: BundleExport | undefined;
  const loaders: BundleAdmissionLoaders = {
    loadCore: async () => {
      events.push('load-core');
      return {
        resolveVerifiedBundle: (input) => {
          events.push('dereference');
          received = input;
          return resolvedBundle;
        },
      };
    },
    loadBinding: async () => {
      events.push('load-binding');
      return { App: FakeApp };
    },
  };

  const admitted = await loadAdmittedSurfaceApp(
    true,
    bundleExport,
    loaders,
  );

  assert.deepEqual(events, ['load-core', 'load-binding', 'dereference']);
  assert.equal(received, bundleExport);
  assert.equal(admitted?.bundle, resolvedBundle);
  assert.equal(admitted?.App, FakeApp);
});
