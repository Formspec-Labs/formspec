/** @filedesc Platform rendering defaults and theme builder that derives a ThemeDocument from the token registry. */

import type { PresentationBlock, ThemeSelector, ThemeDocument } from './theme-resolver.js';
import tokenRegistry from './token-registry.json' with { type: 'json' };

// ── Platform Defaults ──────────────────────────────────────────────

/** Default presentation applied to all items before selector matching. */
export const platformDefaults: PresentationBlock = {
    labelPosition: 'top',
    accessibility: {
        liveRegion: 'off',
    },
};

/** Type-based selector rules applied in document order during theme cascade. */
export const platformSelectors: ThemeSelector[] = [
    {
        match: { type: 'group' },
        apply: {
            cssClass: 'formspec-themed-group',
            accessibility: { role: 'group' },
        },
    },
    {
        match: { type: 'display' },
        apply: {
            cssClass: 'formspec-themed-display',
        },
    },
    {
        match: { type: 'field' },
        apply: {
            cssClass: 'formspec-themed-field',
        },
    },
    {
        match: { dataType: 'boolean' },
        apply: {
            labelPosition: 'start',
        },
    },
];

// ── Token Registry Types ───────────────────────────────────────────

interface TokenEntry {
    description: string;
    default: string;
    dark?: string;
    /**
     * Another token key this one derives from when a Theme leaves it unset.
     * A derived token is deliberately NOT emitted into the platform theme — see
     * {@link extractTokens}.
     */
    derivedFrom?: string;
}

interface TokenCategory {
    description: string;
    type: string;
    darkPrefix?: string;
    tokens: Record<string, TokenEntry>;
}

interface TokenRegistry {
    $formspecTokenRegistry: string;
    description: string;
    categories: Record<string, TokenCategory>;
}

// ── Theme Builder ──────────────────────────────────────────────────

/**
 * Extract all token values from the registry: light-mode defaults plus
 * dark-mode variants keyed under each category's `darkPrefix`.
 *
 * **Tokens carrying `derivedFrom` are skipped.** A derived token's whole point
 * is that it resolves through another token when a Theme leaves it unset
 * (`color.ring` through `color.primary`). Emitting the platform default for it
 * here would give every theme an explicit value, so the CSS chain
 * `var(--formspec-color-ring, var(--formspec-color-primary, …))` could never
 * reach its second arm and a tenant setting only the brand token would keep the
 * platform focus ring. Its `default` still reaches the skin as the innermost
 * CSS fallback.
 */
function extractTokens(registry: TokenRegistry): Record<string, string> {
    const tokens: Record<string, string> = {};

    for (const category of Object.values(registry.categories)) {
        const { darkPrefix } = category;

        for (const [tokenName, entry] of Object.entries(category.tokens)) {
            if (entry.derivedFrom !== undefined) continue;
            tokens[tokenName] = entry.default;

            if (darkPrefix && entry.dark) {
                // "color.primary" with darkPrefix "color.dark" becomes "color.dark.primary"
                const suffix = tokenName.slice(tokenName.indexOf('.') + 1);
                const darkKey = `${darkPrefix}.${suffix}`;
                tokens[darkKey] = entry.dark;
            }
        }
    }

    return tokens;
}

/**
 * Build a complete ThemeDocument from the token registry and platform defaults.
 *
 * Light-mode tokens come from each entry's `default` value. Dark-mode tokens
 * are derived from `dark` values, keyed under the category's `darkPrefix`.
 */
export function buildPlatformTheme(): ThemeDocument {
    const tokens = extractTokens(tokenRegistry as unknown as TokenRegistry);

    return {
        $formspecTheme: '1.0',
        version: '1.0.0',
        name: 'formspec-default',
        targetDefinition: {
            url: 'urn:formspec:any',
            compatibleVersions: '>=1.0.0',
        },
        tokens,
        defaults: platformDefaults,
        selectors: platformSelectors,
    };
}
