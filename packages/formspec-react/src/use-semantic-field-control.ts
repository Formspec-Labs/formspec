'use client';

/** @filedesc Opt-in registration for a field component that rendered a control. */

import { useEffect } from 'react';
import { useFormspecContext } from './context';
import type { UseFieldResult } from './use-field';

/**
 * Publish the exact set-value capability of a mounted field control.
 *
 * The shipped DefaultField calls this. A custom field component must call it
 * itself; the parent renderer does not assume that an override actually
 * rendered an editable control.
 */
export function useSemanticFieldControl(
    field: UseFieldResult,
    disabled: boolean,
): void {
    const {
        semanticControlScope,
        currentSemanticResponseBinding,
    } = useFormspecContext();

    useEffect(() => {
        if (!semanticControlScope) return;
        return semanticControlScope.registry.register({
            capability: 'set-item',
            renderInstanceId: semanticControlScope.renderInstanceId,
            responseId: semanticControlScope.responseId,
            control: {
                ...semanticControlScope.definitionArtifact,
                subjectKind: 'definition-item',
                subjectRef: field.path,
            },
            disabled: () => disabled,
            setItem: (value) => {
                field.setValue(value);
                const responseBinding = currentSemanticResponseBinding();
                if (!responseBinding) {
                    throw new Error('semantic Response binding is unavailable');
                }
                return responseBinding;
            },
        });
    }, [
        currentSemanticResponseBinding,
        disabled,
        field.path,
        field.setValue,
        semanticControlScope,
    ]);
}
