import { describe, expect, it } from 'vitest';
import {
  moduleResolverInputFromAppGraph,
  resolveModules,
  validateAppGraph,
  type ModuleResolverSupportInput,
  type ResolvedArtifactHandle,
} from '../src/index.js';

const PRIMARY_MODULE = 'x-example-panels';
const PRIMARY_CONTRIBUTION = 'x-example-structured-panel';
const DECOY_MODULE = 'x-example-decoy';
const DECOY_CONTRIBUTION = 'x-example-decoy-panel';
const WIDGET_NAME = 'StructuredPanel';

const PROPS_SCHEMA = {
  type: 'object',
  required: ['rowAction'],
  additionalProperties: false,
  properties: {
    rowAction: {
      type: 'object',
      required: ['columnLabel'],
      additionalProperties: false,
      properties: {
        columnLabel: { type: 'string' },
      },
    },
  },
};

interface GraphOptions {
  config: Record<string, unknown>;
  props?: unknown;
  omitProps?: boolean;
  support?: ModuleResolverSupportInput;
}

function graph(options: GraphOptions): {
  manifest: ResolvedArtifactHandle;
  handles: ResolvedArtifactHandle[];
  support?: ModuleResolverSupportInput;
} {
  const manifest: ResolvedArtifactHandle = {
    slot: 'app',
    artifactKind: 'appManifest',
    status: 'loaded',
    source: 'memory://app',
    document: {
      $formspecApp: '1.0',
      version: '1.0.0',
      modules: [
        { id: PRIMARY_MODULE, version: '1.0.0' },
        { id: DECOY_MODULE, version: '1.0.0' },
      ],
    },
  };
  const surface: ResolvedArtifactHandle = {
    slot: 'surfaces[0]',
    artifactKind: 'surface',
    status: 'loaded',
    source: 'memory://surface',
    document: {
      $formspecSurface: '0.2',
      id: 'example',
      entry: 'start',
      routes: [{
        id: 'start',
        path: '/',
        slots: [{
          id: 'panel',
          slotType: 'module-widget',
          binding: {
            moduleId: PRIMARY_MODULE,
            widgetName: WIDGET_NAME,
            config: options.config,
          },
        }],
      }],
    },
  };
  const registry: ResolvedArtifactHandle = {
    slot: 'registries[0]',
    artifactKind: 'registry',
    status: 'loaded',
    source: 'memory://registry',
    document: {
      $formspecRegistry: '1.0',
      version: '1.0.0',
      entries: [
        {
          name: PRIMARY_MODULE,
          category: 'module',
          version: '1.0.0',
          contributes: [PRIMARY_CONTRIBUTION],
        },
        {
          name: PRIMARY_CONTRIBUTION,
          category: 'widget',
          version: '1.0.0',
          widgetShape: {
            widgetName: WIDGET_NAME,
            ...(options.omitProps ? {} : { props: options.props ?? PROPS_SCHEMA }),
          },
        },
        {
          name: DECOY_MODULE,
          category: 'module',
          version: '1.0.0',
          contributes: [DECOY_CONTRIBUTION],
        },
        {
          name: DECOY_CONTRIBUTION,
          category: 'widget',
          version: '1.0.0',
          widgetShape: {
            // The same Surface name under another module must not supply the schema.
            widgetName: WIDGET_NAME,
            props: {
              type: 'object',
              required: ['decoyOnly'],
              properties: { decoyOnly: { type: 'boolean' } },
            },
          },
        },
      ],
    },
  };
  return {
    manifest,
    handles: [surface, registry],
    ...(options.support ? { support: options.support } : {}),
  };
}

function resolve(options: GraphOptions) {
  const input = moduleResolverInputFromAppGraph(graph(options));
  return {
    input,
    report: resolveModules(input),
  };
}

describe('Surface module-widget binding.config JSON Schema validation', () => {
  it('rejects a missing nested required property at its deterministic config pointer', () => {
    const { input, report } = resolve({
      config: { rowAction: {} },
      // AppGraph owns this validator. A caller cannot replace it with a permissive result.
      support: {
        payloadSchemaValidators: ['widgetShape.props'],
        payloadValidators: {
          'widgetShape.props': () => ({ ok: true }),
        },
      },
    });

    expect(input.support?.payloadSchemaValidators).toEqual(['widgetShape.props']);
    expect(report.contributions).toContainEqual(expect.objectContaining({
      name: PRIMARY_CONTRIBUTION,
      status: 'payload-schema-mismatch',
      payloadStatus: 'failed',
    }));
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MODULE-PAYLOAD-SCHEMA-MISMATCH',
      primarySource: expect.objectContaining({
        artifactSlot: 'surfaces[0]',
        jsonPointer: '/routes/0/slots/0/binding/config/rowAction/columnLabel',
      }),
      relatedSources: [expect.objectContaining({
        artifactSlot: 'registries[0]',
        jsonPointer: '/entries/1/widgetShape/props/properties/rowAction/required',
      })],
      details: expect.objectContaining({
        contribution: PRIMARY_CONTRIBUTION,
        validator: 'widgetShape.props',
        reason: 'payload-schema-mismatch',
        keyword: 'required',
      }),
    }));

    const appGraphReport = validateAppGraph({
      manifest: graph({ config: { rowAction: {} } }).manifest,
      artifacts: { handles: graph({ config: { rowAction: {} } }).handles },
      moduleResolution: report,
      schemaValidators: () => ({ ok: true }),
    });
    expect(appGraphReport.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MODULE-PAYLOAD-SCHEMA-MISMATCH',
      phase: 'module-resolution',
      origin: 'module-resolver',
      primarySource: expect.objectContaining({
        jsonPointer: '/routes/0/slots/0/binding/config/rowAction/columnLabel',
      }),
    }));
  });

  it('rejects a wrong property type at the exact config pointer', () => {
    const { report } = resolve({
      config: { rowAction: { columnLabel: 42 } },
    });

    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MODULE-PAYLOAD-SCHEMA-MISMATCH',
      primarySource: expect.objectContaining({
        jsonPointer: '/routes/0/slots/0/binding/config/rowAction/columnLabel',
      }),
      relatedSources: [expect.objectContaining({
        jsonPointer: '/entries/1/widgetShape/props/properties/rowAction/properties/columnLabel/type',
      })],
      details: expect.objectContaining({ keyword: 'type' }),
    }));
  });

  it('accepts config that matches the exact module-scoped widget contribution', () => {
    const { report } = resolve({
      config: { rowAction: { columnLabel: 'Open record' } },
    });

    expect(report.ok).toBe(true);
    expect(report.contributions).toContainEqual(expect.objectContaining({
      name: PRIMARY_CONTRIBUTION,
      status: 'resolved',
      payloadStatus: 'passed',
    }));
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'MODULE-PAYLOAD-SCHEMA-MISMATCH',
    );
  });

  it('preserves not-run behavior when the resolved widget omits props', () => {
    const { report } = resolve({
      config: { rowAction: {} },
      omitProps: true,
    });

    expect(report.ok).toBe(true);
    expect(report.contributions).toContainEqual(expect.objectContaining({
      name: PRIMARY_CONTRIBUTION,
      status: 'resolved',
      payloadStatus: 'not-run',
    }));
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      'MODULE-PAYLOAD-SCHEMA-MISMATCH',
    );
  });

  it('fails closed when props is present but cannot be compiled as JSON Schema', () => {
    const { report } = resolve({
      config: {},
      props: { type: 'not-a-json-schema-type' },
    });

    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'MODULE-PAYLOAD-SCHEMA-MISMATCH',
      primarySource: expect.objectContaining({
        jsonPointer: '/routes/0/slots/0/binding/config',
      }),
      relatedSources: [expect.objectContaining({
        jsonPointer: '/entries/1/widgetShape/props/type',
      })],
      details: expect.objectContaining({ reason: 'payload-schema-invalid' }),
    }));
  });
});
