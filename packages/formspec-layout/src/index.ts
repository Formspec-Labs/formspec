/**
 * formspec-layout — Pure layout planning utilities for Formspec.
 *
 * Provides theme cascade resolution, token resolution, responsive breakpoint
 * merging, default component mapping, and parameter interpolation. All
 * functions are pure (no DOM, no signals, no side effects beyond warnings).
 *
 * @module
 */

// Theme cascade
export {
    resolvePresentation,
    resolveWidget,
    setTailwindMerge,
} from './theme-resolver.js';
export type {
    ThemeDocument,
    PresentationBlock,
    ItemDescriptor,
    AccessibilityBlock,
    ThemeSelector,
    SelectorMatch,
    Tier1Hints,
    FormspecDataType,
    Page,
    Region,
    LayoutHints,
    StyleHints,
} from './theme-resolver.js';

// Token resolution
export { resolveToken, emitMergedThemeCssVars } from './tokens.js';

// Responsive breakpoint merging
export { resolveResponsiveProps } from './responsive.js';

// Parameter interpolation (custom component expansion)
export { interpolateParams } from './params.js';

// Default component mapping
export { getDefaultComponent } from './defaults.js';

// Widget vocabulary — re-exported from @formspec-org/types as a convenience for
// consumers that already import from @formspec-org/layout.
export {
    widgetTokenToComponent,
    KNOWN_COMPONENT_TYPES,
    SPEC_WIDGET_TO_COMPONENT,
    COMPONENT_TO_HINT,
    COMPATIBILITY_MATRIX,
} from '@formspec-org/types';

// Form presentation merge (definition + component document)
export { mergeFormPresentationForPlanning } from './form-presentation.js';

// Layout planner
export {
    planComponentTree,
    planDefinitionFallback,
    planContains,
    ensureSubmitButton,
    createNodeIdGenerator,
    preparePlanContext,
} from './planner.js';
export type { NodeIdGenerator } from './types.js';
export { resolvePageSequence } from './page-sequence.js';
export type { PageSequenceEntry } from './page-sequence.js';

// Anchored overlays (Modal / Popover positioning)
export {
    positionPopupNearTrigger,
    clearPopupFixedPosition,
    POPUP_EDGE_PADDING,
    POPUP_TRIGGER_GAP,
    MODAL_FIRST_FOCUSABLE_SELECTOR,
} from './popup-position.js';
export type { PopupPlacement } from './popup-position.js';

// Platform defaults & theme generation
export { platformDefaults, platformSelectors, buildPlatformTheme } from './platform-defaults.js';

// Types
export type { LayoutNode, PlanContext } from './types.js';
