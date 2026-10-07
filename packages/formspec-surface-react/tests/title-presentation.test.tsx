/** @filedesc Host-owned localized titles preserve authored defaults and runtime identity. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedBundle } from '@formspec-org/surface';
import type { SurfaceDocument } from '@formspec-org/types';
import { SurfaceApp, type SurfaceAppProps } from '../src/SurfaceApp.js';

const surface = { $formspecSurface: '0.2', id: 'owned', entry: 'intake', routes: [
  { id: 'intake', path: '/intake', title: 'Authored route', routeClass: 'intake', slots: [] },
  { id: 'other', path: '/other', title: 'Other route', routeClass: 'operation',
    navigation: { label: 'Explicit navigation label' }, slots: [] },
] } as SurfaceDocument;
const bundle = { manifest: { $formspecBundle: '2.4', title: 'Authored app' }, title: 'Authored app',
  surfaces: [surface], surfaceRefs: new Map([[surface, 'urn:owned:surface']]),
  experiences: [], definitions: new Map(), registries: [], responseActions: [], diagnostics: [],
} as ResolvedBundle;
const roots: Root[] = [];
afterEach(() => { act(() => { roots.splice(0).forEach(root => root.unmount()); }); });
function mount(props: Partial<SurfaceAppProps> = {}) {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container); roots.push(root);
  const base = { bundle, location: '/intake', onNavigate: () => {} };
  const update = (next: Partial<SurfaceAppProps>) => act(() => root.render(<SurfaceApp {...base} {...next} />));
  update(props);
  return { container, update, root };
}
const heading = (container: HTMLElement) => container.querySelector('.fs-surface-route__title');
const banner = (container: HTMLElement) => container.querySelector('.fs-surface-brand');

describe('host title presentation', () => {
  it('preserves authored titles and undefined resolver fallback', () => {
    const { container } = mount({ resolveRouteTitle: () => undefined });
    expect(heading(container)?.textContent).toBe('Authored route');
    expect(banner(container)?.textContent).toBe('Authored app');
    expect(container.querySelector('a[href="/intake"]')?.textContent).toBe('Authored route');
  });

  it('updates all title consumers without changing the route instance or artifacts', () => {
    document.title = 'Prior host title';
    const observed = vi.fn();
    const before = JSON.stringify(surface);
    const resolver = (title: string): NonNullable<SurfaceAppProps['resolveRouteTitle']> => handle => {
      expect(handle.surface).toBe(surface);
      return title;
    };
    const { container, update, root } = mount({ appTitle: 'Passport renewal',
      resolveRouteTitle: resolver('Passport renewal'), onCurrentRouteStateChange: observed });
    const article = container.querySelector('article');
    const initial = observed.mock.calls.at(-1)![0];
    expect(heading(container)?.textContent).toBe('Passport renewal');
    expect(container.querySelector('a[href="/intake"]')?.textContent).toBe('Passport renewal');
    expect(container.querySelector('a[href="/other"]')?.textContent).toBe('Explicit navigation label');
    update({ appTitle: 'Renovación de pasaporte', resolveRouteTitle: resolver('Renovación de pasaporte'),
      onCurrentRouteStateChange: observed });
    expect(banner(container)?.textContent).toBe('Renovación de pasaporte');
    expect(document.title).toBe('Renovación de pasaporte');
    expect(heading(container)?.textContent).toBe('Renovación de pasaporte');
    expect(container.querySelector('a[href="/intake"]')?.textContent).toBe('Renovación de pasaporte');
    expect(container.querySelector('article')).toBe(article);
    expect(observed).toHaveBeenCalledTimes(1);
    expect(initial.routeInstanceId).toBeTruthy();
    expect(JSON.stringify(surface)).toBe(before);
    act(() => root.unmount()); roots.splice(roots.indexOf(root), 1);
    expect(document.title).toBe('Prior host title');
  });

  it('names a host-heading route region with the same resolved title', () => {
    const { container } = mount({ headingBaseLevel: 1, resolveRouteTitle: () => 'Qualified form title' });
    expect(heading(container)).toBeNull();
    expect(container.querySelector('article')?.getAttribute('aria-label')).toBe('Qualified form title');
    expect(container.querySelector('a[href="/intake"]')?.textContent).toBe('Qualified form title');
  });

  it('preserves custom-header precedence and declined browser-title writes', () => {
    document.title = 'Host owned';
    const { container } = mount({ appTitle: 'Qualified title', header: 'Custom host chrome', setDocumentTitle: false });
    expect(container.querySelector('.fs-surface-header')?.textContent).toBe('Custom host chrome');
    expect(banner(container)).toBeNull();
    expect(document.title).toBe('Host owned');
  });
});
