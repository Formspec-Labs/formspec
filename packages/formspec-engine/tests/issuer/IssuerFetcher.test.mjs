/** @filedesc Tests for IssuerFetcher fetch-backed adapter and content-hash verification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FetchIssuerFetcher } from '../../dist/issuer/IssuerFetcher.js';

const ISSUER = {
  $formspecIssuer: '1.0',
  url: 'https://x/i.json',
  version: '1.0.0',
  name: 'X',
  kind: 'organization',
};

function response(body, init = {}) {
  return new Response(body, init);
}

test('FetchIssuerFetcher fetches and parses an Issuer document', async () => {
  const fetch = async () => response(JSON.stringify(ISSUER), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      etag: '"abc"',
      'cache-control': 'max-age=60',
    },
  });
  const fetcher = new FetchIssuerFetcher({ fetch });
  const got = await fetcher.fetch('https://x/i.json');

  assert.equal(got.issuer.name, 'X');
  assert.equal(got.etag, '"abc"');
  assert.equal(got.cacheControl, 'max-age=60');
  assert.ok(got.rawBytes instanceof Uint8Array);
});

test('FetchIssuerFetcher binds the default global fetch implementation', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let seenThis;
  globalThis.fetch = async function () {
    seenThis = this;
    return response(JSON.stringify(ISSUER), { status: 200 });
  };
  const fetcher = new FetchIssuerFetcher();

  await fetcher.fetch('https://x/i.json');

  assert.equal(seenThis, globalThis);
});

test('FetchIssuerFetcher sends If-None-Match and reports 304 revalidation', async () => {
  let seenInit;
  const fetch = async (_url, init) => {
    seenInit = init;
    return new Response(null, {
      status: 304,
      headers: {
        etag: '"abc"',
        'cache-control': 'max-age=120',
      },
    });
  };
  const fetcher = new FetchIssuerFetcher({ fetch });

  const got = await fetcher.fetch('https://x/i.json', { ifNoneMatch: '"old"' });

  assert.equal(seenInit.headers['if-none-match'], '"old"');
  assert.equal(got.notModified, true);
  assert.equal(got.etag, '"abc"');
  assert.equal(got.cacheControl, 'max-age=120');
});

test('FetchIssuerFetcher throws on non-2xx responses', async () => {
  const fetch = async () => response('', { status: 404 });
  const fetcher = new FetchIssuerFetcher({ fetch });

  await assert.rejects(() => fetcher.fetch('https://x/i.json'), /404/);
});

test('FetchIssuerFetcher rejects mismatched +sha256 content hash', async () => {
  const pinned = {
    ...ISSUER,
    version: `1.0.0+sha256-${'a'.repeat(64)}`,
  };
  const fetch = async () => response(JSON.stringify(pinned), { status: 200 });
  const fetcher = new FetchIssuerFetcher({ fetch });

  await assert.rejects(() => fetcher.fetch('https://x/i.json'), /content hash/i);
});

test('FetchIssuerFetcher refetches once after mismatched +sha256 content hash', async () => {
  const pinned = {
    ...ISSUER,
    version: `1.0.0+sha256-${'a'.repeat(64)}`,
  };
  const refreshed = {
    ...ISSUER,
    version: '1.0.1',
    name: 'X Refetched',
  };
  const seenInit = [];
  const fetch = async (_url, init) => {
    seenInit.push(init);
    return response(JSON.stringify(seenInit.length === 1 ? pinned : refreshed), {
      status: 200,
      headers: { etag: `"v${seenInit.length}"` },
    });
  };
  const fetcher = new FetchIssuerFetcher({ fetch });

  const got = await fetcher.fetch('https://x/i.json', { ifNoneMatch: '"old"' });

  assert.equal(got.issuer.name, 'X Refetched');
  assert.equal(got.etag, '"v2"');
  assert.deepEqual(seenInit, [
    { headers: { 'if-none-match': '"old"' } },
    { cache: 'reload' },
  ]);
});
