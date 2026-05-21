import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

describe('definition.addItem', () => {
  it('adds a field to root with auto-generated key', () => {
    const project = createRawProject();
    const result = project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', dataType: 'string', label: 'Name' },
    });

    expect(result.rebuildComponentTree).toBe(true);
    expect(result.insertedPath).toBeTypeOf('string');
    expect(project.definition.items).toHaveLength(1);
    expect(project.definition.items[0].type).toBe('field');
    expect(project.definition.items[0].dataType).toBe('string');
    expect(project.definition.items[0].label).toBe('Name');
    expect(project.definition.items[0].key).toBeTypeOf('string');
  });

  it('uses explicit key when provided', () => {
    const project = createRawProject();
    const result = project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'email', dataType: 'string', label: 'Email' },
    });

    expect(result.insertedPath).toBe('email');
    expect(project.definition.items[0].key).toBe('email');
  });

  it('defaults field dataType to string', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'name' },
    });

    expect(project.definition.items[0].dataType).toBe('string');
  });

  it('adds a group with empty children', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'group', key: 'address', label: 'Address' },
    });

    expect(project.definition.items[0].type).toBe('group');
    expect(project.definition.items[0].children).toEqual([]);
  });

  it('adds item inside a parent group', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'group', key: 'address' },
    });
    const result = project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'street', parentPath: 'address', dataType: 'string' },
    });

    expect(result.insertedPath).toBe('address.street');
    expect(project.definition.items[0].children).toHaveLength(1);
    expect(project.definition.items[0].children![0].key).toBe('street');
  });

  it('inserts at a specific index', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'c' } });
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'b', insertIndex: 1 },
    });

    expect(project.definition.items.map(i => i.key)).toEqual(['a', 'b', 'c']);
  });

  it('sets label, description, hint on the item', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: {
        type: 'field', key: 'notes', dataType: 'text',
        label: 'Notes', description: 'Additional info', hint: 'Optional',
      },
    });

    const item = project.definition.items[0];
    expect(item.label).toBe('Notes');
    expect(item.description).toBe('Additional info');
    expect(item.hint).toBe('Optional');
    expect(item.dataType).toBe('text');
  });
});

describe('definition.deleteItem', () => {
  it('removes an item from root', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });

    project.dispatch({ type: 'definition.deleteItem', payload: { path: 'name' } });

    expect(project.definition.items).toHaveLength(1);
    expect(project.definition.items[0].key).toBe('email');
  });

  it('removes a nested item', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f1', parentPath: 'g' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f2', parentPath: 'g' } });

    project.dispatch({ type: 'definition.deleteItem', payload: { path: 'g.f1' } });

    expect(project.definition.items[0].children).toHaveLength(1);
    expect(project.definition.items[0].children![0].key).toBe('f2');
  });

  it('removes subtree when deleting a group', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'child', parentPath: 'g' } });

    project.dispatch({ type: 'definition.deleteItem', payload: { path: 'g' } });

    expect(project.definition.items).toHaveLength(0);
  });

  it('cleans up binds targeting deleted paths', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'email', properties: { required:  'true' } },
    });

    expect(project.definition.binds).toHaveLength(1);

    project.dispatch({ type: 'definition.deleteItem', payload: { path: 'email' } });

    expect(project.definition.binds ?? []).toHaveLength(0);
  });

  it('signals rebuildComponentTree', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'x' } });

    const result = project.dispatch({ type: 'definition.deleteItem', payload: { path: 'x' } });
    expect(result.rebuildComponentTree).toBe(true);
  });
});

describe('definition.renameItem', () => {
  it('renames an item and returns the new path', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });

    const result = project.dispatch({
      type: 'definition.renameItem',
      payload: { path: 'name', newKey: 'fullName' },
    });

    expect(result.newPath).toBe('fullName');
    expect(project.definition.items[0].key).toBe('fullName');
  });

  it('rewrites bind paths on rename', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'email', properties: { required:  'true' } },
    });

    project.dispatch({
      type: 'definition.renameItem',
      payload: { path: 'email', newKey: 'emailAddress' },
    });

    expect(project.definition.binds![0].path).toBe('emailAddress');
  });

  it('renames nested item and updates path', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f', parentPath: 'g' } });

    const result = project.dispatch({
      type: 'definition.renameItem',
      payload: { path: 'g.f', newKey: 'renamed' },
    });

    expect(result.newPath).toBe('g.renamed');
    expect(project.definition.items[0].children![0].key).toBe('renamed');
  });

  it('rewrites references by full path, not by bare key', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'g1' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'g2' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'x', parentPath: 'g1' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'x', parentPath: 'g2' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'total' } },
      { type: 'definition.setBind', payload: { path: 'total', properties: { calculate: '$g1.x + $g2.x' } } },
    ]);

    project.dispatch({
      type: 'definition.renameItem',
      payload: { path: 'g1.x', newKey: 'y' },
    });

    expect(project.definition.binds?.[0].calculate).toBe('$g1.y + $g2.x');
  });
});

describe('definition.moveItem', () => {
  it('moves an item to root', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f', parentPath: 'g' } });

    const result = project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'g.f' },
    });

    expect(result.newPath).toBe('f');
    expect(project.definition.items).toHaveLength(2);
    expect(project.definition.items[0].children).toHaveLength(0);
    expect(project.definition.items[1].key).toBe('f');
  });

  it('moves an item into a group', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });

    const result = project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'f', targetParentPath: 'g' },
    });

    expect(result.newPath).toBe('g.f');
    expect(project.definition.items).toHaveLength(1); // only 'g' at root
    expect(project.definition.items[0].children).toHaveLength(1);
  });

  it('moves to a specific index', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'b' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'c' } });

    project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'c', targetIndex: 0 },
    });

    expect(project.definition.items.map(i => i.key)).toEqual(['c', 'a', 'b']);
  });
});

describe('definition.moveItem — reference rewriting', () => {
  it('rewrites bind paths when an item moves to a new parent', () => {
    const project = createRawProject();

    // Build: group "a" with child "name", plus empty group "b"
    project.dispatch({
      type: 'definition.addItem',
      payload: { key: 'a', type: 'group' },
    });
    project.dispatch({
      type: 'definition.addItem',
      payload: { key: 'name', type: 'field', dataType: 'string', parentPath: 'a' },
    });
    project.dispatch({
      type: 'definition.addItem',
      payload: { key: 'b', type: 'group' },
    });

    // Add a bind referencing a.name
    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'a.name', properties: { required:  'true' } },
    });

    // Move "name" from group "a" to group "b"
    project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'a.name', targetParentPath: 'b' },
    });

    // The bind should now reference b.name, not a.name
    const binds = project.definition.binds;
    const bind = binds?.find((b: any) => b.path === 'b.name');
    expect(bind).toBeDefined();
    expect(bind?.required).toBe( 'true');

    // Old path should not exist
    const oldBind = binds?.find((b: any) => b.path === 'a.name');
    expect(oldBind).toBeUndefined();
  });

  it('rewrites FEL expressions in binds referencing the moved item', () => {
    const project = createRawProject();

    project.dispatch({ type: 'definition.addItem', payload: { key: 'a', type: 'group' } });
    project.dispatch({ type: 'definition.addItem', payload: { key: 'age', type: 'field', dataType: 'integer', parentPath: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { key: 'b', type: 'group' } });
    project.dispatch({ type: 'definition.addItem', payload: { key: 'check', type: 'field', dataType: 'string' } });

    // Add a bind with a calculate expression referencing a.age
    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'check', properties: { calculate: '$a.age >= 18' } },
    });

    // Move "age" from group "a" to group "b"
    project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'a.age', targetParentPath: 'b' },
    });

    // The expression should now reference b.age
    const bind = project.definition.binds?.find((b: any) => b.path === 'check');
    expect(bind?.calculate).toBe('$b.age >= 18');
  });

  it('rewrites variable expressions referencing the moved item', () => {
    const project = createRawProject();

    project.dispatch({ type: 'definition.addItem', payload: { key: 'a', type: 'group' } });
    project.dispatch({ type: 'definition.addItem', payload: { key: 'age', type: 'field', dataType: 'integer', parentPath: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { key: 'b', type: 'group' } });

    // Add a variable that references a.age
    project.dispatch({
      type: 'definition.addVariable',
      payload: { name: 'isAdult', expression: '$a.age >= 18' },
    });

    // Move "age" from group "a" to group "b"
    project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'a.age', targetParentPath: 'b' },
    });

    // Variable expression should now reference b.age
    const variable = (project.definition as any).variables?.find(
      (v: any) => v.name === 'isAdult',
    );
    expect(variable?.expression).toBe('$b.age >= 18');
  });

  it('rewrites shape targets and expressions when item moves', () => {
    const project = createRawProject();

    project.dispatch({ type: 'definition.addItem', payload: { key: 'a', type: 'group' } });
    project.dispatch({ type: 'definition.addItem', payload: { key: 'score', type: 'field', dataType: 'integer', parentPath: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { key: 'b', type: 'group' } });

    // Add a shape targeting a.score
    project.dispatch({
      type: 'definition.addShape',
      payload: { target: 'a.score', constraint: '$a.score > 0', severity: 'error' },
    });

    // Move "score" from group "a" to group "b"
    project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'a.score', targetParentPath: 'b' },
    });

    const shape = (project.definition as any).shapes?.[0];
    expect(shape?.target).toBe('b.score');
    expect(shape?.constraint).toBe('$b.score > 0');
  });

  it('does not rewrite when path is unchanged (reorder within same parent)', () => {
    const project = createRawProject();

    project.dispatch({ type: 'definition.addItem', payload: { key: 'a', type: 'field', dataType: 'string' } });
    project.dispatch({ type: 'definition.addItem', payload: { key: 'b', type: 'field', dataType: 'string' } });

    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'b', properties: { required:  'true' } },
    });

    // Move 'b' to index 0 at root — path stays 'b'
    project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'b', targetIndex: 0 },
    });

    const bind = project.definition.binds?.find((b: any) => b.path === 'b');
    expect(bind).toBeDefined();
    expect(bind?.required).toBe( 'true');
  });

  it('rewrites descendant references correctly when moving an item into a deeper parent path', () => {
    const project = createRawProject();

    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'field' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'child', parentPath: 'field', dataType: 'string' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'group' } },
      { type: 'definition.setBind', payload: { path: 'field.child', properties: { required:  'true' } } },
    ]);

    project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'field', targetParentPath: 'group' },
    });

    expect(project.definition.binds?.[0].path).toBe('group.field.child');
  });

  it('rewrites inner rule reverse references when an item moves', () => {
    const project = createRawProject();

    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'a' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'age', parentPath: 'a', dataType: 'integer' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'b' } },
    ]);

    project.state.mappings.default.rules = [
      {
        sourcePath: 'a',
        targetPath: 'person',
        innerRules: [
          {
            sourcePath: 'a.age',
            targetPath: 'age',
            reverse: {
              sourcePath: 'person.age',
              targetPath: 'a.age',
              expression: '$a.age',
              condition: '$a.age > 0',
            },
          },
        ],
      },
    ];

    project.dispatch({
      type: 'definition.moveItem',
      payload: { sourcePath: 'a.age', targetParentPath: 'b' },
    });

    const reverse = ((project.mapping as any).rules as any[])[0].innerRules[0].reverse;
    expect(reverse.targetPath).toBe('b.age');
    expect(reverse.expression).toBe('$b.age');
    expect(reverse.condition).toBe('$b.age > 0');
  });
});

describe('definition.reorderItem', () => {
  it('swaps with adjacent sibling downward', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'b' } });

    project.dispatch({
      type: 'definition.reorderItem',
      payload: { path: 'a', direction: 'down' },
    });

    expect(project.definition.items.map(i => i.key)).toEqual(['b', 'a']);
  });

  it('swaps with adjacent sibling upward', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'b' } });

    project.dispatch({
      type: 'definition.reorderItem',
      payload: { path: 'b', direction: 'up' },
    });

    expect(project.definition.items.map(i => i.key)).toEqual(['b', 'a']);
  });
});

describe('definition.duplicateItem', () => {
  it('deep clones an item with a suffixed key', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'email', dataType: 'string', label: 'Email' },
    });

    const result = project.dispatch({
      type: 'definition.duplicateItem',
      payload: { path: 'email' },
    });

    expect(result.insertedPath).toBeTypeOf('string');
    expect(result.insertedPath).not.toBe('email');
    expect(project.definition.items).toHaveLength(2);
    expect(project.definition.items[1].label).toBe('Email');
    expect(project.definition.items[1].dataType).toBe('string');
  });
});

describe('definition.addItem paged mode guard', () => {
  it('allows adding the first root field before any pages exist in a paged definition', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'wizard' } });

    expect(() =>
      project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'firstField' } }),
    ).not.toThrow();

    expect(project.definition.items[0]?.key).toBe('firstField');
  });

  it('throws when adding a non-group item at root in a paged definition', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'page1' } });
    project.dispatch({ type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'wizard' } });

    expect(() =>
      project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'orphan' } }),
    ).toThrow(/parentPath/);
  });

  it('allows adding a group at root in a paged definition', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'page1' } });
    project.dispatch({ type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'wizard' } });

    expect(() =>
      project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'page2' } }),
    ).not.toThrow();
  });

  it('allows adding a non-group item with parentPath in a paged definition', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'page1' } });
    project.dispatch({ type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'wizard' } });

    expect(() =>
      project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f1', parentPath: 'page1' } }),
    ).not.toThrow();
  });
});

describe('definition.moveItem paged mode guard', () => {
  it('throws when moving a non-group item to root in a paged definition with top-level groups', () => {
    const project = createRawProject();

    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'page1' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'page2' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', parentPath: 'page1', dataType: 'string' } },
      { type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'wizard' } },
    ]);

    expect(() =>
      project.dispatch({
        type: 'definition.moveItem',
        payload: { sourcePath: 'page1.name' },
      }),
    ).toThrow(/Cannot add a "field" at root|parentPath/);
  });
});

describe('definition.moveItem — circular move guard', () => {
  it('throws when moving a group into its own child', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'parent' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'child', parentPath: 'parent' } });

    expect(() =>
      project.dispatch({
        type: 'definition.moveItem',
        payload: { sourcePath: 'parent', targetParentPath: 'parent.child' },
      }),
    ).toThrow(/circular|ancestor|descendant/i);
  });

  it('throws when moving a group into a deeply nested descendant', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'b', parentPath: 'a' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'c', parentPath: 'a.b' } });

    expect(() =>
      project.dispatch({
        type: 'definition.moveItem',
        payload: { sourcePath: 'a', targetParentPath: 'a.b.c' },
      }),
    ).toThrow(/circular|ancestor|descendant/i);
  });
});
