/** @filedesc Locale lint injection, the rendered-Need trace record, and App Manifest needs pairing. */
import { describe, expect, it } from 'vitest';
import {
  appManifestVersionAtLeast,
  produceBundleExportAppGraphValidationReport,
  lintPathToJsonPointer,
  localeLintValidator,
  type AppGraphLocaleLintContext,
} from '../src/index.js';

const definitionUrl = 'https://example.gov/definitions/intake';
const localeUrl = 'https://example.gov/locales/intake-es';
const themeUrl = 'https://example.gov/themes/intake';
const needsUrl = 'https://example.gov/needs/intake';

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

const permissive = {
  schemaValidators: () => ({ ok: true }),
  evidenceSchemaValidators: () => ({ ok: true }),
};

describe('localeLintValidator', () => {
  it('lints each Locale with its target Definition and Theme, keeping the Locale spec code', async () => {
    const seen: AppGraphLocaleLintContext[] = [];
    const result = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition(), { locale: true }),
      ...permissive,
      crossArtifactValidators: [localeLintValidator((document, context) => {
        seen.push(context);
        expect(document).toBe(locale);
        return {
          diagnostics: [{
            code: 'E1402',
            severity: 'error',
            path: '$.strings["applicant.name.label"]',
            message: 'Locale item key references unknown Definition Item key "applicant"',
          }],
        };
      })],
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.definitionDocument).toEqual(definition());
    expect(seen[0]?.themeDocument).toBe(theme);
    expect(result.report.ok).toBe(false);
    const finding = result.report.diagnostics.find((entry) => entry.code === 'E1402');
    expect(finding).toMatchObject({
      severity: 'error',
      origin: 'x-formspec-lint',
      primarySource: { jsonPointer: '/strings/applicant.name.label' },
    });
    expect(finding?.message).toContain('bare key');
  });

  it('converts lint paths to JSON Pointers', () => {
    expect(lintPathToJsonPointer('$')).toBe('');
    expect(lintPathToJsonPointer('$.strings["a/b~c.label"]')).toBe('/strings/a~1b~0c.label');
    expect(lintPathToJsonPointer('$.target.url')).toBe('/target/url');
    expect(lintPathToJsonPointer('$.items[0].key')).toBe('/items/0/key');
  });
});

describe('renderedNeedTrace record (Needs spec S10.3)', () => {
  it('records not-applicable when nothing pairs Needs or carries a trace', async () => {
    const result = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition()),
      ...permissive,
      renderedNeedTrace: 'when-declared',
    });
    expect(result.report.ok).toBe(true);
    expect(result.report.renderedNeedTrace).toEqual({
      status: 'not-applicable',
      definitions: [{ url: definitionUrl, version: '1.0.0' }],
    });
  });

  it('runs and fails a traced bundle with no paired Needs Document', async () => {
    const result = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition('need:collect-name@1')),
      ...permissive,
      renderedNeedTrace: 'when-declared',
    });
    expect(result.report.renderedNeedTrace?.status).toBe('completed');
    expect(result.report.diagnostics.map((entry) => entry.code))
      .toContain('APP-GRAPH-RENDERED-NEEDS-UNPAIRED');
  });

  it('pairs the App Manifest needs member and refuses a declared but absent document', async () => {
    const needs = {
      $formspecNeeds: '1.0',
      version: '1.0.0',
      needs: [{ id: 'collect-name', status: 'adopted', revision: 1 }],
    };
    const paired = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition('need:collect-name@1'), { needs }),
      ...permissive,
      renderedNeedTrace: 'when-declared',
    });
    expect(paired.report.renderedNeedTrace?.status).toBe('completed');
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
