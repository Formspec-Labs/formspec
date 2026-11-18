# @formspec/layout — API Reference

*Auto-generated from TypeScript declarations — do not hand-edit.*

Layout planning engine. Resolves theme tokens, computes responsive breakpoints, and produces a flat layout plan (widths, order, visibility) from a component tree and theme definition.

formspec-layout — Pure layout planning utilities for Formspec.

Provides theme cascade resolution, token resolution, responsive breakpoint
merging, default component mapping, and parameter interpolation. All
functions are pure (no DOM, no signals, no side effects beyond warnings).

## `bindAutoModal(dialog: HTMLDialogElement, onOpen?: () => void): AutoModal`

Component spec §6.16 opens a `trigger: "auto"` Modal "based on `when`", and §8.1 hides a component
whose ancestor is hidden: the dialog is open exactly while `when` holds AND its page, tab panel or
`when` wrapper is rendered. `showModal()` inside a hidden wizard page leaves an invisible open dialog
that makes the rest of the document inert.

The dialog follows that conjunction's edges, not its level: a respondent who closes it is not
prompted again until it turns false and then true (they leave the page and come back, or `when`
flips). ResizeObserver on the dialog's ancestors (below `<body>`) reports a container appearing or
disappearing, the signal charting and grid libraries use to redraw inside a tab that just became
visible; `onOpen` runs after each automatic open.

#### interface `AutoModal`

The open-state controller for one auto-trigger `<dialog>`.

##### `setCondition(holds: boolean): void`

The Modal's `when` result (`true` when it has none).

##### `dispose(): void`

## `characterCountLimitMessage(maxLength: number, lookup?: UiStringLookup): string`

The sr-only limit message a control's aria-describedby names.

## `characterCountStatus(length: number, maxLength: number, lookup?: UiStringLookup): string`

The visible and announced count status (usa-character-count `getCountMessage`).

## `CHARACTER_COUNT_ANNOUNCE_DELAY_MS`

Typing pause before the polite live status repeats the count, so screen readers are not flooded.

#### type `UiStringLookup`

A Locale-override lookup for one `$ui.<ChromeStringKey>` suffix; `null`/absent falls to {@link UI_STRINGS}.

```ts
type UiStringLookup = (key: ChromeStringKey) => string | null | undefined;
```

## `getDefaultComponent(item: {
    dataType?: string;
}): string`

## `admitFieldHelpUri(uri: string): string | undefined`

Fail-closed browser policy for human Reference links: HTTPS, or a same-app relative URI, and nothing else.

Deliberately narrower than the rich-text link rule (core §4.2.1 admits `http:` and `mailto:` too). A help
link is a destination a form hands a respondent under the form's own authority — a downgrade to `http:`, an
embedded credential, or a protocol-relative `//host` that inherits whatever scheme the page loaded under are
all things a References Document should not be able to introduce. One rule, both renderers.

## `resolveFieldHelp(document: ReferencesDocumentLike | null | undefined, fieldPath: string): readonly FieldHelpReference[]`

The human-facing References bound to `fieldPath`, in presentation order.

Qualifying (References spec §2.1, §4.2, §8.2): `audience` is `"human"` or `"both"` — agent-only entries are
never rendered — and `target` names this item. A `target` matches when it equals the path, equals the path
with its repeat indices stripped, or is the `items[*].field` wildcard form of it; `"#"` is form-level and
belongs to no field. Order is by effective priority tier (absent means `"supplementary"`, §2.1), then
authoring order within the tier (§2.4).

#### interface `FieldHelpReference`

A human-facing Reference as a renderer needs it (References spec §2.1).

- **needAnchors** (`readonly string[]`): Direct current Need anchors on this exact rendered reference (References spec §7).

#### interface `ReferencesDocumentLike`

A References Document as the schema shapes it (References spec §4.1).

- **references?**: `unknown`

#### type `FieldHelpUriAdmission`

Host policy for turning a References URI into a browser destination.

Returning `undefined` keeps the human-readable reference but renders its title as text. A host may
translate a non-browser scheme into a trusted internal route; {@link admitFieldHelpUri} is the default.

```ts
type FieldHelpUriAdmission = (uri: string) => string | undefined;
```

## `mergeFormPresentationForPlanning(fromDefinition?: unknown, fromComponentDocument?: unknown): Record<string, unknown> | undefined`

Merges tier-1 `formPresentation` from the core definition with the optional
component document. Component document wins on key conflicts — layout
documents can set `pageMode`, `showProgress`, etc. without duplicating the
whole definition.

## `workspaceSections(plan: readonly PageSequenceEntry[]): PageSequenceEntry[]`

Attach unkeyed fragments to adjacent identified sections without changing their order.

## `summarizeFormProgress(sectionPlan: readonly PageSequenceEntry[], state: EvaluatedFormState): FormProgressSummary`

## `pageProgressIssue(counts: ProgressCounts): 'required' | 'unavailable' | 'invalid' | 'empty' | 'blocked-readonly' | undefined`

## `readFormProgressFindingRows(summary: FormProgressSummary, source: Pick<ValidationSummarySource, 'message' | 'field' | 'jumpable' | 'chrome'>): ProgressFindingRow[]`

#### interface `ProgressCounts`

- **toFix** (`number | null`): Null when validation was unavailable for this snapshot.

#### interface `ProgressFinding`

- **formLevel** (`boolean`): Whether this finding has no place in the rendered form.

#### interface `FormProgressSummary`

- **form**: `ProgressCounts & {
        ready: boolean;
    }`
- **sections**: `Array<{
        id?: string;
        counts: ProgressCounts;
        filled: boolean;
    }>`
- **findings**: `ProgressFinding[]`

#### interface `ProgressFindingRow`

- **resultPath** (`string`): The concrete report path, including for findings without a rendered owner.

## `needGenerationAnchors(values: readonly unknown[]): string[]`

Copy only canonical Need anchors from authored generation metadata.

## `classifyComponent(type: string): LayoutNode['category']`

## `createNodeIdGenerator(start?: number): NodeIdGenerator`

## `preparePlanContext(ctx: Omit<PlanContext, 'nextId'> & Partial<Pick<PlanContext, 'nextId'>>): PlanContext`

Attach a per-plan ID generator when callers omit `nextId`.

## `planContains(node: LayoutNode, component: string): boolean`

## `ensureActionButton(root: LayoutNode, nextId?: NodeIdGenerator, options?: EnsureActionButtonOptions): void`

## `ensureValidationSummary(root: LayoutNode, nextId?: NodeIdGenerator): void`

Put a `ValidationSummary` at the head of the plan unless the document already places one: the latest
submit's findings, field errors included, each a jump link to its field (component spec: ValidationSummary).
A form with no Component document has no way to ask for one, so a host that wants the summary a long form
needs opts in, the way it opts into the submit button.

## `resolveTokenInContext(val: unknown, ctx: PlanContext): unknown`

## `resolveStyleTokens(style: Record<string, string | number> | undefined, ctx: PlanContext): Record<string, string | number> | undefined`

## `resolveGridTracks(val: unknown, ctx: PlanContext): unknown`

## `gridPlacementStyleFromLayout(layout: unknown): Record<string, string> | undefined`

## `normalizeCssClass(val: string | string[] | undefined): string[]`

## `resolveCssClasses(comp: {
    cssClass?: string | string[];
}, ctx: PlanContext): string[]`

## `extractProps(comp: Record<string, unknown>): Record<string, unknown>`

#### interface `EnsureActionButtonOptions`

- **pageMode?**: `string`
- **actionRef?**: `string`

## `placementCovers(placement: string, path: string): boolean`

Whether one placement covers every instance of the other placement.

## `placementKey(path: string): string`

## `resolvePageSequence(definition: FormDefinition, options?: PageSequenceOptions): PageSequenceEntry[]`

#### interface `PageSequenceEntry`

- **titleBind** (`string`): Item whose Locale-resolved label supplies the generated title.
- **container** (`LayoutNode`): The Component root to wrap the selected nodes in when the authored root is split.
- **fields** (`string[]`): Unique field placement paths. A repeat template uses [*], an explicit index stays concrete.
- **fieldTemplates** (`string[]`): Authored field templates assigned once across the plan, for fixed-width progress segments.

#### interface `PageSequenceOptions`

- **component?**: `ComponentDocument`
- **theme?**: `ThemeDocument`
- **context?**: `Pick<PlanContext, 'formPresentation' | 'componentGraph' | 'hostEvidence' | 'isComponentAvailable' | 'nextId' | 'activeBreakpoint'>`

## `interpolateParams(node: any, params: any): void`

Replace `{param}` placeholders in a component tree node with values from
a params object. Walks string properties, arrays, and nested objects
recursively. Used during custom component expansion to substitute
parameterized values declared in component document templates.

## `planComponentTree(tree: ComponentTreeNode, ctx: PlanContext, prefix?: string, customComponentStack?: Set<string>, applyThemePages?: boolean, graphPathSegments?: readonly string[] | null): LayoutNode`

## `planDefinitionFallback(items: FormItem[], ctx: PlanContext, prefix?: string, applyThemePages?: boolean): LayoutNode[]`

## `planDefinitionItem(item: FormItem, ctx: PlanContext, prefix?: string): LayoutNode`

## `emitPageModePages(orphans: LayoutNode[], pages: PlannedPage[], nextId?: NodeIdGenerator): LayoutNode[]`

## `buildDefinitionPages(nodes: LayoutNode[], items: FormItem[]): {
    orphans: LayoutNode[];
    pages: PlannedPage[];
}`

## `applyDefinitionPageMode(nodes: LayoutNode[], ctx: PlanContext): LayoutNode[]`

## `applyGeneratedPageMode(rootNode: LayoutNode, componentType: string, ctx: PlanContext): LayoutNode`

## `isStudioGeneratedComponentDoc(doc: ComponentDocument | undefined): boolean`

## `stripTitleFromGroupNode(node: LayoutNode): LayoutNode`

#### type `PlannedPage`

## `componentTreeOwnsPages(tree: ComponentTreeNode | null | undefined): boolean`

## `findItemPathByKey(items: FormItem[], key: string, prefix?: string): string | null`

## `findItemAtPath(items: FormItem[], path: string): FormItem | null`

## `getParentPath(path: string): string`

## `findComponentNodeByPath(_items: FormItem[], rootNode: ComponentTreeNode, path: string): ComponentTreeNode | null`

## `findNodeByBindPath(node: ComponentTreeNode, targetPath: string, currentPrefix: string): ComponentTreeNode | null`

## `withoutThemePages(ctx: PlanContext): PlanContext`

## `collectAssignedTopLevelKeys(items: FormItem[], pages: NonNullable<PlanContext['theme']>['pages']): Set<string>`

## `buildThemePageNodes(planRegionNode: (regionPath: string) => LayoutNode | null, items: FormItem[], ctx: PlanContext, options?: {
    preserveBinding?: boolean;
    retainHiddenRegions?: boolean;
    retainRegionlessPages?: boolean;
}): LayoutNode[]`

## `wrapRegionNode(node: LayoutNode, region: Region, activeBreakpoint: string | null, nextId: PlanContext['nextId'], retainHidden?: boolean): LayoutNode | null`

## `carryWidthStop(componentType: string, widgetConfig: Record<string, unknown> | undefined, props: Record<string, unknown>): void`

Copy `widgetConfig.width` onto `props.width` for a width-stop widget — same carry as
`widgetConfig.rows` → `maxLines`, shared so the definition-fallback and component-tree planners
agree regardless of which one planned a given field. A no-op for any other widget, or when
`width` is absent; `props.width` is left untouched if already set.

## `WIDTH_STOP_WIDGETS: Set<string>`

Widgets whose control an adapter can size to the expected answer (theme §4.2 Width Stops).

## `buildPlatformTheme(): ThemeDocument`

Build a complete ThemeDocument from the token registry and platform defaults.

Light-mode tokens come from each entry's `default` value. Dark-mode tokens
are derived from `dark` values, keyed under the category's `darkPrefix`.

## `mergePlatformAndTenantTheme(platformTheme: TPlatform, tenantTheme: TTenant): Omit<TPlatform, 'tokens'> & Omit<TTenant, 'tokens'> & {
    tokens: Record<string, string | number>;
}`

## `platformDefaults: PresentationBlock`

Default presentation applied to all items before selector matching.

## `platformSelectors: ThemeSelector[]`

Type-based selector rules applied in document order during theme cascade.

## `positionPopupNearTrigger(triggerEl: HTMLElement, overlayEl: HTMLElement, placement?: PopupPlacement): void`

Pin `overlayEl` with fixed coordinates near `triggerEl`. Call only when a placement is chosen;
omit to keep native dialog centered presentation.

## `clearPopupFixedPosition(overlayEl: HTMLElement): void`

Clear inline positioning from a previous anchored open so the dialog can use default centering.

## `POPUP_EDGE_PADDING`

## `POPUP_TRIGGER_GAP`

## `MODAL_FIRST_FOCUSABLE_SELECTOR`

First focusable in modal/dialog content (disabled controls skipped).

#### type `PopupPlacement`

Position anchored overlays (modal, popover) near a trigger.
Shared by React and web component renderers; optional for native centered dialogs.

```ts
type PopupPlacement = 'top' | 'right' | 'bottom' | 'left';
```

## `resolveResponsiveProps(comp: any, activeBreakpoint: string | null, breakpoints?: Record<string, number | string> | null): any`

Merge responsive breakpoint overrides onto a component descriptor.

When no numeric breakpoints are available — either because no breakpoints
map is supplied or because the map contains only raw media-query strings —
applies the single active breakpoint's overrides directly. This is the v1
default for themes that don't pin numeric minWidths (it is not a deprecated
shim and carries no removal target).

When numeric breakpoints are available, performs a mobile-first cumulative
cascade per Component Spec §9.3: all breakpoints whose minWidth ≤ the active
breakpoint's minWidth are applied in ascending minWidth order, so later
breakpoints win over earlier ones for conflicting keys.

## `isRichText(source: string): boolean`

True when `source` contains a character sequence the subset could turn into markup.

A negative answer is the fast path *and* the guarantee behind "plain strings render unchanged": a caller
that sees `false` can write the string as-is, byte for byte, instead of round-tripping it through the
parser. Deliberately over-inclusive — a `_` in `field_name` answers `true` and then parses to one literal
text run, which is correct, just not free.

## `parseRichText(source: string): RichBlock[]`

Parse the core §4.2.1 rich-text subset: paragraphs, `- ` / `* ` lists, `**strong**`, `_emphasis_`, and
`[text](https|http|mailto URI)`. Nothing else is markup — headings, images, code, tables and raw HTML
are literal text, as is any link with another scheme.

**Callers MUST interpolate `{{ }}` before calling.** The parser has no notion of interpolation, so a value
substituted in beforehand is parsed like any other text and CANNOT re-open the markup boundary in the other
direction — see the emitter, which never builds markup from a node's text. The rule that protects the
respondent (an answer containing `**` is never bold) is the emitter's, enforced by parsing once.

## `richTextToPlain(blocks: RichBlock[]): string`

Flatten an inline tree back to its text content — the plain-text rendering of a parsed string.

#### type `RichInline`

An inline run inside a {@link RichBlock}.

`strong`, `em` and `link` nest inline children; `text` is a literal run. There is no node kind for a
construct outside the subset, by design: anything the subset does not define stays `text`.

#### type `RichBlock`

A block in the subset: a paragraph, or one unordered list with an inline run per entry.

```ts
type RichBlock = {
    kind: 'paragraph';
    children: RichInline[];
} | {
    kind: 'list';
    items: RichInline[][];
};
```

## `resolveRouteLandmark(policy: UiGraphRoutePolicyProjection | undefined): ResolvedRouteLandmark`

Map validated route policy to active landmark attributes.
Callers MUST gate overlay roots (Modal, Dialog, Popover) separately.

#### type `ResolvedRouteLandmarkRole`

```ts
type ResolvedRouteLandmarkRole = 'main' | 'navigation' | 'complementary' | 'region';
```

#### type `ResolvedRouteLandmark`

```ts
type ResolvedRouteLandmark = {
    role?: ResolvedRouteLandmarkRole;
    ariaLabel?: string;
};
```

Theme cascade resolver.

Resolves the effective {@link PresentationBlock} for a given item by
merging the 5-level theme cascade:

  1. Tier 1 formPresentation (lowest)
  2. Tier 1 item.presentation
  3. Theme defaults
  4. Matching theme selectors (document order)
  5. Theme items[key] (highest)

Also provides {@link resolveWidget} for selecting the best available
widget from a preference + fallback chain.

## `setTailwindMerge(fn: (classes: string) => string): void`

Inject the `twMerge` function from the `tailwind-merge` package.
Call this once at startup to enable `classStrategy: "tailwind-merge"`:

```ts
import { twMerge } from 'tailwind-merge';
import { setTailwindMerge } from '@formspec-org/layout';
setTailwindMerge(twMerge);
```

## `resolvePresentation(theme: ThemeDocument | null | undefined, item: ItemDescriptor, tier1?: Tier1Hints): PresentationBlock`

Resolve the effective {@link PresentationBlock} for a single item by
merging five cascade levels (lowest to highest priority):

1. Tier 1 form-wide presentation hints (`formPresentation`)
2. Tier 1 per-item presentation hints (`item.presentation`)
3. Theme defaults
4. Theme selectors (document order; later selectors override earlier)
5. Theme `items[key]` overrides

Scalar properties are replaced at each level. `cssClass` is unioned,
and `style`, `widgetConfig`, and `accessibility` are shallow-merged.

## `resolveWidget(presentation: PresentationBlock, isAvailable: (type: string) => boolean): string | null`

Select the best available widget from a presentation block's preference
and fallback chain.

Tries the preferred `widget` first, then each entry in `fallback` in order.
If none are available in the component registry, logs a warning (per Theme
spec section 7) and returns `null` so the caller can fall back to the default
component for the item's dataType.

#### interface `AccessibilityBlock`

ARIA-related presentation hints applied to a rendered element.

- **role?**: `string`
- **description?**: `string`
- **liveRegion?**: `'off' | 'polite' | 'assertive'`

#### interface `PresentationBlock`

Merged presentation directives for a single item: widget choice, label position, styles, CSS classes, accessibility, and fallback chain.

- **cssClassReplace** (`string | string[]`): CSS classes that **replace** rather than union with lower cascade levels.
Use when a higher-priority level needs to override utility classes from
a lower level (e.g. replacing `p-4` with `p-8` in Tailwind).

During cascade merging, `cssClassReplace` entries are collected, and
after the final union any exact matches from lower levels are removed.
- **requiredIndicator** (`'marker' | 'none'`): Whether a required item shows the visible required marker. `'none'` suppresses the asterisk and nothing
else — the programmatic required state (`aria-required`) stays (theme spec §5.2). Absent means
`'marker'`.

#### interface `SelectorMatch`

Criteria for a theme selector rule: matches items by type, dataType, or both.

- **type?**: `'group' | 'field' | 'display'`
- **dataType?**: `FormspecDataType`

#### interface `ThemeSelector`

A theme selector rule pairing a {@link SelectorMatch} condition with a {@link PresentationBlock} to apply.

- **match**: `SelectorMatch`
- **apply**: `PresentationBlock`

#### interface `Region`

A named layout region within a page, with optional grid span/start and responsive overrides.

- **key**: `string`
- **span?**: `number`
- **start?**: `number`
- **responsive?**: `Record<string, {
        span?: number;
        start?: number;
        hidden?: boolean;
    }>`

#### interface `Page`

A page definition within a theme, used for wizard/tab page layouts with optional region grid.

- **id**: `string`
- **title**: `string`
- **description?**: `string`
- **regions?**: `Region[]`

#### interface `ThemeDocument`

Top-level theme document: tokens, defaults, selectors, per-item overrides, pages, breakpoints, and stylesheets.

- **targetDefinition** (`{
        url: string;
        compatibleVersions?: string;
    }`): Definition binding. Absent = bundle-scoped Theme (ADR 0150 §5.2 app envelope); the cascade is unaffected either way.
- **adapter** (`string`): Registered name of the render adapter this theme's selectors, widgetConfig, and cssClass are
written for. Absent means the renderer's default adapter; an unregistered name is
THEME-ADAPTER-MISSING. See `specs/theme/theme-spec.md` §2.4.
- **classStrategy** (`'union' | 'tailwind-merge'`): CSS class merge strategy applied after cascade resolution.
- `"union"` (default): plain Set-based deduplication.
- `"tailwind-merge"`: conflict-aware merge that keeps only the last
  utility per Tailwind prefix (requires `tailwind-merge` at runtime).

#### interface `ItemDescriptor`

Lightweight identifier for a definition item, used as the input to the theme cascade resolver.

- **key**: `string`
- **type**: `'group' | 'field' | 'display'`
- **dataType?**: `FormspecDataType`

#### interface `LayoutHints`

Tier 1 layout hints from the definition: flow direction, grid columns, collapsibility, and grid placement.

- **flow?**: `'stack' | 'grid' | 'inline'`
- **columns?**: `number`
- **grid?**: `{
        span?: number;
        start?: number;
        rowSpan?: number;
        rowStart?: number;
    }`
- **collapsible?**: `boolean`
- **collapsedByDefault?**: `boolean`

#### interface `StyleHints`

Tier 1 visual emphasis and sizing hints from the definition.

- **emphasis?**: `'primary' | 'success' | 'warning' | 'danger' | 'muted'`
- **size?**: `'compact' | 'default' | 'large'`

#### interface `Tier1Hints`

Definition-level (Tier 1) presentation hints that feed into the lowest two levels of the theme cascade.

- **itemPresentation** (`{
        widgetHint?: string;
        layout?: LayoutHints;
        styleHints?: StyleHints;
    }`): Per-item presentation hints from the definition
- **formPresentation** (`{
        labelPosition?: 'top' | 'start' | 'hidden';
        density?: 'compact' | 'comfortable' | 'spacious';
        pageMode?: 'single' | 'wizard' | 'tabs';
    }`): Form-wide presentation defaults from the definition

#### type `FormspecDataType`

Union of all `dataType` values recognized by the Formspec schema for selector matching and field definitions.

```ts
type FormspecDataType = 'string' | 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'dateTime' | 'time' | 'uri' | 'attachment' | 'choice' | 'multiChoice' | 'money';
```

## `resolveToken(val: any, componentTokens: Record<string, string | number> | undefined, themeTokens: Record<string, string | number> | undefined): any`

Resolve a `$token.xxx` reference against component and theme token maps.

Component tokens take precedence over theme tokens. Values that are not
`$token.` prefixed strings pass through unchanged. Logs a warning when
a token reference cannot be resolved in either map.

## `emitMergedThemeCssVars(target: HTMLElement, options: {
    themeTokens?: Record<string, string | number> | null;
    componentTokens?: Record<string, string | number> | null;
}): void`

Emit merged theme + component tokens as `--formspec-*` CSS custom properties on `target`.
Component tokens override theme tokens (same merge order as `emitTokenProperties` in the web component).

#### interface `UiGraphPolicyProjectionEvidence`

Host-supplied UI Graph Policy evidence shaped like AppGraphValidator request evidence.

- **schemaId**: `string`
- **source**: `string`
- **document**: `UiGraphPolicyDocument`

#### interface `ComponentGraphProjectionEvidence`

Host-supplied Component graph projection context evidence shaped like AppGraphValidator request evidence.

- **schemaId**: `string`
- **source**: `string`
- **document**: `ComponentGraphProjectionContext`

#### interface `LayoutHostLandmarks`

- **reserved**: `LayoutHostLandmarkRole[]`

#### interface `LayoutHostEvidence`

Projection-only host evidence. Layout does not fetch, validate, or discover these documents.

- **appGraphReport** (`AppGraphValidationReport`): Completed AppGraphValidator report for the supplied host evidence.

#### interface `UiGraphRoutePolicyProjection`

Route-policy metadata copied from a matching UI Graph Policy document.

- **schemaId**: `string`
- **source**: `string`
- **targetSurface**: `UiGraphPolicyDocument['targetSurface']`
- **routeId**: `string`
- **a11y?**: `UiGraphRoutePolicyA11yProjection`
- **responsive?**: `NonNullable<UiGraphPolicyDocument['routePolicies'][number]['responsive']>`

#### interface `LayoutNode`

A JSON-serializable layout plan node. Produced by the planner and consumed
by renderers (webcomponent, React, PDF, SSR, etc.).

All values are plain data — no functions, class instances, or signals.

- **id** (`string`): Stable ID for diffing/keying (auto-generated during planning).
- **component** (`string`): Resolved component type: "Stack", "TextInput", "Section", etc.
- **category** (`'layout' | 'container' | 'field' | 'display' | 'interactive' | 'special'`): Node classification for renderer dispatch.
- **props** (`Record<string, unknown>`): All resolved component props (tokens resolved, responsive merged). JSON-serializable.
- **style** (`Record<string, string | number>`): Resolved inline styles (tokens resolved).
- **cssClasses** (`string[]`): Merged CSS class list from theme cascade + component doc.
- **accessibility** (`{
        role?: string;
        description?: string;
        liveRegion?: string;
    }`): Accessibility attributes.
- **children** (`LayoutNode[]`): Ordered child nodes.
- **needAnchors** (`string[]`): Canonical `need:<id>@<revision>` anchors copied from the authored
Definition Item and/or Component node that produced this render node.
Renderers expose these as inert review metadata; graph validation remains
responsible for proving that each target is current and adopted.
- **pageMode** (`'wizard' | 'tabs'`): Page mode for a planner-authoritative root whose direct Section children are page units.
- **componentGraphIdentity** (`ComponentNodeIdentityRef`): Graph-wide Component node identity per Component §11.6, when caller supplies graph context.
- **uiGraphRoutePolicy** (`UiGraphRoutePolicyProjection`): Projection-only UI Graph Policy route metadata. Web renderers may consume
the route-landmark profile; they MUST NOT infer keyboard behavior,
runtime hidden-state, general ARIA synthesis, or authorization from it.
- **bindPath** (`string`): Full bind path (e.g. "applicantInfo.orgName").
- **fieldItem** (`{
        key: string;
        label: string;
        hint?: string;
        dataType?: string;
        options?: Array<{
            value: string;
            label: string;
        }>;
        optionSet?: string;
        extensions?: Record<string, boolean>;
    }`): Snapshot of the definition item this field maps to.
- **presentation** (`PresentationBlock`): Resolved presentation block from 5-level theme cascade.
- **labelPosition** (`'top' | 'start' | 'hidden'`): Effective label position.
- **when** (`string`): FEL expression string — renderer subscribes to this for reactive visibility.
- **whenPrefix** (`string`): Path prefix for evaluating the when expression.
- **fallback** (`string`): Fallback content when when=false.
- **repeatGroup** (`string`): Group name for repeat signals.
- **repeatPath** (`string`): Full path of the repeat group.
- **isRepeatTemplate** (`boolean`): If true, children are a template to stamp per instance.
- **repeatPresentation** (`string`): Theme `widget` naming how the instances are presented (`RepeatCards`; theme §4.2 Item Presentation
Widgets). Chrome only — the rows, their children, and the Add/Remove locks are unchanged. The
renderer falls back to its default repeat presentation when its adapter has no render for the name.
- **scopeChange** (`boolean`): If true, this node's bind path creates a new scope (prefix) for child rendering.
Used by definition-fallback groups where item keys are relative.

#### interface `PlanContext`

Plain-value snapshot the planner needs to produce a layout plan.
Contains no signals or reactive references — just data.

- **items** (`FormItem[]`): The definition items array.
- **formPresentation** (`FormDefinition['formPresentation']`): Definition-level formPresentation block.
- **componentDocument** (`ComponentDocument`): The loaded component document (tree, components, tokens, breakpoints).
- **componentGraph** (`ComponentGraphProjectionContext`): App-graph Component membership/surface/route scope for projection-only identity.
- **hostEvidence** (`LayoutHostEvidence`): Projection-only host evidence, matching `hostEvidence.uiGraphPolicies[]`.
- **theme** (`ThemeDocument`): The loaded theme document.
- **activeBreakpoint** (`string | null`): Currently active breakpoint name, or null.
- **nextId** (`NodeIdGenerator`): Generates unique layout node IDs for this plan invocation.
- **findItem** (`(key: string) => FormItem | null`): Lookup a definition item by key (supports dotted paths).
- **isComponentAvailable** (`(type: string) => boolean`): Check if a component type is registered in the renderer.

#### type `NodeIdGenerator`

Generates unique layout node IDs for a single plan invocation.

```ts
type NodeIdGenerator = (prefix: string) => string;
```

#### type `ComponentTreeNode`

Component document tree node — runtime shape is wider than generated `AnyComponent`.

```ts
type ComponentTreeNode = Record<string, unknown> & {
    component: string;
};
```

#### type `LayoutHostLandmarkRole`

```ts
type LayoutHostLandmarkRole = 'main' | 'navigation' | 'complementary';
```

#### type `UiGraphRoutePolicyA11yProjection`

Route-policy a11y metadata copied from policy plus projection-only suppression.

```ts
type UiGraphRoutePolicyA11yProjection = NonNullable<UiGraphPolicyDocument['routePolicies'][number]['a11y']> & {
    landmarkLabel?: string;
    landmarkSuppressed?: boolean;
};
```

## `fillUiParams(template: string, params?: Record<string, string | number>): string`

Substitute `{{$name}}` in `template` with `params[name]`, literally — no FEL, no expression evaluation.
A placeholder with no matching param is left as-is, so a caller can partially fill a template.

## `UI_STRINGS: {
    readonly 'select.placeholder': "Select…";
    readonly 'select.clearSelection': "Clear selection";
    readonly 'select.selectedValues': "Selected values";
    readonly 'select.selectAll': "Select All";
    readonly 'repeat.add': "Add {{$label}}";
    readonly 'repeat.remove': "Remove {{$label}}";
    readonly 'repeat.row': "{{$label}} {{$index}}";
    readonly 'repeat.rowOf': "{{$label}} {{$index}} of {{$total}}";
    readonly 'repeat.rowNamed': "{{$label}} of {{$total}}";
    readonly 'wizard.next': "Next";
    readonly 'wizard.nextStep': "Next step";
    readonly 'wizard.previous': "Previous";
    readonly 'wizard.previousStep': "Previous step";
    readonly 'wizard.skip': "Skip";
    readonly 'wizard.skipStep': "Skip this step";
    readonly 'wizard.submit': "Submit";
    readonly 'wizard.submitForm': "Submit form";
    readonly 'wizard.steps': "Form steps";
    readonly 'wizard.progress': "Form progress";
    readonly 'wizard.step': "Step";
    readonly 'wizard.collapseNavigation': "Collapse navigation";
    readonly 'wizard.otherItems': "Additional items";
    readonly 'modal.close': "Close";
    readonly 'alert.dismiss': "Dismiss";
    readonly 'validationSummary.heading': "Please correct the following";
    readonly 'date.format': "MM/DD/YYYY";
    readonly 'characterCount.limit': "You can enter up to {{$max}} characters";
    readonly 'characterCount.allowed': "{{$max}} characters allowed";
    readonly 'characterCount.left': "{{$count}} characters left";
    readonly 'characterCount.leftOne': "1 character left";
    readonly 'characterCount.over': "{{$count}} characters over limit";
    readonly 'characterCount.overOne': "1 character over limit";
    readonly 'signature.clear': "Clear";
    readonly 'signature.canvas': "Signature canvas. Use the Clear button to reset.";
    readonly 'money.amount': "Amount";
    readonly 'money.currency': "Currency code";
    readonly 'fieldHelp.label': "Help me answer this question";
    readonly 'screener.continue': "Continue";
    readonly 'screener.required': "Required";
    readonly 'screener.back': "Back to screening";
    readonly 'dataTable.addRow': "Add Row";
    readonly 'dataTable.remove': "Remove";
    readonly 'dataTable.removeRow': "Remove row {{$index}}";
    readonly 'dataTable.actions': "Actions";
    readonly 'wizard.stepTitle': "Step {{$index}}";
    readonly 'wizard.stepStatus': "Step {{$index}} of {{$total}}: {{$title}}";
    readonly 'wizard.finalStepStatus': "Step {{$index}} of {{$total}}: {{$title}} — final step";
    readonly 'wizard.stepAnnouncement': "{{$title}}. Step {{$index}} of {{$total}}.";
    readonly 'wizard.finalStepAnnouncement': "{{$title}}. Next will submit the form.";
    readonly 'wizard.expandNavigation': "Expand navigation";
    readonly 'select.loadingOptions': "Loading options...";
    readonly 'select.remoteFallback': "Remote options unavailable; using fallback options.";
    readonly 'select.remoteFailed': "Failed to load options.";
    readonly 'modal.open': "Open";
    readonly 'fileUpload.dropzone': "Drop files here or click to browse";
    readonly 'fileUpload.browse': "Upload a file";
    readonly 'fileUpload.attachedList': "Files you have attached";
    readonly 'fileUpload.pendingList': "Pending file activity";
    readonly 'fileUpload.remove': "Remove {{$filename}}";
    readonly 'fileUpload.dismissError': "Dismiss error for {{$filename}}";
    readonly 'fileUpload.uploading': "Uploading...";
    readonly 'fileUpload.uploadProgress': "Uploading {{$percent}}%";
    readonly 'fileUpload.deferredLibrary': "Saving to your document library is not yet available here.";
    readonly 'fileUpload.cameraCapture': "Camera capture";
    readonly 'fileUpload.cameraPreview': "Camera preview";
    readonly 'fileUpload.captureImage': "Capture image";
    readonly 'fileUpload.closeCamera': "Close camera";
    readonly 'fileUpload.useCamera': "Use camera";
    readonly 'fileUpload.cameraUnavailable': "Camera capture is not available in this browser.";
    readonly 'fileUpload.cameraOpenFailed': "We could not open the camera. Choose a file instead.";
    readonly 'fileUpload.cameraCaptureFailed': "We could not capture an image. Choose a file instead.";
    readonly 'fileUpload.imagesWaitingOne': "{{$count}} image waiting for review.";
    readonly 'fileUpload.imagesWaitingMany': "{{$count}} images waiting for review.";
    readonly 'fileUpload.imageReview': "Image review before upload";
    readonly 'fileUpload.legibilityWarning': "This image may be hard to read. Check focus, lighting, and glare before uploading.";
    readonly 'fileUpload.redactionSurface': "Draw boxes over information you want to redact";
    readonly 'fileUpload.previewImage': "Preview before upload";
    readonly 'fileUpload.addRedaction': "Add redaction box";
    readonly 'fileUpload.detectPageEdges': "Detect page edges";
    readonly 'fileUpload.clearRedactions': "Clear redactions";
    readonly 'fileUpload.uploadImage': "Upload image";
    readonly 'fileUpload.cancel': "Cancel";
    readonly 'fileUpload.browseMultiple': "Upload files";
    readonly 'fileUpload.dropzoneMultiple': "Drop files here or click to browse";
    readonly 'fileUpload.attachedOne': "{{$count}} file attached";
    readonly 'fileUpload.attachedMany': "{{$count}} files attached";
    readonly 'fileUpload.fileTooLarge': "\"{{$filename}}\" is larger than the upload limit of {{$limit}}.";
    readonly 'fileUpload.errorTooLarge': "That file is larger than the upload limit. Try a smaller file.";
    readonly 'fileUpload.errorMimeRejected': "That file type is not accepted here.";
    readonly 'fileUpload.errorNetwork': "We could not reach the upload service. Check your connection and try again.";
    readonly 'fileUpload.errorUnavailable': "File upload is not available on this site.";
    readonly 'fileUpload.errorUnknown': "We could not upload your file. Try again.";
    readonly 'fileUpload.imagePrepareFailed': "We could not prepare that image. Choose the file again.";
    readonly 'fileUpload.edgeCleanupFailed': "We could not clean up the image edges. You can still upload it.";
    readonly 'fileUpload.singleFileOnly': "Only one file can be uploaded here.";
    readonly 'validationSummary.fixOne': "Please fix this error before continuing:";
    readonly 'validationSummary.fixMany': "Please fix these {{$count}} errors before continuing:";
    readonly 'validationSummary.reviewOne': "Please review this warning before continuing:";
    readonly 'validationSummary.reviewMany': "Please review these {{$count}} warnings before continuing:";
    readonly 'validationSummary.review': "Please review the following before continuing:";
    readonly 'validationSummary.errorCountOne': "There is 1 error on this form.";
    readonly 'validationSummary.errorCount': "There are {{$count}} errors on this form.";
    readonly 'validationSummary.issueCountOne': "There is 1 issue to review on this form.";
    readonly 'validationSummary.issueCount': "There are {{$count}} issues to review on this form.";
    readonly 'validationSummary.row': "{{$label}}: {{$message}}";
    readonly 'action.submit': "Submit";
    readonly 'action.inProgress': "In progress.";
    readonly 'action.completed': "Completed";
    readonly 'action.blocked': "Blocked";
    readonly 'action.failed': "Failed";
    readonly 'action.deferred': "Deferred";
    readonly 'action.unresolved': "Unresolved";
    readonly 'action.status': "{{$status}}.";
    readonly 'action.statusReason': "{{$status}}: {{$reason}}";
    readonly 'draft.saveUnconfirmed': "Saving could not be confirmed. Keep this page open.";
    readonly 'screener.submit': "Check Eligibility";
    readonly 'screener.answerOne': "Please answer at least one question";
    readonly 'assist.filled': "{{$label}} filled by your assistant";
    readonly 'localPreview.preview': "Local preview";
    readonly 'localPreview.draftRestored': "Draft restored";
    readonly 'form.settings': "Form settings";
    readonly 'form.language': "Language";
    readonly 'form.languageSaveFailed': "The language change could not be saved. Try again.";
    readonly 'receipt.answersReceived': "Answers received";
    readonly 'receipt.submissionId': "Submission ID";
    readonly 'receipt.pendingFilingAndSigning': "Case filing and signing are not yet confirmed.";
    readonly 'receipt.keepRecord': "Keep this record";
    readonly 'receipt.printInstruction': "Print this confirmation, then clear saved access before leaving.";
    readonly 'receipt.print': "Print confirmation";
    readonly 'receipt.clear': "Clear saved access";
    readonly 'receipt.clearing': "Clearing...";
    readonly 'form.fields': "Form fields";
    readonly 'draft.versionChangedTitle': "This saved draft uses a different form version";
    readonly 'draft.versionChanged': "This draft was saved with form version {{$version}}. Start again with the current form to continue.";
    readonly 'draft.startCurrent': "Clear saved access and start again";
    readonly 'draft.startingCurrent': "Starting again...";
    readonly 'draft.startCurrentFailed': "Saved access could not be cleared. Try again.";
    readonly 'draft.browserAccessNotice': "Starting again removes saved access to this draft from this browser. Other saved drafts stay available.";
    readonly 'receipt.clearedTitle': "Saved access cleared";
    readonly 'receipt.clearedDetail': "This browser no longer has saved access to this draft.";
    readonly 'screener.yes': "Yes";
    readonly 'screener.no': "No";
    readonly 'screener.titleDefault': "Eligibility Check";
    readonly 'screener.externalDefault': "Not Eligible";
    readonly 'screener.restart': "Start Over";
    readonly 'screener.noMatchTitle': "No matching route";
    readonly 'screener.noMatchBody': "No matching eligibility route was found.";
    readonly 'screener.requiredMessage': "{{$label}} is required";
    readonly 'screener.answerRequired': "{{$label}} needs an answer";
    readonly 'screener.completionFailed': "We could not continue. Review your answers and try again.";
    readonly 'screener.localeFailed': "The screening language could not be loaded.";
    readonly 'screener.translationWarning': "Some screening text could not be translated.";
}`

English default for every closed `$ui.<ChromeStringKey>` suffix (Locale spec §3.1.10). One entry per
key the schema's `ChromeStringKey` enum admits — kept one-for-one by
`packages/formspec-layout/tests/ui-strings.test.ts`, which reads `schemas/locale.schema.json` directly.
A template's `{{$name}}` placeholders are renderer-supplied literal parameters (label, index, total,
count, max, status, reason, message, filename, limit, percent) filled by {@link fillUiParams} — never FEL, never the form scope.

#### type `ChromeStringKey`

Closed suffix set for `$ui.<ChromeStringKey>` (Locale spec §3.1.10), one-for-one with the schema enum.

```ts
type ChromeStringKey = keyof typeof UI_STRINGS;
```

## `validationResultPath(result: ValidationResult): string`

The path a finding names: its source when it has one, else its path.

## `readValidationSummaryRows(comp: ValidationSummaryComp, source: ValidationSummarySource, options: {
    showFieldErrorsByDefault: boolean;
    path?: (result: ValidationResult) => string;
}): ValidationSummaryRow[]`

The rows a ValidationSummary shows now. Empty while the component's gate is closed (`mode: "submit"`
before a submit, `continuous` before a submit or a touch). `showFieldErrorsByDefault` is the renderer's
default for a component that does not say: the default look lists field findings, USWDS lists only
form-level ones unless asked, as its reference pattern does.

#### interface `ValidationSummaryComp`

The ValidationSummary component's own props (component spec), as the planner carries them.

- **source** (`'live' | 'submit'`): `live` reads the engine's validation as it changes; `submit` reads the latest submit's findings.
- **mode** (`'continuous' | 'submit'`): With `source: live`: `continuous` shows as soon as anything is touched, `submit` waits for a submit.
- **showFieldErrors** (`boolean`): Whether field-level findings join the form-level (shape) ones. Each renderer has its own default.
- **jumpLinks** (`boolean`): Whether each field row links to its field.
- **dedupe** (`boolean`): Whether one finding repeated for a field shows once. Default true.

#### interface `ValidationSummarySource`

What a summary reads from the form it sits in. Each renderer supplies this from its own engine, signals
and DOM; nothing here is DOM, so the same rows come out of the web component, its adapters and React.

- **submitted** (`ValidationResult[] | null`): Findings of the latest submit; null before the first submit.
- **touched** (`boolean`): Whether the respondent has touched anything — what opens a `continuous` summary before a submit.

##### `live(): ValidationResult[]`

The live validation report's findings.

##### `message(result: ValidationResult): string`

The message the field itself shows for a finding (the engine's Locale validation-message cascade).

##### `field(path: string): {
        label: string;
        controlId: string | null;
    } | null`

The field a path names, in the words the field shows: its live label (Locale-resolved, `{{}}`
interpolated) and its control's id — the id a fragment link lands on. Null when no field has the path.

##### `jumpable(path: string): boolean`

Whether a jump to this field can land now — a renderer's own probe. Absent, a field that exists can.

##### `chrome(key: ChromeStringKey, params?: Record<string, string | number>): string`

Renderer chrome (`$ui.<key>`), in the active Locale.

#### interface `ValidationSummaryRow`

- **path** (`string`): The path the finding names; empty for a form-level finding.
- **message** (`string`): The message the field itself shows.
- **label** (`string | null`): The field's live label; null for a form-level finding.
- **text** (`string`): The row as the Locale writes it (`$ui.validationSummary.row`), or the message alone for a form-level finding.
- **jumpPath** (`string | null`): The field a row jumps to, when the component asks for jump links and the target can take the jump.
- **jumpHref** (`string | null`): `#<control id>` — the row is a link to a place on the page, which is what a screen reader calls it and
what a `<button>` cannot flow as; null when the field has no control to name.

