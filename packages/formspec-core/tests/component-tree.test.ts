import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

function treeHasBind(node: unknown, bind: string): boolean {
  const n = node as { bind?: string; children?: unknown[] } | null | undefined;
  if (!n) return false;
  if (n.bind === bind) return true;
  for (const c of n.children ?? []) {
    if (treeHasBind(c, bind)) return true;
  }
  return false;
}

describe('component.reconcileFromDefinition', () => {
  it('recreates a bound field node removed by deleteNode', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'name', label: 'Name' },
    });
    expect(treeHasBind(project.component.tree, 'name')).toBe(true);

    project.dispatch({
      type: 'component.deleteNode',
      payload: { node: { bind: 'name' } },
    });
    expect(treeHasBind(project.component.tree, 'name')).toBe(false);

    project.dispatch({ type: 'component.reconcileFromDefinition', payload: {} });
    expect(treeHasBind(project.component.tree, 'name')).toBe(true);
  });
});

describe('component.addNode', () => {
  it('adds a node to the root', () => {
    const project = createRawProject();

    const result = project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack' },
    });

    const tree = project.component.tree as any;
    expect(tree).toBeDefined();
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].component).toBe('Stack');
    expect(result).toHaveProperty('nodeRef');
  });

  it('creates a real component document when editing a blank tree', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    });

    expect((project.component as any)['x-studio-generated']).toBeUndefined();
    expect((project.component as any).$formspecComponent).toBe('1.0');
    expect((project.component as any).version).toBe('0.1.0');
    expect((project.component.tree as any).component).toBe('Stack');
  });

  it('adds a bound input node', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });

    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'name' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].component).toBe('TextInput');
    expect(tree.children[0].bind).toBe('name');
  });

  it('generates nodeId for unbound nodes', () => {
    const project = createRawProject();

    const result = project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any;

    expect(result.nodeRef.nodeId).toBeTypeOf('string');
    const tree = project.component.tree as any;
    expect(tree.children[0].nodeId).toBe(result.nodeRef.nodeId);
  });

  it('respects insertIndex', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    });
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    });

    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack', insertIndex: 1 },
    });

    const tree = project.component.tree as any;
    expect(tree.children[1].component).toBe('Stack');
  });

  it('adds nested children to a referenced node', () => {
    const project = createRawProject();

    const result = project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any;

    project.dispatch({
      type: 'component.addNode',
      payload: { parent: result.nodeRef, component: 'Stack' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].component).toBe('Stack');
  });
});

describe('component.deleteNode', () => {
  it('removes a node by nodeRef', () => {
    const project = createRawProject();

    const result = project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any;

    project.dispatch({
      type: 'component.deleteNode',
      payload: { node: result.nodeRef },
    });

    const tree = project.component.tree as any;
    expect(tree.children).toHaveLength(0);
  });

  it('removes a bound node by bind ref', () => {
    const project = createRawProject();
    // addItem auto-creates a bound node via tree sync
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    expect(project.componentFor('email')).toBeDefined();

    project.dispatch({
      type: 'component.deleteNode',
      payload: { node: { bind: 'email' } },
    });

    expect(project.componentFor('email')).toBeUndefined();
  });
});

describe('component.moveNode — circular move guard', () => {
  it('throws when moving a node into its own child', () => {
    const project = createRawProject();

    const outer = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const inner = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: outer, component: 'Stack' },
    }) as any).nodeRef;

    expect(() =>
      project.dispatch({
        type: 'component.moveNode',
        payload: { source: outer, targetParent: inner },
      }),
    ).toThrow(/circular|ancestor|descendant/i);
  });

  it('throws when moving a node into a deeply nested descendant', () => {
    const project = createRawProject();

    const a = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const b = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: a, component: 'Stack' },
    }) as any).nodeRef;

    const c = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: b, component: 'Card' },
    }) as any).nodeRef;

    expect(() =>
      project.dispatch({
        type: 'component.moveNode',
        payload: { source: a, targetParent: c },
      }),
    ).toThrow(/circular|ancestor|descendant/i);
  });

  it('throws when moving a node into itself', () => {
    const project = createRawProject();

    const card = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    expect(() =>
      project.dispatch({
        type: 'component.moveNode',
        payload: { source: card, targetParent: card },
      }),
    ).toThrow(/circular|ancestor|descendant/i);
  });
});

describe('component.moveNode', () => {
  it('moves a node to a new parent', () => {
    const project = createRawProject();

    const card1 = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const card2 = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const inner = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: card1, component: 'Stack' },
    }) as any).nodeRef;

    // Move inner from card1 to card2
    project.dispatch({
      type: 'component.moveNode',
      payload: { source: inner, targetParent: card2 },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].children ?? []).toHaveLength(0);
    expect(tree.children[1].children).toHaveLength(1);
    expect(tree.children[1].children[0].component).toBe('Stack');
  });

  it('stamps movedFrom provenance in the same move command and preserves generation metadata', () => {
    const project = createRawProject();

    const card1 = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const card2 = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const inner = (project.dispatch({
      type: 'component.addNode',
      payload: {
        parent: card1,
        component: 'Stack',
        props: { 'x-generation': { source: 'template' } },
      },
    }) as any).nodeRef;

    project.dispatch({
      type: 'component.moveNode',
      payload: {
        source: inner,
        targetParent: card2,
        movedFrom: { route: 'review', nodePath: '/reviewRouteRoot/movingPanel' },
      },
    });

    const tree = project.component.tree as any;
    expect(tree.children[1].children[0]['x-generation']).toEqual({
      source: 'template',
      movedFrom: { route: 'review', nodePath: '/reviewRouteRoot/movingPanel' },
    });

    expect(project.undo()).toBe(true);
    const undone = project.component.tree as any;
    expect(undone.children[0].children[0]['x-generation']).toEqual({ source: 'template' });
    expect(undone.children[1].children ?? []).toHaveLength(0);
  });

  it('resolves target parent by bind when the container has no nodeId', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack', bind: 'groupPath' },
    });

    const field = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'f1' },
    }) as any).nodeRef;

    project.dispatch({
      type: 'component.moveNode',
      payload: { source: field, targetParent: { bind: 'groupPath' } },
    });

    const tree = project.component.tree as any;
    const group = tree.children.find((c: any) => c.bind === 'groupPath');
    expect(group?.children?.some((c: any) => c.bind === 'f1')).toBe(true);
  });
});

describe('component.reorderNode', () => {
  it('swaps with adjacent sibling', () => {
    const project = createRawProject();

    const first = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card', props: { title: 'First' } },
    }) as any).nodeRef;

    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack' },
    });

    project.dispatch({
      type: 'component.reorderNode',
      payload: { node: first, direction: 'down' },
    });

    const tree = project.component.tree as any;
    expect(tree.children[0].component).toBe('Stack');
    expect(tree.children[1].component).toBe('Card');
  });

  it('outdents last child when moving down past sibling end (into grandparent after parent)', () => {
    const project = createRawProject();

    const wrapper = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack' },
    }) as any).nodeRef;

    const leaf = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: wrapper, component: 'TextInput', bind: 'onlyField' },
    }) as any).nodeRef;

    project.dispatch({
      type: 'component.reorderNode',
      payload: { node: leaf, direction: 'down' },
    });

    const tree = project.component.tree as any;
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].component).toBe('Stack');
    expect(tree.children[0].children ?? []).toHaveLength(0);
    expect(tree.children[1].bind).toBe('onlyField');
  });

  it('outdents first child when moving up past sibling start (into grandparent before parent)', () => {
    const project = createRawProject();

    const wrapper = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Stack' },
    }) as any).nodeRef;

    const leaf = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: wrapper, component: 'TextInput', bind: 'onlyField' },
    }) as any).nodeRef;

    project.dispatch({
      type: 'component.reorderNode',
      payload: { node: leaf, direction: 'up' },
    });

    const tree = project.component.tree as any;
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].bind).toBe('onlyField');
    expect(tree.children[1].component).toBe('Stack');
  });
});

describe('component.duplicateNode', () => {
  it('deep clones a node with new nodeIds', () => {
    const project = createRawProject();

    const original = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const result = project.dispatch({
      type: 'component.duplicateNode',
      payload: { node: original },
    }) as any;

    const tree = project.component.tree as any;
    expect(tree.children).toHaveLength(2);
    expect(tree.children[1].component).toBe('Card');
    expect(tree.children[1].nodeId).not.toBe(tree.children[0].nodeId);
    expect(result.nodeRef.nodeId).toBe(tree.children[1].nodeId);
  });
});

describe('component.wrapNode', () => {
  it('wraps a node in a new container', () => {
    const project = createRawProject();

    const node = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'f1' },
    }) as any).nodeRef;

    project.dispatch({
      type: 'component.wrapNode',
      payload: { node, wrapper: { component: 'Card' } },
    });

    const tree = project.component.tree as any;
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].component).toBe('Card');
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].bind).toBe('f1');
  });
});

describe('component.wrapSiblingNodes', () => {
  it('wraps adjacent siblings in one container', () => {
    const project = createRawProject();

    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'b' } });

    const refA = { bind: 'a' };
    const refB = { bind: 'b' };

    const result = project.dispatch({
      type: 'component.wrapSiblingNodes',
      payload: { nodes: [refA, refB], wrapper: { component: 'Grid' } },
    }) as any;

    const tree = project.component.tree as any;
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].component).toBe('Grid');
    expect(tree.children[0].children.map((c: any) => c.bind)).toEqual(['a', 'b']);
    expect(result.nodeRef.nodeId).toBe(tree.children[0].nodeId);
  });

  it('wraps non-contiguous siblings and preserves left-to-right order', () => {
    const project = createRawProject();

    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'b' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'c' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'd' } });

    project.dispatch({
      type: 'component.wrapSiblingNodes',
      payload: { nodes: [{ bind: 'b' }, { bind: 'd' }], wrapper: { component: 'Grid' } },
    });

    const tree = project.component.tree as any;
    expect(tree.children).toHaveLength(3);
    expect(tree.children[0].bind).toBe('a');
    expect(tree.children[1].component).toBe('Grid');
    expect(tree.children[1].children.map((c: any) => c.bind)).toEqual(['b', 'd']);
    expect(tree.children[2].bind).toBe('c');
  });

  it('throws when nodes are not siblings', () => {
    const project = createRawProject();

    const card1 = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const card2 = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    const f1 = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: card1, component: 'TextInput', bind: 'f1' },
    }) as any).nodeRef;

    const f2 = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: card2, component: 'TextInput', bind: 'f2' },
    }) as any).nodeRef;

    expect(() =>
      project.dispatch({
        type: 'component.wrapSiblingNodes',
        payload: { nodes: [f1, f2], wrapper: { component: 'Grid' } },
      }),
    ).toThrow(/siblings/i);
  });
});

describe('component.unwrapNode', () => {
  it('promotes children to parent and removes wrapper', () => {
    const project = createRawProject();

    const wrapper = (project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Card' },
    }) as any).nodeRef;

    project.dispatch({
      type: 'component.addNode',
      payload: { parent: wrapper, component: 'TextInput', bind: 'a' },
    });
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: wrapper, component: 'TextInput', bind: 'b' },
    });

    project.dispatch({
      type: 'component.unwrapNode',
      payload: { node: wrapper },
    });

    const tree = project.component.tree as any;
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].bind).toBe('a');
    expect(tree.children[1].bind).toBe('b');
  });
});

describe('component tree rebuild — orphaned display nodes', () => {
  it('drops display nodes whose definition items no longer exist', () => {
    const project = createRawProject();

    project.dispatch({
      type: 'definition.addItem',
      payload: { key: 'notice', type: 'display', label: 'Important notice' },
    });

    const treeBefore = project.component.tree as any;
    expect(treeBefore.children?.some((node: any) => node.nodeId === 'notice')).toBe(true);

    project.dispatch({
      type: 'definition.deleteItem',
      payload: { path: 'notice' },
    });

    const treeAfter = project.component.tree as any;
    expect(treeAfter.children?.some((node: any) => node.nodeId === 'notice')).toBe(false);
  });
});
