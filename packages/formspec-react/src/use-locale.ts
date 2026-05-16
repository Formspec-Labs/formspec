'use client';

/** @filedesc useLocale — locale management forwarding to FormEngine. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';

export interface UseLocaleResult {
    activeLocale: string;
    availableLocales: string[];
    direction: 'ltr' | 'rtl';
    setLocale: (code: string) => void;
    loadLocale: (doc: any) => void;
}

/**
 * Locale management hook — forwards to engine locale APIs.
 * Provides active locale, available locales, text direction, and locale switching.
 */
export function useLocale(): UseLocaleResult {
    const { engine } = useFormspecContext();

    const setLocale = useCallback((code: string) => {
        engine.setLocale(code);
    }, [engine]);

    const loadLocale = useCallback((doc: any) => {
        engine.loadLocale(doc);
    }, [engine]);

    return {
        activeLocale: engine.getActiveLocale(),
        availableLocales: engine.getAvailableLocales(),
        direction: engine.getLocaleDirection(),
        setLocale,
        loadLocale,
    };
}
