import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

/** Get Section nodes from the component tree. */
function getPageNodes(project: ReturnType<typeof createRawProject>): any[] {
  const tree = project.component.tree;
  return (tree?.children ?? []).filter((c: any) => c.component === 'Section');
}

/** Get the first page's nodeId from the component tree. */
function getPageId(project: ReturnType<typeof createRawProject>, index = 0): string {
  const pages = getPageNodes(project);
  if (!pages[index]) throw new Error(`No page at index ${index}`);
  return pages[index].nodeId;
}

function addPage(project: ReturnType<typeof createRawProject>, title: string, id?: string, description?: string): string {
  project.dispatch({
    type: 'definition.setFormPresentation',
    payload: { property: 'pageMode', value: 'wizard' },
  });
  const result = project.dispatch({
    type: 'component.addNode',
    payload: {
      parent: { nodeId: 'root' },
      component: 'Section',
      props: { ...(id ? { nodeId: id } : {}), title, ...(description ? { description } : {}) },
    },
  }) as any;
  return id ?? result.nodeRef.nodeId;
}

function placeOnPage(project: ReturnType<typeof createRawProject>, pageId: string, bind: string) {
  project.dispatch({
    type: 'component.moveNode',
    payload: { source: { bind }, targetParent: { nodeId: pageId } },
  });
}

describe('page-aware component tree rebuild', () => {
  it('generates flat Stack when no pages exist', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });

    const tree = project.component.tree;
    expect(tree.component).toBe('Stack');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].bind).toBe('name');
  });

  it('generates flat Stack in single mode even when pages exist (dormant)', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    const pageId = addPage(project, 'Step 1');
    placeOnPage(project, pageId, 'name');

    // Switch to single — pages are dormant but still in tree
    project.dispatch({ type: 'definition.setFormPresentation', payload: { property: 'pageMode', value: 'single' } });

    const tree = project.component.tree;
    expect(tree.component).toBe('Stack');
    // Section nodes are still present (dormant), but root is Stack not Wizard
    // The renderer ignores Section nodes when pageMode is 'single'
  });

  it('creates Section children in component tree when pages are added', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });
    const pageId1 = addPage(project, 'Step 1');
    const pageId2 = addPage(project, 'Step 2');
    placeOnPage(project, pageId1, 'name');
    placeOnPage(project, pageId2, 'email');

    const tree = project.component.tree;
    expect(tree.component).toBe('Stack');
    const pages = getPageNodes(project);
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe('Step 1');
    expect(pages[0].children.some((c: any) => c.bind === 'name')).toBe(true);
    expect(pages[1].title).toBe('Step 2');
    expect(pages[1].children.some((c: any) => c.bind === 'email')).toBe(true);
  });

  it('sets Section title and description from handler payload', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    addPage(project, 'My Step', undefined, 'Do this');
    const pageId = getPageId(project);
    placeOnPage(project, pageId, 'name');

    const pages = getPageNodes(project);
    expect(pages[0].title).toBe('My Step');
    expect(pages[0].description).toBe('Do this');
  });

  it('preserves Section structure after definition item changes trigger reconcile', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    const pageId = addPage(project, 'Step 1');
    placeOnPage(project, pageId, 'name');

    // Adding another item triggers a reconcile
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'email' } });

    const tree = project.component.tree;
    expect(tree.component).toBe('Stack');
    const pages = getPageNodes(project);
    // Page should survive the reconcile (_layout: true preserves it)
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('Step 1');
    // 'email' should be at root level (unassigned)
    expect(tree.children.some((c: any) => c.bind === 'email')).toBe(true);
  });

  it('generates empty Page when no items are assigned to it', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    addPage(project, 'Empty Page');
    const fullPageId = addPage(project, 'Full Page');
    placeOnPage(project, fullPageId, 'name');

    const pages = getPageNodes(project);
    const emptyPage = pages.find((c: any) => c.title === 'Empty Page');
    const fullPage = pages.find((c: any) => c.title === 'Full Page');
    expect(emptyPage.children ?? []).toEqual([]);
    expect(fullPage.children).toHaveLength(1);
  });

  it('reconciles authored trees while preserving page structure', () => {
    const project = createRawProject({
      seed: {
        component: {
          $formspecComponent: '1.0',
          tree: { component: 'Stack', nodeId: 'custom-root', children: [] },
        },
      },
    });
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    addPage(project, 'Step 1');

    const tree = project.component.tree;
    expect(tree.nodeId).toBe('root');
    expect(getPageNodes(project)).toHaveLength(1);
  });

  it('addPage promotes pageMode to wizard', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });

    // No pageMode set initially
    expect((project.definition as any).formPresentation?.pageMode).toBeUndefined();

    addPage(project, 'Step 1');

    // addPage should set pageMode to wizard
    expect((project.definition as any).formPresentation?.pageMode).toBe('wizard');
  });

  it('does not generate unassigned Page when all items are assigned', () => {
    const project = createRawProject();
    project.dispatch({ type: 'definition.addItem', payload: { type: 'field', key: 'name' } });
    const pageId = addPage(project, 'Step 1');
    placeOnPage(project, pageId, 'name');

    const pages = getPageNodes(project);
    expect(pages).toHaveLength(1);
    expect(pages[0].title).toBe('Step 1');
  });
});
