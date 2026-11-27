/** @filedesc Rendered-Need trace records and App Manifest needs pairing. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  appManifestVersionAtLeast,
  definitionPublicationReports,
  produceBundleExportAppGraphValidationReport,
} from '../src/index.js';

const definitionUrl = 'https://example.gov/definitions/intake';
const localeUrl = 'https://example.gov/locales/intake-es';
const themeUrl = 'https://example.gov/themes/intake';
const needsUrl = 'https://example.gov/needs/intake';
const reportSchema = JSON.parse(readFileSync(new URL('../../../schemas/app-graph-validation-report.schema.json', import.meta.url), 'utf8'));
const validateReport = new Ajv2020({ strict: false, allErrors: true }).compile(reportSchema);

function definition(anchor?: string) {
  const generation = anchor ? { 'x-generation': { anchors: [anchor] } } : {};
  return {
    $formspec: '1.0',
    url: definitionUrl,
    version: '1.0.0',
    title: 'Intake',
    ...generation,
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name', ...generation }],
  };
}

const locale = {
  $formspecLocale: '2.0',
  url: localeUrl,
  version: '1.0.0',
  locale: 'es',
  target: { kind: 'definition', url: definitionUrl },
  strings: { 'applicant.name.label': 'Nombre' },
};

const theme = { $formspecTheme: '1.0', url: themeUrl, version: '1.0.0', targetDefinition: { url: definitionUrl } };

function bundle(def: unknown, extra: { needs?: unknown; locale?: boolean } = {}) {
  return {
    manifest: {
      $formspecBundle: '2.5',
      id: 'https://example.gov/apps/intake',
      version: '1.0.0',
      definitions: [{ url: definitionUrl, version: '1.0.0' }],
      theme: { url: themeUrl, version: '1.0.0' },
      ...(extra.locale ? { locales: [{ url: localeUrl, version: '1.0.0', locale: 'es' }] } : {}),
      ...(extra.needs ? { needs: { url: needsUrl, version: '1.0.0' } } : {}),
    },
    documents: {
      [definitionUrl]: def,
      [themeUrl]: theme,
      ...(extra.locale ? { [localeUrl]: locale } : {}),
      ...(extra.needs && extra.needs !== 'missing' ? { [needsUrl]: extra.needs } : {}),
    },
  };
}

/** A stand-in for the host's canonical digest; the record only needs it to be a sha256:<hex> function of the document. */
const digest = (document: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(document)).digest('hex')}`;
const whenDeclared = { mode: 'when-declared' as const, digest };

const permissive = {
  schemaValidators: () => ({ ok: true }),
  evidenceSchemaValidators: () => ({ ok: true }),
};

describe('renderedNeedTrace record (Needs spec S10.3)', () => {
  it('records not-applicable when nothing pairs Needs or carries a trace', async () => {
    const result = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition()),
      ...permissive,
      renderedNeedTrace: whenDeclared,
    });
    expect(result.report.ok).toBe(true);
    expect(validateReport(JSON.parse(JSON.stringify(result.report))), validateReport.errors?.[0]?.message).toBe(true);
    expect(result.report.renderedNeedTrace).toEqual({
      status: 'not-applicable',
      definitions: [{ url: definitionUrl, version: '1.0.0', sha256: digest(definition()), locales: [], components: [] }],
      nodes: [],
    });
  });

  it('runs and fails a traced bundle with no paired Needs Document', async () => {
    const result = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition('need:collect-name@1')),
      ...permissive,
      renderedNeedTrace: whenDeclared,
    });
    expect(result.report.renderedNeedTrace?.status).toBe('completed');
    expect(result.report.diagnostics.map((entry) => entry.code))
      .toContain('APP-GRAPH-RENDERED-NEEDS-UNPAIRED');
  });

  it('pairs the App Manifest needs member and refuses a declared but absent document', async () => {
    const needs = {
      $formspecNeeds: '1.0',
      version: '1.0.0',
      needs: [{
        id: 'collect-name', revision: 1, status: 'adopted', origin: 'human-authored',
        statement: { who: 'applicant', want: 'enter a name', why: 'identify the application', done: 'name recorded' },
        adoptedBy: { kind: 'human', id: 'reviewer' },
        ungroundedReason: { code: 'not-yet-researched', explanation: 'Test fixture.' },
      }],
    };
    const traced = bundle(definition('need:collect-name@1'), { needs });
    const paired = await produceBundleExportAppGraphValidationReport({
      ...traced,
      documents: { ...traced.documents, [themeUrl]: { ...theme, 'x-generation': { anchors: ['need:collect-name@1'] } } },
      ...permissive,
      renderedNeedTrace: whenDeclared,
    });
    expect(paired.report.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([]);
    expect(paired.report.ok).toBe(true);
    expect(paired.report.diagnostics).toContainEqual(expect.objectContaining({
      code: 'APP-GRAPH-RENDERED-NEED-REDUNDANT', severity: 'warning',
    }));
    expect(validateReport(JSON.parse(JSON.stringify(paired.report))), validateReport.errors?.[0]?.message).toBe(true);
    expect(paired.report.renderedNeedTrace?.status).toBe('completed');
    expect(paired.report.renderedNeedTrace?.nodes).toContainEqual({
      source: expect.objectContaining({ artifactSlot: 'definitions[0]', jsonPointer: '' }),
      kind: 'definition-document',
      label: 'Intake',
      effective: { needIds: ['collect-name'], via: [expect.objectContaining({ artifactSlot: 'definitions[0]', jsonPointer: '' })] },
    });
    expect(paired.report.diagnostics.map((entry) => entry.code))
      .not.toContain('APP-GRAPH-RENDERED-NEEDS-UNPAIRED');
    expect(paired.report.evidenceResults.map((entry) => entry.source)).toContain(needsUrl);

    const missing = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition('need:collect-name@1'), { needs: 'missing' }),
      ...permissive,
    });
    expect(missing.report.ok).toBe(false);
    expect(missing.report.diagnostics.map((entry) => entry.code)).toContain('APP-GRAPH-NEEDS-REF');
  });
});

describe('App Manifest 2.5', () => {
  it('keeps every 2.4 rule: each minor is additive', async () => {
    expect(appManifestVersionAtLeast('2.5', '2.4')).toBe(true);
    expect(appManifestVersionAtLeast('2.4', '2.4')).toBe(true);
    expect(appManifestVersionAtLeast('2.3', '2.4')).toBe(false);
    expect(appManifestVersionAtLeast('2.6', '2.4')).toBe(false);
    const result = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition(), { locale: true }),
      ...permissive,
    });
    // 2.4's target-aware Locale association applies to 2.5: the Locale reference resolves and validates.
    expect(result.report.ok).toBe(true);
    expect(result.artifactResolutionReport.artifacts.locales?.[0]?.status).toBe('loaded');
  });
});

describe('renderedNeedTrace binds content', () => {
  it('records the digests of each covered Definition and the Locales targeting it', async () => {
    const result = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition('need:collect-name@1'), { locale: true }),
      ...permissive,
      renderedNeedTrace: whenDeclared,
    });
    expect(result.report.renderedNeedTrace?.definitions).toEqual([{
      url: definitionUrl,
      version: '1.0.0',
      sha256: digest(definition('need:collect-name@1')),
      locales: [{ url: localeUrl, sha256: digest(locale) }],
      components: [],
    }]);
  });

  it('traces Screener items like Definition items, so their anchors trigger the run', async () => {
    const screenerUrl = 'https://example.gov/screeners/eligibility';
    const screener = {
      $formspecScreener: '1.0',
      url: screenerUrl,
      version: '1.0.0',
      title: 'Eligibility',
      items: [{ key: 'age', type: 'field', dataType: 'integer', label: 'Age', 'x-generation': { anchors: ['need:collect-name@1'] } }],
    };
    const needs = { $formspecNeeds: '1.0', version: '1.0.0', needs: [{ id: 'collect-name', status: 'adopted', revision: 1 }] };
    const run = async (withNeeds: boolean, screenerDocument: unknown = screener) => {
      const base = bundle(definition(), withNeeds ? { needs } : {});
      return (await produceBundleExportAppGraphValidationReport({
        manifest: { ...base.manifest, screeners: [{ url: screenerUrl, version: '1.0.0' }] },
        documents: { ...base.documents, [screenerUrl]: screenerDocument },
        ...permissive,
        renderedNeedTrace: whenDeclared,
      })).report;
    };
    // Only the Screener item carries a trace, and that alone makes the run apply.
    expect((await run(false)).renderedNeedTrace?.status).toBe('completed');
    // Paired: the anchored item resolves; the untraced Screener frame is refused like a Definition's.
    const screenerFindings = (await run(true)).diagnostics
      .filter((entry) => entry.primarySource?.artifactKind === 'screener')
      .map((entry) => [entry.code, entry.primarySource?.jsonPointer]);
    expect(screenerFindings).toEqual([['APP-GRAPH-RENDERED-NEED-MISSING', '']]);
    // ADR 0174 keeps the root anchor and makes the field's matching pin redundant.
    Object.assign(screener, { 'x-generation': { anchors: ['need:collect-name@1'] } });
    const traced = await run(true);
    expect(traced.diagnostics.filter((entry) => entry.primarySource?.artifactKind === 'screener')).toEqual([
      expect.objectContaining({ code: 'APP-GRAPH-RENDERED-NEED-REDUNDANT', severity: 'warning' }),
    ]);
    const { 'x-generation': _anchor, ...unanchoredItem } = screener.items[0]!;
    const inherited = await run(true, { ...screener, items: [unanchoredItem] });
    expect(inherited.renderedNeedTrace?.nodes.find((node) => node.kind === 'screener-item')?.effective)
      .toEqual({ needIds: ['collect-name'], via: [expect.objectContaining({ artifactSlot: 'screeners[0]', jsonPointer: '' })] });
  });
});

it('sends each Definition its own trace and Surface mounts within the Source body cap', async () => {
  const anchor = 'need:collect-name@1';
  const generation = { 'x-generation': { anchors: [anchor] } };
  const needs = { $formspecNeeds: '1.0', version: '1.0.0', needs: [
    { id: 'collect-name', status: 'adopted', revision: 1, adoptedBy: { kind: 'human', id: 'reviewer' },
      ungroundedReason: { code: 'not-yet-researched', explanation: 'Test fixture.' } },
  ] };
  const base = bundle(definition(anchor), { needs, locale: true });
  const defs = Array.from({ length: 8 }, (_, index) => ({
    ...definition(anchor),
    url: index ? definitionUrl + index : definitionUrl,
    items: [{ key: 'group', type: 'group', label: 'Questions', children: Array.from({ length: 640 }, (_, field) => ({
      key: 'field' + field, type: 'field', dataType: 'string', label: 'Question ' + field, readOnly: true,
    })) }],
  }));
  const surfaceUrl = 'https://example.gov/surfaces/publish';
  const slot = (def: typeof defs[number]) => ({
    id: 'slot' + defs.indexOf(def), slotType: 'definition-form', binding: { definitionRef: def.url }, ...generation,
  });
  const embed = (routeRef: string) => ({ id: 'embed-' + routeRef, slotType: 'embed-route', binding: {routeRef}, ...generation });
  const surface = {
    $formspecSurface: '0.2', id: 'publish', entry: 'root', ...generation,
    routes: [
      { id: 'shared', path: '/', slots: [slot(defs[0]), slot(defs[1])], navigation: { visible: true, ...generation }, ...generation },
      { id: 'other', path: '/other', slots: [slot(defs[1])], navigation: { visible: false, ...generation }, ...generation },
      { id: 'middle', path: '/middle', slots: [embed('shared')], navigation: { visible: false, ...generation }, ...generation },
      { id: 'root', path: '/root', slots: [embed('middle'), embed('other')], navigation: { visible: true, ...generation }, ...generation },
    ],
  };
  const componentUrl = 'https://example.gov/components/shared';
  const component = {
    $formspecComponent: '1.2', url: componentUrl, version: '1.0.0',
    targetSurfaceRoutes: [{ surface: { url: surfaceUrl, version: '1.0.0' }, route: 'root', role: 'route' }],
    tree: { component: 'Stack', id: 'layout', ...generation },
  };
  const docs = {
    ...base.documents, [componentUrl]: component, [surfaceUrl]: surface, [themeUrl]: { ...theme, ...generation },
    [localeUrl]: { ...locale, strings: { 'field0.label': 'Nombre' }, stringGeneration: { 'field0.label': { anchors: [anchor] } } },
    ...Object.fromEntries(defs.map(def => [def.url, def])),
  };
  const result = await produceBundleExportAppGraphValidationReport({
    manifest: {
      ...base.manifest,
      components: [{ url: componentUrl, version: '1.0.0', handle: 'shared' }],
      definitions: defs.map(({ url, version }) => ({ url, version })),
      surfaces: [{ url: surfaceUrl, version: '1.0.0' }],
    },
    documents: docs,
    ...permissive, renderedNeedTrace: whenDeclared,
  });
  expect(result.report.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
  expect(bytes(result.report)).toBeGreaterThan(2 ** 21);
  const reports = definitionPublicationReports(result);
  expect(reports).toHaveLength(defs.length);
  const fullScopedReports = definitionPublicationReports(result, { includeNodes: true });
  expect(fullScopedReports).toHaveLength(defs.length);
  for (const [index, report] of reports.entries()) {
    expect(validateReport(JSON.parse(JSON.stringify(report))), validateReport.errors?.[0]?.message).toBe(true);
    expect(report.renderedNeedTrace?.definitions.map(d => d.url)).toEqual([defs[index].url]);
    expect(report.renderedNeedTrace?.inventory).toBe('omitted');
    expect(report.renderedNeedTrace?.nodes).toEqual([]);
    const fullNodes = fullScopedReports[index]!.renderedNeedTrace!.nodes;
    expect(report.renderedNeedTrace?.nodeCount).toBe(fullNodes.length);
    expect(fullScopedReports[index]!.renderedNeedTrace?.inventory).toBe('full');
    expect(validateReport(JSON.parse(JSON.stringify(fullScopedReports[index]))), validateReport.errors?.[0]?.message).toBe(true);
    expect(fullNodes.filter(n => n.kind === 'definition-item')).toHaveLength(641);
    expect(fullNodes.filter(n => n.kind === 'surface-slot').map(n => n.source.jsonPointer))
      .toEqual(index === 0
        ? ['/routes/0/slots/0', '/routes/2/slots/0', '/routes/3/slots/0']
        : index === 1 ? ['/routes/0/slots/1', '/routes/1/slots/0', '/routes/2/slots/0', '/routes/3/slots/0', '/routes/3/slots/1'] : []);
    expect(fullNodes.some(n => n.source.artifactKind === 'component')).toBe(index < 2);
    expect(fullNodes.some(n => n.source.artifactKind === 'locale')).toBe(index === 0);
    expect(bytes({
      definition: defs[index], locale_documents: index === 0 ? [docs[localeUrl]] : [],
      app_graph_validation_report: report, runtime_config: {}, created_by: 'publisher',
    })).toBeLessThan(2 ** 21);
  }
  expect(definitionPublicationReports({ ...result, report: { ...result.report, ok: false } })).toEqual([]);
});

it('keeps a single large Definition publish payload well under 2 MiB via compact publication proof while retaining full authoring nodes', async () => {
  const anchor = 'need:collect-name@1';
  const generation = { 'x-generation': { anchors: [anchor] } };
  const needs = {
    $formspecNeeds: '1.0',
    version: '1.0.0',
    needs: [{
      id: 'collect-name',
      status: 'adopted',
      revision: 1,
      adoptedBy: { kind: 'human', id: 'reviewer' },
      ungroundedReason: { code: 'not-yet-researched', explanation: 'Test fixture.' },
    }],
  };
  const itemCount = 1600;
  const largeDefUrl = 'https://example.gov/definitions/large-schedule';
  const siblingDefUrl = 'https://example.gov/definitions/summary-schedule';
  const largeCompUrl = 'https://example.gov/components/large-schedule';
  const largeLocaleUrl = 'https://example.gov/locales/large-schedule-es';
  const surfaceUrl = 'https://example.gov/surfaces/large-publish';

  const largeDef = {
    $formspec: '1.0',
    url: largeDefUrl,
    version: '1.0.0',
    title: 'Large Schedule',
    ...generation,
    items: [{
      key: 'section',
      type: 'group',
      label: 'Schedule Entries',
      children: Array.from({ length: itemCount }, (_, i) => ({
        key: `metric_${i}`,
        type: 'field',
        dataType: 'decimal',
        label: `Metric ${i}`,
        ...(i === 0 ? generation : {}),
      })),
    }],
  };
  const siblingDef = {
    $formspec: '1.0',
    url: siblingDefUrl,
    version: '1.0.0',
    title: 'Summary Schedule',
    ...generation,
    items: [{ key: 'note', type: 'field', dataType: 'string', label: 'Note', ...generation }],
  };
  const largeComp = {
    $formspecComponent: '1.2',
    url: largeCompUrl,
    version: '1.0.0',
    targetDefinition: { url: largeDefUrl, version: '1.0.0' },
    tree: {
      component: 'Stack',
      id: 'schedule-layout',
      ...generation,
      children: Array.from({ length: itemCount }, (_, i) => ({
        component: 'NumberInput',
        id: `metric_input_${i}`,
        bind: `section.metric_${i}`,
      })),
    },
  };
  const largeLocale = {
    $formspecLocale: '2.0',
    url: largeLocaleUrl,
    version: '1.0.0',
    locale: 'es',
    target: { kind: 'definition', url: largeDefUrl },
    strings: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`section.metric_${i}.label`, `Métrica ${i}`])),
    stringGeneration: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`section.metric_${i}.label`, { anchors: [anchor] }])),
  };
  const surface = {
    $formspecSurface: '0.2',
    id: 'large-publish',
    entry: 'main',
    ...generation,
    routes: [{
      id: 'main',
      path: '/',
      navigation: { visible: true, ...generation },
      ...generation,
      slots: [
        { id: 'large-slot', slotType: 'definition-form', binding: { definitionRef: largeDefUrl }, ...generation },
        { id: 'sibling-slot', slotType: 'definition-form', binding: { definitionRef: siblingDefUrl }, ...generation },
      ],
    }],
  };

  const result = await produceBundleExportAppGraphValidationReport({
    manifest: {
      $formspecBundle: '2.5',
      id: 'https://example.gov/apps/large-publish',
      version: '1.0.0',
      definitions: [
        { url: largeDefUrl, version: '1.0.0' },
        { url: siblingDefUrl, version: '1.0.0' },
      ],
      components: [{ url: largeCompUrl, version: '1.0.0', handle: 'large-schedule' }],
      locales: [{ url: largeLocaleUrl, version: '1.0.0', locale: 'es' }],
      surfaces: [{ url: surfaceUrl, version: '1.0.0' }],
      theme: { url: themeUrl, version: '1.0.0' },
      needs: { url: needsUrl, version: '1.0.0' },
    },
    documents: {
      [largeDefUrl]: largeDef,
      [siblingDefUrl]: siblingDef,
      [largeCompUrl]: largeComp,
      [largeLocaleUrl]: largeLocale,
      [surfaceUrl]: surface,
      [themeUrl]: { ...theme, targetDefinition: { url: largeDefUrl }, ...generation },
      [needsUrl]: needs,
    },
    ...permissive,
    renderedNeedTrace: whenDeclared,
  });

  expect(result.report.ok).toBe(true);
  expect(result.report.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  // Primary authoring report preserves the full node inventory for authoring/inspection tools.
  expect(result.report.renderedNeedTrace?.nodes.length).toBeGreaterThan(itemCount * 2);
  expect(result.report.renderedNeedTrace?.inventory).toBeUndefined();

  const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value));
  const fullScoped = definitionPublicationReports(result, { includeNodes: true })
    .find((r) => r.renderedNeedTrace?.definitions[0]?.url === largeDefUrl)!;
  const compactScoped = definitionPublicationReports(result)
    .find((r) => r.renderedNeedTrace?.definitions[0]?.url === largeDefUrl)!;

  // Confirm the non-compact single-Definition publish payload genuinely overflows the 2 MiB Source cap.
  const fullPublishPayload = {
    definition: largeDef,
    component_document: largeComp,
    locale_documents: [largeLocale],
    app_graph_validation_report: fullScoped,
    runtime_config: {},
    created_by: 'publisher',
  };
  expect(bytes(fullPublishPayload)).toBeGreaterThan(2 ** 21);

  // Compact publication proof stays comfortably well under the 2 MiB cap while preserving every required proof field.
  const compactPublishPayload = {
    definition: largeDef,
    component_document: largeComp,
    locale_documents: [largeLocale],
    app_graph_validation_report: compactScoped,
    runtime_config: {},
    created_by: 'publisher',
  };
  expect(bytes(compactPublishPayload)).toBeLessThan(1_500_000);
  expect(bytes(compactScoped)).toBeLessThan(100_000);
  expect(validateReport(JSON.parse(JSON.stringify(compactScoped))), validateReport.errors?.[0]?.message).toBe(true);
  expect(compactScoped.ok).toBe(true);
  expect(compactScoped.phases).toEqual(result.report.phases);
  expect(compactScoped.schemaResults).toEqual(result.report.schemaResults);
  expect(compactScoped.evidenceResults).toEqual(result.report.evidenceResults);
  expect(compactScoped.renderedNeedTrace).toEqual({
    status: 'completed',
    inventory: 'omitted',
    nodeCount: fullScoped.renderedNeedTrace!.nodes.length,
    definitions: [{
      url: largeDefUrl,
      version: '1.0.0',
      sha256: digest(largeDef),
      locales: [{ url: largeLocaleUrl, sha256: digest(largeLocale) }],
      components: [{ url: largeCompUrl, sha256: digest(largeComp) }],
    }],
    nodes: [],
  });
  // Redundant-anchor warnings remain scoped to the large Definition (sibling redundant warning excluded).
  expect(compactScoped.diagnostics.some((d) =>
    d.code === 'APP-GRAPH-RENDERED-NEED-REDUNDANT' && d.primarySource?.artifactSlot === 'definitions[0]')).toBe(true);
  expect(compactScoped.diagnostics.some((d) =>
    d.code === 'APP-GRAPH-RENDERED-NEED-REDUNDANT' && d.primarySource?.artifactSlot === 'definitions[1]')).toBe(false);

  // Schema enforces the compact invariants: inventory="omitted" requires empty nodes and nodeCount.
  const invalidCompact = JSON.parse(JSON.stringify(compactScoped));
  invalidCompact.renderedNeedTrace.nodes = [fullScoped.renderedNeedTrace!.nodes[0]];
  expect(validateReport(invalidCompact)).toBe(false);

  const missingNodeCount = JSON.parse(JSON.stringify(compactScoped));
  delete missingNodeCount.renderedNeedTrace.nodeCount;
  expect(validateReport(missingNodeCount)).toBe(false);
});
