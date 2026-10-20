import { describe, expect, it } from 'vitest';
import { createAcceptedReviewFieldSelection, resolveAcceptedReviewFieldPaths } from '../src/widgets/response-review-selection.js';
const items = [{ key: 'person', type: 'group', children: [{ key: 'name', type: 'field' },
  { key: 'secret', type: 'field' }] }, { key: 'rows', type: 'group', repeatable: true,
  children: [{ key: 'enabled', type: 'field' }, { key: 'nested', type: 'group', repeatable: true,
    children: [{ key: 'value', type: 'field' }] }] }, { key: 'optional', type: 'field' }];
describe('native accepted review field selection', () => {
  it('resolves declared nested and missing optional fields without requiring answers', () => {
    const selection = createAcceptedReviewFieldSelection(items, ['person.name', 'optional']);
    expect(selection.includes('person.name')).toBe(true);
    expect(selection.includes('optional')).toBe(true);
    expect(selection.includes('person.secret')).toBe(false);
    expect(selection.contains('person')).toBe(true);
    expect(selection.includes('person')).toBe(false);
  });
  it('matches wildcard and indexed paths across nested repeated groups', () => {
    const selection = createAcceptedReviewFieldSelection(items, ['rows[*].nested[2].value']);
    expect(selection.contains('rows')).toBe(true);
    expect(selection.contains('rows[0].nested[2]')).toBe(true);
    expect(selection.includes('rows[7].nested[2].value')).toBe(true);
    expect(selection.includes('rows[7].nested[1].value')).toBe(false);
    expect(selection.includes('rows[7].enabled')).toBe(false);
  });
  it.each([[], ['person'], ['unknown'], ['person.unknown'], ['rows.enabled'], ['optional[0]'],
    ['.optional'], ['optional.'], ['person..name'], ['rows[00].enabled'], ['rows[-1].enabled'],
    ['rows[@index].enabled'], ['rows[9007199254740992].enabled'], ['rows[*].enabled', 'rows[0].enabled'],
    ['optional', 'optional']].map(paths => [paths]))('refuses invalid or overlapping selectors %j', paths => {
    expect(() => createAcceptedReviewFieldSelection(items, paths)).toThrow();
  });
  it('refuses ambiguous duplicate Definition keys', () => {
    expect(() => createAcceptedReviewFieldSelection([{key:'name',type:'field'},{key:'name',type:'field'}], ['name'])).toThrow();
  });
});

describe('concrete recorded selected paths', () => {
  it('expands declared repeated leaves and excludes optional absent and extra answers', () => {
    expect(resolveAcceptedReviewFieldPaths(items, {person:{name:'Visible',secret:'Hidden'}, rows:[
      {enabled:false,extra:'Hidden'}, {enabled:true}],extra:'Hidden'}, ['rows[*].enabled','optional']))
      .toEqual(['rows[0].enabled','rows[1].enabled']);
  });
  it('admits empty repeats and absent indexed rows', () => {
    expect(resolveAcceptedReviewFieldPaths(items, {rows:[]}, ['rows[*].enabled'])).toEqual([]);
    expect(resolveAcceptedReviewFieldPaths(items, {rows:[{enabled:true}]}, ['rows[8].enabled'])).toEqual([]);
  });
  it.each([{rows:{enabled:true}}, {rows:[null]}, {person:'malformed'}])('refuses malformed selected group %j', data => {
    expect(() => resolveAcceptedReviewFieldPaths(items, data, ['rows[*].enabled','person.name'])).toThrow();
  });
});

describe('public selected review schemas and Registry profiles', () => {
  it('keeps 0.1.0 props closed and 0.1.1 policies required', async () => {
    const metadata = await import('../src/widget-metadata.js');
    const { default: Ajv } = await import('ajv');
    const ajv = new Ajv({strict:false});
    const old = ajv.compile(metadata.ACCEPTED_RESPONSE_REVIEW_CONFIG_SCHEMA);
    const next = ajv.compile(metadata.ACCEPTED_RESPONSE_REVIEW_CONFIG_SCHEMA_V011);
    const copy = Object.fromEntries([...metadata.RESPONSE_REVIEW_COPY_KEYS,'acceptedRecord'].map(key => [key,'copy']));
    const config = {copy:{en:copy}};
    const selected = {...config,fieldSelection:{policyId:'display',definitionUrl:'urn:test',definitionVersion:'1.0.0',fieldPaths:['rows[*].nested[2].value']}};
    expect(old(config)).toBe(true);expect(old(selected)).toBe(false);
    expect(next(config)).toBe(false);expect(next(selected)).toBe(true);
    const qualified = ajv.compile(metadata.ACCEPTED_RESPONSE_REVIEW_FIELD_SELECTION_SCHEMA);
    const selection = {policyId:'display',definitionUrl:'urn:test',definitionVersion:'1.0.0',permittedPaths:[]};
    expect(qualified(selection)).toBe(true);
    expect(qualified({...selection,permittedPaths:['rows[0].nested[2].value']})).toBe(true);
    expect(qualified({...selection,permittedPaths:['rows[0].nested[*].value']})).toBe(false);
    expect(qualified({...selection,permittedPaths:['rows[*].nested[2].value']})).toBe(false);
    expect(qualified({...selection,permittedPaths:['rows[00].nested[2].value']})).toBe(false);
  });
  it('selects versions and delivery declarations explicitly for both accepted aliases', async () => {
    const {starterWidgetModule} = await import('../src/widgets/index.js');
    const legacy = starterWidgetModule('x-test'), selected = starterWidgetModule('x-test',{acceptedResponseReviewRegistryEntryVersion:'0.1.1'});
    for (const alias of ['AcceptedResponseReview','x-accepted-response-review']) {
      expect(legacy.contracts?.[alias]?.registryEntryVersion).toBe('0.1.0');
      expect(selected.contracts?.[alias]?.registryEntryVersion).toBe('0.1.1');
      expect(selected.contracts?.[alias]?.renderedConfigNodes).toContainEqual({pointerPattern:'/fieldSelection/fieldPaths/*',kind:'response-review-selected-field'});
    }
    expect(selected.contracts?.ResponseReview?.registryEntryVersion).toBe('0.1.0');
    expect(() => starterWidgetModule('x-test', {acceptedResponseReviewRegistryEntryVersion:'0.1.2'} as any)).toThrow();
  });
});
