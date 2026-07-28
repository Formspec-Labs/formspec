/**
 * @filedesc Every shell-owned foreground/background pair, measured, in both
 * schemes.
 *
 * The defect this pins: `.fs-surface-app` declared
 * `color: var(--formspec-color-foreground, #1a1a1a)` with no dark arm, the
 * route title inherited the computed value, and against the dark shell panel it
 * measured **1.06:1** — an invisible page heading on a page that had passed
 * every other check the stack runs.
 *
 * Two halves, and both are needed:
 *
 * 1. The **ratios** below are computed from the token values a route actually
 *    receives, so the numbers are measurements rather than claims.
 * 2. The **stylesheet is parsed**, so a rule that reintroduces a raw
 *    `--formspec-color-*` foreground with no dark arm fails here rather than in
 *    a screenshot nobody re-takes. A contrast argument that lives only in a
 *    comment decays on the first edit.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPlatformTheme } from '@formspec-org/layout';

const CSS = readFileSync(resolve(process.cwd(), 'src/formspec-surface.css'), 'utf8');

const tokens = (buildPlatformTheme() as { tokens: Record<string, string> }).tokens;

/** WCAG 2.2 relative luminance and contrast ratio. */
function channels(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

/**
 * The two schemes, resolved the way the stylesheet resolves them: light reads
 * `color.*`, dark reads `color.dark.*`, except the accent FILL, which keeps the
 * saturated light-mode brand in both because the dark accent is a light tint.
 */
const SCHEMES = {
  light: {
    ink: tokens['color.foreground'] as string,
    inkQuiet: tokens['color.mutedForeground'] as string,
    panel: tokens['color.card'] as string,
    panelQuiet: tokens['color.surface'] as string,
    lineStrong: tokens['color.muted'] as string,
    accent: tokens['color.primary'] as string,
    accentFill: tokens['color.primary'] as string,
    accentInk: tokens['color.primaryForeground'] as string,
    danger: tokens['color.error'] as string,
    /** What the surface-render-v10 host paints behind the route. */
    hostPanel: '#ffffff',
  },
  dark: {
    ink: tokens['color.dark.foreground'] as string,
    inkQuiet: tokens['color.dark.mutedForeground'] as string,
    panel: tokens['color.dark.card'] as string,
    panelQuiet: tokens['color.dark.surface'] as string,
    lineStrong: tokens['color.dark.muted'] as string,
    accent: tokens['color.dark.primary'] as string,
    accentFill: tokens['color.primary'] as string,
    accentInk: tokens['color.primaryForeground'] as string,
    danger: tokens['color.dark.error'] as string,
    hostPanel: '#1c2026',
  },
} as const;

const AA_BODY = 4.5;
/** SC 1.4.11 — a boundary that identifies a control. */
const AA_NON_TEXT = 3;

describe.each(Object.entries(SCHEMES))('shell-owned surfaces — %s', (_scheme, palette) => {
  const backdrops: [string, string][] = [
    ['the shell’s own card', palette.panel],
    ['the host’s panel', palette.hostPanel],
  ];

  it.each(backdrops)('route title, headings and body ink on %s', (_where, background) => {
    expect(contrast(palette.ink, background)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(backdrops)('nav group label and other quiet ink on %s', (_where, background) => {
    expect(contrast(palette.inkQuiet, background)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('theme-posture notice: ink on the quiet surface it paints', () => {
    expect(contrast(palette.ink, palette.panelQuiet)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('ceremony note and receipt labels: quiet ink on the card', () => {
    expect(contrast(palette.inkQuiet, palette.panel)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('transition button: its own ink on its own fill', () => {
    expect(contrast(palette.accentInk, palette.accentFill)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('banner eyebrow: the accent as text on the card', () => {
    expect(contrast(palette.accent, palette.panel)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(backdrops)('transition failure: danger on %s', (_where, background) => {
    expect(contrast(palette.danger, background)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(backdrops)('nav link and card boundaries on %s clear SC 1.4.11', (_where, background) => {
    expect(contrast(palette.lineStrong, background)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('the unavailable placeholder is readable on the quiet surface too', () => {
    expect(contrast(palette.ink, palette.panelQuiet)).toBeGreaterThanOrEqual(AA_BODY);
  });
});

describe('the stylesheet cannot regress to a single-scheme palette', () => {
  const aliasNames = [
    '--fs-surface-ink',
    '--fs-surface-ink-quiet',
    '--fs-surface-panel',
    '--fs-surface-panel-quiet',
    '--fs-surface-line',
    '--fs-surface-line-strong',
    '--fs-surface-accent',
    '--fs-surface-accent-fill',
    '--fs-surface-accent-ink',
    '--fs-surface-danger',
    '--fs-surface-focus',
  ];

  it('declares a dark arm for every alias it declares a light arm for', () => {
    const dark = CSS.slice(CSS.indexOf('@media (prefers-color-scheme: dark)'));
    for (const alias of aliasNames) {
      expect(dark).toContain(`${alias}:`);
    }
  });

  it('lets a host toggle pin the scheme in BOTH directions', () => {
    expect(CSS).toContain("[data-fs-appearance='dark']");
    expect(CSS).toContain("[data-fs-appearance='light']");
  });

  it('paints no colour from a raw --formspec-color-* outside the alias layer', () => {
    // The alias layer is the ONE place a scheme decision is made. A rule that
    // reads a raw colour token paints the light value in dark mode, which is
    // exactly how `color: var(--formspec-color-foreground, #1a1a1a)` became
    // 1.06:1.
    const aliasBlockEnd = CSS.indexOf('.fs-surface-app {\n  font-family');
    expect(aliasBlockEnd).toBeGreaterThan(0);
    const rules = CSS.slice(aliasBlockEnd);
    const rawColourUses = rules.match(/var\(--formspec-color-[^)]*\)/g) ?? [];
    expect(rawColourUses).toEqual([]);
  });

  it('states no bare hex colour outside the alias layer', () => {
    const aliasBlockEnd = CSS.indexOf('.fs-surface-app {\n  font-family');
    const rules = CSS.slice(aliasBlockEnd).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});
