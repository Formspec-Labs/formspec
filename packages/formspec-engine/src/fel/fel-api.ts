/** @filedesc Full FEL facade — re-exports runtime + tools modules (ADR 0050). */

export {
    analyzeFEL,
    evaluateDefinition,
    evaluateFiled,
    getFELDependencies,
    isValidFELIdentifier,
    itemAtPath,
    itemLocationAtPath,
    lineColumnAtCharOffset,
    normalizeFelAnalysisError,
    normalizeIndexedPath,
    normalizePathSegment,
    sanitizeFELIdentifier,
    splitNormalizedPath,
    type FELAnalysis,
    type FELDependencies,
    type ItemLocation,
    type TreeItemLike,
    type WasmFelAnalysisErrorWire,
} from './fel-api-runtime.js';

export {
    createSchemaValidator,
    findRegistryEntry,
    generateChangelog,
    getBuiltinFELFunctionCatalog,
    lintDocument,
    parseRegistry,
    printFEL,
    rewriteFEL,
    rewriteFELReferences,
    rewriteMessageTemplate,
    tokenizeFEL,
    tryLiftConditionGroup,
    validateExtensionUsage,
    validateLifecycleTransition,
    wellKnownRegistryUrl,
} from './fel-api-tools.js';

export type {
    FELConditionBuilderOperator,
    FELConditionGroupCondition,
    FELConditionGroupLifted,
    FELConditionGroupLiftResult,
    FELConditionGroupUnlifted,
} from './fel-api-tools.js';
