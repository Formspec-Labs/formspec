'use client';

/** @filedesc useForm — form-level reactive state (title, validity, submit). */
import { useMemo, useCallback } from 'react';
import { useFormspecContext } from './context';
import { useSignal } from './use-signal';

type SubmitMode = 'continuous' | 'submit';

export interface SubmitOptions {
    mode?: SubmitMode;
    id?: string;
    author?: { id: string; name?: string };
    subject?: { id: string; type?: string };
}

export interface UseFormResult {
    title: string;
    description: string;
    isValid: boolean;
    validationSummary: { errors: number; warnings: number; infos: number };
    submit(options?: SubmitOptions): any;
    getResponse(meta?: Record<string, any>): any;
}

function validationProfileForMode(mode: SubmitMode | undefined) {
    return mode === 'submit' ? 'on-submit' : 'live';
}

/**
 * Form-level state from FormViewModel.
 * Provides title, validity, and submit/response access.
 */
export function useForm(): UseFormResult {
    const { engine, touchAllFields } = useFormspecContext();

    const formVM = useMemo(() => engine.getFormVM(), [engine]);

    const title = useSignal(formVM.title);
    const description = useSignal(formVM.description);
    const isValid = useSignal(formVM.isValid);
    const validationSummary = useSignal(formVM.validationSummary);

    const submit = useCallback((options?: SubmitOptions) => {
        touchAllFields();
        const reportProfile = validationProfileForMode(options?.mode);
        const report = engine.getValidationReport({ profile: reportProfile });
        const response = engine.getResponse({
            profile: 'on-submit',
            id: options?.id,
            author: options?.author,
            subject: options?.subject,
        });
        return { response, validationReport: report };
    }, [engine, touchAllFields]);

    const getResponse = useCallback((meta?: Record<string, any>) => {
        return engine.getResponse(meta);
    }, [engine]);

    return {
        title,
        description,
        isValid,
        validationSummary,
        submit,
        getResponse,
    };
}
