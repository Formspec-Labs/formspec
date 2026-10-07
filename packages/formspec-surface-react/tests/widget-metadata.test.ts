/** @filedesc Public metadata compatibility, canonical shapes, and runtime import isolation. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import ts from 'typescript';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import * as metadata from '../src/widget-metadata.js';
import * as root from '../src/index.js';
import * as widgets from '../src/widgets/index.js';
import registry from '../../../schemas/registry.schema.json';
import common from '../../../schemas/common.schema.json';

// A dynamic relative argument avoids Vite's browser-asset URL rewrite in happy-dom.
const testFile = (relative: string) => new URL(relative, import.meta.url);

function runtimeImports(source: string): string[] {
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const parsed = ts.createSourceFile('module.js', compiled, ts.ScriptTarget.ES2022, true);
  const imports: string[] = [];
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      throw new Error('Metadata must not dynamically import runtime code');
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return imports;
}

describe('public widget metadata', () => {
  it('references maintained native schemas in the closed accepted input wrapper', () => {
    const schema = metadata.ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['definition', 'response', 'presentation']);
    expect(schema.properties.definition.$ref).toBe('https://formspec.org/schemas/definition/1.0');
    expect(schema.properties.response.$ref).toBe('https://formspec.org/schemas/response/1.0');
    expect(schema.properties.presentation).toBe(metadata.ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA);
  });
  it('preserves the exact objects exported by both existing public APIs', () => {
    const oldNames = Object.keys(widgets).filter(name => /^(ACCEPTED_RESPONSE_REVIEW_|RESPONSE_REVIEW_|SIGNING_CEREMONY_)/.test(name));
    expect(Object.keys(metadata).sort()).toEqual(oldNames.sort());
    for (const [name, value] of Object.entries(metadata)) {
      expect((root as Record<string, unknown>)[name]).toBe(value);
      expect((widgets as Record<string, unknown>)[name]).toBe(value);
    }
    expect(metadata.SIGNING_CEREMONY_REVIEW_SCHEMA.properties.state).toBe(metadata.RESPONSE_REVIEW_STATE_SCHEMA);
    expect(metadata.RESPONSE_REVIEW_WIDGET_SHAPE).not.toHaveProperty('actionOutputs');
  });

  it('resolves the new public package entry and retains the existing entries', () => {
    const require = createRequire(import.meta.url);
    const manifest = JSON.parse(readFileSync(testFile('../package.json'), 'utf8'));
    expect(manifest.exports['./widget-metadata']).toEqual({
      types: './dist/widget-metadata.d.ts', default: './dist/widget-metadata.js',
    });
    expect(require.resolve('@formspec-org/surface-react/widget-metadata')).toBe(
      fileURLToPath(testFile('../dist/widget-metadata.js')));
    expect(manifest.exports['.'].default).toBe('./dist/index.js');
    expect(manifest.exports['./widgets'].default).toBe('./dist/widgets/index.js');
    expect(manifest.exports['./formspec-surface.css']).toBe('./dist/formspec-surface.css');
  });

  it('emits only pure metadata imports, with no renderer or external runtime graph', () => {
    const visited = new Set<string>();
    function walk(url: URL) {
      if (visited.has(url.href)) return;
      visited.add(url.href);
      for (const specifier of runtimeImports(readFileSync(url, 'utf8'))) {
        expect(specifier).toMatch(/^\./);
        const next = new URL(specifier.replace(/\.js$/, '.ts'), url);
        expect(next.pathname).toMatch(/(?:metadata|signing-content-source-schema)\.ts$/);
        walk(next);
      }
    }
    walk(testFile('../src/widget-metadata.ts'));
    expect(visited.size).toBe(4);
  });

  it('keeps both metadata shapes accepted by the canonical complete Registry', () => {
    const ajv = new Ajv({ strict: false }); addFormats(ajv); ajv.addSchema(common); ajv.addSchema(registry);
    const document = { $formspecRegistry: '1.1', publisher: { name: 'Metadata test' },
      published: '2026-10-07T12:00:00Z', entries: [
        { name: 'x-metadata', category: 'module', version: '0.1.0', status: 'stable',
          description: 'Maintained metadata module.', compatibility: { formspecVersion: '>=1.0.0 <2.0.0' },
          contributes: ['x-response-review', 'x-signing-ceremony'] },
        ...[metadata.RESPONSE_REVIEW_WIDGET_SHAPE, metadata.SIGNING_CEREMONY_WIDGET_SHAPE].map(shape => ({
          name: shape.widgetName === 'ResponseReview' ? 'x-response-review' : 'x-signing-ceremony',
          category: 'widget', version: '0.1.0', status: 'stable', description: 'Maintained widget metadata.',
          compatibility: { formspecVersion: '>=1.0.0 <2.0.0' }, widgetShape: shape,
        })),
      ] };
    const validate = ajv.getSchema(registry.$id)!;
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
  });
});
