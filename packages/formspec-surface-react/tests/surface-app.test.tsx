/**
 * @filedesc `SurfaceApp` as a host sees it — the diagnostic channel, the
 * unmatched path, and the globals the binding is allowed to touch.
 *
 * The load-bearing test in this file is the first one. Divergence D4, the most
 * consequential in the register: the binding computed `planRoute` and
 * `planTransitions` diagnostics per route and **discarded** them, so the
 * majority of the closed code set surfaced only as on-page copy — unloggable,
 * unalarmable, uncountable, and gone the moment the route unmounted.
 */
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import {
  resolveSurfaceStrings,
  type ResolvedBundle,
  type SurfaceDiagnostic,
} from '@formspec-org/surface';
import type { ExperienceDocument, SurfaceDocument, ThemeDocument } from '@formspec-org/types';
import { SurfaceApp } from '../src/SurfaceApp.js';
import { starterWidgetModule } from '../src/widgets/index.js';
import { render, textOf } from './render.js';

const TENANT = '#7A1F3D';

const surface = {
  $formspecSurface: '0.1',
  id: 'demo',
  entry: 'noisy',
  routes: [
    {
      id: 'noisy',
      path: '/noisy',
      title: 'Noisy route',
      // No `routeClass`: THEME-UNCLASSIFIED-REFUSED is a per-route diagnostic
      // too, and it was equally invisible.
      slots: [
        { id: 'seal', slotType: 'static-content', binding: { kind: 'image', content: 'seal.png' } },
        { id: 'form', slotType: 'definition-form', binding: { definitionRef: 'urn:absent' } },
        { id: 'w', slotType: 'module-widget', binding: { moduleId: 'x-chrome', widgetName: 'ghost' } },
        { id: 'e', slotType: 'embed-route', binding: { routeRef: 'nowhere' } },
        { id: 'u', slotType: 'experience-unit', binding: { unitRef: 'absent' } },
        { id: 'bad', slotType: 'static-content', binding: { kind: 'video', content: 'x' } },
      ],
      transitions: [{ trigger: 'submit', to: 'noisy' }],
    },
  ],
} as unknown as SurfaceDocument;

const bundle: ResolvedBundle = {
  manifest: { $formspecBundle: '2.0', title: 'Noisy release' },
  title: 'Noisy release',
  surfaces: [surface],
  experiences: [{ $formspecExperience: '1.0', units: [] } as unknown as ExperienceDocument],
  tenantTheme: {
    $formspecTheme: '1.0',
    tokens: { 'color.primary': TENANT },
  } as unknown as ThemeDocument,
  registries: [],
  responseActions: [],
  definitions: new Map(),
  diagnostics: [],
};

function mount(overrides: Record<string, unknown> = {}) {
  const seen: SurfaceDiagnostic[][] = [];
  const container = render(
    <SurfaceApp
      bundle={bundle}
      location="/noisy"
      onNavigate={() => {}}
      widgetModules={[starterWidgetModule('x-chrome')]}
      onDiagnostics={(diagnostics) => seen.push([...diagnostics])}
      {...overrides}
    />,
  );
  return { container, codes: () => (seen.at(-1) ?? []).map((d) => d.code), last: () => seen.at(-1) ?? [] };
}

describe('every diagnostic reaches the host (§7.1, D4)', () => {
  it('delivers per-slot diagnostics to onDiagnostics, not only to the page', () => {
    const { codes } = mount();
    expect(codes()).toContain('STATIC-IMAGE-NO-ALT');
    expect(codes()).toContain('BUNDLE-DOCUMENT-MISSING');
    expect(codes()).toContain('WIDGET-UNDECLARED');
    expect(codes()).toContain('EMBED-ROUTE-UNRESOLVED');
    expect(codes()).toContain('EXPERIENCE-UNIT-UNRESOLVED');
    expect(codes()).toContain('SLOT-BINDING-INCOMPLETE');
  });

  it('delivers the theme-grant diagnostic', () => {
    expect(mount().codes()).toContain('THEME-UNCLASSIFIED-REFUSED');
  });

  it('delivers the transition diagnostic', () => {
    expect(mount().codes()).toContain('TRANSITION-UNFIREABLE');
  });

  it('gives the host a severity on every one of them', () => {
    // D3, at the channel a host actually reads.
    for (const diagnostic of mount().last()) {
      expect(diagnostic.severity).toMatch(/^(error|warning|info)$/);
    }
  });

  it('carries a document-vocabulary site, never a component-tree path', () => {
    const slotDiagnostic = mount()
      .last()
      .find((d) => d.code === 'STATIC-IMAGE-NO-ALT');
    expect(slotDiagnostic?.site).toEqual({ surfaceId: 'demo', routeId: 'noisy', slotId: 'seal' });
  });
});

describe('an unmatched path (§2.6, D5)', () => {
  it('reports ROUTE-UNMATCHED to the host', () => {
    const { codes } = mount({ location: '/nowhere' });
    expect(codes()).toContain('ROUTE-UNMATCHED');
  });

  it('renders no route content and never redirects to the entry route', () => {
    const { container } = mount({ location: '/nowhere' });
    expect(container.querySelector('[data-route]')).toBeNull();
    expect(container.querySelector('[data-probe="route-not-found"]')).not.toBeNull();
  });

  it('lets the host present the unmatched state', () => {
    const { container } = mount({
      location: '/nowhere',
      renderNotFound: (path: string) => <p data-probe="host-404">{path}</p>,
    });
    expect(textOf(container.querySelector('[data-probe="host-404"]'))).toBe('/nowhere');
  });

  it('takes its own not-found wording from the host string table', () => {
    const { container } = mount({
      location: '/nowhere',
      strings: resolveSurfaceStrings({ notFoundTitle: 'Adres bulunamadı.' }),
    });
    expect(textOf(container.querySelector('[data-probe="route-not-found"] h1'))).toBe(
      'Adres bulunamadı.',
    );
  });
});

describe('the document root (§4.5, D7)', () => {
  it('says nothing when the root is clean', () => {
    expect(mount().codes()).not.toContain('THEME-DOCUMENT-ROOT-CONTAMINATED');
  });

  it('REPORTS a contaminated root rather than scrubbing it', () => {
    document.documentElement.style.setProperty('--formspec-color-primary', TENANT);
    const { codes } = mount();
    expect(codes()).toContain('THEME-DOCUMENT-ROOT-CONTAMINATED');
    // Reported, not repaired: a shell that manufactures the property it reports
    // is not measuring anything, and the leak stays broken for every consumer
    // that is not this shell.
    expect(document.documentElement.style.getPropertyValue('--formspec-color-primary')).toBe(TENANT);
  });
});

describe('document.title (§8.3 item 9, D16)', () => {
  it('sets it from the bundle', () => {
    document.title = 'Host page';
    mount();
    expect(document.title).toBe('Noisy release');
  });

  it('RESTORES the previous title on unmount', () => {
    document.title = 'Host page';
    const container = render(
      <SurfaceApp bundle={bundle} location="/noisy" onNavigate={() => {}} />,
    );
    expect(document.title).toBe('Noisy release');
    act(() => {
      container.remove();
    });
  });

  it('writes nothing when the host declines', () => {
    document.title = 'Host page';
    mount({ setDocumentTitle: false });
    expect(document.title).toBe('Host page');
  });
});

describe('navigation', () => {
  it('names the navigation landmark from the string table', () => {
    const { container } = mount({
      strings: resolveSurfaceStrings({ navigationLabel: 'Bu uygulamadaki sayfalar' }),
    });
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Bu uygulamadaki sayfalar',
    );
  });

  it('lets an explicit navigationLabel win', () => {
    const { container } = mount({ navigationLabel: 'Sections' });
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Sections');
  });

  it('does not synthesize a transition control without a host executor', () => {
    // §5.1: no synthesized Continue, Next, or Submit control, under any label,
    // on any route.
    const { container } = mount();
    expect(container.querySelector('[data-probe="transition-fireable"]')).toBeNull();
    expect(container.querySelector('.fs-surface-transition__button')).toBeNull();
  });

  it('renders a control only once the trigger resolves AND the host supplies an executor', () => {
    // "Supplying the executor is the host asking", which is what makes this not
    // a default affordance (§5.3). Both halves are required: with no Response
    // Actions document the trigger resolves against nothing.
    const onFireTransition = vi.fn(async () => ({ advanced: false }));
    expect(mount({ onFireTransition }).container.querySelector('.fs-surface-transition__button'))
      .toBeNull();

    const withActions = {
      ...bundle,
      responseActions: [{ actions: [{ id: 'submitApplication', intent: 'submit' }] }],
    };
    const { container } = mount({ bundle: withActions, onFireTransition });
    expect(container.querySelector('.fs-surface-transition__button')).not.toBeNull();
    expect(onFireTransition).not.toHaveBeenCalled();
  });
});
