import { describe, expect, it } from 'vitest';
import { createRawProject } from '../src/index.js';

describe('external Mapping source association', () => {
  it('preserves the independent schema through command authoring, export and reopen', () => {
    const project = createRawProject();
    const sourceSchema = {
      url: 'urn:example:records', version: '1.0.0',
      schema: { type: 'object', properties: { label: { type: 'string' } } },
    };
    project.dispatch({ type: 'mapping.create', payload: { id: 'external' } });
    project.dispatch({ type: 'mapping.setProperty', payload: { mappingId: 'external', property: 'sourceSchema', value: sourceSchema } });
    project.dispatch({ type: 'mapping.addRule', payload: { mappingId: 'external', sourcePath: 'label', targetPath: 'label', transform: 'preserve' } });
    const bundle = project.export();
    const mapping = bundle.mappings!.external;
    expect(mapping.sourceSchema).toEqual(sourceSchema);
    expect(mapping).not.toHaveProperty('definitionRef');
    expect(mapping).not.toHaveProperty('definitionVersion');
    expect(createRawProject({ seed: bundle }).export().mappings!.external).toEqual(mapping);
  });

  it('keeps Definition association defaults for existing mappings', () => {
    const project = createRawProject();
    project.dispatch({ type: 'mapping.addRule', payload: { sourcePath: 'label', targetPath: 'label', transform: 'preserve' } });
    expect(project.mapping.definitionRef).toBe(project.definition.url);
    expect(project.mapping.definitionVersion).toBe('>=0.0.0');
    expect(project.mapping).not.toHaveProperty('sourceSchema');
  });
});
