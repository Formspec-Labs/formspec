# formspec-layout

Layout planning and canonical baseline CSS for Formspec. Transforms definition items and component document trees into renderer-agnostic `LayoutNode` trees, and ships shared `formspec-layout.css` / `formspec-default.css` assets for renderer packages to consume.

Any renderer (web component, React, PDF, SSR) can consume the output.

## Install

```bash
npm install formspec-layout
```

## CSS assets

The package also exports two canonical CSS files:

- `@formspec-org/layout/formspec-layout.css` — structural layout primitives only
- `@formspec-org/layout/formspec-default.css` — default visual skin for the built-in DOM contract

Renderer packages can re-export these for compatibility, but `formspec-layout` is the source of truth.

## What it does

Given a Formspec definition and optional theme/component documents, the planner produces a JSON-serializable `LayoutNode` tree. It handles:

- **Theme cascade** — 5-level merge: form hints → item hints → theme defaults → selectors → per-item overrides
- **Token resolution** — `$token.space.lg` references resolved against component and theme token maps
- **Responsive merging** — active breakpoint overrides shallow-merged onto component descriptors
- **Custom component expansion** — `{param}` interpolation in component document templates, with recursion detection
- **Default widget mapping** — `dataType` → component type fallback when no theme or component doc is present
- **Page mode wrapping** — `wizard` and `tabs` page modes assembled from group items or theme page definitions
- **Repeat group marking** — template nodes flagged for renderers to stamp per instance

## Quick usage

```ts
import { planComponentTree, planDefinitionFallback } from 'formspec-layout';

const ctx = {
  items: definition.items,
  formPresentation: definition.formPresentation,
  componentDocument: myComponentDoc,  // optional
  theme: myTheme,                     // optional
  activeBreakpoint: 'md',             // optional
  findItem: (key) => /* item lookup */,
  isComponentAvailable: (type) => registry.has(type),
};

// With a component document
const tree = planComponentTree(componentDoc.tree, ctx);

// Without a component document (definition-driven fallback)
const nodes = planDefinitionFallback(definition.items, ctx);
```

## API

### `planComponentTree(tree, ctx, prefix?, customComponentStack?): LayoutNode`

Plans a component document tree node into a `LayoutNode` tree. Walks the component tree, applies responsive props, resolves tokens, expands custom components, and emits `LayoutNode` trees. Marks `when` conditions and repeat groups for the renderer.

### `planDefinitionFallback(items, ctx, prefix?): LayoutNode[]`

Fallback planner for when no component document is provided. Walks definition items, runs the theme cascade, selects default widgets, and emits `LayoutNode` arrays. Applies page mode wrapping when `formPresentation.pageMode` is `wizard` or `tabs`.

### `resolvePresentation(theme, item, tier1?): PresentationBlock`

Resolves the effective presentation block for a single item through the 5-level theme cascade. Returns a merged `PresentationBlock` with widget, label position, styles, CSS classes, and accessibility hints.

### `resolveWidget(presentation, isAvailable): string | null`

Selects the best available widget from the presentation's preference and fallback chain. Returns `null` if no registered widget matches; the caller falls back to `getDefaultComponent`.

### `resolveToken(val, componentTokens, themeTokens): any`

Resolves `$token.xxx` string references. Component tokens take precedence over theme tokens. Non-token values pass through unchanged.

### `resolveResponsiveProps(comp, activeBreakpoint): any`

Shallow-merges breakpoint overrides onto a component descriptor. Returns the original descriptor when no overrides apply.

### `interpolateParams(node, params): void`

Replaces `{param}` placeholders in a component tree node. Mutates in place. Used during custom component expansion.

### `getDefaultComponent(item): string`

Maps a definition item's `dataType` to a default component type string. Used as the final fallback when theme and component doc resolution both yield nothing.

### `widgetTokenToComponent(widget): string | null`

Converts a Tier 1 or theme widget token (`radio`, `dropdown`, `textarea`) to a concrete component type (`RadioGroup`, `Select`, `TextInput`). Accepts both spec vocabulary and legacy component IDs.

### `createNodeIdGenerator(): (prefix: string) => string`

Creates a per-plan ID generator. Pass on `PlanContext.nextId` (or use `preparePlanContext`) so concurrent plans do not share module-global state.

## LayoutNode

The planner emits a tree of `LayoutNode` objects. Every property is JSON-serializable plain data.

```ts
interface LayoutNode {
  // Identity
  id: string;          // Stable ID for diffing/keying ("stack-1", "field-3")
  component: string;   // Resolved component type: "Stack", "TextInput", "Wizard", etc.
  category: 'layout' | 'field' | 'display' | 'interactive' | 'special';

  // Visual (all tokens resolved, responsive merged)
  props: Record<string, unknown>;       // Component-specific props
  style?: Record<string, string | number>;
  cssClasses: string[];                 // Merged from theme cascade + component doc

  // Accessibility
  accessibility?: { role?: string; description?: string; liveRegion?: string };

  // Tree structure
  children: LayoutNode[];

  // Field binding (category='field' nodes only)
  bindPath?: string;      // Full path: "applicantInfo.orgName"
  fieldItem?: { key: string; label: string; hint?: string; dataType?: string };
  presentation?: PresentationBlock;
  labelPosition?: 'top' | 'start' | 'hidden';

  // Conditional rendering (deferred to renderer)
  when?: string;          // FEL expression — renderer subscribes reactively
  whenPrefix?: string;
  fallback?: string;

  // Repeat groups (deferred to renderer)
  repeatGroup?: string;
  repeatPath?: string;
  isRepeatTemplate?: boolean;  // Children are a template to stamp per instance

  // Scope
  scopeChange?: boolean;  // This node's bindPath creates a new prefix for children
}
```

### Renderer responsibilities

The planner resolves everything it can statically. Three things require runtime reactivity and are deferred to the renderer:

1. **Conditional visibility** — nodes with `when` need the renderer to subscribe to the FEL expression and show/hide the subtree.
2. **Repeat stamping** — nodes with `isRepeatTemplate` need the renderer to clone children for each instance, substituting the `[0]` index placeholder.
3. **Field binding** — nodes with `bindPath` need the renderer to wire engine signals for value, validation, required, readonly, and relevance.

## PlanContext

```ts
interface PlanContext {
  items: any[];                                    // Definition items array
  formPresentation?: any;                          // Definition-level formPresentation block
  componentDocument?: any;                         // Component document (tree, components, tokens, breakpoints)
  theme?: any;                                     // Theme document
  activeBreakpoint?: string | null;                // Active breakpoint name
  findItem: (key: string) => any | null;           // Item lookup (supports dotted paths)
  isComponentAvailable?: (type: string) => boolean; // Component registry check
}
```

## Build

```bash
npm run build   # tsc
npm run test    # vitest
```
