'use client';

/** @filedesc useReplay — event sourcing and deterministic replay for form state. */
import { useCallback } from 'react';
import { useFormspecContext } from './context';

export type ReplayEvent =
    | { type: 'setValue'; path: string; value: any }
    | { type: 'addRepeatInstance'; path: string }
    | { type: 'removeRepeatInstance'; path: string; index: number }
    | { type: 'evaluateShape'; shapeId: string }
    | { type: 'getValidationReport'; mode?: 'continuous' | 'submit' }
    | { type: 'getResponse'; mode?: 'continuous' | 'submit' };

export interface ReplayApplyResult {
    ok: boolean;
    event: ReplayEvent;
    output?: any;
    error?: string;
}

export interface ReplayResult {
    applied: number;
    results: ReplayApplyResult[];
    errors: Array<{ index: number; event: ReplayEvent; error: string }>;
}

export interface UseReplayResult {
    /** Apply a single replay event. */
    applyEvent: (event: ReplayEvent) => ReplayApplyResult;
    /** Replay a sequence of events. */
    replay: (events: ReplayEvent[], options?: { stopOnError?: boolean }) => ReplayResult;
}

export function useReplay(): UseReplayResult {
    const { engine } = useFormspecContext();

    const applyEvent = useCallback((event: ReplayEvent): ReplayApplyResult => {
        return engine.applyReplayEvent(event);
    }, [engine]);

    const replayFn = useCallback((events: ReplayEvent[], options?: { stopOnError?: boolean }): ReplayResult => {
        return engine.replay(events, options);
    }, [engine]);

    return { applyEvent, replay: replayFn };
}
