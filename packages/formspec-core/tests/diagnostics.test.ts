import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import { createRawProject } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.resolve(__dirname, '../../../schemas');
const APP_GRAPH_REPORT_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(SCHEMAS_DIR, 'app-graph-validation-report.schema.json'), 'utf-8'),
);

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateDiagnostic = ajv.compile({
  $defs: APP_GRAPH_REPORT_SCHEMA.$defs,
  $ref: '#/$defs/Diagnostic',
});

describe('diagnose (fs-e9xa: canonical stack linter)', () => {
  it('returns clean diagnostics for a valid project', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:example:clean',
          version: '1.0.0',
          status: 'draft',
          title: 'Clean',
          items: [
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
          ],
        },
      },
    });
    const diag = project.diagnose();
    expect(diag.diagnostics).toEqual([]);
    expect(diag.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('reports E300, E302, E500 (calculate cycle) and W1902 with matching counts, all valid against $defs/Diagnostic', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:example:defects',
          version: '1.0.0',
          status: 'draft',
          title: 'Defects',
          items: [
            { key: 'first', type: 'field', dataType: 'string', label: 'Duplicate' },
            { key: 'second', type: 'field', dataType: 'choice', label: 'Duplicate', optionSet: 'missing_opts' },
            { key: 'a', type: 'field', dataType: 'integer', label: 'A' },
            { key: 'b', type: 'field', dataType: 'integer', label: 'B' },
          ],
          binds: [
            { path: 'unknownField', required: 'true' },
            { path: 'a', calculate: '$b + 1' },
            { path: 'b', calculate: '$a + 1' },
          ],
        },
      },
    });

    const diag = project.diagnose();
    const codes = diag.diagnostics.map((d) => d.code);
    expect(codes).toContain('E300');
    expect(codes).toContain('E302');
    expect(codes).toContain('E500');
    expect(codes).toContain('W1902');

    // Never emits retired TS-only diagnostic codes.
    for (const legacy of ['CIRCULAR_DEPENDENCY', 'FEL_PARSE_ERROR', 'ORPHAN_COMPONENT_BIND', 'UNRESOLVED_EXTENSION']) {
      expect(codes).not.toContain(legacy);
    }

    // Counts match entries exactly.
    const expectedCounts = { error: 0, warning: 0, info: 0 };
    for (const entry of diag.diagnostics) {
      expectedCounts[entry.severity]++;
      const ok = validateDiagnostic(entry);
      expect(ok, `Invalid AppGraph Diagnostic ${entry.code}: ${JSON.stringify(validateDiagnostic.errors)}`).toBe(true);
      expect(entry.origin).toBe('x-formspec-lint');
      expect(entry.phase).toBe('cross-artifact');
    }
    expect(diag.counts).toEqual(expectedCounts);
  });

  it('does not emit E500 for mutual required binds (fs-6jt9)', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:example:mutual-required',
          version: '1.0.0',
          status: 'draft',
          title: 'Mutual Required',
          items: [
            { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
            { key: 'phone', type: 'field', dataType: 'string', label: 'Phone' },
          ],
          binds: [
            { path: 'email', required: 'empty($phone)' },
            { path: 'phone', required: 'empty($email)' },
          ],
        },
      },
    });

    const diag = project.diagnose();
    expect(diag.diagnostics.filter((d) => d.code === 'E500')).toEqual([]);
  });

  it('reports E313 for an unassembled group $ref', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:example:application',
          version: '1.0.0',
          status: 'draft',
          title: 'Application',
          items: [
            { key: 'cover', type: 'group', label: 'Cover', $ref: 'urn:example:cover|1.0.0' },
          ],
        },
      },
    });

    const diag = project.diagnose();
    expect(diag.diagnostics).toContainEqual(expect.objectContaining({
      code: 'E313',
      severity: 'error',
      origin: 'x-formspec-lint',
      primarySource: expect.objectContaining({
        artifactKind: 'definition',
        artifactSlot: 'definition',
      }),
    }));
    expect(diag.counts.error).toBeGreaterThanOrEqual(1);
  });

  it('reports E600, E601 and E602 for extension usage against loaded registries', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:example:extensions',
          version: '1.0.0',
          status: 'draft',
          title: 'Extensions',
          items: [
            { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
          ],
        },
      },
    });
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          $formspecRegistry: '1.1',
          url: 'urn:example:registry',
          publisher: { name: 'Example' },
          published: '2026-01-01',
          entries: [
            { name: 'x-stable', category: 'constraint', status: 'stable' },
            { name: 'x-deprecated', category: 'constraint', status: 'deprecated' },
            { name: 'x-retired', category: 'constraint', status: 'retired' },
          ],
        },
      },
    });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'email', extension: 'x-stable', value: true } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'email', extension: 'x-unknown', value: true } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'email', extension: 'x-deprecated', value: true } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'email', extension: 'x-retired', value: true } });

    const diag = project.diagnose();
    const codes = diag.diagnostics.map((d) => d.code);
    expect(codes).toContain('E600');
    expect(codes).toContain('E601');
    expect(codes).toContain('E602');
    for (const entry of diag.diagnostics) {
      expect(validateDiagnostic(entry)).toBe(true);
    }
  });

  it('lints companion documents (Theme, Mapping, Component, Locales) against the project Definition', () => {
    const defUrl = 'urn:example:companions';
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: defUrl,
          version: '1.0.0',
          status: 'draft',
          title: 'Companions',
          items: [
            { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
          ],
        },
        themeDeclared: true,
        theme: {
          targetDefinition: { url: defUrl },
          items: { missingThemeKey: { widget: 'TextInput' } },
        },
        locales: {
          en: {
            $formspecLocale: '2.0',
            version: '1.0.0',
            locale: 'en',
            target: { kind: 'definition', url: defUrl },
            strings: { 'name.label': 'Name' },
          },
          es: {
            $formspecLocale: '2.0',
            version: '1.0.0',
            locale: 'es',
            fallback: 'en',
            target: { kind: 'definition', url: defUrl },
            strings: { 'ghostField.label': 'Fantasma' },
          },
        },
      },
    });
    project.dispatch({ type: 'mapping.addRule', payload: { sourcePath: 'staleField', targetPath: 'out.name' } });
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'missingItem' },
    });

    const diag = project.diagnose();
    const byCode = (code: string) => diag.diagnostics.filter((d) => d.code === code);
    expect(byCode('W705').length).toBeGreaterThanOrEqual(1);
    expect(byCode('E1110').length).toBeGreaterThanOrEqual(1);
    expect(byCode('E1110')[0].severity).toBe('error');
    expect(byCode('W800').length).toBeGreaterThanOrEqual(1);
    expect(byCode('E1402').length).toBeGreaterThanOrEqual(1);
    // Sibling Locale `en` is passed as context to `es`, so no false W1401 fallback warning.
    expect(byCode('W1401')).toEqual([]);

    for (const entry of diag.diagnostics) {
      expect(validateDiagnostic(entry), `${entry.code}: ${JSON.stringify(validateDiagnostic.errors)}`).toBe(true);
    }
  });

  it('throws when tools WASM is uninitialised instead of returning empty diagnostics', () => {
    const coreDistEntry = path.resolve(__dirname, '../dist/index.js');
    if (!fs.existsSync(coreDistEntry)) return;
    let threw = false;
    try {
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { createRawProject } from ${JSON.stringify(coreDistEntry)}; createRawProject().diagnose();`,
        ],
        { stdio: 'pipe' },
      );
    } catch (err: any) {
      threw = true;
      const stderr = String(err?.stderr ?? '');
      expect(stderr).toMatch(/WASM|initFormspecEngine/i);
    }
    expect(threw).toBe(true);
  });

  it('contains none of the retired legacy diagnostic codes in diagnostics.ts', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/queries/diagnostics.ts'), 'utf-8');
    for (const legacy of ['CIRCULAR_DEPENDENCY', 'FEL_PARSE_ERROR', 'ORPHAN_COMPONENT_BIND', 'UNRESOLVED_EXTENSION']) {
      expect(source).not.toContain(legacy);
    }
  });
});
