# @formspec/webcomponent — API Reference

*Auto-generated from TypeScript declarations — do not hand-edit.*

`<formspec-render>` custom element that binds a FormEngine to the DOM. Provides a component registry, styling pipeline, navigation (wizard/field focus), and accessibility attributes.

## `defaultTheme: import("@formspec-org/layout").ThemeDocument`

## `renderCheckboxGroup: AdapterRenderFn<CheckboxGroupBehavior>`

## `renderCheckbox: AdapterRenderFn<FieldBehavior>`

## `renderDatePicker: AdapterRenderFn<DatePickerBehavior>`

## `renderDefaultHeading(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultText(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultCard(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultSpacer(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultAlert(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultBadge(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultProgressBar(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultSummary(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultValidationSummary(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderFileUpload: AdapterRenderFn<FileUploadBehavior>`

## `defaultAdapter: RenderAdapter`

## `renderPage(behavior: PageLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderStack(behavior: StackLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderGrid(behavior: GridLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDivider(behavior: DividerLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderCollapsible(behavior: CollapsibleLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderColumns(behavior: ColumnsLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderPanel(behavior: PanelLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderAccordion(behavior: AccordionLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderModal(behavior: ModalLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderPopover(behavior: PopoverLayoutBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderMoneyInput: AdapterRenderFn<MoneyInputBehavior>`

## `renderNumberInput: AdapterRenderFn<NumberInputBehavior>`

## `renderRadioGroup: AdapterRenderFn<RadioGroupBehavior>`

## `renderRating: AdapterRenderFn<RatingBehavior>`

## `SelectClearSentinel`

Distinct value for the native select "clear" row (must stay in sync with `select.ts` behavior change handler).

## `renderSelect: AdapterRenderFn<SelectBehavior>`

## `createFieldDOM(behavior: FieldBehavior, actx: AdapterContext, options?: FieldDOMOptions): FieldDOM`

Create the common field wrapper structure: root div (or fieldset), label (or legend),
description, hint, error.

Uses behavior.widgetClassSlots for x-classes support (from theme widgetConfig).
When a FieldViewModel is available, reads current locale-resolved values from VM signals.
Returns element references for adapter-specific control insertion.

## `finalizeFieldDOM(fieldDOM: FieldDOM, behavior: FieldBehavior, actx: AdapterContext): void`

Finalize field DOM: append remote options status, error display, and apply theme styles.
Call this AFTER inserting the control element.

## `watchFieldValueChanges(behavior: FieldBehavior, fallbackControl: HTMLSelectElement, fn: () => void): () => void`

Run `fn` whenever the field value may have changed.

With a {@link FieldBehavior.vm}, tracks `vm.value` via Preact `effect` (engine view-model cells are typed as
read-only signal accessors only; observing them goes through `effect`, not `.subscribe` on the public type).

Without a VM, subscribes to `change` on `fallbackControl` (native &lt;select&gt; / similar).

## `applyControlSlotClass(control: HTMLElement, behavior: FieldBehavior, actx: AdapterContext, isGroup?: boolean): void`

#### interface `FieldDOMOptions`

- **labelFor** (`boolean`): Set false for group controls where the label shouldn't target a single input. Default true.
- **asGroup** (`boolean`): When true, use <fieldset> for root and <legend> for label.

#### interface `FieldDOM`

- **initialDescribedBy** (`string`): Initial space-separated ID string for aria-describedby.

## `renderSignature: AdapterRenderFn<SignatureBehavior>`

## `renderSlider: AdapterRenderFn<SliderBehavior>`

## `renderDefaultConditionalGroup(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderDefaultDataTable(behavior: DataTableBehavior, parent: HTMLElement, actx: AdapterContext): void`

## `renderTabs: AdapterRenderFn<TabsBehavior>`

## `renderTextInput: AdapterRenderFn<TextInputBehavior>`

## `renderToggle: AdapterRenderFn<ToggleBehavior>`

## `renderWizard: AdapterRenderFn<WizardBehavior>`

#### interface `DisplayComponentBehavior`

- **comp**: `any`
- **host**: `DisplayHostSlice`

## `displayHostSlice(ctx: RenderContext): DisplayHostSlice`

#### interface `DisplayHostSlice`

##### `resolveCompText(comp: any, prop: string, fallback: string): string`

##### `renderComponent(comp: any, parent: HTMLElement, prefix?: string): void`

##### `resolveToken(val: any): any`

##### `findItemByKey(key: string, items?: any[]): any | null`

##### `resolveValidationTarget(resultOrPath: any): ValidationTargetMetadata`

##### `focusField(path: string): boolean`

## `renderMarkdown(src: string): string`

Minimal markdown-to-HTML converter for Text component `format: 'markdown'`.
Handles: **bold**, *italic*, `code`, ordered/unordered lists, line breaks.
Output is pre-sanitized (no raw HTML passthrough).

#### interface `PageLayoutBehavior`

- **comp**: `any`
- **host**: `LayoutHostSlice`
- **titleText**: `string | null`
- **headingLevel**: `string`
- **descriptionText**: `string | null`

#### interface `StackLayoutBehavior`

- **comp**: `any`
- **host**: `LayoutHostSlice`
- **titleText**: `string | null`
- **descriptionText**: `string | null`

#### interface `GridLayoutBehavior`

- **comp**: `any`
- **host**: `LayoutHostSlice`
- **titleText**: `string | null`
- **descriptionText**: `string | null`

#### interface `DividerLayoutBehavior`

- **comp**: `any`
- **labelText**: `string | null`

#### interface `CollapsibleLayoutBehavior`

- **comp**: `any`
- **host**: `LayoutHostSlice`
- **titleText**: `string`
- **descriptionText**: `string | null`

#### interface `ColumnsLayoutBehavior`

- **comp**: `any`
- **host**: `LayoutHostSlice`
- **titleText**: `string | null`
- **descriptionText**: `string | null`

#### interface `PanelLayoutBehavior`

- **comp**: `any`
- **host**: `LayoutHostSlice`
- **titleText**: `string | null`
- **descriptionText**: `string | null`

#### interface `AccordionLayoutBehavior`

- **repeatCount** (`import('@preact/signals-core').Signal<number>`): Current number of repeat instances (only when bound).
- **groupLabel** (`string`): Resolved label for the group/item being repeated.

##### `addInstance(): void`

Add a new repeat instance.

##### `removeInstance(index: number): void`

Remove a repeat instance by index.

#### interface `ModalLayoutBehavior`

- **comp**: `any`
- **host**: `LayoutHostSlice`
- **titleText**: `string | null`
- **triggerLabelText**: `string`

#### interface `PopoverLayoutBehavior`

- **comp**: `any`
- **host**: `LayoutHostSlice`
- **titleResolved**: `string`
- **triggerLabelFallback**: `string`

## `layoutHostSlice(ctx: RenderContext): LayoutHostSlice`

#### interface `LayoutHostSlice`

Subset of {@link RenderContext} for layout adapters (recursive render + repeat/accordion helpers).

- **renderComponent**: `RenderContext['renderComponent']`
- **prefix**: `string`
- **resolveToken**: `RenderContext['resolveToken']`
- **engine**: `RenderContext['engine']`
- **cleanupFns**: `RenderContext['cleanupFns']`
- **findItemByKey**: `RenderContext['findItemByKey']`

## `createSignatureCanvas(config: SignatureCanvasConfig): SignatureCanvasResult`

Create a signature canvas with mouse + touch drawing, DPR-aware scaling,
and ResizeObserver. Dispatches custom events on the provided eventTarget.

Adapters own the surrounding DOM (label, button, error); this utility
owns the canvas behavior.

#### interface `SignatureCanvasConfig`

@filedesc Shared signature canvas drawing utility — used by default and external adapters.

- **height** (`number`): Canvas height in CSS pixels.
- **strokeColor** (`string`): Stroke color for drawing.
- **eventTarget** (`HTMLElement`): Element that receives `formspec-signature-drawn` and `formspec-signature-cleared` events.

#### interface `SignatureCanvasResult`

- **canvas** (`HTMLCanvasElement`): The canvas element — append this to your adapter's DOM.

##### `clear(): void`

Clear the canvas and dispatch `formspec-signature-cleared`.

##### `dispose(): void`

Disconnect the ResizeObserver and clean up.

#### interface `AdapterContext`

Context passed to adapter render functions.

Extended beyond ADR 0046's minimal definition (onDispose only) with
styling helpers that the default adapter needs to reproduce current DOM.
External design-system adapters can ignore all but onDispose.

##### `onDispose(fn: () => void): void`

Register a cleanup function called when the component is torn down.

##### `applyCssClass(el: HTMLElement, comp: any): void`

Apply cssClass from a PresentationBlock or comp descriptor to an element.

##### `applyStyle(el: HTMLElement, style: any): void`

Apply inline styles with token resolution to an element.

##### `applyAccessibility(el: HTMLElement, comp: any): void`

Apply accessibility attributes (role, aria-description, aria-live).

##### `applyClassValue(el: HTMLElement, classValue: unknown): void`

Apply a single class value (string or array) to an element's classList.

#### interface `RenderAdapter`

A render adapter provides DOM construction functions for component types.
Missing entries fall back to the default adapter.

- **integrationCSS** (`string`): CSS text injected into the document head when this adapter is active.

#### type `AdapterRenderFn`

An adapter render function receives a behavior contract and a parent element.
It creates DOM, appends to parent, calls behavior.bind(refs), and registers dispose.

```ts
type AdapterRenderFn = (behavior: B, parent: HTMLElement, actx: AdapterContext) => void;
```

## `useCheckboxGroup(ctx: BehaviorContext, comp: any): CheckboxGroupBehavior`

## `useCheckbox(ctx: BehaviorContext, comp: any): FieldBehavior`

## `useDataTable(ctx: BehaviorContext, comp: any): DataTableBehavior`

## `useDatePicker(ctx: BehaviorContext, comp: any): DatePickerBehavior`

## `useFileUpload(ctx: BehaviorContext, comp: any): FileUploadBehavior`

## `useMoneyInput(ctx: BehaviorContext, comp: any): MoneyInputBehavior`

## `useNumberInput(ctx: BehaviorContext, comp: any): NumberInputBehavior`

## `useRadioGroup(ctx: BehaviorContext, comp: any): RadioGroupBehavior`

## `useRating(ctx: BehaviorContext, comp: any): RatingBehavior`

## `bindSelectCombobox(ctx: BehaviorContext, opts: SelectComboboxBindOpts, refs: FieldRefs): () => void`

#### interface `SelectComboboxBindOpts`

- **fieldPath**: `string`
- **dataType**: `string`
- **multiple**: `boolean`
- **searchable**: `boolean`
- **clearable**: `boolean`
- **placeholder**: `string`
- **vm**: `FieldViewModel | undefined`
- **labelText**: `string`
- **getOptions**: `() => ReadonlyArray<{
        value: string;
        label: string;
        keywords?: string[];
    }>`

## `useSelect(ctx: BehaviorContext, comp: any): SelectBehavior`

## `resolveFieldPath(bind: string, prefix: string): string`

Build full field path from bind key and prefix.

## `toFieldId(fieldPath: string): string`

Convert a dotted field path to a DOM-safe element ID.

## `resolveAndStripTokens(block: PresentationBlock, resolveToken: (v: any) => any, comp?: any): ResolvedPresentationBlock`

Pre-resolve all $token. references in a PresentationBlock.
Adapters receive concrete values only — no token resolution needed.

## `warnIfIncompatible(componentType: string, dataType: string): void`

Warn if the component type is incompatible with the item's dataType.

## `bindSharedFieldEffects(ctx: BehaviorContext, fieldPath: string, vm: FieldViewModel | undefined, labelText: string, refs: FieldRefs): Array<() => void>`

Wire the shared reactive effects that all field behaviors need:
required indicator, validation display, readonly, relevance, touched tracking.

Returns an array of dispose functions.

## `useSignature(ctx: BehaviorContext, comp: any): SignatureBehavior`

## `useSlider(ctx: BehaviorContext, comp: any): SliderBehavior`

## `useTabs(ctx: BehaviorContext, comp: any): TabsBehavior`

## `useTextInput(ctx: BehaviorContext, comp: any): TextInputBehavior`

## `useToggle(ctx: BehaviorContext, comp: any): ToggleBehavior`

#### interface `ResolvedPresentationBlock`

Pre-resolved PresentationBlock — all $token. references already
substituted with concrete values. Adapters never need token resolution.

- **widget?**: `string`
- **widgetConfig?**: `Record<string, any>`
- **labelPosition?**: `'top' | 'start' | 'hidden'`
- **style?**: `Record<string, string>`
- **accessibility?**: `{
        role?: string;
        description?: string;
        liveRegion?: string;
    }`
- **cssClass?**: `string | string[]`
- **fallback?**: `string[]`

#### interface `FieldRefs`

- **onValidationChange** (`(hasError: boolean, message: string) => void`): Called by bind() when validation state changes. Adapters use this to toggle error classes.
- **skipSharedReadonlyControl** (`boolean`): When true, {@link bindSharedFieldEffects} does not set `readOnly` on the control (combobox manages it).
- **skipAriaDescribedBy** (`boolean`): When true, {@link bindSharedFieldEffects} does not set `aria-describedby` on the control (groups manage it on container).

#### interface `SubmitDetail`

Returned by every field behavior hook.

- **response**: `FormResponse`
- **validationReport**: `ValidationReport`

#### interface `FieldBehavior`

- **vm** (`FieldViewModel`): FieldViewModel for reactive locale-resolved state. When present, bind() uses VM signals.
- **widgetClassSlots** (`{
        root?: unknown;
        label?: unknown;
        control?: unknown;
        hint?: unknown;
        error?: unknown;
    }`): Widget class slots from theme widgetConfig x-classes.
Used by the default adapter for slot-level class injection.
Custom adapters can ignore this.
- **compOverrides** (`{
        cssClass?: any;
        style?: any;
        accessibility?: any;
    }`): Component-level style/class/accessibility overrides from the component descriptor.
Used by the default adapter to apply comp-level overrides.
Custom adapters can ignore this — they own their own styling.

##### `options(): ReadonlyArray<{
        value: string;
        label: string;
        keywords?: string[];
    }>`

##### `setValue(val: any): void`

##### `touch(): void`

##### `bind(refs: FieldRefs): () => void`

#### interface `RadioGroupBehavior`

- **groupRole**: `'radiogroup'`
- **inputName**: `string`
- **orientation?**: `string`

#### interface `CheckboxGroupBehavior`

##### `setValue(val: string[]): void`

#### interface `SelectBehavior`

- **searchable** (`boolean`): Combobox with optional filter (native &lt;select&gt; when false and not multiple).
- **multiple** (`boolean`): Multi-value combobox; use with multiChoice fields.

#### interface `ToggleBehavior`

- **onLabel?**: `string`
- **offLabel?**: `string`

#### interface `TextInputBehavior`

- **placeholder?**: `string`
- **inputMode?**: `string`
- **maxLines?**: `number`
- **prefix?**: `string`
- **suffix?**: `string`
- **resolvedInputType?**: `string`
- **extensionAttrs**: `Record<string, string>`

#### interface `NumberInputBehavior`

- **min?**: `number`
- **max?**: `number`
- **step?**: `number`
- **showStepper**: `boolean`
- **dataType**: `string`
- **placeholder?**: `string`

#### interface `DatePickerBehavior`

- **inputType**: `string`
- **minDate?**: `string`
- **maxDate?**: `string`
- **placeholder?**: `string`

#### interface `MoneyInputBehavior`

- **min?**: `number`
- **max?**: `number`
- **step?**: `number`
- **placeholder?**: `string`
- **resolvedCurrency**: `string | null`

#### interface `SliderBehavior`

- **min?**: `number`
- **max?**: `number`
- **step?**: `number`
- **showTicks**: `boolean`
- **showValue**: `boolean`

#### interface `RatingBehavior`

##### `setValue(value: number): void`

#### interface `FileUploadBehavior`

##### `files(): ReadonlyArray<{
        name: string;
        size: number;
        type: string;
    }>`

Reactive snapshot of currently selected files.

##### `removeFile(index: number): void`

Remove a file by index (multi-file mode accumulates).

##### `clearFiles(): void`

Clear all selected files.

#### interface `SignatureBehavior`

- **height**: `number`
- **strokeColor**: `string`

#### interface `DataTableRefs`

- **root**: `HTMLElement`
- **table**: `HTMLTableElement`
- **tbody**: `HTMLElement`

#### interface `DataTableBehavior`

##### `addInstance(): void`

##### `removeInstance(index: number): void`

##### `bind(refs: DataTableRefs): () => void`

#### interface `WizardSidenavItemRefs`

Sidenav item refs for reactive class/text updates without DOM rebuilds.

- **item**: `HTMLElement`
- **button**: `HTMLButtonElement`
- **circle**: `HTMLElement`

#### interface `WizardProgressItemRefs`

Progress indicator refs for reactive class updates without DOM rebuilds.

- **indicator**: `HTMLElement`
- **label?**: `HTMLElement`

#### interface `WizardRefs`

- **stepIndicator** (`HTMLElement`): Visible “Step N of M” line (matches React Wizard).
- **announcer** (`HTMLElement`): Polite live region for step changes.
- **sidenavItems** (`WizardSidenavItemRefs[]`): Sidenav items built once by the adapter; bind() toggles classes/text.
- **progressItems** (`WizardProgressItemRefs[]`): Progress indicators built once by the adapter; bind() toggles classes.
- **onStepChange** (`(stepIndex: number, totalSteps: number) => void`): Callback invoked whenever the active step changes.

#### interface `WizardBehavior`

##### `activeStep(): number`

##### `totalSteps(): number`

##### `canGoNext(): boolean`

##### `canGoPrev(): boolean`

##### `goNext(): void`

##### `goPrev(): void`

##### `goToStep(index: number): void`

##### `renderStep(index: number, parent: HTMLElement): void`

##### `bind(refs: WizardRefs): () => void`

#### interface `TabsRefs`

- **onTabChange** (`(tabIndex: number) => void`): Callback invoked whenever the active tab changes.

#### interface `TabsBehavior`

##### `activeTab(): number`

##### `setActiveTab(index: number): void`

##### `renderTab(index: number, parent: HTMLElement): void`

##### `bind(refs: TabsRefs): () => void`

#### interface `BehaviorContext`

Context passed to behavior hooks. Subset of RenderContext
focused on what behaviors actually need.

- **getFieldVM** (`(fieldPath: string) => FieldViewModel | undefined`): Resolve the FieldViewModel for a component's bound field. Returns undefined if no VM exists.

## `useWizard(ctx: BehaviorContext, comp: any): WizardBehavior`

## `HeadingPlugin: ComponentPlugin`

Renders an `<h1>`-`<h6>` heading; reactive when `bind` is set.

## `TextPlugin: ComponentPlugin`

Renders body text or markdown; reactive when `bind` is set.

## `CardPlugin: ComponentPlugin`

Renders a card container with optional title, subtitle, and children.

## `SpacerPlugin: ComponentPlugin`

Renders a vertical spacer from token `size`.

## `AlertPlugin: ComponentPlugin`

Renders an alert with optional dismiss control.

## `BadgePlugin: ComponentPlugin`

Renders an inline badge.

## `ProgressBarPlugin: ComponentPlugin`

Renders a `<progress>` bar with optional percent label.

## `SummaryPlugin: ComponentPlugin`

Renders a definition list summary of bound values.

## `ValidationSummaryPlugin: ComponentPlugin`

Renders validation messages with optional jump links.

## `registerDefaultComponents(): void`

Registers all 36 built-in component plugins with the global registry.
Includes layout (10), input (13), display (9), interactive (2), and special (2) plugins.
Wizard behavior is driven by formPresentation.pageMode, not a component plugin.

## `TextInputPlugin: ComponentPlugin`

Renders a text input field via the behavior→adapter pipeline.

## `NumberInputPlugin: ComponentPlugin`

Renders a number input field via the behavior→adapter pipeline.

## `SelectPlugin: ComponentPlugin`

Renders a select dropdown via the behavior→adapter pipeline.

## `TogglePlugin: ComponentPlugin`

Renders a toggle switch via the behavior→adapter pipeline.

## `CheckboxPlugin: ComponentPlugin`

Renders a checkbox input via the behavior→adapter pipeline.

## `DatePickerPlugin: ComponentPlugin`

Renders a date picker input via the behavior→adapter pipeline.

## `RadioGroupPlugin: ComponentPlugin`

Renders a radio button group via the behavior→adapter pipeline.

## `CheckboxGroupPlugin: ComponentPlugin`

Renders a checkbox group via the behavior→adapter pipeline.

## `SliderPlugin: ComponentPlugin`

Renders a range slider via the behavior→adapter pipeline.

## `RatingPlugin: ComponentPlugin`

Renders an icon-rating control via the behavior→adapter pipeline.

## `FileUploadPlugin: ComponentPlugin`

Renders a file upload input via the behavior→adapter pipeline.

## `SignaturePlugin: ComponentPlugin`

Renders a signature canvas via the behavior→adapter pipeline.

## `MoneyInputPlugin: ComponentPlugin`

Renders a money input via the behavior→adapter pipeline.

## `InputPlugins: ComponentPlugin[]`

All 13 built-in input component plugins, exported as a single array for bulk registration.

## `TabsPlugin: ComponentPlugin`

Renders a tabbed interface via the behavior-adapter pipeline.

## `SubmitButtonPlugin: ComponentPlugin`

Renders a submit button that invokes the host renderer's `submit()` API.
Supports submit mode selection and optional event dispatch control.

## `PagePlugin: ComponentPlugin`

Renders a `<section>` page container with optional `<h2>` title and `<p>` description.

## `StackPlugin: ComponentPlugin`

Renders a flex `<div>` stack with configurable direction, alignment, wrap, and gap (token-resolved).

## `GridPlugin: ComponentPlugin`

Renders a CSS grid `<div>` with configurable column count, gap, and row gap.

## `DividerPlugin: ComponentPlugin`

Renders an `<hr>` divider, or a labeled divider with `<hr>` lines flanking a `<span>` label.

## `CollapsiblePlugin: ComponentPlugin`

Renders a `<details>`/`<summary>` collapsible section with optional default-open state.

## `ColumnsPlugin: ComponentPlugin`

Renders a multi-column `<div>` layout with configurable column count and token-resolved gap.

## `PanelPlugin: ComponentPlugin`

Renders a `<div>` panel container with optional header and configurable width.

## `AccordionPlugin: ComponentPlugin`

Renders an accordion using `<details>`/`<summary>` elements for each child.
Supports single-open mode (default) via toggle event listeners, or multi-open via `allowMultiple`.
If `bind` is present, each instance of the repeating group becomes one accordion section.

## `ModalPlugin: ComponentPlugin`

Renders a `<dialog>` modal with optional close button, title, and a trigger button that calls `showModal()`.

## `PopoverPlugin: ComponentPlugin`

Renders a popover with a trigger button and content panel.
Trigger label can be bound to a field signal. Uses the Popover API when available, falls back to hidden toggle.

## `ConditionalGroupPlugin: ComponentPlugin`

Renders a wrapper for conditional (relevance-gated) content.

## `DataTablePlugin: ComponentPlugin`

Renders a data-bound editable table for a repeat group.

## `focusFirstIn(container: HTMLElement): HTMLElement`

Focus the first focusable descendant, or the element itself. Returns the focused element.

## `FOCUSABLE_SELECTOR`

Selector matching keyboard-focusable elements.

#### class `FormspecRender`

`<formspec-render>` custom element -- the entry point for rendering a
Formspec form in the browser.

Orchestrates the full rendering pipeline:
- Accepts a definition, optional component document, and optional theme document.
- Creates and manages a {@link FormEngine} instance for reactive form state.
- Builds the DOM by walking the component tree (or falling back to definition items).
- Applies the 5-level theme cascade, token resolution, responsive breakpoints,
  and accessibility attributes.
- Manages ref-counted stylesheet injection, signal-driven DOM updates, and
  cleanup of effects and event listeners on disconnect.
- Supports replay, diagnostics snapshots, and runtime context injection.

##### `constructor()`

- **_definition** (`any`): @internal
- **_componentDocument** (`any`): @internal
- **_themeDocument** (`ThemeDocument | null`): @internal
- **_registryEntries** (`Map<string, any>`): @internal
- **engine** (`IFormEngine | null`): @internal
- **cleanupFns** (`Array<() => void>`): @internal
- **stylesheetHrefs** (`string[]`): @internal
- **touchedFields** (`Set<string>`): Fields the user has interacted with (blur). Validation errors are hidden until touched.
- **touchedVersion** (`import("@preact/signals-core").Signal<number>`): Incremented when touched state changes so error-display effects can react.
- **_screenerCompleted** (`boolean`): Whether the screener has been completed (route selected).
- **_screenerRoute** (`ScreenerRoute | null`): The route selected by the screener, if any.
- **_screenerDocument** (`any | null`): Standalone Screener Document.
- **resolveToken** (`(val: any) => any`): @internal
- **resolveItemPresentation** (`(itemDesc: ItemDescriptor) => PresentationBlock`): @internal
- **applyStyle** (`(el: HTMLElement, style: any) => void`): @internal
- **applyCssClass** (`(el: HTMLElement, comp: any) => void`): @internal
- **applyClassValue** (`(el: HTMLElement, classValue: unknown) => void`): @internal
- **resolveWidgetClassSlots** (`(presentation: PresentationBlock) => {
        root?: unknown;
        label?: unknown;
        control?: unknown;
        hint?: unknown;
        error?: unknown;
    }`): @internal
- **applyAccessibility** (`(el: HTMLElement, comp: any) => void`): @internal
- **(set) screenerSeedAnswers** (`Record<string, any> | null | undefined`): Optional: only screener keys when you have no full `data` blob. Prefer {@link initialData}
with the same shape as `response.data` so screener + main form hydrate in one step.
- **(set) initialData** (`Record<string, any> | null | undefined`): Full Formspec response `data` (same object you would pass to engine hydration). Set
{@link screenerDocument} first when the payload includes screener keys. Set **before**
{@link definition} on a new element. Set {@link screenerDocument} first so screener keys in
`data` are split out for the gate; the rest is applied to the engine.
- **(set) definition** (`any`): Set the form definition. Creates a new {@link FormEngine} instance and
schedules a re-render. Throws if engine initialization fails.
- **(get) definition** (`any`): The currently loaded form definition object.
- **(set) componentDocument** (`any`): Set the component document (component tree, custom components, tokens,
breakpoints). Schedules a re-render.
- **(get) componentDocument** (`any`): The currently loaded component document.
- **(set) themeDocument** (`ThemeDocument | null`): Set the theme document. Loads/unloads referenced stylesheets via
ref-counting and schedules a re-render.
- **(get) themeDocument** (`ThemeDocument | null`): The currently loaded theme document, or `null` if none.
- **(get) showSubmit** (`boolean`): Whether to auto-inject a SubmitButton into the layout plan. Defaults to true.
- **(set) screenerDocument** (`any | null`): Set the standalone Screener Document.
- **(get) registryEntries** (`Map<string, any>`): The current registry entry lookup (extension name → entry).
- **(set) localeDocuments** (`LocaleDocument | LocaleDocument[]`): Load one or more locale documents into the engine. If the engine
hasn't been created yet (no definition set), the documents are
buffered and applied when the engine boots.

Set **after** `definition` for immediate loading, or before if
pre-loading locale bundles before the form definition arrives.
- **(set) locale** (`string`): Set the active locale code. Updates the engine locale if available,
and sets `lang` and `dir` attributes for accessibility and RTL support.

If the engine hasn't been created yet, the locale code is buffered
and applied when the engine boots.
- **(get) locale** (`string`): The currently active locale code, or empty string if none set.
- **findItemByKey** (`(key: string, items?: any[]) => any | null`): @internal

##### `attributeChangedCallback(name: string): void`

##### `classifyScreenerRoute(route: ScreenerRoute | null | undefined): ScreenerRouteType`

@internal

##### `getScreenerState(): ScreenerStateSnapshot`

Returns the current screener completion + routing state.

##### `emitScreenerStateChange(reason: string, answers?: Record<string, any>): void`

@internal

##### `getEngine(): IFormEngine | null`

Return the underlying {@link FormEngine} instance, or `null` if no
definition has been set yet. Useful for direct engine access in tests
or advanced integrations.

##### `getDiagnosticsSnapshot(options?: {
        mode?: 'continuous' | 'submit';
    }): import("@formspec-org/engine").FormEngineDiagnosticsSnapshot | null`

Capture a diagnostics snapshot from the engine, including current signal
values, validation state, and repeat counts.

##### `applyReplayEvent(event: any): import("@formspec-org/engine").EngineReplayApplyResult | {
        ok: boolean;
        event: any;
        error: string;
    }`

Apply a single replay event (e.g. `setValue`, `addRepeat`) to the engine.

##### `replay(events: any[], options?: {
        stopOnError?: boolean;
    }): import("@formspec-org/engine").EngineReplayResult | {
        applied: number;
        results: never[];
        errors: {
            index: number;
            event: null;
            error: string;
        }[];
    }`

Replay a sequence of events against the engine in order.

##### `setRuntimeContext(context: any): void`

Inject a runtime context (e.g. `now`, user metadata) into the engine.

##### `touchAllFields(): void`

Mark all registered fields as touched so validation errors become visible.

##### `submit(options?: {
        mode?: 'continuous' | 'submit';
        emitEvent?: boolean;
    }): {
        response: any;
        validationReport: import("@formspec-org/types").ValidationReport;
    } | null`

Build a submit payload and validation report from the current form state.
Optionally dispatches `formspec-submit` with `{ response, validationReport }`.

##### `resolveValidationTarget(resultOrPath: any): ValidationTargetMetadata`

Resolve a validation result/path to a navigation target with metadata.

##### `setSubmitPending(pending: boolean): void`

Toggle shared submit pending state and emit `formspec-submit-pending-change`
whenever the value changes.

##### `isSubmitPending(): boolean`

Returns the current shared submit pending state.

##### `goToWizardStep(index: number): boolean`

Programmatically navigate to a wizard step in the first rendered wizard.

##### `focusField(path: string): boolean`

Reveal and focus a field by bind path.

##### `getEffectiveTheme(): ThemeDocument`

@internal

##### `render(): void`

Perform a full synchronous render of the form.

##### `getScreenerRoute(): ScreenerRoute | null`

Returns the screener route selected during the screening phase, or null.

##### `skipScreener(): void`

Programmatically skip the screener and proceed to the main form.

##### `restartScreener(): void`

Return to the screener from the main form.

##### `disconnectedCallback(): void`

Custom element lifecycle callback. Disposes all signal effects,
decrements stylesheet ref-counts, tears down breakpoint listeners,
and removes the root container.

## `formatMoney(moneyVal: {
    amount: any;
    currency?: string;
} | null | undefined, locale?: string): string`

Format a Formspec money value `{amount, currency}` as a localized currency string.
Returns `''` when the amount is missing or not a finite number.

## `formatBytes(bytes: number): string`

Format a byte count into a human-readable string (KB, MB, GB).

## `applyResponseDataToEngine(engine: IFormEngine, data: Record<string, any>, prefix?: string): void`

Apply a response `data` object to the engine after `definition` is loaded. Skips paths with no
writable signal (e.g. top-level screener keys) and recurses into repeat groups and object groups.

## `findFieldElement(host: NavigationHost, path: string): HTMLElement | null`

## `revealTabsForField(_host: NavigationHost, fieldEl: HTMLElement): void`

## `focusField(host: NavigationHost, path: string): boolean`

#### interface `NavigationHost`

@filedesc Navigation barrel: exports NavigationHost, path utils, focus, and wizard helpers.

##### `querySelector(selectors: string): Element | null`

##### `querySelectorAll(selectors: string): NodeListOf<Element>`

## `normalizeFieldPath(path: unknown): string`

@filedesc Path normalization and external-to-internal index conversion utilities.

## `externalPathToInternal(path: string): string`

## `goToWizardStep(host: NavigationHost, index: number): boolean`

## `globalRegistry: ComponentRegistry`

Application-wide singleton registry shared by all `<formspec-render>` instances.

All 35 built-in component plugins are registered here at module load.
External code can register additional plugins via `globalRegistry.register(plugin)`.

#### class `ComponentRegistry`

- **(get) size** (`number`): The number of currently registered component plugins.
- **(get) activeAdapterName** (`string`): Get the name of the currently active adapter.

##### `register(plugin: ComponentPlugin): void`

Register a component plugin, keyed by its `type` string.
If a plugin with the same type already exists it is silently replaced.

##### `get(type: string): ComponentPlugin | undefined`

Look up a registered plugin by component type.

##### `registerAdapter(adapter: RenderAdapter): void`

Register a render adapter. The 'default' adapter is always the fallback.

##### `setAdapter(name: string): void`

Set the active adapter by name. Warns and keeps current if name is unknown.

##### `resolveAdapterFn(componentType: string): AdapterRenderFn | undefined`

Resolve the render function for a component type. Falls back to default adapter.

## `createBreakpointState(): BreakpointState`

## `setupBreakpoints(host: BreakpointHost, state: BreakpointState): void`

## `cleanupBreakpoints(state: BreakpointState): void`

#### interface `BreakpointHost`

##### `scheduleRender(): void`

#### interface `BreakpointState`

- **activeBreakpointSignal**: `ReturnType<typeof signal<string | null>>`
- **cleanups**: `Array<() => void>`

## `emitNode(host: RenderHost, node: LayoutNode, parent: HTMLElement, prefix: string, headingLevel?: number): void`

Walk a LayoutNode tree from the planner and emit DOM.

## `renderComponent(host: RenderHost, comp: any, parent: HTMLElement, prefix?: string): void`

Render a component, handling LayoutNode objects by delegating to emitNode.

## `renderActualComponent(host: RenderHost, comp: any, parent: HTMLElement, prefix?: string): void`

Look up a component plugin and invoke its render function with a full RenderContext.

#### interface `RenderHost`

Interface for what emitNode/renderActualComponent need from FormspecRender.

##### `resolveToken(val: any): any`

##### `resolveItemPresentation(itemDesc: ItemDescriptor): PresentationBlock`

##### `applyStyle(el: HTMLElement, style: any): void`

##### `applyCssClass(el: HTMLElement, comp: any): void`

##### `applyClassValue(el: HTMLElement, classValue: unknown): void`

##### `resolveWidgetClassSlots(presentation: PresentationBlock): {
        root?: unknown;
        label?: unknown;
        control?: unknown;
        hint?: unknown;
        error?: unknown;
    }`

##### `applyAccessibility(el: HTMLElement, comp: any): void`

##### `applyClassValue(el: HTMLElement, classValue: unknown): void`

##### `findItemByKey(key: string, items?: any[]): any | null`

##### `submit(options?: any): any`

##### `resolveValidationTarget(resultOrPath: any): ValidationTargetMetadata`

##### `focusField(path: string): boolean`

##### `setSubmitPending(pending: boolean): void`

##### `isSubmitPending(): boolean`

##### `render(): void`

## `evaluateScreenerDocumentForRoute(screenerDocument: ScreenerDocument, answers: Record<string, unknown>): ScreenerRoute | null`

Evaluate a standalone Screener Document (WASM) and return the first matched route, if any.
See specs/screener/screener-spec.md — embedded `definition.screener` is not supported.

## `screenerAnswersSatisfyRequired(screener: ScreenerDocument, answers: Record<string, unknown>): boolean`

True when `answers` satisfies the same required / “at least one answer” rules as the Continue button.

## `normalizeScreenerSeedForItem(item: FormItem, raw: unknown, defaultCurrency: string): unknown`

Coerce values from external systems (saved responses, REST/GraphQL, auth claims, etc.) into
shapes the screener DOM and WASM screener evaluation expect.

## `buildInitialScreenerAnswers(screener: ScreenerDocument, seed: Record<string, any> | null, defaultCurrency: string): Record<string, any>`

Build the in-memory answer map for the screener from optional seed data (same keys as screener items).

## `extractScreenerSeedFromData(screenerDocument: ScreenerDocument | null | undefined, data: Record<string, any> | null | undefined): Record<string, any> | null`

From any plain object, select only entries whose keys match the standalone screener's `items`.
Set {@link FormspecRender.screenerDocument} before {@link FormspecRender.definition} when using
{@link FormspecRender.initialData} so seeds line up with the same document.

## `omitScreenerKeysFromData(screenerDocument: ScreenerDocument | null | undefined, data: Record<string, any>): Record<string, any>`

Shallow copy of `data` without top-level keys that match screener item keys.

## `hasActiveScreener(screenerDocument: ScreenerDocument | null | undefined): boolean`

True when a standalone Screener Document is attached and has at least one item.

## `renderScreener(host: ScreenerHost, container: HTMLElement): void`

#### interface `ScreenerHost`

- **_screenerDocument** (`ScreenerDocument | null`): Standalone Screener Document (`$formspecScreener`). Required for the gate UI.
- **screenerSeedAnswers** (`Record<string, unknown> | null`): Initial answers when the screener mounts — from {@link extractScreenerSeedFromData} / host integration.

##### `classifyScreenerRoute(route: ScreenerRoute | null | undefined): 'none' | 'internal' | 'external'`

##### `emitScreenerStateChange(reason: string, answers?: Record<string, unknown>): void`

##### `dispatchEvent(event: Event): boolean`

##### `render(): void`

## `applyAccessibility(_host: StylingHost, el: HTMLElement, comp: any): void`

## `applyCssClass(host: StylingHost, el: HTMLElement, comp: any): void`

## `applyClassValue(host: StylingHost, el: HTMLElement, classValue: unknown): void`

## `resolveWidgetClassSlots(_host: StylingHost, presentation: PresentationBlock): {
    root?: unknown;
    label?: unknown;
    control?: unknown;
    hint?: unknown;
    error?: unknown;
}`

## `resolveItemPresentation(host: StylingHost, itemDesc: ItemDescriptor): PresentationBlock`

#### interface `StylingHost`

##### `getEffectiveTheme(): ThemeDocument`

##### `findItemByKey(key: string, items?: FormItem[]): FormItem | null`

## `applyStyle(host: StylingHost, el: HTMLElement, style: any): void`

## `canonicalizeStylesheetHref(href: string): string`

## `findThemeStylesheet(hrefKey: string): HTMLLinkElement | null`

## `loadStylesheets(host: StylingHost): void`

## `cleanupStylesheets(host: StylingHost): void`

## `stylesheetRefCounts: Map<string, number>`

Module-level ref counts (was static on the class).

## `resolveToken(host: StylingHost, val: any): any`

## `emitThemeTokens(tokens: Record<string, string | number>, target?: HTMLElement): void`

Emit theme tokens as CSS custom properties on a target element (defaults to documentElement).

## `emitTokenProperties(host: StylingHost, container: HTMLElement): void`

## `touchFieldsInContainer(container: Element, touchedFields: Set<string>, touchedVersion: {
    value: number;
}): void`

Touch all fields within a specific DOM container element (e.g. a wizard panel).
Fields are identified by `.formspec-field[data-name]` elements.
Used for soft per-page wizard validation: errors become visible without blocking navigation.

## `touchAllFields(host: SubmitHost): void`

Mark all registered fields as touched so validation errors become visible.

## `submit(host: SubmitHost, options?: {
    mode?: 'continuous' | 'submit';
    emitEvent?: boolean;
}): {
    response: any;
    validationReport: ValidationReport;
} | null`

Build a submit payload and validation report from the current form state.
Optionally dispatches `formspec-submit` with `{ response, validationReport }`.

## `setSubmitPending(host: SubmitHost, pending: boolean): void`

Toggle shared submit pending state and emit `formspec-submit-pending-change`
whenever the value changes.

## `isSubmitPending(host: SubmitHost): boolean`

Returns the current shared submit pending state.

## `resolveValidationTarget(host: SubmitHost, resultOrPath: string | ValidationResult): ValidationTargetMetadata`

Resolve a validation result/path to a navigation target with metadata.

#### interface `SubmitHost`

##### `dispatchEvent(event: Event): boolean`

##### `findItemByKey(key: string, items?: FormItem[]): FormItem | null`

##### `focusField(path: string): void`

#### interface `ValidationTargetMetadata`

Metadata describing where a validation result points and whether it is jumpable.

- **path**: `string`
- **label**: `string`
- **formLevel**: `boolean`
- **jumpable**: `boolean`
- **fieldElement?**: `HTMLElement | null`

#### interface `ScreenerRoute`

Selected screener route target (if any).

- **target**: `string`
- **label?**: `string`
- **extensions?**: `Record<string, any>`

#### interface `ScreenerStateSnapshot`

Snapshot of current screener completion and routing state.

- **hasScreener**: `boolean`
- **completed**: `boolean`
- **routeType**: `ScreenerRouteType`
- **route**: `ScreenerRoute | null`

#### interface `RenderContext`

Context object passed to every {@link ComponentPlugin} render function.

Provides access to the form engine, theme/component documents, and a
toolkit of rendering helpers so plugins can build DOM, resolve tokens,
apply theme styles, and recursively render child components without
depending on the `FormspecRender` element directly.

- **engine** (`IFormEngine`): The active form engine instance managing reactive form state.
- **componentDocument** (`ComponentDocument | null`): The loaded component document (component tree, custom components, tokens, breakpoints).
- **themeDocument** (`ThemeDocument | null`): The loaded theme document, or `null` when no theme is provided.
- **prefix** (`string`): Dotted path prefix for the current render scope (e.g. `"group[0]"`).
- **submit** (`(options?: {
        mode?: 'continuous' | 'submit';
        emitEvent?: boolean;
    }) => {
        response: FormResponse;
        validationReport: ValidationReport;
    } | null`): Build submit payload + validation report and optionally dispatch `formspec-submit`.
- **resolveValidationTarget** (`(resultOrPath: string | ValidationResult) => ValidationTargetMetadata`): Resolve a validation result/path to a target path + label + jump metadata.
- **focusField** (`(path: string) => boolean`): Reveal and focus a field by path; returns false when no target field is found.
- **submitPendingSignal** (`Signal<boolean>`): Reactive shared submit pending signal used by submit-oriented plugins.
- **latestSubmitDetailSignal** (`Signal<{
        response: FormResponse;
        validationReport: ValidationReport;
    } | null>`): Latest renderer submit detail (`{ response, validationReport }`), or null before first submit.
- **setSubmitPending** (`(pending: boolean) => void`): Set shared submit pending state and emit change event when it toggles.
- **isSubmitPending** (`() => boolean`): Read shared submit pending state.
- **renderComponent** (`(comp: LayoutNode, parent: HTMLElement, prefix?: string) => void`): Recursively render a child component descriptor into a parent element.
- **resolveToken** (`(val: any) => any`): Resolve a `$token.xxx` reference against component and theme token maps. Non-token values pass through unchanged.
- **applyStyle** (`(el: HTMLElement, style: Record<string, any>) => void`): Apply an inline style object to an element, resolving token references in values.
- **applyCssClass** (`(el: HTMLElement, comp: LayoutNode) => void`): Apply `cssClass` entries from a component descriptor to an element's classList.
- **applyAccessibility** (`(el: HTMLElement, comp: LayoutNode) => void`): Apply accessibility attributes (role, aria-description, aria-live) from a component descriptor.
- **resolveItemPresentation** (`(item: ItemDescriptor) => PresentationBlock`): Resolve the effective PresentationBlock for a definition item via the 5-level theme cascade.
- **cleanupFns** (`Array<() => void>`): Disposal callbacks for signal effects and event listeners created during this render cycle.
- **touchedFields** (`Set<string>`): Set of field paths that have been interacted with (blurred/changed).
Errors are only displayed for touched fields. Plugins can add paths here
to force inline error display (e.g. wizard soft-validation on Next click).
- **touchedVersion** (`Signal<number>`): Monotonic counter that increments whenever touched state changes.
Error-display effects subscribe to this so they re-run when fields are
touched programmatically (e.g. wizard Next click).
- **findItemByKey** (`(key: string, items?: FormItem[]) => FormItem | null`): Look up a definition item by key (supports dotted paths like `"group.field"`). Returns `null` if not found.
- **activeBreakpoint** (`string | null`): The currently active responsive breakpoint name, or `null` when no breakpoint matches.
- **behaviorContext** (`BehaviorContext`): Behavior context for the headless behavior→adapter pipeline.
- **adapterContext** (`AdapterContext`): Adapter context for the headless behavior→adapter pipeline.

#### interface `ComponentPlugin`

Contract for a component plugin registered with the {@link ComponentRegistry}.

Each plugin declares a `type` string (e.g. `"TextInput"`, `"Wizard"`) that
maps to a component document's `component` field, and a `render` function
that builds the DOM for that component type.

- **type** (`string`): Component type identifier matched against `comp.component` at render time.
- **render** (`(comp: LayoutNode, parent: HTMLElement, ctx: RenderContext) => void`): Build DOM for this component and append it to `parent`.

#### type `ScreenerRouteType`

Classifies the screener route relative to the current definition URL.

```ts
type ScreenerRouteType = 'none' | 'internal' | 'external';
```

