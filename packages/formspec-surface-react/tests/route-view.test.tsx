/**
 * @filedesc The rendered route — headings, slot dispatch in the DOM, and the
 * theme boundary as it actually reaches the page.
 *
 * `@formspec-org/surface`'s tests hold the boundary at the plan; these hold it
 * at the pixels: what a refusing route's element actually carries as CSS custom
 * properties, and which heading level each thing is emitted at.
 */
import { describe, expect, it } from 'vitest';
import {
  composeSurfaceApp,
  createThemeAuthority,
  createWidgetRegistry,
  planMatchedRoute,
  resolveSurfaceStrings,
  type HeadingLevel,
  type SurfaceRouteHandle,
} from '@formspec-org/surface';
import type { SurfaceDocument, ThemeDocument } from '@formspec-org/types';
import { SurfaceRouteView } from '../src/SurfaceRoute.js';
import { starterWidgetModule } from '../src/widgets/index.js';
import type { SurfaceWidget } from '../src/widget-api.js';
import { render, textOf } from './render.js';

const TENANT = '#7A1F3D';
const tenantTheme = {
  $formspecTheme: '1.0',
  tokens: { 'color.primary': TENANT },
} as unknown as ThemeDocument;

function surfaceWith(routes: unknown[]): SurfaceDocument {
  return {
    $formspecSurface: '0.1',
    id: 'demo',
    entry: 'a',
    routes,
  } as unknown as SurfaceDocument;
}

const surface = surfaceWith([
  {
    id: 'a',
    path: '/a',
    title: 'Apply for help',
    routeClass: 'intake',
    slots: [
      { id: 'lead', slotType: 'static-content', binding: { kind: 'heading', content: 'Start here', level: 1 } },
      { id: 'note', slotType: 'static-content', title: 'Before you start', binding: { kind: 'text', content: 'A sentence.' } },
      { id: 'rule', slotType: 'static-content', binding: { kind: 'divider', content: '' } },
      {
        id: 'chrome',
        slotType: 'module-widget',
        binding: { moduleId: 'x-chrome', widgetName: 'x-intake-banner', config: { headline: 'Ten minutes' } },
      },
      { id: 'why', slotType: 'experience-unit', binding: { unitRef: 'u1' } },
    ],
  },
  {
    id: 'p',
    path: '/p',
    title: 'Your receipt',
    routeClass: 'proof',
    slots: [
      { id: 'panel', slotType: 'module-widget', binding: { moduleId: 'x-chrome', widgetName: 'x-receipt-panel' } },
    ],
  },
  {
    id: 'ghost',
    path: '/ghost',
    title: 'Unclassified',
    slots: [{ id: 'g', slotType: 'module-widget', binding: { moduleId: 'x-chrome', widgetName: 'nope' } }],
  },
  {
    id: 'host',
    path: '/host',
    title: 'Host route',
    routeClass: 'operation',
    slots: [{ id: 'embed', slotType: 'embed-route', binding: { routeRef: 'inner' } }],
  },
  {
    id: 'inner',
    path: '/inner',
    title: 'Inner route',
    routeClass: 'intake',
    slots: [
      { id: 'inner-heading', slotType: 'static-content', binding: { kind: 'heading', content: 'Inner heading', level: 1 } },
      { id: 'inner-text', slotType: 'static-content', title: 'Inner title', binding: { kind: 'text', content: 'Inner body.' } },
    ],
  },
]);

const experiences = [
  {
    $formspecExperience: '1.0',
    units: [{ id: 'u1', kind: 'data-entry', title: 'Tell us about your household', needRefs: [{ id: 'n', description: 'Internal note.' }] }],
  },
] as never;

const app = composeSurfaceApp([surface]);
const widgets = createWidgetRegistry<SurfaceWidget>({ modules: [starterWidgetModule('x-chrome')] });
const authority = createThemeAuthority({ tenantTheme });

function planFor(routeId: string, headingBaseLevel?: HeadingLevel) {
  const handle = app.routes.find((candidate) => candidate.routeId === routeId) as SurfaceRouteHandle;
  return planMatchedRoute<SurfaceWidget>({
    handle,
    app,
    experiences,
    definitions: new Map(),
    registryEntries: [],
    widgets,
    themeAuthority: authority,
    ...(headingBaseLevel !== undefined ? { headingBaseLevel } : {}),
  });
}

function view(routeId: string, extra: Record<string, unknown> = {}, headingBaseLevel?: HeadingLevel) {
  return render(<SurfaceRouteView plan={planFor(routeId, headingBaseLevel)} {...extra} />);
}

describe('heading structure', () => {
  it('gives the page exactly one h1, and it is the route title', () => {
    const container = view('a');
    const h1s = [...container.querySelectorAll('h1')];
    expect(h1s).toHaveLength(1);
    expect(textOf(h1s[0]!)).toBe('Apply for help');
  });

  it('renders an authored level-1 static heading as an h2, not a second h1', () => {
    const container = view('a');
    const heading = container.querySelector('[data-slot="lead"] .fs-surface-static-heading');
    expect(heading?.tagName).toBe('H2');
    expect(textOf(heading)).toBe('Start here');
  });

  it('skips no heading level anywhere on the page', () => {
    const container = view('a');
    const levels = [...container.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((node) =>
      Number(node.tagName.slice(1)),
    );
    expect(levels[0]).toBe(1);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]! - levels[index - 1]!).toBeLessThanOrEqual(1);
    }
  });

  it('does not render a slot title on top of a static-content slot’s own heading', () => {
    const container = view('a');
    expect(container.querySelectorAll('[data-slot="lead"] .fs-surface-slot__title')).toHaveLength(0);
  });

  it('KEEPS an authored slot title on a static-content slot that is not a heading', () => {
    // Skipping the title for the whole slot type silently discarded authored
    // content: a `kind: text` slot titled "Before you start" lost its title.
    const container = view('a');
    expect(textOf(container.querySelector('[data-slot="note"] .fs-surface-slot__title'))).toBe(
      'Before you start',
    );
  });
});

describe('the host-supplied heading baseline (D14c)', () => {
  it('honours headingBaseLevel: 1 by rendering NO route title heading', () => {
    // The shipped binding never passed `headingBaseLevel` at all, so the
    // baseline was always 2 and §3.4.1 obligation 3 was unreachable. A host
    // that owns the page `h1` must not get a second one from the shell.
    const container = view('a', {}, 1);
    expect(container.querySelector('.fs-surface-route__title')).toBeNull();
    const article = container.querySelector('[data-route="a"]');
    expect(article?.getAttribute('aria-label')).toBe('Apply for help');
    expect(article?.getAttribute('aria-labelledby')).toBeNull();
  });

  it('offsets authored ranks from the host’s baseline', () => {
    const container = view('a', {}, 1);
    expect(container.querySelector('[data-slot="lead"] .fs-surface-static-heading')?.tagName).toBe(
      'H1',
    );
  });

  it('moves the route title with the baseline rather than hard-coding h1', () => {
    const container = view('a', {}, 3);
    expect(container.querySelector('.fs-surface-route__title')?.tagName).toBe('H2');
  });

  it('renders a slot title at the plan’s level, not a hardcoded one', () => {
    const container = view('a', {}, 3);
    expect(container.querySelector('[data-slot="note"] .fs-surface-slot__title')?.tagName).toBe(
      'H3',
    );
  });
});

describe('embedded slots follow the SAME title rule as top-level ones (D14a, D14b)', () => {
  it('keeps an authored title on a non-heading static slot inside an embed', () => {
    // The embed path suppressed the title for ALL static-content kinds,
    // reintroducing one nesting level down the exact bug the top-level path was
    // fixed to remove.
    const container = view('host');
    expect(textOf(container.querySelector('[data-slot="inner-text"] .fs-surface-slot__title'))).toBe(
      'Inner title',
    );
  });

  it('renders that title at the CHILD’s level, not the host slot’s', () => {
    // The embed path rendered titles at `plan.headingBaseLevel` — the host
    // slot's — so an embedded title sat at the same rank as its host while its
    // content sat one deeper.
    const container = view('host');
    const title = container.querySelector('[data-slot="inner-text"] .fs-surface-slot__title');
    expect(title?.tagName).toBe('H3');
  });

  it('still suppresses the title on an embedded heading slot', () => {
    const container = view('host');
    expect(
      container.querySelectorAll('[data-slot="inner-heading"] .fs-surface-slot__title'),
    ).toHaveLength(0);
  });

  it('steps embedded content down a level and never above its host', () => {
    const container = view('host');
    const heading = container.querySelector('[data-slot="inner-heading"] .fs-surface-static-heading');
    expect(heading?.tagName).toBe('H3');
  });
});

describe('slot dispatch in the DOM', () => {
  it('renders each closed slot type as its own element', () => {
    const container = view('a');
    expect(container.querySelector('[data-slot-type="static-content"] .fs-surface-static-text')).not.toBeNull();
    expect(container.querySelector('[data-slot="rule"] hr')).not.toBeNull();
    expect(container.querySelector('[data-widget="intake-banner"]')).not.toBeNull();
    expect(container.querySelector('.fs-surface-unit')).not.toBeNull();
  });

  it('passes binding.config to the widget', () => {
    const container = view('a');
    expect(textOf(container.querySelector('.fs-surface-banner__headline'))).toBe('Ten minutes');
  });

  it('withholds Experience needs from a respondent surface by default', () => {
    const container = view('a');
    expect(container.querySelector('[data-probe="experience-needs"]')).toBeNull();
  });

  it('shows Experience needs when a host asks for them', () => {
    const container = view('a', { showExperienceNeeds: true });
    expect(textOf(container.querySelector('[data-probe="experience-needs"]'))).toBe('Internal note.');
  });

  it('says so when a bound widget does not exist', () => {
    const container = view('ghost');
    expect(textOf(container.querySelector('[data-probe="slot-unavailable"]'))).toContain('nope');
  });

  it('takes its unavailable wording from the host’s string table when one is supplied', () => {
    // D17. The set is enumerable and overridable; the language is not the
    // shell's to fix.
    const container = view('ghost', {
      strings: resolveSurfaceStrings({
        slotUnavailableWidgetUndeclared: 'Bileşen “{widgetName}” tanımlı değil.',
      }),
    });
    expect(textOf(container.querySelector('[data-probe="slot-unavailable"]'))).toBe(
      'Bileşen “nope” tanımlı değil.',
    );
  });
});

describe('theme boundary, as rendered', () => {
  it('emits the tenant value on an admitting route’s own element', () => {
    const container = view('a');
    const route = container.querySelector('[data-route="a"]') as HTMLElement;
    expect(route.getAttribute('data-tenant-theme')).toBe('admitted');
    expect(route.style.getPropertyValue('--formspec-color-primary')).toBe(TENANT);
  });

  it('emits ZERO tenant values on a refusing route’s element', () => {
    const container = view('p');
    const route = container.querySelector('[data-route="p"]') as HTMLElement;
    expect(route.getAttribute('data-tenant-theme')).toBe('refused');
    expect(route.getAttribute('data-tenant-token-count')).toBe('0');
    const emitted = Array.from({ length: route.style.length }, (_, index) =>
      route.style.getPropertyValue(route.style[index] ?? ''),
    );
    expect(emitted).not.toContain(TENANT);
    // And the brand property is present with the PLATFORM value, not absent —
    // a refusing route still renders, it just renders unbranded.
    expect(route.style.getPropertyValue('--formspec-color-primary')).not.toBe('');
  });

  it('applies the HOST route’s grant to an embedded route’s subtree', () => {
    // `host` is `operation` (refuses) and embeds `inner`, which is `intake`
    // (admits). §4.4: an embedded route's own class is a floor on its
    // protection, never a ceiling on its host's.
    const container = view('host');
    const route = container.querySelector('[data-route="host"]') as HTMLElement;
    expect(route.getAttribute('data-tenant-theme')).toBe('refused');
    const emitted = Array.from({ length: route.style.length }, (_, index) =>
      route.style.getPropertyValue(route.style[index] ?? ''),
    );
    expect(emitted).not.toContain(TENANT);
  });

  it('never writes to the document root, on any route', () => {
    // The shell emits tokens on its OWN element. `FormspecProvider` used to
    // write to `<html>` with no cleanup and a host could only scrub after it;
    // it now emits onto a scope element it owns. A shell that scrubbed anyway
    // would be manufacturing the property it claims to hold.
    view('a');
    view('p');
    expect(document.documentElement.style.length).toBe(0);
  });

  it('leaves a value some other component put on the document root alone', () => {
    document.documentElement.style.setProperty('--formspec-color-primary', TENANT);
    view('p');
    expect(document.documentElement.style.getPropertyValue('--formspec-color-primary')).toBe(TENANT);
  });

  it('does NOT show the theme posture to the person by default (D15)', () => {
    // §4.3.1: on an admitting route it carries no information; on any route it
    // is chrome the bundle did not author, above content that was signed.
    expect(view('p').querySelector('[data-probe="theme-note"]')).toBeNull();
    expect(view('a').querySelector('[data-probe="theme-note"]')).toBeNull();
  });

  it('shows it when a host opts in', () => {
    const container = view('p', { showThemeNotice: true });
    expect(textOf(container.querySelector('[data-probe="theme-note"]'))).toContain('receipt');
  });

  it('reports an unclassified route as its own posture rather than as operation', () => {
    const container = view('ghost');
    const route = container.querySelector('[data-route="ghost"]') as HTMLElement;
    expect(route.getAttribute('data-route-class')).toBe('unclassified');
    expect(route.getAttribute('data-tenant-theme')).toBe('refused');
  });
});
