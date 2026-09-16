import { describe, expect, it } from 'vitest';
import { buildToolDeclarations } from '../src/tool-declarations.js';
import { DEFAULT_WEBMCP_TOOLS, PROFILE_WEBMCP_TOOLS } from '../src/webmcp-binding.js';
import type { ToolSchema } from '../src/tool-input.js';

/** Assist spec draft.3 §3.2–3.6: the model-facing catalog text, verbatim. */
const TITLES: Record<string, string> = {
  'formspec.form.describe': 'Describe form',
  'formspec.form.progress': 'Show form progress',
  'formspec.field.list': 'List fields',
  'formspec.field.describe': 'Describe field',
  'formspec.field.help': 'Get field help',
  'formspec.field.set': 'Set field value',
  'formspec.field.bulkSet': 'Set several field values',
  'formspec.form.validate': 'Validate form',
  'formspec.field.validate': 'Validate field',
  'formspec.profile.match': 'Match saved profile',
  'formspec.profile.apply': 'Apply saved profile values',
  'formspec.profile.learn': 'Save values to profile',
  'formspec.form.pages': 'Show page progress',
  'formspec.form.nextIncomplete': 'Find next incomplete',
};
const TITLE_VERBS = ['Describe', 'Show', 'List', 'Get', 'Set', 'Validate', 'Match', 'Apply', 'Save', 'Find'];
const VALUE_DESCRIPTION = 'New value. For choice fields pass the option value or its label. Dates as YYYY-MM-DD. Omit or pass null to clear.';

/** Every `(location, schema)` pair under `properties` and `items`, depth-first. */
function walkProperties(schema: ToolSchema, location: string): Array<[string, ToolSchema]> {
  const found: Array<[string, ToolSchema]> = [];
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    found.push([`${location}.${key}`, property], ...walkProperties(property, `${location}.${key}`));
  }
  if (schema.items) {
    found.push(...walkProperties(schema.items, `${location}[]`));
  }
  return found;
}

const declarations = buildToolDeclarations();
const byName = new Map(declarations.map((tool) => [tool.name, tool]));
const schemaOf = (name: string) => byName.get(name)!.inputSchema as ToolSchema;
const propertyOf = (name: string, key: string) => (schemaOf(name).properties ?? {})[key] as ToolSchema & { description?: string; minimum?: number };

describe('tool declarations (draft.3 C3)', () => {
  it('carries the imperative titles verbatim', () => {
    expect(Object.fromEntries(declarations.map((tool) => [tool.name, tool.title]))).toEqual(TITLES);
  });

  it('every title opens with an allowlisted verb', () => {
    for (const tool of declarations) {
      expect(TITLE_VERBS, `${tool.name}: "${tool.title}"`).toContain(tool.title.split(' ')[0]);
    }
  });

  it('every description is present, model-sized, and free of sidecar jargon', () => {
    for (const tool of declarations) {
      expect(tool.description.length, tool.name).toBeGreaterThan(0);
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(500);
      expect(tool.description, tool.name).not.toMatch(/sidecar/i);
    }
  });

  it('every input property, at any depth, has a description of at most 150 characters', () => {
    let seen = 0;
    for (const tool of declarations) {
      for (const [location, property] of walkProperties(tool.inputSchema as ToolSchema, tool.name)) {
        const description = (property as { description?: string }).description;
        expect(description, location).toBeTruthy();
        expect(description!.length, location).toBeLessThanOrEqual(150);
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('the WebMCP registration sets partition the catalog', () => {
    const names = declarations.map((tool) => tool.name);
    for (const name of [...DEFAULT_WEBMCP_TOOLS, ...PROFILE_WEBMCP_TOOLS]) {
      expect(names).toContain(name);
    }
    expect(DEFAULT_WEBMCP_TOOLS).toHaveLength(8);
    expect(PROFILE_WEBMCP_TOOLS).toEqual(['formspec.profile.match', 'formspec.profile.apply', 'formspec.profile.learn']);
    expect(DEFAULT_WEBMCP_TOOLS.filter((name) => PROFILE_WEBMCP_TOOLS.includes(name))).toEqual([]);
    // Redundant on WebMCP: field.set ⊂ bulkSet, field.validate ⊂ form.validate, form.pages ⊂ form.progress.
    expect(names.filter((name) => !DEFAULT_WEBMCP_TOOLS.includes(name) && !PROFILE_WEBMCP_TOOLS.includes(name)).sort())
      .toEqual(['formspec.field.set', 'formspec.field.validate', 'formspec.form.pages']);
  });

  it('describes `value` the same way on set and bulkSet', () => {
    expect(propertyOf('formspec.field.set', 'value').description).toBe(VALUE_DESCRIPTION);
    const entry = propertyOf('formspec.field.bulkSet', 'entries').items!;
    expect((entry.properties!.value as { description?: string }).description).toBe(VALUE_DESCRIPTION);
    expect(entry.required).toEqual(['path']);
  });

  it('field.help takes includeContent and maxBytes (C4 output minimization inputs)', () => {
    expect(propertyOf('formspec.field.help', 'includeContent').type).toBe('boolean');
    expect(propertyOf('formspec.field.help', 'maxBytes')).toMatchObject({ type: 'integer', minimum: 512 });
  });

  it('writes are compare-and-set: set and bulkSet entries carry expected, never a blind overwrite flag (C5)', () => {
    expect(propertyOf('formspec.field.set', 'expected').description).toMatch(/field\.describe/);
    expect(propertyOf('formspec.field.bulkSet', 'entries').items!.properties!.expected).toBeDefined();
    for (const name of ['formspec.field.set', 'formspec.field.bulkSet', 'formspec.profile.apply']) {
      expect(schemaOf(name).properties!.overwrite, name).toBeUndefined();
    }
  });

  it('profile.apply selects matches by path — a string or { path, expected } — and has no required input', () => {
    const schema = schemaOf('formspec.profile.apply');
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(['confirm', 'paths']);
    const items = schema.properties!.paths.items!;
    expect(items.anyOf!.map((branch) => branch.type)).toEqual(['string', 'object']);
    expect(items.anyOf![1].properties!.expected).toBeDefined();
    expect(schema.required ?? []).toEqual([]);
  });

  it('keeps in-process validation strict: every object schema closes additionalProperties', () => {
    for (const tool of declarations) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
    expect(propertyOf('formspec.field.bulkSet', 'entries').items!.additionalProperties).toBe(false);
  });

  it('names round-trip through LLM tool-name grammars: WebMCP-legal, dotted, never an underscore (§3.1)', () => {
    for (const { name } of declarations) {
      expect(name, name).toMatch(/^formspec\.[a-z]+\.[A-Za-z]+$/);
      expect(name.includes('_'), name).toBe(false);
      expect(name.replace(/\./g, '_'), name).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    }
  });
});
