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
import { createRawProject, componentDocumentIsDerived } from '../src/index.js';
import { widgetTokenToComponent, KNOWN_COMPONENT_TYPES, COMPATIBILITY_MATRIX } from '@formspec-org/types';

/**
 * Export the component tree. export() omits a component document the Definition alone
 * generates, so an authored root override keeps the tree exported for inspection.
 */
function exportAuthoredTree(project: ReturnType<typeof createRawProject>): any {
  project.dispatch({
    type: 'component.setNodeProperty',
    payload: { node: { nodeId: 'root' }, property: 'gap', value: '$token.space.md' },
  });
  return project.export().component!.tree;
}

/** In-memory tree structure Studio shows: component, bind, layout-wrapper flag — no session ids. */
function treeShape(node: any): unknown {
  return {
    component: node.component,
    ...(node.bind ? { bind: node.bind } : {}),
    ...(node._layout ? { layout: true } : {}),
    ...(node.children ? { children: node.children.map(treeShape) } : {}),
  };
}

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
    const tree = bundle.component!.tree as any;

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

    const tree = exportAuthoredTree(project);

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

    const tree = exportAuthoredTree(project);

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

    const tree = exportAuthoredTree(project);

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

    const tree = exportAuthoredTree(project);

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
    return exportAuthoredTree(project);
  }

  it('repeatable group nested in a plain group binds its children relative to the repeat instance', () => {
    const tree = exportTree([
      {
        type: 'group', key: 'retirement', label: 'Retirement',
        children: [
          { type: 'display', key: 'intro', label: 'About retirement' },
          {
            type: 'group', key: 'employersOnRecord', label: 'Employers', repeatable: true,
            children: [
              { type: 'field', key: 'payerName', label: 'Payer', dataType: 'string' },
              { type: 'display', key: 'payerNote', label: 'Payer {{$payerName}}' },
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
    expect(retirement.children[0]).toMatchObject({ component: 'Text', bind: 'retirement.intro' });
    expect(retirement.children[0]).not.toHaveProperty('nodeId');
    const repeat = retirement.children[1];
    expect(repeat).toMatchObject({ component: 'Accordion', bind: 'retirement.employersOnRecord' });
    // Renderers resolve these under `retirement.employersOnRecord[i].`.
    expect(repeat.children[0].bind).toBe('payerName');
    expect(repeat.children[1]).toMatchObject({ component: 'Text', bind: 'payerNote' });
    const address = repeat.children[2];
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

// ── Derived component document (component-spec §1.2: Tier 3 overrides the theme) ──

describe('componentDocumentIsDerived', () => {
  function projectWithItems() {
    return createRawProject({
      seed: {
        definition: {
          $formspec: '1.0', url: 'urn:derived', version: '1.0.0', status: 'draft', title: 'T',
          items: [
            { type: 'field', key: 'color', label: 'Color', dataType: 'choice', options: [{ value: 'r', label: 'Red' }] },
            { type: 'field', key: 'agree', label: 'Agree', dataType: 'boolean' },
            { type: 'display', key: 'intro', label: 'Welcome' },
            {
              type: 'group', key: 'jobs', label: 'Jobs', repeatable: true,
              children: [{ type: 'field', key: 'hours', label: 'Hours', dataType: 'integer' }],
            },
          ],
        } as any,
      },
    });
  }

  it('is true for a blank project and for the tree generated from the definition', () => {
    expect(componentDocumentIsDerived(createRawProject().state)).toBe(true);
    const project = projectWithItems();
    expect(project.state.component.tree).toBeDefined();
    expect(componentDocumentIsDerived(project.state)).toBe(true);
  });

  it('is true for a saved tree whose display nodes predate display binds', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0', url: 'urn:legacy', version: '1.0.0', status: 'draft', title: 'T',
          items: [{ type: 'display', key: 'intro', label: 'Welcome' }],
        } as any,
        component: {
          tree: { component: 'Stack', nodeId: 'root', children: [{ component: 'Text', nodeId: 'intro', text: 'Welcome' }] },
        } as any,
      },
    });
    expect(componentDocumentIsDerived(project.state)).toBe(true);
  });

  it('stays true through definition edits that only regenerate the tree', () => {
    const project = projectWithItems();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'notes', dataType: 'text' } });
    project.dispatch({ type: 'definition.setItemProperty', payload: { path: 'color', property: 'label', value: 'Colour' } });
    expect(componentDocumentIsDerived(project.state)).toBe(true);
  });

  it('is false once a widget is chosen in the component tree', () => {
    const project = projectWithItems();
    project.dispatch({ type: 'component.setNodeType', payload: { node: { bind: 'color' }, component: 'RadioGroup' } });
    expect(componentDocumentIsDerived(project.state)).toBe(false);
  });

  it('is false once a schema property is authored on a node', () => {
    const project = projectWithItems();
    project.dispatch({ type: 'component.setNodeProperty', payload: { node: { bind: 'agree' }, property: 'onLabel', value: 'Yes' } });
    expect(componentDocumentIsDerived(project.state)).toBe(false);
  });

  it('is false once a layout container is added', () => {
    const project = projectWithItems();
    project.dispatch({ type: 'component.addNode', payload: { parent: { nodeId: 'root' }, component: 'Card' } });
    expect(componentDocumentIsDerived(project.state)).toBe(false);
  });

  it('is false once document-level content is authored', () => {
    const project = projectWithItems();
    project.dispatch({ type: 'component.setToken', payload: { key: 'space.md', value: '12px' } });
    expect(componentDocumentIsDerived(project.state)).toBe(false);
  });

  it('export omits a derived component document, so theme widget selection applies', () => {
    const project = projectWithItems();
    expect(project.export()).not.toHaveProperty('component');
    expect(createRawProject().export()).not.toHaveProperty('component');
  });

  it('export keeps a component document that carries an authored layout change', () => {
    const project = projectWithItems();
    project.dispatch({ type: 'component.setNodeType', payload: { node: { bind: 'color' }, component: 'RadioGroup' } });
    const component = project.export().component;
    expect(component).toMatchObject({ $formspecComponent: '1.0', targetDefinition: { url: 'urn:derived' } });
    expect(JSON.stringify(component!.tree)).toContain('"RadioGroup"');
  });

  it('export cost stays linear in the item count', () => {
    // Bound: item lookup once per export, not one WASM round trip of the whole item
    // tree per bound node (was 7.5 s derived / 12.3 s authored at this size).
    const items = Array.from({ length: 2000 }, (_, i) => ({ type: 'field', key: `f${i}`, label: `F${i}`, dataType: 'string' }));
    const project = createRawProject({
      seed: { definition: { $formspec: '1.0', url: 'urn:perf', version: '1.0.0', status: 'draft', title: 'T', items } as any },
    });
    const time = (fn: () => void) => { const t = performance.now(); fn(); return performance.now() - t; };

    expect(time(() => expect(project.export()).not.toHaveProperty('component'))).toBeLessThan(1000);
    project.dispatch({ type: 'component.setNodeType', payload: { node: { bind: 'f0' }, component: 'Textarea' } });
    expect(time(() => expect(project.export()).toHaveProperty('component'))).toBeLessThan(1000);
  });

  it('bindFor over every field stays linear in the bind count', () => {
    // A check that reads each field's merged bind (Form Health coverage) re-runs on every state
    // change. The unit is one scan of every bind — what each lookup paid (O(fields × binds));
    // timed under the same load as the lookups, so machine load cancels out.
    const items = Array.from({ length: 2000 }, (_, i) => ({ type: 'field', key: `f${i}`, label: `F${i}`, dataType: 'string' }));
    const binds = items.map(item => ({ path: item.key, required: 'true' }));
    const project = createRawProject({
      seed: { definition: { $formspec: '1.0', url: 'urn:perf', version: '1.0.0', status: 'draft', title: 'T', items, binds } as any },
    });
    expect(items.every(item => project.bindFor(item.key)?.required === 'true')).toBe(true);

    const fastest = (fn: () => void) => Math.min(...[0, 1, 2].map(() => {
      const start = performance.now();
      fn();
      return performance.now() - start;
    }));
    const unit = fastest(() => binds.filter(bind => bind.path.replace(/\[\*\]/g, '') === 'f0'));
    const elapsed = fastest(() => { for (const item of items) project.bindFor(item.key); });
    expect(elapsed).toBeLessThan(Math.max(items.length / 20 * unit, 10));
  });
});

// ── Export → import inverts the export bind transform ──────────────

describe('export → import → export round trip keeps an authored component document', () => {
  const definition = {
    $formspec: '1.0', url: 'urn:round-trip', version: '1.0.0', status: 'draft', title: 'T',
    items: [
      { type: 'display', key: 'intro', label: 'Welcome' },
      { type: 'field', key: 'name', label: 'Name', dataType: 'string' },
      {
        type: 'group', key: 'g', label: 'G',
        children: [
          { type: 'field', key: 'c', label: 'C', dataType: 'choice', options: [{ value: 'a', label: 'A' }] },
          { type: 'display', key: 'note', label: 'Note' },
          { type: 'group', key: 'h', label: 'H', children: [{ type: 'field', key: 'deep', label: 'Deep', dataType: 'string' }] },
        ],
      },
      {
        type: 'group', key: 'jobs', label: 'Jobs', repeatable: true,
        children: [
          { type: 'field', key: 'title', label: 'Title', dataType: 'string' },
          { type: 'display', key: 'jobNote', label: 'Job {{$title}}' },
        ],
      },
      {
        type: 'group', key: 'work', label: 'Work',
        children: [{
          type: 'group', key: 'employers', label: 'Employers', repeatable: true,
          children: [
            { type: 'field', key: 'payer', label: 'Payer', dataType: 'string' },
            { type: 'group', key: 'addr', label: 'Address', children: [{ type: 'field', key: 'city', label: 'City', dataType: 'string' }] },
          ],
        }],
      },
    ],
  };

  function authoredProject() {
    const project = createRawProject({ seed: { definition: structuredClone(definition) as any } });
    project.batch([
      { type: 'component.setNodeProperty', payload: { node: { nodeId: 'root' }, property: 'gap', value: '$token.space.md' } },
      { type: 'component.setNodeType', payload: { node: { bind: 'c' }, component: 'RadioGroup' } },
      { type: 'component.setNodeType', payload: { node: { bind: 'deep' }, component: 'Textarea' } },
      { type: 'component.setNodeType', payload: { node: { bind: 'title' }, component: 'Textarea' } },
      { type: 'component.setNodeType', payload: { node: { bind: 'city' }, component: 'Textarea' } },
      { type: 'component.setNodeProperty', payload: { node: { bind: 'payer' }, property: 'placeholder', value: 'Payer name' } },
      { type: 'component.wrapNode', payload: { node: { bind: 'name' }, wrapper: { component: 'Card' } } },
      { type: 'component.wrapNode', payload: { node: { nodeId: 'note' }, wrapper: { component: 'Collapsible', props: { title: 'More' } } } },
      // A wrapper directly around a group's container: export cannot tell the two apart.
      { type: 'component.wrapNode', payload: { node: { bind: 'work' }, wrapper: { component: 'Card', props: { title: 'Work' } } } },
    ] as any);
    return project;
  }

  it('import restores the authored nodes inside plain groups, nested groups and repeats', () => {
    const exported = authoredProject().export();
    const imported = createRawProject();
    imported.dispatch({ type: 'project.import', payload: exported });

    expect(imported.componentFor('c')!.component).toBe('RadioGroup');
    expect(imported.componentFor('deep')!.component).toBe('Textarea');
    expect(imported.componentFor('title')!.component).toBe('Textarea');
    expect(imported.componentFor('city')!.component).toBe('Textarea');
    expect(componentDocumentIsDerived(imported.state)).toBe(false);
    expect(imported.export().component).toEqual(exported.component);
  });

  it('a seeded exported component document re-exports unchanged', () => {
    const exported = authoredProject().export();
    const seeded = createRawProject({
      seed: { definition: exported.definitions[0], component: exported.component } as any,
    });
    expect(seeded.export().component).toEqual(exported.component);
  });

  it('a hand-authored dotted bind with no group container re-exports under its group', () => {
    const imported = createRawProject();
    imported.dispatch({
      type: 'project.import',
      payload: {
        definitions: [structuredClone(definition)],
        component: {
          $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:round-trip' },
          tree: { component: 'Stack', children: [{ component: 'RadioGroup', bind: 'g.c' }] },
        },
      } as any,
    });
    const tree = imported.export().component!.tree as any;
    const group = tree.children.find((n: any) => n.children?.some((c: any) => c.bind === 'g.c'));
    expect(group.children.find((c: any) => c.bind === 'g.c').component).toBe('RadioGroup');
  });

  it('import rebuilds the in-memory tree Studio authored, wrappers and group nodes alike', () => {
    const original = authoredProject();
    const imported = createRawProject();
    imported.dispatch({ type: 'project.import', payload: original.export() });
    expect(treeShape(imported.state.component.tree)).toEqual(treeShape(original.state.component.tree));
  });

  it('a group node wrapping its children in a container keeps the group outermost', () => {
    const project = createRawProject({ seed: { definition: structuredClone(definition) as any } });
    project.batch([
      { type: 'component.setNodeProperty', payload: { node: { nodeId: 'root' }, property: 'gap', value: '$token.space.md' } },
      { type: 'component.wrapSiblingNodes', payload: { nodes: [{ bind: 'c' }, { nodeId: 'note' }, { bind: 'h' }], wrapper: { component: 'Grid' } } },
    ] as any);
    const imported = createRawProject();
    imported.dispatch({ type: 'project.import', payload: project.export() });
    expect(treeShape(imported.state.component.tree)).toEqual(treeShape(project.state.component.tree));
  });

  it('a wrapper and a group node of the same generated shape nest in the order the Definition needs', () => {
    // Card(wrapper) > Stack(g) > Stack(h) > deep and Card(g) > Stack(h) > deep export differently
    // (one Stack more); each must import with a node for both groups.
    const project = createRawProject({ seed: { definition: structuredClone(definition) as any } });
    project.batch([
      { type: 'component.setNodeProperty', payload: { node: { nodeId: 'root' }, property: 'gap', value: '$token.space.md' } },
      { type: 'component.setNodeType', payload: { node: { bind: 'g' }, component: 'Card' } },
    ] as any);
    const imported = createRawProject();
    imported.dispatch({ type: 'project.import', payload: project.export() });
    expect(treeShape(imported.state.component.tree)).toEqual(treeShape(project.state.component.tree));
    expect(imported.export().component).toEqual(project.export().component);
  });

  it('a group node given a non-generated component inside a wrapper of the generated one imports inverted', () => {
    // Pinned ambiguity: Stack(wrapper) > Card(g) exports exactly like Stack(g) > Card(wrapper),
    // and import prefers the node showing the group's generated component. Both re-export alike.
    const project = createRawProject({ seed: { definition: structuredClone(definition) as any } });
    project.batch([
      { type: 'component.setNodeProperty', payload: { node: { nodeId: 'root' }, property: 'gap', value: '$token.space.md' } },
      { type: 'component.setNodeType', payload: { node: { bind: 'g' }, component: 'Card' } },
      { type: 'component.wrapNode', payload: { node: { bind: 'g' }, wrapper: { component: 'Stack' } } },
    ] as any);
    const exported = project.export();
    const imported = createRawProject();
    imported.dispatch({ type: 'project.import', payload: exported });
    const shape = JSON.stringify(treeShape(imported.state.component.tree));
    expect(shape).toContain('{"component":"Stack","bind":"g","children":[{"component":"Card","layout":true');
    expect(imported.export().component).toEqual(exported.component);
  });

  function importTree(items: unknown[], tree: unknown) {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definitions: [{ $formspec: '1.0', url: 'urn:keys', version: '1.0.0', status: 'draft', title: 'T', items }],
        component: { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:keys' }, tree },
      } as any,
    });
    return project;
  }

  it('wrappers keep their nodes when a group key matches a display key in another group', () => {
    const tree = {
      component: 'Stack', gap: '$token.space.md', children: [
        { component: 'Stack', children: [
          { component: 'Card', children: [{ component: 'Text', bind: 'contact.notes', text: 'Notes' }] },
          { component: 'TextInput', bind: 'contact.email' },
        ] },
        { component: 'Card', children: [{ component: 'Stack', children: [{ component: 'TextInput', bind: 'notes.x' }] }] },
      ],
    };
    const project = importTree([
      { type: 'group', key: 'contact', label: 'C', children: [
        { type: 'display', key: 'notes', label: 'Notes' },
        { type: 'field', key: 'email', label: 'E', dataType: 'string' },
      ] },
      { type: 'group', key: 'notes', label: 'N', children: [{ type: 'field', key: 'x', label: 'X', dataType: 'string' }] },
    ], tree);
    expect(project.export().component!.tree).toEqual(tree);
  });

  it('wrappers around two groups sharing a key each keep their own group', () => {
    const tree = {
      component: 'Stack', gap: '$token.space.md', children: [
        { component: 'Stack', children: [{ component: 'Card', children: [{ component: 'Stack', children: [{ component: 'TextInput', bind: 'g1.addr.city' }] }] }] },
        { component: 'Stack', children: [{ component: 'Card', children: [{ component: 'Stack', children: [{ component: 'TextInput', bind: 'g2.addr.city' }] }] }] },
      ],
    };
    const addr = () => ({ type: 'group', key: 'addr', label: 'A', children: [{ type: 'field', key: 'city', label: 'City', dataType: 'string' }] });
    const project = importTree([
      { type: 'group', key: 'g1', label: 'G1', children: [addr()] },
      { type: 'group', key: 'g2', label: 'G2', children: [addr()] },
    ], tree);
    expect(project.export().component!.tree).toEqual(tree);
  });

  it('an empty layout container stays a wrapper beside a group whose fields the tree does not bind', () => {
    // component-spec §11.1 allows partial trees: `contact` has a field, so an empty Stack is not its node.
    const project = importTree([
      { type: 'field', key: 'name', label: 'Name', dataType: 'string' },
      { type: 'group', key: 'contact', label: 'C', children: [{ type: 'field', key: 'email', label: 'E', dataType: 'string' }] },
    ], { component: 'Stack', children: [{ component: 'TextInput', bind: 'name' }, { component: 'Stack', style: { height: '40px' }, children: [] }] });
    const spacer = (project.state.component.tree as any).children.find((n: any) => n.style?.height === '40px');
    expect(spacer).toMatchObject({ _layout: true, children: [] });
    expect(spacer.bind).toBeUndefined();
  });

  it('empty groups round-trip without gaining a wrapper, nested or not', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0', url: 'urn:empty', version: '1.0.0', status: 'draft', title: 'T',
          items: [
            { type: 'group', key: 'empty', label: 'Empty' },
            { type: 'field', key: 'name', label: 'Name', dataType: 'string' },
            {
              type: 'group', key: 'g', label: 'G',
              children: [
                { type: 'field', key: 'a', label: 'A', dataType: 'string' },
                { type: 'group', key: 'inner', label: 'Inner', children: [] },
              ],
            },
            // Holds no field or display, only an empty group: nothing in it binds.
            { type: 'group', key: 'outer', label: 'Outer', children: [{ type: 'group', key: 'hollow', label: 'Hollow' }] },
          ],
        } as any,
      },
    });
    project.batch([
      { type: 'component.setNodeProperty', payload: { node: { nodeId: 'root' }, property: 'gap', value: '$token.space.md' } },
      { type: 'component.wrapNode', payload: { node: { bind: 'outer' }, wrapper: { component: 'Card', props: { title: 'Outer' } } } },
    ] as any);
    const exported = project.export();

    const imported = createRawProject();
    imported.dispatch({ type: 'project.import', payload: exported });
    expect(imported.export().component).toEqual(exported.component);
    expect(treeShape(imported.state.component.tree)).toEqual(treeShape(project.state.component.tree));
  });

  it('a re-imported document keeps binding display nodes by nodeId, so Studio can address them', () => {
    const imported = createRawProject();
    imported.dispatch({ type: 'project.import', payload: authoredProject().export() });
    imported.dispatch({ type: 'component.setNodeProperty', payload: { node: { nodeId: 'jobNote' }, property: 'cssClass', value: 'muted' } });
    expect(JSON.stringify(imported.export().component!.tree)).toContain('"muted"');
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
    const tree = bundle.component!.tree as any;
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

    const tree = exportAuthoredTree(project);
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
    const tree = bundle.component!.tree as any;

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
    const tree = bundle.component!.tree as any;

    const checkNoNodeId = (node: any) => {
      expect(node).not.toHaveProperty('nodeId');
      for (const child of node.children ?? []) {
        checkNoNodeId(child);
      }
    };
    checkNoNodeId(tree);
  });
});
