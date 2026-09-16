/**
 * Runs the Assist conformance fixture corpus (`tests/conformance/fixtures/assist/*.json`) against this
 * package's own `AssistProvider`. Each fixture pins one draft.3 MUST clause to a fixed input/output pair
 * derived from this suite's own known-good tests (see the files this corpus cites in its `spec` field and
 * `specs/assist/assist-spec.md` §12 "Conformance fixtures"). A second implementation binds the identical
 * JSON files to its own provider the same way: build the engine from `definition`, apply `setup.writes`,
 * construct the provider, invoke `call`, and match `expect` against the parsed tool result.
 *
 * `expect.result` is matched with `toMatchObject` (subset: present keys must match, extra actual keys are
 * ignored) UNLESS a key's own pointer is listed in `expect.exact` (RFC 6901, e.g. `/matches`), in which
 * case that subtree is compared by deep equality instead — closing the "an implementation that leaks an
 * extra key still passes" hole subset matching leaves open. `exact` targets an array: same length, same
 * order, elementwise. A WebMCP-only port sees `{ error: ToolError }` on failure (§4.1) rather than this
 * MCP-family envelope's `isError: true` + JSON `text`; either way the parsed body is what gets checked.
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
import type { RegistryDocument } from '@formspec-org/types';
import { createAssistProvider } from '../src/index.js';
import type { OntologyDocument, ReferencesDocument, UserProfile } from '../src/index.js';
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
  references?: ReferencesDocument | ReferencesDocument[];
  ontology?: OntologyDocument | OntologyDocument[];
  registries?: RegistryDocument[];
  profile?: UserProfile;
  setup?: { writes?: FixtureWrite[]; confirm?: boolean };
  call: { tool: string; input: Record<string, unknown> };
  expect: {
    result?: Record<string, unknown>;
    error?: Record<string, unknown>;
    /** RFC 6901 pointers into the checked object; each subtree is compared by deep equality. */
    exact?: string[];
    /** RFC 6901 pointers whose values are RECOMMENDED, not MUST: removed from both sides before any comparison. */
    ignore?: string[];
    /** Exactly what `confirmProfileApply` received, in order — proves §3.5 skips are decided before confirmation. */
    confirmation?: Array<{ path: string; value: unknown }>;
  };
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

/** RFC 6901 JSON Pointer resolution (`~1` → `/`, `~0` → `~`); `undefined` when any segment misses. */
/** Delete the value at an RFC 6901 pointer (no-op when the path does not resolve). */
function deletePointer(value: unknown, pointer: string): void {
  const segments = pointer.split('/').slice(1).map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  const last = segments.pop();
  const parent = segments.reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), value);
  if (last !== undefined && parent && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[last];
  }
}

function resolvePointer(value: unknown, pointer: string): unknown {
  if (pointer === '') {
    return value;
  }
  const segments = pointer.split('/').slice(1).map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  return segments.reduce<unknown>((acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]), value);
}

const fixtures = loadFixtures();

describe('Assist conformance fixture corpus (draft.3 MUSTs)', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  it.each(fixtures)('$name — $fixture.title', async ({ fixture }) => {
    expect(fixture.$formspecAssistFixture).toBe('1.0');

    const definition = resolveDefinition(fixture);
    const engine = new FormEngine(definition as any);
    for (const write of fixture.setup?.writes ?? []) {
      engine.setValue(write.path, write.value as Parameters<typeof engine.setValue>[1], { source: write.source });
    }

    // §3.5 x-confirmation-required: an absent setup.confirm means the fixture is proving "no confirmation
    // mechanism configured" — the provider gets no confirmProfileApply at all, not a permissive stand-in.
    const confirmationSeen: Array<{ path: string; value: unknown }> = [];
    const confirmProfileApply = fixture.setup?.confirm === undefined
      ? undefined
      : ({ matches }: { matches: Array<{ path: string; value: unknown }> }) => {
        confirmationSeen.push(...matches);
        return fixture.setup!.confirm!;
      };

    const provider = createAssistProvider({
      engine,
      references: fixture.references,
      ontology: fixture.ontology,
      registries: fixture.registries,
      profile: fixture.profile,
      registerWebMCP: false,
      confirmProfileApply,
    });

    const result = await provider.invokeTool(fixture.call.tool, fixture.call.input);
    const body = JSON.parse(result.content[0].text);

    if (fixture.expect.error) {
      expect(result.isError, `${fixture.title}: expected an error result, got ${JSON.stringify(body)}`).toBe(true);
      expect(body).toMatchObject(fixture.expect.error);
    } else {
      expect(result.isError, `${fixture.title}: expected a success result, got ${JSON.stringify(body)}`).not.toBe(true);
      const expected = structuredClone(fixture.expect.result);
      for (const pointer of fixture.expect.ignore ?? []) {
        deletePointer(body, pointer);
        deletePointer(expected, pointer);
      }
      expect(body).toMatchObject(expected);
      for (const pointer of fixture.expect.exact ?? []) {
        expect(resolvePointer(body, pointer), `${fixture.title}: exact mismatch at ${pointer}`).toEqual(resolvePointer(expected, pointer));
      }
    }

    if (fixture.expect.confirmation) {
      expect(confirmationSeen, `${fixture.title}: confirmProfileApply payload`).toEqual(fixture.expect.confirmation);
    }
  });
});
