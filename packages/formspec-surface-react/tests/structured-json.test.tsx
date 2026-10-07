/** @filedesc Literal retained evidence visibility, distinct from host admission. */
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it, vi } from 'vitest';
import { StructuredPanel, STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA } from '../src/widgets/index.js';
import type { SurfaceWidgetProps } from '../src/widget-api.js';
import common from '../../../schemas/common.schema.json';
import registry from '../../../schemas/registry.schema.json';
import reportSchema from '../../../schemas/validation-report.schema.json';
import resultSchema from '../../../schemas/validation-result.schema.json';
import reports from '../../../crates/formspec-core/tests/fixtures/validation-report-assembly.json';
import { render } from './render.js';

const trace = { 'x-generation': { anchors: ['need:read-retained-evidence@1'] } };
const block = { type: 'json', id: 'evidence', path: 'evidence', title: 'Retained evidence',
  emptyMessage: 'Evidence was not supplied.', unavailableMessage: 'Evidence cannot be displayed.', ...trace };
function view(data: Record<string, unknown>, config = block) {
  const props: SurfaceWidgetProps = { moduleId: 'x-test', widgetName: 'StructuredPanel',
    slot: { id: 'slot', title: undefined }, route: { surfaceId: 's', routeId: 'r', routeClass: 'operation', params: {} },
    headingLevel: 2, config: { ...trace, blocks: [config] }, data, emitAction: vi.fn(), admitsTenantTheme: true };
  return render(<StructuredPanel {...props} />);
}

describe('StructuredPanel JSON blocks', () => {
  it('shows the complete admitted report and original supplied receipt without deriving a verdict', () => {
    const ajv = new Ajv({ strict: false }); addFormats(ajv); ajv.addSchema(resultSchema);
    const report = reports[1]!.expected;
    expect(ajv.compile(reportSchema)(report)).toBe(true);
    const receipt = { status: 'unverified', profile: 'response-signature',
      details: { response_id: 'response-1', form_version_id: 'stored-version-1', verified: false,
        response_hash: 'retained-response-hash', signed_payload_digest: 'retained-payload-digest' } };
    const original = { validationReport: report, signatureVerification: receipt };
    const before = JSON.stringify(original), el = view({ evidence: original });
    expect(JSON.parse(el.querySelector('pre')!.textContent!)).toEqual(original);
    expect(JSON.stringify(original)).toBe(before);
    expect(el.querySelector('pre')?.getAttribute('data-need-anchors')).toBe('need:read-retained-evidence@1');
    expect(el.querySelector('input,button,select,textarea')).toBeNull();
  });

  it.each([null, false, 0, '', [], {}])('preserves explicit JSON value %j rather than absence', value => {
    const el = view({ evidence: value });
    expect(el.querySelector('pre')?.textContent).toBe(JSON.stringify(value, null, 2));
    expect(el.textContent).not.toContain(block.emptyMessage);
  });

  it('distinguishes missing evidence from a present undefined value and invalid paths', () => {
    expect(view({}).textContent).toContain(block.emptyMessage);
    expect(view({ evidence: undefined }).textContent).toContain(block.unavailableMessage);
    expect(view({ evidence: {} }, { ...block, path: 'evidence.__proto__' }).textContent).toContain(block.unavailableMessage);
  });

  it.each(['root', 'intermediate', 'nested'])('refuses %s getters without invoking them', kind => {
    const getter = vi.fn(() => 'secret'); const obj: Record<string, unknown> = {};
    Object.defineProperty(obj, kind === 'nested' ? 'value' : 'evidence', { enumerable: true, get: getter });
    const data = kind === 'root' ? obj : kind === 'intermediate' ? { parent: obj } : { evidence: obj };
    const el = view(data, { ...block, path: kind === 'intermediate' ? 'parent.evidence' : 'evidence' });
    expect(getter).not.toHaveBeenCalled(); expect(el.querySelector('pre')).toBeNull();
    expect(el.textContent).toContain(block.unavailableMessage);
  });

  it.each([NaN, Infinity, new Date(), [undefined]])('refuses unsupported values without partial output', value => {
    const el = view({ evidence: { retained: 'valid child', refused: value } });
    expect(el.querySelector('pre')).toBeNull(); expect(el.textContent).toContain(block.unavailableMessage);
    expect(el.textContent).not.toContain('valid child');
  });

  it('refuses cycles and the maintained snapshot depth limit', () => {
    const cycle: any = {}; cycle.self = cycle;
    let deep: any = null; for (let i = 0; i < 130; i++) deep = { nested: deep };
    for (const evidence of [cycle, deep]) expect(view({ evidence }).textContent).toContain(block.unavailableMessage);
  });

  it('requires authored Need anchors and separate missing/refused copy', () => {
    expect(view({ evidence: {} }, { ...block, 'x-generation': { anchors: [] } }).querySelector('[data-block-id]')).toBeNull();
    expect(view({ evidence: {} }, { ...block, emptyMessage: '' }).querySelector('[data-block-id]')).toBeNull();
    expect(view({ evidence: {} }, { ...block, unavailableMessage: '' }).querySelector('[data-block-id]')).toBeNull();
  });

  it('publishes a reusable branch that admits actual authored Registry props', () => {
    const ajv = new Ajv({ strict: false }); addFormats(ajv); ajv.addSchema(common);
    const validateBlock = ajv.compile(STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA);
    expect(validateBlock(block), JSON.stringify(validateBlock.errors)).toBe(true);
    expect(validateBlock({ ...block, emptyMessage: undefined })).toBe(false);
    const shape = { widgetName: 'StructuredPanel', props: { type: 'object', properties: {
      blocks: { type: 'array', items: STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA } } },
      dataInputs: [{ name: 'evidence', required: true }], childrenPolicy: 'none',
      deliveryContractId: '@formspec-org/surface-react/StructuredPanel@0.1',
      renderedConfigNodes: [{ pointerPattern: '', kind: 'structured-panel' },
        { pointerPattern: '/blocks/*', kind: 'structured-panel-block' }] };
    const document = { $formspecRegistry: '1.1', publisher: { name: 'Test' }, published: '2026-10-07T00:00:00Z', entries: [
      { name: 'x-structured-panel', category: 'widget', version: '0.1.0', status: 'stable', description: 'Literal JSON display.',
        compatibility: { formspecVersion: '>=1.0.0 <2.0.0' }, widgetShape: shape } ] };
    const validateRegistry = ajv.compile(registry);
    expect(validateRegistry(document), JSON.stringify(validateRegistry.errors)).toBe(true);
    expect(ajv.compile(shape.props)({ blocks: [block] })).toBe(true);
  });
});
