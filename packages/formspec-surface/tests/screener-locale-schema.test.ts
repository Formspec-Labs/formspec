/** @filedesc Locale 2.1 Screener dialect and historical URI gates. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
const read = (path: string) => JSON.parse(readFileSync(new URL('../../../schemas/' + path, import.meta.url), 'utf8'));
const ajv = new Ajv({ strict: false, validateFormats: false });
ajv.addSchema(read('common.schema.json')); ajv.addSchema(read('issuer.schema.json'));
const latest = read('locale.schema.json'); const historical = read('locale-v2.0.schema.json');
const validate = ajv.compile(latest); const old = ajv.compile(historical);
const document = () => ({ $formspecLocale: '2.1', version: '1.0.0', locale: 'es-US',
  target: { kind: 'screener', url: 'urn:test:gate' },
  strings: { '$form.title': 'Elegibilidad', 'eligible.label': 'Elegible', '$ui.screener.yes': 'Sí' } });
describe('Locale 2.1 Screener schema', () => {
  it('retains historical URI and gates new targets and chrome keys', () => {
    expect(latest.$id).toBe('https://formspec.org/schemas/locale/2.1');
    expect(historical.$id).toBe('https://formspec.org/schemas/locale/2.0');
    expect(validate(document())).toBe(true); expect(old(document())).toBe(false);
    expect(validate({ ...document(), $formspecLocale: '2.0' })).toBe(false);
    const legacy = { ...document(), $formspecLocale: '2.0', target: { kind: 'definition', url: 'urn:test:form' }, strings: { '$form.title': 'Title' } };
    expect(validate(legacy)).toBe(true); expect(old(legacy)).toBe(true);
    expect(validate({ ...legacy, strings: { '$ui.screener.yes': 'Yes' } })).toBe(false);
  });
  it.each(['eligible.calculate', '$action.submit.label', 'eligible.hint', 'eligible.label@pdf'])('refuses unsupported Screener key %s', key => {
    expect(validate({ ...document(), strings: { [key]: 'Text' } })).toBe(false);
  });
});
