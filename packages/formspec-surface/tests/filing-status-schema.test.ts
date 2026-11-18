/** @filedesc Filing-status is a closed Surface 0.4 slot. */
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import { expect, it } from 'vitest';

const read = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false, validateFormats: false });
for (const name of ['common', 'issuer', 'validation-result', 'verification-receipt', 'response', 'definition']) {
  ajv.addSchema(read(name));
}
const schema = read('surface');
const validate = ajv.compile(schema);
const document = (version: string, params: unknown = { unit: { value: 'north' } }) => ({
  $formspecSurface: version, id: 'app', entry: 'home',
  routes: [{ id: 'home', path: '/', slots: [{
    id: 'filings', slotType: 'filing-status',
    binding: { groups: [{ id: 'annual', label: 'Annual forms', forms: [{ routeRef: 'apply', slotRef: 'form', params }] }] },
  }] }],
});

it('admits the tracker in 0.4 and rejects it in earlier dialects', () => {
  expect(validate(document('0.4')), JSON.stringify(validate.errors)).toBe(true);
  expect(schema.$id).toBe('https://formspec.org/schemas/surface/0.4');
  expect(validate(document('0.3'))).toBe(false);
  expect(validate(document('0.2'))).toBe(false);
});

it('admits one explicit parameter source and closes the binding', () => {
  expect(validate(document('0.4', { unit: { routeParam: 'state' } }))).toBe(true);
  expect(validate(document('0.4', { unit: { value: 'north', routeParam: 'state' } }))).toBe(false);
  const extra = document('0.4');
  Object.assign(extra.routes[0]!.slots[0]!.binding, { extra: true });
  expect(validate(extra)).toBe(false);
});

it('admits an authored band and refuses unknown placements', () => {
  const app = document('0.4');
  const binding = app.routes[0]!.slots[0]!.binding;
  Object.assign(binding, { placement: 'band' });
  expect(validate(app)).toBe(true);
  Object.assign(binding, { placement: 'overlay' });
  expect(validate(app)).toBe(false);
});
