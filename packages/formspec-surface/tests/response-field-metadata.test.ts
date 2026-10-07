import { describe, expect, it } from 'vitest';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
import { captureResponseFieldMetadata, type CapturedResponseFields } from '../src/index.js';

const definition: FormDefinition = {
  $formspec: '1.0', url: 'urn:test:retained', version: '1.0.0', status: 'active', title: 'Retained',
  items: [
    { key: 'household', type: 'group', label: 'Household', repeatable: true, children: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
      { key: 'status', type: 'field', dataType: 'choice', label: 'Status' },
      { key: 'absent', type: 'field', dataType: 'string', label: 'Absent' },
    ] },
    { key: 'consent', type: 'field', dataType: 'boolean', label: 'Consent' },
  ],
};
const response: FormResponse = {
  $formspecResponse: '1.0', definitionUrl: definition.url, definitionVersion: definition.version,
  status: 'completed', authored: '2026-10-07T00:00:00Z',
  displayedLocale: { locale: 'es', version: '1.0.0' },
  data: { household: [{ name: 'Ana', status: 'yes', unknown: 42 }, { name: 'Luis' }], consent: false, unknown: 'kept' },
};
const original: CapturedResponseFields = {
  household: { label: 'Hogar' },
  'household[0].name': { label: 'Nombre' },
  'household[0].status': { label: 'Estado', options: [{ value: 'yes', label: 'Sí' }] },
  'household[1].name': { label: 'Nombre' },
  consent: { label: 'Consentimiento' },
};
function reader(fields: CapturedResponseFields) {
  return { label: (path: string) => fields[path]?.label,
    options: (path: string) => fields[path] ? fields[path].options ?? [] : undefined };
}

describe('retained Response field wording capture', () => {
  it('preserves Spanish wording, group/repeat paths, order and empty-option omission', () => {
    const result = captureResponseFieldMetadata(definition, response, reader(original));
    expect(result).toEqual(original);
    expect(Object.keys(result)).toEqual(Object.keys(original));
    expect(result.consent).not.toHaveProperty('options');
  });

  it('ignores absent and unknown keys without consulting their readers or changing answers', () => {
    const calls: string[] = [];
    const before = JSON.stringify({ definition, response });
    const supplied = reader(original);
    captureResponseFieldMetadata(definition, response, { ...supplied,
      label(path) { calls.push(path); return supplied.label(path); } });
    expect(calls).toEqual(Object.keys(original));
    expect(JSON.stringify({ definition, response })).toBe(before);
    expect(response.data.unknown).toBe('kept');
  });

  it('replays original metadata independently of current wording or current Locale', () => {
    const current = Object.fromEntries(Object.entries(original).map(([path, field]) => [path, { ...field, label: 'Changed today' }]));
    const retained = captureResponseFieldMetadata(definition, response, reader(original));
    expect(retained).toEqual(original);
    expect(captureResponseFieldMetadata(definition, response, reader(current))).not.toEqual(retained);
    expect(response.displayedLocale).toEqual({ locale: 'es', version: '1.0.0' });
  });

  it('copies option objects so later provider edits cannot change the capture', () => {
    const options = [{ value: 'yes', label: 'Sí' }];
    const supplied = reader(original);
    const result = captureResponseFieldMetadata(definition, response, { ...supplied,
      options(path) { return path === 'household[0].status' ? options : supplied.options(path); } });
    options[0]!.value = 'no'; options[0]!.label = 'Changed'; options.push({ value: 'other', label: 'Other' });
    expect(result['household[0].status']!.options).toEqual([{ value: 'yes', label: 'Sí' }]);
  });

  it.each([undefined, ''])('refuses missing or empty group labels (%s)', label => {
    const supplied = reader(original);
    expect(() => captureResponseFieldMetadata(definition, response, { ...supplied,
      label(path) { return path === 'household' ? label : supplied.label(path); } })).toThrow('response-review-label-unavailable');
  });

  it('distinguishes missing field options from admitted empty options', () => {
    expect(() => captureResponseFieldMetadata(definition, response, {
      label: reader(original).label, options: () => undefined,
    })).toThrow('response-review-field-unavailable');
  });

  it.each(['original-locale-unknown', 'original-interpolation-unproven', 'original-remote-options-unproven'])('propagates host refusal: %s', reason => {
    const refusal = new Error(reason);
    expect(() => captureResponseFieldMetadata(definition, response, {
      label() { throw refusal; }, options: () => [],
    })).toThrow(refusal);
  });

  it.each([null, 7, 'row', []])('refuses malformed repeat rows (%j)', row => {
    expect(() => captureResponseFieldMetadata(definition, { ...response, data: { household: [row] } }, reader(original)))
      .toThrow('response-review-data-invalid');
  });

  it('handles nested nonrepeat groups and excludes inherited Response keys', () => {
    const nested: FormDefinition = { ...definition, items: [{ key: 'group', type: 'group', children: [
      { key: 'answer', type: 'field', dataType: 'string' }, { key: 'inherited', type: 'field', dataType: 'string' },
    ] }] };
    const values = Object.assign(Object.create({ inherited: 'must ignore' }), { answer: null });
    const expected = { group: { label: 'Group' }, 'group.answer': { label: 'Answer' } };
    expect(captureResponseFieldMetadata(nested, { ...response, data: { group: values } }, reader(expected))).toEqual(expected);
  });
  it('propagates an options reader refusal without converting it into empty options', () => {
    const refusal = new Error('original-remote-options-unproven');
    expect(() => captureResponseFieldMetadata(definition, response, {
      label: reader(original).label, options() { throw refusal; },
    })).toThrow(refusal);
  });

  it('stores a prototype-named Item as an own property without changing the result prototype', () => {
    const named: FormDefinition = { ...definition, items: [{ key: '__proto__', type: 'field', dataType: 'string' }] };
    const result = captureResponseFieldMetadata(named, { ...response, data: JSON.parse('{"__proto__":"answer"}') }, {
      label: () => 'Original label', options: () => [],
    });
    expect(Object.hasOwn(result, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.keys(result)).toEqual(['__proto__']);
    expect(result['__proto__']).toEqual({ label: 'Original label' });
  });

});
