/** @filedesc App Manifest 2.4 entry selection reaches the React binding unchanged. */
import { describe, expect, it } from 'vitest';
import {
  dereferenceBundleExport,
  type BundleExport,
  type ResolvedBundle,
} from '@formspec-org/surface';
import type { SurfaceDocument } from '@formspec-org/types';
import { useSurfaceApp } from '../src/SurfaceApp.js';
import { render } from './render.js';

const respondent = {
  $formspecSurface: '0.2',
  id: 'respondent',
  entry: 'apply',
  routes: [{
    id: 'apply',
    path: '/apply',
    title: 'Apply',
    routeClass: 'intake',
    slots: [],
  }],
} as unknown as SurfaceDocument;

const staff = {
  $formspecSurface: '0.2',
  id: 'staff',
  entry: 'queue',
  routes: [{
    id: 'queue',
    path: '/queue',
    title: 'Queue',
    routeClass: 'operation',
    slots: [],
  }],
} as unknown as SurfaceDocument;

function exported(entrySurface?: string): BundleExport {
  return {
    manifest: {
      $formspecBundle: '2.4',
      surfaces: [
        { url: 'https://example.test/surfaces/respondent' },
        { url: 'https://example.test/surfaces/staff' },
      ],
      ...(entrySurface === undefined ? {} : { entrySurface }),
    },
    documents: {
      'https://example.test/surfaces/respondent': respondent,
      'https://example.test/surfaces/staff': staff,
    },
  };
}

function EntryProbe({ bundle }: { bundle: ResolvedBundle }) {
  const model = useSurfaceApp({ bundle });
  return <output data-entry>{model.app.entry?.surfaceId ?? 'none'}</output>;
}

describe('useSurfaceApp entry selection', () => {
  it('uses the exact second Surface selected by App Manifest 2.4', () => {
    const container = render(
      <EntryProbe bundle={dereferenceBundleExport(
        exported('https://example.test/surfaces/staff'),
      )} />,
    );

    expect(container.querySelector('[data-entry]')?.textContent).toBe('staff');
  });

  it('does not restore array-order fallback after an ambiguous omission', () => {
    const container = render(
      <EntryProbe bundle={dereferenceBundleExport(exported())} />,
    );

    expect(container.querySelector('[data-entry]')?.textContent).toBe('none');
  });
});
