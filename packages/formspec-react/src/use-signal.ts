'use client';

/** @filedesc Generic Preact-signal → React bridge via useSyncExternalStore. */
import { useSyncExternalStore, useRef, useCallback } from 'react';
import { effect } from '@preact/signals-core';
import type { ReadonlyEngineSignal } from '@formspec-org/engine';

/**
 * Subscribe to a Preact `ReadonlyEngineSignal` from React.
 *
 * Uses `useSyncExternalStore` for tear-free reads.
 * The `effect()` from `@preact/signals-core` auto-tracks signal
 * dependencies, so the React callback fires exactly when the
 * signal's value changes.
 */
export function useSignal<T>(signal: ReadonlyEngineSignal<T>): T {
    const signalRef = useRef(signal);
    signalRef.current = signal;

    const subscribe = useCallback(
        (onStoreChange: () => void) => {
            return effect(() => {
                signalRef.current.value; // track the signal
                onStoreChange();
            });
        },
        [], // signalRef is stable — no deps needed
    );

    const getSnapshot = useCallback(
        () => signalRef.current.value as T,
        [],
    );

    return useSyncExternalStore<T>(subscribe, getSnapshot, getSnapshot);
}
