/** @filedesc Live progress freshness across UI edits, layout changes, and engine replacement. */
import { beforeAll, expect, it } from 'vitest';
import { FormEngine } from '@formspec-org/engine';
import { createAssistProvider } from '../src/provider.js';
import { createEngine, ensureEngine, makeComponent, makeProfile } from './helpers.js';

beforeAll(ensureEngine);

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
  expect(before.pages?.[0].complete).toBe(true);
  engine.setValue('contactEmail', null);
  engine.getFieldVM('organization.name')!.setValue('Acme');
  const after = provider.getProgress();
  const { pages: beforePages, ...beforeAggregate } = before;
  const { pages: afterPages, ...afterAggregate } = after;
  expect(afterAggregate).toEqual(beforeAggregate);
  expect(after.pages?.[0].complete).toBe(false);
  expect(after.pages?.[1].filledCount).toBe(1);
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' }))
    .toMatchObject({ pageId: 'component-contact', reason: 'required' });
  // Mutating an earlier public result must never change the provider's cached state.
  after.pages![0].complete = true;
  after.pages![1].filledCount = 999;
  after.pages!.push({ id: 'injected', fieldCount: 0, filledCount: 0, complete: true });
  expect(provider.getProgress().pages).toEqual(before.pages?.map((page, index) => ({
    ...page, ...(index === 0 ? { complete: false, filledCount: 0 } : {}),
    ...(index === 1 ? { filledCount: 1 } : {}),
  })));
});

it('refreshes progress after single, bulk, and profile writes through the public tools', async () => {
  const engine = createEngine();
  const provider = createAssistProvider({ engine, component: makeComponent(), profileMatchThreshold: 0.3, registerWebMCP: false });
  provider.getProgress();
  await invoke(provider, 'formspec.field.set', { path: 'contactEmail', value: 'a@example.org' });
  expect(provider.getProgress().pages?.[0].complete).toBe(true);
  await invoke(provider, 'formspec.field.bulkSet', { entries: [
    { path: 'organization.name', value: 'Acme' }, { path: 'organization.ein', value: '123' },
  ] });
  expect(provider.getProgress().pages?.[1].complete).toBe(true);
  const profile = makeProfile();
  await provider.loadProfile(profile);
  engine.setValue('contactEmail', null);
  expect(provider.getProgress().pages?.[0].complete).toBe(false);
  expect(await invoke(provider, 'formspec.profile.apply', { paths: ['contactEmail'] })).toMatchObject({ filled: [{ path: 'contactEmail' }] });
  expect(provider.getProgress().pages?.[0].complete).toBe(true);
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
  expect(provider.getProgress().pages?.[0]).toMatchObject({ fieldCount: 1, complete: true });
  engine.setValue('mode', 'shown');
  expect(provider.getProgress().pages?.[0].complete).toBe(false);
  engine.setValue('target', 'good');
  expect(provider.getProgress().pages?.[0].complete).toBe(true);
  // Another client can update the public validation signals without changing field values.
  engine.validationResults.target.value = [{ path: 'target', severity: 'error', message: 'External check', constraintKind: 'constraint', source: 'bind' } as any];
  expect(await invoke(provider, 'formspec.form.nextIncomplete', { scope: 'page' })).toMatchObject({ reason: 'invalid' });
  engine.validationResults.target.value = [];
  expect(provider.getProgress().pages?.[0].complete).toBe(true);
});

it('tracks live repeat additions, instance values, removals and engine replacement', async () => {
  const engine = createEngine();
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  const budget = () => provider.getProgress().pages!.find((page) => page.id === 'budget-items');
  engine.setValue('budgetItems[0].description', 'Printing');
  engine.setValue('budgetItems[0].amount', 10);
  expect(budget()).toMatchObject({ fieldCount: 2, filledCount: 2, complete: true });
  engine.addRepeatInstance('budgetItems');
  expect(budget()).toMatchObject({ fieldCount: 4, filledCount: 2, complete: false });
  engine.setValue('budgetItems[1].description', 'Postage');
  engine.setValue('budgetItems[1].amount', 20);
  expect(budget()).toMatchObject({ fieldCount: 4, filledCount: 4, complete: true });
  engine.removeRepeatInstance('budgetItems', 0);
  expect(budget()).toMatchObject({ fieldCount: 2, filledCount: 2, complete: true });
  provider.attach(createEngine());
  expect(budget()).toMatchObject({ fieldCount: 2, filledCount: 0, complete: false });
});

it('refreshes page planning after live definition edits and follows a replacement engine', () => {
  const engine = createEngine();
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  expect(provider.getProgress().pages?.[0].id).toBe('organization');
  engine.getDefinition().items[0].label = 'Renamed';
  expect(provider.getProgress().pages?.[0].id).toBe('renamed');
  provider.attach(new FormEngine({
    $formspec: '1.0', url: 'https://example.org/new', version: '1.0.0', formPresentation: { pageMode: 'wizard' },
    items: [{ key: 'new', type: 'group', label: 'New page', children: [{ key: 'field', type: 'field', dataType: 'string', required: true }] }],
  } as any));
  expect(provider.getProgress().pages).toEqual([{ id: 'new-page', fieldCount: 1, filledCount: 0, complete: false, title: undefined }]);
});

it('sees validation move between pages while global totals stay equal', () => {
  const engine = createEngine();
  engine.setValue('contactEmail', 'a@example.org');
  engine.setValue('organization.name', 'Acme');
  engine.setValue('organization.ein', '123');
  const provider = createAssistProvider({ engine, component: makeComponent(), registerWebMCP: false });
  const issue = (path: string) => [{ path, severity: 'error', message: 'External check', constraintKind: 'constraint', source: 'bind' } as any];
  engine.validationResults.contactEmail.value = issue('contactEmail');
  const before = provider.getProgress();
  expect(before.pages?.[0].complete).toBe(false);
  engine.validationResults.contactEmail.value = [];
  engine.validationResults['organization.name'].value = issue('organization.name');
  const after = provider.getProgress();
  expect(after.valid).toBe(before.valid);
  expect(after.pages?.[0].complete).toBe(true);
  expect(after.pages?.[1].complete).toBe(false);
});
