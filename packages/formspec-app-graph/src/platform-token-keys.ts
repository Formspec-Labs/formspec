/** @filedesc Declared platform token keys — generated from schemas/token-registry.json. */

// DO NOT EDIT — regenerate with: node scripts/generate-theme-from-registry.mjs

/**
 * Every token key the platform Token Registry declares, light keys plus the
 * `darkPrefix`-derived dark keys. A Theme token outside this set and outside the
 * `x-` extension namespace names nothing: no stylesheet reads it, no
 * `tokenMeta` describes it, and emitting it produces a CSS custom property with
 * no consumer. That is what THEME-TOKEN-UNREGISTERED reports
 * (token-registry-spec §5.3).
 */
export const PLATFORM_TOKEN_KEYS: ReadonlySet<string> = new Set([
  'color.background',
  'color.border',
  'color.card',
  'color.dark.background',
  'color.dark.border',
  'color.dark.card',
  'color.dark.error',
  'color.dark.foreground',
  'color.dark.info',
  'color.dark.input',
  'color.dark.muted',
  'color.dark.mutedForeground',
  'color.dark.primary',
  'color.dark.primaryForeground',
  'color.dark.ring',
  'color.dark.success',
  'color.dark.surface',
  'color.dark.warning',
  'color.error',
  'color.foreground',
  'color.info',
  'color.input',
  'color.muted',
  'color.mutedForeground',
  'color.primary',
  'color.primaryForeground',
  'color.ring',
  'color.success',
  'color.surface',
  'color.warning',
  'font.family',
  'font.lineHeight.loose',
  'font.lineHeight.normal',
  'font.lineHeight.tight',
  'font.weight.bold',
  'font.weight.medium',
  'font.weight.regular',
  'radius.md',
  'radius.sm',
  'spacing.field',
  'spacing.lg',
  'spacing.md',
  'spacing.sm',
  'spacing.xl',
  'spacing.xs',
]);

/**
 * THE brand token (token-registry-spec §2.4). Named here so a consumer that
 * needs to talk about the brand key does not restate the string; there is no
 * second brand key and no alias for one.
 */
export const PLATFORM_BRAND_TOKEN_KEY = 'color.primary';
