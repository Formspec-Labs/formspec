/** @filedesc Whole-panel authoring parity and unchanged JSON branch. */
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import { STRUCTURED_PANEL_CONFIG_SCHEMA, STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA } from '../src/widget-metadata.js';
import type { StructuredPanelConfig } from '../src/widgets/structured-panel.js';
import common from '../../../schemas/common.schema.json';

const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv); ajv.addSchema(common);
const validate = ajv.compile(STRUCTURED_PANEL_CONFIG_SCHEMA);
const testFile = (relative: string) => new URL(relative, import.meta.url);
const trace = { 'x-generation': { anchors: ['need:inspect-evidence@1'] } };
const confirmation = { heading: 'Confirm', body: 'Proceed?', confirmLabel: 'Proceed', cancelLabel: 'Cancel', ...trace };
const config = {
  id: 'summary', title: 'Evidence', ...trace,
  emptyWhen: { inputName: 'caseFile', path: '' },
  blocks: [
    { type: 'metric', id: 'count', path: 'caseFile.count', prefix: '#', suffix: ' cases', ...trace },
    { type: 'key-value', id: 'facts', items: [
      { id: 'caseId', label: 'Case', path: 'caseFile.id', ...trace },
      { id: 'route', label: 'Route', routeParam: 'caseId', ...trace },
    ], ...trace },
    { type: 'list', id: 'names', path: 'caseFile.people', itemPath: 'name', ordered: true, ...trace },
    { type: 'table', id: 'tasks', path: 'caseFile.tasks', responsiveMode: 'scroll',
      columns: [{ id: 'task', label: 'Task', path: 'name', ...trace }],
      rowAction: { outputName: 'openTask', columnLabel: 'Open', payload: { task: { path: '' } }, confirmation, ...trace }, ...trace },
    { type: 'progress', id: 'progress', path: 'caseFile.completed', max: -1, maxPath: 'caseFile.total', ...trace },
    { type: 'json', id: 'report', path: 'caseFile.validationReport', emptyMessage: 'Empty', unavailableMessage: 'Unavailable', ...trace },
  ],
  actions: [{ outputName: 'refresh', order: 0.5, payload: { caseFile: { path: '' } }, confirmation, ...trace }],
  stateViews: Object.fromEntries(['loading', 'empty', 'unavailable', 'error'].map(state => [state, {
    heading: state, body: 'Evidence status', ...trace, actions: [
      { kind: 'retry', label: 'Retry', ...trace }, { kind: 'output', outputName: 'refresh', ...trace },
    ],
  }])),
} satisfies StructuredPanelConfig;

describe('maintained whole StructuredPanel props', () => {
  it('covers six blocks, nested presentations, all state views and actions', () => {
    expect(validate(config), JSON.stringify(validate.errors)).toBe(true);
    expect(STRUCTURED_PANEL_CONFIG_SCHEMA.properties.blocks.items.oneOf.at(-1)).toBe(STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA);
    const fixture = JSON.parse(readFileSync(testFile('../../../crates/formspec-lint/tests/fixtures/widget-json-props.json'), 'utf8'));
    expect(STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA).toEqual(fixture);
  });
  it.each([{}, { title: 'Header' }, { blocks: [] }, { actions: [] }, { stateViews: {} }])('preserves optional panel compositions: %j', candidate => {
    expect(validate(candidate), JSON.stringify(validate.errors)).toBe(true);
  });
  it('preserves empty formatting affixes accepted by the renderer', () => {
    expect(validate({ blocks: [
      { type: 'metric', id: 'metric', path: 'amount', prefix: '', suffix: '' },
      { type: 'progress', id: 'progress', path: 'amount', suffix: '' },
    ] }), JSON.stringify(validate.errors)).toBe(true);
  });
  it.each([
    ['unknown root property', { dataInputs: [] }],
    ['unknown block', { blocks: [{ type: 'chart', id: 'chart' }] }],
    ['unsafe field path', { blocks: [{ type: 'metric', id: 'metric', path: 'caseFile.constructor.name' }] }],
    ['malformed Generation', { ...trace, 'x-generation': { anchors: 7 } }],
    ['missing column label', { blocks: [{ type: 'table', id: 'tasks', path: 'tasks', columns: [{ id: 'name', path: 'name' }] }] }],
    ['ambiguous fact selector', { blocks: [{ type: 'key-value', id: 'facts', items: [{ id: 'id', label: 'Id', path: 'id', routeParam: 'id' }] }] }],
    ['missing fact selector', { blocks: [{ type: 'key-value', id: 'facts', items: [{ id: 'id', label: 'Id' }] }] }],
    ['unsafe payload selector', { actions: [{ outputName: 'open', payload: { row: { path: '__proto__' } } }] }],
    ['unknown state', { stateViews: { complete: {} } }],
    ['incomplete retry action', { stateViews: { error: { actions: [{ kind: 'retry' }] } } }],
    ['incomplete confirmation', { actions: [{ outputName: 'open', confirmation: { heading: 'Confirm' } }] }],
    ['incomplete JSON copy', { blocks: [{ type: 'json', id: 'json', path: 'report', emptyMessage: 'Empty', ...trace }] }],
  ])('rejects %s', (_name, candidate) => expect(validate(candidate)).toBe(false));
});
