import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRawProject } from '../src/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { pythonTestEnv, resolvePython } from './python.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXAMPLES_DIR = path.resolve(__dirname, '../../../examples');
const REGISTRY_PATH = path.resolve(__dirname, '../../../registries/formspec-common.registry.json');

const PYTHON = resolvePython();

/** Unbuffered stderr progress — to see where it freezes, run: npx vitest run tests/e2e-examples.test.ts --reporter=verbose 2>&1 */
function progress(msg: string): void {
  process.stderr.write(`[e2e-examples] ${msg}\n`);
}

/** Reconstructs definition.json ast using dispatch functions on a greenfield project */
function hydrateDefinition(project: any, defJson: any) {
  const actions: any[] = [];
  
  // Metadata properties (defer formPresentation until after items are hydrated)
  const deferredActions: any[] = [];
  for (const [key, value] of Object.entries(defJson)) {
    if (['items', 'binds', 'shapes', 'variables', 'optionSets', 'instances', '$formspec'].includes(key)) continue;

    if (key === 'title') {
      actions.push({ type: 'definition.setFormTitle', payload: { title: value } });
    } else if (key === 'formPresentation') {
      deferredActions.push({ type: 'definition.setDefinitionProperty', payload: { property: key, value } });
    } else {
      actions.push({ type: 'definition.setDefinitionProperty', payload: { property: key, value } });
    }
  }

  // Instances
  if (defJson.instances) {
    for (const [key, instance] of Object.entries(defJson.instances)) {
      actions.push({ type: 'definition.addInstance', payload: { name: key, ...(instance as any) } });
    }
  }

  // Option Sets
  if (defJson.optionSets) {
    for (const [key, set] of Object.entries(defJson.optionSets)) {
      actions.push({ type: 'definition.setOptionSet', payload: { name: key, options: (set as any).options } });
    }
  }

  // Variables
  if (defJson.variables) {
    for (const v of defJson.variables) {
      actions.push({ type: 'definition.addVariable', payload: { name: v.name, expression: v.expression } });
    }
  }

  // Shapes
  if (defJson.shapes) {
    for (const s of defJson.shapes) {
      // Create it
      actions.push({ type: 'definition.addShape', payload: { 
        id: s.id, 
        target: s.target, 
        constraint: s.constraint,
        message: s.message,
        severity: s.severity 
      } });
      // Apply rest
      for (const [sKey, sVal] of Object.entries(s)) {
        if (['id', 'target', 'constraint', 'message', 'severity'].includes(sKey)) continue;
        actions.push({ type: 'definition.setShapeProperty', payload: { id: s.id, property: sKey, value: sVal } });
      }
    }
  }

  project.batch(actions);

  // Items recursive
  function hydrateItem(item: any, parentPath?: string) {
    project.dispatch({ 
      type: 'definition.addItem', 
      payload: { 
        type: item.type, 
        key: item.key, 
        parentPath, 
        dataType: item.dataType 
      } 
    });

    const itemPath = parentPath ? `${parentPath}.${item.key}` : item.key;

    const itemActions: any[] = [];
    for (const [iKey, iVal] of Object.entries(item)) {
      if (['key', 'type', 'dataType', 'children', 'extensions'].includes(iKey)) continue;
      
      if (iKey === 'options') {
        itemActions.push({ type: 'definition.setFieldOptions', payload: { path: itemPath, options: iVal } });
      } else if (iKey === 'optionSet') {
        itemActions.push({ type: 'definition.setFieldOptions', payload: { path: itemPath, options: iVal } });
      } else {
        itemActions.push({ type: 'definition.setItemProperty', payload: { path: itemPath, property: iKey, value: iVal } });
      }
    }
    
    if (item.extensions) {
      for (const [extK, extV] of Object.entries(item.extensions)) {
        itemActions.push({ type: 'definition.setItemExtension', payload: { path: itemPath, extension: extK, value: extV } });
      }
    }
    
    if (itemActions.length > 0) {
      project.batch(itemActions);
    }

    if (item.children) {
      for (const child of item.children) {
        hydrateItem(child, itemPath);
      }
    }
  }

  if (defJson.items) {
    for (const item of defJson.items) {
      hydrateItem(item);
    }
  }

  // Apply deferred formPresentation after items exist
  if (deferredActions.length > 0) {
    project.batch(deferredActions);
  }

  // Binds
  if (defJson.binds) {
    const bindActions = defJson.binds.map((b: any) => {
      const { path, ...properties } = b;
      return { type: 'definition.setBind', payload: { path, properties } };
    });
    project.batch(bindActions);
  }
}

/** Reconstructs theme.json */
function hydrateTheme(project: any, themeJson: any) {
  const actions: any[] = [];
  
  if (themeJson.tokens) {
    actions.push({ type: 'theme.setTokens', payload: { tokens: themeJson.tokens } });
  }
  
  if (themeJson.defaults) {
    for (const [k, v] of Object.entries(themeJson.defaults)) {
      actions.push({ type: 'theme.setDefaults', payload: { property: k, value: v } });
    }
  }

  if (themeJson.items) {
    for (const [itemKey, override] of Object.entries(themeJson.items)) {
      for (const [ok, ov] of Object.entries(override as any)) {
        actions.push({ type: 'theme.setItemOverride', payload: { itemKey, property: ok, value: ov } });
      }
    }
  }
  
  if (themeJson.selectors) {
    for (const s of themeJson.selectors) {
      actions.push({ type: 'theme.addSelector', payload: { match: s.match, apply: s.apply } });
    }
  }

  for (const [k, v] of Object.entries(themeJson)) {
    if (['$formspec', 'targetDefinition', 'tokens', 'defaults', 'pages', 'items', 'selectors'].includes(k)) continue;
    actions.push({ type: 'theme.setDocumentProperty', payload: { property: k, value: v } });
  }

  project.batch(actions);
}

/** Reconstructs component.json */
function hydrateComponent(project: any, compJson: any) {
  // Component package doesn't have nearly as many direct setters, but we mimic them.
  const actions: any[] = [];
  for (const [k, v] of Object.entries(compJson)) {
    if (k !== '$formspec') {
      actions.push({ type: 'component.setDocumentProperty', payload: { property: k, value: v } });
    }
  }
  if (actions.length > 0) project.batch(actions);
}

/** Reconstructs mapping.json */
function hydrateMapping(project: any, mapJson: any) {
  const actions: any[] = [];

  for (const [k, v] of Object.entries(mapJson)) {
    if (['$formspec', 'definitionRef', 'rules'].includes(k)) continue;
    actions.push({ type: 'mapping.setProperty', payload: { property: k, value: v } });
  }
  project.batch(actions);

  if (mapJson.rules) {
    for (const [i, rule] of mapJson.rules.entries()) {
      actions.push({ 
        type: 'mapping.addRule', 
        payload: { 
          sourcePath: rule.sourcePath, 
          targetPath: rule.targetPath, 
          transform: rule.transform 
        } 
      });
      // Set remaining properties on the rule
      for (const [rk, rv] of Object.entries(rule)) {
        if (['sourcePath', 'targetPath', 'transform', 'innerRules'].includes(rk)) continue;
        actions.push({
          type: 'mapping.setRule',
          payload: { index: i, property: rk, value: rv }
        });
      }

      if ((rule as any).innerRules) {
        for (const [j, inner] of (rule as any).innerRules.entries()) {
          actions.push({
            type: 'mapping.addInnerRule',
            payload: {
              ruleIndex: i,
              sourcePath: inner.sourcePath,
              targetPath: inner.targetPath,
              transform: inner.transform
            }
          });
          for (const [ik, iv] of Object.entries(inner)) {
            if (['sourcePath', 'targetPath', 'transform'].includes(ik)) continue;
            actions.push({
              type: 'mapping.setInnerRule',
              payload: { ruleIndex: i, innerIndex: j, property: ik, value: iv }
            });
          }
        }
      }
    }
  }
  
  if (mapJson.definitionRef) {
    actions.push({ type: 'mapping.setProperty', payload: { property: 'definitionRef', value: mapJson.definitionRef } });
  }

  project.batch(actions);
}

describe('Formspec Studio E2E Examples Rehydration', () => {
  // Studio-handler-emitted reconstructions of every example/ project, written to a project-root
  // scratch dir so a failing run leaves diff-able artifacts on disk. Gitignored (see .gitignore).
  let reconstructedDir: string;
  let commonRegistry: { url: string; entries: unknown[] };

  beforeAll(() => {
    process.env.DIAGNOSE_DEBUG = '1';
    reconstructedDir = path.resolve(__dirname, '../../../reconstructed-examples');
    if (fs.existsSync(reconstructedDir)) {
      fs.rmSync(reconstructedDir, { recursive: true, force: true });
    }
    fs.mkdirSync(reconstructedDir, { recursive: true });
    const registryDoc = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    commonRegistry = { url: 'urn:formspec:common', entries: registryDoc.entries ?? [] };
  });

  afterAll(() => {
    delete process.env.DIAGNOSE_DEBUG;
    console.log('RECONSTRUCTED_EXAMPLES saved to:', reconstructedDir);
  });

  const examples = fs.readdirSync(EXAMPLES_DIR).filter(d => {
    return fs.statSync(path.join(EXAMPLES_DIR, d)).isDirectory() && d !== 'references'; // Skip the live-demo workspace dir
  });

  for (const ex of examples) {
    it(
      `dynamically reconstructs and validates ${ex}`,
      { timeout: 120_000 },
      () => {
      progress(`start example: ${ex}`);
      const exPath = path.join(EXAMPLES_DIR, ex);
      const files = fs.readdirSync(exPath).filter(f => f.endsWith('.json'));
      
      const defFiles = files.filter(f => f.includes('definition.'));
      // Build one project per definition file found in the example
      
      for (const defFile of defFiles) {
        // Strip the .definition.json suffix. For unprefixed files (defFile === 'definition.json')
        // this yields an empty prefix, so sibling lookups fall through to bare 'theme.json' / 'component.json' / 'mapping.json'.
        const prefix = defFile.replace(/\.definition\.json$/, '');
        progress(`${ex} / ${prefix}: createRawProject + loadRegistry`);
        const project = createRawProject();
        project.dispatch({ type: 'project.loadRegistry', payload: { registry: commonRegistry } });
        
        // 1. Definition
        progress(`${ex} / ${prefix}: hydrateDefinition...`);
        const defContent = JSON.parse(fs.readFileSync(path.join(exPath, defFile), 'utf-8'));
        hydrateDefinition(project, defContent);
        progress(`${ex} / ${prefix}: hydrateDefinition done`);

        // 2. Theme
        const themeFile = files.find(f => f === `${prefix}.theme.json` || f === 'theme.json');
        if (themeFile) {
          progress(`${ex} / ${prefix}: hydrateTheme...`);
          const themeContent = JSON.parse(fs.readFileSync(path.join(exPath, themeFile), 'utf-8'));
          hydrateTheme(project, themeContent);
          progress(`${ex} / ${prefix}: hydrateTheme done`);
        }

        // 3. Component
        const compFile = files.find(f => f === `${prefix}.component.json` || f === 'component.json');
        if (compFile) {
          progress(`${ex} / ${prefix}: hydrateComponent...`);
          const compContent = JSON.parse(fs.readFileSync(path.join(exPath, compFile), 'utf-8'));
          hydrateComponent(project, compContent);
          progress(`${ex} / ${prefix}: hydrateComponent done`);
        }

        // 4. Mapping
        const mapFile = files.find(f => f === `${prefix}.mapping.json` || f === 'mapping.json');
        if (mapFile) {
          progress(`${ex} / ${prefix}: hydrateMapping...`);
          const mapContent = JSON.parse(fs.readFileSync(path.join(exPath, mapFile), 'utf-8'));
          hydrateMapping(project, mapContent);
          progress(`${ex} / ${prefix}: hydrateMapping done`);
        }

        // Export to tmp — keep dir names clean when the example has a single unprefixed definition.json.
        progress(`${ex} / ${prefix}: writing artifacts...`);
        const outDir = path.join(reconstructedDir, prefix ? `${ex}-${prefix}` : ex);
        fs.mkdirSync(outDir, { recursive: true });
        const exported = project.export();

        fs.writeFileSync(path.join(outDir, 'definition.json'), JSON.stringify(exported.definition, null, 2));
        fs.writeFileSync(path.join(outDir, 'theme.json'), JSON.stringify(exported.theme, null, 2));
        fs.writeFileSync(path.join(outDir, 'component.json'), JSON.stringify(exported.component, null, 2));
        fs.writeFileSync(path.join(outDir, 'mapping.json'), JSON.stringify(exported.mappings?.default ?? project.mapping, null, 2));

        // TS engine validator (in-memory)
        progress(`${ex} / ${prefix}: diagnose...`);
        const diag = project.diagnose();
        progress(`${ex} / ${prefix}: diagnose done`);
        const ok = diag.counts.error === 0 && diag.counts.warning === 0;
        if (!ok) {
          const all = [
            ...diag.structural.map(d => ({ ...d, pass: 'structural' as const })),
            ...diag.expressions.map(d => ({ ...d, pass: 'expressions' as const })),
            ...diag.extensions.map(d => ({ ...d, pass: 'extensions' as const })),
            ...diag.consistency.map(d => ({ ...d, pass: 'consistency' as const })),
          ];
          console.error(`[${ex}-${prefix}] TS diagnose:`, diag.counts, { all });
        }
        expect(diag.counts.error).toBe(0);
        expect(diag.counts.warning).toBe(0);

        // Python validation (on written files) — timeout to avoid hanging
        progress(`${ex} / ${prefix}: Python validate...`);
        const validateCmd = `${PYTHON} -m formspec.validate ${outDir} --registry ${REGISTRY_PATH}`;
        try {
          const output = execSync(validateCmd, {
            cwd: path.resolve(__dirname, '../../..'),
            env: pythonTestEnv(path.resolve(__dirname, '../../..')),
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 60_000,
          });
          
          if (!output.includes('0 errors') && !output.includes('0 inconsistency')) {
            console.error(`OUTPUT FOR ${ex}-${prefix}:`, output);
          }
          expect(output).toMatch(/(0 errors|0 consistency issues)/);
          progress(`${ex} / ${prefix}: Python validate done`);
        } catch (e: any) {
          if (e.stdout || e.stderr) {
            console.error(`STDOUT [${ex}-${prefix}]:`, e.stdout);
            console.error(`STDERR [${ex}-${prefix}]:`, e.stderr);
          }
          throw e;
        }
      }
      progress(`end example: ${ex}`);
    },
    );
  }
});
