/** @filedesc Resolves Surface filing-status references for validation and planning. */
import type {
  FilingStatusEntry,
  FilingStatusGroup,
  FilingStatusParamSource,
  FilingStatusSubjectPredicate,
} from '@formspec-org/types';
import { parseRouteSubjectKey } from './surface-definition-slots.js';
import { bindingFailure } from './data-sources.js';
import { diagnosticSourceForHandle } from './report.js';
import type { AppGraphContext, AppGraphDiagnostic } from './types.js';

interface TargetSlot {
  id: string;
  slotType: string;
  binding: unknown;
}

export interface TargetRoute {
  id: string;
  params?: readonly { name: string }[];
  slots: readonly TargetSlot[];
}

export interface ResolvedFilingStatusPredicate {
  key: string;
  op: FilingStatusSubjectPredicate['op'];
  from: FilingStatusParamSource;
  value?: string;
  offset?: number;
}

export interface FilingStatusTarget<R, S> {
  entry: FilingStatusEntry;
  route: R;
  slot: S;
  params: Readonly<Record<string, string>>;
  subject?: readonly ResolvedFilingStatusPredicate[];
  pointer: string;
}

export interface FilingStatusIssue {
  pointer: string;
  key?: string;
  reason: 'invalid-binding' | 'duplicate-group' | 'route-unresolved' | 'slot-unresolved'
    | 'ambiguous-repeat' | 'invalid-repeat-source' | 'invalid-parameters' | 'invalid-subject-predicate'
    | 'duplicate-target' | 'mixed-subject-mappings' | 'invalid-subject-value';
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

const SUBJECT_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const PREDICATE_ALLOWED_KEYS = new Set(['key', 'op', 'from', 'offset']);

function resolveParamSource(
  raw: unknown,
  hasRepeat: boolean,
  sourceParams: ReadonlySet<string | undefined>,
  currentParams: Readonly<Record<string, string>> | undefined,
): { normalized: FilingStatusParamSource; value?: string } | 'invalid-shape' | 'invalid-parameters' {
  const parameter = record(raw);
  if (!parameter || Object.keys(parameter).length !== 1) return 'invalid-shape';
  if (Object.prototype.hasOwnProperty.call(parameter, 'value')) {
    return typeof parameter.value === 'string' && parameter.value !== ''
      ? { normalized: { value: parameter.value }, value: parameter.value }
      : 'invalid-shape';
  }
  if (Object.prototype.hasOwnProperty.call(parameter, 'rowField')) {
    if (typeof parameter.rowField !== 'string' || parameter.rowField === '') return 'invalid-shape';
    return hasRepeat ? { normalized: { rowField: parameter.rowField } } : 'invalid-parameters';
  }
  if (Object.prototype.hasOwnProperty.call(parameter, 'routeParam')) {
    if (typeof parameter.routeParam !== 'string' || parameter.routeParam === '') return 'invalid-shape';
    if (!sourceParams.has(parameter.routeParam)) return 'invalid-parameters';
    if (currentParams === undefined) return { normalized: { routeParam: parameter.routeParam } };
    const resolved = Object.prototype.hasOwnProperty.call(currentParams, parameter.routeParam)
      ? currentParams[parameter.routeParam]
      : undefined;
    return typeof resolved === 'string' && resolved !== ''
      ? { normalized: { value: resolved }, value: resolved }
      : 'invalid-parameters';
  }
  return 'invalid-shape';
}

/** Resolve a route and its Definition form within the owning Surface. */
export function resolveLocalDefinitionForm<R extends TargetRoute>(routes: readonly R[], routeRef: string, slotRef: string) {
  const matches = routes.filter(route => route.id === routeRef);
  const route = matches.length === 1 ? matches[0] : undefined;
  if (!route) return { reason: 'route-unresolved' } as const;
  const slots = route.slots.filter(slot => slot.id === slotRef);
  const slot = slots.length === 1 ? slots[0] : undefined;
  if (slot?.slotType !== 'definition-form') return { reason: 'slot-unresolved' } as const;
  return { route, slot: slot as R['slots'][number] };
}

/** Walk entries by their authored owner. Used for reverse references in editors. */
export function filingStatusEntries(binding: unknown): readonly Pick<FilingStatusEntry, 'routeRef' | 'slotRef'>[] {
  const groups = record(binding)?.groups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group: unknown) => {
    const entries = record(group)?.forms;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((value: unknown) => {
      const entry = record(value);
      return typeof entry?.routeRef === 'string' && typeof entry.slotRef === 'string'
        ? [{ routeRef: entry.routeRef, slotRef: entry.slotRef }] : [];
    });
  });
}

/**
 * Validate exact local targets and bind their parameters. A caller supplying
 * current params also checks for collisions that can only appear at runtime.
 */
export function resolveFilingStatusTargets<R extends TargetRoute>(
  routes: readonly R[], source: TargetRoute, binding: unknown,
  currentParams?: Readonly<Record<string, string>>,
): {
  groups: { group: FilingStatusGroup; pointer: string; targets: FilingStatusTarget<R, R['slots'][number]>[] }[];
  issues: FilingStatusIssue[];
} {
  const issues: FilingStatusIssue[] = [];
  const authored = record(binding)?.groups;
  if (!Array.isArray(authored) || authored.length === 0) {
    return { groups: [], issues: [{ pointer: '', reason: 'invalid-binding' }] };
  }
  const groupIds = new Set<string>();
  const targetKeys = new Set<string>();
  const sourceParams = new Set(source.params?.map(param => param.name));
  const groups = authored.flatMap((value: unknown, groupIndex) => {
    const groupPointer = `/groups/${groupIndex}`;
    const group = record(value) as FilingStatusGroup | undefined;
    if (!group || typeof group.id !== 'string' || typeof group.label !== 'string'
        || !Array.isArray(group.forms) || group.forms.length === 0) {
      issues.push({ pointer: groupPointer, reason: 'invalid-binding' });
      return [];
    }
    if (Object.prototype.hasOwnProperty.call(group, 'repeat')) {
      const repeat = record(group.repeat);
      if (!repeat || !['catalogRef', 'sourceRef', 'labelField', 'waitingLabel'].every(key =>
        typeof repeat[key] === 'string' && repeat[key].length > 0)) {
        issues.push({ pointer: groupPointer + '/repeat', reason: 'invalid-repeat-source' });
        return [];
      }
    }
    if (groupIds.has(group.id)) issues.push({ pointer: groupPointer, reason: 'duplicate-group' });
    groupIds.add(group.id);

    const targets: FilingStatusTarget<R, R['slots'][number]>[] = [];
    group.forms.forEach((entry, index) => {
      const pointer = `${groupPointer}/forms/${index}`;
      const refuse = (reason: FilingStatusIssue['reason']) => issues.push({ pointer, reason });
      if (!record(entry) || typeof entry.routeRef !== 'string' || typeof entry.slotRef !== 'string') {
        refuse('invalid-binding');
        return;
      }
      const target = resolveLocalDefinitionForm(routes, entry.routeRef, entry.slotRef);
      if ('reason' in target && target.reason) {
        refuse(target.reason);
        return;
      }
      const { route, slot } = target;

      const names = (route.params ?? []).map(param => param.name).sort();
      const targetParamSet = new Set(names);
      const hasRepeat = Object.prototype.hasOwnProperty.call(group, 'repeat');
      const sources = entry.params === undefined ? {} : record(entry.params);
      if (!sources || Object.keys(sources).some(name => !targetParamSet.has(name))) {
        refuse('invalid-parameters');
        return;
      }

      const hasSubject = Object.prototype.hasOwnProperty.call(entry, 'subject') && entry.subject !== undefined;
      if (!hasSubject) {
        const parameters = names.map(name => {
          if (!Object.prototype.hasOwnProperty.call(sources, name)) return undefined;
          const resolved = resolveParamSource(sources[name], hasRepeat, sourceParams, currentParams);
          return typeof resolved === 'string' ? undefined : resolved;
        });
        if (Object.keys(sources).length !== names.length || parameters.some(param => param === undefined)) {
          refuse('invalid-parameters');
          return;
        }
        const key = JSON.stringify([group.repeat ? group.id : null, route.id, slot.id, parameters.map(param => param?.normalized), null]);
        if (targetKeys.has(key)) {
          refuse('duplicate-target');
          return;
        }
        targetKeys.add(key);
        targets.push({ entry, route, slot, pointer, params: Object.fromEntries(
          names.flatMap((name, i) => typeof parameters[i]?.value === 'string' ? [[name, parameters[i].value]] : []),
        ) });
        return;
      }

      if (!Array.isArray(entry.subject) || entry.subject.length === 0) {
        refuse('invalid-subject-predicate');
        return;
      }
      const mapping = record(record(slot.binding)?.subjectKeys);
      if (!mapping || Object.keys(mapping).length === 0) {
        refuse('invalid-subject-predicate');
        return;
      }

      const directNames = Object.keys(sources).sort();
      const directParameters: [string, { normalized: FilingStatusParamSource; value?: string }][] = [];
      for (const name of directNames) {
        const resolved = resolveParamSource(sources[name], hasRepeat, sourceParams, currentParams);
        if (typeof resolved === 'string') {
          refuse('invalid-parameters');
          return;
        }
        directParameters.push([name, resolved]);
      }

      const resolvedPredicates: ResolvedFilingStatusPredicate[] = [];
      for (const [predicateIndex, rawPredicate] of (entry.subject as unknown[]).entries()) {
        const predicatePointer = `${pointer}/subject/${predicateIndex}`;
        const predicate = record(rawPredicate);
        const predicateKey = typeof predicate?.key === 'string' ? predicate.key : undefined;
        if (!predicate || Object.keys(predicate).some(key => !PREDICATE_ALLOWED_KEYS.has(key))
            || typeof predicate.key !== 'string' || !SUBJECT_KEY_PATTERN.test(predicate.key)
            || !Object.prototype.hasOwnProperty.call(mapping, predicate.key)
            || (predicate.op !== 'eq' && predicate.op !== 'le' && predicate.op !== 'ge')
            || (Object.prototype.hasOwnProperty.call(predicate, 'offset')
                && predicate.offset !== undefined
                && !Number.isSafeInteger(predicate.offset))) {
          issues.push({
            pointer: predicatePointer,
            ...(predicateKey !== undefined ? { key: predicateKey } : {}),
            reason: 'invalid-subject-predicate',
          });
          return;
        }
        const mappedParam = mapping[predicate.key];
        if (typeof mappedParam !== 'string' || Object.prototype.hasOwnProperty.call(sources, mappedParam)) {
          issues.push({ pointer: predicatePointer, key: predicate.key, reason: 'invalid-subject-predicate' });
          return;
        }
        const resolvedFrom = resolveParamSource(predicate.from, hasRepeat, sourceParams, currentParams);
        if (resolvedFrom === 'invalid-shape') {
          issues.push({ pointer: `${predicatePointer}/from`, key: predicate.key, reason: 'invalid-subject-predicate' });
          return;
        }
        if (resolvedFrom === 'invalid-parameters') {
          issues.push({ pointer: `${predicatePointer}/from`, key: predicate.key, reason: 'invalid-parameters' });
          return;
        }
        resolvedPredicates.push({
          key: predicate.key,
          op: predicate.op,
          from: resolvedFrom.normalized,
          ...(resolvedFrom.value !== undefined ? { value: resolvedFrom.value } : {}),
          ...(typeof predicate.offset === 'number' ? { offset: predicate.offset } : {}),
        });
      }

      const derivedParams = new Set<string>();
      for (const paramValue of Object.values(mapping)) {
        if (typeof paramValue !== 'string') {
          refuse('invalid-subject-predicate');
          return;
        }
        if (Object.prototype.hasOwnProperty.call(sources, paramValue)) continue;
        if (!targetParamSet.has(paramValue) || derivedParams.has(paramValue)) {
          refuse('invalid-subject-predicate');
          return;
        }
        derivedParams.add(paramValue);
      }

      if (names.some(name => !derivedParams.has(name) && !Object.prototype.hasOwnProperty.call(sources, name))) {
        refuse('invalid-parameters');
        return;
      }

      const canonicalPredicates = resolvedPredicates
        .map(predicate => [predicate.key, predicate.op, predicate.offset ?? 0, predicate.from] as const)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
      const key = JSON.stringify([
        group.repeat ? group.id : null,
        route.id,
        slot.id,
        directParameters.map(([name, param]) => [name, param.normalized]),
        canonicalPredicates,
      ]);
      if (targetKeys.has(key)) {
        refuse('duplicate-target');
        return;
      }
      targetKeys.add(key);
      targets.push({
        entry,
        route,
        slot,
        pointer,
        params: Object.fromEntries(
          directParameters.flatMap(([name, param]) => typeof param.value === 'string' ? [[name, param.value]] : []),
        ),
        subject: resolvedPredicates,
      });
    });
    return [{ group, pointer: groupPointer, targets }];
  });
  return { groups, issues };
}

function subjectSourceIdentity(
  target: FilingStatusTarget<TargetRoute, TargetSlot>, definition: unknown,
): { ok: true; identity: string } | {
  ok: false;
  reason: 'invalid-subject-value' | 'invalid-subject-predicate';
  pointerSuffix?: string;
  key?: string;
} | undefined {
  const document = record(definition);
  if (!document) return undefined;
  const subject = record(document.subject);
  if (!subject) {
    return target.subject
      ? { ok: false, reason: 'invalid-subject-predicate', pointerSuffix: '/subject' }
      : { ok: true, identity: 'implicit-respondent' };
  }
  const keys = record(subject.keys);
  const mapping = record(record(target.slot.binding)?.subjectKeys);
  if (!keys || (!mapping && Object.keys(keys).length)) {
    return target.subject
      ? { ok: false, reason: 'invalid-subject-predicate', pointerSuffix: '/subject' }
      : undefined; // Definition-form validation owns incomplete subjectKeys.
  }
  const sources = [];
  for (const key of Object.keys(keys).sort()) {
    const param = mapping?.[key];
    const source: FilingStatusParamSource | undefined =
      typeof param === 'string' && Object.prototype.hasOwnProperty.call(target.entry.params ?? {}, param)
        ? target.entry.params?.[param] : undefined;
    const dataType = record(keys[key])?.dataType;
    const value = source && 'value' in source ? source.value : undefined;
    if (value !== undefined && parseRouteSubjectKey(dataType, value) === undefined) {
      return { ok: false, reason: 'invalid-subject-value', ...(typeof param === 'string' ? { pointerSuffix: `/params/${param}`, key } : { key }) };
    }
    sources.push([key, dataType, value === undefined ? source : ['value', value]]);
  }
  const predicates = [];
  for (const [predicateIndex, predicate] of (target.subject ?? []).entries()) {
    const pointerSuffix = `/subject/${predicateIndex}`;
    const declared = record(keys[predicate.key]);
    if (!declared) return { ok: false, reason: 'invalid-subject-predicate', pointerSuffix, key: predicate.key };
    const dataType = declared.dataType;
    if ((predicate.op === 'le' || predicate.op === 'ge' || predicate.offset !== undefined) && dataType !== 'integer') {
      return { ok: false, reason: 'invalid-subject-predicate', pointerSuffix, key: predicate.key };
    }
    const literal = 'value' in predicate.from ? predicate.from.value : undefined;
    if (literal !== undefined) {
      const parsed = parseRouteSubjectKey(dataType, literal);
      if (parsed === undefined || (typeof parsed === 'number' && predicate.offset !== undefined && !Number.isSafeInteger(parsed + predicate.offset))) {
        return { ok: false, reason: 'invalid-subject-value', pointerSuffix, key: predicate.key };
      }
      predicates.push([predicate.key, dataType, predicate.op, predicate.offset ?? 0, ['value', parsed]]);
    } else {
      predicates.push([predicate.key, dataType, predicate.op, predicate.offset ?? 0, predicate.from]);
    }
  }
  predicates.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return { ok: true, identity: JSON.stringify([subject.type, sources, predicates]) };
}

/** Every member must address a distinct authored subject through an entry parameter or predicate. */
export function filingRepeatSubjectBound(entry: FilingStatusEntry, binding: unknown, definition: unknown): boolean {
  const keys = record(record(record(definition)?.subject)?.keys);
  const mapping = record(record(binding)?.subjectKeys);
  const boundByParam = Object.keys(keys ?? {}).some(key => {
    const param = mapping?.[key];
    return typeof param === 'string' && typeof record(entry.params?.[param])?.rowField === 'string';
  });
  if (boundByParam) return true;
  return (entry.subject ?? []).some(predicate =>
    Boolean(keys && Object.prototype.hasOwnProperty.call(keys, predicate.key))
    && typeof record(predicate.from)?.rowField === 'string',
  );
}

function filingRepeatFieldIssues(
  group: FilingStatusGroup,
  groupPointer: string,
  schema: unknown,
  targets: readonly { entry: FilingStatusEntry; binding: unknown; definition: unknown; pointer?: string }[],
): FilingStatusIssue[] {
  const repeat = group.repeat;
  if (!repeat) return [{ pointer: `${groupPointer}/repeat`, reason: 'invalid-repeat-source' }];
  const payload = record(schema);
  const array = repeat.rowsField === undefined ? payload
    : payload?.type === 'object' && record(record(payload.properties)?.[repeat.rowsField]);
  if (!array || array.type !== 'array') return [{ pointer: `${groupPointer}/repeat`, reason: 'invalid-repeat-source' }];
  const item = record(array.items);
  const fields = record(item?.properties);
  if (item?.type !== 'object' || !fields || record(fields[repeat.labelField])?.type !== 'string') {
    return [{ pointer: `${groupPointer}/repeat`, reason: 'invalid-repeat-source' }];
  }
  const issues: FilingStatusIssue[] = [];
  for (const { entry, binding, definition, pointer } of targets) {
    const formPointer = pointer ?? `${groupPointer}/repeat`;
    const keys = record(record(record(definition)?.subject)?.keys);
    const mapping = record(record(binding)?.subjectKeys);
    for (const [key, declared] of Object.entries(keys ?? {})) {
      const param = mapping?.[key];
      const source = typeof param === 'string' && entry.params?.[param];
      if (source && 'rowField' in source && record(fields[source.rowField])?.type !== record(declared)?.dataType) {
        issues.push({
          pointer: pointer ? `${formPointer}/params/${param}` : `${groupPointer}/repeat`,
          reason: 'invalid-repeat-source',
          key,
        });
      }
    }
    for (const [predicateIndex, predicate] of (entry.subject ?? []).entries()) {
      if ('rowField' in predicate.from && keys) {
        const declaredType = record(keys[predicate.key])?.dataType;
        if (record(fields[predicate.from.rowField])?.type !== declaredType) {
          issues.push({
            pointer: pointer ? `${formPointer}/subject/${predicateIndex}` : `${groupPointer}/repeat`,
            reason: 'invalid-repeat-source',
            key: predicate.key,
          });
        }
      }
    }
  }
  group.forms.forEach((entry, formIndex) => {
    const formPointer = `${groupPointer}/forms/${formIndex}`;
    for (const [param, source] of Object.entries(entry.params ?? {})) {
      if (!('rowField' in source)) continue;
      const type = record(fields[source.rowField])?.type;
      if (type !== 'string' && type !== 'integer') {
        issues.push({ pointer: `${formPointer}/params/${param}`, reason: 'invalid-repeat-source' });
      }
    }
    for (const [predicateIndex, predicate] of (entry.subject ?? []).entries()) {
      if (!('rowField' in predicate.from)) continue;
      const type = record(fields[predicate.from.rowField])?.type;
      if (type !== 'string' && type !== 'integer') {
        issues.push({ pointer: `${formPointer}/subject/${predicateIndex}`, reason: 'invalid-repeat-source', key: predicate.key });
      }
    }
  });
  return issues;
}

/** Admit only an explicit array of records with the scalar fields the group consumes. */
export function filingRepeatFieldsValid(
  group: FilingStatusGroup, schema: unknown,
  targets: readonly { entry: FilingStatusEntry; binding: unknown; definition: unknown }[],
): boolean {
  return filingRepeatFieldIssues(group, '', schema, targets).length === 0;
}

export function validateFilingStatusTargets(context: AppGraphContext): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const definitionsByUrl = new Map<string | undefined, unknown[]>();
  for (const handle of context.handles) {
    if (handle.artifactKind !== 'definition' || handle.status !== 'loaded') continue;
    const existing = definitionsByUrl.get(handle.ref?.url);
    if (existing) existing.push(handle.document);
    else definitionsByUrl.set(handle.ref?.url, [handle.document]);
  }
  for (const handle of context.handles) {
    const surface = record(handle.document);
    if (handle.artifactKind !== 'surface' || handle.status !== 'loaded'
        || surface?.$formspecSurface !== '0.4' || !Array.isArray(surface.routes)) continue;
    const routes = surface.routes as TargetRoute[];
    routes.forEach((route, routeIndex) => route.slots.forEach((slot, slotIndex) => {
      if (slot.slotType !== 'filing-status') return;
      const resolved = resolveFilingStatusTargets(routes, route, slot.binding);
      const emitted = new Set<string>();
      const report = ({ pointer, reason, key }: FilingStatusIssue) => {
        const dedupeKey = JSON.stringify([pointer, reason, key ?? null]);
        if (emitted.has(dedupeKey)) return;
        emitted.add(dedupeKey);
        diagnostics.push({
          code: 'APP-GRAPH-FILING-STATUS-TARGET', severity: 'error', origin: 'app-graph-validator',
          phase: 'cross-artifact',
          message: key
            ? `Filing-status slot '${slot.id}' cannot resolve subject key '${key}' (${reason}).`
            : `Filing-status slot '${slot.id}' cannot resolve its forms (${reason}).`,
          primarySource: diagnosticSourceForHandle(handle, `/routes/${routeIndex}/slots/${slotIndex}/binding${pointer}`),
          details: { reason },
        });
      };
      resolved.issues.forEach(report);
      for (const { group, pointer, targets } of resolved.groups) {
        if (group.repeat) {
          const repeat = group.repeat;
          const failure = bindingFailure(context, {
            surfaceRef: handle.ref?.url, routeId: route.id, slotId: slot.id,
          }, { ...repeat });
          const catalog = context.handles.find(h => h.artifactKind === 'dataSources' && h.ref?.url === repeat.catalogRef);
          const sources = record(catalog?.document)?.sources;
          const source = Array.isArray(sources) && sources.find(value => record(value)?.id === repeat.sourceRef);
          const descriptor = record(source);
          if (record(descriptor?.runtime)?.delivery === 'draft') {
            for (const producerDoc of definitionsByUrl.get(descriptor?.definitionRef as string) ?? []) {
              const producer = record(producerDoc);
              const keys = record(record(producer?.subject)?.keys);
              if (keys && Object.keys(keys).length) {
                const forms = route.slots.filter(candidate => candidate.slotType === 'definition-form'
                  && record(candidate.binding)?.definitionRef === descriptor?.definitionRef);
                if (forms.length !== 1) report({ pointer: pointer + '/repeat', reason: 'ambiguous-repeat' });
              }
            }
          }
          const forms = targets.flatMap(({ entry, slot, pointer: targetPointer }) => {
            const loaded = definitionsByUrl.get(record(slot.binding)?.definitionRef as string);
            return (loaded?.length ? loaded : [undefined]).map(definition => ({
              entry, binding: slot.binding, definition, pointer: targetPointer,
            }));
          });
          if (failure) {
            report({ pointer: pointer + '/repeat', reason: 'invalid-repeat-source' });
          } else {
            for (const issue of filingRepeatFieldIssues(group, pointer, descriptor?.schema, forms)) {
              report(issue);
            }
          }
        }
        let subjectMapping: string | undefined;
        for (const target of targets) {
          const definitionRef = record(target.slot.binding)?.definitionRef;
          const loadedDefinitions = typeof definitionRef === 'string'
            ? (definitionsByUrl.get(definitionRef) ?? [])
            : [];
          if (group.repeat) {
            const candidates = loadedDefinitions.length ? loadedDefinitions : [undefined];
            if (candidates.some(definition => !filingRepeatSubjectBound(target.entry, target.slot.binding, definition))) {
              report({ pointer: target.pointer, reason: 'ambiguous-repeat' });
            }
          }
          for (const definition of loadedDefinitions) {
            const mapping = subjectSourceIdentity(target, definition);
            if (!mapping) continue;
            if (!mapping.ok) {
              report({
                pointer: `${target.pointer}${mapping.pointerSuffix ?? ''}`,
                reason: mapping.reason,
                ...(mapping.key !== undefined ? { key: mapping.key } : {}),
              });
              continue;
            }
            subjectMapping ??= mapping.identity;
            if (subjectMapping !== mapping.identity) report({ pointer: target.pointer, reason: 'mixed-subject-mappings' });
          }
        }
      }
    }));
  }
  return diagnostics;
}
