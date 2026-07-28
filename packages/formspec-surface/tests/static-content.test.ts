/**
 * @filedesc Static content — the closed kind vocabulary and the heading contract.
 *
 * Heading levels are the document outline and the outline is an accessibility
 * contract, so these assertions are about correctness, not formatting: exactly
 * one `h1` per page, no skipped levels, and nesting that never outranks its host.
 */
import { describe, expect, it } from 'vitest';
import { STATIC_CONTENT_KINDS, planStaticContent, resolveHeadingLevel } from '../src/static-content.js';

const site = { surfaceId: 's', routeId: 'r', slotId: 'slot' };

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

  it('names an image from the slot title when the author gave one', () => {
    const { plan, diagnostics } = planStaticContent({
      binding: { kind: 'image', content: 'https://example.test/seal.png' },
      slotTitle: 'Department seal',
      site,
    });
    expect(plan).toEqual({
      kind: 'image',
      src: 'https://example.test/seal.png',
      alt: 'Department seal',
      decorative: false,
    });
    // D8. The diagnostic fires on EVERY image slot, including this one
    // (§3.4.2, §7.3). A region label pressed into service is a fallback, not an
    // authored alt; silencing here would hide finding F1's size behind the
    // workaround and make the fire count useless as a measure of the gap.
    expect(diagnostics.map((d) => d.code)).toEqual(['STATIC-IMAGE-NO-ALT']);
    expect(diagnostics[0]?.details).toMatchObject({ source: 'slot.title', finding: 'F1' });
  });

  it('fires STATIC-IMAGE-NO-ALT on every image slot and no other kind', () => {
    const fires = (binding: Record<string, unknown>, slotTitle?: string) =>
      planStaticContent({ binding, site, ...(slotTitle ? { slotTitle } : {}) }).diagnostics.map(
        (d) => d.code,
      );
    expect(fires({ kind: 'image', content: 'a.png' })).toEqual(['STATIC-IMAGE-NO-ALT']);
    expect(fires({ kind: 'image', content: 'a.png' }, 'Seal')).toEqual(['STATIC-IMAGE-NO-ALT']);
    expect(fires({ kind: 'text', content: 'a' })).toEqual([]);
    expect(fires({ kind: 'heading', content: 'a' })).toEqual([]);
    expect(fires({ kind: 'divider', content: '' })).toEqual([]);
  });

  it('marks an unnamed image decorative AND says the channel is missing', () => {
    const { plan, diagnostics } = planStaticContent({
      binding: { kind: 'image', content: 'https://example.test/seal.png' },
      site,
    });
    expect(plan).toMatchObject({ kind: 'image', alt: '', decorative: true });
    expect(diagnostics.map((d) => d.code)).toEqual(['STATIC-IMAGE-NO-ALT']);
  });

  it('refuses a kind outside the closed set instead of guessing', () => {
    const { plan, diagnostics } = planStaticContent({
      binding: { kind: 'video', content: 'x' },
      site,
    });
    expect(plan).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toEqual(['SLOT-BINDING-INCOMPLETE']);
  });

  it('renders empty content as empty rather than throwing', () => {
    const { plan } = planStaticContent({ binding: { kind: 'text' }, site });
    expect(plan).toEqual({ kind: 'text', content: '' });
  });
});
