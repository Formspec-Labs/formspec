/** @filedesc Rendered-Need trace records and App Manifest needs pairing. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  appManifestVersionAtLeast,
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
