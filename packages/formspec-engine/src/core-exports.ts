/** @filedesc Render-safe public surface shared by `index.ts` and `engine-render-entry.ts` — no FEL tooling facade or tools bridge (ADR 0050 §8). */

import type {
    FormBind,
    FormDefinition,
    FormInstance,
    FormItem,
    FormShape,
    FormVariable,
    OptionEntry,
    ValidationReport as FormspecValidationReport,
    ValidationResult as FormspecValidationResult,
} from '@formspec-org/types';

export type {
    AssemblyProvenance,
    AssemblyResult,
    ComponentDocument,
    ComponentObject,
    DefinitionResolver,
    DocumentType,
    EngineNowInput,
    EngineReplayApplyResult,
    EngineReplayEvent,
    EngineReplayResult,
    ExtensionUsageIssue,
    FELAnalysis,
    FELAnalysisError,
    FELBuiltinFunctionCatalogEntry,
    FELRewriteOptions,
    FormEngineDiagnosticsSnapshot,
    FormEngineOptions,
    FormEngineRuntimeContext,
    IFormEngine,
    IRuntimeMappingEngine,
    MappingDiagnostic,
    MappingDirection,
    PinnedResponseReference,
    RegistryEntry,
    RemoteOptionsState,
    RewriteMap,
    RuntimeMappingResult,
    SchemaValidationError,
    SchemaValidationResult,
    SchemaValidator,
    SchemaValidatorSchemas,
} from './interfaces.js';
export type { ValidationProfile } from '@formspec-org/types';
export type {
    ActionRefFinding,
    ActionResolution,
    ResponseAction,
    ResponseActionEffectOutcome,
    ResponseActionEffectStatus,
    ResponseActionEffectDispatchContext,
    ResponseActionIdempotencyKeyContext,
    ResponseActionInvocationContext,
    ResponseActionInvocationPorts,
    ResponseActionInvocationResult,
    ResponseActionInvocationStatus,
    ResponseActionLifecycleKind,
    ResponseActionLifecyclePayload,
    ResponseActionPreconditionResult,
    ResponseActionSubmitOptions,
    ResponseActionValidationTuple,
    ResponseActionsDocument,
    ResponseActionsDocumentInput,
    StandardResponseActionIntent,
} from './response-actions.js';
export {
    DefaultValidationProfileResolver,
    type EnabledValidationProfile,
    type ValidationReportOptions,
    type ValidationTrigger,
} from './validation/index.js';
export {
    declaresHostEvent,
    findResponseActionByIntent,
    invokeResponseAction,
    InvalidValidationTupleError,
    resolveResponseAction,
    resolveResponseActionValidationTuple,
    validationProfileForAction,
} from './response-actions.js';
// `defaultActionRefForIntent` is intentionally NOT re-exported here. §10 +
// §13.6 prohibit implicit-default behavior on the contract surface; the
// helper now lives at './internal/default-action-ref.js' and is private to
// the reference renderers.
export {
    RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS,
    RESPONSE_ACTIONS_PRECONDITION_BINDINGS,
    ResponseActionsPreconditionCatalog,
} from './precondition-catalog.js';
export type {
    CatalogValidationResult,
    PreconditionCatalogEntry,
} from './precondition-catalog.js';

/** @deprecated Use `FormItem` from `@formspec-org/types`. Removed in v1. */
export type FormspecItem = FormItem;
/** @deprecated Use `FormBind` from `@formspec-org/types` (and the engine's `RemoteOptionsState` for remote options). Removed in v1. */
export type FormspecBind = FormBind & { remoteOptions?: string };
/** @deprecated Use `FormShape` from `@formspec-org/types`. Removed in v1. */
export type FormspecShape = FormShape;
/** @deprecated Use `FormVariable` from `@formspec-org/types`. Removed in v1. */
export type FormspecVariable = FormVariable;
/** @deprecated Use `FormInstance` from `@formspec-org/types`. Removed in v1. */
export type FormspecInstance = FormInstance;
/** @deprecated Use `FormDefinition` from `@formspec-org/types`. Removed in v1. */
export type FormspecDefinition = FormDefinition;
/** @deprecated Use `OptionEntry` from `@formspec-org/types`. Removed in v1. */
export type FormspecOption = OptionEntry;
/** @deprecated Use `ValidationResult` from `@formspec-org/types`. Removed in v1. */
export type ValidationResult = FormspecValidationResult;
/** @deprecated Use `ValidationReport` from `@formspec-org/types`. Removed in v1. */
export type ValidationReport = FormspecValidationReport;

export type { EngineReactiveRuntime, EngineSignal } from './reactivity/types.js';
export { preactReactiveRuntime } from './reactivity/preact-runtime.js';

export {
    initFormspecEngine,
    initFormspecEngine as initEngine,
    initFormspecEngineTools,
    isFormspecEngineInitialized,
    isFormspecEngineToolsInitialized,
} from './init-formspec-engine.js';

export { buildValidationReportEnvelope } from './engine/response-assembly.js';
export { toValidationResults } from './engine/helpers.js';

export type { LocaleDocument } from './locale.js';
export { normalizeBcp47 } from './locale.js';
export * from './issuer/index.js';

export { FormEngine } from './engine/FormEngine.js';
export { createFormEngine } from './engine/init.js';
