import { describe, expect, it } from 'vitest';
import type { Issuer, IssuerSource, ResolvedIssuer } from '../../src/issuer/types';

describe('Issuer types', () => {
  it('IssuerSource is a discriminated union', () => {
    const issuer = {
      $formspecIssuer: '1.0',
      url: 'https://example.org/issuer.json',
      version: '1.0.0',
      name: 'Example Issuer',
      kind: 'organization',
    } satisfies Issuer;
    const inline = { kind: 'inline', issuer } satisfies IssuerSource;
    const url = { kind: 'url', url: 'https://example.org/issuer.json' } satisfies IssuerSource;

    expect(inline.kind).toBe('inline');
    expect(url.kind).toBe('url');
  });

  it('ResolvedIssuer carries primary, chain, and source', () => {
    const issuer = {
      $formspecIssuer: '1.0',
      url: 'https://example.org/issuer.json',
      version: '1.0.0',
      name: { en: 'Example Issuer' },
      kind: 'organization',
    } satisfies Issuer;
    const resolved = {
      primary: issuer,
      chain: [issuer],
      source: 'definition',
    } satisfies ResolvedIssuer;

    expect(resolved.primary.url).toBe('https://example.org/issuer.json');
    expect(resolved.source).toBe('definition');
  });
});
