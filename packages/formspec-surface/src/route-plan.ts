/**
 * @filedesc The route plan — one matched route, fully decided, with every
 * diagnostic the deciding produced.
 *
 * `surface-shell-spec.md` defines *route plan* as "the shell core's output for
 * one matched route: the resolved slots in order, the theme grant, the
 * transition plan, and the diagnostics." Those four were produced by three
 * separate calls a binding had to make in the right order and union itself, and
 * the shipped React binding unioned three of the four: `planRoute` and
 * `planTransitions` diagnostics were computed per route and **discarded**, so
 * `SLOT-BINDING-INCOMPLETE`, `STATIC-IMAGE-NO-ALT`, `EMBED-ROUTE-*`,
 * `WIDGET-*`, per-slot `BUNDLE-DOCUMENT-MISSING` and every
 * `TRANSITION-UNFIREABLE` reached the screen and never the host. Per-route
 * stages produce most of the code set, so that delivered the minority of it.
 *
 * This module is why that cannot happen again: the union is here, once, in the
 * core, and a binding that renders a {@link SurfaceRoutePlan} has the whole
 * diagnostic list in its hand by construction. §7.1: "Every diagnostic the
 * shell produces MUST reach the host's diagnostic channel, whatever stage
 * produced it."
 *
 * It also puts the `supplied-by-slot` walk (§5.3) on the same side of the seam
 * as the slot plan it walks, which is the only place it can be got right once.
 */
import type { ExperienceDocument, FormDefinition, RegistryEntry } from '@formspec-org/types';
import type { SurfaceApp, SurfaceRouteHandle } from './composition.js';
import type { SurfaceDiagnostic } from './diagnostics.js';
import type { WidgetRegistry } from './registry.js';
import { planRoute, type SlotPlan } from './slot-plan.js';
import type { HeadingLevel } from './static-content.js';
import type { SurfaceStringOverrides, SurfaceStrings } from './strings.js';
import type { ThemeAuthority, ThemeGrant } from './theme-authority.js';
import {
  planTransitions,
  slotSuppliedTriggers,
  type PlannedTransition,
  type ResponseActionsDocumentLike,
} from './transitions.js';

export interface SurfaceRoutePlanInput<TComponent> {
  handle: SurfaceRouteHandle;
  app: SurfaceApp;
  /** Route-parameter values, from the matched path and the host. */
  params?: Readonly<Record<string, string>> | undefined;
  experiences: readonly ExperienceDocument[];
  definitions: ReadonlyMap<string, FormDefinition>;
  registryEntries: readonly RegistryEntry[];
  widgets: WidgetRegistry<TComponent>;
  responseActions?: readonly ResponseActionsDocumentLike[] | undefined;
  themeAuthority: ThemeAuthority;
  /** Whether the host supplied a Response Actions executor. Never assumed. */
  hasExecutor?: boolean | undefined;
  /**
   * Level this route's content starts at. `2` — the route title is the page's
   * single `h1` — unless a host that owns the page heading moves it (§3.4.1
   * obligation 3). A shell that hard-codes the outline cannot be embedded.
   */
  headingBaseLevel?: HeadingLevel | undefined;
  strings?: SurfaceStrings | SurfaceStringOverrides | undefined;
}

export interface SurfaceRoutePlan<TComponent> {
  handle: SurfaceRouteHandle;
  params: Readonly<Record<string, string>>;
  slots: readonly SlotPlan<TComponent>[];
  grant: ThemeGrant;
  transitions: readonly PlannedTransition[];
  headingBaseLevel: HeadingLevel;
  /** Slot, theme and transition diagnostics, in the order the stages ran. */
  diagnostics: readonly SurfaceDiagnostic[];
}

export function planMatchedRoute<TComponent>(
  input: SurfaceRoutePlanInput<TComponent>,
): SurfaceRoutePlan<TComponent> {
  const headingBaseLevel = input.headingBaseLevel ?? 2;
  const site = { surfaceId: input.handle.surfaceId, routeId: input.handle.routeId };

  // The grant is resolved HERE, once, at the route boundary — never per slot
  // and never for an embedded route (§4.4). An embedded route's own class is a
  // floor on its protection, never a ceiling on its host's.
  const grant = input.themeAuthority.grantFor(input.handle.route, site);

  const route = planRoute<TComponent>({
    handle: input.handle,
    experiences: input.experiences,
    definitions: input.definitions,
    registryEntries: input.registryEntries,
    widgets: input.widgets,
    headingBaseLevel,
  });

  const responseActions = input.responseActions ?? [];
  const transitions = planTransitions({
    handle: input.handle,
    app: input.app,
    responseActions,
    hasExecutor: input.hasExecutor ?? false,
    slotSuppliedTriggers: slotSuppliedTriggers(route.slots, responseActions),
    ...(input.strings !== undefined ? { strings: input.strings } : {}),
  });

  return {
    handle: input.handle,
    params: input.params ?? {},
    slots: route.slots,
    grant,
    transitions: transitions.transitions,
    headingBaseLevel,
    diagnostics: [...route.diagnostics, ...grant.diagnostics, ...transitions.diagnostics],
  };
}
