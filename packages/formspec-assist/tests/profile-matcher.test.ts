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
