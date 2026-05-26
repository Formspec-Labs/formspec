/** @filedesc formspec-react — React hooks, auto-renderer, and default components for Formspec. */

// ── Hooks (re-exported from hooks barrel) ──
export { FormspecProvider, useFormspecContext, emitThemeTokens } from './context';
export type {
    ActionRefFinding,
    ActionResolution,
    FormspecProviderProps,
    FormspecContextValue,
    ResponseAction,
    ResponseActionInvoker,
    ResponseActionInvokerInput,
    ResponseActionInvokerResult,
    ResponseActionsDocument,
    SubmitResult,
} from './context';
export { useSignal } from './use-signal';
export { useField } from './use-field';
export type { UseFieldResult } from './use-field';
export { useFieldValue } from './use-field-value';
export type { UseFieldValueResult } from './use-field-value';
export { useFieldError } from './use-field-error';
export { useForm } from './use-form';
export type { UseFormResult, SubmitOptions } from './use-form';
export { useWhen } from './use-when';
export { useRepeatCount } from './use-repeat-count';
export { useLocale } from './use-locale';
export type { UseLocaleResult } from './use-locale';
export { useExternalValidation } from './use-external-validation';
export type { UseExternalValidationResult, ExternalValidationEntry } from './use-external-validation';

// ── Parity hooks ──
export { useSubmitPending } from './use-submit-pending';
export type { UseSubmitPendingResult } from './use-submit-pending';
export { useDiagnostics } from './use-diagnostics';
export type { UseDiagnosticsResult } from './use-diagnostics';
export { useReplay } from './use-replay';
export type { UseReplayResult, ReplayEvent, ReplayApplyResult, ReplayResult } from './use-replay';
export { useFocusField } from './use-focus-field';
export type { UseFocusFieldResult } from './use-focus-field';
export { useRuntimeContext } from './use-runtime-context';
export type { UseRuntimeContextResult, RuntimeContext } from './use-runtime-context';

// ── Component map types ──
export type { FieldComponentProps, LayoutComponentProps, DisplayComponentProps, ComponentMap } from './component-map';

// ── Auto-renderer ──
export { FormspecForm } from './renderer';
export type { FormspecFormProps } from './renderer';
export { FormspecNode } from './node-renderer';
export { IssuerChromeSlot, parseQueryIssuerOverride } from './issuer';
export type { IssuerChromeSlotProps } from './issuer';
export {
    componentGraphIdentityAttrs,
    projectionMetadataAttrs,
    uiGraphRoutePolicyAttrs,
} from './projection-metadata';
export type { ProjectionMetadataAttrs } from './projection-metadata';

// ── Screener ──
export { FormspecScreener, useScreener } from './screener';
export type {
    FormspecScreenerProps,
    UseScreenerResult,
    UseScreenerOptions,
    ScreenerRoute,
    ScreenerRouteType,
    ScreenerStateSnapshot,
} from './screener';

// ── Default components (for composition / override bases) ──
export { DefaultField } from './defaults/fields/default-field';
export { DefaultLayout } from './defaults/layout/default-layout';
export { Wizard } from './defaults/layout/wizard';
export { Tabs } from './defaults/layout/tabs';
export { ValidationSummary } from './validation-summary';
export type { ValidationSummaryProps } from './validation-summary';

// ── Default theme ──
import { buildPlatformTheme } from '@formspec-org/layout';
export const defaultTheme = buildPlatformTheme();
