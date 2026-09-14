/** @filedesc Focused StructuredPanel cross-artifact semantic lint coverage. */

import { describe, expect, it } from 'vitest';
import {
  STRUCTURED_PANEL_CONTRACT_CODES,
  validateStructuredPanelContracts,
  type AppGraphContext,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const SURFACE_URL = 'https://example.gov/surfaces/main';
const CATALOG_URL = 'https://example.gov/data/panel';

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
  url = `https://example.gov/${slot}`,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    source: `memory://${slot}`,
    ref: { url, version: '1.0.0' },
    document,
  };
}

function fixture(
  config: Record<string, unknown>,
  options: {
    actionBindings?: Record<string, unknown>;
    actions?: unknown[];
    schema?: unknown;
  } = {},
): AppGraphContext {
  const manifest = handle('manifest', 'appManifest', {
    dataSources: [{ url: CATALOG_URL, version: '1.0.0' }],
  });
  const registry = handle('registry', 'registry', {
    entries: [{
      name: 'x-panel-module',
      category: 'module',
      contributes: ['x-panel-widget'],
    }, {
      name: 'x-panel-widget',
      category: 'widget',
      widgetShape: {
        widgetName: 'StructuredPanel',
        deliveryContractId: '@formspec-org/surface-react/StructuredPanel@0.1',
        actionOutputs: [
          { name: 'translated' },
          { name: 'literal' },
        ],
      },
    }],
  });
  const surface = handle('surface', 'surface', {
    routes: [{
      id: 'home',
      slots: [{
        id: 'panel',
        slotType: 'module-widget',
        binding: {
          moduleId: 'x-panel-module',
          widgetName: 'StructuredPanel',
          config,
          dataBindings: {
            primary: {
              catalogRef: CATALOG_URL,
              sourceRef: 'query:panel',
            },
          },
          ...(options.actionBindings
            ? { actionBindings: options.actionBindings }
            : {}),
        },
      }],
    }],
  }, SURFACE_URL);
  const dataSources = handle('dataSources', 'dataSources', {
    id: CATALOG_URL,
    sources: [{
      id: 'query:panel',
      schema: options.schema ?? {
        type: 'object',
        additionalProperties: false,
        properties: {
          stats: {
            type: 'object',
            additionalProperties: false,
            properties: {
              total: { type: 'number' },
              percentText: { type: 'string' },
            },
          },
          records: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { id: { type: 'string' } },
            },
          },
          labels: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: { label: { type: 'string' } },
            },
          },
          dynamic: { type: 'object' },
        },
      },
    }],
  }, CATALOG_URL);
  const responseActions = handle('responseActions', 'responseActions', {
    actions: options.actions ?? [],
  });
  return {
    manifest,
    handles: [manifest, registry, surface, dataSources, responseActions],
    schemaResults: [],
    evidenceResults: [],
  };
}

describe('validateStructuredPanelContracts', () => {
  it('reports every duplicate authored identity at the duplicate value', () => {
    const report = validateStructuredPanelContracts(fixture({
      blocks: [{
        id: 'summary',
        type: 'key-value',
        items: [
          { id: 'status', label: 'Status', routeParam: 'status' },
          { id: 'status', label: 'Again', routeParam: 'again' },
        ],
      }, {
        id: 'summary',
        type: 'table',
        columns: [
          { id: 'name', label: 'Name', path: 'name' },
          { id: 'name', label: 'Again', path: 'again' },
        ],
      }],
      actions: [
        { outputName: 'open' },
        { outputName: 'open' },
      ],
    }));

    const duplicates = report.filter((diagnostic) =>
      diagnostic.code.includes('DUPLICATE')
    );
    expect(duplicates.map((diagnostic) => diagnostic.code)).toEqual([
      STRUCTURED_PANEL_CONTRACT_CODES.duplicateBlockId,
      STRUCTURED_PANEL_CONTRACT_CODES.duplicateKeyValueItemId,
      STRUCTURED_PANEL_CONTRACT_CODES.duplicateTableColumnId,
      STRUCTURED_PANEL_CONTRACT_CODES.duplicateActionOutput,
    ]);
    expect(duplicates.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/routes/0/slots/0/binding/config/blocks/1/id',
      '/routes/0/slots/0/binding/config/blocks/0/items/1/id',
      '/routes/0/slots/0/binding/config/blocks/1/columns/1/id',
      '/routes/0/slots/0/binding/config/actions/1/outputName',
    ]);
  });

  it('rejects configured actions that are unbound or lack a literal label', () => {
    const report = validateStructuredPanelContracts(fixture({
      actions: [
        { outputName: 'missing' },
        { outputName: 'translated' },
        { outputName: 'literal' },
      ],
    }, {
      actionBindings: {
        translated: { actionRef: 'translated-action' },
        literal: { actionRef: 'literal-action' },
      },
      actions: [{
        id: 'translated-action',
        intent: 'review',
        label: { ref: 'actions.review' },
      }, {
        id: 'literal-action',
        intent: 'submit',
        label: { literal: 'Continue' },
      }],
    }));

    expect(report).toMatchObject([{
      code: STRUCTURED_PANEL_CONTRACT_CODES.actionUnbound,
      primarySource: {
        jsonPointer: '/routes/0/slots/0/binding/config/actions/0/outputName',
      },
    }, {
      code: STRUCTURED_PANEL_CONTRACT_CODES.actionLabelNonLiteral,
      primarySource: {
        jsonPointer: '/routes/0/slots/0/binding/config/actions/1/outputName',
      },
      relatedSources: [{
        artifactSlot: 'responseActions',
        jsonPointer: '/actions/0/label',
      }],
    }]);
  });

  it('applies action binding checks to table row actions', () => {
    const report = validateStructuredPanelContracts(fixture({
      blocks: [{
        id: 'records',
        type: 'table',
        path: 'primary.records',
        columns: [{ id: 'id', label: 'ID', path: 'id' }],
        rowAction: {
          outputName: 'missing',
          columnLabel: 'Open',
        },
      }],
    }));

    expect(report).toMatchObject([{
      code: STRUCTURED_PANEL_CONTRACT_CODES.actionUnbound,
      primarySource: {
        jsonPointer: '/routes/0/slots/0/binding/config/blocks/0/rowAction/outputName',
      },
    }]);
  });

  it('rejects a declared row action confirmation the renderer cannot admit', () => {
    const trace = { 'x-generation': { anchors: ['need:protect-version@3'] } };
    const complete = {
      heading: 'Retire this version?',
      body: 'Existing records remain pinned to it.',
      confirmLabel: 'Retire version',
      cancelLabel: 'Keep version',
    };
    const table = (id: string, confirmation: unknown) => ({
      id,
      type: 'table',
      path: 'primary.records',
      columns: [{ id: 'id', label: 'ID', path: 'id' }],
      rowAction: { outputName: 'literal', columnLabel: 'Action', confirmation },
    });
    const report = validateStructuredPanelContracts(fixture({
      blocks: [
        table('valid', { ...complete, ...trace }),
        table('untraced', complete),
        table('unlabeled', { ...complete, cancelLabel: '', ...trace }),
        table('malformed', true),
      ],
    }, {
      actionBindings: { literal: { actionRef: 'literal-action' } },
      actions: [{ id: 'literal-action', intent: 'submit', label: { literal: 'Retire' } }],
    }));

    expect(report).toMatchObject([{
      code: STRUCTURED_PANEL_CONTRACT_CODES.actionConfirmationInvalid,
      primarySource: {
        jsonPointer: '/routes/0/slots/0/binding/config/blocks/1/rowAction/confirmation',
      },
      details: { missing: ['x-generation.anchors'] },
    }, {
      code: STRUCTURED_PANEL_CONTRACT_CODES.actionConfirmationInvalid,
      primarySource: {
        jsonPointer: '/routes/0/slots/0/binding/config/blocks/2/rowAction/confirmation',
      },
      details: { missing: ['cancelLabel'] },
    }, {
      code: STRUCTURED_PANEL_CONTRACT_CODES.actionConfirmationInvalid,
      primarySource: {
        jsonPointer: '/routes/0/slots/0/binding/config/blocks/3/rowAction/confirmation',
      },
      details: {
        missing: ['heading', 'body', 'confirmLabel', 'cancelLabel', 'x-generation.anchors'],
      },
    }]);
  });

  it('rejects only paths and result shapes proven impossible by exact source schemas', () => {
    const report = validateStructuredPanelContracts(fixture({
      blocks: [{
        id: 'missing',
        type: 'metric',
        path: 'primary.stats.typo',
      }, {
        id: 'wrong-progress-type',
        type: 'progress',
        path: 'primary.stats.percentText',
      }, {
        id: 'missing-list-item',
        type: 'list',
        path: 'primary.labels',
        itemPath: 'missing',
      }, {
        id: 'missing-column',
        type: 'table',
        path: 'primary.records',
        columns: [{ id: 'missing', label: 'Missing', path: 'missing' }],
      }, {
        id: 'unbound-input',
        type: 'metric',
        path: 'other.total',
      }],
    }));

    expect(report.map((diagnostic) => diagnostic.code)).toEqual([
      STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
      STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
      STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
      STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
      STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
    ]);
    expect(report.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/routes/0/slots/0/binding/config/blocks/0/path',
      '/routes/0/slots/0/binding/config/blocks/1/path',
      '/routes/0/slots/0/binding/config/blocks/2/itemPath',
      '/routes/0/slots/0/binding/config/blocks/3/columns/0/path',
      '/routes/0/slots/0/binding/config/blocks/4/path',
    ]);
    expect(report.slice(0, 4).every((diagnostic) =>
      diagnostic.relatedSources?.[0]?.jsonPointer === '/sources/0/schema'
    )).toBe(true);
    expect(report[4]?.details?.reason).toBe('data-input-unbound');
  });

  it('rejects FormResponse-envelope paths after the source schema is corrected to Response.data', () => {
    const report = validateStructuredPanelContracts(fixture({
      blocks: [{
        id: 'name',
        type: 'metric',
        path: 'primary.data.name',
      }],
    }, {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
        },
      },
    }));

    expect(report).toMatchObject([{
      code: STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
      primarySource: {
        jsonPointer: '/routes/0/slots/0/binding/config/blocks/0/path',
      },
      relatedSources: [{
        artifactSlot: 'dataSources',
        jsonPointer: '/sources/0/schema',
      }],
      details: {
        path: 'primary.data.name',
        reason: 'bound-source-schema-excludes-path',
      },
    }]);
  });

  it('accepts valid literal actions and leaves open schemas to runtime checks', () => {
    const report = validateStructuredPanelContracts(fixture({
      blocks: [{
        id: 'dynamic',
        type: 'metric',
        path: 'primary.dynamic.notDeclaredButAllowed',
      }, {
        id: 'records',
        type: 'table',
        path: 'primary.records',
        columns: [{ id: 'id', label: 'ID', path: 'id' }],
      }, {
        id: 'labels',
        type: 'list',
        path: 'primary.labels',
        itemPath: 'label',
      }],
      actions: [{ outputName: 'literal' }],
    }, {
      actionBindings: {
        literal: { actionRef: 'literal-action' },
      },
      actions: [{
        id: 'literal-action',
        intent: 'submit',
        label: { literal: 'Continue' },
      }],
    }));

    expect(report).toEqual([]);
  });

  it('checks empty selectors, progress maxima, and action payload selectors', () => {
    const report = validateStructuredPanelContracts(fixture({
      emptyWhen: {
        inputName: 'primary',
        path: 'missing',
      },
      blocks: [{
        id: 'progress',
        type: 'progress',
        path: 'primary.stats.total',
        maxPath: 'primary.stats.percentText',
      }, {
        id: 'records',
        type: 'table',
        path: 'primary.records',
        columns: [{ id: 'id', label: 'ID', path: 'id' }],
        rowAction: {
          outputName: 'literal',
          columnLabel: 'Open',
          payload: {
            resourceId: { path: 'missing' },
          },
        },
      }],
      actions: [{
        outputName: 'literal',
        payload: {
          selected: { path: 'primary.stats.missing' },
        },
      }],
    }, {
      actionBindings: {
        literal: { actionRef: 'literal-action' },
      },
      actions: [{
        id: 'literal-action',
        intent: 'submit',
        label: { literal: 'Continue' },
      }],
    }));

    expect(report.map((diagnostic) => diagnostic.primarySource?.jsonPointer)).toEqual([
      '/routes/0/slots/0/binding/config/emptyWhen/path',
      '/routes/0/slots/0/binding/config/actions/0/payload/selected/path',
      '/routes/0/slots/0/binding/config/blocks/0/maxPath',
      '/routes/0/slots/0/binding/config/blocks/1/rowAction/payload/resourceId/path',
    ]);
    expect(report.every((diagnostic) =>
      diagnostic.code === STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible
    )).toBe(true);
  });
});
