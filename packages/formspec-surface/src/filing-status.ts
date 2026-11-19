/** @filedesc Plans exact filing-status destinations and section links without opening forms. */
import { parseRouteSubjectKey, resolveFilingStatusTargets } from '@formspec-org/app-graph';
import { fillUiParams, resolvePageSequence, UI_STRINGS } from '@formspec-org/layout';
import type { ComponentDocument, FormDefinition, ThemeDocument } from '@formspec-org/types';
import { formHref, matchRoute, routeHref, type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import { planFilingRoster } from './filing-roster.js';
import type { DataSourceCatalogHandle, DataSourceLoadRequest, LoadWidgetDataInputsRequest, DataSourceSubject } from './data-source-loader.js';
import { matchesFilingSubjectPredicates, type FilingDraftQuery, type FilingSubjectMatch, type FilingSubjectPredicate } from './draft-port.js';
import { generationNeedAnchors } from './need-trace.js';
import type { SurfaceDefinitionComponentResolver } from './slot-plan.js';
import type { SurfaceRoute } from './route-path.js';
import type { ThemeAuthority } from './theme-authority.js';

export type FilingSectionLocaleLookup = (definition: FormDefinition, key: string) => string | null;

export interface FilingStatusSectionPlan {
  id: string;
  label: string;
  href?: string | undefined;
  weight: number;
}

export interface ResolvedFilingStatusLinks {
  href: string;
  params: Readonly<Record<string, string>>;
  sections: Readonly<Record<string, string>>;
}

interface FilingStatusEntryPlan {
  key: string;
  hint?: string;
  description?: string;
  needAnchors: readonly string[];
}

export type FilingStatusRowPlan = FilingStatusEntryPlan & (
  | {
      status: 'ready';
      slotId: string;
      params?: Readonly<Record<string, string>> | undefined;
      href?: string | undefined;
      resolveLinks?: ((subject: DataSourceSubject) => ResolvedFilingStatusLinks | undefined) | undefined;
      route: SurfaceRouteHandle;
      query: FilingDraftQuery;
      sections: readonly FilingStatusSectionPlan[];
      fieldTemplates: readonly string[];
      weight: number;
    }
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
  type ThemePlacements = Map<string | undefined, ComponentPlacements>;
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
    // Grants copy their tokens so one consumer cannot mutate another route's Theme.
    // Compare the effective contents once per destination, before expanding members.
    const themeKey = JSON.stringify(theme);
    const component = input.resolveDefinitionComponent?.({
      surfaceRef: input.surfaceRef, routeId: route.routeId, slotId, definition,
    });
    const byTheme: ThemePlacements = byDefinition.get(definition) ?? new Map();
    byDefinition.set(definition, byTheme);
    const byComponent = byTheme.get(themeKey) ?? new Map<ComponentDocument | undefined, Placement>();
    byTheme.set(themeKey, byComponent);
    const result = byComponent.get(component) ?? layout(definition, theme, component);
    byComponent.set(component, result);
    bySlot.set(slotId, result);
    return result;
  }
  const groups: FilingStatusGroupPlan[] = [];
  for (const { group, pointer, targets } of result.groups) {
    const byPointer = new Map(targets.map(target => [target.pointer, target]));
    const groupSubjects = new Set<string>();
    const rows = group.forms.map((entry, index): FilingStatusRowPlan => {
      const key = `${pointer}/forms/${index}`;
      const common = { key, ...(typeof entry?.hint === 'string' ? { hint: entry.hint } : {}), needAnchors: generationNeedAnchors(entry) };
      const disabled = (reason: FilingStatusRowRefusal, route?: SurfaceRouteHandle): FilingStatusRowPlan => ({
        ...common, status: 'disabled', reason, ...(route ? { route } : {}),
        routeRef: typeof entry?.routeRef === 'string' ? entry.routeRef : '',
      });
      const target = byPointer.get(key);
      if (!target) {
        const issue = issues.get(key) ?? result.issues.find(candidate => candidate.pointer.startsWith(`${key}/`))?.reason;
        return disabled(
          issue === 'slot-unresolved' ? issue
            : issue === 'invalid-binding' ? issue
              : issue === 'invalid-subject-predicate' ? 'subject-unavailable'
                : 'route-address-unavailable',
        );
      }
      const { route, slot, params, subject: predicateInputs } = target;
      const destination = app.routes.find(candidate => candidate.surface === handle.surface && candidate.route === route);
      if (!destination || destination.pathCollides) return disabled('route-address-unavailable', destination);

      const binding = slot.binding as Record<string, unknown>;
      const definition = typeof binding?.definitionRef === 'string' ? input.definitions.get(binding.definitionRef) : undefined;
      if (!definition) return disabled('definition-unresolved', destination);

      if (predicateInputs) {
        const declaration = definition.subject;
        const rawMapping = binding?.subjectKeys;
        const mapping = rawMapping && typeof rawMapping === 'object' && !Array.isArray(rawMapping)
          ? rawMapping as Record<string, unknown>
          : undefined;
        if (!declaration || !mapping || Object.keys(declaration.keys).length === 0
            || Object.keys(mapping).length !== Object.keys(declaration.keys).length) {
          return disabled('subject-unavailable', destination);
        }
        const routeParamNames = new Set(route.params?.map(param => param.name));
        for (const keyName of Object.keys(declaration.keys)) {
          const mapped = mapping[keyName];
          if (typeof mapped !== 'string' || !routeParamNames.has(mapped)) {
            return disabled('subject-unavailable', destination);
          }
        }
        const predicates: FilingSubjectPredicate[] = [];
        for (const [subjKey, paramName] of Object.entries(mapping)) {
          if (typeof paramName !== 'string' || !Object.hasOwn(params, paramName)) continue;
          const field = declaration.keys[subjKey];
          const parsed = parseRouteSubjectKey(field?.dataType, params[paramName]!);
          if (parsed === undefined) return disabled('subject-unavailable', destination);
          predicates.push({ key: subjKey, op: 'eq', value: parsed });
        }
        for (const predicate of predicateInputs) {
          if (predicate.value === undefined) return disabled('route-address-unavailable', destination);
          const field = declaration.keys[predicate.key];
          if (!field) return disabled('subject-unavailable', destination);
          if ((predicate.op === 'le' || predicate.op === 'ge' || predicate.offset !== undefined) && field.dataType !== 'integer') {
            return disabled('subject-unavailable', destination);
          }
          const parsed = parseRouteSubjectKey(field.dataType, predicate.value);
          if (parsed === undefined) return disabled('subject-unavailable', destination);
          const value = typeof parsed === 'number' ? parsed + (predicate.offset ?? 0) : parsed;
          if (typeof value === 'number' && !Number.isSafeInteger(value)) {
            return disabled('subject-unavailable', destination);
          }
          predicates.push({ key: predicate.key, op: predicate.op, value });
        }
        predicates.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        const subjectMatch: FilingSubjectMatch = { type: declaration.type, predicates };
        groupSubjects.add(JSON.stringify(['match', subjectMatch.type, subjectMatch.predicates]));

        const placement = placementFor(destination, slot.id, definition);
        const { sequence, sections } = placement;
        const queryKey = JSON.stringify([definition.url, definition.version, ['match', subjectMatch.type, subjectMatch.predicates], placement.id]);
        const segments: FilingStatusSectionPlan[] = sequence.flatMap(({ id, title, titleBind, titleLocaleKey, fieldTemplates }, sectionIndex) => {
          if (id === undefined) return [];
          const localeKey = titleBind === undefined ? titleLocaleKey : `${titleBind}.label`;
          const localized = localeKey === undefined ? null : input.resolveDefinitionLocaleString?.(definition, localeKey);
          const label = localized || title || fillUiParams(
            input.resolveDefinitionLocaleString?.(definition, '$ui.wizard.stepTitle') ?? UI_STRINGS['wizard.stepTitle'],
            { index: sectionIndex + 1 },
          );
          return [{ id, label, weight: fieldTemplates.length }];
        });
        const description = input.resolveDefinitionLocaleString?.(definition, '$form.description') ?? definition.description;
        const fieldTemplates = sequence.flatMap(entry => entry.fieldTemplates);
        return {
          ...common,
          status: 'ready',
          slotId: slot.id,
          route: destination,
          ...(description === undefined ? {} : { description }),
          resolveLinks(matchedSubject: DataSourceSubject) {
            if (!matchesFilingSubjectPredicates(definition, matchedSubject, subjectMatch)) return undefined;
            const fullParams: Record<string, string> = { ...params };
            for (const [subjKey, paramName] of Object.entries(mapping)) {
              if (typeof paramName !== 'string' || !Object.hasOwn(matchedSubject.keys, subjKey)) return undefined;
              fullParams[paramName] = String(matchedSubject.keys[subjKey]);
            }
            const link = routeHref(destination, fullParams);
            const rematched = link.refusal ? undefined : matchRoute(app, link.href).match;
            if (rematched?.handle !== destination) return undefined;
            const roundTrip = input.resolveSubject(definition, binding, route, rematched.params);
            if (!roundTrip || JSON.stringify(subjectIdentity(roundTrip)) !== JSON.stringify(subjectIdentity(matchedSubject))) {
              return undefined;
            }
            return {
              href: formHref(link.href, slot.id),
              params: rematched.params,
              sections: Object.fromEntries(segments.map(section => [section.id, formHref(link.href, slot.id, section.id)])),
            };
          },
          query: { key: queryKey, definitionUrl: definition.url, definitionVersion: definition.version, subjectMatch, sections },
          sections: segments,
          fieldTemplates,
          weight: fieldTemplates.length,
        };
      }

      const link = routeHref(destination, params);
      const rematched = link.refusal ? undefined : matchRoute(app, link.href).match;
      if (rematched?.handle !== destination) return disabled('route-address-unavailable', destination);
      const subject = input.resolveSubject(definition, binding, route, rematched.params);
      if (subject === false) return disabled('subject-unavailable', destination);
      const identity = subjectIdentity(subject);
      groupSubjects.add(JSON.stringify(identity));

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
      const fieldTemplates = sequence.flatMap(entry => entry.fieldTemplates);
      return {
        ...common,
        status: 'ready',
        slotId: slot.id,
        params: rematched.params,
        route: destination,
        ...(description === undefined ? {} : { description }),
        href: formHref(link.href, slot.id),
        query: { key: queryKey, definitionUrl: definition.url, definitionVersion: definition.version, ...(subject ? { subject } : {}), sections },
        sections: segments,
        fieldTemplates,
        weight: fieldTemplates.length,
      };
    });
    const finalRows = groupSubjects.size > 1
      ? rows.map((row): FilingStatusRowPlan => row.status === 'ready'
        ? {
            key: row.key,
            ...(row.hint === undefined ? {} : { hint: row.hint }),
            ...(row.description === undefined ? {} : { description: row.description }),
            needAnchors: row.needAnchors,
            status: 'disabled',
            route: row.route,
            routeRef: row.route.routeId,
            reason: 'subject-unavailable',
          }
        : row)
      : rows;
    groups.push({ id: group.id, label: group.label, needAnchors: generationNeedAnchors(group), rows: finalRows });
  }
  return { status: 'ready', groups, needAnchors: generationNeedAnchors(input.binding) };
}
