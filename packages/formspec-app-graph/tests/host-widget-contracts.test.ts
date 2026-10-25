/** @filedesc Authoring-time check of Registry widget entries against the deployment host's shipped contracts. */

import { describe, expect, it } from 'vitest';
import {
  hostWidgetContractSet,
  selectHostWidgetContract,
  validateAppGraph,
  widgetContractMismatchReasons,
  type HostWidgetContracts,
  type ResolvedArtifactHandle,
  type WidgetRuntimeContract,
} from '../src/index.js';

const NODES = [
  { pointerPattern: '', kind: 'panel' },
  { pointerPattern: '/blocks/*', kind: 'panel-block' },
];
const DELIVERY = '@example/Panel@0.1';
const variant = (registryEntryVersion: string): WidgetRuntimeContract => ({
  deliveryContractId: DELIVERY,
  registryEntryVersion,
  renderedConfigNodes: NODES,
});
const HOST: HostWidgetContracts = {
  anyModule: { Panel: [variant('0.1.0'), variant('0.1.1')] },
};

function handle(slot: string, artifactKind: string, document: unknown): ResolvedArtifactHandle {
  return { slot, artifactKind, status: 'loaded', source: `memory://${slot}`, ref: { url: `https://example.gov/${slot}`, version: '1.0.0' }, document };
}

function validate(
  entry: { version: string; renderedConfigNodes?: unknown; deliveryContractId?: string },
  host: HostWidgetContracts | 'none' = HOST,
  widgetName = 'Panel',
  declaresContract = true,
) {
  return validateAppGraph({
    manifest: handle('manifest', 'appManifest', {}),
    artifacts: {
      registries: [handle('registry', 'registry', {
        entries: [
          { name: 'x-panel-module', category: 'module', version: '1.0.0', contributes: ['x-panel'] },
          {
            name: 'x-panel',
            category: 'widget',
            version: entry.version,
            widgetShape: declaresContract
              ? {
                widgetName,
                deliveryContractId: entry.deliveryContractId ?? DELIVERY,
                renderedConfigNodes: entry.renderedConfigNodes ?? NODES,
              }
              : { widgetName },
          },
        ],
      })],
      surfaces: [handle('surface', 'surface', {
        routes: [{ id: 'home', slots: [{ id: 'panel', slotType: 'module-widget', binding: { moduleId: 'x-panel-module', widgetName } }] }],
      })],
    },
    schemaValidators: () => ({ ok: true }),
    ...(host === 'none' ? {} : { hostWidgetContracts: host }),
  }).diagnostics.filter((diagnostic) => diagnostic.code.startsWith('WIDGET-'));
}

describe('widgetContractMismatchReasons', () => {
  it('names each axis a delivered contract differs on', () => {
    const entry = { version: '1.0.0', widgetShape: { deliveryContractId: 'other', renderedConfigNodes: NODES.slice(0, 1) } };
    expect(widgetContractMismatchReasons(entry, variant('0.1.0'))).toEqual([
      'registry-entry-version-mismatch',
      'delivery-contract-id-mismatch',
      'rendered-config-inventory-mismatch',
    ]);
    expect(widgetContractMismatchReasons(entry, undefined)).toEqual(['runtime-contract-missing']);
    expect(widgetContractMismatchReasons({ version: '9', widgetShape: {} }, undefined)).toEqual([]);
  });

  it('selects the variant the entry matches, else the smallest gap', () => {
    const variants = [variant('0.1.0'), variant('0.1.1')];
    expect(selectHostWidgetContract(variants, { version: '0.1.1', widgetShape: { deliveryContractId: DELIVERY, renderedConfigNodes: NODES } }))
      .toBe(variants[1]);
    expect(selectHostWidgetContract(variants, { version: '0.1.1', widgetShape: { deliveryContractId: DELIVERY, renderedConfigNodes: [] } }))
      .toBe(variants[1]);
  });
});

describe('validateHostWidgetContracts', () => {
  it('accepts every shipped version with the full node list, in any order', () => {
    expect(validate({ version: '0.1.0' })).toEqual([]);
    expect(validate({ version: '0.1.1', renderedConfigNodes: [...NODES].reverse() })).toEqual([]);
  });

  it('refuses a version the host does not ship with the publication reason code', () => {
    const [diagnostic, ...rest] = validate({ version: '1.0.0' });
    expect(rest).toEqual([]);
    expect(diagnostic).toMatchObject({
      code: 'WIDGET-DELIVERY-CONTRACT-MISMATCH',
      severity: 'error',
      details: { moduleId: 'x-panel-module', widgetName: 'Panel', contributionName: 'x-panel', reasons: ['registry-entry-version-mismatch'], shippedVersions: ['0.1.0', '0.1.1'] },
    });
  });

  it('refuses a short rendered-config list with the publication reason code', () => {
    expect(validate({ version: '0.1.1', renderedConfigNodes: NODES.slice(0, 1) })[0]?.details?.reasons)
      .toEqual(['rendered-config-inventory-mismatch']);
  });

  it('a widget the host supplies without a contract resolves as the runtime resolver does', () => {
    const host = { anyModule: { Panel: [] } };
    expect(validate({ version: '0.1.0', deliveryContractId: undefined, renderedConfigNodes: undefined }, host, 'Panel', false)).toEqual([]);
    expect(validate({ version: '0.1.0' }, host)[0]).toMatchObject({
      code: 'WIDGET-DELIVERY-CONTRACT-MISMATCH',
      details: { reasons: ['runtime-contract-missing'], shippedVersions: [] },
    });
  });

  it('refuses a binding the host does not supply at all', () => {
    expect(validate({ version: '0.1.0' }, { anyModule: {} }).map((diagnostic) => diagnostic.code))
      .toEqual(['WIDGET-UNIMPLEMENTED']);
  });

  it('names the widgets the host does ship for that module, so an author can pick one', () => {
    const [diagnostic] = validate({ version: '0.1.0' }, { anyModule: { Banner: [], Table: [variant('0.1.0')] } }, 'Panel');
    expect(diagnostic?.details?.shippedWidgets).toEqual(['Banner', 'Table']);
    expect(diagnostic?.message).toContain('It ships: Banner, Table.');
    const [perModule] = validate({ version: '0.1.0' }, { anyModule: { Banner: [] }, modules: { 'x-panel-module': {} } }, 'Panel');
    expect(perModule?.details?.shippedWidgets).toEqual([]);
    expect(perModule?.message).toContain('It ships none for this module.');
  });

  it('a per-module host set replaces anyModule for that module', () => {
    expect(validate({ version: '0.1.0' }, { anyModule: HOST.anyModule, modules: { 'x-panel-module': { Panel: [variant('0.1.1')] } } })[0]?.details?.reasons)
      .toEqual(['registry-entry-version-mismatch']);
  });

  it('checks nothing when the caller supplies no host contracts', () => {
    expect(validate({ version: '1.0.0' }, 'none')).toEqual([]);
  });
});

describe('hostWidgetContractSet', () => {
  it('collects each widget\'s distinct contracts across the module variants a host can build', () => {
    const component = () => null;
    expect(hostWidgetContractSet([
      { widgets: { Panel: component, Other: component, Banner: component }, contracts: { Panel: variant('0.1.0'), Other: variant('0.1.0') } },
      { widgets: { Panel: component, Other: component, Banner: component }, contracts: { Panel: variant('0.1.1'), Other: variant('0.1.0') } },
    ])).toEqual({ Panel: [variant('0.1.0'), variant('0.1.1')], Other: [variant('0.1.0')], Banner: [] });
  });
});
