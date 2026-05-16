# @formspec/engine — API Reference

*Auto-generated from TypeScript declarations — do not hand-edit.*

Core form state management engine. Parses a FormspecDefinition and builds a reactive signal network for field values, relevance, validation, repeat groups, computed variables, and response serialization. Includes FEL expression compilation, definition assembly, and bidirectional runtime mapping.

## `assembleDefinitionSync(definition: FormDefinition, resolver: Record<string, unknown> | ((url: string, version?: string) => unknown)): AssemblyResult`

## `assembleDefinition(definition: FormDefinition, resolver: DefinitionResolver): Promise<AssemblyResult>`

## `optionMatchesComboboxQuery(opt: ComboboxOptionSearchShape, queryRaw: string): boolean`

True if query is empty or matches label, value, or any keyword (substring, case-insensitive).

#### interface `ComboboxOptionSearchShape`

@filedesc Case-insensitive combobox type-ahead: label, value, and optional option keywords.

- **value**: `string`
- **label**: `string`
- **keywords?**: `readonly string[] | undefined`

#### type `FormspecItem`

@deprecated Use `FormItem` from `@formspec-org/types`. Removed in v1.

```ts
type FormspecItem = FormItem;
```

#### type `FormspecBind`

@deprecated Use `FormBind` from `@formspec-org/types` (and the engine's `RemoteOptionsState` for remote options). Removed in v1.

```ts
type FormspecBind = FormBind & {
    remoteOptions?: string;
};
```

#### type `FormspecShape`

@deprecated Use `FormShape` from `@formspec-org/types`. Removed in v1.

```ts
type FormspecShape = FormShape;
```

#### type `FormspecVariable`

@deprecated Use `FormVariable` from `@formspec-org/types`. Removed in v1.

```ts
type FormspecVariable = FormVariable;
```

#### type `FormspecInstance`

@deprecated Use `FormInstance` from `@formspec-org/types`. Removed in v1.

```ts
type FormspecInstance = FormInstance;
```

#### type `FormspecDefinition`

@deprecated Use `FormDefinition` from `@formspec-org/types`. Removed in v1.

```ts
type FormspecDefinition = FormDefinition;
```

#### type `FormspecOption`

@deprecated Use `OptionEntry` from `@formspec-org/types`. Removed in v1.

```ts
type FormspecOption = OptionEntry;
```

#### type `ValidationResult`

@deprecated Use `ValidationResult` from `@formspec-org/types`. Removed in v1.

```ts
type ValidationResult = FormspecValidationResult;
```

#### type `ValidationReport`

@deprecated Use `ValidationReport` from `@formspec-org/types`. Removed in v1.

```ts
type ValidationReport = FormspecValidationReport;
```

## `diffEvalResults(previous: EvalResult | null, next: EvalResult): EvalDelta`

#### interface `EvalValidation`

@filedesc Diffs batch evaluation snapshots into per-signal patch payloads.

- **path**: `string`
- **shapeId?**: `string`

#### interface `EvalResult`

- **values**: `Record<string, unknown>`
- **validations**: `EvalValidation[]`
- **nonRelevant**: `string[]`
- **variables**: `Record<string, unknown>`
- **required**: `Record<string, boolean>`
- **readonly**: `Record<string, boolean>`

#### interface `EvalDelta`

- **values**: `Record<string, unknown>`
- **removedValues**: `string[]`
- **relevant**: `Record<string, boolean>`
- **required**: `Record<string, boolean>`
- **readonly**: `Record<string, boolean>`
- **validations**: `Record<string, EvalValidation[]>`
- **removedValidationPaths**: `string[]`
- **shapeResults**: `Record<string, EvalValidation[]>`
- **removedShapeIds**: `string[]`
- **variables**: `Record<string, unknown>`
- **removedVariables**: `string[]`

#### class `FormEngine`

##### `constructor(definition: FormDefinition, runtimeContext?: FormEngineRuntimeContext, registryEntries?: RegistryEntry[], reactiveRuntime?: EngineReactiveRuntime)`

##### `resolvePinnedDefinition(response: PinnedResponseReference, definitions: T[]): T`

##### `setRuntimeContext(context?: FormEngineRuntimeContext): void`

##### `getOptions(path: string): OptionEntry[]`

##### `getOptionsSignal(path: string): EngineSignal<OptionEntry[]> | undefined`

##### `getOptionsState(path: string): RemoteOptionsState`

##### `getOptionsStateSignal(path: string): EngineSignal<RemoteOptionsState> | undefined`

##### `waitForRemoteOptions(): Promise<void>`

##### `waitForInstanceSources(): Promise<void>`

##### `setInstanceValue(name: string, path: string | undefined, value: any): void`

##### `getInstanceData(name: string, path?: string): any`

##### `getDisabledDisplay(path: string): 'hidden' | 'protected'`

##### `getVariableValue(name: string, scopePath: string): any`

##### `addRepeatInstance(itemName: string): number | undefined`

##### `removeRepeatInstance(itemName: string, index: number): void`

##### `compileExpression(expression: string, currentItemName?: string): () => any`

##### `setValue(name: string, value: any): void`

##### `getValidationReport(options?: {
        mode?: 'continuous' | 'submit';
    }): ValidationReport`

##### `evaluateShape(shapeId: string): ValidationResult[]`

##### `isPathRelevant(path: string): boolean`

##### `getFieldPaths(): string[]`

##### `getProgress(): import('../interfaces.js').FormProgress`

##### `getResponse(meta?: {
        id?: string;
        author?: {
            id: string;
            name?: string;
        };
        subject?: {
            id: string;
            type?: string;
        };
        authoredSignatures?: AuthoredSignatureInput[];
        mode?: 'continuous' | 'submit';
    }): any`

##### `getDiagnosticsSnapshot(options?: {
        mode?: 'continuous' | 'submit';
    }): FormEngineDiagnosticsSnapshot`

##### `applyReplayEvent(event: EngineReplayEvent): EngineReplayApplyResult`

##### `replay(events: EngineReplayEvent[], options?: {
        stopOnError?: boolean;
    }): EngineReplayResult`

##### `getDefinition(): FormDefinition`

##### `setLabelContext(context: string | null): void`

##### `getLabel(item: FormItem): string`

##### `loadLocale(doc: LocaleDocument): void`

##### `setLocale(code: string): void`

##### `getActiveLocale(): string`

##### `getAvailableLocales(): string[]`

##### `getLocaleDirection(): 'ltr' | 'rtl'`

##### `getFieldVM(path: string): FieldViewModel | undefined`

##### `getFormVM(): FormViewModel`

##### `resolveLocaleString(key: string, fallback: string): string`

##### `injectExternalValidation(results: Array<{
        path: string;
        severity: string;
        code: string;
        message: string;
        source?: string;
    }>): void`

##### `clearExternalValidation(path?: string): void`

##### `dispose(): void`

##### `setRegistryEntries(entries: any[]): void`

##### `migrateResponse(responseData: Record<string, any>, fromVersion: string): Record<string, any>`

## `resolveOptionSetsOnDefinition(definition: FormDefinition): FormDefinition`

## `validateVariableDefinitionCycles(variableDefs: FormVariable[]): void`

## `validateCalculateBindCycles(bindConfigs: Record<string, EngineBindConfig>): void`

## `normalizeRemoteOptions(payload: any): OptionEntry[]`

## `makeValidationResult(result: Pick<ValidationResult, 'path' | 'severity' | 'constraintKind' | 'code' | 'message' | 'source'> & Partial<Pick<ValidationResult, 'shapeId' | 'context'>>): ValidationResult`

## `toValidationResult(result: EvalValidation): ValidationResult`

## `toValidationResults(results: EvalValidation[]): ValidationResult[]`

## `toRuntimeMappingResult(result: {
    direction: string;
    output: any;
    rulesApplied: number;
    diagnostics: any[];
}): RuntimeMappingResult`

## `emptyValueForItem(item: FormItem): any`

## `coerceInitialValue(item: FormItem, value: any): any`

## `coerceFieldValue(item: FormItem, bind: EngineBindConfig | undefined, definition: FormDefinition, value: any): any`

## `validateDataType(value: any, dataType: string): boolean`

## `cloneValue(value: T): T`

## `normalizeWasmValue(value: T): T`

## `tagMoneyByPath(path: string, value: any, bindConfigs: Record<string, EngineBindConfig>, fieldDataTypes?: Record<string, string | undefined>): any`

## `toWasmContextValue(value: T): T`

## `deepEqual(left: unknown, right: unknown): boolean`

## `resolveNowProvider(now: FormEngineRuntimeContext['now']): () => Date`

## `coerceDate(value: RuntimeNowInput): Date`

## `toBasePath(path: string): string`

## `parseInstanceTarget(path: string): {
    instanceName: string;
    instancePath?: string;
} | null`

## `splitIndexedPath(path: string): string[]`

## `appendPath(base: string, segment: string): string`

## `parentPathOf(path: string): string`

## `getAncestorBasePaths(path: string): string[]`

## `getScopeAncestors(scopePath: string): string[]`

## `getNestedValue(target: any, path: string): any`

## `setNestedPathValue(target: Record<string, any>, path: string, value: any): void`

## `setExpressionContextValue(target: Record<string, any>, path: string, value: any): void`

## `setResponsePathValue(target: Record<string, any>, path: string, value: any): void`

## `replaceBareCurrentFieldRefs(expression: string, currentFieldName: string): string`

## `flattenObject(value: any, prefix?: string, output?: Record<string, any>): Record<string, any>`

## `buildGroupSnapshotForPath(prefix: string, signals: Record<string, EngineSignal<any>>): Record<string, any>`

## `buildRepeatCollection(groupPath: string, count: number, signals: Record<string, EngineSignal<any>>): any[]`

## `getRepeatAncestors(currentItemPath: string, repeats: Record<string, EngineSignal<number>>): Array<{
    groupPath: string;
    index: number;
    count: number;
}>`

## `isEmptyValue(value: unknown): boolean`

## `safeEvaluateExpression(expression: string, context: WasmFelContext): any`

## `extractInlineBind(item: FormItem, path: string): EngineBindConfig | null`

## `detectNamedCycle(graph: Map<string, Set<string>>, message: string): void`

## `topoSortKeys(nodes: T[], graph: Map<string, Set<string>>): T[]`

## `snapshotSignals(signals: Record<string, EngineSignal<any>>): Record<string, any>`

## `toFelIndexedPath(path: string): string`

## `buildRepeatValueAliases(valuesByPath: Record<string, any>): Array<[string, any[]]>`

## `toRepeatWildcardPath(alias: string): string`

## `escapeRegExp(value: string): string`

## `resolveQualifiedGroupRefs(expression: string, currentItemPath: string, repeatAncestors: Array<{
    groupPath: string;
    index: number;
    count: number;
}>): string`

Resolve $group.field qualified refs to sibling refs within repeat context.

When evaluating an expression for a field inside a repeat group (e.g., line_items[0].total),
a reference like $line_items.qty should resolve to the sibling field "qty" in the same
instance, not to a wildcard collecting all instances.

For nested repeats (e.g., orders[0].items[0].line_total), $items.qty resolves to the
innermost sibling, and $orders.discount_pct resolves to the enclosing group's concrete path.

## `resolveRelativeDependency(dep: string, parentPath: string, selfPath: string): string | null`

#### type `EngineBindConfig`

```ts
type EngineBindConfig = FormBind & {
    remoteOptions?: string;
    precision?: number;
    disabledDisplay?: 'hidden' | 'protected';
};
```

#### type `RuntimeNowInput`

```ts
type RuntimeNowInput = Date | string | number;
```

## `createFormEngine(definition: FormDefinition, context?: FormEngineRuntimeContext, registryEntries?: RegistryEntry[], reactiveRuntime?: EngineReactiveRuntime): FormEngine`

## `validateInstanceDataAgainstSchema(instanceName: string, data: unknown, schema: Record<string, unknown> | undefined): void`

@filedesc Validate instance JSON against optional per-instance schema (datatype strings).

## `patchValueSignalsFromWasm(options: {
    values: Record<string, unknown>;
    signals: Record<string, EngineSignal<any>>;
    data: Record<string, any>;
    fieldItems: Map<string, FormItem>;
    bindConfigs: Record<string, EngineBindConfig>;
    calculatedFields: Set<string>;
}): void`

## `patchDeltaSignalsFromWasm(rx: EngineReactiveRuntime, delta: EvalDelta, options: {
    relevantSignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    shapeResults: Record<string, EngineSignal<ValidationResult[]>>;
    variableSignals: Record<string, EngineSignal<any>>;
    variableSignalKeys: Map<string, string[]>;
    prePopulateReadonly: Set<string>;
}): void`

## `patchErrorSignalsFromWasm(rx: EngineReactiveRuntime, options: {
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    errorSignals: Record<string, EngineSignal<string | null>>;
}): void`

## `clearRepeatIndexedSubtree(options: {
    rootRepeatPath: string;
    signals: Record<string, EngineSignal<any>>;
    relevantSignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    errorSignals: Record<string, EngineSignal<string | null>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    optionSignals: Record<string, EngineSignal<OptionEntry[]>>;
    optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>>;
    repeats: Record<string, EngineSignal<number>>;
    data: Record<string, any>;
}): void`

Remove indexed paths under a repeat root from signal stores and `_data` (reactive structure only).

## `snapshotRepeatGroupTree(items: FormItem[], prefix: string, readFieldValue: (path: string) => unknown, getRepeatCount: (path: string) => number): Record<string, unknown>`

Snapshot nested field values under a repeat prefix (used when removing a repeat row).

## `applyRepeatGroupTreeSnapshot(items: FormItem[], prefix: string, snapshot: Record<string, unknown> | undefined, writeField: (path: string, value: unknown) => void): void`

Restore nested field values after repeat rows were reindexed.

## `buildFormspecResponseEnvelope(options: {
    definition: FormDefinition;
    data: Record<string, unknown>;
    report: ValidationReport;
    timestamp: string;
    meta?: {
        id?: string;
        author?: {
            id: string;
            name?: string;
        };
        subject?: {
            id: string;
            type?: string;
        };
        authoredSignatures?: AuthoredSignatureInput[];
    };
}): Record<string, unknown>`

## `collectSubmitModeShapeValidationResults(submitEval: EvalResult, shapeTiming: Map<string, EvalShapeTiming>): ValidationResult[]`

Shape validations that only run on submit, from a WASM eval with `trigger: 'submit'`.

## `buildValidationReportEnvelope(results: ValidationResult[], timestamp: string): ValidationReport`

Strip optional cardinality `source`, compute counts, and wrap the spec envelope.

## `migrateResponseData(definition: FormDefinition, responseData: Record<string, any>, fromVersion: string, options: {
    nowIso: string;
}): Record<string, any>`

## `resolvePinnedDefinition(response: PinnedResponseReference, definitions: T[]): T`

## `wasmEvaluateDefinitionPayload(options: {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousResult: EvalResult | null;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    /** Authoritative repeat row counts by group base path (matches engine repeat signals). */
    repeatCounts: Record<string, number>;
}): {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousValidations: WasmPreviousValidation | undefined;
    previousNonRelevant: string[] | undefined;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    repeatCounts: Record<string, number>;
}`

Options object consumed by the WASM definition evaluator (JSON-serialized internally).

## `mergeWasmEvalWithExternalValidations(result: EvalResult, options: {
    externalValidations: EvalValidation[];
}): EvalResult`

Append engine-owned validations (e.g. extension hooks) after WASM batch evaluation.

## `normalizeExpressionForWasmEvaluation(options: {
    expression: string;
    currentItemPath: string;
    replaceSelfRef: boolean;
    repeats: Record<string, EngineSignal<number>>;
    fieldSignals: Record<string, EngineSignal<any>>;
}): string`

## `resolveFelFieldValueForWasm(path: string, value: unknown, bindConfigs: Record<string, EngineBindConfig>, fieldIsIrrelevant: (path: string) => boolean): unknown`

## `visibleScopedVariableValues(scopePath: string, variableDefs: FormVariable[], variableSignals: Record<string, EngineSignal<any>>, overrides?: Record<string, any>): Record<string, any>`

## `buildFelRepeatWasmContext(options: {
    currentItemPath: string;
    repeats: Record<string, EngineSignal<number>>;
    fieldSignals: Record<string, EngineSignal<any>>;
}): WasmFelContext['repeatContext'] | undefined`

## `buildWasmFelExpressionContext(options: WasmFelContextBuildInput): WasmFelContext`

#### interface `WasmFelContextBuildInput`

- **currentItemPath**: `string`
- **data**: `Record<string, any>`
- **fullResult**: `EvalResult | null`
- **resultOverride?**: `EvalResult | null`
- **dataOverride?**: `Record<string, any>`
- **scopedVariableOverrides?**: `Record<string, any>`
- **fieldSignals**: `Record<string, EngineSignal<any>>`
- **validationResults**: `Record<string, EngineSignal<ValidationResult[]>>`
- **relevantSignals**: `Record<string, EngineSignal<boolean>>`
- **readonlySignals**: `Record<string, EngineSignal<boolean>>`
- **requiredSignals**: `Record<string, EngineSignal<boolean>>`
- **repeats**: `Record<string, EngineSignal<number>>`
- **bindConfigs**: `Record<string, EngineBindConfig>`
- **fieldDataTypes**: `Record<string, string | undefined>`
- **variableDefs**: `FormVariable[]`
- **variableSignals**: `Record<string, EngineSignal<any>>`
- **instanceData**: `Record<string, unknown>`
- **nowIso**: `string`
- **locale?**: `string`
- **meta?**: `Record<string, string | number | boolean>`

#### type `WasmPreviousValidation`

Subset of validation objects passed back into WASM as previous state.

```ts
type WasmPreviousValidation = Array<{
    path: string;
    severity: string;
    constraintKind: string;
    code: string;
    message: string;
    source: string;
    shapeId?: string;
    context?: Record<string, unknown>;
}>;
```

#### type `EvalShapeTiming`

```ts
type EvalShapeTiming = 'continuous' | 'submit' | 'demand';
```

## `analyzeFEL(expression: string): FELAnalysis`

## `analyzeFELWithFieldTypes(expression: string, fieldTypes: Record<string, string>): FELAnalysis`

Analyze a FEL expression with field data type context for type-mismatch warnings.

## `normalizePathSegment(segment: string): string`

Remove repeat indices/wildcards from a path segment.

## `splitNormalizedPath(path: string): string[]`

Split a dotted path into normalized (index-free) segments.

## `itemLocationAtPath(items: T[], path: string): ItemLocation<T> | undefined`

Find the mutable parent/index/item triple for a dotted tree path.

## `getFELDependencies(expression: string): string[]`

## `normalizeIndexedPath: typeof wasmNormalizeIndexedPath`

## `itemAtPath: typeof wasmItemAtPath`

## `evalFELWithTrace: typeof wasmEvalFELWithTrace`

Evaluate a FEL expression and return a structured trace of evaluation steps.
See `FelTraceStep` for the step variants; wire format matches Rust `fel_core::TraceStep`.

## `evaluateDefinition: typeof wasmEvaluateDefinition`

## `isValidFELIdentifier: typeof wasmIsValidFelIdentifier`

Check if a string is a valid FEL identifier (canonical Rust lexer rule).

## `sanitizeFELIdentifier: typeof wasmSanitizeFelIdentifier`

Sanitize a string into a valid FEL identifier (strips invalid chars, escapes keywords).

## `computeDependencyGroups: typeof wasmComputeDependencyGroups`

Compute dependency groups from recorded changeset entries (delegates to Rust/WASM).

#### interface `TreeItemLike`

Basic tree item shape used by path traversal helpers.

- **key**: `string`
- **children?**: `T[]`

#### interface `ItemLocation`

Resolved mutable location of an item in a tree.

- **parent**: `T[]`
- **index**: `number`
- **item**: `T`

## `rewriteFELReferences(expression: string, options: FELRewriteOptions): string`

Rewrite FEL references using callback options (bridges to WASM rewrite).

## `getBuiltinFELFunctionCatalog(): FELBuiltinFunctionCatalogEntry[]`

## `validateExtensionUsage(items: unknown[], options: {
    resolveEntry: (name: string) => RegistryEntry | undefined;
}): ExtensionUsageIssue[]`

## `createSchemaValidator(_schemas?: SchemaValidatorSchemas): SchemaValidator`

## `rewriteFEL(expression: string, map: RewriteMap): string`

## `tokenizeFEL: typeof wasmTokenizeFEL`

## `rewriteMessageTemplate: typeof wasmRewriteMessageTemplate`

## `lintDocument: typeof wasmLintDocument`

## `parseRegistry: typeof wasmParseRegistry`

## `findRegistryEntry: typeof wasmFindRegistryEntry`

## `validateLifecycleTransition: typeof wasmValidateLifecycleTransition`

## `wellKnownRegistryUrl: typeof wasmWellKnownRegistryUrl`

## `generateChangelog: typeof wasmGenerateChangelog`

## `printFEL: typeof wasmPrintFEL`

## `tryLiftConditionGroup: typeof wasmTryLiftConditionGroup`

## `lineColumnAtCharOffset(expression: string, charOffset: number): {
    line: number;
    column: number;
}`

1-based line and column at a Unicode scalar index (matches Rust lexer char indices).

## `normalizeFelAnalysisError(expression: string, e: WasmFelAnalysisErrorWire): FELAnalysisError`

Normalize legacy string errors, `{ message, span }` from Rust, or partially-filled objects.

#### type `WasmFelAnalysisErrorWire`

Raw error element from `fel_analysis_to_json_value` JSON (before normalization).

```ts
type WasmFelAnalysisErrorWire = string | {
    message: string;
    span?: {
        start: number;
        end: number;
    } | null;
    line?: number;
    column?: number;
    offset?: number;
};
```

## `createFieldViewModel(deps: FieldViewModelDeps): FieldViewModel`

#### interface `FieldViewModel`

##### `setValue(value: any): void`

#### interface `ResolvedValidationResult`

- **path**: `string`
- **severity**: `string`
- **constraintKind**: `string`
- **code**: `string`
- **message**: `string`

#### interface `ResolvedOption`

- **keywords** (`string[]`): Abbreviations / alternate names for combobox type-ahead (from definition option.keywords).

#### interface `FieldViewModelDeps`

- **rx**: `EngineReactiveRuntime`
- **localeStore**: `LocaleStore`
- **templatePath**: `string`
- **instancePath**: `string`
- **id**: `string`
- **itemKey**: `string`
- **dataType**: `string`
- **getItemLabel**: `() => string`
- **getItemHint**: `() => string | null`
- **getItemDescription**: `() => string | null`
- **getItemLabels**: `() => Record<string, string> | undefined`
- **getLabelContext**: `() => string | null`
- **getFieldValue**: `() => EngineSignal<any>`
- **getRequired**: `() => EngineSignal<boolean>`
- **getVisible**: `() => EngineSignal<boolean>`
- **getReadonly**: `() => EngineSignal<boolean>`
- **getDisabledDisplay**: `() => 'hidden' | 'protected'`
- **getErrors**: `() => EngineSignal<any[]>`
- **getOptions**: `() => EngineSignal<OptionEntry[]>`
- **getOptionsState**: `() => EngineSignal<{
        loading: boolean;
        error: string | null;
    }>`
- **getOptionSetName**: `() => string | undefined`
- **setFieldValue**: `(value: any) => void`
- **evalFEL**: `(expr: string) => unknown`

## `createFormViewModel(deps: FormViewModelDeps): FormViewModel`

#### interface `FormViewModel`

##### `pageTitle(pageId: string): ReadonlyEngineSignal<string>`

##### `pageDescription(pageId: string): ReadonlyEngineSignal<string>`

#### interface `FormViewModelDeps`

- **getDefinitionTitle** (`() => string`): Returns definition.title
- **getDefinitionDescription** (`() => string | undefined`): Returns definition.description
- **getPageTitle** (`(pageId: string) => string | undefined`): Returns page title from theme pages array
- **getPageDescription** (`(pageId: string) => string | undefined`): Returns page description from theme pages
- **evalFEL** (`(expr: string) => unknown`): Evaluates a FEL expression in the form-level (global) context
- **getValidationCounts** (`() => {
        errors: number;
        warnings: number;
        infos: number;
    }`): Returns total validation error/warning/info counts
- **getIsValid** (`() => boolean`): Returns whether form is valid (no errors)

## `initFormspecEngine(): Promise<void>`

Initialize the Formspec engine (loads and links the Rust/WASM module).

Call once during app startup (e.g. `await initFormspecEngine()` or `await initEngine()`).
Safe to call multiple times; concurrent calls share one load.

Not required for `formspec-webcomponent` only: importing that package starts WASM load automatically.

## `isFormspecEngineInitialized(): boolean`

Whether {@link initFormspecEngine} has completed successfully in this JS realm.

## `initFormspecEngineTools(): Promise<void>`

Initialize the tools WASM module used by lint/mapping/registry/changelog helpers.
Runtime-first flows do not need this.

## `isFormspecEngineToolsInitialized(): boolean`

Whether the tools WASM module has completed initialization.

#### interface `FELBuiltinFunctionCatalogEntry`

- **name**: `string`
- **category**: `string`
- **signature?**: `string`
- **description?**: `string`

#### interface `FELAnalysisError`

- **span** (`{
        start: number;
        end: number;
    }`): Byte/char index range in source (matches Rust `ParseError` / fel lexer spans).

#### interface `FELAnalysis`

- **valid**: `boolean`
- **errors**: `FELAnalysisError[]`
- **warnings**: `string[]`
- **references**: `string[]`
- **variables**: `string[]`
- **functions**: `string[]`
- **cst?**: `unknown`

#### interface `FELConditionGroupCondition`

One row in a lifted condition group (`tryLiftConditionGroup`).

- **field**: `string`
- **operator**: `FELConditionBuilderOperator`
- **value**: `string`

#### interface `FELConditionGroupLifted`

- **status**: `'lifted'`
- **logic**: `'and' | 'or'`
- **conditions**: `FELConditionGroupCondition[]`

#### interface `FELConditionGroupUnlifted`

- **status**: `'unlifted'`
- **reason**: `string`
- **valid**: `boolean`

#### interface `FELRewriteOptions`

- **rewriteFieldPath?**: `(path: string) => string`
- **rewriteCurrentPath?**: `(path: string) => string`
- **rewriteVariable?**: `(name: string) => string`
- **rewriteInstanceName?**: `(name: string) => string`
- **rewriteNavigationTarget?**: `(name: string, fn: 'prev' | 'next' | 'parent') => string`

#### interface `SchemaValidationError`

- **path**: `string`
- **message**: `string`
- **raw?**: `unknown`

#### interface `SchemaValidationResult`

- **documentType**: `DocumentType | null`
- **errors**: `SchemaValidationError[]`

#### interface `SchemaValidatorSchemas`

- **definition?**: `object`
- **theme?**: `object`
- **component?**: `object`
- **mapping?**: `object`
- **response?**: `object`
- **validation_report?**: `object`
- **validation_result?**: `object`
- **registry?**: `object`
- **changelog?**: `object`
- **fel_functions?**: `object`
- **locale?**: `object`

#### interface `SchemaValidator`

##### `validate(document: unknown, documentType?: DocumentType | null): SchemaValidationResult`

#### interface `ExtensionUsageIssue`

- **path**: `string`
- **extension**: `string`
- **severity**: `'error' | 'warning' | 'info'`
- **code**: `'UNRESOLVED_EXTENSION' | 'EXTENSION_RETIRED' | 'EXTENSION_DEPRECATED'`
- **message**: `string`

#### interface `ValidateExtensionUsageOptions`

- **resolveEntry**: `(name: string) => RegistryEntry | undefined`

#### interface `AssemblyProvenance`

- **url**: `string`
- **version**: `string`
- **keyPrefix?**: `string`
- **fragment?**: `string`

#### interface `AssemblyResult`

- **definition**: `FormDefinition`
- **assembledFrom**: `AssemblyProvenance[]`

#### interface `RewriteMap`

- **fragmentRootKey**: `string`
- **hostGroupKey**: `string`
- **importedKeys**: `Set<string>`
- **keyPrefix**: `string`

#### interface `ComponentObject`

- **component**: `string`
- **bind?**: `string`
- **when?**: `string`
- **style?**: `Record<string, any>`
- **children?**: `ComponentObject[]`

#### interface `ComponentDocument`

- **$formspecComponent**: `string`
- **version**: `string`
- **targetDefinition**: `{
        url: string;
        compatibleVersions?: string;
    }`
- **url?**: `string`
- **name?**: `string`
- **title?**: `string`
- **description?**: `string`
- **breakpoints?**: `Record<string, number>`
- **tokens?**: `Record<string, any>`
- **components?**: `Record<string, any>`
- **tree**: `ComponentObject`

#### interface `RemoteOptionsState`

- **loading**: `boolean`
- **error**: `string | null`

#### interface `FormEngineRuntimeContext`

- **now?**: `(() => EngineNowInput) | EngineNowInput`
- **locale?**: `string`
- **timeZone?**: `string`
- **seed?**: `string | number`
- **meta?**: `Record<string, string | number | boolean>`

#### interface `RegistryEntry`

- **name**: `string`
- **category?**: `string`
- **version?**: `string`
- **status?**: `string`
- **description?**: `string`
- **compatibility?**: `{
        formspecVersion?: string;
        mappingDslVersion?: string;
    }`
- **deprecationNotice?**: `string`
- **baseType?**: `string`
- **constraints?**: `{
        pattern?: string;
        maxLength?: number;
        [key: string]: any;
    }`
- **metadata?**: `Record<string, any>`

#### interface `PinnedResponseReference`

- **definitionUrl**: `string`
- **definitionVersion**: `string`

#### interface `FormProgress`

- **total**: `number`
- **filled**: `number`
- **valid**: `number`
- **required**: `number`
- **requiredFilled**: `number`
- **complete**: `boolean`

#### interface `AuthoredSignatureIdentityBinding`

- **method**: `string`
- **assuranceLevel**: `'none' | 'low' | 'standard' | 'high' | 'very-high'`
- **providerRef?**: `string`
- **externalAttestationRef?**: `string`

#### interface `AuthoredSignatureSignedPayload`

- **canonicalization**: `'formspec-response-signing-v1'`
- **digestAlgorithm**: `'sha-256'`
- **digest**: `string`
- **responseId**: `string`
- **definitionUrl**: `string`
- **definitionVersion**: `string`
- **signedAt**: `string`
- **signingIntent**: `string`

#### interface `AuthoredSignatureInput`

- **signatureId**: `string`
- **documentId**: `string`
- **signingIntent**: `string`
- **signatureValue**: `string`
- **signerId?**: `string`
- **signerName?**: `string`
- **signedAt**: `string`
- **consentAccepted**: `boolean`
- **consentTextRef**: `string`
- **consentVersion**: `string`
- **affirmationText**: `string`
- **signedPayload**: `AuthoredSignatureSignedPayload`
- **documentHash**: `string`
- **documentHashAlgorithm**: `string`
- **identityProofRef?**: `string`
- **identityBinding?**: `AuthoredSignatureIdentityBinding`
- **signatureProvider**: `string`
- **ceremonyId**: `string`

#### interface `FormEngineDiagnosticsSnapshot`

- **definition**: `{
        url: string;
        version: string;
        title: string;
    }`
- **timestamp**: `string`
- **structureVersion**: `number`
- **repeats**: `Record<string, number>`
- **values**: `Record<string, any>`
- **mips**: `Record<string, {
        relevant: boolean;
        required: boolean;
        readonly: boolean;
        error: string | null;
    }>`
- **validation**: `ValidationReport`
- **runtimeContext**: `{
        now: string;
        locale?: string;
        timeZone?: string;
        seed?: string | number;
    }`

#### interface `EngineReplayApplyResult`

- **ok**: `boolean`
- **event**: `EngineReplayEvent`
- **output?**: `any`
- **error?**: `string`

#### interface `EngineReplayResult`

- **applied**: `number`
- **results**: `EngineReplayApplyResult[]`
- **errors**: `Array<{
        index: number;
        event: EngineReplayEvent;
        error: string;
    }>`

#### interface `IFormEngine`

- **localeSignal** (`ReadonlyEngineSignal<number>`): Reactive tick signal — increments on **active-locale** or
**available-locales** changes (`setLocale`, `loadLocale`). Subscribe to
drive re-renders that consume `getActiveLocale` / `getAvailableLocales`.

Note: `setDirectionMode` (when exposed) bumps an internal
`_directionVersion` separately; if `getLocaleDirection` consumers need
reactivity for direction-mode changes, expose a `directionSignal` or
fold the two ticks. Today `direction` updates indirectly via the locale
cascade so single-signal subscription is sufficient.

##### `setRuntimeContext(context: FormEngineRuntimeContext): void`

##### `getOptions(path: string): OptionEntry[]`

##### `getOptionsSignal(path: string): EngineSignal<OptionEntry[]> | undefined`

##### `getOptionsState(path: string): RemoteOptionsState`

##### `getOptionsStateSignal(path: string): EngineSignal<RemoteOptionsState> | undefined`

##### `waitForRemoteOptions(): Promise<void>`

##### `waitForInstanceSources(): Promise<void>`

##### `setInstanceValue(name: string, path: string | undefined, value: any): void`

##### `getInstanceData(name: string, path?: string): any`

##### `getDisabledDisplay(path: string): 'hidden' | 'protected'`

##### `getVariableValue(name: string, scopePath: string): any`

##### `addRepeatInstance(itemName: string): number | undefined`

##### `removeRepeatInstance(itemName: string, index: number): void`

##### `compileExpression(expression: string, currentItemName?: string): () => any`

##### `setValue(name: string, value: any): void`

##### `getValidationReport(options?: {
        mode?: 'continuous' | 'submit';
    }): ValidationReport`

##### `evaluateShape(shapeId: string): ValidationResult[]`

##### `isPathRelevant(path: string): boolean`

##### `getFieldPaths(): string[]`

##### `getProgress(): FormProgress`

##### `getResponse(meta?: {
        id?: string;
        author?: {
            id: string;
            name?: string;
        };
        subject?: {
            id: string;
            type?: string;
        };
        authoredSignatures?: AuthoredSignatureInput[];
        mode?: 'continuous' | 'submit';
    }): any`

##### `getDiagnosticsSnapshot(options?: {
        mode?: 'continuous' | 'submit';
    }): FormEngineDiagnosticsSnapshot`

##### `applyReplayEvent(event: EngineReplayEvent): EngineReplayApplyResult`

##### `replay(events: EngineReplayEvent[], options?: {
        stopOnError?: boolean;
    }): EngineReplayResult`

##### `getDefinition(): FormDefinition`

##### `setLabelContext(context: string | null): void`

##### `getLabel(item: FormItem): string`

##### `loadLocale(doc: LocaleDocument): void`

##### `setLocale(code: string): void`

##### `getActiveLocale(): string`

##### `getAvailableLocales(): string[]`

##### `getLocaleDirection(): 'ltr' | 'rtl'`

##### `getFieldVM(path: string): FieldViewModel | undefined`

##### `getFormVM(): FormViewModel`

##### `resolveLocaleString(key: string, fallback: string): string`

Resolve a locale string key with fallback. For component-tier `$component.` keys.

##### `dispose(): void`

##### `injectExternalValidation(results: Array<{
        path: string;
        severity: string;
        code: string;
        message: string;
        source?: string;
    }>): void`

##### `clearExternalValidation(path?: string): void`

##### `setRegistryEntries(entries: any[]): void`

##### `migrateResponse(responseData: Record<string, any>, fromVersion: string): Record<string, any>`

#### interface `MappingDiagnostic`

- **ruleIndex**: `number`
- **sourcePath?**: `string`
- **targetPath?**: `string`
- **errorCode**: `'COERCE_FAILURE' | 'UNMAPPED_VALUE' | 'FEL_RUNTIME' | 'PATH_NOT_FOUND' | 'INVALID_DOCUMENT' | 'ADAPTER_FAILURE' | 'VERSION_MISMATCH' | 'INVALID_FEL' | 'WASM_NOT_READY'`
- **message**: `string`

#### interface `RuntimeMappingResult`

- **direction**: `MappingDirection`
- **output**: `any`
- **appliedRules**: `number`
- **diagnostics**: `MappingDiagnostic[]`

#### interface `IRuntimeMappingEngine`

##### `forward(source: any): RuntimeMappingResult`

##### `reverse(source: any): RuntimeMappingResult`

#### type `FELConditionBuilderOperator`

Operators for structured FEL conditions (mirrors Studio `fel-condition-builder`).

#### type `FELConditionGroupLiftResult`

```ts
type FELConditionGroupLiftResult = FELConditionGroupLifted | FELConditionGroupUnlifted;
```

#### type `DocumentType`

```ts
type DocumentType = 'definition' | 'theme' | 'component' | 'mapping' | 'response' | 'validation_report' | 'validation_result' | 'registry' | 'changelog' | 'fel_functions' | 'locale';
```

#### type `DefinitionResolver`

```ts
type DefinitionResolver = (url: string, version?: string) => FormDefinition | Promise<FormDefinition>;
```

#### type `EngineNowInput`

```ts
type EngineNowInput = Date | string | number;
```

#### type `EngineReplayEvent`

#### type `MappingDirection`

```ts
type MappingDirection = 'forward' | 'reverse';
```

## `interpolateMessage(template: string, evaluator: (expr: string) => unknown): InterpolateResult`

Resolve `{{expr}}` sequences in a locale string.

Rules (§3.3.1):
1. `{{{{` → literal `{{` (escape before scanning)
2. Failed parse/eval → preserve literal `{{expr}}` + warning.
   Includes any eval where WASM records error-severity diagnostics (side-channel check).
3–4. Coerce values; `null` → "" except rule 3a (no `$`/`@` and not a static literal → preserve)
5. Replacement text is NOT re-scanned for `{{`

#### interface `InterpolationWarning`

@filedesc Template string interpolator for locale {{expr}} sequences (spec §3.3.1).

- **expression**: `string`
- **error**: `string`

#### interface `InterpolateResult`

- **text**: `string`
- **warnings**: `InterpolationWarning[]`

#### interface `LocaleDocument`

A loaded locale document providing translated strings for a target definition.

- **$formspecLocale**: `string`
- **locale**: `string`
- **version**: `string`
- **fallback?**: `string`
- **targetDefinition**: `{
        url: string;
        compatibleVersions?: string;
    }`
- **strings**: `Record<string, string>`
- **name?**: `string`
- **title?**: `string`
- **description?**: `string`
- **url?**: `string`

#### interface `LookupResult`

Rich lookup result exposing which cascade level produced the value.

- **value**: `string | null`
- **source**: `'regional' | 'fallback' | 'implicit' | null`
- **localeCode?**: `string`

#### class `LocaleStore`

Manages loaded locale documents, resolves string keys through the
regional -> fallback -> implicit cascade, and exposes reactive signals
for active locale and text direction.

##### `constructor(rx: EngineReactiveRuntime, directionMode?: 'ltr' | 'rtl' | 'auto')`

##### `setDirectionMode(mode: 'ltr' | 'rtl' | 'auto'): void`

##### `loadLocale(doc: LocaleDocument): void`

##### `setLocale(code: string): void`

##### `getAvailableLocales(): string[]`

##### `lookupKey(key: string): string | null`

##### `lookupKeyWithMeta(key: string): LookupResult`

##### `normalizeCode(code: string): string`

Normalize BCP 47: lowercase language, title-case script (4 chars),
uppercase region (2 chars), lowercase variants/extensions.

## `createMappingEngine(mappingDoc: unknown): IRuntimeMappingEngine`

#### class `RuntimeMappingEngine`

##### `constructor(mappingDocument: any)`

##### `forward(source: any): RuntimeMappingResult`

##### `reverse(source: any): RuntimeMappingResult`

#### interface `FormspecEnginePackage`

Type-level description of everything re-exported from the package entry.
Use this to type an injectable bundle, mock, or adapter that mirrors `formspec-engine`.

Note: Spec aliases (`FormspecDefinition`, `ValidationReport`, …) and `export type { … }`
from `./interfaces.js` are not listed here; import those types directly when needed.

- **runtime** (`{
        readonly FormEngine: typeof import('./engine/FormEngine.js').FormEngine;
        readonly createFormEngine: typeof import('./engine/init.js').createFormEngine;
    }`): `FormEngine` class and `createFormEngine` factory.
- **fel** (`typeof import('./fel/fel-api.js')`): WASM-backed FEL utilities, definition evaluation, schema validation, registry helpers.
- **assembly** (`typeof import('./assembly/assembleDefinition.js')`): Definition assembly with optional async `$ref` resolution.
- **mapping** (`typeof import('./mapping/RuntimeMappingEngine.js')`): Bidirectional mapping DSL runtime.
- **reactivity** (`{
        readonly preactReactiveRuntime: typeof import('./reactivity/preact-runtime.js').preactReactiveRuntime;
    }`): Default Preact-signals reactive runtime; swap for custom `EngineReactiveRuntime` implementations.

## `preactReactiveRuntime: EngineReactiveRuntime`

#### interface `EngineSignal`

Writable reactive cell with a single `.value` — implemented by Preact signals or a custom runtime.

#### interface `ReadonlyEngineSignal`

Read-only reactive cell — the consumer can observe but not mutate.
Returned by `computed()` and exposed on FieldViewModel properties.

#### interface `EngineReactiveRuntime`

Pluggable batching + signal factory so FormEngine does not import `@preact/signals-core` directly.

##### `signal(initial: T): EngineSignal<T>`

##### `computed(fn: () => T): ReadonlyEngineSignal<T>`

##### `effect(fn: () => void): () => void`

##### `batch(fn: () => T): T`

## `isNumericType(dataType: string): boolean`

True if `dataType` is a numeric type (integer, decimal).

## `isDateType(dataType: string): boolean`

True if `dataType` is a date/time type (date, time, dateTime).

## `isChoiceType(dataType: string): boolean`

True if `dataType` is a choice type (choice, multiChoice).

## `isTextType(dataType: string): boolean`

True if `dataType` is a text type (string, text).

## `isBinaryType(dataType: string): boolean`

True if `dataType` is the binary/attachment type.

## `isBooleanType(dataType: string): boolean`

True if `dataType` is boolean.

## `isMoneyType(dataType: string): boolean`

True if `dataType` is money ({amount, currency} object).

## `isUriType(dataType: string): boolean`

True if `dataType` is uri.

## `isWasmReady(): boolean`

Whether the WASM module has been initialized and is ready for use.

## `initWasm(): Promise<void>`

Initialize the WASM module. Safe to call multiple times — subsequent calls
return the same promise. Resolves when WASM is ready; rejects on failure.

In Node.js, uses `initSync()` with bytes read from disk.
In browsers, the generated wasm-bindgen loader fetches the sibling `.wasm` asset via URL.

## `getWasmModule(): WasmModule`

Initialized runtime module — for `wasm-bridge-tools` only (ABI check).
Not re-exported from the public `wasm-bridge` barrel.

## `wasmEvalFEL(expression: string, fields?: Record<string, any>): any`

Evaluate a FEL expression with optional field values. Returns the evaluated result.

## `wasmEvalFELWithContext(expression: string, context: WasmFelContext): any`

Evaluate a FEL expression with full FormspecEnvironment context.

## `wasmEvalFELWithTrace(expression: string, fields?: Record<string, unknown>): FelTraceResult`

Evaluate a FEL expression with a structured trace of evaluation steps.

Opt-in tracing path — use when surfacing evaluation to humans or LLMs
(MCP tools, error explainers). Values in the trace are projected to JSON,
losing FEL type fidelity (money/date) but gaining universal readability.

## `wasmFelExprIsInterpolationStaticLiteral(expression: string): boolean`

Locale §3.3.1 — true if the expression AST is only literals and unary `not` / `!` / `-`.

## `wasmConsumeLastEvalErrorDiagnostics(): boolean`

Locale §3.3.1 rule 2 — read and reset the error-diagnostics flag.
Returns `true` if the most recent WASM FEL eval recorded error-severity
diagnostics. The flag is reset to `false` after reading.

## `wasmPrepareFelExpression(optionsJson: string): string`

Normalize FEL source before evaluation (bare `$`, repeat qualifiers, repeat aliases).

## `wasmResolveOptionSetsOnDefinition(definitionJson: string): string`

Inline `optionSet` references from `optionSets` on a definition JSON document.

## `wasmApplyMigrationsToResponseData(definitionJson: string, responseDataJson: string, fromVersion: string, nowIso: string): string`

Apply `migrations` on a definition to flat response data (FEL transforms in Rust).

## `wasmCoerceFieldValue(itemJson: string, bindJson: string, definitionJson: string, valueJson: string): string`

Coerce an inbound field value (whitespace, numeric strings, money, precision).

## `wasmGetFELDependencies(expression: string): string[]`

Extract field path dependencies from a FEL expression. Returns an array of path strings.

## `wasmNormalizeIndexedPath(path: string): string`

Normalize a dotted path by stripping repeat indices.

## `wasmItemAtPath(items: unknown[], path: string): T | undefined`

Resolve an item in a nested item tree by dotted path.

## `wasmItemLocationAtPath(items: unknown[], path: string): {
    parentPath: string;
    index: number;
    item: T;
} | undefined`

Resolve an item's parent path, index, and value in a nested item tree.

## `wasmEvaluateDefinition(definition: unknown, data: Record<string, unknown>, context?: {
    nowIso?: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousValidations?: Array<{
        path: string;
        severity: string;
        constraintKind: string;
        code: string;
        message: string;
        source: string;
        shapeId?: string;
        context?: Record<string, unknown>;
    }>;
    previousNonRelevant?: string[];
    instances?: Record<string, unknown>;
    registryDocuments?: unknown[];
    /** Repeat row counts by group base path (authoritative for min/max repeat cardinality). */
    repeatCounts?: Record<string, number>;
}): {
    values: any;
    validations: any[];
    nonRelevant: string[];
    variables: any;
    required: Record<string, boolean>;
    readonly: Record<string, boolean>;
}`

Evaluate a Formspec definition against provided data.

## `wasmEvaluateScreenerDocument(screener: unknown, answers: Record<string, unknown>, context?: Record<string, unknown>): import('@formspec-org/types').DeterminationRecord`

Evaluate a standalone Screener Document against respondent inputs.
Returns a Determination Record (always non-null).

## `wasmAnalyzeFEL(expression: string): WasmFelAnalysisResultJson`

Analyze a FEL expression and return structural info.

## `wasmAnalyzeFELWithFieldTypes(expression: string, fieldTypes: Record<string, string>): WasmFelAnalysisResultJson`

Analyze a FEL expression with field data type context for type-mismatch warnings.

## `wasmIsValidFelIdentifier(s: string): boolean`

Check if a string is a valid FEL identifier.

## `wasmSanitizeFelIdentifier(s: string): string`

Sanitize a string into a valid FEL identifier.

## `wasmComputeDependencyGroups(entriesJson: string): Array<{
    entries: number[];
    reason: string;
}>`

Compute dependency groups from recorded changeset entries (JSON round-trip to Rust).

#### interface `WasmFelContext`

FEL evaluation context for the richer WASM evaluator.

- **locale** (`string`): Active locale code (BCP 47) — backs `locale()` and default for `pluralCategory()`.
- **meta** (`Record<string, string | number | boolean>`): Runtime metadata bag — backs `runtimeMeta(key)`.

#### interface `FelTraceResult`

Result of a traced FEL evaluation.

- **value** (`unknown`): Evaluated value (JSON-projected — no FEL type tags).
- **diagnostics** (`Array<Record<string, unknown>>`): Diagnostics emitted during evaluation.
- **trace** (`FelTraceStep[]`): Ordered trace steps, appended in evaluation order.

#### type `WasmFelAnalysisResultJson`

Parsed JSON from `fel_analysis_to_json_value` (Rust) — pass through to {@link normalizeFelAnalysisError}.

#### type `WasmModule`

```ts
type WasmModule = typeof import('../wasm-pkg-runtime/formspec_wasm_runtime.js');
```

#### type `FelTraceStep`

A single recorded event during FEL evaluation.

Mirrors `fel_core::TraceStep` verbatim — the `kind` discriminant is the
PascalCase Rust variant name. Extend this union only when the Rust enum
grows a new variant; every variant here must exist in Rust.

## `resolveWasmAssetPathForNode(relativeToThisModule: string): Promise<string>`

Resolve a sibling `.wasm` path for Node `readFileSync`.
Vitest/vite-node can rewrite `import.meta.url` to a non-`file:` URL; fall back to the `@formspec-org/engine` package root.

## `nodeFsModuleName`

@filedesc Node helpers to resolve sibling `.wasm` bytes when `import.meta.url` is not `file:` (e.g. Vitest).

## `nodeUrlModuleName`

## `nodePathModuleName`

## `nodeModuleModuleName`

## `isWasmToolsReady(): boolean`

Whether the tools WASM module has been initialized and is ready for use.

## `initWasmTools(): Promise<void>`

Initialize the tools WASM module (lazy-only paths: lint/registry/mapping/changelog/assembly).
Safe to call multiple times — subsequent calls return the same promise.

## `assertRuntimeToolsSplitAbiMatch(runtimeVersion: string, toolsVersion: string): void`

Validates paired runtime/tools split ABI strings (same contract as `formspecWasmSplitAbiVersion()` in WASM).
Exported for unit tests; `initWasmTools` uses this after loading the tools module.

## `getToolsWasmDynamicImportCountForTest(): number`

@internal Test helper — dynamic `import()` count for tools JS glue.

## `resetToolsWasmDynamicImportCountForTest(): void`

@internal Reset import counter (use only in isolated test processes).

## `wasmParseFEL(expression: string): boolean`

Parse a FEL expression and return whether it's valid.

## `wasmTokenizeFEL(expression: string): Array<{
    tokenType: string;
    text: string;
    start: number;
    end: number;
}>`

Tokenize a FEL expression and return positioned token records.

## `wasmExtractDependencies(expression: string): {
    fields: string[];
    contextRefs: string[];
    instanceRefs: string[];
    mipDeps: string[];
    hasSelfRef: boolean;
    hasWildcard: boolean;
    usesPrevNext: boolean;
}`

Extract full dependency info from a FEL expression.

## `wasmDetectDocumentType(doc: unknown): string | null`

Detect the document type of a Formspec JSON document.

## `wasmJsonPointerToJsonPath(pointer: string): string`

Convert a JSON Pointer into a JSONPath string.

## `wasmPlanSchemaValidation(doc: unknown, documentType?: string | null): {
    documentType: string | null;
    mode: 'unknown' | 'document' | 'component';
    componentTargets: Array<{
        pointer: string;
        component: string;
        node: any;
    }>;
    error?: string | null;
}`

Plan schema validation dispatch and component-node target enumeration.

## `wasmAssembleDefinition(definition: unknown, fragments: Record<string, unknown>): {
    definition: any;
    warnings: string[];
    errors: string[];
    assembledFrom?: Array<{
        url: string;
        version: string;
        keyPrefix?: string;
        fragment?: string;
    }>;
}`

Assemble a definition by resolving $ref inclusions.

## `wasmExecuteMapping(rules: unknown[], source: unknown, direction: 'forward' | 'reverse'): {
    direction: string;
    output: any;
    rulesApplied: number;
    diagnostics: any[];
}`

Execute a mapping transform.

## `wasmExecuteMappingDoc(doc: unknown, source: unknown, direction: 'forward' | 'reverse'): {
    direction: string;
    output: any;
    rulesApplied: number;
    diagnostics: any[];
}`

Execute a full mapping document (rules + defaults + autoMap).

## `wasmLintDocument(doc: unknown): {
    documentType: string | null;
    valid: boolean;
    diagnostics: any[];
}`

Lint a Formspec document.

## `wasmCollectFELRewriteTargets(expression: string): {
    fieldPaths: string[];
    currentPaths: string[];
    variables: string[];
    instanceNames: string[];
    navigationTargets: Array<{
        functionName: 'prev' | 'next' | 'parent';
        name: string;
    }>;
}`

Collect the rewriteable targets in a FEL expression.

## `wasmRewriteFELReferences(expression: string, rewrites: {
    fieldPaths?: Record<string, string>;
    currentPaths?: Record<string, string>;
    variables?: Record<string, string>;
    instanceNames?: Record<string, string>;
    navigationTargets?: Record<string, string>;
}): string`

Rewrite a FEL expression using explicit rewrite maps.

## `wasmRewriteFelForAssembly(expression: string, mapJson: string): string`

Rewrite FEL using definition-assembly `RewriteMap` JSON (fragment + host keys).

## `wasmRewriteMessageTemplate(message: string, rewrites: {
    fieldPaths?: Record<string, string>;
    currentPaths?: Record<string, string>;
    variables?: Record<string, string>;
    instanceNames?: Record<string, string>;
    navigationTargets?: Record<string, string>;
}): string`

Rewrite FEL expressions embedded in {{...}} interpolation segments.

## `wasmPrintFEL(expression: string): string`

Print a FEL expression AST back to normalized source.

## `wasmTryLiftConditionGroup(expression: string): FELConditionGroupLiftResult`

Parse FEL and lift a homogeneous `and` / `or` chain into Studio condition-group JSON when possible.

## `wasmListBuiltinFunctions(): Array<{
    name: string;
    category: string;
    signature: string;
    description: string;
}>`

Return the builtin FEL function catalog exported by the Rust runtime.

## `wasmLintDocumentWithRegistries(doc: unknown, registries: unknown[]): {
    documentType: string | null;
    valid: boolean;
    diagnostics: any[];
}`

Lint a Formspec document with explicit registry documents.

## `wasmParseRegistry(registry: unknown): {
    publisher: {
        name?: string;
        url?: string;
        contact?: string;
    };
    published?: string;
    entryCount: number;
    validationIssues: any[];
}`

Parse and validate a registry document, returning summary metadata.

## `wasmFindRegistryEntry(registry: unknown, name: string, versionConstraint?: string): any | null`

Find the highest-version registry entry matching a name and version constraint.

## `wasmValidateLifecycleTransition(from: string, to: string): boolean`

Validate a lifecycle transition between two registry statuses.

## `wasmWellKnownRegistryUrl(baseUrl: string): string`

Construct a well-known registry URL from a base URL.

## `wasmGenerateChangelog(oldDefinition: unknown, newDefinition: unknown, definitionUrl: string): any`

Generate a structured changelog between two definitions.

## `wasmValidateExtensionUsage(items: unknown[], registryEntries: Record<string, unknown>): Array<{
    path: string;
    extension: string;
    severity: 'error' | 'warning' | 'info';
    code: 'UNRESOLVED_EXTENSION' | 'EXTENSION_RETIRED' | 'EXTENSION_DEPRECATED';
    message: string;
}>`

Validate enabled x-extension usage in an item tree against registry entries.

#### type `WasmToolsModule`

```ts
type WasmToolsModule = typeof import('../wasm-pkg-tools/formspec_wasm_tools.js');
```

