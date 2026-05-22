# formspec-webcomponent

`<formspec-render>` is a custom element that binds a `FormEngine` to the DOM. It ships 33 schema-defined built-in components, a plugin registry, a 5-level theme cascade, reactive ARIA attributes, and responsive breakpoint support.

## Install

```bash
npm install formspec-webcomponent
```

The package is ESM-only. It requires `formspec-engine` and `formspec-layout` as peer dependencies. Runtime imports use **`formspec-engine/render`** and **`formspec-engine/init-formspec-engine`** so the custom element does not pull the full engine `fel-api` / tools JS glue graph.

## Quick Start

```js
import { FormspecRender } from 'formspec-webcomponent';
import 'formspec-webcomponent/formspec-default.css';

customElements.define('formspec-render', FormspecRender);

const el = document.createElement('formspec-render');
document.body.appendChild(el);

// Set registryDocuments BEFORE definition — the engine is created on `set definition`.
el.registryDocuments = myRegistryDoc;
el.responseActionsDocument = myResponseActionsDoc;
el.definition = myDefinition;
el.componentDocument = myComponentDoc;
el.themeDocument = myTheme;
```

Import `formspec-default.css` when you use the built-in renderer’s field styling; it now includes the structural layout rules as well. Import `formspec-layout.css` only when you want structural layout primitives without the default visual skin, such as for a custom adapter or utility-first design system. Both CSS files are canonically owned by `@formspec-org/layout` and re-exported here for compatibility.

The element is exported but not auto-registered. Call `customElements.define()` with your preferred tag name.

## Properties

| Property | Type | Description |
|---|---|---|
| `definition` | `object` | Formspec definition JSON. Creates a new `FormEngine` and schedules a render. |
| `componentDocument` | `object` | Component document JSON (layout tree, tokens, breakpoints). Schedules a render. |
| `responseActionsDocument` | `object \| null` | Response Actions document used to resolve `ActionButton.actionRef`. Unresolved action buttons are inert and emit `formspec-action-finding`. |
| `themeDocument` | `ThemeDocument \| null` | Theme document. Loads and unloads external stylesheets and schedules a render. |
| `registryDocuments` | `object \| object[]` | One or more extension registry documents. Builds an internal extension-name-to-entry map. **Set this before `definition`** — the engine reads registry entries at construction time. |

Setting any property schedules a coalesced re-render via microtask.

## Methods

```ts
// Engine access
getEngine(): FormEngine | null

// Diagnostics
getDiagnosticsSnapshot(options?: { mode?: 'continuous' | 'submit' }): object | null

// Replay
applyReplayEvent(event: object): { ok: boolean; event: object; error?: string }
replay(events: object[], options?: { stopOnError?: boolean }): { applied: number; results: object[]; errors: object[] }

// Runtime context (inject `now`, user metadata, etc.)
setRuntimeContext(context: object): void

// Validation and submission
touchAllFields(): void
submit(options?: { mode?: 'continuous' | 'submit'; emitEvent?: boolean }): { response: object; validationReport: object } | null
resolveActionRef(actionRef: string, nodeId?: string): ActionResolution
invokeAction(actionRef: string, nodeId?: string): { response: object; validationReport: object } | null
resolveValidationTarget(resultOrPath: any): ValidationTargetMetadata

// Field focus
focusField(path: string): boolean

// Submit pending state
setSubmitPending(pending: boolean): void
isSubmitPending(): boolean

// Wizard navigation
goToWizardStep(index: number): boolean

// Screener
getScreenerState(): ScreenerStateSnapshot
getScreenerRoute(): ScreenerRoute | null
skipScreener(): void
restartScreener(): void

// Force synchronous re-render
render(): void
```

## Events

All events bubble and are composed.

| Event | When | `detail` |
|---|---|---|
| `formspec-submit` | `submit()` called with `emitEvent !== false`, or an invoked Action declares a `hostEvent` effect with `eventName: "formspec-submit"` | `{ response, validationReport }` |
| `formspec-action-finding` | `ActionButton.actionRef` is missing, unresolved, or no Response Actions document is loaded | `{ finding: { code: "COMP-REFERENTIAL-INTEGRITY", severity: "error", kind: "actionRef", ... } }` |
| `formspec-submit-pending-change` | Submit pending state toggles | `{ pending: boolean }` |
| `formspec-screener-state-change` | Screener state changes (definition set, skip, restart, route selected) | `{ hasScreener, completed, routeType, route, reason }` |
| `formspec-screener-route` | Screener evaluates a route | `{ route, answers, routeType, isInternal }` |
| `formspec-page-change` | Wizard navigates to a step | `{ index, total, title }` |

## Component Registry

All 33 built-in components register automatically on import. Add custom components by registering a plugin on the global registry singleton.

```js
import { globalRegistry } from 'formspec-webcomponent';

globalRegistry.register({
  type: 'MyWidget',
  render(comp, parent, ctx) {
    const div = document.createElement('div');
    div.textContent = comp.props?.label ?? 'Hello';
    parent.appendChild(div);
  },
});
```

Each plugin implements `ComponentPlugin`:

```ts
interface ComponentPlugin {
  type: string;
  render(comp: any, parent: HTMLElement, ctx: RenderContext): void;
}
```

`RenderContext` provides engine access, path resolution, theme helpers, signal cleanup tracking, and recursive child rendering. See [`src/types.ts`](src/types.ts) for the full interface.

### Built-in Components

| Category | Components |
|---|---|
| **Layout** (9) | Section, Stack, Grid, Divider, Collapsible, Panel, Accordion, Modal, Popover |
| **Input** (12) | TextInput, NumberInput, Select, Toggle, DatePicker, RadioGroup, CheckboxGroup, Slider, Rating, FileUpload, Signature, MoneyInput |
| **Display** (8) | Heading, Text, Card, Alert, Badge, ProgressBar, Summary, ValidationSummary |
| **Interactive** (2) | Tabs, ActionButton |
| **Special** (2) | ConditionalGroup, DataTable |

## Render Adapters

Input components use a **headless behavior/adapter architecture** (see [ADR 0046](../../thoughts/archive/adr/0046-headless-component-adapters.md)). Each component is split into:

- **Behavior hook** — owns reactive signal wiring, value coercion, ARIA state management, touched tracking, and validation display. Never creates DOM.
- **Render adapter** — owns DOM structure and CSS class names. Never imports `@preact/signals-core`. Calls `behavior.bind(refs)` after building DOM to wire everything up.

The built-in **default adapter** reproduces the standard Formspec DOM. Design-system adapters can provide structurally different markup while reusing the same behavior hooks.

### Registering a Custom Adapter

```js
import { globalRegistry } from 'formspec-webcomponent';

globalRegistry.registerAdapter({
  name: 'my-design-system',
  components: {
    TextInput: (behavior, parent, actx) => {
      // Build your own DOM structure
      const root = document.createElement('div');
      root.className = 'my-field';

      const label = document.createElement('label');
      label.textContent = behavior.label;
      root.appendChild(label);

      const input = document.createElement('input');
      input.id = behavior.id;
      root.appendChild(input);

      const error = document.createElement('div');
      root.appendChild(error);

      parent.appendChild(root);

      // bind() wires ALL reactive behavior — adapter does NOT register event listeners
      const dispose = behavior.bind({ root, label, control: input, error });
      actx.onDispose(dispose);
    },
    // ... other components. Missing entries fall back to the default adapter.
  },
});

// Activate globally
globalRegistry.setAdapter('my-design-system');
```

Per-form override is also available:

```js
const el = document.querySelector('formspec-render');
el.adapter = 'my-design-system';  // Override for this instance only
```

### Adapter Contract

Adapters **must**:

1. Create DOM elements and append the root to `parent`
2. Apply `behavior.presentation.cssClass` to the root element (union semantics)
3. Respect `behavior.presentation.labelPosition` (`'top'` | `'start'` | `'hidden'`)
4. Apply `behavior.presentation.accessibility` attributes (role, aria-description, aria-live)
5. Call `behavior.bind(refs)` with references to created elements
6. Register the dispose function via `actx.onDispose(dispose)`

Adapters **must not**:

- Import `@preact/signals-core` or access the engine directly
- Register event listeners for value sync, change detection, or touch tracking (`bind()` owns all event wiring)

### Exported Types for Adapter Authors

```ts
import type {
  RenderAdapter, AdapterRenderFn, AdapterContext,
  FieldBehavior, FieldRefs, ResolvedPresentationBlock,
  TextInputBehavior, NumberInputBehavior, RadioGroupBehavior,
  CheckboxGroupBehavior, SelectBehavior, ToggleBehavior,
  DatePickerBehavior, MoneyInputBehavior, SliderBehavior,
  RatingBehavior, FileUploadBehavior, SignatureBehavior,
  WizardBehavior, TabsBehavior,
} from 'formspec-webcomponent';
```

## Theme Cascade

The renderer resolves presentation through a 5-level cascade (lowest to highest priority):

1. Form-wide `formPresentation` hints in the definition
2. Per-item `presentation` hints in the definition item
3. Theme `defaults`
4. Theme `selectors` (document order; later wins)
5. Theme `items[key]` per-item overrides

Tokens (`$token.spacing.lg`) resolve from the component document and theme document, then emit as CSS custom properties (`--formspec-spacing-lg`) on the form container.

Theme documents may declare a `stylesheets` array of CSS URLs. The renderer injects `<link>` elements with ref-counting so multiple `<formspec-render>` instances sharing a theme do not duplicate loads.

## Rendering Pipeline

1. **Cleanup** — dispose all previous signal effects and remove event listeners.
2. **Breakpoints** — wire `matchMedia` listeners from `componentDocument.breakpoints`.
3. **Tokens** — emit CSS custom properties onto `.formspec-container`.
4. **Screener gate** — render the screener if one is defined and not yet completed.
5. **Plan** — call `planComponentTree()` (from `formspec-layout`) to produce a layout node tree.
6. **Emit** — walk the tree and dispatch each component to its plugin.
7. **Orchestrate** — each input plugin calls its behavior hook, resolves the active adapter, and invokes the adapter render function. The adapter builds DOM; `bind()` wires all reactive effects.

Each input component receives a fully wired field wrapper with label, hint, error display, ARIA attributes, and touch tracking driven by signals from the engine.

### Hydrating from saved or external `data`

Screener fields live in a **standalone Screener document** (`$formspecScreener`), not on the definition. Set **`element.screenerDocument = …`** before **`element.definition = …`** when you use the gate.

Use **`element.initialData = response.data`** (same shape as a Formspec response payload) **before** **`element.definition = …`**. On engine creation the element uses the screener document’s `items` to split out screener keys, applies the rest with `applyResponseDataToEngine`, and pre-fills or auto-skips the screener.

For hydration **after** the element already has a definition, call **`applyResponseDataToEngine(engine, data)`** from this package.

Fine-grained helpers (both take the **screener document** as the first argument, not the definition):

- **`extractScreenerSeedFromData(screenerDocument, data)`** — pick entries from `data` whose keys match screener item keys.
- **`omitScreenerKeysFromData(screenerDocument, data)`** — shallow copy of `data` without those keys.

You can also assign **`element.screenerSeedAnswers`** directly when you already have a seed object.

## Exports

```ts
// Element
export { FormspecRender } from './element';

// Registry
export { ComponentRegistry, globalRegistry } from './registry';

// Utilities
export { formatMoney } from './format';
export { applyResponseDataToEngine } from './hydrate-response-data';
export {
  extractScreenerSeedFromData,
  omitScreenerKeysFromData,
  normalizeScreenerSeedForItem,
  screenerAnswersSatisfyRequired,
  buildInitialScreenerAnswers,
} from './rendering/screener';

// Re-exports from formspec-layout
export { resolvePresentation, resolveWidget, interpolateParams, resolveResponsiveProps, resolveToken, getDefaultComponent };

// Types
export type { RenderContext, ComponentPlugin, ValidationTargetMetadata, ScreenerRoute, ScreenerRouteType, ScreenerStateSnapshot };
export type { ThemeDocument, PresentationBlock, ItemDescriptor, AccessibilityBlock, ThemeSelector, SelectorMatch, Tier1Hints, FormspecDataType, Page, Region, LayoutHints, StyleHints };

// Default theme
import defaultThemeJson from '@formspec-org/layout/default-theme';
export { defaultThemeJson as defaultTheme };

// Headless adapter public API
export type { RenderAdapter, AdapterRenderFn, AdapterContext };
export type { FieldBehavior, FieldRefs, ResolvedPresentationBlock, BehaviorContext };
export type { TextInputBehavior, NumberInputBehavior, RadioGroupBehavior, CheckboxGroupBehavior, SelectBehavior, ToggleBehavior };
export type { DatePickerBehavior, MoneyInputBehavior, SliderBehavior, RatingBehavior, FileUploadBehavior, SignatureBehavior };
export type { WizardBehavior, WizardRefs, WizardSidenavItemRefs, WizardProgressItemRefs, TabsBehavior, TabsRefs };
```

## Development

```bash
npm run build          # tsc + copy base CSS
npm run test           # vitest (happy-dom)
npm run test:watch     # vitest watch mode
```
