/** @filedesc Verify subject keys against the loaded Definition and containing route. */
import { describe, expect, it } from 'vitest';
import { validateSurfaceDefinitionSlots } from '../src/surface-definition-slots.js';
import type { ResolvedArtifactHandle } from '../src/types.js';

const url = 'https://example.test/definitions/filing';

function validate(keys: object | undefined, subjectKeys?: object, otherVersionKeys?: object, pinnedVersion?: string) {
  const versions = otherVersionKeys === undefined ? [keys] : [keys, otherVersionKeys];
  const manifest: ResolvedArtifactHandle = {
    slot: 'app', artifactKind: 'appManifest', status: 'loaded',
    document: { definitions: pinnedVersion === undefined
      ? versions.map((_, index) => ({ url, version: `${index + 1}.0.0` }))
      : [{ url, version: pinnedVersion }] },
  };
  return validateSurfaceDefinitionSlots({
    manifest,
    handles: [
      ...versions.map((keys, index): ResolvedArtifactHandle => {
        const version = `${index + 1}.0.0`;
        return { slot: `definitions[${index}]`, artifactKind: 'definition', status: 'loaded', ref: { url, version },
          document: { url, version, ...(keys === undefined ? {} : { subject: { type: 'urn:filing', keys } }) } };
      }),
      { slot: 'surfaces[0]', artifactKind: 'surface', status: 'loaded',
        document: { routes: [{
          id: 'file', params: [{ name: 'year', type: 'string' }],
          slots: [{ id: 'form', slotType: 'definition-form', binding: {
            definitionRef: url, ...(subjectKeys === undefined ? {} : { subjectKeys }),
          } }],
        }] } },
    ],
    schemaResults: [],
    evidenceResults: [],
  });
}

describe('definition-form subjectKeys', () => {
  const keys = { period: { dataType: 'integer' } };
  it.each([
    [keys, undefined, 'subject-key-unbound'],
    [keys, { wrong: 'year' }, 'subject-key-undeclared'],
    [keys, { period: 'missing' }, 'subject-route-parameter-undeclared'],
    [undefined, {}, 'subject-not-declared'],
  ])('refuses an incoherent binding %#', (definitionKeys, binding, reason) => {
    expect(validate(definitionKeys, binding)).toContainEqual(expect.objectContaining({
      code: 'APP-GRAPH-SURFACE-SUBJECT-KEYS',
      details: expect.objectContaining({ reason }),
    }));
  });

  it('admits full bindings, singleton subjects, and forms with no subject', () => {
    expect(validate(keys, { period: 'year' })).toEqual([]);
    expect(validate({})).toEqual([]);
    expect(validate({}, {})).toEqual([]);
    expect(validate(undefined)).toEqual([]);
  });

  it('checks historical versions even when the app pins one Definition', () => {
    expect(validate(keys, { period: 'year' }, {}, '1.0.0')).toMatchObject([{
      relatedSources: [{ artifactSlot: 'definitions[1]', jsonPointer: '/subject' }],
      details: { reason: 'subject-key-undeclared', key: 'period' },
    }]);
  });

  it.each([0, 1])('checks the subject binding of loaded version at index %s', index => {
    const extraKey = { ...keys, agency: { dataType: 'string' } };
    const versions = index === 0 ? [extraKey, keys] : [keys, extraKey];
    expect(validate(versions[0], { period: 'year' }, versions[1])).toMatchObject([{
      code: 'APP-GRAPH-SURFACE-SUBJECT-KEYS',
      relatedSources: [{ artifactSlot: `definitions[${index}]`, jsonPointer: '/subject' }],
      details: { reason: 'subject-key-unbound', key: 'agency' },
    }]);
    expect(validate(keys, { period: 'year' }, keys)).toEqual([]);
  });
});
