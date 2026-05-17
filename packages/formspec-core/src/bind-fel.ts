/** @filedesc Shared FEL property names on binds and inline item constraints. */
import type { FieldRule, FormBind, FormItem, FormShape, FormVariable } from '@formspec-org/types';
import type { MappingState } from './types.js';

export const BIND_FEL_PROPERTIES = [
  'calculate',
  'relevant',
  'required',
  'readonly',
  'constraint',
] as const;

export type BindFelProperty = (typeof BIND_FEL_PROPERTIES)[number];

export const ITEM_FEL_PROPERTIES = [
  'relevant',
  'required',
  'readonly',
  'calculate',
  'constraint',
] as const;

export type ItemFelProperty = (typeof ITEM_FEL_PROPERTIES)[number];

/** FEL expression on a bind property, if present and string-typed. */
export function bindFelExpression(bind: FormBind, prop: BindFelProperty): string | undefined {
  const value = bind[prop];
  if (prop === 'required') {
    return typeof value === 'string' ? value : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

export function forEachBindFelExpression(
  bind: FormBind,
  visit: (prop: BindFelProperty, expression: string) => void,
): void {
  for (const prop of BIND_FEL_PROPERTIES) {
    const expr = bindFelExpression(bind, prop);
    if (expr !== undefined) visit(prop, expr);
  }
}

export function forEachItemFelExpression(
  item: FormItem,
  visit: (prop: ItemFelProperty, expression: string) => void,
): void {
  for (const prop of ITEM_FEL_PROPERTIES) {
    const value = item[prop];
    if (typeof value === 'string') visit(prop, value);
  }
}

export function rewriteBindFelExpressions(bind: FormBind, rewrite: (expr: string) => string): void {
  for (const prop of BIND_FEL_PROPERTIES) {
    const expr = bindFelExpression(bind, prop);
    if (expr === undefined) continue;
    const next = rewrite(expr);
    if (prop === 'required') bind.required = next;
    else bind[prop] = next;
  }
  const defaultValue = bind.default;
  if (typeof defaultValue === 'string' && defaultValue.startsWith('=')) {
    bind.default = `=${rewrite(defaultValue.slice(1))}`;
  }
}

export function rewriteShapeFelExpressions(
  shape: FormShape,
  rewritePath: (path: string) => string,
  rewriteExpr: (expr: string) => string,
): void {
  shape.target = rewritePath(shape.target);
  if (shape.constraint) shape.constraint = rewriteExpr(shape.constraint);
  if (shape.activeWhen) shape.activeWhen = rewriteExpr(shape.activeWhen);
  if (shape.context) {
    for (const [key, value] of Object.entries(shape.context)) {
      if (typeof value === 'string') shape.context[key] = rewriteExpr(value);
    }
  }
}

export function rewriteItemFelExpressions(item: FormItem, rewrite: (expr: string) => string): void {
  forEachItemFelExpression(item, (prop, expression) => {
    item[prop] = rewrite(expression);
  });
  if (typeof item.initialValue === 'string' && item.initialValue.startsWith('=')) {
    item.initialValue = `=${rewrite(item.initialValue.slice(1))}`;
  }
}

export function rewriteVariableExpression(variable: FormVariable, rewrite: (expr: string) => string): void {
  if (variable.expression) variable.expression = rewrite(variable.expression);
}

export function allMappingRules(mappings: Record<string, MappingState>): FieldRule[] {
  return Object.values(mappings).flatMap(m => m.rules ?? []);
}

export function rewriteMappingRuleFieldRefs(
  rule: FieldRule,
  rewritePath: (path: string) => string,
  rewriteExpr: (expr: string) => string,
): void {
  if (typeof rule.sourcePath === 'string') {
    rule.sourcePath = rewritePath(rule.sourcePath);
  }
  for (const prop of ['expression', 'condition'] as const) {
    const value = rule[prop];
    if (typeof value === 'string') rule[prop] = rewriteExpr(value);
  }
  const reverse = rule.reverse;
  if (reverse && typeof reverse === 'object') {
    const block = reverse as Record<string, unknown>;
    if (typeof block.sourcePath === 'string') block.sourcePath = rewritePath(block.sourcePath);
    if (typeof block.targetPath === 'string') block.targetPath = rewritePath(block.targetPath);
    for (const prop of ['expression', 'condition'] as const) {
      const value = block[prop];
      if (typeof value === 'string') block[prop] = rewriteExpr(value);
    }
  }
  if (Array.isArray(rule.innerRules)) {
    for (const inner of rule.innerRules) {
      rewriteMappingRuleFieldRefs(inner, rewritePath, rewriteExpr);
    }
  }
}
