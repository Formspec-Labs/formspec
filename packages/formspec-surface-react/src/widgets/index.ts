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
import { starterWidgetContracts, type StarterWidgetContractOptions } from './starter-contract-metadata.js';
import { ResponseReview, createResponseReviewWidget, type ResponseReviewOptions } from './response-review.js';
import { IntakeBanner } from './intake-banner.js';
import { SigningCeremony } from './signing-ceremony.js';
import { CeremonyFrame } from './ceremony-frame.js';
import { ReceiptPanel } from './receipt-panel.js';
import { QueueTable } from './queue-table.js';
import { StructuredPanel } from './structured-panel.js';

export * from './response-review.js';
export { IntakeBanner } from './intake-banner.js';
export { SigningCeremony, SIGNING_CEREMONY_CONFIG_SCHEMA, SIGNING_CEREMONY_REVIEW_SCHEMA, SIGNING_CEREMONY_WIDGET_SHAPE, SIGNING_CEREMONY_DELIVERY_CONTRACT_ID, SIGNING_CEREMONY_RENDERED_CONFIG_NODES } from './signing-ceremony.js';
export type { SigningCeremonyConfig, SigningCeremonyCopy, SigningCeremonyData, SigningCeremonyDraft, SigningCeremonyResult, SigningCeremonyReview } from './signing-ceremony.js';
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
  StructuredJsonBlockConfig,
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
  StructuredTableOrderKey,
  StructuredTableBlockConfig,
  StructuredTableColumnConfig,
  StructuredTableRowActionConfig,
} from './structured-panel.js';
export { STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA, STRUCTURED_PANEL_CONFIG_SCHEMA } from './structured-panel-metadata.js';

/**
 * `widgetShape.widgetName` → component, for the starter set.
 *
 * The `x-` prefixed spellings are the names the surface-render-v10 bundle
 * authors, kept so a signed bundle binds without re-signing. The bare spellings
 * are the same components under names a new module would more naturally write —
 * the schema permits both, since this field carries no pattern.
 */
export const STARTER_WIDGETS: Readonly<Record<string, SurfaceWidget>> = {
  'x-accepted-response-review': ResponseReview,
  AcceptedResponseReview: ResponseReview,
  'x-response-review': ResponseReview,
  ResponseReview,
  'x-intake-banner': IntakeBanner,
  'x-ceremony-frame': CeremonyFrame,
  'x-signing-ceremony': SigningCeremony,
  'x-receipt-panel': ReceiptPanel,
  'x-queue-panel': QueueTable,
  'x-structured-panel': StructuredPanel,
  IntakeBanner,
  CeremonyFrame,
  SigningCeremony,
  ReceiptPanel,
  QueueTable,
  StructuredPanel,
};

export * from './starter-contract-metadata.js';

export interface StarterWidgetModuleOptions extends StarterWidgetContractOptions {
  responseReview?: ResponseReviewOptions;
}

export function starterWidgetModule(moduleId: string, options: StarterWidgetModuleOptions = {}): SurfaceWidgetModule {
  const contracts = starterWidgetContracts(options);
  const acceptedReviewMode = contracts.AcceptedResponseReview!.registryEntryVersion === '0.1.1' ? 'selected' : 'legacy';
  return {
    moduleId,
    widgets: {
      ...STARTER_WIDGETS,
      ResponseReview: createResponseReviewWidget(options.responseReview),
      'x-response-review': createResponseReviewWidget(options.responseReview),
      AcceptedResponseReview: createResponseReviewWidget(options.responseReview, acceptedReviewMode),
      'x-accepted-response-review': createResponseReviewWidget(options.responseReview, acceptedReviewMode),
    },
    contracts,
  };
}
