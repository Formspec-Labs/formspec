/** @filedesc Target-qualified Screener presentation text using the maintained Locale and FEL engines. */
import type { LocaleDocument, ScreenerDocument } from '@formspec-org/types';
import { satisfies, valid, validRange } from 'semver';
import { LocaleStore } from './locale.js';
import { preactReactiveRuntime } from './reactivity/preact-runtime.js';
import { wasmCreateFelContext, type WasmInterpolated } from './wasm-bridge-runtime.js';

export interface ScreenerLocaleInput {
    document: ScreenerDocument;
    localeDocuments?: readonly LocaleDocument[];
    activeLocale?: string;
    /** Schema-aligned renderer chrome suffixes from the caller's maintained inventory. */
    chromeKeys: readonly string[];
}
export interface ScreenerLocaleText {
    lookup(key: string): string | null;
    text(key: string, fallback: string, answers: Record<string, unknown>, itemKey?: string, bindScope?: boolean): WasmInterpolated;
    direction: 'ltr' | 'rtl';
}
export type ScreenerLocaleAdmission =
    | { status: 'ready'; resolver: ScreenerLocaleText }
    | { status: 'refused'; reason: string };

/** Escape a static option value using canonical Locale key addressing. */
export function screenerOptionLocaleKey(itemKey: string, value: string): string {
    return `${itemKey}.options.${value.replace(/[\\.]/g, '\\$&')}.label`;
}

/** Admit exact-target Locale resources and reuse the existing same-target cascade. */
export function createScreenerLocaleResolver(input: ScreenerLocaleInput): ScreenerLocaleAdmission {
    const { document } = input;
    const target = { kind: 'screener' as const, url: document.url };
    const store = new LocaleStore(preactReactiveRuntime, 'auto', target);
    const keys = new Set(['$form.title', '$form.description', ...input.chromeKeys.map(key => `$ui.${key}`)]);
    for (const item of document.items) {
        keys.add(`${item.key}.label`);
        keys.add(`${item.key}.requiredMessage`);
        for (const option of Array.isArray(item.options) ? item.options : []) {
            if (option && typeof option === 'object' && typeof option.value === 'string') keys.add(screenerOptionLocaleKey(item.key, option.value));
        }
    }
    const locales = new Set<string>();
    for (const source of input.localeDocuments ?? []) {
        if (source?.target?.kind !== 'screener' || source.target.url !== document.url) continue;
        if (source.$formspecLocale !== '2.1') return { status: 'refused', reason: 'screener-locale-dialect' };
        const range = source.target.compatibleVersions;
        if (range !== undefined && (typeof range !== 'string' || !valid(document.version) || !validRange(range) || !satisfies(document.version, range, { includePrerelease: true }))) {
            return { status: 'refused', reason: 'screener-locale-target-version' };
        }
        if (typeof source.locale !== 'string' || !source.locale || !source.strings || typeof source.strings !== 'object' || Array.isArray(source.strings)) return { status: 'refused', reason: 'screener-locale-resource' };
        const code = LocaleStore.normalizeCode(source.locale);
        if (locales.has(code)) return { status: 'refused', reason: 'screener-locale-duplicate' };
        locales.add(code);
        if (Object.entries(source.strings).some(([key, value]) => !keys.has(key) || typeof value !== 'string')) {
            return { status: 'refused', reason: 'screener-locale-key' };
        }
        store.loadLocale(structuredClone(source));
    }
    store.setLocale(input.activeLocale ?? '');
    return { status: 'ready', resolver: {
        lookup: key => store.lookupKey(key),
        direction: store.direction.value,
        text(key, fallback, answers, itemKey = '', bindScope = false) {
            const template = store.lookupKey(key) ?? fallback;
            if (key.startsWith('$ui.') || !template.includes('{{')) return { text: template, warnings: [] };
            const context = wasmCreateFelContext({ dataTypes: Object.fromEntries(document.items.map(item => [item.key, typeof item.dataType === 'string' ? item.dataType : 'string'])), excludedValueNull: [] });
            try {
                context.load(JSON.stringify({ values: Object.fromEntries(document.items.map(item => [item.key, answers[item.key] ?? null])), mips: {}, repeatCounts: {}, variables: {}, instances: {}, locale: input.activeLocale ?? '', dateFormats: store.dateFormats() ?? {} }));
                return JSON.parse(context.interpolate(template, itemKey, bindScope, new Date().toISOString(), undefined)) as WasmInterpolated;
            } finally { context.free(); }
        },
    } };
}
