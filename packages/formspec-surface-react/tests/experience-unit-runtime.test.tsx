/** @filedesc End-to-end Experience source identity and direct Need trace rendering. */
import { describe, expect, it } from 'vitest';
import {
  dereferenceBundleExport,
  type BundleExport,
} from '@formspec-org/surface';
import type { ExperienceDocument, SurfaceDocument } from '@formspec-org/types';
import { SurfaceApp } from '../src/SurfaceApp.js';
import { render, textOf } from './render.js';

const surface = {
  $formspecSurface: '0.2',
  id: 'review',
  entry: 'review',
  routes: [
    {
      id: 'review',
      path: '/review',
      title: 'Review',
      routeClass: 'operation',
      slots: [
        {
          id: 'why',
          slotType: 'experience-unit',
          binding: {
            experienceRef: 'experience:review',
            unitRef: 'shared',
          },
        },
      ],
    },
  ],
} as unknown as SurfaceDocument;

const respondentExperience = {
  $formspecExperience: '1.0',
  version: '1.0.0',
  units: [
    {
      id: 'shared',
      kind: 'data-entry',
      title: 'Enter household details',
      needRefs: [{ id: 'complete-application' }],
    },
  ],
} as unknown as ExperienceDocument;

const reviewExperience = {
  $formspecExperience: '1.0',
  version: '1.0.0',
  units: [
    {
      id: 'shared',
      kind: 'review',
      title: 'Review the household record',
      needRefs: [
        { id: 'review-record' },
        { id: 'confirm-accuracy' },
        { id: 'review-record' },
      ],
    },
  ],
} as unknown as ExperienceDocument;

const exportedBundle: BundleExport = {
  manifest: {
    $formspecBundle: '2.0',
    surfaces: [{ url: 'surface:review' }],
    experiences: [
      { url: 'experience:respondent' },
      { url: 'experience:review' },
    ],
  },
  documents: {
    'surface:review': surface,
    'experience:respondent': respondentExperience,
    'experience:review': reviewExperience,
  },
};

describe('experience-unit runtime', () => {
  it('keeps the exact manifested Experience out of the customer DOM', () => {
    const container = render(
      <SurfaceApp
        bundle={dereferenceBundleExport(exportedBundle)}
        location="/review"
        onNavigate={() => {}}
        setDocumentTitle={false}
      />,
    );
    expect(container.querySelector('.fs-surface-unit')).toBeNull();
    expect(container.querySelector('[data-slot="why"]')).toBeNull();
    expect(container.textContent).not.toContain('Review the household record');
    expect(container.textContent).not.toContain('Enter household details');
  });

  it('shows the manifested Experience only in an explicit authoring view', () => {
    const container = render(
      <SurfaceApp
        bundle={dereferenceBundleExport(exportedBundle)}
        location="/review"
        onNavigate={() => {}}
        setDocumentTitle={false}
        showExperienceNeeds
      />,
    );
    const unit = container.querySelector('.fs-surface-unit');

    expect(textOf(unit?.querySelector('.fs-surface-unit__title') ?? null)).toBe(
      'Review the household record',
    );
    expect(unit?.getAttribute('data-need-ids')).toBe('review-record confirm-accuracy');
    expect(unit?.hasAttribute('data-need-anchors')).toBe(false);
    expect(container.textContent).not.toContain('Enter household details');
  });
});
