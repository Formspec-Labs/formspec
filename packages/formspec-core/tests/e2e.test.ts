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

const PYTHON = resolvePython();

function pageNode(title: string, id: string) {
  return {
    type: 'component.addNode',
    payload: {
      parent: { nodeId: 'root' },
      component: 'Section',
      props: { nodeId: id, title },
    },
  };
}

describe('Formspec Studio Core E2E Validation', { timeout: 60_000 }, () => {
  let tmpDir: string;
  let project: ReturnType<typeof createRawProject>;

  const validateProject = (stepName: string) => {
    // TS engine validator (in-memory)
    const diag = project.diagnose();
    const ok = diag.counts.error === 0 && diag.counts.warning === 0;
    if (!ok) {
      const all = [
        ...diag.structural.map(d => ({ ...d, pass: 'structural' as const })),
        ...diag.expressions.map(d => ({ ...d, pass: 'expressions' as const })),
        ...diag.extensions.map(d => ({ ...d, pass: 'extensions' as const })),
        ...diag.consistency.map(d => ({ ...d, pass: 'consistency' as const })),
      ];
      console.error(`[${stepName}] TS diagnose:`, diag.counts, { all });
    }
    expect(diag.counts.error).toBe(0);
    expect(diag.counts.warning).toBe(0);

    const bundle = project.export();

    const defPath = path.join(tmpDir, 'definition.json');
    const themePath = path.join(tmpDir, 'theme.json');
    const compPath = path.join(tmpDir, 'component.json');
    const mapPath = path.join(tmpDir, 'mapping.json');

    fs.writeFileSync(defPath, JSON.stringify(bundle.definition, null, 2));
    fs.writeFileSync(themePath, JSON.stringify(bundle.theme, null, 2));
    // Only write component when a tree has been authored (null tree = no authored tree)
    if (bundle.component.tree) {
      fs.writeFileSync(compPath, JSON.stringify(bundle.component, null, 2));
    } else if (fs.existsSync(compPath)) {
      fs.unlinkSync(compPath);
    }
    // Only write mapping when rules exist (empty rules array fails schema minItems: 1)
    const defaultMapping = bundle.mappings[Object.keys(bundle.mappings)[0]];
    if (defaultMapping && (defaultMapping as any).rules?.length > 0) {
      fs.writeFileSync(mapPath, JSON.stringify(defaultMapping, null, 2));
    } else if (fs.existsSync(mapPath)) {
      fs.unlinkSync(mapPath);
    }

    const rootDir = path.resolve(__dirname, '../../..');
    const validateCmd = `${PYTHON} -m formspec.validate ${tmpDir} --registry registries/formspec-common.registry.json`;

    try {
      const output = execSync(validateCmd, {
        cwd: rootDir,
        env: pythonTestEnv(rootDir),
        encoding: 'utf8',
        stdio: 'pipe'
      });
      if (!output.includes('0 errors') && !output.includes('0 consistency issues')) {
        console.error(`OUTPUT [${stepName}]:`, output);
      }
      expect(output).toMatch(/(0 errors|0 consistency issues)/);
    } catch (e: any) {
      if (e.stdout || e.stderr) {
        console.error(`STDOUT [${stepName}]:`, e.stdout);
        console.error(`STDERR [${stepName}]:`, e.stderr);
      }
      throw e;
    }
  };

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'formspec-e2e-'));
    project = createRawProject();
  });

  afterAll(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. builds a greenfield project, exports it, and passes python validation suite', () => {
    // 2. Build Definition (Metadata)
    project.batch([
      { type: 'definition.setFormTitle', payload: { title: 'Greenfield E2E Test Form' } },
      { type: 'definition.setDefinitionProperty', payload: { property: 'version', value: '1.0.0' } },
      { type: 'definition.setDefinitionProperty', payload: { property: 'status', value: 'draft' } }
    ]);
    validateProject('1-greenfield-metadata');

    // Page 1
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'page1' } },
      { type: 'definition.setItemProperty', payload: { path: 'page1', property: 'label', value: 'Page 1: Applicant Details' } },
      
      { type: 'definition.addItem', payload: { type: 'field', key: 'firstName', parentPath: 'page1', dataType: 'string' } },
      { type: 'definition.setItemProperty', payload: { path: 'page1.firstName', property: 'label', value: 'First Name' } },
      { type: 'definition.setBind', payload: { path: 'page1.firstName', properties: { required: 'true' } } },

      { type: 'definition.addItem', payload: { type: 'field', key: 'lastName', parentPath: 'page1', dataType: 'string' } },
      { type: 'definition.setItemProperty', payload: { path: 'page1.lastName', property: 'label', value: 'Last Name' } },
      { type: 'definition.setBind', payload: { path: 'page1.lastName', properties: { required: 'true' } } },

      { type: 'definition.addItem', payload: { type: 'field', key: 'age', parentPath: 'page1', dataType: 'integer' } },
      { type: 'definition.setItemProperty', payload: { path: 'page1.age', property: 'label', value: 'Age' } },
      { type: 'definition.setBind', payload: { path: 'page1.age', properties: { constraint: '$page1.age >= 18', constraintMessage: 'Must be an adult' } } }
    ]);
    validateProject('1-greenfield-page1');

    // Page 2: Dependents
    project.batch([
      { type: 'definition.addItem', payload: { type: 'group', key: 'page2' } },
      { type: 'definition.setItemProperty', payload: { path: 'page2', property: 'label', value: 'Page 2: Preferences' } },
      
      { type: 'definition.addItem', payload: { type: 'field', key: 'colorPref', parentPath: 'page2', dataType: 'choice' } },
      { type: 'definition.setItemProperty', payload: { path: 'page2.colorPref', property: 'label', value: 'Favorite Color' } },
      { type: 'definition.setFieldOptions', payload: { path: 'page2.colorPref', options: [
        { value: 'red', label: 'Red' },
        { value: 'blue', label: 'Blue' },
        { value: 'green', label: 'Green' }
      ] } },

      { type: 'definition.addItem', payload: { type: 'field', key: 'hasPet', parentPath: 'page2', dataType: 'boolean' } },
      { type: 'definition.setItemProperty', payload: { path: 'page2.hasPet', property: 'label', value: 'Do you have a pet?' } },

      { type: 'definition.addItem', payload: { type: 'field', key: 'petName', parentPath: 'page2', dataType: 'string' } },
      { type: 'definition.setItemProperty', payload: { path: 'page2.petName', property: 'label', value: 'Pet Name' } },
      { type: 'definition.setBind', payload: { path: 'page2.petName', properties: { relevant: '$page2.hasPet = true' } } }
    ]);
    validateProject('1-greenfield-page2');

    // Validation shape cross-field
    project.dispatch({
      type: 'definition.addShape', payload: { 
        id: 'colorRule',
        target: 'page2.colorPref',
        message: 'Adults cannot pick red',
        constraint: 'not($page1.age >= 18 and $page2.colorPref = \'red\')'
      }
    });
    validateProject('1-greenfield-shapes');

    // 3. Theme styling / Pages
    project.batch([
      { type: 'theme.setToken', payload: { key: 'color.primary', value: '#123456' } },
      { type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'wizard' } },
      pageNode('Applicant Details', 'p1'),
      pageNode('Preferences', 'p2'),
      { type: 'theme.setItemOverride', payload: { itemKey: 'page2.hasPet', property: 'widget', value: 'Toggle' } }
    ]);
    validateProject('1-greenfield-theme');

    // 4. Mapping
    project.batch([
      { type: 'mapping.addRule', payload: { sourcePath: 'page1.firstName', targetPath: 'user.first', transform: 'preserve' } },
      { type: 'mapping.addRule', payload: { sourcePath: 'page1.lastName', targetPath: 'user.last', transform: 'preserve' } },
      { type: 'mapping.addRule', payload: { sourcePath: 'page1.age', targetPath: 'user.age', transform: 'preserve' } },
      { type: 'mapping.addRule', payload: { sourcePath: 'page2.colorPref', targetPath: 'prefs.color', transform: 'preserve' } },
      { type: 'mapping.addRule', payload: { sourcePath: 'page2.hasPet', targetPath: 'prefs.petOwner', transform: 'preserve' } },
      { type: 'mapping.addRule', payload: { sourcePath: 'page2.petName', targetPath: 'prefs.petName', transform: 'preserve' } },
    ]);

    validateProject('1-greenfield-end');
  });

  it('2. Form Builder rearranges and duplicates fields', () => {
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'deleteMe', parentPath: 'page1', dataType: 'string' } },
      { type: 'definition.deleteItem', payload: { path: 'page1.deleteMe' } },
    ]);
    validateProject('2-builder-delete');

    project.batch([
      { type: 'definition.duplicateItem', payload: { path: 'page1.firstName' } },
      { type: 'definition.renameItem', payload: { path: 'page1.firstName_1', newKey: 'nickName' } },
    ]);
    validateProject('2-builder-duplicate-rename');

    project.batch([
      { type: 'definition.reorderItem', payload: { path: 'page1.nickName', direction: 'down' } },
      { type: 'definition.setFieldDataType', payload: { path: 'page1.nickName', dataType: 'string' } },
      { type: 'definition.promoteToOptionSet', payload: { path: 'page2.colorPref', name: 'sharedColors' } },
    ]);
    validateProject('2-builder-reorder-promote');
  });

  it('3. Advanced Logic Builder adds variables, shapes, and instances', () => {
    project.batch([
      { type: 'definition.addVariable', payload: { name: 'testVar', expression: '1 + 1' } },
      { type: 'definition.setVariable', payload: { name: 'testVar', property: 'expression', value: '2 + 2' } },
    ]);
    validateProject('3-logic-builder-vars');

    project.batch([
      { type: 'definition.renameShape', payload: { id: 'colorRule', newId: 'renamedColorRule' } },
      { type: 'definition.setShapeProperty', payload: { id: 'renamedColorRule', property: 'message', value: 'Updated msg' } },
    ]);
    validateProject('3-logic-builder-shapes');

    project.batch([
      { type: 'definition.addInstance', payload: { name: 'externalData', source: 'https://api.example.com/data' } },
      { type: 'definition.renameInstance', payload: { name: 'externalData', newName: 'userData' } },
      { type: 'definition.setInstance', payload: { name: 'userData', property: 'source', value: 'https://api.example.com/user' } },
    ]);
    validateProject('3-logic-builder-instances');
  });
  
  it('4. Data Engineer manages mappings and deletes artifacts', () => {
    project.batch([
      { type: 'mapping.setProperty', payload: { property: 'definitionRef', value: 'https://example.com/def' } },
      { type: 'mapping.setProperty', payload: { property: 'definitionVersion', value: '1.0.0' } },
      { type: 'mapping.setProperty', payload: { property: 'version', value: '1.0.0' } },
      { type: 'mapping.setProperty', payload: { property: 'targetSchema', value: { format: 'json', url: 'https://schema.org/Person' } } },
    ]);
    validateProject('4-data-engineer-props');

    project.batch([
      { type: 'mapping.autoGenerateRules', payload: {} }, 
      { type: 'mapping.setDefaults', payload: { 'user.status': 'active' } },
    ]);
    validateProject('4-data-engineer-rules');

    project.batch([
      { type: 'definition.deleteVariable', payload: { name: 'testVar' } },
      { type: 'definition.deleteShape', payload: { id: 'renamedColorRule' } },
      { type: 'definition.deleteInstance', payload: { name: 'userData' } },
    ]);
    validateProject('4-data-engineer-cleanup');
  });
  
  it('5. Designer tweaks themes and component structure', () => {
    project.batch([
      { type: 'theme.setTargetCompatibility', payload: { compatibleVersions: '>=1.0.0' } },
      { type: 'component.moveNode', payload: { source: { bind: 'hasPet' }, targetParent: { nodeId: 'p2' } } },
    ]);
    validateProject('5-designer-theme-setup');

    project.batch([
      { type: 'component.setNodeProperty', payload: { node: { nodeId: 'p2' }, property: 'title', value: 'User Preferences' } },
      { type: 'component.setNodeProperty', payload: { node: { nodeId: 'p2' }, property: 'description', value: 'Your preferences' } },
    ]);
    validateProject('5-designer-page-rename');

    project.batch([
      { type: 'component.moveNode', payload: { source: { bind: 'hasPet' }, targetParent: { nodeId: 'root' } } },
      { type: 'theme.setExtension', payload: { key: 'x-theme-mode', value: 'dark' } },
    ]);
    validateProject('5-designer-end');
  });
});
