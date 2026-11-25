/** @filedesc Enumerate isolated edits to authored Definition rules for conformance coverage. */
const bindRules = ['constraint', 'required', 'calculate', 'relevant', 'readonly', 'whitespace'];
const pointer = (path) => '/' + path.map((key) => String(key).replaceAll('~', '~0').replaceAll('/', '~1')).join('/');

/** Strip repeat indices/wildcards (`rows[*].amt` or `rows[0].amt` -> `rows.amt`). */
export function normalizeTemplatePath(path) {
  return typeof path === 'string' ? path.replace(/\[(?:\*|\d+)\]/g, '') : undefined;
}

function locate(definition, path) {
  if (!Array.isArray(path) || !path.length) throw new Error('Expected a nonempty mutation path');
  let node = definition;
  for (const [index, key] of path.entries()) {
    const validKey = Array.isArray(node) ? Number.isInteger(key) && key >= 0 : typeof key === 'string';
    if (!node || typeof node !== 'object' || !validKey || !Object.hasOwn(node, key)) {
      throw new Error('Invalid mutation path: ' + pointer(path));
    }
    if (index === path.length - 1) return [node, key];
    node = node[key];
  }
}

export function applyMutation(definition, mutation) {
  locate(definition, mutation.path);
  // Copy only edited ancestors. Untouched JSON.rawJSON decimal tokens retain their precision.
  function edit(node, index) {
    const copy = Array.isArray(node) ? node.slice() : { ...node };
    const key = mutation.path[index];
    if (index + 1 < mutation.path.length) copy[key] = edit(node[key], index + 1);
    else if (Object.hasOwn(mutation, 'value')) copy[key] = mutation.value;
    else if (Array.isArray(copy)) copy.splice(key, 1);
    else delete copy[key];
    return copy;
  }
  return edit(definition, 0);
}

function guardEquivalence(definition, shape) {
  const guard = shape.activeWhen.trim();
  if (guard === 'true') return 'The absent guard defaults to true.';
  // Null leaves a target relevant but skips its Shape. Only prove constant-false relevance here.
  if (guard !== 'false') return;
  // A composed Shape can run at a different target. A later bind can override relevance.
  if (definition.shapes.some((s) => ['not', 'and', 'or', 'xone'].some((op) => Object.hasOwn(s, op)))) return;
  if (!definition.items?.some((item) => item.type === 'field' && item.key === shape.target)) return;
  const binds = Array.isArray(definition.binds) ? definition.binds : [];
  if (binds.some((b) => !/^[A-Za-z][\w-]*$/.test(b.path))) return;
  const relevance = binds.filter((b) => b.path === shape.target && Object.hasOwn(b, 'relevant')).at(-1);
  if (relevance?.relevant.trim() === 'false') {
    return 'Core §5.6 suppresses validation on this permanently non-relevant target.';
  }
}

/** Infer conservative scope metadata for caller-supplied named mutations from their JSON path. */
function inferNamedScope(definition, path) {
  const [root, second] = path;
  if (root === 'items' && Number.isInteger(second)) {
    let nodes = definition.items;
    let prefix = '';
    let idx = 1;
    let lastItemPath;
    while (idx < path.length && Array.isArray(nodes) && Number.isInteger(path[idx])) {
      const item = nodes[path[idx]];
      if (!item || typeof item.key !== 'string') break;
      lastItemPath = prefix ? `${prefix}.${item.key}` : item.key;
      if (path[idx + 1] === 'children' && Array.isArray(item.children)) {
        prefix = item.type === 'field' ? prefix : lastItemPath;
        nodes = item.children;
        idx += 2;
      } else {
        break;
      }
    }
    return lastItemPath ? { target: lastItemPath } : {};
  }
  if (root === 'binds') {
    if (Array.isArray(definition.binds) && Number.isInteger(second)) {
      const bind = definition.binds[second];
      return bind?.path ? { target: normalizeTemplatePath(bind.path) } : {};
    }
    if (definition.binds && typeof definition.binds === 'object' && typeof second === 'string') {
      return { target: normalizeTemplatePath(second) };
    }
  }
  if (root === 'shapes' && Number.isInteger(second)) {
    return { shapeIndex: second };
  }
  if (root === 'optionSets' && typeof second === 'string') {
    return { optionSet: second };
  }
  if (root === 'variables' && Number.isInteger(second)) {
    const variable = definition.variables?.[second];
    if (variable?.name) {
      return { variable: `${variable.scope ?? '#'}:${variable.name}` };
    }
  }
  if (root === 'nonRelevantBehavior' && path.length === 1) {
    return { isGlobalNrb: true };
  }
  return {};
}

/** Generated IDs are JSON Pointers. Named edits use path segments and an optional replacement. */
export function enumerateMutations(definition, named = []) {
  const mutations = [];
  const add = (path, target, changes = {}) => mutations.push({ id: pointer(path), path, target, ...changes });
  function options(entries, path, target, extra = {}) {
    if (Array.isArray(entries)) entries.forEach((_, i) => add([...path, 'options', i], target, extra));
  }
  function items(nodes, path, prefix) {
    for (const [index, item] of nodes.entries()) {
      const at = [...path, index];
      const target = prefix + item.key;
      if (Object.hasOwn(item, 'minRepeat')) {
        add([...at, 'minRepeat'], target, {
          equivalent: item.minRepeat === 0 ? 'minRepeat defaults to zero.' : undefined,
        });
      }
      if (item.dataType === 'date') add([...at, 'dataType'], target, { value: 'string' });
      options(item.options, at, target);
      if (item.children) {
        const childPrefix = item.type === 'field' ? prefix : `${target}${item.repeatable ? '[*].' : '.'}`;
        items(item.children, [...at, 'children'], childPrefix);
      }
    }
  }
  items(definition.items ?? [], ['items'], '');
  for (const [name, set] of Object.entries(definition.optionSets ?? {})) {
    options(set.options, ['optionSets', name], undefined, { optionSet: name });
  }
  if (definition.nonRelevantBehavior === 'keep') {
    add(['nonRelevantBehavior'], undefined, { value: 'remove', isGlobalNrb: true });
  }
  if (Array.isArray(definition.binds)) {
    for (const [i, bind] of definition.binds.entries()) {
      for (const rule of bindRules) {
        if (Object.hasOwn(bind, rule)) add(['binds', i, rule], bind.path);
      }
      if (bind.nonRelevantBehavior === 'keep') {
        add(['binds', i, 'nonRelevantBehavior'], bind.path, { value: 'remove' });
      }
    }
  } else if (definition.binds && typeof definition.binds === 'object') {
    for (const [bindPath, bind] of Object.entries(definition.binds)) {
      if (!bind || typeof bind !== 'object') continue;
      for (const rule of bindRules) {
        if (Object.hasOwn(bind, rule)) add(['binds', bindPath, rule], bindPath);
      }
      if (bind.nonRelevantBehavior === 'keep') {
        add(['binds', bindPath, 'nonRelevantBehavior'], bindPath, { value: 'remove' });
      }
    }
  }
  for (const [i, shape] of (definition.shapes ?? []).entries()) {
    if (Object.hasOwn(shape, 'constraint')) {
      add(['shapes', i, 'constraint'], undefined, {
        value: 'true',
        shapeIndex: i,
        equivalent: shape.constraint === 'true' ? 'The constraint already returns true.' : undefined,
      });
    }
    if (Object.hasOwn(shape, 'activeWhen')) {
      add(['shapes', i, 'activeWhen'], undefined, {
        shapeIndex: i,
        equivalent: guardEquivalence(definition, shape),
      });
    }
  }
  const ids = new Set(mutations.map((m) => m.id));
  for (const { id, path, ...change } of named) {
    if (typeof id !== 'string' || !id.length || ids.has(id)) {
      throw new Error('Missing or duplicate mutant ID: ' + id);
    }
    if (Object.keys(change).some((key) => key !== 'value')) {
      throw new Error('Unexpected named mutation property');
    }
    locate(definition, path);
    ids.add(id);
    // Keep caller-supplied named edits conservatively eligible for all cases because an arbitrary
    // replacement expression can introduce new dependencies or cycles.
    mutations.push({ id, path, ...change });
  }
  return mutations;
}
