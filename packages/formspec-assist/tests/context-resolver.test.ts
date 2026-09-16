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
      excerpt: `Excerpt ${index} ${'x'.repeat(300)}`,
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

  it('projects each wire entry to title, type, uri, excerpt, rel, priority — content only on request', async () => {
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
          excerpt: 'IRS-issued.',
          description: 'Long explanation',
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
      { title: 'EIN Instructions', type: 'documentation', uri: 'https://example.org/ein', excerpt: 'IRS-issued.', rel: 'defines', priority: 'primary' },
    ]);
    expect(minimal.truncated).toBeUndefined();

    const withContent = await help(provider, { includeContent: true });
    expect(withContent.references.documentation?.[0]).toMatchObject({ title: 'EIN Instructions', content: 'Use the IRS-issued EIN.' });
    expect(withContent.references.documentation?.[0]).not.toHaveProperty('description');

    // field.describe embeds the same minimized projection.
    const described = await provider.invokeTool('formspec.field.describe', { path: 'organization.ein' });
    expect(described.isError, described.content[0].text).not.toBe(true);
    expect(JSON.parse(described.content[0].text).help.references.documentation[0]).not.toHaveProperty('content');

    // The in-page method is not a model-facing tool: it keeps the full entry.
    expect(provider.getFieldHelp('organization.ein').references.documentation?.[0]).toMatchObject({ content: 'Use the IRS-issued EIN.', description: 'Long explanation' });
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
    // Degrade before drop: excerpts go before any entry does.
    expect(Object.values(payload.references).flat().some((entry) => entry?.excerpt === undefined)).toBe(true);

    const uncapped = await provider.invokeTool('formspec.field.help', { path: 'contactEmail', maxBytes: 65536 });
    const full = JSON.parse(uncapped.content[0].text) as FieldHelp;
    expect(full.truncated).toBeUndefined();
    expect(Object.values(full.references).flat()).toHaveLength(12);
  });

  it('degrades before it drops: content, then excerpt, then whole entries — lowest tier and tail of document order first, never below one per type', () => {
    // ~300 bytes each so every step below stays above the 512-byte floor.
    const entry = (title: string, priority?: 'primary' | 'supplementary' | 'background') => ({
      title,
      type: 'documentation',
      uri: `https://example.org/${title}/${'x'.repeat(200)}`,
      excerpt: `excerpt ${title} ${'e'.repeat(40)}`,
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
        entries?.map((item) => `${item.title}${'content' in item ? '+c' : ''}${'excerpt' in item ? '+e' : ''}`),
      ]),
    );
    const sizeOf = (result: FieldHelp) => utf8Bytes(result.references);

    const full = minimizeFieldHelp(help, { includeContent: true, maxBytes: 65536 });
    expect(full.truncated).toBeUndefined();
    expect(full).not.toBe(help);
    expect(shape(full)).toEqual({
      documentation: ['doc-primary+c+e', 'doc-supp-1+c+e', 'doc-supp-2+c+e', 'doc-bg+c+e'],
      regulation: ['reg-primary+c+e', 'reg-bg+c+e'],
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
      documentation: ['doc-primary+c+e', 'doc-supp-1+c+e', 'doc-supp-2+c+e', 'doc-bg+c+e'],
      regulation: ['reg-primary+c+e', 'reg-bg+e'],
    });

    // Steps 2–6 strip the remaining content before any excerpt goes; step 7 takes the first excerpt.
    expect(shape(after(6))).toEqual({
      documentation: ['doc-primary+e', 'doc-supp-1+e', 'doc-supp-2+e', 'doc-bg+e'],
      regulation: ['reg-primary+e', 'reg-bg+e'],
    });
    expect(shape(after(7))).toEqual({
      documentation: ['doc-primary+e', 'doc-supp-1+e', 'doc-supp-2+e', 'doc-bg+e'],
      regulation: ['reg-primary+e', 'reg-bg'],
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
