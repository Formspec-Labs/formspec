/**
 * @filedesc The module-widget delivery contract, in React terms.
 *
 * The Registry has always been able to *declare* a widget — name, version,
 * status, `childrenPolicy`, `tokenSlots`, a `widgetShape.props` JSON Schema.
 * Nothing could *deliver* one. This is the delivery side: the props a widget
 * receives and the shape a module publishes.
 *
 * ## What a widget is given, and what it is deliberately not
 *
 * - `config` — the authored `binding.config`, the ONLY channel the Surface
 *   schema gives a slot for reaching a widget. Lint E604 validates it against
 *   the Registry entry's `widgetShape.props`; nothing validates it at runtime,
 *   so a widget reads it defensively.
 * - `data` — host-supplied runtime data, resolved through
 *   {@link SurfaceWidgetDataResolver}. **The bundle has no channel for this.**
 *   A queue needs applications and a receipt needs a submission, and a
 *   `module-widget` binding carries `{moduleId, widgetName, config}` and nothing
 *   else — no props channel bound to a Data Source, no query (gap ledger
 *   `widget-data-binding`). Until one exists, runtime data is a host input, and
 *   naming it as one is more honest than a widget inventing rows.
 * - `headingLevel` — where this widget's own headings sit in the page outline.
 *   A widget that hardcodes `<h2>` breaks the outline the moment it is embedded.
 * - `admitsTenantTheme` — whether the route it landed on admits tenant chrome.
 *   A widget does not decide this and cannot change it; it is told, so a widget
 *   that would otherwise paint a tenant accent can render its unbranded form.
 *
 * A widget is NOT given navigation, a submit channel, or the route table. A
 * module-supplied widget navigating the app is a module deciding the app's
 * route graph, and transitions are the shell's (`transitions.ts`).
 */
import type { ReactNode } from 'react';
import type { HeadingLevel, RouteClass, WidgetModule } from '@formspec-org/surface';

export interface SurfaceWidgetRouteContext {
  surfaceId: string;
  routeId: string;
  routeClass: RouteClass | undefined;
  /** Resolved route parameters for the current URL. */
  params: Readonly<Record<string, string>>;
}

export interface SurfaceWidgetProps {
  moduleId: string;
  /** Matches `widgetShape.widgetName` — not the contribution id. */
  widgetName: string;
  slot: { id: string; title?: string | undefined };
  route: SurfaceWidgetRouteContext;
  headingLevel: HeadingLevel;
  /** Authored `binding.config`. `{}` when the slot declares none. */
  config: Readonly<Record<string, unknown>>;
  /** Host-supplied. `undefined` when the host supplies no resolver. */
  data: unknown;
  admitsTenantTheme: boolean;
}

export type SurfaceWidget = (props: SurfaceWidgetProps) => ReactNode;

export type SurfaceWidgetModule = WidgetModule<SurfaceWidget>;

/**
 * The host's seam for runtime data. Called once per module-widget slot.
 *
 * This is deliberately a host port rather than a bundle field: adding a data
 * channel to the `module-widget` binding is a schema decision (`widget-data-binding`),
 * and a renderer inventing one would fork the vocabulary before the schema
 * settles it.
 */
export type SurfaceWidgetDataResolver = (input: {
  moduleId: string;
  widgetName: string;
  slotId: string;
  route: SurfaceWidgetRouteContext;
  config: Readonly<Record<string, unknown>>;
}) => unknown;
