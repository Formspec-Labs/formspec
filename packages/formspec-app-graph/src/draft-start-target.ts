/** @filedesc Resolve a new draft's destination and the source of each subject key. */
import type { FormDefinition } from '@formspec-org/types';
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
import { exactDefinitionResolution } from './data-sources.js';
import { diagnosticSourceForHandle } from './report.js';

interface Route {
  id: string;
  params?: readonly { name: string }[];
  slots: readonly { id: string; slotType: string; binding: unknown }[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function resolveDraftStartTarget<R extends Route>(routes: readonly R[], source: Route, binding: unknown,
  lookupDefinition: (ref: string) => FormDefinition | undefined) {
  const start = record(binding);
  if (typeof start?.label !== 'string' || !start.label.trim()) return;
  const matches = routes.filter(route => route.id === start.routeRef);
  const route = matches[0];
  if (matches.length !== 1 || !route) return;
  const slots = route.slots.filter(slot => slot.id === start.slotRef);
  const slot = slots[0];
  if (slots.length !== 1 || slot?.slotType !== 'definition-form') return;
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
    const parameter = mapping[key];
    if (!Object.hasOwn(mapping, key) || typeof parameter !== 'string' || !targetParams.has(parameter)) return;
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
    const routes = record(handle.document)?.routes;
    if (!Array.isArray(routes)) continue;
    routes.forEach((source: Route, index) => source.slots?.forEach((slot, slotIndex) => {
      if (slot.slotType !== 'draft-start' || resolveDraftStartTarget(routes, source, slot.binding, lookup)) return;
      diagnostics.push({ code: 'APP-GRAPH-SURFACE-SUBJECT-KEYS', severity: 'error', origin: 'app-graph-validator',
        phase: 'cross-artifact', message: 'The draft start must address a form with store-minted keys and resolvable parent parameters.',
        primarySource: diagnosticSourceForHandle(handle, `/routes/${index}/slots/${slotIndex}/binding`),
        details: { reason: 'draft-start-target-invalid' } });
    }));
  }
  return diagnostics;
}
