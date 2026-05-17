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
import { fieldPaths as getFieldPaths } from './field-queries.js';
import { allExpressions } from './expression-index.js';
import type {
  ProjectState,
  DependencyGraph,
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
    const refs = getFELDependencies(expression).map(ref => normalizeIndexedPath(ref));
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

/**
 * Build a full dependency graph across all FEL expressions in the project.
 */
export function dependencyGraph(state: ProjectState): DependencyGraph {
  const nodes: DependencyGraph['nodes'] = [];
  const edges: DependencyGraph['edges'] = [];
  const def = state.definition;
  const nodeIds = new Set<string>();
  const addNode = (id: string, type: 'field' | 'variable' | 'shape') => {
    if (nodeIds.has(id)) return;
    nodeIds.add(id);
    nodes.push({ id, type });
  };
  const addEdge = (from: string, to: string, via: string) => {
    edges.push({ from, to, via });
  };
  const addExpressionEdges = (expression: string, to: string, via: string) => {
    const analysis = analyzeFEL(expression);
    if (!analysis.valid) return;
    for (const ref of analysis.references) {
      addEdge(normalizeIndexedPath(ref), normalizeIndexedPath(to), via);
    }
    for (const variable of analysis.variables) {
      addEdge(variable, normalizeIndexedPath(to), via);
    }
  };

  // Add field nodes
  for (const path of getFieldPaths(state)) {
    addNode(path, 'field');
  }

  // Add variable nodes
  for (const v of def.variables ?? []) {
    const variable: FormVariable = v;
    addNode(variable.name, 'variable');
  }

  // Add shape nodes
  for (const s of def.shapes ?? []) {
    const shape: FormShape = s;
    addNode(shape.id, 'shape');
  }

  // Build edges from binds
  for (const bind of def.binds ?? []) {
    forEachBindFelExpression(bind, (prop, expression) => {
      addExpressionEdges(expression, bind.path, prop);
    });
    const defaultExpr = bindDefaultFel(bind);
    if (defaultExpr !== undefined) {
      addExpressionEdges(defaultExpr, bind.path, 'default');
    }
  }

  // Build edges from variables
  for (const v of def.variables ?? []) {
    const variable: FormVariable = v;
    if (typeof variable.expression === 'string') {
      addExpressionEdges(variable.expression, variable.name, 'variable');
    }
  }

  // Build edges from shapes
  for (const shape of def.shapes ?? []) {
    const s: FormShape = shape;
    if (typeof s.constraint === 'string') {
      addExpressionEdges(s.constraint, s.id, 'shape.constraint');
    }
    if (typeof s.activeWhen === 'string') {
      addExpressionEdges(s.activeWhen, s.id, 'shape.activeWhen');
    }
    if (s.context && typeof s.context === 'object') {
      for (const [key, value] of Object.entries(s.context as Record<string, unknown>)) {
        if (typeof value === 'string') {
          addExpressionEdges(value, s.id, `shape.context.${key}`);
        }
      }
    }
  }

  // Detect cycles using DFS
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    const toSet = adjacency.get(edge.from) ?? new Set<string>();
    toSet.add(edge.to);
    adjacency.set(edge.from, toSet);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];
  const cycleKeys = new Set<string>();

  const dfs = (node: string) => {
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!visited.has(next)) {
        dfs(next);
        continue;
      }
      if (!inStack.has(next)) continue;
      const start = stack.indexOf(next);
      if (start < 0) continue;
      const cycle = stack.slice(start);
      const key = cycle.join('->');
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push(cycle);
      }
    }

    stack.pop();
    inStack.delete(node);
  };

  for (const node of nodeIds) {
    if (!visited.has(node)) dfs(node);
  }

  return { nodes, edges, cycles };
}
