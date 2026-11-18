/** @filedesc Expands qualified roster rows into ordinary subject-keyed filing destinations. */
import { generationNeedAnchors } from './need-trace.js';
import { filingRepeatFieldsValid, filingRepeatSubjectBound, resolveFilingStatusTargets } from '@formspec-org/app-graph';
import type { FilingStatusGroup } from '@formspec-org/types';
import { type WidgetDataInputPlan, dataSourceLoadRequest, loadWidgetDataInputs, resolveDataSourceDescriptor } from './data-source-loader.js';
import type { FilingPlanInput, FilingStatusGroupPlan, FilingStatusPlan } from './filing-status.js';

function own(value: unknown, field: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, field)) return undefined;
  return (value as Record<string, unknown>)[field];
}

function memberForms(group: FilingStatusGroup, member: unknown) {
  return group.forms.map(entry => ({
    ...entry,
    params: Object.fromEntries(Object.entries(entry.params ?? {}).map(([name, source]) => {
      if (!('rowField' in source)) return [name, source];
      const value = own(member, source.rowField);
      if (!(typeof value === 'string' && value.length) && !Number.isSafeInteger(value)) return [name, {}];
      return [name, { value: String(value) }];
    })),
  }));
}

export function planFilingRoster(input: FilingPlanInput, planFixed: (binding: unknown) => FilingStatusPlan): FilingStatusPlan | undefined {
  const binding = input.binding;
  const authored = own(binding, 'groups');
  if (!Array.isArray(authored) || !authored.some(group => own(group, 'repeat') !== undefined)) return;
  const refuse = (reason: string): FilingStatusPlan => ({ status: 'unresolved', reason });
  const template = resolveFilingStatusTargets(input.handle.surface.routes, input.bindingRoute, binding, input.params);
  if (template.issues.length) return refuse(template.issues[0]!.reason);
  const context = {
    surfaceId: input.handle.surfaceId, surfaceRef: input.surfaceRef, routeId: input.handle.routeId,
    slotId: input.slotId, params: input.params,
  };
  const inputs: { request: ReturnType<typeof dataSourceLoadRequest>; sourceInput: WidgetDataInputPlan }[] = [];
  for (const { group, targets } of template.groups) {
    if (!group.repeat) continue;
    const descriptor = resolveDataSourceDescriptor(input.dataSources ?? [], group.repeat);
    const forms = targets.map(({ entry, slot }) => {
      const ref = own(slot.binding, 'definitionRef');
      return { entry, binding: slot.binding, definition: typeof ref === 'string' ? input.definitions.get(ref) : undefined };
    });
    if (!descriptor || !filingRepeatFieldsValid(group, descriptor.source.schema, forms)) return refuse('invalid-repeat-source');
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
      if (!subject) return refuse('roster-subject-unavailable');
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
      const groups = [];
      const unavailable = new Set<string>();
      const members = new Map<string, NonNullable<FilingStatusGroupPlan['member']>>();
      for (const { group } of template.groups) {
        const { repeat, ...fixedGroup } = group;
        if (!repeat) { groups.push(group); continue; }
        const delivery = deliveries.get(group.id);
        if (delivery?.status !== 'ready') {
          unavailable.add(group.id);
          groups.push({ ...group, forms: [] });
          continue;
        }
        const value = delivery.data[group.id];
        const rows = delivery.selections?.[group.id]?.none ? []
          : repeat.rowsField === undefined ? value : own(value, repeat.rowsField);
        if (!Array.isArray(rows)) return refuse('invalid-repeat-rows');
        if (!rows.length) groups.push({ ...group, forms: [] });
        for (const [index, member] of rows.entries()) {
          const label = own(member, repeat.labelField);
          if (typeof label !== 'string' || !label.trim()) return refuse('invalid-repeat-label');
          // Authored IDs cannot contain a slash.
          const id = group.id + '/' + index;
          groups.push({ ...fixedGroup, id, forms: memberForms(group, member) });
          members.set(id, { groupId: group.id, label, waitingLabel: repeat.waitingLabel });
        }
      }
      // The fixed resolver enforces collisions across groups, including repeat and fixed targets.
      const populated = groups.filter(group => group.forms.length);
      const anchors = (binding as Record<string, unknown>)['x-generation'];
      const plan = populated.length ? planFixed({ groups: populated, 'x-generation': anchors })
        : { status: 'ready' as const, groups: [], needAnchors: [] };
      if (plan.status !== 'ready') return plan;
      const planned = new Map(plan.groups.map(group => [group.id, group]));
      const subjects = new Map<string, Set<string>>();
      const ordered: FilingStatusGroupPlan[] = [];
      for (const group of groups) {
        const ready = planned.get(group.id);
        const member = members.get(group.id);
        if (!ready && group.forms.length) return refuse('invalid-repeat-rows');
        if (!ready) {
          ordered.push({ id: group.id, label: group.label, ...(unavailable.has(group.id) && { unavailable: true }), needAnchors: generationNeedAnchors(group), rows: [] });
        } else if (member) {
          const first = ready.rows[0];
          if (!first || first.status !== 'ready' || !first.query.subject || ready.rows.some(r => r.status !== 'ready')) {
            return refuse('invalid-repeat-subject');
          }
          const keys = subjects.get(member.groupId) ?? new Set<string>();
          const identity = JSON.stringify([first.query.subject.type, Object.entries(first.query.subject.keys).sort()]);
          if (keys.has(identity)) return refuse('duplicate-repeat-subject');
          keys.add(identity);
          subjects.set(member.groupId, keys);
          ordered.push({ ...ready, member });
        } else ordered.push(ready);
      }
      return { ...plan, groups: ordered, needAnchors: generationNeedAnchors(binding) };
    },
  };
}
