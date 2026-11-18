import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

describe('definition.addShape', () => {
  it('adds a shape with auto-generated id', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'total' } });

    project.dispatch({
      type: 'definition.addShape',
      payload: {
        target: 'total',
        constraint: '$total > 0',
        message: 'Total must be positive',
        severity: 'error',
      },
    });

    expect(project.definition.shapes).toHaveLength(1);
    expect(project.definition.shapes![0].target).toBe('total');
    expect(project.definition.shapes![0].constraint).toBe('$total > 0');
    expect(project.definition.shapes![0].id).toBeTypeOf('string');
  });

  it('preserves an explicit explanation override on a warning Shape', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addShape',
      payload: { target: '#', constraint: 'false', message: 'Review', severity: 'warning', explanation: 'none' },
    });
    expect(project.definition.shapes![0].explanation).toBe('none');
  });

  it('uses explicit id when provided', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addShape',
      payload: { id: 'BUDGET_01', target: 'total', constraint: '$total > 0', message: 'Positive' },
    });

    expect(project.definition.shapes![0].id).toBe('BUDGET_01');
  });
});

describe('definition.setShapeProperty', () => {
  it('updates shape properties', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addShape',
      payload: { id: 'S1', target: 'x', constraint: '$x > 0', message: 'Msg' },
    });

    project.dispatch({
      type: 'definition.setShapeProperty',
      payload: { id: 'S1', property: 'message', value: 'Updated message' },
    });

    expect(project.definition.shapes![0].message).toBe('Updated message');
  });
});

describe('definition.deleteShape', () => {
  it('removes a shape by id', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addShape',
      payload: { id: 'S1', target: 'x', constraint: '$x > 0', message: 'M' },
    });
    project.dispatch({
      type: 'definition.addShape',
      payload: { id: 'S2', target: 'y', constraint: '$y > 0', message: 'M' },
    });

    project.dispatch({ type: 'definition.deleteShape', payload: { id: 'S1' } });

    expect(project.definition.shapes).toHaveLength(1);
    expect(project.definition.shapes![0].id).toBe('S2');
  });
});

describe('definition.setShapeComposition', () => {
  it('sets an AND composition over multiple shape IDs', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addShape', payload: { id: 'A', target: 'x', constraint: '$x > 0', message: 'MA' } },
      { type: 'definition.addShape', payload: { id: 'B', target: 'x', constraint: '$x < 100', message: 'MB' } },
      { type: 'definition.addShape', payload: { id: 'C', target: 'x', message: 'MC' } },
    ]);

    project.dispatch({
      type: 'definition.setShapeComposition',
      payload: { id: 'C', mode: 'and', refs: ['A', 'B'] },
    });

    const shape = project.definition.shapes!.find(s => s.id === 'C')!;
    expect(shape.and).toEqual(['A', 'B']);
    expect(shape.constraint).toBeUndefined();
  });

  it('sets a NOT composition over a single shape ID', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addShape', payload: { id: 'S1', target: 'x', constraint: '$x > 0', message: 'M1' } },
      { type: 'definition.addShape', payload: { id: 'S2', target: 'x', message: 'M2' } },
    ]);

    project.dispatch({
      type: 'definition.setShapeComposition',
      payload: { id: 'S2', mode: 'not', ref: 'S1' },
    });

    const shape = project.definition.shapes!.find(s => s.id === 'S2')!;
    expect(shape.not).toBe('S1');
  });

  it('clears previous composition mode when setting a new one', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addShape', payload: { id: 'A', target: 'x', constraint: '$x > 0', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'B', target: 'x', constraint: '$x < 100', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'C', target: 'x', message: 'M' } },
    ]);

    // First set AND
    project.dispatch({
      type: 'definition.setShapeComposition',
      payload: { id: 'C', mode: 'and', refs: ['A', 'B'] },
    });

    // Then switch to OR
    project.dispatch({
      type: 'definition.setShapeComposition',
      payload: { id: 'C', mode: 'or', refs: ['A'] },
    });

    const shape = project.definition.shapes!.find(s => s.id === 'C')!;
    expect(shape.or).toEqual(['A']);
    expect(shape.and).toBeUndefined();
  });

  it('supports xone composition', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addShape', payload: { id: 'A', target: 'x', constraint: '$x > 0', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'B', target: 'x', constraint: '$x > 10', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'C', target: 'x', message: 'M' } },
    ]);

    project.dispatch({
      type: 'definition.setShapeComposition',
      payload: { id: 'C', mode: 'xone', refs: ['A', 'B'] },
    });

    const shape = project.definition.shapes!.find(s => s.id === 'C')!;
    expect(shape.xone).toEqual(['A', 'B']);
  });
});

describe('definition.renameShape', () => {
  it('renames a shape and updates its id', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addShape',
      payload: { id: 'OLD_ID', target: 'x', constraint: '$x > 0', message: 'M' },
    });

    project.dispatch({
      type: 'definition.renameShape',
      payload: { id: 'OLD_ID', newId: 'NEW_ID' },
    });

    expect(project.definition.shapes![0].id).toBe('NEW_ID');
    expect(project.definition.shapes!.find(s => s.id === 'OLD_ID')).toBeUndefined();
  });

  it('rewrites composition references in other shapes', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addShape', payload: { id: 'A', target: 'x', constraint: '$x > 0', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'B', target: 'x', constraint: '$x < 100', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'COMP', target: 'x', message: 'M' } },
    ]);

    project.dispatch({
      type: 'definition.setShapeComposition',
      payload: { id: 'COMP', mode: 'and', refs: ['A', 'B'] },
    });

    // Rename A to A_RENAMED — COMP's and[] should update
    project.dispatch({
      type: 'definition.renameShape',
      payload: { id: 'A', newId: 'A_RENAMED' },
    });

    const comp = project.definition.shapes!.find(s => s.id === 'COMP')!;
    expect(comp.and).toEqual(['A_RENAMED', 'B']);
  });

  it('rewrites not composition references', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addShape', payload: { id: 'X', target: 'x', constraint: '$x > 0', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'Y', target: 'x', message: 'M' } },
    ]);

    project.dispatch({
      type: 'definition.setShapeComposition',
      payload: { id: 'Y', mode: 'not', ref: 'X' },
    });

    project.dispatch({
      type: 'definition.renameShape',
      payload: { id: 'X', newId: 'X_NEW' },
    });

    expect(project.definition.shapes!.find(s => s.id === 'Y')!.not).toBe('X_NEW');
  });
});

describe('definition.deleteShape — composition cleanup', () => {
  it('removes deleted shape from composition refs', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addShape', payload: { id: 'A', target: 'x', constraint: '$x > 0', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'B', target: 'x', constraint: '$x < 100', message: 'M' } },
      { type: 'definition.addShape', payload: { id: 'COMP', target: 'x', message: 'M' } },
    ]);

    project.dispatch({
      type: 'definition.setShapeComposition',
      payload: { id: 'COMP', mode: 'and', refs: ['A', 'B'] },
    });

    project.dispatch({ type: 'definition.deleteShape', payload: { id: 'A' } });

    const comp = project.definition.shapes!.find(s => s.id === 'COMP')!;
    expect(comp.and).toEqual(['B']);
  });
});

describe('definition.addVariable', () => {
  it('adds a named variable', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addVariable',
      payload: { name: 'subtotal', expression: '$a + $b' },
    });

    expect(project.definition.variables).toHaveLength(1);
    expect(project.definition.variables![0].name).toBe('subtotal');
    expect(project.definition.variables![0].expression).toBe('$a + $b');
  });

  it('auto-generates a name if omitted', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addVariable',
      payload: { expression: '42' },
    });

    expect(project.definition.variables![0].name).toBeTypeOf('string');
  });
});

describe('definition.setVariable', () => {
  it('updates variable expression', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addVariable',
      payload: { name: 'v1', expression: '1' },
    });

    project.dispatch({
      type: 'definition.setVariable',
      payload: { name: 'v1', property: 'expression', value: '$x * 2' },
    });

    expect(project.definition.variables![0].expression).toBe('$x * 2');
  });
});

describe('definition.deleteVariable', () => {
  it('removes a variable by name', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'v1', expression: '1' } });
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'v2', expression: '2' } });

    project.dispatch({ type: 'definition.deleteVariable', payload: { name: 'v1' } });

    expect(project.definition.variables).toHaveLength(1);
    expect(project.definition.variables![0].name).toBe('v2');
  });
});

describe('middleware', () => {
  it('wraps dispatch and can observe commands', () => {
    const log: string[] = [];

    const project = createRawProject({
      middleware: [
        (_state, commands, next) => {
          log.push(`before:${commands[0]?.[0]?.type}`);
          const result = next(commands);
          log.push(`after:${commands[0]?.[0]?.type}`);
          return result;
        },
      ],
    });

    project.dispatch({ type: 'definition.setFormTitle', payload: { title: 'Test' } });

    expect(log).toEqual(['before:definition.setFormTitle', 'after:definition.setFormTitle']);
    expect(project.definition.title).toBe('Test');
  });

  it('can block a command by not calling next', () => {
    const project = createRawProject({
      middleware: [
        (state, _commands, _next) => {
          return { newState: structuredClone(state) as any, results: [{ rebuildComponentTree: false }] };
        },
      ],
    });

    project.dispatch({ type: 'definition.setFormTitle', payload: { title: 'Blocked' } });

    expect(project.definition.title).toBe(''); // unchanged
  });
});
