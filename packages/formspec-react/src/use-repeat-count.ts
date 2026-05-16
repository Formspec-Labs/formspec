'use client';

/** @filedesc useRepeatCount — reactive subscription to a repeat group's instance count. */
import { useMemo } from 'react';
import { signal } from '@preact/signals-core';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';

/**
 * Subscribe to the repeat count for a given repeat path.
 * Returns 0 if the repeat signal doesn't exist yet.
 */
export function useRepeatCount(repeatPath: string): number {
    const { engine } = useFormspecContext();

    const countSignal = useMemo(() => {
        return engine.repeats[repeatPath] ?? signal(0);
    }, [engine, repeatPath]);

    return useSignal(countSignal);
}
