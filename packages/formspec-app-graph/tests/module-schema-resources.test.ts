/** @filedesc Local props resources in the public artifact/module/schema producer pipeline. */
import { readFileSync, readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it, vi } from 'vitest';
import { STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA } from '@formspec-org/surface-react/widgets';
import {
  produceAppGraphValidationReport,
  produceBundleExportAppGraphValidationReport,
  moduleResolverInputFromAppGraph,
  resolveModules,
  type ModulePayloadSchemaResource,
  type ModuleResolverSupportInput,
} from '../src/index.js';

const schemaDirectory = new URL('../../../schemas/', import.meta.url);
const common = JSON.parse(readFileSync(new URL('common.schema.json', schemaDirectory), 'utf8'));
const commonUri = common.$id as string;
const surfaceUri = 'https://example.gov/surfaces/evidence';
const registryUri = 'https://example.gov/registries/evidence';
const moduleRef = { id: 'x-evidence', version: '1.0.0' };
const canonicalAjv = new Ajv2020({ strict: false, allErrors: true });
addFormats(canonicalAjv);
canonicalAjv.addKeyword({ keyword: 'x-lm' });
for (const name of readdirSync(schemaDirectory).filter(name => name.endsWith('.schema.json'))) {
  const schema = JSON.parse(readFileSync(new URL(name, schemaDirectory), 'utf8'));
  if (schema.$id) canonicalAjv.addSchema(schema);
}
const schemaIds: Record<string, string> = {
  appManifest: 'https://formspec.org/schemas/bundleManifest/2.4',
  surface: 'https://formspec.org/schemas/surface/0.2',
  registry: 'https://formspec.org/schemas/registry/v1.1/registry.json',
};
const schemaValidators = ({ artifactKind, document }: { artifactKind: string; document: unknown }) => {
  const validate = canonicalAjv.getSchema(schemaIds[artifactKind]);
  return { ok: Boolean(validate?.(document)) };
};

function bundle() {
  const entry = (name: string, category: string) => ({
    name, category, version: '1.0.0', status: 'stable', description: 'Evidence panel',
    compatibility: { formspecVersion: '>=1.0.0' },
  });
  return {
    manifest: {
      $formspecBundle: '2.4', id: 'https://example.gov/apps/evidence', version: '1.0.0',
      definitions: [], modules: [moduleRef],
      surfaces: [{ url: surfaceUri }], registries: [{ url: registryUri }],
    },
    documents: {
      [surfaceUri]: {
        $formspecSurface: '0.2', id: 'evidence', entry: 'review', modules: [moduleRef],
        routes: [{ id: 'review', path: '/', slots: [{
          id: 'evidence', slotType: 'module-widget', binding: {
            moduleId: moduleRef.id, widgetName: 'StructuredPanel', config: {
              blocks: [{ type: 'json', id: 'report', path: 'evidence.validationReport',
                emptyMessage: 'Empty', unavailableMessage: 'Unavailable',
                'x-generation': { anchors: ['need:inspect-retained-evidence@1'] } }],
            },
          },
        }] }],
      },
      [registryUri]: {
        $formspecRegistry: '1.1', publisher: { name: 'Example' }, published: '2026-10-07T00:00:00Z',
        entries: [
          { ...entry(moduleRef.id, 'module'), contributes: ['x-evidence-panel'] },
          { ...entry('x-evidence-panel', 'widget'), widgetShape: {
            widgetName: 'StructuredPanel', props: { type: 'object', required: ['blocks'],
              properties: { blocks: { type: 'array', items: structuredClone(STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA) } } },
          } },
        ],
      },
    },
  };
}
const resources = (): ModulePayloadSchemaResource[] => [{ uri: commonUri, schema: structuredClone(common) }];
const options = (support: ModuleResolverSupportInput = { payloadSchemaResources: resources() }) => ({
  schemaValidators, moduleAdmission: { allowedModules: [moduleRef] }, moduleSupport: support,
});
const mismatches = (result: Awaited<ReturnType<typeof produceBundleExportAppGraphValidationReport>>) =>
  result.moduleResolutionReport.diagnostics.filter(d => d.code === 'MODULE-PAYLOAD-SCHEMA-MISMATCH');

describe('caller-qualified local props schema resources', () => {
  it('keeps the cross-language native fixture equal to the public JSON block schema', () => {
    const fixture = JSON.parse(readFileSync(new URL('../../../crates/formspec-lint/tests/fixtures/widget-json-props.json', import.meta.url), 'utf8'));
    expect(fixture).toEqual(STRUCTURED_JSON_BLOCK_CONFIG_SCHEMA);
  });
  it('admits shared JSON block props through the complete public inline producer', async () => {
    const result = await produceBundleExportAppGraphValidationReport({ ...bundle(), ...options() });
    expect(result.artifactResolutionReport.ok).toBe(true);
    expect(result.report.schemaResults.every(result => result.ok)).toBe(true);
    expect(result.moduleResolutionReport.ok).toBe(true);
    expect(result.report.ok).toBe(true);
    expect(result.moduleResolutionReport.contributions).toContainEqual(expect.objectContaining({ payloadStatus: 'passed' }));
    expect(JSON.stringify(result.moduleResolutionReport.support)).not.toContain(commonUri);
  });

  it.each([
    ['bad path', 'path', 'bad..path', '/path'],
    ['malformed Generation', 'x-generation', { anchors: 7 }, '/x-generation/anchors'],
  ])('rejects %s at the real payload pointer', async (_name, key, value, suffix) => {
    const input = bundle();
    Object.assign(input.documents[surfaceUri].routes[0].slots[0].binding.config.blocks[0], { [key]: value });
    const result = await produceBundleExportAppGraphValidationReport({ ...input, ...options() });
    expect(mismatches(result)).toContainEqual(expect.objectContaining({
      primarySource: expect.objectContaining({ jsonPointer: `/routes/0/slots/0/binding/config/blocks/0${suffix}` }),
      details: expect.objectContaining({ reason: 'payload-schema-mismatch' }),
    }));
    if (key === 'x-generation') {
      expect(mismatches(result)[0]?.relatedSources?.[0]?.jsonPointer).toBe('/entries/1/widgetShape/props');
      expect(mismatches(result)[0]?.details?.schemaPath).toBe('#/properties/anchors/type');
    }
  });

  it('fails closed with no resource, and never accepts a permissive caller callback', async () => {
    const result = await produceBundleExportAppGraphValidationReport({ ...bundle(), ...options({
      payloadValidators: { 'widgetShape.props': () => ({ ok: true }) },
    }) });
    expect(mismatches(result)[0]?.details?.reason).toBe('payload-schema-evaluation-failed');
  });

  it('fails an unknown HTTPS reference locally without calling fetch', async () => {
    const fetch = vi.fn(() => { throw new Error('Unexpected network access'); });
    vi.stubGlobal('fetch', fetch);
    try {
      const input = bundle();
      input.documents[registryUri].entries[1].widgetShape!.props.properties.blocks.items.properties['x-generation'].$ref = 'https://invalid.example/schema';
      const result = await produceBundleExportAppGraphValidationReport({ ...input, ...options() });
      expect(mismatches(result)[0]?.details?.reason).toBe('payload-schema-evaluation-failed');
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([
    ['duplicate URI', () => [...resources(), ...resources()]],
    ['poisoned canonical ID', () => [{ uri: 'https://example.gov/alias', schema: common }]],
    ['nested canonical ID collision', () => [...resources(), { uri: 'https://example.gov/other', schema: {
      $id: 'https://example.gov/other', $defs: { poison: { $id: commonUri, type: 'number' } },
    } }]],
    ['empty URI', () => [{ uri: '', schema: common }]],
    ['invalid resource', () => [{ uri: commonUri, schema: { $id: commonUri, type: 'banana' } }]],
    ['uncloneable resource', () => [{ uri: commonUri, schema: { callback() {} } }]],
  ])('fails closed for %s even when the config schema needs no resource', async (_name, buildResources) => {
    const input = bundle();
    input.documents[registryUri].entries[1].widgetShape!.props = { type: 'object' } as never;
    const result = await produceBundleExportAppGraphValidationReport({ ...input, ...options({ payloadSchemaResources: buildResources() }) });
    expect(mismatches(result)[0]?.details?.reason).toBe('payload-schema-evaluation-failed');
  });

  it('captures inline producer resources before its first await', async () => {
    const local = resources();
    const pending = produceBundleExportAppGraphValidationReport({ ...bundle(), ...options({ payloadSchemaResources: local }) });
    (local[0].schema as typeof common).$defs.Generation = { type: 'number' };
    expect((await pending).moduleResolutionReport.ok).toBe(true);
    const next = await produceBundleExportAppGraphValidationReport({ ...bundle(), ...options({ payloadSchemaResources: local }) });
    expect(mismatches(next)[0]?.details?.reason).toBe('payload-schema-mismatch');
  });

  it('captures loader producer resources before asynchronous artifact acquisition', async () => {
    const local = resources();
    const input = bundle();
    let loaded = false;
    const pending = produceAppGraphValidationReport({ manifest: input.manifest, ...options({ payloadSchemaResources: local }),
      loader: async ({ ref }) => {
        if (!loaded) { loaded = true; (local[0].schema as typeof common).$defs.Generation = { type: 'number' }; }
        return { status: 'loaded', document: input.documents[ref.url as keyof typeof input.documents], source: ref.url };
      },
    });
    expect((await pending).moduleResolutionReport.ok).toBe(true);
  });

  it('keeps captured resources unchanged between consuming sites', () => {
    const local = resources();
    const cohort = bundle();
    let mutated = false;
    const input = moduleResolverInputFromAppGraph({
      manifest: { slot: 'app', artifactKind: 'appManifest', status: 'loaded', document: cohort.manifest },
      handles: [
        { slot: 'surfaces[0]', artifactKind: 'surface', status: 'loaded', document: cohort.documents[surfaceUri] },
        { slot: 'registries[0]', artifactKind: 'registry', status: 'loaded', document: cohort.documents[registryUri] },
      ],
      support: {
        payloadSchemaResources: local,
        payloadSchemaValidators: ['mutation-probe'],
        payloadValidators: { 'mutation-probe': () => {
          (local[0].schema as typeof common).$defs.Generation = { type: 'number' };
          mutated = true;
          return { ok: true };
        } },
      },
    });
    input.registries[0].entries[1]['mutation-probe'] = {};
    const uses = input.documents!.find(document => document.artifactKind === 'surface')!.uses!;
    const first = uses[0];
    uses.push({ ...first, site: 'mutation-probe', payloadValidator: 'mutation-probe' });
    uses.push({ ...first, site: 'second-widget' });
    const report = resolveModules(input);
    expect(mutated).toBe(true);
    expect(report.ok).toBe(true);
    expect(report.contributions.map(contribution => contribution.payloadStatus)).toEqual(['passed', 'passed', 'passed']);
  });
});
