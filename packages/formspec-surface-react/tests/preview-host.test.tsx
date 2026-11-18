/** @filedesc Exercise the maintained host by swapping its bundle and scenario inputs. */
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { BrowserSurfaceApp } from '../src/BrowserSurfaceApp.js';
import { createSurfacePreviewEdition } from '../src/preview-host.js';
import { previewValidators } from '../../../examples/surface-preview/validation.js';
import { render } from './render.js';

function publication(label: string, path: string) {
  const url = 'https://example.test/surface';
  return {
    manifest: { $formspecBundle: '2.4', title: label, surfaces: [{ url }], entrySurface: url },
    documents: { [url]: {
      $formspecSurface: '0.2', id: 'example', entry: 'start',
      routes: [{ id: 'start', path, title: label, routeClass: 'intake', slots: [] },
        { id: 'review', path: '/review', title: 'Review the request', routeClass: 'intake', slots: [] }],
    } },
  };
}

describe('static preview inputs', () => {
  it('switches unrelated bundles and honors the destination sidecar initial route', async () => {
    window.history.replaceState(null, '', '/preview/');
    const first = await createSurfacePreviewEdition({ scope: 'one', source: publication('Apply', '/apply') });
    const second = await createSurfacePreviewEdition({
      ...previewValidators, scope: 'two', source: publication('Inspect', '/inspect'),
      scenario: { $formspecSurfaceScenario: '0.1', version: '1', initialPath: '/review',
        defaultProfile: 'review', profiles: { review: { authorization: { default: 'refused' }, sources: [] } },
        actions: { default: { status: 'defer' } } },
    });
    const dom = render(<BrowserSurfaceApp previewEditions={[first, second]} />);
    expect(dom.querySelector('h1')?.textContent).toBe('Apply');
    const picker = dom.querySelector<HTMLSelectElement>('[data-surface-edition]')!;
    await act(async () => { picker.value = 'two'; picker.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(location.hash).toBe('#/review?edition=two');
    expect(dom.querySelector('h1')?.textContent).toBe('Review the request');
  });

  it('refuses a supplied invalid sidecar instead of deriving a replacement', async () => {
    await expect(createSurfacePreviewEdition({ scope: 'one', source: publication('Apply', '/apply'), scenario: null }))
      .rejects.toThrow('SURFACE-SCENARIO-SCHEMA');
  });
  it('refuses ambiguous app entry even when the sidecar can address one route', async () => {
    const source = publication('Apply', '/apply');
    const second = 'https://example.test/second';
    const { entrySurface, ...manifest } = source.manifest;
    const ambiguous = {
      manifest: { ...manifest, surfaces: [...manifest.surfaces, { url: second }] },
      documents: { ...source.documents, [second]: publication('Inspect', '/inspect').documents[entrySurface] },
    };
    await expect(createSurfacePreviewEdition({ scope: 'one', source: ambiguous, scenario: { initialPath: '/apply' } }))
      .rejects.toThrow('no resolved entry');
  });

});
