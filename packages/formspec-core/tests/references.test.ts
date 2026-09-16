/**
 * @filedesc Authored References sidecar in project state: bundle round trip, single
 * emission, and undo (fs-hu67). Mirrors the Ontology sidecar test shape (fs-5n1f,
 * `ontology-registry.test.ts`) — References is single-emission like Ontology, never
 * keyed like Registry/Mapping. Normalizer `targetDefinition.url` alignment is covered in
 * `state-normalizer.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import type { ReferencesDocument } from '@formspec-org/types';
import { createRawProject } from '../src/index.js';

const definition = {
  $formspec: '1.0', url: 'urn:f', version: '1.0.0', status: 'draft', title: 'F',
  items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
};

const references: ReferencesDocument = {
  $formspecReferences: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:f' },
  references: [
    { target: '#', type: 'guidance', audience: 'both', title: 'Overview', uri: 'https://example.gov/overview' },
    { target: 'name', type: 'regulation', audience: 'agent', uri: 'https://example.gov/statute' },
  ],
};

describe('authored References sidecar', () => {
  it('a blank project has no references', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    expect(project.state.references).toBeNull();
    const bundle = project.export();
    expect('references' in bundle).toBe(false);
  });

  it('round-trips the References Document through export/import', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    project.dispatch({ type: 'references.setDocument', payload: { document: references } });

    const bundle = project.export();
    expect(bundle.references).toEqual(references);

    const other = createRawProject();
    other.dispatch({ type: 'project.import', payload: bundle });
    expect(other.state.references).toEqual(references);
    expect(other.export()).toEqual(bundle);
  });

  it('emits iff present (single emission), and null drops it', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    project.dispatch({ type: 'references.setDocument', payload: { document: references } });
    expect(project.export().references).toEqual(references);

    project.dispatch({ type: 'references.setDocument', payload: { document: null } });
    expect(project.state.references).toBeNull();
    expect('references' in project.export()).toBe(false);
  });

  it('setDocument is undoable', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    project.dispatch({ type: 'references.setDocument', payload: { document: references } });
    const replaced = { ...references, references: [references.references[0]] };
    project.dispatch({ type: 'references.setDocument', payload: { document: replaced } });
    expect(project.state.references).toEqual(replaced);

    expect(project.undo()).toBe(true);
    expect(project.state.references).toEqual(references);
    expect(project.undo()).toBe(true);
    expect(project.state.references).toBeNull();
  });

  it('a replace import drops the sidecar the bundle omits; a plain import keeps it', () => {
    const project = createRawProject({ seed: { definition: definition as any } });
    project.dispatch({ type: 'references.setDocument', payload: { document: references } });

    project.dispatch({ type: 'project.import', payload: { theme: { $formspecTheme: '1.0' } } as any });
    expect(project.state.references).toEqual(references);

    project.dispatch({ type: 'project.import', payload: { definitions: [definition], replace: true } as any });
    expect(project.state.references).toBeNull();
  });
});
