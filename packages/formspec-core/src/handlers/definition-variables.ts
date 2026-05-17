/**
 * Command handlers for managing definition-level variables.
 *
 * Variables are form-level constants or computed values defined in the
 * `definition.variables` array. Each variable has a `name` and a FEL
 * (Formspec Expression Language) `expression` that can be referenced
 * from bind expressions, shape constraints, and other FEL contexts
 * throughout the form definition. An optional `scope` restricts
 * visibility to a specific section of the form.
 *
 * Variables do not affect the component tree layout, so all handlers
 * in this module return `{ rebuildComponentTree: false }`.
 *
 * @module definition-variables
 */
import type { CommandHandler } from '../types.js';
import type { FormVariable } from '@formspec-org/types';

/** Auto-incrementing counter used to generate default variable names when none is provided. */
let varCounter = 0;

export const definitionVariablesHandlers = {

  'definition.addVariable': (state, payload) => {
    const p = payload as Record<string, unknown>;
    if (!state.definition.variables) state.definition.variables = [];

    const variable: FormVariable = {
      name: (p.name as string) ?? `var_${++varCounter}`,
      expression: (p.expression as string) ?? '',
    };

    if (p.scope) variable.scope = p.scope as string;

    state.definition.variables.push(variable);
    return { rebuildComponentTree: false };
  },

  'definition.setVariable': (state, payload) => {
    const { name, property, value } = payload as { name: string; property: string; value: unknown };
    const variable = state.definition.variables?.find(v => v.name === name);
    if (!variable) throw new Error(`Variable not found: ${name}`);

    (variable as Record<string, unknown>)[property] = value;
    return { rebuildComponentTree: false };
  },

  'definition.deleteVariable': (state, payload) => {
    const { name } = payload as { name: string };
    if (!state.definition.variables) return { rebuildComponentTree: false };

    state.definition.variables = state.definition.variables.filter(v => v.name !== name);
    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
