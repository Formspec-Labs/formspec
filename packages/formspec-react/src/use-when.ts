'use client';

/** @filedesc useWhen — reactive evaluation of a FEL `when` expression for conditional rendering. */
import { useMemo } from 'react';
import { computed } from '@preact/signals-core';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';

/**
 * Evaluate a FEL expression reactively and return its boolean result.
 * Used by the renderer for `when` conditional rendering on LayoutNodes.
 */
export function useWhen(expression: string, prefix?: string): boolean {
    const { engine } = useFormspecContext();

    // Wrap the compiled expression in a computed signal so useSignal can subscribe.
    const whenSignal = useMemo(() => {
        const exprFn = engine.compileExpression(expression, prefix || '');
        return computed(() => !!exprFn());
    }, [engine, expression, prefix]);

    return useSignal(whenSignal);
}
