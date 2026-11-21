/** @filedesc Reactive FormEngine: field signals, WASM-backed FEL evaluation, validation, and response assembly. */
import { parseJsonExact } from '@formspec-org/integrity-canonical';


import type {
    EvaluatedFormState,
    FormDefinition,
    FormInstance,
    Explanation,
    FormItem,
    FormResponse,
    FormVariable,
    OptionEntry,
    ValidationReport,
    ValidationResult,
    ValidationProfile,
} from '@formspec-org/types';
import { freezeSourceMetadata, readSourceResult, sourceErrorMessage } from './instance-source.js';
import { diffEvalResults, type EvalDiagnostic, type EvalResult, type EvalValidation } from '../diff.js';
import { FelExtensionFunctions, type FelExtensionFunctionRegistration } from '../extension-functions.js';
import type {
    SetValueOptions,
    WriteSource,
    EngineReplayApplyResult,
    EngineReplayEvent,
    EngineReplayResult,
    FormDraftSnapshot,
    FormEngineDiagnosticsSnapshot,
    FormEngineOptions,
    FormEngineRuntimeContext,
    FormFieldValue,
    IFormEngine,
    InstanceSourceResolver,
    InstanceSourceLoadOutcome,
    JsonRecord,
    JsonValue,
    PinnedResponseReference,
    RelevanceExplanation,
    RegistryEntry,
    RemoteOptionsState,
} from '../interfaces.js';
import {
    analyzeFEL,
    getFELDependencies,
    type FelTraceResult,
    type FelTraceStep,
} from '../fel/fel-api-runtime.js';
import { preactReactiveRuntime } from '../reactivity/preact-runtime.js';
import type { EngineReactiveRuntime, EngineSignal, ReadonlyEngineSignal } from '../reactivity/types.js';
import { LocaleStore, type LocaleDocument } from '../locale.js';
import { FetchIssuerFetcher } from '../issuer/IssuerFetcher.js';
import { IssuerStore } from '../issuer/IssuerStore.js';
import type { Issuer, IssuerSource, ResolvedIssuer } from '../issuer/types.js';
import {
    createFieldViewModel,
    resolveItemHelpText,
    resolveItemLabel,
    type FieldViewModel,
} from '../field-view-model.js';
import { createFormViewModel, type FormViewModel } from '../form-view-model.js';
import {
    wasmAssembleCandidate,
    wasmCreateFelContext,
    wasmCreateRepeatRow,
    wasmCreateResponse,
    wasmEvaluateDefinition,
    wasmEvaluateFiled,
    wasmResponseSubjectId,
} from '../wasm-bridge-runtime.js';
import {
    resolveOptionSetsOnDefinition,
} from './definition-setup.js';
import {
    isStamped, matchesEntry, sameAnswer, stripExplanationStamp, warningReview, type DraftExplanation, type ExplanationKey, type ExplanationState,
} from './warning-explanations.js';
import { captureDraftData } from './draft-snapshot.js';
import { registerDraftEditVersionSignal } from './draft-edit-signal.js';
import { validateInstanceDataAgainstSchema } from './instance-schema.js';
import {
    patchDeltaSignalsFromWasm,
    patchErrorSignalsFromWasm,
    patchValueSignalsFromWasm,
} from './reactive-patches.js';
import {
    clearRepeatIndexedSubtree,
    snapshotRepeatRow,
    type RepeatRowSnapshot,
} from './repeat-ops.js';
import {
    buildFormspecResponseEnvelope,
    buildValidationReportEnvelope,
    collectRelevantValidationResults,
    collectTimedShapeValidationResults,
    migrateResponseData,
    resolvePinnedDefinition,
} from './response-assembly.js';
import {
    mergeWasmEvalWithExternalValidations,
    wasmEvaluateDefinitionPayload,
} from './wasm-fel.js';
import { felContextSchema, felContextSnapshot } from './fel-context.js';
import type { WasmFelContextHandle, WasmInterpolated } from '../wasm-bridge-runtime.js';
import type { EngineBindConfig } from './helpers.js';
import {
    appendPath,
    cloneValue,
    coerceFieldValue,
    deepEqual,
    getNestedValue,
    getScopeAncestors,
    isJsonRecord,
    isEmptyValue,
    makeValidationResult,
    normalizeRemoteOptions,
    parentPathOf,
    parseInstanceTarget,
    resolveNowProvider,
    setNestedPathValue,
    splitIndexedPath,
    toBasePath,
    toValidationResult,
} from './helpers.js';
import {
    DefaultValidationProfileResolver,
    type EnabledValidationProfile,
    type ValidationReportOptions,
    type ValidationTrigger,
} from '../validation/index.js';
export class FormEngine implements IFormEngine {
    public static instanceSourceCache = new Map<string, JsonValue>();

    public readonly definition: FormDefinition;
    public readonly signals: Record<string, EngineSignal<FormFieldValue>> = {};
    public readonly relevantSignals: Record<string, EngineSignal<boolean>> = {};
    public readonly requiredSignals: Record<string, EngineSignal<boolean>> = {};
    public readonly readonlySignals: Record<string, EngineSignal<boolean>> = {};
    public readonly errorSignals: Record<string, EngineSignal<string | null>> = {};
    public readonly validationResults: Record<string, EngineSignal<ValidationResult[]>> = {};
    /** Who last wrote each field (`'user'` by default, `'assist'` for Assist-driven writes); null until written. */
    public readonly writeSources: Record<string, EngineSignal<WriteSource | null>> = {};
    public readonly shapeResults: Record<string, EngineSignal<ValidationResult[]>> = {};
    public readonly repeats: Record<string, EngineSignal<number>> = {};
    public readonly optionSignals: Record<string, EngineSignal<OptionEntry[]>> = {};
    public readonly optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>> = {};
    public readonly variableSignals: Record<string, EngineSignal<FormFieldValue>> = {};
    /** Own-key JSON data map; valid source names never inherit Object prototype values. */
    public readonly instanceData: JsonRecord = Object.create(null);
    public readonly instanceVersion: EngineSignal<number>;
    public readonly structureVersion: EngineSignal<number>;
    public readonly localeSignal: ReadonlyEngineSignal<number>;

    private readonly _rx: EngineReactiveRuntime;
    private readonly _evaluationVersion: EngineSignal<number>;
    private readonly _draftEditVersion: EngineSignal<number>;
    private _draftEditDirty = false;
    private readonly _bindConfigs: Record<string, EngineBindConfig> = {};
    private readonly _fieldItems = new Map<string, FormItem>();
    /** `dataType` of every field Item by base path, from the definition (FEL value tagging, scope checks). */
    private readonly _fieldDataTypes: Record<string, string | undefined> = {};
    /** WASM-resident FEL context for ad-hoc reads, reloaded when `key` (the engine's state epoch) changes. */
    private _felContext: { key: string; handle: WasmFelContextHandle } | null = null;
    private readonly _groupItems = new Map<string, FormItem>();
    private readonly _shapeTiming = new Map<string, 'continuous' | 'submit' | 'demand'>();
    private readonly _displaySignalPaths = new Set<string>();
    private readonly _calculatedFields = new Set<string>();
    private _calculatedPaths = new Set<string>();
    private _indexedBinds: Record<string, EngineBindConfig> = {};
    private readonly _registryEntries = new Map<string, RegistryEntry>();
    /** Host FEL extension functions (Core §3.12), passed to every Rust evaluation. */
    private readonly _extensionFunctions = new FelExtensionFunctions();
    private readonly _explanationState: ReadonlyEngineSignal<ExplanationState>;
    private readonly _explanationRefreshVersion: EngineSignal<number>;
    private _pendingExplanationState: {
        evaluationVersion: number;
        explanations: DraftExplanation[];
        refreshVersion: number;
        state: ExplanationState;
    } | null = null;
    private readonly _explanations: EngineSignal<DraftExplanation[]>;
    private readonly _responseSubject: FormEngineOptions['responseSubject'];
    private readonly _responseInstanceResolutions: NonNullable<FormEngineOptions['responseInstanceResolutions']>;
    private _registryDocuments: unknown[] = [];
    private readonly _remoteOptionsTasks: Array<Promise<void>> = [];
    private readonly _instanceSourceResolver?: InstanceSourceResolver;
    private readonly _instanceSourceAbort = new AbortController();
    private readonly _pendingInstanceSources = new Set<string>();
    private _pendingCreationPaths = new Set<string>();
    private readonly _creationDiagnostics: EvalDiagnostic[] = [];
    private readonly _failedSeedPaths = new Set<string>();
    private readonly _instanceSourceOutcomes: Record<string, InstanceSourceLoadOutcome> = Object.create(null);
    private _disposed = false;
    private readonly _instanceSourceTasks: Array<Promise<void>> = [];
    private readonly _variableDefs: FormVariable[];
    private readonly _variableSignalKeys = new Map<string, string[]>();
    private readonly _derivationTraceCache = new Map<string, { version: number; trace: FelTraceStep[] }>();
    private readonly _externalValidation: ValidationResult[] = [];
    private readonly _issuerStore: IssuerStore;
    private readonly _validationProfileResolver: DefaultValidationProfileResolver;

    private readonly _localeStore: LocaleStore;
    private readonly _fieldViewModels: Record<string, FieldViewModel> = {};
    private readonly _itemLabelSignals = new Map<string, ReadonlyEngineSignal<string>>();
    /** Hint / description signals for Items with no field view model, keyed `<property>:<instance path>`. */
    private readonly _itemHelpTextSignals = new Map<string, ReadonlyEngineSignal<string | null>>();
    private _formViewModel!: FormViewModel;
    private readonly _labelContextSignal: EngineSignal<string | null>;

    private readonly _data: JsonRecord = Object.create(null);
    private _previousEvalResult: EvalResult | null = null;
    private _fullResult: EvalResult | null = null;
    // Keep the exact rejected input across report profiles and host-only updates.
    private _refusedInput: JsonRecord | undefined;
    private _refusedCreation: { pendingPaths?: string[] } | undefined;
    private _issuerOverride: IssuerSource | undefined;
    private _resolvedIssuer: ResolvedIssuer | undefined;
    private _issuerResolutionPromise: Promise<ResolvedIssuer> | undefined;
    private _issuerResolutionEpoch = 0;
    private _resolvedIssuerEpoch = -1;
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
        options: FormEngineOptions = {},
    ) {
        const {
            runtimeContext,
            registryEntries,
            reactiveRuntime = preactReactiveRuntime,
            issuerFetcher,
            issuerOverride,
            extensionFunctions,
        } = options;
        this._instanceSourceResolver = options.instanceSourceResolver;
        this._responseSubject = cloneValue(options.responseSubject ?? undefined);
        // A declared filing unit's id is Core's hash of its keys, never the host's claim.
        if (this._responseSubject && definition.subject) delete this._responseSubject.id;
        if (this._responseSubject && !definition.subject && this._responseSubject.id === undefined) {
            throw new Error('A host entity subject needs responseSubject.id when the Definition declares no subject');
        }
        this._responseInstanceResolutions = Object.assign(
            Object.create(null), cloneValue(options.responseInstanceResolutions ?? {}),
        );
        this._rx = reactiveRuntime;
        const initialExplanations = options.draftSnapshot?.explanations
            ? options.draftSnapshot.explanations.map(raw => {
                const edit = stripExplanationStamp(raw);
                return options.savedExplanations?.find(entry => isStamped(entry) && sameAnswer(edit, entry)) ?? edit;
            })
            : cloneValue(options.savedExplanations ?? []);
        this._explanations = this._rx.signal(cloneValue(initialExplanations));
        this._issuerStore = new IssuerStore(issuerFetcher ?? new FetchIssuerFetcher());
        this._validationProfileResolver = new DefaultValidationProfileResolver();
        this._issuerOverride = issuerOverride;
        this.instanceVersion = this._rx.signal(0);
        this.structureVersion = this._rx.signal(0);
        this._evaluationVersion = this._rx.signal(0);
        this._draftEditVersion = this._rx.signal(0);
        registerDraftEditVersionSignal(this, this._draftEditVersion);
        this._explanationRefreshVersion = this._rx.signal(0);
        this._labelContextSignal = this._rx.signal(null);
        this._explanationState = this._rx.computed(() => {
            const evaluationVersion = this._evaluationVersion.value;
            const explanations = this._explanations.value;
            const refreshVersion = this._explanationRefreshVersion.value;
            const pending = this._pendingExplanationState;
            this._pendingExplanationState = null;
            const reused = pending
                && pending.evaluationVersion === evaluationVersion
                && pending.explanations === explanations
                && pending.refreshVersion === refreshVersion
                ? pending.state
                : null;
            return freezeSourceMetadata(reused ?? this.reviewWarnings());
        });
        this.definition = cloneValue(definition);
        if ([options.responseData, options.savedResponseData, options.draftSnapshot].filter(value => value !== undefined).length > 1) {
            throw new Error('Supply one of responseData, savedResponseData, or draftSnapshot');
        }
        if (options.draftSnapshot) this.assertDraftSnapshot(options.draftSnapshot);

        // Locale store — direction mode from formPresentation.direction or 'ltr'
        const directionMode = definition.formPresentation?.direction ?? 'ltr';
        this._localeStore = new LocaleStore(this._rx, directionMode, {
            kind: 'definition',
            url: definition.url,
        });
        this.localeSignal = this._localeStore.version;
        this._variableDefs = [...(this.definition.variables ?? [])];

        if (runtimeContext) {
            this.setRuntimeContext(runtimeContext);
        }
        for (const [name, registration] of Object.entries(extensionFunctions ?? {})) {
            this._extensionFunctions.register(name, registration);
        }
        if (registryEntries) {
            for (const entry of registryEntries) {
                if (entry?.name) {
                    this._registryEntries.set(entry.name, entry);
                }
            }
            this._registryDocuments = [{ entries: registryEntries }];
        }

        this.initializeOptionSignals();
        this.initializeInstances(options.loadExternalSources !== false);
        this.initializeBindConfigs(this.definition.items);
        this.rejectInstancePathBinds();
        this.registerItems(this.definition.items);
        try {
            const saved = options.draftSnapshot?.data ?? options.savedResponseData;
            if (saved !== undefined) {
                this.loadItemsData(this.definition.items, saved, '');
            }
            const input = saved ?? this.createResponseData(options.responseData ?? {});
            this._evaluate(null, true, input);
            // The first evaluation checked the subject before anything else; hash it once, only if it passed.
            // Rust accepts a declared subject only with its type and keys.
            const subject = this._responseSubject;
            if (subject && this.definition.subject && !this.hasSubjectRefusal()) {
                subject.id = wasmResponseSubjectId(subject.type!, subject.keys!);
            }
        } catch (error) {
            this.dispose();
            throw error;
        }
        if (options.loadExternalSources !== false && !this.hasSubjectRefusal()) this.initializeRemoteOptions();

        // Create form-level view model (after first evaluate so validation is available)
        this._formViewModel = createFormViewModel({
            rx: this._rx,
            localeStore: this._localeStore,
            getDefinitionTitle: () => this.definition.title ?? '',
            getDefinitionDescription: () => this.definition.description ?? '',
            getPageTitle: () => undefined,
            getPageDescription: () => undefined,
            interpolate: (template) => this._interpolate(template),
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

    public get formPresentation(): FormDefinition['formPresentation'] | null {
        return this.definition.formPresentation ?? null;
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

    public setIssuerOverride(source: IssuerSource | undefined): void {
        this._issuerResolutionEpoch += 1;
        this._issuerOverride = source;
        this._resolvedIssuer = undefined;
        this._resolvedIssuerEpoch = -1;
        this._issuerResolutionPromise = undefined;
    }

    public async getResolvedIssuer(): Promise<ResolvedIssuer> {
        if (!this._issuerResolutionPromise) {
            const epoch = this._issuerResolutionEpoch;
            let promise: Promise<ResolvedIssuer>;
            promise = this._issuerStore.resolve({
                definitionIssuer: definitionIssuerSource(this.definition),
                hostOverride: this._issuerOverride,
            }).then((resolved) => {
                if (this._issuerResolutionEpoch === epoch && this._issuerResolutionPromise === promise) {
                    this._resolvedIssuer = resolved;
                    this._resolvedIssuerEpoch = epoch;
                }
                return resolved;
            });
            this._issuerResolutionPromise = promise;
        }
        return this._issuerResolutionPromise;
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

    public async waitForInstanceSources(): Promise<Readonly<Record<string, InstanceSourceLoadOutcome>>> {
        await Promise.allSettled(this._instanceSourceTasks);
        return freezeSourceMetadata(cloneValue(this._instanceSourceOutcomes));
    }

    public setInstanceValue(name: string, path: string | undefined, value: FormFieldValue): void {
        this.writeInstanceValue(name, path, value);
        this._evaluate();
    }

    public getInstanceData(name: string, path?: string): FormFieldValue {
        const data = this.instanceData[name];
        if (data === undefined) {
            return undefined;
        }
        if (!path) {
            return data;
        }
        return isJsonRecord(data) ? getNestedValue(data, path) : undefined;
    }

    public getDisabledDisplay(path: string): 'hidden' | 'protected' {
        return this.bindAt(path)?.disabledDisplay ?? 'hidden';
    }

    public getVariableValue(name: string, scopePath: string): FormFieldValue {
        this._evaluationVersion.value;
        const scopes = this._fullResult?.scopedVariables ?? {};
        const path = scopePath.split('.');
        const prefixes = path.map((_, index) => path.slice(0, index + 1).join('.'));
        if (!['#', ...prefixes].some(scope => Object.prototype.hasOwnProperty.call(scopes[scope] ?? {}, name))) {
            return undefined;
        }
        return this.compileExpression(`@${name}`, scopePath)();
    }

    /** Appends a row and returns its index; `undefined` when the path is not repeatable or already at `maxRepeat` (Core §4.2.2). */
    public addRepeatInstance(itemName: string): number | undefined {
        const path = this.resolveRepeatPath(itemName);
        const item = this._groupItems.get(path);
        if (!item?.repeatable) {
            return undefined;
        }
        const index = this.repeats[path]?.value ?? 0;
        if (item.maxRepeat !== undefined && index >= item.maxRepeat) {
            return undefined;
        }
        const created = wasmCreateRepeatRow(
            this.definition, this._refusedInput ?? this.editingData(), path, this.creationContext(), this._extensionFunctions,
        );
        if (!created || created.refused) return undefined;
        this._rx.batch(() => {
            this._pendingCreationPaths.delete(path);
            this._failedSeedPaths.delete(path);
            for (const pending of created.pending) this._pendingCreationPaths.add(pending);
            this.appendRepeatRow(path, item);
            this.loadItemsData(item.children ?? [], created.data, `${path}[${index}]`);
            this._evaluate();
        });
        return index;
    }

    public removeRepeatInstance(itemName: string, index: number): void {
        const path = this.resolveRepeatPath(itemName);
        const item = this._groupItems.get(path);
        const count = this.repeats[path]?.value ?? 0;
        if (!item?.repeatable || index < 0 || index >= count) {
            return;
        }
        this._rx.batch(() => {
            this.rebuildRepeatRows(path, item, index);
            const prefix = `${path}[`;
            const shift = (fieldPath: string): string[] => {
                if (!fieldPath.startsWith(prefix)) return [fieldPath];
                const end = fieldPath.indexOf(']', prefix.length);
                const row = Number(fieldPath.slice(prefix.length, end));
                if (row === index) return [];
                return [row > index ? `${prefix}${row - 1}${fieldPath.slice(end)}` : fieldPath];
            };
            this._pendingCreationPaths = new Set([...this._pendingCreationPaths].flatMap(shift));
            const shiftFindings = <T extends { path: string }>(findings: T[]): T[] =>
                findings.flatMap(finding => shift(finding.path).map(path =>
                    path === finding.path ? finding : { ...finding, path }));
            this._externalValidation.splice(0, this._externalValidation.length, ...shiftFindings(this._externalValidation));
            const previous = this._fullResult;
            this._evaluate(previous && {
                nonRelevant: previous.nonRelevant.flatMap(shift),
            }, false, this.editingData());
        });
    }

    /** Resume saved Response data with its exact row counts and answered fields. */
    public loadResponseData(data: JsonRecord, explanations: DraftExplanation[] = []): void {
        if (!isJsonRecord(data)) throw new TypeError('Response data must be a JSON object');
        this._rx.batch(() => {
            this._refusedCreation = undefined;
            this._explanations.value = cloneValue(explanations);
            this._pendingCreationPaths.clear();
            this._creationDiagnostics.length = 0;
            this._failedSeedPaths.clear();
            this.loadItemsData(this.definition.items, data, '', true);
            this._evaluate(null, false, data);
        });
    }

    private editingData(): JsonRecord {
        return captureDraftData(
            this.definition.items,
            path => this._data[path],
            path => this._pendingCreationPaths.has(path) || this._failedSeedPaths.has(path)
                ? undefined : this.repeats[path].value,
        );
    }

    public getDraftSnapshot(): FormDraftSnapshot {
        const data = this.editingData();
        return cloneValue({
            definitionUrl: this.definition.url,
            definitionVersion: this.definition.version,
            data,
        });
    }

    public loadDraftSnapshot(snapshot: FormDraftSnapshot, explanations: Explanation[] = []): void {
        this.assertDraftSnapshot(snapshot);
        const merged = snapshot.explanations
            ? snapshot.explanations.map(raw => {
                const edit = stripExplanationStamp(raw);
                return explanations.find(entry => isStamped(entry) && sameAnswer(edit, entry)) ?? edit;
            })
            : cloneValue(explanations);
        this.loadResponseData(snapshot.data, merged);
    }

    public getExplanationEntries(): DraftExplanation[] {
        return cloneValue(this._explanations.value);
    }

    public getExplanationState(): ExplanationState {
        return this._explanationState.value;
    }

    private reviewWarnings(): ExplanationState {
        return warningReview(this.evaluateResultForTrigger('submit'), this._explanations.value);
    }

    private refreshExplanationState(state: ExplanationState): void {
        const refreshVersion = this._explanationRefreshVersion.value + 1;
        this._pendingExplanationState = {
            evaluationVersion: this._evaluationVersion.value,
            explanations: this._explanations.value,
            refreshVersion,
            state,
        };
        this._explanationRefreshVersion.value = refreshVersion;
    }

    public setExplanation(shapeId: string, path: string, answer: { text?: string }): void {
        const finding = this.reviewWarnings().findings.find(f => f.shapeId === shapeId && f.path === path);
        if (!finding || finding.mode === 'acknowledge') {
            throw new Error('This warning has no current instance explanation');
        }
        if (finding.mode === 'explain' && !answer.text) throw new Error('This warning requires explanation text');
        this.writeExplanation({
            shapeId, path, basis: finding.basis, ...(answer.text === undefined ? {} : { text: answer.text }),
        });
    }

    public acknowledge(code: string, options?: { expectedBasis?: string }): boolean {
        if ('parties' in this.definition) throw new Error('Group acknowledgement requires a bound party');
        const state = this.reviewWarnings();
        const finding = state.findings.find(f => f.code === code && f.mode === 'acknowledge');
        const group = state.groups.find(g => g.code === code);
        if (options?.expectedBasis !== undefined) {
            if (!group || finding?.mode !== 'acknowledge' || finding.groupBasis !== options.expectedBasis) {
                this.refreshExplanationState(state);
                return false;
            }
        } else if (!group || finding?.mode !== 'acknowledge') {
            throw new Error('No current warnings to acknowledge');
        }
        const [first, ...rest] = group.paths;
        this.writeExplanation({ group: true, code, paths: [first, ...rest], basis: finding.groupBasis });
        return true;
    }

    private writeExplanation(entry: DraftExplanation): void {
        const entries = this._explanations.value;
        const index = entries.findIndex(current => matchesEntry(current, entry));
        if (index < 0) {
            this._rx.batch(() => {
                this._explanations.value = [...entries, entry];
                this._draftEditVersion.value += 1;
            });
        } else if (!sameAnswer(entries[index], entry)) {
            this._rx.batch(() => {
                this._explanations.value = entries.map((current, i) => i === index ? entry : current);
                this._draftEditVersion.value += 1;
            });
        }
    }

    public removeExplanation(key: ExplanationKey): void {
        const next = this._explanations.value.filter(entry => !matchesEntry(entry, key));
        const changed = next.length !== this._explanations.value.length;
        this._rx.batch(() => {
            this._explanations.value = next;
            if (changed) this._draftEditVersion.value += 1;
        });
    }

    public acceptSavedExplanations(
        entries: Explanation[],
        options?: { mergeMissing?: boolean; base?: readonly DraftExplanation[] },
    ): void {
        const current = this._explanations.value;
        let saved: DraftExplanation[];
        if (options?.base !== undefined) {
            const base = options.base;
            saved = [];
            for (const local of current) {
                const committed = entries.find(entry => matchesEntry(local, entry));
                const baseEntry = base.find(entry => matchesEntry(local, entry));
                if (committed && sameAnswer(local, committed)) {
                    saved.push(committed);
                } else if (baseEntry && sameAnswer(local, baseEntry)) {
                    if (committed) saved.push(committed);
                } else {
                    saved.push(local);
                }
            }
            for (const committed of entries) {
                if (saved.some(existing => matchesEntry(existing, committed))) continue;
                const baseEntry = base.find(entry => matchesEntry(committed, entry));
                if (!baseEntry || !sameAnswer(baseEntry, committed)) {
                    saved.push(committed);
                }
            }
        } else {
            saved = current.map(edit => entries.find(entry => sameAnswer(edit, entry)) ?? edit);
            if (options?.mergeMissing) {
                for (const entry of entries) {
                    if (!saved.some(existing => matchesEntry(existing, entry))) {
                        saved.push(entry);
                    }
                }
            }
        }
        if (!deepEqual(saved, current)) this._explanations.value = cloneValue(saved);
    }

    private assertDraftSnapshot(snapshot: FormDraftSnapshot): void {
        if (snapshot.definitionUrl !== this.definition.url || snapshot.definitionVersion !== this.definition.version) {
            throw new Error('Draft Definition pin does not match the form Definition');
        }
        if (!isJsonRecord(snapshot.data)) throw new TypeError('Draft data must be a JSON object');
    }

    private loadItemsData(items: FormItem[], data: JsonRecord, prefix: string, replace = false): void {
        for (const item of items) {
            const present = Object.prototype.hasOwnProperty.call(data, item.key);
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            const value = present ? data[item.key] : undefined;
            if (item.type === 'field') {
                if ((present || replace) && !this.isCalculated(path)) {
                    this.storeFieldValue(path, value);
                    if (replace) this.writeSources[path].value = null;
                }
                this.loadItemsData(item.children ?? [], data, path, replace);
            } else if (item.type === 'group' && (present || replace)) {
                if (item.repeatable) {
                    const rows = Array.isArray(value) ? value : [];
                    if (this.repeats[path].value > rows.length) {
                        this.clearRepeatSubtree(path, rows.length);
                        this.repeats[path].value = rows.length;
                        this._draftEditDirty = true;
                        this.structureVersion.value += 1;
                    }
                    while (this.repeats[path].value < rows.length) {
                        this.appendRepeatRow(path, item);
                    }
                    rows.forEach((row, index) => {
                        this.loadItemsData(item.children ?? [], isJsonRecord(row) ? row : {}, `${path}[${index}]`, replace);
                    });
                } else {
                    this.loadItemsData(item.children ?? [], isJsonRecord(value) ? value : {}, path, replace);
                }
            }
        }
    }

    private creationContext(pendingPaths?: string[]) {
        return {
            nowIso: this.nowISO(),
            instances: this.instanceData,
            pendingInstances: [...this._pendingInstanceSources],
            pendingPaths,
            subjectType: this._responseSubject && (this._responseSubject.type ?? null),
            subjectKeys: this._responseSubject?.keys,
        };
    }

    private createResponseData(data: JsonRecord, pendingPaths?: string[]): JsonRecord {
        const created = wasmCreateResponse(this.definition, data, this.creationContext(pendingPaths), this._extensionFunctions);
        const refusal = created.diagnostics.find(diagnostic => this.isCalculationRefusal(diagnostic.code));
        if (refusal) throw new Error(refusal.message);
        this._refusedCreation = created.refused ? { pendingPaths } : undefined;
        if (created.refused) {
            // Evaluation reports the authored Definition finding.
            this.loadItemsData(this.definition.items, created.data, '');
            return created.data;
        }
        this._pendingCreationPaths = new Set(created.pending);
        for (const diagnostic of created.diagnostics) {
            this._creationDiagnostics.push(diagnostic);
            // Missing source arrays still use the authored repeat minimum.
            if (diagnostic.code !== 'SEED_SOURCE_UNAVAILABLE') this._failedSeedPaths.add(diagnostic.path);
        }
        this.loadItemsData(this.definition.items, created.data, '');
        return created.data;
    }

    private appendRepeatRow(path: string, item: FormItem): void {
        const index = this.repeats[path].value;
        this._draftEditDirty = true;
        this._rx.batch(() => {
            this.repeats[path].value = index + 1;
            this.registerItems(item.children ?? [], `${path}[${index}]`);
            this.structureVersion.value += 1;
        });
    }

    /** Reindex the surviving rows with their nested shape, values and prefill protection. */
    private rebuildRepeatRows(path: string, item: FormItem, removedIndex: number): void {
        this._draftEditDirty = true;
        const children = item.children ?? [];
        const rows: RepeatRowSnapshot[] = [];
        for (let current = 0; current < this.repeats[path].value; current += 1) {
            if (current === removedIndex) continue;
            rows.push(snapshotRepeatRow(
                children,
                `${path}[${current}]`,
                fieldPath => ({
                    value: this._data[fieldPath],
                    writeSource: this.writeSources[fieldPath]?.value ?? null,
                }),
                repeatPath => this.repeats[repeatPath]?.value ?? 0,
            ));
        }

        this._rx.batch(() => {
            this.clearRepeatSubtree(path);
            this.repeats[path].value = rows.length;
            for (const [index, row] of rows.entries()) {
                const rowPath = `${path}[${index}]`;
                this.registerItems(children, rowPath);
                for (const { path: relativePath, item: repeatItem, count } of row.repeats) {
                    const repeatPath = `${rowPath}.${relativePath}`;
                    this.clearRepeatSubtree(repeatPath);
                    this.repeats[repeatPath].value = count;
                    for (let nested = 0; nested < count; nested += 1) {
                        this.registerItems(repeatItem.children ?? [], `${repeatPath}[${nested}]`);
                    }
                }
                for (const { path: relativePath, value, writeSource } of row.fields) {
                    const fieldPath = `${rowPath}.${relativePath}`;
                    this.storeFieldValue(fieldPath, value);
                    this.signals[fieldPath].value = value ?? null;
                    this.writeSources[fieldPath].value = writeSource;
                }
            }

            // The rebuilt signals need their evaluated state even when it matches the old index.
            const previous = this._previousEvalResult;
            if (previous) {
                const prefix = `${path}[`;
                const keepPath = (fieldPath: string) => !(
                    fieldPath.startsWith(prefix) && Object.prototype.hasOwnProperty.call(this.requiredSignals, fieldPath)
                );
                const keepFlags = (flags: Record<string, boolean>) =>
                    Object.fromEntries(Object.entries(flags).filter(([fieldPath]) => keepPath(fieldPath)));
                this._previousEvalResult = {
                    ...previous,
                    nonRelevant: previous.nonRelevant.filter(keepPath),
                    required: keepFlags(previous.required),
                    readonly: keepFlags(previous.readonly),
                    validations: previous.validations.filter(({ path: resultPath, shapeId }) =>
                        shapeId || !resultPath.startsWith(prefix)),
                };
            }
            this.structureVersion.value += 1;
        });
    }

    public compileExpression(expression: string, currentItemName = ''): () => FormFieldValue {
        return () => {
            this._evaluationVersion.value;
            this.instanceVersion.value;
            this.structureVersion.value;
            // compileExpression is a public API — propagate errors (unlike internal evaluation).
            return (parseJsonExact(this.felContext().evaluate(
                expression,
                currentItemName,
                true,
                this.nowISO(),
                this._extensionFunctions,
            )) as { value: FormFieldValue }).value;
        };
    }

    public setValue(name: string, value: FormFieldValue, options: SetValueOptions = {}): void {
        if (typeof name !== 'string') {
            throw new TypeError('setValue path cannot be null');
        }

        const basePath = toBasePath(name);
        const instanceTarget = this.instanceTargetUnlessItem(name, basePath);
        if (instanceTarget) {
            this.writeInstanceValue(instanceTarget.instanceName, instanceTarget.instancePath, value);
            this._evaluate();
            return;
        }

        if (this.writeFieldData(name, value, basePath)) {
            this._pendingCreationPaths.delete(name);
            (this.writeSources[name] ??= this._rx.signal<WriteSource | null>(null)).value = options.source ?? 'user';
            this._evaluate(undefined, false, this.editingData());
        }
    }

    /** Coerces and stores a field value without evaluating; false for calculated or undeclared fields. */
    private writeFieldData(name: string, value: FormFieldValue, basePath = toBasePath(name)): boolean {
        if (this.isCalculated(name, basePath)) {
            return false;
        }

        const item = this._fieldItems.get(basePath);
        if (!item) {
            return false;
        }

        const bind = this.bindAt(name, basePath);
        this.storeFieldValue(name, coerceFieldValue(item, bind, this.definition, value));
        return true;
    }

    private isCalculated(path: string, basePath = toBasePath(path)): boolean {
        return this._calculatedFields.has(basePath) || this._calculatedPaths.has(path);
    }

    private bindAt(path: string, basePath = toBasePath(path)): EngineBindConfig | undefined {
        const indexed = this._indexedBinds[path];
        return indexed ? { ...this._bindConfigs[basePath], ...indexed } : this._bindConfigs[basePath];
    }

    private storeFieldValue(path: string, value: FormFieldValue): void {
        const hadKey = Object.prototype.hasOwnProperty.call(this._data, path);
        if (value === undefined) {
            if (hadKey) {
                delete this._data[path];
                this._draftEditDirty = true;
            }
        } else {
            if (!hadKey || !deepEqual(this._data[path], value)) {
                this._draftEditDirty = true;
            }
            this._data[path] = cloneValue(value);
        }
    }

    /** Whether the evaluator refused the supplied Response subject. */
    public hasSubjectRefusal(): boolean {
        return this.subjectRefusal() !== undefined;
    }

    /** The evaluator's typed finding for a refused Response subject. */
    private subjectRefusal(): EvalResult['validations'][number] | undefined {
        if (this._fullResult?.refused !== true) return undefined;
        return this._fullResult.validations.find(({ path }) =>
            path === '#subjectType' || path === '#subjectKeys' || path.startsWith('#subjectKeys.'));
    }

    public getValidationReport(): ValidationReport;
    public getValidationReport(options: { profile?: EnabledValidationProfile }): ValidationReport;
    public getValidationReport(options: { profile: 'off' }): null;
    public getValidationReport(options?: ValidationReportOptions): ValidationReport | null;
    public getValidationReport(options: ValidationReportOptions = { profile: 'live' }): ValidationReport | null {
        this.assertValidationReportOptions(options, 'getValidationReport');
        const profile = options.profile ?? 'live';
        const trigger = this._validationProfileResolver.resolve(profile);
        if (trigger === 'disabled') {
            return null;
        }
        return this.produceValidation(trigger).report;
    }

    /** Report for `trigger` plus the expression diagnostics of the evaluation that produced it. */
    private produceValidation(trigger: Exclude<ValidationTrigger, 'disabled'>): {
        report: ValidationReport;
        diagnostics: EvalDiagnostic[];
    } {
        let results: ValidationResult[] = [];
        let diagnostics = this._fullResult?.diagnostics ?? [];
        const timestamp = this.nowISO();

        if (trigger === 'continuous') {
            for (const [path, signalRef] of Object.entries(this.validationResults)) {
                if (this.isPathRelevant(path)) {
                    results.push(...signalRef.value);
                }
            }

            for (const signalRef of Object.values(this.shapeResults)) {
                results.push(...signalRef.value);
            }
        } else {
            const result = this.evaluateResultForTrigger(trigger, timestamp);
            diagnostics = result.diagnostics;
            results = this.collectResponseValidationResults(result, trigger);
        }

        return {
            report: buildValidationReportEnvelope(
                results,
                timestamp,
                this.definition.url,
                this.definition.version,
            ),
            diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
        };
    }

    private collectResponseValidationResults(
        result: EvalResult,
        trigger: Exclude<ValidationTrigger, 'disabled'>,
    ): ValidationResult[] {
        if (trigger === 'demand') {
            return collectTimedShapeValidationResults(result, this._shapeTiming, 'demand');
        }
        if (trigger === 'submit') {
            return [
                ...result.validations.map(toValidationResult),
                ...collectRelevantValidationResults(result, this._externalValidation as unknown as EvalValidation[]),
            ];
        }
        return collectRelevantValidationResults(result);
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

    public whyRelevant(path: string): RelevanceExplanation {
        const basePath = toBasePath(path);
        const bindPath = this.findGoverningRelevanceBindPath(basePath);
        if (!bindPath) {
            return {
                bindId: null,
                expression: null,
                dependsOn: [],
                evaluatedAs: this.isPathRelevant(path),
            };
        }

        const expression = this._bindConfigs[bindPath]?.relevant ?? null;
        return {
            bindId: bindPath,
            expression,
            dependsOn: expression ? this.expressionDependencies(expression, bindPath) : [],
            evaluatedAs: this.relevantSignals[bindPath]?.value ?? this.isPathRelevant(bindPath),
        };
    }

    public getDerivationTree(path: string): FelTraceStep[] {
        const basePath = toBasePath(path);
        const calculate = this._bindConfigs[basePath]?.calculate;
        if (!calculate) {
            return [];
        }

        const version = this._evaluationVersion.value;
        const cached = this._derivationTraceCache.get(path);
        if (cached && cached.version === version) {
            return cached.trace.map((step) => cloneValue(step) as FelTraceStep);
        }

        try {
            const result = parseJsonExact(this.felContext().evaluateTrace(
                calculate,
                path,
                true,
                this.nowISO(),
                this._extensionFunctions,
            )) as FelTraceResult;
            const trace = Array.isArray(result.trace) ? result.trace : [];
            this._derivationTraceCache.set(path, {
                version,
                trace: trace.map((step) => cloneValue(step) as FelTraceStep),
            });
            return trace.map((step) => cloneValue(step) as FelTraceStep);
        } catch {
            return [];
        }
    }

    public getDownstreamImpact(path: string): string[] {
        const source = toBasePath(path);
        const edges = this.downstreamDependencyEdges();
        const impacted = new Set<string>();
        const queue = [source];

        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const [dependency, targets] of edges.entries()) {
                if (!FormEngine.pathDependencyMatches(current, dependency)) {
                    continue;
                }
                for (const target of targets) {
                    if (target === source || impacted.has(target)) {
                        continue;
                    }
                    impacted.add(target);
                    queue.push(target);
                }
            }
        }

        return [...impacted].sort();
    }

    public getFieldPaths(): string[] {
        return Object.keys(this._fieldViewModels).sort();
    }

    /** Read the current field flags and the requested validation profile, which defaults to live. */
    public getEvaluatedFormState(options: ValidationReportOptions = {}): EvaluatedFormState {
        // A repeat can add or remove the only field signals between evaluations.
        this._evaluationVersion.value;
        const fields = Object.keys(this._fieldViewModels).map(path => ({
            path,
            relevant: this.isPathRelevant(path),
            readonly: this.readonlySignals[path]?.value ?? false,
            required: this.requiredSignals[path]?.value ?? false,
            empty: isEmptyValue(this.signals[path]?.value),
        }));
        return { fields, report: this.getValidationReport(options) };
    }

    public getResponse(meta?: Parameters<FormEngine['getResponseSnapshot']>[0]): FormResponse {
        return this.getResponseSnapshot(meta).response;
    }

    /** Capture response data and its requested validation report with one clock. */
    public getResponseSnapshot(
        meta?: Parameters<IFormEngine['getResponse']>[0],
        validationProfile?: ValidationProfile,
    ): { response: FormResponse; validationReport: ValidationReport | null } {
        return this.captureSnapshotInternal(meta, validationProfile, false).snapshot;
    }

    /**
     * Evaluate Submit once at the current clock and either emit the assembled candidate or return
     * an in-progress snapshot with `pendingExplanationStamps: true` when selected explanations lack stamps.
     */
    public captureSubmitSnapshot(
        meta?: Parameters<IFormEngine['getResponse']>[0],
    ): {
        snapshot: { response: FormResponse; validationReport: ValidationReport | null };
        pendingExplanationStamps: boolean;
    } {
        return this.captureSnapshotInternal({ ...meta, profile: 'on-submit' }, 'on-submit', true);
    }

    private captureSnapshotInternal(
        meta: Parameters<IFormEngine['getResponse']>[0] | undefined,
        validationProfile: ValidationProfile | undefined,
        allowPendingExplanationStamps: boolean,
    ): {
        snapshot: { response: FormResponse; validationReport: ValidationReport | null };
        pendingExplanationStamps: boolean;
    } {
        this.assertNoRemovedModeOption(meta, 'getResponse');
        if (meta?.subject && (this._responseSubject || this.definition.subject || 'keys' in meta.subject)) {
            throw new Error('Supply filing-unit identity through the responseSubject constructor option');
        }
        // A refused subject has no Core id; its Response would be schema-invalid, so none is emitted.
        const subjectRefusal = this.subjectRefusal();
        if (subjectRefusal) {
            throw new Error(`Response subject refused: ${subjectRefusal.path}: ${subjectRefusal.message}`);
        }
        const profile = meta?.profile ?? 'live';
        const responseTrigger = this._validationProfileResolver.resolve(profile);
        const trigger = this._validationProfileResolver.resolve(validationProfile ?? profile);
        const timestamp = this.nowISO();
        let instances: JsonRecord | undefined;
        let changedInstance: string | undefined;
        if (responseTrigger === 'submit' && trigger === 'submit') {
            const hasResponseInstances = Object.values(this.definition.instances ?? {}).some(instance => Boolean(instance.response));
            if ((hasResponseInstances || this._explanations.value.length > 0) && meta?.authoredSignatures?.length) {
                throw new Error('Capture the unsigned Response candidate before attaching signatures');
            }
            for (const [name, instance] of Object.entries(this.definition.instances ?? {})) {
                if (!instance.response) continue;
                instances ??= { ...this.instanceData };
                const delivery = this._responseInstanceResolutions[name];
                if (!delivery) continue;
                if (!deepEqual(delivery.value, instances[name])) {
                    changedInstance ??= name;
                    continue;
                }
                // Use the delivered value when evaluating a potential signing candidate.
                instances[name] = delivery.value as JsonValue;
            }
        }
        const responseResult = this.evaluateResultForTrigger(responseTrigger, timestamp, { instances });
        const data = responseTrigger === 'submit'
            ? cloneValue(responseResult.data)
            : this.draftResponseData(responseResult);
        const validationResult = trigger === 'disabled'
            ? null
            : trigger === responseTrigger
                ? responseResult
                : this.evaluateResultForTrigger(trigger, timestamp);
        const report = trigger === 'disabled' ? null : buildValidationReportEnvelope(
            this.collectResponseValidationResults(validationResult!, trigger),
            timestamp,
            this.definition.url,
            this.definition.version,
        );
        const submitEvalResult = responseTrigger === 'submit'
            ? responseResult
            : trigger === 'submit'
                ? validationResult
                : null;
        let response = buildFormspecResponseEnvelope({
            definition: this.definition,
            data,
            report: responseTrigger === 'disabled' ? null : report,
            completionEligible: responseTrigger === 'submit' && trigger === 'submit',
            timestamp,
            displayedIssuer: this.getDisplayedIssuerPin(),
            displayedLocale: this.getDisplayedLocalePin(),
            subject: cloneValue(this._responseSubject ?? meta?.subject),
            meta,
        }) as unknown as FormResponse;
        const draftEntries = this._explanations.value;
        let pendingExplanationStamps = false;
        if (response.status === 'completed') {
            let saved: Explanation[] | undefined;
            if (draftEntries.length) {
                const entries = responseResult.candidateExplanations;
                if (!entries) throw new Error('Submit evaluation did not assemble the warning explanations');
                saved = entries.filter(isStamped);
                if (saved.length !== entries.length) {
                    if (!allowPendingExplanationStamps) {
                        throw new Error('Save pending warning answers and load their server stamps before emitting this Response');
                    }
                    pendingExplanationStamps = true;
                    this.refreshExplanationState(warningReview(responseResult, draftEntries));
                    response = buildFormspecResponseEnvelope({
                        definition: this.definition,
                        data: this.draftResponseData(responseResult),
                        report: null,
                        completionEligible: false,
                        timestamp,
                        displayedIssuer: this.getDisplayedIssuerPin(),
                        displayedLocale: this.getDisplayedLocalePin(),
                        subject: cloneValue(this._responseSubject ?? meta?.subject),
                        meta,
                    }) as unknown as FormResponse;
                    const stampedDraft = draftEntries.filter(isStamped);
                    if (stampedDraft.length) response.explanations = cloneValue(stampedDraft);
                }
            }
            if (!pendingExplanationStamps && (instances || draftEntries.length)) {
                if (instances && changedInstance !== undefined) {
                    throw new Error(`Response instance '${changedInstance}' changed after resolution`);
                }
                if (draftEntries.length) {
                    response.explanations = cloneValue(draftEntries) as Explanation[];
                }
                response = wasmAssembleCandidate(
                    this.definition,
                    response,
                    this._responseInstanceResolutions,
                    draftEntries.length ? { candidateExplanations: saved ?? [] } : null,
                );
            }
        } else {
            if (draftEntries.length) {
                const saved = draftEntries.filter(isStamped);
                if (saved.length) response.explanations = cloneValue(saved);
            }
            if (
                submitEvalResult
                && report?.results.some(r => r.code === 'EXPLANATION_STALE' || r.code === 'EXPLANATION_REQUIRED')
            ) {
                // Publish the fresh Submit evaluation to warning controls so clock-only expiry/expansion
                // immediately reopens accepted groups without a second evaluation.
                this.refreshExplanationState(warningReview(submitEvalResult, draftEntries));
            }
        }
        return { snapshot: { response, validationReport: report }, pendingExplanationStamps };
    }

    private draftResponseData(result: EvalResult): Record<string, unknown> {
        const data = cloneValue(result.data);
        for (const path of [...this._pendingCreationPaths, ...this._failedSeedPaths]) {
            if (!this.repeats[path]) continue;
            const parentPath = parentPathOf(path);
            const parent = getNestedValue(data, parentPath);
            if (isJsonRecord(parent)) {
                delete parent[path.slice(parentPath ? parentPath.length + 1 : 0)];
            }
        }
        return data;
    }

    public getDiagnosticsSnapshot(options: ValidationReportOptions = { profile: 'live' }): FormEngineDiagnosticsSnapshot {
        this.assertValidationReportOptions(options, 'getDiagnosticsSnapshot');
        const trigger = this._validationProfileResolver.resolve(options.profile ?? 'live');
        const validation = trigger === 'disabled'
            ? { report: null, diagnostics: (this._fullResult?.diagnostics ?? []).map((diagnostic) => ({ ...diagnostic })) }
            : this.produceValidation(trigger);
        const values: JsonRecord = {};
        const mips: FormEngineDiagnosticsSnapshot['mips'] = {};
        const repeats: Record<string, number> = {};

        for (const [path, repeatSignal] of Object.entries(this.repeats)) {
            repeats[path] = repeatSignal.value;
        }

        for (const [path, signalRef] of Object.entries(this.signals)) {
            values[path] = (cloneValue(signalRef.value) ?? null) as JsonValue;
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
            validation: validation.report,
            evaluationDiagnostics: [...this._creationDiagnostics.map(diagnostic => ({ ...diagnostic })), ...validation.diagnostics],
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
                    this.assertNoRemovedModeOption(event, 'getValidationReport replay event');
                    return { ok: true, event, output: this.getValidationReport({ profile: event.profile }) };
                case 'getResponse':
                    this.assertNoRemovedModeOption(event, 'getResponse replay event');
                    return { ok: true, event, output: this.getResponse({ profile: event.profile }) };
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
        this._labelContextSignal.value = context;
    }

    /** Definition label for the active label context (no Locale, no `{{}}`); reactive to `setLabelContext`. */
    public getLabel(item: FormItem): string {
        const context = this._labelContextSignal.value;
        if (context && item.labels?.[context]) {
            return item.labels[context];
        }
        return item.label;
    }

    /**
     * Reactive label a respondent sees for the Item at instance `path` — field, display, or group (a repeat row
     * path such as `jobs[0]` names its group). Same cascade as `FieldViewModel.label` (Locale
     * `<key>.label@context` → `<key>.label` → `labels[context]` → inline), `{{}}` interpolated in the Item's
     * scope. `undefined` when no Item has that path.
     */
    public getItemLabelSignal(path: string): ReadonlyEngineSignal<string> | undefined {
        const fieldVM = this._fieldViewModels[path];
        if (fieldVM) {
            return fieldVM.label;
        }
        const cached = this._itemLabelSignals.get(path);
        if (cached) {
            return cached;
        }
        const item = path ? this._groupItems.get(path) ?? this._groupItems.get(toBasePath(path)) : undefined;
        if (!item) {
            return undefined;
        }
        const label = this._rx.computed(() => resolveItemLabel({
            localeStore: this._localeStore,
            itemKey: item.key,
            inlineLabel: item.label,
            labels: item.labels,
            context: this._labelContextSignal.value,
            interpolate: (template) => this._interpolate(template, path),
        }).value);
        this._itemLabelSignals.set(path, label);
        return label;
    }

    /**
     * Reactive hint a respondent sees for the Item at instance `path` — field, display, or group. Same
     * cascade as `FieldViewModel.hint` (Locale `<key>.hint@context` → `<key>.hint` → inline `hint`; no
     * Definition-side context step), `{{}}` interpolated in the Item's scope. `null` when no source has
     * one; `undefined` when no Item has that path.
     */
    public getItemHintSignal(path: string): ReadonlyEngineSignal<string | null> | undefined {
        return this.itemHelpTextSignal(path, 'hint');
    }

    /** {@link FormEngine.getItemHintSignal} for the Item's `description`. */
    public getItemDescriptionSignal(path: string): ReadonlyEngineSignal<string | null> | undefined {
        return this.itemHelpTextSignal(path, 'description');
    }

    private itemHelpTextSignal(
        path: string,
        property: 'hint' | 'description',
    ): ReadonlyEngineSignal<string | null> | undefined {
        const fieldVM = this._fieldViewModels[path];
        if (fieldVM) {
            return property === 'hint' ? fieldVM.hint : fieldVM.description;
        }
        const key = `${property}:${path}`;
        const cached = this._itemHelpTextSignals.get(key);
        if (cached) {
            return cached;
        }
        const item = path ? this._groupItems.get(path) ?? this._groupItems.get(toBasePath(path)) : undefined;
        if (!item) {
            return undefined;
        }
        const resolved = this._rx.computed(() => resolveItemHelpText({
            localeStore: this._localeStore,
            itemKey: item.key,
            property,
            inlineText: item[property],
            context: this._labelContextSignal.value,
            interpolate: (template) => this._interpolate(template, path),
        }).value);
        this._itemHelpTextSignals.set(key, resolved);
        return resolved;
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

    public resolveValidationMessage(result: ValidationResult): string {
        return this._fieldViewModels[result.path]?.resolveMessage(result) ?? result.message;
    }

    public getFormVM(): FormViewModel {
        return this._formViewModel;
    }

    public resolveLocaleString(key: string, fallback: string, itemPath = ''): string {
        const localized = this._localeStore.lookupKey(key);
        if (localized !== null) {
            return this._interpolate(localized, itemPath);
        }
        return fallback;
    }

    /**
     * Raw Locale string for `key`, or `null` when no loaded document (through the fallback cascade, §4)
     * carries it. Unlike {@link resolveLocaleString}, this never runs `{{}}` through FEL — for chrome
     * strings (Locale §3.1.10 `$ui.<ChromeStringKey>`), whose `{{$param}}` placeholders are renderer-
     * supplied literals (`$label`, `$index`, ...), not form-scope FEL.
     */
    public lookupLocaleString(key: string): string | null {
        return this._localeStore.lookupKey(key);
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
        this._disposed = true;
        this._instanceSourceAbort.abort();
        // The only owned WASM allocation is the resident FEL context; signals need no teardown.
        this._felContext?.handle.free();
        this._felContext = null;
    }

    public registerExtensionFunction(name: string, registration: FelExtensionFunctionRegistration): void {
        this._extensionFunctions.register(name, registration);
        this._evaluate();
    }

    public setRegistryEntries(entries: RegistryEntry[]): void {
        this._registryEntries.clear();
        for (const entry of entries) {
            if (entry?.name) {
                this._registryEntries.set(entry.name, entry);
            }
        }
        this._registryDocuments = [{ entries }];
        this._evaluate();
    }

    public migrateResponse(responseData: JsonRecord, fromVersion: string): JsonRecord {
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
                                  ...(option['x-generation']
                                      ? { 'x-generation': option['x-generation'] }
                                      : {}),
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
        // Resolve a display-only copy; evaluation always receives the authored Definition.
        visit(resolveOptionSetsOnDefinition(this.definition).items);
    }

    private initializeInstances(loadExternalSources: boolean): void {
        const instances = this.definition.instances;
        if (!instances) {
            return;
        }

        for (const [name, instance] of Object.entries(instances)) {
            const delivery = instance.response && this._responseInstanceResolutions[name];
            if (delivery) {
                this.instanceData[name] = cloneValue(delivery.value) as JsonValue;
                continue;
            }
            if (instance.data !== undefined) {
                const seedData = cloneValue(instance.data) as JsonValue;
                this.validateInstanceSchema(name, seedData);
                this.instanceData[name] = seedData;
            }
            if (loadExternalSources) this.initializeInstanceSource(name, instance);
        }
    }

    /**
     * The HTTP(S) URL an instance `source` names, or null when it names something the engine does not fetch —
     * a host-provided scheme such as `formspec-fn:`, or a relative reference with no page to resolve it.
     * On a page, a relative reference resolves against `document.baseURI` like any other relative reference,
     * so `./data/claimant.json` beside a Definition works under whatever path the site is served from.
     * Elsewhere (a server, a test) an absolute URL or a root path is passed through as written.
     */
    private static resolveInstanceSource(source: string): string | null {
        const base = typeof document !== 'undefined' ? document.baseURI : undefined;
        if (base) {
            try {
                const url = new URL(source, base);
                return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
            } catch {
                return null;
            }
        }
        return /^https?:\/\//i.test(source) || source.startsWith('/') ? source : null;
    }

    private initializeInstanceSource(name: string, instance: FormInstance): void {
        if (!instance.source) return;
        const resolver = this._instanceSourceResolver;
        const source = resolver ? instance.source : FormEngine.resolveInstanceSource(instance.source);
        if (!source) {
            this._instanceSourceOutcomes[name] = { status: 'unavailable', reason: 'Unsupported source' };
            return;
        }
        if (!resolver && instance.static && FormEngine.instanceSourceCache.has(source)) {
            try {
                const cached = FormEngine.instanceSourceCache.get(source)!;
                this.validateInstanceSchema(name, cached);
                this.instanceData[name] = cloneValue(cached) as JsonValue;
                this._instanceSourceOutcomes[name] = { status: 'loaded' };
            } catch (error) {
                this._instanceSourceOutcomes[name] = { status: 'unavailable', reason: sourceErrorMessage(error) };
            }
            return;
        }

        this._pendingInstanceSources.add(name);
        const signal = this._instanceSourceAbort.signal;
        const request = freezeSourceMetadata(cloneValue({
            instanceName: name, source: instance.source,
            definition: { url: this.definition.url, version: this.definition.version },
            ...(instance.schema ? { schema: instance.schema } : {}),
            static: instance.static === true, readonly: instance.readonly !== false,
        }));
        const task = new Promise<void>((settle) => {
            const abort = () => {
                this._instanceSourceOutcomes[name] = { status: 'aborted' };
                this._pendingInstanceSources.delete(name);
                settle();
            };
            signal.addEventListener('abort', abort, { once: true });
            let installed = false;
            let previous: JsonValue | undefined;
            let hadPrevious = false;
            Promise.resolve().then(async () => {
                if (signal.aborted || this.hasSubjectRefusal()) return;
                let payload: JsonValue;
                if (resolver) {
                    const result = readSourceResult(await resolver(request, Object.freeze({ signal })));
                    if (this._disposed) return;
                    if (result.status === 'unavailable') {
                        this._instanceSourceOutcomes[name] = result;
                        return;
                    }
                    payload = result.value;
                    if (instance.schema && !isJsonRecord(payload)) {
                        throw new Error(`Instance '${name}' schema requires an object`);
                    }
                } else {
                    const response = await fetch(source, { signal });
                    if (!response.ok) throw new Error(`Instance source fetch failed (${response.status})`);
                    payload = parseJsonExact(await response.text()) as JsonValue;
                }
                if (this._disposed) return;
                this.validateInstanceSchema(name, payload);
                const nextValue = cloneValue(payload);
                hadPrevious = Object.prototype.hasOwnProperty.call(this.instanceData, name);
                previous = this.instanceData[name];
                Object.defineProperty(this.instanceData, name, { value: nextValue, enumerable: true, writable: true, configurable: true });
                installed = true;
                this.instanceVersion.value += 1;
            }).catch((error) => {
                if (this._disposed) return;
                this._instanceSourceOutcomes[name] = { status: 'unavailable', reason: sourceErrorMessage(error) };
                try { console.error(`Failed to load instance source '${name}':`, error); } catch { /* Diagnostics must not prevent settlement. */ }
            }).then(() => {
                // Always release waits, even when reactive seeding or evaluation unexpectedly fails.
                signal.removeEventListener('abort', abort);
                try {
                    if (this._disposed) return;
                    this._pendingInstanceSources.delete(name);
                    const data = this._pendingCreationPaths.size > 0
                        ? this.createResponseData(
                            this._refusedInput ?? this.editingData(), [...this._pendingCreationPaths])
                        : undefined;
                    this._evaluate(undefined, false, data);
                    if (installed) {
                        if (!resolver && instance.static) FormEngine.instanceSourceCache.set(source, cloneValue(this.instanceData[name]));
                        this._instanceSourceOutcomes[name] = { status: 'loaded' };
                    }
                } catch (error) {
                    if (installed) {
                        if (hadPrevious) Object.defineProperty(this.instanceData, name, { value: previous, enumerable: true, writable: true, configurable: true });
                        else delete this.instanceData[name];
                        this.instanceVersion.value += 1;
                    }
                    this._instanceSourceOutcomes[name] = { status: 'failed', reason: sourceErrorMessage(error) };
                    // Primary seeding may have partially applied; this engine must be replaced.
                    this.dispose();
                } finally {
                    this._pendingInstanceSources.delete(name);
                    settle();
                }
            });
        });
        this._instanceSourceTasks.push(task);
    }

    private initializeBindConfigs(items: FormItem[], prefix = ''): void {
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            this._groupItems.set(path, item);
            if (item.type === 'field') {
                this._fieldDataTypes[path] = item.dataType;
            }
            if (item.children) {
                this.initializeBindConfigs(item.children, path);
            }
        }

        for (const bind of this.definition.binds ?? []) {
            // Core §4.3.3 / Rust BindTargets: only `[*]` is stripped; a concrete `[n]` names no Item.
            const path = bind.path.replace(/\[\*\]/g, '');
            this._bindConfigs[path] = { ...this._bindConfigs[path], ...(bind as EngineBindConfig), path };
            if (bind.calculate) {
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

    /**
     * Core §4.3.3 / §3.10.1: a Bind path resolves to an Item, so one naming an instance (`instances.<name>…`,
     * `@instance('<name>')…`) is a definition error. Instance data is host-written (`setInstanceValue`).
     */
    private rejectInstancePathBinds(): void {
        for (const bind of this.definition.binds ?? []) {
            if (this.instanceTargetUnlessItem(bind.path, bind.path.replace(/\[\*\]/g, ''))) {
                throw new Error(
                    `Bind path '${bind.path}' names an instance, not an Item (Core §4.3.3); `
                    + 'write instance data with setInstanceValue',
                );
            }
        }
    }

    /** `instances` is a legal Item key, so a path whose `itemPath` names an Item is that Item, never an instance target. */
    private instanceTargetUnlessItem(path: string, itemPath: string): ReturnType<typeof parseInstanceTarget> {
        return this._groupItems.has(itemPath) ? null : parseInstanceTarget(path);
    }

    private registerItems(items: FormItem[], prefix = ''): void {
        for (const item of items) {
            const path = prefix ? `${prefix}.${item.key}` : item.key;
            this._groupItems.set(path, item);
            this.relevantSignals[path] ??= this._rx.signal(true);
            this.requiredSignals[path] ??= this._rx.signal(false);
            this.readonlySignals[path] ??= this._rx.signal(false);
            this.validationResults[path] ??= this._rx.signal([]);
            this.writeSources[path] ??= this._rx.signal<WriteSource | null>(null);
            this.errorSignals[path] ??= this._rx.signal(null);

            if (item.type === 'field') {
                this._fieldItems.set(toBasePath(path), item);
                this.signals[path] ??= this._rx.signal(null);
                this._createFieldVM(path, item);
                if (item.children) {
                    this.registerItems(item.children, path);
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
                this.repeats[path] = this._rx.signal(0);
            } else {
                this.registerItems(item.children ?? [], path);
            }
        }
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

    private writeInstanceValue(instanceName: string, path: string | undefined, value: FormFieldValue): void {
        const instance = this.definition.instances?.[instanceName];
        if (!instance) {
            throw new Error(`Unknown instance '${instanceName}'`);
        }
        if (instance.readonly !== false) {
            throw new Error(`Instance '${instanceName}' is readonly`);
        }

        let nextValue: JsonValue;
        if (!path) {
            nextValue = cloneValue(value) as JsonValue;
        } else {
            nextValue = cloneValue(this.instanceData[instanceName] ?? {}) as JsonValue;
            setNestedPathValue(
                nextValue as Record<string, JsonValue>,
                path,
                cloneValue(value) as JsonValue,
            );
        }
        this.validateInstanceSchema(instanceName, nextValue);
        if (deepEqual(this.instanceData[instanceName], nextValue)) {
            return;
        }
        this.instanceData[instanceName] = nextValue;
        this.instanceVersion.value += 1;
    }

    private validateInstanceSchema(instanceName: string, data: JsonValue): void {
        const schema = this.definition.instances?.[instanceName]?.schema;
        validateInstanceDataAgainstSchema(
            instanceName,
            data,
            schema && typeof schema === 'object' ? (schema as Record<string, unknown>) : undefined,
        );
    }

    /**
     * The locale FEL formats and reports: the host's runtime locale when it set one, else the Locale
     * document currently selected — so `setLocale('fr')` alone renders French dates, and the patterns
     * `dateFormats` carries always belong to the same locale the built-in rendering falls back to.
     */
    private felLocale(): string | undefined {
        return this._runtimeContext.locale ?? (this._localeStore.activeLocale.value || undefined);
    }

    /**
     * WASM-resident FEL context for ad-hoc reads (compileExpression, Locale `{{}}`, derivation trace).
     *
     * The form-scope snapshot is loaded once per engine state: values, MIPs, and results change only through
     * `_evaluate` (evaluation version), rows through structure changes, instances through the instance
     * version. Reading those signals also re-runs a caller's computed whenever the snapshot would change.
     * Each read then names only its expression and Item path, so it costs the scope it resolves against
     * rather than the size of the form.
     */
    private felContext(): WasmFelContextHandle {
        // The Locale version is part of the key: a switch changes the date patterns the snapshot carries.
        const key = `${this._evaluationVersion.value}:${this.structureVersion.value}:${this.instanceVersion.value}:${this._localeStore.version.value}`;
        if (!this._felContext) {
            this._felContext = {
                key: '',
                handle: wasmCreateFelContext(felContextSchema(
                    this._fieldDataTypes,
                    this._bindConfigs,
                    [...this._groupItems.keys()].filter(path => !path.includes('[')),
                )),
            };
        }
        if (this._felContext.key !== key) {
            this._felContext.handle.load(JSON.stringify(felContextSnapshot({
                data: this._data,
                fullResult: this._fullResult,
                repeats: this.repeats,
                instanceData: this.instanceData,
                locale: this.felLocale(),
                dateFormats: this._localeStore.dateFormats() ?? undefined,
                meta: this._runtimeContext.meta,
                subjectKeys: this._responseSubject?.keys,
            })));
            this._felContext.key = key;
        }
        return this._felContext.handle;
    }

    private relevanceBindPathCandidates(path: string): string[] {
        const parts = splitIndexedPath(path);
        const candidates: string[] = [];
        let current = '';
        for (const part of parts) {
            current = current ? appendPath(current, part) : part;
            candidates.push(toBasePath(current));
        }
        return candidates;
    }

    private findGoverningRelevanceBindPath(path: string): string | null {
        const candidates = this.relevanceBindPathCandidates(path);
        for (const candidate of candidates) {
            if (this._bindConfigs[candidate]?.relevant && this.relevantSignals[candidate]?.value === false) {
                return candidate;
            }
        }
        for (const candidate of candidates.reverse()) {
            if (this._bindConfigs[candidate]?.relevant) {
                return candidate;
            }
        }
        return null;
    }

    private expressionDependencies(expression: string, currentPath = ''): string[] {
        return [...this.collectExpressionDependencies(expression, currentPath, new Set())].sort();
    }

    private collectExpressionDependencies(
        expression: string,
        currentPath: string,
        seenVariables: Set<string>,
    ): Set<string> {
        const dependencies = new Set<string>();
        try {
            for (const dependency of getFELDependencies(expression)
                .map(FormEngine.normalizeDependencyPath)
                .filter((dependency) => dependency.length > 0)) {
                dependencies.add(dependency);
            }
        } catch {
            // Static dependency extraction is best-effort; callers treat missing deps as no impact.
        }

        for (const variableDef of this.visibleVariableDefinitions(expression, currentPath)) {
            const scope = this.variableScopePath(variableDef.scope);
            const key = `${scope}:${variableDef.name}`;
            if (seenVariables.has(key)) {
                continue;
            }
            seenVariables.add(key);
            const variablePath = scope === '#' ? '' : scope;
            for (const dependency of this.collectExpressionDependencies(
                variableDef.expression,
                variablePath,
                seenVariables,
            )) {
                dependencies.add(dependency);
            }
        }

        return dependencies;
    }

    private variableScopePath(scope = '#'): string {
        if (scope === '#' || this._groupItems.has(scope)) return scope;
        for (const [path, item] of this._groupItems) {
            if (!path.includes('[') && item.key === scope) return path;
        }
        return scope;
    }

    private visibleVariableDefinitions(expression: string, currentPath: string): FormVariable[] {
        let names: string[];
        try {
            const analysis = analyzeFEL(expression);
            names = Array.isArray(analysis.variables) ? analysis.variables : [];
        } catch {
            return [];
        }
        const definitions: FormVariable[] = [];
        const scopes = ['#', ...getScopeAncestors(currentPath)];
        for (const name of names) {
            let visible: FormVariable | undefined;
            for (const scope of scopes) {
                for (const variableDef of this._variableDefs) {
                    if (variableDef.name === name && this.variableScopePath(variableDef.scope) === scope) {
                        visible = variableDef;
                    }
                }
            }
            if (visible) {
                definitions.push(visible);
            }
        }
        return definitions;
    }

    private downstreamDependencyEdges(): Map<string, Set<string>> {
        const edges = new Map<string, Set<string>>();
        const addEdges = (targetPath: string, expressions: Array<string | boolean | undefined>): void => {
            const target = targetPath === '#' ? '#' : toBasePath(targetPath);
            for (const expression of expressions) {
                if (typeof expression !== 'string' || expression.length === 0) {
                    continue;
                }
                for (const dependency of this.expressionDependencies(expression, target)) {
                    if (dependency === target) {
                        continue;
                    }
                    const targets = edges.get(dependency) ?? new Set<string>();
                    targets.add(target);
                    edges.set(dependency, targets);
                }
            }
        };

        for (const bind of Object.values(this._bindConfigs)) {
            addEdges(bind.path, [
                bind.calculate,
                bind.relevant,
                bind.required,
                bind.readonly,
                bind.constraint,
            ]);
        }

        for (const shape of this.definition.shapes ?? []) {
            const composedExpressions = [
                ...(shape.and ?? []),
                ...(shape.or ?? []),
                ...(shape.xone ?? []),
                shape.not,
            ].filter((entry): entry is string => typeof entry === 'string');
            addEdges(shape.target, [
                shape.constraint,
                shape.activeWhen,
                ...composedExpressions,
            ]);
        }

        return edges;
    }

    private static normalizeDependencyPath(path: string): string {
        return toBasePath(path.replace(/^\$/, '').replace(/^\./, ''));
    }

    private static pathDependencyMatches(source: string, dependency: string): boolean {
        return source === dependency
            || source.startsWith(`${dependency}.`)
            || dependency.startsWith(`${source}.`);
    }

    private assertNoRemovedModeOption(options: unknown, method: string): void {
        if (options && typeof options === 'object' && 'mode' in options) {
            throw new Error(`${method}: { mode } removed; pass { profile } instead. See packages/formspec-engine/README.md.`);
        }
    }

    private assertValidationReportOptions(options: unknown, method: string): void {
        this.assertNoRemovedModeOption(options, method);
        if (!options || typeof options !== 'object') {
            return;
        }
        for (const key of Object.keys(options)) {
            if (key !== 'profile') {
                throw new Error(`${method}: unknown validation option '${key}'; pass { profile }.`);
            }
        }
    }

    private shapedEvalResult(base: EvalResult): EvalResult {
        return mergeWasmEvalWithExternalValidations(base, {
            externalValidations: this._externalValidation as unknown as EvalValidation[],
        });
    }

    private isCalculationRefusal(code: unknown): boolean {
        return code === 'CIRCULAR_DEPENDENCY' || code === 'CALCULATE_TARGET_CONFLICT';
    }

    private _evaluate(
        previousResult: Pick<EvalResult, 'nonRelevant'> | null = this._fullResult,
        constructing = false,
        input = this._refusedInput ?? this.editingData(),
    ): void {
        // Retry new Response creation if the host has since supplied a valid input or extension.
        const data = this._refusedCreation && !constructing
            ? this.createResponseData(input, this._refusedCreation.pendingPaths)
            : input;
        const baseResult = wasmEvaluateDefinition(
            this.definition,
            data,
            wasmEvaluateDefinitionPayload({
                nowIso: this.nowISO(),
                previousResult,
                instances: this.instanceData,
                registryDocuments: this._registryDocuments,
                subjectType: this._responseSubject && (this._responseSubject.type ?? null),
                subjectKeys: this._responseSubject?.keys,
            }),
            this._extensionFunctions,
        ) as EvalResult;
        const refusal = baseResult.validations.find(result => this.isCalculationRefusal(result.code));
        if (refusal && constructing) {
            throw new Error(String(refusal.message));
        }
        const evalResult = this.shapedEvalResult(baseResult);
        // Shape timing is enforced in Rust `revalidate` for the default continuous WASM eval;
        // no TS-side filter needed for parity with batch eval.
        const delta = diffEvalResults(this._previousEvalResult, evalResult);
        // Assign before patching: effects that run when the batch closes read `_fullResult` through FEL contexts.
        this._previousEvalResult = evalResult;
        this._fullResult = evalResult;
        this._refusedInput = evalResult.refused ? cloneValue(data) : undefined;
        if (!evalResult.refused) {
            this._calculatedPaths = new Set(evalResult.calculatedPaths);
            this._indexedBinds = evalResult.indexedBinds ?? {};
            // A resumed Response may carry a result for a newly resolved indexed
            // calculation. Discard that result from the editable draft.
            for (const path of this._calculatedPaths) {
                if (Object.prototype.hasOwnProperty.call(this._data, path)) {
                    delete this._data[path];
                    this._draftEditDirty = true;
                }
                if (this._displaySignalPaths.has(path)) this.signals[path] ??= this._rx.signal(null);
            }
        }

        this._rx.batch(() => {
            if (patchValueSignalsFromWasm({
                values: evalResult.values,
                signals: this.signals,
                data: this._data,
                bindAt: (path, basePath) => this.bindAt(path, basePath),
                isCalculated: (path, basePath) => this.isCalculated(path, basePath),
                refused: evalResult.refused,
            })) {
                this._draftEditDirty = true;
            }
            patchDeltaSignalsFromWasm(this._rx, delta, {
                relevantSignals: this.relevantSignals,
                requiredSignals: this.requiredSignals,
                readonlySignals: this.readonlySignals,
                validationResults: this.validationResults,
                shapeResults: this.shapeResults,
                variableSignals: this.variableSignals,
                variableSignalKeys: this._variableSignalKeys,
            });
            patchErrorSignalsFromWasm(this._rx, {
                validationResults: this.validationResults,
                errorSignals: this.errorSignals,
            });
            if (this._draftEditDirty) {
                this._draftEditDirty = false;
                this._draftEditVersion.value += 1;
            }
            this._evaluationVersion.value += 1;
        });
    }

    private evaluateResultForTrigger(
        trigger: ValidationTrigger,
        nowIso = this.nowISO(),
        options: { data?: Record<string, unknown>; instances?: Record<string, unknown> } = {},
    ): EvalResult {
        const data = options.data ?? this._refusedInput ?? this.editingData();
        if (trigger === 'submit') {
            // A reactive report depends on edits, even if every answer was pruned from its data.
            this._evaluationVersion.value;
        }
        const evaluate = trigger === 'submit' ? wasmEvaluateFiled : wasmEvaluateDefinition;
        const result = evaluate(
            this.definition,
            data,
            wasmEvaluateDefinitionPayload({
                nowIso,
                trigger,
                previousResult: options.data === undefined ? this._fullResult : null,
                explanations: this._explanations.value,
                instances: options.instances ?? this.instanceData,
                registryDocuments: this._registryDocuments,
                subjectType: this._responseSubject && (this._responseSubject.type ?? null),
                subjectKeys: this._responseSubject?.keys,
            }),
            this._extensionFunctions,
        ) as EvalResult;
        return trigger === 'submit' || result.refused ? result : this.shapedEvalResult(result);
    }

    private resolveRepeatPath(itemName: string): string {
        return this.repeats[itemName] ? itemName : toBasePath(itemName);
    }

    private clearRepeatSubtree(rootRepeatPath: string, firstIndex = 0): void {
        const repeatPrefix = `${rootRepeatPath}[`;
        const includesPath = (path: string) => path.startsWith(repeatPrefix) && (
            firstIndex === 0 || Number(path.slice(repeatPrefix.length, path.indexOf(']', repeatPrefix.length))) >= firstIndex
        );
        for (const path of Object.keys(this._fieldViewModels)) {
            if (includesPath(path)) {
                delete this._fieldViewModels[path];
            }
        }
        for (const path of this._itemLabelSignals.keys()) {
            if (includesPath(path)) {
                this._itemLabelSignals.delete(path);
            }
        }
        for (const key of this._itemHelpTextSignals.keys()) {
            if (includesPath(key.slice(key.indexOf(':') + 1))) {
                this._itemHelpTextSignals.delete(key);
            }
        }
        clearRepeatIndexedSubtree({
            includesPath,
            signals: this.signals,
            relevantSignals: this.relevantSignals,
            requiredSignals: this.requiredSignals,
            readonlySignals: this.readonlySignals,
            errorSignals: this.errorSignals,
            validationResults: this.validationResults,
            writeSources: this.writeSources,
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
            // Validation results are per instance; options are per template.
            getErrors: () => this.validationResults[path] ?? this._rx.signal([]),
            getConstraintMessage: () => this._bindConfigs[basePath]?.constraintMessage ?? null,
            getOptions: () => this.optionSignals[basePath] ?? this._rx.signal([]),
            getOptionsState: () => this.optionStateSignals[basePath] ?? this._rx.signal({ loading: false, error: null }),
            getOptionSetName: () => item.optionSet,
            setFieldValue: (value, options) => this.setValue(path, value, options),
            getWriteSource: () => (this.writeSources[path] ??= this._rx.signal<WriteSource | null>(null)),
            interpolate: (template) => this._interpolate(template, path),
            interpolateMessage: (template) => this._interpolate(template, path),
        });
        this._fieldViewModels[path] = vm;
    }

    /**
     * Locale §3.3.2: resolve `{{}}` in `template` in the binding scope of `itemPath` (form scope when empty),
     * one WASM call per template. Plain text skips the FEL context, so it tracks no evaluation signals.
     */
    private _interpolate(template: string, itemPath = ''): string {
        if (!template.includes('{{')) {
            return template;
        }
        return (parseJsonExact(this.felContext().interpolate(
            template,
            itemPath,
            true,
            this.nowISO(),
            this._extensionFunctions,
        )) as WasmInterpolated).text;
    }

    private getDisplayedIssuerPin(): { url: string; version: string } | undefined {
        if (
            this._resolvedIssuer
            && this._resolvedIssuerEpoch === this._issuerResolutionEpoch
            && this._resolvedIssuer.source !== 'unbranded'
        ) {
            return {
                url: this._resolvedIssuer.primary.url,
                version: this._resolvedIssuer.primary.version,
            };
        }

        const immediateSource = this._issuerOverride ?? definitionIssuerSource(this.definition);
        if (immediateSource?.kind === 'inline') {
            return {
                url: immediateSource.issuer.url,
                version: immediateSource.issuer.version,
            };
        }
        if (immediateSource?.kind === 'url') {
            throw new Error(
                'Issuer URL must be resolved with getResolvedIssuer() before getResponse() can emit displayedIssuer',
            );
        }

        return undefined;
    }

    /**
     * Submit-time pin of the Locale document whose strings the respondent saw — mirrors
     * {@link getDisplayedIssuerPin}. Reads the document {@link LocaleStore.getActiveDocument}
     * resolves for the active locale tag. A Locale document's identity is its target plus its
     * normalized locale (Locale spec), so the pin is `locale` + `version`, with the document's own
     * `url` when it declares one (Locale §url is OPTIONAL, unlike Issuer's). Undefined only when no
     * Locale document is active — the Definition's inline wording was shown.
     */
    private getDisplayedLocalePin(): { url?: string; version: string; locale: string } | undefined {
        const doc = this._localeStore.getActiveDocument();
        if (!doc) {
            return undefined;
        }
        return { ...(doc.url ? { url: doc.url } : {}), version: doc.version, locale: doc.locale };
    }
}

function definitionIssuerSource(definition: FormDefinition): IssuerSource | undefined {
    const issuer = (definition as FormDefinition & { issuer?: unknown }).issuer;
    if (!issuer || typeof issuer !== 'object') {
        return undefined;
    }
    const record = issuer as Record<string, unknown>;
    if (record.$formspecIssuer === '1.0' && typeof record.url === 'string') {
        return { kind: 'inline', issuer: issuer as Issuer };
    }
    if (typeof record.url === 'string') {
        return { kind: 'url', url: record.url };
    }
    return undefined;
}

function assertNeverReplayEvent(event: never): EngineReplayApplyResult {
    const unreachable = event as EngineReplayEvent;
    throw new Error(`Unsupported replay event: ${unreachable.type}`);
}
