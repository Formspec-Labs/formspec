/** @filedesc Checks localized section title collisions through AppGraph. */
import { describe, expect, it } from 'vitest';
import { validateAppGraph } from '../src/validator.js';
import type { ResolvedArtifactHandle } from '../src/types.js';

const url = 'https://example.gov/form';
const version = '1.0.0';
const group = (key: string, label: string) => ({
  key, label, type: 'group', children: [{ key: key + 'Field', label: 'Answer', type: 'field', dataType: 'string' }],
});
const section = (id: string, title: string) => ({ component: 'Section', id, title, children: [] });
const heading = (key: string, label: string) => ({
  key, label, type: 'display', presentation: { widgetHint: 'Heading' },
});
const ref = { url, version };
const definition = (items: unknown[], pageMode = 'workspace') => ({
  $formspec: '1.0', ...ref, title: 'Form', formPresentation: { pageMode }, items,
});
const component = (children: unknown[], root = 'Stack') => ({
  $formspecComponent: '1.0', version, targetDefinition: { url }, tree: { component: root, children },
});
const theme = {
  $formspecTheme: '1.0', url: url + '/theme', version, targetDefinition: { url },
  pages: [{ id: 'one', title: 'Same', regions: [{ key: 'a' }] }, { id: 'two', title: 'Same', regions: [{ key: 'b' }] }],
};
const locale = (code: string, strings: Record<string, string>, fallback?: string) => ({
  $formspecLocale: '2.1', version, locale: code, target: { kind: 'definition', url }, strings, fallback,
});
function handle(kind: string, document: unknown, index = 0): ResolvedArtifactHandle {
  return { slot: `${kind}[${index}]`, artifactKind: kind, status: 'loaded', document };
}
function graphDiagnostics(items: unknown[], opts: {
  component?: unknown; theme?: typeof theme; locales?: unknown[]; mode?: string; routes?: unknown[];
} = {}) {
  return validateAppGraph({
    manifest: handle('appManifest', { definitions: [ref],
      theme: opts.theme ? { url: opts.theme.url, version } : undefined }),
    schemaValidators: () => ({ ok: true }),
    artifacts: {
      definitions: [handle('definition', definition(items, opts.mode))],
      components: opts.component ? [handle('component', opts.component)] : [],
      themes: opts.theme ? [{ ...handle('theme', opts.theme), ref: { url: opts.theme.url, version } }] : [],
      surfaces: opts.routes ? [handle('surface', { routes: opts.routes })] : [],
      locales: (opts.locales ?? []).map((doc, index) => handle('locale', doc, index)),
    },
  }).diagnostics;
}

function diagnostics(...args: Parameters<typeof graphDiagnostics>) {
  return graphDiagnostics(...args).filter(diagnostic => diagnostic.code === 'APP-GRAPH-SECTION-TITLE-DUPLICATE');
}
function expectCollision(result: ReturnType<typeof diagnostics>, firstSectionId: string, duplicateSectionId: string, locale: string | null = null) {
  expect(result).toEqual([expect.objectContaining({
    severity: 'error',
    details: expect.objectContaining({ firstSectionId, duplicateSectionId, locale }),
  })]);
}

describe('duplicate section titles', () => {
  it('compares effective Component Sections using NFC and whitespace folding', () => {
    expectCollision(diagnostics([], { component: component([section('one', ' Café  help '), section('two', 'Cafe\u0301 help')]) }), 'one', 'two');
  });
  it('compares Theme pages when they supply the effective sections', () => {
    expectCollision(diagnostics([group('a', 'First'), group('b', 'Second')], { theme }), 'one', 'two');
  });
  it('skips Theme pages suppressed by Component Sections', () => {
    expect(diagnostics([group('a', 'First'), group('b', 'Second')], {
      theme, component: component([section('one', 'First'), section('two', 'Second')]),
    })).toEqual([]);
  });
  it('compares generated group labels and loose headings in one plan', () => {
    expectCollision(diagnostics([heading('intro', 'Same'), group('a', 'Same')]), 'intro', 'a');
  });
  it('reports a collision introduced only by a Locale and its fallback', () => {
    expectCollision(diagnostics([group('a', 'First'), group('b', 'Second')], {
      locales: [locale('fr', { 'a.label': 'Même' }), locale('fr-CA', { 'b.label': 'Même' }, 'fr')],
    }), 'a', 'b', 'fr-CA');
  });
  it('uses the planned steps of an explicit Wizard', () => {
    expectCollision(diagnostics([], {
      component: component([section('one', 'Same'), section('two', 'Same')], 'Wizard'), mode: 'single',
    }), 'one', 'two');
  });
  it('checks the embedded form with the host route’s Theme grant', () => {
    const themedPages = { ...theme, pages: theme.pages.map(page => ({ ...page, title: page.id })) };
    const items = [group('a', 'Same'), group('b', 'Same')];
    const intake = { id: 'intake', routeClass: 'intake',
      slots: [{ id: 'form', slotType: 'definition-form', binding: { definitionRef: url } }] };
    const embed = { id: 'embed', slots: [{ id: 'slot', slotType: 'embed-route', binding: { routeRef: 'intake' } }] };
    expect(diagnostics(items, { theme: themedPages, routes: [intake] })).toEqual([]);
    expectCollision(diagnostics(items, { theme: themedPages, routes: [intake, embed] }), 'a', 'b');
  });
  it('reports an explicit Wizard without duplicate page-title warnings', () => {
    const { id: _id, ...step } = section('omitted', 'Same');
    const findings = graphDiagnostics([], { component: component([step, step], 'Wizard'), mode: 'single' });
    expect(findings.filter(finding => finding.code.includes('TITLE-DUPLICATE')).map(finding => finding.code))
      .toEqual(['APP-GRAPH-SECTION-TITLE-DUPLICATE']);
  });
  it('uses positional identities for Wizard steps without authored IDs', () => {
    const { id: _id, ...step } = section('omitted', 'Same');
    expectCollision(diagnostics([], { component: component([step, step]), mode: 'wizard' }), '[step 1]', '[step 2]');
  });
  it('uses the inline group label when a translation is empty', () => {
    expectCollision(diagnostics([group('a', 'Same'), group('b', 'Other')], {
      locales: [locale('fr', { 'a.label': '', 'b.label': 'Same' })],
    }), 'a', 'b', 'fr');
  });
  it('leaves answer-dependent titles unproven and preserves case differences', () => {
    expect(diagnostics([group('a', 'Value {{ $name }}'), group('b', 'Value {{ $name }}'), group('c', 'same'), group('d', 'Same')])).toEqual([]);
  });
  it('compares escaped braces as literal wording', () => {
    const findings = diagnostics([group('a', 'Open {{{{name}}'), group('b', 'Open {{{{name}}')]);
    expectCollision(findings, 'a', 'b');
    expect(findings[0].details?.normalizedTitle).toBe('Open {{name}}');
  });
  it('preserves the literal Component title fallback beside an escaped Locale value', () => {
    const presentation = component([section('one', 'Open {{{{name}}'), section('two', 'Different')]);
    expect(diagnostics([], {
      component: presentation,
      locales: [locale('fr', { '$component.two.title': 'Open {{{{name}}' })],
    })).toEqual([]);
  });
  it('does not treat single-page groups as sections', () => {
    expect(diagnostics([group('a', 'Same'), group('b', 'Same')], { mode: 'single' })).toEqual([]);
  });
});
