/** @filedesc Filing-status is a closed Surface 0.4 slot. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

it('admits declarative subject-key range predicates and closes predicate operators and fields', () => {
  const withRange = {
    $formspecSurface: '0.4', id: 'app', entry: 'overview',
    routes: [{ id: 'overview', path: '/years/{ffy}', params: [{ name: 'ffy', type: 'string' }], slots: [{
      id: 'filings', slotType: 'filing-status',
      binding: { groups: [{ id: 'period', label: 'Period plan', forms: [{
        routeRef: 'plan', slotRef: 'form',
        subject: [
          { key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' } },
          { key: 'last_ffy', op: 'ge', from: { routeParam: 'ffy' }, offset: 0 },
        ],
      }] }] },
    }] }],
  };
  expect(validate(withRange), JSON.stringify(validate.errors)).toBe(true);
  for (const safeOffset of [-9007199254740991, 9007199254740991]) {
    const candidate = structuredClone(withRange);
    candidate.routes[0]!.slots[0]!.binding.groups[0]!.forms[0]!.subject[1]!.offset = safeOffset;
    expect(validate(candidate), JSON.stringify(validate.errors)).toBe(true);
  }
  for (const invalidSubject of [
    [],
    [{ key: 'first_ffy', op: 'lte', from: { routeParam: 'ffy' } }],
    [{ key: 'first-ffy', op: 'le', from: { routeParam: 'ffy' } }],
    [{ key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' }, offset: 1.5 }],
    [{ key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' }, offset: 9007199254740992 }],
    [{ key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' }, offset: -9007199254740992 }],
    [{ key: 'first_ffy', op: 'le', from: { routeParam: 'ffy' }, extra: true }],
  ]) {
    const candidate = structuredClone(withRange);
    (candidate.routes[0]!.slots[0]!.binding.groups[0]!.forms[0] as Record<string, unknown>).subject = invalidSubject;
    expect(validate(candidate)).toBe(false);
  }
});

it('rejects denied draft or filing states on matched FilingStatusObservation in TypeScript', () => {
  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  const tscBin = fileURLToPath(new URL('../../../node_modules/.bin/tsc', import.meta.url));
  execFileSync(
    tscBin,
    ['--noEmit', '--strict', '--skipLibCheck', '--target', 'es2022', '--module', 'nodenext', 'tests/typecheck/matched-observation.ts'],
    { cwd: packageRoot, stdio: 'pipe' },
  );
});
