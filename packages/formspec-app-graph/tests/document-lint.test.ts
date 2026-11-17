/** @filedesc Shared lint diagnostics and URL-paired lint of every supported bundle document. */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { initFormspecEngine, initFormspecEngineTools, lintDocument } from '@formspec-org/engine';
import * as appGraph from '../src/index.js';
import {
  lintPathToJsonPointer,
  documentLintValidator,
  produceBundleExportAppGraphValidationReport,
  type AppGraphContext,
  type AppGraphDocumentLintContext,
  type ResolvedArtifactHandle,
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

describe('documentLintValidator', () => {
  it('lints each Locale with its target Definition and Theme, keeping the Locale spec code', async () => {
    const seen: AppGraphDocumentLintContext[] = [];
    const result = await produceBundleExportAppGraphValidationReport({
      ...bundle(definition(), { locale: true }),
      ...permissive,
      crossArtifactValidators: [documentLintValidator((document, context) => {
        if (document !== locale) return { diagnostics: [] };
        seen.push(context);
        expect(document).toBe(locale);
        return {
          diagnostics: [{
            code: 'E1402',
            severity: 'error',
            path: '$.strings["applicant.name.label"]',
            message: 'Locale item key references unknown Definition Item key "applicant"',
            suggestedFix: 'Use the Definition Item bare key at any depth.',
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

  it('supplies every Component targeting the Locale\'s Definition (Locale spec §7: the loaded set)', async () => {
    const component = (handle: string) => ({
      $formspecComponent: '1.0',
      url: `https://example.gov/components/${handle}`,
      version: '1.0.0',
      targetDefinition: { url: definitionUrl },
      tree: { component: 'Stack', id: `${handle}-root` },
    });
    const base = bundle(definition(), { locale: true });
    const seen: AppGraphDocumentLintContext[] = [];
    await produceBundleExportAppGraphValidationReport({
      manifest: {
        ...base.manifest,
        components: ['respondent', 'review'].map((handle) => ({ url: component(handle).url, version: '1.0.0', handle })),
      },
      documents: { ...base.documents, ...Object.fromEntries(['respondent', 'review'].map((handle) => [component(handle).url, component(handle)])) },
      ...permissive,
      crossArtifactValidators: [documentLintValidator((document, context) => {
        if (document === locale) seen.push(context);
        return { diagnostics: [] };
      })],
    });
    expect(seen[0]?.componentDocuments).toEqual([component('respondent'), component('review')]);
  });

  it('converts lint paths to JSON Pointers', () => {
    expect(lintPathToJsonPointer('$')).toBe('');
    expect(lintPathToJsonPointer('$.strings["a/b~c.label"]')).toBe('/strings/a~1b~0c.label');
    expect(lintPathToJsonPointer('$.target.url')).toBe('/target/url');
    expect(lintPathToJsonPointer('$.items[0].key')).toBe('/items/0/key');
  });
});

function handle(kind: string, document: unknown, slot = kind, url?: string): ResolvedArtifactHandle {
  return { slot, artifactKind: kind, status: 'loaded', ref: { url: url ?? (document as { url?: string })?.url }, document };
}

function graph(handles: ResolvedArtifactHandle[]): AppGraphContext {
  return {
    manifest: handle('appManifest', { id: 'https://example.gov/apps/intake' }, 'app'),
    handles, schemaResults: [], evidenceResults: [],
  };
}

const components = ['respondent', 'review'].map((name) => ({
  $formspecComponent: '1.0', url: `https://example.gov/components/${name}`,
  version: '1.0.0', targetDefinition: { url: definitionUrl },
  tree: { component: 'Stack', id: `${name}-root` },
}));
const english = { ...locale, url: 'https://example.gov/locales/intake-en', locale: 'en', strings: { 'name.label': 'Name' } };
const spanish = { ...locale, fallback: 'en', strings: { 'name.label': 'Nombre' } };
const registry = { $formspecRegistry: '1.0', url: 'https://example.gov/registries/custom', entries: [] };
const actions = { $formspecResponseActions: '1.0', url: 'https://example.gov/actions/intake', targetDefinition: { url: definitionUrl }, actions: [] };
const companionHandles = () => [handle('definition', definition()), handle('theme', theme),
  ...components.map((doc) => handle('component', doc, doc.url)),
  handle('locale', spanish, 'locales[es]'), handle('locale', english, 'locales[en]'), handle('registry', registry)];

describe('document lint mapping and context', () => {
  it.each(['Calculated item', 'Calculated item.'])(
    'maps a Definition finding with source, pointer, fix, spec reference and info severity: %s', (message) => {
      const source = handle('definition', definition(), 'definitions[0]');
      const context = { registryDocuments: [registry] };
      const diagnostics = appGraph.documentLintDiagnostics((document, received) => {
        expect(document).toBe(source.document);
        expect(received).toBe(context);
        return { diagnostics: [{ code: 'W902', severity: 'info', path: '$.items[0].label',
          message, suggestedFix: 'Review the label.', specRef: 'core:5.6' }] };
      }, source, context);
      expect(diagnostics).toEqual([{
        code: 'W902', severity: 'info', origin: 'x-formspec-lint', phase: 'cross-artifact',
        message: "definition 'definitions[0]': Calculated item. Review the label.",
        primarySource: expect.objectContaining({ artifactSlot: 'definitions[0]', artifactKind: 'definition',
          jsonPointer: '/items/0/label', ref: { url: definitionUrl } }),
        details: { lintPath: '$.items[0].label', suggestedFix: 'Review the label.', specRef: 'core:5.6' },
      }]);
  });

  it('lints Response Actions with their Definition, Theme, every Component and Locale', () => {
    const seen: AppGraphDocumentLintContext[] = [];
    documentLintValidator((document, context) => {
      if (document === actions) seen.push(context);
      expect(context).not.toHaveProperty('bundleComponentDocuments');
      return { diagnostics: [] };
    })(graph([...companionHandles(), handle('responseActions', actions)]));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ definitionDocument: definition(), themeDocument: theme,
      componentDocuments: components, localeDocuments: [spanish, english] });
  });

  it('supplies peer Locales from the same target only, without unloaded or unrelated documents', () => {
    const unrelated = { ...english, target: { kind: 'definition', url: 'https://example.gov/other' } };
    let seen: AppGraphDocumentLintContext | undefined;
    documentLintValidator((document, context) => {
      if (document === spanish) seen = context;
      return { diagnostics: [] };
    })(graph([...companionHandles(), handle('locale', unrelated), { ...handle('locale', english), status: 'missing' }]));
    expect(seen).toMatchObject({ localeDocuments: [english] });
  });

  it.each(['definition', 'theme', 'component', 'locale', 'screener', 'responseActions', 'mapping', 'ontology', 'references', 'registry'])(
    'lints a loaded %s document', (kind) => {
      const document = { url: `urn:test:${kind}` };
      const seen: unknown[] = [];
      documentLintValidator((doc) => { seen.push(doc); return { diagnostics: [] }; })(graph([handle(kind, document)]));
      expect(seen).toEqual([document]);
    });

  it('never lints excluded kinds or unloaded handles', () => {
    const seen: unknown[] = [];
    const excluded = ['surface', 'experience', 'dataSources', 'appManifest', 'x-custom'].map((kind) => handle(kind, {}));
    documentLintValidator((doc) => { seen.push(doc); return { diagnostics: [] }; })(graph([
      ...excluded, { ...handle('definition', definition()), status: 'missing' },
    ]));
    expect(seen).toEqual([]);
  });

  it.each(['missing', 'ambiguous', 'identity-mismatch'])(
    'still lints a companion without Definition context when its target is %s', (state) => {
      const definitions = state === 'missing' ? [] : state === 'ambiguous'
        ? [handle('definition', definition()), handle('definition', definition(), 'definitions[1]')]
        : [handle('definition', definition(), 'definitions[0]', 'https://example.gov/other')];
      let seen: AppGraphDocumentLintContext | undefined;
      documentLintValidator((document, context) => {
        if (document === spanish) seen = context;
        return { diagnostics: [] };
      })(graph([...definitions, handle('locale', spanish)]));
      expect(seen).toBeDefined();
      expect(seen).not.toHaveProperty('definitionDocument');
    });

  it('supplies all loaded Registries to a Definition', () => {
    let seen: AppGraphDocumentLintContext | undefined;
    documentLintValidator((document, context) => {
      if ((document as { $formspec?: string }).$formspec) seen = context;
      return { diagnostics: [] };
    })(graph(companionHandles()));
    expect(seen).toMatchObject({ registryDocuments: [registry] });
  });

  it.each([['theme', theme], ['responseActions', actions]] as const)(
    'does not pass Registries to %s; module resolution owns companion payload checks', (kind, document) => {
      let seen: AppGraphDocumentLintContext | undefined;
      documentLintValidator((doc, context) => {
        if (doc === document) seen = context;
        return { diagnostics: [] };
      })(graph([...companionHandles(), ...(kind === 'responseActions' ? [handle(kind, document)] : [])]));
      expect(seen).toBeDefined();
      expect(seen).not.toHaveProperty('registryDocuments');
    });

  it('pairs Mapping definitionRef without guessing the only loaded Definition', () => {
    const mapping = { definitionRef: definitionUrl };
    let seen: AppGraphDocumentLintContext | undefined;
    documentLintValidator((document, context) => {
      if (document === mapping) seen = context;
      return { diagnostics: [] };
    })(graph([...companionHandles(), handle('mapping', mapping)]));
    expect(seen?.definitionDocument).toEqual(definition());
  });

  it.each(['screener', 'app'] as const)('supplies same-target peer Locales for a %s Locale', (kind) => {
    const url = `https://example.gov/${kind}/intake`;
    const target = { kind, url };
    const translated = { ...spanish, target };
    const base = { ...english, target };
    const screener = { $formspecScreener: '1.0', url };
    let seen: AppGraphDocumentLintContext | undefined;
    documentLintValidator((document, context) => {
      if (document === translated) seen = context;
      return { diagnostics: [] };
    })(graph([handle('locale', translated), handle('locale', base), handle('screener', screener)]));
    expect(seen?.localeDocuments).toEqual([base]);
    if (kind === 'screener') expect(seen?.screenerDocument).toBe(screener);
    expect(seen).not.toHaveProperty('definitionDocument');
  });
});

describe('document lint through the real engine', () => {
  beforeAll(async () => { await initFormspecEngine(); await initFormspecEngineTools(); });

  it('refuses Definition E302 and Response Action E1805 in a bundle report', async () => {
    const def = definition();
    Object.assign(def.items[0]!, { optionSet: 'missing' });
    const responseActions = { ...actions, version: '1.0.0', actions: [{ id: 'save', intent: 'save',
      effects: [{ type: 'serviceRequest', requestRef: 'save-plan', idempotencyKey: '@invocation.id' }] }],
      'x-formspec-runtime': { version: '1.0', requests: [{ id: 'save-plan', adapter: 'http-json',
        request: { method: 'POST', pathTemplate: '/plans/{planId}', pathBindings: {} } }] } };
    const base = bundle(def);
    const { report } = await produceBundleExportAppGraphValidationReport({
      ...base, manifest: { ...base.manifest, responseActions: { url: responseActions.url, version: '1.0.0' } },
      documents: { ...base.documents, [responseActions.url]: responseActions }, ...permissive,
      crossArtifactValidators: [documentLintValidator(lintDocument)],
    });
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'E302', origin: 'x-formspec-lint' }),
      expect.objectContaining({ code: 'E1805', origin: 'x-formspec-lint' }),
    ]));
  });

  it('does not report false W1401 when a Locale fallback is loaded', () => {
    const withoutFallback = companionHandles().filter((entry) => entry.document !== english);
    expect(documentLintValidator(lintDocument)(graph(withoutFallback)).filter((entry) => entry.code === 'W1401'))
      .toEqual([expect.objectContaining({ code: 'W1401', primarySource: expect.objectContaining({ artifactKind: 'locale' }) })]);
    const diagnostics = documentLintValidator(lintDocument)(graph(companionHandles()));
    expect(diagnostics.filter((entry) => entry.code === 'W1401')).toEqual([]);
  });

  it('reports a Theme module payload mismatch once, through module resolution', async () => {
    const { _registryDocuments, ...fixture } = JSON.parse(readFileSync(
      new URL('../../../tests/fixtures/lint/E604-module-payload-schema-mismatch.json', import.meta.url), 'utf8',
    ));
    const def = { ...definition(), url: fixture.targetDefinition.url };
    const payloadTheme = { ...fixture, url: themeUrl };
    const payloadRegistry = { ..._registryDocuments[0], url: registry.url, version: '1.0.0' };
    const { report } = await produceBundleExportAppGraphValidationReport({
      manifest: {
        $formspecBundle: '2.5', id: 'https://example.gov/apps/payload', version: '1.0.0',
        definitions: [{ url: def.url, version: '1.0.0' }], theme: { url: themeUrl, version: '1.0.0' },
        registries: [{ url: payloadRegistry.url, version: '1.0.0' }],
        modules: [{ id: 'x-formspec-presentation', version: '0.1.0' }],
      },
      documents: { [def.url]: def, [themeUrl]: payloadTheme, [payloadRegistry.url]: payloadRegistry },
      ...permissive, crossArtifactValidators: [documentLintValidator(lintDocument)],
    });
    expect(report.ok).toBe(false);
    expect(report.diagnostics.filter((entry) => ['MODULE-PAYLOAD-SCHEMA-MISMATCH', 'E604'].includes(entry.code)))
      .toEqual([expect.objectContaining({ code: 'MODULE-PAYLOAD-SCHEMA-MISMATCH' })]);
  });

  it('reports the theme-token warning once as W708, with no native twin', async () => {
    const base = bundle(definition());
    const { report } = await produceBundleExportAppGraphValidationReport({
      ...base, documents: { ...base.documents, [themeUrl]: { ...theme, tokens: { 'color.accent': '#7A1F3D' } } },
      ...permissive, crossArtifactValidators: [documentLintValidator(lintDocument)],
    });
    expect(report.diagnostics.filter((entry) => ['W708', 'THEME-TOKEN-UNREGISTERED'].includes(entry.code)))
      .toEqual([expect.objectContaining({ code: 'W708', severity: 'warning', origin: 'x-formspec-lint' })]);
  });
});
