/** @filedesc Shared lossless currency display formatting, input normalization, and draft-preserving edit hook for MoneyInput and currency-prefixed NumberInput. */
'use client';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

const CURRENCY_PREFIX_TO_CODE: Record<string, string> = {
    '$': 'USD',
    'US$': 'USD',
    'CA$': 'CAD',
    'A$': 'AUD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    '₹': 'INR',
    '₩': 'KRW',
    'CHF': 'CHF',
};

/** Resolve a currency-symbol prefix adornment (`$`, `€`, `£`, `¥`, etc.) to its ISO 4217 code, or null. */
export function currencyCodeFromPrefix(prefix?: string): string | null {
    if (!prefix) return null;
    return CURRENCY_PREFIX_TO_CODE[prefix.trim()] ?? null;
}

/** ISO 4217 minor-unit decimal places (e.g. 2 for USD/EUR/GBP, 0 for JPY). */
export function currencyMinFractionDigits(code: string): number {
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: code.toUpperCase(),
        }).resolvedOptions().minimumFractionDigits ?? 2;
    } catch {
        return 2;
    }
}

/**
 * Format an exact decimal string with thousands commas and consistent currency decimals without
 * converting through IEEE-754 floats (preserves arbitrary-precision fractional digits verbatim).
 */
export function formatMoneyDisplay(raw: string, currencyCode: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return raw;
    const match = trimmed.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
    if (!match) return raw;
    const [, sign, intDigits, fracDigits = ''] = match;
    const groupedInt = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const minFrac = currencyMinFractionDigits(currencyCode);
    if (fracDigits.length === 0 && minFrac === 0) {
        return `${sign}${groupedInt}`;
    }
    const paddedFrac = fracDigits.length < minFrac
        ? fracDigits.padEnd(minFrac, '0')
        : fracDigits;
    return `${sign}${groupedInt}.${paddedFrac}`;
}

/** Strip thousands commas (and optional pasted currency symbol/whitespace) when the entry is numeric. */
export function normalizeMoneyInput(raw: string, currencySymbol: string): string {
    if (raw === '') return '';
    let candidate = raw.trim();
    if (currencySymbol && candidate.startsWith(currencySymbol)) {
        candidate = candidate.slice(currencySymbol.length).trim();
    }
    const withoutCommas = candidate.replace(/,/g, '');
    if (/^[+-]?(?:\d+\.?\d*|\.\d*)$/.test(withoutCommas)) {
        return withoutCommas;
    }
    return raw;
}

/**
 * Manage currency input display & local draft text while focused so intermediate keystrokes
 * (`1234.`, `100.0`, `.5`, `-`) are never eaten by engine numeric canonicalization, while
 * blurred and read-only states display comma-formatted currency figures.
 */
export function useCurrencyDraft({
    rawStr,
    currencyCode,
    currencySymbol,
    isReadonly,
    onCommit,
    onBlur,
}: {
    rawStr: string;
    currencyCode: string;
    currencySymbol: string;
    isReadonly: boolean;
    onCommit: (normalized: string | null) => void;
    onBlur: () => void;
}) {
    const focusedRef = useRef(false);
    const [isFocused, setIsFocused] = useState(false);
    const [draftText, setDraftText] = useState<string | null>(null);
    const [unfocusedEdit, setUnfocusedEdit] = useState(false);

    useEffect(() => {
        if (isReadonly) {
            focusedRef.current = false;
            setIsFocused(false);
            setDraftText(null);
            setUnfocusedEdit(false);
        }
    }, [isReadonly]);

    const displayValue = (!isReadonly && isFocused && draftText !== null)
        ? draftText
        : (!isReadonly && unfocusedEdit)
            ? rawStr
            : formatMoneyDisplay(rawStr, currencyCode);

    const handleFocus = () => {
        if (isReadonly) return;
        focusedRef.current = true;
        setIsFocused(true);
        setUnfocusedEdit(false);
        setDraftText(rawStr);
    };

    const handleBlur = () => {
        focusedRef.current = false;
        setIsFocused(false);
        setDraftText(null);
        setUnfocusedEdit(false);
        onBlur();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isReadonly) return;
        const typed = e.target.value;
        const activeInDom = typeof document !== 'undefined' && document.activeElement === e.currentTarget;
        if (focusedRef.current || activeInDom) {
            focusedRef.current = true;
            setIsFocused(true);
            setUnfocusedEdit(false);
            setDraftText(typed);
        } else {
            setUnfocusedEdit(true);
        }
        const normalized = normalizeMoneyInput(typed, currencySymbol);
        onCommit(normalized === '' ? null : normalized);
    };

    return { displayValue, handleFocus, handleBlur, handleChange };
}
