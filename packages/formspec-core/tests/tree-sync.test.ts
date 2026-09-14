import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

describe('component tree sync', () => {
  it('auto-creates a default node for a new field', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'name', dataType: 'string' },
    });

    const node = project.componentFor('name');
    expect(node).toBeDefined();
    expect(node!.bind).toBe('name');
    expect(node!.component).toBe('TextInput');
  });

  it('preserves authored component trees when definition structure changes', () => {
    const project = createRawProject({
      seed: {
        component: {
          $formspecComponent: '1.0',
          version: '1.0.0',
          targetDefinition: { url: 'urn:test' },
          tree: { component: 'Stack', children: [] },
        } as any,
      },
    });

    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'name', dataType: 'string' },
    });

    expect((project.component as any).$formspecComponent).toBe('1.0');
    expect((project.component as any).version).toBe('1.0.0');
    expect((project.component.tree as any).component).toBe('Stack');
  });

  it('removes component node when item is deleted', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'age' },
    });
    expect(project.componentFor('age')).toBeDefined();

    project.dispatch({
      type: 'definition.deleteItem',
      payload: { path: 'age' },
    });
    expect(project.componentFor('age')).toBeUndefined();
  });

  it('preserves existing bound node properties through rebuild', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'email' },
    });
    // Customize the component node
    project.dispatch({
      type: 'component.setFieldWidget',
      payload: { fieldKey: 'email', widget: 'EmailInput' },
    });

    // Add another item — triggers rebuild
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'phone' },
    });

    // email's custom widget should survive the rebuild
    const emailNode = project.componentFor('email');
    expect(emailNode!.component).toBe('EmailInput');
    // phone should get a default node
    expect(project.componentFor('phone')).toBeDefined();
  });

  it('creates nested structure for groups with children', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'contact' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', parentPath: 'contact' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'email', parentPath: 'contact' } },
    ]);

    const tree = project.component.tree as any;
    const groupNode = tree.children.find((c: any) => c.bind === 'contact');
    expect(groupNode).toBeDefined();
    expect(groupNode.component).toBe('Stack');
    expect(groupNode.children).toHaveLength(2);
    expect(groupNode.children[0].bind).toBe('name');
    expect(groupNode.children[1].bind).toBe('email');
  });

  it('preserves unbound layout nodes after rebuild', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'f1' },
    });
    // Manually add an unbound layout node
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Divider' },
    });

    // Trigger rebuild by adding another field
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'f2' },
    });

    const tree = project.component.tree as any;
    const hasDivider = tree.children.some((c: any) => c.component === 'Divider');
    expect(hasDivider).toBe(true);
  });

  it('creates Text nodes bound to their display items', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'display', key: 'header', label: 'Welcome' },
    });

    // `bind` links the node to its Item (Locale label, `{{}}` interpolation, Bind relevance);
    // `text` mirrors the inline label and `nodeId` stays the Studio node ref.
    const tree = project.component.tree as any;
    const node = tree.children?.find((c: any) => c.nodeId === 'header');
    expect(node).toMatchObject({ component: 'Text', text: 'Welcome', bind: 'header', nodeId: 'header' });
    expect(project.componentFor('header')).toBe(node);
  });

  it('preserves display node overrides through tree rebuild', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'display', key: 'header', label: 'Welcome' },
    });

    // Customize the display node (e.g. change component to Heading)
    const tree1 = project.component.tree as any;
    const displayNode = tree1.children.find((c: any) => c.nodeId === 'header');
    displayNode.component = 'Heading';
    displayNode.level = 2;

    // Trigger rebuild by adding another item
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'name', dataType: 'string' },
    });

    // Display node overrides should survive the rebuild
    const tree2 = project.component.tree as any;
    const rebuilt = tree2.children.find((c: any) => c.nodeId === 'header');
    expect(rebuilt).toBeDefined();
    expect(rebuilt!.component).toBe('Heading');
    expect(rebuilt!.level).toBe(2);
    expect(rebuilt!.text).toBe('Welcome');
  });

  it('preserves distinct display overrides for same-key display items in different groups across rebuilds', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'groupA' } },
      { type: 'definition.addItem', payload: { type: 'group', key: 'groupB' } },
      { type: 'definition.addItem', payload: { type: 'display', key: 'header', parentPath: 'groupA', label: 'Alpha Header' } },
      { type: 'definition.addItem', payload: { type: 'display', key: 'header', parentPath: 'groupB', label: 'Beta Header' } },
    ]);

    const tree1 = project.component.tree as any;
    const groupANode = tree1.children.find((c: any) => c.bind === 'groupA');
    const groupBNode = tree1.children.find((c: any) => c.bind === 'groupB');
    const groupADisplay = groupANode.children.find((c: any) => c.nodeId === 'header');
    const groupBDisplay = groupBNode.children.find((c: any) => c.nodeId === 'header');

    groupADisplay.component = 'Alert';
    groupADisplay.variant = 'warning';
    groupBDisplay.component = 'Callout';
    groupBDisplay.variant = 'info';

    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'name', dataType: 'string' },
    });

    const tree2 = project.component.tree as any;
    const rebuiltGroupA = tree2.children.find((c: any) => c.bind === 'groupA');
    const rebuiltGroupB = tree2.children.find((c: any) => c.bind === 'groupB');
    const rebuiltAHeader = rebuiltGroupA.children.find((c: any) => c.text === 'Alpha Header');
    const rebuiltBHeader = rebuiltGroupB.children.find((c: any) => c.text === 'Beta Header');

    expect(rebuiltAHeader.component).toBe('Alert');
    expect(rebuiltAHeader.variant).toBe('warning');
    expect(rebuiltBHeader.component).toBe('Callout');
    expect(rebuiltBHeader.variant).toBe('info');
  });

  it('handles batch with multiple structural changes', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'a' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'b' } },
      { type: 'definition.addItem', payload: { type: 'field', key: 'c' } },
    ]);

    expect(project.componentFor('a')).toBeDefined();
    expect(project.componentFor('b')).toBeDefined();
    expect(project.componentFor('c')).toBeDefined();
  });

  it('reconciles display label into component text when label changes via setItemProperty', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'display', key: 'note', label: 'First draft' },
    });

    function textNode(root: { children?: unknown[] }): { text?: string; style?: { gridRow?: string } } | undefined {
      const stack = [...(root.children ?? [])] as { component?: string; nodeId?: string; text?: string; style?: { gridRow?: string }; children?: unknown[] }[];
      while (stack.length) {
        const n = stack.pop()!;
        if (n.component === 'Text' && n.nodeId === 'note') return n;
        for (const c of n.children ?? []) stack.push(c as (typeof n));
      }
      return undefined;
    }

    expect(textNode(project.component.tree as { children?: unknown[] })?.text).toBe('First draft');

    project.dispatch({
      type: 'component.setNodeStyle',
      payload: { node: { nodeId: 'note' }, property: 'gridRow', value: 'span 3' },
    });
    expect(textNode(project.component.tree as { children?: unknown[] })?.style?.gridRow).toBe('span 3');

    project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'note', property: 'label', value: 'Line 1\nLine 2' },
    });

    const after = textNode(project.component.tree as { children?: unknown[] });
    expect(after?.text).toBe('Line 1\nLine 2');
    expect(after?.style?.gridRow).toBe('span 3');
  });
});
