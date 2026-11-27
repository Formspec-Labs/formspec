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
type FormspecBind = FormBind;
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

## `createDemoSubmitResponseActions(options: DemoSubmitResponseActionsOptions): ResponseActionsDocumentInput`

Build a minimal Response Actions sidecar for demos, stories, and test fixtures.

#### interface `DemoSubmitResponseActionsOptions`

- **definitionUrl** (`string`): Definition url for `targetDefinition` binding.
- **actionId** (`string`): Action id; default `'submit'`.
- **emitOnValidationError** (`boolean`): When true (default), override the master-table submit tuple with
`(on-submit, non-blocking, none)` so `formspec-submit` hostEvent fires
even when validation fails — required for demo `onSubmit` error UX.
When false, inherit master-table submit semantics (`block-on-error`).

## `diffEvalResults(previous: EvalResult | null, next: EvalResult): EvalDelta`

#### interface `EvalValidation`

- **path**: `string`
- **shapeId?**: `string`

#### interface `EvalDiagnostic`

Author-facing diagnostic from Response creation or FEL evaluation.

- **path** (`string`): Resolved instance path of the bind or shape target (`#` for form-level shapes).
- **code** (`string`): FEL diagnostic code, such as `FEL_AMBIGUOUS_ROW_LOOKUP`, when the error has one.

#### interface `EvalResult`

- **invalidPaths** (`string[]`): Paths that `valid()` reads as invalid in the settled evaluation (Core §3.5.9).

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

## `prepareDocumentAttestations(input: {
    response: FormResponse;
    definition: FormDefinition;
    resolvedDocuments: [ResolvedDocument, ...ResolvedDocument[]];
    commitment: DocumentAttestationCommitment;
}): Promise<{
    response: FormResponse;
    signedBytes: Uint8Array;
    digest: string;
}>`

Prepare one immutable signing gesture. This does not sign or verify anything.
The returned bytes use the maintained v1 rule; only top-level authoredSignatures
is excluded. The caller must present these exact committed claims for assent.

## `finalizeDocumentAttestations(input: DocumentAttestationVerification & {
    signatureBytes: Uint8Array;
}): Promise<VerifiedDocumentAttestations>`

Emit all selected document records atomically only after genuine verification.

## `verifyDocumentAttestations(input: DocumentAttestationVerification): Promise<VerifiedDocumentAttestations>`

Verify serialized declared-document evidence and its explicitly retained witnesses.

#### interface `DocumentAttestationWitness`

A retained principal snapshot and the key the host actually expects for it.

- **response**: `FormResponse`
- **definition**: `FormDefinition`
- **keyRef**: `KeyRef`

#### interface `DocumentAttestationVerification`

The verifier is a host capability; registry/key inputs are captured before awaits.

- **registry**: `SignatureMethodRegistry`
- **verifier**: `Verifier`
- **witnesses?**: `readonly DocumentAttestationWitness[]`

#### interface `VerifiedDocumentAttestations`

- **receipt** (`VerificationReceipt`): Actual verifier output, separate from any authenticated receipt claim.

#### class `FormEngine`

##### `constructor(definition: FormDefinition, options?: FormEngineOptions)`

- **writeSources** (`Record<string, EngineSignal<WriteSource | null>>`): Who last wrote each field (`'user'` by default, `'assist'` for Assist-driven writes); null until written.
- **instanceData** (`JsonRecord`): Own-key JSON data map; valid source names never inherit Object prototype values.

##### `resolvePinnedDefinition(response: PinnedResponseReference, definitions: T[]): T`

##### `setRuntimeContext(context?: FormEngineRuntimeContext): void`

##### `setIssuerOverride(source: IssuerSource | undefined): void`

##### `getResolvedIssuer(): Promise<ResolvedIssuer>`

##### `getOptions(path: string): OptionEntry[]`

##### `getOptionsSignal(path: string): EngineSignal<OptionEntry[]> | undefined`

##### `getOptionsState(path: string): RemoteOptionsState`

##### `getOptionsStateSignal(path: string): EngineSignal<RemoteOptionsState> | undefined`

##### `waitForRemoteOptions(): Promise<void>`

##### `waitForInstanceSources(): Promise<Readonly<Record<string, InstanceSourceLoadOutcome>>>`

##### `setInstanceValue(name: string, path: string | undefined, value: FormFieldValue): void`

##### `getInstanceData(name: string, path?: string): FormFieldValue`

##### `getDisabledDisplay(path: string): 'hidden' | 'protected'`

##### `getVariableValue(name: string, scopePath: string): FormFieldValue`

##### `addRepeatInstance(itemName: string): number | undefined`

Appends a row and returns its index; `undefined` when the path is not repeatable or already at `maxRepeat` (Core §4.2.2).

##### `removeRepeatInstance(itemName: string, index: number): void`

##### `loadResponseData(data: JsonRecord, explanations?: DraftExplanation[]): void`

Resume saved Response data with its exact row counts and answered fields.

##### `getDraftSnapshot(): FormDraftSnapshot`

##### `loadDraftSnapshot(snapshot: FormDraftSnapshot, explanations?: Explanation[]): void`

##### `getExplanationEntries(): DraftExplanation[]`

##### `getExplanationState(): ExplanationState`

##### `setExplanation(shapeId: string, path: string, answer: {
        text?: string;
    }): void`

##### `acknowledge(code: string, options?: {
        expectedBasis?: string;
    }): boolean`

##### `removeExplanation(key: ExplanationKey): void`

##### `acceptSavedExplanations(entries: Explanation[], options?: {
        mergeMissing?: boolean;
        base?: readonly DraftExplanation[];
    }): void`

##### `compileExpression(expression: string, currentItemName?: string): () => FormFieldValue`

##### `setValue(name: string, value: FormFieldValue, options?: SetValueOptions): void`

##### `hasSubjectRefusal(): boolean`

Whether the evaluator refused the supplied Response subject.

##### `getValidationReport(): ValidationReport`

##### `getValidationReport(options: {
        profile?: EnabledValidationProfile;
    }): ValidationReport`

##### `getValidationReport(options: {
        profile: 'off';
    }): null`

##### `getValidationReport(options?: ValidationReportOptions): ValidationReport | null`

##### `evaluateShape(shapeId: string): ValidationResult[]`

##### `isPathRelevant(path: string): boolean`

##### `whyRelevant(path: string): RelevanceExplanation`

##### `getDerivationTree(path: string): FelTraceStep[]`

##### `getDownstreamImpact(path: string): string[]`

##### `getFieldPaths(): string[]`

##### `getEvaluatedFormState(options?: ValidationReportOptions): EvaluatedFormState`

Read the current field flags and the requested validation profile, which defaults to live.

##### `getResponse(meta?: Parameters<FormEngine['getResponseSnapshot']>[0]): FormResponse`

##### `getResponseSnapshot(meta?: Parameters<IFormEngine['getResponse']>[0], validationProfile?: ValidationProfile): {
        response: FormResponse;
        validationReport: ValidationReport | null;
    }`

Capture response data and its requested validation report with one clock.

##### `captureSubmitSnapshot(meta?: Parameters<IFormEngine['getResponse']>[0]): {
        snapshot: {
            response: FormResponse;
            validationReport: ValidationReport | null;
        };
        pendingExplanationStamps: boolean;
    }`

Evaluate Submit once at the current clock and either emit the assembled candidate or return
an in-progress snapshot with `pendingExplanationStamps: true` when selected explanations lack stamps.

##### `getDiagnosticsSnapshot(options?: ValidationReportOptions): FormEngineDiagnosticsSnapshot`

##### `applyReplayEvent(event: EngineReplayEvent): EngineReplayApplyResult`

##### `replay(events: EngineReplayEvent[], options?: {
        stopOnError?: boolean;
    }): EngineReplayResult`

##### `getDefinition(): FormDefinition`

##### `setLabelContext(context: string | null): void`

##### `getLabel(item: FormItem): string`

Definition label for the active label context (no Locale, no `{{}}`); reactive to `setLabelContext`.

##### `getItemLabelSignal(path: string): ReadonlyEngineSignal<string> | undefined`

Reactive label a respondent sees for the Item at instance `path` — field, display, or group (a repeat row
path such as `jobs[0]` names its group). Same cascade as `FieldViewModel.label` (Locale
`<key>.label@context` → `<key>.label` → `labels[context]` → inline), `{{}}` interpolated in the Item's
scope. `undefined` when no Item has that path.

##### `getItemHintSignal(path: string): ReadonlyEngineSignal<string | null> | undefined`

Reactive hint a respondent sees for the Item at instance `path` — field, display, or group. Same
cascade as `FieldViewModel.hint` (Locale `<key>.hint@context` → `<key>.hint` → inline `hint`; no
Definition-side context step), `{{}}` interpolated in the Item's scope. `null` when no source has
one; `undefined` when no Item has that path.

##### `getItemDescriptionSignal(path: string): ReadonlyEngineSignal<string | null> | undefined`

{@link FormEngine.getItemHintSignal} for the Item's `description`.

##### `loadLocale(doc: LocaleDocument): void`

##### `setLocale(code: string): void`

##### `getActiveLocale(): string`

##### `getAvailableLocales(): string[]`

##### `getLocaleDirection(): 'ltr' | 'rtl'`

##### `getFieldVM(path: string): FieldViewModel | undefined`

##### `resolveValidationMessage(result: ValidationResult): string`

##### `getFormVM(): FormViewModel`

##### `resolveLocaleString(key: string, fallback: string, itemPath?: string): string`

##### `lookupLocaleString(key: string): string | null`

Raw Locale string for `key`, or `null` when no loaded document (through the fallback cascade, §4)
carries it. Unlike {@link resolveLocaleString}, this never runs `{{}}` through FEL — for chrome
strings (Locale §3.1.10 `$ui.<ChromeStringKey>`), whose `{{$param}}` placeholders are renderer-
supplied literals (`$label`, `$index`, ...), not form-scope FEL.

##### `injectExternalValidation(results: Array<{
        path: string;
        severity: string;
        code: string;
        message: string;
        source?: string;
    }>): void`

##### `clearExternalValidation(path?: string): void`

##### `dispose(): void`

##### `registerExtensionFunction(name: string, registration: FelExtensionFunctionRegistration): void`

##### `setRegistryEntries(entries: RegistryEntry[]): void`

##### `migrateResponse(responseData: JsonRecord, fromVersion: string): JsonRecord`

## `resolveOptionSetsOnDefinition(definition: FormDefinition): FormDefinition`

## `registerDraftEditVersionSignal(engine: object, signal: ReadonlyEngineSignal<number>): void`

## `getDraftEditVersionSignal(engine: object): ReadonlyEngineSignal<number> | undefined`

## `captureDraftData(items: FormItem[], fieldValue: (path: string) => JsonValue | undefined, repeatCount: (path: string) => number | undefined): JsonRecord`

Match the Response data tree, where dependent questions share their scalar parent's object.

## `felContextSchema(fieldDataTypes: Record<string, string | undefined>, bindConfigs: Record<string, EngineBindConfig>, itemPaths: string[]): FelContextSchema`

## `felContextSnapshot(options: FelContextSnapshotInput): FelContextSnapshot`

The whole form's FEL state in one payload, built O(fields + rows) per evaluation. Values stay untagged —
the Rust context types leaves from `FelContextSchema.dataTypes` and infers money from `{amount, currency}`.

#### interface `FelContextSchema`

Per-Definition input to the WASM FEL context: what `dataTypes` a leaf carries (Core §2.1.3) and which
binds render a non-relevant read as `null`. Changes only when the Definition does.

- **itemPaths**: `string[]`
- **dataTypes**: `Record<string, string>`
- **excludedValueNull**: `string[]`

#### interface `FelContextSnapshot`

Form-scope state of one evaluation — what the WASM context holds between ad-hoc reads.

- **values** (`Record<string, unknown>`): Field values by instance path; repeat group arrays are ignored in favour of their flat rows.
- **mips** (`{
        invalid: string[];
        nonRelevant: string[];
        readonly: string[];
        required: string[];
    }`): Instance paths whose MIP state departs from the default (valid, relevant, optional, writable).
- **repeatCounts** (`Record<string, number>`): Row counts by repeat group instance path.
- **variables** (`Record<string, Record<string, unknown>>`): Variable values by scope (`#` is form scope) and name.
- **dateFormats** (`Record<string, string>`): The active Locale document's `formats.date` patterns by `formatDate` style (Locale §2.4).

#### interface `FelContextSnapshotInput`

- **dateFormats** (`Record<string, string>`): The active Locale document's `formats.date` patterns by `formatDate` style (Locale §2.4).

## `normalizeRemoteOptions(payload: unknown): OptionEntry[]`

## `makeValidationResult(result: Pick<ValidationResult, 'path' | 'severity' | 'constraintKind' | 'code' | 'message' | 'source'> & Partial<Pick<ValidationResult, 'shapeId' | 'context'>>): ValidationResult`

## `toValidationResult(result: EvalValidation): ValidationResult`

Paths stay resolved instance paths with 0-based indexes (Core §4.3.3), exactly as WASM emits them.

## `toValidationResults(results: EvalValidation[]): ValidationResult[]`

## `toRuntimeMappingResult(result: {
    direction: string;
    output: JsonValue;
    rulesApplied: number;
    diagnostics: MappingDiagnostic[];
}): RuntimeMappingResult`

## `coerceFieldValue(item: FormItem, bind: EngineBindConfig | undefined, definition: FormDefinition, value: FormFieldValue): FormFieldValue`

## `validateDataType(value: FormFieldValue, dataType: string): boolean`

## `normalizeWasmValue(value: T): T`

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

## `getNestedValue(target: unknown, path: string): FormFieldValue`

## `setNestedPathValue(target: JsonRecord, path: string, value: FormFieldValue): void`

## `replaceBareCurrentFieldRefs(expression: string, currentFieldName: string): string`

## `flattenObject(value: JsonValue, prefix?: string, output?: JsonRecord): JsonRecord`

## `isEmptyValue(value: unknown): boolean`

## `topoSortKeys(nodes: T[], graph: Map<string, Set<string>>): T[]`

## `snapshotSignals(signals: Record<string, EngineSignal<FormFieldValue>>): JsonRecord`

## `toFelIndexedPath(path: string): string`

FEL expression addressing only (`$repeat[n]` is 1-based, Core §4.3.3); never for ValidationResult paths.

## `buildRepeatValueAliases(valuesByPath: JsonRecord): Array<[string, FormFieldValue[]]>`

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

#### type `EngineBindConfig`

```ts
type EngineBindConfig = FormBind & {
    precision?: number;
    disabledDisplay?: 'hidden' | 'protected';
};
```

#### type `RuntimeNowInput`

```ts
type RuntimeNowInput = Date | string | number;
```

## `createFormEngine(definition: FormDefinition, options?: FormEngineOptions): FormEngine`

## `validateInstanceDataAgainstSchema(instanceName: string, data: unknown, schema: Record<string, unknown> | undefined): void`

@filedesc Validate instance JSON against optional per-instance schema (datatype strings).

## `sourceErrorMessage(error: unknown): string`

## `freezeSourceMetadata(value: T): T`

## `cloneSourceJson(value: unknown, ancestors?: Set<object>): JsonValue`

Copy an acyclic JSON tree without invoking accessors or accepting non-JSON objects.

## `readSourceResult(value: unknown): InstanceSourceResult`

## `patchValueSignalsFromWasm(options: {
    values: Record<string, unknown>;
    signals: Record<string, EngineSignal<any>>;
    data: Record<string, any>;
    bindAt: (path: string, basePath: string) => EngineBindConfig | undefined;
    isCalculated: (path: string, basePath: string) => boolean;
    refused: boolean;
}): boolean`

## `patchDeltaSignalsFromWasm(rx: EngineReactiveRuntime, delta: EvalDelta, options: {
    relevantSignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    shapeResults: Record<string, EngineSignal<ValidationResult[]>>;
    variableSignals: Record<string, EngineSignal<any>>;
    variableSignalKeys: Map<string, string[]>;
}): void`

## `patchErrorSignalsFromWasm(rx: EngineReactiveRuntime, options: {
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    errorSignals: Record<string, EngineSignal<string | null>>;
}): void`

## `clearRepeatIndexedSubtree(options: {
    includesPath: (path: string) => boolean;
    signals: Record<string, EngineSignal<any>>;
    relevantSignals: Record<string, EngineSignal<boolean>>;
    requiredSignals: Record<string, EngineSignal<boolean>>;
    readonlySignals: Record<string, EngineSignal<boolean>>;
    errorSignals: Record<string, EngineSignal<string | null>>;
    validationResults: Record<string, EngineSignal<ValidationResult[]>>;
    writeSources: Record<string, EngineSignal<WriteSource | null>>;
    optionSignals: Record<string, EngineSignal<OptionEntry[]>>;
    optionStateSignals: Record<string, EngineSignal<RemoteOptionsState>>;
    repeats: Record<string, EngineSignal<number>>;
    data: Record<string, any>;
}): void`

Remove the selected repeat paths from signal stores and primary data.

## `snapshotRepeatRow(items: FormItem[], rowPath: string, readField: (path: string) => RepeatFieldState, getRepeatCount: (path: string) => number): RepeatRowSnapshot`

Capture paths relative to the row so the same state can be restored at its new index.

#### interface `RepeatFieldState`

- **value**: `FormFieldValue`
- **writeSource**: `WriteSource | null`

#### interface `RepeatRowSnapshot`

- **fields**: `Array<RepeatFieldState & {
        path: string;
    }>`
- **repeats**: `Array<{
        path: string;
        item: FormItem;
        count: number;
    }>`

## `toNormalizedAuthoredSignatureRecord(signature: AuthoredSignatureInput, index: number, responseId: string, definitionUrl: string, definitionVersion: string, meta: {
    author?: {
        id: string;
        name?: string;
    };
} | undefined): Record<string, unknown>`

Emit only JSON-Schema–declared AuthoredSignature properties (additionalProperties: false).

## `attachAuthoredSignature(response: T, signature: AuthoredSignatureInput): T & {
    authoredSignatures: Record<string, unknown>[];
}`

Append whole-response signing evidence to an already emitted, completed JSON Response.
Preserves all other Response content and returns independent nested objects. Does not
emit a Response, read a clock, or verify COSE bytes, digests, identity or receipt claims.
Callers must provide a valid Response snapshot and provider evidence; validate the
resulting document against the Response schema before transport when required.

## `buildFormspecResponseEnvelope(options: {
    definition: FormDefinition;
    data: Record<string, unknown>;
    report: ValidationReport | null;
    completionEligible?: boolean;
    timestamp: string;
    displayedIssuer?: {
        url: string;
        version: string;
    };
    displayedLocale?: {
        url?: string;
        version: string;
        locale: string;
    };
    subject?: FormEngineOptions['responseSubject'];
    meta?: {
        id?: string;
        author?: {
            id: string;
            name?: string;
        };
        authoredSignatures?: AuthoredSignatureInput[];
    };
}): Record<string, unknown>`

## `collectRelevantValidationResults(result: EvalResult, validations?: import("../diff.js").EvalValidation[]): ValidationResult[]`

Keep findings visible in the report produced for evaluated response data.

## `collectTimedShapeValidationResults(evalResult: EvalResult, shapeTiming: Map<string, EvalShapeTiming>, timing: EvalShapeTiming): ValidationResult[]`

Keep refusals alongside findings for the requested Shape timing.

## `buildValidationReportEnvelope(results: ValidationResult[], timestamp: string, definitionUrl?: string, definitionVersion?: string): ValidationReport`

Compute counts and wrap the evaluator's results in the spec report.

## `migrateResponseData(definition: FormDefinition, responseData: Record<string, any>, fromVersion: string, options: {
    nowIso: string;
}): Record<string, any>`

## `resolvePinnedDefinition(response: PinnedResponseReference, definitions: T[]): T`

## `isStamped(entry: DraftExplanation): entry is Explanation`

## `stripExplanationStamp(entry: DraftExplanation): DraftExplanation`

## `matchesEntry(entry: DraftExplanation, key: ExplanationKey): boolean`

## `sameAnswer(entry: DraftExplanation, other: DraftExplanation): boolean`

## `warningReview(resultFacts: EvalResult, entries: DraftExplanation[]): {
    findings: ExplanationFinding[];
    groups: {
        code: string;
        basis: string;
        shapeIds: string[];
        paths: string[];
        current: boolean;
        added: string[];
        removed: string[];
    }[];
    instances: {
        current: boolean;
        text: string | undefined;
        message: string;
        shapeId: string;
        path: string;
        code: string;
        inputs: Record<string, string>;
        mode: "confirm" | "explain";
        basis: string;
    }[];
    entries: DraftExplanation[];
    candidateEntries: DraftExplanation[];
    pendingStamps: boolean;
}`

#### type `Pending`

```ts
type Pending = Omit<T, 'author' | 'recorded'> & {
    author?: never;
    recorded?: never;
};
```

#### type `DraftExplanation`

A new answer acquires its author and timestamp when the server saves the draft.

```ts
type DraftExplanation = Explanation | Pending<InstanceExplanation> | Pending<GroupedAcknowledgement>;
```

#### type `ExplanationKey`

```ts
type ExplanationKey = {
    shapeId: string;
    path: string;
} | {
    code: string;
    partyRef?: string;
};
```

#### type `ExplanationFinding`

#### type `ExplanationState`

```ts
type ExplanationState = ReturnType<typeof warningReview>;
```

## `wasmEvaluateDefinitionPayload(options: {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousResult: Pick<EvalResult, 'nonRelevant'> | null;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    explanations?: DraftExplanation[];
}): {
    nowIso: string;
    trigger?: 'continuous' | 'submit' | 'demand' | 'disabled';
    previousNonRelevant: string[] | undefined;
    instances: Record<string, unknown>;
    registryDocuments: unknown[];
    subjectType?: string | null;
    subjectKeys?: ResponseSubjectKeys;
    explanations?: DraftExplanation[];
}`

Options object consumed by the WASM definition evaluator (JSON-serialized internally).

## `mergeWasmEvalWithExternalValidations(result: EvalResult, options: {
    externalValidations: EvalValidation[];
}): EvalResult`

Append engine-owned validations (e.g. extension hooks) after WASM batch evaluation.

#### type `EvalShapeTiming`

```ts
type EvalShapeTiming = 'continuous' | 'submit' | 'demand';
```

## `analyzeExperience(definition: JsonObject, experience: JsonObject): ExperienceAnalysis`

## `targetDefinitionFindings(definition: JsonObject, experience: JsonObject): ExperienceFinding[]`

## `coverageFindings(definition: JsonObject, experience: JsonObject): ExperienceFinding[]`

## `unresolvedItemRefFindings(definition: JsonObject, experience: JsonObject): ExperienceFinding[]`

## `referentialIntegrityFindings(experience: JsonObject): ExperienceFinding[]`

#### interface `ExperienceFinding`

- **code**: `ExperienceFindingCode`
- **severity**: `'warning'`
- **path**: `string`
- **message**: `string`
- **ref?**: `string`
- **target?**: `'actors' | 'tasks'`
- **unitId?**: `string`
- **experienceId?**: `string`

#### interface `ExperienceAnalysis`

- **findings**: `ExperienceFinding[]`
- **targetDefinition**: `ExperienceFinding[]`
- **referentialIntegrity**: `ExperienceFinding[]`
- **unresolvedItemRefs**: `ExperienceFinding[]`
- **coverage**: `ExperienceFinding[]`

#### type `JsonObject`

@filedesc Experience processor predicates for sidecar coverage and references.

```ts
type JsonObject = Record<string, unknown>;
```

#### type `ExperienceFindingCode`

```ts
type ExperienceFindingCode = 'EXP-TARGET-DEFINITION-MISMATCH' | 'EXP-TARGET-DEFINITION-VERSION-MISMATCH' | 'EXP-REFERENTIAL-INTEGRITY' | 'EXP-ITEM-REF-UNRESOLVED' | 'EXP-COVERAGE-UNCOVERED-REQUIRED-ITEM';
```

#### interface `FelExtensionFunctionRegistration`

A registered extension: its implementation and optional arity bounds.

- **implementation** (`(...args: any[]) => unknown`): Pure and total (Core §3.12): receives non-null JSON-like arguments, returns a JSON-like value.
- **minArgs** (`number`): Minimum argument count (default 0).
- **maxArgs** (`number`): Maximum argument count (default unbounded).

#### class `FelExtensionFunctions`

One engine's extension functions, in the shape Rust's evaluator calls (`FelExtensionHost`).

Registration checks the name in Rust (built-ins and reserved words are refused). Rust
keeps arity checks, null propagation, and a throw becoming an author diagnostic; this
adapter only looks up and invokes, with arguments and results as JSON text.

##### `register(name: string, registration: FelExtensionFunctionRegistration): void`

Registers `name`, replacing an earlier registration; throws for a FEL built-in or reserved word.

##### `arity(name: string): {
        minArgs: number;
        maxArgs?: number;
    } | undefined`

##### `invoke(name: string, argsJson: string): string`

## `analyzeFEL(expression: string): FELAnalysis`

## `analyzeFELWithFieldTypes(expression: string, fieldTypes: Record<string, string>): FELAnalysis`

Analyze a FEL expression with field data type context for type-mismatch warnings.

## `normalizePathSegment(segment: string): string`

Remove repeat indices/wildcards from a path segment.

## `splitNormalizedPath(path: string): string[]`

Split a dotted path into normalized (index-free) segments.

## `itemLocationAtPath(items: T[], path: string): ItemLocation<T> | undefined`

Find the mutable parent/index/item triple for a dotted tree path.

## `normalizeIndexedPath: typeof wasmNormalizeIndexedPath`

## `itemAtPath: typeof wasmItemAtPath`

## `getFELDependencies: typeof wasmGetFelDependencies`

## `evalFELWithTrace: typeof wasmEvalFelWithTrace`

Evaluate a FEL expression and return a structured trace of evaluation steps.
See `FelTraceStep` for the step variants; wire format matches Rust `fel_core::TraceStep`.

## `evalFELWithContextTrace: typeof wasmEvalFelWithContextTrace`

## `evaluateDefinition: typeof wasmEvaluateDefinition`

## `evaluateFiled: typeof wasmEvaluateFiled`

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

## `tokenizeFEL: typeof wasmTokenizeFel`

## `rewriteMessageTemplate: typeof wasmRewriteMessageTemplate`

## `lintDocument: typeof wasmLintDocument`

## `parseRegistry: typeof wasmParseRegistry`

## `findRegistryEntry: typeof wasmFindRegistryEntry`

## `validateLifecycleTransition: typeof wasmValidateLifecycleTransition`

## `wellKnownRegistryUrl: typeof wasmWellKnownRegistryUrl`

## `deriveJsonLdContext: typeof wasmDeriveJsonLdContext`

## `generateChangelog: typeof wasmGenerateChangelog`

## `printFEL: typeof wasmPrintFel`

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

- **writeSource** (`ReadonlyEngineSignal<WriteSource | null>`): Who last wrote this field; null until written.

##### `interpolate(template: string): string`

Resolve `{{expression}}` in this field's binding scope (Locale §3.3.1).

##### `resolveMessage(result: {
        code?: string;
        constraintKind?: string;
        message?: string;
    }): string`

The message a respondent reads for one of this field's validation results, through the Locale
validation-message cascade — what `errors` shows, for a result from any report (a submit, a summary).

##### `setValue(value: any, options?: SetValueOptions): void`

#### interface `ResolvedValidationResult`

- **path**: `string`
- **severity**: `string`
- **constraintKind**: `string`
- **code**: `string`
- **message**: `string`

#### interface `ResolvedOption`

- **keywords** (`string[]`): Abbreviations / alternate names for combobox type-ahead (from definition option.keywords).
- **needAnchors** (`string[]`): Canonical Need anchors copied from the exact authored option label.

#### interface `FieldViewModelDeps`

- **getConstraintMessage** (`() => string | null`): The Bind's inline `constraintMessage` template for this field, before `{{}}` resolution.
- **interpolate** (`(template: string) => string`): Resolves `{{expression}}` in the field's binding scope (Locale §3.3.1).
- **interpolateMessage** (`(template: string) => string`): {@link FieldViewModelDeps.interpolate} with bare `$` bound to the field, as in its Bind: validation messages.

## `createFormViewModel(deps: FormViewModelDeps): FormViewModel`

#### interface `FormViewModel`

##### `pageTitle(pageId: string): ReadonlyEngineSignal<string>`

##### `pageDescription(pageId: string): ReadonlyEngineSignal<string>`

#### interface `FormViewModelDeps`

- **getDefinitionTitle** (`() => string`): Returns definition.title
- **getDefinitionDescription** (`() => string | undefined`): Returns definition.description
- **getPageTitle** (`(pageId: string) => string | undefined`): Returns page title from theme pages array
- **getPageDescription** (`(pageId: string) => string | undefined`): Returns page description from theme pages
- **interpolate** (`(template: string) => string`): Resolves `{{expression}}` in the form-level (global) context (Locale §3.3.1)
- **getValidationCounts** (`() => {
        errors: number;
        warnings: number;
        infos: number;
    }`): Returns total validation error/warning/info counts
- **getIsValid** (`() => boolean`): Returns whether form is valid (no errors)

## `initFormspecEngine(options?: InitWasmOptions): Promise<void>`

Initialize the Formspec engine (loads and links the Rust/WASM module).

Call once during app startup (e.g. `await initFormspecEngine()` or `await initEngine()`).
Safe to call multiple times; concurrent calls share one load.

Not required for `formspec-webcomponent` only: importing that package starts WASM load automatically.
A host with no way to fetch the `.wasm` asset passes its bytes as `wasmBytes`; they win over the
default load, but only if this is the first call to start one.

## `isFormspecEngineInitialized(): boolean`

Whether {@link initFormspecEngine} has completed successfully in this JS realm.

## `initFormspecEngineTools(): Promise<void>`

Initialize the tools WASM module used by lint/mapping/registry/changelog helpers.
Runtime-first flows do not need this.

## `isFormspecEngineToolsInitialized(): boolean`

Whether the tools WASM module has completed initialization.

## `loadProjectionLinter(): Promise<typeof wasmLintDocument>`

Load the native document linter for hosts performing bundle admission.

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
- **issuer?**: `object`
- **theme?**: `object`
- **component?**: `object`
- **mapping?**: `object`
- **validation_mapping?**: `object`
- **response_actions?**: `object`
- **ontology?**: `object`
- **references?**: `object`
- **experience?**: `object`
- **response?**: `object`
- **intake_handoff?**: `object`
- **validation_report?**: `object`
- **validation_result?**: `object`
- **registry?**: `object`
- **changelog?**: `object`
- **fel_functions?**: `object`
- **locale?**: `object`
- **screener?**: `object`
- **determination?**: `object`
- **surface?**: `object`

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

#### interface `RemoteOptionsState`

- **loading**: `boolean`
- **error**: `string | null`

#### interface `FormEngineRuntimeContext`

- **now?**: `(() => EngineNowInput) | EngineNowInput`
- **locale?**: `string`
- **timeZone?**: `string`
- **seed?**: `string | number`
- **meta?**: `Record<string, string | number | boolean>`

#### interface `InstanceSourceRequest`

Detached metadata for one authored Definition-local instance source.

- **instanceName**: `string`
- **source**: `string`
- **definition**: `Readonly<{
        url?: string;
        version: string;
    }>`
- **schema?**: `Readonly<FormInstance['schema']>`
- **static**: `boolean`
- **readonly**: `boolean`

#### interface `FormEngineOptions`

Options for [`FormEngine`](./engine/FormEngine.ts) construction and [`createFormEngine`](./engine/init.ts).

- **loadExternalSources** (`boolean`): Set false to evaluate retained data without loading instance sources or remote options.
- **instanceSourceResolver** (`InstanceSourceResolver`): Exclusive source loader when supplied; injected values never use the shared URL cache.
- **extensionFunctions** (`Record<string, import('./extension-functions.js').FelExtensionFunctionRegistration>`): FEL extension functions by name (Core §3.12), registered before the first evaluation.
- **responseData** (`JsonRecord`): Host prefill for a new Response. Present values win over creation defaults.
- **savedResponseData** (`JsonRecord`): Resume saved Response data without applying creation defaults.
- **draftSnapshot** (`FormDraftSnapshot`): Resume an editable snapshot with a Definition pin. Supply only one data input.
- **savedExplanations** (`Explanation[]`): Warning entries from the saved Response paired with these answers.
- **responseSubject** (`Partial<Omit<NonNullable<FormResponse['subject']>, 'keys'>> & {
        keys?: ResponseSubjectKeys;
    }`): Host-supplied Response identity, available to FEL from the first evaluation. For a subject-declaring
Definition the engine derives `id` once from the validated `type` and `keys` and ignores a supplied
`id`; while the subject is refused (`hasSubjectRefusal()`), Response reads throw and the report keeps the
typed finding. Otherwise `id` is required and names the host entity.
- **responseInstanceResolutions** (`Readonly<Record<string, ResponseSelectionDelivery>>`): Available, host-qualified deliveries of Definition Response instances, keyed by instance name.

#### interface `FormDraftSnapshot`

Editable data pinned to a Definition, including hidden answers and exact repeat arrays.

- **definitionUrl**: `string`
- **definitionVersion**: `string`
- **data**: `JsonRecord`
- **explanations?**: `DraftExplanation[]`

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
- **constraints?**: `Record<string, JsonValue> & {
        pattern?: string;
        maxLength?: number;
    }`
- **metadata?**: `JsonRecord`

#### interface `PinnedResponseReference`

- **definitionUrl**: `string`
- **definitionVersion**: `string`

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

#### interface `VerificationReceiptInput`

- **result**: `'verified' | 'failed' | 'unsupported'`
- **method**: `string`
- **methodRegistryVersion**: `string`
- **adapter**: `{
        id: string;
        version: string;
    }`
- **key**: `{
        ref: string;
        version?: string;
        snapshot?: string;
    }`
- **verifiedAt**: `string`
- **context?**: `{
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
    }`
- **receiptBytes?**: `string`

#### interface `AuthoredSignatureInput`

- **signingActId** (`string`): Declared-document claims require the atomic tools-side signing route.

#### interface `FormEngineDiagnosticsSnapshot`

- **evaluationDiagnostics** (`EvalDiagnostic[]`): Expression errors from the evaluation behind `validation` (the latest live evaluation when `profile: 'off'`).

#### interface `EngineReplayApplyResult`

- **ok**: `boolean`
- **event**: `EngineReplayEvent`
- **output?**: `unknown`
- **error?**: `string`

#### interface `EngineReplayResult`

- **applied**: `number`
- **results**: `EngineReplayApplyResult[]`
- **errors**: `Array<{
        index: number;
        event: EngineReplayEvent;
        error: string;
    }>`

#### interface `RelevanceExplanation`

- **bindId**: `string | null`
- **expression**: `string | null`
- **dependsOn**: `string[]`
- **evaluatedAs**: `boolean`

#### interface `SetValueOptions`

- **source** (`WriteSource`): Recorded on the field's `writeSource` signal; Assist uses it to refuse overwriting a respondent's own typing.

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

##### `setIssuerOverride(source: IssuerSource | undefined): void`

##### `getResolvedIssuer(): Promise<ResolvedIssuer>`

##### `getOptions(path: string): OptionEntry[]`

##### `getOptionsSignal(path: string): EngineSignal<OptionEntry[]> | undefined`

##### `getOptionsState(path: string): RemoteOptionsState`

##### `getOptionsStateSignal(path: string): EngineSignal<RemoteOptionsState> | undefined`

##### `waitForRemoteOptions(): Promise<void>`

##### `waitForInstanceSources(): Promise<Readonly<Record<string, InstanceSourceLoadOutcome>>>`

##### `setInstanceValue(name: string, path: string | undefined, value: FormFieldValue): void`

##### `getInstanceData(name: string, path?: string): FormFieldValue`

##### `getDisabledDisplay(path: string): 'hidden' | 'protected'`

##### `getVariableValue(name: string, scopePath: string): FormFieldValue`

##### `addRepeatInstance(itemName: string): number | undefined`

Appends a row; `undefined` when not repeatable or already at `maxRepeat`.

##### `removeRepeatInstance(itemName: string, index: number): void`

##### `loadResponseData(data: JsonRecord, explanations?: Explanation[]): void`

Resumes saved Response `data`, replacing the current data without creation or repeat padding.

##### `loadDraftSnapshot(snapshot: FormDraftSnapshot, explanations?: Explanation[]): void`

Restores editable data from a draft pinned to this Definition.

##### `getDraftSnapshot(): FormDraftSnapshot`

Captures editable data without evaluation. Use exact JSON for persistence.

##### `getExplanationEntries(): DraftExplanation[]`

Read editing state, including pending answers without server stamps.

##### `getExplanationState(): ExplanationState`

Review warning firings evaluated against the Submit data.

##### `setExplanation(shapeId: string, path: string, answer: {
        text?: string;
    }): void`

##### `acknowledge(code: string, options?: {
        expectedBasis?: string;
    }): boolean`

Record a grouped blank-answer acknowledgement for `code`. When `expectedBasis` is given, returns `false` without mutating if a fresh Submit evaluation no longer matches that basis.

##### `removeExplanation(key: ExplanationKey): void`

##### `acceptSavedExplanations(entries: Explanation[], options?: {
        mergeMissing?: boolean;
        base?: readonly DraftExplanation[];
    }): void`

Apply server stamps to matching edits after an acknowledged draft save, optionally 3-way merging against a reviewed `base`.

##### `compileExpression(expression: string, currentItemName?: string): () => FormFieldValue`

##### `setValue(name: string, value: FormFieldValue, options?: SetValueOptions): void`

##### `getValidationReport(): ValidationReport`

##### `getValidationReport(options: {
        profile?: EnabledValidationProfile;
    }): ValidationReport`

Throws if the on-submit data do not converge.

##### `getValidationReport(options: {
        profile: 'off';
    }): null`

##### `getValidationReport(options: ValidationReportOptions): ValidationReport | null`

##### `evaluateShape(shapeId: string): ValidationResult[]`

##### `isPathRelevant(path: string): boolean`

##### `whyRelevant(path: string): RelevanceExplanation`

##### `getDerivationTree(path: string): FelTraceStep[]`

##### `getDownstreamImpact(path: string): string[]`

##### `getFieldPaths(): string[]`

##### `getEvaluatedFormState(options?: ValidationReportOptions): EvaluatedFormState`

##### `getResponse(meta?: {
        id?: string;
        author?: {
            id: string;
            name?: string;
        };
        /** Unkeyed subject metadata. Supply filing-unit identity through `FormEngineOptions.responseSubject`. */
        subject?: {
            id: string;
            type?: string;
        };
        authoredSignatures?: AuthoredSignatureInput[];
        profile?: ValidationProfile;
    }): FormResponse`

Returns data for the Response profile. Throws if on-submit data do not converge.

##### `getResponseSnapshot(meta?: Parameters<IFormEngine['getResponse']>[0], validationProfile?: ValidationProfile): {
        response: FormResponse;
        validationReport: ValidationReport | null;
    }`

Capture data for the Response profile and a report for the validation profile with one clock.
Throws if on-submit data do not converge.

##### `captureSubmitSnapshot(meta?: Parameters<IFormEngine['getResponse']>[0]): {
        snapshot: {
            response: FormResponse;
            validationReport: ValidationReport | null;
        };
        pendingExplanationStamps: boolean;
    }`

Evaluate Submit once at the current clock and return either the assembled completed candidate
or an in-progress draft snapshot when selected candidate explanations still need server stamps.
Preserves unsigned-candidate guards and refreshes visible warning state on pending stamps.

##### `getDiagnosticsSnapshot(options?: ValidationReportOptions): FormEngineDiagnosticsSnapshot`

##### `applyReplayEvent(event: EngineReplayEvent): EngineReplayApplyResult`

##### `replay(events: EngineReplayEvent[], options?: {
        stopOnError?: boolean;
    }): EngineReplayResult`

##### `getDefinition(): FormDefinition`

##### `setLabelContext(context: string | null): void`

##### `getLabel(item: FormItem): string`

##### `getItemLabelSignal(path: string): ReadonlyEngineSignal<string> | undefined`

Reactive Locale-resolved, `{{}}`-interpolated label of the field, display, or group Item at `path`.

##### `getItemHintSignal(path: string): ReadonlyEngineSignal<string | null> | undefined`

The same for the Item's `hint`; `null` when neither Locale nor Definition has one.

##### `getItemDescriptionSignal(path: string): ReadonlyEngineSignal<string | null> | undefined`

The same for the Item's `description`; `null` when neither Locale nor Definition has one.

##### `loadLocale(doc: LocaleDocument): void`

##### `setLocale(code: string): void`

##### `getActiveLocale(): string`

##### `getAvailableLocales(): string[]`

##### `getLocaleDirection(): 'ltr' | 'rtl'`

##### `getFieldVM(path: string): FieldViewModel | undefined`

##### `resolveValidationMessage(result: ValidationResult): string`

The message a respondent reads for `result`: its field's Locale validation-message cascade when the
result's path is a field instance, else the processor's `message`. Summaries use it so they read what
the field itself shows.

##### `getFormVM(): FormViewModel`

##### `resolveLocaleString(key: string, fallback: string, itemPath?: string): string`

Resolve a Locale string key with fallback. `{{}}` interpolates in the binding scope
of `itemPath` (an instance path, e.g. `rows[1].note`); form scope when omitted.

##### `lookupLocaleString(key: string): string | null`

Raw Locale string for `key` (fallback cascade, §4), or `null` when no loaded document carries it.
No FEL interpolation — for chrome strings (Locale §3.1.10 `$ui.<ChromeStringKey>`), whose
`{{$param}}` placeholders are renderer-supplied literals, not form-scope FEL.

##### `dispose(): void`

##### `injectExternalValidation(results: Array<{
        path: string;
        severity: string;
        code: string;
        message: string;
        source?: string;
    }>): void`

##### `clearExternalValidation(path?: string): void`

##### `setRegistryEntries(entries: RegistryEntry[]): void`

##### `registerExtensionFunction(name: string, registration: import('./extension-functions.js').FelExtensionFunctionRegistration): void`

Register a FEL extension function (Core §3.12) and re-evaluate. Throws for a FEL built-in or
reserved word. Unregistered calls produce the Definition finding `UNDEFINED_FUNCTION`.

##### `migrateResponse(responseData: JsonRecord, fromVersion: string): JsonRecord`

#### interface `MappingDiagnostic`

- **ruleIndex**: `number`
- **sourcePath?**: `string`
- **targetPath?**: `string`
- **errorCode**: `'COERCE_FAILURE' | 'UNMAPPED_VALUE' | 'FEL_RUNTIME' | 'PATH_NOT_FOUND' | 'INVALID_DOCUMENT' | 'ADAPTER_FAILURE' | 'VERSION_MISMATCH' | 'INVALID_FEL' | 'WASM_NOT_READY'`
- **message**: `string`

#### interface `RuntimeMappingResult`

- **direction**: `MappingDirection`
- **output**: `JsonValue | string`
- **appliedRules**: `number`
- **diagnostics**: `MappingDiagnostic[]`

#### interface `IRuntimeMappingEngine`

##### `forward(source: JsonValue | string): RuntimeMappingResult`

##### `reverse(source: JsonValue | string): RuntimeMappingResult`

#### type `JsonPrimitive`

JSON-compatible scalar.

```ts
type JsonPrimitive = string | number | boolean | null;
```

#### type `JsonValue`

JSON-compatible value. Exact numbers use immutable raw JSON leaves; use jsonNumberText to read their digits.

```ts
type JsonValue = JsonPrimitive | JsonValue[] | {
    [key: string]: JsonValue;
};
```

#### type `FormFieldValue`

Field or instance slot value (undefined = unset).

```ts
type FormFieldValue = JsonValue | undefined;
```

#### type `JsonRecord`

String-keyed JSON object (response data, instance maps).

```ts
type JsonRecord = Record<string, JsonValue>;
```

#### type `FELConditionBuilderOperator`

Operators for structured FEL conditions (mirrors Studio `fel-condition-builder`).

#### type `FELConditionGroupLiftResult`

```ts
type FELConditionGroupLiftResult = FELConditionGroupLifted | FELConditionGroupUnlifted;
```

#### type `DocumentType`

#### type `DefinitionResolver`

```ts
type DefinitionResolver = (url: string, version?: string) => FormDefinition | Promise<FormDefinition>;
```

#### type `EngineNowInput`

```ts
type EngineNowInput = Date | string | number;
```

#### type `InstanceSourceResult`

```ts
type InstanceSourceResult = {
    status: 'loaded';
    value: JsonValue;
} | {
    status: 'unavailable';
    reason?: string;
};
```

#### type `InstanceSourceLoadOutcome`

Engine admission only; a loaded outcome does not establish provider authority.
`failed` means applying a source unexpectedly failed: the engine has disposed
itself and must be replaced. Its primary state may be partially seeded.

```ts
type InstanceSourceLoadOutcome = Readonly<{
    status: 'loaded' | 'unavailable' | 'aborted' | 'failed';
    reason?: string;
}>;
```

#### type `InstanceSourceResolver`

Host owns source qualification and a bounded deadline; disposal aborts the signal.

```ts
type InstanceSourceResolver = (request: Readonly<InstanceSourceRequest>, options: Readonly<{
    signal: AbortSignal;
}>) => InstanceSourceResult | Promise<InstanceSourceResult>;
```

#### type `ResponseSubjectKeys`

Filing-unit keys, including exact integers represented by raw JSON numbers.

```ts
type ResponseSubjectKeys = Readonly<Record<string, string | number | ExactJsonNumber>>;
```

#### type `EngineReplayEvent`

#### type `WriteSource`

Who wrote a field: the respondent (`'user'`, the default) or an Assist tool (`'assist'`).

```ts
type WriteSource = 'user' | 'assist';
```

#### type `MappingDirection`

```ts
type MappingDirection = 'forward' | 'reverse';
```

## `interpolateMessage(template: string, evaluator: (expr: string) => unknown): InterpolateResult`

Resolve `{{expression}}` sequences with a host evaluator.

Rust owns the rules (Locale §3.3.1): `{{{{` escapes, a failed expression stays literal with a
warning (a throw, error diagnostics on a {@link FelEvalResult}, or rule 3a's unexplained
`null`), results coerce to strings, and replacement text is not re-scanned. `evaluator` returns
a value or a `FelEvalResult` envelope. Requires the runtime WASM to be initialized.

## `interpolateFELTemplate(template: string, context: WasmFelContext, extensions?: FelExtensionHost): InterpolateResult`

Resolve `{{expression}}` sequences against a FEL context in one WASM call (Locale §3.3.1).

#### interface `InterpolationWarning`

- **expression**: `string`
- **error**: `string`

#### interface `InterpolateResult`

- **text**: `string`
- **warnings**: `InterpolationWarning[]`

#### interface `IssuerFetchOptions`

- **ifNoneMatch?**: `string`

#### interface `IssuerFetchedResult`

- **issuer**: `Issuer`
- **rawBytes**: `Uint8Array`
- **etag?**: `string`
- **cacheControl?**: `string`
- **notModified?**: `false`

#### interface `IssuerNotModifiedResult`

- **notModified**: `true`
- **etag?**: `string`
- **cacheControl?**: `string`

#### interface `IssuerFetcher`

##### `fetch(url: string, options?: IssuerFetchOptions): Promise<IssuerFetchResult>`

#### interface `FetchIssuerFetcherOptions`

- **fetch?**: `typeof globalThis.fetch`

#### type `IssuerFetchResult`

```ts
type IssuerFetchResult = IssuerFetchedResult | IssuerNotModifiedResult;
```

#### class `FetchIssuerFetcher`

##### `constructor(options?: FetchIssuerFetcherOptions)`

##### `fetch(url: string, options?: IssuerFetchOptions): Promise<IssuerFetchResult>`

## `MAX_CHAIN_DEPTH`

#### interface `IssuerResolveInput`

- **definitionIssuer?**: `IssuerSource`
- **hostOverride?**: `IssuerSource`

#### interface `IssuerStoreOptions`

- **now?**: `() => number`
- **defaultMaxAgeMs?**: `number`

#### class `IssuerStore`

##### `constructor(_fetcher: IssuerFetcher, options?: IssuerStoreOptions)`

##### `invalidate(url: string): void`

##### `resolve(input: IssuerResolveInput): Promise<ResolvedIssuer>`

## `resolveLangValue(value: StringOrLangMap | undefined, requested: string, defaultLanguage: string): string | undefined`

#### interface `ContactPoint`

- **contactType?**: `string`
- **email?**: `string`
- **telephone?**: `string`
- **url?**: `string`
- **availableLanguage?**: `string[]`

#### interface `Jurisdiction`

- **level**: `'federal' | 'state' | 'county' | 'municipal' | 'tribal' | 'international' | 'private' | 'individual'`
- **name**: `string`
- **code?**: `string`

#### interface `LogoVariant`

- **url**: `string`
- **altText?**: `StringOrLangMap`
- **aspectRatio?**: `string`
- **preferredBackground?**: `'light' | 'dark' | 'any'`

#### interface `Issuer`

- **$formspecIssuer**: `'1.0'`
- **url**: `string`
- **version**: `string`
- **name**: `StringOrLangMap`
- **kind**: `'organization' | 'department' | 'program' | 'individual'`
- **displayName?**: `StringOrLangMap`
- **shortName?**: `StringOrLangMap`
- **identifier?**: `string`
- **homepage?**: `string`
- **parentOrganization?**: `string`
- **organizationName?**: `StringOrLangMap`
- **departmentName?**: `StringOrLangMap`
- **jurisdiction?**: `Jurisdiction`
- **defaultLanguage?**: `string`
- **logo?**: `{
        primary?: LogoVariant;
        wordmark?: LogoVariant;
        monochrome?: LogoVariant;
    }`
- **contactPoint?**: `ContactPoint | ContactPoint[]`
- **extensions?**: `Record<string, unknown>`

#### interface `ResolvedIssuer`

- **primary** (`Issuer`): Primary Issuer after cascade resolution.
- **chain** (`Issuer[]`): Ordered as [primary, parent, grandparent, ...]; may be truncated at depth 8.

#### type `LangMap`

@filedesc Issuer / Party / LangMap / IssuerSource type declarations mirrored from the Issuer schema.

```ts
type LangMap = Record<string, string>;
```

#### type `StringOrLangMap`

```ts
type StringOrLangMap = string | LangMap;
```

#### type `IssuerResolutionSource`

```ts
type IssuerResolutionSource = 'host-embed' | 'host-query' | 'definition' | 'unbranded';
```

#### type `IssuerOverrideResolutionSource`

```ts
type IssuerOverrideResolutionSource = Extract<IssuerResolutionSource, 'host-embed' | 'host-query'>;
```

#### type `IssuerSource`

```ts
type IssuerSource = {
    kind: 'inline';
    issuer: Issuer;
    source?: IssuerOverrideResolutionSource;
} | {
    kind: 'url';
    url: string;
    source?: IssuerOverrideResolutionSource;
};
```

## `isRawJson(value: unknown): value is {
    readonly rawJSON: string;
}`

## `jsonNumberText(value: unknown): string | undefined`

Return a number's exact text; strings and ordinary lookalike objects are not numbers.

## `parseJsonNumber(text: string): number | ExactJsonNumber`

Parse numeric input without sending significant digits through a JavaScript number.

## `jsonValueText(value: unknown): string`

Text for DOM controls and labels, including exact numeric primitives.

## `isJsonRecord(value: unknown): value is JsonRecord`

## `cloneValue(value: T): T`

Preserve immutable raw primitives while detaching their surrounding containers.

## `deepEqual(left: unknown, right: unknown): boolean`

#### type `ExactJsonNumber`

Immutable JSON.rawJSON numeric leaf; JSON.stringify emits its digits without quotes.

```ts
type ExactJsonNumber = {
    readonly rawJSON: string;
};
```

## `normalizeBcp47(code: string): string`

Normalize BCP 47: lowercase language, title-case script (4 chars),
uppercase region (2 chars), lowercase variants/extensions.

#### interface `LocaleTargetIdentity`

- **kind**: `LocaleDocument['target']['kind']`
- **url**: `string`

#### interface `LookupResult`

Rich lookup result exposing which cascade level produced the value.

- **needAnchors** (`string[]`): Direct canonical Need anchors for the exact localized string selected.

#### class `LocaleStore`

Manages loaded locale documents, resolves string keys through the
regional -> fallback -> implicit cascade, and exposes reactive signals
for active locale and text direction.

##### `constructor(rx: EngineReactiveRuntime, directionMode?: 'ltr' | 'rtl' | 'auto', activeTarget?: LocaleTargetIdentity)`

##### `setDirectionMode(mode: 'ltr' | 'rtl' | 'auto'): void`

##### `loadLocale(doc: LocaleDocument): void`

##### `setTarget(target: LocaleTargetIdentity): void`

##### `getActiveTarget(): LocaleTargetIdentity | null`

##### `setLocale(code: string): void`

##### `getAvailableLocales(target?: LocaleTargetIdentity | null): string[]`

##### `lookupKey(key: string): string | null`

##### `lookupKeyWithMeta(key: string): LookupResult`

##### `lookupKeyForTarget(key: string, target: LocaleTargetIdentity, localeCode?: string): LookupResult`

##### `getActiveDocument(): LocaleDocument | null`

The Locale document actually resolved for the active locale tag — BCP 47 implicit
(region-stripping) resolution of the requested tag to a *loaded* document, not the
raw requested tag itself. Backs `Response.displayedLocale`: the document identity
(target kind, target url, normalized locale) whose strings the respondent saw.
Null when no target is set or no document answers the active tag or any of its
implicit ancestors.

##### `dateFormats(): Record<string, string> | null`

The active locale's `formats.date` (Locale §2.4): the first document on the same cascade
strings use — regional, explicit fallback, implicit language — that authored one. Null when none did.

##### `normalizeCode(code: string): string`

Normalize BCP 47: lowercase language, title-case script (4 chars),
uppercase region (2 chars), lowercase variants/extensions.

## `createMappingEngine(mappingDoc: MappingDocument): IRuntimeMappingEngine`

#### class `RuntimeMappingEngine`

##### `constructor(mappingDocument: MappingDocument)`

##### `forward(source: JsonValue | string): RuntimeMappingResult`

##### `reverse(source: JsonValue | string): RuntimeMappingResult`

## `clampJsonNumber(value: unknown, min?: unknown, max?: unknown): number | ExactJsonNumber`

Clamp an entered number without rounding it through binary floating point.

## `stepJsonNumber(value: unknown, step: unknown, direction: -1 | 1, min?: unknown, max?: unknown): number | ExactJsonNumber | undefined`

Step by one authored increment; return undefined when it would cross a bound.

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

## `RESPONSE_ACTIONS_PRECONDITION_BINDINGS: readonly PreconditionCatalogEntry[]`

Closed §4.1 catalog for FEL precondition expressions. Names + shapes mirror
specs/response-actions/response-actions-spec.md §4.1. Authors MUST NOT
extend this set; processors MUST reject unregistered `@name` bindings.

## `RESPONSE_ACTIONS_EFFECT_TIME_BINDINGS: readonly PreconditionCatalogEntry[]`

§6.4 effect-time catalog. Extends §4.1 with `@effects` and republishes
`@invocation` with `attempt` available. Authors MUST NOT extend; evaluators
MUST reject unregistered `@name` bindings in `payloadRef` / `detailRef`.

#### interface `PreconditionCatalogEntry`

Six fields every FEL §6.3.1 catalog entry must publish.

- **name** (`string`): Binding name (the part after `@`).
- **kind** (`'value' | 'object' | 'function'`): Binding kind per FEL §6.3.1 (`value`, `object`, `function`).
- **type** (`string`): Human-readable type description.
- **purity** (`'pure' | 'impure'`): Purity per FEL §6.3.1 — `pure` or `impure`.
- **evaluationTiming** (`'eager' | 'lazy'`): Evaluation timing — `eager` or `lazy`.
- **scope** (`'expression' | 'statement'`): Scope — typically `expression`.

#### interface `CatalogValidationResult`

Outcome of a catalog-validation check.

- **ok** (`boolean`): True when every `@name` referenced in the expression is in the catalog.
- **unbound** (`string[]`): Sorted unique list of unregistered `@name` references.

#### class `ResponseActionsPreconditionCatalog`

Catalog-aware FEL precondition validator. Host evaluators MUST honor this
catalog when evaluating preconditions; the engine's default precondition
path SHOULD consult this validator before delegating to FEL evaluation.

The catalog object is the contract surface. Until the fel-wasm bridge
exposes ContextBindingCatalog wiring, host-supplied
`ports.evaluatePrecondition` is the fallback for actual FEL evaluation,
but unregistered `@name` references MUST be rejected even before then.

##### `constructor(entries?: readonly PreconditionCatalogEntry[])`

- **entries** (`readonly PreconditionCatalogEntry[]`): Catalog entries, exposed for tooling/introspection.

##### `isBindingPublished(name: string): boolean`

Returns true when `name` (without `@`) is in the catalog.

##### `validateExpression(expression: string): CatalogValidationResult`

Extracts every `@name` reference in `expression` and asserts each is
published. Returns `{ ok: false, unbound: […] }` when one or more
names are not registered. The check is lexical, not semantic — a
fully FEL-aware evaluator built on fel-core's `ContextBindingCatalog`
remains the eventual authoritative implementation.

## `resolveItemHelpText(source: ItemHelpTextSource): ResolvedPresentationString<string | null>`

Hint or description a respondent sees for any Item (Core §4.2.1, Locale §3.1.2): Locale
`<key>.<property>@context` → Locale `<key>.<property>` → the inline property — the label cascade
minus its Definition-side context step, since neither property has a `labels`-like sibling.
`null` when no source has it.

## `resolveItemLabel(source: ItemLabelSource): ResolvedPresentationString<string>`

Label a respondent sees for any Item (Locale §3.1–3.3): Locale `<key>.label@context` → Locale
`<key>.label` → Definition `labels[context]` → inline `label`, `{{}}` resolved through `interpolate`.

## `resolveOptionLabel(localeStore: LocaleStore, itemKey: string, opt: {
    value: string;
    label: string;
}, interpolate: (template: string) => string, optionSetName?: string): {
    label: string;
    needAnchors?: string[];
}`

#### interface `ResolvedPresentationString`

- **template** (`T`): The winning string before `{{}}` interpolation — what the author wrote.

#### interface `ItemLabelSource`

Inputs to the Item label cascade; read inside a computed so every getter is a dependency.

- **interpolate** (`(template: string) => string`): Resolves `{{expression}}` in the Item's binding scope (Locale §3.3.1).

#### interface `ItemHelpTextSource`

Inputs to the Item hint / description cascade, read inside a computed like {@link ItemLabelSource}.

- **property** (`'hint' | 'description'`): Which help-text property to resolve.
- **inlineText** (`string | null | undefined`): The Definition's inline `hint` / `description`, when it has one.
- **interpolate** (`(template: string) => string`): Resolves `{{expression}}` in the Item's binding scope (Locale §3.3.1).

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

## `readRepeatAffordances(engine: Pick<IFormEngine, 'repeats' | 'relevantSignals'>, repeatPath: string, item: Pick<FormItem, 'minRepeat' | 'maxRepeat'> | null | undefined, locks?: RepeatAffordanceLocks): RepeatAffordanceState`

Read repeat chrome state for the repeatable group at `repeatPath`. It reads the engine's count and
relevance signals, so a caller inside a computed, effect, or subscription tracks both.
Bounds gate presentation only; the engine still reports MIN_REPEAT / MAX_REPEAT cardinality results.

#### interface `RepeatAffordanceState`

What a repeat renderer needs to show or hide its heading, Add, and Remove controls.

- **relevant** (`boolean`): False while the repeatable group is non-relevant (core Bind `relevant` hides the node and its descendants).
- **canAdd** (`boolean`): False once count reaches `maxRepeat` (core §4.2.2: implementations MUST prevent adding beyond it), or when Add is locked.
- **canRemove** (`boolean`): False while count is at or below `minRepeat` (component §4.4: remove affordances are subject to it), or when Remove is locked.

#### interface `RepeatAffordanceLocks`

Presentation-only Add/Remove locks (component §4.4): an Accordion's or DataTable's `allowAdd` / `allowRemove`
props, or a theme `widgetConfig` on a repeatable group rendered without a Component Document (theme §4.2).
Only `false` locks; cardinality validation and data-supplied instances are unaffected.

- **allowAdd?**: `boolean`
- **allowRemove?**: `boolean`

## `evaluateResponseActionEffectExpression(expression: string, context: {
    fields: Record<string, unknown>;
    bindings?: Record<string, unknown>;
    nowIso?: string;
}): unknown`

Native FEL evaluation of fields and effect-time object bindings. Requires
initFormspecEngineTools(). Callable bindings (including

## `isAppActionValidationTuple(value: unknown): value is ValidationOverride`

## `classifyResponseActionEffect(effect: EffectRequest): ResponseActionEffectClass`

Pure owner classification used by executors and admission gates.

Unknown effect types are treated as durable. That fail-closed default means
a schema-bypassing caller cannot obtain side effects merely by inventing a
new transient-looking type.

## `isDurableResponseActionEffect(effect: EffectRequest): boolean`

## `planResponseActionEffects(action: ResponseAction): readonly PlannedResponseActionEffect[]`

Pure, ordered effect plan. It never evaluates, dispatches, or authorizes.

## `missingSubmitActionFinding(): ActionRefFinding`

Host finding when `onSubmit` is wired but no submit-intent Action is published.

## `resolveResponseAction(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, nodeId?: string): ActionResolution`

## `planResponseActionInvocation(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, nodeId?: string): ResponseActionInvocationPlan`

Resolve an Action and expose its complete effect plan without executing it.
Admission layers use this before activation so all possible durable effects
can be authorized as one fail-closed decision.

## `findResponseActionByIntent(document: ResponseActionsDocumentInput | null | undefined, intent: string): ResponseAction | null`

## `isValidResponseActionIntent(intent: unknown): intent is ResponseAction['intent']`

Whether `intent` conforms to `schemas/response-actions.schema.json` `#/$defs/ActionIntent`:
either a closed standard Validation Mapping intent or an `x-` publisher extension that
does not shadow a standard intent.

## `isValidDefinitionResponseActionsDocument(document: unknown, definition: {
    url?: unknown;
    version?: unknown;
}): document is ResponseActionsDocument`

Fail-closed schema-faithful validator for a Definition-scoped Response Actions
document (`schemas/response-actions.schema.json`). Shared by renderer
auto-placement, Surface slot-supply planning, and automatic `autosave`
selection so every consumer agrees on whether a document is valid.

## `isBackgroundResponseAction(action: {
    intent?: unknown;
} | null | undefined): boolean`

Whether a Response Action represents background/system-initiated behavior
(`intent === 'autosave'` per Validation Mapping §2) rather than a manual
respondent control. Renderers MUST NOT synthesize interactive ActionButtons
for background actions even when they carry a label.

## `autoPlacedDefinitionActions(document: ResponseActionsDocumentInput | null | undefined, definition: {
    url?: unknown;
    version?: unknown;
}): readonly ResponseAction[]`

Select manual response-scoped Actions that a Definition auto-renderer can
place without inventing a control label. The document itself must be a
matching, response-scoped document with unique, structurally usable actions;
one bad action closes the whole auto-placement seam. Background intents
(`autosave`) are excluded from synthesized manual buttons.

## `resolveAutosaveResponseAction(document: ResponseActionsDocumentInput | null | undefined, definition?: {
    url?: unknown;
    version?: unknown;
} | null): AutosaveActionResolution`

Resolve the single unambiguous draft-checkpoint `autosave` Action for a
Definition from a complete, schema-valid response-scoped Response Actions
document. Because `actions[]` order is documentation-only, multiple eligible
`autosave` Actions fail closed and return an `ambiguous-autosave-action`
finding independent of array order.

## `findAutosaveResponseAction(document: ResponseActionsDocumentInput | null | undefined, definition?: {
    url?: unknown;
    version?: unknown;
} | null): ResponseAction | null`

Resolve the valid draft-checkpoint `autosave` Action for a Definition, if
exactly one is published unambiguously in a valid matching response-scoped document.

## `createResponseActionAutosaveController(options: ResponseActionAutosaveOptions): ResponseActionAutosaveController`

Create a per-engine `autosave` controller that preserves unsaved dirty edits
across `responseActionsDocument` replacements (equivalent re-parsed objects,
ambiguity corrections `2 -> 1`, and ambiguity cancellations `1 -> 2`).

## `subscribeResponseActionAutosave(options: ResponseActionAutosaveOptions): () => void`

Subscribe to `FormEngine` draft changes after mount and invoke the declared
`autosave` Response Action with debounce (`400ms` default) and single-flight
coalescing. Returns a cleanup function that cancels pending timers and
detaches the reactive subscription.

## `resolveResponseActionValidationTuple(action: ResponseAction): ValidationOverride`

## `validationProfileForAction(action: ResponseAction): ValidationProfile`

## `declaresHostEvent(action: ResponseAction, eventName: string): boolean`

## `invokeResponseAction(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, ports: ResponseActionInvocationPorts<TDetail>, nodeId?: string, invocationContext?: ResponseActionInvocationContext): ResponseActionInvocationResult<TDetail>`

Invoke an Action with synchronous effect adapters. Promise outcomes fail fast.

## `invokeResponseActionAsync(document: ResponseActionsDocumentInput | null | undefined, actionRef: string, ports: ResponseActionAsyncInvocationPorts<TDetail>, nodeId?: string, invocationContext?: ResponseActionInvocationContext): Promise<ResponseActionInvocationResult<TDetail>>`

Invoke an Action while awaiting effect adapters in strict declaration order.

## `APP_ACTION_VALIDATION_TUPLE: Readonly<ValidationOverride>`

The only validation tuple an app-scoped Action may declare.

App actions have no Response to validate or persist. Keeping this predicate
next to the executor prevents build-time gates from restating a runtime
invariant with subtly different defaults.

#### interface `ActionRefFinding`

- **code**: `'COMP-REFERENTIAL-INTEGRITY'`
- **severity**: `'error'`
- **kind**: `'actionRef'`
- **nodeId?**: `string`
- **target**: `string`
- **reason?**: `'missing-actionRef' | 'no-response-actions-document' | 'missing-submit-action' | 'ambiguous-actionRef' | 'ambiguous-autosave-action'`

#### interface `AutosaveActionResolution`

- **action**: `ResponseAction | null`
- **ambiguousActionIds?**: `readonly string[]`
- **finding?**: `ActionRefFinding`

#### interface `ActionResolution`

- **resolved**: `boolean`
- **action**: `ResponseAction | null`
- **finding?**: `ActionRefFinding`

#### interface `ResponseActionSubmitOptions`

- **profile**: `ValidationProfile`
- **validationTuple**: `ValidationOverride`
- **emitEvent?**: `boolean`

#### interface `ResponseActionEffectOutcome`

- **type**: `EffectRequest['type']`
- **status**: `ResponseActionEffectStatus`
- **idempotencyKey?**: `string`
- **outcomeRef?**: `string`
- **reason?**: `string`
- **replayToken?**: `string`

#### interface `ResponseActionEffectDispatchResult`

Host adapter result for one effect. Only allowlisted transition strings may
cross into a completed invocation result; adapter-private data is ignored.

- **outcome**: `ResponseActionEffectOutcome`
- **transitionBindings?**: `Readonly<Record<string, string>>`

#### interface `ResponseActionIdempotencyKeyContext`

- **effectIndex**: `number`

#### interface `ResponseActionEffectDispatchContext`

- **effectIndex**: `number`
- **attempt**: `number`
- **idempotencyKey?**: `string`

#### interface `ResponseActionEffectExpressionContext`

Effect-time inputs: only completed prior effects enter this snapshot.

- **effectIndex**: `number`
- **invocation**: `Readonly<{
        id: string;
        attempt: number;
    }>`
- **effects**: `readonly ResponseActionEffectOutcome[]`

#### interface `PlannedResponseActionEffect`

- **effectIndex** (`number`): Zero-based declaration order.
- **effect** (`EffectRequest`): Exact authored effect. No copy or interpretation replaces owner data.

#### interface `ResponseActionLifecyclePayload`

Payload bound to the four action.* lifecycle kinds. Schema-pinned shape:
respondent-ledger-event.schema.json#/$defs/ActionEventPayload owns the
authoritative byte form for Ledger storage; this TS shape mirrors the
fields the engine can deterministically supply from invocation state.
Hosts that persist to the Ledger MUST round-trip the payload through the
canonical schema before commit.

- **actionId** (`string`): Action.id from the Response Actions document.
- **invocationId** (`string`): Stable invocation identifier.
- **attempt** (`number`): 1 on first attempt; 2 on retry-once.
- **terminal** (`'failed' | 'deferred' | 'replayed'`): Present on action.failed and action.deferred.
- **effectIndex** (`number`): Present on action.failed and action.deferred when an effect is the proximate cause.
- **replayTokenRef** (`string`): Present on action.deferred.
- **priorInvocationRef** (`string`): Present on action.replayed.
- **causeRef** (`string`): Optional structured failure/deferral cause reference.

#### interface `ResponseActionInvocationContext`

Optional invocation-scope context the host supplies once per
invokeResponseAction call. The engine uses `invocationId` and
`priorInvocationRef` (when present) to fill the lifecycle payload —
`priorInvocationRef` signals an action.replayed continuation.

- **invocationId** (`string`): Stable invocation identifier; host-generated. Defaults to a synthesized id.
- **priorInvocationRef** (`string`): When set, marks the invocation as a replay of a prior invocation.
- **actionArtifact** (`{
        artifactRef: string;
        artifactDigest: string;
    }`): Exact loaded Response Actions artifact identity. The engine adds the
resolved Action id; renderers and runners must not infer this identity
from projection metadata or visible copy.

#### interface `ResponseActionInvocationPorts`

- **submit** (`((options: ResponseActionSubmitOptions) => TDetail | null) | undefined`): Definition-scoped response submission. Required at runtime when the
document scope is `response` (or omitted); never called for `app`.
- **prepareAppAction** (`((action: ResponseAction) => TDetail | null) | undefined`): Application action input. Required at runtime for `scope: app`; this
replaces form submission and gives effect adapters validated structured
input without manufacturing a Response.
- **evaluateEffectExpression** (`(expression: string, detail: TDetail, action: ResponseAction, context: ResponseActionEffectExpressionContext) => unknown`): Evaluate authored transient FEL using the immutable invocation detail.
The host must enforce the §6.4 binding catalog and throw on errors or
unsupported expressions. evaluateResponseActionEffectExpression provides
a native adapter for fields and object bindings.
- **recordActionLifecycle** (`(kind: ResponseActionLifecycleKind, payload: ResponseActionLifecyclePayload) => void`): Optional recorder for the four §11.3 / Ledger §8.5 action.* lifecycle
kinds. Called at the invocation begin/terminal boundaries — never as a
declared effect. Reference runtime emits in this order:
  - action.invoked|action.replayed at invocation start (the latter when
    `priorInvocationRef` is supplied via the invocation context)
  - action.failed when terminal is `failed`
  - action.deferred when terminal is `deferred`
  - action.replayed (begin only — completion of a replayed happy path
    emits no further action.* kind; response.completed covers that)

#### interface `ResponseActionOwnerFacts`

- **artifactRef**: `string`
- **artifactDigest**: `string`
- **subjectKind**: `'response-action'`
- **subjectRef**: `string`

#### interface `ResponseActionInvocationResult`

- **invocationId** (`string`): Present once an Action resolves and invocation begins.
- **actionOwner** (`ResponseActionOwnerFacts`): Caller-paired artifact identity plus the engine-resolved Action id.
- **transitionBindings** (`Readonly<Record<string, string>>`): Present only on completed invocations with declared transition outputs.

#### interface `ResponseActionInvocationPlan`

- **resolution**: `ActionResolution`
- **effects**: `readonly PlannedResponseActionEffect[]`

#### interface `ResponseActionAutosaveInvokeContext`

- **document**: `ResponseActionsDocumentInput | null | undefined`
- **isCurrent**: `() => boolean`

#### interface `ResponseActionAutosaveDocumentChange`

- **previousAction**: `ResponseAction | null`
- **nextAction**: `ResponseAction | null`
- **equivalentAction**: `boolean`

#### interface `ResponseActionAutosaveOptions`

- **engine**: `Pick<IFormEngine, 'getDraftSnapshot' | 'getEvaluatedFormState'> & Partial<Pick<IFormEngine, 'getDefinition'>>`
- **document**: `ResponseActionsDocumentInput | null | undefined`
- **debounceMs?**: `number | undefined`
- **onFinding?**: `((finding: ActionRefFinding) => void) | undefined`
- **onDocumentChange?**: `((change: ResponseActionAutosaveDocumentChange) => void) | undefined`
- **onEdit?**: `(() => void) | undefined`
- **invoke**: `(action: ResponseAction, context: ResponseActionAutosaveInvokeContext) => unknown | Promise<unknown>`

#### interface `ResponseActionAutosaveController`

##### `setDocument(document: ResponseActionsDocumentInput | null | undefined): void`

##### `dispose(): void`

#### type `StandardResponseActionIntent`

```ts
type StandardResponseActionIntent = 'save-draft' | 'autosave' | 'review' | 'submit' | 'request-evidence';
```

#### type `ResponseActionsDocumentInput`

The document accepted by the engine.

The generated schema type is authoritative at this package boundary. Keep
smaller, read-only views in the caller that needs them rather than widening
this type and making schema-invalid documents appear supported.

```ts
type ResponseActionsDocumentInput = ResponseActionsDocument;
```

#### type `ResponseActionPreconditionResult`

```ts
type ResponseActionPreconditionResult = boolean | {
    passed: boolean;
    reason?: string;
};
```

#### type `ResponseActionEffectStatus`

Schema-owned closed vocabulary for one declared effect's outcome.

```ts
type ResponseActionEffectStatus = EffectOutcomeStatus;
```

#### type `ResponseActionEffectDispatchValue`

```ts
type ResponseActionEffectDispatchValue = ResponseActionEffectOutcome | ResponseActionEffectDispatchResult | void;
```

#### type `ResponseActionEffectClass`

```ts
type ResponseActionEffectClass = 'transient' | 'browser-local' | 'durable';
```

#### type `ResponseActionLifecycleKind`

§11.3 / Ledger §8.5 published lifecycle event kinds. Authors MUST NOT
declare these as ledgerAppend effects; processors emit them outside the
declared effect chain.

```ts
type ResponseActionLifecycleKind = 'action.invoked' | 'action.failed' | 'action.deferred' | 'action.replayed';
```

#### type `ResponseActionAsyncInvocationPorts`

Async counterpart whose effect adapter may return a Promise.

#### type `ResponseActionInvocationStatus`

Schema-owned complete invocation-status vocabulary.

```ts
type ResponseActionInvocationStatus = ActionInvocationStatus;
```

#### class `InvalidValidationTupleError`

Structured error thrown when an explicit `action.validation` override
fails the VM §6.3 closed-tuple predicate. The `code` mirrors the Rust
lint pass identifier (formspec-lint VMAP-INVALID-OVERRIDE) so runtime
findings line up with static-analysis output.

##### `constructor(actionId: string, override: Record<string, unknown>, message: string)`

## `screenerOptionLocaleKey(itemKey: string, value: string): string`

Escape a static option value using canonical Locale key addressing.

## `createScreenerLocaleResolver(input: ScreenerLocaleInput): ScreenerLocaleAdmission`

Admit exact-target Locale resources and reuse the existing same-target cascade.

#### interface `ScreenerLocaleInput`

- **chromeKeys** (`readonly string[]`): Schema-aligned renderer chrome suffixes from the caller's maintained inventory.

#### interface `ScreenerLocaleText`

##### `lookup(key: string): string | null`

##### `text(key: string, fallback: string, answers: Record<string, unknown>, itemKey?: string, bindScope?: boolean): WasmInterpolated`

#### type `ScreenerLocaleAdmission`

```ts
type ScreenerLocaleAdmission = {
    status: 'ready';
    resolver: ScreenerLocaleText;
} | {
    status: 'refused';
    reason: string;
};
```

## `isPlainJsonObject(value: unknown): value is Record<string, unknown>`

## `isPlainJsonArray(value: unknown): value is unknown[]`

## `isValidPlainJsonValue(value: unknown, seen?: Set<object>): boolean`

## `resolveRuntimeValueSelector(selector: RuntimeValueSelector, sources: ServiceRequestSources): JsonValue`

Resolve one closed runtime selector without evaluating code or inherited properties.

## `resolveServiceRequest(catalog: RuntimeRequestCatalog | null | undefined, requestRef: string): RuntimeRequest`

Resolve one request id exactly once; duplicate ids fail closed.

## `planServiceRequest(request: RuntimeRequest, sources: ServiceRequestSources): PlannedServiceRequest`

Assemble a transport-neutral request. This function performs no network I/O.

## `extractServiceRequestOutputs(request: RuntimeRequest, responseBody: unknown): ExtractedServiceRequestOutputs`

Extract only declared outputs; raw response data is never returned.

#### interface `ServiceRequestSources`

- **result** (`unknown`): Allowlisted internal outputs from prior effects in this invocation.

#### interface `PlannedServiceRequest`

- **path** (`string`): Same-origin absolute path, including an assembled query when declared.
- **headers** (`Readonly<Record<string, string>>`): Authored, non-authority headers only. Host headers remain separate.
- **successStatuses** (`readonly number[]`): Exact successful statuses, or undefined to admit any 2xx status.

#### interface `ExtractedServiceRequestOutputs`

- **internal** (`Readonly<Record<string, JsonValue>>`): Invocation-private outputs available to later `from: result` selectors.
- **transitionBindings** (`Readonly<Record<string, string>>`): Public route-transition bindings.
- **sessionBindings** (`Readonly<Record<string, string>>`): Host-private values to persist in the session store.

#### class `ServiceRequestRuntimeError`

##### `constructor(message: string)`

## `resolveAuthoredSigningContent(input: ResolveAuthoredSigningContentInput): SigningContent`

Resolve only an exact entry in the already loaded, Response-pinned Definition. No fetch or fallback.

## `signingContentBytes(content: SigningContent, validateContent: SigningContentValidator): Uint8Array`

UTF-8 RFC 8785 JCS of the entire schema-valid SigningContent; exact authored strings survive.

## `hashSigningContent(content: SigningContent, validateContent: SigningContentValidator): Promise<string>`

Content documentHash only. This does not sign a Response or verify a signature.

#### interface `ResolveAuthoredSigningContentInput`

- **definition** (`FormDefinition`): Already admitted immutable Definition; the host verifies its publication hash.

#### type `SigningContentValidator`

The host supplies its maintained common.schema.json SigningContent validator.

```ts
type SigningContentValidator = (value: unknown) => boolean;
```

## `createDefinitionLocaleLookup(definition: FormDefinition, documents: readonly LocaleDocument[]): {
    locales: string[];
    lookup: (locale: string, key: string) => string | null;
}`

Look up authored strings without evaluating answers, using the runtime Locale cascade.

## `createStaticResponseMetadataReader(input: StaticResponseMetadataInput): {
    label(path: string): string;
    options(path: string): readonly {
        value: string;
        label: string;
    }[];
}`

Produce a reader for Surface captureResponseFieldMetadata's static subset.
No original custody proof is created. Context alternatives, regional/fallback
Locales, unresolved fragments and dynamic/remote options require captured
original metadata instead. Snapshots isolate reads from later caller edits.

#### interface `StaticResponseMetadataInput`

- **definition** (`FormDefinition`): Original parsed artifacts; the host must qualify their bytes, hashes and historical association.
- **locale** (`LocaleDocument | null`): Exact recorded base-language Locale; null only when the Response has no displayedLocale.

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

#### type `ValidationTrigger`

Engine-internal validation trigger vocabulary.

```ts
type ValidationTrigger = 'continuous' | 'submit' | 'demand' | 'disabled';
```

#### type `ValidationReportOptions`

```ts
type ValidationReportOptions = {
    profile?: ValidationProfile;
};
```

#### type `EnabledValidationProfile`

```ts
type EnabledValidationProfile = Exclude<ValidationProfile, 'off'>;
```

#### class `DefaultValidationProfileResolver`

Bridges the closed Validation Mapping profile enum to the engine's internal trigger vocabulary.

##### `resolve(profile: ValidationProfile): ValidationTrigger`

## `isWasmReady(): boolean`

Whether the WASM module has been initialized and is ready for use.

## `initWasm(options?: InitWasmOptions): Promise<void>`

Initialize the WASM module. Safe to call multiple times — subsequent calls
return the same promise. Resolves when WASM is ready; rejects on failure.

With `wasmBytes`, instantiates from those bytes.
In Node.js, otherwise uses `initSync()` with bytes read from disk.
In browsers, otherwise the generated wasm-bindgen loader fetches the sibling `.wasm` asset via URL.

## `getWasmModule(): WasmModule`

Initialized runtime module — for `wasm-bridge-tools` only (ABI check).
Not re-exported from the public `wasm-bridge` barrel.

## `wasmEvalFel(expression: string, fields?: Record<string, any>): any`

Evaluate a FEL expression with optional field values. Returns the evaluated value.

## `wasmEvalFelWithContextEnvelope(expression: string, context: WasmFelContext, extensions?: FelExtensionHost): FelEvalResult`

Evaluate a FEL expression with full FormspecEnvironment context (value + diagnostics flag).

## `wasmCheckFelExtensionName(name: string): void`

Throws when `name` may not be an extension function: a FEL built-in or reserved word (Core §3.12).

## `wasmEvalFelWithTrace(expression: string, fields?: Record<string, unknown>): FelTraceResult`

Evaluate a FEL expression with a structured trace of evaluation steps.

Opt-in tracing path — use when surfacing evaluation to humans or LLMs
(MCP tools, error explainers). Values in the trace are projected to JSON,
losing FEL type fidelity (money/date) but gaining universal readability.

## `wasmEvalFelWithContextTrace(expression: string, context: WasmFelContext, extensions?: FelExtensionHost): FelTraceResult`

Evaluate a FEL expression against full FormspecEnvironment context and trace each step.

## `wasmInterpolateFelTemplate(template: string, context: WasmFelContext, extensions?: FelExtensionHost): WasmInterpolated`

Locale §3.3.1: resolve every `{{expression}}` in `template` against a FEL context, in one call.

## `wasmInterpolateTemplate(template: string, evaluate: (expression: string) => string): WasmInterpolated`

Locale §3.3.1 with a host evaluator: Rust scans the template and applies the escape, failure,
and coercion rules; `evaluate(expression)` returns JSON `{ value, hasErrorDiagnostics? }` or throws.

## `wasmCreateFelContext(schema: {
    itemPaths?: string[];
    dataTypes: Record<string, string>;
    excludedValueNull: string[];
}): WasmFelContextHandle`

Creates a resident FEL context from a Definition's leaf typing and `excludedValue: "null"` binds.

## `wasmResolveOptionSetsOnDefinition(definitionJson: string): string`

Inline `optionSet` references from `optionSets` on a definition JSON document.

## `wasmApplyMigrationsToResponseData(definitionJson: string, responseDataJson: string, fromVersion: string, nowIso: string): string`

Apply `migrations` on a definition to flat response data (FEL transforms in Rust).

## `wasmCoerceFieldValue(itemJson: string, bindJson: string, definitionJson: string, valueJson: string): string`

Coerce an inbound field value (whitespace, numeric strings, money, precision).

## `wasmGetFelDependencies(expression: string): FELDependencies`

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

## `wasmAssembleCandidate(definition: FormDefinition, response: FormResponse, resolution: Readonly<Record<string, ResponseSelectionDelivery>>, evaluation?: {
    candidateExplanations?: import('./engine/warning-explanations.js').DraftExplanation[];
} | null): FormResponse`

Assemble the Response instance and explanation evidence before the candidate is signed.

## `wasmResponseSubjectId(subjectType: string, keys: import('./interfaces.js').ResponseSubjectKeys): string`

Derive Core's filing-unit id (`Response.subject.id`) from a subject type and exact typed keys.
Throws for untyped keys or an integer outside the I-JSON range.

## `wasmCreateResponse(definition: unknown, data: Record<string, unknown>, context?: WasmCreateOptions, extensions?: FelExtensionHost): WasmCreation`

Apply creation-time values to a new Response or resolve its pending values.

## `wasmCreateRepeatRow(definition: unknown, data: Record<string, unknown>, groupPath: string, context?: WasmCreateOptions, extensions?: FelExtensionHost): WasmCreation | null`

Create a new row at the end of the given repeat.

## `wasmEvaluateDefinition(definition: unknown, data: Record<string, unknown>, context?: WasmEvaluationContext, extensions?: FelExtensionHost): WasmEvaluation`

Evaluate a Formspec definition against provided data.

## `wasmEvaluateFiled(definition: unknown, data: Record<string, unknown>, context?: WasmEvaluationContext, extensions?: FelExtensionHost): WasmEvaluation`

Prepare stable Response data and its submit verdict. Throws if the data do not converge.

## `wasmEvaluateScreenerDocument(screener: unknown, answers: Record<string, unknown>, context?: Record<string, unknown>, extensions?: FelExtensionHost): import('@formspec-org/types').DeterminationRecord`

Evaluate a standalone Screener Document against respondent inputs.
Returns a Determination Record (always non-null).

`extensions` resolves host extension functions (Core §3.12) in route `condition` / `score` and
phase `activeWhen`; without them such a call is a definition error and the route is eliminated.

## `wasmAnalyzeFel(expression: string): WasmFelAnalysisResultJson`

Analyze a FEL expression and return structural info.

## `wasmAnalyzeFelWithFieldTypes(expression: string, fieldTypes: Record<string, string>): WasmFelAnalysisResultJson`

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

#### interface `InitWasmOptions`

How the host supplies the WASM module.

- **wasmBytes** (`BufferSource`): The runtime `.wasm` bytes, for a host that cannot fetch the sibling asset (a self-contained page,
a sandbox with no network). Used in place of the Node file read and the browser fetch.

#### interface `FelEvalResult`

In-band result from `evalFEL` / `evalFELWithContext` (Locale §3.3.1 rule 2).

- **value**: `unknown`
- **hasErrorDiagnostics**: `boolean`

#### interface `WasmFelContext`

FEL evaluation context for the richer WASM evaluator.

- **locale** (`string`): Active locale code (BCP 47) — backs `locale()` and default for `pluralCategory()`.
- **dateFormats** (`Record<string, string>`): The active Locale document's `formats.date` patterns by `formatDate` style (Locale §2.4).
- **meta** (`Record<string, string | number | boolean>`): Runtime metadata bag — backs `runtimeMeta(key)`.

#### interface `FelTraceResult`

Result of a traced FEL evaluation.

- **value** (`unknown`): Evaluated value (JSON-projected — no FEL type tags).
- **hasErrorDiagnostics** (`boolean`): True when error-severity diagnostics were recorded (Locale §3.3.1 rule 2).
- **diagnostics** (`Array<Record<string, unknown>>`): Diagnostics emitted during evaluation.
- **trace** (`FelTraceStep[]`): Ordered trace steps, appended in evaluation order.

#### interface `WasmInterpolated`

Interpolation result from Rust: resolved text plus one warning per expression left literal.

- **text**: `string`
- **warnings**: `Array<{
        expression: string;
        message: string;
    }>`

#### interface `FELDependencies`

Static FEL reads from Rust, with paths relative to each named instance.

- **instanceReads** (`Record<string, string[]>`): Known instance names and their sorted paths, with an empty path for a whole-instance read.
- **selfReads** (`string[]`): Paths relative to the current field, with an empty path for the field itself.

#### interface `WasmCreateOptions`

Sources and Response context available during creation.

- **nowIso?**: `string`
- **instances?**: `Record<string, unknown>`
- **pendingInstances?**: `string[]`
- **pendingPaths?**: `string[]`
- **subjectType?**: `string | null`
- **subjectKeys?**: `import('./interfaces.js').ResponseSubjectKeys`

#### interface `WasmCreation`

- **refused**: `boolean`
- **data**: `import('./interfaces.js').JsonRecord`
- **pending**: `string[]`
- **diagnostics**: `Array<import('./diff.js').EvalDiagnostic & {
        code: string;
    }>`

#### type `WasmFelAnalysisResultJson`

Parsed JSON from `fel_analysis_to_json_value` (Rust) — pass through to {@link normalizeFelAnalysisError}.

#### type `WasmModule`

```ts
type WasmModule = typeof import('../wasm-pkg-runtime/formspec_wasm_runtime.js');
```

#### type `FelExtensionHost`

Host extension functions (Core §3.12) handed to evaluating exports; Rust calls `arity` and `invoke`.

```ts
type FelExtensionHost = import('../wasm-pkg-runtime/formspec_wasm_runtime.js').FelExtensionHost;
```

#### type `FelTraceStep`

A single recorded event during FEL evaluation.

Mirrors `fel_core::TraceStep` verbatim — the `kind` discriminant is the
PascalCase Rust variant name. Extend this union only when the Rust enum
grows a new variant; every variant here must exist in Rust.

#### type `WasmFelContextHandle`

One form's FEL state, resident in WASM across ad-hoc reads.

`load` replaces the form-scope snapshot; each read names only its expression and Item path, so its cost is
the scope it resolves against, not the size of the form. Call `free()` when the owning engine is disposed.

```ts
type WasmFelContextHandle = import('../wasm-pkg-runtime/formspec_wasm_runtime.js').FelContext;
```

#### type `WasmEvaluationContext`

#### type `WasmEvaluation`

## `resolveWasmAssetPathForNode(relativeToThisModule: string): Promise<string>`

Resolve a sibling `.wasm` path for Node `readFileSync`.
Vitest/vite-node can rewrite `import.meta.url` to a non-`file:` URL; fall back to the `@formspec-org/engine` package root.

## `nodeFsModuleName`

@filedesc Node helpers to resolve sibling `.wasm` bytes when `import.meta.url` is not `file:` (e.g. Vitest).

## `nodeUrlModuleName`

## `nodePathModuleName`

## `nodeModuleModuleName`

## `getDefinitionInstanceReads(definition: unknown): Record<string, string[]>`

Return each instance's sorted paths across FEL and creation-time declarations.

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

## `parseVerifiedJsonObject(text: string): {
    value: Record<string, unknown>;
    token: object;
}`

Parse exact JSON once and return an unforgeable token proving the text is
one complete JSON object so `selectResponses` can embed it without re-parsing.

## `attachVerifiedJsonToken(record: ResponseSelectionRecord, token: object): ResponseSelectionRecord`

Associate a previously verified JSON object token with a shallow copy of a selection record.

## `isValidResponseAuthored(authored: string): boolean`

Check whether authored specifies a valid Response ordering instant.

## `wasmParseFel(expression: string): boolean`

Parse a FEL expression and return whether it's valid.

## `wasmTokenizeFel(expression: string): Array<{
    tokenType: string;
    text: string;
    start: number;
    end: number;
}>`

Tokenize a FEL expression and return positioned token records.

## `wasmExtractDependencies(expression: string): FELDependencies`

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

## `analyzeExpressionInDefinition(definition: unknown, expression: string, registryDocuments: readonly unknown[], target?: string, mapping?: boolean): {
    errors: import("./interfaces.js").FELAnalysisError[];
    valid: boolean;
    warnings: string[];
    references: string[];
    variables: string[];
    functions: string[];
    findings: Array<{
        name: string;
        code: string;
        severity: "error" | "warning";
        message: string;
        variableHint: boolean;
    }>;
}`

Analyze an expression with the same Definition declarations used by document lint.

## `checkInstanceProjection(source: unknown, projectionConsumer: ProjectionConsumer | null, upstreamDefinitions: readonly unknown[]): InstanceProjectionDiagnostic[]`

Check an instance or catalog source against every eligible upstream Definition.

## `wasmLintDocument(doc: unknown, options?: WasmLintDocumentOptions): {
    documentType: string | null;
    valid: boolean;
    diagnostics: any[];
    appGraphReport?: {
        ok: boolean;
        diagnostics: any[];
    };
    instanceProjectionDiagnostics?: InstanceProjectionDiagnostic[];
}`

Lint a Formspec document, or check a response projection when given upstream Definitions.

## `wasmLintDocumentWithRegistries(doc: unknown, registries: unknown[]): {
    documentType: string | null;
    valid: boolean;
    diagnostics: any[];
}`

@deprecated Use `wasmLintDocument(doc, { registryDocuments })`.

## `wasmCollectFelRewriteTargets(expression: string): {
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

## `wasmRewriteFelReferences(expression: string, rewrites: {
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

## `wasmPrintFel(expression: string): string`

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

## `wasmParseRegistry(registry: unknown): {
    publisher: {
        name?: string | Record<string, string>;
        identifier?: string | null;
        homepage?: string | null;
        url?: string | null;
        contactPoint?: Array<{
            contactType?: string | null;
            email?: string | null;
            telephone?: string | null;
            url?: string | null;
            availableLanguage?: string[];
        }>;
        contact?: string | null;
    };
    published?: string;
    entryCount: number;
    validationIssues: any[];
    warnings: Array<{
        kind: 'deprecatedField';
        field: string;
        replacement: string;
    }>;
}`

Parse and validate a registry document, returning summary metadata.

## `wasmFindRegistryEntry(registry: unknown, name: string, versionConstraint?: string): any | null`

Find the highest-version registry entry matching a name and version constraint.

## `wasmDeriveJsonLdContext(definition: unknown, ontology: unknown): {
    context: Record<string, unknown>;
    diagnostics: JsonLdContextDiagnostic[];
}`

Derive the JSON-LD `@context` for a definition from an ontology document's concept bindings (Ontology §6.2).

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

## `selectResponses: SelectResponses`

Execute an authorized preview Response selection after initializing tools WASM.
Set `context.upstreamSubject` to null when the upstream Definition has no subject.

#### interface `WasmLintDocumentOptions`

- **mappingSourceContext** (`{
        /** JSON Schema for the host metadata and the Definition data root. */
        schema: unknown;
        /** Dotted path to the Definition data object within the host input. */
        dataPath: string;
    }`): Host input for a Definition-associated Mapping. Requires the paired Definition.
- **screenerDocument** (`unknown`): Exact paired freestanding Screener for Locale 2.1 item and target checks.
- **upstreamDefinitions** (`readonly unknown[]`): For an AppGraph projection check, pass all loaded Definitions for the selected URL.
- **projectionConsumer** (`ProjectionConsumer | null`): The consuming form and how it receives data, or null for a widget.

#### interface `InstanceProjectionDiagnostic`

- **code**: `string`
- **jsonPointer**: `string`
- **upstreamVersion**: `string | null`
- **message**: `string`

#### interface `JsonLdContextDiagnostic`

One thing the JSON-LD context derivation could not honor (Ontology spec §6.2).

- **path** (`string`): Dotted Definition path of the item that could not be honored.
- **key** (`string`): The item's JSON key.
- **existingId** (`string`): Term definition that stays in the context (collisions only).
- **newId** (`string`): Term definition the item needed.

#### type `WasmToolsModule`

```ts
type WasmToolsModule = typeof import('../wasm-pkg-tools/formspec_wasm_tools.js');
```

#### type `ProjectionConsumer`

The receiving Definition and the authored binding for a response read.

```ts
type ProjectionConsumer = {
    kind: 'instance';
    name: string;
    definition: unknown;
} | {
    kind: 'prefill';
    mapped: boolean;
    definition: unknown;
};
```

