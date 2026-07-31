/**
 * @filedesc `@formspec-org/surface-react` — the React binding for the Surface shell.
 *
 * `@formspec-org/surface` plans; this renders. The split is the same one
 * `formspec-react` and `formspec-webcomponent` already have, and it exists for
 * the same reason: the slot taxonomy, the route graph and the theme boundary are
 * not React facts, and a second renderer must not have to re-derive them.
 */

export {
  SurfaceApp,
  SurfaceNav,
  useBrowserLocation,
  useSurfaceApp,
  type FireTransition,
  type SurfaceTransitionOutcome,
  type SurfaceCurrentRouteState,
  type SurfaceAppModel,
  type SurfaceAppProps,
  type SurfaceNavProps,
  type UseSurfaceAppInput,
} from './SurfaceApp.js';

export { SurfaceRouteView, type SurfaceRouteViewProps } from './SurfaceRoute.js';
export {
  createSurfaceSemanticOutputScopeResolver,
  surfaceSemanticOutputSubjectRef,
  useSurfaceSemanticOutputs,
  type SurfaceSemanticOutputPairing,
  type SurfaceSemanticOutputScopeRequest,
  type SurfaceSemanticOutputScopeResolver,
} from './semantic-output.js';
export {
  SurfaceSlot,
  SurfaceSlotFrame,
  completedWidgetAction,
  createSurfaceSemanticControlScopeResolver,
  renderDefaultDefinitionForm,
  rendersOwnHeading,
  type ResolvedDefinitionFormPlan,
  type SurfaceDefinitionFormRenderer,
  type SurfaceDefinitionFormRenderInput,
  type SurfaceSemanticControlScopeRequest,
  type SurfaceSemanticControlScopeResolver,
  type SurfaceSemanticControlPairing,
  type SurfaceSlotProps,
} from './SurfaceSlot.js';
export { SurfaceTransitions, type SurfaceTransitionsProps } from './SurfaceTransitions.js';
export { Heading, nextLevel, type HeadingProps } from './heading.js';
export {
  MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES,
  ModuleWidgetStateView,
  widgetDataMatchesEmptyWhen,
  type ModuleWidgetEmptyWhen,
  type ModuleWidgetOutputStateAction,
  type ModuleWidgetRetryStateAction,
  type ModuleWidgetStateAction,
  type ModuleWidgetStateName,
  type ModuleWidgetStateViewConfig,
  type ModuleWidgetStateViewProps,
  type ModuleWidgetStateViewsConfig,
} from './widget-state.js';

export type {
  SurfaceWidget,
  SurfaceWidgetAction,
  SurfaceWidgetActionExecutor,
  SurfaceWidgetActionDetail,
  SurfaceWidgetActionEmission,
  SurfaceWidgetActionFeedbackStatus,
  SurfaceWidgetActionExecutorInput,
  SurfaceWidgetActionOutcomeKey,
  SurfaceWidgetActionOutcomeStore,
  SurfaceWidgetActionInput,
  SurfaceWidgetActionReport,
  SurfaceWidgetActionSource,
  SurfaceWidgetActionValue,
  SurfaceWidgetActionLabel,
  SurfaceWidgetStoredActionOutcome,
  SurfaceWidgetModule,
  SurfaceWidgetProps,
  SurfaceWidgetRouteContext,
} from './widget-api.js';

export {
  allocateWidgetActionInvocationId,
  admitSurfaceWidgetActionInput,
  createWidgetActionCoordinator,
  createWidgetActionDelivery,
  normalizeWidgetActionResult,
  responseActionsDocumentForAction,
  type CoordinatedWidgetActionEmission,
  type CoordinatedWidgetActionResult,
  type DeliverWidgetActionRequest,
  type EmitWidgetActionRequest,
  type SurfaceWidgetActionInputAdmission,
  type WidgetActionCoordinator,
  type WidgetActionDelivery,
} from './widget-action-runtime.js';

export {
  CeremonyFrame,
  CEREMONY_FRAME_DELIVERY_CONTRACT_ID,
  CEREMONY_FRAME_RENDERED_CONFIG_NODES,
  IntakeBanner,
  QUEUE_TABLE_DELIVERY_CONTRACT_ID,
  QUEUE_TABLE_RENDERED_CONFIG_NODES,
  QueueTable,
  RECEIPT_PANEL_DELIVERY_CONTRACT_ID,
  RECEIPT_PANEL_RENDERED_CONFIG_NODES,
  ReceiptPanel,
  StructuredPanel,
  STRUCTURED_PANEL_DELIVERY_CONTRACT_ID,
  STRUCTURED_PANEL_RENDERED_CONFIG_NODES,
  STARTER_WIDGETS,
  WidgetEmptyState,
  readStructuredPanelPath,
  starterWidgetModule,
  type CeremonyFrameConfig,
  type IntakeBannerConfig,
  type QueueColumn,
  type QueueRow,
  type QueueTableActionPayloadConfig,
  type QueueTableActionPayloadSelector,
  type QueueTableConfig,
  type QueueTableData,
  type QueueTableRowActionConfig,
  type ReceiptFact,
  type ReceiptPanelData,
  type StructuredKeyValueBlockConfig,
  type StructuredKeyValueItemConfig,
  type StructuredListBlockConfig,
  type StructuredMetricBlockConfig,
  type StructuredActionPayloadConfig,
  type StructuredActionPayloadSelector,
  type StructuredPanelActionConfig,
  type StructuredPanelBlockConfig,
  type StructuredPanelConfig,
  type StructuredProgressBlockConfig,
  type StructuredTableBlockConfig,
  type StructuredTableColumnConfig,
  type StructuredTableRowActionConfig,
} from './widgets/index.js';

export {
  executeBrowserResourceEffect,
  resolveBrowserResourceCommand,
  type BrowserDownloadResource,
  type BrowserOpenResource,
  type BrowserResourceCommand,
  type BrowserResourceEffectInput,
  type BrowserResourcePorts,
  type BrowserResourceResolution,
} from './browser-resource.js';
