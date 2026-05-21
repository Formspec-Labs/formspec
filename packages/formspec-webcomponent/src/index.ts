/** @filedesc Package entry point: registers components and re-exports public API. */
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { registerDefaultComponents } from './components';

/** Start WASM load as soon as the package is imported (FormEngine needs it before construction). */
void initFormspecEngine();
registerDefaultComponents();

/** Await before setting `definition` if you need the engine to exist synchronously (e.g. immediate `getEngine()` / `setValue`). */
export { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';

// Main class
export { FormspecRender } from './element';

// Registry
export { ComponentRegistry, globalRegistry } from './registry';

// Utilities
export { emitThemeTokens } from './styling';
export { formatMoney, formatBytes } from './format';
export { applyResponseDataToEngine } from './hydrate-response-data';
export {
    extractScreenerSeedFromData,
    omitScreenerKeysFromData,
    normalizeScreenerSeedForItem,
    screenerAnswersSatisfyRequired,
    buildInitialScreenerAnswers,
} from './rendering/screener';

// Re-exports from formspec-layout
export { resolvePresentation, resolveWidget, interpolateParams, resolveResponsiveProps, resolveToken, getDefaultComponent } from '@formspec-org/layout';
export type { ThemeDocument, PresentationBlock, ItemDescriptor, AccessibilityBlock, ThemeSelector, SelectorMatch, Tier1Hints, FormspecDataType, Page, Region, LayoutHints, StyleHints } from '@formspec-org/layout';

// Types
export type { RenderContext, ComponentPlugin, ValidationTargetMetadata, ScreenerRoute, ScreenerRouteType, ScreenerStateSnapshot } from './types';

// Default theme
import { buildPlatformTheme } from '@formspec-org/layout';
export const defaultTheme = buildPlatformTheme();

// Headless adapter public API
export type { RenderAdapter, AdapterRenderFn, AdapterContext } from './adapters/types';
export type { LayoutHostSlice } from './adapters/layout-host';
export type {
    SectionLayoutBehavior,
    StackLayoutBehavior,
    GridLayoutBehavior,
    DividerLayoutBehavior,
    CollapsibleLayoutBehavior,
    PanelLayoutBehavior,
    AccordionLayoutBehavior,
    ModalLayoutBehavior,
    PopoverLayoutBehavior,
} from './adapters/layout-behaviors';
export type { DisplayHostSlice } from './adapters/display-host';
export type { DisplayComponentBehavior } from './adapters/display-behaviors';
export { renderMarkdown } from './adapters/display-markdown';
export {
    renderDefaultHeading,
    renderDefaultText,
    renderDefaultCard,
    renderDefaultAlert,
    renderDefaultBadge,
    renderDefaultProgressBar,
    renderDefaultSummary,
    renderDefaultValidationSummary,
} from './adapters/default/display-components';
export { renderDefaultConditionalGroup, renderDefaultDataTable } from './adapters/default/special-adapters';

/** Default layout DOM builders — call from design-system adapters when falling back to canonical markup. */
export {
    renderSection as renderDefaultLayoutSection,
    renderStack as renderDefaultLayoutStack,
    renderGrid as renderDefaultLayoutGrid,
    renderDivider as renderDefaultLayoutDivider,
    renderCollapsible as renderDefaultLayoutCollapsible,
    renderPanel as renderDefaultLayoutPanel,
    renderAccordion as renderDefaultLayoutAccordion,
    renderModal as renderDefaultLayoutModal,
    renderPopover as renderDefaultLayoutPopover,
} from './adapters/default/layout';
export { createSignatureCanvas } from './adapters/signature-canvas';
export type { SignatureCanvasConfig, SignatureCanvasResult } from './adapters/signature-canvas';
export type {
    FieldBehavior, FieldRefs, ResolvedPresentationBlock, BehaviorContext, SubmitDetail,
    TextInputBehavior, NumberInputBehavior, RadioGroupBehavior,
    CheckboxGroupBehavior, SelectBehavior, ToggleBehavior,
    DatePickerBehavior, MoneyInputBehavior, SliderBehavior,
    RatingBehavior, FileUploadBehavior, SignatureBehavior,
    WizardBehavior, WizardRefs, WizardSidenavItemRefs, WizardProgressItemRefs,
    TabsBehavior, TabsRefs,
    DataTableBehavior, DataTableRefs,
} from './behaviors/types';
