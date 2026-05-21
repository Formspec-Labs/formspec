import { describe, it, expect } from 'vitest';
import { resolvePageStructure } from '../src/index.js';
import type { ProjectState } from '../src/index.js';

/**
 * Minimal state factory — constructs state with a component tree (Stack > Section*).
 * Page handlers now write Section page units to the component tree, not theme.pages.
 */
function makeState(overrides: {
  definition?: Record<string, unknown>;
  component?: Record<string, unknown>;
  theme?: Record<string, unknown>;
} = {}): ProjectState {
  return {
    definition: {
      $formspec: '1.0', url: 'urn:test', version: '1.0.0', title: 'Test',
      items: [],
      ...overrides.definition,
    } as any,
    theme: { ...overrides.theme } as any,
    component: { ...overrides.component } as any,
    mappings: {},
    selectedMappingId: 'default',
    extensions: { registries: [] },
    versioning: { baseline: {} as any, releases: [] },
  };
}

/** Helper: build a component tree with Sections containing bound items. */
function makeTree(pages: Array<{ id: string; title: string; description?: string; binds: string[] }>) {
  return {
    component: 'Stack', nodeId: 'root',
    children: pages.map(p => ({
      component: 'Section',
      nodeId: p.id,
      id: p.id,
      title: p.title,
      ...(p.description !== undefined && { description: p.description }),
      _layout: true,
      children: p.binds.map(key => ({
        component: 'TextInput', bind: key,
      })),
    })),
  };
}

describe('resolvePageStructure', () => {
  it('returns single mode with empty pages when nothing is configured', () => {
    const result = resolvePageStructure(makeState(), []);

    expect(result.mode).toBe('single');
    expect(result.pages).toEqual([]);
    expect(result.unassignedItems).toEqual([]);
    expect(result.itemPageMap).toEqual({});
    expect(result.diagnostics).toEqual([]);
  });

  it('builds pages from component tree with enriched regions', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Step 1', binds: ['name'] },
          { id: 'p2', title: 'Step 2', binds: ['age'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['name', 'age']);

    expect(result.mode).toBe('wizard');
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].id).toBe('p1');
    expect(result.pages[0].title).toBe('Step 1');
    expect(result.pages[0].regions).toEqual([
      { key: 'name', span: 12, exists: true },
    ]);
    expect(result.pages[1].regions).toEqual([
      { key: 'age', span: 12, exists: true },
    ]);
  });

  it('falls back to theme pages when the component tree has no direct page Sections', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'tabs' } },
      component: {
        tree: {
          component: 'Stack',
          nodeId: 'root',
          children: [{ component: 'TextInput', bind: 'orphan' }],
        },
      },
      theme: {
        pages: [
          {
            id: 'overview',
            title: 'Overview',
            regions: [{ key: 'name', span: 6, start: 2 }],
          },
        ],
      },
    });

    const result = resolvePageStructure(state, ['name', 'orphan']);

    expect(result.mode).toBe('tabs');
    expect(result.pages).toEqual([
      {
        id: 'overview',
        title: 'Overview',
        regions: [{ key: 'name', span: 6, start: 2, exists: true }],
      },
    ]);
    expect(result.itemPageMap).toEqual({ name: 'overview' });
    expect(result.unassignedItems).toEqual(['orphan']);
  });

  it('prefers direct component page Sections over theme pages', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: makeTree([
          { id: 'component-page', title: 'Component Page', binds: ['name'] },
        ]),
      },
      theme: {
        pages: [
          { id: 'theme-page', title: 'Theme Page', regions: [{ key: 'email' }] },
        ],
      },
    });

    const result = resolvePageStructure(state, ['name', 'email']);

    expect(result.pages.map(page => page.id)).toEqual(['component-page']);
    expect(result.itemPageMap).toEqual({ name: 'component-page' });
    expect(result.unassignedItems).toEqual(['email']);
  });

  it('prefers a root component Section over theme pages', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'tabs' } },
      component: {
        tree: {
          component: 'Section',
          nodeId: 'root-section',
          id: 'component-root',
          title: 'Component Root',
          children: [{ component: 'TextInput', bind: 'name' }],
        },
      },
      theme: {
        pages: [
          { id: 'theme-page', title: 'Theme Page', regions: [{ key: 'email' }] },
        ],
      },
    });

    const result = resolvePageStructure(state, ['name', 'email']);

    expect(result.pages.map(page => page.id)).toEqual(['component-root']);
    expect(result.itemPageMap).toEqual({ name: 'component-root' });
    expect(result.unassignedItems).toEqual(['email']);
  });

  it('does not treat nested Section containers as component-owned pages', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: {
          component: 'Stack',
          nodeId: 'root',
          children: [
            {
              component: 'Card',
              children: [
                {
                  component: 'Section',
                  id: 'nested-section',
                  title: 'Nested',
                  children: [{ component: 'TextInput', bind: 'nested' }],
                },
              ],
            },
          ],
        },
      },
      theme: {
        pages: [
          { id: 'theme-page', title: 'Theme Page', regions: [{ key: 'themeKey' }] },
        ],
      },
    });

    const result = resolvePageStructure(state, ['nested', 'themeKey']);

    expect(result.pages.map(page => page.id)).toEqual(['theme-page']);
    expect(result.itemPageMap).toEqual({ themeKey: 'theme-page' });
    expect(result.unassignedItems).toEqual(['nested']);
  });

  it('builds itemPageMap from region assignments', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'A', binds: ['name'] },
          { id: 'p2', title: 'B', binds: ['email'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['name', 'email']);

    expect(result.itemPageMap).toEqual({ name: 'p1', email: 'p2' });
  });

  it('reports unassigned items not in any page', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'A', binds: ['name'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['name', 'email', 'age']);

    expect(result.unassignedItems).toEqual(['email', 'age']);
  });

  it('marks region exists=false when key is not a known definition item', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'A', binds: ['name', 'ghost'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['name']);

    expect(result.pages[0].regions[0].exists).toBe(true);
    expect(result.pages[0].regions[1].exists).toBe(false);
  });

  it('emits UNKNOWN_REGION_KEY for non-existent region keys', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Page', binds: ['ghost'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['name']);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'UNKNOWN_REGION_KEY',
        message: expect.stringContaining('ghost'),
      }),
    );
  });

  it('inherits page IDs for child items when a group is assigned to a page', () => {
    const state = makeState({
      definition: {
        items: [
          {
            key: 'group1',
            type: 'group',
            children: [
              { key: 'child1', type: 'string' },
              { key: 'child2', type: 'string' },
            ],
          },
        ],
      },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Page 1', binds: ['group1'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['group1', 'child1', 'child2']);

    expect(result.itemPageMap).toEqual({
      group1: 'p1',
      child1: 'p1',
      child2: 'p1',
    });
    expect(result.unassignedItems).toEqual([]);
  });

  it('allows children to explicitly override inherited page IDs', () => {
    const state = makeState({
      definition: {
        items: [
          {
            key: 'group1',
            type: 'group',
            children: [
              { key: 'child1', type: 'string' },
              { key: 'child2', type: 'string' },
            ],
          },
        ],
      },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Page 1', binds: ['group1'] },
          { id: 'p2', title: 'Page 2', binds: ['child2'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['group1', 'child1', 'child2']);

    expect(result.itemPageMap).toEqual({
      group1: 'p1',
      child1: 'p1',
      child2: 'p2', // Explicit override wins
    });
  });

  it('propagates page IDs through deeply nested groups', () => {
    const state = makeState({
      definition: {
        items: [
          {
            key: 'outer',
            type: 'group',
            children: [
              {
                key: 'inner',
                type: 'group',
                children: [
                  { key: 'deep_field', type: 'string' },
                ],
              },
              { key: 'sibling', type: 'string' },
            ],
          },
        ],
      },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Page 1', binds: ['outer'] },
        ]),
      },
    });

    const result = resolvePageStructure(
      state,
      ['outer', 'inner', 'deep_field', 'sibling'],
    );

    expect(result.itemPageMap).toEqual({
      outer: 'p1',
      inner: 'p1',
      deep_field: 'p1',
      sibling: 'p1',
    });
    expect(result.unassignedItems).toEqual([]);
  });

  it('emits PAGEMODE_MISMATCH when pages exist but pageMode is single', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'single' } },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Orphan', binds: [] },
        ]),
      },
    });

    const result = resolvePageStructure(state, []);

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'PAGEMODE_MISMATCH' }),
    );
  });

  it('returns wizard mode with empty pages when pageMode is wizard and no pages exist', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
    });

    const result = resolvePageStructure(state, []);

    expect(result.mode).toBe('wizard');
    expect(result.pages).toEqual([]);
  });

  it('returns tabs mode when pageMode is tabs', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'tabs' } },
      component: {
        tree: makeTree([
          { id: 't1', title: 'Tab 1', binds: ['name'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['name']);

    expect(result.mode).toBe('tabs');
  });

  it('defaults region span to 12 (component tree does not carry span)', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'A', binds: ['name'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['name']);

    expect(result.pages[0].regions[0].span).toBe(12);
  });

  it('all items are unassigned when no pages exist', () => {
    const result = resolvePageStructure(makeState(), ['name', 'email']);

    expect(result.unassignedItems).toEqual(['name', 'email']);
  });

  it('unassignedItems only contains top-level unassigned items, not their children', () => {
    const state = makeState({
      definition: {
        items: [
          {
            key: 'group1',
            type: 'group',
            children: [
              { key: 'child1', type: 'string' },
            ],
          },
        ],
      },
    });

    const result = resolvePageStructure(state, ['group1', 'child1']);

    // No pages exist — group is shown as unassigned, child is suppressed
    expect(result.unassignedItems).toEqual(['group1']);
  });

  it('group is not unassigned when all its children are placed as regions', () => {
    const state = makeState({
      definition: {
        formPresentation: { pageMode: 'wizard' },
        items: [
          {
            key: 'app',
            type: 'group',
            label: 'Applicant',
            children: [
              { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
              { key: 'dob', type: 'field', dataType: 'date', label: 'DOB' },
            ],
          },
        ],
      },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Step 1', binds: ['name', 'dob'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['app', 'name', 'dob']);

    // Group 'app' is not in any page directly, but all its children are.
    // Bottom-up propagation should mark it as assigned.
    expect(result.unassignedItems).toEqual([]);
  });

  it('group IS unassigned when only some children are placed', () => {
    const state = makeState({
      definition: {
        formPresentation: { pageMode: 'wizard' },
        items: [
          {
            key: 'app',
            type: 'group',
            label: 'Applicant',
            children: [
              { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
              { key: 'dob', type: 'field', dataType: 'date', label: 'DOB' },
            ],
          },
        ],
      },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Step 1', binds: ['name'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['app', 'name', 'dob']);

    // 'dob' is not placed — group 'app' is partially unassigned.
    // Show 'dob' as unassigned (not the group, since one child IS placed).
    expect(result.unassignedItems).toContain('dob');
    expect(result.unassignedItems).not.toContain('app');
    expect(result.unassignedItems).not.toContain('name');
  });

  it('does not include wizardConfig (component concern, not resolution)', () => {
    const result = resolvePageStructure(makeState(), []);

    expect(result).not.toHaveProperty('wizardConfig');
  });

  it('preserves page description from component tree', () => {
    const state = makeState({
      definition: { formPresentation: { pageMode: 'wizard' } },
      component: {
        tree: makeTree([
          { id: 'p1', title: 'Step 1', description: 'Enter your info', binds: ['name'] },
          { id: 'p2', title: 'Step 2', binds: ['age'] },
        ]),
      },
    });

    const result = resolvePageStructure(state, ['name', 'age']);

    expect(result.pages[0].description).toBe('Enter your info');
    expect(result.pages[1].description).toBeUndefined();
  });
});
