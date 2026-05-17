import { describe, it, expect } from 'vitest';
import type { ScreenerDocument } from '@formspec-org/types';
import { createRawProject } from '../src/index.js';

function emptyScreenerDoc(): ScreenerDocument {
  return {
    $formspecScreener: '1.0',
    url: 'urn:test:screener',
    version: '1.0.0',
    title: 'Test Screener',
    items: [],
    evaluation: [],
  } as ScreenerDocument;
}

describe('fieldPaths', () => {
  it('returns all leaf field paths', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'address' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'street', parentPath: 'address' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'city', parentPath: 'address' } },
    ]);

    expect(project.fieldPaths()).toEqual(['name', 'address.street', 'address.city']);
  });

  it('returns empty array for empty form', () => {
    const project = createRawProject();
    expect(project.fieldPaths()).toEqual([]);
  });
});

// ── UX-4b: itemPaths includes display/content items ──────────────

describe('itemPaths', () => {
  it('includes display items alongside fields', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name' } },
      { type: 'definition.addItem', payload: { type: 'display', key: 'banner1', label: 'Welcome' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'email' } },
    ]);

    const paths = project.itemPaths();
    expect(paths).toContain('name');
    expect(paths).toContain('banner1');
    expect(paths).toContain('email');
  });

  it('includes nested display items with dot-notation paths', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'section' } },
      { type: 'definition.addItem', payload: { type: 'display', key: 'heading', parentPath: 'section', label: 'Section Header' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'amount', parentPath: 'section' } },
    ]);

    const paths = project.itemPaths();
    expect(paths).toContain('section.heading');
    expect(paths).toContain('section.amount');
    // Groups themselves are NOT leaf items — they should not appear
    expect(paths).not.toContain('section');
  });

  it('returns only field paths when no display items exist', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'f1' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'f2' } },
    ]);

    expect(project.itemPaths()).toEqual(['f1', 'f2']);
  });

  it('returns empty array for empty form', () => {
    const project = createRawProject();
    expect(project.itemPaths()).toEqual([]);
  });

  it('returns only display paths when no fields exist', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'display', key: 'd1' } },
      { type: 'definition.addItem', payload: { type: 'display', key: 'd2' } },
    ]);

    expect(project.itemPaths()).toEqual(['d1', 'd2']);
  });

  it('preserves document order', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'display', key: 'intro' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'name' } },
      { type: 'definition.addItem', payload: { type: 'display', key: 'divider' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'email' } },
    ]);

    expect(project.itemPaths()).toEqual(['intro', 'name', 'divider', 'email']);
  });
});

describe('itemAt', () => {
  it('resolves a root item', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name', label: 'Name' } });

    const item = project.itemAt('name');
    expect(item).toBeDefined();
    expect(item!.key).toBe('name');
    expect(item!.label).toBe('Name');
  });

  it('resolves a nested item', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f', parentPath: 'g' } });

    expect(project.itemAt('g.f')?.key).toBe('f');
  });

  it('returns undefined for nonexistent path', () => {
    const project = createRawProject();
    expect(project.itemAt('nonexistent')).toBeUndefined();
  });
});

describe('statistics', () => {
  it('counts items and structures', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'f1' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'f2' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'g1' } },
      { type: 'definition.addItem', payload: { type: 'display', key: 'd1' } },
      { type: 'definition.addShape', payload: { id: 's1', target: 'f1', constraint: '$f1 > 0', message: 'M' } },
      { type: 'definition.addVariable', payload: { name: 'v1', expression: '42' } },
      { type: 'definition.setBind', payload: { path: 'f1', properties: { required:  'true' } } },
    ]);

    const stats = project.statistics();
    expect(stats.fieldCount).toBe(2);
    expect(stats.groupCount).toBe(1);
    expect(stats.displayCount).toBe(1);
    expect(stats.shapeCount).toBe(1);
    expect(stats.variableCount).toBe(1);
    expect(stats.bindCount).toBe(1);
  });

  it('reports zero screener counts when no screener exists', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f1' } });

    const stats = project.statistics();
    expect(stats.screenerFieldCount).toBe(0);
    expect(stats.screenerRouteCount).toBe(0);
  });

  it('reports zero screener counts when screener document is removed', () => {
    const project = createRawProject();
    project.batch([
      { type: 'screener.setDocument', payload: emptyScreenerDoc() },
      { type: 'screener.addPhase', payload: { id: 'main', strategy: 'first-match' } },
      { type: 'screener.addItem', payload: { type: 'field', key: 'age', dataType: 'integer' } },
      {
        type: 'screener.addRoute',
        payload: { phaseId: 'main', route: { condition: '$age >= 18', target: 'urn:form:adults' } },
      },
      { type: 'screener.remove', payload: {} },
    ]);

    const stats = project.statistics();
    expect(stats.screenerFieldCount).toBe(0);
    expect(stats.screenerRouteCount).toBe(0);
  });

  it('counts screener fields and routes', () => {
    const project = createRawProject();
    project.batch([
      { type: 'screener.setDocument', payload: emptyScreenerDoc() },
      { type: 'screener.addPhase', payload: { id: 'main', strategy: 'first-match' } },
      { type: 'screener.addItem', payload: { type: 'field', key: 'age', dataType: 'integer' } },
      { type: 'screener.addItem', payload: { type: 'field', key: 'country', dataType: 'string' } },
      { type: 'screener.addItem', payload: { type: 'field', key: 'language', dataType: 'choice' } },
      {
        type: 'screener.addRoute',
        payload: { phaseId: 'main', route: { condition: '$age >= 18', target: 'urn:form:adults' } },
      },
      {
        type: 'screener.addRoute',
        payload: { phaseId: 'main', route: { condition: '$age < 18', target: 'urn:form:minors' } },
      },
    ]);

    const stats = project.statistics();
    expect(stats.screenerFieldCount).toBe(3);
    expect(stats.screenerRouteCount).toBe(2);
  });

  it('counts screener fields separately from main form fields', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'email' } },
      { type: 'screener.setDocument', payload: emptyScreenerDoc() },
      { type: 'screener.addPhase', payload: { id: 'main', strategy: 'first-match' } },
      { type: 'screener.addItem', payload: { type: 'field', key: 'eligible', dataType: 'boolean' } },
      {
        type: 'screener.addRoute',
        payload: { phaseId: 'main', route: { condition: '$eligible = true', target: 'urn:form:main' } },
      },
    ]);

    const stats = project.statistics();
    expect(stats.fieldCount).toBe(2);
    expect(stats.screenerFieldCount).toBe(1);
    expect(stats.screenerRouteCount).toBe(1);
  });

  it('reports expression, component node, and mapping rule counts', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'a', relevant: '$b > 0' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'b' } },
      { type: 'definition.setBind', payload: { path: 'a', properties: { calculate: '$b + 1' } } },
      { type: 'mapping.addRule', payload: { sourcePath: 'a', targetPath: 'out.a', transform: 'expression' } },
      { type: 'mapping.setRule', payload: { index: 0, property: 'expression', value: '$a + $b' } },
    ]);

    const stats = project.statistics();
    expect(stats.expressionCount).toBeGreaterThanOrEqual(3);
    expect(stats.componentNodeCount).toBeGreaterThanOrEqual(2);
    expect(stats.totalMappingRuleCount).toBe(1);
  });
});

// ── Simple definition readers ──────────────────────────────────────

describe('instanceNames', () => {
  it('returns all declared instance names', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addInstance', payload: { name: 'lookup', source: 'https://api.example.com/data' } },
      { type: 'definition.addInstance', payload: { name: 'config', data: { theme: 'dark' } } },
    ]);

    expect(project.instanceNames()).toEqual(['lookup', 'config']);
  });

  it('returns empty array when no instances', () => {
    const project = createRawProject();
    expect(project.instanceNames()).toEqual([]);
  });
});

describe('variableNames', () => {
  it('returns all declared variable names', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addVariable', payload: { name: 'total', expression: '$a + $b' } },
      { type: 'definition.addVariable', payload: { name: 'tax', expression: '$total * 0.1' } },
    ]);

    expect(project.variableNames()).toEqual(['total', 'tax']);
  });

  it('returns empty array when no variables', () => {
    const project = createRawProject();
    expect(project.variableNames()).toEqual([]);
  });
});

describe('optionSetUsage', () => {
  it('returns field paths referencing a named option set', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.setOptionSet', payload: { name: 'colors', options: [{ value: 'red', label: 'Red' }] } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'fav', dataType: 'choice' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'alt', dataType: 'choice' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'other', dataType: 'string' } },
      { type: 'definition.setItemProperty', payload: { path: 'fav', property: 'optionSet', value: 'colors' } },
      { type: 'definition.setItemProperty', payload: { path: 'alt', property: 'optionSet', value: 'colors' } },
    ]);

    expect(project.optionSetUsage('colors')).toEqual(['fav', 'alt']);
  });

  it('returns empty when no fields reference the set', () => {
    const project = createRawProject();
    expect(project.optionSetUsage('nonexistent')).toEqual([]);
  });
});

describe('searchItems', () => {
  it('filters by type', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'f1' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'g1' } },
      { type: 'definition.addItem', payload: { type: 'display', key: 'd1' } },
    ]);

    const groups = project.searchItems({ type: 'group' });
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('g1');
  });

  it('filters by dataType', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'n1', dataType: 'integer' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'n2', dataType: 'integer' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 's1', dataType: 'string' } },
    ]);

    const ints = project.searchItems({ dataType: 'integer' });
    expect(ints).toHaveLength(2);
  });

  it('filters by label substring', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'email', label: 'Email Address' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', label: 'Full Name' } },
    ]);

    const results = project.searchItems({ label: 'email' });
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('email');
  });

  it('searches nested items', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'g' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'nested', parentPath: 'g', dataType: 'decimal' } },
    ]);

    const results = project.searchItems({ dataType: 'decimal' });
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('nested');
  });

  it('includes full dot-path in results', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'contact' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'email', parentPath: 'contact' } },
    ]);

    const results = project.searchItems({ type: 'field' });
    expect(results).toHaveLength(2);
    expect(results[0].path).toBe('name');
    expect(results[1].path).toBe('contact.email');
  });

  it('distinguishes same-named fields in different groups', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'billing' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', parentPath: 'billing', label: 'Name' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'shipping' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', parentPath: 'shipping', label: 'Name' } },
    ]);

    const results = project.searchItems({ label: 'Name' });
    expect(results).toHaveLength(2);
    expect(results.map(r => r.path)).toEqual(['billing.name', 'shipping.name']);
  });

  it('includes path for root-level items', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'solo' } });

    const results = project.searchItems({ type: 'field' });
    expect(results[0].path).toBe('solo');
  });

  it('includes path for groups themselves', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'outer' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'inner', parentPath: 'outer' } },
    ]);

    const results = project.searchItems({ type: 'group' });
    expect(results).toHaveLength(2);
    expect(results[0].path).toBe('outer');
    expect(results[1].path).toBe('outer.inner');
  });

  it('returns empty array with path when no matches', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });

    const results = project.searchItems({ dataType: 'boolean' });
    expect(results).toEqual([]);
  });
});

describe('effectivePresentation', () => {
  it('returns defaults when no selectors or overrides', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', dataType: 'string' } },
      { type: 'theme.setDefaults', payload: { property: 'labelPosition', value: 'top' } },
    ]);

    const pres = project.effectivePresentation('name');
    expect(pres.labelPosition).toBe('top');
  });

  it('applies matching selectors over defaults', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'age', dataType: 'integer' } },
      { type: 'theme.setDefaults', payload: { property: 'labelPosition', value: 'top' } },
      { type: 'theme.addSelector', payload: { match: { dataType: 'integer' }, apply: { widget: 'NumberInput' } } },
    ]);

    const pres = project.effectivePresentation('age');
    expect(pres.labelPosition).toBe('top');
    expect(pres.widget).toBe('NumberInput');
  });

  it('applies per-item overrides over selectors', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'total', dataType: 'decimal' } },
      { type: 'theme.addSelector', payload: { match: { dataType: 'decimal' }, apply: { widget: 'NumberInput' } } },
      { type: 'theme.setItemOverride', payload: { itemKey: 'total', property: 'widget', value: 'Slider' } },
    ]);

    const pres = project.effectivePresentation('total');
    expect(pres.widget).toBe('Slider');
  });

  it('returns empty object for nonexistent field', () => {
    const project = createRawProject();
    const pres = project.effectivePresentation('nonexistent');
    expect(pres).toEqual({});
  });
});

// ── Cross-artifact queries ───────────────────────────────────────

describe('bindFor', () => {
  it('returns the bind for a given path', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'age' } },
      { type: 'definition.setBind', payload: { path: 'age', properties: { required:  'true', constraint: '$age > 0' } } },
    ]);

    const bind = project.bindFor('age');
    expect(bind).toBeDefined();
    expect(bind!.required).toBe( 'true');
    expect(bind!.constraint).toBe('$age > 0');
  });

  it('returns undefined when no bind exists', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    expect(project.bindFor('name')).toBeUndefined();
  });
});

describe('componentFor', () => {
  it('returns the component tree node bound to a field', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'email' } },
      { type: 'component.addNode', payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'email' } },
    ]);

    const node = project.componentFor('email');
    expect(node).toBeDefined();
    expect(node!.component).toBe('TextInput');
    expect(node!.bind).toBe('email');
  });

  it('returns undefined for a nonexistent field key', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    expect(project.componentFor('nonexistent')).toBeUndefined();
  });
});

describe('resolveExtension', () => {
  it('resolves an extension name from loaded registries', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test-registry',
          entries: [
            { name: 'x-formspec-url', category: 'constraint', status: 'stable' },
            { name: 'x-formspec-currency', category: 'dataType', status: 'stable' },
          ],
        },
      },
    });

    const entry = project.resolveExtension('x-formspec-url');
    expect(entry).toBeDefined();
    expect(entry!.name).toBe('x-formspec-url');
  });

  it('returns undefined for unknown extension', () => {
    const project = createRawProject();
    expect(project.resolveExtension('x-nonexistent')).toBeUndefined();
  });
});

describe('unboundItems', () => {
  it('returns field paths not bound to any component tree node', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'email' } },
    ]);
    // Tree sync auto-creates nodes; manually remove one to test unboundItems
    project.dispatch({
      type: 'component.deleteNode',
      payload: { node: { bind: 'email' } },
    });

    expect(project.unboundItems()).toEqual(['email']);
  });

  it('returns empty when all fields are bound', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name' } },
      { type: 'component.addNode', payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'name' } },
    ]);

    expect(project.unboundItems()).toEqual([]);
  });
});

describe('resolveToken', () => {
  it('returns Tier 3 (component) token when set', () => {
    const project = createRawProject();
    project.dispatch({ type: 'component.setToken', payload: { key: 'color.primary', value: '#ff0000' } });
    project.dispatch({ type: 'theme.setToken', payload: { key: 'color.primary', value: '#0000ff' } });

    expect(project.resolveToken('color.primary')).toBe('#ff0000');
  });

  it('falls back to Tier 2 (theme) token', () => {
    const project = createRawProject();
    project.dispatch({ type: 'theme.setToken', payload: { key: 'color.primary', value: '#0000ff' } });

    expect(project.resolveToken('color.primary')).toBe('#0000ff');
  });

  it('returns undefined when token not set anywhere', () => {
    const project = createRawProject();
    expect(project.resolveToken('color.unknown')).toBeUndefined();
  });
});

describe('allDataTypes', () => {
  it('returns 13 core types by default', () => {
    const project = createRawProject();
    const types = project.allDataTypes();

    expect(types.length).toBe(13);
    expect(types.every(t => t.source === 'core')).toBe(true);
    expect(types.map(t => t.name)).toContain('string');
    expect(types.map(t => t.name)).toContain('text');
    expect(types.map(t => t.name)).toContain('integer');
    expect(types.map(t => t.name)).toContain('uri');
    expect(types.map(t => t.name)).toContain('boolean');
    expect(types.map(t => t.name)).toContain('date');
    expect(types.map(t => t.name)).not.toContain('signature');
    expect(types.map(t => t.name)).not.toContain('barcode');
  });

  it('includes extension dataTypes from loaded registries', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test-registry',
          entries: [
            { name: 'x-phone-number', category: 'dataType', baseType: 'string', status: 'stable' },
          ],
        },
      },
    });

    const types = project.allDataTypes();
    expect(types.length).toBe(14);
    const ext = types.find(t => t.name === 'x-phone-number');
    expect(ext).toBeDefined();
    expect(ext!.source).toBe('extension');
    expect(ext!.baseType).toBe('string');
    expect(ext!.registryUrl).toBe('urn:test-registry');
  });
});

// ── FEL queries ────────────────────────────────────────────────

describe('allExpressions', () => {
  it('collects all FEL expressions with locations', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'a' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'b' } },
      { type: 'definition.setBind', payload: { path: 'a', properties: { calculate: '$b * 2', required:  'true' } } },
      { type: 'definition.addShape', payload: { id: 's1', target: 'a', constraint: '$a > 0', message: 'M' } },
      { type: 'definition.addVariable', payload: { name: 'total', expression: '$a + $b' } },
    ]);

    const exprs = project.allExpressions();
    expect(exprs.length).toBe(4); // calculate, required, shape constraint, variable
    expect(exprs.some(e => e.expression === '$b * 2' && e.artifact === 'definition')).toBe(true);
    expect(exprs.some(e => e.expression === '$a > 0')).toBe(true);
    expect(exprs.some(e => e.expression === '$a + $b')).toBe(true);
  });

  it('includes mapping expressions and conditions', () => {
    const project = createRawProject();
    project.dispatch({ type: 'mapping.addRule', payload: { sourcePath: 'a', targetPath: 'out.a', transform: 'expression' } });
    project.dispatch({ type: 'mapping.setRule', payload: { index: 0, property: 'expression', value: '$a + 1' } });
    project.dispatch({ type: 'mapping.setRule', payload: { index: 0, property: 'condition', value: '$a > 0' } });

    const exprs = project.allExpressions();
    expect(exprs.some(e => e.expression === '$a + 1' && e.artifact === 'mapping')).toBe(true);
    expect(exprs.some(e => e.expression === '$a > 0' && e.artifact === 'mapping')).toBe(true);
  });

  it('includes component when-guards from tree nodes', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'flag' } },
      { type: 'component.addNode', payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'flag' } },
      { type: 'component.setNodeProperty', payload: { node: { bind: 'flag' }, property: 'when', value: '$flag = true' } },
    ]);

    const exprs = project.allExpressions();
    expect(exprs.some(e => e.artifact === 'component' && e.expression === '$flag = true')).toBe(true);
  });
});

describe('availableReferences', () => {
  it('returns fields, variables, and instances', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', dataType: 'string', label: 'Name' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'age', dataType: 'integer' } },
      { type: 'definition.addVariable', payload: { name: 'total', expression: '42' } },
      { type: 'definition.addInstance', payload: { name: 'lookup', source: 'https://api.example.com' } },
    ]);

    const refs = project.availableReferences();
    expect(refs.fields).toHaveLength(2);
    expect(refs.fields[0].path).toBe('name');
    expect(refs.fields[0].dataType).toBe('string');
    expect(refs.variables).toHaveLength(1);
    expect(refs.variables[0].name).toBe('total');
    expect(refs.instances).toHaveLength(1);
    expect(refs.instances[0].name).toBe('lookup');
  });

  it('adds repeat context refs when targetPath is inside a repeatable group', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'rows', repeatable: true } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'amount', parentPath: 'rows', dataType: 'decimal' } },
    ]);

    const refs = project.availableReferences('rows[0].amount');
    expect(refs.contextRefs).toEqual(expect.arrayContaining(['@current', '@index', '@count']));
  });

  it('adds mapping context refs when mapping context is provided', () => {
    const project = createRawProject();
    const refs = project.availableReferences({
      targetPath: 'total',
      mappingContext: { ruleIndex: 0, direction: 'forward' },
    });
    expect(refs.contextRefs).toEqual(expect.arrayContaining(['@source', '@target']));
  });

  // ── UX-6: scope annotations for repeat group context ──────────

  it('annotates fields with scope when contextPath is inside a repeat group', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'global_name', dataType: 'string' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'rows', repeatable: true } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'amount', parentPath: 'rows', dataType: 'decimal' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'desc', parentPath: 'rows', dataType: 'string' } },
    ]);

    const refs = project.availableReferences('rows[0].amount');
    const globalField = refs.fields.find(f => f.path === 'global_name');
    const localField = refs.fields.find(f => f.path === 'rows.amount');
    const localField2 = refs.fields.find(f => f.path === 'rows.desc');

    expect(globalField?.scope).toBe('global');
    expect(localField?.scope).toBe('local');
    expect(localField2?.scope).toBe('local');
  });

  it('does not annotate scope when contextPath is not inside a repeat group', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', dataType: 'string' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'email', dataType: 'string' } },
    ]);

    const refs = project.availableReferences('name');
    // No scope annotation when not inside a repeat
    expect(refs.fields[0].scope).toBeUndefined();
    expect(refs.fields[1].scope).toBeUndefined();
  });

  it('does not annotate scope when no contextPath is given', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'rows', repeatable: true } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'amount', parentPath: 'rows', dataType: 'decimal' } },
    ]);

    const refs = project.availableReferences();
    // Without context, no scope annotation
    expect(refs.fields[0].scope).toBeUndefined();
  });

  it('handles nested repeat groups — local means same innermost repeat', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'title', dataType: 'string' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'sections', repeatable: true } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'heading', parentPath: 'sections', dataType: 'string' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'items', parentPath: 'sections', repeatable: true } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'qty', parentPath: 'sections.items', dataType: 'integer' } },
    ]);

    // Context is inside the inner repeat group
    const refs = project.availableReferences('sections[0].items[0].qty');
    const titleField = refs.fields.find(f => f.path === 'title');
    const headingField = refs.fields.find(f => f.path === 'sections.heading');
    const qtyField = refs.fields.find(f => f.path === 'sections.items.qty');

    expect(titleField?.scope).toBe('global');
    // heading is in the parent repeat, not the same innermost repeat
    expect(headingField?.scope).toBe('global');
    // qty is in the same innermost repeat group
    expect(qtyField?.scope).toBe('local');
  });

  it('annotates fields in a non-repeatable subgroup of a repeat as local', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'external', dataType: 'string' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'rows', repeatable: true } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'detail', parentPath: 'rows' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'note', parentPath: 'rows.detail', dataType: 'string' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'amount', parentPath: 'rows', dataType: 'decimal' } },
    ]);

    const refs = project.availableReferences('rows[0].amount');
    const note = refs.fields.find(f => f.path === 'rows.detail.note');
    const amount = refs.fields.find(f => f.path === 'rows.amount');
    const external = refs.fields.find(f => f.path === 'external');

    // note is nested in a non-repeatable subgroup of 'rows' — still local to 'rows'
    expect(note?.scope).toBe('local');
    expect(amount?.scope).toBe('local');
    expect(external?.scope).toBe('global');
  });
});

describe('felFunctionCatalog', () => {
  it('returns built-in functions', () => {
    const project = createRawProject();
    const catalog = project.felFunctionCatalog();

    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every(f => f.source === 'builtin' || f.source === 'extension')).toBe(true);
    const sumFn = catalog.find(f => f.name === 'sum');
    expect(sumFn).toBeDefined();
    expect(sumFn!.source).toBe('builtin');
  });

  it('includes parser/runtime-backed built-ins with categories', () => {
    const project = createRawProject();
    const catalog = project.felFunctionCatalog();
    const countWhere = catalog.find((entry) => entry.name === 'countWhere');
    expect(countWhere).toBeDefined();
    expect(countWhere!.source).toBe('builtin');
    expect(countWhere!.category).toBe('aggregate');
  });

  it('includes signature and description for built-in functions', () => {
    const project = createRawProject();
    const catalog = project.felFunctionCatalog();
    const sum = catalog.find(f => f.name === 'sum');
    expect(sum).toBeDefined();
    expect(sum!.signature).toBe('sum(values) -> number');
    expect(sum!.description).toBeTruthy();
  });

  it('includes extension functions from loaded registries', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test',
          entries: [
            { name: 'customFn', category: 'function', status: 'stable' },
          ],
        },
      },
    });

    const catalog = project.felFunctionCatalog();
    const ext = catalog.find(f => f.name === 'customFn');
    expect(ext).toBeDefined();
    expect(ext!.source).toBe('extension');
  });
});

describe('expressionDependencies', () => {
  it('extracts field path references from an expression', () => {
    const project = createRawProject();
    const deps = project.expressionDependencies('$total + $items.amount * 2');

    expect(deps).toContain('total');
    expect(deps).toContain('items.amount');
  });

  it('returns empty for expression with no references', () => {
    const project = createRawProject();
    expect(project.expressionDependencies('42 + 1')).toEqual([]);
  });

  it('does not include references that appear only in strings/comments', () => {
    const project = createRawProject();
    const deps = project.expressionDependencies("$price + concat('$fake', 'x') /* $ignored */");
    expect(deps).toEqual(['price']);
  });
});

describe('fieldDependents', () => {
  it('finds binds, shapes, and variables referencing a field', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'price' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'total' } },
      { type: 'definition.setBind', payload: { path: 'total', properties: { calculate: '$price * 2' } } },
      { type: 'definition.addShape', payload: { id: 's1', target: 'price', constraint: '$price > 0', message: 'M' } },
      { type: 'definition.addVariable', payload: { name: 'v1', expression: '$price + 1' } },
    ]);

    const deps = project.fieldDependents('price');
    expect(deps.binds.length).toBeGreaterThan(0);
    expect(deps.shapes.length).toBeGreaterThan(0);
    expect(deps.variables.length).toBeGreaterThan(0);
  });

  it('does not match partial field-name substrings', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'a' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'amount' } },
      { type: 'definition.setBind', payload: { path: 'amount', properties: { calculate: '$amount + 1' } } },
    ]);

    const deps = project.fieldDependents('a');
    expect(deps.binds).toEqual([]);
  });
});

describe('variableDependents', () => {
  it('finds fields that reference a variable in their bind expressions', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'total' } },
      { type: 'definition.addVariable', payload: { name: 'taxRate', expression: '0.1' } },
      { type: 'definition.setBind', payload: { path: 'total', properties: { calculate: '$total * @taxRate' } } },
    ]);

    const deps = project.variableDependents('taxRate');
    expect(deps).toContain('total');
  });
});

describe('dependencyGraph', () => {
  it('builds a graph of fields, variables, and shapes', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'a' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'b' } },
      { type: 'definition.setBind', payload: { path: 'b', properties: { calculate: '$a * 2' } } },
    ]);

    const graph = project.dependencyGraph();
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.edges.length).toBeGreaterThan(0);
    const edge = graph.edges.find(e => e.from === 'a' && e.to === 'b');
    expect(edge).toBeDefined();
  });

  it('detects cycles across bind dependencies', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'a' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'b' } },
      { type: 'definition.setBind', payload: { path: 'a', properties: { calculate: '$b + 1' } } },
      { type: 'definition.setBind', payload: { path: 'b', properties: { calculate: '$a + 1' } } },
    ]);

    const graph = project.dependencyGraph();
    expect(graph.cycles.length).toBeGreaterThan(0);
  });
});

describe('parseFEL', () => {
  it('validates a well-formed expression', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'age' } });

    const result = project.parseFEL('$age > 18');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.references).toContain('age');
  });

  it('reports references and functions', () => {
    const project = createRawProject();
    const result = project.parseFEL('sum($a, $b) + max($c, 10)');

    expect(result.references).toContain('a');
    expect(result.references).toContain('b');
    expect(result.references).toContain('c');
    expect(result.functions).toContain('sum');
    expect(result.functions).toContain('max');
  });

  it('returns invalid for malformed FEL', () => {
    const project = createRawProject();
    const result = project.parseFEL('$a +');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('supports mapping context variables when context is provided', () => {
    const project = createRawProject();
    const result = project.parseFEL('@source', {
      targetPath: 'a',
      mappingContext: { direction: 'forward', ruleIndex: 0 },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('flags unknown context variables when parse context is provided', () => {
    const project = createRawProject();
    const result = project.parseFEL('@source', { targetPath: 'a' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === 'FEL_UNKNOWN_VARIABLE')).toBe(true);
  });

  it('includes hint when expression uses true() as a function call', () => {
    const project = createRawProject();
    const result = project.parseFEL('$field = true()');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('true');
    expect(result.errors[0].message).toContain('literal');
  });

  it('includes hint when expression uses false() as a function call', () => {
    const project = createRawProject();
    const result = project.parseFEL('$field = false()');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('literal');
  });

  it('does not add hint for unrelated parse errors', () => {
    const project = createRawProject();
    const result = project.parseFEL('$a +');
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).not.toContain('literal');
  });

  it('returns variable references from @ expressions', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addVariable', payload: { name: 'total', expression: '100' } },
      { type: 'definition.addVariable', payload: { name: 'tax', expression: '10' } },
    ]);

    const result = project.parseFEL('@total + @tax');
    expect(result.valid).toBe(true);
    expect(result.variables).toContain('total');
    expect(result.variables).toContain('tax');
  });

  it('returns empty variables array when no @ references', () => {
    const project = createRawProject();
    const result = project.parseFEL('$a + 1');
    expect(result.variables).toEqual([]);
  });

  it('returns empty warnings array for valid built-in functions', () => {
    const project = createRawProject();
    const result = project.parseFEL('sum($items) + count($items)');
    expect(result.warnings).toEqual([]);
  });

  it('emits FEL_UNKNOWN_FUNCTION warning for unrecognized function names', () => {
    const project = createRawProject();
    const result = project.parseFEL('totallyFake($x)');
    expect(result.valid).toBe(true); // warnings don't invalidate
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('FEL_UNKNOWN_FUNCTION');
    expect(result.warnings[0].severity).toBe('warning');
    expect(result.warnings[0].message).toContain('totallyFake');
  });

  it('does not warn for extension-registered functions', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test',
          entries: [
            { name: 'customCalc', category: 'function', status: 'stable' },
          ],
        },
      },
    });

    const result = project.parseFEL('customCalc($x)');
    expect(result.warnings).toEqual([]);
  });

  it('does not emit function warnings for parse-invalid expressions', () => {
    const project = createRawProject();
    const result = project.parseFEL('bogusFunc($a +');
    expect(result.valid).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('emits FEL_SIGIL_HINT warning when $name matches a known variable', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addVariable', payload: { name: 'status', expression: '"active"' } },
    ]);

    // $status uses the field sigil, but 'status' is a known variable (@status)
    const result = project.parseFEL('$status = "active"', { targetPath: '' });
    const sigilHint = result.warnings.find((w) => w.code === 'FEL_SIGIL_HINT');
    expect(sigilHint).toBeDefined();
    expect(sigilHint!.severity).toBe('warning');
    expect(sigilHint!.message).toContain('@status');
    expect(sigilHint!.message).toContain('$status');
  });

  it('does NOT emit FEL_SIGIL_HINT when $name is a known field', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'status' } },
    ]);

    const result = project.parseFEL('$status = "active"', { targetPath: 'status' });
    const sigilHint = result.warnings.find((w) => w.code === 'FEL_SIGIL_HINT');
    expect(sigilHint).toBeUndefined();
  });

  it('does NOT emit FEL_SIGIL_HINT when $name is unknown to both fields and variables', () => {
    const project = createRawProject();
    const result = project.parseFEL('$ghost = 1', { targetPath: '' });
    const sigilHint = result.warnings.find((w) => w.code === 'FEL_SIGIL_HINT');
    expect(sigilHint).toBeUndefined();
  });

  it('emits FEL_TYPE_MISMATCH warning when comparing date field to number', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'start_date', dataType: 'date' } },
    ]);

    const result = project.parseFEL('$start_date > 100', { targetPath: '' });
    const typeMismatch = result.warnings.find((w) => w.code === 'FEL_TYPE_MISMATCH');
    expect(typeMismatch).toBeDefined();
    expect(typeMismatch!.severity).toBe('warning');
    expect(typeMismatch!.message).toContain('Date');
  });

  it('emits FEL_TYPE_MISMATCH warning when comparing money field to plain number', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'revenue', dataType: 'money' } },
    ]);

    const result = project.parseFEL('$revenue > 1000', { targetPath: '' });
    const typeMismatch = result.warnings.find((w) => w.code === 'FEL_TYPE_MISMATCH');
    expect(typeMismatch).toBeDefined();
    expect(typeMismatch!.severity).toBe('warning');
  });

  it('does NOT emit FEL_TYPE_MISMATCH for same-type comparison', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'age', dataType: 'integer' } },
    ]);

    const result = project.parseFEL('$age > 18', { targetPath: '' });
    const typeMismatch = result.warnings.find((w) => w.code === 'FEL_TYPE_MISMATCH');
    expect(typeMismatch).toBeUndefined();
  });

  // ── U6: "did you mean" for partial path matches in repeat context ──

  it('suggests full path when bare field name matches a nested field', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'rows', repeatable: true } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'quantity', parentPath: 'rows', dataType: 'integer' } },
    ]);

    const result = project.parseFEL('$quantity > 0', { targetPath: 'rows[0].quantity' });
    expect(result.valid).toBe(false);
    const ref = result.errors.find((e) => e.code === 'FEL_UNKNOWN_REFERENCE');
    expect(ref).toBeDefined();
    expect(ref!.message).toContain('Did you mean "$rows.quantity"?');
  });

  it('suggests multiple paths when bare field name matches several nested fields', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'rows', repeatable: true } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'amount', parentPath: 'rows', dataType: 'decimal' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'extras' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'amount', parentPath: 'extras', dataType: 'decimal' } },
    ]);

    const result = project.parseFEL('$amount > 0', { targetPath: 'rows[0].amount' });
    expect(result.valid).toBe(false);
    const ref = result.errors.find((e) => e.code === 'FEL_UNKNOWN_REFERENCE');
    expect(ref).toBeDefined();
    expect(ref!.message).toContain('Did you mean one of:');
    expect(ref!.message).toContain('$rows.amount');
    expect(ref!.message).toContain('$extras.amount');
  });

  it('does not suggest paths when no partial match exists', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', dataType: 'string' } },
    ]);

    const result = project.parseFEL('$nonexistent > 0', { targetPath: '' });
    expect(result.valid).toBe(false);
    const ref = result.errors.find((e) => e.code === 'FEL_UNKNOWN_REFERENCE');
    expect(ref).toBeDefined();
    expect(ref!.message).not.toContain('Did you mean');
  });

  // ── U12: fuzzy match for unknown function names ──

  it('suggests close function names via prefix and edit distance', () => {
    const project = createRawProject();
    const result = project.parseFEL('len($x)');
    const fnWarn = result.warnings.find((w) => w.code === 'FEL_UNKNOWN_FUNCTION');
    expect(fnWarn).toBeDefined();
    // "len" matches "length" via prefix and "min" via edit distance
    expect(fnWarn!.message).toContain('Did you mean');
    expect(fnWarn!.message).toContain('length()');
  });

  it('suggests close function name via edit distance', () => {
    const project = createRawProject();
    const result = project.parseFEL('cunt($x)');
    const fnWarn = result.warnings.find((w) => w.code === 'FEL_UNKNOWN_FUNCTION');
    expect(fnWarn).toBeDefined();
    expect(fnWarn!.message).toContain('count()');
  });

  it('does not suggest when no function name is close', () => {
    const project = createRawProject();
    const result = project.parseFEL('totallyFake($x)');
    const fnWarn = result.warnings.find((w) => w.code === 'FEL_UNKNOWN_FUNCTION');
    expect(fnWarn).toBeDefined();
    expect(fnWarn!.message).not.toContain('Did you mean');
  });
});

describe('traceFEL', () => {
  it('returns value, diagnostics, and an ordered trace of evaluation steps', () => {
    const project = createRawProject();
    const result = project.traceFEL('$a + $b', { a: 3, b: 4 });

    expect(result.value).toBe(7);
    expect(result.diagnostics).toEqual([]);
    expect(result.trace).toHaveLength(3);
    expect(result.trace[0]).toMatchObject({ kind: 'FieldResolved', path: 'a', value: 3 });
    expect(result.trace[1]).toMatchObject({ kind: 'FieldResolved', path: 'b', value: 4 });
    expect(result.trace[2]).toMatchObject({ kind: 'BinaryOp', op: '+', result: 7 });
  });

  it('records IfBranch with the branch taken', () => {
    const project = createRawProject();
    const result = project.traceFEL("if($x > 0, 'pos', 'neg')", { x: 5 });
    const branch = result.trace.find((s) => s.kind === 'IfBranch');
    expect(branch).toBeDefined();
    expect(branch).toMatchObject({ kind: 'IfBranch', branch_taken: 'then' });
  });

  it('emits ShortCircuit step for `false and $undef` and skips the right side', () => {
    const project = createRawProject();
    const result = project.traceFEL('false and $undefined', {});
    const short = result.trace.find((s) => s.kind === 'ShortCircuit');
    expect(short).toBeDefined();
    expect(short).toMatchObject({ kind: 'ShortCircuit', op: 'and' });
    const rightResolved = result.trace.find(
      (s) => s.kind === 'FieldResolved' && (s as { path: string }).path === 'undefined',
    );
    expect(rightResolved).toBeUndefined();
  });
});

// ── Extension queries ──────────────────────────────────────────

describe('listRegistries', () => {
  it('returns loaded registries with entry counts', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test-registry',
          entries: [
            { name: 'ext1', category: 'dataType' },
            { name: 'ext2', category: 'function' },
          ],
        },
      },
    });

    const list = project.listRegistries();
    expect(list).toHaveLength(1);
    expect(list[0].url).toBe('urn:test-registry');
    expect(list[0].entryCount).toBe(2);
  });
});

describe('browseExtensions', () => {
  it('returns all entries when no filter', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test-registry',
          entries: [
            { name: 'ext1', category: 'dataType', status: 'stable' },
            { name: 'ext2', category: 'function', status: 'draft' },
          ],
        },
      },
    });

    expect(project.browseExtensions()).toHaveLength(2);
  });

  it('filters by category', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test-registry',
          entries: [
            { name: 'ext1', category: 'dataType', status: 'stable' },
            { name: 'ext2', category: 'function', status: 'stable' },
          ],
        },
      },
    });

    const results = project.browseExtensions({ category: 'function' });
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('ext2');
  });
});

// ── Versioning queries ────────────────────────────────────────

describe('diffFromBaseline', () => {
  it('detects added items', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name', label: 'Name' } });

    const changes = project.diffFromBaseline();
    expect(changes.length).toBeGreaterThan(0);
    const added = changes.find(c => c.type === 'added' && c.path === 'name');
    expect(added).toBeDefined();
    expect(added!.target).toBe('item');
    expect(added!.impact).toBe('compatible');
  });

  it('detects removed items', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0', url: 'urn:test', version: '1.0.0', title: '',
          items: [{ type: 'field', key: 'old', dataType: 'string' }],
        },
      },
    });

    // baseline has 'old'; now delete it
    project.dispatch({ type: 'definition.deleteItem', payload: { path: 'old' } });

    const changes = project.diffFromBaseline();
    const removed = changes.find(c => c.type === 'removed' && c.path === 'old');
    expect(removed).toBeDefined();
    expect(removed!.impact).toBe('breaking');
  });

  it('detects renamed items as renamed changes', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:test',
          version: '1.0.0',
          title: 'Test',
          items: [{ type: 'field', key: 'name', label: 'Name', dataType: 'string' }],
        },
      },
    });

    project.dispatch({ type: 'definition.renameItem', payload: { path: 'name', newKey: 'fullName' } });
    const changes = project.diffFromBaseline();
    expect(changes.some((change) => change.type === 'renamed' && change.path === 'name')).toBe(true);
  });

  it('detects moved items as moved changes', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:test',
          version: '1.0.0',
          title: 'Test',
          items: [
            {
              type: 'group',
              key: 'a',
              label: 'A',
              children: [{ type: 'field', key: 'f', label: 'F', dataType: 'string' }],
            },
            { type: 'group', key: 'b', label: 'B', children: [] },
          ],
        },
      },
    });

    project.dispatch({ type: 'definition.moveItem', payload: { sourcePath: 'a.f', targetParentPath: 'b' } });
    const changes = project.diffFromBaseline();
    expect(changes.some((change) => change.type === 'moved' && change.path === 'a.f')).toBe(true);
  });

  it('detects same-path item modifications', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:test',
          version: '1.0.0',
          title: 'Test',
          items: [{ type: 'field', key: 'name', label: 'Name', dataType: 'string' }],
        },
      },
    });

    project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'name', property: 'label', value: 'Full Name' },
    });
    const changes = project.diffFromBaseline();
    expect(changes.some((change) => change.type === 'modified' && change.path === 'name')).toBe(true);
  });
});

describe('previewChangelog', () => {
  it('generates a changelog preview without committing', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });

    const changelog = project.previewChangelog();
    expect(changelog.definitionUrl).toBe(project.definition.url);
    expect(changelog.fromVersion).toBeDefined();
    expect(changelog.toVersion).toBe(project.definition.version);
    expect(changelog.changes.length).toBeGreaterThan(0);
    expect(['breaking', 'compatible', 'cosmetic']).toContain(changelog.semverImpact);
  });
});

describe('export', () => {
  it('serializes all four artifacts', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.setFormTitle', payload: { title: 'Export Test' } });

    const bundle = project.export();

    expect(bundle.definition).toBeDefined();
    expect(bundle.definition.title).toBe('Export Test');
    expect(bundle.component).toBeDefined();
    expect(bundle.theme).toBeDefined();
    expect(bundle.mappings).toBeDefined();
  });

  it('returns independent copies (not references)', () => {
    const project = createRawProject();
    const bundle = project.export();

    bundle.definition.title = 'Mutated';
    expect(project.definition.title).not.toBe('Mutated');
  });

  it('exports the effective component tree for MCP-built forms (no authored tree)', () => {
    const project = createRawProject();
    // Simulate MCP-style form building: add fields via dispatch, never providing an authored component
    project.dispatch({ type: 'definition.addItem', payload: { item: { type: 'string', name: 'first_name', label: 'First Name' } } });
    project.dispatch({ type: 'definition.addItem', payload: { item: { type: 'string', name: 'last_name', label: 'Last Name' } } });

    const bundle = project.export();

    // The generated tree should be present, not null
    expect(bundle.component.tree).not.toBeNull();
    expect(bundle.component.tree).toBeDefined();
  });

  it('exports the authored component tree when one is present', () => {
    const authoredTree = { type: 'Stack', children: [{ type: 'TextField', ref: 'name' }] };
    const project = createRawProject({
      seed: {
        component: {
          $formspecComponent: '1.0',
          version: '0.1.0',
          targetDefinition: { url: 'urn:test:authored' },
          tree: authoredTree as any,
        },
      },
    });

    const bundle = project.export();

    expect(bundle.component.tree).toBeDefined();
    expect((bundle.component.tree as any).component).toBe('Stack');
  });

  it('exports a clean component document envelope', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { item: { type: 'string', name: 'email', label: 'Email' } } });

    const bundle = project.export();

    expect((bundle.component as any)['x-studio-generated']).toBeUndefined();
    expect((bundle.component as any).$formspecComponent).toBe('1.0');
    expect((bundle.component as any).version).toBe('0.1.0');
  });
});
