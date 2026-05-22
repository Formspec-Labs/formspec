/** @filedesc FormEngine integration tests for Issuer resolution and Response.displayedIssuer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../../dist/index.js';

const ISSUER = {
  $formspecIssuer: '1.0',
  url: 'https://x/issuer.json',
  version: '1.0.0',
  name: 'Issuer A',
  kind: 'organization',
};

const DEFINITION = {
  $formspec: '1.0',
  url: 'https://x/forms/f',
  version: '1.0.0',
  status: 'active',
  title: 'Form',
  items: [],
  issuer: ISSUER,
};

test('FormEngine exposes resolved Issuer from Definition', async () => {
  const engine = new FormEngine(DEFINITION);

  const resolved = await engine.getResolvedIssuer();

  assert.equal(resolved.primary.url, 'https://x/issuer.json');
  assert.equal(resolved.source, 'definition');
});

test('FormEngine host override beats Definition Issuer', async () => {
  const engine = new FormEngine(DEFINITION);
  const host = { ...ISSUER, url: 'https://host/issuer.json', name: 'Host' };

  engine.setIssuerOverride({ kind: 'inline', issuer: host });
  const resolved = await engine.getResolvedIssuer();

  assert.equal(resolved.primary.url, 'https://host/issuer.json');
  assert.equal(resolved.source, 'host-embed');
});

test('FormEngine response pins resolved Issuer at submit', async () => {
  const engine = new FormEngine(DEFINITION);

  await engine.getResolvedIssuer();
  const response = engine.getResponse();

  assert.deepEqual(response.displayedIssuer, {
    url: 'https://x/issuer.json',
    version: '1.0.0',
  });
});

test('FormEngine resolves URL Issuer through injected fetcher', async () => {
  const definition = {
    ...DEFINITION,
    issuer: { url: 'https://issuer.example/issuer.json' },
  };
  const fetched = { ...ISSUER, url: 'https://issuer.example/issuer.json', version: '2.0.0' };
  const fetcher = {
    async fetch() {
      return { issuer: fetched, rawBytes: new TextEncoder().encode(JSON.stringify(fetched)) };
    },
  };
  const engine = new FormEngine(definition, { issuerFetcher: fetcher });

  const resolved = await engine.getResolvedIssuer();
  const response = engine.getResponse();

  assert.equal(resolved.primary.version, '2.0.0');
  assert.deepEqual(response.displayedIssuer, {
    url: 'https://issuer.example/issuer.json',
    version: '2.0.0',
  });
});

test('FormEngine omits displayedIssuer for unbranded fallback', async () => {
  const { issuer: _issuer, ...definition } = DEFINITION;
  const engine = new FormEngine(definition);

  const resolved = await engine.getResolvedIssuer();
  const response = engine.getResponse();

  assert.equal(resolved.source, 'unbranded');
  assert.equal(response.displayedIssuer, undefined);
});
