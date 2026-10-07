'use client';

/** @filedesc Private provider feedback with one originating form-content outlet. */
import { createContext, useContext, useId, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
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

/** Transient DOM ownership; kept separate from semantic feedback and answer freshness. */
function captureFocusedOrigin(source: HTMLElement | null | undefined, onCancel: () => void) {
    if (!source || !source.ownerDocument.hasFocus() || source.ownerDocument.activeElement !== source) return undefined;
    const document = source.ownerDocument;
    const window = document.defaultView;
    let eligible = true;
    const cancel = () => { eligible = false; dispose(); onCancel(); };
    const focusIn = (event: FocusEvent) => { if (event.target !== source) cancel(); };
    // Removal can leave BODY focused without an explicit blur. A connected-source blur is intentional.
    const focusOut = () => { if (source.isConnected) cancel(); };
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Tab') cancel(); };
    const pointerDown = (event: Event) => { if (event.target !== source && !source.contains(event.target as Node)) cancel(); };
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    function dispose() {
        document.removeEventListener('focusin', focusIn, true);
        source!.removeEventListener('focusout', focusOut);
        document.removeEventListener('keydown', keyDown, true);
        document.removeEventListener('pointerdown', pointerDown, true);
        document.removeEventListener('visibilitychange', visibility);
        window?.removeEventListener('blur', cancel);
    }
    document.addEventListener('focusin', focusIn, true);
    source.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('pointerdown', pointerDown, true);
    document.addEventListener('visibilitychange', visibility);
    window?.addEventListener('blur', cancel);
    return {
        dispose,
        recover(target: HTMLElement) {
            dispose(); // Retire before our own focusin; never repeat on Locale or later branch changes.
            if (!eligible || source.isConnected || !target.isConnected || target.ownerDocument !== document
                || !document.hasFocus() || document.visibilityState === 'hidden'
                || (document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement)) return;
            for (let ancestor: HTMLElement | null = target; ancestor; ancestor = ancestor.parentElement) {
                const style = window?.getComputedStyle(ancestor);
                if (ancestor.tagName === 'DETAILS' && !ancestor.hasAttribute('open')
                    && !ancestor.querySelector('summary')?.contains(target)) return;
                if (ancestor.hidden || ancestor.hasAttribute('inert') || ancestor.getAttribute('aria-hidden') === 'true'
                    || style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return;
            }
            target.focus({ preventScroll: true });
        },
    };
}

/** No response, payload, findings, translated copy or saved flag enters this store. */
export function createActionFeedbackStore(engine: IFormEngine) {
    const state = signal<OwnedFeedback>(undefined);
    const outlets = new Set<string>();
    let active = false;
    let generation = 0;
    let token = 0;
    let epoch = 0;
    let fingerprint: string | undefined;
    let focusOrigin: ReturnType<typeof captureFocusedOrigin>;
    function retireFocus() { focusOrigin?.dispose(); focusOrigin = undefined; }
    function refresh() {
        const current = actionContentFingerprint(engine);
        if (current !== fingerprint || current === undefined) {
            epoch++;
            fingerprint = current;
            state.value = undefined;
            retireFocus();
        }
        return current !== undefined;
    }
    return {
        state,
        connect() {
            active = true;
            generation++;
            const stop = preactReactiveRuntime.effect(() => { refresh(); });
            return () => { active = false; generation++; stop(); state.value = undefined; retireFocus(); };
        },
        register(outlet: string) {
            outlets.add(outlet);
            return () => {
                outlets.delete(outlet);
                if (state.peek()?.ticket.outlet === outlet) { token++; state.value = undefined; retireFocus(); }
            };
        },
        start(outlet: string, intent: string | undefined, candidates: readonly string[], source?: HTMLElement | null): Ticket | undefined {
            retireFocus();
            const next = ++token;
            state.value = undefined;
            if (!active || !outlets.has(outlet) || !refresh()) return undefined;
            if (intent !== undefined && intent.length > 256) return undefined;
            if (candidates.length > 128 || candidates.some(anchor => typeof anchor !== 'string')
                || candidates.reduce((size, anchor) => size + anchor.length, 0) > 8192) return undefined;
            const anchors = Object.freeze((needTraceAttrs(candidates)['data-need-anchors'] ?? '').split(' ').filter(Boolean));
            const ticket = { token: next, generation, epoch, outlet };
            focusOrigin = captureFocusedOrigin(source, () => { focusOrigin = undefined; });
            state.value = { ticket, anchors, feedback: { phase: 'pending', intent } };
            return ticket;
        },
        recoverFocus(ticket: Ticket, target: HTMLElement) {
            if (!active || !refresh()) return;
            const owned = state.peek();
            if (!owned || owned.ticket !== ticket || owned.feedback.phase !== 'settled') return;
            const origin = focusOrigin;
            focusOrigin = undefined;
            if (owned.feedback.status === 'completed') origin?.recover(target);
            else origin?.dispose();
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
    const target = useRef<HTMLDivElement>(null);
    const owned = useSignal(store.state);
    const chrome = useChromeText();
    const current = owned?.ticket.outlet === id ? owned : undefined;
    useLayoutEffect(() => {
        if (current && target.current) store.recoverFocus(current.ticket, target.current);
    });
    return <div ref={target} tabIndex={-1} id={id} className="formspec-action-status" role="status" aria-live="polite" aria-atomic="true"
        {...needTraceAttrs(current?.anchors)}>
        {actionResultMessage(chrome, current?.feedback ?? { phase: 'idle' })}
    </div>;
}
