/** @filedesc Expands qualified roster rows into ordinary subject-keyed filing destinations. */
import { generationNeedAnchors } from './need-trace.js';
import { filingRepeatFieldsValid, filingRepeatSubjectBound, resolveFilingStatusTargets } from '@formspec-org/app-graph';
import type { FilingStatusEntry, FilingStatusGroup } from '@formspec-org/types';
import { type WidgetDataInputPlan, dataSourceLoadRequest, loadWidgetDataInputs, resolveDataSourceDescriptor } from './data-source-loader.js';
import type { FilingPlanInput, FilingStatusGroupPlan, FilingStatusPlan } from './filing-status.js';

function own(value: unknown, field: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, field)) return undefined;
  return (value as Record<string, unknown>)[field];
}

function memberForms(group: FilingStatusGroup, member: unknown): FilingStatusGroup['forms'] | undefined {
  const forms: FilingStatusEntry[] = [];
  for (const entry of group.forms) {
    const params: NonNullable<FilingStatusEntry['params']> = {};
    for (const [name, source] of Object.entries(entry.params ?? {})) {
      if (!('rowField' in source)) {
        params[name] = source;
        continue;
      }
      const value = own(member, source.rowField);
      if (!(typeof value === 'string' && value.length) && !Number.isSafeInteger(value)) return;
      params[name] = { value: String(value) };
    }
    forms.push({ ...entry, params });
  }
  const [first, ...rest] = forms;
  return first && [first, ...rest];
}

export function planFilingRoster(input: FilingPlanInput, planFixed: (binding: unknown) => FilingStatusPlan): FilingStatusPlan | undefined {
  const binding = input.binding;
  const authored = own(binding, 'groups');
  if (!Array.isArray(authored) || !authored.some(group => own(group, 'repeat') !== undefined)) return;
  const refuse = (reason: string): FilingStatusPlan => ({ status: 'unresolved', reason });
  const template = resolveFilingStatusTargets(input.handle.surface.routes, input.bindingRoute, binding);
  if (template.issues.length) return refuse(template.issues[0]!.reason);
  const context = {
    surfaceId: input.handle.surfaceId, surfaceRef: input.surfaceRef, routeId: input.handle.routeId,
    slotId: input.slotId, params: input.params,
  };
  const inputs: { request: ReturnType<typeof dataSourceLoadRequest>; sourceInput: WidgetDataInputPlan }[] = [];
  for (const { group, targets } of template.groups) {
    if (!group.repeat) continue;
    // The declaration is valid even on a band page without its route inputs.
    // Skip this roster read. Its group will report unavailable alongside fixed groups.
    if (group.forms.some(entry => Object.values(entry.params ?? {}).some(source =>
      'routeParam' in source && !own(input.params, source.routeParam)))) continue;
    const descriptor = resolveDataSourceDescriptor(input.dataSources ?? [], group.repeat);
    if (!descriptor) continue;
    const forms = targets.map(({ entry, slot }) => {
      const ref = own(slot.binding, 'definitionRef');
      return { entry, binding: slot.binding, definition: typeof ref === 'string' ? input.definitions.get(ref) : undefined };
    });
    if (!filingRepeatFieldsValid(group, descriptor.source.schema, forms)) return refuse('invalid-repeat-source');
    if (!forms.every(form => filingRepeatSubjectBound(form.entry, form.binding, form.definition))) return refuse('ambiguous-repeat');
    const source = descriptor.source;
    const definition = source.definitionRef && input.definitions.get(source.definitionRef);
    // A draft read needs the producer's subject. Empty-key subjects are scoped
    // singletons. Keyed subjects need an exact form binding on the declaring route.
    let subject;
    if (source.runtime.delivery === 'draft' && definition && definition.subject) {
      const slots = input.bindingRoute.slots.filter(slot =>
        slot.slotType === 'definition-form' && own(slot.binding, 'definitionRef') === definition.url);
      const producer = slots.length === 1 ? slots[0]!.binding : {};
      subject = input.resolveSubject(definition, producer as Record<string, unknown>, input.bindingRoute, input.params);
      if (!subject) continue;
    }
    const request = dataSourceLoadRequest(descriptor, { ...context, ...(subject && { subject }) });
    const sourceInput: WidgetDataInputPlan = { status: 'ready' as const, required: true, name: group.id, descriptor };
    inputs.push({ request, sourceInput });
  }
  return {
    status: 'roster', requests: inputs.map(({ request }) => request),
    async load(ports, sessionGeneration) {
      const deliveries = new Map(await Promise.all(inputs.map(async ({ request, sourceInput }) => {
        const delivery = await loadWidgetDataInputs({
          inputs: [sourceInput], context: { ...request.context, sessionGeneration }, site: context, ...ports, requireFresh: true,
        });
        return [sourceInput.name, delivery] as const;
      })));
      const groups: FilingStatusGroup[] = [];
      const unavailable = new Set<string>();
      const members = new Map<string, NonNullable<FilingStatusGroupPlan['member']>>();
      const expandedIds = new Map<string, string[]>();
      for (const { group } of template.groups) {
        const { repeat, ...fixedGroup } = group;
        if (!repeat) { groups.push(group); continue; }
        const delivery = deliveries.get(group.id);
        const value = delivery?.status === 'ready' ? delivery.data[group.id] : undefined;
        const rows = delivery?.status === 'ready' && delivery.selections?.[group.id]?.none ? []
          : repeat.rowsField === undefined ? value : own(value, repeat.rowsField);
        const labelled = Array.isArray(rows) ? rows.flatMap(member => {
          const label = own(member, repeat.labelField);
          const forms = memberForms(group, member);
          return typeof label === 'string' && label.trim() && forms ? [{ forms, label }] : [];
        }) : [];
        if (!Array.isArray(rows) || labelled.length !== rows.length) {
          unavailable.add(group.id);
          continue;
        }
        const ids: string[] = [];
        for (const [index, { forms, label }] of labelled.entries()) {
          // Authored IDs cannot contain a slash.
          const id = group.id + '/' + index;
          groups.push({ ...fixedGroup, id, forms });
          members.set(id, { groupId: group.id, label, waitingLabel: repeat.waitingLabel });
          ids.push(id);
        }
        expandedIds.set(group.id, ids);
      }
      // The fixed resolver enforces collisions across groups, including repeat and fixed targets.
      const anchors = (binding as Record<string, unknown>)['x-generation'];
      const plan = groups.length ? planFixed({ groups, 'x-generation': anchors })
        : { status: 'ready' as const, groups: [], needAnchors: [] };
      if (plan.status !== 'ready') return plan;
      const planned = new Map(plan.groups.map(group => [group.id, group]));
      const subjects = new Map<string, Set<string>>();
      for (const [id, member] of members) {
        const rows = planned.get(id)?.rows ?? [];
        const first = rows[0];
        if (!first || first.status !== 'ready' || !first.query.subject || rows.some(row => row.status !== 'ready')) {
          unavailable.add(member.groupId);
          continue;
        }
        const keys = subjects.get(member.groupId) ?? new Set<string>();
        const identity = JSON.stringify([first.query.subject.type, Object.entries(first.query.subject.keys).sort()]);
        if (keys.has(identity)) return refuse('duplicate-repeat-subject');
        keys.add(identity);
        subjects.set(member.groupId, keys);
      }
      const ordered = template.groups.flatMap(({ group }): FilingStatusGroupPlan[] => {
        const refused = unavailable.has(group.id);
        if (!refused) {
          const fixed = planned.get(group.id);
          if (fixed) return [fixed];
          const ids = expandedIds.get(group.id);
          if (ids?.length) return ids.map(id => ({ ...planned.get(id)!, member: members.get(id)! }));
        }
        return [{
          id: group.id, label: group.label, ...(refused && { unavailable: true }),
          needAnchors: generationNeedAnchors(group), rows: [],
        }];
      });
      return { ...plan, groups: ordered, needAnchors: generationNeedAnchors(binding) };
    },
  };
}
