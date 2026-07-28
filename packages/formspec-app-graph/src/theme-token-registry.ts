/** @filedesc Theme token validation against the declared platform Token Registry. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import { PLATFORM_BRAND_TOKEN_KEY, PLATFORM_TOKEN_KEYS } from './platform-token-keys.js';

/**
 * Token keys a tenant plausibly reaches for when they mean the brand, and that
 * the registry does not declare. Naming them buys a better message, nothing
 * else: they are reported exactly like any other unregistered key, and NOTHING
 * aliases them onto the brand token (token-registry-spec §2.4). A silent alias
 * is how a tenant's brand travels the whole chain and paints nothing.
 */
const BRAND_LOOKALIKES: ReadonlySet<string> = new Set([
  'color.accent',
  'color.brand',
  'color.highlight',
  'color.dark.accent',
  'color.dark.brand',
  'color.dark.highlight',
]);

/**
 * Category prefixes the platform registry OWNS, derived from the declared keys
 * rather than restated. Inside an owned prefix the registry's key set is closed:
 * `color.accent` is reportable because the registry owns `color.*` and does not
 * declare `accent`.
 *
 * Outside them, nothing is reported. Theme Specification §3.2 blesses
 * `typography.`, `border.` and `elevation.` as valid Theme token vocabulary that
 * the registry deliberately does not carry — reporting those would turn a
 * spec-sanctioned prefix into a warning and train readers to ignore the
 * diagnostic, which is the failure mode this check exists to avoid.
 */
const OWNED_CATEGORY_PREFIXES: ReadonlySet<string> = new Set(
  [...PLATFORM_TOKEN_KEYS]
    .map((key) => key.slice(0, key.indexOf('.')))
    .filter((prefix) => prefix.length > 0),
);

function isReportable(token: string): boolean {
  if (token.startsWith('x-')) return false;
  if (PLATFORM_TOKEN_KEYS.has(token)) return false;
  const prefix = token.slice(0, token.indexOf('.'));
  return prefix.length > 0 && OWNED_CATEGORY_PREFIXES.has(prefix);
}

function escapeJsonPointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

function themeTokenKeys(handle: ResolvedArtifactHandle): string[] {
  const document = handle.document;
  if (!document || typeof document !== 'object' || Array.isArray(document)) return [];
  const tokens = (document as { tokens?: unknown }).tokens;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return [];
  return Object.keys(tokens as Record<string, unknown>);
}

function message(token: string): string {
  const prefix = token.slice(0, token.indexOf('.'));
  const head = `Theme token '${token}' sits under the platform-owned '${prefix}.' category and the Token Registry `
    + 'does not declare it.';
  if (BRAND_LOOKALIKES.has(token)) {
    return `${head} The brand token is '${PLATFORM_BRAND_TOKEN_KEY}' — nothing aliases '${token}' onto it, so this `
      + 'value is emitted as a CSS custom property that no stylesheet reads.';
  }
  return `${head} It is emitted as a CSS custom property that no stylesheet reads. Use a declared key, or move it `
    + "to the 'x-' extension namespace.";
}

/**
 * `THEME-TOKEN-UNREGISTERED` — token-registry-spec §5.3.
 *
 * A Theme token under a platform-owned category prefix that the registry does
 * not declare names nothing. It is accepted by authoring, passes schema
 * validation, is signed into the release, is emitted by the renderer and
 * resolves in the cascade — and changes nothing on screen. The whole chain
 * succeeds and the tenant sees no difference.
 *
 * Scoped to owned prefixes on purpose — see {@link OWNED_CATEGORY_PREFIXES}.
 *
 * Warning, not error: a theme carrying an unregistered token is still a
 * renderable theme, and §5.3 forbids rejecting a document on registry grounds.
 * The point is that the chain stops being silent.
 */
export function validateThemeTokenRegistry(context: AppGraphContext): AppGraphDiagnostic[] {
  const themes = context.handles.filter(
    (handle) => handle.artifactKind === 'theme' && handle.status === 'loaded',
  );

  return themes.flatMap((theme) =>
    themeTokenKeys(theme)
      .filter(isReportable)
      .map((token): AppGraphDiagnostic => ({
        code: 'THEME-TOKEN-UNREGISTERED',
        severity: 'warning',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message: message(token),
        primarySource: diagnosticSourceForHandle(
          theme,
          `/tokens/${escapeJsonPointerToken(token)}`,
        ),
        details: {
          token,
          brandToken: PLATFORM_BRAND_TOKEN_KEY,
          reason: BRAND_LOOKALIKES.has(token) ? 'brand-lookalike' : 'unregistered-token',
        },
      })),
  );
}
