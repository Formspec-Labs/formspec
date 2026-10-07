'use client';

/** @filedesc Private provider feedback with one originating form-content outlet. */
import { createContext, useContext, useId, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { signal } from '@preact/signals-core';
import { preactReactiveRuntime, type IFormEngine, type ResponseActionInvocationResult } from '@formspec-org/engine';
import type { ChromeStringKey } from '@formspec-org/layout';
import { actionContentFingerprint } from './action-feedback-freshness.js';
import { needTraceAttrs } from './projection-metadata.js';
import { useChromeText, type ChromeText } from './use-chrome-text.js';
import { useSignal } from './use-signal.js';

type Status = ResponseActionInvocationResult<unknown>['status'];
export type ActionFeedback =
    | { phase: 'idle' }
    | { phase: 'pending'; intent?: string }
    | { phase: 'settled'; status: Status; intent: string | undefined };
const STATUS_KEYS = {
    completed: 'action.completed', blocked: 'action.blocked', failed: 'action.failed',
    deferred: 'action.deferred', unresolved: 'action.unresolved',
} as const satisfies Record<Status, ChromeStringKey>;

export function actionResultMessage(chrome: ChromeText, feedback: ActionFeedback): string {
    if (feedback.phase === 'idle') return '';
    if (feedback.phase === 'pending') return chrome('action.inProgress');
    if (feedback.intent === 'save-draft' && (feedback.status === 'failed' || feedback.status === 'unresolved')) {
        return chrome('draft.saveUnconfirmed');
    }
    return chrome('action.status', { status: chrome(STATUS_KEYS[feedback.status]) });
}

interface Ticket { token: number; generation: number; epoch: number; outlet: string }
type OwnedFeedback = { ticket: Ticket; anchors: readonly string[]; feedback: ActionFeedback } | undefined;

/** No response, payload, findings, translated copy or saved flag enters this store. */
export function createActionFeedbackStore(engine: IFormEngine) {
    const state = signal<OwnedFeedback>(undefined);
    const outlets = new Set<string>();
    let active = false;
    let generation = 0;
    let token = 0;
    let epoch = 0;
    let fingerprint: string | undefined;
    function refresh() {
        const current = actionContentFingerprint(engine);
        if (current !== fingerprint || current === undefined) {
            epoch++;
            fingerprint = current;
            state.value = undefined;
        }
        return current !== undefined;
    }
    return {
        state,
        connect() {
            active = true;
            generation++;
            const stop = preactReactiveRuntime.effect(() => { refresh(); });
            return () => { active = false; generation++; stop(); state.value = undefined; };
        },
        register(outlet: string) {
            outlets.add(outlet);
            return () => {
                outlets.delete(outlet);
                if (state.peek()?.ticket.outlet === outlet) { token++; state.value = undefined; }
            };
        },
        start(outlet: string, intent: string | undefined, candidates: readonly string[]): Ticket | undefined {
            const next = ++token;
            state.value = undefined;
            if (!active || !outlets.has(outlet) || !refresh()) return undefined;
            if (intent !== undefined && intent.length > 256) return undefined;
            if (candidates.length > 128 || candidates.some(anchor => typeof anchor !== 'string')
                || candidates.reduce((size, anchor) => size + anchor.length, 0) > 8192) return undefined;
            const anchors = Object.freeze((needTraceAttrs(candidates)['data-need-anchors'] ?? '').split(' ').filter(Boolean));
            const ticket = { token: next, generation, epoch, outlet };
            state.value = { ticket, anchors, feedback: { phase: 'pending', intent } };
            return ticket;
        },
        settle(ticket: Ticket | undefined, status: Status) {
            if (!ticket || !active || !refresh()) return;
            const owned = state.peek();
            if (!owned || ticket.token !== token || ticket.generation !== generation
                || ticket.epoch !== epoch || !outlets.has(ticket.outlet)) return;
            state.value = { ...owned, feedback: { phase: 'settled', status,
                intent: owned.feedback.phase === 'idle' ? undefined : owned.feedback.intent } };
        },
    };
}

type FeedbackStore = ReturnType<typeof createActionFeedbackStore>;
const StoreContext = createContext<FeedbackStore | undefined>(undefined);
const OutletContext = createContext<{ id: string; store: FeedbackStore } | undefined>(undefined);

export function ActionFeedbackProvider({ engine, responseId, renderInstanceId, children }: {
    engine: IFormEngine; responseId?: string; renderInstanceId?: string; children: ReactNode;
}) {
    const store = useMemo(() => createActionFeedbackStore(engine), [engine, responseId, renderInstanceId]);
    useLayoutEffect(() => store.connect(), [store]);
    return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useActionFeedbackOutlet() { return useContext(OutletContext); }

/** The outlet lives outside recursive When branches and announces only its origin. */
export function ActionFeedbackContent({ children }: { children: ReactNode }) {
    const store = useContext(StoreContext);
    const id = useId();
    useLayoutEffect(() => store?.register(id), [store, id]);
    const outlet = useMemo(() => store ? { id, store } : undefined, [id, store]);
    return <OutletContext.Provider value={outlet}>
        {children}
        {store && <ActionFeedbackStatus store={store} id={id} />}
    </OutletContext.Provider>;
}

function ActionFeedbackStatus({ store, id }: { store: FeedbackStore; id: string }) {
    const owned = useSignal(store.state);
    const chrome = useChromeText();
    const current = owned?.ticket.outlet === id ? owned : undefined;
    return <div id={id} className="formspec-action-status" role="status" aria-live="polite" aria-atomic="true"
        {...needTraceAttrs(current?.anchors)}>
        {actionResultMessage(chrome, current?.feedback ?? { phase: 'idle' })}
    </div>;
}
