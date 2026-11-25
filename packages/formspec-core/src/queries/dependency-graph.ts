/**
 * Pure query functions for dependency analysis across FEL expressions.
 */
import {
  analyzeFEL,
  getFELDependencies,
  normalizeIndexedPath,
} from '@formspec-org/engine/fel-runtime';
import type { FormBind, FormShape, FormVariable } from '@formspec-org/types';
import { BIND_FEL_PROPERTIES, bindFelExpression, forEachBindFelExpression } from '../bind-fel.js';
import type {
  ProjectState,
  FieldDependents,
  MappingState,
} from '../types.js';

function bindDefaultFel(bind: FormBind): string | undefined {
  const value = bind.default;
  return typeof value === 'string' && value.startsWith('=') ? value.slice(1) : undefined;
}

/**
 * Reverse lookup: find all binds, shapes, variables, and mapping rules that
 * reference a given field.
 */
export function fieldDependents(state: ProjectState, fieldPath: string): FieldDependents {
  const result: FieldDependents = { binds: [], shapes: [], variables: [], mappingRules: [], screenerRoutes: [] };
  const def = state.definition;
  const target = normalizeIndexedPath(fieldPath);
  const expressionReferencesField = (expression: string): boolean => {
    const refs = getFELDependencies(expression).fields.map(ref => normalizeIndexedPath(ref));
    return refs.includes(target);
  };

  // Check binds
  for (const bind of def.binds ?? []) {
    forEachBindFelExpression(bind, (prop, expression) => {
      if (expressionReferencesField(expression)) {
        result.binds.push({ path: bind.path, property: prop });
      }
    });
    const defaultExpr = bindDefaultFel(bind);
    if (defaultExpr !== undefined && expressionReferencesField(defaultExpr)) {
      result.binds.push({ path: bind.path, property: 'default' });
    }
  }

  // Check shapes
  for (const shape of def.shapes ?? []) {
    const s: FormShape = shape;
    if (typeof s.constraint === 'string' && expressionReferencesField(s.constraint)) {
      result.shapes.push({ id: s.id, property: 'constraint' });
    }
    if (typeof s.activeWhen === 'string' && expressionReferencesField(s.activeWhen)) {
      result.shapes.push({ id: s.id, property: 'activeWhen' });
    }
    if (s.context && typeof s.context === 'object') {
      for (const [key, value] of Object.entries(s.context)) {
        if (typeof value === 'string' && expressionReferencesField(value)) {
          result.shapes.push({ id: s.id, property: `context.${key}` });
        }
      }
    }
  }

  // Check variables
  for (const v of def.variables ?? []) {
    const variable: FormVariable = v;
    if (typeof variable.expression === 'string' && expressionReferencesField(variable.expression)) {
      result.variables.push(variable.name);
    }
  }

  // Check mapping rules
  for (const [mid, m] of Object.entries(state.mappings)) {
    const mapping: MappingState = m;
    const rules = mapping.rules;
    if (rules) {
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const sourcePath = typeof rule.sourcePath === 'string' ? normalizeIndexedPath(rule.sourcePath) : undefined;
        const dependsOnField =
          sourcePath === target
          || (typeof rule.expression === 'string' && expressionReferencesField(rule.expression))
          || (typeof rule.condition === 'string' && expressionReferencesField(rule.condition));
        if (dependsOnField) {
          result.mappingRules.push(mid === 'default' ? `${i}` : `${mid}:${i}`);
        }
      }
    }
  }

  // Check screener evaluation routes (condition + score expressions)
  if (state.screener) {
    for (const phase of state.screener.evaluation) {
      for (let i = 0; i < phase.routes.length; i++) {
        const route = phase.routes[i];
        const condition = route.condition;
        const score = route.score;
        if (
          (typeof condition === 'string' && expressionReferencesField(condition)) ||
          (typeof score === 'string' && expressionReferencesField(score))
        ) {
          result.screenerRoutes.push({ phaseId: phase.id, routeIndex: i });
        }
      }
    }
  }

  return result;
}

/**
 * Find all bind paths whose FEL expressions reference a given variable.
 */
export function variableDependents(state: ProjectState, variableName: string): string[] {
  const paths: string[] = [];
  const referencesVariable = (expression: string): boolean => {
    const analysis = analyzeFEL(expression);
    return analysis.valid && analysis.variables.includes(variableName);
  };

  for (const bind of state.definition.binds ?? []) {
    for (const prop of BIND_FEL_PROPERTIES) {
      const expr = bindFelExpression(bind, prop);
      if (expr !== undefined && referencesVariable(expr)) {
        paths.push(bind.path);
        break;
      }
    }
  }

  return [...new Set(paths)];
}
