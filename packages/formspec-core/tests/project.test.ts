import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

describe('createRawProject', () => {
  it('returns a project with default state', () => {
    const project = createRawProject();

    // Definition has a generated URL and empty items
    expect(project.state.definition).toBeDefined();
    expect(project.state.definition.url).toMatch(/^urn:formspec:/);
    expect(project.state.definition.items).toEqual([]);
    expect(project.state.definition.title).toBe('');

    // Component/theme/mapping are blank documents targeting the definition URL
    expect(project.state.component).toBeDefined();
    expect(project.state.component.targetDefinition?.url).toBe(project.state.definition.url);

    expect(project.state.theme).toBeDefined();
    expect(project.state.theme.targetDefinition?.url).toBe(project.state.definition.url);

    expect(project.state.mappings).toBeDefined();

    // No extensions or releases
    expect(project.state.extensions.registries).toEqual([]);
    expect(project.state.versioning.releases).toEqual([]);
  });

  it('accepts a seed to override defaults', () => {
    const project = createRawProject({
      seed: {
        definition: {
          $formspec: '1.0',
          url: 'urn:test:my-form',
          version: '1.0.0',
          title: 'Test Form',
          items: [],
        },
      },
    });

    expect(project.state.definition.url).toBe('urn:test:my-form');
    expect(project.state.definition.title).toBe('Test Form');
    // Component/theme should target the seeded URL
    expect(project.state.component.targetDefinition?.url).toBe('urn:test:my-form');
    expect(project.state.theme.targetDefinition?.url).toBe('urn:test:my-form');
  });

  // theme-spec §2.2.1 / ADR 0160 §4.2: an absent `targetDefinition` declares BUNDLE
  // scope. Seed and import must carry that declaration through untouched — silently
  // minting one rewrites a bundle-scoped Theme into a Definition-scoped one.
  describe('bundle-scoped Theme (theme-spec §2.2.1)', () => {
    const seedDefinition = {
      $formspec: '1.0' as const,
      url: 'urn:test:bundle-app',
      version: '1.0.0',
      title: 'Bundle App',
      items: [],
    };

    it('preserves absent targetDefinition through seed', () => {
      const project = createRawProject({
        seed: {
          definition: seedDefinition,
          theme: { tokens: { 'color.primary': '#0057B7' } },
        },
      });

      expect(project.state.theme.targetDefinition).toBeUndefined();
      // The Component's schema still requires one; only Theme gained bundle scope.
      expect(project.state.component.targetDefinition?.url).toBe('urn:test:bundle-app');
    });

    it('preserves absent targetDefinition through an export round-trip', () => {
      const project = createRawProject({
        seed: {
          definition: seedDefinition,
          theme: { tokens: { 'color.primary': '#0057B7' } },
        },
      });

      const exported = project.export();
      expect(exported.theme.targetDefinition).toBeUndefined();
      expect(exported.theme.$formspecTheme).toBe('1.0');
      expect(exported.theme.tokens).toEqual({ 'color.primary': '#0057B7' });

      // Re-importing the exported bundle must not mint a target either.
      const reimported = createRawProject();
      reimported.dispatch({ type: 'project.import', payload: exported });
      expect(reimported.state.theme.targetDefinition).toBeUndefined();
      expect(reimported.export().theme.targetDefinition).toBeUndefined();
    });

    it('still syncs the URL of a Definition-scoped Theme on import', () => {
      const project = createRawProject();
      project.dispatch({
        type: 'project.import',
        payload: {
          definitions: [seedDefinition],
          theme: {
            $formspecTheme: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:stale' },
          },
        },
      });

      expect(project.state.theme.targetDefinition?.url).toBe('urn:test:bundle-app');
    });
  });

  it('provides convenience accessors for each artifact', () => {
    const project = createRawProject();

    expect(project.definition).toBe(project.state.definition);
    expect(project.component).toStrictEqual(project.state.component);
    expect(project.theme).toBe(project.state.theme);
    expect(project.mapping).toBeDefined();
    expect(project.mappings).not.toBe(project.state.mappings);
    expect(project.mappings.default.$formspecMapping).toBe('1.0');
    expect(project.mappings.default.definitionRef).toBe(project.definition.url);
    expect(project.mappings.default.rules).toEqual(project.state.mappings.default.rules);
    expect(project.mappings.default.rules).not.toBe(project.state.mappings.default.rules);
  });
});

describe('dispatch', () => {
  it('applies a command and updates state', () => {
    const project = createRawProject();

    const result = project.dispatch({
      type: 'definition.setFormTitle',
      payload: { title: 'My Form' },
    });

    expect(project.definition.title).toBe('My Form');
    expect(result.rebuildComponentTree).toBe(false);
  });
});
