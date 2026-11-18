/** @filedesc Live progress freshness across UI edits, layout changes, and engine replacement. */
import { beforeAll, expect, it, vi } from 'vitest';
import { FormEngine } from '@formspec-org/engine';
import * as layout from '@formspec-org/layout';
import { createAssistProvider } from '../src/provider.js';
import { createEngine, ensureEngine, makeComponent, makeProfile } from './helpers.js';

beforeAll(ensureEngine);

it('shares counts at the same revision and identifies the first required read-only blank', async () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'https://example.org/shared-counts', version: '1.0.0', title: 'Counts',
    items: [{ key: 'Facts', type: 'group', label: '', children: [
      { key: 'locked', type: 'field', dataType: 'string', label: 'Imported answer', readonly: true, required: true },
      { key: 'later', type: 'field', dataType: 'string', label: 'Second imported answer', readonly: true, required: true },
      { key: 'number', type: 'field', dataType: 'integer' },
      { key: 'agreed', type: 'field', dataType: 'boolean' },
    ] }],
    shapes: [{
      id: 'check-on-submit', target: 'Facts.number', timing: 'submit', severity: 'error',
      constraint: '$Facts.number = 0', message: 'Enter zero',
    }],
  });
  engine.setValue('Facts.number', 0);
  engine.setValue('Facts.agreed', false);
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  expect(provider.getProgress()).toMatchObject({
    total: 2, filled: 2, required: 2, requiredFilled: 0, missingReadonly: 2, valid: 2, ready: false,
    pages: [{ id: 'Facts', title: 'Facts', fieldCount: 2, filledCount: 2, missingReadonly: 2, filled: true }],
  });
  const plan = layout.resolvePageSequence(engine.getDefinition());
  const live = layout.summarizeFormProgress(plan, engine.getEvaluatedFormState());
  const evaluated = vi.spyOn(engine, 'getValidationReport');
  const saved = layout.summarizeFormProgress(plan, engine.getEvaluatedFormState({ profile: 'on-submit' }));
  expect(evaluated).toHaveBeenCalledWith({ profile: 'on-submit' });
  expect(saved.sections).toEqual(live.sections);
  expect(saved.form).toMatchObject({ total: 2, filled: 2, missing: 2, missingReadonly: 2, ready: false });
  expect(saved.sections[0]).toMatchObject({ filled: true, counts: { total: 2, filled: 2, missing: 2 } });
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' }))
    .toMatchObject({ pageId: 'Facts', label: 'Facts', reason: 'blocked-readonly' });
  const blocked = await invoke(provider, 'formspec.form.nextIncomplete');
  expect(blocked).toEqual({ path: 'Facts.locked', label: 'Imported answer', reason: 'blocked-readonly' });
  expect(await invoke(provider, 'formspec.field.describe', { path: blocked.path }))
    .toMatchObject({ label: blocked.label, readonly: true });
  engine.setValue('Facts.number', null);
  expect(await invoke(provider, 'formspec.form.nextIncomplete'))
    .toMatchObject({ path: 'Facts.number', reason: 'empty' });
});

it('reports an invalid editable answer before a required read-only blank in both scopes', async () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'https://example.org/invalid-progress', version: '1.0.0', title: 'Invalid progress',
    items: [
      { key: 'locked', type: 'field', dataType: 'string', readonly: true, required: true },
      { key: 'answer', type: 'field', dataType: 'integer', label: 'Answer', initialValue: 0 },
    ],
    binds: [{ path: 'answer', constraint: '$answer > 0' }],
  });
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  expect(await invoke(provider, 'formspec.form.nextIncomplete'))
    .toEqual({ path: 'answer', label: 'Answer', reason: 'invalid' });
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' }))
    .toMatchObject({ reason: 'invalid' });
});

it('identifies an invalid calculated answer in field scope', async () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'https://example.org/calculated-progress', version: '1.0.0', title: 'Calculated progress',
    items: [
      { key: 'input', type: 'field', dataType: 'integer', initialValue: 1 },
      { key: 'double', type: 'field', dataType: 'integer', label: 'Calculated answer' },
    ],
    binds: [{ path: 'double', calculate: '$input * 2', readonly: 'true', constraint: '$double > 2' }],
  });
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  expect(engine.getFieldVM('double')?.readonly.value).toBe(true);
  expect(engine.getFieldVM('double')?.value.value).toBe(2);
  expect(await invoke(provider, 'formspec.form.nextIncomplete'))
    .toEqual({ path: 'double', label: 'Calculated answer', reason: 'invalid' });
});

it('changes generated and authored page titles with Locale while keeping the same section IDs', () => {
  const engine = createEngine();
  const registration = { engine, registerWebMCP: false } as const;
  const generated = createAssistProvider(registration);
  const component = createAssistProvider({ ...registration, component: makeComponent() });
  const before = generated.getProgress().pages;
  engine.loadLocale({
    $formspecLocale: '2.0', locale: 'fr', version: '1.0.0',
    target: { kind: 'definition', url: engine.getDefinition().url },
    strings: { 'organization.label': 'Organisme', '$component.component-contact.title': 'Coordonnées' },
  });
  engine.setLocale('fr');
  expect(generated.getProgress().pages?.[0]).toMatchObject({ id: 'organization', title: 'Organisme' });
  expect(generated.getProgress().pages?.map(page => page.id)).toEqual(before?.map(page => page.id));
  expect(component.getProgress().pages?.[0]).toMatchObject({ id: 'component-contact', title: 'Coordonnées' });
});

it('keeps validation and readiness unavailable in Assist tools', async () => {
  // An optional blank leaves readiness unknown when there is no validation report.
  const engine = new FormEngine({
    $formspec: '1.0', url: 'https://example.org/unknown-progress', version: '1.0.0', title: 'Unknown progress',
    items: [{ key: 'note', type: 'field', dataType: 'string' }],
  });
  const live = engine.getEvaluatedFormState();
  vi.spyOn(engine, 'getEvaluatedFormState').mockReturnValue({ ...live, report: null });
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  expect(provider.getProgress()).toMatchObject({ total: 1, filled: 0, valid: null, ready: null });
  const result = await provider.invokeTool('formspec.form.describe', {});
  expect(JSON.parse(result.content[0].text)).toMatchObject({ status: 'unavailable' });
});

it('returns an engine error for unavailable page validation even with a required read-only blank', async () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'https://example.org/unavailable-progress', version: '1.0.0', title: 'Unavailable progress',
    items: [
      { key: 'locked', type: 'field', dataType: 'string', readonly: true, required: true },
      { key: 'answer', type: 'field', dataType: 'integer', initialValue: 0 },
    ],
  });
  const live = engine.getEvaluatedFormState();
  vi.spyOn(engine, 'getEvaluatedFormState').mockReturnValue({ ...live, report: null });
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  expect(provider.getProgress()).toMatchObject({ valid: null, ready: false });
  expect(await invoke(provider, 'formspec.form.describe')).toMatchObject({ status: 'in-progress' });
  const result = await provider.invokeTool('formspec.form.nextIncomplete', { scope: 'page' });
  expect(result.isError).toBe(true);
  expect(JSON.parse(result.content[0].text)).toMatchObject({ code: 'ENGINE_ERROR', message: 'Live validation is unavailable' });
});

it('refreshes page labels and membership when the supplied layout changes', async () => {
  const engine = createEngine();
  const component = makeComponent();
  const provider = createAssistProvider({ engine, component, registerWebMCP: false });
  expect(provider.getProgress().pages?.[0]).toMatchObject({ title: 'Component Contact', fieldCount: 1 });
  const section = (component.tree as any).children[0];
  section.title = 'Updated Contact';
  section.children.push({ component: 'TextInput', bind: 'organization.name' });
  expect(provider.getProgress().pages?.[0]).toMatchObject({ title: 'Updated Contact', fieldCount: 2 });
  const next = await provider.invokeTool('formspec.form.nextIncomplete', { scope: 'page' });
  expect(JSON.parse(next.content[0].text)).toMatchObject({ label: 'Updated Contact', reason: 'required' });
});

async function invoke(provider: ReturnType<typeof createAssistProvider>, name: string, input = {}) {
  const result = await provider.invokeTool(name, input);
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text);
}

it('sees UI and other-client writes even when aggregate completion counts stay equal', async () => {
  const engine = createEngine();
  const provider = createAssistProvider({ engine, component: makeComponent(), profileMatchThreshold: 0.3, registerWebMCP: false });
  engine.setValue('contactEmail', 'a@example.org');
  const before = provider.getProgress();
  expect(before.pages?.[0].filled).toBe(true);
  engine.setValue('contactEmail', null);
  engine.getFieldVM('organization.name')!.setValue('Acme');
  const after = provider.getProgress();
  const { pages: beforePages, ...beforeAggregate } = before;
  const { pages: afterPages, ...afterAggregate } = after;
  expect(afterAggregate).toEqual(beforeAggregate);
  expect(after.pages?.[0].filled).toBe(false);
  expect(after.pages?.[1].filledCount).toBe(1);
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' }))
    .toMatchObject({ pageId: 'component-contact', reason: 'required' });
  // Mutating an earlier public result must never change the provider's cached state.
  after.pages![0].filled = true;
  after.pages![1].filledCount = 999;
  after.pages!.push({ id: 'injected', fieldCount: 0, filledCount: 0, missingReadonly: 0, filled: true });
  expect(provider.getProgress().pages).toEqual(before.pages?.map((page, index) => ({
    ...page, ...(index === 0 ? { filled: false, filledCount: 0 } : {}),
    ...(index === 1 ? { filledCount: 1 } : {}),
  })));
});

it('refreshes progress after single, bulk, and profile writes through the public tools', async () => {
  const engine = createEngine();
  const provider = createAssistProvider({ engine, component: makeComponent(), profileMatchThreshold: 0.3, registerWebMCP: false });
  provider.getProgress();
  await invoke(provider, 'formspec.field.set', { path: 'contactEmail', value: 'a@example.org' });
  expect(provider.getProgress().pages?.[0].filled).toBe(true);
  await invoke(provider, 'formspec.field.bulkSet', { entries: [
    { path: 'organization.name', value: 'Acme' }, { path: 'organization.ein', value: '123' },
  ] });
  expect(provider.getProgress().pages?.[1].filled).toBe(true);
  const profile = makeProfile();
  await provider.loadProfile(profile);
  engine.setValue('contactEmail', null);
  expect(provider.getProgress().pages?.[0].filled).toBe(false);
  expect(await invoke(provider, 'formspec.profile.apply', { paths: ['contactEmail'] })).toMatchObject({ filled: [{ path: 'contactEmail' }] });
  expect(provider.getProgress().pages?.[0].filled).toBe(true);
});

it('uses live requiredness, relevance and validation, including changes without value edits', async () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'https://example.org/dynamic', version: '1.0.0',
    items: [
      { key: 'mode', type: 'field', dataType: 'string' },
      { key: 'target', type: 'field', dataType: 'string' },
    ],
    binds: [{ path: 'target', required: "$mode = 'required'", relevant: "$mode != 'hidden'", constraint: "$target != 'bad'" }],
  } as any);
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' })).toMatchObject({ reason: 'empty' });
  engine.setValue('mode', 'required');
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' })).toMatchObject({ reason: 'required' });
  engine.setValue('target', 'bad');
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' })).toMatchObject({ reason: 'invalid' });
  engine.setValue('mode', 'hidden');
  expect(provider.getProgress().pages?.[0]).toMatchObject({ fieldCount: 1, filled: true });
  engine.setValue('mode', 'shown');
  // A filled page can still have errors that keep the form from being ready.
  expect(provider.getProgress()).toMatchObject({ ready: false, pages: [{ filled: true }] });
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' })).toMatchObject({ reason: 'invalid' });
  engine.setValue('target', 'good');
  expect(provider.getProgress().ready).toBe(true);
  // Another client can update the public validation signals without changing field values.
  engine.validationResults.target.value = [{ path: 'target', severity: 'error', message: 'External check', constraintKind: 'constraint', source: 'bind' } as any];
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' })).toMatchObject({ reason: 'invalid' });
  engine.validationResults.target.value = [];
  expect(provider.getProgress().ready).toBe(true);
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' })).toMatchObject({ reason: 'complete' });
});

it('tracks live repeat additions, instance values, removals and engine replacement', async () => {
  const engine = createEngine();
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  const budget = () => provider.getProgress().pages!.find((page) => page.id === 'budgetItems');
  engine.setValue('budgetItems[0].description', 'Printing');
  engine.setValue('budgetItems[0].amount', 10);
  expect(budget()).toMatchObject({ fieldCount: 2, filledCount: 2, filled: true });
  engine.addRepeatInstance('budgetItems');
  expect(budget()).toMatchObject({ fieldCount: 4, filledCount: 2, filled: false });
  engine.setValue('budgetItems[1].description', 'Postage');
  engine.setValue('budgetItems[1].amount', 20);
  expect(budget()).toMatchObject({ fieldCount: 4, filledCount: 4, filled: true });
  engine.removeRepeatInstance('budgetItems', 0);
  expect(budget()).toMatchObject({ fieldCount: 2, filledCount: 2, filled: true });
  provider.attach(createEngine());
  expect(budget()).toMatchObject({ fieldCount: 2, filledCount: 0, filled: false });
});

it('refreshes page planning after live definition edits and follows a replacement engine', () => {
  const engine = createEngine();
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  expect(provider.getProgress().pages?.[0].id).toBe('organization');
  engine.getDefinition().items[0].label = 'Renamed';
  // Renaming a generated page label leaves the Item key and its links stable.
  expect(provider.getProgress().pages?.[0].id).toBe('organization');
  provider.attach(new FormEngine({
    $formspec: '1.0', url: 'https://example.org/new', version: '1.0.0', formPresentation: { pageMode: 'wizard' },
    items: [{ key: 'new', type: 'group', label: 'New page', children: [{ key: 'field', type: 'field', dataType: 'string', required: true }] }],
  } as any));
  expect(provider.getProgress().pages).toEqual([{
    id: 'new', fieldCount: 1, filledCount: 0, missingReadonly: 0, filled: false, title: 'New page',
  }]);
});

it('sees validation move between pages while global totals stay equal', async () => {
  const engine = createEngine();
  engine.setValue('contactEmail', 'a@example.org');
  engine.setValue('organization.name', 'Acme');
  engine.setValue('organization.ein', '123');
  const provider = createAssistProvider({ engine, component: makeComponent(), registerWebMCP: false });
  const issue = (path: string) => [{ path, severity: 'error', message: 'External check', constraintKind: 'constraint', source: 'bind' } as any];
  engine.validationResults.contactEmail.value = issue('contactEmail');
  const before = provider.getProgress();
  // The navigation reason follows the error even when both pages stay filled.
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' }))
    .toMatchObject({ pageId: 'component-contact', reason: 'invalid' });
  engine.validationResults.contactEmail.value = [];
  engine.validationResults['organization.name'].value = issue('organization.name');
  const after = provider.getProgress();
  expect(after.valid).toBe(before.valid);
  expect(after.pages).toEqual(before.pages);
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' }))
    .toMatchObject({ pageId: 'component-org', reason: 'invalid' });
});
