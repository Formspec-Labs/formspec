'use client';

/** @filedesc useDiagnostics — captures engine state snapshots for debugging and audit. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';

export interface UseDiagnosticsResult {
    /** Capture a snapshot of the current form state. */
    getSnapshot: (options?: { mode?: 'continuous' | 'submit' }) => any;
}

export function useDiagnostics(): UseDiagnosticsResult {
    const { engine } = useFormspecContext();

    const getSnapshot = useCallback((options?: { mode?: 'continuous' | 'submit' }) => {
        return engine.getDiagnosticsSnapshot(options);
    }, [engine]);

    return { getSnapshot };
}
