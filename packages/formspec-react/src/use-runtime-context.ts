'use client';

/** @filedesc useRuntimeContext — inject runtime context (now, locale, timezone, meta) into the engine. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';

export interface RuntimeContext {
    now?: (() => Date | string | number) | Date | string | number;
    locale?: string;
    timeZone?: string;
    seed?: string | number;
    meta?: Record<string, string | number | boolean>;
}

export interface UseRuntimeContextResult {
    /** Set runtime context on the engine. Merges with existing context. */
    setRuntimeContext: (context: RuntimeContext) => void;
}

export function useRuntimeContext(): UseRuntimeContextResult {
    const { engine } = useFormspecContext();

    const setRuntimeContext = useCallback((context: RuntimeContext) => {
        engine.setRuntimeContext(context);
    }, [engine]);

    return { setRuntimeContext };
}
