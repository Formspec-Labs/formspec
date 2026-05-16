/** @filedesc Tools-side public surface — FEL facade, assembly, mapping, view-models, taxonomy, locale store, WASM eval/lint/screener (ADR 0050 §8 — excluded from `engine-render-entry`). */

export type {
    FELConditionBuilderOperator,
    FELConditionGroupCondition,
    FELConditionGroupLifted,
    FELConditionGroupLiftResult,
    FELConditionGroupUnlifted,
    FormProgress,
} from './interfaces.js';

export type { ReadonlyEngineSignal } from './reactivity/types.js';

export {
    normalizeIndexedPath,
    itemAtPath,
    tokenizeFEL,
    analyzeFEL,
    normalizePathSegment,
    splitNormalizedPath,
    itemLocationAtPath,
    rewriteFELReferences,
    rewriteMessageTemplate,
    lintDocument,
    parseRegistry,
    findRegistryEntry,
    validateLifecycleTransition,
    wellKnownRegistryUrl,
    generateChangelog,
    printFEL,
    tryLiftConditionGroup,
    evaluateDefinition,
    getBuiltinFELFunctionCatalog,
    getFELDependencies,
    isValidFELIdentifier,
    sanitizeFELIdentifier,
    validateExtensionUsage,
    createSchemaValidator,
    rewriteFEL,
} from './fel/fel-api.js';

export type { TreeItemLike, ItemLocation } from './fel/fel-api.js';

export { createMappingEngine, RuntimeMappingEngine } from './mapping/RuntimeMappingEngine.js';

/** FEL eval for tooling (WASM); returns a JSON-compatible value. */
export { wasmEvalFEL as evalFEL } from './wasm-bridge-runtime.js';

/** Lint with extension registries (WASM). */
export { wasmLintDocumentWithRegistries as lintDocumentWithRegistries } from './wasm-bridge-tools.js';

/** Evaluate a standalone Screener Document (WASM); returns a DeterminationRecord. */
export { wasmEvaluateScreenerDocument } from './wasm-bridge-runtime.js';

export type { EvalValidation } from './diff.js';

export { assembleDefinition, assembleDefinitionSync } from './assembly/assembleDefinition.js';

export {
    isNumericType, isDateType, isChoiceType, isTextType, isBinaryType, isBooleanType,
    isMoneyType, isUriType,
} from './taxonomy.js';

export { interpolateMessage } from './interpolate-message.js';
export type { InterpolateResult, InterpolationWarning } from './interpolate-message.js';

export { LocaleStore } from './locale.js';
export type { LookupResult } from './locale.js';

export { createFieldViewModel } from './field-view-model.js';
export type { FieldViewModel, FieldViewModelDeps, ResolvedValidationResult, ResolvedOption } from './field-view-model.js';

export { optionMatchesComboboxQuery } from './combobox-option-filter.js';
export type { ComboboxOptionSearchShape } from './combobox-option-filter.js';

export { createFormViewModel } from './form-view-model.js';
export type { FormViewModel, FormViewModelDeps } from './form-view-model.js';

export type { FormspecEnginePackage } from './package-interface.js';
