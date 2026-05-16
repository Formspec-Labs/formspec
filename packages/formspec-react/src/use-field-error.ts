'use client';

/** @filedesc useFieldError — granular hook for just the first error message. */
import { useMemo } from 'react';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';

/**
 * Granular field hook — only re-renders when the field's error state changes.
 * Returns the first error message string, or null if valid.
 */
export function useFieldError(path: string): string | null {
    const { engine } = useFormspecContext();

    const vm = useMemo(() => {
        const fieldVM = engine.getFieldVM(path);
        if (!fieldVM) throw new Error(`No FieldViewModel for path "${path}"`);
        return fieldVM;
    }, [engine, path]);

    return useSignal(vm.firstError);
}
