/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef, Extensions, TargetDefinition, Tokens, AccessibilityBlock, Breakpoints, ThemeWidgetName } from './common.js';
/**
 * Cascade level 1 (lowest theme specificity): baseline PresentationBlock applied to every item before selectors or per-item overrides. Sets the form-wide visual baseline. Overrides Tier 1 inline presentation hints (level 0) and formPresentation globals (level -1). Overridden by selectors (level 2) and items (level 3). Merge is shallow per-property — nested objects (widgetConfig, style, accessibility) are replaced as a whole, not deep-merged. Exception: cssClass uses union semantics across all levels.
 */
export type PresentationBlock = {
  [k: string]: unknown;
} & {
  /**
   * Widget identifier — the UI control to render for this item. Built-in values use the canonical PascalCase component/widget vocabulary. Custom widgets MUST use the x- prefix and include fallback. Set to 'none' to suppress a widget inherited from a lower cascade level.
   */
  widget?: ThemeWidgetName;
  /**
   * Widget-specific configuration. Properties depend on the widget. Renderers MUST ignore unrecognized keys. Theme fallback resolution does NOT carry widgetConfig forward — each fallback widget uses its own default configuration. Component fallback carry/drop/translate policy is defined structurally in specs/ui-policy.json. Well-known configs by widget: TextInput (maxLength, inputMode, placeholder), Text (rows, maxRows, autoResize, placeholder), NumberInput (showStepper, locale, placeholder), DatePicker (format, minDate, maxDate, placeholder), Select (searchable, placeholder), CheckboxGroup (columns, maxVisible), FileUpload (accept, maxSizeMb, preview), MoneyInput (showCurrencySymbol, locale, placeholder), Slider (min, max, step, showTicks, showValue), Toggle (onLabel, offLabel), RadioGroup (direction, columns), Signature (strokeColor, height).
   */
  widgetConfig?: {
    [k: string]: unknown;
  };
  /**
   * Label placement relative to the item. 'top': label above the input (most common). 'start': label on the leading side — left in LTR locales, right in RTL locales. 'hidden': label visually hidden but MUST still be present in accessible markup for screen readers.
   */
  labelPosition?: 'top' | 'start' | 'hidden';
  /**
   * Flat style overrides as key-value pairs. Keys are renderer-interpreted style names (e.g., CSS property names in camelCase). String values may contain $token references (e.g., '$token.color.primary') which are resolved at theme-application time. Replaced as a whole during cascade merge — not deep-merged with lower levels.
   */
  style?: {
    [k: string]: string | number;
  };
  accessibility?: AccessibilityBlock;
  /**
   * Ordered list of fallback widget identifiers. When a renderer does not support the primary widget, it MUST try each fallback in order and use the first it supports. If no widget in the chain is supported, the renderer MUST use its default widget for the item's dataType. Theme fallback resolution does NOT carry widgetConfig forward — each fallback widget uses its own default configuration. Component fallback carry/drop/translate policy is defined structurally in specs/ui-policy.json. Custom widgets (x- prefixed) MUST always include a fallback chain ending with a standard widget.
   */
  fallback?: (
    | 'Section'
    | 'Stack'
    | 'Grid'
    | 'TextInput'
    | 'NumberInput'
    | 'DatePicker'
    | 'Select'
    | 'CheckboxGroup'
    | 'Toggle'
    | 'FileUpload'
    | 'Heading'
    | 'Text'
    | 'Divider'
    | 'Card'
    | 'Collapsible'
    | 'ConditionalGroup'
    | 'Tabs'
    | 'ActionButton'
    | 'Accordion'
    | 'RadioGroup'
    | 'MoneyInput'
    | 'Slider'
    | 'Rating'
    | 'Signature'
    | 'Alert'
    | 'Badge'
    | 'ProgressBar'
    | 'Summary'
    | 'ValidationSummary'
    | 'DataTable'
    | 'Panel'
    | 'Modal'
    | 'Popover'
  )[];
  /**
   * CSS class name(s) applied to matching items. UNIQUE CASCADE BEHAVIOR: unlike all other PresentationBlock properties, cssClass uses union semantics — classes accumulate across cascade levels (defaults + selectors + item overrides) with duplicates removed. Order preserved: defaults first, then selectors in document order, then item overrides. This ensures adding a class at one level does not remove classes from other levels.
   */
  cssClass?: string | string[];
};
/**
 * Criteria for which items this selector applies to. MUST contain at least one of 'type' or 'dataType'. When both are present, an item must satisfy both (AND semantics).
 */
export type SelectorMatch = {
  [k: string]: unknown;
} & {
  /**
   * Match items of this structural type. 'field': data-capture items with a dataType. 'group': container items with children, optionally repeatable. 'display': read-only content items (headings, instructions) with no data or children.
   */
  type?: 'group' | 'field' | 'display';
  /**
   * Match field items of this dataType. Only applicable to items with type 'field'. The 13 core dataTypes cover all Formspec field varieties.
   */
  dataType?:
    | 'string'
    | 'text'
    | 'integer'
    | 'decimal'
    | 'boolean'
    | 'date'
    | 'dateTime'
    | 'time'
    | 'uri'
    | 'attachment'
    | 'choice'
    | 'multiChoice'
    | 'money';
};
/**
 * Semantic token type. Tooling uses types to select appropriate editors and validate values. Types do not affect CSS custom property emission. Inlined from the retired token-registry.schema.json#/$defs/TokenType per ADR 0150 §2.3/§4.2/§10 row 9.
 *
 * This interface was referenced by `ThemeDocument`'s JSON-Schema
 * via the `definition` "TokenType".
 */
export type TokenType =
  | 'color'
  | 'dimension'
  | 'fontFamily'
  | 'fontWeight'
  | 'duration'
  | 'opacity'
  | 'shadow'
  | 'number';
/**
 * A Formspec Theme document — a sidecar JSON file that controls the visual presentation of a Formspec Definition without modifying it. A Theme binds to a Definition by URL, overrides inline Tier 1 presentation hints through a three-level cascade (defaults → selectors → item overrides), assigns widgets with typed configuration and fallback chains, defines page layout on a 12-column grid, and provides design tokens for visual consistency. Multiple Theme documents MAY target the same Definition, enabling platform-specific rendering (web, mobile, PDF, kiosk). A Theme MUST NOT affect data collection, validation, or behavioral semantics — it controls only how items are displayed.
 */
export interface ThemeDocument {
  /**
   * Theme specification version. MUST be '1.0'.
   */
  $formspecTheme: '1.0';
  /**
   * OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef (id + version, with optional publisher + lockHash for posture admission). Default-module-set behavior per ADR 0150 §4.9 preserves form-only documents — omitting modules[] is identical to declaring the core module set. Per ADR 0150 §4.3.
   */
  modules?: ModuleRef[];
  /**
   * Canonical identifier for this theme. Stable across theme versions — the pair (url, version) SHOULD be globally unique.
   */
  url?: string;
  /**
   * Version of this theme document. SemVer is RECOMMENDED. The pair (url, version) SHOULD be unique across all published theme versions.
   */
  version: string;
  /**
   * Machine-friendly short identifier for programmatic use.
   */
  name?: string;
  /**
   * Human-readable display name for the theme.
   */
  title?: string;
  /**
   * Human-readable description of the theme's purpose and target audience.
   */
  description?: string;
  targetDefinition: TargetDefinition;
  /**
   * Target rendering platform. Informational — processors that do not recognize a platform value SHOULD apply the theme regardless. Well-known values: 'web' (desktop/mobile browsers), 'mobile' (native apps), 'pdf' (PDF rendering), 'print' (print-optimized), 'kiosk' (public terminals), 'universal' (no platform assumptions, implicit default).
   */
  platform?: string;
  tokens?: Tokens;
  defaults?: PresentationBlock;
  /**
   * Cascade level 2: type/dataType-based presentation overrides. Each selector has a 'match' (criteria) and 'apply' (PresentationBlock). Selectors are evaluated in document order — all matching selectors apply, with later matches overriding earlier ones per-property. Overrides defaults (level 1); overridden by items (level 3).
   */
  selectors?: Selector[];
  /**
   * Cascade level 3 (highest theme specificity): per-item overrides keyed by the item's 'key' from the Definition. Overrides all lower cascade levels. Item keys that do not correspond to any item in the target Definition SHOULD produce a warning but MUST NOT cause failure.
   */
  items?: {
    [k: string]: PresentationBlock;
  };
  /**
   * Page layout — ordered list of pages grouping items into logical sections with a 12-column grid. When absent, the renderer walks the Definition's item tree top-to-bottom without page grouping. Items not referenced by any region on any page SHOULD be rendered after all pages in default order. The cascade (defaults/selectors/items) still applies regardless of page layout.
   */
  pages?: PageLayout[];
  breakpoints?: Breakpoints;
  extensions?: Extensions;
  /**
   * External CSS stylesheet URIs. Web renderers SHOULD load these before rendering the form. Loaded in array order — later sheets take CSS precedence over earlier sheets. Renderers MUST NOT fail if a stylesheet cannot be loaded; they SHOULD warn and continue. Non-web renderers (PDF, native) MAY ignore stylesheets. Subject to host application security policy (CSP, CORS).
   */
  stylesheets?: string[];
  /**
   * Metadata for custom tokens introduced by this theme. Follows the Token Registry category schema. Platform tokens MUST NOT be redefined here — the platform registry provides their metadata. See the Token Registry Specification for details.
   */
  tokenMeta?: {
    /**
     * Custom token categories keyed by category prefix. Each category follows the Token Registry Category shape (Category/TokenEntry/TokenType $defs inlined per ADR 0150 §2.3/§4.2/§10 row 9 — standalone token-registry.schema.json retired; Category shape preserved here for theme.tokenMeta validation. The runtime canonical token document at packages/formspec-layout/src/token-registry.json also conforms to this same Category shape per category).
     */
    categories?: {
      [k: string]: Category;
    };
  };
  /**
   * This interface was referenced by `ThemeDocument`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * A cascade level 2 rule: matches items by type and/or dataType and applies a PresentationBlock. Selectors are evaluated in document order. All matching selectors apply — later matches override earlier ones per-property (shallow merge). This enables layered styling: a broad type selector can set a baseline, and a narrower dataType selector can refine it.
 *
 * This interface was referenced by `ThemeDocument`'s JSON-Schema
 * via the `definition` "Selector".
 */
export interface Selector {
  match: SelectorMatch;
  apply: PresentationBlock;
}
/**
 * A logical page layout grouping items into a section with a title and a 12-column grid. Pages define navigation structure (wizard steps, tabs, or sections). Each page contains regions that assign Definition items to grid positions.
 *
 * This interface was referenced by `ThemeDocument`'s JSON-Schema
 * via the `definition` "PageLayout".
 */
export interface PageLayout {
  /**
   * Unique page identifier within this theme. Used for navigation and anchoring.
   */
  id: string;
  /**
   * Page title displayed in navigation controls (wizard step labels, tab headers, section headings).
   */
  title: string;
  /**
   * Optional page-level instructions or description displayed below the title.
   */
  description?: string;
  /**
   * Ordered list of regions assigning Definition items to grid positions on this page. A group key includes its entire subtree. Items not referenced by any region on any page SHOULD be rendered after all pages in default order.
   */
  regions?: Region[];
}
/**
 * Assigns a Definition item to a position on the page's 12-column grid. A region referencing a group key includes the group's entire subtree — layout within the group is controlled by the group's own Tier 1 presentation.layout, not by the page grid. A repeatable group renders all repeat instances within its region. Unknown keys SHOULD produce a warning but MUST NOT cause failure.
 *
 * This interface was referenced by `ThemeDocument`'s JSON-Schema
 * via the `definition` "Region".
 */
export interface Region {
  /**
   * Item key from the target Definition. A group key includes its entire subtree (all children and nested groups).
   */
  key: string;
  /**
   * Number of grid columns this region occupies (1–12). Default: 12 (full width). Two span-6 regions create a two-column layout.
   */
  span?: number;
  /**
   * Grid column start position (1–12). When absent, the region follows the previous region in natural flow. Use to create gaps or explicit positioning.
   */
  start?: number;
  /**
   * Breakpoint-keyed responsive overrides. Keys are breakpoint names defined in the top-level 'breakpoints' object. Each override can set span, start, or hidden for that viewport size.
   */
  responsive?: {
    [k: string]: {
      /**
       * Override column span at this breakpoint.
       */
      span?: number;
      /**
       * Override column start at this breakpoint.
       */
      start?: number;
      /**
       * Hide this region entirely at this breakpoint.
       */
      hidden?: boolean;
    };
  };
}
/**
 * A group of tokens sharing a category prefix and default type. Inlined from the retired token-registry.schema.json#/$defs/Category per ADR 0150 §2.3/§4.2/§10 row 9 — token-registry as a standalone schema folds into the unified Registry as a `token-category` contribution; the structural Category/TokenEntry/TokenType shape is preserved here so theme.tokenMeta validation and the runtime token-registry.json document continue to share the same shape.
 *
 * This interface was referenced by `ThemeDocument`'s JSON-Schema
 * via the `definition` "Category".
 */
export interface Category {
  /**
   * Human-readable description of the category.
   */
  description?: string;
  /**
   * Default token type for entries in this category. Entries may override with their own type.
   */
  type: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'opacity' | 'shadow' | 'number';
  /**
   * Prefix for dark-mode counterpart tokens. When present, each token's 'dark' field holds the default dark-mode value. The derived dark key is '<darkPrefix>.<suffix>' where suffix is the token key with the category prefix and its trailing dot removed. Only categories whose type is 'color' SHOULD declare darkPrefix.
   */
  darkPrefix?: string;
  /**
   * Token entries keyed by their full dot-delimited key. Each key MUST start with the category key followed by a dot.
   */
  tokens: {
    [k: string]: TokenEntry;
  };
}
/**
 * Metadata for a single design token. Inlined from the retired token-registry.schema.json#/$defs/TokenEntry per ADR 0150 §2.3/§4.2/§10 row 9.
 *
 * This interface was referenced by `ThemeDocument`'s JSON-Schema
 * via the `definition` "TokenEntry".
 */
export interface TokenEntry {
  /**
   * Human-readable description of the token's purpose.
   */
  description?: string;
  /**
   * Token type, overriding the category default.
   */
  type?: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'opacity' | 'shadow' | 'number';
  /**
   * Default value shipped with the platform theme.
   */
  default?: string | number;
  /**
   * Default dark-mode value. Only meaningful when the containing category declares a darkPrefix. Processors MUST ignore this field when darkPrefix is absent and SHOULD emit a warning.
   */
  dark?: string | number;
  /**
   * Example token values for documentation and tooling hints.
   */
  examples?: (string | number)[];
}
