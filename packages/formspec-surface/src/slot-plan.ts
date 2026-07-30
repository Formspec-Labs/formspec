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
 *   paints on the host's surface (ADR 0150 §6.2), so an embedded `intake` route
 *   inside a `proof` route does NOT get to restore tenant branding. The plan
 *   therefore never re-resolves a grant for embedded content.
 * - **Cycles terminate.** `routeRef` is constrained to a route id, not to an
 *   acyclic graph, so `a` embedding `b` embedding `a` is authorable. The visited
 *   set is a termination requirement, not an optimisation.
 */
import type { FormDefinition, RegistryEntry } from '@formspec-org/types';
import type { ExperienceDocument } from '@formspec-org/types';
import { surfaceDiagnostic, type SurfaceDiagnostic } from './diagnostics.js';
import type { SurfaceRoute } from './route-path.js';
import type { SurfaceRouteHandle } from './composition.js';
import {
  planExperienceUnit,
  type ExperienceDocumentHandle,
  type ExperienceUnitPlan,
} from './experience-unit.js';
import {
  planStaticContent,
  type HeadingLevel,
  type StaticContentPlan,
  type SurfaceStaticAssetResolver,
} from './static-content.js';
import type { WidgetKey, WidgetRegistry, WidgetResolution } from './registry.js';
import type { ResponseActionsDocumentLike } from './transitions.js';
import {
  dataSourceAvailableToWidget,
  resolveDataSourceDescriptor,
  type DataSourceCatalogHandle,
  type WidgetDataInputPlan,
} from './data-source-loader.js';
import { generationNeedAnchors } from './need-trace.js';

export type SurfaceSlot = SurfaceRoute['slots'][number];

export interface SlotPlanBase {
  slotId: string;
  /** Direct authored Need anchors for the visible slot container and title. */
  needAnchors?: readonly string[];
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
        /** Registry-declared inputs after exact qualified-source resolution. */
        dataInputs: readonly WidgetDataInputPlan[];
        /** Registry-declared outputs with their exact authored mappings, if any. */
        actionOutputs: readonly WidgetActionOutputPlan[];
        resolution: WidgetResolution<TComponent>;
      }
    | {
        slotType: 'static-content';
        content: StaticContentPlan | undefined;
        /** Direct authored Need anchors for the visible binding content. */
        contentNeedAnchors?: readonly string[];
      }
    | {
        slotType: 'unknown';
        /** The value received after validation was bypassed or input was corrupted. */
        authoredSlotType: unknown;
      }
    | {
        slotType: 'embed-route';
        routeRef: string;
        mode?: string;
        /** The embedded route's own slots, planned. Empty when unresolved. */
        slots: readonly SlotPlan<TComponent>[];
        status: 'ready' | 'unresolved' | 'cycle';
      }
  );

const KNOWN_SLOT_TYPES = {
  'definition-form': true,
  'experience-unit': true,
  'module-widget': true,
  'static-content': true,
  'embed-route': true,
} as const satisfies Record<SurfaceSlot['slotType'], true>;

export interface SlotPlanContext<TComponent> {
  handle: SurfaceRouteHandle;
  experiences: readonly ExperienceDocument[];
  /** Exact manifested source identity for qualified Experience bindings. */
  experienceHandles?: readonly ExperienceDocumentHandle[] | undefined;
  definitions: ReadonlyMap<string, FormDefinition>;
  registryEntries: readonly RegistryEntry[];
  widgets: WidgetRegistry<TComponent>;
  /** Exact manifested Data Sources catalog handles. */
  dataSources?: readonly DataSourceCatalogHandle[] | undefined;
  /** Manifest URL of `handle.surface`, required by Surface/route/slot availability. */
  surfaceRef?: string | undefined;
  /** Loaded Response Actions documents used to resolve bound widget action metadata. */
  responseActions?: readonly ResponseActionsDocumentLike[] | undefined;
  /** Level route content starts at. Default 2 — the route title is the `h1`. */
  headingBaseLevel?: HeadingLevel;
  /** Host admission boundary for authored static image sources. */
  staticAssetResolver?: SurfaceStaticAssetResolver | undefined;
}

export type WidgetActionLabelPlan =
  | Readonly<{ literal: string }>
  | Readonly<{ ref: string }>;

export interface WidgetActionMetadataPlan {
  /** Exact action id selected by the Surface output binding. */
  actionRef: string;
  /** Authored Response Actions intent. Metadata only; execution stays in the host port. */
  intent: string;
  /** Authored label form, retained without inventing display text. */
  label?: WidgetActionLabelPlan | undefined;
  /** Direct authored Need anchors on the resolved Response Actions Action. */
  needAnchors?: readonly string[] | undefined;
}

export interface WidgetActionOutputPlan {
  name: string;
  actionRef?: string | undefined;
  /** Present only when `actionRef` resolves to exactly one loaded Action. */
  action?: WidgetActionMetadataPlan | undefined;
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
  const shared: SlotPlanBase = {
    slotId: slot.id,
    needAnchors: generationNeedAnchors(slot),
    headingBaseLevel,
  };
  if (typeof slot.title === 'string') shared.title = slot.title;
  if (typeof slot.position === 'string') shared.position = slot.position;
  const binding = (slot.binding ?? {}) as Record<string, unknown>;
  const authoredSlotType: unknown = (slot as { slotType?: unknown }).slotType;

  if (
    typeof authoredSlotType !== 'string' ||
    !Object.prototype.hasOwnProperty.call(KNOWN_SLOT_TYPES, authoredSlotType)
  ) {
    diagnostics.push(
      surfaceDiagnostic(
        'SLOT-TYPE-UNKNOWN',
        `Slot "${slot.id}" declares slotType ${JSON.stringify(authoredSlotType)}, which this Surface runtime does not recognize. The slot is unavailable.`,
        site,
        { slotType: authoredSlotType },
      ),
    );
    return { ...shared, slotType: 'unknown', authoredSlotType };
  }

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
        experienceHandles: context.experienceHandles,
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
      const widgetShape =
        resolution.status !== 'undeclared' ? resolution.entry?.widgetShape : undefined;
      const declaredInputs = Array.isArray(widgetShape?.dataInputs)
        ? widgetShape.dataInputs
        : [];
      const declaredOutputs = Array.isArray(widgetShape?.actionOutputs)
        ? widgetShape.actionOutputs
        : [];
      const dataBindings = ownRecord(binding, 'dataBindings');
      const actionBindings = ownRecord(binding, 'actionBindings');
      const dataInputs: WidgetDataInputPlan[] = declaredInputs.map((declared) => {
        const authored = ownRecord(dataBindings, declared.name);
        if (!authored) {
          return {
            name: declared.name,
            required: declared.required,
            status: 'unbound',
            reason: 'the Surface binding does not map this declared input',
          };
        }
        const catalogRef = ownString(authored, 'catalogRef');
        const sourceRef = ownString(authored, 'sourceRef');
        if (catalogRef === undefined || sourceRef === undefined) {
          return {
            name: declared.name,
            required: declared.required,
            status: 'unresolved',
            reason: 'the Surface binding does not contain a qualified catalog/source pair',
          };
        }
        const descriptor = resolveDataSourceDescriptor(
          context.dataSources ?? [],
          { catalogRef, sourceRef },
        );
        if (!descriptor) {
          return {
            name: declared.name,
            required: declared.required,
            status: 'unresolved',
            reason: `the exact source (${catalogRef}, ${sourceRef}) is not loaded once`,
          };
        }
        const available = dataSourceAvailableToWidget(descriptor, {
          surfaceId: context.handle.surfaceId,
          surfaceRef: context.surfaceRef,
          routeId: context.handle.routeId,
          slotId: slot.id,
          moduleId: key.moduleId,
          widgetName: key.widgetName,
          params: {},
        });
        if (!available) {
          return {
            name: declared.name,
            required: declared.required,
            status: 'unavailable',
            reason: 'the source availability selector does not cover this widget',
            descriptor,
          };
        }
        return {
          name: declared.name,
          required: declared.required,
          status: 'ready',
          descriptor,
        };
      });
      for (const input of dataInputs) {
        if (input.required && input.status !== 'ready') {
          diagnostics.push(
            surfaceDiagnostic(
              'WIDGET-DATA-REQUIRED-UNAVAILABLE',
              `Required widget input "${input.name}" is unavailable: ${input.reason}.`,
              site,
              {
                moduleId: key.moduleId,
                widgetName: key.widgetName,
                inputName: input.name,
                status: input.status,
              },
            ),
          );
        }
      }
      const actionOutputs: WidgetActionOutputPlan[] = declaredOutputs.map((declared) => {
        const authored = ownRecord(actionBindings, declared.name);
        const actionRef = authored ? ownString(authored, 'actionRef') : undefined;
        const action = actionRef === undefined
          ? undefined
          : resolveWidgetAction(context.responseActions ?? [], actionRef);
        return {
          name: declared.name,
          ...(actionRef !== undefined ? { actionRef } : {}),
          ...(action !== undefined ? { action } : {}),
        };
      });
      const plan: SlotPlan<TComponent> = {
        ...shared,
        slotType: 'module-widget',
        key,
        dataInputs,
        actionOutputs,
        resolution,
      };
      // Configuration stays separate from the qualified runtime input channel.
      // It is passed intact after E604 authoring validation.
      const config = ownRecord(binding, 'config');
      if (config) {
        plan.config = config;
      }
      return plan;
    }

    case 'static-content': {
      const result = planStaticContent({
        binding,
        headingBaseLevel,
        staticAssetResolver: context.staticAssetResolver,
        site,
      });
      diagnostics.push(...result.diagnostics);
      const contentNeedAnchors = generationNeedAnchors(binding);
      return {
        ...shared,
        slotType: 'static-content',
        content: result.plan,
        ...(contentNeedAnchors.length > 0 ? { contentNeedAnchors } : {}),
      };
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

      const embeddedMatches = context.handle.surface.routes.filter((route) => route.id === routeRef);
      if (embeddedMatches.length > 1) {
        diagnostics.push(
          surfaceDiagnostic(
            'ROUTE-HANDLE-AMBIGUOUS',
            `Route handle "${context.handle.surfaceId}/${routeRef}" names more than one route. The embedded route is unavailable.`,
            site,
            { routeRef, paths: embeddedMatches.map((route) => route.path) },
          ),
        );
        return plan;
      }
      const embedded = embeddedMatches[0];
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

function resolveWidgetAction(
  documents: readonly ResponseActionsDocumentLike[],
  actionRef: string,
): WidgetActionMetadataPlan | undefined {
  const matches = documents.flatMap((document) =>
    (document.actions ?? []).filter((action) => action.id === actionRef),
  );
  if (matches.length !== 1) return undefined;
  const action = matches[0];
  if (!action || typeof action.intent !== 'string') return undefined;

  const labelRecord =
    typeof action.label === 'object' && action.label !== null && !Array.isArray(action.label)
      ? (action.label as Readonly<Record<string, unknown>>)
      : undefined;
  const literal = labelRecord ? ownString(labelRecord, 'literal') : undefined;
  const ref = labelRecord ? ownString(labelRecord, 'ref') : undefined;
  const label: WidgetActionLabelPlan | undefined =
    literal !== undefined && ref === undefined
      ? { literal }
      : ref !== undefined && literal === undefined
        ? { ref }
        : undefined;
  const needAnchors = generationNeedAnchors(action);

  return {
    actionRef,
    intent: action.intent,
    ...(label !== undefined ? { label } : {}),
    ...(needAnchors.length > 0 ? { needAnchors } : {}),
  };
}

function ownRecord(
  value: object | null | undefined,
  key: PropertyKey,
): Readonly<Record<string, unknown>> | undefined {
  if (!value || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  const candidate = (value as Record<PropertyKey, unknown>)[key];
  return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate)
    ? (candidate as Readonly<Record<string, unknown>>)
    : undefined;
}

function ownString(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate : undefined;
}
