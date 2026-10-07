/** @filedesc Shared maintained Item and option wording cascades; no evaluator imports. */
import type { LocaleStore } from './locale.js';

export interface ResolvedPresentationString<T extends string | null> {
    value: T;
    /** The winning string before `{{}}` interpolation — what the author wrote. */
    template: T;
    needAnchors: string[];
}

/** Inputs to the Item label cascade; read inside a computed so every getter is a dependency. */
export interface ItemLabelSource {
    localeStore: LocaleStore;
    itemKey: string;
    inlineLabel: string | undefined;
    labels: Record<string, string> | undefined;
    context: string | null;
    /** Resolves `{{expression}}` in the Item's binding scope (Locale §3.3.1). */
    interpolate: (template: string) => string;
}

/**
 * Locale steps of an Item string cascade (Locale §3.1.2): `<key>.<property>@context` → `<key>.<property>`,
 * `{{}}` resolved through `interpolate`; `null` when the Locale has neither. Each lookup walks the locale
 * fallback cascade (fr-CA → fr). Reads `localeStore.version`, so a computed caller tracks locale changes.
 */
function resolveLocaleItemString(
    localeStore: LocaleStore,
    itemKey: string,
    property: 'label' | 'hint' | 'description',
    context: string | null,
    interpolate: ItemLabelSource['interpolate'],
): ResolvedPresentationString<string> | null {
    localeStore.version.value;
    const keys = context ? [`${itemKey}.${property}@${context}`, `${itemKey}.${property}`] : [`${itemKey}.${property}`];
    for (const key of keys) {
        const fromLocale = localeStore.lookupKeyWithMeta(key);
        if (fromLocale.value !== null) {
            return {
                value: interpolate(fromLocale.value),
                template: fromLocale.value,
                needAnchors: [...(fromLocale.needAnchors ?? [])],
            };
        }
    }
    return null;
}

/** Inputs to the Item hint / description cascade, read inside a computed like {@link ItemLabelSource}. */
export interface ItemHelpTextSource {
    localeStore: LocaleStore;
    itemKey: string;
    /** Which help-text property to resolve. */
    property: 'hint' | 'description';
    /** The Definition's inline `hint` / `description`, when it has one. */
    inlineText: string | null | undefined;
    context: string | null;
    /** Resolves `{{expression}}` in the Item's binding scope (Locale §3.3.1). */
    interpolate: (template: string) => string;
}

/**
 * Hint or description a respondent sees for any Item (Core §4.2.1, Locale §3.1.2): Locale
 * `<key>.<property>@context` → Locale `<key>.<property>` → the inline property — the label cascade
 * minus its Definition-side context step, since neither property has a `labels`-like sibling.
 * `null` when no source has it.
 */
export function resolveItemHelpText(source: ItemHelpTextSource): ResolvedPresentationString<string | null> {
    const { localeStore, itemKey, property, inlineText, context, interpolate } = source;
    const fromLocale = resolveLocaleItemString(localeStore, itemKey, property, context, interpolate);
    if (fromLocale) {
        return fromLocale;
    }
    if (inlineText === null || inlineText === undefined) {
        return { value: null, template: null, needAnchors: [] };
    }
    return { value: interpolate(inlineText), template: inlineText, needAnchors: [] };
}

/**
 * Label a respondent sees for any Item (Locale §3.1–3.3): Locale `<key>.label@context` → Locale
 * `<key>.label` → Definition `labels[context]` → inline `label`, `{{}}` resolved through `interpolate`.
 */
export function resolveItemLabel(source: ItemLabelSource): ResolvedPresentationString<string> {
    const { localeStore, itemKey, labels, context, interpolate } = source;
    const fromLocale = resolveLocaleItemString(localeStore, itemKey, 'label', context, interpolate);
    if (fromLocale) {
        return fromLocale;
    }
    const definitionLabel = (context ? labels?.[context] : undefined) || source.inlineLabel || '';
    return { value: interpolate(definitionLabel), template: definitionLabel, needAnchors: [] };
}

export function resolveOptionLabel(
    localeStore: LocaleStore,
    itemKey: string,
    opt: { value: string; label: string },
    interpolate: (template: string) => string,
    optionSetName?: string,
): { label: string; needAnchors?: string[] } {
    const escapedValue = escapeOptionValue(opt.value);

    // Step 1: Field-level locale key
    const fieldKey = `${itemKey}.options.${escapedValue}.label`;
    const fromField = localeStore.lookupKeyWithMeta(fieldKey);
    if (fromField.value !== null) {
        return {
            label: interpolate(fromField.value),
            ...(fromField.needAnchors ? { needAnchors: fromField.needAnchors } : {}),
        };
    }

    // Step 2: OptionSet-level locale key
    if (optionSetName) {
        const setKey = `$optionSet.${optionSetName}.${escapedValue}.label`;
        const fromSet = localeStore.lookupKeyWithMeta(setKey);
        if (fromSet.value !== null) {
            return {
                label: interpolate(fromSet.value),
                ...(fromSet.needAnchors ? { needAnchors: fromSet.needAnchors } : {}),
            };
        }
    }

    // Step 3: Inline option label
    return { label: opt.label };
}

/** Escape dots and backslashes in option values per §3.1.3. */
function escapeOptionValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
}
