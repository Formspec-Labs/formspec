/** @filedesc Profile selection, learning metadata, and repeat group descriptions. */
import { beforeAll, expect, it } from 'vitest';
import { FormEngine } from '@formspec-org/engine';
import { createAssistProvider } from '../src/provider.js';
import { ProfileStore } from '../src/profile-store.js';
import { createEngine, ensureEngine, makeOntology, makeProfile, MemoryStorage } from './helpers.js';

beforeAll(ensureEngine);

it.each(['default', 'stored', 'current', 'new'] as const)('learns into the %s profile with one timestamp and unchanged selection precedence', async (kind) => {
  const engine = createEngine();
  engine.setValue('organization.ein', '123');
  engine.setValue('contactEmail', 'a@example.org');
  // Empty fields are skipped; the calculated field remains a non-empty raw entry as before.
  const storage = new MemoryStorage();
  const store = new ProfileStore(storage);
  const selected = { ...makeProfile(), id: kind, label: `Existing ${kind}`, concepts: {}, fields: {} };
  if (kind === 'stored') store.save(selected);
  const provider = createAssistProvider({
    engine, storage, ontology: makeOntology(), registerWebMCP: false,
    ...(kind === 'current' ? { profile: selected } : {}),
    now: () => new Date('2026-10-25T12:00:00.000Z'),
  });
  const result = await provider.invokeTool('formspec.profile.learn', kind === 'default' ? {} : { profileRef: kind });
  expect(result.isError).not.toBe(true);
  expect(JSON.parse(result.content[0].text)).toEqual({ savedConcepts: 1, savedFields: 2 });
  const saved = store.load(kind)!;
  expect(saved.label).toBe(kind === 'default' ? 'Default' : kind === 'new' ? 'new' : `Existing ${kind}`);
  expect(saved.created).toBe(kind === 'stored' || kind === 'current' ? selected.created : '2026-10-25T12:00:00.000Z');
  expect(saved.updated).toBe('2026-10-25T12:00:00.000Z');
  const entry = saved.concepts['https://www.irs.gov/terms/employer-identification-number'];
  expect(entry).toMatchObject({ value: '123', lastUsed: saved.updated, source: { timestamp: saved.updated, fieldPath: 'organization.ein' } });
  expect(saved.fields.contactEmail.value).toBe('a@example.org');
  expect(saved.fields['details.summary']).toBeUndefined();
  expect(provider.hasProfile()).toBe(true);
});

it('uses one item lookup for nested repeated fields and parent group bounds', async () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'https://example.org/nested', version: '1.0.0',
    items: [{ key: 'outer', type: 'group', repeatable: true, minRepeat: 1, maxRepeat: 2, children: [
      { key: 'inner', type: 'group', repeatable: true, minRepeat: 1, maxRepeat: 3, children: [
        { key: 'value', type: 'field', dataType: 'string', presentation: { widgetHint: 'TextInput' } },
      ] },
    ] }],
  } as any);
  const provider = createAssistProvider({ engine, registerWebMCP: false });
  const result = await provider.invokeTool('formspec.field.describe', { path: 'outer[0].inner[0].value' });
  expect(result.isError).not.toBe(true);
  expect(JSON.parse(result.content[0].text)).toMatchObject({ repeatIndex: 0, repeatCount: 1, minRepeat: 1, maxRepeat: 3, widget: 'TextInput' });
});

it('skips nonrelevant filled fields while learning', async () => {
  const engine = new FormEngine({
    $formspec: '1.0', url: 'https://example.org/hidden', version: '1.0.0',
    binds: [{ path: 'hidden', relevant: 'false' }],
    items: [{ key: 'visible', type: 'field', dataType: 'string' }, { key: 'hidden', type: 'field', dataType: 'string' }],
  } as any);
  engine.setValue('visible', 'Keep');
  engine.setValue('hidden', 'Skip');
  const storage = new MemoryStorage();
  const provider = createAssistProvider({ engine, storage, registerWebMCP: false });
  const learned = await provider.invokeTool('formspec.profile.learn', {});
  expect(learned.isError).not.toBe(true);
  const saved = new ProfileStore(storage).load('default')!;
  expect(saved.fields.visible.value).toBe('Keep');
  expect(saved.fields.hidden).toBeUndefined();
});
