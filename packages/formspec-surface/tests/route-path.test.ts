/**
 * @filedesc Route matching — the ONE pinned grammar, and everything that is
 * therefore literal text.
 *
 * `surface-shell-spec.md` §2.3 pins `{name}` as the only parameter grammar and
 * makes `:name`, `*`, a regex capture, a matrix or query parameter, and any
 * URI-Template operator **literal segments plus a `ROUTE-PARAM-GRAMMAR`
 * report**. Every "does the shell read the other grammar too" case below is a
 * regression guard: reading both is the silent-alias shape
 * `token-registry-spec.md` §2.4 forbids, and it means two conforming renderers
 * disagree about what a signed URL means.
 */
import { describe, expect, it } from 'vitest';
import {
  compareRouteSpecificity,
  fillRoutePath,
  inspectRouteParams,
  matchRoutePath,
  parseRoutePath,
  routeParamMarkers,
  routePathPatternKey,
} from '../src/route-path.js';
import { route } from './fixtures.js';

describe('routeParamMarkers', () => {
  it('reads the URI-Template grammar the Surface spec pins', () => {
    expect(routeParamMarkers('/matter/{matterId}')).toEqual([{ name: 'matterId' }]);
  });

  it('does NOT read the colon grammar as a parameter', () => {
    // D1. The shipped bundle authors `/receipt/:caseRef`; the spec says that is
    // literal text. Reading it would deep-link a URL a second conforming
    // renderer 404s.
    expect(routeParamMarkers('/receipt/:caseRef')).toEqual([]);
  });

  it('reads only the pinned markers out of a path that mixes grammars', () => {
    expect(routeParamMarkers('/a/{one}/b/:two/c/{three}').map((m) => m.name)).toEqual([
      'one',
      'three',
    ]);
  });

  it('finds nothing in an opaque path', () => {
    expect(routeParamMarkers('/apply')).toEqual([]);
  });

  it('treats a segment that merely CONTAINS a marker as literal', () => {
    // A parameter segment is one that is EXACTLY `{name}` (§2.3).
    expect(routeParamMarkers('/x{id}y')).toEqual([]);
  });
});

describe('parseRoutePath — which grammars report', () => {
  const grammarsIn = (path: string) => parseRoutePath(path).unpinned.map((entry) => entry.grammar);

  it('classifies every unpinned grammar the spec names', () => {
    expect(grammarsIn('/receipt/:caseRef')).toEqual(['colon']);
    expect(grammarsIn('/files/*')).toEqual(['wildcard']);
    expect(grammarsIn('/m/(\\d+)')).toEqual(['regex']);
    expect(grammarsIn('/m/a;v=1')).toEqual(['matrix']);
    expect(grammarsIn('/m?q=1')).toEqual(['query']);
    expect(grammarsIn('/m/{+id}')).toEqual(['uri-template-operator']);
    expect(grammarsIn('/m/{id*}')).toEqual(['uri-template-operator']);
  });

  it('reports a brace expression that is not a valid marker rather than silently compiling it', () => {
    // D11. The previous pattern builder escaped every metacharacter EXCEPT the
    // brace pair, so `/a{2}` compiled to `^/a{2}/?$` — a quantifier — and
    // matched `/aa`.
    expect(grammarsIn('/a{2}')).toEqual(['malformed-marker']);
  });

  it('says nothing about a colon that is not in leading position', () => {
    // §7.3 does-not-fire: "a literal segment merely contains a colon that is
    // not in leading position."
    expect(grammarsIn('/urn:x/a')).toEqual([]);
    expect(grammarsIn('/a/b:c')).toEqual([]);
  });

  it('says nothing about a path using only the pinned grammar', () => {
    expect(grammarsIn('/matter/{matterId}/note/{noteId}')).toEqual([]);
  });
});

describe('matchRoutePath', () => {
  it('matches a static path and returns no parameters', () => {
    expect(matchRoutePath('/apply', '/apply')).toEqual({});
  });

  it('distinguishes "no parameters" from "no match"', () => {
    expect(matchRoutePath('/apply', '/queue')).toBeUndefined();
  });

  it('captures a URI-Template parameter', () => {
    expect(matchRoutePath('/matter/{matterId}', '/matter/M-9')).toEqual({ matterId: 'M-9' });
  });

  it('does NOT deep-link a colon path — the segment is literal', () => {
    // D1. This is the visible cost the spec accepts, and accepts loudly: the
    // route stays reachable by handle, only its URL address degrades.
    expect(matchRoutePath('/receipt/:caseRef', '/receipt/RA-2026-0412')).toBeUndefined();
    expect(matchRoutePath('/receipt/:caseRef', '/receipt/:caseRef')).toEqual({});
  });

  it('does NOT let an unescaped brace become a quantifier', () => {
    // D11 at the matcher.
    expect(matchRoutePath('/a{2}', '/aa')).toBeUndefined();
    expect(matchRoutePath('/a{2}', '/a{2}')).toEqual({});
  });

  it('captures several pinned parameters in order', () => {
    expect(matchRoutePath('/{a}/x/{b}', '/one/x/two')).toEqual({ a: 'one', b: 'two' });
  });

  it('percent-decodes captured values', () => {
    expect(matchRoutePath('/receipt/{caseRef}', '/receipt/RA%2F2026')).toEqual({
      caseRef: 'RA/2026',
    });
  });

  it('survives a malformed percent-escape rather than throwing out of a render', () => {
    expect(matchRoutePath('/receipt/{caseRef}', '/receipt/%E0%A4%A')).toEqual({
      caseRef: '%E0%A4%A',
    });
  });

  it('does not let a parameter swallow a path separator', () => {
    expect(matchRoutePath('/receipt/{caseRef}', '/receipt/a/b')).toBeUndefined();
  });

  it('tolerates a trailing slash', () => {
    expect(matchRoutePath('/apply', '/apply/')).toEqual({});
  });

  it('requires a value for a parameter segment', () => {
    expect(matchRoutePath('/receipt/{caseRef}', '/receipt/')).toBeUndefined();
  });

  it('does not treat regex metacharacters in a path as a pattern', () => {
    expect(matchRoutePath('/a.b', '/aXb')).toBeUndefined();
    expect(matchRoutePath('/a.b', '/a.b')).toEqual({});
  });

  it('keeps a query string and a fragment out of the match', () => {
    expect(matchRoutePath('/apply', '/apply?ref=email')).toEqual({});
    expect(matchRoutePath('/apply', '/apply#top')).toEqual({});
  });
});

describe('fillRoutePath', () => {
  it('substitutes a pinned marker', () => {
    expect(fillRoutePath('/matter/{matterId}', { matterId: 'M-1' })).toBe('/matter/M-1');
  });

  it('leaves a colon segment alone — it is literal text, not a marker', () => {
    expect(fillRoutePath('/receipt/:caseRef', { caseRef: 'R-1' })).toBe('/receipt/:caseRef');
  });

  it('percent-encodes the value', () => {
    expect(fillRoutePath('/receipt/{caseRef}', { caseRef: 'RA/2026' })).toBe('/receipt/RA%2F2026');
  });

  it('leaves an unsupplied marker intact rather than producing a plausible broken link', () => {
    expect(fillRoutePath('/receipt/{caseRef}', {})).toBe('/receipt/{caseRef}');
  });
});

describe('routePathPatternKey — collision is about behaviour, not strings', () => {
  it('gives two differently-named parameters the same key', () => {
    expect(routePathPatternKey('/m/{a}')).toBe(routePathPatternKey('/m/{b}'));
  });

  it('gives `{id}` and `:id` DIFFERENT keys, because only one is a parameter', () => {
    // D2. A raw-string comparison never reports this pair, and the colon route
    // is the one that is genuinely unreachable.
    expect(routePathPatternKey('/m/{id}')).not.toBe(routePathPatternKey('/m/:id'));
  });

  it('treats a trailing slash as the same address', () => {
    expect(routePathPatternKey('/queue/')).toBe(routePathPatternKey('/queue'));
  });

  it('separates a literal from a parameter at the same index', () => {
    expect(routePathPatternKey('/receipt/new')).not.toBe(routePathPatternKey('/receipt/{ref}'));
  });
});

describe('compareRouteSpecificity', () => {
  const segments = (path: string) => parseRoutePath(path).segments;

  it('lets a literal beat a parameter at the leftmost differing index', () => {
    expect(compareRouteSpecificity(segments('/receipt/new'), segments('/receipt/{ref}'))).toBe(1);
    expect(compareRouteSpecificity(segments('/receipt/{ref}'), segments('/receipt/new'))).toBe(-1);
  });

  it('reports a tie when no index differs in kind — a collision, not a winner', () => {
    expect(compareRouteSpecificity(segments('/m/{a}'), segments('/m/{b}'))).toBe(0);
  });
});

describe('inspectRouteParams', () => {
  const site = { surfaceId: 's', routeId: 'r' };

  it('reports the colon grammar and yields no markers for it', () => {
    const { markers, diagnostics } = inspectRouteParams(
      route({ id: 'r', path: '/receipt/:caseRef', slots: [] as never }),
      site,
    );
    expect(markers).toHaveLength(0);
    expect(diagnostics.map((d) => d.code)).toEqual(['ROUTE-PARAM-GRAMMAR']);
  });

  it('carries a severity on every diagnostic it emits', () => {
    // D3. A closed list a host can enumerate but not rank is not actionable.
    const { diagnostics } = inspectRouteParams(
      route({ id: 'r', path: '/receipt/:caseRef', slots: [] as never }),
      site,
    );
    expect(diagnostics[0]?.severity).toBe('error');
  });

  it('reports a marker with no params[] entry EVEN WHEN params[] is empty', () => {
    // D12. Gating this on a non-empty `params[]` exempted the shape most likely
    // to occur — markers with no declaration at all.
    const { diagnostics } = inspectRouteParams(
      route({ id: 'r', path: '/matter/{matterId}', slots: [] as never }),
      site,
    );
    expect(diagnostics.map((d) => d.code)).toEqual(['ROUTE-PARAM-UNDECLARED']);
  });

  it('reports a marker missing from a populated params[]', () => {
    const { diagnostics } = inspectRouteParams(
      route({
        id: 'r',
        path: '/matter/{matterId}',
        params: [{ name: 'other', type: 'string' }],
        slots: [] as never,
      }),
      site,
    );
    expect(diagnostics.map((d) => d.code)).toContain('ROUTE-PARAM-UNDECLARED');
  });

  it('reports a params[] entry with no marker', () => {
    const { diagnostics } = inspectRouteParams(
      route({
        id: 'r',
        path: '/matter/{matterId}',
        params: [{ name: 'matterId', type: 'string' }, { name: 'ghost', type: 'string' }],
        slots: [] as never,
      }),
      site,
    );
    expect(diagnostics.map((d) => d.code)).toEqual(['ROUTE-PARAM-NO-MARKER']);
  });

  it('is quiet when markers and declarations agree', () => {
    const { diagnostics } = inspectRouteParams(
      route({
        id: 'r',
        path: '/matter/{matterId}',
        params: [{ name: 'matterId', type: 'string' }],
        slots: [] as never,
      }),
      site,
    );
    expect(diagnostics).toEqual([]);
  });

  it('is quiet about an opaque path with no markers and no params[]', () => {
    const { diagnostics } = inspectRouteParams(
      route({ id: 'r', path: '/apply', slots: [] as never }),
      site,
    );
    expect(diagnostics).toEqual([]);
  });
});
