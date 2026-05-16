'use client';

/** @filedesc useSubmitPending — tracks async submit state to prevent double-submission. */
import { useState, useCallback, useMemo } from 'react';

export interface UseSubmitPendingResult {
    /** Whether a submit is currently in progress. */
    pending: boolean;
    /** Set pending state. */
    setPending: (pending: boolean) => void;
    /** Wrap an async submit handler — sets pending=true before, pending=false after. */
    wrapSubmit: <T>(fn: () => Promise<T>) => Promise<T>;
}

export function useSubmitPending(): UseSubmitPendingResult {
    const [pending, setPendingRaw] = useState(false);

    const setPending = useCallback((value: boolean) => {
        setPendingRaw(value);
    }, []);

    const wrapSubmit = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
        setPendingRaw(true);
        try {
            return await fn();
        } finally {
            setPendingRaw(false);
        }
    }, []);

    return useMemo(() => ({ pending, setPending, wrapSubmit }), [pending, setPending, wrapSubmit]);
}
