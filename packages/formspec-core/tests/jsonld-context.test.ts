/**
 * @filedesc deriveJsonLdContext: shape, diagnostics, and the ontology/jsonld-roundtrip conformance
 * fixture lifted through jsonld.js (canonical N-Quads, predicates, literal lexical forms).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsonld from 'jsonld';
import type { FormDefinition, OntologyDocument } from '@formspec-org/types';
import { deriveJsonLdContext } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(HERE, '../../../tests/conformance/fixtures/ontology/jsonld-roundtrip');
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(resolve(FIXTURE_ROOT, name), 'utf8')) as T;

const RESPONSE_SUBJECT = 'urn:formspec:response:jsonld-roundtrip';
const XSD = 'http://www.w3.org/2001/XMLSchema#';

function field(key: string, dataType: string): Record<string, unknown> {
  return { key, type: 'field', label: key, dataType };
}

function definitionOf(items: unknown[]): FormDefinition {
  return { $formspec: '1.0', url: 'urn:test', version: '1.0.0', status: 'draft', title: 't', items } as unknown as FormDefinition;
}

function ontologyOf(concepts: Record<string, { concept: string }>): OntologyDocument {
  return { $formspecOntology: '1.0', version: '1.0.0', targetDefinition: { url: 'urn:test' }, concepts } as OntologyDocument;
}

describe('deriveJsonLdContext', () => {
  it('returns the @context object with the header first and terms in definition order', () => {
    const derived = deriveJsonLdContext(
      definitionOf([field('dob', 'date'), field('name', 'string')]),
      ontologyOf({ dob: { concept: 'https://schema.org/birthDate' }, name: { concept: 'https://schema.org/name' } }),
    );
    expect(Object.keys(derived.context)).toEqual(['@version', 'xsd', 'dob', 'name']);
    expect(derived.context.dob).toEqual({ '@id': 'https://schema.org/birthDate', '@type': 'xsd:date' });
    expect(derived.context.name).toEqual({ '@id': 'https://schema.org/name' });
    expect(derived.diagnostics).toEqual([]);
  });

  it('reports a hoisting collision instead of silently overwriting', () => {
    const derived = deriveJsonLdContext(
      definitionOf([
        { key: 'home', type: 'group', label: 'Home', children: [field('city', 'string')] },
        { key: 'work', type: 'group', label: 'Work', children: [field('city', 'string')] },
      ]),
      ontologyOf({ 'home.city': { concept: 'urn:c:home-city' }, 'work.city': { concept: 'urn:c:work-city' } }),
    );
    expect(derived.context.city).toEqual({ '@id': 'urn:c:home-city' });
    expect(derived.diagnostics).toEqual([
      { kind: 'collision', path: 'work.city', key: 'city', existingId: 'urn:c:home-city', newId: 'urn:c:work-city' },
    ]);
  });
});

describe('conformance: ontology/jsonld-roundtrip', () => {
  const definition = readJson<FormDefinition>('definition.json');
  const ontology = readJson<OntologyDocument>('ontology.json');
  const response = readJson<{ data: Record<string, unknown> }>('response.json');
  const expectedNq = readFileSync(resolve(FIXTURE_ROOT, 'expected.nq'), 'utf8');

  const derived = deriveJsonLdContext(definition, ontology);
  const document = { '@context': derived.context, '@id': RESPONSE_SUBJECT, ...response.data };

  it('derives without diagnostics', () => {
    expect(derived.diagnostics).toEqual([]);
  });

  it('lifts the response to the expected canonical N-Quads', async () => {
    const canonical = await jsonld.canonize(document, { algorithm: 'URDNA2015', format: 'application/n-quads', safe: false });
    expect(canonical).toBe(expectedNq);
  });

  it('drops nothing but the unbound leaf (jsonld safe mode)', async () => {
    // Safe mode raises on any dropped property: the full data trips on the unbound `notes` ...
    await expect(jsonld.canonize(document, { algorithm: 'URDNA2015', format: 'application/n-quads', safe: true }))
      .rejects.toMatchObject({ name: 'jsonld.ValidationError' });
    // ... and nothing else, so the same graph comes back once `notes` is gone.
    const eligibility = { ...(response.data.eligibility as Record<string, unknown>) };
    delete eligibility.notes;
    const bound = { ...document, eligibility };
    const canonical = await jsonld.canonize(bound, { algorithm: 'URDNA2015', format: 'application/n-quads', safe: true });
    expect(canonical).toBe(expectedNq);
  });

  it('uses only the ontology concept IRIs and the money vocabulary as predicates', async () => {
    const quads = (await jsonld.toRDF(document)) as Array<{ predicate: { value: string } }>;
    const conceptIris = new Set(Object.values(ontology.concepts ?? {}).map(binding => binding.concept));
    conceptIris.add('https://schema.org/value');
    conceptIris.add('https://schema.org/currency');
    expect(quads.length).toBeGreaterThan(0);
    for (const quad of quads) {
      expect(conceptIris.has(quad.predicate.value), quad.predicate.value).toBe(true);
    }
  });

  it('keeps every bound leaf as an object literal with its typed lexical form', async () => {
    const quads = (await jsonld.toRDF(document)) as Array<{
      predicate: { value: string };
      object: { termType: string; value: string; datatype?: { value: string } };
    }>;
    const literal = (predicate: string, value: string) =>
      quads.find(q => q.predicate.value === predicate && q.object.termType === 'Literal' && q.object.value === value);
    const V = 'https://example.gov/vocab/weekly-certification#';

    expect(literal(`${V}able-and-available`, 'true')?.object.datatype?.value).toBe(`${XSD}boolean`);
    expect(literal(`${V}expected-return-date`, '2026-09-21')?.object.datatype?.value).toBe(`${XSD}date`);
    expect(literal('https://schema.org/givenName', 'Ada')?.object.datatype?.value).toBe(`${XSD}string`);
    expect(literal('https://schema.org/birthDate', '1990-01-02')?.object.datatype?.value).toBe(`${XSD}date`);
    expect(literal(`${V}employer-name`, 'Acme')).toBeDefined();
    expect(literal(`${V}employer-name`, 'Bolt')).toBeDefined();
    expect(literal(`${V}hours-worked`, '12')?.object.datatype?.value).toBe(`${XSD}integer`);
    expect(literal(`${V}hours-worked`, '8')?.object.datatype?.value).toBe(`${XSD}integer`);
    // decimal keeps native JSON-LD number typing: fractional → xsd:double, whole → xsd:integer.
    expect(literal(`${V}gross-earnings`, '2.455E2')?.object.datatype?.value).toBe(`${XSD}double`);
    expect(literal(`${V}gross-earnings`, '160')?.object.datatype?.value).toBe(`${XSD}integer`);
    // money: amount is a string, so xsd:decimal keeps the exact lexical form.
    expect(literal('https://schema.org/value', '245.50')?.object.datatype?.value).toBe(`${XSD}decimal`);
    expect(literal('https://schema.org/value', '160.00')?.object.datatype?.value).toBe(`${XSD}decimal`);
    expect(literal('https://schema.org/currency', 'USD')).toBeDefined();
    for (const workType of ['part-time', 'temporary', 'full-time']) {
      expect(literal(`${V}work-type`, workType)).toBeDefined();
    }
    expect(literal(`${V}certified`, 'true')).toBeDefined();
    expect(quads.some(q => q.object.value.startsWith('unbound'))).toBe(false);
  });
});
