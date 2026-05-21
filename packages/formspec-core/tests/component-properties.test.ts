import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

function setupWithNode() {
  const project = createRawProject();
  const result = project.dispatch({
    type: 'component.addNode',
    payload: { parent: { nodeId: 'root' }, component: 'Card', props: { title: 'Test' } },
  }) as any;
  return { project, nodeRef: result.nodeRef };
}

describe('component.setNodeProperty', () => {
  it('sets a property on a node', () => {
    const { project, nodeRef } = setupWithNode();

    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: nodeRef, property: 'title', value: 'Updated' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].title).toBe('Updated');
  });
});

describe('component.setNodeType', () => {
  it('changes a node component type', () => {
    const { project, nodeRef } = setupWithNode();

    project.dispatch({
      type: 'component.setNodeType',
      payload: { node: nodeRef, component: 'Collapsible' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].component).toBe('Collapsible');
  });
});

describe('component.setNodeStyle', () => {
  it('sets a style property', () => {
    const { project, nodeRef } = setupWithNode();

    project.dispatch({
      type: 'component.setNodeStyle',
      payload: { node: nodeRef, property: 'backgroundColor', value: '#fff' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].style.backgroundColor).toBe('#fff');
  });

  it('removes a style property with null', () => {
    const { project, nodeRef } = setupWithNode();

    project.dispatch({
      type: 'component.setNodeStyle',
      payload: { node: nodeRef, property: 'color', value: 'red' },
    });
    project.dispatch({
      type: 'component.setNodeStyle',
      payload: { node: nodeRef, property: 'color', value: null },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].style?.color).toBeUndefined();
  });
});

describe('component.setNodeAccessibility', () => {
  it('sets an accessibility property', () => {
    const { project, nodeRef } = setupWithNode();

    project.dispatch({
      type: 'component.setNodeAccessibility',
      payload: { node: nodeRef, property: 'role', value: 'region' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].accessibility?.role).toBe('region');
  });
});

describe('component.spliceArrayProp', () => {
  it('inserts elements into an array prop', () => {
    const { project, nodeRef } = setupWithNode();

    // Set initial array
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: nodeRef, property: 'items', value: ['a', 'c'] },
    });

    project.dispatch({
      type: 'component.spliceArrayProp',
      payload: { node: nodeRef, property: 'items', index: 1, deleteCount: 0, insert: ['b'] },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].items).toEqual(['a', 'b', 'c']);
  });
});

describe('component.setFieldWidget', () => {
  it('sets widget on a bound field', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'name' },
    });

    project.dispatch({
      type: 'component.setFieldWidget',
      payload: { fieldKey: 'name', widget: 'NumberInput' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].component).toBe('NumberInput');
  });
});

describe('component.setResponsiveOverride', () => {
  it('sets a responsive override for a breakpoint', () => {
    const { project, nodeRef } = setupWithNode();

    project.dispatch({
      type: 'component.setResponsiveOverride',
      payload: { node: nodeRef, breakpoint: 'sm', patch: { columns: 1 } },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].responsive?.sm).toEqual({ columns: 1 });
  });

  it('removes an override with null patch', () => {
    const { project, nodeRef } = setupWithNode();

    project.dispatch({
      type: 'component.setResponsiveOverride',
      payload: { node: nodeRef, breakpoint: 'sm', patch: { columns: 1 } },
    });
    project.dispatch({
      type: 'component.setResponsiveOverride',
      payload: { node: nodeRef, breakpoint: 'sm', patch: null },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].responsive?.sm).toBeUndefined();
  });
});

describe('component.setGroupRepeatable', () => {
  it('sets repeatable flag on a group component', () => {
    const project = createRawProject();
    // addItem auto-creates a Stack node via tree sync
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'items' } });

    project.dispatch({
      type: 'component.setGroupRepeatable',
      payload: { groupKey: 'items', repeatable: true },
    });

    const node = project.componentFor('items') as any;
    expect(node.repeatable).toBe(true);
  });
});

describe('component.setGroupDisplayMode', () => {
  it('sets display mode on a group', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'items' } });
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack', bind: 'items' },
    });

    project.dispatch({
      type: 'component.setGroupDisplayMode',
      payload: { groupKey: 'items', mode: 'dataTable' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].displayMode).toBe('dataTable');
  });
});

describe('component.setGroupDataTable', () => {
  it('sets data table config', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'items' } });
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack', bind: 'items' },
    });

    project.dispatch({
      type: 'component.setGroupDataTable',
      payload: { groupKey: 'items', config: { columns: ['name', 'amount'] } },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].dataTableConfig).toEqual({ columns: ['name', 'amount'] });
  });
});

// --- Custom Components ---

describe('component.registerCustom', () => {
  it('registers a custom component', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'component.registerCustom',
      payload: {
        name: 'AddressBlock',
        params: { showZip: { type: 'boolean', default: true } },
        tree: { component: 'Stack', children: [] },
      },
    });

    expect((project.component as any).components?.AddressBlock).toBeDefined();
  });
});

describe('component.updateCustom', () => {
  it('updates an existing custom component', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'component.registerCustom',
      payload: { name: 'MyComp', params: {}, tree: { component: 'Stack' } },
    });

    project.dispatch({
      type: 'component.updateCustom',
      payload: { name: 'MyComp', params: { color: { type: 'string' } } },
    });

    expect((project.component as any).components?.MyComp.params).toHaveProperty('color');
  });
});

describe('component.deleteCustom', () => {
  it('removes a custom component', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'component.registerCustom',
      payload: { name: 'Temp', params: {}, tree: { component: 'Stack' } },
    });

    project.dispatch({
      type: 'component.deleteCustom',
      payload: { name: 'Temp' },
    });

    expect((project.component as any).components?.Temp).toBeUndefined();
  });
});

describe('component.renameCustom', () => {
  it('renames a custom component and rewrites tree references', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'component.registerCustom',
      payload: { name: 'OldName', params: {}, tree: { component: 'Stack' } },
    });

    // Use it in the tree
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'OldName' },
    });

    project.dispatch({
      type: 'component.renameCustom',
      payload: { name: 'OldName', newName: 'NewName' },
    });

    expect((project.component as any).components?.OldName).toBeUndefined();
    expect((project.component as any).components?.NewName).toBeDefined();

    const tree = project.component.tree as any;
    expect(tree.children[0].component).toBe('NewName');
  });
});

// --- Document-Level ---

describe('component.setToken', () => {
  it('sets a Tier 3 design token', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'component.setToken',
      payload: { key: 'color.primary', value: '#007bff' },
    });

    expect((project.component as any).tokens?.['color.primary']).toBe('#007bff');
  });

  it('removes a token with null', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'component.setToken',
      payload: { key: 'color.primary', value: '#007bff' },
    });
    project.dispatch({
      type: 'component.setToken',
      payload: { key: 'color.primary', value: null },
    });

    expect((project.component as any).tokens?.['color.primary']).toBeUndefined();
  });
});

describe('component.setBreakpoint', () => {
  it('sets a breakpoint', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'component.setBreakpoint',
      payload: { name: 'sm', minWidth: 640 },
    });

    expect((project.component as any).breakpoints?.sm).toBe(640);
  });
});

describe('component.setDocumentProperty', () => {
  it('sets a document-level property', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'component.setDocumentProperty',
      payload: { property: 'title', value: 'My Component Doc' },
    });

    expect((project.component as any).title).toBe('My Component Doc');
  });
});
