/** @filedesc Tests for path-utils — parity with Rust `formspec_core::path_utils`. */
import { describe, it, expect } from 'vitest';
import { Path, PathSegment, PathSegmentKind } from '../src/path-utils.js';

function exact(key: string): PathSegment {
  return { kind: PathSegmentKind.Exact, key };
}
function indexed(index: number): PathSegment {
  return { kind: PathSegmentKind.Indexed, index };
}
function wildcard(): PathSegment {
  return { kind: PathSegmentKind.Wildcard };
}
function special(content: string): PathSegment {
  return { kind: PathSegmentKind.Special, content };
}

describe('Path.parse', () => {
  it('handles all four segment kinds in one path', () => {
    const p = Path.parse('a.b[0].c[*].d[@index]');
    expect(p.segments).toEqual([
      exact('a'),
      exact('b'),
      indexed(0),
      exact('c'),
      wildcard(),
      exact('d'),
      special('@index'),
    ]);
  });

  it('returns empty path for empty/nullish input', () => {
    expect(Path.parse('').segments).toEqual([]);
    expect(Path.parse(null).segments).toEqual([]);
    expect(Path.parse(undefined).segments).toEqual([]);
  });

  it('normalizes consecutive dots, leading dot, trailing dot', () => {
    expect(Path.parse('a..b').toString()).toBe('a.b');
    expect(Path.parse('.a').toString()).toBe('a');
    expect(Path.parse('a.').toString()).toBe('a');
  });

  it('parses leading-zero index as numeric (F-7)', () => {
    const p = Path.parse('a[01].b');
    expect(p.segments[1]).toEqual(indexed(1));
    expect(p.toString()).toBe('a[1].b');
  });

  // Cross-runtime parity: Rust uses `content.parse::<usize>()` which rejects
  // any non-pure-digit string. TS must match — lenient `parseInt` would
  // silently accept `0abc` as 0, `-5` as -5, `1e3` as 1, etc.
  it('rejects non-pure-digit bracket content as Special (parity with Rust)', () => {
    expect(Path.parse('a[0abc].b').segments[1]).toEqual(special('0abc'));
    expect(Path.parse('a[123x].b').segments[1]).toEqual(special('123x'));
    expect(Path.parse('a[-5].b').segments[1]).toEqual(special('-5'));
    expect(Path.parse('a[+1].b').segments[1]).toEqual(special('+1'));
    expect(Path.parse('a[1e5].b').segments[1]).toEqual(special('1e5'));
    expect(Path.parse('a[ 5 ].b').segments[1]).toEqual(special(' 5 '));
  });
});

describe('Path.toString', () => {
  it('round-trips well-formed paths', () => {
    expect(Path.parse('items[0].total').toString()).toBe('items[0].total');
    expect(Path.parse('a.b[*].c').toString()).toBe('a.b[*].c');
    expect(Path.parse('x[@index].y').toString()).toBe('x[@index].y');
  });
});

describe('Path.stripIndices', () => {
  it('drops indices, wildcards, specials', () => {
    expect(Path.parse('group[0].items[1].field').stripIndices()).toBe('group.items.field');
    expect(Path.parse('a[*].b[@index].c').stripIndices()).toBe('a.b.c');
    expect(Path.parse('simple').stripIndices()).toBe('simple');
    expect(Path.parse('').stripIndices()).toBe('');
  });
});

describe('Path.splitNormalized', () => {
  it('returns Exact-only segments', () => {
    expect(Path.parse('a.b.c').splitNormalized()).toEqual(['a', 'b', 'c']);
    expect(Path.parse('a[0].b').splitNormalized()).toEqual(['a', 'b']);
    expect(Path.parse('single').splitNormalized()).toEqual(['single']);
    expect(Path.parse('').splitNormalized()).toEqual([]);
  });
});

describe('Path.parentString', () => {
  it('drops the last segment', () => {
    expect(Path.parse('group.child.field').parentString()).toBe('group.child');
    expect(Path.parse('group.field').parentString()).toBe('group');
    expect(Path.parse('field').parentString()).toBe('');
  });

  it('returns empty for empty input', () => {
    expect(Path.parse('').parentString()).toBe('');
  });

  it('F-2: trailing dot normalizes (parses to one segment, parent is "")', () => {
    expect(Path.parse('field.').parentString()).toBe('');
  });

  it('F-2: leading dot normalizes', () => {
    expect(Path.parse('.field').parentString()).toBe('');
  });
});

describe('Path.leafKey', () => {
  it('returns the last segment key, bracketed for non-Exact', () => {
    expect(Path.parse('group.child.field').leafKey()).toBe('field');
    expect(Path.parse('field').leafKey()).toBe('field');
    expect(Path.parse('items[0]').leafKey()).toBe('[0]');
    expect(Path.parse('items[*]').leafKey()).toBe('[*]');
    expect(Path.parse('').leafKey()).toBe('');
  });
});

// ── Property-style equivalence with Rust previous-string oracle ────────────────

function previousNormalizeIndexedPath(path: string): string {
  return path
    .split('.')
    .map((seg) => {
      const idx = seg.indexOf('[');
      return idx >= 0 ? seg.slice(0, idx) : seg;
    })
    .filter(Boolean)
    .join('.');
}

describe('Path.stripIndices vs previous-string oracle (F-5)', () => {
  // Mirror the Rust prop test range — well-formed paths only.
  const cases = [
    'a',
    'a.b',
    'a.b.c',
    'a[0]',
    'a[0].b',
    'a[1].b[2].c',
    'group[0].items[1].field',
    'simple.path',
    'deep.nested.path',
    'items[0].children[1].key[2]',
  ];

  for (const path of cases) {
    it(`matches previous behavior for ${path}`, () => {
      expect(Path.parse(path).stripIndices()).toBe(previousNormalizeIndexedPath(path));
    });
  }
});

describe('parse-display round-trip stability', () => {
  const cases = [
    'a',
    'a.b.c',
    'items[0]',
    'items[*]',
    'items[@index]',
    'a[0].b[1].c',
    'deeply.nested.key[5]',
  ];

  for (const path of cases) {
    it(`stable on ${path}`, () => {
      const first = Path.parse(path);
      const second = Path.parse(first.toString());
      expect(second.segments).toEqual(first.segments);
    });
  }
});
