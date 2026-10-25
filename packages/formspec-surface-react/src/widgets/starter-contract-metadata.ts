/**
 * @filedesc React-free table of the delivery contracts the starter widget set ships.
 *
 * `starterWidgetModule` publishes exactly this table beside its components, and
 * hosts read it without loading React to state what they ship at authoring
 * time (`@formspec-org/app-graph` `HostWidgetContracts`). One table, so the
 * authored check and the runtime resolver cannot disagree.
 */
import type { WidgetRuntimeContract } from '@formspec-org/app-graph';
import {
  ACCEPTED_RESPONSE_REVIEW_DELIVERY_CONTRACT_ID,
  ACCEPTED_RESPONSE_REVIEW_RENDERED_CONFIG_NODES_V011,
  RESPONSE_REVIEW_DELIVERY_CONTRACT_ID,
  RESPONSE_REVIEW_RENDERED_CONFIG_NODES,
} from './response-review-metadata.js';
import {
  SIGNING_CEREMONY_DELIVERY_CONTRACT_ID,
  SIGNING_CEREMONY_RENDERED_CONFIG_NODES,
} from './signing-ceremony-metadata.js';

/** Registry inventory entries required by the generic shell state renderer (`widget-state.tsx`). */
export const MODULE_WIDGET_STATE_RENDERED_CONFIG_NODES = [
  { pointerPattern: '/stateViews/*', kind: 'module-widget-state-view' },
  { pointerPattern: '/stateViews/*/actions/*', kind: 'module-widget-state-action' },
] as const;

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
  {
    pointerPattern: '/actions/*/confirmation',
    kind: 'structured-panel-action-confirmation',
  },
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

/** StructuredPanel Registry entry versions the starter set ships; 0.1.0 is the default. */
export const STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS = ['0.1.0', '0.1.1', '0.1.2'] as const;
/** AcceptedResponseReview Registry entry versions the starter set ships; 0.1.0 is the default. */
export const ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS = ['0.1.0', '0.1.1'] as const;

export type StructuredPanelRegistryEntryVersion = typeof STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS[number];
export type AcceptedResponseReviewRegistryEntryVersion = typeof ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS[number];

export interface StarterWidgetContractOptions {
  /** Explicit deployment support for the maintained whole-panel props schema. */
  structuredPanelRegistryEntryVersion?: StructuredPanelRegistryEntryVersion;
  /** Explicit support for authored accepted-record field selection. */
  acceptedResponseReviewRegistryEntryVersion?: AcceptedResponseReviewRegistryEntryVersion;
}

function supported<T extends string>(versions: readonly T[], value: T | undefined, widget: string): T {
  const version = value ?? versions[0]!;
  if (!versions.includes(version)) throw new Error(`Unsupported ${widget} Registry entry version`);
  return version;
}

/** `widgetShape.widgetName` → the contract the starter module delivers under these options. */
export function starterWidgetContracts(
  options: StarterWidgetContractOptions = {},
): Record<string, WidgetRuntimeContract> {
  const acceptedReviewVersion = supported(
    ACCEPTED_RESPONSE_REVIEW_REGISTRY_ENTRY_VERSIONS,
    options.acceptedResponseReviewRegistryEntryVersion,
    'AcceptedResponseReview',
  );
  const structuredPanelVersion = supported(
    STRUCTURED_PANEL_REGISTRY_ENTRY_VERSIONS,
    options.structuredPanelRegistryEntryVersion,
    'StructuredPanel',
  );
  const contract = (
    deliveryContractId: string,
    renderedConfigNodes: readonly { pointerPattern: string; kind: string }[],
    registryEntryVersion = '0.1.0',
  ): WidgetRuntimeContract => ({ deliveryContractId, registryEntryVersion, renderedConfigNodes });
  const acceptedReview = contract(
    ACCEPTED_RESPONSE_REVIEW_DELIVERY_CONTRACT_ID,
    acceptedReviewVersion === '0.1.1' ? ACCEPTED_RESPONSE_REVIEW_RENDERED_CONFIG_NODES_V011 : RESPONSE_REVIEW_RENDERED_CONFIG_NODES,
    acceptedReviewVersion,
  );
  const responseReview = contract(RESPONSE_REVIEW_DELIVERY_CONTRACT_ID, RESPONSE_REVIEW_RENDERED_CONFIG_NODES);
  const structuredPanel = contract(STRUCTURED_PANEL_DELIVERY_CONTRACT_ID, STRUCTURED_PANEL_RENDERED_CONFIG_NODES, structuredPanelVersion);
  const queueTable = contract(QUEUE_TABLE_DELIVERY_CONTRACT_ID, QUEUE_TABLE_RENDERED_CONFIG_NODES);
  const receiptPanel = contract(RECEIPT_PANEL_DELIVERY_CONTRACT_ID, RECEIPT_PANEL_RENDERED_CONFIG_NODES);
  const signingCeremony = contract(SIGNING_CEREMONY_DELIVERY_CONTRACT_ID, SIGNING_CEREMONY_RENDERED_CONFIG_NODES);
  const ceremonyFrame = contract(CEREMONY_FRAME_DELIVERY_CONTRACT_ID, CEREMONY_FRAME_RENDERED_CONFIG_NODES);
  return {
    AcceptedResponseReview: acceptedReview,
    'x-accepted-response-review': acceptedReview,
    ResponseReview: responseReview,
    'x-response-review': responseReview,
    StructuredPanel: structuredPanel,
    'x-structured-panel': structuredPanel,
    QueueTable: queueTable,
    'x-queue-panel': queueTable,
    ReceiptPanel: receiptPanel,
    'x-receipt-panel': receiptPanel,
    SigningCeremony: signingCeremony,
    'x-signing-ceremony': signingCeremony,
    CeremonyFrame: ceremonyFrame,
    'x-ceremony-frame': ceremonyFrame,
  };
}
