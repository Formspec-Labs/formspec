import { describe, expect, it, beforeAll } from 'vitest';
import { ensureEngine, createEngine, makeOntology, makeReferences } from './helpers.js';
import { createAssistProvider } from '../src/index.js';
import { minimizeFieldHelp } from '../src/context-resolver.js';
import type { FieldHelp, ReferencesDocument } from '../src/types.js';

describe('Context resolution', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  it('resolves field, ancestor, and form-level references with audience filtering', () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      references: makeReferences(),
      ontology: makeOntology(),
      registerWebMCP: false,
    });

    const agentHelp = provider.getFieldHelp('organization.ein', 'agent');
    expect(agentHelp.references.documentation?.map((entry) => entry.title)).toContain('EIN Instructions');
    expect(agentHelp.references.regulation?.map((entry) => entry.title)).toContain('Uniform Guidance');
    expect(agentHelp.references.context?.map((entry) => entry.title)).toContain('Organization context');
    expect(agentHelp.references.example).toBeUndefined();
    expect(agentHelp.concept?.concept).toBe('https://www.irs.gov/terms/employer-identification-number');

    const humanHelp = provider.getFieldHelp('organization.ein', 'human');
    expect(humanHelp.references.example?.map((entry) => entry.title)).toContain('Example EIN');
    expect(humanHelp.references.context).toBeUndefined();
  });

  it('rejects mismatched and structurally invalid sidecars', () => {
    expect(() =>
      createAssistProvider({
        engine: createEngine(),
        references: {
          ...makeReferences(),
          targetDefinition: { url: 'https://example.org/forms/other' },
        },
        registerWebMCP: false,
      }),
    ).toThrow(/target definition/i);

    expect(() =>
      createAssistProvider({
        engine: createEngine(),
        references: {
          ...makeReferences(),
          references: [
            {
              target: 'organization.ein',
              $ref: '#/referenceDefs/doesNotExist',
            },
          ],
        },
        registerWebMCP: false,
      }),
    ).toThrow(/unknown reference definition/i);
  });

  it('accepts common semver-compatible sidecar version expressions', () => {
    expect(() =>
      createAssistProvider({
        engine: createEngine(),
        references: {
          ...makeReferences(),
          targetDefinition: {
            url: 'https://example.org/forms/grant',
            compatibleVersions: '>=1.0.0 <2.0.0',
          },
        },
        registerWebMCP: false,
      }),
    ).not.toThrow();

    expect(() =>
      createAssistProvider({
        engine: createEngine(),
        ontology: {
          ...makeOntology(),
          targetDefinition: {
            url: 'https://example.org/forms/grant',
            compatibleVersions: '1.x',
          },
        },
        registerWebMCP: false,
      }),
    ).not.toThrow();
  });

  it('returns NOT_FOUND for unknown field help paths', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      references: makeReferences(),
      ontology: makeOntology(),
      registerWebMCP: false,
    });

    const result = await provider.invokeTool('formspec.field.help', { path: 'organization.missing' });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      code: 'NOT_FOUND',
      path: 'organization.missing',
    });
  });

  it('always includes inherited ancestor and form-level references', () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      references: makeReferences(),
      ontology: makeOntology(),
      registerWebMCP: false,
    });

    const help = provider.getFieldHelp('organization.ein', 'agent');
    expect(help.references.documentation?.map((entry) => entry.title)).toContain('EIN Instructions');
    expect(help.references.regulation?.map((entry) => entry.title)).toContain('Uniform Guidance');
    expect(help.references.context?.map((entry) => entry.title)).toContain('Organization context');
  });
});

const utf8Bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

// fs-fy2g (§5.1, §5.3 step 1): the Registry concept entry a binding names by conceptUri supplies the definition.
describe('Registry concept entry merged into the resolved binding', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  const EIN = 'https://www.irs.gov/terms/employer-identification-number';
  const DEFINITION = 'IRS Employer Identification Number — a 9-digit tax identifier assigned to business entities.';
  const registry = (entry: Record<string, unknown> = {}) => [
    {
      $formspecRegistry: '1.1',
      publisher: { name: 'Example', url: 'https://example.org' },
      published: '2026-03-26T00:00:00Z',
      entries: [
        {
          name: 'x-onto-ein',
          category: 'concept',
          version: '1.0.0',
          status: 'stable',
          description: DEFINITION,
          compatibility: { formspecVersion: '^1.0.0' },
          conceptUri: EIN,
          conceptSystem: 'https://www.irs.gov/terms',
          conceptCode: 'EIN',
          metadata: { displayName: 'Employer Identification Number (registry)' },
          ...entry,
        },
        {
          name: 'x-concept-org-name',
          category: 'concept',
          version: '1.0.0',
          status: 'stable',
          description: 'The legal name of the organization.',
          compatibility: { formspecVersion: '^1.0.0' },
          conceptUri: 'https://schema.org/name',
          conceptSystem: 'https://schema.org',
          conceptCode: 'name',
        },
      ],
    },
  ];

  it("carries the entry's description as definition; display, system, and code fall back to the entry only when the binding has none", async () => {
    const bare = makeOntology();
    bare.concepts!['organization.ein'] = { concept: EIN };
    const provider = createAssistProvider({ engine: createEngine(), ontology: bare, registries: registry(), registerWebMCP: false });

    expect(provider.getFieldHelp('organization.ein').concept).toEqual({
      concept: EIN,
      definition: DEFINITION,
      display: 'Employer Identification Number (registry)',
      system: 'https://www.irs.gov/terms',
      code: 'EIN',
    });
    // The wire carries it too.
    const wire = await provider.invokeTool('formspec.field.help', { path: 'organization.ein' });
    expect(JSON.parse(wire.content[0].text).concept).toMatchObject({ definition: DEFINITION, display: 'Employer Identification Number (registry)' });

    const authored = createAssistProvider({ engine: createEngine(), ontology: makeOntology(), registries: registry(), registerWebMCP: false });
    expect(authored.getFieldHelp('organization.ein').concept).toMatchObject({
      definition: DEFINITION,
      display: 'Employer Identification Number',
      system: 'https://www.irs.gov/terms',
      code: 'EIN',
    });
  });

  it('the same document loaded twice is one declaration, not a collision', () => {
    const [doc] = registry();
    const bare = makeOntology();
    delete bare.concepts!['organization.ein'].equivalents;
    const provider = createAssistProvider({ engine: createEngine(), ontology: bare, registries: [doc, structuredClone(doc)], registerWebMCP: false });
    expect(provider.getFieldHelp('organization.ein').concept?.definition).toBe(DEFINITION);
    expect(provider.getFieldHelp('organization.name').concept).toMatchObject({ concept: 'https://schema.org/name', definition: 'The legal name of the organization.' });
  });

  it('fails closed when two loaded registries claim the same conceptUri: the binding stays bare', () => {
    const [first] = registry();
    const [second] = registry({ name: 'x-onto-ein-rival', description: 'A rival definition of record.' });
    const bare = makeOntology();
    delete bare.concepts!['organization.ein'].equivalents;
    const provider = createAssistProvider({ engine: createEngine(), ontology: bare, registries: [first, second], registerWebMCP: false });
    const concept = provider.getFieldHelp('organization.ein').concept!;
    expect(concept).not.toHaveProperty('definition');
    expect(concept.equivalents ?? []).toEqual([]);
  });

  it('prefers the [*] binding key over the dotted one for a repeatable-group child', () => {
    const ontology = makeOntology();
    ontology.concepts!['budgetItems.amount'] = { concept: 'https://example.org/dotted' };
    ontology.concepts!['budgetItems[*].amount'] = { concept: 'https://example.org/wildcard' };
    const provider = createAssistProvider({ engine: createEngine(), ontology, registerWebMCP: false });
    expect(provider.getFieldHelp('budgetItems[0].amount').concept?.concept).toBe('https://example.org/wildcard');
  });

  it('the semanticType path fails closed too: a contested name or a contested conceptUri resolves to the literal', () => {
    // Two DIFFERING entries share the name `x-concept-org-name` (Registry §2.2 unqualified collision) …
    const [a] = registry();
    const b = structuredClone(a);
    b.entries[1].conceptUri = 'https://example.org/other-name';
    const byName = createAssistProvider({ engine: createEngine(), registries: [a, b], registerWebMCP: false });
    expect(byName.getFieldHelp('organization.name').concept).toEqual({ concept: 'x-concept-org-name' });

    // … and two differently named entries share one conceptUri: the entry is contested, so the name does not merge it.
    const [c] = registry({ name: 'x-concept-org-name', conceptUri: 'https://schema.org/name' });
    const [d] = registry({ name: 'x-rival', conceptUri: 'https://schema.org/name' });
    const byUri = createAssistProvider({ engine: createEngine(), registries: [c, d], registerWebMCP: false });
    expect(byUri.getFieldHelp('organization.name').concept).toEqual({ concept: 'x-concept-org-name' });
  });

  it('system and code travel as a pair from one source — never the Ontology defaultSystem with the entry code', () => {
    const ontology = makeOntology();
    ontology.defaultSystem = 'https://example.org/forms-vocab';
    const binding = ontology.concepts!['organization.ein'];
    delete binding.system;
    delete binding.code;
    const provider = createAssistProvider({ engine: createEngine(), ontology, registries: registry(), registerWebMCP: false });
    const concept = provider.getFieldHelp('organization.ein').concept!;
    expect([concept.system, concept.code]).toEqual(['https://www.irs.gov/terms', 'EIN']);

    // A binding that names its own code keeps its own pair, with defaultSystem filling the system.
    const own = makeOntology();
    own.defaultSystem = 'https://example.org/forms-vocab';
    delete own.concepts!['organization.ein'].system;
    own.concepts!['organization.ein'].code = 'ein-local';
    const ownProvider = createAssistProvider({ engine: createEngine(), ontology: own, registries: registry(), registerWebMCP: false });
    const ownConcept = ownProvider.getFieldHelp('organization.ein').concept!;
    expect([ownConcept.system, ownConcept.code]).toEqual(['https://example.org/forms-vocab', 'ein-local']);
  });

  it('leaves a binding no entry names as it was — no definition', () => {
    const provider = createAssistProvider({ engine: createEngine(), ontology: makeOntology(), registerWebMCP: false });
    expect(provider.getFieldHelp('organization.ein').concept).not.toHaveProperty('definition');
  });

  it('resolves a semanticType entry the same way, definition included', () => {
    const provider = createAssistProvider({ engine: createEngine(), registries: registry(), registerWebMCP: false });
    expect(provider.getFieldHelp('organization.name').concept).toEqual({
      concept: 'https://schema.org/name',
      definition: 'The legal name of the organization.',
      system: 'https://schema.org',
      code: 'name',
    });
  });

  it('caps definition at 1024 UTF-8 bytes on the wire with a trailing ellipsis, cut on a character boundary; in-page keeps the full text', async () => {
    const long = 'é'.repeat(600); // two bytes each: 1200 bytes
    const provider = createAssistProvider({ engine: createEngine(), ontology: makeOntology(), registries: registry({ description: long }), registerWebMCP: false });

    expect(provider.getFieldHelp('organization.ein').concept?.definition).toBe(long);
    const wire = await provider.invokeTool('formspec.field.help', { path: 'organization.ein' });
    const definition = JSON.parse(wire.content[0].text).concept.definition as string;
    expect(new TextEncoder().encode(definition).length).toBeLessThanOrEqual(1024);
    expect(definition.endsWith('…')).toBe(true);
    expect(long.startsWith(definition.slice(0, -1))).toBe(true);
    expect(definition).not.toContain('\uFFFD');
    // 1024 - 3 (the ellipsis) = 1021 bytes of text; 510 × 'é' = 1020, the 511th would split — so 1023.
    expect(definition).toBe(`${'é'.repeat(510)}…`);
  });
});

function referencesDoc(references: Array<Record<string, unknown>>): ReferencesDocument {
  return {
    $formspecReferences: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.org/forms/grant' },
    references,
  } as ReferencesDocument;
}

/** Twelve ~400-byte agent entries on contactEmail, four per priority tier, interleaved so tier order ≠ document order. */
function bulkyReferences(): ReferencesDocument {
  const tiers = ['primary', 'supplementary', 'background'] as const;
  return referencesDoc(
    Array.from({ length: 12 }, (_, index) => ({
      target: 'contactEmail',
      type: index % 2 === 0 ? 'documentation' : 'regulation',
      audience: 'agent',
      title: `Entry ${index} (${tiers[index % 3]})`,
      uri: `https://example.org/refs/${index}`,
      description: `Description ${index} ${'x'.repeat(300)}`,
      content: `Content ${index} ${'y'.repeat(2000)}`,
      priority: tiers[index % 3],
      rel: 'see-also',
    })),
  );
}

describe('Field help output minimization (draft.3 C4, §5.1–5.2)', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  async function help(provider: ReturnType<typeof createAssistProvider>, input: Record<string, unknown>) {
    const result = await provider.invokeTool('formspec.field.help', { path: 'organization.ein', ...input });
    expect(result.isError).not.toBe(true);
    return JSON.parse(result.content[0].text) as FieldHelp;
  }

  it('projects each wire entry to title, type, uri, description, rel, priority — content only on request', async () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      references: referencesDoc([
        {
          target: 'organization.ein',
          type: 'documentation',
          audience: 'agent',
          id: 'ein-guide',
          title: 'EIN Instructions',
          uri: 'https://example.org/ein',
          content: 'Use the IRS-issued EIN.',
          description: 'IRS-issued.',
          mediaType: 'text/plain',
          tags: ['tax'],
          priority: 'primary',
          rel: 'defines',
        },
      ]),
      registerWebMCP: false,
    });

    const minimal = await help(provider, {});
    expect(minimal.references.documentation).toEqual([
      { title: 'EIN Instructions', type: 'documentation', uri: 'https://example.org/ein', description: 'IRS-issued.', rel: 'defines', priority: 'primary' },
    ]);
    expect(minimal.truncated).toBeUndefined();

    const withContent = await help(provider, { includeContent: true });
    expect(withContent.references.documentation?.[0]).toMatchObject({ title: 'EIN Instructions', content: 'Use the IRS-issued EIN.' });
    expect(withContent.references.documentation?.[0]).not.toHaveProperty('mediaType');

    // field.describe embeds the same minimized projection.
    const described = await provider.invokeTool('formspec.field.describe', { path: 'organization.ein' });
    expect(described.isError, described.content[0].text).not.toBe(true);
    expect(JSON.parse(described.content[0].text).help.references.documentation[0]).not.toHaveProperty('content');

    // The in-page method is not a model-facing tool: it keeps the full entry.
    expect(provider.getFieldHelp('organization.ein').references.documentation?.[0]).toMatchObject({ content: 'Use the IRS-issued EIN.', description: 'IRS-issued.', mediaType: 'text/plain' });
  });

  it('caps serialized references at 4096 bytes by default and counts what it omitted per type', async () => {
    const provider = createAssistProvider({ engine: createEngine(), references: bulkyReferences(), registerWebMCP: false });
    const capped = await provider.invokeTool('formspec.field.help', { path: 'contactEmail' });
    const payload = JSON.parse(capped.content[0].text) as FieldHelp;
    expect(utf8Bytes(payload.references)).toBeLessThanOrEqual(4096);
    const kept = Object.values(payload.references).flat().length;
    expect(kept).toBeGreaterThan(0);
    const omitted = Object.values(payload.truncated?.omitted ?? {}).reduce((sum, count) => sum + (count ?? 0), 0);
    expect(payload.truncated).toBeDefined();
    expect(kept + omitted).toBe(12);
    // Degrade before drop: descriptions go before any entry does.
    expect(Object.values(payload.references).flat().some((entry) => entry?.description === undefined)).toBe(true);

    const uncapped = await provider.invokeTool('formspec.field.help', { path: 'contactEmail', maxBytes: 65536 });
    const full = JSON.parse(uncapped.content[0].text) as FieldHelp;
    expect(full.truncated).toBeUndefined();
    expect(Object.values(full.references).flat()).toHaveLength(12);
  });

  it('degrades before it drops: content, then description, then whole entries — lowest tier and tail of document order first, never below one per type', () => {
    // ~300 bytes each so every step below stays above the 512-byte floor.
    const entry = (title: string, priority?: 'primary' | 'supplementary' | 'background') => ({
      title,
      type: 'documentation',
      uri: `https://example.org/${title}/${'x'.repeat(200)}`,
      description: `description ${title} ${'e'.repeat(40)}`,
      content: `content ${title} ${'c'.repeat(40)}`,
      ...(priority ? { priority } : {}),
    });
    const help: FieldHelp = {
      path: 'contactEmail',
      label: 'Contact Email',
      references: {
        documentation: [entry('doc-primary', 'primary'), entry('doc-supp-1', 'supplementary'), entry('doc-supp-2'), entry('doc-bg', 'background')],
        regulation: [entry('reg-primary', 'primary'), entry('reg-bg', 'background')],
      },
    };
    const shape = (result: FieldHelp) => Object.fromEntries(
      Object.entries(result.references).map(([type, entries]) => [
        type,
        entries?.map((item) => `${item.title}${'content' in item ? '+c' : ''}${'description' in item ? '+d' : ''}`),
      ]),
    );
    const sizeOf = (result: FieldHelp) => utf8Bytes(result.references);

    const full = minimizeFieldHelp(help, { includeContent: true, maxBytes: 65536 });
    expect(full.truncated).toBeUndefined();
    expect(full).not.toBe(help);
    expect(shape(full)).toEqual({
      documentation: ['doc-primary+c+d', 'doc-supp-1+c+d', 'doc-supp-2+c+d', 'doc-bg+c+d'],
      regulation: ['reg-primary+c+d', 'reg-bg+c+d'],
    });

    // Walk the cap down one degradation at a time: step n is the smallest cap that forces n cuts.
    const after = (steps: number): FieldHelp => {
      let result = full;
      for (let step = 0; step < steps; step += 1) {
        result = minimizeFieldHelp(help, { includeContent: true, maxBytes: sizeOf(result) - 1 });
      }
      return result;
    };

    // Step 1: the later type group's background entry loses its content first.
    expect(after(1).truncated).toEqual({ omitted: {} });
    expect(shape(after(1))).toEqual({
      documentation: ['doc-primary+c+d', 'doc-supp-1+c+d', 'doc-supp-2+c+d', 'doc-bg+c+d'],
      regulation: ['reg-primary+c+d', 'reg-bg+d'],
    });

    // Steps 2–6 strip the remaining content before any description goes; step 7 takes the first description.
    expect(shape(after(6))).toEqual({
      documentation: ['doc-primary+d', 'doc-supp-1+d', 'doc-supp-2+d', 'doc-bg+d'],
      regulation: ['reg-primary+d', 'reg-bg+d'],
    });
    expect(shape(after(7))).toEqual({
      documentation: ['doc-primary+d', 'doc-supp-1+d', 'doc-supp-2+d', 'doc-bg+d'],
      regulation: ['reg-primary+d', 'reg-bg'],
    });
    expect(after(12).truncated).toEqual({ omitted: {} });

    // Step 13 drops the first whole entry — the later type group's background one — and counts it.
    expect(shape(after(13))).toEqual({
      documentation: ['doc-primary', 'doc-supp-1', 'doc-supp-2', 'doc-bg'],
      regulation: ['reg-primary'],
    });
    expect(after(13).truncated).toEqual({ omitted: { regulation: 1 } });
    expect(shape(after(14))).toEqual({
      documentation: ['doc-primary', 'doc-supp-1', 'doc-supp-2'],
      regulation: ['reg-primary'],
    });

    // Never below one entry per type: regulation keeps reg-primary while documentation still has entries to give.
    expect(shape(after(16))).toEqual({ documentation: ['doc-primary'], regulation: ['reg-primary'] });
    expect(after(16).truncated).toEqual({ omitted: { regulation: 1, documentation: 3 } });

    // At the floor nothing more can go: the payload stays over the cap rather than emptying a type.
    const floor = minimizeFieldHelp(help, { includeContent: true, maxBytes: 1 });
    expect(shape(floor)).toEqual({ documentation: ['doc-primary'], regulation: ['reg-primary'] });
    expect(utf8Bytes(floor.references)).toBeGreaterThan(1);
  });

});
