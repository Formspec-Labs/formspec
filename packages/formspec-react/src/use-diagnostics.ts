'use client';

/** @filedesc useDiagnostics — captures engine state snapshots for debugging and audit. */
import { useCallback } from 'react';
import type { ValidationProfile } from '@formspec-org/types';
import { useFormspecContext } from './context';

export interface UseDiagnosticsResult {
    /** Capture a snapshot of the current form state. */
    getSnapshot: (options?: { profile?: ValidationProfile }) => any;
}

export function useDiagnostics(): UseDiagnosticsResult {
    const { engine } = useFormspecContext();

    const getSnapshot = useCallback((options?: { profile?: ValidationProfile }) => {
        return engine.getDiagnosticsSnapshot(options);
    }, [engine]);

    return { getSnapshot };
}
