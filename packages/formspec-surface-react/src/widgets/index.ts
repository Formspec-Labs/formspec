/**
 * @filedesc The starter widget set, and the module that publishes it.
 *
 * The focused v10 widgets remain: a lead-in banner, signing frame, receipt
 * panel, and operator queue. `StructuredPanel` adds the generic data-only
 * primitive: authored JSON selects common information blocks and mapped
 * actions without adding product-specific React.
 *
 * ## The names, and which vocabulary they are in
 *
 * The keys of {@link STARTER_WIDGETS} are `widgetShape.widgetName` values — the
 * name a Surface `module-widget` binding writes, which the schema leaves
 * unpatterned (ADR 0160 §2.4). They are NOT `RegistryEntry.name` contribution
 * ids and NOT Theme's `CustomWidgetName`. `@formspec-org/surface`'s
 * `widgetContributionFor` maps between the first two; nothing here should.
 *
 * ## Rebinding
 *
 * {@link starterWidgetModule} takes the module id, so the same components can be
 * published under whichever module a bundle declares. A tenant that wants its
 * own banner ships its own module and its own component; a tenant that wants the
 * platform's binds this one. Both go through the same seam.
 */
import type { SurfaceWidget, SurfaceWidgetModule } from '../widget-api.js';
import { MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES } from '../widget-state.js';
import { IntakeBanner } from './intake-banner.js';
import { CeremonyFrame } from './ceremony-frame.js';
import { ReceiptPanel } from './receipt-panel.js';
import { QueueTable } from './queue-table.js';
import { StructuredPanel } from './structured-panel.js';

export { IntakeBanner } from './intake-banner.js';
export { CeremonyFrame } from './ceremony-frame.js';
export { ReceiptPanel } from './receipt-panel.js';
export { QueueTable } from './queue-table.js';
export { StructuredPanel, readStructuredPanelPath } from './structured-panel.js';
export { WidgetEmptyState } from './empty-state.js';
export type { IntakeBannerConfig } from './intake-banner.js';
export type { CeremonyFrameConfig } from './ceremony-frame.js';
export type { ReceiptFact, ReceiptPanelData } from './receipt-panel.js';
export type {
  QueueColumn,
  QueueRow,
  QueueTableActionPayloadConfig,
  QueueTableActionPayloadSelector,
  QueueTableConfig,
  QueueTableData,
  QueueTableRowActionConfig,
} from './queue-table.js';
export type {
  StructuredKeyValueBlockConfig,
  StructuredKeyValueItemConfig,
  StructuredListBlockConfig,
  StructuredMetricBlockConfig,
  StructuredActionConfirmationConfig,
  StructuredActionPayloadConfig,
  StructuredActionPayloadSelector,
  StructuredPanelActionConfig,
  StructuredPanelBlockConfig,
  StructuredPanelConfig,
  StructuredProgressBlockConfig,
  StructuredTableBlockConfig,
  StructuredTableColumnConfig,
  StructuredTableRowActionConfig,
} from './structured-panel.js';

/**
 * `widgetShape.widgetName` → component, for the starter set.
 *
 * The `x-` prefixed spellings are the names the surface-render-v10 bundle
 * authors, kept so a signed bundle binds without re-signing. The bare spellings
 * are the same components under names a new module would more naturally write —
 * the schema permits both, since this field carries no pattern.
 */
export const STARTER_WIDGETS: Readonly<Record<string, SurfaceWidget>> = {
  'x-intake-banner': IntakeBanner,
  'x-ceremony-frame': CeremonyFrame,
  'x-receipt-panel': ReceiptPanel,
  'x-queue-panel': QueueTable,
  'x-structured-panel': StructuredPanel,
  IntakeBanner,
  CeremonyFrame,
  ReceiptPanel,
  QueueTable,
  StructuredPanel,
};

export const STRUCTURED_PANEL_DELIVERY_CONTRACT_ID =
  '@formspec-org/surface-react/StructuredPanel@0.1';
export const QUEUE_TABLE_DELIVERY_CONTRACT_ID =
  '@formspec-org/surface-react/QueueTable@0.1';
export const RECEIPT_PANEL_DELIVERY_CONTRACT_ID =
  '@formspec-org/surface-react/ReceiptPanel@0.1';
export const CEREMONY_FRAME_DELIVERY_CONTRACT_ID =
  '@formspec-org/surface-react/CeremonyFrame@0.1';

export const STRUCTURED_PANEL_RENDERED_CONFIG_NODES = [
  { pointerPattern: '', kind: 'structured-panel' },
  { pointerPattern: '/blocks/*', kind: 'structured-panel-block' },
  { pointerPattern: '/blocks/*/items/*', kind: 'structured-panel-field' },
  { pointerPattern: '/blocks/*/columns/*', kind: 'structured-panel-column' },
  { pointerPattern: '/blocks/*/rowAction', kind: 'structured-panel-row-action' },
  {
    pointerPattern: '/blocks/*/rowAction/confirmation',
    kind: 'structured-panel-action-confirmation',
  },
  { pointerPattern: '/actions/*', kind: 'structured-panel-action' },
  ...MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES,
] as const;

export const QUEUE_TABLE_RENDERED_CONFIG_NODES = [
  { pointerPattern: '', kind: 'queue-table' },
  { pointerPattern: '/columns/*', kind: 'queue-table-column' },
  { pointerPattern: '/rowAction', kind: 'queue-table-row-action' },
] as const;

export const RECEIPT_PANEL_RENDERED_CONFIG_NODES = [
  { pointerPattern: '', kind: 'receipt-panel' },
] as const;

export const CEREMONY_FRAME_RENDERED_CONFIG_NODES = [
  { pointerPattern: '', kind: 'ceremony-frame' },
] as const;

export function starterWidgetModule(moduleId: string): SurfaceWidgetModule {
  const contract = (
    deliveryContractId: string,
    renderedConfigNodes: readonly { pointerPattern: string; kind: string }[],
  ) => ({
    deliveryContractId,
    registryEntryVersion: '0.1.0',
    renderedConfigNodes,
  });
  const structuredPanelContract = contract(
    STRUCTURED_PANEL_DELIVERY_CONTRACT_ID,
    STRUCTURED_PANEL_RENDERED_CONFIG_NODES,
  );
  const queueTableContract = contract(
    QUEUE_TABLE_DELIVERY_CONTRACT_ID,
    QUEUE_TABLE_RENDERED_CONFIG_NODES,
  );
  const receiptPanelContract = contract(
    RECEIPT_PANEL_DELIVERY_CONTRACT_ID,
    RECEIPT_PANEL_RENDERED_CONFIG_NODES,
  );
  const ceremonyFrameContract = contract(
    CEREMONY_FRAME_DELIVERY_CONTRACT_ID,
    CEREMONY_FRAME_RENDERED_CONFIG_NODES,
  );
  return {
    moduleId,
    widgets: STARTER_WIDGETS,
    contracts: {
      StructuredPanel: structuredPanelContract,
      'x-structured-panel': structuredPanelContract,
      QueueTable: queueTableContract,
      'x-queue-panel': queueTableContract,
      ReceiptPanel: receiptPanelContract,
      'x-receipt-panel': receiptPanelContract,
      CeremonyFrame: ceremonyFrameContract,
      'x-ceremony-frame': ceremonyFrameContract,
    },
  };
}
