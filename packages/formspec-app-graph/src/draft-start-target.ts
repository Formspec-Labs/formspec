/** @filedesc Resolve a new draft's destination and the source of each subject key. */
import type { FormDefinition } from '@formspec-org/types';
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
import { exactDefinitionResolution } from './data-sources.js';
import { diagnosticSourceForHandle } from './report.js';
import { resolveLocalDefinitionForm, type TargetRoute } from './filing-status-targets.js';
import { ownProp } from './surface-widgets.js';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function resolveDraftStartTarget<R extends TargetRoute>(routes: readonly R[], source: TargetRoute, binding: unknown,
  lookupDefinition: (ref: string) => FormDefinition | undefined) {
  const start = record(binding);
  if (typeof start?.label !== 'string' || !start.label.trim() ||
      typeof start.routeRef !== 'string' || typeof start.slotRef !== 'string') return;
  const target = resolveLocalDefinitionForm(routes, start.routeRef, start.slotRef);
  if ('reason' in target && target.reason) return;
  const { route, slot } = target;
  const form = record(slot.binding);
  const definition = typeof form?.definitionRef === 'string' && lookupDefinition(form.definitionRef);
  const mapping = record(form?.subjectKeys);
  if (!definition || !definition.subject || !mapping) return;
  const fields = Object.entries(definition.subject.keys);
  if (fields.length !== Object.keys(mapping).length || !fields.some(([, field]) => field.minted)) return;
  const sourceParams = new Set(source.params?.map(param => param.name));
  const targetParams = new Set(route.params?.map(param => param.name));
  const mintedParams = new Set<string>();
  const keys: { key: string; parameter: string; dataType: 'string' | 'integer'; minted: boolean }[] = [];
  for (const [key, field] of fields) {
    const parameter = ownProp(mapping, key);
    if (typeof parameter !== 'string' || !targetParams.has(parameter)) return;
    if (field.minted) {
      if (field.dataType !== 'string' || field.authorizationParent || sourceParams.has(parameter) || mintedParams.has(parameter)) return;
      mintedParams.add(parameter);
    } else if (!sourceParams.has(parameter)) return;
    keys.push({ key, parameter, dataType: field.dataType, minted: !!field.minted });
  }
  const inherited = [...targetParams].filter(param => !mintedParams.has(param));
  if (!inherited.every(param => sourceParams.has(param))) return;
  return { route, slotId: slot.id, label: start.label, definition, type: definition.subject.type, keys, inherited };
}

export function validateDraftStartTargets(context: AppGraphContext): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  function lookup(ref: string) {
    const result = exactDefinitionResolution(context, ref);
    return result.status === 'resolved' ? result.definition?.document as FormDefinition : undefined;
  }
  for (const handle of context.handles) {
    if (handle.artifactKind !== 'surface' || handle.status !== 'loaded') continue;
    const surface = record(handle.document);
    if (surface?.$formspecSurface !== '0.4') continue;
    const routes = surface.routes;
    if (!Array.isArray(routes)) continue;
    routes.forEach((source: TargetRoute, index) => source.slots?.forEach((slot, slotIndex) => {
      if (slot.slotType !== 'draft-start' || resolveDraftStartTarget(routes, source, slot.binding, lookup)) return;
      diagnostics.push({ code: 'APP-GRAPH-SURFACE-SUBJECT-KEYS', severity: 'error', origin: 'app-graph-validator',
        phase: 'cross-artifact', message: 'The draft start must address a form with store-minted keys and resolvable parent parameters.',
        primarySource: diagnosticSourceForHandle(handle, `/routes/${index}/slots/${slotIndex}/binding`),
        details: { reason: 'draft-start-target-invalid' } });
    }));
  }
  return diagnostics;
}
