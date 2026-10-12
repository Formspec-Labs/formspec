import { describe, expect, it } from 'vitest';
import { createWidgetRegistry } from '@formspec-org/surface';
import type { RegistryEntry } from '@formspec-org/types';
import { starterWidgetModule, STRUCTURED_PANEL_DELIVERY_CONTRACT_ID, STRUCTURED_PANEL_RENDERED_CONFIG_NODES } from '../src/widgets/index.js';

function resolve(version: string, options: Parameters<typeof starterWidgetModule>[1] = {}) {
  const registryEntries = [{ name: 'x-versioned', category: 'module', version: '0.1.0', status: 'stable', contributes: ['x-panel'] },
    { name: 'x-panel', category: 'widget', version, status: 'stable', widgetShape: {
      widgetName: 'StructuredPanel', deliveryContractId: STRUCTURED_PANEL_DELIVERY_CONTRACT_ID,
      renderedConfigNodes: STRUCTURED_PANEL_RENDERED_CONFIG_NODES,
    } }] as unknown as RegistryEntry[];
  return createWidgetRegistry({ registryEntries, modules: [starterWidgetModule('x-versioned', options)] })
    .resolve({ moduleId: 'x-versioned', widgetName: 'StructuredPanel' });
}

describe('explicit StructuredPanel Registry version support', () => {
  it('keeps default 0.1.0 support and requires explicit 0.1.1 selection', () => {
    expect(resolve('0.1.0').status).toBe('resolved');
    expect(resolve('0.1.1')).toMatchObject({ status: 'incompatible', reasons: ['registry-entry-version-mismatch'] });
    expect(resolve('0.1.1', { structuredPanelRegistryEntryVersion: '0.1.1' }).status).toBe('resolved');
    expect(resolve('0.1.2', { structuredPanelRegistryEntryVersion: '0.1.1' }).status).toBe('incompatible');
  });

  it('applies the selected version to both panel aliases while retaining other widget versions', () => {
    const module = starterWidgetModule('x-versioned', { structuredPanelRegistryEntryVersion: '0.1.1' });
    expect(module.contracts?.StructuredPanel?.registryEntryVersion).toBe('0.1.1');
    expect(module.contracts?.['x-structured-panel']?.registryEntryVersion).toBe('0.1.1');
    expect(module.contracts?.AcceptedResponseReview?.registryEntryVersion).toBe('0.1.0');
    expect(module.contracts?.SigningCeremony?.registryEntryVersion).toBe('0.1.0');
  });

  it('admits authored table ordering only with explicit 0.1.2 selection', () => {
    expect(resolve('0.1.2')).toMatchObject({ status: 'incompatible' });
    expect(resolve('0.1.2', { structuredPanelRegistryEntryVersion: '0.1.2' }).status).toBe('resolved');
    const module = starterWidgetModule('x-versioned', { structuredPanelRegistryEntryVersion: '0.1.2' });
    expect(module.contracts?.['x-structured-panel']?.registryEntryVersion).toBe('0.1.2');
    expect(module.contracts?.QueueTable?.registryEntryVersion).toBe('0.1.0');
  });

  it('refuses unsupported values supplied by untyped callers', () => {
    expect(() => starterWidgetModule('x-versioned', {
      // @ts-expect-error Deliberately exercise the JavaScript admission boundary.
      structuredPanelRegistryEntryVersion: '0.1.3',
    })).toThrow(/Unsupported StructuredPanel Registry entry version/);
  });
});
