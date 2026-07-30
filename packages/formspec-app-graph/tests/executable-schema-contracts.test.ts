/** @filedesc Executable JSON Schema and Registry port-name lint. */

import { describe, expect, it } from 'vitest';
import {
  validateExecutableSchemaContracts,
  type AppGraphContext,
  type ResolvedArtifactHandle,
} from '../src/index.js';

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    source: `memory://${slot}`,
    document,
  };
}

function context(handles: ResolvedArtifactHandle[]): AppGraphContext {
  const manifest = handle('manifest', 'appManifest', {});
  return {
    manifest,
    handles: [manifest, ...handles],
    schemaResults: [],
    evidenceResults: [],
  };
}

describe('validateExecutableSchemaContracts', () => {
  it('rejects invalid widget props schemas and duplicate named ports even when unused', () => {
    const registry = handle('registry', 'registry', {
      entries: [{
        name: 'x-example-panel',
        category: 'widget',
        widgetShape: {
          widgetName: 'ExamplePanel',
          props: { type: 'banana' },
          dataInputs: [
            { name: 'records', required: true },
            { name: 'records', required: false },
          ],
          actionOutputs: [
            { name: 'open' },
            { name: 'open', description: 'Duplicate name, different object.' },
          ],
        },
      }],
    });

    const diagnostics = validateExecutableSchemaContracts(context([registry]));

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'REG-WIDGET-PROPS-SCHEMA-INVALID',
      'REG-WIDGET-PORT-NAME-COLLISION',
      'REG-WIDGET-PORT-NAME-COLLISION',
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/entries/0/widgetShape/props',
      '/entries/0/widgetShape/dataInputs/1',
      '/entries/0/widgetShape/actionOutputs/1',
    ]);
  });

  it('rejects an invalid Data Source payload schema', () => {
    const dataSources = handle('dataSources', 'dataSources', {
      sources: [{
        id: 'query:records',
        schema: { type: 'not-a-json-schema-type' },
      }],
    });

    expect(validateExecutableSchemaContracts(context([dataSources]))).toMatchObject([{
      code: 'DATA-SOURCE-PAYLOAD-SCHEMA-INVALID',
      primarySource: { jsonPointer: '/sources/0/schema' },
      details: { reason: 'json-schema-meta-validation-failed' },
    }]);
  });

  it('rejects incomplete delivery declarations and duplicate rendered-node patterns', () => {
    const registry = handle('registry', 'registry', {
      entries: [{
        name: 'x-incomplete',
        category: 'widget',
        widgetShape: {
          widgetName: 'Incomplete',
          deliveryContractId: 'example/Incomplete@1',
        },
      }, {
        name: 'x-duplicate',
        category: 'widget',
        widgetShape: {
          widgetName: 'Duplicate',
          deliveryContractId: 'example/Duplicate@1',
          renderedConfigNodes: [
            { pointerPattern: '/cards/*', kind: 'card' },
            { pointerPattern: '/cards/*', kind: 'different-card' },
          ],
        },
      }],
    });

    expect(validateExecutableSchemaContracts(context([registry]))).toEqual([
      expect.objectContaining({
        code: 'REG-WIDGET-DELIVERY-CONTRACT-INCOMPLETE',
        primarySource: expect.objectContaining({
          jsonPointer: '/entries/0/widgetShape',
        }),
      }),
      expect.objectContaining({
        code: 'REG-WIDGET-RENDERED-NODE-PATTERN-COLLISION',
        primarySource: expect.objectContaining({
          jsonPointer: '/entries/1/widgetShape/renderedConfigNodes/1',
        }),
      }),
    ]);
  });

  it('accepts valid schemas and unique ports', () => {
    const registry = handle('registry', 'registry', {
      entries: [{
        name: 'x-example-panel',
        category: 'widget',
        widgetShape: {
          widgetName: 'ExamplePanel',
          props: {
            type: 'object',
            properties: { title: { type: 'string' } },
          },
          dataInputs: [{ name: 'records', required: true }],
          actionOutputs: [{ name: 'open' }],
        },
      }],
    });
    const dataSources = handle('dataSources', 'dataSources', {
      sources: [{
        id: 'query:records',
        schema: {
          type: 'array',
          items: { type: 'object' },
        },
      }],
    });

    expect(validateExecutableSchemaContracts(context([registry, dataSources]))).toEqual([]);
  });
});
