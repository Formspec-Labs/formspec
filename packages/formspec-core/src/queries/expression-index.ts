/**
 * Pure query functions for FEL expression indexing, parsing, and reference resolution.
 */
import type { FormInstance, FormItem, FormShape, FormVariable } from '@formspec-org/types';
import {
  getFELDependencies,
  normalizeIndexedPath,
} from '@formspec-org/engine/fel-runtime';
import { analyzeExpressionInDefinition, getBuiltinFELFunctionCatalog } from '@formspec-org/engine/fel-tools';
import { getCurrentComponentDocument } from '../component-documents.js';
import { forEachBindFelExpression, forEachItemFelExpression } from '../bind-fel.js';
import { currentComponentTree } from '../component-tree.js';
import { registryEntry } from '../registry-entry.js';
import type { MappingState } from '../types.js';
import { fieldPaths as getFieldPaths } from './field-queries.js';
import { itemAtIndexedPath, itemIndex } from '../item-index.js';
import type {
  ProjectState,
  Diagnostic,
  ExpressionLocation,
  FELParseContext,
  FELParseResult,
  FELReferenceSet,
  FELFunctionEntry,
} from '../types.js';

function resolveParseContext(context?: string | FELParseContext): FELParseContext {
  if (!context) return {};
  if (typeof context === 'string') return { targetPath: context };
  return context;
}

/** Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

function suggestions(candidates: string[]): string {
  if (candidates.length === 1) return `. Did you mean ${candidates[0]}?`;
  if (candidates.length > 1) return `. Did you mean one of: ${candidates.join(', ')}?`;
  return '';
}

/** Detect common FEL mistakes and prepend a helpful hint to the error message. */
function addFELHint(expression: string, message: string): string {
  if (/\btrue\s*\(/.test(expression) || /\bfalse\s*\(/.test(expression)) {
    return `Hint: "true" and "false" are literal values in FEL, not functions. Use them without parentheses (e.g., "$field = true"). Original error: ${message}`;
  }
  return message;
}

function parseAnalyzerWarning(raw: string): { code: string; message: string } {
  const m = raw.match(/^([A-Z0-9_]+):\s*(.+)$/);
  if (m) {
    return { code: m[1], message: m[2] };
  }
  return { code: 'FEL_TYPE_MISMATCH', message: raw };
}

/**
 * Parse and validate a FEL expression without saving it to project state.
 */
export function parseFEL(state: ProjectState, expression: string, context?: FELParseContext): FELParseResult {
  const resolved = context !== undefined ? resolveParseContext(context) : undefined;
  const registries = state.extensions.registries.map(registry => ({ entries: Object.values(registry.entries) }));
  const analysis = analyzeExpressionInDefinition(
    resolved ? state.definition : {}, expression, registries,
    resolved === undefined ? undefined : resolved.targetPath ?? '', Boolean(resolved?.mappingContext),
  );
  // Completion candidates are needed only when the resolver reports an unknown field.
  const available = resolved && analysis.findings.some(finding => finding.code === 'E402')
    ? availableReferences(state, resolved) : undefined;
  const typeWarnings = resolved === undefined ? [] : analysis.warnings.filter(
    (message) => !message.includes('requires at least') && !message.includes('accepts at most'),
  );

  const parseErrors: Diagnostic[] = analysis.errors.map((error) => ({
    artifact: 'definition',
    path: 'expression',
    severity: 'error',
    code: 'FEL_PARSE_ERROR',
    message: addFELHint(expression, error.message),
    ...(error.line !== undefined ? { line: error.line } : {}),
    ...(error.column !== undefined ? { column: error.column } : {}),
    ...(error.span !== undefined ? { span: error.span } : {}),
  }));

  const semanticErrors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  for (const finding of analysis.findings) {
    const { name } = finding;
    let code = finding.code;
    let message = finding.message;
    let severity = finding.severity;
    if (code === 'E401') {
      // Drafts may name a function before its extension is loaded.
      code = 'FEL_UNKNOWN_FUNCTION';
      severity = 'warning';
      const prefix = name.slice(0, 3);
      const candidates = felFunctionCatalog(state).map(entry => entry.name).filter(candidate =>
        (prefix.length >= 3 && candidate.startsWith(prefix)) || editDistance(name, candidate) <= 2);
      message += suggestions(candidates.map(candidate => `"${candidate}()"`));
    } else if (code === 'E402' && available) {
      code = 'FEL_UNKNOWN_REFERENCE';
      const suffix = name.split('.').pop()!;
      const candidates = available.fields.map(field => field.path)
        .filter(path => path === suffix || path.endsWith(`.${suffix}`));
      message += suggestions(candidates.map(path => `"$${path}"`));
      if (finding.variableHint || available.contextRefs.includes(`@${name}`)) {
        warnings.push({ artifact: 'definition', path: 'expression', severity: 'warning', code: 'FEL_SIGIL_HINT',
          message: `Did you mean @${name}? '$${name}' references a field, but '${name}' is a known variable.` });
      }
    } else if (code === 'E403') {
      code = 'FEL_UNKNOWN_VARIABLE';
    }
    (severity === 'warning' ? warnings : semanticErrors).push({
      artifact: 'definition', path: 'expression', severity, code, message,
    });
  }

  // Surface type-mismatch warnings from the typed analysis
  for (const msg of typeWarnings) {
    const parsed = parseAnalyzerWarning(msg);
    warnings.push({
      artifact: 'definition',
      path: 'expression',
      severity: 'warning',
      code: parsed.code,
      message: parsed.message,
    });
  }

  // Surface arity warnings from the Rust analyzer
  const arityWarnings = (analysis.warnings ?? []).filter(
    (msg) => msg.includes('requires at least') || msg.includes('accepts at most'),
  );
  for (const msg of arityWarnings) {
    warnings.push({
      artifact: 'definition',
      path: 'expression',
      severity: 'warning',
      code: 'FEL_ARITY_MISMATCH',
      message: msg,
    });
  }

  return {
    valid: analysis.valid && semanticErrors.length === 0,
    errors: [...parseErrors, ...semanticErrors],
    warnings,
    references: analysis.references,
    variables: analysis.variables,
    functions: analysis.functions,
  };
}

/**
 * Enumerate the full FEL function catalog: built-in plus extension functions.
 */
export function felFunctionCatalog(state: ProjectState): FELFunctionEntry[] {
  const catalog: FELFunctionEntry[] = getBuiltinFELFunctionCatalog().map((entry) => ({
    name: entry.name,
    category: entry.category,
    source: 'builtin',
    signature: entry.signature,
    description: entry.description,
  }));
  const seen = new Set(catalog.map((entry) => entry.name));

  for (const reg of state.extensions.registries) {
    for (const entry of Object.values(reg.entries)) {
      const e = registryEntry(entry);
      if (e.category === 'function' && typeof e.name === 'string' && !seen.has(e.name)) {
        catalog.push({
          name: e.name,
          category: typeof e.functionCategory === 'string'
            ? e.functionCategory
            : (typeof e.group === 'string' ? e.group : 'function'),
          source: 'extension',
          registryUrl: reg.url,
        });
        seen.add(e.name);
      }
    }
  }

  return catalog;
}

/**
 * Scope-aware list of valid FEL references at a given path.
 */
export function availableReferences(state: ProjectState, context?: string | FELParseContext): FELReferenceSet {
  const resolved = resolveParseContext(context);
  const contextPath = resolved.targetPath;
  const fields: FELReferenceSet['fields'] = [];
  const walk = (items: FormItem[], prefix: string) => {
    for (const item of items) {
      const path = prefix ? `${prefix}.${item.key}` : item.key;
      if (item.type === 'field') {
        fields.push({ path, dataType: item.dataType ?? 'string', label: item.label });
      }
      if (item.children) walk(item.children, path);
    }
  };
  walk(state.definition.items, '');

  const variables = (state.definition.variables ?? []).map((v: FormVariable) => ({
    name: v.name,
    expression: v.expression ?? '',
  }));

  const instances: FELReferenceSet['instances'] = [];
  const inst = state.definition.instances;
  if (inst) {
    for (const [name, entry] of Object.entries(inst)) {
      const instance: FormInstance = entry;
      instances.push({ name, source: instance.source });
    }
  }

  // Find the innermost repeatable group containing contextPath (if any).
  const contextRefs: string[] = [];
  let innermostRepeatPath: string | undefined;
  if (contextPath) {
    const normalized = normalizeIndexedPath(contextPath);
    const parts = normalized.split('.').filter(Boolean);
    for (let i = parts.length; i > 0; i--) {
      const candidate = parts.slice(0, i).join('.');
      const item = itemAtIndexedPath(state.definition.items, candidate);
      if (item?.type === 'group' && item.repeatable) {
        contextRefs.push('@current', '@index', '@count');
        innermostRepeatPath = candidate;
        break;
      }
    }
  }

  // Annotate field scope when contextPath is inside a repeatable group.
  // "local" = field path starts with the innermost repeat group path + ".".
  // "global" = everything else.
  if (innermostRepeatPath) {
    const prefix = innermostRepeatPath + '.';
    for (const field of fields) {
      field.scope = field.path.startsWith(prefix) ? 'local' : 'global';
    }
  }

  if (resolved.mappingContext) {
    contextRefs.push('@source', '@target');
  }

  return { fields, variables, instances, contextRefs: [...new Set(contextRefs)] };
}

/**
 * Enumerate all FEL expressions in the project with their artifact locations.
 */
export function allExpressions(state: ProjectState): ExpressionLocation[] {
  const results: ExpressionLocation[] = [];
  const def = state.definition;
  const pushExpression = (
    expression: string | undefined,
    artifact: ExpressionLocation['artifact'],
    location: string,
  ) => {
    if (!expression || typeof expression !== 'string') return;
    results.push({ expression, artifact, location });
  };

  // Bind expressions
  for (const bind of def.binds ?? []) {
    forEachBindFelExpression(bind, (prop, expression) => {
      pushExpression(expression, 'definition', `binds[${bind.path}].${prop}`);
    });
    const defaultValue = bind.default;
    if (typeof defaultValue === 'string' && defaultValue.startsWith('=')) {
      pushExpression(defaultValue.slice(1), 'definition', `binds[${bind.path}].default`);
    }
  }

  // Shape expressions
  for (const shape of def.shapes ?? []) {
    const s: FormShape = shape;
    pushExpression(s.constraint, 'definition', `shapes[${s.id}].constraint`);
    pushExpression(s.activeWhen, 'definition', `shapes[${s.id}].activeWhen`);
    if (s.context && typeof s.context === 'object') {
      for (const [key, value] of Object.entries(s.context)) {
        if (typeof value === 'string') {
          pushExpression(value, 'definition', `shapes[${s.id}].context.${key}`);
        }
      }
    }
  }

  // Variable expressions
  for (const v of def.variables ?? []) {
    const variable: FormVariable = v;
    pushExpression(variable.expression, 'definition', `variables[${variable.name}]`);
  }

  // Item-level FEL-bearing properties
  const itemVisited = new WeakSet<object>();
  const walkItems = (items: FormItem[], prefix: string) => {
    for (const item of items) {
      if (itemVisited.has(item as object)) continue;
      itemVisited.add(item as object);
      const path = prefix ? `${prefix}.${item.key}` : item.key;
      forEachItemFelExpression(item, (prop, expression) => {
        pushExpression(expression, 'definition', `items[${path}].${prop}`);
      });
      pushExpression(item.seedFrom?.where, 'definition', `items[${path}].seedFrom.where`);
      if (typeof item.initialValue === 'string' && item.initialValue.startsWith('=')) {
        pushExpression(item.initialValue.slice(1), 'definition', `items[${path}].initialValue`);
      }
      if (item.children) walkItems(item.children, path);
    }
  };
  walkItems(def.items, '');

  // Mapping rule expressions
  for (const [mid, m] of Object.entries(state.mappings)) {
    const mapping: MappingState = m;
    const rules = mapping.rules;
    if (rules) {
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const loc = mid === 'default' ? `rules[${i}]` : `mappings[${mid}].rules[${i}]`;
        pushExpression(rule.expression, 'mapping', `${loc}.expression`);
        pushExpression(rule.condition, 'mapping', `${loc}.condition`);
        if (rule.reverse && typeof rule.reverse === 'object') {
          pushExpression(rule.reverse.expression, 'mapping', `${loc}.reverse.expression`);
          pushExpression(rule.reverse.condition, 'mapping', `${loc}.reverse.condition`);
        }
        if (Array.isArray(rule.innerRules)) {
          for (let j = 0; j < rule.innerRules.length; j++) {
            const inner = rule.innerRules[j];
            pushExpression(inner.expression, 'mapping', `${loc}.innerRules[${j}].expression`);
            pushExpression(inner.condition, 'mapping', `${loc}.innerRules[${j}].condition`);
          }
        }
      }
    }
  }

  // Component document `when` guards
  const componentVisited = new WeakSet<object>();
  const walkComponentNode = (node: unknown, location: string) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (componentVisited.has(n)) return;
    componentVisited.add(n);
    if (typeof n.when === 'string') {
      pushExpression(n.when, 'component', `${location}.when`);
    }
    if (Array.isArray(n.children)) {
      for (let i = 0; i < n.children.length; i++) {
        walkComponentNode(n.children[i], `${location}.children[${i}]`);
      }
    }
  };

  const componentDoc = getCurrentComponentDocument(state);
  const tree = currentComponentTree(state);
  if (tree) {
    walkComponentNode(tree, 'tree');
  }

  const templateRegistry = componentDoc.components;
  if (templateRegistry && typeof templateRegistry === 'object') {
    for (const [name, template] of Object.entries(templateRegistry as Record<string, unknown>)) {
      const templateTree = (template as { tree?: unknown } | undefined)?.tree;
      if (templateTree) {
        walkComponentNode(templateTree, `components[${name}].tree`);
      }
    }
  }

  return results;
}

/**
 * List all field paths that a FEL expression references.
 */
export function expressionDependencies(_state: ProjectState, expression: string): string[] {
  return getFELDependencies(expression).fields;
}
