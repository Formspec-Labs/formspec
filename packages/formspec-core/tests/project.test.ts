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
