/**
 * @filedesc The theme boundary — asserted structurally, not cosmetically.
 *
 * The bar these tests hold is the one bar R3 was written for: a refusing route
 * does not merely *look* unbranded, it receives **nothing** tenant-supplied.
 * Cosmetic absence is a styling choice one careless prop restores; structural
 * absence means no value from the tenant Theme appears in the object that
 * crosses the route boundary, by key or by value.
 */
import { describe, expect, it } from 'vitest';
import { ROUTE_CLASS_THEME_AUTHORITY } from '@formspec-org/app-graph';
import {
  ROUTE_CLASS_THEME_REASON,
  UNCLASSIFIED_THEME_REASON,
  createThemeAuthority,
  type RouteClass,
} from '../src/theme-authority.js';
import { TENANT_SENTINEL_VALUE, route, tenantTheme } from './fixtures.js';

const ALL_CLASSES = Object.keys(ROUTE_CLASS_THEME_AUTHORITY) as RouteClass[];

function grantFor(routeClass: RouteClass | undefined) {
  const authority = createThemeAuthority({ tenantTheme });
  const target = routeClass
    ? route({ id: 'r', path: '/r', routeClass, slots: [] as never })
    : route({ id: 'r', path: '/r', slots: [] as never });
  return authority.grantFor(target);
}

function tokensOf(grant: { themeDocument: unknown }): Record<string, string | number> {
  return ((grant.themeDocument as { tokens?: Record<string, string | number> }).tokens ?? {});
}

describe('theme authority — structural refusal', () => {
  it('gives a proof route ZERO tenant tokens, by key and by value', () => {
    const grant = grantFor('proof');
    const tokens = tokensOf(grant);

    expect(grant.admitsTenantTheme).toBe(false);
    expect(grant.tenantTokenKeys).toEqual([]);
    // By key: nothing the tenant authored is present under its own name.
    expect(Object.keys(tokens)).not.toContain('color.accent');
    // By value: and no platform token was overwritten with the tenant's value,
    // which is the leak a key-only assertion would miss.
    expect(Object.values(tokens).map(String)).not.toContain(TENANT_SENTINEL_VALUE);
  });

  it('refuses on every class the shipped map refuses, with no list of its own', () => {
    for (const routeClass of ALL_CLASSES) {
      const expected = ROUTE_CLASS_THEME_AUTHORITY[routeClass] === 'admits';
      const grant = grantFor(routeClass);
      expect(grant.admitsTenantTheme, routeClass).toBe(expected);
      if (!expected) {
        expect(Object.values(tokensOf(grant)).map(String), routeClass).not.toContain(
          TENANT_SENTINEL_VALUE,
        );
      }
    }
  });

  it('admits on intake, and the tenant value actually arrives', () => {
    const grant = grantFor('intake');
    expect(grant.admitsTenantTheme).toBe(true);
    expect(grant.posture).toBe('admits');
    expect(Object.values(tokensOf(grant)).map(String)).toContain(TENANT_SENTINEL_VALUE);
    expect(grant.tenantTokenKeys).toContain('color.accent');
  });

  it('layers the platform theme UNDER the tenant on an admitting route', () => {
    const grant = grantFor('intake');
    const tokens = tokensOf(grant);
    // A one-token tenant theme must not blank the platform's spacing/radii.
    expect(Object.keys(tokens).length).toBeGreaterThan(2);
    expect(tokens['spacing.md']).toBeDefined();
  });

  it('treats an absent routeClass as its own posture, and refuses', () => {
    const grant = grantFor(undefined);
    expect(grant.posture).toBe('unclassified');
    expect(grant.routeClass).toBeUndefined();
    expect(grant.admitsTenantTheme).toBe(false);
    expect(grant.reason).toBe(UNCLASSIFIED_THEME_REASON);
    expect(Object.values(tokensOf(grant)).map(String)).not.toContain(TENANT_SENTINEL_VALUE);
  });

  it('gives every route the same grant shape, so there is no null arm to fill in later', () => {
    for (const routeClass of [...ALL_CLASSES, undefined]) {
      const grant = grantFor(routeClass);
      expect(typeof grant.reason).toBe('string');
      expect(grant.reason.length).toBeGreaterThan(0);
      expect(grant.themeDocument).toBeTypeOf('object');
    }
  });

  it('carries a reason for every class in the vocabulary', () => {
    expect(Object.keys(ROUTE_CLASS_THEME_REASON).sort()).toEqual(ALL_CLASSES.sort());
  });

  it('hands out a fresh token object per grant, so a caller cannot mutate the next route', () => {
    const authority = createThemeAuthority({ tenantTheme });
    const first = authority.grantFor(route({ id: 'a', path: '/a', routeClass: 'proof', slots: [] as never }));
    (first.themeDocument as { tokens: Record<string, string> }).tokens['color.primary'] =
      TENANT_SENTINEL_VALUE;
    const second = authority.grantFor(route({ id: 'b', path: '/b', routeClass: 'proof', slots: [] as never }));
    expect(Object.values(tokensOf(second)).map(String)).not.toContain(TENANT_SENTINEL_VALUE);
  });
});

describe('theme authority — token vocabulary', () => {
  it('reports a tenant token the platform vocabulary does not carry', () => {
    const authority = createThemeAuthority({ tenantTheme });
    const unknown = authority.diagnostics.filter((d) => d.code === 'THEME-TOKEN-UNKNOWN');
    expect(unknown.map((d) => d.details?.token)).toContain('color.accent');
  });

  it('says nothing about a registered token', () => {
    const authority = createThemeAuthority({ tenantTheme });
    expect(authority.diagnostics.map((d) => d.details?.token)).not.toContain('color.primary');
  });

  it('accepts a host alias and stops reporting the aliased token', () => {
    const authority = createThemeAuthority({
      tenantTheme,
      tokenAliases: { 'color.accent': ['color.primary'] },
    });
    expect(authority.diagnostics.filter((d) => d.code === 'THEME-TOKEN-UNKNOWN')).toEqual([]);
    const grant = authority.grantFor(route({ id: 'r', path: '/r', routeClass: 'intake', slots: [] as never }));
    expect(tokensOf(grant)['color.primary']).toBe(TENANT_SENTINEL_VALUE);
  });

  it('does not carry an alias table of its own', () => {
    const authority = createThemeAuthority({
      tenantTheme: { $formspecTheme: '1.0', tokens: { 'color.accent': '#fff' } } as never,
    });
    const grant = authority.grantFor(route({ id: 'r', path: '/r', routeClass: 'intake', slots: [] as never }));
    // No alias supplied ⇒ nothing bridged. The vocabulary decision stays with
    // the token registry, not with the renderer.
    expect(tokensOf(grant)['color.primary']).not.toBe('#fff');
  });

  it('has no tenant tokens at all when the bundle carries no Theme', () => {
    const authority = createThemeAuthority({});
    expect(authority.tenantTokenKeys).toEqual([]);
    const grant = authority.grantFor(route({ id: 'r', path: '/r', routeClass: 'intake', slots: [] as never }));
    expect(grant.admitsTenantTheme).toBe(true);
    expect(grant.tenantTokenKeys).toEqual([]);
  });
});

describe('an absent routeClass refuses AND reports (§4.3, D6)', () => {
  const unclassified = route({ id: 'ghost', path: '/ghost', slots: [] as never });

  it('withholds the tenant theme', () => {
    const grant = createThemeAuthority({ tenantTheme }).grantFor(unclassified);
    expect(grant.posture).toBe('unclassified');
    expect(grant.admitsTenantTheme).toBe(false);
    expect(grant.tenantTokenKeys).toEqual([]);
  });

  it('reports THEME-UNCLASSIFIED-REFUSED on the grant, not only on screen', () => {
    // D6. The refusal was structural and correct and said nothing in the
    // diagnostic channel, so it could not be logged, alarmed on, or counted.
    const grant = createThemeAuthority({ tenantTheme }).grantFor(unclassified, {
      surfaceId: 's',
      routeId: 'ghost',
    });
    expect(grant.diagnostics.map((d) => d.code)).toEqual(['THEME-UNCLASSIFIED-REFUSED']);
    expect(grant.diagnostics[0]?.severity).toBe('info');
    expect(grant.diagnostics[0]?.site).toEqual({ surfaceId: 's', routeId: 'ghost' });
  });

  it('says nothing when no tenant Theme is present — nothing was withheld', () => {
    // §7.3 does-not-fire.
    expect(createThemeAuthority({}).grantFor(unclassified).diagnostics).toEqual([]);
  });

  it('says nothing for a route that declares ANY class, including operation', () => {
    const authority = createThemeAuthority({ tenantTheme });
    for (const routeClass of ['operation', 'proof', 'intake'] as const) {
      const grant = authority.grantFor(
        route({ id: 'r', path: '/r', routeClass, slots: [] as never }),
      );
      expect(grant.diagnostics).toEqual([]);
    }
  });

  it('never reports absence as `operation`', () => {
    const grant = createThemeAuthority({ tenantTheme }).grantFor(unclassified);
    expect(grant.routeClass).toBeUndefined();
    expect(grant.posture).not.toBe('refuses');
  });
});
