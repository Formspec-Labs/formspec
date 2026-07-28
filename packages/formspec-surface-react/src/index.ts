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
  type SurfaceAppModel,
  type SurfaceAppProps,
  type SurfaceNavProps,
  type UseSurfaceAppInput,
} from './SurfaceApp.js';

export { SurfaceRouteView, type SurfaceRouteViewProps } from './SurfaceRoute.js';
export {
  SurfaceSlot,
  SurfaceSlotFrame,
  rendersOwnHeading,
  type SurfaceSlotProps,
} from './SurfaceSlot.js';
export { SurfaceTransitions, type SurfaceTransitionsProps } from './SurfaceTransitions.js';
export { Heading, nextLevel, type HeadingProps } from './heading.js';

export type {
  SurfaceWidget,
  SurfaceWidgetDataResolver,
  SurfaceWidgetModule,
  SurfaceWidgetProps,
  SurfaceWidgetRouteContext,
} from './widget-api.js';

export {
  CeremonyFrame,
  IntakeBanner,
  QueueTable,
  ReceiptPanel,
  STARTER_WIDGETS,
  WidgetEmptyState,
  starterWidgetModule,
  type CeremonyFrameConfig,
  type IntakeBannerConfig,
  type QueueColumn,
  type QueueRow,
  type QueueTableConfig,
  type QueueTableData,
  type ReceiptFact,
  type ReceiptPanelData,
} from './widgets/index.js';
