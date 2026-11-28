/** @filedesc Exercise the maintained host by swapping its bundle and scenario inputs. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import * as engineModule from '@formspec-org/engine';
import { BrowserSurfaceApp } from '../src/BrowserSurfaceApp.js';
import { createMemoryFilingStore } from '../src/browser-draft-port.js';
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

  it('shows In progress on the form-status tracker and hydrates saved draft answers on open', async () => {
    window.history.replaceState(null, '', '/preview/');
    const surfaceUrl = 'https://example.test/surface';
    const reportUrl = 'https://example.test/definitions/report';
    const source = {
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/app',
        title: 'Filing Preview',
        surfaces: [{ url: surfaceUrl }],
        entrySurface: surfaceUrl,
        definitions: [{ url: reportUrl, version: '1.0.0' }],
      },
      documents: {
        [surfaceUrl]: {
          $formspecSurface: '0.4',
          id: 'app',
          entry: 'overview',
          routes: [
            {
              id: 'overview',
              path: '/overview',
              title: 'Overview',
              slots: [{
                id: 'tracker',
                slotType: 'form-status',
                binding: {
                  groups: [{
                    id: 'annual',
                    label: 'Annual reports',
                    forms: [{
                      routeRef: 'report',
                      slotRef: 'form',
                      params: { unit: { value: 'north' } },
                    }],
                  }],
                },
              }],
            },
            {
              id: 'report',
              path: '/report/{unit}',
              title: 'Annual Report',
              routeClass: 'intake',
              params: [{ name: 'unit', type: 'string' }],
              slots: [{
                id: 'form',
                slotType: 'definition-form',
                binding: {
                  definitionRef: reportUrl,
                  subjectKeys: { unit: 'unit' },
                },
              }],
            },
          ],
        },
        [reportUrl]: {
          $formspec: '1.0',
          url: reportUrl,
          version: '1.0.0',
          title: 'Annual Report',
          status: 'active',
          subject: {
            type: reportUrl,
            keys: { unit: { dataType: 'string' } },
          },
          items: [{
            key: 'details',
            type: 'group',
            label: 'Details',
            children: [
              { key: 'summary', type: 'field', dataType: 'string', label: 'Summary' },
              { key: 'contact', type: 'field', dataType: 'string', label: 'Contact email' },
            ],
          }],
          binds: [
            { path: 'details.summary', required: 'true' },
            { path: 'details.contact', required: 'true' },
          ],
        },
      },
    };

    const scenario = {
      $formspecSurfaceScenario: '0.1',
      version: '1.0.0',
      initialPath: '/overview',
      defaultProfile: 'inProgress',
      profiles: {
        inProgress: {
          authorization: { default: 'authorized' },
          sources: [],
          drafts: [{
            definitionUrl: reportUrl,
            subject: { type: reportUrl, keys: { unit: 'north' } },
            data: { details: { summary: 'Seeded draft answer' } },
          }],
        },
      },
      actions: { default: { status: 'complete' } },
    };

    const edition = await createSurfacePreviewEdition({
      ...previewValidators,
      scope: 'seeded-preview',
      source,
      scenario,
      createFilingStore: createMemoryFilingStore,
    });

    const engineSpy = vi.spyOn(engineModule, 'createFormEngine');
    const dom = render(<BrowserSurfaceApp previewEditions={[edition]} />);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });

    expect(dom.textContent).toContain('In progress');
    expect(dom.textContent).toContain('1 of 2 answered');
    // Tracker rendering must read precomputed counts without booting a FormEngine.
    expect(engineSpy).not.toHaveBeenCalled();
    engineSpy.mockRestore();

    const link = dom.querySelector<HTMLAnchorElement>('a[href*="/report/north"]')!;
    expect(link).not.toBeNull();
    await act(async () => {
      link.click();
      await new Promise(resolve => setTimeout(resolve, 25));
    });

    const inputs = [...dom.querySelectorAll<HTMLInputElement>('input')];
    expect(inputs.some(input => input.value === 'Seeded draft answer')).toBe(true);

    // Invalid draft subject is refused with an actionable SURFACE-SCENARIO-DRAFT-FIXTURE diagnostic.
    const invalidScenario = {
      ...scenario,
      profiles: {
        inProgress: {
          ...scenario.profiles.inProgress,
          drafts: [{
            definitionUrl: reportUrl,
            subject: { type: reportUrl, keys: { unit: 123 } },
            data: { details: { summary: 'Wrong subject key type' } },
          }],
        },
      },
    };
    await expect(createSurfacePreviewEdition({
      ...previewValidators,
      scope: 'seeded-preview-invalid',
      source,
      scenario: invalidScenario,
      createFilingStore: createMemoryFilingStore,
    })).rejects.toThrow('SURFACE-SCENARIO-DRAFT-FIXTURE');
  });

  it('uses a form-bound Component when an app-shell Component targets the same route earlier in manifest.components', async () => {
    const surfaceUrl = 'urn:review:surface';
    const defUrl = 'urn:test:a';
    const shellUrl = 'urn:review:shell-component';
    const formCompUrl = 'urn:review:form-component';
    const source = {
      manifest: {
        $formspecBundle: '2.4',
        id: 'urn:review:app',
        title: 'Component Targeting',
        surfaces: [{ url: surfaceUrl }],
        entrySurface: surfaceUrl,
        definitions: [{ url: defUrl, version: '1.0.0' }],
        components: [{ url: shellUrl }, { url: formCompUrl }],
      },
      documents: {
        [surfaceUrl]: {
          $formspecSurface: '0.4',
          id: 's',
          entry: 'home',
          routes: [{
            id: 'home',
            path: '/',
            title: 'Home',
            routeClass: 'intake',
            slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: defUrl } }],
          }],
        },
        [defUrl]: {
          $formspec: '1.0',
          url: defUrl,
          version: '1.0.0',
          title: 'Form A',
          status: 'active',
          items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Answer' }],
        },
        [shellUrl]: {
          $formspecComponent: '1.2',
          version: '1.0.0',
          targetSurfaceRoutes: [{ surface: { url: surfaceUrl }, route: 'home', role: 'app-shell' }],
          tree: { component: 'Heading', level: 1, text: 'Review shell' },
        },
        [formCompUrl]: {
          $formspecComponent: '1.0',
          version: '1.0.0',
          targetDefinition: { url: defUrl },
          tree: { component: 'TextInput', bind: 'answer' },
        },
      },
    };

    const edition = await createSurfacePreviewEdition({
      ...previewValidators,
      scope: 'component-targeting',
      source,
      createFilingStore: createMemoryFilingStore,
    });
    const selected = edition.adapters.resolveDefinitionComponent?.({
      surfaceRef: surfaceUrl,
      routeId: 'home',
      slotId: 'form',
      definition: edition.bundle.definitions.get(defUrl)!,
    });
    expect(selected).toEqual(source.documents[formCompUrl]);
  });

  it('opens a preview with no draft fixtures when browser IndexedDB refuses open, while rejecting profiles that require seeding', async () => {
    const surfaceUrl = 'https://example.test/surface';
    const defUrl = 'https://example.test/definitions/only';
    const source = {
      manifest: {
        $formspecBundle: '2.4',
        id: 'https://example.test/blocked-idb',
        title: 'Blocked Storage',
        surfaces: [{ url: surfaceUrl }],
        entrySurface: surfaceUrl,
        definitions: [{ url: defUrl, version: '1.0.0' }],
      },
      documents: {
        [surfaceUrl]: {
          $formspecSurface: '0.4',
          id: 'app',
          entry: 'start',
          routes: [{
            id: 'start',
            path: '/',
            title: 'Start',
            routeClass: 'intake',
            slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: defUrl } }],
          }],
        },
        [defUrl]: {
          $formspec: '1.0',
          url: defUrl,
          version: '1.0.0',
          title: 'Only Form',
          status: 'active',
          items: [{ key: 'answer', type: 'field', dataType: 'string', label: 'Answer' }],
        },
      },
    };

    const previousIdb = globalThis.indexedDB;
    const blockedIdb = {
      open() {
        const error = Object.assign(new Error('Storage disabled by user settings'), { name: 'SecurityError' });
        const req: Partial<IDBOpenDBRequest> = {};
        queueMicrotask(() => {
          (req as { error: unknown }).error = error;
          req.onerror?.(new Event('error'));
        });
        return req as IDBOpenDBRequest;
      },
    } as unknown as IDBFactory;
    Object.defineProperty(globalThis, 'indexedDB', { value: blockedIdb, configurable: true, writable: true });
    try {
      const edition = await createSurfacePreviewEdition({
        ...previewValidators,
        scope: 'blocked-no-drafts',
        source,
      });
      const summary = await edition.adapters.draftStorage!.port.readSummaries(
        [{ key: 'only', definitionUrl: defUrl, definitionVersion: '1.0.0', sections: [{ fields: ['answer'] }] }],
        { previewScope: 'blocked-no-drafts', signal: new AbortController().signal },
      );
      expect(summary.get('only')?.draft.status).toBe('unavailable');

      await expect(createSurfacePreviewEdition({
        ...previewValidators,
        scope: 'blocked-with-drafts',
        source,
        scenario: {
          $formspecSurfaceScenario: '0.1',
          version: '1.0.0',
          initialPath: '/',
          defaultProfile: 'seeded',
          profiles: {
            seeded: {
              authorization: { default: 'authorized' },
              sources: [],
              drafts: [{ definitionUrl: defUrl, data: { answer: 'Seeded' } }],
            },
          },
          actions: { default: { status: 'complete' } },
        },
      })).rejects.toThrow('Storage disabled by user settings');
    } finally {
      if (previousIdb === undefined) {
        Reflect.deleteProperty(globalThis, 'indexedDB');
      } else {
        Object.defineProperty(globalThis, 'indexedDB', { value: previousIdb, configurable: true, writable: true });
      }
    }
  });

});

// The stack publishes these synthetic examples in a sibling repository.
const examples = resolve(import.meta.dirname, '../../../../tools/deployment-tools/examples/packages');
it.skipIf(!existsSync(examples)).each([
  ['passport-renewal-governance/applicant.surface.bundle.json', '/eligibility'],
  ['service-request-intake/surface.bundle.json', '/intake'],
])('admits the published example %s through the static validators', async (file, initialPath) => {
  const source = JSON.parse(readFileSync(resolve(examples, file), 'utf8'));
  const edition = await createSurfacePreviewEdition({ source, scope: 'example', ...previewValidators });
  expect(edition.initialPath).toBe(initialPath);
  expect(edition.bundle.title).toBe(source.manifest.title);
});
