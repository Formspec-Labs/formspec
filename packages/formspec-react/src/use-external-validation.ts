'use client';

/** @filedesc useExternalValidation — inject/clear server-side validation results. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';

export interface ExternalValidationEntry {
    path: string;
    severity: string;
    code: string;
    message: string;
    source?: string;
}

export interface UseExternalValidationResult {
    inject: (results: ExternalValidationEntry[]) => void;
    clear: (path?: string) => void;
}

/**
 * Inject or clear server-side validation results on the engine.
 * Use after server-side validation to display errors from external sources.
 */
export function useExternalValidation(): UseExternalValidationResult {
    const { engine } = useFormspecContext();

    const inject = useCallback((results: ExternalValidationEntry[]) => {
        engine.injectExternalValidation?.(results);
    }, [engine]);

    const clear = useCallback((path?: string) => {
        engine.clearExternalValidation?.(path);
    }, [engine]);

    return { inject, clear };
}
