/** @filedesc Commit native select choices before host input rerenders and deduplicate change events. */
'use client';
import { useLayoutEffect, useRef, type SyntheticEvent } from 'react';

export function useNativeSelect(onValueChange?: (value: string) => void) {
    const ref = useRef<HTMLSelectElement>(null);
    const committed = useRef<string | undefined>(undefined);
    // React may render a different spelling from the engine's canonical value (1.50 vs 1.5).
    // The later change event reports the DOM value, so track what React actually selected.
    useLayoutEffect(() => { committed.current = ref.current?.value; });
    const commit = (event: SyntheticEvent<HTMLSelectElement>) => {
        const next = event.currentTarget.value;
        if (next !== committed.current) {
            committed.current = next;
            onValueChange?.(next);
        }
    };
    return { ref, onInput: commit, onChange: commit };
}
