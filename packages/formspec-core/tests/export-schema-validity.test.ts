/**
 * @filedesc Tests that exported bundles produce schema-valid documents.
 *
 * Covers BUG-12 through BUG-16 from the chaos test findings:
 * - BUG-12: Missing required `status` field on definition
 * - BUG-13: Phantom `Checkbox` component type (not in schema)
 * - BUG-14: `widgetHint` leaking onto exported component tree nodes
 * - BUG-15: (cascade of BUG-13 -- not separately tested)
 * - BUG-16: Authoring-only repeat props leaking onto exported tree nodes
 */
import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';
import { widgetTokenToComponent, KNOWN_COMPONENT_TYPES, COMPATIBILITY_MATRIX } from '@formspec-org/types';

// ── BUG-12: Default definition must include status ─────────────────

describe('BUG-12: definition status field', () => {
  it('new project definition includes status field', () => {
    const project = createRawProject();
    expect(project.definition.status).toBe('draft');
  });

  it('exported definition includes status field', () => {
    const project = createRawProject();
    const bundle = project.export();
    // ADR 0150 §5.2: definitions[] is plural; P0 single-element array.
    expect(bundle.definitions[0].status).toBe('draft');
  });

  it('seeded definition preserves provided status', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:test',
          version: '1.0.0',
          status: 'active',
          title: 'Test',
          items: [],
        } as any,
      },
    });
    expect(project.definition.status).toBe('active');
  });
});

// ── BUG-13: Checkbox is not a valid component schema type ──────────

describe('BUG-13: Checkbox phantom component type', () => {
  it('widgetTokenToComponent rejects removed checkbox alias', () => {
    const result = widgetTokenToComponent('checkbox');
    expect(result).toBeNull();
  });

  it('KNOWN_COMPONENT_TYPES does not contain Checkbox', () => {
    expect(KNOWN_COMPONENT_TYPES.has('Checkbox')).toBe(false);
  });

  it('boolean compatibility matrix does not include Checkbox', () => {
    const booleanWidgets = COMPATIBILITY_MATRIX['boolean'];
    expect(booleanWidgets).not.toContain('Checkbox');
  });

  it('reconciler uses Toggle for boolean field with checkbox hint', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: {
        type: 'field',
        key: 'agreed',
        dataType: 'boolean',
        presentation: { widgetHint: 'Toggle' },
      },
    });
    const node = project.componentFor('agreed');
    expect(node).toBeDefined();
    expect(node!.component).toBe('Toggle');
  });
});

// ── BUG-14: widgetHint must not appear on exported tree nodes ──────

describe('BUG-14: widgetHint must not leak to exported tree', () => {
  it('exported tree nodes do not have widgetHint property', () => {
    const project = createRawProject();
    // Add a field, then set a canonical multiline TextInput hint on its component node.
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'bio', dataType: 'string' },
    });
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: { bind: 'bio' }, property: 'widgetHint', value: 'TextInput' },
    });
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: { bind: 'bio' }, property: 'maxLines', value: 4 },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;

    // Walk all nodes and check none have widgetHint
    const checkNoWidgetHint = (node: any) => {
      expect(node).not.toHaveProperty('widgetHint');
      for (const child of node.children ?? []) {
        checkNoWidgetHint(child);
      }
    };
    checkNoWidgetHint(tree);
  });
});

// ── BUG-16: repeat group authoring props must not leak to export ───

describe('BUG-16: repeat group authoring props must not leak to export', () => {
  // Helper: walk tree to find any node matching a predicate
  function findNodeWhere(root: any, predicate: (n: any) => boolean): any {
    if (predicate(root)) return root;
    for (const c of root.children ?? []) {
      const found = findNodeWhere(c, predicate);
      if (found) return found;
    }
    return undefined;
  }

  it('exported tree nodes do not have repeatable property', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'group', key: 'items' },
    });
    project.dispatch({
      type: 'component.setGroupRepeatable',
      payload: { groupKey: 'items', repeatable: true },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;

    // After export, non-self-managed group containers lose their bind,
    // but the Accordion component should be there. Walk ALL nodes:
    const badNode = findNodeWhere(tree, (n: any) => n.repeatable !== undefined);
    expect(badNode).toBeUndefined();
  });

  it('exported tree nodes do not have displayMode property', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'group', key: 'items' },
    });
    project.dispatch({
      type: 'component.setGroupDisplayMode',
      payload: { groupKey: 'items', mode: 'dataTable' },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;

    const badNode = findNodeWhere(tree, (n: any) => n.displayMode !== undefined);
    expect(badNode).toBeUndefined();
  });

  it('exported tree nodes do not have addLabel/removeLabel', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'group', key: 'items' },
    });
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: { bind: 'items' }, property: 'addLabel', value: 'Add Row' },
    });
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: { bind: 'items' }, property: 'removeLabel', value: 'Remove' },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;

    const badAddLabel = findNodeWhere(tree, (n: any) => n.addLabel !== undefined);
    const badRemoveLabel = findNodeWhere(tree, (n: any) => n.removeLabel !== undefined);
    expect(badAddLabel).toBeUndefined();
    expect(badRemoveLabel).toBeUndefined();
  });

  it('exported tree nodes do not have dataTableConfig', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'group', key: 'items' },
    });
    project.dispatch({
      type: 'component.setGroupDataTable',
      payload: { groupKey: 'items', config: { columns: ['name'] } },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;

    const badNode = findNodeWhere(tree, (n: any) => n.dataTableConfig !== undefined);
    expect(badNode).toBeUndefined();
  });
});

// ── Repeat template binds (component-spec §4.4) ────────────────────

describe('export: repeat template children bind as flat item keys', () => {
  function exportTree(items: unknown[]): any {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0', url: 'urn:repeat-binds', version: '1.0.0', status: 'draft', title: 'T', items,
        } as any,
      },
    });
    // An authored override keeps the tree from being the derived default, so it exports.
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: { nodeId: 'root' }, property: 'gap', value: '$token.space.md' },
    });
    return project.export().component!.tree;
  }

  it('repeatable group nested in a plain group binds its children relative to the repeat instance', () => {
    const tree = exportTree([
      {
        type: 'group', key: 'retirement', label: 'Retirement',
        children: [
          {
            type: 'group', key: 'employersOnRecord', label: 'Employers', repeatable: true,
            children: [
              { type: 'field', key: 'payerName', label: 'Payer', dataType: 'string' },
              {
                type: 'group', key: 'address', label: 'Address',
                children: [{ type: 'field', key: 'city', label: 'City', dataType: 'string' }],
              },
            ],
          },
        ],
      },
    ]);

    // Plain group Stack: bind dropped, children carry the group prefix.
    const retirement = tree.children[0];
    expect(retirement.bind).toBeUndefined();
    const repeat = retirement.children[0];
    expect(repeat).toMatchObject({ component: 'Accordion', bind: 'retirement.employersOnRecord' });
    // Renderers resolve these under `retirement.employersOnRecord[i].`.
    expect(repeat.children[0].bind).toBe('payerName');
    const address = repeat.children[1];
    expect(address.bind).toBeUndefined();
    expect(address.children[0].bind).toBe('address.city');
  });

  it('repeatable group nested in a repeatable group binds by its own key', () => {
    const tree = exportTree([
      {
        type: 'group', key: 'households', label: 'Households', repeatable: true,
        children: [
          {
            type: 'group', key: 'members', label: 'Members', repeatable: true,
            children: [{ type: 'field', key: 'name', label: 'Name', dataType: 'string' }],
          },
        ],
      },
    ]);

    const outer = tree.children[0];
    expect(outer).toMatchObject({ component: 'Accordion', bind: 'households' });
    const inner = outer.children[0];
    expect(inner).toMatchObject({ component: 'Accordion', bind: 'members' });
    expect(inner.children[0].bind).toBe('name');
  });
});

// ── Mappings: schema requires rules minItems 1 ─────────────────────

describe('export: mappings without rules are omitted', () => {
  it('a new project exports no mapping documents', () => {
    const project = createRawProject();
    expect(project.export().mappings).toEqual({});
  });

  it('exports only the mappings that carry rules', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name', dataType: 'string' } });
    project.dispatch({ type: 'mapping.create', payload: { id: 'csv' } });
    project.dispatch({ type: 'mapping.addRule', payload: { mappingId: 'default', sourcePath: 'name', targetPath: 'applicant' } });

    const { mappings } = project.export();
    expect(Object.keys(mappings)).toEqual(['default']);
    expect(mappings.default.rules).toHaveLength(1);
  });
});

// ── Allowlist: only schema-valid properties survive export ──────────

describe('Export allowlist: only schema-valid properties survive', () => {
  it('schema-valid component properties survive export', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'name', dataType: 'string' },
    });
    // Set a schema-valid property (placeholder is valid on TextInput)
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: { bind: 'name' }, property: 'placeholder', value: 'Enter name' },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;
    const nameNode = tree.children?.find((c: any) => c.bind === 'name');
    expect(nameNode).toBeDefined();
    expect(nameNode.placeholder).toBe('Enter name');
  });

  it('arbitrary unknown properties are stripped on export', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'name', dataType: 'string' },
    });
    // Set an arbitrary non-schema property
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: { bind: 'name' }, property: 'fooBarBaz', value: 'junk' },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;
    const nameNode = tree.children?.find((c: any) => c.bind === 'name');
    expect(nameNode).toBeDefined();
    expect(nameNode).not.toHaveProperty('fooBarBaz');
  });

  it('_layout flag is stripped on export', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack' },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;

    const checkNoLayout = (node: any) => {
      expect(node).not.toHaveProperty('_layout');
      for (const child of node.children ?? []) {
        checkNoLayout(child);
      }
    };
    checkNoLayout(tree);
  });

  it('nodeId is stripped on export', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    });

    const bundle = project.export();
    const tree = bundle.component.tree as any;

    const checkNoNodeId = (node: any) => {
      expect(node).not.toHaveProperty('nodeId');
      for (const child of node.children ?? []) {
        checkNoNodeId(child);
      }
    };
    checkNoNodeId(tree);
  });
});
