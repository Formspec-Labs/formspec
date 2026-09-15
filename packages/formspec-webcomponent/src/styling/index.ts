/** @filedesc Styling barrel: StylingHost interface, presentation resolution, and re-exports. */
import {
    ThemeDocument,
    PresentationBlock,
    ItemDescriptor,
    Tier1Hints,
    resolvePresentation,
} from '@formspec-org/layout';

import { FormDefinition, ComponentDocument, FormItem } from '@formspec-org/types';
import type { StylesheetLayer } from '../adapters/types';

export interface StylingHost {
    _componentDocument: ComponentDocument | null;
    _definition: FormDefinition | null;
    _themeDocument: ThemeDocument | null;
    stylesheetHrefs: string[];
    /** The root the current `stylesheetHrefs` were linked into, or `null` when nothing is linked. */
    stylesheetRoot: Document | ShadowRoot | null;
    getRootNode(): Node;
    /** The adapter this host resolved, matched against the `--formspec-adapter` a page may have pre-loaded. */
    resolvedAdapterName: string;
    /** Stylesheet layers declared by the adapter this host resolved (ADR 0063 D-4). */
    adapterStylesheets(): Array<string | StylesheetLayer>;
    /** Class vocabulary declared by the adapter this host resolved, or `undefined` when it declares none. */
    adapterClassVocabulary(): ReadonlySet<string> | undefined;
    getEffectiveTheme(): ThemeDocument;
    findItemByKey(key: string, items?: FormItem[]): FormItem | null;
}

export function resolveItemPresentation(host: StylingHost, itemDesc: ItemDescriptor): PresentationBlock {
    const item = host.findItemByKey(itemDesc.key);
    const tier1: Tier1Hints = {
        formPresentation: host._definition?.formPresentation,
        itemPresentation: item?.presentation
    };
    const theme: ThemeDocument = host.getEffectiveTheme();
    return resolvePresentation(theme, itemDesc, tier1);
}

export { resolveToken, emitThemeTokens, emitTokenProperties } from './tokens';
export { applyCssClass, applyClassValue, resolveWidgetClassSlots } from './classes';
export { applyStyle } from './style';
export { applyAccessibility } from './accessibility';
export {
    LAYOUT_STYLESHEET_HREF,
    canonicalizeStylesheetHref,
    loadStylesheets,
    cleanupStylesheets,
} from './stylesheets';
