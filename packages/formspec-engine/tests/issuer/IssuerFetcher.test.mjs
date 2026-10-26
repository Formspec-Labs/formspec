/** @filedesc Tests for IssuerFetcher fetch-backed adapter and content-hash verification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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

// Independent vector: SHA-256 of these literal canonical UTF-8 bytes, without a
// domain prefix. Do not use the production canonicalizer to produce test pins.
const CANONICAL_ISSUER = '{"$formspecIssuer":"1.0","kind":"organization","name":"X","url":"https://x/i.json","version":"1.0.0"}';
const ISSUER_HASH = '2b6759e7e8904b5004bf11a3f9c3190568488d0957608b136d7901e6e6a49fba';
const PINNED_ISSUER = { ...ISSUER, version: `1.0.0+sha256-${ISSUER_HASH}` };

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

test('FetchIssuerFetcher accepts an independently pinned Issuer and preserves published data', async () => {
  assert.equal(sha256(CANONICAL_ISSUER), ISSUER_HASH);
  const body = `${JSON.stringify(PINNED_ISSUER, null, 2)}\n`;
  let calls = 0;
  const fetcher = new FetchIssuerFetcher({ fetch: async () => {
    calls += 1;
    return response(body, { status: 200 });
  } });

  const got = await fetcher.fetch(ISSUER.url);

  assert.equal(calls, 1);
  assert.deepEqual(got.issuer, PINNED_ISSUER);
  assert.equal(got.issuer.version, PINNED_ISSUER.version);
  assert.deepEqual(got.rawBytes, new TextEncoder().encode(body));
});

test('FetchIssuerFetcher treats whitespace and member order as equivalent', async () => {
  const bodies = [
    JSON.stringify(PINNED_ISSUER),
    JSON.stringify(Object.fromEntries(Object.entries(PINNED_ISSUER).reverse()), null, 4),
  ];
  for (const body of bodies) {
    const fetcher = new FetchIssuerFetcher({ fetch: async () => response(body) });
    assert.deepEqual((await fetcher.fetch(ISSUER.url)).issuer, PINNED_ISSUER);
  }
});

test('FetchIssuerFetcher refuses changed content and base version after one reload', async (t) => {
  for (const [label, changes] of [
    ['name', { name: 'Y' }],
    ['url', { url: 'https://x/j.json' }],
    ['base version', { version: `1.0.1+sha256-${ISSUER_HASH}` }],
  ]) {
    await t.test(label, async () => {
      const seenInit = [];
      const fetcher = new FetchIssuerFetcher({ fetch: async (_url, init) => {
        seenInit.push(init);
        return response(JSON.stringify({ ...PINNED_ISSUER, ...changes }));
      } });
      await assert.rejects(() => fetcher.fetch(ISSUER.url), /content hash mismatch/i);
      assert.deepEqual(seenInit, [{}, { cache: 'reload' }]);
    });
  }
});

const NESTED_VERSION = `2.0.0+sha256-${'e'.repeat(64)}`;
const EXACT_CANONICAL = `{"$formspecIssuer":"1.0","extensions":{"x-proof":{"value":1234567890123456789.1,"version":"${NESTED_VERSION}"}},"kind":"organization","name":"X","url":"https://x/i.json","version":"1.0.0"}`;
const EXACT_PINNED = EXACT_CANONICAL.replace('"version":"1.0.0"', `"version":"1.0.0+sha256-${sha256(EXACT_CANONICAL)}"`);

test('FetchIssuerFetcher hashes exact decimal extensions and preserves nested version suffixes', async () => {
  const fetcher = new FetchIssuerFetcher({ fetch: async () => response(EXACT_PINNED) });
  const got = await fetcher.fetch(ISSUER.url);

  assert.equal(got.issuer.extensions['x-proof'].version, NESTED_VERSION);
  // Keep the public JSON.parse number view while hashing the unrounded source.
  assert.deepEqual(got.issuer, JSON.parse(EXACT_PINNED));
  assert.deepEqual(got.rawBytes, new TextEncoder().encode(EXACT_PINNED));
});

test('FetchIssuerFetcher detects exact decimal and nested-version tampering', async (t) => {
  const changedDecimal = EXACT_PINNED.replace('1234567890123456789.1', '1234567890123456789.2');
  assert.equal(JSON.parse(EXACT_PINNED).extensions['x-proof'].value,
    JSON.parse(changedDecimal).extensions['x-proof'].value);
  for (const [label, body] of [
    ['exact decimal', changedDecimal],
    ['nested version suffix', EXACT_PINNED.replace(NESTED_VERSION, `2.0.0+sha256-${'f'.repeat(64)}`)],
  ]) {
    await t.test(label, async () => {
      let calls = 0;
      const fetcher = new FetchIssuerFetcher({ fetch: async () => {
        calls += 1;
        return response(body);
      } });
      await assert.rejects(() => fetcher.fetch(ISSUER.url), /content hash mismatch/i);
      assert.equal(calls, 2);
    });
  }
});

test('FetchIssuerFetcher recovers a valid pin through the cache-reload retry', async () => {
  const seenInit = [];
  const bodies = [JSON.stringify({ ...PINNED_ISSUER, name: 'Y' }), JSON.stringify(PINNED_ISSUER)];
  const fetcher = new FetchIssuerFetcher({ fetch: async (_url, init) => {
    seenInit.push(init);
    return response(bodies[seenInit.length - 1], { headers: { etag: `"v${seenInit.length}"` } });
  } });

  const got = await fetcher.fetch(ISSUER.url, { ifNoneMatch: '"old"' });

  assert.deepEqual(got.issuer, PINNED_ISSUER);
  assert.deepEqual(got.rawBytes, new TextEncoder().encode(bodies[1]));
  assert.equal(got.etag, '"v2"');
  assert.deepEqual(seenInit, [
    { headers: { 'if-none-match': '"old"' } },
    { cache: 'reload' },
  ]);
});
