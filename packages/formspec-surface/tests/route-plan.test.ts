/**
 * @filedesc The composite route plan — the structural fix for divergence D4.
 *
 * `surface-shell-spec.md` §7.1: "Every diagnostic the shell produces MUST reach
 * the host's diagnostic channel, whatever stage produced it… Per-route stages
 * produce most of the codes in §7.2, so a shell that delivers only its
 * app-construction diagnostics delivers the minority of them."
 *
 * These tests hold the union at the core boundary. `route-view.test.tsx` in the
 * React binding holds the other half: that the union actually reaches a host
 * callback.
 */
import { describe, expect, it } from 'vitest';
import type { FormDefinition } from '@formspec-org/types';
import { composeSurfaceApp } from '../src/composition.js';
import { createWidgetRegistry } from '../src/registry.js';
import { planMatchedRoute } from '../src/route-plan.js';
import { createThemeAuthority } from '../src/theme-authority.js';
import { route, slot, surface, tenantTheme } from './fixtures.js';

const DEF = 'https://example.test/def';
const definition = { $formspec: '1.0', url: DEF, items: [] } as unknown as FormDefinition;

/**
 * One unclassified route carrying, in order: an image slot (no alt channel), a
 * form pointing at a Definition the release does not contain, a widget nothing
 * declares, an embed naming a route that is not there, and a transition nothing
 * can fire. Every one of these is a per-route stage.
 */
const noisy = surface('s', 'r', [
  route({
    id: 'r',
    path: '/r',
    title: 'Noisy',
    slots: [
      slot({ id: 'seal', slotType: 'static-content', binding: { kind: 'image', content: 'a.png' } }),
      slot({ id: 'form', slotType: 'definition-form', binding: { definitionRef: 'urn:absent' } }),
      slot({ id: 'w', slotType: 'module-widget', binding: { moduleId: 'm', widgetName: 'w' } }),
      slot({ id: 'e', slotType: 'embed-route', binding: { routeRef: 'nowhere' } }),
      slot({ id: 'u', slotType: 'experience-unit', binding: { unitRef: 'ghost' } }),
    ] as never,
    transitions: [{ trigger: 'submit', to: 'r' }],
  }),
]);

function planFor(surfaceDocument = noisy, routeId = 'r', overrides: Record<string, unknown> = {}) {
  const app = composeSurfaceApp([surfaceDocument]);
  const handle = app.routes.find((candidate) => candidate.routeId === routeId)!;
  return planMatchedRoute<unknown>({
    handle,
    app,
    experiences: [],
    definitions: new Map([[DEF, definition]]),
    registryEntries: [],
    widgets: createWidgetRegistry<unknown>({}),
    themeAuthority: createThemeAuthority({ tenantTheme }),
    ...overrides,
  });
}

describe('planMatchedRoute — one plan, one diagnostic list', () => {
  const plan = planFor();
  const codes = plan.diagnostics.map((d) => d.code);

  it('carries every per-route slot diagnostic', () => {
    expect(codes).toContain('STATIC-IMAGE-NO-ALT');
    expect(codes).toContain('BUNDLE-DOCUMENT-MISSING');
    expect(codes).toContain('WIDGET-UNDECLARED');
    expect(codes).toContain('EMBED-ROUTE-UNRESOLVED');
    expect(codes).toContain('EXPERIENCE-UNIT-UNRESOLVED');
  });

  it('carries the theme-grant diagnostic', () => {
    expect(codes).toContain('THEME-UNCLASSIFIED-REFUSED');
  });

  it('carries the transition diagnostic', () => {
    expect(codes).toContain('TRANSITION-UNFIREABLE');
  });

  it('gives every one of them a severity', () => {
    for (const diagnostic of plan.diagnostics) {
      expect(diagnostic.severity).toMatch(/^(error|warning|info)$/);
    }
  });

  it('resolves the grant once, at the route boundary', () => {
    expect(plan.grant.posture).toBe('unclassified');
    expect(plan.grant.admitsTenantTheme).toBe(false);
  });

  it('plans the transitions rather than firing them', () => {
    expect(plan.transitions).toHaveLength(1);
    expect(plan.transitions[0]?.status).not.toBe('fireable');
  });
});

describe('headingBaseLevel is host-overridable end to end (D14c)', () => {
  const withHeading = surface('s', 'r', [
    route({
      id: 'r',
      path: '/r',
      title: 'Route',
      slots: [
        slot({
          id: 'h',
          slotType: 'static-content',
          binding: { kind: 'heading', content: 'Rank one', level: 1 },
        }),
      ] as never,
    }),
  ]);

  it('defaults to 2 — the route title is the page’s single h1', () => {
    const plan = planFor(withHeading);
    expect(plan.headingBaseLevel).toBe(2);
    const heading = plan.slots[0];
    expect(heading?.slotType === 'static-content' && heading.content?.kind === 'heading' && heading.content.level).toBe(2);
  });

  it('offsets from a baseline a host that owns the page heading supplies', () => {
    const plan = planFor(withHeading, 'r', { headingBaseLevel: 1 });
    expect(plan.headingBaseLevel).toBe(1);
    const heading = plan.slots[0];
    expect(heading?.slotType === 'static-content' && heading.content?.kind === 'heading' && heading.content.level).toBe(1);
  });

  it('carries the baseline down to every slot plan', () => {
    const plan = planFor(withHeading, 'r', { headingBaseLevel: 3 });
    expect(plan.slots[0]?.headingBaseLevel).toBe(3);
  });
});
