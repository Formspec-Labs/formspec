/**
 * @filedesc Cross-surface composition, matching, collision refusal, and link
 * building — `surface-shell-spec.md` §2.
 */
import { describe, expect, it } from 'vitest';
import { composeSurfaceApp, matchRoute, routeHref, routeInSurface } from '../src/composition.js';
import { respondentSurface, route, staffSurface, surface } from './fixtures.js';

describe('composeSurfaceApp', () => {
  const app = composeSurfaceApp([respondentSurface, staffSurface]);

  it('puts every route from every Surface in one table, in manifest order', () => {
    expect(app.routes.map((handle) => `${handle.surfaceId}/${handle.routeId}`)).toEqual([
      'respondent/apply',
      'respondent/receipt',
      'staff/queue',
    ]);
  });

  it('groups by Surface for navigation', () => {
    expect(app.groups.map((group) => group.surfaceId)).toEqual(['respondent', 'staff']);
    expect(app.groups[0]?.routes).toHaveLength(2);
  });

  it('opens on the first Surface’s entry route', () => {
    expect(app.entry?.routeId).toBe('apply');
  });

  it('labels a group with the Surface id when the document carries no title', () => {
    // NOT invented copy. `SurfaceDocument.title` is optional; when it is absent
    // the id is what the bundle actually says.
    expect(app.groups[0]?.label).toBe('respondent');
  });

  it('prefers the Surface title when there is one', () => {
    const titled = surface('respondent', 'apply', respondentSurface.routes, {
      title: 'For the person applying',
    });
    expect(composeSurfaceApp([titled]).groups[0]?.label).toBe('For the person applying');
  });

  it('lets a host supply labels without the shell inventing them', () => {
    const labelled = composeSurfaceApp([respondentSurface], {
      surfaceLabel: (document) => (document.id === 'respondent' ? 'Applicants' : undefined),
    });
    expect(labelled.groups[0]?.label).toBe('Applicants');
  });

  it('carries the route-path grammar diagnostic up from the routes', () => {
    expect(app.diagnostics.map((d) => d.code)).toContain('ROUTE-PARAM-GRAMMAR');
  });
});

describe('entry route (§2.5)', () => {
  it('reports an entry naming no route it declares', () => {
    const broken = surface('s', 'ghost', [route({ id: 'r', path: '/r', slots: [] as never })]);
    expect(composeSurfaceApp([broken]).diagnostics.map((d) => d.code)).toContain(
      'SURFACE-ENTRY-UNRESOLVED',
    );
  });

  it('yields NO app entry when the first Surface’s entry is dangling', () => {
    // D10. `routes.find(isSurfaceEntry) ?? routes[0]` fell through to a LATER
    // Surface's entry, which lands a respondent on a caseworker screen because
    // someone mistyped a route id — and the app appears to work.
    const brokenRespondent = surface('respondent', 'typo', respondentSurface.routes);
    const app = composeSurfaceApp([brokenRespondent, staffSurface]);
    expect(app.entry).toBeUndefined();
  });

  it('never substitutes the Surface’s own first route for a dangling entry', () => {
    const broken = surface('only', 'typo', [
      route({ id: 'first', path: '/first', slots: [] as never }),
    ]);
    expect(composeSurfaceApp([broken]).entry).toBeUndefined();
  });

  it('keeps a later Surface’s own entry intact — composition does not demote it', () => {
    const app = composeSurfaceApp([respondentSurface, staffSurface]);
    const queue = app.routes.find((handle) => handle.routeId === 'queue');
    expect(queue?.isSurfaceEntry).toBe(true);
  });
});

describe('path collisions (§2.4)', () => {
  const clashing = surface('other', 'apply', [
    route({ id: 'apply', path: '/apply', slots: respondentSurface.routes[0]!.slots }),
  ]);
  const collided = composeSurfaceApp([respondentSurface, clashing]);

  it('reports the collision naming every member of the group', () => {
    const collision = collided.diagnostics.find((d) => d.code === 'ROUTE-PATH-COLLISION');
    expect(collision).toBeDefined();
    expect(collision?.details?.routes).toEqual(['respondent/apply', 'other/apply']);
  });

  it('keeps both handles in the table — they stay reachable by handle', () => {
    expect(collided.routes).toHaveLength(3);
    expect(collided.routes.filter((handle) => handle.path === '/apply')).toHaveLength(2);
  });

  it('resolves the colliding ADDRESS to no route at all', () => {
    // D2. Answering with the first in manifest order makes one signed,
    // authored, validated route silently unreachable with nothing on screen
    // saying so.
    const resolution = matchRoute(collided, '/apply');
    expect(resolution.match).toBeUndefined();
    expect(resolution.refusal).toBe('collision');
  });

  it('does not re-report ROUTE-UNMATCHED for a collision — one defect, one code', () => {
    expect(matchRoute(collided, '/apply').diagnostics).toEqual([]);
  });

  it('compares PATTERNS, not authored strings: `{id}` and `:id` do not collide', () => {
    // D2's second half. `:id` is literal, so the two are different addresses —
    // and the colon route is unreachable for a different, already-reported
    // reason (`ROUTE-PARAM-GRAMMAR`).
    const app = composeSurfaceApp([
      surface('a', 'x', [route({ id: 'x', path: '/m/{id}', slots: [] as never })]),
      surface('b', 'y', [route({ id: 'y', path: '/m/:id', slots: [] as never })]),
    ]);
    expect(app.diagnostics.map((d) => d.code)).not.toContain('ROUTE-PATH-COLLISION');
    expect(matchRoute(app, '/m/7').match?.surfaceId ?? matchRoute(app, '/m/7').match?.handle.surfaceId).toBe('a');
  });

  it('collides two paths that differ only in parameter NAME', () => {
    const app = composeSurfaceApp([
      surface('a', 'x', [route({ id: 'x', path: '/m/{a}', slots: [] as never })]),
      surface('b', 'y', [route({ id: 'y', path: '/m/{b}', slots: [] as never })]),
    ]);
    expect(app.diagnostics.map((d) => d.code)).toContain('ROUTE-PATH-COLLISION');
    expect(matchRoute(app, '/m/7').match).toBeUndefined();
  });

  it('collides two paths that differ only in a trailing slash', () => {
    const app = composeSurfaceApp([
      surface('a', 'x', [route({ id: 'x', path: '/queue', slots: [] as never })]),
      surface('b', 'y', [route({ id: 'y', path: '/queue/', slots: [] as never })]),
    ]);
    expect(app.diagnostics.map((d) => d.code)).toContain('ROUTE-PATH-COLLISION');
  });
});

describe('matchRoute', () => {
  const app = composeSurfaceApp([respondentSurface, staffSurface]);

  it('matches across Surfaces', () => {
    expect(matchRoute(app, '/queue').match?.handle.surfaceId).toBe('staff');
  });

  it('reports ROUTE-UNMATCHED for an address the app does not carry', () => {
    // D5. A state with no code is a state a host cannot act on — a broken deep
    // link becomes invisible to operations.
    const resolution = matchRoute(app, '/nope');
    expect(resolution.match).toBeUndefined();
    expect(resolution.refusal).toBe('unmatched');
    expect(resolution.diagnostics.map((d) => d.code)).toEqual(['ROUTE-UNMATCHED']);
    expect(resolution.diagnostics[0]?.severity).toBe('warning');
    expect(resolution.diagnostics[0]?.details?.path).toBe('/nope');
  });

  it('never redirects an unmatched path to the entry route', () => {
    expect(matchRoute(app, '/nope').match).toBeUndefined();
  });

  it('does not deep-link the colon path, and says nothing matched', () => {
    // The `receipt` route authors `/receipt/:caseRef`. §9.1: a conforming shell
    // treats `:caseRef` as literal, so `/receipt/RA-2026-0412` does not match.
    expect(matchRoute(app, '/receipt/RA-2026-0412').diagnostics.map((d) => d.code)).toEqual([
      'ROUTE-UNMATCHED',
    ]);
    expect(matchRoute(app, '/receipt/:caseRef').match?.handle.routeId).toBe('receipt');
  });

  it('lets a literal beat a parameter rather than taking the first in table order', () => {
    const app = composeSurfaceApp([
      surface('a', 'p', [
        route({ id: 'p', path: '/receipt/{ref}', slots: [] as never }),
        route({ id: 'l', path: '/receipt/new', slots: [] as never }),
      ]),
    ]);
    expect(matchRoute(app, '/receipt/new').match?.handle.routeId).toBe('l');
    expect(matchRoute(app, '/receipt/RA-1').match?.handle.routeId).toBe('p');
  });
});

describe('routeHref', () => {
  const app = composeSurfaceApp([respondentSurface]);
  const receipt = app.routes.find((handle) => handle.routeId === 'receipt');

  it('leaves a colon path alone and reports no unsupplied parameter — it has none', () => {
    const { href, diagnostics } = routeHref(receipt!, { caseRef: 'R-1' });
    expect(href).toBe('/receipt/:caseRef');
    expect(diagnostics).toEqual([]);
  });

  it('fills a pinned parameter the host supplied', () => {
    const app = composeSurfaceApp([
      surface('a', 'r', [route({ id: 'r', path: '/receipt/{caseRef}', slots: [] as never })]),
    ]);
    const { href, diagnostics } = routeHref(app.routes[0]!, { caseRef: 'R-1' });
    expect(href).toBe('/receipt/R-1');
    expect(diagnostics).toEqual([]);
  });

  it('reports an unsupplied parameter rather than linking nowhere quietly', () => {
    const app = composeSurfaceApp([
      surface('a', 'r', [route({ id: 'r', path: '/receipt/{caseRef}', slots: [] as never })]),
    ]);
    const { href, diagnostics } = routeHref(app.routes[0]!, {});
    expect(href).toBe('/receipt/{caseRef}');
    expect(diagnostics.map((d) => d.code)).toEqual(['ROUTE-PARAM-UNSUPPLIED']);
  });
});

describe('routeInSurface', () => {
  const app = composeSurfaceApp([respondentSurface, staffSurface]);

  it('resolves a transition target within its own Surface', () => {
    expect(routeInSurface(app, 'respondent', 'receipt')?.path).toBe('/receipt/:caseRef');
  });

  it('does not reach across Surfaces', () => {
    expect(routeInSurface(app, 'respondent', 'queue')).toBeUndefined();
  });
});
