import { describe, it, expect } from 'vitest';
import { reconcileComponentTree, defaultComponentType } from '../src/tree-reconciler.js';

describe('defaultComponentType', () => {
  it('maps string field to TextInput', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'string' } as any)).toBe('TextInput');
  });

  it('maps boolean field to Toggle', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'boolean' } as any)).toBe('Toggle');
  });

  it('maps integer field to NumberInput', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'integer' } as any)).toBe('NumberInput');
  });

  it('maps decimal field to NumberInput', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'decimal' } as any)).toBe('NumberInput');
  });

  it('maps date field to DatePicker', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'date' } as any)).toBe('DatePicker');
  });

  it('maps dateTime field to DatePicker', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'dateTime' } as any)).toBe('DatePicker');
  });

  it('maps time field to DatePicker', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'time' } as any)).toBe('DatePicker');
  });

  it('maps money field to MoneyInput', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'money' } as any)).toBe('MoneyInput');
  });

  it('maps attachment field to FileUpload', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'attachment' } as any)).toBe('FileUpload');
  });

  it('maps choice field to Select', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'choice' } as any)).toBe('Select');
  });

  it('maps multiChoice field to CheckboxGroup', () => {
    expect(defaultComponentType({ type: 'field', dataType: 'multiChoice' } as any)).toBe('CheckboxGroup');
  });

  it('maps group to Stack', () => {
    expect(defaultComponentType({ type: 'group' } as any)).toBe('Stack');
  });

  it('maps repeatable group to Accordion', () => {
    expect(defaultComponentType({ type: 'group', repeatable: true } as any)).toBe('Accordion');
  });

  it('maps display to Text', () => {
    expect(defaultComponentType({ type: 'display' } as any)).toBe('Text');
  });

  it('selects Select for fields with optionSet', () => {
    expect(defaultComponentType({ type: 'field', optionSet: 'countries' } as any)).toBe('Select');
  });

  it('selects Select for fields with inline options', () => {
    expect(defaultComponentType({ type: 'field', options: [{ value: 'a' }] } as any)).toBe('Select');
  });

  it('defaults unknown type to TextInput', () => {
    expect(defaultComponentType({ type: 'unknown' } as any)).toBe('TextInput');
  });
});

describe('reconcileComponentTree', () => {
  it('builds a flat Stack from simple definition', () => {
    const definition = {
      items: [
        { key: 'name', type: 'field', dataType: 'string' },
        { key: 'age', type: 'field', dataType: 'integer' },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.component).toBe('Stack');
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].bind).toBe('name');
    expect(tree.children[0].component).toBe('TextInput');
    expect(tree.children[1].bind).toBe('age');
    expect(tree.children[1].component).toBe('NumberInput');
    expect(tree.children[0].definitionItemPath).toBe('name');
    expect(tree.children[1].definitionItemPath).toBe('age');
  });

  it('stamps definitionItemPath on nested items so duplicate leaf keys stay distinct', () => {
    const definition = {
      items: [
        {
          key: 'g1',
          type: 'group',
          children: [{ key: 'title', type: 'field', dataType: 'string' }],
        },
        {
          key: 'g2',
          type: 'group',
          children: [{ key: 'title', type: 'field', dataType: 'string' }],
        },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    const g1 = tree.children!.find((c: any) => c.bind === 'g1');
    const g2 = tree.children!.find((c: any) => c.bind === 'g2');
    expect(g1?.definitionItemPath).toBe('g1');
    expect(g2?.definitionItemPath).toBe('g2');
    const t1 = g1?.children?.find((c: any) => c.bind === 'title');
    const t2 = g2?.children?.find((c: any) => c.bind === 'title');
    expect(t1?.definitionItemPath).toBe('g1.title');
    expect(t2?.definitionItemPath).toBe('g2.title');
  });

  it('reuses existing bound node properties', () => {
    const definition = {
      items: [{ key: 'email', type: 'field', dataType: 'string' }],
    } as any;
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [{ component: 'EmailInput', bind: 'email', placeholder: 'Enter email' }],
    };

    const tree = reconcileComponentTree(definition, existing);
    expect(tree.children[0].component).toBe('EmailInput');
    expect(tree.children[0].placeholder).toBe('Enter email');
  });

  it('honors widgetHint when building new nodes', () => {
    const definition = {
      items: [
        {
          key: 'marital',
          type: 'field',
          dataType: 'choice',
          options: [{ value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }],
          presentation: { widgetHint: 'RadioGroup' },
        },
        {
          key: 'agreed',
          type: 'field',
          dataType: 'boolean',
          presentation: { widgetHint: 'Toggle' },
        },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    // widgetHint: 'RadioGroup' → RadioGroup, not the default Select
    expect(tree.children[0].component).toBe('RadioGroup');
    // widgetHint: 'Toggle' → Toggle (Checkbox is not a valid schema component type)
    expect(tree.children[1].component).toBe('Toggle');
  });

  it('falls back to defaultComponentType when no widgetHint', () => {
    const definition = {
      items: [
        { key: 'color', type: 'field', dataType: 'choice' },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.children[0].component).toBe('Select');
  });

  it('updates existing node component when widgetHint changes', () => {
    const definition = {
      items: [
        {
          key: 'marital',
          type: 'field',
          dataType: 'choice',
          presentation: { widgetHint: 'RadioGroup' },
        },
      ],
    } as any;

    // Existing tree has Select (stale — before widgetHint was set)
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [{ component: 'Select', bind: 'marital' }],
    };

    const tree = reconcileComponentTree(definition, existing);
    // Should update to RadioGroup based on widgetHint, not keep stale Select
    expect(tree.children[0].component).toBe('RadioGroup');
  });

  it('preserves existing node component when widgetHint matches', () => {
    const definition = {
      items: [
        {
          key: 'color',
          type: 'field',
          dataType: 'choice',
          presentation: { widgetHint: 'Select' },
        },
      ],
    } as any;

    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [{ component: 'Select', bind: 'color', customProp: true }],
    };

    const tree = reconcileComponentTree(definition, existing);
    // Should keep Select (matches the canonical widgetHint) and preserve customProp
    expect(tree.children[0].component).toBe('Select');
    expect(tree.children[0].customProp).toBe(true);
  });

  it('removes nodes for deleted items', () => {
    const definition = { items: [] } as any;
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [{ component: 'TextInput', bind: 'deleted' }],
    };

    const tree = reconcileComponentTree(definition, existing);
    expect(tree.children).toHaveLength(0);
  });

  it('builds display nodes with Text component', () => {
    const definition = {
      items: [{ key: 'heading', type: 'display', label: 'Hello World' }],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].component).toBe('Text');
    expect(tree.children[0].nodeId).toBe('heading');
    expect(tree.children[0].text).toBe('Hello World');
  });

  it('builds group nodes with children', () => {
    const definition = {
      items: [{
        key: 'address', type: 'group', children: [
          { key: 'street', type: 'field', dataType: 'string' },
          { key: 'city', type: 'field', dataType: 'string' },
        ],
      }],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.children).toHaveLength(1);
    const group = tree.children[0];
    expect(group.component).toBe('Stack');
    expect(group.bind).toBe('address');
    expect(group.children).toHaveLength(2);
    expect(group.children[0].bind).toBe('street');
    expect(group.children[1].bind).toBe('city');
  });

  it('builds empty children array for group with no children', () => {
    const definition = {
      items: [{ key: 'section', type: 'group' }],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.children[0].children).toEqual([]);
  });

  it('always produces Stack root regardless of pageMode', () => {
    const definition = {
      items: [
        { key: 'name', type: 'field', dataType: 'string' },
        { key: 'age', type: 'field', dataType: 'integer' },
      ],
      formPresentation: { pageMode: 'wizard' },
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.component).toBe('Stack');
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].bind).toBe('name');
    expect(tree.children[1].bind).toBe('age');
  });

  it('preserves Section nodes marked _layout: true during reconcile', () => {
    const definition = {
      items: [
        { key: 'name', type: 'field', dataType: 'string' },
        { key: 'email', type: 'field', dataType: 'string' },
      ],
    } as any;
    const existing = {
      component: 'Stack', nodeId: 'root', children: [
        {
          component: 'Section', nodeId: 'p1', title: 'Page 1', _layout: true,
          children: [{ component: 'TextInput', bind: 'name' }],
        },
        { component: 'TextInput', bind: 'email' },
      ],
    };

    const tree = reconcileComponentTree(definition, existing);
    expect(tree.component).toBe('Stack');
    const page = tree.children.find((c: any) => c.component === 'Section');
    expect(page).toBeDefined();
    expect(page!._layout).toBe(true);
    expect(page!.title).toBe('Page 1');
    // 'name' should be inside the Page (extracted from flat list and placed back)
    expect(page!.children[0].bind).toBe('name');
    // 'email' should remain at root level
    expect(tree.children.find((c: any) => c.bind === 'email')).toBeDefined();
  });

  it('preserves layout wrappers at their original position', () => {
    const definition = {
      items: [
        { key: 'name', type: 'field', dataType: 'string' },
        { key: 'age', type: 'field', dataType: 'integer' },
      ],
    } as any;
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [
        { component: 'TextInput', bind: 'name' },
        { component: 'NumberInput', bind: 'age' },
        { component: 'SubmitButton', _layout: true, nodeId: 'submit' },
      ],
    };

    const tree = reconcileComponentTree(definition, existing);
    expect(tree.children).toHaveLength(3);
    expect(tree.children[2].component).toBe('SubmitButton');
  });

  it('keeps end-positioned layout wrapper at end after new fields are added', () => {
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [
        { component: 'TextInput', bind: 'name' },
        { component: 'SubmitButton', _layout: true, nodeId: 'submit' },
      ],
    };

    // Definition now has an additional field
    const definition = {
      items: [
        { key: 'name', type: 'field', dataType: 'string' },
        { key: 'email', type: 'field', dataType: 'string' },
        { key: 'age', type: 'field', dataType: 'integer' },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, existing);
    expect(tree.children).toHaveLength(4); // 3 fields + submit
    // Submit button should remain at the end, not at index 1
    expect(tree.children[3].component).toBe('SubmitButton');
    expect(tree.children[3]._layout).toBe(true);
  });

  it('keeps mid-positioned layout wrapper at its clamped position', () => {
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [
        { component: 'TextInput', bind: 'name' },
        { component: 'Divider', _layout: true, nodeId: 'divider' },
        { component: 'NumberInput', bind: 'age' },
        { component: 'SubmitButton', _layout: true, nodeId: 'submit' },
      ],
    };

    // Add a new field
    const definition = {
      items: [
        { key: 'name', type: 'field', dataType: 'string' },
        { key: 'age', type: 'field', dataType: 'integer' },
        { key: 'email', type: 'field', dataType: 'string' },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, existing);
    // divider was at index 1 (not last) → stays at index 1
    expect(tree.children[1].component).toBe('Divider');
    // submit was last → stays last
    expect(tree.children[tree.children.length - 1].component).toBe('SubmitButton');
  });

  it('handles multiple layout wrappers, only the last one tracks wasLast', () => {
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [
        { component: 'Banner', _layout: true, nodeId: 'banner' },
        { component: 'TextInput', bind: 'name' },
        { component: 'Divider', _layout: true, nodeId: 'divider' },
        { component: 'NumberInput', bind: 'age' },
        { component: 'SubmitButton', _layout: true, nodeId: 'submit' },
      ],
    };

    // Add two new fields
    const definition = {
      items: [
        { key: 'name', type: 'field', dataType: 'string' },
        { key: 'age', type: 'field', dataType: 'integer' },
        { key: 'email', type: 'field', dataType: 'string' },
        { key: 'phone', type: 'field', dataType: 'string' },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, existing);
    // Banner at 0 (was at 0, not last → stays at 0)
    expect(tree.children[0].component).toBe('Banner');
    // Divider was at 2 (not last) → clamped to min(2, ...)
    expect(tree.children[2].component).toBe('Divider');
    // Submit was last → must be at end
    expect(tree.children[tree.children.length - 1].component).toBe('SubmitButton');
  });

  it('preserves wasLast wrapper inside a nested group', () => {
    const definition = {
      items: [{
        key: 'section', type: 'group', children: [
          { key: 'a', type: 'field', dataType: 'string' },
          { key: 'b', type: 'field', dataType: 'string' },
          { key: 'c', type: 'field', dataType: 'string' },
        ],
      }],
    } as any;
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [{
        component: 'Stack',
        bind: 'section',
        children: [
          { component: 'TextInput', bind: 'a' },
          { component: 'Footer', _layout: true, nodeId: 'footer' },
        ],
      }],
    };

    const tree = reconcileComponentTree(definition, existing);
    const section = tree.children[0];
    // Footer was last in section → stays last even after b and c are added
    expect(section.children[section.children.length - 1].component).toBe('Footer');
  });

  it('sets bind on display item with calculate bind', () => {
    const definition = {
      items: [
        { key: 'qty', type: 'field', dataType: 'integer' },
        { key: 'summary', type: 'display', label: 'Summary' },
      ],
      binds: [
        { path: 'summary', calculate: "format('Count: %s', $qty)" },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.children).toHaveLength(2);
    const summaryNode = tree.children[1];
    expect(summaryNode.component).toBe('Text');
    expect(summaryNode.bind).toBe('summary');
    expect(summaryNode.text).toBe('Summary');
    // Should NOT have nodeId — bind takes its place
    expect(summaryNode.nodeId).toBeUndefined();
  });

  it('keeps nodeId on display item without calculate bind', () => {
    const definition = {
      items: [
        { key: 'heading', type: 'display', label: 'Static heading' },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.children[0].nodeId).toBe('heading');
    expect(tree.children[0].bind).toBeUndefined();
  });

  it('respects widgetHint on calculated display item', () => {
    const definition = {
      items: [
        { key: 'total_heading', type: 'display', label: 'Total', presentation: { widgetHint: 'Heading' } },
      ],
      binds: [
        { path: 'total_heading', calculate: "format('Total: $%s', $amount)" },
      ],
    } as any;

    const tree = reconcileComponentTree(definition, undefined);
    expect(tree.children[0].component).toBe('Heading');
    expect(tree.children[0].bind).toBe('total_heading');
  });

  it('maps duplicate leaf binds into sibling layout wrappers when clones lack definitionItemPath', () => {
    const definition = {
      items: [
        { key: 'g1', type: 'group', children: [{ key: 'title', type: 'field', dataType: 'string' }] },
        { key: 'g2', type: 'group', children: [{ key: 'title', type: 'field', dataType: 'string' }] },
      ],
    } as any;
    const existing = {
      component: 'Stack',
      nodeId: 'root',
      children: [
        {
          component: 'Card',
          _layout: true,
          nodeId: 'cardA',
          children: [{ component: 'TextInput', bind: 'title' }],
        },
        {
          component: 'Card',
          _layout: true,
          nodeId: 'cardB',
          children: [{ component: 'TextInput', bind: 'title' }],
        },
      ],
    };

    const tree = reconcileComponentTree(definition, existing);
    const cards = tree.children.filter((c: any) => c._layout && c.component === 'Card');
    expect(cards).toHaveLength(2);
    const byCardId = (id: string) => cards.find((c: any) => c.nodeId === id);
    expect(byCardId('cardA')?.children?.[0]?.definitionItemPath).toBe('g1.title');
    expect(byCardId('cardB')?.children?.[0]?.definitionItemPath).toBe('g2.title');
  });
});
