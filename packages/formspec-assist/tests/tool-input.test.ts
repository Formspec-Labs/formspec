import { describe, expect, it } from 'vitest';
import { AssistError } from '../src/errors.js';
import { buildToolDeclarations } from '../src/tool-declarations.js';
import { validateToolInput, type ToolSchema } from '../src/tool-input.js';

const byName = new Map(buildToolDeclarations().map((tool) => [tool.name, tool]));
const schemaOf = (name: string) => byName.get(name)!.inputSchema as ToolSchema;

/** The INVALID_VALUE the validator raises for `input` against the real declaration, or undefined when it accepts. */
function rejection(name: string, input: Record<string, unknown>): AssistError | undefined {
  try {
    validateToolInput(schemaOf(name), input);
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(AssistError);
    expect((error as AssistError).code).toBe('INVALID_VALUE');
    return error as AssistError;
  }
}

describe('tool input validation messages (draft.3 C1)', () => {
  it('enum: lists the allowed values and what was given', () => {
    expect(rejection('formspec.field.list', { filter: 'foo' })?.message)
      .toBe('input.filter must be one of: all, required, empty, invalid, relevant (got "foo")');
    expect(rejection('formspec.form.nextIncomplete', { scope: 'sheet' })?.message)
      .toBe('input.scope must be one of: field, page (got "sheet")');
    expect(rejection('formspec.field.help', { path: 'organization.ein', audience: 7 })?.message)
      .toBe('input.audience must be one of: human, agent, both (got 7)');
  });

  it('unknown key: names the property and the accepted set', () => {
    expect(rejection('formspec.form.validate', { mode: 'eventual' })?.message)
      .toBe('unexpected input property "mode"; accepted: profile');
    expect(rejection('formspec.profile.apply', { matches: [] })?.message)
      .toBe('unexpected input property "matches"; accepted: paths, confirm, overwrite');
    expect(rejection('formspec.form.describe', { verbose: true })?.message)
      .toBe('unexpected input property "verbose"; accepted: none');
    expect(rejection('formspec.field.bulkSet', { entries: [{ path: 'a', value: 1, force: true }] })?.message)
      .toBe('unexpected input property "entries[0].force"; accepted: path, value');
  });

  it('missing required: names the property with its type and description', () => {
    const path = (schemaOf('formspec.field.describe').properties!.path as { description: string }).description;
    expect(path).toMatch(/organization\.ein/);
    const expected = `missing required input property "path" (string: ${path.replace(/\.$/, '')})`;
    expect(rejection('formspec.field.describe', {})?.message).toBe(expected);
    expect(rejection('formspec.field.set', { value: 1 })?.message).toBe(expected);
    expect(rejection('formspec.field.bulkSet', { entries: [{ path: 'a' }, { value: 2 }] })?.message)
      .toBe(`missing required input property "entries[1].path" (string: ${path.replace(/\.$/, '')})`);
    expect(rejection('formspec.field.bulkSet', {})?.message)
      .toMatch(/^missing required input property "entries" \(array: .+\)$/);
  });

  it('wrong type: states the expected shape', () => {
    expect(rejection('formspec.field.bulkSet', { entries: 'contactEmail' })?.message)
      .toBe('input.entries must be an array of { path, value }');
    expect(rejection('formspec.field.bulkSet', { entries: ['contactEmail'] })?.message)
      .toBe('input.entries[0] must be an object { path, value }');
    expect(rejection('formspec.profile.apply', { paths: 'contactEmail' })?.message)
      .toBe('input.paths must be an array of strings');
    expect(rejection('formspec.profile.apply', { paths: [12] })?.message)
      .toBe('input.paths[0] must be a string');
    expect(rejection('formspec.field.set', { path: 'contactEmail', overwrite: 'yes' })?.message)
      .toBe('input.overwrite must be a boolean');
    expect(rejection('formspec.field.help', { path: 'contactEmail', maxBytes: 1.5 })?.message)
      .toBe('input.maxBytes must be an integer >= 512');
    expect(rejection('formspec.field.help', { path: 'contactEmail', maxBytes: 100 })?.message)
      .toBe('input.maxBytes must be an integer >= 512 (got 100)');
  });

  it('accepts every draft.3 input shape', () => {
    expect(rejection('formspec.field.help', { path: 'a', audience: 'both', includeContent: true, maxBytes: 512 })).toBeUndefined();
    expect(rejection('formspec.field.set', { path: 'a', value: null, overwrite: true })).toBeUndefined();
    expect(rejection('formspec.field.set', { path: 'a' })).toBeUndefined();
    expect(rejection('formspec.field.bulkSet', { entries: [{ path: 'a', value: [1, 2] }], overwrite: false })).toBeUndefined();
    expect(rejection('formspec.profile.apply', {})).toBeUndefined();
    expect(rejection('formspec.profile.apply', { paths: ['a', 'b'], confirm: true, overwrite: true })).toBeUndefined();
    expect(rejection('formspec.form.describe', {})).toBeUndefined();
  });
});
