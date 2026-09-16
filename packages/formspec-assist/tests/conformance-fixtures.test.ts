/**
 * Runs the Assist conformance fixture corpus (`tests/conformance/fixtures/assist/*.json`) against this
 * package's own `AssistProvider`. Each fixture pins one draft.3 MUST clause to a fixed input/output pair
 * derived from this suite's own known-good tests (see the files this corpus cites in its `spec` field and
 * `specs/assist/assist-spec.md` §12 "Conformance fixtures"). A second implementation binds the identical
 * JSON files to its own provider the same way: build the engine from `definition`, apply `setup.writes`,
 * construct the provider, invoke `call`, and match `expect` against the parsed tool result.
 *
 * The Python-side counterpart (`tests/conformance/spec/test_assist_fixtures.py`) validates the corpus's
 * shape and that every embedded/`Ref`'d definition, references, ontology, and registry document is itself
 * schema-valid — it cannot execute the TypeScript provider, so it checks the fixtures are well-formed
 * inputs; this file is what actually proves the provider's behavior against them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { FormEngine, type WriteSource } from '@formspec-org/engine';
import { createAssistProvider } from '../src/index.js';
import { ensureEngine } from './helpers.js';

interface FixtureWrite {
  path: string;
  value: unknown;
  source: WriteSource;
}

interface Fixture {
  $formspecAssistFixture: '1.0';
  title: string;
  spec: string;
  definition?: Record<string, unknown>;
  definitionRef?: string;
  references?: unknown;
  ontology?: unknown;
  registries?: unknown;
  profile?: unknown;
  setup?: { writes?: FixtureWrite[]; confirm?: boolean };
  call: { tool: string; input: Record<string, unknown> };
  expect: { result: Record<string, unknown> } | { error: Record<string, unknown> };
}

const FIXTURES_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'tests', 'conformance', 'fixtures', 'assist');

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function loadFixtures(): Array<{ name: string; fixture: Fixture }> {
  return readdirSync(FIXTURES_ROOT)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ name, fixture: loadJson(join(FIXTURES_ROOT, name)) as Fixture }));
}

function resolveDefinition(fixture: Fixture): Record<string, unknown> {
  if (fixture.definition) {
    return fixture.definition;
  }
  if (fixture.definitionRef) {
    return loadJson(join(FIXTURES_ROOT, fixture.definitionRef)) as Record<string, unknown>;
  }
  throw new Error('fixture carries neither definition nor definitionRef');
}

const fixtures = loadFixtures();

describe('Assist conformance fixture corpus (draft.3 MUSTs)', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  it('has at least one fixture per cited MUST clause', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures)('$name — $fixture.title', async ({ fixture }) => {
    expect(fixture.$formspecAssistFixture).toBe('1.0');

    const definition = resolveDefinition(fixture);
    const engine = new FormEngine(definition as any);
    for (const write of fixture.setup?.writes ?? []) {
      engine.setValue(write.path, write.value as never, { source: write.source });
    }

    const provider = createAssistProvider({
      engine,
      references: fixture.references as never,
      ontology: fixture.ontology as never,
      registries: fixture.registries as never,
      profile: fixture.profile as never,
      registerWebMCP: false,
      confirmProfileApply: () => fixture.setup?.confirm ?? true,
    });

    const result = await provider.invokeTool(fixture.call.tool, fixture.call.input);
    const body = JSON.parse(result.content[0].text);

    if ('error' in fixture.expect) {
      expect(result.isError, `${fixture.title}: expected an error result, got ${JSON.stringify(body)}`).toBe(true);
      expect(body).toMatchObject(fixture.expect.error);
    } else {
      expect(result.isError, `${fixture.title}: expected a success result, got ${JSON.stringify(body)}`).not.toBe(true);
      expect(body).toMatchObject(fixture.expect.result);
    }
  });
});
