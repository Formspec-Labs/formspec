/** @filedesc LocaleStore — reactive locale document management and string resolution cascade. */

import type { EngineReactiveRuntime, EngineSignal, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleDocument } from '@formspec-org/types';

export type { LocaleDocument };

/**
 * Rich lookup result exposing which cascade level produced the value.
 */
export interface LookupResult {
    value: string | null;
    source: 'regional' | 'fallback' | 'implicit' | null;
    localeCode?: string;
}

/**
 * Manages loaded locale documents, resolves string keys through the
 * regional -> fallback -> implicit cascade, and exposes reactive signals
 * for active locale and text direction.
 */
export class LocaleStore {
    readonly activeLocale: EngineSignal<string>;
    readonly direction: ReadonlyEngineSignal<'ltr' | 'rtl'>;
    readonly version: EngineSignal<number>;

    private _documents = new Map<string, LocaleDocument>();
    private _rx: EngineReactiveRuntime;
    private _directionMode: 'ltr' | 'rtl' | 'auto';
    private _directionVersion: EngineSignal<number>;

    private static RTL_LANGUAGES = new Set([
        'ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi',
    ]);

    constructor(rx: EngineReactiveRuntime, directionMode?: 'ltr' | 'rtl' | 'auto') {
        this._rx = rx;
        this._directionMode = directionMode ?? 'ltr';
        this.activeLocale = rx.signal('');
        this.version = rx.signal(0);
        this._directionVersion = rx.signal(0);

        this.direction = rx.computed(() => {
            // Read both signals to establish reactive dependencies
            this.activeLocale.value;
            this._directionVersion.value;
            if (this._directionMode !== 'auto') return this._directionMode;
            const lang = this.activeLocale.value.split('-')[0].toLowerCase();
            return LocaleStore.RTL_LANGUAGES.has(lang) ? 'rtl' : 'ltr';
        });
    }

    setDirectionMode(mode: 'ltr' | 'rtl' | 'auto'): void {
        this._directionMode = mode;
        this._directionVersion.value += 1;
    }

    loadLocale(doc: LocaleDocument): void {
        const code = LocaleStore.normalizeCode(doc.locale);
        this._documents.set(code, { ...doc, locale: code });
        // Any loaded locale can affect cascade resolution for the active locale.
        this.version.value += 1;
    }

    setLocale(code: string): void {
        this.activeLocale.value = LocaleStore.normalizeCode(code);
        this.version.value += 1;
    }

    getAvailableLocales(): string[] {
        return [...this._documents.keys()];
    }

    lookupKey(key: string): string | null {
        return this.lookupKeyWithMeta(key).value;
    }

    lookupKeyWithMeta(key: string): LookupResult {
        const activeCode = this.activeLocale.value;
        if (!activeCode) return { value: null, source: null };
        return this._cascadeLookup(key, activeCode, new Set());
    }

    private _cascadeLookup(
        key: string,
        code: string,
        visited: Set<string>,
    ): LookupResult {
        if (visited.has(code)) return { value: null, source: null };
        visited.add(code);

        const doc = this._documents.get(code);

        // Direct hit in this document
        if (doc && key in doc.strings) {
            const isActive = code === this.activeLocale.value;
            return {
                value: doc.strings[key],
                source: isActive ? 'regional' : (doc.fallback != null ? 'fallback' : 'implicit'),
                localeCode: code,
            };
        }

        // Explicit fallback chain
        if (doc?.fallback) {
            const fallbackCode = LocaleStore.normalizeCode(doc.fallback);
            const result = this._cascadeLookup(key, fallbackCode, visited);
            if (result.value !== null) {
                return { ...result, source: 'fallback' };
            }
        }

        // Implicit language fallback: strip region subtag
        const dashIdx = code.indexOf('-');
        if (dashIdx > 0) {
            const baseCode = code.substring(0, dashIdx);
            if (!visited.has(baseCode)) {
                const result = this._cascadeLookup(key, baseCode, visited);
                if (result.value !== null) {
                    return { ...result, source: 'implicit' };
                }
            }
        }

        return { value: null, source: null };
    }

    /**
     * Normalize BCP 47: lowercase language, title-case script (4 chars),
     * uppercase region (2 chars), lowercase variants/extensions.
     */
    static normalizeCode(code: string): string {
        return normalizeBcp47(code);
    }
}

/**
 * Normalize BCP 47: lowercase language, title-case script (4 chars),
 * uppercase region (2 chars), lowercase variants/extensions.
 */
export function normalizeBcp47(code: string): string {
    const parts = code.split('-');
    parts[0] = parts[0].toLowerCase();
    for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        if (p.length === 2) {
            // Region subtag: uppercase
            parts[i] = p.toUpperCase();
        } else if (p.length === 4 && /^[a-zA-Z]+$/.test(p)) {
            // Script subtag: title-case
            parts[i] = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
        } else {
            // Variant or extension: lowercase
            parts[i] = p.toLowerCase();
        }
    }
    return parts.join('-');
}
