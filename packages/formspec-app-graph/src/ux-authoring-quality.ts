/** @filedesc Cross-artifact UX and authoring quality checks for D1 surfaces, forms, and components. */

import type {
  AppGraphContext,
  AppGraphDiagnostic,
  AppGraphSourcePointer,
  ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import {
  handlesByKind,
  ownProp,
  record,
  recordArray,
  stringProp,
  type JsonRecord,
} from './surface-widgets.js';

export const UX_AUTHORING_QUALITY_CODES = {
  ungroupedLargeDefinition: 'APP-GRAPH-UNGROUPED-LARGE-DEFINITION',
  deadEndFormSlot: 'APP-GRAPH-DEAD-END-FORM-SLOT',
  componentRouteParamUnused: 'APP-GRAPH-COMPONENT-ROUTE-PARAM-UNUSED',
  routeTitleMissing: 'APP-GRAPH-ROUTE-TITLE-MISSING',
  routeTitleSlug: 'APP-GRAPH-ROUTE-TITLE-SLUG',
  routeClassMissing: 'APP-GRAPH-ROUTE-CLASS-MISSING',
  surfaceWidgetChromeLeak: 'APP-GRAPH-SURFACE-WIDGET-CHROME-LEAK',
  inlineBilingualSlash: 'APP-GRAPH-INLINE-BILINGUAL-SLASH',
  binaryChoiceDropdown: 'APP-GRAPH-BINARY-CHOICE-DROPDOWN',
} as const;

const MAX_UNGROUPED_FIELDS = 12;

const GROUPING_COMPONENT_NAMES = new Set(['Section', 'Collapsible']);

function definitionItemChildren(item: JsonRecord): readonly JsonRecord[] {
  const children = recordArray(ownProp(item, 'children'));
  return children.length > 0 ? children : recordArray(ownProp(item, 'items'));
}

function countDefinitionFields(items: readonly JsonRecord[]): number {
  let count = 0;
  for (const item of items) {
    const type = stringProp(item, 'type');
    if (type === 'field') {
      count += 1;
    }
    const nested = definitionItemChildren(item);
    if (nested.length > 0) {
      count += countDefinitionFields(nested);
    }
  }
  return count;
}

function hasDefinitionGroupItem(items: readonly JsonRecord[]): boolean {
  for (const item of items) {
    if (stringProp(item, 'type') === 'group') return true;
    const nested = definitionItemChildren(item);
    if (nested.length > 0 && hasDefinitionGroupItem(nested)) return true;
  }
  return false;
}

function isExplicitHeadingItem(item: JsonRecord): boolean {
  const type = stringProp(item, 'type');
  if (type === 'heading') return true;
  if (type === 'display') {
    const presentation = record(ownProp(item, 'presentation'));
    if (stringProp(presentation, 'widgetHint') === 'Heading') return true;
  }
  return false;
}

/**
 * Check whether top-level explicit Heading items partition the definition's
 * field items so that at least one heading is present and no contiguous run of
 * fields between headings exceeds MAX_UNGROUPED_FIELDS.
 */
function hasBoundedHeadingFieldRuns(items: readonly JsonRecord[]): boolean {
  let sawHeading = false;
  let currentRun = 0;
  for (const item of items) {
    if (isExplicitHeadingItem(item)) {
      sawHeading = true;
      currentRun = 0;
      continue;
    }
    if (stringProp(item, 'type') === 'field') {
      currentRun += 1;
      if (currentRun > MAX_UNGROUPED_FIELDS) return false;
    }
  }
  return sawHeading;
}

const NON_FIELD_COMPONENT_NAMES = new Set([
  'Section',
  'Collapsible',
  'Stack',
  'Grid',
  'Panel',
  'Card',
  'Text',
  'Heading',
  'Alert',
  'Divider',
  'Badge',
  'ActionButton',
  'Summary',
  'ValidationSummary',
]);

function componentNodeIsEditableField(node: JsonRecord): boolean {
  const component = stringProp(node, 'component');
  if (!component) return false;
  if (ownProp(node, 'readOnly') === true) return false;
  if (component === 'Field') return true;
  if (NON_FIELD_COMPONENT_NAMES.has(component)) return false;
  return typeof ownProp(node, 'bind') === 'string';
}

function componentNodeHasFieldDescendant(node: JsonRecord): boolean {
  if (
    stringProp(node, 'component') === 'Field'
    || (typeof ownProp(node, 'bind') === 'string'
      && !NON_FIELD_COMPONENT_NAMES.has(stringProp(node, 'component') ?? ''))
  ) {
    return true;
  }
  return recordArray(ownProp(node, 'children')).some(componentNodeHasFieldDescendant);
}

function componentTreeHasEditableControl(node: JsonRecord): boolean {
  if (componentNodeIsEditableField(node)) return true;
  return recordArray(ownProp(node, 'children')).some(componentTreeHasEditableControl);
}

function componentTreeHasActionButton(node: JsonRecord): boolean {
  if (stringProp(node, 'component') === 'ActionButton') return true;
  return recordArray(ownProp(node, 'children')).some(componentTreeHasActionButton);
}

function componentTreeHasHeading(node: JsonRecord): boolean {
  if (stringProp(node, 'component') === 'Heading') return true;
  return recordArray(ownProp(node, 'children')).some(componentTreeHasHeading);
}

function componentTreeGroupsFields(node: JsonRecord): boolean {
  const component = stringProp(node, 'component');
  if (component && GROUPING_COMPONENT_NAMES.has(component) && componentNodeHasFieldDescendant(node)) {
    return true;
  }
  return recordArray(ownProp(node, 'children')).some(componentTreeGroupsFields);
}

function componentTargetUrl(componentDoc: JsonRecord | undefined): string | undefined {
  const target = record(ownProp(componentDoc, 'target'));
  const targetDefinition = record(ownProp(componentDoc, 'targetDefinition'));
  return (
    stringProp(target, 'url')
    ?? stringProp(target, 'definitionRef')
    ?? stringProp(targetDefinition, 'url')
    ?? stringProp(targetDefinition, 'definitionRef')
    ?? stringProp(componentDoc, 'definitionRef')
  );
}

function ungroupedLargeDefinitionDiagnostics(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const components = handlesByKind(context.handles, 'component');
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const definition of handlesByKind(context.handles, 'definition')) {
    const doc = record(definition.document);
    const items = recordArray(ownProp(doc, 'items'));
    if (items.length === 0) continue;

    const fieldCount = countDefinitionFields(items);
    if (fieldCount <= MAX_UNGROUPED_FIELDS) continue;
    if (hasDefinitionGroupItem(items)) continue;
    if (hasBoundedHeadingFieldRuns(items)) continue;

    const definitionUrl =
      stringProp(doc, 'url')
      ?? (typeof definition.ref?.url === 'string' ? definition.ref.url : undefined);

    const targetingComponents = components.filter((component) => {
      const compDoc = record(component.document);
      const targetUrl = componentTargetUrl(compDoc);
      return Boolean(definitionUrl && targetUrl === definitionUrl);
    });
    const hasComponentGrouping = targetingComponents.some((component) => {
      const compDoc = record(component.document);
      const tree = record(ownProp(compDoc, 'tree'));
      return tree ? componentTreeGroupsFields(tree) : false;
    });
    if (hasComponentGrouping) continue;

    const hasLegacyHostHeadingComponent = targetingComponents.some((component) => {
      const source = String(component.source ?? '');
      if (source.startsWith('bundle-local:') || source.startsWith('studio-core:bundle-local:')) {
        return false;
      }
      const compDoc = record(component.document);
      const tree = record(ownProp(compDoc, 'tree'));
      return tree ? componentTreeHasHeading(tree) : false;
    });

    diagnostics.push({
      code: UX_AUTHORING_QUALITY_CODES.ungroupedLargeDefinition,
      severity: hasLegacyHostHeadingComponent ? 'warning' : 'error',
      phase: 'cross-artifact',
      origin: 'app-graph-validator',
      message:
        `Definition '${definitionUrl ?? definition.slot}' declares ${fieldCount} fields without any 'group' item or Component Section/Collapsible grouping (maximum ungrouped fields is ${MAX_UNGROUPED_FIELDS}).`,
      primarySource: diagnosticSourceForHandle(definition, '/items'),
      details: {
        reason: 'ungrouped-large-definition',
        definitionUrl: definitionUrl ?? definition.slot,
        fieldCount,
        maxUngroupedFields: MAX_UNGROUPED_FIELDS,
      },
    });
  }

  return diagnostics;
}

function slotDefinitionUrl(slot: JsonRecord): string | undefined {
  const binding = record(ownProp(slot, 'binding'));
  const direct = stringProp(binding, 'definitionRef');
  if (direct) return direct;
  const refObj = record(ownProp(binding, 'definitionRef'));
  return stringProp(refObj, 'url');
}

function definitionHasEditableField(items: readonly JsonRecord[]): boolean {
  for (const item of items) {
    if (stringProp(item, 'type') === 'field' && ownProp(item, 'readOnly') !== true) {
      return true;
    }
    const nested = definitionItemChildren(item);
    if (nested.length > 0 && definitionHasEditableField(nested)) {
      return true;
    }
  }
  return false;
}

function resolveLoadedDefinition(
  context: AppGraphContext,
  definitionUrl: string,
): ResolvedArtifactHandle | undefined {
  return handlesByKind(context.handles, 'definition').find((handle) => {
    const doc = record(handle.document);
    return (
      stringProp(doc, 'url') === definitionUrl
      || handle.ref?.url === definitionUrl
    );
  });
}

function experienceCoversRouteOrDefinition(
  context: AppGraphContext,
  routeId: string | undefined,
  definitionUrl: string,
): boolean {
  for (const experience of handlesByKind(context.handles, 'experience')) {
    const raw = JSON.stringify(experience.document ?? {});
    if (raw.includes(definitionUrl)) return true;
    if (routeId && raw.includes(`"${routeId}"`)) return true;
  }
  return false;
}

function deadEndFormSlotDiagnostics(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surface of handlesByKind(context.handles, 'surface')) {
    const surfaceDoc = record(surface.document);
    const version = stringProp(surfaceDoc, '$formspecSurface');
    if (version !== '0.2' && version !== '0.3') continue;

    const routes = recordArray(ownProp(surfaceDoc, 'routes'));
    if (routes.length <= 1) continue;
    const embeddedRouteIds = embeddedRouteIdsForSurface(routes);
    const topLevelTransitions = recordArray(ownProp(surfaceDoc, 'transitions'));

    routes.forEach((route, routeIndex) => {
      const routeId = stringProp(route, 'id');
      if (routeId && embeddedRouteIds.has(routeId)) return;
      const rawTransitions = ownProp(route, 'transitions');
      const transitionList = Array.isArray(rawTransitions)
        ? recordArray(rawTransitions)
        : Object.values(record(rawTransitions) ?? {}).flatMap((item) => {
            const rec = record(item);
            return rec ? [rec] : [];
          });
      const hasSurfaceOutgoingTransition =
        routeId !== undefined
        && topLevelTransitions.some((t) => stringProp(t, 'from') === routeId);
      const hasRouteTransitions = transitionList.length > 0 || hasSurfaceOutgoingTransition;
      const slots = recordArray(ownProp(route, 'slots'));
      const hasRouteActionSibling = slots.some((candidate) => {
        const slotType = stringProp(candidate, 'slotType');
        if (slotType === 'action-trigger' || slotType === 'experience-unit') return true;
        const binding = record(ownProp(candidate, 'binding'));
        const actionBindings = record(ownProp(binding, 'actionBindings'));
        return actionBindings !== undefined && Object.keys(actionBindings).length > 0;
      });

      slots.forEach((slot, slotIndex) => {
        if (stringProp(slot, 'slotType') !== 'definition-form') return;
        const definitionUrl = slotDefinitionUrl(slot);
        if (!definitionUrl) return;

        const definition = resolveLoadedDefinition(context, definitionUrl);
        if (!definition) return;
        const items = recordArray(ownProp(record(definition.document), 'items'));
        if (!definitionHasEditableField(items)) return;

        const slotId = stringProp(slot, 'id');
        const targetedComponent = resolveComponentForRouteSlot(
          context,
          surface,
          routeId,
          definitionUrl,
          slotId,
        );
        if (targetedComponent) {
          const compDoc = record(targetedComponent.document);
          const tree = record(ownProp(compDoc, 'tree'));
          if (tree) {
            if (componentTreeHasActionButton(tree)) return;
            const hasRouteScope =
              record(ownProp(compDoc, 'context')) !== undefined
              || recordArray(ownProp(compDoc, 'targetSurfaceRoutes')).length > 0;
            if (hasRouteScope && !componentTreeHasEditableControl(tree)) return;
          }
        }

        const triggers = recordArray(ownProp(slot, 'triggers'));
        if (triggers.length > 0) return;
        if (hasRouteTransitions || hasRouteActionSibling) return;
        if (experienceCoversRouteOrDefinition(context, routeId, definitionUrl)) return;

        diagnostics.push({
          code: UX_AUTHORING_QUALITY_CODES.deadEndFormSlot,
          severity: 'error',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message:
            `Surface route '${routeId ?? routeIndex}' mounts editable definition-form slot '${slotId ?? slotIndex}' ('${definitionUrl}') without any completion trigger, transition, or outgoing action.`,
          primarySource: diagnosticSourceForHandle(
            surface,
            `/routes/${routeIndex}/slots/${slotIndex}`,
          ),
          relatedSources: [diagnosticSourceForHandle(definition, '/items')],
          details: {
            reason: 'dead-end-form-slot',
            routeId: routeId ?? String(routeIndex),
            slotId: slotId ?? String(slotIndex),
            definitionUrl,
          },
        });
      });
    });
  }

  return diagnostics;
}

function collectRouteParamNamesForRoute(
  surfaceDoc: JsonRecord,
  route: JsonRecord,
  routeId: string | undefined,
): string[] {
  const params = new Set<string>();

  const declaredParams = ownProp(route, 'params') ?? ownProp(route, 'routeParams');
  if (Array.isArray(declaredParams)) {
    for (const item of declaredParams) {
      if (typeof item === 'string' && item.trim().length > 0) {
        params.add(item.trim());
      } else {
        const name = stringProp(record(item), 'name') ?? stringProp(record(item), 'id');
        if (name) params.add(name);
      }
    }
  } else {
    const paramRecord = record(declaredParams);
    if (paramRecord) {
      for (const key of Object.keys(paramRecord)) {
        params.add(key);
      }
    }
  }

  const routePath = stringProp(route, 'path');
  if (routePath) {
    for (const match of routePath.matchAll(/:([a-zA-Z0-9_]+)|\{([a-zA-Z0-9_]+)\}/g)) {
      const name = match[1] ?? match[2];
      if (name) params.add(name);
    }
  }

  // Check sibling slots on the same route for routeParam usage (e.g. StructuredPanel key-value items)
  for (const slot of recordArray(ownProp(route, 'slots'))) {
    const config = record(ownProp(record(ownProp(slot, 'binding')), 'config'));
    for (const block of recordArray(ownProp(config, 'blocks'))) {
      for (const item of recordArray(ownProp(block, 'items'))) {
        const rp = stringProp(item, 'routeParam');
        if (rp) params.add(rp);
      }
    }
  }

  // Check incoming transitions across routes on the surface
  if (routeId) {
    for (const otherRoute of recordArray(ownProp(surfaceDoc, 'routes'))) {
      const rawTransitions = ownProp(otherRoute, 'transitions');
      const transitionEntries = Array.isArray(rawTransitions)
        ? recordArray(rawTransitions)
        : Object.values(record(rawTransitions) ?? {}).flatMap((item) => {
            const rec = record(item);
            return rec ? [rec] : [];
          });
      for (const transition of transitionEntries) {
        const target =
          stringProp(transition, 'targetRouteRef')
          ?? stringProp(transition, 'targetRouteId')
          ?? stringProp(transition, 'routeRef')
          ?? stringProp(transition, 'routeId')
          ?? stringProp(transition, 'to');
        if (target !== routeId) continue;
        const tParams = record(
          ownProp(transition, 'params')
          ?? ownProp(transition, 'routeParams')
          ?? ownProp(transition, 'paramBindings'),
        );
        if (tParams) {
          for (const key of Object.keys(tParams)) params.add(key);
        }
      }
      for (const slot of recordArray(ownProp(otherRoute, 'slots'))) {
        const config = record(ownProp(record(ownProp(slot, 'binding')), 'config'));
        for (const action of recordArray(ownProp(config, 'actions'))) {
          const payload = record(ownProp(action, 'payload'));
          if (payload && stringProp(action, 'targetRouteId') === routeId) {
            for (const key of Object.keys(payload)) params.add(key);
          }
        }
      }
    }
  }

  return [...params];
}

function componentReferencesRouteParams(value: unknown, paramNames: readonly string[]): boolean {
  if (typeof value === 'string') {
    if (value.includes('$route.') || value.includes('$params.') || value.includes('routeParam')) {
      return true;
    }
    return paramNames.some((param) =>
      value.includes(`:${param}`) || value.includes(`{${param}}`) || value === param
    );
  }
  if (Array.isArray(value)) {
    return value.some((item) => componentReferencesRouteParams(item, paramNames));
  }
  const obj = record(value);
  if (!obj) return false;
  for (const [key, child] of Object.entries(obj)) {
    if (
      (key === 'routeParam' || key === 'routeParams' || key === 'param' || key === 'params')
      && child !== undefined
    ) {
      return true;
    }
    if (componentReferencesRouteParams(child, paramNames)) return true;
  }
  return false;
}

function resolveComponentForRouteSlot(
  context: AppGraphContext,
  surface: ResolvedArtifactHandle,
  routeId: string | undefined,
  definitionUrl: string,
  slotId?: string,
): ResolvedArtifactHandle | undefined {
  const surfaceDoc = record(surface.document);
  const surfaceId =
    stringProp(surfaceDoc, 'id')
    ?? (typeof surface.ref?.url === 'string' ? surface.ref.url : undefined);
  const surfaceUrl = typeof surface.ref?.url === 'string' ? surface.ref.url : surfaceId;
  const candidates = handlesByKind(context.handles, 'component').filter((comp) => {
    const doc = record(comp.document);
    return componentTargetUrl(doc) === definitionUrl;
  });
  if (candidates.length === 0) return undefined;

  const routeScoped = candidates.find((comp) => {
    const compDoc = record(comp.document);
    const ctx = record(ownProp(compDoc, 'context'));
    if (ctx) {
      const compRouteId = stringProp(ctx, 'routeId');
      const compSurfaceRef = stringProp(ctx, 'surfaceRef') ?? stringProp(record(ownProp(ctx, 'surfaceRef')), 'url');
      if (compRouteId === routeId && (!compSurfaceRef || compSurfaceRef === surfaceId || compSurfaceRef === surfaceUrl)) {
        return true;
      }
    }
    const targetRoutes = recordArray(ownProp(compDoc, 'targetSurfaceRoutes'));
    if (targetRoutes.length > 0) {
      return targetRoutes.some((entry) => {
        const entryRoute = stringProp(entry, 'route') ?? stringProp(entry, 'routeId');
        const entrySlot = stringProp(entry, 'slot') ?? stringProp(entry, 'slotId');
        const entrySurfaceUrl =
          stringProp(entry, 'surface')
          ?? stringProp(record(ownProp(entry, 'surface')), 'url');
        return (
          entryRoute === routeId
          && (!slotId || !entrySlot || entrySlot === slotId)
          && (!entrySurfaceUrl || entrySurfaceUrl === surfaceUrl || entrySurfaceUrl === surfaceId)
        );
      });
    }
    return false;
  });
  if (routeScoped) return routeScoped;

  return candidates.find((comp) => {
    const compDoc = record(comp.document);
    return (
      ownProp(compDoc, 'context') === undefined
      && recordArray(ownProp(compDoc, 'targetSurfaceRoutes')).length === 0
    );
  });
}

function componentRouteParamUnusedDiagnostics(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surface of handlesByKind(context.handles, 'surface')) {
    const surfaceDoc = record(surface.document);
    if (!surfaceDoc) continue;
    const routes = recordArray(ownProp(surfaceDoc, 'routes'));

    routes.forEach((route, routeIndex) => {
      const routeId = stringProp(route, 'id');
      const paramNames = collectRouteParamNamesForRoute(surfaceDoc, route, routeId);
      if (paramNames.length === 0) return;

      const slots = recordArray(ownProp(route, 'slots'));
      slots.forEach((slot, slotIndex) => {
        if (stringProp(slot, 'slotType') !== 'definition-form') return;
        const definitionUrl = slotDefinitionUrl(slot);
        if (!definitionUrl) return;

        const component = resolveComponentForRouteSlot(
          context,
          surface,
          routeId,
          definitionUrl,
        );
        if (!component) return;
        const compDoc = record(component.document);
        const tree = record(ownProp(compDoc, 'tree'));
        if (!tree) return;
        if (componentReferencesRouteParams(tree, paramNames)) return;

        diagnostics.push({
          code: UX_AUTHORING_QUALITY_CODES.componentRouteParamUnused,
          severity: 'warning',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message:
            `Component '${component.slot}' on parameterized route '${routeId ?? routeIndex}' does not consume route parameter(s): ${paramNames.join(', ')}.`,
          primarySource: diagnosticSourceForHandle(component, '/tree'),
          relatedSources: [
            diagnosticSourceForHandle(surface, `/routes/${routeIndex}/slots/${slotIndex}`),
          ],
          details: {
            reason: 'component-route-param-unused',
            routeId: routeId ?? String(routeIndex),
            slotId: stringProp(slot, 'id') ?? String(slotIndex),
            componentSlot: component.slot,
            routeParams: paramNames,
          },
        });
      });
    });
  }

  return diagnostics;
}

function embeddedRouteIdsForSurface(routes: readonly JsonRecord[]): Set<string> {
  const embedded = new Set<string>();
  for (const route of routes) {
    for (const slot of recordArray(ownProp(route, 'slots'))) {
      if (stringProp(slot, 'slotType') !== 'embed-route') continue;
      const binding = record(ownProp(slot, 'binding'));
      const targetId = stringProp(binding, 'routeRef') ?? stringProp(binding, 'routeId');
      if (targetId) embedded.add(targetId);
    }
  }
  return embedded;
}

function routeTitleAndClassDiagnostics(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const surface of handlesByKind(context.handles, 'surface')) {
    const surfaceDoc = record(surface.document);
    if (!surfaceDoc) continue;
    const surfaceVersion = stringProp(surfaceDoc, '$formspecSurface');
    const routes = recordArray(ownProp(surfaceDoc, 'routes'));
    const embeddedRouteIds = embeddedRouteIdsForSurface(routes);

    const surfaceHasTitles =
      Boolean(stringProp(surfaceDoc, 'title')?.trim())
      || routes.some((route) => typeof ownProp(route, 'title') === 'string');

    const surfaceUsesRouteClasses =
      surfaceVersion !== '0.1'
      && routes.some((route) => Boolean(stringProp(route, 'routeClass')?.trim()));

    routes.forEach((route, routeIndex) => {
      const routeId = stringProp(route, 'id');
      if (routeId && embeddedRouteIds.has(routeId)) return;

      if (surfaceHasTitles) {
        const rawTitle = ownProp(route, 'title');
        const title = typeof rawTitle === 'string' ? rawTitle.trim() : undefined;
        if (!title) {
          diagnostics.push({
            code: UX_AUTHORING_QUALITY_CODES.routeTitleMissing,
            severity: 'warning',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message:
              `Surface route '${routeId ?? routeIndex}' is missing a non-empty human-readable 'title'.`,
            primarySource: diagnosticSourceForHandle(
              surface,
              typeof rawTitle === 'string'
                ? `/routes/${routeIndex}/title`
                : `/routes/${routeIndex}`,
            ),
            details: {
              reason: 'route-title-missing',
              routeId: routeId ?? String(routeIndex),
            },
          });
        } else if (
          (routeId !== undefined && title === routeId && /^[a-z0-9_-]+$/.test(routeId))
          || /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(title)
        ) {
          diagnostics.push({
            code: UX_AUTHORING_QUALITY_CODES.routeTitleSlug,
            severity: 'error',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message:
              `Surface route '${routeId ?? routeIndex}' has a raw machine-slug title '${title}'; use a human-readable heading instead.`,
            primarySource: diagnosticSourceForHandle(
              surface,
              `/routes/${routeIndex}/title`,
            ),
            details: {
              reason: 'route-title-slug',
              routeId: routeId ?? String(routeIndex),
              title,
            },
          });
        }
      }

      if (surfaceUsesRouteClasses) {
        const rawClass = ownProp(route, 'routeClass');
        const routeClass = typeof rawClass === 'string' ? rawClass.trim() : undefined;
        if (!routeClass) {
          diagnostics.push({
            code: UX_AUTHORING_QUALITY_CODES.routeClassMissing,
            severity: 'warning',
            phase: 'cross-artifact',
            origin: 'app-graph-validator',
            message:
              `Surface route '${routeId ?? routeIndex}' is missing an explicit 'routeClass' on a route-classified Surface.`,
            primarySource: diagnosticSourceForHandle(
              surface,
              typeof rawClass === 'string'
                ? `/routes/${routeIndex}/routeClass`
                : `/routes/${routeIndex}`,
            ),
            details: {
              reason: 'route-class-missing',
              routeId: routeId ?? String(routeIndex),
            },
          });
        }
      }
    });
  }

  return diagnostics;
}

const CHROME_LEAK_PATTERNS: ReadonlyArray<{ kind: string; regex: RegExp }> = [
  { kind: 'urn', regex: /\burn:[a-z0-9][a-z0-9._:-]*/i },
  { kind: 'url', regex: /\bhttps?:\/\/\S+/i },
  { kind: 'json-pointer', regex: /(?:^|\s)\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+/ },
  {
    kind: 'binding-identifier',
    regex: /\b(?:dataBindings|actionBindings|catalogRef|sourceRef|definitionRef|widgetName|moduleId)\b/,
  },
];

function detectChromeLeak(value: string | undefined): string | undefined {
  if (!value) return undefined;
  for (const pattern of CHROME_LEAK_PATTERNS) {
    if (pattern.regex.test(value)) return pattern.kind;
  }
  return undefined;
}

function surfaceWidgetChromeLeakDiagnostics(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];

  const checkString = (
    surface: ResolvedArtifactHandle,
    pointer: string,
    value: string | undefined,
    extraDetails: Record<string, unknown> = {},
  ) => {
    const patternKind = detectChromeLeak(value);
    if (!patternKind || value === undefined) return;
    diagnostics.push({
      code: UX_AUTHORING_QUALITY_CODES.surfaceWidgetChromeLeak,
      severity: 'warning',
      phase: 'cross-artifact',
      origin: 'app-graph-validator',
      message:
        `User-facing Surface/widget text at '${pointer}' leaks technical identifier (${patternKind}): '${value}'.`,
      primarySource: diagnosticSourceForHandle(surface, pointer),
      details: {
        reason: 'surface-widget-chrome-leak',
        patternKind,
        value,
        ...extraDetails,
      },
    });
  };

  for (const surface of handlesByKind(context.handles, 'surface')) {
    const surfaceDoc = record(surface.document);
    if (!surfaceDoc) continue;
    const routes = recordArray(ownProp(surfaceDoc, 'routes'));

    routes.forEach((route, routeIndex) => {
      const routeId = stringProp(route, 'id');
      checkString(surface, `/routes/${routeIndex}/title`, stringProp(route, 'title'), { routeId });
      const nav = record(ownProp(route, 'navigation'));
      checkString(
        surface,
        `/routes/${routeIndex}/navigation/label`,
        stringProp(nav, 'label'),
        { routeId },
      );

      const slots = recordArray(ownProp(route, 'slots'));
      slots.forEach((slot, slotIndex) => {
        const slotId = stringProp(slot, 'id');
        const slotBase = `/routes/${routeIndex}/slots/${slotIndex}`;
        checkString(surface, `${slotBase}/title`, stringProp(slot, 'title'), {
          routeId,
          slotId,
        });

        const binding = record(ownProp(slot, 'binding'));
        if (stringProp(slot, 'slotType') === 'static-content') {
          checkString(
            surface,
            `${slotBase}/binding/content`,
            stringProp(binding, 'content'),
            { routeId, slotId },
          );
        }

        const config = record(ownProp(binding, 'config'));
        if (!config) return;
        const configBase = `${slotBase}/binding/config`;
        checkString(surface, `${configBase}/title`, stringProp(config, 'title'), {
          routeId,
          slotId,
        });
        checkString(
          surface,
          `${configBase}/description`,
          stringProp(config, 'description'),
          { routeId, slotId },
        );
        checkString(
          surface,
          `${configBase}/emptyState`,
          stringProp(config, 'emptyState'),
          { routeId, slotId },
        );

        recordArray(ownProp(config, 'blocks')).forEach((block, blockIndex) => {
          const blockBase = `${configBase}/blocks/${blockIndex}`;
          checkString(surface, `${blockBase}/title`, stringProp(block, 'title'), {
            routeId,
            slotId,
          });
          checkString(
            surface,
            `${blockBase}/description`,
            stringProp(block, 'description'),
            { routeId, slotId },
          );
          recordArray(ownProp(block, 'items')).forEach((item, itemIndex) => {
            checkString(
              surface,
              `${blockBase}/items/${itemIndex}/label`,
              stringProp(item, 'label'),
              { routeId, slotId },
            );
          });
          recordArray(ownProp(block, 'columns')).forEach((col, colIndex) => {
            checkString(
              surface,
              `${blockBase}/columns/${colIndex}/label`,
              stringProp(col, 'label'),
              { routeId, slotId },
            );
          });
          const rowAction = record(ownProp(block, 'rowAction'));
          if (rowAction) {
            checkString(
              surface,
              `${blockBase}/rowAction/columnLabel`,
              stringProp(rowAction, 'columnLabel'),
              { routeId, slotId },
            );
          }
        });
      });
    });
  }

  return diagnostics;
}

function hasInlineBilingualSlash(value: string | undefined): boolean {
  if (!value) return false;
  // Strip parenthesized groups like "(Form DS-82 / DS-11 Guidance)" so form-code
  // alternatives inside parentheses are never mistaken for bilingual titles.
  const withoutParens = value.replace(/\([^)]*\)/g, '').trim();
  const parts = withoutParens.split(/\s+\/\s+/);
  if (parts.length !== 2) return false;
  const [left, right] = parts.map((part) => part.trim());
  if (!left || !right) return false;
  // Ignore technical / numeric codes such as "DS-82 / DS-11" or "24 / 7"
  if (/\d/.test(left) || /\d/.test(right)) return false;
  const leftWords = left.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/g) ?? [];
  const rightWords = right.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/g) ?? [];
  if (leftWords.length === 0 || rightWords.length === 0) return false;
  if (/[ÁÉÍÓÚÜÑáéíóúüñ¿¡]/.test(withoutParens)) return true;
  if (
    /\b(?:el|la|los|las|de|del|para|con|por|una?|sus?|tarea|tareas|revisar|solicitud|seleccione|actual|autorizadas|caso|casos|estado|ayuda|correo|renovaci[oó]n|pasaporte)\b/i.test(
      right,
    )
  ) {
    return true;
  }
  return leftWords.length >= 2 && rightWords.length >= 2;
}

function inlineBilingualSlashDiagnostics(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const locales = new Set(
    handlesByKind(context.handles, 'locale')
      .map((handle) => stringProp(record(handle.document), 'locale')?.trim().toLowerCase())
      .filter((loc): loc is string => Boolean(loc)),
  );
  if (locales.size < 2) return [];

  const diagnostics: AppGraphDiagnostic[] = [];
  const checkTitle = (
    surface: ResolvedArtifactHandle,
    pointer: string,
    value: string | undefined,
    extraDetails: Record<string, unknown> = {},
  ) => {
    if (!value || !hasInlineBilingualSlash(value)) return;
    diagnostics.push({
      code: UX_AUTHORING_QUALITY_CODES.inlineBilingualSlash,
      severity: 'warning',
      phase: 'cross-artifact',
      origin: 'app-graph-validator',
      message:
        `Surface text at '${pointer}' concatenates inline bilingual copy ('${value}') even though multiple Locale artifacts are loaded; move translated copy into Locale strings.`,
      primarySource: diagnosticSourceForHandle(surface, pointer),
      details: {
        reason: 'inline-bilingual-slash',
        value,
        ...extraDetails,
      },
    });
  };

  for (const surface of handlesByKind(context.handles, 'surface')) {
    const surfaceDoc = record(surface.document);
    if (!surfaceDoc) continue;
    checkTitle(surface, '/title', stringProp(surfaceDoc, 'title'));

    const routes = recordArray(ownProp(surfaceDoc, 'routes'));
    routes.forEach((route, routeIndex) => {
      const routeId = stringProp(route, 'id');
      checkTitle(surface, `/routes/${routeIndex}/title`, stringProp(route, 'title'), { routeId });
      const nav = record(ownProp(route, 'navigation'));
      checkTitle(
        surface,
        `/routes/${routeIndex}/navigation/label`,
        stringProp(nav, 'label'),
        { routeId },
      );

      recordArray(ownProp(route, 'slots')).forEach((slot, slotIndex) => {
        const slotId = stringProp(slot, 'id');
        const slotBase = `/routes/${routeIndex}/slots/${slotIndex}`;
        checkTitle(surface, `${slotBase}/title`, stringProp(slot, 'title'), { routeId, slotId });
        const config = record(ownProp(record(ownProp(slot, 'binding')), 'config'));
        if (!config) return;
        const configBase = `${slotBase}/binding/config`;
        checkTitle(surface, `${configBase}/title`, stringProp(config, 'title'), {
          routeId,
          slotId,
        });
        recordArray(ownProp(config, 'blocks')).forEach((block, blockIndex) => {
          checkTitle(
            surface,
            `${configBase}/blocks/${blockIndex}/title`,
            stringProp(block, 'title'),
            { routeId, slotId },
          );
        });
      });
    });
  }

  return diagnostics;
}

function collectBinaryChoiceDefinitionDiagnostics(
  definition: ResolvedArtifactHandle,
  items: readonly JsonRecord[],
  basePointer: string,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  items.forEach((item, index) => {
    const itemPointer = `${basePointer}/${index}`;
    if (stringProp(item, 'type') === 'field' && stringProp(item, 'dataType') === 'choice') {
      const options = recordArray(ownProp(item, 'options'));
      const presentation = record(ownProp(item, 'presentation'));
      const widgetHint = stringProp(presentation, 'widgetHint');
      if (options.length === 2 && (widgetHint === 'Select' || widgetHint === 'Dropdown')) {
        const fieldId = stringProp(item, 'id') ?? stringProp(item, 'key') ?? String(index);
        diagnostics.push({
          code: UX_AUTHORING_QUALITY_CODES.binaryChoiceDropdown,
          severity: 'warning',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message:
            `Binary choice field '${fieldId}' declares 2 options with widgetHint '${widgetHint}'; prefer 'RadioGroup' so both options are immediately visible.`,
          primarySource: diagnosticSourceForHandle(
            definition,
            `${itemPointer}/presentation/widgetHint`,
          ),
          details: {
            reason: 'binary-choice-dropdown',
            fieldId,
            optionCount: 2,
            widgetHint,
          },
        });
      }
    }
    const nested = definitionItemChildren(item);
    if (nested.length > 0) {
      const nestedProp = recordArray(ownProp(item, 'children')).length > 0 ? 'children' : 'items';
      diagnostics.push(
        ...collectBinaryChoiceDefinitionDiagnostics(
          definition,
          nested,
          `${itemPointer}/${nestedProp}`,
        ),
      );
    }
  });
  return diagnostics;
}

function binaryChoiceDropdownDiagnostics(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];

  for (const definition of handlesByKind(context.handles, 'definition')) {
    const doc = record(definition.document);
    const items = recordArray(ownProp(doc, 'items'));
    diagnostics.push(...collectBinaryChoiceDefinitionDiagnostics(definition, items, '/items'));
  }

  for (const screener of handlesByKind(context.handles, 'screener')) {
    const doc = record(screener.document);
    const questions = recordArray(ownProp(doc, 'questions'));
    questions.forEach((question, qIndex) => {
      const options = recordArray(ownProp(question, 'options'));
      const presentation = record(ownProp(question, 'presentation'));
      const control =
        stringProp(question, 'control')
        ?? stringProp(question, 'widget')
        ?? stringProp(question, 'widgetHint')
        ?? stringProp(presentation, 'widgetHint')
        ?? stringProp(presentation, 'control');
      if (options.length === 2 && (control === 'Select' || control === 'Dropdown')) {
        const questionId = stringProp(question, 'id') ?? String(qIndex);
        diagnostics.push({
          code: UX_AUTHORING_QUALITY_CODES.binaryChoiceDropdown,
          severity: 'warning',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message:
            `Screener question '${questionId}' declares 2 options with dropdown control '${control}'; prefer 'RadioGroup' / 'Radio' for binary eligibility questions.`,
          primarySource: diagnosticSourceForHandle(screener, `/questions/${qIndex}`),
          details: {
            reason: 'binary-choice-dropdown',
            questionId,
            optionCount: 2,
            control,
          },
        });
      }
    });
  }

  return diagnostics;
}

export function validateUxAuthoringQuality(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  return [
    ...ungroupedLargeDefinitionDiagnostics(context),
    ...deadEndFormSlotDiagnostics(context),
    ...componentRouteParamUnusedDiagnostics(context),
    ...routeTitleAndClassDiagnostics(context),
    ...surfaceWidgetChromeLeakDiagnostics(context),
    ...inlineBilingualSlashDiagnostics(context),
    ...binaryChoiceDropdownDiagnostics(context),
  ];
}
