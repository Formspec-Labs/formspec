import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

/** Get Section nodes from the component tree. */
function getPageNodes(project: ReturnType<typeof createRawProject>): any[] {
  const tree = project.component.tree;
  return (tree?.children ?? []).filter((c: any) => c.component === 'Section');
}

/** Get the nodeId of a Section page unit from the component tree. */
function getPageId(project: ReturnType<typeof createRawProject>, index = 0): string {
  const pages = getPageNodes(project);
  if (!pages[index]) throw new Error(`No page at index ${index}`);
  return pages[index].nodeId;
}

function addPage(project: ReturnType<typeof createRawProject>, title: string, id?: string): string {
  project.dispatch({
    type: 'definition.setFormPresentation',
    payload: { property: 'pageMode', value: 'wizard' },
  });
  const result = project.dispatch({
    type: 'component.addNode',
    payload: {
      parent: { nodeId: 'root' },
      component: 'Section',
      props: { ...(id ? { nodeId: id } : {}), title },
    },
  }) as any;
  return id ?? result.nodeRef.nodeId;
}

function placeOnPage(
  project: ReturnType<typeof createRawProject>,
  pageId: string,
  bind: string,
  props?: Record<string, unknown>,
) {
  project.dispatch({
    type: 'component.moveNode',
    payload: { source: { bind }, targetParent: { nodeId: pageId } },
  });
  for (const [property, value] of Object.entries(props ?? {})) {
    project.dispatch({
      type: 'component.setNodeProperty',
      payload: { node: { bind }, property, value },
    });
  }
}

// ── Post-dispatch normalization ─────────────────────────────────

describe('post-dispatch normalization', () => {
  it('syncs targetDefinition.url when definition.url changes', () => {
    const project = createRawProject();
    const originalUrl = project.definition.url;

    project.dispatch({
      type: 'definition.setDefinitionProperty',
      payload: { property: 'url', value: 'urn:formspec:new-url' },
    });

    expect(project.definition.url).toBe('urn:formspec:new-url');
    expect(project.component.targetDefinition?.url).toBe('urn:formspec:new-url');
    expect(project.theme.targetDefinition?.url).toBe('urn:formspec:new-url');
  });

  it('initializes versioning state if missing after import', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.import',
      payload: {
        definition: { $formspec: '1.0', url: 'urn:test', version: '1.0.0', title: 'Test', items: [] },
      },
    });

    expect(project.state.versioning).toBeDefined();
    expect(project.state.versioning.baseline).toBeDefined();
    expect(project.state.versioning.releases).toBeDefined();
  });
});

describe('renameItem — cross-artifact rewriting', () => {
  it('rewrites shape targets and constraint references', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'price' } },
      { type: 'definition.addShape', payload: { id: 's1', target: 'price', constraint: '$price > 0', message: 'M' } },
    ]);

    project.dispatch({ type: 'definition.renameItem', payload: { path: 'price', newKey: 'cost' } });

    const shapes = project.definition.shapes!;
    expect(shapes[0].target).toBe('cost');
    expect(shapes[0].constraint).toBe('$cost > 0');
  });

  it('rewrites variable expressions', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'qty' } },
      { type: 'definition.addVariable', payload: { name: 'total', expression: '$qty * 10' } },
    ]);

    project.dispatch({ type: 'definition.renameItem', payload: { path: 'qty', newKey: 'quantity' } });

    const vars = project.definition.variables!;
    expect(vars[0].expression).toBe('$quantity * 10');
  });

  it('rewrites component tree bind references', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'email' } },
      { type: 'component.addNode', payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'email' } },
    ]);

    project.dispatch({ type: 'definition.renameItem', payload: { path: 'email', newKey: 'contact_email' } });

    const node = project.componentFor('contact_email');
    expect(node).toBeDefined();
    expect(node!.bind).toBe('contact_email');
  });

  it('rewrites theme per-item override keys', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'total' } },
      { type: 'theme.setItemOverride', payload: { itemKey: 'total', property: 'widget', value: 'Slider' } },
    ]);

    project.dispatch({ type: 'definition.renameItem', payload: { path: 'total', newKey: 'sum' } });

    const theme = project.theme as any;
    expect(theme.items?.total).toBeUndefined();
    expect(theme.items?.sum?.widget).toBe('Slider');
  });

  it('rewrites mapping rule source paths', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name' } },
      { type: 'mapping.addRule', payload: { sourcePath: 'name', targetPath: 'output.name' } },
    ]);

    project.dispatch({ type: 'definition.renameItem', payload: { path: 'name', newKey: 'full_name' } });

    const mapping = project.mapping as any;
    expect(mapping.rules[0].sourcePath).toBe('full_name');
  });

  it('rewrites page child bind keys when item is renamed', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'phone' } });
    const page1Id = addPage(project, 'P1');
    addPage(project, 'P2');
    // Assign 'phone' to page 1
    placeOnPage(project, page1Id, 'phone', { layout: { grid: { span: 6 } } });

    project.dispatch({ type: 'definition.renameItem', payload: { path: 'phone', newKey: 'mobile' } });

    // Verify the component tree Section child bind was rewritten
    const pages = getPageNodes(project);
    const page1Children = pages[0].children;
    expect(page1Children.some((c: any) => c.bind === 'mobile')).toBe(true);
    expect(page1Children.some((c: any) => c.bind === 'phone')).toBe(false);
  });
});

describe('deleteItem — cross-artifact cleanup', () => {
  it('removes shapes targeting the deleted item', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'age' } },
      { type: 'definition.addShape', payload: { id: 's1', target: 'age', constraint: '$age > 0', message: 'M' } },
    ]);

    project.dispatch({ type: 'definition.deleteItem', payload: { path: 'age' } });
    expect(project.definition.shapes ?? []).toHaveLength(0);
  });

  it('removes theme per-item overrides for deleted item', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'total' } },
      { type: 'theme.setItemOverride', payload: { itemKey: 'total', property: 'widget', value: 'Slider' } },
    ]);

    project.dispatch({ type: 'definition.deleteItem', payload: { path: 'total' } });

    const theme = project.theme as any;
    expect(theme.items?.total).toBeUndefined();
  });

  it('removes orphaned page child nodes when item is deleted', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'addr' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'city' } });
    const pageId = addPage(project, 'P1');
    placeOnPage(project, pageId, 'addr', { layout: { grid: { span: 6 } } });
    placeOnPage(project, pageId, 'city', { layout: { grid: { span: 6 } } });

    project.dispatch({ type: 'definition.deleteItem', payload: { path: 'addr' } });

    // After reconcile, the Page should only contain 'city' (addr was deleted)
    const pages = getPageNodes(project);
    const pageChildren = pages[0].children;
    expect(pageChildren).toHaveLength(1);
    expect(pageChildren[0].bind).toBe('city');
  });
});

describe('renameInstance — FEL rewriting', () => {
  it('rewrites @instance references in bind expressions', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'f1' } },
      { type: 'definition.addInstance', payload: { name: 'lookup', source: 'https://api.example.com' } },
      { type: 'definition.setBind', payload: { path: 'f1', properties: { calculate: "@instance('lookup').value" } } },
    ]);

    project.dispatch({ type: 'definition.renameInstance', payload: { name: 'lookup', newName: 'data' } });

    const bind = project.definition.binds![0] as any;
    expect(bind.calculate).toBe("@instance('data').value");
  });
});
