/** @filedesc Tests for IssuerStore cascade, cache, and parent-chain resolution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { IssuerStore, MAX_CHAIN_DEPTH } from '../../dist/issuer/IssuerStore.js';

function mkIssuer(props) {
  return {
    $formspecIssuer: '1.0',
    version: '1.0.0',
    name: props.url,
    kind: 'organization',
    ...props,
  };
}

function mkFetcher(docs) {
  return {
    async fetch(url) {
      const value = docs[url];
      if (!value || value === 'error') {
        throw new Error(`mock fetch failed for ${url}`);
      }
      const rawBytes = new TextEncoder().encode(JSON.stringify(value));
      return { issuer: value, rawBytes };
    },
  };
}

test('IssuerStore resolves cascade: host embed wins', async () => {
  const def = mkIssuer({ url: 'https://x/def.json' });
  const host = mkIssuer({ url: 'https://x/host.json' });
  const store = new IssuerStore(mkFetcher({}));

  const resolved = await store.resolve({
    definitionIssuer: { kind: 'inline', issuer: def },
    hostOverride: { kind: 'inline', issuer: host },
  });

  assert.equal(resolved.source, 'host-embed');
  assert.equal(resolved.primary.url, 'https://x/host.json');
});

test('IssuerStore falls back to Definition issuer when no host override exists', async () => {
  const def = mkIssuer({ url: 'https://x/def.json' });
  const store = new IssuerStore(mkFetcher({}));

  const resolved = await store.resolve({ definitionIssuer: { kind: 'inline', issuer: def } });

  assert.equal(resolved.source, 'definition');
  assert.equal(resolved.primary.url, 'https://x/def.json');
});

test('IssuerStore produces unbranded fallback when both inputs are absent', async () => {
  const store = new IssuerStore(mkFetcher({}));

  const resolved = await store.resolve({});

  assert.equal(resolved.source, 'unbranded');
  assert.deepEqual(resolved.chain, []);
});

test('IssuerStore walks parent chain three levels', async () => {
  const leaf = mkIssuer({ url: 'L', parentOrganization: 'M' });
  const mid = mkIssuer({ url: 'M', parentOrganization: 'R' });
  const root = mkIssuer({ url: 'R' });
  const store = new IssuerStore(mkFetcher({ L: leaf, M: mid, R: root }));

  const resolved = await store.resolve({ definitionIssuer: { kind: 'inline', issuer: leaf } });

  assert.deepEqual(resolved.chain.map((issuer) => issuer.url), ['L', 'M', 'R']);
});

test('IssuerStore detects cycles and emits degraded reason', async () => {
  const a = mkIssuer({ url: 'A', parentOrganization: 'B' });
  const b = mkIssuer({ url: 'B', parentOrganization: 'A' });
  const store = new IssuerStore(mkFetcher({ A: a, B: b }));

  const resolved = await store.resolve({ definitionIssuer: { kind: 'inline', issuer: a } });

  assert.equal(resolved.degraded?.reason, 'cycle-detected');
  assert.equal(resolved.degraded?.atUrl, 'A');
});

test('IssuerStore caps chain depth at MAX_CHAIN_DEPTH', async () => {
  const docs = {};
  for (let i = 0; i < MAX_CHAIN_DEPTH + 2; i += 1) {
    docs[String(i)] = mkIssuer({ url: String(i), parentOrganization: String(i + 1) });
  }
  docs[String(MAX_CHAIN_DEPTH + 2)] = mkIssuer({ url: String(MAX_CHAIN_DEPTH + 2) });
  const store = new IssuerStore(mkFetcher(docs));

  const resolved = await store.resolve({ definitionIssuer: { kind: 'url', url: '0' } });

  assert.equal(resolved.chain.length, MAX_CHAIN_DEPTH);
  assert.equal(resolved.degraded?.reason, 'depth-capped');
});

test('IssuerStore fails soft on parent fetch failure', async () => {
  const leaf = mkIssuer({ url: 'L', parentOrganization: 'M', organizationName: 'Leaf Org' });
  const store = new IssuerStore(mkFetcher({ L: leaf, M: 'error' }));

  const resolved = await store.resolve({ definitionIssuer: { kind: 'inline', issuer: leaf } });

  assert.deepEqual(resolved.chain.map((issuer) => issuer.url), ['L']);
  assert.equal(resolved.degraded?.reason, 'parent-fetch-failed');
  assert.equal(resolved.degraded?.atUrl, 'M');
});

test('IssuerStore two-chain rule: host override blocks Definition chain walk', async () => {
  const defIssuer = mkIssuer({ url: 'D', parentOrganization: 'D-PARENT' });
  const host = mkIssuer({ url: 'H', parentOrganization: 'H-PARENT' });
  const hostParent = mkIssuer({ url: 'H-PARENT' });
  const calls = [];
  const fetcher = {
    async fetch(url) {
      calls.push(url);
      const docs = { H: host, 'H-PARENT': hostParent };
      const value = docs[url];
      if (!value) {
        throw new Error(`unexpected fetch: ${url}`);
      }
      return { issuer: value, rawBytes: new TextEncoder().encode(JSON.stringify(value)) };
    },
  };
  const store = new IssuerStore(fetcher);

  const resolved = await store.resolve({
    definitionIssuer: { kind: 'inline', issuer: defIssuer },
    hostOverride: { kind: 'inline', issuer: host },
  });

  assert.deepEqual(resolved.chain.map((issuer) => issuer.url), ['H', 'H-PARENT']);
  assert.equal(calls.includes('D-PARENT'), false);
});

test('IssuerStore caches by URL and reuses on second resolve', async () => {
  const leaf = mkIssuer({ url: 'L' });
  let calls = 0;
  const fetcher = {
    async fetch(url) {
      calls += 1;
      return mkFetcher({ L: leaf }).fetch(url);
    },
  };
  const store = new IssuerStore(fetcher);

  await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
  await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });

  assert.equal(calls, 1);
});

test('IssuerStore refetches expired max-age=0 entries', async () => {
  const v1 = mkIssuer({ url: 'L', version: '1.0.0' });
  const v2 = mkIssuer({ url: 'L', version: '1.0.1' });
  const served = [v1, v2];
  let calls = 0;
  const fetcher = {
    async fetch() {
      const issuer = served[calls];
      calls += 1;
      return {
        issuer,
        rawBytes: new TextEncoder().encode(JSON.stringify(issuer)),
        cacheControl: 'max-age=0',
      };
    },
  };
  const store = new IssuerStore(fetcher);

  const first = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
  const second = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });

  assert.equal(first.primary.version, '1.0.0');
  assert.equal(second.primary.version, '1.0.1');
  assert.equal(calls, 2);
});

test('IssuerStore applies default freshness when Cache-Control is absent', async () => {
  const v1 = mkIssuer({ url: 'L', version: '1.0.0' });
  const v2 = mkIssuer({ url: 'L', version: '1.0.1' });
  let now = 0;
  let calls = 0;
  const fetcher = {
    async fetch() {
      calls += 1;
      const issuer = calls === 1 ? v1 : v2;
      return { issuer, rawBytes: new TextEncoder().encode(JSON.stringify(issuer)) };
    },
  };
  const store = new IssuerStore(fetcher, { now: () => now, defaultMaxAgeMs: 1000 });

  const first = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
  now = 999;
  const cached = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
  now = 1001;
  const refreshed = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });

  assert.equal(first.primary.version, '1.0.0');
  assert.equal(cached.primary.version, '1.0.0');
  assert.equal(refreshed.primary.version, '1.0.1');
  assert.equal(calls, 2);
});

test('IssuerStore does not cache no-store entries', async () => {
  const v1 = mkIssuer({ url: 'L', version: '1.0.0' });
  const v2 = mkIssuer({ url: 'L', version: '1.0.1' });
  let calls = 0;
  const fetcher = {
    async fetch() {
      calls += 1;
      const issuer = calls === 1 ? v1 : v2;
      return {
        issuer,
        rawBytes: new TextEncoder().encode(JSON.stringify(issuer)),
        cacheControl: 'no-store',
      };
    },
  };
  const store = new IssuerStore(fetcher);

  const first = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
  const second = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });

  assert.equal(first.primary.version, '1.0.0');
  assert.equal(second.primary.version, '1.0.1');
  assert.equal(calls, 2);
});

test('IssuerStore revalidates expired ETag entries and keeps cached issuer on 304', async () => {
  const v1 = mkIssuer({ url: 'L', version: '1.0.0' });
  const seenOptions = [];
  let now = 0;
  let calls = 0;
  const fetcher = {
    async fetch(_url, options) {
      seenOptions.push(options);
      calls += 1;
      if (calls === 1) {
        return {
          issuer: v1,
          rawBytes: new TextEncoder().encode(JSON.stringify(v1)),
          etag: '"v1"',
          cacheControl: 'max-age=0',
        };
      }
      return { notModified: true, etag: '"v1"', cacheControl: 'max-age=60' };
    },
  };
  const store = new IssuerStore(fetcher, { now: () => now });

  const first = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
  now = 1;
  const second = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
  now = 59_000;
  const cached = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });

  assert.equal(first.primary.version, '1.0.0');
  assert.equal(second.primary.version, '1.0.0');
  assert.equal(cached.primary.version, '1.0.0');
  assert.deepEqual(seenOptions, [undefined, { ifNoneMatch: '"v1"' }]);
  assert.equal(calls, 2);
});

test('IssuerStore invalidates cache when requested', async () => {
  const v1 = mkIssuer({ url: 'L', version: '1.0.0' });
  const v2 = mkIssuer({ url: 'L', version: '1.0.1' });
  let served = v1;
  const fetcher = {
    async fetch() {
      return { issuer: served, rawBytes: new TextEncoder().encode(JSON.stringify(served)) };
    },
  };
  const store = new IssuerStore(fetcher);

  const first = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });
  served = v2;
  store.invalidate('L');
  const second = await store.resolve({ definitionIssuer: { kind: 'url', url: 'L' } });

  assert.equal(first.primary.version, '1.0.0');
  assert.equal(second.primary.version, '1.0.1');
});
