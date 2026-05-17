import { beforeAll, describe, expect, it } from 'vitest';
import { FormEngine } from '@formspec-org/engine';
import { createAssistProvider } from '../src/index.js';
import {
  createEngine,
  ensureEngine,
  makeComponent,
  makeDefinition,
  makeOntology,
  makeProfile,
  makeReferences,
  makeTheme,
  MemoryStorage,
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
          $formspecRegistry: '1.0',
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

  it('formspec.profile.apply fills matched values', async () => {
    const provider = createFullProvider();
    const result = await parse(provider, 'formspec.profile.apply', {
      matches: [{ path: 'contactEmail', value: 'owner@example.org' }],
    });
    expect(result.filled).toEqual([{ path: 'contactEmail', value: 'owner@example.org' }]);
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
    expect(result.pages.map((p: { id: string }) => p.id)).toEqual(['org', 'details']);
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

  it('profile.apply with confirm returns all entries as DECLINED when handler returns false', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      confirmProfileApply: () => false,
      registerWebMCP: false,
    });
    const result = await parse(provider, 'formspec.profile.apply', {
      matches: [
        { path: 'contactEmail', value: 'owner@example.org' },
        { path: 'organization.name', value: 'Acme' },
      ],
      confirm: true,
    });
    expect(result.filled).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(result.skipped.every((s: { reason: string }) => s.reason === 'DECLINED')).toBe(true);
  });

  // T-12: INVALID_PATH error code

  it('returns INVALID_PATH for empty string path to field.describe', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const error = await parseError(provider, 'formspec.field.describe', { path: '' });
    expect(error.code).toBe('INVALID_PATH');
  });

  // T-13: formspec.form.validate with explicit modes

  it('formspec.form.validate supports continuous mode', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.form.validate', { mode: 'continuous' });
    expect(result).toHaveProperty('valid');
  });

  it('formspec.form.validate supports submit mode', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.form.validate', { mode: 'submit' });
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

  it('formspec.field.describe includes widget from widgetHint', async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const result = await parse(provider, 'formspec.field.describe', { path: 'contactEmail' });
    expect(result.widget).toBe('email');
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
    const result = await parse(provider, 'formspec.field.set', { path: 'contactEmail' });
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
      registerWebMCP: false,
    });

    const blocked = await provider.invokeTool('formspec.profile.apply', {
      matches: [{ path: 'contactEmail', value: 'owner@example.org' }],
      confirm: true,
    });
    expect(blocked.isError).toBe(true);
    expect(JSON.parse(blocked.content[0].text).code).toBe('x-confirmation-required');
    expect(engine.getFieldVM('contactEmail')?.value.value).toBe('');

    const confirmedProvider = createAssistProvider({
      engine: createEngine(),
      confirmProfileApply: () => true,
      registerWebMCP: false,
    });

    const confirmed = await confirmedProvider.invokeTool('formspec.profile.apply', {
      matches: [{ path: 'contactEmail', value: 'owner@example.org' }],
      confirm: true,
    });
    expect(confirmed.isError).not.toBe(true);
    expect(JSON.parse(confirmed.content[0].text).filled).toEqual([
      { path: 'contactEmail', value: 'owner@example.org' },
    ]);
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
    expect(JSON.parse(matchResult.content[0].text).matches.find((match: { path: string }) => match.path === 'organization.ein').value)
      .toBe('98-7654321');

    engine.getFieldVM('organization.ein')?.setValue('11-1111111');
    engine.getFieldVM('organization.name')?.setValue('New Org');
    const learnResult = await provider.invokeTool('formspec.profile.learn', { profileRef: 'secondary' });
    expect(learnResult.isError).not.toBe(true);

    const learnedMatches = provider.matchProfile('secondary');
    expect(learnedMatches.find((match) => match.path === 'organization.ein')?.value).toBe('11-1111111');
    expect(learnedMatches.find((match) => match.path === 'organization.name')?.value).toBe('New Org');
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

  it('infers pages from component first, then theme, then definition hints', async () => {
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
    ]);
    expect(themePages.pages.map((page: { id: string; fieldCount: number }) => [page.id, page.fieldCount])).toEqual([
      ['theme-contact', 1],
      ['theme-details', 1],
    ]);

    const definitionProvider = createAssistProvider({
      engine: createEngine(),
      registerWebMCP: false,
    });
    const definitionPages = await parse(definitionProvider, 'formspec.form.pages', {});
    expect(definitionPages.pages.map((page: { id: string; title?: string }) => [page.id, page.title])).toEqual([
      ['org', undefined],
      ['details', undefined],
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
    expect(invalidThemePages.pages.map((page: { id: string }) => page.id)).toEqual(['org', 'details']);
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

    const invalidMatches = await provider.invokeTool('formspec.profile.apply', {
      matches: [{ path: 12, value: 'owner@example.org' }],
    });
    expect(invalidMatches.isError).toBe(true);
    expect(JSON.parse(invalidMatches.content[0].text)).toMatchObject({
      code: 'INVALID_VALUE',
      message: expect.stringMatching(/path/i),
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

  it('emits a discovery event when tools are registered', () => {
    const events: Array<{ type: string; detail: Record<string, unknown> }> = [];
    const previousDocument = (globalThis as Record<string, unknown>).document;
    const previousCustomEvent = (globalThis as Record<string, unknown>).CustomEvent;
    const previousModelContext = (globalThis as Record<string, unknown>).modelContext;

    class FakeCustomEvent<T> {
      public type: string;
      public detail: T;

      public constructor(type: string, init?: { detail?: T }) {
        this.type = type;
        this.detail = (init?.detail ?? {}) as T;
      }
    }

    (globalThis as Record<string, unknown>).document = {
      dispatchEvent(event: { type: string; detail: Record<string, unknown> }) {
        events.push(event);
        return true;
      },
    };
    (globalThis as Record<string, unknown>).CustomEvent = FakeCustomEvent;
    delete (globalThis as Record<string, unknown>).modelContext;

    try {
      const provider = createAssistProvider({
        engine: createEngine(),
      });
      provider.dispose();
    } finally {
      if (previousDocument === undefined) {
        delete (globalThis as Record<string, unknown>).document;
      } else {
        (globalThis as Record<string, unknown>).document = previousDocument;
      }
      if (previousCustomEvent === undefined) {
        delete (globalThis as Record<string, unknown>).CustomEvent;
      } else {
        (globalThis as Record<string, unknown>).CustomEvent = previousCustomEvent;
      }
      if (previousModelContext === undefined) {
        delete (globalThis as Record<string, unknown>).modelContext;
      } else {
        (globalThis as Record<string, unknown>).modelContext = previousModelContext;
      }
    }

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'formspec-tools-available',
      detail: {
        definitionUrl: 'https://example.org/forms/grant',
      },
    });
    expect(events[0].detail.tools).toContain('formspec.field.help');
  });

  it('re-emits discovery metadata when attaching a new engine', () => {
    const events: Array<{ type: string; detail: Record<string, unknown> }> = [];
    const previousDocument = (globalThis as Record<string, unknown>).document;
    const previousCustomEvent = (globalThis as Record<string, unknown>).CustomEvent;
    const previousModelContext = (globalThis as Record<string, unknown>).modelContext;

    class FakeCustomEvent<T> {
      public type: string;
      public detail: T;

      public constructor(type: string, init?: { detail?: T }) {
        this.type = type;
        this.detail = (init?.detail ?? {}) as T;
      }
    }

    (globalThis as Record<string, unknown>).document = {
      dispatchEvent(event: { type: string; detail: Record<string, unknown> }) {
        events.push(event);
        return true;
      },
    };
    (globalThis as Record<string, unknown>).CustomEvent = FakeCustomEvent;
    delete (globalThis as Record<string, unknown>).modelContext;

    try {
      const provider = createAssistProvider({
        engine: createEngine(),
      });
      const nextDefinition = {
        ...makeDefinition(),
        url: 'https://example.org/forms/grant-v2',
      };
      provider.attach(new FormEngine(nextDefinition as any));
      provider.dispose();
    } finally {
      if (previousDocument === undefined) {
        delete (globalThis as Record<string, unknown>).document;
      } else {
        (globalThis as Record<string, unknown>).document = previousDocument;
      }
      if (previousCustomEvent === undefined) {
        delete (globalThis as Record<string, unknown>).CustomEvent;
      } else {
        (globalThis as Record<string, unknown>).CustomEvent = previousCustomEvent;
      }
      if (previousModelContext === undefined) {
        delete (globalThis as Record<string, unknown>).modelContext;
      } else {
        (globalThis as Record<string, unknown>).modelContext = previousModelContext;
      }
    }

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      type: 'formspec-tools-available',
      detail: {
        definitionUrl: 'https://example.org/forms/grant-v2',
      },
    });
  });

  it('does not emit discovery metadata on attach when WebMCP registration is disabled', () => {
    const events: Array<{ type: string; detail: Record<string, unknown> }> = [];
    const previousDocument = (globalThis as Record<string, unknown>).document;
    const previousCustomEvent = (globalThis as Record<string, unknown>).CustomEvent;

    class FakeCustomEvent<T> {
      public type: string;
      public detail: T;

      public constructor(type: string, init?: { detail?: T }) {
        this.type = type;
        this.detail = (init?.detail ?? {}) as T;
      }
    }

    (globalThis as Record<string, unknown>).document = {
      dispatchEvent(event: { type: string; detail: Record<string, unknown> }) {
        events.push(event);
        return true;
      },
    };
    (globalThis as Record<string, unknown>).CustomEvent = FakeCustomEvent;

    try {
      const provider = createAssistProvider({
        engine: createEngine(),
        registerWebMCP: false,
      });
      provider.attach(createEngine());
      provider.dispose();
    } finally {
      if (previousDocument === undefined) {
        delete (globalThis as Record<string, unknown>).document;
      } else {
        (globalThis as Record<string, unknown>).document = previousDocument;
      }
      if (previousCustomEvent === undefined) {
        delete (globalThis as Record<string, unknown>).CustomEvent;
      } else {
        (globalThis as Record<string, unknown>).CustomEvent = previousCustomEvent;
      }
    }

    expect(events).toHaveLength(0);
  });
});
