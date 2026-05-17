/** @filedesc Engine public interfaces and shared exported types. */

import type { EngineSignal, ReadonlyEngineSignal } from './reactivity/types.js';
import type {
    FormDefinition,
    FormItem,
    FormResponse,
    MappingDocument,
    ValidationResult,
    ValidationReport,
    OptionEntry,
} from '@formspec-org/types';

/** JSON-compatible scalar. */
export type JsonPrimitive = string | number | boolean | null;
/** JSON-compatible value crossing engine / mapping boundaries. */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
/** Field or instance slot value (undefined = unset). */
export type FormFieldValue = JsonValue | undefined;
/** String-keyed JSON object (response data, instance maps). */
export type JsonRecord = Record<string, JsonValue>;
import type { LocaleDocument } from './locale.js';
import type { FieldViewModel } from './field-view-model.js';
import type { FormViewModel } from './form-view-model.js';

// ── FEL catalog types ────────────────────────────────────────────────

export interface FELBuiltinFunctionCatalogEntry {
    name: string;
    category: string;
    signature?: string;
    description?: string;
}

// ── FEL analysis / rewriting ────────────────────────────────────────

export interface FELAnalysisError {
    message: string;
    /** Byte/char index range in source (matches Rust `ParseError` / fel lexer spans). */
    span?: { start: number; end: number };
    offset?: number;
    line?: number;
    column?: number;
}

export interface FELAnalysis {
    valid: boolean;
    errors: FELAnalysisError[];
    warnings: string[];
    references: string[];
    variables: string[];
    functions: string[];
    cst?: unknown;
}

/** Operators for structured FEL conditions (mirrors Studio `fel-condition-builder`). */
export type FELConditionBuilderOperator =
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'is_true'
    | 'is_false'
    | 'contains'
    | 'starts_with'
    | 'is_null'
    | 'is_not_null'
    | 'is_empty'
    | 'is_present'
    | 'money_eq'
    | 'money_neq'
    | 'money_gt'
    | 'money_gte'
    | 'money_lt'
    | 'money_lte';

/** One row in a lifted condition group (`tryLiftConditionGroup`). */
export interface FELConditionGroupCondition {
    field: string;
    operator: FELConditionBuilderOperator;
    value: string;
}

export interface FELConditionGroupLifted {
    status: 'lifted';
    logic: 'and' | 'or';
    conditions: FELConditionGroupCondition[];
}

export interface FELConditionGroupUnlifted {
    status: 'unlifted';
    reason: string;
    valid: boolean;
}

export type FELConditionGroupLiftResult = FELConditionGroupLifted | FELConditionGroupUnlifted;

export interface FELRewriteOptions {
    rewriteFieldPath?: (path: string) => string;
    rewriteCurrentPath?: (path: string) => string;
    rewriteVariable?: (name: string) => string;
    rewriteInstanceName?: (name: string) => string;
    rewriteNavigationTarget?: (name: string, fn: 'prev' | 'next' | 'parent') => string;
}

// ── Schema validation types ─────────────────────────────────────────

export type DocumentType =
    | 'definition'
    | 'theme'
    | 'component'
    | 'mapping'
    | 'response'
    | 'validation_report'
    | 'validation_result'
    | 'registry'
    | 'changelog'
    | 'fel_functions'
    | 'locale';

export interface SchemaValidationError {
    path: string;
    message: string;
    raw?: unknown;
}

export interface SchemaValidationResult {
    documentType: DocumentType | null;
    errors: SchemaValidationError[];
}

export interface SchemaValidatorSchemas {
    definition?: object;
    theme?: object;
    component?: object;
    mapping?: object;
    response?: object;
    validation_report?: object;
    validation_result?: object;
    registry?: object;
    changelog?: object;
    fel_functions?: object;
    locale?: object;
}

export interface SchemaValidator {
    validate(document: unknown, documentType?: DocumentType | null): SchemaValidationResult;
}

// ── Extension usage types ───────────────────────────────────────────

export interface ExtensionUsageIssue {
    path: string;
    extension: string;
    severity: 'error' | 'warning' | 'info';
    code: 'UNRESOLVED_EXTENSION' | 'EXTENSION_RETIRED' | 'EXTENSION_DEPRECATED';
    message: string;
}

export interface ValidateExtensionUsageOptions {
    resolveEntry: (name: string) => RegistryEntry | undefined;
}

// ── Definition assembly types ───────────────────────────────────────

export interface AssemblyProvenance {
    url: string;
    version: string;
    keyPrefix?: string;
    fragment?: string;
}

export type DefinitionResolver = (
    url: string,
    version?: string,
) => FormDefinition | Promise<FormDefinition>;

export interface AssemblyResult {
    definition: FormDefinition;
    assembledFrom: AssemblyProvenance[];
}

export interface RewriteMap {
    fragmentRootKey: string;
    hostGroupKey: string;
    importedKeys: Set<string>;
    keyPrefix: string;
}

export type {
    ComponentDocument,
    CustomComponentRef,
    AnyComponent as ComponentObject,
} from '@formspec-org/types';

// ── Engine-level shared types ───────────────────────────────────────

export interface RemoteOptionsState {
    loading: boolean;
    error: string | null;
}

export type EngineNowInput = Date | string | number;

export interface FormEngineRuntimeContext {
    now?: (() => EngineNowInput) | EngineNowInput;
    locale?: string;
    timeZone?: string;
    seed?: string | number;
    meta?: Record<string, string | number | boolean>;
}

/** Options for [`FormEngine`](./engine/FormEngine.ts) construction and [`createFormEngine`](./engine/init.ts). */
export interface FormEngineOptions {
    runtimeContext?: FormEngineRuntimeContext;
    registryEntries?: RegistryEntry[];
    reactiveRuntime?: import('./reactivity/types.js').EngineReactiveRuntime;
}

export interface RegistryEntry {
    name: string;
    category?: string;
    version?: string;
    status?: string;
    description?: string;
    compatibility?: { formspecVersion?: string; mappingDslVersion?: string };
    deprecationNotice?: string;
    baseType?: string;
    constraints?: Record<string, JsonValue> & {
        pattern?: string;
        maxLength?: number;
    };
    metadata?: JsonRecord;
    [key: string]: unknown;
}

export interface PinnedResponseReference {
    definitionUrl: string;
    definitionVersion: string;
}

export interface FormProgress {
    total: number;
    filled: number;
    valid: number;
    required: number;
    requiredFilled: number;
    complete: boolean;
}

export interface AuthoredSignatureIdentityBinding {
    method: string;
    assuranceLevel: 'none' | 'low' | 'standard' | 'high' | 'very-high';
    providerRef?: string;
    externalAttestationRef?: string;
}

export interface AuthoredSignatureSignedPayload {
    canonicalization: 'formspec-response-signing-v1';
    digestAlgorithm: 'sha-256';
    digest: string;
    responseId: string;
    definitionUrl: string;
    definitionVersion: string;
    signedAt: string;
    signingIntent: string;
}

export interface VerificationReceiptInput {
    result: 'verified' | 'failed' | 'unsupported';
    method: string;
    methodRegistryVersion: string;
    adapter: {
        id: string;
        version: string;
    };
    key: {
        ref: string;
        version?: string;
        snapshot?: string;
    };
    verifiedAt: string;
    context?: {
        revocation?: {
            kind: 'ocsp' | 'crl' | 'witness';
            responseHash: string;
        };
        timestamping?: {
            authority: string;
            receiptHash: string;
        };
        witness?: {
            anchor: {
                eventHash: string;
                ledgerScope: string;
            };
        };
    };
    receiptBytes?: string;
}

export interface AuthoredSignatureInput {
    signatureId: string;
    documentId: string;
    signingIntent: string;
    signatureValue: string;
    verificationReceipt?: string | VerificationReceiptInput;
    signerId?: string;
    signerName?: string;
    signedAt: string;
    consentAccepted: boolean;
    consentTextRef: string;
    consentVersion: string;
    affirmationText: string;
    signedPayload: AuthoredSignatureSignedPayload;
    documentHash: string;
    documentHashAlgorithm: string;
    identityProofRef?: string;
    identityBinding?: AuthoredSignatureIdentityBinding;
    signatureProvider: string;
    ceremonyId: string;
}

export interface FormEngineDiagnosticsSnapshot {
    definition: { url: string; version: string; title: string };
    timestamp: string;
    structureVersion: number;
    repeats: Record<string, number>;
    values: JsonRecord;
    mips: Record<string, { relevant: boolean; required: boolean; readonly: boolean; error: string | null }>;
    validation: ValidationReport;
    runtimeContext: { now: string; locale?: string; timeZone?: string; seed?: string | number };
}

export type EngineReplayEvent =
    | { type: 'setValue'; path: string; value: FormFieldValue }
    | { type: 'addRepeatInstance'; path: string }
    | { type: 'removeRepeatInstance'; path: string; index: number }
    | { type: 'evaluateShape'; shapeId: string }
    | { type: 'getValidationReport'; mode?: 'continuous' | 'submit' }
    | { type: 'getResponse'; mode?: 'continuous' | 'submit' };

export interface EngineReplayApplyResult {
    ok: boolean;
    event: EngineReplayEvent;
    output?: unknown;
    error?: string;
}

export interface EngineReplayResult {
    applied: number;
    results: EngineReplayApplyResult[];
    errors: Array<{ index: number; event: EngineReplayEvent; error: string }>;
}

// ── Main engine interface ───────────────────────────────────────────

export interface IFormEngine {
    readonly signals: Record<string, EngineSignal<FormFieldValue>>;
    readonly relevantSignals: Record<string, EngineSignal<boolean>>;
    readonly requiredSignals: Record<string, EngineSignal<boolean>>;
    readonly readonlySignals: Record<string, EngineSignal<boolean>>;
    readonly errorSignals: Record<string, EngineSignal<string | null>>;
    readonly validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    readonly shapeResults: Record<string, EngineSignal<ValidationResult[]>>;
    readonly repeats: Record<string, EngineSignal<number>>;
    readonly optionSignals: Record<string, EngineSignal<OptionEntry[]>>;
    readonly optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>>;
    readonly variableSignals: Record<string, EngineSignal<FormFieldValue>>;
    readonly instanceData: JsonRecord;
    readonly instanceVersion: EngineSignal<number>;
    readonly structureVersion: EngineSignal<number>;

    readonly definition: FormDefinition;

    setRuntimeContext(context: FormEngineRuntimeContext): void;

    getOptions(path: string): OptionEntry[];
    getOptionsSignal(path: string): EngineSignal<OptionEntry[]> | undefined;
    getOptionsState(path: string): RemoteOptionsState;
    getOptionsStateSignal(path: string): EngineSignal<RemoteOptionsState> | undefined;
    waitForRemoteOptions(): Promise<void>;
    waitForInstanceSources(): Promise<void>;

    setInstanceValue(name: string, path: string | undefined, value: FormFieldValue): void;
    getInstanceData(name: string, path?: string): FormFieldValue;
    getDisabledDisplay(path: string): 'hidden' | 'protected';

    getVariableValue(name: string, scopePath: string): FormFieldValue;

    addRepeatInstance(itemName: string): number | undefined;
    removeRepeatInstance(itemName: string, index: number): void;

    compileExpression(expression: string, currentItemName?: string): () => FormFieldValue;

    setValue(name: string, value: FormFieldValue): void;

    getValidationReport(options?: { mode?: 'continuous' | 'submit' }): ValidationReport;
    evaluateShape(shapeId: string): ValidationResult[];
    isPathRelevant(path: string): boolean;
    getFieldPaths(): string[];
    getProgress(): FormProgress;
    getResponse(meta?: {
        id?: string;
        author?: { id: string; name?: string };
        subject?: { id: string; type?: string };
        authoredSignatures?: AuthoredSignatureInput[];
        mode?: 'continuous' | 'submit';
    }): FormResponse;

    getDiagnosticsSnapshot(options?: { mode?: 'continuous' | 'submit' }): FormEngineDiagnosticsSnapshot;
    applyReplayEvent(event: EngineReplayEvent): EngineReplayApplyResult;
    replay(events: EngineReplayEvent[], options?: { stopOnError?: boolean }): EngineReplayResult;

    getDefinition(): FormDefinition;
    setLabelContext(context: string | null): void;
    getLabel(item: FormItem): string;

    loadLocale(doc: LocaleDocument): void;
    setLocale(code: string): void;
    getActiveLocale(): string;
    getAvailableLocales(): string[];
    getLocaleDirection(): 'ltr' | 'rtl';
    /**
     * Reactive tick signal — increments on **active-locale** or
     * **available-locales** changes (`setLocale`, `loadLocale`). Subscribe to
     * drive re-renders that consume `getActiveLocale` / `getAvailableLocales`.
     *
     * Note: `setDirectionMode` (when exposed) bumps an internal
     * `_directionVersion` separately; if `getLocaleDirection` consumers need
     * reactivity for direction-mode changes, expose a `directionSignal` or
     * fold the two ticks. Today `direction` updates indirectly via the locale
     * cascade so single-signal subscription is sufficient.
     */
    readonly localeSignal: ReadonlyEngineSignal<number>;
    getFieldVM(path: string): FieldViewModel | undefined;
    getFormVM(): FormViewModel;
    /** Resolve a locale string key with fallback. For component-tier `$component.` keys. */
    resolveLocaleString(key: string, fallback: string): string;

    dispose(): void;

    injectExternalValidation?(results: Array<{ path: string; severity: string; code: string; message: string; source?: string }>): void;
    clearExternalValidation?(path?: string): void;

    setRegistryEntries?(entries: RegistryEntry[]): void;

    migrateResponse(responseData: JsonRecord, fromVersion: string): JsonRecord;
}

// ── Runtime mapping ─────────────────────────────────────────────────

export type MappingDirection = 'forward' | 'reverse';

export interface MappingDiagnostic {
    ruleIndex: number;
    sourcePath?: string;
    targetPath?: string;
    errorCode:
        | 'COERCE_FAILURE'
        | 'UNMAPPED_VALUE'
        | 'FEL_RUNTIME'
        | 'PATH_NOT_FOUND'
        | 'INVALID_DOCUMENT'
        | 'ADAPTER_FAILURE'
        | 'VERSION_MISMATCH'
        | 'INVALID_FEL'
        | 'WASM_NOT_READY';
    message: string;
}

export interface RuntimeMappingResult {
    direction: MappingDirection;
    output: JsonValue | string;
    appliedRules: number;
    diagnostics: MappingDiagnostic[];
}

export interface IRuntimeMappingEngine {
    forward(source: JsonValue | string): RuntimeMappingResult;
    reverse(source: JsonValue | string): RuntimeMappingResult;
}
