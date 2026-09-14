import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

describe('definition.setItemProperty', () => {
  it('sets a simple property on a field', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });

    project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'name', property: 'label', value: 'Full Name' },
    });

    expect(project.definition.items[0].label).toBe('Full Name');
  });

  it('sets description and hint', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f' } });

    project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'f', property: 'description', value: 'Desc' },
    });
    project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'f', property: 'hint', value: 'A hint' },
    });

    expect(project.definition.items[0].description).toBe('Desc');
    expect(project.definition.items[0].hint).toBe('A hint');
  });

  it('sets group repeatable property', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });

    project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'g', property: 'repeatable', value: true },
    });

    expect(project.definition.items[0].repeatable).toBe(true);
  });

  it('sets nested property via dot-path', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f', parentPath: 'g' } });

    project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'g.f', property: 'label', value: 'Nested Label' },
    });

    expect(project.definition.items[0].children![0].label).toBe('Nested Label');
  });

  it('sets nested property path on the target item', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'amount' } });

    project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'amount', property: 'presentation.widgetHint', value: 'currency' },
    });

    expect((project.definition.items[0] as any).presentation?.widgetHint).toBe('currency');
  });

  it('throws when setting a field-only property on a group item', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g' } });

    expect(() => project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'g', property: 'optionSet', value: 'choices' },
    })).toThrow('only valid for field items');
  });

  it('throws when setting a group-only property on a field item', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f' } });

    expect(() => project.dispatch({
      type: 'definition.setItemProperty',
      payload: { path: 'f', property: 'repeatable', value: true },
    })).toThrow('only valid for group items');
  });
});

describe('definition.setFieldDataType', () => {
  it('changes the dataType of a field', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'age', dataType: 'string' } });

    project.dispatch({
      type: 'definition.setFieldDataType',
      payload: { path: 'age', dataType: 'integer' },
    });

    expect(project.definition.items[0].dataType).toBe('integer');
  });
});

describe('definition.setFieldOptions', () => {
  it('sets inline options on a choice field', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'color', dataType: 'choice' } });

    const options = [
      { value: 'red', label: 'Red' },
      { value: 'blue', label: 'Blue' },
    ];
    project.dispatch({
      type: 'definition.setFieldOptions',
      payload: { path: 'color', options },
    });

    expect(project.definition.items[0].options).toEqual(options);
  });

  it('sets an optionSet URI string', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'status', dataType: 'choice' } });

    project.dispatch({
      type: 'definition.setFieldOptions',
      payload: { path: 'status', options: 'statusOptions' },
    });

    expect(project.definition.items[0].optionSet).toBe('statusOptions');
  });
});

describe('definition.setBind', () => {
  it('creates a bind with multiple properties', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });

    project.dispatch({
      type: 'definition.setBind',
      payload: {
        path: 'email',
        properties: {
          required:  'true',
          constraint: 'matches($email, "^[^@]+@[^@]+$")',
          constraintMessage: 'Invalid email',
        },
      },
    });

    const bind = project.definition.binds![0];
    expect(bind.path).toBe('email');
    expect(bind.required).toBe( 'true');
    expect(bind.constraint).toBe('matches($email, "^[^@]+@[^@]+$")');
    expect(bind.constraintMessage).toBe('Invalid email');
  });

  it('removes a property when set to null', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f' } });
    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'f', properties: { required:  'true', calculate: '$a + $b' } },
    });

    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'f', properties: { required: null } },
    });

    const bind = project.definition.binds![0];
    expect(bind.required).toBeUndefined();
    expect(bind.calculate).toBe('$a + $b');
  });

  it('removes the entire bind entry when all properties are null', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f' } });
    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'f', properties: { required:  'true' } },
    });

    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'f', properties: { required: null } },
    });

    expect(project.definition.binds ?? []).toHaveLength(0);
  });
});

describe('definition.setBind: multiple entries per path', () => {
  function projectWithBinds(binds: Array<Record<string, unknown>>) {
    return createRawProject({
      seed: {
        definition: {
          $formspec: '1.0', url: 'urn:binds', version: '1.0.0', status: 'draft', title: 'T',
          items: [
            { type: 'field', key: 'age', label: 'Age', dataType: 'integer' },
            { type: 'field', key: 'name', label: 'Name', dataType: 'string' },
            {
              type: 'group', key: 'jobs', label: 'Jobs', repeatable: true,
              children: [{ type: 'field', key: 'hours', label: 'Hours', dataType: 'integer' }],
            },
          ],
          binds,
        } as any,
      },
    });
  }

  it('clearing a property removes it from every entry for the path', () => {
    const project = projectWithBinds([
      { path: 'age', required: 'true' },
      { path: 'name', required: 'true' },
      { path: 'age', constraint: '$age > 0', constraintMessage: 'Positive' },
    ]);

    project.dispatch({
      type: 'definition.setBind',
      payload: { path: 'age', properties: { constraint: null, constraintMessage: null } },
    });

    expect(project.bindFor('age')).toEqual({ required: 'true' });
    expect(project.definition.binds).toEqual([
      { path: 'age', required: 'true' },
      { path: 'name', required: 'true' },
    ]);
  });

  it('folds entries into one, preserving merge order, before applying properties', () => {
    const project = projectWithBinds([
      { path: 'age', required: 'false', readonly: 'true' },
      { path: 'age', required: 'true' },
    ]);

    project.dispatch({ type: 'definition.setBind', payload: { path: 'age', properties: { relevant: '$name != null' } } });

    expect(project.definition.binds).toEqual([
      { path: 'age', required: 'true', readonly: 'true', relevant: '$name != null' },
    ]);
  });

  it('removes the folded entry when every property is cleared', () => {
    const project = projectWithBinds([
      { path: 'age', required: 'true' },
      { path: 'age', constraint: '$age > 0' },
    ]);

    project.dispatch({ type: 'definition.setBind', payload: { path: 'age', properties: { required: null, constraint: null } } });

    expect(project.definition.binds ?? []).toEqual([]);
  });

  it('edits a [*] wildcard bind addressed by the item path, keeping the authored path', () => {
    const project = projectWithBinds([{ path: 'jobs[*].hours', constraint: '$ >= 0' }]);

    project.dispatch({ type: 'definition.setBind', payload: { path: 'jobs.hours', properties: { constraint: null, required: 'true' } } });

    expect(project.definition.binds).toEqual([{ path: 'jobs[*].hours', required: 'true' }]);
  });
});

describe('definition.setItemExtension', () => {
  it('sets an extension property', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });

    project.dispatch({
      type: 'definition.setItemExtension',
      payload: { path: 'email', extension: 'x-formspec-url', value: true },
    });

    expect((project.definition.items[0] as any).extensions?.['x-formspec-url']).toBe(true);
  });

  it('removes an extension when value is null', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    project.dispatch({
      type: 'definition.setItemExtension',
      payload: { path: 'email', extension: 'x-formspec-url', value: true },
    });

    project.dispatch({
      type: 'definition.setItemExtension',
      payload: { path: 'email', extension: 'x-formspec-url', value: null },
    });

    expect((project.definition.items[0] as any).extensions?.['x-formspec-url']).toBeUndefined();
  });
});
