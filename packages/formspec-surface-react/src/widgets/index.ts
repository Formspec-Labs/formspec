/**
 * @filedesc The starter widget set, and the module that publishes it.
 *
 * Four widgets: a lead-in banner for an intake route, a frame for a signing act,
 * a receipt panel, and an operator queue. They are the four the
 * surface-render-v10 bundle binds, and they are also the four shapes that recur
 * across every app of this kind — which is why they ship rather than being left
 * for each tenant to rebuild.
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
import { IntakeBanner } from './intake-banner.js';
import { CeremonyFrame } from './ceremony-frame.js';
import { ReceiptPanel } from './receipt-panel.js';
import { QueueTable } from './queue-table.js';

export { IntakeBanner } from './intake-banner.js';
export { CeremonyFrame } from './ceremony-frame.js';
export { ReceiptPanel } from './receipt-panel.js';
export { QueueTable } from './queue-table.js';
export { WidgetEmptyState } from './empty-state.js';
export type { IntakeBannerConfig } from './intake-banner.js';
export type { CeremonyFrameConfig } from './ceremony-frame.js';
export type { ReceiptFact, ReceiptPanelData } from './receipt-panel.js';
export type { QueueColumn, QueueRow, QueueTableConfig, QueueTableData } from './queue-table.js';

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
  IntakeBanner,
  CeremonyFrame,
  ReceiptPanel,
  QueueTable,
};

export function starterWidgetModule(moduleId: string): SurfaceWidgetModule {
  return { moduleId, widgets: STARTER_WIDGETS };
}
