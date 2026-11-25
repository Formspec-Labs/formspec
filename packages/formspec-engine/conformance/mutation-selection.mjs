/** @filedesc Conservative scoped dependency selection for rule-mutation coverage over grouped Definitions. */
import { execFileSync } from 'node:child_process';
import { analyzeFEL } from '../dist/fel/fel-api-runtime.js';
import { wasmCollectFelRewriteTargets, wasmExtractDependencies } from '../dist/wasm-bridge-tools.js';
import { normalizeTemplatePath } from './mutations.mjs';

const WHOLE_FORM_EXPECTED_KEYS = [
  'valid',
  'counts',
  'results',
  'data',
  'diagnostics',
  'undeclaredDataPaths',
];

const BUILTIN_MIP_FUNCS = new Set(['valid', 'relevant', 'required', 'readonly']);
const BUILTIN_ROW_COUNT_FUNCS = new Set(['count', 'length']);

/** Build Rust/WASM `DependencyQuery` descriptors for each conformance case. */
export function buildCaseQueries(cases, ledger = { entries: {} }) {
  return cases.map((doc) => {
    const ledgerEntry = ledger?.entries?.[doc.id];
    if (ledgerEntry && (Object.keys(ledgerEntry.ts ?? {}).length > 0 || Object.keys(ledgerEntry.rust ?? {}).length > 0)) {
      return { kind: 'unbounded' };
    }
    if (doc.operations?.length || doc.expectedCandidate !== undefined) {
      return { kind: 'unbounded' };
    }
    if (doc.kind === 'FEL_EVALUATION') {
      if (doc.site === undefined) return { kind: 'unbounded' };
      return {
        kind: 'fel',
        expression: doc.expression,
        site: doc.site,
        originNew: doc.origin === 'new',
      };
    }
    if (doc.kind === 'ENGINE_PROCESSING' || doc.kind === 'VALIDATION_REPORT') {
      const expected = doc.expected ?? {};
      if (WHOLE_FORM_EXPECTED_KEYS.some((key) => Object.hasOwn(expected, key))) {
        return { kind: 'unbounded' };
      }
      const dataPaths = (expected.dataAt ?? []).map((entry) => entry.path);
      const statePaths = Object.keys(expected.states ?? {});
      const validationPaths = [];
      const validationPrefixes = [];
      for (const matcher of [...(expected.present ?? []), ...(expected.absent ?? [])]) {
        if (typeof matcher.path === 'string' && matcher.path.length > 0) {
          validationPaths.push(matcher.path);
        } else if (typeof matcher.pathPrefix === 'string' && matcher.pathPrefix.length > 0) {
          validationPrefixes.push(matcher.pathPrefix);
        } else {
          // Unscoped result matcher (`{ code: 'REQUIRED' }` without path/pathPrefix) observes the whole form.
          return { kind: 'unbounded' };
        }
      }
      if (!dataPaths.length && !statePaths.length && !validationPaths.length && !validationPrefixes.length) {
        return { kind: 'unbounded' };
      }
      return {
        kind: 'targets',
        dataPaths,
        statePaths,
        validationPaths,
        validationPrefixes,
        originNew: doc.origin === 'new',
      };
    }
    return { kind: 'unbounded' };
  });
}

/** Whether a single mutation can affect a case with the given conservative `ReadScope` (`null` = unbounded). */
export function mutationOverlapsScope(mutation, scope) {
  if (!scope) return true;
  if (mutation.isGlobalNrb) return Boolean(scope.includeNrb);
  if (mutation.shapeIndex !== undefined) {
    return scope.shapes.has(mutation.shapeIndex);
  }
  if (mutation.optionSet !== undefined) {
    return scope.optionSets.has(mutation.optionSet);
  }
  if (mutation.variable !== undefined) {
    return scope.variables.has(mutation.variable);
  }
  const templateTarget = normalizeTemplatePath(mutation.target);
  if (!templateTarget) return true;
  return scope.itemPaths.has(templateTarget);
}

/** Invoke the native Rust `formspec-eval` scoped dependency analyzer (`conformance-case --deps`). */
export function analyzeScopedDependenciesRust(definition, queries, nativeBin) {
  const stdout = execFileSync(nativeBin, ['--deps'], {
    input: JSON.stringify({ definition, queries }),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const raw = JSON.parse(stdout);
  return raw.map((scope) => (scope
    ? {
        itemPaths: new Set(scope.itemPaths ?? []),
        shapes: new Set(scope.shapes ?? []),
        optionSets: new Set(scope.optionSets ?? []),
        variables: new Set(scope.variables ?? []),
        includeNrb: Boolean(scope.includeNrb),
      }
    : null));
}

// --- In-process scoped dependency analyzer mirroring `crates/formspec-eval/src/recalculate/dependency_scope.rs` ---

function normalizeConcreteSite(raw) {
  return String(raw ?? '').replace(/\[\d+\]/g, '[0]');
}

function stripIndices(raw) {
  return String(raw ?? '').replace(/\[(?:\*|\d+)\]/g, '');
}

function lexicalScopes(site) {
  const out = [];
  let cur = site;
  while (cur && cur !== '#') {
    out.push(cur);
    const dot = cur.lastIndexOf('.');
    if (dot === -1) break;
    cur = cur.slice(0, dot);
  }
  return out;
}

function parentSite(path) {
  const dot = path.lastIndexOf('.');
  return dot > 0 ? path.slice(0, dot) : null;
}

function isDescendantSite(candidate, prefix) {
  return candidate.startsWith(`${prefix}.`) || candidate.startsWith(`${prefix}[`);
}

function recordTemplateAndAncestors(sitePath, out) {
  let cur = stripIndices(sitePath);
  if (!cur || cur === '#') return;
  while (cur) {
    out.add(cur);
    const dot = cur.lastIndexOf('.');
    if (dot === -1) break;
    cur = cur.slice(0, dot);
  }
}

function normalizeBinds(binds) {
  if (Array.isArray(binds)) return binds;
  if (binds && typeof binds === 'object') {
    return Object.entries(binds).map(([path, bind]) => ({ path, ...(bind ?? {}) }));
  }
  return [];
}

function defaultReadExtractor(expression) {
  const info = analyzeFEL(expression);
  if (!info.valid) return null;
  const deps = wasmExtractDependencies(expression);
  const targets = wasmCollectFelRewriteTargets(expression);
  return {
    fields: deps.fields ?? [],
    fieldPaths: targets.fieldPaths ?? [],
    currentPaths: targets.currentPaths ?? [],
    variables: [...new Set([...(info.variables ?? []), ...(targets.variables ?? [])])],
    navigationTargets: targets.navigationTargets ?? [],
    mipDeps: deps.mipDeps ?? [],
    functions: info.functions ?? [],
    hasSelfRef: Boolean(deps.hasSelfRef),
    hasWildcard: Boolean(deps.hasWildcard),
    usesPrevNext: Boolean(deps.usesPrevNext),
  };
}

/**
 * Compute conservative `ReadScope | null` per query in-process using Rust's WASM FEL extractors
 * and the exact `ScopeIndex` / `CalculateOrder` scoped resolution rules for grouped Definitions.
 */
export function analyzeScopedDependenciesWasm(definition, queries, extractExpr = defaultReadExtractor) {
  const unbounded = () => queries.map(() => null);
  if (definition.screener || definition.$ref) return unbounded();

  // Build representative item tree (1 row `[0]` per repeatable group, matching Rust `representative_row_counts`).
  const itemSites = [];
  const siteSet = new Set();
  const siteDataTypes = new Map();
  const repeatSites = new Set();
  const declarations = new Set();
  const templateToSites = new Map();
  const pathsByKey = new Map();
  const itemOptionSets = new Map();
  const itemCreationExprs = new Map();

  let bailout = false;
  function declareTemplate(tmpl) {
    let cur = tmpl;
    while (cur) {
      declarations.add(cur);
      const dot = cur.lastIndexOf('.');
      if (dot === -1) break;
      cur = cur.slice(0, dot);
    }
  }

  function walkItems(nodes, sitePrefix, tmplPrefix) {
    for (const item of nodes ?? []) {
      if (!item || typeof item.key !== 'string') {
        bailout = true;
        return;
      }
      if (item.prePopulate !== undefined || item.seedFrom !== undefined) {
        bailout = true;
        return;
      }
      const sitePath = sitePrefix ? `${sitePrefix}.${item.key}` : item.key;
      const tmplPath = tmplPrefix ? `${tmplPrefix}.${item.key}` : item.key;
      itemSites.push(sitePath);
      siteSet.add(sitePath);
      declareTemplate(tmplPath);
      if (!pathsByKey.has(item.key)) pathsByKey.set(item.key, tmplPath);
      if (!templateToSites.has(tmplPath)) templateToSites.set(tmplPath, []);
      templateToSites.get(tmplPath).push(sitePath);
      if (item.dataType) siteDataTypes.set(tmplPath, item.dataType);
      if (item.optionSet) itemOptionSets.set(tmplPath, item.optionSet);
      if (typeof item.initialValue === 'string' && item.initialValue.startsWith('=')) {
        const list = itemCreationExprs.get(tmplPath) ?? [];
        list.push(item.initialValue.slice(1));
        itemCreationExprs.set(tmplPath, list);
      }
      if (item.repeatable) {
        repeatSites.add(sitePath);
      }
      if (Array.isArray(item.children)) {
        if (item.type === 'field') {
          walkItems(item.children, sitePrefix, tmplPrefix);
        } else if (item.repeatable) {
          walkItems(item.children, `${sitePath}[0]`, tmplPath);
        } else {
          walkItems(item.children, sitePath, tmplPath);
        }
      }
    }
  }
  walkItems(definition.items ?? [], '', '');
  if (bailout) return unbounded();

  // Merge binds by normalized template path (preserving document order override semantics).
  const bindsByTemplate = new Map();
  const itemHasRelevant = new Set();
  for (const bind of normalizeBinds(definition.binds)) {
    const tmpl = stripIndices(bind.path);
    const merged = { ...(bindsByTemplate.get(tmpl) ?? {}), ...bind };
    bindsByTemplate.set(tmpl, merged);
    if (bind.relevant !== undefined) itemHasRelevant.add(tmpl);
  }

  // Expand Shape targets (replacing `[*]` with `[0]`).
  const shapes = definition.shapes ?? [];
  const shapeIdToIndex = new Map();
  shapes.forEach((s, i) => {
    if (s?.id) shapeIdToIndex.set(s.id, i);
  });
  const allShapesAt = new Map();
  const errorShapesAt = new Map();
  for (const [i, shape] of shapes.entries()) {
    const target = String(shape.target ?? '').replace(/\[\*\]/g, '[0]');
    const isError = shape.severity !== 'warning' && shape.severity !== 'info';
    if (!allShapesAt.has(target)) allShapesAt.set(target, []);
    allShapesAt.get(target).push(i);
    if (isError) {
      if (!errorShapesAt.has(target)) errorShapesAt.set(target, []);
      errorShapesAt.get(target).push(i);
    }
  }

  // Map variables by representative scope site.
  const variableScopes = new Map(); // key: `${scope}:${name}` -> { scope, name, expression }
  for (const variable of definition.variables ?? []) {
    const rawScope = variable.scope ?? '#';
    let sites;
    if (rawScope === '#' || rawScope === '') {
      sites = ['#'];
    } else {
      const resolvedTmpl = pathsByKey.get(rawScope) ?? stripIndices(rawScope);
      const baseSites = templateToSites.get(resolvedTmpl) ?? [];
      sites = baseSites.map((s) => (repeatSites.has(s) ? `${s}[0]` : s));
    }
    for (const scopeSite of sites) {
      variableScopes.set(`${scopeSite}:${variable.name}`, {
        scope: scopeSite,
        name: variable.name,
        expression: variable.expression,
      });
    }
  }

  function resolveHead(sitePath, name) {
    for (const scope of lexicalScopes(sitePath)) {
      if (repeatSites.has(scope)) continue;
      const candidate = `${scope}.${name}`;
      if (declarations.has(stripIndices(candidate))) return candidate;
    }
    return name;
  }

  function currentRowPath(sitePath) {
    const open = sitePath.lastIndexOf('[');
    if (open === -1) return null;
    const close = sitePath.indexOf(']', open);
    if (close === -1) return null;
    return sitePath.slice(0, close + 1);
  }

  function owningSite(path) {
    if (siteSet.has(path)) return path;
    let cur = path;
    while (cur) {
      const idx = Math.max(cur.lastIndexOf('.'), cur.lastIndexOf('['));
      if (idx <= 0) break;
      cur = cur.slice(0, idx);
      if (siteSet.has(cur)) return cur;
    }
    return null;
  }

  function resolveRefPath(sitePath, rawRef) {
    const clean = String(rawRef).replace(/^\$/, '');
    const parts = clean.split('.');
    const firstRaw = parts[0];
    const bracket = firstRaw.indexOf('[');
    const headName = bracket === -1 ? firstRaw : firstRaw.slice(0, bracket);
    const headSuffix = bracket === -1 ? '' : firstRaw.slice(bracket);
    const resolvedHead = resolveHead(sitePath, headName);
    const tail = parts.slice(1).join('.');
    const combined = `${resolvedHead}${headSuffix}${tail ? `.${tail}` : ''}`;
    return combined.replace(/\[(?:\*|\d+)\]/g, '[0]');
  }

  const edges = new Map(); // vertexKey -> Set<vertexKey>
  const unboundedVertices = new Set();
  const addEdge = (from, to) => {
    let set = edges.get(from);
    if (!set) {
      set = new Set();
      edges.set(from, set);
    }
    set.add(to);
  };

  function pushDescendants(prefix, out) {
    for (const candidate of itemSites) {
      if (isDescendantSite(candidate, prefix)) out.push(`val:${candidate}`);
    }
  }

  function collectExpressionTargets(expression, sitePath, out) {
    const extracted = extractExpr(expression);
    if (!extracted) return { valid: false, bounded: false };

    const allFieldRefs = new Set([...(extracted.fields ?? []), ...(extracted.fieldPaths ?? [])]);
    for (const rawRef of allFieldRefs) {
      const resolved = resolveRefPath(sitePath, rawRef);
      const owner = owningSite(resolved);
      if (owner) {
        out.push(`val:${owner}`);
        if (!siteDataTypes.has(stripIndices(owner))) {
          pushDescendants(owner, out);
        }
      } else if (itemSites.some((c) => isDescendantSite(c, resolved))) {
        pushDescendants(resolved, out);
      }
    }

    for (const curTail of extracted.currentPaths ?? []) {
      const row = currentRowPath(sitePath);
      if (!row) return { valid: true, bounded: false };
      const resolved = `${row}.${curTail}`.replace(/\[(?:\*|\d+)\]/g, '[0]');
      const owner = owningSite(resolved);
      if (owner) {
        out.push(`val:${owner}`);
        if (!siteDataTypes.has(stripIndices(owner))) pushDescendants(owner, out);
      }
    }

    for (const nav of extracted.navigationTargets ?? []) {
      const row = currentRowPath(sitePath);
      if (nav.functionName === 'prev' || nav.functionName === 'next') {
        if (!row) return { valid: true, bounded: false };
        const resolved = `${row}.${nav.name}`.replace(/\[(?:\*|\d+)\]/g, '[0]');
        const owner = owningSite(resolved);
        if (owner) out.push(`val:${owner}`);
      } else if (nav.functionName === 'parent') {
        const base = row ? parentSite(row) : parentSite(sitePath);
        if (base === null) return { valid: true, bounded: false };
        const resolved = base ? `${base}.${nav.name}` : nav.name;
        const owner = owningSite(resolved.replace(/\[(?:\*|\d+)\]/g, '[0]'));
        if (owner) out.push(`val:${owner}`);
      }
    }

    if (extracted.hasSelfRef && sitePath && sitePath !== '#') {
      const owner = owningSite(sitePath);
      if (owner) out.push(`val:${owner}`);
    }

    for (const varName of extracted.variables ?? []) {
      const scope = [...lexicalScopes(sitePath), '#'].find((s) => variableScopes.has(`${s}:${varName}`));
      if (scope) out.push(`var:${scope}:${varName}`);
    }

    // Wire MIP property reads (`valid($x)`, `relevant($x)`, `required($x)`, `readonly($x)`).
    const mipFuncsCalled = (extracted.functions ?? []).filter((fn) => BUILTIN_MIP_FUNCS.has(fn));
    if (mipFuncsCalled.length > 0) {
      const mipTargets = extracted.mipDeps ?? [];
      if (mipTargets.length === 0) {
        // Conservatively link MIP calls whose target wasn't statically extracted (e.g. bare `$`).
        const owner = owningSite(sitePath);
        if (!owner) return { valid: true, bounded: false };
        for (const fn of mipFuncsCalled) {
          out.push(`${fn === 'relevant' ? 'rel' : fn === 'required' ? 'req' : fn === 'readonly' ? 'ro' : 'valid'}:${owner}`);
        }
      } else {
        for (const dep of mipTargets) {
          const resolved = resolveRefPath(sitePath, dep);
          const owner = owningSite(resolved);
          if (!owner) return { valid: true, bounded: false };
          for (const fn of mipFuncsCalled) {
            out.push(`${fn === 'relevant' ? 'rel' : fn === 'required' ? 'req' : fn === 'readonly' ? 'ro' : 'valid'}:${owner}`);
          }
        }
      }
    }

    // If `prev`/`next` was used without a named navigation target, conservatively include current row.
    if (extracted.usesPrevNext && !(extracted.navigationTargets ?? []).length) {
      const row = currentRowPath(sitePath);
      if (!row) return { valid: true, bounded: false };
      pushDescendants(row, out);
    }

    // Row-count functions (`count($rows)`) still need `rows` itself wired via `allFieldRefs` above.
    void BUILTIN_ROW_COUNT_FUNCS;
    return { valid: true, bounded: true };
  }

  function wireExpression(ownerVertex, expression, sitePath) {
    const targets = [];
    const { valid, bounded } = collectExpressionTargets(expression, sitePath, targets);
    if (!valid) return false;
    if (!bounded) unboundedVertices.add(ownerVertex);
    for (const t of targets) addEdge(ownerVertex, t);
    return true;
  }

  // Wire Item vertices.
  for (const p of itemSites) {
    const tmpl = stripIndices(p);
    const bind = bindsByTemplate.get(tmpl) ?? {};
    const vVal = `val:${p}`;
    const vRel = `rel:${p}`;
    const vReq = `req:${p}`;
    const vRo = `ro:${p}`;
    const vCon = `con:${p}`;
    const vValid = `valid:${p}`;
    const vValidation = `validation:${p}`;

    for (const anc of lexicalScopes(p)) {
      if (siteSet.has(anc)) addEdge(vVal, `rel:${anc}`);
    }
    const par = parentSite(p);
    if (par && siteSet.has(par)) {
      addEdge(vRel, `rel:${par}`);
      addEdge(vRo, `ro:${par}`);
    }
    addEdge(vReq, vRel);
    addEdge(vCon, vVal);
    addEdge(vCon, vRel);

    addEdge(vValid, vVal);
    addEdge(vValid, vRel);
    addEdge(vValid, vReq);
    addEdge(vValid, vCon);
    for (const idx of errorShapesAt.get(p) ?? []) addEdge(vValid, `shape:${p}:${idx}`);

    addEdge(vValidation, vVal);
    addEdge(vValidation, vRel);
    addEdge(vValidation, vReq);
    addEdge(vValidation, vRo);
    addEdge(vValidation, vCon);
    for (const idx of allShapesAt.get(p) ?? []) addEdge(vValidation, `shape:${p}:${idx}`);

    const exprSlots = [
      [bind.calculate, vVal],
      [typeof bind.default === 'string' && bind.default.startsWith('=') ? bind.default.slice(1) : undefined, vVal],
      [bind.relevant, vRel],
      [bind.required, vReq],
      [bind.readonly, vRo],
      [bind.constraint, vCon],
    ];
    for (const [src, owner] of exprSlots) {
      if (typeof src === 'string') {
        if (!wireExpression(owner, src, p)) return unbounded();
      }
    }
    for (const src of itemCreationExprs.get(tmpl) ?? []) {
      if (!wireExpression(vVal, src, p)) return unbounded();
    }
  }

  // Wire Variable vertices.
  for (const [key, { scope, expression }] of variableScopes) {
    if (!wireExpression(`var:${key}`, expression, scope)) return unbounded();
  }

  // Wire Shape vertices (including composed `and`/`or`/`not`/`xone`).
  const pendingShapes = [];
  for (const [sitePath, indices] of allShapesAt) {
    for (const idx of indices) pendingShapes.push([sitePath, idx]);
  }
  const visitedShapes = new Set();
  while (pendingShapes.length) {
    const [sitePath, idx] = pendingShapes.pop();
    const sKey = `${sitePath}:${idx}`;
    if (visitedShapes.has(sKey)) continue;
    visitedShapes.add(sKey);
    const shape = shapes[idx];
    const vShape = `shape:${sKey}`;
    if (sitePath !== '#' && siteSet.has(sitePath)) {
      addEdge(vShape, `rel:${sitePath}`);
      addEdge(vShape, `val:${sitePath}`);
    }
    for (const prop of ['constraint', 'activeWhen']) {
      if (typeof shape[prop] === 'string') {
        if (!wireExpression(vShape, shape[prop], sitePath)) return unbounded();
      }
    }
    for (const op of ['and', 'or', 'xone', 'not']) {
      if (!Object.hasOwn(shape, op)) continue;
      const members = Array.isArray(shape[op]) ? shape[op] : [shape[op]];
      for (const member of members) {
        if (typeof member === 'string' && shapeIdToIndex.has(member)) {
          const nextIdx = shapeIdToIndex.get(member);
          addEdge(vShape, `shape:${sitePath}:${nextIdx}`);
          pendingShapes.push([sitePath, nextIdx]);
        } else if (typeof member === 'string') {
          if (!wireExpression(vShape, member, sitePath)) return unbounded();
        }
      }
    }
  }

  // Detect any cycle in the authored calculation/relevance/variable/property graph -> conservative fallback.
  const cycleEdges = new Map();
  for (const p of itemSites) {
    const tmpl = stripIndices(p);
    const bind = bindsByTemplate.get(tmpl) ?? {};
    const addCycleDeps = (owner, expr) => {
      if (typeof expr !== 'string') return;
      const deps = [];
      collectExpressionTargets(expr, p, deps);
      let list = cycleEdges.get(owner);
      if (!list) {
        list = [];
        cycleEdges.set(owner, list);
      }
      for (const dep of deps) {
        if (dep.startsWith('val:') || dep.startsWith('var:') || dep.startsWith('rel:') || dep.startsWith('req:') || dep.startsWith('ro:')) {
          list.push(dep);
        }
      }
    };
    addCycleDeps(`val:${p}`, bind.calculate);
    addCycleDeps(`rel:${p}`, bind.relevant);
    addCycleDeps(`req:${p}`, bind.required);
    addCycleDeps(`ro:${p}`, bind.readonly);
  }
  for (const [key, { scope, expression }] of variableScopes) {
    const deps = [];
    collectExpressionTargets(expression, scope, deps);
    cycleEdges.set(`var:${key}`, deps.filter((d) => d.startsWith('val:') || d.startsWith('var:')));
  }
  const seenColor = new Map(); // 1 = visiting, 2 = visited
  function hasCycle(node) {
    const color = seenColor.get(node);
    if (color === 1) return true;
    if (color === 2) return false;
    seenColor.set(node, 1);
    for (const next of cycleEdges.get(node) ?? []) {
      if (hasCycle(next)) return true;
    }
    seenColor.set(node, 2);
    return false;
  }
  for (const node of cycleEdges.keys()) {
    if (hasCycle(node)) return unbounded();
  }

  // Answer each query by BFS/DFS over the graph.
  return queries.map((query) => {
    if (!query || query.kind === 'unbounded') return null;
    const roots = [];
    let checkNrb = false;

    if (query.kind === 'fel') {
      const normSite = normalizeConcreteSite(query.site);
      if (normSite && !siteSet.has(normSite) && !templateToSites.has(stripIndices(normSite))) {
        return null;
      }
      const { valid, bounded } = collectExpressionTargets(query.expression, normSite, roots);
      if (!valid || !bounded) return null;
    } else if (query.kind === 'targets') {
      if (query.dataPaths?.length) checkNrb = true;
      for (const path of query.dataPaths ?? []) {
        const norm = normalizeConcreteSite(path);
        const owner = owningSite(norm);
        if (!owner) return null;
        roots.push(`val:${owner}`);
        if (!siteDataTypes.has(stripIndices(owner))) pushDescendants(owner, roots);
      }
      for (const path of query.statePaths ?? []) {
        const norm = normalizeConcreteSite(path);
        const owner = owningSite(norm);
        if (!owner) return null;
        roots.push(`rel:${owner}`, `req:${owner}`, `ro:${owner}`);
      }
      for (const path of query.validationPaths ?? []) {
        if (path === '#') {
          for (const idx of allShapesAt.get('#') ?? []) roots.push(`shape:#:${idx}`);
          continue;
        }
        if (path.startsWith('#')) return null;
        const norm = normalizeConcreteSite(path);
        const owner = owningSite(norm);
        if (!owner) return null;
        roots.push(`validation:${owner}`);
      }
      for (const prefix of query.validationPrefixes ?? []) {
        const trimmed = prefix.replace(/[.\[]+$/, '');
        if (!trimmed || trimmed.startsWith('#')) return null;
        const norm = normalizeConcreteSite(trimmed);
        let matched = false;
        for (const site of itemSites) {
          if (site === norm || isDescendantSite(site, norm)) {
            roots.push(`validation:${site}`);
            matched = true;
          }
        }
        if (!matched) return null;
      }
    } else {
      return null;
    }

    const visited = new Set();
    const stack = [...roots];
    const scope = {
      itemPaths: new Set(),
      shapes: new Set(),
      optionSets: new Set(),
      variables: new Set(),
      includeNrb: false,
    };

    while (stack.length) {
      const vertex = stack.pop();
      if (visited.has(vertex)) continue;
      visited.add(vertex);
      if (unboundedVertices.has(vertex)) return null;

      if (vertex.startsWith('shape:')) {
        const lastColon = vertex.lastIndexOf(':');
        const sitePath = vertex.slice('shape:'.length, lastColon);
        const idx = Number.parseInt(vertex.slice(lastColon + 1), 10);
        scope.shapes.add(idx);
        if (sitePath !== '#') recordTemplateAndAncestors(sitePath, scope.itemPaths);
      } else if (vertex.startsWith('var:')) {
        scope.variables.add(vertex.slice('var:'.length));
      } else {
        const colon = vertex.indexOf(':');
        recordTemplateAndAncestors(vertex.slice(colon + 1), scope.itemPaths);
      }

      for (const next of edges.get(vertex) ?? []) {
        if (!visited.has(next)) stack.push(next);
      }
    }

    for (const tmpl of scope.itemPaths) {
      const setName = itemOptionSets.get(tmpl);
      if (setName) scope.optionSets.add(setName);
      if (checkNrb && itemHasRelevant.has(tmpl)) scope.includeNrb = true;
    }
    return scope;
  });
}

/**
 * Compute conservative `ReadScope | null` for each conformance case in `cases`.
 * Uses Rust `formspec-eval` directly when `native` is supplied, otherwise uses Rust WASM extractors.
 */
export function caseReadScopes(definition, cases, { ledger = { entries: {} }, native } = {}) {
  const queries = buildCaseQueries(cases, ledger);
  if (native) {
    return analyzeScopedDependenciesRust(definition, queries, native);
  }
  return analyzeScopedDependenciesWasm(definition, queries);
}

/**
 * Backward-compatible helper returning `Set<string> | null` of read template item paths per case
 * (used by unit tests supplying a custom `readFields` function).
 */
export function caseDependencies(definition, cases, readFields) {
  const queries = buildCaseQueries(cases);
  const extract = readFields
    ? (expression) => {
        const fields = readFields(expression);
        if (!fields) return null;
        return {
          fields,
          fieldPaths: fields,
          currentPaths: [],
          variables: [],
          navigationTargets: [],
          mipDeps: [],
          functions: [],
          hasSelfRef: false,
          hasWildcard: false,
          usesPrevNext: false,
        };
      }
    : defaultReadExtractor;
  const scopes = analyzeScopedDependenciesWasm(definition, queries, extract);
  return scopes.map((scope) => (scope ? scope.itemPaths : null));
}
