/**
 * @filedesc Authored Ontology and Registry sidecars in project state: bundle round trip,
 * single emission, undo, and the derived `extensions.registries` index (fs-5n1f).
 */
import { describe, it, expect } from 'vitest';
import type { OntologyDocument, RegistryDocument } from '@formspec-org/types';
import { createRawProject } from '../src/index.js';

const definition = {
  $formspec: '1.0', url: 'urn:f', version: '1.0.0', status: 'draft', title: 'F',
  items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
};

const ontology: OntologyDocument = {
  $formspecOntology: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:f' },
  concepts: { name: { concept: 'https://schema.org/name' } },
};

function registryOf(name: string, conceptUri: string): RegistryDocument {
  return {
    $formspecRegistry: '1.1',
    publisher: { name: 'Test' },
    published: '2026-01-01T00:00:00Z',
    entries: [{
      name, category: 'concept', version: '1.0.0', status: 'draft', description: 'd',
      compatibility: { formspecVersion: '^1.0.0' }, conceptUri,
    }],
  };
}

const defaultRegistry = registryOf('x-t-name', 'urn:c:name');
const foreignRegistry = registryOf('x-t-email', 'urn:c:email');

describe('authored Ontology and Registry sidecars', () => {
  it('a blank project has no ontology and no authored registries', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    expect(project.state.ontology).toBeNull();
    expect(project.state.registries).toEqual({});
    const bundle = project.export();
    expect('ontology' in bundle).toBe(false);
    expect('registries' in bundle).toBe(false);
  });

  it('round-trips the ontology and two registries (default + foreign id) through export/import', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    project.dispatch({ type: 'ontology.setDocument', payload: { document: ontology } });
    project.dispatch({ type: 'registry.setDocument', payload: { id: 'default', document: defaultRegistry } });
    project.dispatch({ type: 'registry.setDocument', payload: { id: 'nj-vocab', document: foreignRegistry } });

    const bundle = project.export();
    expect(bundle.ontology).toEqual(ontology);
    expect(bundle.registries).toEqual({ default: defaultRegistry, 'nj-vocab': foreignRegistry });
    // Serialized from authored state: the derived index's injected `url` never leaks.
    expect('url' in (bundle.registries!.default as object)).toBe(false);

    const other = createRawProject();
    other.dispatch({ type: 'project.import', payload: bundle });
    expect(other.state.ontology).toEqual(ontology);
    expect(other.state.registries).toEqual({ default: defaultRegistry, 'nj-vocab': foreignRegistry });
    expect(other.export()).toEqual(bundle);
  });

  it('emits each sidecar iff it is present (single emission), and null / remove drop them', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    project.dispatch({ type: 'ontology.setDocument', payload: { document: ontology } });
    project.dispatch({ type: 'registry.setDocument', payload: { id: 'default', document: defaultRegistry } });
    expect(project.export().ontology).toEqual(ontology);
    expect(project.export().registries).toEqual({ default: defaultRegistry });

    project.dispatch({ type: 'ontology.setDocument', payload: { document: null } });
    project.dispatch({ type: 'registry.remove', payload: { id: 'default' } });
    expect(project.state.ontology).toBeNull();
    expect(project.state.registries).toEqual({});
    const bundle = project.export();
    expect('ontology' in bundle).toBe(false);
    expect('registries' in bundle).toBe(false);
  });

  it('setDocument is undoable', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    project.dispatch({ type: 'ontology.setDocument', payload: { document: ontology } });
    project.dispatch({ type: 'registry.setDocument', payload: { id: 'default', document: defaultRegistry } });
    const replaced = { ...ontology, concepts: { name: { concept: 'urn:c:other' } } };
    project.dispatch({ type: 'ontology.setDocument', payload: { document: replaced } });
    expect(project.state.ontology).toEqual(replaced);

    expect(project.undo()).toBe(true);
    expect(project.state.ontology).toEqual(ontology);
    expect(project.undo()).toBe(true);
    expect(project.state.registries).toEqual({});
    expect(project.listRegistries()).toEqual([]);
    expect(project.undo()).toBe(true);
    expect(project.state.ontology).toBeNull();
  });

  it('derives the loaded registry index from the authored documents without authoring twice', () => {
    const project = createRawProject({
      seed: { definition: definition as any },
      registries: [{ url: 'https://ext.example/registry', $formspecRegistry: '1.1', entries: [{ name: 'x-ext-thing', category: 'property' }] }],
    });
    project.dispatch({ type: 'registry.setDocument', payload: { id: 'default', document: defaultRegistry } });
    expect(project.resolveExtension('x-t-name')).toMatchObject({ conceptUri: 'urn:c:name' });
    expect(project.resolveExtension('x-ext-thing')).toBeDefined();
    expect(project.listRegistries()).toHaveLength(2);

    // Replacing the authored document re-indexes it in place: still one row, no stale entry.
    const next = registryOf('x-t-name-2', 'urn:c:name-2');
    project.dispatch({ type: 'registry.setDocument', payload: { id: 'default', document: next } });
    expect(project.listRegistries()).toHaveLength(2);
    expect(project.resolveExtension('x-t-name')).toBeUndefined();
    expect(project.resolveExtension('x-t-name-2')).toBeDefined();

    project.dispatch({ type: 'registry.remove', payload: { id: 'default' } });
    expect(project.listRegistries().map(r => r.url)).toEqual(['https://ext.example/registry']);
    // The authored document is stored verbatim; the index's url is the index's own.
    expect(project.state.registries).toEqual({});
  });

  it('a replace import drops sidecars the bundle omits; a plain import keeps them', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    project.dispatch({ type: 'ontology.setDocument', payload: { document: ontology } });
    project.dispatch({ type: 'registry.setDocument', payload: { id: 'default', document: defaultRegistry } });

    project.dispatch({ type: 'project.import', payload: { theme: { $formspecTheme: '1.0' } } as any });
    expect(project.state.ontology).toEqual(ontology);
    expect(project.state.registries).toEqual({ default: defaultRegistry });

    project.dispatch({ type: 'project.import', payload: { definitions: [definition], replace: true } as any });
    expect(project.state.ontology).toBeNull();
    expect(project.state.registries).toEqual({});
    expect(project.listRegistries()).toEqual([]);
  });
});
