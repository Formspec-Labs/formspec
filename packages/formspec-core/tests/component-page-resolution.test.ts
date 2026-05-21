import { describe, it, expect } from 'vitest';
import { resolvePageStructureFromTree } from '../src/queries/component-page-resolution.js';
import type { TreeNode } from '../src/handlers/tree-utils.js';

/** Build a root Stack with the given children. */
function rootStack(...children: TreeNode[]): TreeNode {
  return { component: 'Stack', nodeId: 'root', children };
}

/** Build a Section page unit. */
function page(id: string, title: string, children: TreeNode[] = [], extra: Record<string, unknown> = {}): TreeNode {
  return { component: 'Section', nodeId: id, id, title, children, ...extra };
}

/** Build a bound leaf node (e.g. Input). */
function bound(bind: string): TreeNode {
  return { component: 'Input', bind };
}

/** Build an unbound layout container. */
function container(nodeId: string, children: TreeNode[]): TreeNode {
  return { component: 'Grid', nodeId, children };
}

describe('resolvePageStructureFromTree', () => {
  it('returns empty pages with all items unassigned when root has no Section children', () => {
    const tree = rootStack(bound('name'), bound('email'));
    const result = resolvePageStructureFromTree(tree, 'single', ['name', 'email']);

    expect(result.mode).toBe('single');
    expect(result.pages).toEqual([]);
    expect(result.unassignedItems).toEqual(['name', 'email']);
    expect(result.itemPageMap).toEqual({});
    expect(result.diagnostics).toEqual([]);
  });

  it('returns empty pages and all items unassigned when root has no children', () => {
    const tree = rootStack();
    const result = resolvePageStructureFromTree(tree, 'wizard', ['name']);

    expect(result.pages).toEqual([]);
    expect(result.unassignedItems).toEqual(['name']);
  });

  it('builds pages from Section children with bound items as regions', () => {
    const tree = rootStack(
      page('p1', 'Step 1', [bound('name'), bound('age')]),
      page('p2', 'Step 2', [bound('email')]),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['name', 'age', 'email']);

    expect(result.mode).toBe('wizard');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toEqual({
      id: 'p1',
      title: 'Step 1',
      regions: [
        { key: 'name', span: 12, exists: true },
        { key: 'age', span: 12, exists: true },
      ],
    });
    expect(result.pages[1]).toEqual({
      id: 'p2',
      title: 'Step 2',
      regions: [
        { key: 'email', span: 12, exists: true },
      ],
    });
    expect(result.unassignedItems).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('includes page description when present', () => {
    const tree = rootStack(
      page('p1', 'Step 1', [bound('name')], { description: 'Your name' }),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['name']);

    expect(result.pages[0].description).toBe('Your name');
  });

  it('collects bound items nested inside layout containers within a Page', () => {
    const tree = rootStack(
      page('p1', 'Layout Page', [
        container('grid1', [bound('first'), bound('last')]),
        bound('email'),
      ]),
    );
    const result = resolvePageStructureFromTree(tree, 'tabs', ['first', 'last', 'email']);

    expect(result.mode).toBe('tabs');
    expect(result.pages[0].regions).toEqual([
      { key: 'first', span: 12, exists: true },
      { key: 'last', span: 12, exists: true },
      { key: 'email', span: 12, exists: true },
    ]);
    expect(result.unassignedItems).toEqual([]);
  });

  it('marks exists: false when a bound key is not in allItemKeys', () => {
    const tree = rootStack(
      page('p1', 'Step 1', [bound('name'), bound('ghost')]),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['name']);

    expect(result.pages[0].regions).toEqual([
      { key: 'name', span: 12, exists: true },
      { key: 'ghost', span: 12, exists: false },
    ]);
  });

  it('items not in any Page are unassigned', () => {
    const tree = rootStack(
      page('p1', 'Step 1', [bound('name')]),
      bound('orphan'),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['name', 'orphan']);

    expect(result.unassignedItems).toEqual(['orphan']);
    expect(result.itemPageMap).toEqual({ name: 'p1' });
  });

  it('allItemKeys entries absent from the tree are unassigned', () => {
    const tree = rootStack(
      page('p1', 'Step 1', [bound('name')]),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['name', 'missing']);

    expect(result.unassignedItems).toEqual(['missing']);
  });

  it('page with no children has empty regions', () => {
    const tree = rootStack(
      page('p1', 'Empty Page'),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['name']);

    expect(result.pages[0].regions).toEqual([]);
    expect(result.unassignedItems).toEqual(['name']);
  });

  it('builds itemPageMap mapping each assigned key to its page id', () => {
    const tree = rootStack(
      page('p1', 'Step 1', [bound('a'), bound('b')]),
      page('p2', 'Step 2', [bound('c')]),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['a', 'b', 'c']);

    expect(result.itemPageMap).toEqual({ a: 'p1', b: 'p1', c: 'p2' });
  });

  it('ignores non-Section siblings at the root level when collecting bound items', () => {
    const tree = rootStack(
      page('p1', 'Step 1', [bound('a')]),
      container('layout1', [bound('b')]),  // non-Section sibling — b is unassigned
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['a', 'b']);

    expect(result.itemPageMap).toEqual({ a: 'p1' });
    expect(result.unassignedItems).toEqual(['b']);
  });

  it('handles deeply nested bound items within Pages', () => {
    const tree = rootStack(
      page('p1', 'Deep', [
        container('outer', [
          container('inner', [bound('deep')]),
        ]),
      ]),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['deep']);

    expect(result.pages[0].regions).toEqual([
      { key: 'deep', span: 12, exists: true },
    ]);
    expect(result.unassignedItems).toEqual([]);
  });

  it('uses page id from node id when nodeId is set', () => {
    const tree = rootStack(
      page('page-one', 'First', [bound('x')]),
    );
    const result = resolvePageStructureFromTree(tree, 'wizard', ['x']);

    expect(result.pages[0].id).toBe('page-one');
    expect(result.itemPageMap['x']).toBe('page-one');
  });

  it('propagates tabs pageMode correctly', () => {
    const tree = rootStack(
      page('t1', 'Tab 1', [bound('x')]),
    );
    const result = resolvePageStructureFromTree(tree, 'tabs', ['x']);

    expect(result.mode).toBe('tabs');
  });

  it('propagates single pageMode correctly', () => {
    const tree = rootStack(
      page('p1', 'Page 1', [bound('x')]),
    );
    const result = resolvePageStructureFromTree(tree, 'single', ['x']);

    expect(result.mode).toBe('single');
  });
});
