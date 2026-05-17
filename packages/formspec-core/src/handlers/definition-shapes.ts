/**
 * Command handlers for managing definition-level shapes (cross-field validation rules).
 *
 * Shapes are form-level constraints defined in `definition.shapes`. Unlike
 * field-level bind constraints (required, constraint, readonly), shapes
 * express cross-field or form-wide validation rules. Each shape targets one
 * or more fields via a path expression (supporting wildcards like
 * `items[*].field`), contains a FEL constraint expression that must evaluate
 * to true for the form to be valid, and carries a human-readable message
 * with a severity level (`error`, `warning`, or `info`).
 *
 * Shapes can be composed using boolean combinators (`and`, `or`, `xone`,
 * `not`) that reference other shapes by ID, enabling complex validation
 * logic to be built from smaller, reusable rules.
 *
 * Shapes do not affect the component tree layout, so all handlers in this
 * module return `{ rebuildComponentTree: false }`.
 *
 * @module definition-shapes
 */
import type { CommandHandler } from '../types.js';
import type { FormShape } from '@formspec-org/types';

/** Auto-incrementing counter used to generate default shape IDs when none is provided. */
let shapeCounter = 0;

export const definitionShapesHandlers = {

  'definition.addShape': (state, payload) => {
    const p = payload as Record<string, unknown>;
    if (!state.definition.shapes) state.definition.shapes = [];

    const shape: FormShape = {
      id: (p.id as string) ?? `shape_${++shapeCounter}`,
      target: p.target as string,
      message: (p.message as string) ?? '',
      severity: (p.severity as 'error' | 'warning' | 'info') ?? 'error',
    };

    if (p.constraint) shape.constraint = p.constraint as string;
    if (p.code) shape.code = p.code as string;
    if (p.activeWhen) shape.activeWhen = p.activeWhen as string;
    if (p.timing) shape.timing = p.timing as 'continuous' | 'submit' | 'demand';
    if (p.context) shape.context = p.context as Record<string, string>;

    state.definition.shapes.push(shape);
    return { rebuildComponentTree: false };
  },

  'definition.setShapeProperty': (state, payload) => {
    const { id, property, value } = payload as { id: string; property: string; value: unknown };
    const shape = state.definition.shapes?.find(s => s.id === id);
    if (!shape) throw new Error(`Shape not found: ${id}`);

    (shape as Record<string, unknown>)[property] = value;
    return { rebuildComponentTree: false };
  },

  'definition.setShapeComposition': (state, payload) => {
    const p = payload as { id: string; mode: string; refs?: string[]; ref?: string };
    const shape = state.definition.shapes?.find(s => s.id === p.id);
    if (!shape) throw new Error(`Shape not found: ${p.id}`);

    // Clear all composition modes and constraint
    delete shape.and;
    delete shape.or;
    delete shape.xone;
    delete shape.not;
    delete shape.constraint;

    if (p.mode === 'not') {
      shape.not = p.ref!;
    } else {
      (shape as Record<string, unknown>)[p.mode] = p.refs;
    }

    return { rebuildComponentTree: false };
  },

  'definition.renameShape': (state, payload) => {
    const { id, newId } = payload as { id: string; newId: string };
    const shapes = state.definition.shapes;
    if (!shapes) throw new Error(`Shape not found: ${id}`);

    const shape = shapes.find(s => s.id === id);
    if (!shape) throw new Error(`Shape not found: ${id}`);

    shape.id = newId;

    // Rewrite composition references in all other shapes
    for (const s of shapes) {
      if (s.and) s.and = s.and.map(r => r === id ? newId : r);
      if (s.or) s.or = s.or.map(r => r === id ? newId : r);
      if (s.xone) s.xone = s.xone.map(r => r === id ? newId : r);
      if (s.not === id) s.not = newId;
    }

    return { rebuildComponentTree: false };
  },

  'definition.deleteShape': (state, payload) => {
    const { id } = payload as { id: string };
    if (!state.definition.shapes) return { rebuildComponentTree: false };

    state.definition.shapes = state.definition.shapes.filter(s => s.id !== id);

    // Remove from compositions referencing deleted shape
    for (const s of state.definition.shapes) {
      if (s.and) s.and = s.and.filter(r => r !== id);
      if (s.or) s.or = s.or.filter(r => r !== id);
      if (s.xone) s.xone = s.xone.filter(r => r !== id);
      if (s.not === id) delete s.not;
    }

    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
