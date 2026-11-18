# @formspec-org/react — API Reference

*Auto-generated from TypeScript declarations — do not hand-edit.*

React hooks, reusable controls, and automatic rendering for Formspec.

## `FormspecForm(props: FormspecFormProps): react_jsx_runtime.JSX.Element`

Drop-in auto-renderer: takes a definition and renders the full form.

Wraps itself in a FormspecProvider, plans the layout, and renders
each LayoutNode through the component map.

When the definition contains a screener, the screener gate is rendered first.
Once the screener routes internally (or is skipped), the form is shown.

## `FormspecFormContent({ className }: FormspecFormContentProps): react_jsx_runtime.JSX.Element`

Render the current provider's form, including its scoped tokens and issuer chrome.

## `renderSanitizedMarkdown(text: string): string`

Sanitized markdown-to-HTML parser preventing XSS, script injection, srcdoc,
attribute injection, and unescaped HTML vectors.

## `FormspecNode({ node: plannedNode }: {
    node: LayoutNode;
}): react_jsx_runtime.JSX.Element`

Render a single LayoutNode, recursing into children.

## `IssuerChromeSlot({ engine, hostOrigin, mode, headerWidth, }: IssuerChromeSlotProps): react_jsx_runtime.JSX.Element`

## `parseQueryIssuerOverride(pageUrl: URL, allowedOrigins: readonly string[]): IssuerSource | undefined`

## `componentGraphIdentityAttrs(node: Pick<LayoutNode, 'componentGraphIdentity'>): ProjectionMetadataAttrs`

## `uiGraphRoutePolicyAttrs(node: Pick<LayoutNode, 'uiGraphRoutePolicy'>): ProjectionMetadataAttrs`

## `projectionMetadataAttrs(node: Pick<LayoutNode, 'componentGraphIdentity' | 'uiGraphRoutePolicy' | 'needAnchors'>): ProjectionMetadataAttrs`

## `FormspecScreener({ screenerDocument, renderExternalRoute, renderNoMatch, className, ...options }: FormspecScreenerProps): react_jsx_runtime.JSX.Element | null`

## `useScreener(options?: UseScreenerOptions): UseScreenerResult`

## `DefaultField({ field, node }: FieldComponentProps): react_jsx_runtime.JSX.Element`

Default field renderer — works for any field type.
Renders semantic HTML with ARIA attributes, theme-resolved classes,
onBlur touch behavior, and touch-gated error display.
Override per component type via the `components.fields` map.

## `DefaultLayout({ node, children }: LayoutComponentProps): react_jsx_runtime.JSX.Element`

Default layout renderer — dispatches to the correct container component
based on node.component, applying formspec CSS classes and theme styles.

## `Wizard({ node, children }: LayoutComponentProps): React.JSX.Element`

Wizard layout — renders one step at a time with Previous / Next / Submit
navigation, optional progress bar, and soft validation on Next.

Set `node.props.sidenav` (or `formPresentation.sidenav` on the component
document) to show a collapsible step rail; top progress is then hidden
(same as the web component).

## `Tabs({ node, children }: LayoutComponentProps): react_jsx_runtime.JSX.Element`

Tabs layout component.

Renders a tab bar and tab panels following the WAI-ARIA Tabs pattern.
Supports top/bottom/side tab placement, keyboard navigation (Arrow/Home/End),
and automatic activation on arrow key press.

Tab labels are read from child LayoutNode metadata (fieldItem.label, props.title,
or "Tab N" fallback). All panels remain mounted; inactive panels are hidden via
the HTML `hidden` attribute to preserve component state across tab switches.

## `ValidationSummary({ comp, results: resultsProp, source: sourceProp, severityFilter, autoFocus, className, }: ValidationSummaryProps): react_jsx_runtime.JSX.Element | null`

The validation summary in the default look: a heading with the count, then every finding as a link to
its field. Which findings, in what words, and where each links are the shared reader's
(`@formspec-org/layout`) — the same rows the web component's adapters draw — fed from this provider's
engine, its latest submit and its touch gate. Jumping lands the focus the way the renderer's own field
focus does: disclosures opened, hidden tab or wizard step revealed.

## `simpleMarkdown: typeof renderSanitizedMarkdown`

Backward-compatible alias for renderSanitizedMarkdown.

## `defaultTheme: _formspec_org_layout.ThemeDocument`

#### interface `ScreenerPresentationText`

##### `text(key: string, fallback: string, answers: ScreenerAnswers, itemKey?: string, bindScope?: boolean): string`

#### interface `ScreenerRoute`

- **target**: `string`
- **label?**: `string`
- **extensions?**: `Record<string, unknown>`

#### interface `ScreenerStateSnapshot`

- **hasScreener**: `boolean`
- **completed**: `boolean`
- **routeType**: `ScreenerRouteType | null`
- **route**: `ScreenerRoute | null`
- **answers**: `ScreenerAnswers`

#### interface `UseScreenerOptions`

- **localeDocuments** (`readonly LocaleDocument[] | undefined`): Host-admitted Screener-target Locale resources; Definition/App targets stay separate.
- **onDetermination** (`(record: DeterminationRecord, answers: ScreenerAnswers, evaluationTime: string, context: {
        signal: AbortSignal;
        completionId: string;
    }) => ScreenerCompletionDisposition | Promise<ScreenerCompletionDisposition>`): Opt-in native completion. Acceptance precedes leaving answering state.
- **completionKey** (`string | undefined`): Opaque completion scope; replacement retires the act while preserving answers.
- **seedAnswers** (`ScreenerAnswers`): Pre-fill answers.
- **screenerDocument** (`ScreenerDocumentInput | null`): Standalone Screener Document.
- **onRoute** (`(route: ScreenerRoute, routeType: ScreenerRouteType, answers: ScreenerAnswers) => void`): Callback when a route is determined.

#### interface `UseScreenerResult`

- **state** (`'idle' | 'answering' | 'completing' | 'routed'`): Current screener state.
- **answers** (`ScreenerAnswers`): Current answers.
- **items** (`FormItem[]`): Screener items from the loaded document.
- **routes** (`ScreenerRouteDef[]`): Flattened route list from all evaluation phases.
- **binds** (`Bind[]`): Bind declarations on the screener document.
- **setAnswer** (`(key: string, value: ScreenerFieldValue | undefined) => void`): Set a single answer.
- **submit** (`() => void`): Submit answers for evaluation.
- **restart** (`() => void`): Restart the screener (clear answers and route).
- **skip** (`() => void`): Skip the screener entirely.
- **routeResult** (`{
        route: ScreenerRoute;
        routeType: ScreenerRouteType;
    } | null`): The route result, if routed.
- **skipped** (`boolean`): Whether the screener is skipped.
- **errors** (`Record<string, string>`): Validation errors for screener fields (key -> error message).
- **presentation** (`ScreenerPresentationText`): Target-qualified display text; answer/evaluation state remains canonical.

#### interface `FormspecFormProps`

- **className** (`string`): Optional className on the root container.
- **issuerAllowedOrigins** (`readonly string[]`): Origins allowed to supply `?_issuer=` branding overrides. Empty or absent disables query overrides.
- **screenerDocument** (`any`): Standalone Screener Document.
- **skipScreener** (`boolean`): When true, bypass the screener gate entirely.
- **screenerSeedAnswers** (`Record<string, any>`): Pre-fill answers for the screener fields.
- **renderExternalRoute** (`(route: ScreenerRoute) => React.ReactNode`): Render prop for the external route result in the screener.
- **renderNoMatch** (`() => React.ReactNode`): Render prop for the "no match" result in the screener.
- **onScreenerRoute** (`(route: ScreenerRoute, routeType: ScreenerRouteType, answers: Record<string, any>) => void`): Callback when the screener determines a route.

#### interface `FormspecFormContentProps`

- **className?**: `string`

#### interface `IssuerChromeSlotProps`

- **engine**: `IFormEngine`
- **hostOrigin?**: `string`
- **mode?**: `IssuerChromeMode`
- **headerWidth?**: `IssuerChromeHeaderWidth`

#### interface `FormspecScreenerProps`

- **renderExternalRoute** (`(route: ScreenerRoute) => React.ReactNode`): Render prop for the external route result.
- **renderNoMatch** (`() => React.ReactNode`): Render prop for the "no match" result.
- **className** (`string`): CSS className on the root container.

#### interface `ValidationSummaryProps`

- **comp** (`ValidationSummaryComp`): The component's own props (component spec `ValidationSummary`: `source`, `mode`, `showFieldErrors`,
`jumpLinks`, `dedupe`), as the planner carries them. This is how a placed ValidationSummary renders.
- **results** (`Array<{
        path: string;
        message: string;
        severity: string;
    }>`): Findings to list when `source` is `submit` and no form submit is being read — a host's own results.
- **source** (`'live' | 'submit'`): `live` reads the engine's validation as it changes; `submit` reads the latest submit through the
provider, or the `results` prop. Default: `submit`. `comp.source` outranks this.
- **severityFilter** (`string[]`): Which severities to render. Default: ['error', 'warning'].
- **autoFocus** (`boolean`): Whether to auto-focus the summary when errors appear. Default: true.
- **className** (`string`): Optional className override for the container.

#### type `ScreenerRouteType`

```ts
type ScreenerRouteType = 'internal' | 'external' | 'none';
```

#### type `ScreenerFieldValue`

JSON-compatible screener field answer (aligned with engine FormFieldValue).

```ts
type ScreenerFieldValue = string | number | boolean | null | ScreenerFieldValue[] | {
    [key: string]: ScreenerFieldValue;
};
```

#### type `ScreenerAnswers`

```ts
type ScreenerAnswers = Record<string, ScreenerFieldValue | undefined>;
```

#### type `ScreenerDocumentInput`

Author-facing screener document: canonical {@link ScreenerDocument} plus
optional UI/runtime fields not in the schema.

```ts
type ScreenerDocumentInput = ScreenerDocument & {
    submitLabel?: string;
    targetDefinition?: {
        url?: string;
    };
};
```

#### type `ScreenerRouteDef`

Route definition with optional runtime routeType / legacy type hints.

```ts
type ScreenerRouteDef = Route & {
    routeType?: ScreenerRouteType;
    type?: string;
    externalUrl?: string;
};
```

#### type `ScreenerCompletionDisposition`

```ts
type ScreenerCompletionDisposition = {
    status: 'accepted';
} | {
    status: 'refused';
    reason: string;
    retry?: 'same-act' | 'new-act';
};
```

#### type `IssuerChromeMode`

```ts
type IssuerChromeMode = 'light' | 'dark' | 'high-contrast';
```

#### type `IssuerChromeHeaderWidth`

```ts
type IssuerChromeHeaderWidth = 'wide' | 'narrow';
```

#### type `ProjectionMetadataAttrs`

@filedesc Inert projection metadata helpers shared by default React renderers.

```ts
type ProjectionMetadataAttrs = Record<`data-formspec-${string}` | `data-need-${string}`, string>;
```

## `useField(path: string): UseFieldResult`

Full field state from a FieldViewModel.
Re-renders when any signal on the VM changes.
For finer-grained subscriptions, use useFieldValue/useFieldError.

## `FormspecProvider(props: FormspecProviderProps): react_jsx_runtime.JSX.Element`

Provides FormEngine and layout plan to descendant hooks and renderers.

Accepts either a pre-built `engine` or a raw `definition` (creates engine internally).

## `useFormspecContext(): FormspecContextValue`

Access the FormspecContext. Throws if used outside FormspecProvider.

## `emitThemeTokens(tokens: Record<string, string | number>, target?: HTMLElement): void`

Emit theme tokens as --formspec-* CSS custom properties.
Converts dotted token keys (e.g., `color.primary`) to `--formspec-color-primary`.

`target` defaults to `document.documentElement` — a HOST may choose to paint
the document root, and the shipped examples do. `FormspecProvider` does not:
a renderer that writes tenant tokens to `<html>` makes a global mutation that
outlives the component and that a composing host can only clean up after,
never prevent. Always pass a target from inside a component.

## `useSignal(signal: ReadonlyEngineSignal<T>): T`

Subscribe to a Preact `ReadonlyEngineSignal` from React.

Uses `useSyncExternalStore` for tear-free reads.
The `effect()` from `@preact/signals-core` auto-tracks signal
dependencies, so the React callback fires exactly when the
signal's value changes.

## `useFieldValue(path: string): UseFieldValueResult`

Granular field hook — only re-renders when the field's value changes.
Use this when you don't need label/error/required state.

## `useFieldError(path: string): string | null`

Granular field hook — only re-renders when the field's error state changes.
Returns the first error message string, or null if valid.

## `useForm(): UseFormResult`

Form-level state from FormViewModel.
Provides title, validity, and submit/response access.

## `useWhen(expression: string, prefix?: string): boolean`

Evaluate a FEL expression reactively and return its boolean result.
Used by the renderer for `when` conditional rendering on LayoutNodes.

## `useRepeatCount(repeatPath: string): number`

Subscribe to the repeat count for a given repeat path.
Returns 0 if the repeat signal doesn't exist yet.

## `useLocale(): UseLocaleResult`

Locale management hook — forwards to engine locale APIs.
Provides active locale, available locales, text direction, and locale switching.

Subscribes to `engine.localeSignal` so React re-renders on any locale
state change (active locale switch, locale doc load).

## `useExternalValidation(): UseExternalValidationResult`

Inject or clear server-side validation results on the engine.
Use after server-side validation to display errors from external sources.

## `useSubmitPending(): UseSubmitPendingResult`

## `useDiagnostics(): UseDiagnosticsResult`

## `useReplay(): UseReplayResult`

## `useFocusField(): UseFocusFieldResult`

## `useRuntimeContext(): UseRuntimeContextResult`

## `useSemanticFieldControl(field: UseFieldResult, disabled: boolean): void`

Publish the exact set-value capability of a mounted field control.

The shipped DefaultField calls this. A custom field component must call it
itself; the parent renderer does not assume that an override actually
rendered an editable control.

## `chromeText(engine: IFormEngine$1 | undefined, key: ChromeStringKey, params?: Record<string, string | number>, fallback?: string): string`

Locale §3.1.10 `$ui.<ChromeStringKey>`: an authored override wins, else the shared English default
(`packages/formspec-layout/src/ui-strings.ts` — the one inventory every renderer draws from).
Callers subscribe to `engine.localeSignal` so a locale switch re-renders; {@link useChromeText} does that.

## `useChromeText(): ChromeText`

The chrome-string resolver for the form being rendered, re-resolved on a locale switch. Outside a
provider — a standalone `FormspecScreener`, which carries a screener document and no Locale — it
answers with the English defaults.

## `admitDefaultFieldHelpUri: typeof admitFieldHelpUri`

Fail-closed browser policy for human Reference links — the shared rule, so React and the webcomponent admit
exactly the same URIs (`admitFieldHelpUri` in `@formspec-org/layout`).

#### interface `UseFieldResult`

##### `setValue(value: any): void`

##### `touch(): void`

Mark this field as touched by the filer's interaction (e.g., on blur), so its errors show. Does nothing
for a field the filer cannot change: read-only, calculated (read-only through its `calculate` bind), or
protected. Its errors show after an explicit pass over all fields: Save, Submit, a wizard step (Core §5.5).

#### interface `FieldComponentProps`

Props passed to field components by the renderer.

- **field** (`UseFieldResult`): Full reactive field state from useField.
- **node** (`LayoutNode`): The LayoutNode for this field (contains presentation, cssClasses, etc.).

#### interface `LayoutComponentProps`

Props passed to layout components by the renderer.

- **node** (`LayoutNode`): The LayoutNode for this layout element.
- **children** (`React$1.ReactNode`): Rendered children.

#### interface `DisplayComponentProps`

Props passed to display components by the renderer (Heading, Text, Alert, Divider, etc.).

- **node** (`LayoutNode`): The LayoutNode for this display element.
- **text** (`string`): Resolved text content from props.text or fieldItem.label.

#### interface `ComponentMap`

User-provided component overrides.

- **fields** (`Partial<Record<string, React$1.ComponentType<FieldComponentProps>>>`): Field component overrides (TextInput, Select, RadioGroup, etc.).
- **layout** (`Partial<Record<string, React$1.ComponentType<LayoutComponentProps>>>`): Layout component overrides (Section, Stack, Grid, Card, etc.).
- **display** (`Partial<Record<string, React$1.ComponentType<DisplayComponentProps>>>`): Display component overrides (Heading, Text, Alert, Divider, etc.).

#### interface `WorkspacePage`

@filedesc Materialize React's page modes from the same section sequence as Assist.

- **content**: `LayoutNode`

#### interface `ResponseActionInvokerInput`

- **document**: `ResponseActionsDocument | null | undefined`
- **actionRef**: `string`
- **nodeId?**: `string`
- **ports**: `ResponseActionInvocationPorts<TDetail>`
- **invocationContext?**: `ResponseActionInvocationContext`

#### interface `SubmitResult`

- **previewFiling** (`{
        receiptRef: string;
        label: string;
    }`): Receipt and label for a completed local preview filing.

#### interface `FormspecHumanReference`

Human-facing help resolved from manifested References sidecars.

- **needAnchors** (`readonly string[]`): Direct current Need anchors on this exact rendered reference.

#### interface `FormspecContextValue`

- **themeDocument** (`ThemeDocument`): Theme document from the provider (used for container token emission).
- **emitThemeTokens** (`boolean`): Whether this tree owns theme-token emission.
- **componentDocument** (`any`): Component document from the provider (used for container token emission).
- **componentGraph** (`ComponentGraphProjectionContext | null`): Host-supplied Component graph projection context. Projection-only; no runtime authority.
- **hostEvidence** (`LayoutHostEvidence | null`): Host-supplied UI Graph Policy validation evidence. Projection-only; no runtime authority.
- **responseActionsDocument** (`ResponseActionsDocument | null`): Response Actions document used by ActionButton actionRef resolution.
- **onSubmit** (`(result: SubmitResult) => void`): Callback invoked on form submission. Absent means no built-in submit button.
- **onHostEvent** (`(eventName: string, detail: unknown, action: ResponseAction) => void`): Callback invoked for every declared hostEvent effect.
- **onActionFinding** (`(finding: ActionRefFinding) => void`): Callback invoked when ActionButton actionRef resolution produces a finding.
- **onActionResult** (`(result: ResponseActionInvocationResult<SubmitResult>) => void`): Callback invoked after every ActionButton invocation terminal.
- **responseActionInvoker** (`ResponseActionInvoker<SubmitResult> | null`): Optional host-owned invoker that can wrap the engine executor with durable runtime plumbing.
- **evaluateActionPrecondition** (`(precondition: Precondition, action: ResponseAction) => ResponseActionPreconditionResult`): Host precondition evaluator for Response Actions that declare FEL preconditions.
- **evaluateActionEffectExpression** (`ResponseActionInvocationPorts<SubmitResult>['evaluateEffectExpression']`): Effect-time FEL evaluator; receives an immutable invocation snapshot.
- **dispatchActionEffect** (`(effect: EffectRequest, result: SubmitResult, action: ResponseAction, context: ResponseActionEffectDispatchContext) => ResponseActionEffectOutcome | void`): Host durable-effect adapter for non-hostEvent Response Action effects.
- **resolveActionIdempotencyKey** (`(effect: EffectRequest, action: ResponseAction, context: ResponseActionIdempotencyKeyContext) => string`): Host idempotency-key resolver for durable Response Action effects.
- **resolveActionRef** (`(actionRef: string, nodeId?: string) => ActionResolution`): Resolve an ActionButton actionRef against the loaded Response Actions document.
- **semanticControlScope** (`SemanticControlScope`): Exact runtime identity used only by the public semantic-control seam.
- **touchField** (`(path: string) => void`): Mark a field as touched (e.g., on blur).
- **touchAllFields** (`() => void`): Touch every field in the definition (e.g., before submit to reveal all errors).
- **touchedVersion** (`ReadonlyEngineSignal<number>`): Signal that increments when touched set changes — subscribe for reactivity.
- **isTouched** (`(path: string) => boolean`): Check if a field has been touched. Read touchedVersion.value first for reactivity.
- **latestSubmit** (`ReadonlyEngineSignal<SubmitResult | null>`): The latest submit through this provider's form — null before the first. A `submit`-sourced ValidationSummary reads it.
- **recordSubmit** (`(result: SubmitResult) => void`): Record a submit's result, so `latestSubmit` follows it. The submit port calls this.
- **registryEntries** (`Map<string, any>`): Registry entries for extension resolution.
- **resolveFieldHelp** (`FormspecFieldHelpResolver`): Human References for a field path. Agent-only context never enters this seam.
- **admitFieldHelpUri** (`FormspecFieldHelpUriAdmission`): Admit or translate a human Reference URI before it reaches an anchor.
- **fieldHelpLabel** (`string`): Localizable disclosure label for resolved field help.
- **formPresentation** (`Record<string, unknown>`): Effective formPresentation (definition merged with component document).
- **workspacePages** (`WorkspacePage[]`): @internal Shared workspace pages and the optional navigation host.
- **setShowValidationSummaryAttr** (`(show: boolean) => void`): Synchronize the `show-validation-summary` attribute from `.formspec-container`.

#### interface `WorkspaceNavigationProps`

- **activeSection** (`string | undefined`): A supplied value (including undefined) makes the host own section selection.
- **sectionNavigationActive** (`boolean | undefined`): Suppress section focus while another form owns the host's active location.
- **hrefForSection** (`((section: string) => string | undefined) | undefined`): Format a link for normal browser behavior such as opening a new tab.
- **onSectionTitleChange** (`((title: string | undefined) => void) | undefined`): Let a host compose the page title. An undefined title clears the current section.
- **updateDocumentTitle** (`boolean | undefined`): Opt in to prefixing the document title with the active section when no title callback is supplied.

#### interface `FormspecProviderProps`

- **engine** (`IFormEngine`): Pre-built FormEngine instance. Mutually exclusive with `definition`.
- **definition** (`any`): Raw definition JSON. Will create a FormEngine internally.
- **componentDocument** (`any`): Component document for layout planning.
- **componentGraph** (`ComponentGraphProjectionContext | null`): Host-supplied Component graph projection context for inert renderer metadata.
- **hostEvidence** (`LayoutHostEvidence | null`): Host-supplied UI Graph Policy validation evidence for inert renderer metadata.
- **themeDocument** (`ThemeDocument$1`): Theme document for presentation cascade.
- **emitThemeTokens** (`boolean`): Emit theme tokens on provider and form-container elements. Default true.
Set false when an owning shell already emitted the effective token map.
- **responseActionsDocument** (`ResponseActionsDocument | null`): Response Actions document for ActionButton actionRef resolution.
- **semanticControlScope** (`SemanticControlScope`): Exact artifact, render, and Response identity for renderer-owned
semantic controls. Omit for ordinary human-only rendering.
- **initialData** (`Record<string, any>`): Response `data` hydrated at engine construction (host rows win over seedFrom).
- **registryEntries** (`any[]`): Registry entries for extension field validation.
- **resolveFieldHelp** (`FormspecFieldHelpResolver`): Human References resolver for the active Definition.
- **admitFieldHelpUri** (`FormspecFieldHelpUriAdmission`): Host URI policy. Defaults to HTTPS and same-app relative destinations.
- **fieldHelpLabel** (`string`): Localizable disclosure label for resolved field help.
- **runtimeContext** (`any`): Runtime context for FEL today(), locale formatting, etc.
- **issuerFetcher** (`IssuerFetcher`): Optional fetcher for remote Issuer documents.
- **issuerOverride** (`IssuerSource`): Host-supplied Issuer override.
- **components** (`ComponentMap`): Component map overrides.
- **onSubmit** (`(result: SubmitResult) => void`): Callback for form submission. If provided, a submit button is rendered.
- **showValidationSummary** (`boolean`): Open the form with a validation summary — the latest submit's findings, each a link to its field —
when the documents place none. Off by default: a Component document decides where a summary goes.
- **draftSaveFeedback** (`'external' | undefined`): The embedding draft writer announces Save Draft and autosave outcomes.
- **onHostEvent** (`(eventName: string, detail: unknown, action: ResponseAction) => void`): Callback invoked for every declared hostEvent effect.
- **onActionFinding** (`(finding: ActionRefFinding) => void`): Callback for ActionButton actionRef resolution findings.
- **onActionResult** (`(result: ResponseActionInvocationResult<SubmitResult>) => void`): Callback invoked after every ActionButton invocation terminal.
- **responseActionInvoker** (`ResponseActionInvoker<SubmitResult> | null`): Optional host-owned invoker that can wrap the engine executor with durable runtime plumbing.
- **evaluateActionPrecondition** (`(precondition: Precondition, action: ResponseAction) => ResponseActionPreconditionResult`): Host precondition evaluator for Response Actions that declare FEL preconditions.
- **evaluateActionEffectExpression** (`ResponseActionInvocationPorts<SubmitResult>['evaluateEffectExpression']`): Effect-time FEL evaluator; receives an immutable invocation snapshot.
- **dispatchActionEffect** (`(effect: EffectRequest, result: SubmitResult, action: ResponseAction, context: ResponseActionEffectDispatchContext) => ResponseActionEffectOutcome | void`): Host durable-effect adapter for non-hostEvent Response Action effects.
- **resolveActionIdempotencyKey** (`(effect: EffectRequest, action: ResponseAction, context: ResponseActionIdempotencyKeyContext) => string`): Host idempotency-key resolver for durable Response Action effects.

#### interface `UseFieldValueResult`

##### `setValue(value: any): void`

#### interface `SubmitOptions`

- **profile?**: `ValidationProfile`
- **validationTuple?**: `ValidationOverride`
- **id?**: `string`
- **author?**: `{
        id: string;
        name?: string;
    }`
- **subject?**: `{
        id: string;
        type?: string;
    }`

#### interface `UseFormResult`

##### `submit(options?: SubmitOptions): any`

##### `getResponse(meta?: Record<string, any>): any`

#### interface `UseLocaleResult`

- **activeLocale**: `string`
- **availableLocales**: `string[]`
- **direction**: `'ltr' | 'rtl'`
- **setLocale**: `(code: string) => void`
- **loadLocale**: `(doc: any) => void`

#### interface `ExternalValidationEntry`

- **path**: `string`
- **severity**: `string`
- **code**: `string`
- **message**: `string`
- **source?**: `string`

#### interface `UseExternalValidationResult`

- **inject**: `(results: ExternalValidationEntry[]) => void`
- **clear**: `(path?: string) => void`

#### interface `UseSubmitPendingResult`

- **pending** (`boolean`): Whether a submit is currently in progress.
- **setPending** (`(pending: boolean) => void`): Set pending state.
- **wrapSubmit** (`<T>(fn: () => Promise<T>) => Promise<T>`): Wrap an async submit handler — sets pending=true before, pending=false after.

#### interface `UseDiagnosticsResult`

- **getSnapshot** (`(options?: {
        profile?: ValidationProfile;
    }) => any`): Capture a snapshot of the current form state.

#### interface `ReplayApplyResult`

- **ok**: `boolean`
- **event**: `ReplayEvent`
- **output?**: `any`
- **error?**: `string`

#### interface `ReplayResult`

- **applied**: `number`
- **results**: `ReplayApplyResult[]`
- **errors**: `Array<{
        index: number;
        event: ReplayEvent;
        error: string;
    }>`

#### interface `UseReplayResult`

- **applyEvent** (`(event: ReplayEvent) => ReplayApplyResult`): Apply a single replay event.
- **replay** (`(events: ReplayEvent[], options?: {
        stopOnError?: boolean;
    }) => ReplayResult`): Replay a sequence of events.

#### interface `UseFocusFieldResult`

- **focusField** (`(path: string) => boolean`): Focus a field by its bind path. Returns true if found and focused.
- **containerRef** (`React.RefObject<HTMLDivElement | null>`): Ref to attach to the form container for DOM queries.

#### interface `RuntimeContext`

- **now?**: `(() => Date | string | number) | Date | string | number`
- **locale?**: `string`
- **timeZone?**: `string`
- **seed?**: `string | number`
- **meta?**: `Record<string, string | number | boolean>`

#### interface `UseRuntimeContextResult`

- **setRuntimeContext** (`(context: RuntimeContext) => void`): Set runtime context on the engine. Merges with existing context.

#### type `ResponseActionsDocument`

```ts
type ResponseActionsDocument = ResponseActionsDocumentInput;
```

#### type `ResponseActionInvokerResult`

```ts
type ResponseActionInvokerResult = ResponseActionInvocationResult<TDetail> | {
    invocation: ResponseActionInvocationResult<TDetail>;
};
```

#### type `ResponseActionInvoker`

```ts
type ResponseActionInvoker = (input: ResponseActionInvokerInput<TDetail>) => ResponseActionInvokerResult<TDetail> | Promise<ResponseActionInvokerResult<TDetail>>;
```

#### type `FormspecFieldHelpResolver`

```ts
type FormspecFieldHelpResolver = (path: string) => readonly FormspecHumanReference[];
```

#### type `FormspecFieldHelpUriAdmission`

Host policy for turning a References URI into a browser destination.

Returning `undefined` keeps the human-readable reference but renders its
title as text. A host may translate a non-browser scheme into a trusted
internal route; the default admits only HTTPS and same-app relative URIs.

```ts
type FormspecFieldHelpUriAdmission = (uri: string) => string | undefined;
```

#### type `ReplayEvent`

#### type `ChromeText`

Resolves one chrome string: what the renderer says for itself, in the respondent's language.

```ts
type ChromeText = (key: ChromeStringKey, params?: Record<string, string | number>, fallback?: string) => string;
```

## `createSemanticControlRegistry(): SemanticControlRegistry`

Creates one aggregation domain. A Surface normally supplies one registry to
every mounted route/slot renderer, so exact lookup works across generic
Definition forms without querying the DOM.

#### interface `QualifiedSemanticSubjectRef`

Portable owner identity. This deliberately contains no DOM selector,
generated layout-node id, visible label, or projection metadata.

- **artifactRef**: `string`
- **artifactDigest**: `string`
- **subjectKind**: `SemanticControlSubjectKind`
- **subjectRef**: `string`

#### interface `SemanticArtifactIdentity`

- **artifactRef**: `string`
- **artifactDigest**: `string`

#### interface `SemanticResponseBinding`

- **responseId**: `string`
- **responseRevision**: `number`

#### interface `SemanticControlTarget`

- **renderInstanceId**: `string`
- **control**: `QualifiedSemanticSubjectRef`

#### interface `SemanticControlScope`

Host-paired runtime identity for one mounted Definition renderer.
Artifact digests and Response identity are required: omission means the
renderer simply does not publish semantic controls.

- **registry**: `SemanticControlRegistry`
- **renderInstanceId**: `string`
- **definitionArtifact**: `SemanticArtifactIdentity`
- **responseActionsArtifact?**: `SemanticArtifactIdentity`
- **responseId**: `string`
- **initialResponseRevision?**: `number`

#### interface `SemanticControlRefusal`

- **status**: `'refused'`
- **reason**: `SemanticControlRefusalReason`
- **target**: `SemanticControlTarget`
- **message**: `string`

#### interface `SemanticSetItemSuccess`

- **status**: `'set'`
- **target**: `SemanticControlTarget`
- **responseBinding**: `SemanticResponseBinding`

#### interface `SemanticControlActivation`

- **invocation**: `ResponseActionInvocationResult<TDetail>`
- **responseBinding**: `SemanticResponseBinding`

#### interface `SemanticActivateControlContext`

- **responseBinding** (`SemanticResponseBinding`): Exact prior set-item binding named by the activation step.

#### interface `SemanticActivateControlSuccess`

- **status**: `'activated'`
- **target**: `SemanticControlTarget`
- **invocationId**: `string`
- **actionOwner**: `QualifiedSemanticSubjectRef & {
        subjectKind: 'response-action';
    }`
- **responseBinding**: `SemanticResponseBinding`
- **invocation**: `ResponseActionInvocationResult<TDetail>`

#### interface `SemanticControlRegistrationBase`

- **responseId** (`string`): Exact owner Response for this mounted control instance.

#### interface `SemanticSetItemControlRegistration`

- **capability**: `'set-item'`
- **setItem**: `(value: unknown) => SemanticResponseBinding`

#### interface `SemanticActivateControlRegistration`

- **capability**: `'activate-control'`
- **activate**: `(context: ResponseActionInvocationContext) => SemanticControlActivation<TDetail> | Promise<SemanticControlActivation<TDetail>>`

#### interface `SemanticControlRegistry`

##### `register(registration: SemanticControlRegistration): () => void`

Registers one mounted control. The returned cleanup is idempotent and
must run on unmount.

##### `setItem(target: SemanticControlTarget, value: unknown): SemanticSetItemResult`

##### `activateControl(target: SemanticControlTarget, context: SemanticActivateControlContext): Promise<SemanticActivateControlResult<TDetail>>`

#### type `SemanticControlSubjectKind`

@filedesc Exact, renderer-owned semantic control lookup and activation.

```ts
type SemanticControlSubjectKind = 'definition-item' | 'response-action';
```

#### type `SemanticControlRefusalReason`

```ts
type SemanticControlRefusalReason = 'unresolved' | 'ambiguous' | 'stale' | 'unmounted' | 'disabled' | 'unsupported' | 'operation-failed' | 'invocation-mismatch' | 'owner-mismatch' | 'response-mismatch';
```

#### type `SemanticSetItemResult`

```ts
type SemanticSetItemResult = SemanticSetItemSuccess | SemanticControlRefusal;
```

#### type `SemanticActivateControlResult`

```ts
type SemanticActivateControlResult = SemanticActivateControlSuccess<TDetail> | SemanticControlRefusal;
```

#### type `SemanticControlRegistration`

```ts
type SemanticControlRegistration = SemanticSetItemControlRegistration | SemanticActivateControlRegistration;
```

