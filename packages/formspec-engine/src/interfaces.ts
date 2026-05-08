/** @filedesc Engine public interfaces and shared exported types. */

import type { EngineSignal } from './reactivity/types.js';
import type {
    FormDefinition,
    FormItem,
    ValidationResult,
    ValidationReport,
    OptionEntry,
} from '@formspec-org/types';
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

// ── Component document types ────────────────────────────────────────

export interface ComponentObject {
    component: string;
    bind?: string;
    when?: string;
    style?: Record<string, any>;
    children?: ComponentObject[];
    [key: string]: any;
}

export interface ComponentDocument {
    $formspecComponent: string;
    version: string;
    targetDefinition: {
        url: string;
        compatibleVersions?: string;
    };
    url?: string;
    name?: string;
    title?: string;
    description?: string;
    breakpoints?: Record<string, number>;
    tokens?: Record<string, any>;
    components?: Record<string, any>;
    tree: ComponentObject;
}

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

export interface RegistryEntry {
    name: string;
    category?: string;
    version?: string;
    status?: string;
    description?: string;
    compatibility?: { formspecVersion?: string; mappingDslVersion?: string };
    deprecationNotice?: string;
    baseType?: string;
    constraints?: {
        pattern?: string;
        maxLength?: number;
        [key: string]: any;
    };
    metadata?: Record<string, any>;
    [key: string]: any;
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
    digestAlgorithm: string;
    digest: string;
    responseId: string;
    definitionUrl: string;
    definitionVersion: string;
}

export interface AuthoredSignatureInput {
    signatureId: string;
    documentId: string;
    signingIntent: string;
    signatureValue: string;
    signatureMethod: string;
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
    values: Record<string, any>;
    mips: Record<string, { relevant: boolean; required: boolean; readonly: boolean; error: string | null }>;
    validation: ValidationReport;
    runtimeContext: { now: string; locale?: string; timeZone?: string; seed?: string | number };
}

export type EngineReplayEvent =
    | { type: 'setValue'; path: string; value: any }
    | { type: 'addRepeatInstance'; path: string }
    | { type: 'removeRepeatInstance'; path: string; index: number }
    | { type: 'evaluateShape'; shapeId: string }
    | { type: 'getValidationReport'; mode?: 'continuous' | 'submit' }
    | { type: 'getResponse'; mode?: 'continuous' | 'submit' };

export interface EngineReplayApplyResult {
    ok: boolean;
    event: EngineReplayEvent;
    output?: any;
    error?: string;
}

export interface EngineReplayResult {
    applied: number;
    results: EngineReplayApplyResult[];
    errors: Array<{ index: number; event: EngineReplayEvent; error: string }>;
}

// ── Main engine interface ───────────────────────────────────────────

export interface IFormEngine {
    readonly signals: Record<string, EngineSignal<any>>;
    readonly relevantSignals: Record<string, EngineSignal<boolean>>;
    readonly requiredSignals: Record<string, EngineSignal<boolean>>;
    readonly readonlySignals: Record<string, EngineSignal<boolean>>;
    readonly errorSignals: Record<string, EngineSignal<string | null>>;
    readonly validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    readonly shapeResults: Record<string, EngineSignal<ValidationResult[]>>;
    readonly repeats: Record<string, EngineSignal<number>>;
    readonly optionSignals: Record<string, EngineSignal<OptionEntry[]>>;
    readonly optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>>;
    readonly variableSignals: Record<string, EngineSignal<any>>;
    readonly instanceData: Record<string, any>;
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

    setInstanceValue(name: string, path: string | undefined, value: any): void;
    getInstanceData(name: string, path?: string): any;
    getDisabledDisplay(path: string): 'hidden' | 'protected';

    getVariableValue(name: string, scopePath: string): any;

    addRepeatInstance(itemName: string): number | undefined;
    removeRepeatInstance(itemName: string, index: number): void;

    compileExpression(expression: string, currentItemName?: string): () => any;

    setValue(name: string, value: any): void;

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
    }): any;

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
    getFieldVM(path: string): FieldViewModel | undefined;
    getFormVM(): FormViewModel;
    /** Resolve a locale string key with fallback. For component-tier `$component.` keys. */
    resolveLocaleString(key: string, fallback: string): string;

    dispose(): void;

    injectExternalValidation?(results: Array<{ path: string; severity: string; code: string; message: string; source?: string }>): void;
    clearExternalValidation?(path?: string): void;

    setRegistryEntries?(entries: any[]): void;

    migrateResponse(responseData: Record<string, any>, fromVersion: string): Record<string, any>;
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
    output: any;
    appliedRules: number;
    diagnostics: MappingDiagnostic[];
}

export interface IRuntimeMappingEngine {
    forward(source: any): RuntimeMappingResult;
    reverse(source: any): RuntimeMappingResult;
}
