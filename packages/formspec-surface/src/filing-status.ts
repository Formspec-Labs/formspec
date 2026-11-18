/** @filedesc Plans exact filing-status destinations and section links without opening forms. */
import { resolveFilingStatusTargets } from '@formspec-org/app-graph';
import { fillUiParams, resolvePageSequence, UI_STRINGS } from '@formspec-org/layout';
import type { ComponentDocument, FormDefinition, ThemeDocument } from '@formspec-org/types';
import { matchRoute, routeHref, type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import { planFilingRoster } from './filing-roster.js';
import type { DataSourceCatalogHandle, DataSourceLoadRequest, LoadWidgetDataInputsRequest, DataSourceSubject } from './data-source-loader.js';
import type { FilingDraftQuery } from './draft-port.js';
import { generationNeedAnchors } from './need-trace.js';
import type { SurfaceDefinitionComponentResolver } from './slot-plan.js';
import type { SurfaceRoute } from './route-path.js';
import type { ThemeAuthority } from './theme-authority.js';

export type FilingSectionLocaleLookup = (definition: FormDefinition, key: string) => string | null;

export interface FilingStatusSectionPlan {
  id: string;
  label: string;
  href: string;
  weight: number;
}

interface FilingStatusEntryPlan {
  key: string;
  hint?: string;
  description?: string;
  needAnchors: readonly string[];
}

export type FilingStatusRowPlan = FilingStatusEntryPlan & (
  | { status: 'ready'; href: string; route: SurfaceRouteHandle; query: FilingDraftQuery; sections: readonly FilingStatusSectionPlan[]; weight: number }
  | { status: 'disabled'; route?: SurfaceRouteHandle; routeRef: string; reason: FilingStatusRowRefusal }
);

type FilingStatusRowRefusal = 'route-address-unavailable' | 'definition-unresolved' | 'slot-unresolved' | 'subject-unavailable' | 'invalid-binding';

export interface FilingStatusGroupPlan {
  id: string;
  label: string;
  needAnchors: readonly string[];
  unavailable?: boolean;
  member?: { groupId: string; label: string; waitingLabel: string };
  rows: readonly FilingStatusRowPlan[];
}

export type FilingStatusPlan =
  | { status: 'ready'; groups: readonly FilingStatusGroupPlan[]; needAnchors: readonly string[] }
  | { status: 'roster'; requests: readonly DataSourceLoadRequest[];
      load(ports: Pick<LoadWidgetDataInputsRequest, 'loader' | 'authorize' | 'validatePayload'>, sessionGeneration?: string): Promise<FilingStatusPlan> }
  | { status: 'unresolved'; reason: string };

function subjectIdentity(subject: DataSourceSubject | undefined): unknown {
  return subject ? [subject.type, Object.entries(subject.keys).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)] : null;
}

function formHref(path: string, slot: string, section?: string): string {
  const query = new URLSearchParams({ slot });
  if (section !== undefined) query.set('section', section);
  return `${path}?${query}`;
}

export interface FilingPlanInput {
  slotId: string;
  dataSources?: readonly DataSourceCatalogHandle[] | undefined;
  app: SurfaceApp;
  handle: SurfaceRouteHandle;
  bindingRoute: SurfaceRoute;
  binding: unknown;
  params: Readonly<Record<string, string>>;
  definitions: ReadonlyMap<string, FormDefinition>;
  themeAuthority: ThemeAuthority;
  resolveDefinitionComponent?: SurfaceDefinitionComponentResolver | undefined;
  resolveDefinitionLocaleString?: FilingSectionLocaleLookup | undefined;
  surfaceRef?: string | undefined;
  resolveSubject: (
    definition: FormDefinition, binding: Record<string, unknown>, route: SurfaceRoute,
    params: Readonly<Record<string, string>>,
  ) => DataSourceSubject | false | undefined;
}

export function planFilingStatus(input: FilingPlanInput): FilingStatusPlan {
  if (input.handle.surface.$formspecSurface !== '0.4') return { status: 'unresolved', reason: 'surface-version-unsupported' };
  return planFilingRoster(input, binding => planFixed({ ...input, binding })) ?? planFixed(input);
}

// Correlation IDs live only as long as their Definition. Interning the full placements
// once gives equal section plans the same compact key without hash collisions.
const placementIds = new WeakMap<FormDefinition, Map<string, number>>();
let nextPlacement = 0;

function placementId(definition: FormDefinition, sections: FilingDraftQuery['sections']) {
  const ids = placementIds.get(definition) ?? new Map<string, number>();
  placementIds.set(definition, ids);
  const content = JSON.stringify(sections);
  const existing = ids.get(content);
  if (existing !== undefined) return existing;
  const id = nextPlacement++;
  ids.set(content, id);
  return id;
}

function planFixed(input: FilingPlanInput): FilingStatusPlan {
  const { handle, app } = input;
  const unresolved = (reason: string): FilingStatusPlan => ({ status: 'unresolved', reason });
  const result = resolveFilingStatusTargets(handle.surface.routes, input.bindingRoute, input.binding, input.params);
  const duplicate = result.issues.find(issue => issue.reason === 'duplicate-group' || issue.reason === 'duplicate-target');
  if (duplicate) return unresolved(duplicate.reason);
  if (!result.groups.length) return unresolved('invalid-binding');
  const issues = new Map(result.issues.map(issue => [issue.pointer, issue.reason]));

  // Resolve each destination once and share its immutable placement with every
  // destination using the same Definition, Theme, and Component.
  type Placement = ReturnType<typeof layout>;
  type ComponentPlacements = Map<ComponentDocument | undefined, Placement>;
  type ThemePlacements = Map<ThemeDocument | undefined, ComponentPlacements>;
  const layouts = new Map<SurfaceRouteHandle, Map<string, Placement>>();
  const byDefinition = new Map<FormDefinition, ThemePlacements>();
  function layout(definition: FormDefinition, theme: ThemeDocument | undefined, component: ComponentDocument | undefined) {
    const sequence = resolvePageSequence(definition, {
      ...(theme ? { theme } : {}), ...(component ? { component } : {}),
    });
    const sections = sequence.map(({ id, fields }) => ({ ...(id === undefined ? {} : { id }), fields }));
    return { sequence, sections, id: placementId(definition, sections) };
  }
  function placementFor(route: SurfaceRouteHandle, slotId: string, definition: FormDefinition) {
    const bySlot = layouts.get(route) ?? new Map<string, Placement>();
    layouts.set(route, bySlot);
    const cached = bySlot.get(slotId);
    if (cached) return cached;
    const theme = input.themeAuthority.grantFor(route.route, {
      surfaceId: route.surfaceId, routeId: route.routeId,
    }).themeDocument;
    const component = input.resolveDefinitionComponent?.({
      surfaceRef: input.surfaceRef, routeId: route.routeId, slotId, definition,
    });
    const byTheme = byDefinition.get(definition) ?? new Map<ThemeDocument | undefined, ComponentPlacements>();
    byDefinition.set(definition, byTheme);
    const byComponent = byTheme.get(theme) ?? new Map<ComponentDocument | undefined, Placement>();
    byTheme.set(theme, byComponent);
    const result = byComponent.get(component) ?? layout(definition, theme, component);
    byComponent.set(component, result);
    bySlot.set(slotId, result);
    return result;
  }
  const groups: FilingStatusGroupPlan[] = [];
  for (const { group, pointer, targets } of result.groups) {
    const byPointer = new Map(targets.map(target => [target.pointer, target]));
    let groupSubject: string | undefined;
    const rows = group.forms.map((entry, index): FilingStatusRowPlan => {
      const key = `${pointer}/forms/${index}`;
      const common = { key, ...(typeof entry?.hint === 'string' ? { hint: entry.hint } : {}), needAnchors: generationNeedAnchors(entry) };
      const disabled = (reason: FilingStatusRowRefusal, route?: SurfaceRouteHandle): FilingStatusRowPlan => ({
        ...common, status: 'disabled', reason, ...(route ? { route } : {}),
        routeRef: typeof entry?.routeRef === 'string' ? entry.routeRef : '',
      });
      const target = byPointer.get(key);
      if (!target) {
        const issue = issues.get(key);
        return disabled(issue === 'slot-unresolved' ? issue : issue === 'invalid-binding' ? issue : 'route-address-unavailable');
      }
      const { route, slot, params } = target;
      const destination = app.routes.find(candidate => candidate.surface === handle.surface && candidate.route === route);
      if (!destination) return disabled('route-address-unavailable');
      const link = routeHref(destination, params);
      if (link.refusal || matchRoute(app, link.href).match?.handle !== destination) return disabled('route-address-unavailable', destination);

      const binding = slot.binding as Record<string, unknown>;
      const definition = typeof binding?.definitionRef === 'string' ? input.definitions.get(binding.definitionRef) : undefined;
      if (!definition) return disabled('definition-unresolved', destination);
      const subject = input.resolveSubject(definition, binding, route, params);
      if (subject === false) return disabled('subject-unavailable', destination);
      const identity = subjectIdentity(subject);
      const resolvedSubject = JSON.stringify(identity);
      groupSubject ??= resolvedSubject;
      if (groupSubject !== resolvedSubject) return disabled('subject-unavailable', destination);

      const placement = placementFor(destination, slot.id, definition);
      const { sequence, sections } = placement;
      const queryKey = JSON.stringify([definition.url, definition.version, identity, placement.id]);
      const segments = sequence.flatMap(({ id, title, titleBind, titleLocaleKey, fieldTemplates }, index) => {
        if (id === undefined) return [];
        const localeKey = titleBind === undefined ? titleLocaleKey : `${titleBind}.label`;
        const localized = localeKey === undefined ? null : input.resolveDefinitionLocaleString?.(definition, localeKey);
        const label = localized || title || fillUiParams(
          input.resolveDefinitionLocaleString?.(definition, '$ui.wizard.stepTitle') ?? UI_STRINGS['wizard.stepTitle'],
          { index: index + 1 },
        );
        return [{ id, label, href: formHref(link.href, slot.id, id), weight: fieldTemplates.length }];
      });
      const description = input.resolveDefinitionLocaleString?.(definition, '$form.description') ?? definition.description;
      return {
        ...common,
        status: 'ready',
        route: destination,
        ...(description === undefined ? {} : { description }),
        href: formHref(link.href, slot.id),
        query: { key: queryKey, definitionUrl: definition.url, definitionVersion: definition.version, ...(subject ? { subject } : {}), sections },
        sections: segments,
        weight: segments.reduce((sum, section) => sum + section.weight, 0),
      };
    });
    groups.push({ id: group.id, label: group.label, needAnchors: generationNeedAnchors(group), rows });
  }
  return { status: 'ready', groups, needAnchors: generationNeedAnchors(input.binding) };
}
