import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import { createRawProject } from '../src/index.js';
import { lintDocument, type SchemaValidator } from '@formspec-org/engine/fel-tools';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMAS_DIR = path.resolve(__dirname, '../../../schemas');

/** Get the nodeId of a Section page unit from the component tree. */
function getPageId(project: ReturnType<typeof createRawProject>, index = 0): string {
  const tree = project.component.tree;
  const pages = (tree?.children ?? []).filter((c: any) => c.component === 'Section');
  if (!pages[index]) throw new Error(`No page at index ${index}`);
  return pages[index].nodeId;
}

function addPage(project: ReturnType<typeof createRawProject>, title: string, id?: string): string {
  project.dispatch({
    type: 'definition.setFormPresentation',
    payload: { property: 'pageMode', value: 'wizard' },
  });
  const result = project.dispatch({
    type: 'component.addNode',
    payload: {
      parent: { nodeId: 'root' },
      component: 'Section',
      props: { ...(id ? { nodeId: id } : {}), title },
    },
  }) as any;
  return id ?? result.nodeRef.nodeId;
}

function moveNodeToPage(
  project: ReturnType<typeof createRawProject>,
  pageId: string,
  node: { bind?: string; nodeId?: string },
) {
  project.dispatch({
    type: 'component.moveNode',
    payload: { source: node, targetParent: { nodeId: pageId } },
  });
}

describe('diagnose', () => {
  function createLintBackedSchemaValidator(): SchemaValidator {
    return {
      validate(document) {
        const result = lintDocument(document);
        return {
          documentType: result.documentType as any,
          errors: result.diagnostics.map((diagnostic: any) => ({
            path: diagnostic.path ?? '$',
            message: diagnostic.message,
            raw: diagnostic,
          })),
        };
      },
    };
  }

  it('returns clean diagnostics for valid empty project', () => {
    const project = createRawProject();
    const diag = project.diagnose();

    expect(diag.structural).toEqual([]);
    expect(diag.expressions).toEqual([]);
    expect(diag.extensions).toEqual([]);
    expect(diag.consistency).toEqual([]);
    expect(diag.counts).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it('returns empty structural when no schemaValidator is provided', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:test',
          version: '1.0.0',
          status: 'draft',
          title: 'Broken',
          items: [{ type: 'field', label: 'Missing key' }],
        } as any,
      },
    });
    const diag = project.diagnose();
    expect(diag.structural).toEqual([]);
  });

  it('populates structural when schemaValidator is provided and definition is invalid', () => {
    const definitionSchema = JSON.parse(
      fs.readFileSync(path.join(SCHEMAS_DIR, 'definition.schema.json'), 'utf-8'),
    );
    expect(definitionSchema).toBeTruthy();
    const validator = createLintBackedSchemaValidator();
    const project = createRawProject({
      schemaValidator: validator,
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:test',
          version: '1.0.0',
          status: 'draft',
          title: 'Broken',
          items: [{ type: 'field', label: 'Missing key' }],
        } as any,
      },
    });
    const diag = project.diagnose();
    expect(diag.structural.length).toBeGreaterThan(0);
    expect(diag.structural.some((d) => d.code === 'E101' && d.artifact === 'definition')).toBe(true);
    expect(diag.counts.error).toBeGreaterThan(0);
  });

  it('detects unresolved extension references', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'email', extension: 'x-custom', value: true } });

    const diag = project.diagnose();
    expect(diag.extensions.length).toBe(1);
    expect(diag.extensions[0].code).toBe('UNRESOLVED_EXTENSION');
    expect(diag.extensions[0].severity).toBe('error');
    expect(diag.counts.error).toBe(1);
  });

  it('passes when extension is in loaded registry', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test',
          entries: [{ name: 'x-custom', category: 'constraint', status: 'stable' }],
        },
      },
    });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'email', extension: 'x-custom', value: true } });

    const diag = project.diagnose();
    expect(diag.extensions).toEqual([]);
  });

  it('reports deprecated and retired extension usage from shared validation helper', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'project.loadRegistry',
      payload: {
        registry: {
          url: 'urn:test',
          entries: [
            { name: 'x-deprecated', category: 'constraint', status: 'deprecated' },
            { name: 'x-retired', category: 'constraint', status: 'retired' },
          ],
        },
      },
    });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'email', extension: 'x-deprecated', value: true } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'email', extension: 'x-retired', value: true } });

    const diag = project.diagnose();
    expect(diag.extensions.some((entry) => entry.code === 'EXTENSION_DEPRECATED')).toBe(true);
    expect(diag.extensions.some((entry) => entry.code === 'EXTENSION_RETIRED')).toBe(true);
  });

  it('detects component tree referencing nonexistent items', () => {
    const project = createRawProject();
    // Manually add a component node bound to a field that doesn't exist
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'nonexistent' },
    });

    const diag = project.diagnose();
    const orphan = diag.consistency.find(d => d.code === 'ORPHAN_COMPONENT_BIND');
    expect(orphan).toBeDefined();
    expect(orphan!.severity).toBe('warning');
  });

  it('allows component node bound to a display item', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'display', key: 'notice', label: 'Read carefully' } });
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'Text', bind: 'notice' },
    });

    const diag = project.diagnose();
    const displayBind = diag.consistency.find(d => d.code === 'DISPLAY_ITEM_BIND');
    expect(displayBind).toBeUndefined();
  });

  it('detects non-group-aware component bound to a group item', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'section', label: 'Section' } });
    project.dispatch({
      type: 'component.addNode',
      payload: { parent: { nodeId: 'root' }, component: 'TextInput', bind: 'section' },
    });

    const diag = project.diagnose();
    const groupBind = diag.consistency.find(d => d.code === 'DISPLAY_ITEM_BIND');
    expect(groupBind).toBeDefined();
    expect(groupBind!.severity).toBe('warning');
    expect(groupBind!.path).toBe('section');
  });

  it('detects stale mapping rule source paths', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    project.dispatch({ type: 'mapping.addRule', payload: { sourcePath: 'deleted_field', targetPath: 'output.name' } });

    const diag = project.diagnose();
    const stale = diag.consistency.find(d => d.code === 'STALE_MAPPING_SOURCE');
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe('warning');
  });

  it('detects unmatched theme selectors', () => {
    const project = createRawProject();
    project.batch([
      { type: 'definition.addItem', payload: { type: 'field', key: 'name', dataType: 'string' } },
      { type: 'theme.addSelector', payload: { match: { dataType: 'integer' }, apply: { widget: 'NumberInput' } } },
    ]);

    const diag = project.diagnose();
    expect(diag.consistency.some((entry) => entry.code === 'UNMATCHED_THEME_SELECTOR')).toBe(true);
  });

  it('aggregates counts correctly', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'f1' } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'f1', extension: 'x-bad1', value: true } });
    project.dispatch({ type: 'definition.setItemExtension', payload: { path: 'f1', extension: 'x-bad2', value: true } });
    project.dispatch({ type: 'mapping.addRule', payload: { sourcePath: 'stale', targetPath: 'out' } });

    const diag = project.diagnose();
    expect(diag.counts.error).toBe(2);    // 2 unresolved extensions
    expect(diag.counts.warning).toBe(1);  // 1 stale mapping
  });

  it('warns about root-level non-group items in paged definitions', () => {
    const project = createRawProject();
    // Add root-level items BEFORE enabling pageMode (the real scenario:
    // user has a flat form, then enables wizard mode)
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'page1', label: 'Page 1' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'rootField' } });
    project.dispatch({ type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'wizard' } });

    const diag = project.diagnose();
    const pagedWarning = diag.consistency.find(d => d.code === 'PAGED_ROOT_NON_GROUP');
    expect(pagedWarning).toBeDefined();
    expect(pagedWarning!.severity).toBe('warning');
    expect(pagedWarning!.path).toContain('rootField');
  });

  it('no paged warning when pageMode is not set', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'rootField' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'g1' } });

    const diag = project.diagnose();
    expect(diag.consistency.filter(d => d.code === 'PAGED_ROOT_NON_GROUP')).toEqual([]);
  });

  it('no paged warning when all root items are groups', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'page1' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'group', key: 'page2' } });
    project.dispatch({ type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'tabs' } });

    const diag = project.diagnose();
    expect(diag.consistency.filter(d => d.code === 'PAGED_ROOT_NON_GROUP')).toEqual([]);
  });

  it('no PAGED_ROOT_NON_GROUP warning for page-placed root items', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    // Create a page and place both items on it
    const pageId = addPage(project, 'Contact Info');
    moveNodeToPage(project, pageId, { bind: 'name' });
    moveNodeToPage(project, pageId, { bind: 'email' });

    const diag = project.diagnose();
    const pagedWarnings = diag.consistency.filter(d => d.code === 'PAGED_ROOT_NON_GROUP');
    expect(pagedWarnings).toEqual([]);
  });

  it('PAGED_ROOT_NON_GROUP only fires for unplaced items, not page-placed ones', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'placed_field' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'orphan_field' } });
    // Create a page and place only one item
    const pageId = addPage(project, 'Page 1');
    moveNodeToPage(project, pageId, { bind: 'placed_field' });

    const diag = project.diagnose();
    const pagedWarnings = diag.consistency.filter(d => d.code === 'PAGED_ROOT_NON_GROUP');
    // Only the unplaced item should trigger the warning
    expect(pagedWarnings).toHaveLength(1);
    expect(pagedWarnings[0].path).toBe('orphan_field');
  });

  it('PAGED_ROOT_NON_GROUP message mentions "Other" page for unplaced items', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'stray' } });
    project.dispatch({ type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'wizard' } });

    const diag = project.diagnose();
    const warning = diag.consistency.find(d => d.code === 'PAGED_ROOT_NON_GROUP');
    expect(warning).toBeDefined();
    // The message should NOT claim the item "will be hidden" — it lands in an auto-generated "Other" page
    expect(warning!.message).not.toContain('will be hidden');
    expect(warning!.message).toContain('Other');
  });

  it('does not report STALE_THEME_REGION_KEY for component-only nodes like submit buttons', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'group', key: 'page1', label: 'Page 1' },
    });
    const pageId = addPage(project, 'Page 1');
    moveNodeToPage(project, pageId, { bind: 'page1' });

    // Add a submit button component node and assign its nodeId to the page
    const result = project.dispatch({
      type: 'component.addNode',
      payload: {
        parent: { nodeId: 'root' },
        component: 'SubmitButton',
        props: { label: 'Submit' },
      },
    });
    const nodeId = (result as any)?.nodeRef?.nodeId;
    expect(nodeId).toBeDefined();
    moveNodeToPage(project, pageId, { nodeId });

    const diag = project.diagnose();
    const stale = diag.consistency.filter(
      (d) => d.code === 'STALE_THEME_REGION_KEY',
    );
    expect(stale).toEqual([]);
  });

  it('reports orphan component bind for BoundItem pointing to nonexistent item', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'definition.addItem',
      payload: { type: 'field', key: 'real_item' },
    });
    const pageId = addPage(project, 'Page 1');
    // Assign a key that doesn't exist in the definition — creates a BoundItem placeholder
    project.dispatch({
      type: 'component.addNode',
      payload: {
        parent: { nodeId: pageId },
        component: 'TextInput',
        bind: 'deleted_item',
      },
    });

    // The BoundItem placeholder should trigger an ORPHAN_COMPONENT_BIND diagnostic
    const diag = project.diagnose();
    const orphan = diag.consistency.filter(d => d.code === 'ORPHAN_COMPONENT_BIND');
    expect(orphan.some(d => d.path === 'deleted_item')).toBe(true);
  });

  it('detects transitive variable cycle in consistency diagnostics', () => {
    const project = createRawProject();
    // Create x → depends on y, y → depends on x
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'x', expression: '@y + 1' } });
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'y', expression: '@x + 1' } });

    const diag = project.diagnose();
    const cycleDiags = diag.consistency.filter(d => d.code === 'CIRCULAR_DEPENDENCY');
    expect(cycleDiags.length).toBeGreaterThan(0);
    expect(cycleDiags[0].severity).toBe('error');
  });

  it('detects three-node variable cycle', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'a', expression: '@b' } });
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'b', expression: '@c' } });
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'c', expression: '@a' } });

    const diag = project.diagnose();
    const cycleDiags = diag.consistency.filter(d => d.code === 'CIRCULAR_DEPENDENCY');
    expect(cycleDiags.length).toBeGreaterThan(0);
    expect(cycleDiags[0].severity).toBe('error');
    expect(cycleDiags[0].artifact).toBe('definition');
  });

  it('no CIRCULAR_DEPENDENCY for acyclic variables', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'x', expression: '42' } });
    project.dispatch({ type: 'definition.addVariable', payload: { name: 'y', expression: '@x + 1' } });

    const diag = project.diagnose();
    const cycleDiags = diag.consistency.filter(d => d.code === 'CIRCULAR_DEPENDENCY');
    expect(cycleDiags).toEqual([]);
  });

  it('recognizes component node IDs as valid region keys', () => {
    const project = createRawProject();
    const pageId = addPage(project, 'Page 1');

    // Add two component-only nodes
    project.dispatch({
      type: 'component.addNode',
      payload: {
        parent: { nodeId: 'root' },
        component: 'SubmitButton',
        props: { label: 'Submit' },
      },
    });
    project.dispatch({
      type: 'component.addNode',
      payload: {
        parent: { nodeId: 'root' },
        component: 'ProgressBar',
      },
    });

    // Get the nodeIds from the generated component tree
    const genTree = project.component.tree as any;
    const nodeIds = (genTree?.children ?? [])
      .filter((c: any) => c.nodeId && c.nodeId !== 'root' && c.nodeId !== pageId)
      .map((c: any) => c.nodeId);
    expect(nodeIds.length).toBeGreaterThan(0); // sanity: we actually found nodes

    // Assign them to the page
    for (const nid of nodeIds) {
      moveNodeToPage(project, pageId, { nodeId: nid });
    }

    const diag = project.diagnose();
    const stale = diag.consistency.filter(
      (d) => d.code === 'STALE_THEME_REGION_KEY',
    );
    expect(stale).toEqual([]);
  });
});
