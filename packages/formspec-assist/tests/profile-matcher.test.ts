import { beforeAll, describe, expect, it } from 'vitest';
import { ensureEngine, createEngine, makeOntology, makeProfile, MemoryStorage } from './helpers.js';
import { createAssistProvider } from '../src/index.js';

describe('Profile matching', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  it('matches by exact concept and registry-backed semantic type with a conservative default threshold', () => {
    const provider = createAssistProvider({
      engine: createEngine(),
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
    });

    const matches = provider.matchProfile();
    expect(matches.find((match) => match.path === 'organization.ein')?.relationship).toBe('exact');
    expect(matches.find((match) => match.path === 'organization.name')?.concept).toBe('https://schema.org/name');
    expect(matches.find((match) => match.path === 'contactEmail')).toBeUndefined();
  });

  it("matches a profile keyed by an equivalent's own resolved URI, at the equivalence's confidence", () => {
    // The Ontology names the equivalent by its URI (Ontology spec §3.1 `concept`); a profile that speaks
    // schema.org — not the IRS system the field is bound to — still fills the field, marked as a close match.
    const ontology = makeOntology();
    ontology.concepts!['organization.ein'].equivalents = [
      { concept: 'https://schema.org/taxID', system: 'https://schema.org', code: 'taxID', type: 'close' },
    ];
    const now = new Date().toISOString();
    const provider = createAssistProvider({
      engine: createEngine(),
      ontology,
      profile: {
        id: 'schema-org', label: 'schema.org profile', created: now, updated: now, fields: {},
        concepts: { 'https://schema.org/taxID': { value: '12-3456789', confidence: 1, verified: true, lastUsed: now, source: { type: 'manual', timestamp: now } } },
      },
      storage: new MemoryStorage(),
      registerWebMCP: false,
    });

    const match = provider.matchProfile().find((entry) => entry.path === 'organization.ein');
    expect(match).toEqual({ path: 'organization.ein', concept: 'https://schema.org/taxID', relationship: 'close', confidence: 0.8 });
  });

  // Draft.3 C4 (§6.1): the wire match names the field and the concept it matched through — never the value or its provenance.
  it('reports matches without values or provenance; concept only for concept-identity matches, relationship always', () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      ontology: makeOntology(),
      profile: makeProfile(),
      storage: new MemoryStorage(),
      profileMatchThreshold: 0.3,
      registerWebMCP: false,
    });

    const matches = provider.matchProfile();
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (const match of matches) {
      expect(Object.keys(match).sort()).toEqual(expect.arrayContaining(['confidence', 'path', 'relationship']));
      expect(match).not.toHaveProperty('value');
      expect(match).not.toHaveProperty('source');
      expect(['exact', 'close', 'broader', 'narrower', 'related', 'field-key']).toContain(match.relationship);
    }
    expect(matches.find((match) => match.path === 'organization.ein')).toEqual({
      path: 'organization.ein',
      concept: 'https://www.irs.gov/terms/employer-identification-number',
      confidence: 1,
      relationship: 'exact',
    });
    expect(matches.find((match) => match.path === 'contactEmail')).toEqual({
      path: 'contactEmail',
      confidence: 0.3,
      relationship: 'field-key',
    });
  });

  it('allows explicit low-confidence field-key fallback when configured', () => {
    const provider = createAssistProvider({
      engine: createEngine(),
      ontology: makeOntology(),
      profile: makeProfile(),
      storage: new MemoryStorage(),
      profileMatchThreshold: 0.3,
      registerWebMCP: false,
    });

    const matches = provider.matchProfile();
    expect(matches.find((match) => match.path === 'contactEmail')?.relationship).toBe('field-key');
  });
});
