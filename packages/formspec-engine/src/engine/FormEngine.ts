/** @filedesc Reactive FormEngine: field signals, WASM-backed FEL evaluation, validation, and response assembly. */

import type {
    FormDefinition,
    FormInstance,
    FormItem,
    FormVariable,
    OptionEntry,
    ValidationReport,
    ValidationResult,
} from '@formspec-org/types';
import { diffEvalResults, type EvalResult, type EvalValidation } from '../diff.js';
import { interpolateMessage } from '../interpolate-message.js';
import type {
    AuthoredSignatureInput,
    EngineReplayApplyResult,
    EngineReplayEvent,
    EngineReplayResult,
    FormEngineDiagnosticsSnapshot,
    FormEngineRuntimeContext,
    IFormEngine,
    PinnedResponseReference,
    RegistryEntry,
    RemoteOptionsState,
} from '../interfaces.js';
import { preactReactiveRuntime } from '../reactivity/preact-runtime.js';
import type { EngineReactiveRuntime, EngineSignal, ReadonlyEngineSignal } from '../reactivity/types.js';
import { LocaleStore, type LocaleDocument } from '../locale.js';
import { createFieldViewModel, type FieldViewModel } from '../field-view-model.js';
import { createFormViewModel, type FormViewModel } from '../form-view-model.js';
import {
    wasmEvaluateDefinition,
    wasmEvalFELWithContext,
} from '../wasm-bridge-runtime.js';
import {
    resolveOptionSetsOnDefinition,
    validateCalculateBindCycles,
    validateVariableDefinitionCycles,
} from './definition-setup.js';
import { validateInstanceDataAgainstSchema } from './instance-schema.js';
import {
    patchDeltaSignalsFromWasm,
    patchErrorSignalsFromWasm,
    patchValueSignalsFromWasm,
} from './reactive-patches.js';
import {
    applyRepeatGroupTreeSnapshot,
    clearRepeatIndexedSubtree,
    snapshotRepeatGroupTree,
} from './repeat-ops.js';
import {
    buildFormspecResponseEnvelope,
    buildValidationReportEnvelope,
    collectSubmitModeShapeValidationResults,
    migrateResponseData,
    resolvePinnedDefinition,
} from './response-assembly.js';
import {
    buildWasmFelExpressionContext,
    mergeWasmEvalWithExternalValidations,
    normalizeExpressionForWasmEvaluation,
    visibleScopedVariableValues,
    wasmEvaluateDefinitionPayload,
} from './wasm-fel.js';
import type { EngineBindConfig } from './helpers.js';
import {
    appendPath,
    cloneValue,
    coerceFieldValue,
    coerceInitialValue,
    deepEqual,
    emptyValueForItem,
    extractInlineBind,
    getAncestorBasePaths,
    getNestedValue,
    getScopeAncestors,
    isEmptyValue,
    makeValidationResult,
    normalizeRemoteOptions,
    parseInstanceTarget,
    resolveNowProvider,
    safeEvaluateExpression,
    setNestedPathValue,
    setResponsePathValue,
    splitIndexedPath,
    toBasePath,
    toValidationResult,
} from './helpers.js';
export class FormEngine implements IFormEngine {
    public static instanceSourceCache = new Map<string, any>();

    public readonly definition: FormDefinition;
    public readonly signals: Record<string, EngineSignal<any>> = {};
    public readonly relevantSignals: Record<string, EngineSignal<boolean>> = {};
    public readonly requiredSignals: Record<string, EngineSignal<boolean>> = {};
    public readonly readonlySignals: Record<string, EngineSignal<boolean>> = {};
    public readonly errorSignals: Record<string, EngineSignal<string | null>> = {};
    public readonly validationResults: Record<string, EngineSignal<ValidationResult[]>> = {};
    public readonly shapeResults: Record<string, EngineSignal<ValidationResult[]>> = {};
    public readonly repeats: Record<string, EngineSignal<number>> = {};
    public readonly optionSignals: Record<string, EngineSignal<OptionEntry[]>> = {};
    public readonly optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>> = {};
    public readonly variableSignals: Record<string, EngineSignal<any>> = {};
    public readonly instanceData: Record<string, any> = {};
    public readonly instanceVersion: EngineSignal<number>;
    public readonly structureVersion: EngineSignal<number>;
    public readonly localeSignal: ReadonlyEngineSignal<number>;

    private readonly _rx: EngineReactiveRuntime;
    private readonly _evaluationVersion: EngineSignal<number>;
    private readonly _bindConfigs: Record<string, EngineBindConfig> = {};
    private readonly _fieldItems = new Map<string, FormItem>();
    private readonly _groupItems = new Map<string, FormItem>();
    private readonly _shapeTiming = new Map<string, 'continuous' | 'submit' | 'demand'>();
    private readonly _instanceCalculateBinds: EngineBindConfig[] = [];
    private readonly _displaySignalPaths = new Set<string>();
    private readonly _prePopulateReadonly = new Set<string>();
    private readonly _calculatedFields = new Set<string>();
    private readonly _registryEntries = new Map<string, RegistryEntry>();
    private _registryDocuments: unknown[] = [];
    private readonly _remoteOptionsTasks: Array<Promise<void>> = [];
    private readonly _instanceSourceTasks: Array<Promise<void>> = [];
    private readonly _variableDefs: FormVariable[];
    private readonly _variableSignalKeys = new Map<string, string[]>();
    private readonly _externalValidation: ValidationResult[] = [];

    private readonly _localeStore: LocaleStore;
    private readonly _fieldViewModels: Record<string, FieldViewModel> = {};
    private _formViewModel!: FormViewModel;
    private readonly _labelContextSignal: EngineSignal<string | null>;

    private _data: Record<string, any> = {};
    private _previousEvalResult: EvalResult | null = null;
    private _fullResult: EvalResult | null = null;
    private _labelContext: string | null = null;
    private _runtimeContext: {
        nowProvider: () => Date;
        locale?: string;
        timeZone?: string;
        seed?: string | number;
        meta?: Record<string, string | number | boolean>;
    } = {
        nowProvider: () => new Date(),
    };

    public constructor(
        definition: FormDefinition,
        runtimeContext?: FormEngineRuntimeContext,
        registryEntries?: RegistryEntry[],
        reactiveRuntime: EngineReactiveRuntime = preactReactiveRuntime,
    ) {
        this._rx = reactiveRuntime;
        this.instanceVersion = this._rx.signal(0);
        this.structureVersion = this._rx.signal(0);
        this._evaluationVersion = this._rx.signal(0);
        this._labelContextSignal = this._rx.signal(null);
        this.definition = cloneValue(definition);

        // Locale store — direction mode from formPresentation.direction or 'ltr'
        const directionMode = definition.formPresentation?.direction ?? 'ltr';
        this._localeStore = new LocaleStore(this._rx, directionMode);
        this.localeSignal = this._localeStore.version;
        this._variableDefs = [...(this.definition.variables ?? [])];

        if (runtimeContext) {
            this.setRuntimeContext(runtimeContext);
        }
        if (registryEntries) {
            for (const entry of registryEntries) {
                if (entry?.name) {
                    this._registryEntries.set(entry.name, entry);
                }
            }
            this._registryDocuments = [{ entries: registryEntries }];
        }

        this.definition = resolveOptionSetsOnDefinition(this.definition);
        this.initializeOptionSignals();
        this.initializeInstances();
        this.initializeBindConfigs(this.definition.items);
        this.collectInstanceCalculateBinds();
        this.validateInstanceCalculateTargets();
        validateVariableDefinitionCycles(this._variableDefs);
        validateCalculateBindCycles(this._bindConfigs);
        this.registerItems(this.definition.items);
        this.initializeRemoteOptions();
        this._evaluate();

        // Create form-level view model (after first evaluate so validation is available)
        this._formViewModel = createFormViewModel({
            rx: this._rx,
            localeStore: this._localeStore,
            getDefinitionTitle: () => this.definition.title ?? '',
            getDefinitionDescription: () => this.definition.description ?? '',
            getPageTitle: () => undefined,
            getPageDescription: () => undefined,
            evalFEL: (expr) => wasmEvalFELWithContext(expr, this._buildLocaleFELContext()),
            getValidationCounts: () => {
                const report = this.getValidationReport();
                return {
                    errors: report.counts?.error ?? 0,
                    warnings: report.counts?.warning ?? 0,
                    infos: report.counts?.info ?? 0,
                };
            },
            getIsValid: () => this.getValidationReport().valid,
        });
    }

    public static resolvePinnedDefinition<T extends { url?: string; version?: string }>(
        response: PinnedResponseReference,
        definitions: T[],
    ): T {
        return resolvePinnedDefinition(response, definitions);
    }

    public get formPresentation(): FormDefinition['formPresentation'] {
        return this.definition.formPresentation;
    }

    public setRuntimeContext(context: FormEngineRuntimeContext = {}): void {
        if (Object.prototype.hasOwnProperty.call(context, 'now')) {
            this._runtimeContext.nowProvider = resolveNowProvider(context.now);
        }
        if (Object.prototype.hasOwnProperty.call(context, 'locale') && context.locale) {
            this._runtimeContext.locale = context.locale;
            this._localeStore.setLocale(context.locale);
        }
        if (Object.prototype.hasOwnProperty.call(context, 'timeZone')) {
            this._runtimeContext.timeZone = context.timeZone;
        }
        if (Object.prototype.hasOwnProperty.call(context, 'seed')) {
            this._runtimeContext.seed = context.seed;
        }
        if (Object.prototype.hasOwnProperty.call(context, 'meta')) {
            this._runtimeContext.meta = context.meta;
        }
        if (this._fullResult) {
            this._evaluate();
        }
    }

    public getOptions(path: string): OptionEntry[] {
        return this.optionSignals[toBasePath(path)]?.value ?? [];
    }

    public getOptionsSignal(path: string): EngineSignal<OptionEntry[]> | undefined {
        return this.optionSignals[toBasePath(path)];
    }

    public getOptionsState(path: string): RemoteOptionsState {
        return this.optionStateSignals[toBasePath(path)]?.value ?? { loading: false, error: null };
    }

    public getOptionsStateSignal(path: string): EngineSignal<RemoteOptionsState> | undefined {
        return this.optionStateSignals[toBasePath(path)];
    }

    public async waitForRemoteOptions(): Promise<void> {
        await Promise.allSettled(this._remoteOptionsTasks);
    }

    public async waitForInstanceSources(): Promise<void> {
        await Promise.allSettled(this._instanceSourceTasks);
    }

    public setInstanceValue(name: string, path: string | undefined, value: any): void {
        this.writeInstanceValue(name, path, value);
        this._evaluate();
    }

    public getInstanceData(name: string, path?: string): any {
        const data = this.instanceData[name];
        if (data === undefined) {
            return undefined;
        }
        return path ? getNestedValue(data, path) : data;
    }

    public getDisabledDisplay(path: string): 'hidden' | 'protected' {
        return this._bindConfigs[toBasePath(path)]?.disabledDisplay ?? 'hidden';
    }

    public getVariableValue(name: string, scopePath: string): any {
        const visible = visibleScopedVariableValues(scopePath, this._variableDefs, this.variableSignals);
        return visible[name];
    }

    public addRepeatInstance(itemName: string): number | undefined {
        const path = this.resolveRepeatPath(itemName);
        const item = this._groupItems.get(path);
        if (!item?.repeatable) {
            return undefined;
        }
        const index = this.repeats[path]?.value ?? 0;
        this._rx.batch(() => {
            this.repeats[path].value = index + 1;
            this.registerItemChildren(item.children ?? [], `${path}[${index}]`);
            this.structureVersion.value += 1;
        });
        this._evaluate();
        return index;
    }

    public removeRepeatInstance(itemName: string, index: number): void {
        const path = this.resolveRepeatPath(itemName);
        const item = this._groupItems.get(path);
        const count = this.repeats[path]?.value ?? 0;
        if (!item?.repeatable || index < 0 || index >= count) {
            return;
        }

        const rows: Record<string, unknown>[] = [];
        for (let current = 0; current < count; current += 1) {
            rows.push(
                snapshotRepeatGroupTree(
                    item.children ?? [],
                    `${path}[${current}]`,
                    (fieldPath) => cloneValue(this.signals[fieldPath]?.value),
                    (repeatPath) => this.repeats[repeatPath]?.value ?? 0,
                ),
            );
        }
        rows.splice(index, 1);

        this._rx.batch(() => {
            this.clearRepeatSubtree(path);
            this.repeats[path].value = rows.length;
            for (let current = 0; current < rows.length; current += 1) {
                this.registerItemChildren(item.children ?? [], `${path}[${current}]`);
                applyRepeatGroupTreeSnapshot(
                    item.children ?? [],
                    `${path}[${current}]`,
                    rows[current],
                    (fieldPath, value) => {
                        const v = cloneValue(value);
                        this._data[fieldPath] = v;
                        if (this.signals[fieldPath]) {
                            this.signals[fieldPath].value = v;
                        }
                    },
                );
            }
            this.structureVersion.value += 1;
        });

        this._evaluate();
    }

    public compileExpression(expression: string, currentItemName = ''): () => any {
        return () => {
            this._evaluationVersion.value;
            this.instanceVersion.value;
            this.structureVersion.value;
            // compileExpression is a public API — propagate errors (unlike internal evaluation).
            return wasmEvalFELWithContext(
                this.normalizeExpressionForWasm(expression, currentItemName),
                buildWasmFelExpressionContext({
                    currentItemPath: currentItemName,
                    data: this._data,
                    fullResult: this._fullResult,
                    fieldSignals: this.signals,
                    validationResults: this.validationResults,
                    relevantSignals: this.relevantSignals,
                    readonlySignals: this.readonlySignals,
                    requiredSignals: this.requiredSignals,
                    repeats: this.repeats,
                    bindConfigs: this._bindConfigs,
                    fieldDataTypes: this.fieldDataTypesSnapshot(),
                    variableDefs: this._variableDefs,
                    variableSignals: this.variableSignals,
                    instanceData: this.instanceData,
                    nowIso: this.nowISO(),
                    locale: this._runtimeContext.locale,
                    meta: this._runtimeContext.meta,
                }),
            );
        };
    }

    public setValue(name: string, value: any): void {
        if (typeof name !== 'string') {
            throw new TypeError('setValue path cannot be null');
        }

        const instanceTarget = parseInstanceTarget(name);
        if (instanceTarget) {
            this.writeInstanceValue(instanceTarget.instanceName, instanceTarget.instancePath, value);
            this._evaluate();
            return;
        }

        const basePath = toBasePath(name);
        if (this._calculatedFields.has(basePath)) {
            return;
        }

        const item = this._fieldItems.get(basePath);
        if (!item) {
            return;
        }

        const bind = this._bindConfigs[basePath];
        const nextValue = coerceFieldValue(item, bind, this.definition, value);
        this._data[name] = cloneValue(nextValue);
        this._evaluate();
    }

    public getValidationReport(options?: { mode?: 'continuous' | 'submit' }): ValidationReport {
        const mode = options?.mode ?? 'continuous';
        const results: ValidationResult[] = [];

        for (const [path, signalRef] of Object.entries(this.validationResults)) {
            if (this.isPathRelevant(path)) {
                results.push(...signalRef.value);
            }
        }

        for (const signalRef of Object.values(this.shapeResults)) {
            results.push(...signalRef.value);
        }

        if (mode === 'submit') {
            const submitResult = this.evaluateResultForTrigger('submit');
            results.push(...collectSubmitModeShapeValidationResults(submitResult, this._shapeTiming));
        }

        return buildValidationReportEnvelope(
            results,
            this.nowISO(),
            this.definition.url,
            this.definition.version,
        );
    }

    public evaluateShape(shapeId: string): ValidationResult[] {
        const timing = this._shapeTiming.get(shapeId) ?? 'continuous';
        if (timing === 'demand') {
            return this.evaluateResultForTrigger('demand').validations
                .filter((result) => result.shapeId === shapeId)
                .map(toValidationResult);
        }
        if (!this._fullResult) {
            this._evaluate();
        }
        return this._fullResult?.validations
            .filter((result) => result.shapeId === shapeId)
            .map(toValidationResult) ?? [];
    }

    public isPathRelevant(path: string): boolean {
        if (!path) {
            return true;
        }
        const segments = splitIndexedPath(path);
        let current = '';
        for (const segment of segments) {
            current = current ? appendPath(current, segment) : segment;
            if (this.relevantSignals[current] && !this.relevantSignals[current].value) {
                return false;
            }
        }
        return true;
    }

    public getFieldPaths(): string[] {
        return Object.keys(this._fieldViewModels).sort();
    }

    public getProgress(): import('../interfaces.js').FormProgress {
        let total = 0;
        let filled = 0;
        let valid = 0;
        let required = 0;
        let requiredFilled = 0;

        for (const path of this.getFieldPaths()) {
            if (!this.isPathRelevant(path)) {
                continue;
            }
            total += 1;
            const fieldFilled = !isEmptyValue(this.signals[path]?.value);
            const fieldValid = !(this.validationResults[path]?.value ?? []).some(
                (result) => result.severity === 'error',
            );
            if (fieldFilled) {
                filled += 1;
            }
            if (fieldValid) {
                valid += 1;
            }
            if (this.requiredSignals[path]?.value) {
                required += 1;
                if (fieldFilled) {
                    requiredFilled += 1;
                }
            }
        }

        return {
            total,
            filled,
            valid,
            required,
            requiredFilled,
            complete: required === requiredFilled && this.getValidationReport().valid,
        };
    }

    public getResponse(meta?: {
        id?: string;
        author?: { id: string; name?: string };
        subject?: { id: string; type?: string };
        authoredSignatures?: AuthoredSignatureInput[];
        mode?: 'continuous' | 'submit';
    }): any {
        const data: Record<string, any> = {};
        const mode = meta?.mode ?? 'continuous';
        const defaultBehavior = this.definition.nonRelevantBehavior ?? 'remove';

        for (const [path, signalRef] of Object.entries(this.signals)) {
            if (this._displaySignalPaths.has(path)) {
                continue;
            }

            const relevant = this.isPathRelevant(path);
            let behavior = defaultBehavior;
            for (const ancestor of getAncestorBasePaths(path)) {
                const bind = this._bindConfigs[ancestor];
                if (bind?.nonRelevantBehavior) {
                    behavior = bind.nonRelevantBehavior;
                    break;
                }
            }

            if (!relevant && behavior === 'remove') {
                continue;
            }

            const value = !relevant && behavior === 'empty'
                ? null
                : cloneValue(signalRef.value);
            setResponsePathValue(data, path, value);
        }

        const report = this.getValidationReport({ mode });
        return buildFormspecResponseEnvelope({
            definition: this.definition,
            data,
            report,
            timestamp: this.nowISO(),
            meta,
        });
    }

    public getDiagnosticsSnapshot(options?: { mode?: 'continuous' | 'submit' }): FormEngineDiagnosticsSnapshot {
        const values: Record<string, any> = {};
        const mips: FormEngineDiagnosticsSnapshot['mips'] = {};
        const repeats: Record<string, number> = {};

        for (const [path, repeatSignal] of Object.entries(this.repeats)) {
            repeats[path] = repeatSignal.value;
        }

        for (const [path, signalRef] of Object.entries(this.signals)) {
            values[path] = cloneValue(signalRef.value);
            mips[path] = {
                relevant: this.relevantSignals[path]?.value ?? true,
                required: this.requiredSignals[path]?.value ?? false,
                readonly: this.readonlySignals[path]?.value ?? false,
                error: this.errorSignals[path]?.value ?? null,
            };
        }

        const timestamp = this.nowISO();
        return {
            definition: {
                url: this.definition.url,
                version: this.definition.version,
                title: this.definition.title,
            },
            timestamp,
            structureVersion: this.structureVersion.value,
            repeats,
            values,
            mips,
            validation: this.getValidationReport(options),
            runtimeContext: {
                now: timestamp,
                locale: this._runtimeContext.locale,
                timeZone: this._runtimeContext.timeZone,
                seed: this._runtimeContext.seed,
            },
        };
    }

    public applyReplayEvent(event: EngineReplayEvent): EngineReplayApplyResult {
        try {
            switch (event.type) {
                case 'setValue':
                    this.setValue(event.path, event.value);
                    return { ok: true, event };
                case 'addRepeatInstance':
                    return { ok: true, event, output: this.addRepeatInstance(event.path) };
                case 'removeRepeatInstance':
                    this.removeRepeatInstance(event.path, event.index);
                    return { ok: true, event };
                case 'evaluateShape':
                    return { ok: true, event, output: this.evaluateShape(event.shapeId) };
                case 'getValidationReport':
                    return { ok: true, event, output: this.getValidationReport({ mode: event.mode }) };
                case 'getResponse':
                    return { ok: true, event, output: this.getResponse({ mode: event.mode }) };
                default: {
                    return assertNeverReplayEvent(event);
                }
            }
        } catch (error) {
            return {
                ok: false,
                event,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    public replay(events: EngineReplayEvent[], options?: { stopOnError?: boolean }): EngineReplayResult {
        const results: EngineReplayApplyResult[] = [];
        const errors: EngineReplayResult['errors'] = [];
        let applied = 0;

        for (let index = 0; index < events.length; index += 1) {
            const result = this.applyReplayEvent(events[index]);
            results.push(result);
            if (result.ok) {
                applied += 1;
                continue;
            }
            errors.push({
                index,
                event: events[index],
                error: result.error ?? 'Unknown replay error',
            });
            if (options?.stopOnError) {
                break;
            }
        }

        return { applied, results, errors };
    }

    public getDefinition(): FormDefinition {
        return this.definition;
    }

    public setLabelContext(context: string | null): void {
        this._labelContext = context;
        this._labelContextSignal.value = context;
    }

    public getLabel(item: FormItem): string {
        if (this._labelContext && item.labels?.[this._labelContext]) {
            return item.labels[this._labelContext];
        }
        return item.label;
    }

    public loadLocale(doc: LocaleDocument): void {
        this._localeStore.loadLocale(doc);
    }

    public setLocale(code: string): void {
        this._localeStore.setLocale(code);
    }

    public getActiveLocale(): string {
        return this._localeStore.activeLocale.value;
    }

    public getAvailableLocales(): string[] {
        return this._localeStore.getAvailableLocales();
    }

    public getLocaleDirection(): 'ltr' | 'rtl' {
        return this._localeStore.direction.value;
    }

    public getFieldVM(path: string): FieldViewModel | undefined {
        return this._fieldViewModels[path];
    }

    public getFormVM(): FormViewModel {
        return this._formViewModel;
    }

    public resolveLocaleString(key: string, fallback: string): string {
        const localized = this._localeStore.lookupKey(key);
        if (localized !== null) {
            return interpolateMessage(localized, (expr: string) => {
                try { return this.compileExpression(expr, '')(); } catch { return null; }
            }).text;
        }
        return fallback;
    }

    public injectExternalValidation(
        results: Array<{ path: string; severity: string; code: string; message: string; source?: string }>,
    ): void {
        this._externalValidation.splice(
            0,
            this._externalValidation.length,
            ...results.map((result) =>
                makeValidationResult({
                    path: result.path,
                    severity: result.severity as ValidationResult['severity'],
                    constraintKind: 'constraint',
                    code: result.code,
                    message: result.message,
                    source: (result.source ?? 'external') as ValidationResult['source'],
                })),
        );
        this._evaluate();
    }

    public clearExternalValidation(path?: string): void {
        if (!path) {
            this._externalValidation.splice(0, this._externalValidation.length);
        } else {
            const base = toBasePath(path);
            for (let index = this._externalValidation.length - 1; index >= 0; index -= 1) {
                if (toBasePath(this._externalValidation[index].path) === base) {
                    this._externalValidation.splice(index, 1);
                }
            }
        }
        this._evaluate();
    }

    public dispose(): void {
        // No-op — WASM-backed engine has no subscriptions to teardown.
    }

    public setRegistryEntries(entries: any[]): void {
        this._registryEntries.clear();
        for (const entry of entries) {
            if (entry?.name) {
                this._registryEntries.set(entry.name, entry);
            }
        }
        this._registryDocuments = [{ entries }];
        this._evaluate();
    }

    public migrateResponse(responseData: Record<string, any>, fromVersion: string): Record<string, any> {
        return migrateResponseData(this.definition, responseData, fromVersion, {
            nowIso: this.nowISO(),
        });
    }

    private nowISO(): string {
        return this._runtimeContext.nowProvider().toISOString();
    }

    private initializeOptionSignals(): void {
        const visit = (items: FormItem[], prefix = ''): void => {
            for (const item of items) {
                const path = prefix ? `${prefix}.${item.key}` : item.key;
                if (item.type === 'field') {
                    const options = Array.isArray(item.options)
                        ? item.options.map((option) => {
                              const base: OptionEntry = {
                                  value: String(option.value),
                                  label: String(option.label),
                              };
                              if (Array.isArray(option.keywords) && option.keywords.length > 0) {
                                  const keywords = option.keywords
                                      .map((k) => String(k))
                                      .filter((s) => s.length > 0);
                                  if (keywords.length > 0) return { ...base, keywords };
                              }
                              return base;
                          })
                        : [];
                    this.optionSignals[path] = this._rx.signal(options);
                    this.optionStateSignals[path] = this._rx.signal({ loading: false, error: null });
                }
                if (item.children) {
                    visit(item.children, path);
                }
            }
        };
        visit(this.definition.items);
    }

    private initializeInstances(): void {
        const instances = this.definition.instances;
        if (!instances) {
            return;
        }

        for (const [name, instance] of Object.entries(instances)) {
            if (instance.data !== undefined) {
                const seedData = cloneValue(instance.data);
                this.validateInstanceSchema(name, seedData);
                this.instanceData[name] = seedData;
            }
            this.initializeInstanceSource(name, instance);
        }
    }

    private fieldDataTypesSnapshot(): Record<string, string | undefined> {
        const out: Record<string, string | undefined> = {};
        for (const [path, item] of this._fieldItems.entries()) {
            out[path] = item.dataType;
        }
        return out;
    }

    /** Returns true if the source string is fetchable (HTTP(S) or absolute path). */
    private static isFetchableSource(source: string): boolean {
        return /^https?:\/\//i.test(source) || source.startsWith('/');
    }

    private initializeInstanceSource(name: string, instance: FormInstance): void {
        if (!instance.source || !FormEngine.isFetchableSource(instance.source)) {
            return;
        }

        if (instance.static && FormEngine.instanceSourceCache.has(instance.source)) {
            this.instanceData[name] = cloneValue(FormEngine.instanceSourceCache.get(instance.source));
            return;
        }

        const task = fetch(instance.source)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`Instance source fetch failed (${response.status})`);
                }
                return response.json();
            })
            .then((payload) => {
                this.validateInstanceSchema(name, payload);
                const nextValue = cloneValue(payload);
                if (instance.static) {
                    FormEngine.instanceSourceCache.set(instance.source!, cloneValue(nextValue));
                }
                this.instanceData[name] = nextValue;
                this.instanceVersion.value += 1;
                this._evaluate();
            })
            .catch((error) => {
                console.error(`Failed to load instance source '${name}':`, error);
            });

        this._instanceSourceTasks.push(task);
    }

    private initializeBindConfigs(items: FormItem[], prefix = ''): void {
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            this._groupItems.set(path, item);
            const inlineBind = extractInlineBind(item, path);
            if (inlineBind) {
                this._bindConfigs[path] = { ...this._bindConfigs[path], ...inlineBind };
                if (inlineBind.calculate && !parseInstanceTarget(path)) {
                    this._calculatedFields.add(path);
                }
            }
            if (item.children) {
                this.initializeBindConfigs(item.children, path);
            }
        }

        for (const bind of this.definition.binds ?? []) {
            const path = toBasePath(bind.path);
            this._bindConfigs[path] = { ...this._bindConfigs[path], ...(bind as EngineBindConfig), path };
            if (bind.calculate && !parseInstanceTarget(bind.path)) {
                this._calculatedFields.add(path);
            }
        }

        for (const shape of this.definition.shapes ?? []) {
            if (shape.id) {
                this._shapeTiming.set(shape.id, (shape.timing ?? 'continuous') as 'continuous' | 'submit' | 'demand');
                if (!this.shapeResults[shape.id]) {
                    this.shapeResults[shape.id] = this._rx.signal([]);
                }
            }
        }

        for (const variableDef of this._variableDefs) {
            const key = `${variableDef.scope ?? '#'}:${variableDef.name}`;
            this.variableSignals[key] = this._rx.signal(null);
            const existing = this._variableSignalKeys.get(variableDef.name) ?? [];
            existing.push(key);
            this._variableSignalKeys.set(variableDef.name, existing);
        }
    }

    private collectInstanceCalculateBinds(): void {
        for (const bind of Object.values(this._bindConfigs)) {
            if (bind.calculate && parseInstanceTarget(bind.path)) {
                this._instanceCalculateBinds.push(bind);
            }
        }
    }

    private validateInstanceCalculateTargets(): void {
        for (const bind of this._instanceCalculateBinds) {
            const target = parseInstanceTarget(bind.path);
            if (!target) {
                continue;
            }
            const instance = this.definition.instances?.[target.instanceName];
            if (!instance) {
                throw new Error(`Unknown instance '${target.instanceName}' targeted by bind '${bind.path}'`);
            }
            if (instance.readonly !== false) {
                throw new Error(`Calculate bind cannot target readonly instance '${target.instanceName}'`);
            }
        }
    }

    private registerItems(items: FormItem[], prefix = ''): void {
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            this._groupItems.set(path, item);
            this.relevantSignals[path] ??= this._rx.signal(true);
            this.requiredSignals[path] ??= this._rx.signal(false);
            this.readonlySignals[path] ??= this._rx.signal(false);
            this.validationResults[path] ??= this._rx.signal([]);
            this.errorSignals[path] ??= this._rx.signal(null);

            if (item.type === 'field') {
                this._fieldItems.set(path, item);
                this.initializeFieldSignal(path, item);
                this._createFieldVM(path, item);
                if (item.children) {
                    this.registerItemChildren(item.children, path);
                }
                continue;
            }

            if (item.type === 'display') {
                this._displaySignalPaths.add(path);
                if (this._bindConfigs[path]?.calculate) {
                    this.signals[path] = this._rx.signal(null);
                }
                continue;
            }

            if (item.repeatable) {
                const count = item.minRepeat ?? 1;
                this.repeats[path] = this._rx.signal(count);
                for (let index = 0; index < count; index += 1) {
                    this.registerItemChildren(item.children ?? [], `${path}[${index}]`);
                }
            } else {
                this.registerItemChildren(item.children ?? [], path);
            }
        }
    }

    private registerItemChildren(items: FormItem[], prefix: string): void {
        for (const item of items) {
            const path = `${prefix}.${item.key}`;
            this._groupItems.set(path, item);
            this.relevantSignals[path] ??= this._rx.signal(true);
            this.requiredSignals[path] ??= this._rx.signal(false);
            this.readonlySignals[path] ??= this._rx.signal(false);
            this.validationResults[path] ??= this._rx.signal([]);
            this.errorSignals[path] ??= this._rx.signal(null);

            if (item.type === 'field') {
                this._fieldItems.set(toBasePath(path), item);
                this.initializeFieldSignal(path, item);
                this._createFieldVM(path, item);
                if (item.children) {
                    this.registerItemChildren(item.children, path);
                }
                continue;
            }

            if (item.type === 'display') {
                this._displaySignalPaths.add(path);
                if (this._bindConfigs[toBasePath(path)]?.calculate) {
                    this.signals[path] ??= this._rx.signal(null);
                }
                continue;
            }

            if (item.repeatable) {
                const count = item.minRepeat ?? 1;
                this.repeats[path] = this._rx.signal(count);
                for (let index = 0; index < count; index += 1) {
                    this.registerItemChildren(item.children ?? [], `${path}[${index}]`);
                }
            } else {
                this.registerItemChildren(item.children ?? [], path);
            }
        }
    }

    private initializeFieldSignal(path: string, item: FormItem): void {
        if (this.signals[path]) {
            return;
        }
        const hasExpressionInitial = typeof item.initialValue === 'string' && item.initialValue.startsWith('=');
        const initial = this.resolveInitialFieldValue(path, item);
        this.signals[path] = this._rx.signal(cloneValue(initial));
        if (!hasExpressionInitial) {
            this._data[path] = cloneValue(initial);
        }
    }

    private resolveInitialFieldValue(path: string, item: FormItem): any {
        const prePopulate = item.prePopulate;
        if (prePopulate) {
            const value = this.getInstanceData(prePopulate.instance, prePopulate.path);
            if (value !== undefined) {
                if (prePopulate.editable === false) {
                    this._prePopulateReadonly.add(path);
                }
                return cloneValue(value);
            }
            if (prePopulate.editable === false) {
                this._prePopulateReadonly.add(path);
            }
        }

        if (typeof item.initialValue === 'string' && item.initialValue.startsWith('=')) {
            return emptyValueForItem(item);
        }

        if (item.initialValue !== undefined) {
            return coerceInitialValue(item, item.initialValue);
        }

        return emptyValueForItem(item);
    }

    private initializeRemoteOptions(): void {
        for (const bind of Object.values(this._bindConfigs)) {
            if (!bind.remoteOptions) {
                continue;
            }
            const path = toBasePath(bind.path);
            const state = this.optionStateSignals[path] ?? this._rx.signal({ loading: false, error: null });
            this.optionStateSignals[path] = state;
            state.value = { loading: true, error: null };
            const task = fetch(bind.remoteOptions)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`Remote options fetch failed (${response.status})`);
                    }
                    return response.json();
                })
                .then((payload) => {
                    const options = normalizeRemoteOptions(payload);
                    this.optionSignals[path] = this.optionSignals[path] ?? this._rx.signal([]);
                    this.optionSignals[path].value = options;
                    state.value = { loading: false, error: null };
                    this._evaluate();
                })
                .catch((error) => {
                    state.value = {
                        loading: false,
                        error: error instanceof Error ? error.message : String(error),
                    };
                });
            this._remoteOptionsTasks.push(task);
        }
    }

    private writeInstanceValue(
        instanceName: string,
        path: string | undefined,
        value: any,
        options?: { bypassReadonly?: boolean },
    ): void {
        const instance = this.definition.instances?.[instanceName];
        if (!instance) {
            throw new Error(`Unknown instance '${instanceName}'`);
        }
        if (!options?.bypassReadonly && instance.readonly !== false) {
            throw new Error(`Instance '${instanceName}' is readonly`);
        }

        let nextValue: any;
        if (!path) {
            nextValue = cloneValue(value);
        } else {
            nextValue = cloneValue(this.instanceData[instanceName] ?? {});
            setNestedPathValue(nextValue, path, cloneValue(value));
        }
        this.validateInstanceSchema(instanceName, nextValue);
        if (deepEqual(this.instanceData[instanceName], nextValue)) {
            return;
        }
        this.instanceData[instanceName] = nextValue;
        this.instanceVersion.value += 1;
    }

    private validateInstanceSchema(instanceName: string, data: any): void {
        const schema = this.definition.instances?.[instanceName]?.schema;
        validateInstanceDataAgainstSchema(
            instanceName,
            data,
            schema && typeof schema === 'object' ? (schema as Record<string, unknown>) : undefined,
        );
    }

    private evaluateExpression(
        expression: string,
        currentItemPath = '',
        dataOverride?: Record<string, any>,
        resultOverride?: EvalResult | null,
        scopedVariableOverrides?: Record<string, any>,
        replaceSelfRef = false,
    ): any {
        return safeEvaluateExpression(
            this.normalizeExpressionForWasm(expression, currentItemPath, replaceSelfRef),
            buildWasmFelExpressionContext({
                currentItemPath,
                data: this._data,
                fullResult: this._fullResult,
                resultOverride,
                dataOverride,
                scopedVariableOverrides,
                fieldSignals: this.signals,
                validationResults: this.validationResults,
                relevantSignals: this.relevantSignals,
                readonlySignals: this.readonlySignals,
                requiredSignals: this.requiredSignals,
                repeats: this.repeats,
                bindConfigs: this._bindConfigs,
                fieldDataTypes: this.fieldDataTypesSnapshot(),
                variableDefs: this._variableDefs,
                variableSignals: this.variableSignals,
                instanceData: this.instanceData,
                nowIso: this.nowISO(),
                locale: this._runtimeContext.locale,
                meta: this._runtimeContext.meta,
            }),
        );
    }

    private repeatCountsSnapshot(): Record<string, number> {
        return Object.fromEntries(
            Object.entries(this.repeats).map(([path, repeatSignal]) => [path, repeatSignal.value]),
        );
    }

    private shapedEvalResult(base: EvalResult): EvalResult {
        return mergeWasmEvalWithExternalValidations(base, {
            externalValidations: this._externalValidation as unknown as EvalValidation[],
        });
    }

    private _evaluate(): void {
        const baseResult = wasmEvaluateDefinition(
            this.definition,
            this._data,
            wasmEvaluateDefinitionPayload({
                nowIso: this.nowISO(),
                previousResult: this._fullResult,
                instances: this.instanceData,
                registryDocuments: this._registryDocuments,
                repeatCounts: this.repeatCountsSnapshot(),
            }),
        ) as EvalResult;
        const evalResult = this.shapedEvalResult(baseResult);

        // Apply TS-side fixups that WASM can't handle:
        // 1. Instance calculate write-back (binds targeting @instance(...) paths)
        this.applyInstanceCalculates(evalResult);
        // Shape timing is enforced in Rust `revalidate` for the default continuous WASM eval;
        // no TS-side filter needed for parity with batch eval.
        const delta = diffEvalResults(this._previousEvalResult, evalResult);

        this._rx.batch(() => {
            patchValueSignalsFromWasm({
                values: evalResult.values,
                signals: this.signals,
                data: this._data,
                fieldItems: this._fieldItems,
                bindConfigs: this._bindConfigs,
                calculatedFields: this._calculatedFields,
            });
            patchDeltaSignalsFromWasm(this._rx, delta, {
                relevantSignals: this.relevantSignals,
                requiredSignals: this.requiredSignals,
                readonlySignals: this.readonlySignals,
                validationResults: this.validationResults,
                shapeResults: this.shapeResults,
                variableSignals: this.variableSignals,
                variableSignalKeys: this._variableSignalKeys,
                prePopulateReadonly: this._prePopulateReadonly,
            });
            this.syncInstanceCalculateSignals();
            patchErrorSignalsFromWasm(this._rx, {
                validationResults: this.validationResults,
                errorSignals: this.errorSignals,
            });
            this._evaluationVersion.value += 1;
        });

        this._previousEvalResult = evalResult;
        this._fullResult = evalResult;
    }

    private evaluateResultForTrigger(trigger: 'continuous' | 'submit' | 'demand' | 'disabled'): EvalResult {
        return this.shapedEvalResult(wasmEvaluateDefinition(
            this.definition,
            this._data,
            wasmEvaluateDefinitionPayload({
                nowIso: this.nowISO(),
                trigger,
                previousResult: this._fullResult,
                instances: this.instanceData,
                registryDocuments: this._registryDocuments,
                repeatCounts: this.repeatCountsSnapshot(),
            }),
        ) as EvalResult);
    }

    private applyInstanceCalculates(result: EvalResult): boolean {
        let changed = false;
        for (const bind of this._instanceCalculateBinds) {
            const target = parseInstanceTarget(bind.path);
            if (!target || !bind.calculate) {
                continue;
            }
            const value = this.evaluateExpression(bind.calculate, '', this._data, result);
            const before = cloneValue(this.getInstanceData(target.instanceName, target.instancePath));
            this.writeInstanceValue(target.instanceName, target.instancePath, value, { bypassReadonly: true });
            if (!deepEqual(before, this.getInstanceData(target.instanceName, target.instancePath))) {
                changed = true;
            }
        }
        return changed;
    }

    private syncInstanceCalculateSignals(): void {
        for (const bind of this._instanceCalculateBinds) {
            const target = parseInstanceTarget(bind.path);
            if (!target || !bind.calculate) {
                continue;
            }
            const nextValue = this.evaluateExpression(bind.calculate);
            if ((nextValue === null || nextValue === undefined)
                && this.getInstanceData(target.instanceName, target.instancePath) !== undefined) {
                continue;
            }
            this.writeInstanceValue(target.instanceName, target.instancePath, nextValue, { bypassReadonly: true });
        }
    }

    private normalizeExpressionForWasm(expression: string, currentItemPath = '', replaceSelfRef = false): string {
        return normalizeExpressionForWasmEvaluation({
            expression,
            currentItemPath,
            replaceSelfRef,
            repeats: this.repeats,
            fieldSignals: this.signals,
        });
    }

    private resolveRepeatPath(itemName: string): string {
        return this.repeats[itemName] ? itemName : toBasePath(itemName);
    }

    private clearRepeatSubtree(rootRepeatPath: string): void {
        const repeatPrefix = `${rootRepeatPath}[`;
        for (const path of Object.keys(this._fieldViewModels)) {
            if (path.startsWith(repeatPrefix)) {
                delete this._fieldViewModels[path];
            }
        }

        clearRepeatIndexedSubtree({
            rootRepeatPath,
            signals: this.signals,
            relevantSignals: this.relevantSignals,
            requiredSignals: this.requiredSignals,
            readonlySignals: this.readonlySignals,
            errorSignals: this.errorSignals,
            validationResults: this.validationResults,
            optionSignals: this.optionSignals,
            optionStateSignals: this.optionStateSignals,
            repeats: this.repeats,
            data: this._data,
        });
    }

    private _createFieldVM(path: string, item: FormItem): void {
        const basePath = toBasePath(path);
        const vm = createFieldViewModel({
            rx: this._rx,
            localeStore: this._localeStore,
            templatePath: basePath,
            instancePath: path,
            id: `field-${path.replace(/[\.\[\]]/g, '-')}`,
            itemKey: item.key,
            dataType: item.dataType ?? 'string',
            getItemLabel: () => item.label,
            getItemHint: () => item.hint ?? null,
            getItemDescription: () => item.description ?? null,
            getItemLabels: () => item.labels,
            getLabelContext: () => this._labelContextSignal.value,
            getFieldValue: () => this.signals[path] ?? this._rx.signal(null),
            getRequired: () => this.requiredSignals[path] ?? this._rx.signal(false),
            getVisible: () => this.relevantSignals[path] ?? this._rx.signal(true),
            getReadonly: () => this.readonlySignals[path] ?? this._rx.signal(false),
            getDisabledDisplay: () => this.getDisabledDisplay(path),
            getErrors: () => this.validationResults[basePath] ?? this._rx.signal([]),
            getOptions: () => this.optionSignals[basePath] ?? this._rx.signal([]),
            getOptionsState: () => this.optionStateSignals[basePath] ?? this._rx.signal({ loading: false, error: null }),
            getOptionSetName: () => item.optionSet,
            setFieldValue: (value) => this.setValue(path, value),
            evalFEL: (expr) => wasmEvalFELWithContext(expr, this._buildLocaleFELContext(path)),
        });
        this._fieldViewModels[path] = vm;
    }

    private _buildLocaleFELContext(currentItemPath = ''): any {
        return buildWasmFelExpressionContext({
            currentItemPath,
            data: this._data,
            fullResult: this._fullResult,
            fieldSignals: this.signals,
            validationResults: this.validationResults,
            relevantSignals: this.relevantSignals,
            readonlySignals: this.readonlySignals,
            requiredSignals: this.requiredSignals,
            repeats: this.repeats,
            bindConfigs: this._bindConfigs,
            fieldDataTypes: this.fieldDataTypesSnapshot(),
            variableDefs: this._variableDefs,
            variableSignals: this.variableSignals,
            instanceData: this.instanceData,
            nowIso: this.nowISO(),
            locale: this._runtimeContext.locale,
            meta: this._runtimeContext.meta,
        });
    }
}

function assertNeverReplayEvent(event: never): EngineReplayApplyResult {
    const unreachable = event as EngineReplayEvent;
    throw new Error(`Unsupported replay event: ${unreachable.type}`);
}
