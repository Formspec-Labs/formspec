/**
 * @filedesc Static content — the closed kind vocabulary and the heading contract.
 *
 * Heading levels are the document outline and the outline is an accessibility
 * contract, so these assertions are about correctness, not formatting: exactly
 * one `h1` per page, no skipped levels, and nesting that never outranks its host.
 */
import { describe, expect, it } from 'vitest';
import {
  STATIC_CONTENT_KINDS,
  planStaticContent,
  resolveHeadingLevel,
  type SurfaceStaticAssetResolver,
} from '../src/static-content.js';

const site = { surfaceId: 's', routeId: 'r', slotId: 'slot' };
const admitAuthoredSource: SurfaceStaticAssetResolver = ({ source }) => ({
  status: 'admitted',
  source,
});

describe('resolveHeadingLevel', () => {
  it('treats an authored level as a rank within the route, not a document level', () => {
    // The route title is the page `h1`, so authored level 1 is the first
    // heading INSIDE it — h2, not a second h1.
    expect(resolveHeadingLevel(1, 2)).toBe(2);
    expect(resolveHeadingLevel(2, 2)).toBe(3);
    expect(resolveHeadingLevel(3, 2)).toBe(4);
  });

  it('gives an unauthored level the base', () => {
    expect(resolveHeadingLevel(undefined, 2)).toBe(2);
  });

  it('returns authored levels verbatim when the host renders no title of its own', () => {
    expect(resolveHeadingLevel(1, 1)).toBe(1);
    expect(resolveHeadingLevel(3, 1)).toBe(3);
  });

  it('never exceeds h6, however deep the nesting', () => {
    expect(resolveHeadingLevel(6, 6)).toBe(6);
    expect(resolveHeadingLevel(99, 5)).toBe(6);
  });

  it('never produces a level below h1', () => {
    expect(resolveHeadingLevel(0, 1)).toBe(1);
    expect(resolveHeadingLevel(-4, 1)).toBe(1);
  });

  it('ignores a non-numeric level rather than rendering a broken tag', () => {
    expect(resolveHeadingLevel('2' as unknown, 2)).toBe(2);
    expect(resolveHeadingLevel(null, 3)).toBe(3);
    expect(resolveHeadingLevel(Number.NaN, 2)).toBe(2);
  });
});

describe('planStaticContent', () => {
  it('covers the closed vocabulary and nothing else', () => {
    expect([...STATIC_CONTENT_KINDS]).toEqual(['heading', 'text', 'image', 'divider']);
  });

  it('plans a heading at the composed level', () => {
    const { plan } = planStaticContent({
      binding: { kind: 'heading', content: 'Your declaration', level: 1 },
      headingBaseLevel: 2,
      site,
    });
    expect(plan).toEqual({ kind: 'heading', content: 'Your declaration', level: 2 });
  });

  it('plans text', () => {
    const { plan } = planStaticContent({ binding: { kind: 'text', content: 'Hello' }, site });
    expect(plan).toEqual({ kind: 'text', content: 'Hello' });
  });

  it('plans a divider', () => {
    const { plan } = planStaticContent({ binding: { kind: 'divider', content: '' }, site });
    expect(plan).toEqual({ kind: 'divider' });
  });

  it('uses authored alternative text exactly and ignores the slot title as an alt source', () => {
    const { plan, diagnostics } = planStaticContent({
      binding: {
        kind: 'image',
        content: 'https://example.test/seal.png',
        alt: 'Department seal',
      },
      staticAssetResolver: admitAuthoredSource,
      site,
    });
    expect(plan).toEqual({
      kind: 'image',
      src: 'https://example.test/seal.png',
      alt: 'Department seal',
      decorative: false,
    });
    expect(diagnostics).toEqual([]);
  });

  it('requires an authored string alt for every image and no other kind', () => {
    const result = (binding: Record<string, unknown>) =>
      planStaticContent({
        binding,
        site,
        staticAssetResolver: admitAuthoredSource,
      });
    expect(result({ kind: 'image', content: 'a.png' })).toMatchObject({
      plan: undefined,
      diagnostics: [{ code: 'STATIC-IMAGE-NO-ALT' }],
    });
    expect(result({ kind: 'image', content: 'a.png', alt: 42 })).toMatchObject({
      plan: undefined,
      diagnostics: [{ code: 'STATIC-IMAGE-NO-ALT' }],
    });
    expect(result({ kind: 'text', content: 'a' }).diagnostics).toEqual([]);
    expect(result({ kind: 'heading', content: 'a' }).diagnostics).toEqual([]);
    expect(result({ kind: 'divider', content: '' }).diagnostics).toEqual([]);
  });

  it('preserves an explicit empty alt as the author’s decorative choice', () => {
    const { plan, diagnostics } = planStaticContent({
      binding: {
        kind: 'image',
        content: 'https://example.test/seal.png',
        alt: '',
      },
      staticAssetResolver: admitAuthoredSource,
      site,
    });
    expect(plan).toMatchObject({ kind: 'image', alt: '', decorative: true });
    expect(diagnostics).toEqual([]);
  });

  it('refuses to plan an image when the host supplies no asset resolver', () => {
    const { plan, diagnostics } = planStaticContent({
      binding: {
        kind: 'image',
        content: 'https://untrusted.example/seal.png',
        alt: 'Department seal',
      },
      site,
    });

    expect(plan).toBeUndefined();
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'STATIC-IMAGE-SOURCE-REFUSED',
    ]);
    expect(diagnostics[0]?.details).toEqual({
      authoredSource: 'https://untrusted.example/seal.png',
      reason: 'resolver-absent',
    });
  });

  it('uses only the source admitted by the host resolver', () => {
    const staticAssetResolver: SurfaceStaticAssetResolver = (request) => {
      expect(request).toEqual({
        kind: 'image',
        source: 'asset:seal',
        site,
      });
      return { status: 'admitted', source: 'https://cdn.example.test/safe/seal.png' };
    };

    const { plan, diagnostics } = planStaticContent({
      binding: { kind: 'image', content: 'asset:seal', alt: 'Department seal' },
      staticAssetResolver,
      site,
    });

    expect(plan).toMatchObject({
      kind: 'image',
      src: 'https://cdn.example.test/safe/seal.png',
    });
    expect(diagnostics).toEqual([]);
  });

  it.each([
    {
      name: 'host refusal',
      resolver: () => ({ status: 'refused', reason: 'origin-not-allowed' }) as const,
      reason: 'origin-not-allowed',
    },
    {
      name: 'empty admitted source',
      resolver: () => ({ status: 'admitted', source: '' }) as const,
      reason: 'empty-admitted-source',
    },
    {
      name: 'resolver error',
      resolver: () => {
        throw new Error('host details stay private');
      },
      reason: 'resolver-error',
    },
  ])('renders the image unavailable after $name', ({ resolver, reason }) => {
    const { plan, diagnostics } = planStaticContent({
      binding: { kind: 'image', content: 'asset:seal', alt: 'Department seal' },
      staticAssetResolver: resolver,
      site,
    });

    expect(plan).toBeUndefined();
    expect(diagnostics.at(-1)).toMatchObject({
      code: 'STATIC-IMAGE-SOURCE-REFUSED',
      severity: 'error',
      details: { authoredSource: 'asset:seal', reason },
    });
  });

  it('refuses a kind outside the closed set instead of guessing', () => {
    const { plan, diagnostics } = planStaticContent({
      binding: { kind: 'video', content: 'x' },
      site,
    });
    expect(plan).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toEqual(['STATIC-CONTENT-KIND-UNKNOWN']);
  });

  it('renders empty content as empty rather than throwing', () => {
    const { plan } = planStaticContent({ binding: { kind: 'text' }, site });
    expect(plan).toEqual({ kind: 'text', content: '' });
  });
});
