import { beforeAll, describe, expect, it } from 'vitest';
import { FormEngine } from '@formspec-org/engine';
import { createAssistProvider } from '../src/index.js';
import {
  createEngine,
  ensureEngine,
  FakeModelContext,
  makeComponent,
  makeDefinition,
  makeOntology,
  makeProfile,
  makeReferences,
  makeTheme,
  MemoryStorage,
  nextTask,
} from './helpers.js';

describe('Assist provider tools', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  function createFullProvider() {
    return createAssistProvider({
      engine: createEngine(),
      references: makeReferences(),
      ontology: makeOntology(),
      profile: makeProfile(),
      storage: new MemoryStorage(),
      registries: [
        {
          $formspecRegistry: '1.1',
          publisher: { name: 'Example', url: 'https://example.org' },
          published: '2026-03-26T00:00:00Z',
          entries: [
            {
              name: 'x-concept-org-name',
              category: 'concept',
              version: '1.0.0',
              status: 'stable',
              description: 'Organization name',
              compatibility: { formspecVersion: '^1.0.0' },
              conceptUri: 'https://schema.org/name',
              conceptSystem: 'https://schema.org',
              conceptCode: 'name',
            },
          ],
        },
      ],
      registerWebMCP: false,
      now: () => new Date('2026-03-26T12:00:00.000Z'),
    });
  }

  async function parse(provider: ReturnType<typeof createAssistProvider>, name: string, input: Record<string, unknown>) {
    const result = await provider.invokeTool(name, input);
    expect(result.isError).not.toBe(true);
    expect(result.content).toHaveLength(1);
    return JSON.parse(result.content[0].text);
  }

  async function parseError(provider: ReturnType<typeof createAssistProvider>, name: string, input: Record<string, unknown>) {
    const result = await provider.invokeTool(name, input);
    expect(result.isError).toBe(true);
    return JSON.parse(result.content[0].text);
  }

  // T-11: Split monolithic test into focused tests

  it('exposes tool declarations including formspec.field.help', () => {
    const provider = createFullProvider();
    expect(provider.getTools().map((tool) => tool.name)).toContain('formspec.field.help');
  });

  it('formspec.form.describe returns form metadata', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.form.describe', {});
    expect(result.title).toBe('Grant Application');
    expect(result.description).toBe('Funding request');
    expect(result.url).toBe('https://example.org/forms/grant');
    expect(result.version).toBe('1.0.0');
    expect(result.fieldCount).toBeGreaterThan(0);
    expect(result.pageCount).toBeGreaterThanOrEqual(0);
    expect(result.status).toBe('in-progress');
  });

  it('formspec.field.list returns all fields with filter=all', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.field.list', { filter: 'all' });
    expect(result.map((f: { path: string }) => f.path)).toContain('organization.ein');
  });

  it('formspec.field.describe includes help with concept', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.field.describe', { path: 'organization.ein' });
    expect(result.help.concept.concept).toBe('https://www.irs.gov/terms/employer-identification-number');
  });

  it('formspec.form.progress reports required and filled counts', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.form.progress', {});
    expect(result.required).toBeGreaterThan(0);
    expect(typeof result.filled).toBe('number');
  });

  it('formspec.field.set accepts a valid write', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.field.set', {
      path: 'organization.ein',
      value: '12-3456789',
    });
    expect(result.accepted).toBe(true);
  });

  it('formspec.field.bulkSet sets multiple fields', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.field.bulkSet', {
      entries: [
        { path: 'organization.name', value: 'Acme Foundation' },
        { path: 'contactEmail', value: 'owner@example.org' },
      ],
    });
    expect(result.summary.accepted).toBe(2);
  });

  it('formspec.form.validate returns a validation report', async () => {
    const engine = createEngine();
    engine.getFieldVM('organization.name')?.setValue('Acme');
    engine.getFieldVM('organization.ein')?.setValue('12-3456789');
    engine.getFieldVM('contactEmail')?.setValue('test@example.org');
    engine.getFieldVM('details.summary')?.setValue('Complete');
    const provider = createAssistProvider({ engine, registerWebMCP: false });
    const result = await parse(provider, 'formspec.form.validate', {});
    expect(result).toHaveProperty('valid');
    expect(typeof result.valid).toBe('boolean');
  });

  it('formspec.profile.match finds concept matches', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.profile.match', {});
    expect(result.matches.some((m: { path: string }) => m.path === 'organization.ein')).toBe(true);
  });

  it('formspec.profile.apply fills the requested paths from the in-page match set', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.profile.apply', { paths: ['organization.ein'] });
    expect(result.filled).toEqual([{ path: 'organization.ein' }]);
    expect(result.skipped).toEqual([]);
  });

  it('formspec.profile.learn saves reusable values', async () => {
    const engine = createEngine();
    engine.getFieldVM('organization.name')?.setValue('Acme');
    engine.getFieldVM('organization.ein')?.setValue('12-3456789');
    const provider = createAssistProvider({
      engine,
      ontology: makeOntology(),
      storage: new MemoryStorage(),
      registerWebMCP: false,
      now: () => new Date('2026-03-26T12:00:00.000Z'),
    });
    const result = await parse(provider, 'formspec.profile.learn', {});
    expect(result.savedConcepts).toBeGreaterThan(0);
  });

  it('formspec.form.pages returns page structure', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.form.pages', {});
    expect(result.pages.map((p: { id: string }) => p.id)).toEqual([
      'organization',
      'project-details',
      'budget-items',
      'additional-items',
    ]);
  });

  it('formspec.form.nextIncomplete returns next empty field', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.form.nextIncomplete', {});
    expect(result).toMatchObject({ reason: expect.stringMatching(/empty|required/) });
  });

  // T-1: formspec.field.validate coverage

  it('formspec.field.validate returns results for a valid path', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.validate', { path: 'organization.ein' });
    expect(result).toHaveProperty('results');
    expect(Array.isArray(result.results)).toBe(true);
  });

  it('formspec.field.validate returns NOT_FOUND for unknown path', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const error = await parseError(provider, 'formspec.field.validate', { path: 'nonexistent.field' });
    expect(error.code).toBe('NOT_FOUND');
  });

  // T-2: formspec.field.list filter values

  it('formspec.field.list filters by required', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.list', { filter: 'required' });
    expect(result.every((f: { required: boolean }) => f.required)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('formspec.field.list filters by empty', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.list', { filter: 'empty' });
    expect(result.every((f: { filled: boolean }) => !f.filled)).toBe(true);
  });

  it('formspec.field.list filters by invalid', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.list', { filter: 'invalid' });
    expect(result.every((f: { valid: boolean }) => !f.valid)).toBe(true);
  });

  it('formspec.field.list filters by relevant', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.list', { filter: 'relevant' });
    expect(result.every((f: { relevant: boolean }) => f.relevant)).toBe(true);
  });

  // T-3: formspec.field.set error paths

  it('formspec.field.set returns NOT_FOUND for unknown path', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const error = await parseError(provider, 'formspec.field.set', { path: 'nonexistent', value: 'x' });
    expect(error.code).toBe('NOT_FOUND');
  });

  it('formspec.field.set returns NOT_RELEVANT for hidden field', async () => {
    const def = {
      ...makeDefinition(),
      items: [
        ...makeDefinition().items.filter((i: { key: string }) => i.key !== 'contactEmail'),
        {
          key: 'contactEmail',
          type: 'field' as const,
          dataType: 'string' as const,
          label: 'Contact Email',
          relevant: 'false',
        },
      ],
    };
    const engine = new FormEngine(def as any);
    const provider = createAssistProvider({ engine, registerWebMCP: false });
    const error = await parseError(provider, 'formspec.field.set', { path: 'contactEmail', value: 'x' });
    expect(error.code).toBe('NOT_RELEVANT');
  });

  // T-4: Error codes NOT_RELEVANT, UNSUPPORTED, ENGINE_ERROR

  it('returns UNSUPPORTED for unknown tool name', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const error = await parseError(provider, 'formspec.nonexistent', {});
    expect(error.code).toBe('UNSUPPORTED');
  });

  // T-6: formspec.field.bulkSet partial success

  it('formspec.field.bulkSet reports partial success with mixed valid/invalid paths', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.bulkSet', {
      entries: [
        { path: 'organization.name', value: 'Valid Org' },
        { path: 'derivedScore', value: 99 },
        { path: 'nonexistent', value: 'x' },
      ],
    });
    expect(result.summary.accepted).toBe(1);
    expect(result.summary.rejected).toBe(2);
    expect(result.summary.errors).toBe(2);
    expect(result.results.find((r: { path: string }) => r.path === 'derivedScore').error.code).toBe('READONLY');
    expect(result.results.find((r: { path: string }) => r.path === 'nonexistent').error.code).toBe('NOT_FOUND');
  });

  // T-7: profile.apply declined path

  it('profile.apply with confirm returns every current match as DECLINED when the handler returns false', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      ontology: makeOntology(),
      profile: makeProfile(),
      profileMatchThreshold: 0.3,
      confirmProfileApply: () => false,
      registerWebMCP: false,
    });
    const result = await parse(provider, 'formspec.profile.apply', { confirm: true });
    expect(result.filled).toHaveLength(0);
    expect(result.skipped.map((entry: { path: string; reason: string }) => [entry.path, entry.reason])).toEqual([
      ['organization.ein', 'DECLINED'],
      ['contactEmail', 'DECLINED'],
    ]);
  });

  // T-12: INVALID_PATH error code

  it('returns INVALID_PATH for empty string path to field.describe', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const error = await parseError(provider, 'formspec.field.describe', { path: '' });
    expect(error.code).toBe('INVALID_PATH');
  });

  // T-13: formspec.form.validate with explicit profiles

  it('formspec.form.validate supports live profile', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.form.validate', { profile: 'live' });
    expect(result).toHaveProperty('valid');
  });

  it('formspec.form.validate supports on-submit profile', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.form.validate', { profile: 'on-submit' });
    expect(result).toHaveProperty('valid');
  });

  // T-14: formspec.form.describe full envelope

  it('formspec.form.describe returns all seven spec-defined output fields', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.form.describe', {});
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('version');
    expect(result).toHaveProperty('fieldCount');
    expect(result).toHaveProperty('pageCount');
    expect(result).toHaveProperty('status');
  });

  // T-15: formspec.field.describe full envelope (widget output)

  it('formspec.field.describe includes canonical widgetHint', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.describe', { path: 'contactEmail' });
    expect(result.widget).toBe('TextInput');
  });

  // T-8: Repeat group paths — repeat metadata in field.describe

  it('formspec.field.describe includes repeat metadata for indexed paths', async () => {
    const engine = createEngine();
    // minRepeat:1 automatically creates budgetItems[0]
    const provider = createAssistProvider({ engine, registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.describe', { path: 'budgetItems[0].description' });
    expect(result.repeatIndex).toBe(0);
    expect(result.minRepeat).toBe(1);
    expect(result.maxRepeat).toBe(5);
  });

  // T-8/T-9: Wildcard ancestor reference resolution

  it('resolves references targeting wildcard ancestor paths for indexed fields', async () => {
    const engine = createEngine();
    // minRepeat:1 automatically creates budgetItems[0]
    const provider = createAssistProvider({
      engine,
      references: {
        $formspecReferences: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'https://example.org/forms/grant' },
        references: [
          {
            target: 'budgetItems[*]',
            type: 'documentation',
            audience: 'agent',
            title: 'Budget Item Guidance',
            content: 'Each budget line item needs detail.',
            priority: 'primary',
          },
        ],
      },
      registerWebMCP: false,
    });
    const help = provider.getFieldHelp('budgetItems[0].description', 'agent');
    expect(help.references.documentation?.map((e) => e.title)).toContain('Budget Item Guidance');
  });

  // T-9: Multiple references/ontology documents

  it('merges entries from multiple references documents', async () => {
    const engine = createEngine();
    const refs1 = makeReferences();
    const refs2 = {
      ...makeReferences(),
      references: [
        {
          target: 'contactEmail',
          type: 'documentation',
          audience: 'agent' as const,
          title: 'Email Guide from Doc 2',
          content: 'Use a valid email.',
          priority: 'primary' as const,
        },
      ],
    };
    const provider = createAssistProvider({
      engine,
      references: [refs1, refs2],
      registerWebMCP: false,
    });
    const help = provider.getFieldHelp('contactEmail', 'agent');
    expect(help.references.documentation?.map((e) => e.title)).toContain('Email Guide from Doc 2');
  });

  it('uses last-loaded ontology document for conflicting concept bindings', () => {
    const engine = createEngine();
    const ontology1 = makeOntology();
    const ontology2 = {
      ...makeOntology(),
      concepts: {
        'organization.ein': {
          concept: 'https://example.org/terms/tax-id-override',
          system: 'https://example.org/terms',
          display: 'Overridden Tax ID',
          code: 'TID',
        },
      },
    };
    const provider = createAssistProvider({
      engine,
      ontology: [ontology1, ontology2],
      registerWebMCP: false,
    });
    const help = provider.getFieldHelp('organization.ein');
    expect(help.concept?.concept).toBe('https://example.org/terms/tax-id-override');
  });

  // T-10: Priority sorting within reference types

  it('sorts references by priority within a type', () => {
    const engine = createEngine();
    const provider = createAssistProvider({
      engine,
      references: {
        $formspecReferences: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'https://example.org/forms/grant' },
        references: [
          { target: 'contactEmail', type: 'documentation', audience: 'agent', title: 'Background Doc', content: 'bg', priority: 'background' },
          { target: 'contactEmail', type: 'documentation', audience: 'agent', title: 'Primary Doc', content: 'primary', priority: 'primary' },
          { target: 'contactEmail', type: 'documentation', audience: 'agent', title: 'Supplementary Doc', content: 'supp', priority: 'supplementary' },
        ],
      },
      registerWebMCP: false,
    });
    const help = provider.getFieldHelp('contactEmail', 'agent');
    const titles = help.references.documentation?.map((e) => e.title);
    expect(titles).toEqual(['Primary Doc', 'Supplementary Doc', 'Background Doc']);
  });

  // T-3 continued: formspec.field.set handles missing value parameter

  it('formspec.field.set clears field when value is omitted', async () => {
    const engine = createEngine();
    engine.getFieldVM('contactEmail')?.setValue('owner@example.org');
    const provider = createAssistProvider({ engine, registerWebMCP: false });
    // Clearing a respondent-written value is an overwrite: it needs the compare-and-set witness like any other.
    const result = await parse(provider, 'formspec.field.set', { path: 'contactEmail', expected: 'owner@example.org' });
    expect(result.accepted).toBe(true);
    const postValue = engine.getFieldVM('contactEmail')?.value.value;
    expect(postValue === null || postValue === undefined || postValue === '').toBe(true);
  });

  it('returns structured tool errors for readonly fields', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      registerWebMCP: false,
    });

    const result = await provider.invokeTool('formspec.field.set', {
      path: 'derivedScore',
      value: 5,
    });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text).code).toBe('READONLY');
  });

  it('requires explicit confirmation before applying profile values when requested', async () => {
    const engine = createEngine();
    const provider = createAssistProvider({
      engine,
      ontology: makeOntology(),
      profile: makeProfile(),
      registerWebMCP: false,
    });

    const blocked = await provider.invokeTool('formspec.profile.apply', { paths: ['organization.ein'], confirm: true });
    expect(blocked.isError).toBe(true);
    expect(JSON.parse(blocked.content[0].text).code).toBe('x-confirmation-required');
    expect(engine.getFieldVM('organization.ein')?.value.value).toBe('');

    const seen: Array<{ path: string; value: unknown }> = [];
    const confirmedProvider = createAssistProvider({
      engine: createEngine(),
      ontology: makeOntology(),
      profile: makeProfile(),
      confirmProfileApply: ({ matches }) => {
        seen.push(...matches);
        return true;
      },
      registerWebMCP: false,
    });

    const confirmed = await confirmedProvider.invokeTool('formspec.profile.apply', { paths: ['organization.ein'], confirm: true });
    expect(confirmed.isError).not.toBe(true);
    expect(seen).toEqual([{ path: 'organization.ein', value: '12-3456789' }]);
    expect(JSON.parse(confirmed.content[0].text).filled).toEqual([{ path: 'organization.ein' }]);
  });

  it('supports profile-scoped match and learn operations', async () => {
    const storage = new MemoryStorage();
    const alternateProfile = {
      ...makeProfile(),
      id: 'secondary',
      label: 'Secondary',
      concepts: {
        ...makeProfile().concepts,
        'https://www.irs.gov/terms/employer-identification-number': {
          ...makeProfile().concepts['https://www.irs.gov/terms/employer-identification-number'],
          value: '98-7654321',
        },
      },
    };
    storage.setItem('formspec-assist:profiles', JSON.stringify([makeProfile(), alternateProfile]));

    const engine = createEngine();
    const provider = createAssistProvider({
      engine,
      ontology: makeOntology(),
      storage,
      registerWebMCP: false,
      now: () => new Date('2026-03-26T12:00:00.000Z'),
    });

    const matchResult = await provider.invokeTool('formspec.profile.match', { profileRef: 'secondary' });
    expect(matchResult.isError).not.toBe(true);
    expect(JSON.parse(matchResult.content[0].text).matches.find((match: { path: string }) => match.path === 'organization.ein'))
      .toEqual({ path: 'organization.ein', concept: 'https://www.irs.gov/terms/employer-identification-number', confidence: 1, relationship: 'exact' });

    engine.getFieldVM('organization.ein')?.setValue('11-1111111');
    engine.getFieldVM('organization.name')?.setValue('New Org');
    const learnResult = await provider.invokeTool('formspec.profile.learn', { profileRef: 'secondary' });
    expect(learnResult.isError).not.toBe(true);

    // The wire carries no values (C4); the persisted profile is where learned values are observable.
    const stored = JSON.parse(storage.getItem('formspec-assist:profiles') ?? '[]') as Array<{ id: string; concepts: Record<string, { value: unknown }>; fields: Record<string, { value: unknown }> }>;
    const secondary = stored.find((profile) => profile.id === 'secondary');
    expect(secondary?.concepts['https://www.irs.gov/terms/employer-identification-number']?.value).toBe('11-1111111');
    // No registry here, so organization.name learns under its literal semanticType (§5.3 step 3).
    expect(secondary?.concepts['x-concept-org-name']?.value).toBe('New Org');
    expect(provider.matchProfile('secondary').map((match) => match.path)).toEqual(['organization.ein', 'organization.name']);
  });

  it('filters readonly fields from profile match suggestions', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      profile: {
        ...makeProfile(),
        fields: {
          ...makeProfile().fields,
          derivedScore: {
            value: 42,
            confidence: 1,
            source: { type: 'manual', timestamp: '2026-03-26T12:00:00.000Z' },
            lastUsed: '2026-03-26T12:00:00.000Z',
            verified: true,
          },
        },
      },
      registerWebMCP: false,
    });

    const result = await provider.invokeTool('formspec.profile.match', {});
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text).matches.some((match: { path: string }) => match.path === 'derivedScore')).toBe(false);
  });

  it('rebinds resolver state when attaching a new engine', () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      references: makeReferences(),
      ontology: makeOntology(),
      registerWebMCP: false,
    });

    const nextDefinition = {
      ...makeDefinition(),
      items: makeDefinition().items.map((item) => (
        item.key === 'organization'
          ? {
            ...item,
            children: item.children.map((child) => (
              child.key === 'ein'
                ? { ...child, label: 'Federal Tax ID' }
                : child
            )),
          }
          : item
      )),
    };
    provider.attach(new FormEngine(nextDefinition as any));

    expect(provider.getFieldHelp('organization.ein').label).toBe('Federal Tax ID');
  });

  it('infers pages from component first, then theme, then generated definition groups', async () => {
    const parse = async (
      provider: ReturnType<typeof createAssistProvider>,
      name: string,
      input: Record<string, unknown>,
    ) => {
      const result = await provider.invokeTool(name, input);
      expect(result.isError).not.toBe(true);
      return JSON.parse(result.content[0].text);
    };

    const componentProvider = createAssistProvider({
      engine: createEngine(),
      component: makeComponent(),
      theme: makeTheme(),
      registerWebMCP: false,
    });
    const componentPages = await parse(componentProvider, 'formspec.form.pages', {});
    expect(componentPages.pages.map((page: { id: string; title?: string }) => [page.id, page.title])).toEqual([
      ['component-contact', 'Component Contact'],
      ['component-org', 'Component Organization'],
      ['component-review', 'Review'],
    ]);
    const componentNext = await parse(componentProvider, 'formspec.form.nextIncomplete', { scope: 'page' });
    expect(componentNext).toMatchObject({
      pageId: 'component-contact',
      label: 'Component Contact',
      reason: 'required',
    });

    const themeProvider = createAssistProvider({
      engine: createEngine(),
      theme: makeTheme(),
      registerWebMCP: false,
    });
    const themePages = await parse(themeProvider, 'formspec.form.pages', {});
    expect(themePages.pages.map((page: { id: string; title?: string }) => [page.id, page.title])).toEqual([
      ['theme-contact', 'Theme Contact'],
      ['theme-details', 'Theme Details'],
      [expect.stringMatching(/^fallback-section-/), 'Additional Items'],
    ]);
    expect(themePages.pages.map((page: { id: string; fieldCount: number }) => [page.id, page.fieldCount])).toEqual([
      ['theme-contact', 1],
      ['theme-details', 1],
      [expect.stringMatching(/^fallback-section-/), 5],
    ]);

    const definitionProvider = createAssistProvider({
      engine: createEngine(),
      registerWebMCP: false,
    });
    const definitionPages = await parse(definitionProvider, 'formspec.form.pages', {});
    expect(definitionPages.pages.map((page: { id: string; title?: string }) => [page.id, page.title])).toEqual([
      ['organization', undefined],
      ['project-details', undefined],
      ['budget-items', undefined],
      ['additional-items', undefined],
    ]);
  });

  it('falls back from invalid component or theme documents instead of trusting them', async () => {
    const parse = async (
      provider: ReturnType<typeof createAssistProvider>,
      name: string,
      input: Record<string, unknown>,
    ) => {
      const result = await provider.invokeTool(name, input);
      expect(result.isError).not.toBe(true);
      return JSON.parse(result.content[0].text);
    };

    const invalidComponentProvider = createAssistProvider({
      engine: createEngine(),
      component: {
        ...makeComponent(),
        targetDefinition: { url: 'https://example.org/forms/other' },
      },
      theme: makeTheme(),
      registerWebMCP: false,
    });

    const invalidComponentPages = await parse(invalidComponentProvider, 'formspec.form.pages', {});
    expect(invalidComponentPages.pages.map((page: { id: string }) => page.id)).toEqual([
      'theme-contact',
      'theme-details',
      expect.stringMatching(/^fallback-section-/),
    ]);

    const invalidThemeProvider = createAssistProvider({
      engine: createEngine(),
      theme: {
        ...makeTheme(),
        targetDefinition: { url: 'https://example.org/forms/grant', compatibleVersions: '^2.0.0' },
      },
      registerWebMCP: false,
    });

    const invalidThemePages = await parse(invalidThemeProvider, 'formspec.form.pages', {});
    expect(invalidThemePages.pages.map((page: { id: string }) => page.id)).toEqual([
      'organization',
      'project-details',
      'budget-items',
      'additional-items',
    ]);
  });

  it('uses component-tree theme fallback when the component doc has no explicit pages', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      component: {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'https://example.org/forms/grant' },
        tree: {
          component: 'Stack',
          children: [
            {
              component: 'Stack',
              bind: 'organization',
              children: [{ component: 'TextInput', bind: 'name' }],
            },
          ],
        },
      } as any,
      theme: {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'https://example.org/forms/grant' },
        pages: [
          { id: 'theme-org', title: 'Theme Org', regions: [{ key: 'organization' }] },
        ],
      } as any,
      registerWebMCP: false,
    });

    const result = await provider.invokeTool('formspec.form.pages', {});
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text).pages).toEqual([
      {
        id: 'theme-org',
        title: 'Theme Org',
        fieldCount: 1,
        filledCount: 0,
        complete: false,
      },
      expect.objectContaining({
        id: expect.stringMatching(/^fallback-section-/),
        title: 'Additional Items',
        fieldCount: 5,
        filledCount: 1,
        complete: false,
      }),
    ]);
  });

  it('enforces declared tool input schemas at runtime', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      registerWebMCP: false,
    });

    const result = await provider.invokeTool('formspec.profile.match', { unexpected: true });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      code: 'INVALID_VALUE',
      message: expect.stringMatching(/unexpected/i),
    });

    const invalidAudience = await provider.invokeTool('formspec.field.help', {
      path: 'organization.ein',
      audience: 'robot',
    });
    expect(invalidAudience.isError).toBe(true);
    expect(JSON.parse(invalidAudience.content[0].text)).toMatchObject({
      code: 'INVALID_VALUE',
      message: expect.stringMatching(/audience/i),
    });

    const invalidEntries = await provider.invokeTool('formspec.field.bulkSet', {
      entries: [{ value: 'owner@example.org' }],
    });
    expect(invalidEntries.isError).toBe(true);
    expect(JSON.parse(invalidEntries.content[0].text)).toMatchObject({
      code: 'INVALID_VALUE',
      message: expect.stringMatching(/path/i),
    });

    const invalidPaths = await provider.invokeTool('formspec.profile.apply', { paths: [12] });
    expect(invalidPaths.isError).toBe(true);
    expect(JSON.parse(invalidPaths.content[0].text)).toMatchObject({
      code: 'INVALID_VALUE',
      message: expect.stringMatching(/paths/i),
    });

    const invalidValidateMode = await provider.invokeTool('formspec.form.validate', { mode: 'eventual' });
    expect(invalidValidateMode.isError).toBe(true);
    expect(JSON.parse(invalidValidateMode.content[0].text)).toMatchObject({
      code: 'INVALID_VALUE',
      message: expect.stringMatching(/mode/i),
    });

    const invalidScope = await provider.invokeTool('formspec.form.nextIncomplete', { scope: 'sheet' });
    expect(invalidScope.isError).toBe(true);
    expect(JSON.parse(invalidScope.content[0].text)).toMatchObject({
      code: 'INVALID_VALUE',
      message: expect.stringMatching(/scope/i),
    });
  });

  it('reports meaningful page-level nextIncomplete reasons', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      theme: makeTheme(),
      registerWebMCP: false,
    });

    const requiredResult = await provider.invokeTool('formspec.form.nextIncomplete', { scope: 'page' });
    expect(requiredResult.isError).not.toBe(true);
    expect(JSON.parse(requiredResult.content[0].text)).toMatchObject({
      pageId: 'theme-contact',
      reason: 'required',
    });

    const engine = createEngine();
    engine.getFieldVM('contactEmail')?.setValue('owner@example.org');
    engine.getFieldVM('organization.name')?.setValue('Acme Foundation');
    engine.getFieldVM('organization.ein')?.setValue('12-3456789');
    const emptyProvider = createAssistProvider({
      engine,
      theme: makeTheme(),
      registerWebMCP: false,
    });
    const emptyResult = await emptyProvider.invokeTool('formspec.form.nextIncomplete', { scope: 'page' });
    expect(emptyResult.isError).not.toBe(true);
    expect(JSON.parse(emptyResult.content[0].text)).toMatchObject({
      pageId: 'theme-details',
      reason: 'empty',
    });

    const completeEngine = createEngine();
    completeEngine.getFieldVM('contactEmail')?.setValue('owner@example.org');
    completeEngine.getFieldVM('organization.name')?.setValue('Acme Foundation');
    completeEngine.getFieldVM('organization.ein')?.setValue('12-3456789');
    completeEngine.getFieldVM('details.summary')?.setValue('Ready to submit');
    completeEngine.getFieldVM('budgetItems[0].description')?.setValue('Printing');
    completeEngine.getFieldVM('budgetItems[0].amount')?.setValue(1500);
    const completeProvider = createAssistProvider({
      engine: completeEngine,
      theme: makeTheme(),
      registerWebMCP: false,
    });
    const completeResult = await completeProvider.invokeTool('formspec.form.nextIncomplete', { scope: 'page' });
    expect(completeResult.isError).not.toBe(true);
    expect(JSON.parse(completeResult.content[0].text)).toMatchObject({
      label: 'Complete',
      reason: 'complete',
    });
  });

});

describe('Stale-write guard (draft.3 C5, §4.3 rule 6): compare-and-set', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  const read = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

  it('refuses to overwrite a respondent-written value without proof the agent read it', async () => {
    const engine = createEngine();
    engine.setValue('contactEmail', 'typed@example.org');
    const provider = createAssistProvider({ engine, registerWebMCP: false });

    const result = await provider.invokeTool('formspec.field.set', { path: 'contactEmail', value: 'agent@example.org' });
    expect(result.isError).toBe(true);
    expect(read(result)).toEqual({
      code: 'x-user-edited',
      message: expect.stringMatching(/field\.describe.*expected/),
      path: 'contactEmail',
      retryable: false,
    });
    // No value echo: the agent reads the field through field.describe, never through an error.
    expect(JSON.stringify(read(result))).not.toContain('typed@example.org');
    expect(engine.getFieldVM('contactEmail')?.value.value).toBe('typed@example.org');
    expect(engine.getFieldVM('contactEmail')?.writeSource.value).toBe('user');
  });

  it('writes over a respondent value when expected deep-equals the current value, recording the assistant as the writer', async () => {
    const engine = createEngine();
    engine.setValue('contactEmail', 'typed@example.org');
    const provider = createAssistProvider({ engine, registerWebMCP: false });

    const stale = await provider.invokeTool('formspec.field.set', { path: 'contactEmail', value: 'agent@example.org', expected: 'old@example.org' });
    expect(read(stale)).toMatchObject({ code: 'x-user-edited', message: expect.stringMatching(/changed since/) });

    const described = read(await provider.invokeTool('formspec.field.describe', { path: 'contactEmail' }));
    const result = await provider.invokeTool('formspec.field.set', { path: 'contactEmail', value: 'agent@example.org', expected: described.value });
    expect(result.isError).not.toBe(true);
    expect(read(result)).toMatchObject({ accepted: true, value: 'agent@example.org' });
    expect(engine.getFieldVM('contactEmail')?.writeSource.value).toBe('assist');
  });

  it('compares expected structurally for array values', async () => {
    const engine = new FormEngine({
      $formspec: '1.0',
      url: 'https://example.org/forms/multi',
      version: '1.0.0',
      title: 'Multi',
      items: [{ key: 'tags', type: 'field', dataType: 'multiChoice', label: 'Tags', options: [{ value: 'r', label: 'Red' }, { value: 'g', label: 'Green' }] }],
    } as any);
    engine.setValue('tags', ['r', 'g']);
    const provider = createAssistProvider({ engine, registerWebMCP: false });

    const mismatch = read(await provider.invokeTool('formspec.field.set', { path: 'tags', value: ['g'], expected: ['g', 'r'] }));
    expect(mismatch.code).toBe('x-user-edited');
    const match = read(await provider.invokeTool('formspec.field.set', { path: 'tags', value: ['g'], expected: ['r', 'g'] }));
    expect(match).toMatchObject({ accepted: true, value: ['g'] });
  });

  it('always allows writing an empty field and re-writing the assistant\'s own value', async () => {
    const engine = createEngine();
    const provider = createAssistProvider({ engine, registerWebMCP: false });

    const first = await provider.invokeTool('formspec.field.set', { path: 'contactEmail', value: 'agent@example.org' });
    expect(first.isError).not.toBe(true);
    const second = await provider.invokeTool('formspec.field.set', { path: 'contactEmail', value: 'agent2@example.org' });
    expect(second.isError).not.toBe(true);
    expect(engine.getFieldVM('contactEmail')?.value.value).toBe('agent2@example.org');

    // The respondent takes the field back; the assistant is locked out again.
    engine.setValue('contactEmail', 'mine@example.org');
    const third = await provider.invokeTool('formspec.field.set', { path: 'contactEmail', value: 'agent3@example.org' });
    expect(read(third).code).toBe('x-user-edited');
  });

  it('treats a hydrated response value as the respondent\'s', async () => {
    const engine = createEngine();
    engine.loadResponseData({ contactEmail: 'hydrated@example.org' });
    const provider = createAssistProvider({ engine, registerWebMCP: false });

    const result = await provider.invokeTool('formspec.field.set', { path: 'contactEmail', value: 'agent@example.org' });
    expect(read(result).code).toBe('x-user-edited');
  });

  it('refuses a calculated field as READONLY rather than misreading its null write source as the respondent\'s', async () => {
    const engine = new FormEngine({
      $formspec: '1.0',
      url: 'https://example.org/forms/calc',
      version: '1.0.0',
      title: 'Calc',
      items: [
        { key: 'a', type: 'field', dataType: 'integer', label: 'A' },
        { key: 'double', type: 'field', dataType: 'integer', label: 'Double', calculate: '$a * 2' },
        { key: 'viaBind', type: 'field', dataType: 'integer', label: 'Via bind' },
      ],
      binds: [{ path: 'viaBind', calculate: '$a + 1' }],
    } as any);
    engine.setValue('a', 4);
    const provider = createAssistProvider({ engine, registerWebMCP: false });
    expect(engine.getFieldVM('double')?.value.value).toBe(8);

    expect(read(await provider.invokeTool('formspec.field.set', { path: 'double', value: 1 }))).toMatchObject({ code: 'READONLY', path: 'double' });
    expect(read(await provider.invokeTool('formspec.field.set', { path: 'viaBind', value: 1 }))).toMatchObject({ code: 'READONLY', path: 'viaBind' });
    const described = read(await provider.invokeTool('formspec.field.describe', { path: 'viaBind' }));
    expect(described).toMatchObject({ calculated: true, expression: '$a + 1' });
  });

  it('bulkSet counts guarded entries as skipped and honours a per-entry expected', async () => {
    const engine = createEngine();
    engine.setValue('organization.name', 'Typed Org');
    const provider = createAssistProvider({ engine, registerWebMCP: false });

    const guarded = read(await provider.invokeTool('formspec.field.bulkSet', {
      entries: [
        { path: 'organization.name', value: 'Agent Org' },
        { path: 'contactEmail', value: 'agent@example.org' },
        { path: 'nonexistent', value: 'x' },
      ],
    }));
    expect(guarded.summary).toEqual({ accepted: 1, rejected: 1, skipped: 1, errors: 2 });
    expect(guarded.results.find((entry: { path: string }) => entry.path === 'organization.name')).toMatchObject({
      accepted: false,
      error: { code: 'x-user-edited', retryable: false },
    });
    expect(guarded.results.find((entry: { path: string }) => entry.path === 'organization.name').error).not.toHaveProperty('currentValue');
    expect(engine.getFieldVM('organization.name')?.value.value).toBe('Typed Org');

    const overwritten = read(await provider.invokeTool('formspec.field.bulkSet', {
      entries: [{ path: 'organization.name', value: 'Agent Org', expected: 'Typed Org' }],
    }));
    expect(overwritten.summary).toEqual({ accepted: 1, rejected: 0, skipped: 0, errors: 0 });
    expect(engine.getFieldVM('organization.name')?.value.value).toBe('Agent Org');
  });

  it('profile.apply skips guarded paths with x-user-edited unless the path entry carries a matching expected', async () => {
    const engine = createEngine();
    engine.setValue('organization.ein', '99-9999999');
    const provider = createAssistProvider({ engine, ontology: makeOntology(), profile: makeProfile(), registerWebMCP: false });

    const skipped = read(await provider.invokeTool('formspec.profile.apply', { paths: ['organization.ein'] }));
    expect(skipped).toMatchObject({ filled: [], skipped: [{ path: 'organization.ein', reason: 'x-user-edited' }] });

    const stale = read(await provider.invokeTool('formspec.profile.apply', { paths: [{ path: 'organization.ein', expected: '11-1111111' }] }));
    expect(stale.skipped).toEqual([{ path: 'organization.ein', reason: 'x-user-edited' }]);

    const filled = read(await provider.invokeTool('formspec.profile.apply', { paths: [{ path: 'organization.ein', expected: '99-9999999' }] }));
    expect(filled.filled).toEqual([{ path: 'organization.ein' }]);
    expect(engine.getFieldVM('organization.ein')?.value.value).toBe('12-3456789');
    expect(engine.getFieldVM('organization.ein')?.writeSource.value).toBe('assist');
  });
});

describe('Option-label writes (draft.3 C3, §3.3)', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  const read = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

  function makeChoiceEngine() {
    return new FormEngine({
      $formspec: '1.0',
      url: 'https://example.org/forms/choice',
      version: '1.0.0',
      title: 'Choice form',
      items: [
        {
          key: 'state',
          type: 'field',
          dataType: 'choice',
          label: 'State',
          options: [
            { value: 'CA', label: 'California' },
            { value: 'NY', label: 'New York' },
          ],
        },
        {
          key: 'kind',
          type: 'field',
          dataType: 'choice',
          label: 'Kind',
          options: [
            { value: 'other-a', label: 'Other' },
            { value: 'other-b', label: 'other' },
          ],
        },
        {
          key: 'tags',
          type: 'field',
          dataType: 'multiChoice',
          label: 'Tags',
          options: [
            { value: 'r', label: 'Red' },
            { value: 'g', label: 'Green' },
          ],
        },
        { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
      ],
    } as any);
  }

  it('accepts an option label case-insensitively and stores the option value', async () => {
    const engine = makeChoiceEngine();
    const provider = createAssistProvider({ engine, registerWebMCP: false });

    const byLabel = read(await provider.invokeTool('formspec.field.set', { path: 'state', value: 'new york' }));
    expect(byLabel).toMatchObject({ accepted: true, value: 'NY' });
    expect(engine.getFieldVM('state')?.value.value).toBe('NY');

    const byValue = read(await provider.invokeTool('formspec.field.set', { path: 'state', value: 'CA' }));
    expect(byValue).toMatchObject({ accepted: true, value: 'CA' });

    const cleared = read(await provider.invokeTool('formspec.field.set', { path: 'state', value: null }));
    expect(cleared.accepted).toBe(true);
  });

  it('rejects an unknown or ambiguous label with the option list', async () => {
    const provider = createAssistProvider({ engine: makeChoiceEngine(), registerWebMCP: false });

    const unknown = read(await provider.invokeTool('formspec.field.set', { path: 'state', value: 'Kalifornia' }));
    expect(unknown).toEqual({
      code: 'INVALID_VALUE',
      message: 'state accepts one of: CA — California, NY — New York (got "Kalifornia")',
      path: 'state',
      retryable: true,
    });

    const ambiguous = read(await provider.invokeTool('formspec.field.set', { path: 'kind', value: 'OTHER' }));
    expect(ambiguous).toMatchObject({
      code: 'INVALID_VALUE',
      message: expect.stringMatching(/ambiguous.*other-a — Other, other-b — other/),
    });
  });

  it('maps every element of a multiChoice write and leaves non-choice fields alone', async () => {
    const engine = makeChoiceEngine();
    const provider = createAssistProvider({ engine, registerWebMCP: false });

    const tags = read(await provider.invokeTool('formspec.field.bulkSet', {
      entries: [
        { path: 'tags', value: ['red', 'g'] },
        { path: 'note', value: 'California' },
      ],
    }));
    expect(tags.summary.accepted).toBe(2);
    expect(engine.getFieldVM('tags')?.value.value).toEqual(['r', 'g']);
    expect(engine.getFieldVM('note')?.value.value).toBe('California');
  });

  it('profile.apply resolves a profile label to the option value', async () => {
    const engine = makeChoiceEngine();
    const now = '2026-03-26T12:00:00.000Z';
    const provider = createAssistProvider({
      engine,
      profile: {
        id: 'default', label: 'Default', created: now, updated: now, concepts: {},
        fields: { state: { value: 'california', confidence: 1, source: { type: 'manual', timestamp: now }, lastUsed: now, verified: true } },
      },
      profileMatchThreshold: 0.3,
      registerWebMCP: false,
    });

    const result = read(await provider.invokeTool('formspec.profile.apply', {}));
    expect(result.filled).toEqual([{ path: 'state' }]);
    expect(engine.getFieldVM('state')?.value.value).toBe('CA');
  });
});

describe('Apply by path (draft.3 C4, §3.5)', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  const read = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

  function makeMatchingProvider(extra: Partial<Parameters<typeof createAssistProvider>[0]> = {}) {
    // organization.ein (exact concept) and organization.name (registry concept) match; contactEmail is field-key below threshold.
    return createAssistProvider({
      engine: createEngine(),
      ontology: makeOntology(),
      profile: makeProfile(),
      registries: [
        {
          $formspecRegistry: '1.1',
          publisher: { name: 'Example', url: 'https://example.org' },
          published: '2026-03-26T00:00:00Z',
          entries: [
            {
              name: 'x-concept-org-name',
              category: 'concept',
              version: '1.0.0',
              status: 'stable',
              description: 'Organization name',
              compatibility: { formspecVersion: '^1.0.0' },
              conceptUri: 'https://schema.org/name',
              conceptSystem: 'https://schema.org',
              conceptCode: 'name',
            },
          ],
        },
      ],
      registerWebMCP: false,
      ...extra,
    });
  }

  it('applies every current match when paths is omitted, reporting paths only', async () => {
    const provider = makeMatchingProvider();
    const result = read(await provider.invokeTool('formspec.profile.apply', {}));
    expect(result.filled).toEqual([{ path: 'organization.ein' }, { path: 'organization.name' }]);
    expect(result.skipped).toEqual([]);
    expect(result.validation).toHaveProperty('valid');
  });

  it('shows the human only the resolvable subset, in the caller\'s order, and reports the rest as skipped', async () => {
    const seen: Array<Array<{ path: string; value: unknown }>> = [];
    const provider = makeMatchingProvider({
      confirmProfileApply: ({ matches }) => {
        seen.push(matches);
        return true;
      },
    });

    const result = read(await provider.invokeTool('formspec.profile.apply', {
      paths: ['organization.name', 'nope', 'contactEmail', 'derivedScore', 'organization.ein'],
      confirm: true,
    }));
    expect(seen).toEqual([[
      { path: 'organization.name', value: 'Acme Foundation' },
      { path: 'organization.ein', value: '12-3456789' },
    ]]);
    expect(result.skipped).toEqual([
      { path: 'nope', reason: 'NOT_FOUND' },
      { path: 'contactEmail', reason: 'x-not-matched' },
      { path: 'derivedScore', reason: 'READONLY' },
    ]);
    expect(result.filled).toEqual([{ path: 'organization.name' }, { path: 'organization.ein' }]);
  });

  it('reports NOT_RELEVANT for a hidden field the match set left out', async () => {
    const definition = {
      ...makeDefinition(),
      items: makeDefinition().items.map((item) => (
        item.key === 'organization'
          ? { ...item, children: item.children.map((child) => (child.key === 'ein' ? { ...child, relevant: 'false' } : child)) }
          : item
      )),
    };
    const provider = makeMatchingProvider({ engine: new FormEngine(definition as any) });
    const result = read(await provider.invokeTool('formspec.profile.apply', { paths: ['organization.ein'] }));
    expect(result.skipped).toEqual([{ path: 'organization.ein', reason: 'NOT_RELEVANT' }]);
  });

  it('decides guarded paths before confirmation', async () => {
    const engine = createEngine();
    engine.setValue('organization.ein', '99-9999999');
    const seen: Array<Array<{ path: string; value: unknown }>> = [];
    const provider = makeMatchingProvider({
      engine,
      confirmProfileApply: ({ matches }) => {
        seen.push(matches);
        return true;
      },
    });

    const result = read(await provider.invokeTool('formspec.profile.apply', { confirm: true }));
    expect(seen).toEqual([[{ path: 'organization.name', value: 'Acme Foundation' }]]);
    expect(result.skipped).toEqual([{ path: 'organization.ein', reason: 'x-user-edited' }]);
    expect(result.filled).toEqual([{ path: 'organization.name' }]);
  });

  it('never calls the confirmation handler when nothing is writable', async () => {
    let calls = 0;
    const provider = makeMatchingProvider({
      confirmProfileApply: () => {
        calls += 1;
        return true;
      },
    });
    const result = read(await provider.invokeTool('formspec.profile.apply', { paths: ['nope'], confirm: true }));
    expect(calls).toBe(0);
    expect(result).toMatchObject({ filled: [], skipped: [{ path: 'nope', reason: 'NOT_FOUND' }] });
  });
});

describe('Profile capability (draft.3 C2)', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  const registered = async (modelContext: FakeModelContext) => (await modelContext.getTools()).map((tool) => tool.name);
  const profileTools = ['formspec.profile.apply', 'formspec.profile.learn', 'formspec.profile.match'];

  it('hasProfile is a capability: a configured profile or store, not the default in-memory store', () => {
    expect(createAssistProvider({ engine: createEngine(), registerWebMCP: false }).hasProfile()).toBe(false);
    expect(createAssistProvider({ engine: createEngine(), profile: makeProfile(), registerWebMCP: false }).hasProfile()).toBe(true);
    expect(createAssistProvider({ engine: createEngine(), storage: new MemoryStorage(), registerWebMCP: false }).hasProfile()).toBe(true);

    const late = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    late.loadProfile(makeProfile());
    expect(late.hasProfile()).toBe(true);
  });

  it('registers the profile tools additively when a profile arrives after a default registration, and detach removes them too', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext });
    await provider.ready;
    expect(await registered(modelContext)).not.toEqual(expect.arrayContaining(profileTools));

    // loadProfile resolves once the host has acknowledged the added tools — no timing guess needed.
    await provider.loadProfile(makeProfile());
    expect(await registered(modelContext)).toEqual(expect.arrayContaining(profileTools));

    // Idempotent: a second profile load does not try to register twice (the fake rejects duplicates).
    await provider.loadProfile(makeProfile());
    expect((await registered(modelContext)).filter((name) => name.startsWith('formspec.profile.'))).toHaveLength(3);

    provider.detach();
    await nextTask();
    expect(await registered(modelContext)).toEqual([]);
  });

  it('profile.learn creates the capability too: the profile tools register after a learn on a profile-less provider', async () => {
    const modelContext = new FakeModelContext();
    const engine = createEngine();
    engine.setValue('organization.name', 'Acme');
    const provider = createAssistProvider({ engine, modelContext, ontology: makeOntology() });
    await provider.ready;
    expect(provider.hasProfile()).toBe(false);

    const learned = await provider.invokeTool('formspec.profile.learn', {});
    expect(learned.isError).not.toBe(true);
    expect(provider.hasProfile()).toBe(true);
    await nextTask();
    expect(await registered(modelContext)).toEqual(expect.arrayContaining(profileTools));
  });

  it('a refused first registration leaves no orphan profile tools to register later', async () => {
    const modelContext = new FakeModelContext();
    const first = createAssistProvider({ engine: createEngine(), modelContext });
    await first.ready;
    const second = createAssistProvider({ engine: createEngine(), modelContext });
    await expect(second.ready).rejects.toThrow('duplicate tool');

    await second.loadProfile(makeProfile());
    expect((await registered(modelContext)).filter((name) => name.startsWith('formspec.profile.'))).toHaveLength(0);
    second.dispose();
    first.dispose();
  });
});
