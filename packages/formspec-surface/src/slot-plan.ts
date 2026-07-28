/**
 * @filedesc Slot dispatch — the only place in the stack where a `slotType`
 * becomes something renderable.
 *
 * The taxonomy is closed and shipped (ADR 0150 §6.2), enforced by the schema, by
 * `formspec-lint`, and by the app-graph validator. Until the surface-render-v10
 * spike, **no runtime anywhere read it** (gap ledger `slot-dispatch`).
 *
 * Two shapes make this worth owning centrally rather than re-writing per host:
 *
 * 1. **It is exhaustive, and the compiler holds it.** The switch has no
 *    `default` arm and ends in a `never` check, so a sixth slot type — which
 *    lands through the Registry's `slot-type` contribution category, not through
 *    a schema edit — breaks the build HERE, at the decision site. That is the
 *    same discipline `ROUTE_CLASS_THEME_AUTHORITY` uses.
 * 2. **It plans, it does not render.** A `SlotPlan` is data: a React binding, a
 *    web-component binding, and a server-side pre-renderer all consume the same
 *    plan. Putting the dispatch in one renderer means every other renderer
 *    writes it again and disagrees with the last one.
 *
 * `embed-route` is planned here too, recursively, because it is a composition
 * primitive and leaving it out means the closed taxonomy is not actually closed
 * over. Two properties it must have, both taken from how
 * `ui-graph-policy.ts`'s `widgetBindingsRenderedBy` walks the same edges:
 *
 * - **The host's theme grant carries down every embed edge.** An embedded route
 *   paints on the host's surface (`surface-spec.md` §6.2), so an embedded
 *   `intake` route inside a `proof` route does NOT get to restore tenant
 *   branding. The plan therefore never re-resolves a grant for embedded content.
 * - **Cycles terminate.** `routeRef` is constrained to a route id, not to an
 *   acyclic graph, so `a` embedding `b` embedding `a` is authorable. The visited
 *   set is a termination requirement, not an optimisation.
 */
import type { FormDefinition, RegistryEntry } from '@formspec-org/types';
import type { ExperienceDocument } from '@formspec-org/types';
import { surfaceDiagnostic, type SurfaceDiagnostic } from './diagnostics.js';
import type { SurfaceRoute } from './route-path.js';
import type { SurfaceRouteHandle } from './composition.js';
import { planExperienceUnit, type ExperienceUnitPlan } from './experience-unit.js';
import { planStaticContent, type HeadingLevel, type StaticContentPlan } from './static-content.js';
import type { WidgetKey, WidgetRegistry, WidgetResolution } from './registry.js';

export type SurfaceSlot = SurfaceRoute['slots'][number];

export interface SlotPlanBase {
  slotId: string;
  title?: string;
  /** `slot.position` — an author hint with no normative vocabulary at v0.1. */
  position?: string;
  /** Heading level content inside this slot starts at. */
  headingBaseLevel: HeadingLevel;
}

export type SlotPlan<TComponent> = SlotPlanBase &
  (
    | {
        slotType: 'definition-form';
        definitionRef: string;
        presentation?: string;
        definition?: FormDefinition;
        registryEntries: readonly RegistryEntry[];
        status: 'ready' | 'unresolved';
      }
    | { slotType: 'experience-unit'; unit: ExperienceUnitPlan }
    | {
        slotType: 'module-widget';
        key: WidgetKey;
        config?: Readonly<Record<string, unknown>>;
        resolution: WidgetResolution<TComponent>;
      }
    | { slotType: 'static-content'; content: StaticContentPlan | undefined }
    | {
        slotType: 'embed-route';
        routeRef: string;
        mode?: string;
        /** The embedded route's own slots, planned. Empty when unresolved. */
        slots: readonly SlotPlan<TComponent>[];
        status: 'ready' | 'unresolved' | 'cycle';
      }
  );

export interface SlotPlanContext<TComponent> {
  handle: SurfaceRouteHandle;
  experiences: readonly ExperienceDocument[];
  definitions: ReadonlyMap<string, FormDefinition>;
  registryEntries: readonly RegistryEntry[];
  widgets: WidgetRegistry<TComponent>;
  /** Level route content starts at. Default 2 — the route title is the `h1`. */
  headingBaseLevel?: HeadingLevel;
}

export interface RoutePlan<TComponent> {
  handle: SurfaceRouteHandle;
  slots: readonly SlotPlan<TComponent>[];
  diagnostics: readonly SurfaceDiagnostic[];
}

export function planRoute<TComponent>(context: SlotPlanContext<TComponent>): RoutePlan<TComponent> {
  const diagnostics: SurfaceDiagnostic[] = [];
  const base = context.headingBaseLevel ?? 2;
  const slots = context.handle.route.slots.map((slot) =>
    planSlot(slot, context, base, new Set([context.handle.routeId]), diagnostics),
  );
  return { handle: context.handle, slots, diagnostics };
}

function planSlot<TComponent>(
  slot: SurfaceSlot,
  context: SlotPlanContext<TComponent>,
  headingBaseLevel: HeadingLevel,
  visitedRoutes: ReadonlySet<string>,
  diagnostics: SurfaceDiagnostic[],
): SlotPlan<TComponent> {
  const site = {
    surfaceId: context.handle.surfaceId,
    routeId: context.handle.routeId,
    slotId: slot.id,
  };
  const shared: SlotPlanBase = { slotId: slot.id, headingBaseLevel };
  if (typeof slot.title === 'string') shared.title = slot.title;
  if (typeof slot.position === 'string') shared.position = slot.position;
  const binding = (slot.binding ?? {}) as Record<string, unknown>;

  switch (slot.slotType) {
    case 'definition-form': {
      const definitionRef = typeof binding.definitionRef === 'string' ? binding.definitionRef : '';
      if (definitionRef === '') {
        diagnostics.push(
          surfaceDiagnostic(
            'SLOT-BINDING-INCOMPLETE',
            'A definition-form slot names no Definition, so there is no form to show.',
            site,
          ),
        );
      }
      const definition = context.definitions.get(definitionRef);
      if (definitionRef !== '' && definition === undefined) {
        diagnostics.push(
          surfaceDiagnostic(
            'BUNDLE-DOCUMENT-MISSING',
            `A form on this page points at "${definitionRef}", which this release does not contain.`,
            { ...site, source: definitionRef },
          ),
        );
      }
      const plan: SlotPlan<TComponent> = {
        ...shared,
        slotType: 'definition-form',
        definitionRef,
        registryEntries: context.registryEntries,
        status: definition === undefined ? 'unresolved' : 'ready',
      };
      if (typeof binding.presentation === 'string') plan.presentation = binding.presentation;
      if (definition !== undefined) plan.definition = definition;
      return plan;
    }

    case 'experience-unit': {
      const unitRef = typeof binding.unitRef === 'string' ? binding.unitRef : '';
      const unit = planExperienceUnit({
        unitRef,
        experienceRef: typeof binding.experienceRef === 'string' ? binding.experienceRef : undefined,
        experiences: context.experiences,
      });
      if (unitRef === '') {
        diagnostics.push(
          surfaceDiagnostic(
            'SLOT-BINDING-INCOMPLETE',
            'An experience-unit slot names no unit, so there is nothing to resolve.',
            site,
          ),
        );
      }
      if (unit.status === 'unresolved') {
        // An intra-document miss, NOT a missing document. Reusing
        // `BUNDLE-DOCUMENT-MISSING` here left a host unable to tell an absent
        // Experience document from a present one that has no such unit — two
        // different repairs by two different people. One defect, one code
        // (surface-shell-spec §7.2).
        diagnostics.push(
          surfaceDiagnostic(
            'EXPERIENCE-UNIT-UNRESOLVED',
            `This page refers to a step called "${unitRef}", which no Experience document in this release declares.`,
            site,
            { unitRef, experienceRef: binding.experienceRef },
          ),
        );
      }
      return { ...shared, slotType: 'experience-unit', unit };
    }

    case 'module-widget': {
      const key: WidgetKey = {
        moduleId: typeof binding.moduleId === 'string' ? binding.moduleId : '',
        widgetName: typeof binding.widgetName === 'string' ? binding.widgetName : '',
      };
      const resolution = context.widgets.resolve(key);
      const diagnostic = context.widgets.diagnose(key, resolution, site);
      if (diagnostic) diagnostics.push(diagnostic);
      const plan: SlotPlan<TComponent> = {
        ...shared,
        slotType: 'module-widget',
        key,
        resolution,
      };
      // `config` is the ONLY data channel a module-widget binding has, and it is
      // validated against `widgetShape.props` by lint E604 rather than by any
      // runtime. It carries configuration, not content: there is still no way
      // for a slot to bind a widget to a Data Source or a query (gap ledger
      // `widget-data-binding`).
      if (binding.config && typeof binding.config === 'object') {
        plan.config = binding.config as Record<string, unknown>;
      }
      return plan;
    }

    case 'static-content': {
      const result = planStaticContent({
        binding,
        headingBaseLevel,
        slotTitle: typeof slot.title === 'string' ? slot.title : undefined,
        site,
      });
      diagnostics.push(...result.diagnostics);
      return { ...shared, slotType: 'static-content', content: result.plan };
    }

    case 'embed-route': {
      const routeRef = typeof binding.routeRef === 'string' ? binding.routeRef : '';
      const plan: SlotPlan<TComponent> = {
        ...shared,
        slotType: 'embed-route',
        routeRef,
        slots: [],
        status: 'unresolved',
      };
      if (typeof binding.mode === 'string') plan.mode = binding.mode;

      if (visitedRoutes.has(routeRef)) {
        diagnostics.push(
          surfaceDiagnostic(
            'EMBED-ROUTE-CYCLE',
            `Route "${routeRef}" embeds itself, directly or through another route. The repeat is not rendered.`,
            site,
            { routeRef, chain: [...visitedRoutes] },
          ),
        );
        return { ...plan, status: 'cycle' };
      }

      const embedded = context.handle.surface.routes.find((route) => route.id === routeRef);
      if (!embedded) {
        diagnostics.push(
          surfaceDiagnostic(
            'EMBED-ROUTE-UNRESOLVED',
            `A part of this page embeds route "${routeRef}", which this Surface does not declare.`,
            site,
            { routeRef },
          ),
        );
        return plan;
      }

      // The host's grant carries down: nothing re-resolves theme authority for
      // embedded content, so an embedded route cannot restore branding the host
      // route refuses. Heading base drops one level so the embedded content
      // never outranks its host.
      const nested: ReadonlySet<string> = new Set([...visitedRoutes, routeRef]);
      const nestedBase = Math.min(headingBaseLevel + 1, 6) as HeadingLevel;
      const slots = embedded.slots.map((child) =>
        planSlot(child, context, nestedBase, nested, diagnostics),
      );
      return { ...plan, slots, status: 'ready' };
    }
  }

  // No `default` arm, deliberately. A sixth slot type must break the build here
  // rather than fall through to a shrug at runtime.
  return exhaustive(slot.slotType);
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled slot type: ${String(value)}`);
}
