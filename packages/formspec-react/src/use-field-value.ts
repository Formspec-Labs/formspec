'use client';

/** @filedesc useFieldValue — granular hook for just value + setValue. */
import { useMemo } from 'react';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';

export interface UseFieldValueResult {
    value: any;
    setValue(value: any): void;
}

/**
 * Granular field hook — only re-renders when the field's value changes.
 * Use this when you don't need label/error/required state.
 */
export function useFieldValue(path: string): UseFieldValueResult {
    const { engine, advanceSemanticResponseRevision } = useFormspecContext();

    const vm = useMemo(() => {
        const fieldVM = engine.getFieldVM(path);
        if (!fieldVM) throw new Error(`No FieldViewModel for path "${path}"`);
        return fieldVM;
    }, [engine, path]);

    const value = useSignal(vm.value);
    const setValue = useMemo(
        () => (nextValue: any) => {
            vm.setValue(nextValue);
            advanceSemanticResponseRevision();
        },
        [advanceSemanticResponseRevision, vm],
    );

    return { value, setValue };
}
