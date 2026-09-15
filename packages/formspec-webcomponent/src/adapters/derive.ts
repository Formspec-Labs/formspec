/** @filedesc deriveAdapter — a variant adapter in one line: same components, new name/stylesheets/vocabulary (ADR 0064 decision 1). */
import type { RenderAdapter, StylesheetLayer } from './types';

/**
 * What a variant declares for itself. `stylesheets` is required, not inherited from `base`: a variant is
 * a distinct compiled sheet (own settings, own house rules — ADR 0064 decision 1), so its `classVocabulary`
 * is equally distinct and is never inherited either. A variant that skips `classVocabulary` renders with
 * no unknown-class check, the same as any adapter that never declares one. A variant built from a layered
 * base (ADR 0063 D-4) typically re-declares its own compiled base layer plus the base adapter's exported,
 * unchanged rules layer — see the USWDS adapter's README.
 */
export interface DeriveAdapterOptions {
    name: string;
    stylesheets: Array<string | StylesheetLayer>;
    classVocabulary?: ReadonlySet<string>;
}

/**
 * An organization's look is a variant, not a fork: the same render functions, a new registered name and
 * a new declared stylesheet/vocabulary (typically a compiled `!default`-configured Sass partial — see
 * `formspec-adapters`' USWDS adapter). `base` is never mutated.
 */
export function deriveAdapter(base: RenderAdapter, options: DeriveAdapterOptions): RenderAdapter {
    return {
        components: base.components,
        name: options.name,
        stylesheets: options.stylesheets,
        classVocabulary: options.classVocabulary,
    };
}
