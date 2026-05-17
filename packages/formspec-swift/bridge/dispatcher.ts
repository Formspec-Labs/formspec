/** @filedesc JS bridge dispatcher — runs in WKWebView, translates EngineCommand JSON to FormEngine calls and posts EngineEvent batches back to Swift. */

import { createFormEngine, initFormspecEngine } from '@formspec-org/engine/render';
import { effect } from '@preact/signals-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InitCommand {
    type: 'initialize';
    definition: unknown;
    layoutPlan: unknown;
    component?: unknown;
    theme?: unknown;
    registry?: unknown[];
    locales?: Record<string, unknown>;
    defaultLocale?: string;
    runtimeContext?: { meta?: Record<string, unknown>; timeZone?: string; seed?: number };
}

interface SetValueCommand {
    type: 'setValue';
    path: string;
    value: unknown;
}

interface SetLocaleCommand {
    type: 'setLocale';
    languageCode: string;
}

interface SetResponseCommand {
    type: 'setResponse';
    response: unknown;
}

interface TouchFieldCommand {
    type: 'touchField';
    path: string;
}

interface AddRepeatInstanceCommand {
    type: 'addRepeatInstance';
    groupName: string;
}

interface RemoveRepeatInstanceCommand {
    type: 'removeRepeatInstance';
    groupName: string;
    index: number;
}

interface GetResponseCommand {
    type: 'getResponse';
}

interface GetValidationReportCommand {
    type: 'getValidationReport';
    mode: 'continuous' | 'submit';
}

type EngineCommand =
    | InitCommand
    | SetValueCommand
    | SetLocaleCommand
    | SetResponseCommand
    | TouchFieldCommand
    | AddRepeatInstanceCommand
    | RemoveRepeatInstanceCommand
    | GetResponseCommand
    | GetValidationReportCommand;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let engine: ReturnType<typeof createFormEngine> | null = null;
let activeEffectDisposers: Array<() => void> = [];

// ---------------------------------------------------------------------------
// Batched posting
// ---------------------------------------------------------------------------

const pendingEvents: unknown[] = [];
let flushScheduled = false;

function postEvent(event: unknown): void {
    pendingEvents.push(event);
    if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flush);
    }
}

function flush(): void {
    flushScheduled = false;
    if (pendingEvents.length === 0) return;
    const batch = pendingEvents.splice(0);
    const w = window as unknown as {
        webkit?: { messageHandlers?: { formspec?: { postMessage: (s: string) => void } } };
    };
    w.webkit?.messageHandlers?.formspec?.postMessage(JSON.stringify(batch));
}

// ---------------------------------------------------------------------------
// Effect management
// ---------------------------------------------------------------------------

function disposeEffects(): void {
    for (const dispose of activeEffectDisposers) {
        try { dispose(); } catch (_) { /* ignore */ }
    }
    activeEffectDisposers = [];
}

function installEffects(eng: ReturnType<typeof createFormEngine>): void {
    disposeEffects();

    // Field-level effects: one per path in engine.signals
    const paths = Object.keys(eng.signals);
    for (const path of paths) {
        const vm = eng.getFieldVM(path);
        if (!vm) continue;

        const dispose = effect(() => {
            const errors = vm.errors.value ?? [];
            postEvent({
                type: 'fieldStateChanged',
                path,
                changes: {
                    label: vm.label.value,
                    hint: vm.hint.value,
                    description: vm.description.value,
                    value: eng.signals[path]?.value ?? null,
                    required: vm.required.value,
                    visible: vm.visible.value,
                    readonly: vm.readonly.value,
                    errors: errors.map((e: { path: string; message: string; severity: string; constraintKind: string; code: string }) => ({
                        path: e.path,
                        message: e.message,
                        severity: e.severity,
                        constraintKind: e.constraintKind,
                        code: e.code,
                    })),
                    firstError: vm.firstError.value,
                    options: (vm.options.value ?? []).map((o: { value: string; label: string }) => ({
                        value: o.value,
                        label: o.label,
                    })),
                    optionsLoading: vm.optionsState.value?.loading ?? false,
                    optionsError: vm.optionsState.value?.error ?? null,
                },
            });
        });
        activeEffectDisposers.push(dispose);
    }

    // Form-level effect
    const formVM = eng.getFormVM();
    const formDispose = effect(() => {
        const summary = formVM.validationSummary.value;
        postEvent({
            type: 'formStateChanged',
            changes: {
                title: formVM.title.value,
                description: formVM.description.value,
                isValid: formVM.isValid.value,
                errors: summary.errors,
                warnings: summary.warnings,
                infos: summary.infos,
            },
        });
    });
    activeEffectDisposers.push(formDispose);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleInitialize(cmd: InitCommand): Promise<void> {
    try {
        await initFormspecEngine();

        const definition = cmd.definition as Parameters<typeof createFormEngine>[0];
        engine = createFormEngine(definition, {
            runtimeContext: cmd.runtimeContext as
                | NonNullable<Parameters<typeof createFormEngine>[1]>['runtimeContext']
                | undefined,
        });

        // Load locales
        if (cmd.locales) {
            for (const localeData of Object.values(cmd.locales)) {
                engine.loadLocale(localeData as Parameters<typeof engine.loadLocale>[0]);
            }
        }

        // Set default locale if provided
        if (cmd.defaultLocale) {
            engine.setLocale(cmd.defaultLocale);
        }

        installEffects(engine);
        postEvent({ type: 'engineReady' });
    } catch (err) {
        postEvent({ type: 'engineError', message: String(err) });
    }
}

function handleSetValue(cmd: SetValueCommand): void {
    if (!engine) return;
    engine.setValue(cmd.path, cmd.value ?? null);
}

function handleSetLocale(cmd: SetLocaleCommand): void {
    if (!engine) return;
    engine.setLocale(cmd.languageCode);
    // Re-install effects so locale-reactive labels are tracked
    installEffects(engine);
}

function handleSetResponse(cmd: SetResponseCommand): void {
    if (!engine) return;
    const response = cmd.response as Record<string, unknown> | null | undefined;
    if (!response || typeof response !== 'object') return;
    const data = response as Record<string, unknown>;
    for (const [path, value] of Object.entries(data)) {
        engine.setValue(path, value);
    }
}

// touchField is a Swift-side concept only — no-op in JS
function handleTouchField(_cmd: TouchFieldCommand): void {
    // intentional no-op
}

function handleAddRepeatInstance(cmd: AddRepeatInstanceCommand): void {
    if (!engine) return;
    const count = engine.addRepeatInstance(cmd.groupName);
    postEvent({ type: 'repeatChanged', groupName: cmd.groupName, count: count ?? 0 });
    // Re-install effects so new repeat instance signals are tracked
    installEffects(engine);
}

function handleRemoveRepeatInstance(cmd: RemoveRepeatInstanceCommand): void {
    if (!engine) return;
    engine.removeRepeatInstance(cmd.groupName, cmd.index);
    const repeatSignal = engine.repeats[cmd.groupName];
    const count = repeatSignal?.value ?? 0;
    postEvent({ type: 'repeatChanged', groupName: cmd.groupName, count });
    installEffects(engine);
}

function handleGetResponse(_cmd: GetResponseCommand): void {
    if (!engine) return;
    const response = engine.getResponse();
    postEvent({ type: 'responseResult', response });
}

function handleGetValidationReport(cmd: GetValidationReportCommand): void {
    if (!engine) return;
    const report = engine.getValidationReport({ mode: cmd.mode });
    postEvent({ type: 'validationReportResult', report });
}

// ---------------------------------------------------------------------------
// Global entry point called by Swift
// ---------------------------------------------------------------------------

(window as unknown as Record<string, unknown>).formspecCommand = function formspecCommand(jsonString: string): void {
    let cmd: EngineCommand;
    try {
        cmd = JSON.parse(jsonString) as EngineCommand;
    } catch (err) {
        postEvent({ type: 'engineError', message: `Failed to parse command: ${String(err)}` });
        return;
    }

    switch (cmd.type) {
        case 'initialize':
            handleInitialize(cmd).catch((err) => {
                postEvent({ type: 'engineError', message: String(err) });
            });
            break;
        case 'setValue':
            handleSetValue(cmd);
            break;
        case 'setLocale':
            handleSetLocale(cmd);
            break;
        case 'setResponse':
            handleSetResponse(cmd);
            break;
        case 'touchField':
            handleTouchField(cmd);
            break;
        case 'addRepeatInstance':
            handleAddRepeatInstance(cmd);
            break;
        case 'removeRepeatInstance':
            handleRemoveRepeatInstance(cmd);
            break;
        case 'getResponse':
            handleGetResponse(cmd);
            break;
        case 'getValidationReport':
            handleGetValidationReport(cmd);
            break;
        default:
            postEvent({ type: 'engineError', message: `Unknown command type: ${(cmd as { type: string }).type}` });
    }
};
