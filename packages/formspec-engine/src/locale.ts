/** @filedesc LocaleStore — reactive locale document management and string resolution cascade. */

import type { EngineReactiveRuntime, EngineSignal, ReadonlyEngineSignal } from './reactivity/types.js';
import type { LocaleDocument } from '@formspec-org/types';

export type { LocaleDocument };

export interface LocaleTargetIdentity {
    kind: LocaleDocument['target']['kind'];
    url: string;
}

/**
 * Rich lookup result exposing which cascade level produced the value.
 */
export interface LookupResult {
    value: string | null;
    source: 'regional' | 'fallback' | 'implicit' | null;
    localeCode?: string;
    /** Direct canonical Need anchors for the exact localized string selected. */
    needAnchors?: string[];
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
    private _activeTarget: LocaleTargetIdentity | null;
    private _rx: EngineReactiveRuntime;
    private _directionMode: 'ltr' | 'rtl' | 'auto';
    private _directionVersion: EngineSignal<number>;

    private static RTL_LANGUAGES = new Set([
        'ar', 'he', 'fa', 'ur', 'ps', 'sd', 'yi',
    ]);

    constructor(
        rx: EngineReactiveRuntime,
        directionMode?: 'ltr' | 'rtl' | 'auto',
        activeTarget?: LocaleTargetIdentity,
    ) {
        this._rx = rx;
        this._directionMode = directionMode ?? 'ltr';
        this._activeTarget = activeTarget ? { ...activeTarget } : null;
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
        const target = { ...doc.target };
        if (this._activeTarget === null) {
            this._activeTarget = { kind: target.kind, url: target.url };
        }
        this._documents.set(
            LocaleStore.documentKey(target, code),
            { ...doc, target, locale: code },
        );
        // Any loaded locale can affect cascade resolution for the active locale.
        this.version.value += 1;
    }

    setTarget(target: LocaleTargetIdentity): void {
        this._activeTarget = { ...target };
        this.version.value += 1;
    }

    getActiveTarget(): LocaleTargetIdentity | null {
        return this._activeTarget ? { ...this._activeTarget } : null;
    }

    setLocale(code: string): void {
        this.activeLocale.value = LocaleStore.normalizeCode(code);
        this.version.value += 1;
    }

    getAvailableLocales(target: LocaleTargetIdentity | null = this._activeTarget): string[] {
        if (target === null) return [];
        const prefix = LocaleStore.targetKey(target);
        return [...this._documents.entries()]
            .filter(([, document]) => LocaleStore.targetKey(document.target) === prefix)
            .map(([, document]) => document.locale);
    }

    lookupKey(key: string): string | null {
        return this.lookupKeyWithMeta(key).value;
    }

    lookupKeyWithMeta(key: string): LookupResult {
        if (this._activeTarget === null) return { value: null, source: null };
        return this.lookupKeyForTarget(key, this._activeTarget);
    }

    lookupKeyForTarget(
        key: string,
        target: LocaleTargetIdentity,
        localeCode: string = this.activeLocale.value,
    ): LookupResult {
        const activeCode = LocaleStore.normalizeCode(localeCode);
        if (!activeCode) return { value: null, source: null };
        return this._cascadeLookup(key, target, activeCode, activeCode, new Set());
    }

    /**
     * The active locale's `formats.date` (Locale §2.4): the first document on the same cascade
     * strings use — regional, explicit fallback, implicit language — that authored one. Null when none did.
     */
    dateFormats(): Record<string, string> | null {
        if (this._activeTarget === null) return null;
        const seen = new Set<string>();
        let code = LocaleStore.normalizeCode(this.activeLocale.value);
        while (code && !seen.has(code)) {
            seen.add(code);
            const doc = this._documents.get(LocaleStore.documentKey(this._activeTarget, code));
            const date = doc?.formats?.date;
            if (date && Object.keys(date).length > 0) return { ...date } as Record<string, string>;
            const dash = code.indexOf('-');
            code = doc?.fallback ? LocaleStore.normalizeCode(doc.fallback) : dash > 0 ? code.substring(0, dash) : '';
        }
        return null;
    }

    private _cascadeLookup(
        key: string,
        target: LocaleTargetIdentity,
        code: string,
        requestedCode: string,
        visited: Set<string>,
    ): LookupResult {
        if (visited.has(code)) return { value: null, source: null };
        visited.add(code);

        const doc = this._documents.get(LocaleStore.documentKey(target, code));

        // Direct hit in this document
        if (doc && key in doc.strings) {
            const isActive = code === requestedCode;
            const generation = doc.stringGeneration?.[key];
            const anchors = Array.isArray(generation?.anchors)
                ? generation.anchors.filter(
                    (anchor): anchor is string =>
                        typeof anchor === 'string'
                        && /^need:[a-zA-Z][a-zA-Z0-9_-]*@[1-9][0-9]*$/.test(anchor),
                )
                : [];
            return {
                value: doc.strings[key],
                source: isActive ? 'regional' : (doc.fallback != null ? 'fallback' : 'implicit'),
                localeCode: code,
                ...(anchors.length > 0 ? { needAnchors: [...new Set(anchors)] } : {}),
            };
        }

        // Explicit fallback chain
        if (doc?.fallback) {
            const fallbackCode = LocaleStore.normalizeCode(doc.fallback);
            const result = this._cascadeLookup(
                key,
                target,
                fallbackCode,
                requestedCode,
                visited,
            );
            if (result.value !== null) {
                return { ...result, source: 'fallback' };
            }
        }

        // Implicit language fallback: strip region subtag
        const dashIdx = code.indexOf('-');
        if (dashIdx > 0) {
            const baseCode = code.substring(0, dashIdx);
            if (!visited.has(baseCode)) {
                const result = this._cascadeLookup(
                    key,
                    target,
                    baseCode,
                    requestedCode,
                    visited,
                );
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

    private static targetKey(target: LocaleTargetIdentity): string {
        return JSON.stringify([target.kind, target.url]);
    }

    private static documentKey(target: LocaleTargetIdentity, locale: string): string {
        return JSON.stringify([target.kind, target.url, LocaleStore.normalizeCode(locale)]);
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
