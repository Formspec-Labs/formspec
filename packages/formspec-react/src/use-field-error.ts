'use client';

/** @filedesc useFieldError and shared Shape-error readers for field and group targets. */
import { useContext, useMemo } from 'react';
import { computed, signal as createSignal } from '@preact/signals-core';
import type { IFormEngine, ResolvedValidationResult } from '@formspec-org/engine';
import { FormspecContext, useFormspecContext } from './context';
import { useSignal } from './use-signal';

const NO_ERRORS = createSignal<ResolvedValidationResult[]>([]);

/** Read live error-severity Shape validation results targeting an exact field or group path. */
export function readPathShapeErrors(engine: IFormEngine, path: string): ResolvedValidationResult[] {
    if (!path || !engine.shapeResults) return [];
    engine.localeSignal?.value;
    const out: ResolvedValidationResult[] = [];
    const seen = new Set<string>();
    for (const signalRef of Object.values(engine.shapeResults)) {
        for (const result of signalRef.value) {
            if (result.severity !== 'error') continue;
            if (result.constraintKind === 'explanation') continue;
            if (result.path !== path) continue;
            const message = (
                typeof engine.resolveValidationMessage === 'function'
                    ? engine.resolveValidationMessage(result)
                    : result.message
            ) ?? result.message ?? 'Validation error';
            const code = result.code ?? 'SHAPE_FAILED';
            const dedupeKey = `${code}|${message}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            out.push({
                path: result.path,
                severity: 'error',
                constraintKind: result.constraintKind ?? 'shape',
                code,
                message,
            });
        }
    }
    return out;
}

/** Reactive hook returning active error-severity Shape results targeting a group or repeat path. */
export function usePathShapeErrors(path: string | undefined): ResolvedValidationResult[] {
    const ctx = useContext(FormspecContext);
    const engine = ctx?.engine;
    const errorsSignal = useMemo(
        () => (engine && path ? computed(() => readPathShapeErrors(engine, path)) : NO_ERRORS),
        [engine, path],
    );
    return useSignal(errorsSignal);
}

/**
 * Granular field hook — only re-renders when the field's error state changes.
 * Returns the first error message string (including Shape errors targeting this field), or null if valid.
 */
export function useFieldError(path: string): string | null {
    const { engine } = useFormspecContext();

    const firstError = useMemo(() => {
        const fieldVM = engine.getFieldVM(path);
        if (!fieldVM) throw new Error(`No FieldViewModel for path "${path}"`);
        return computed(() => {
            const bindError = fieldVM.firstError.value;
            if (bindError) return bindError;
            return readPathShapeErrors(engine, fieldVM.instancePath)[0]?.message ?? null;
        });
    }, [engine, path]);

    return useSignal(firstError);
}
