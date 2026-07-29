import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import {
  SURFACE_BUNDLE_SIGNING_DOMAIN,
  buildSurfaceBundlePreimage,
  parseSurfaceBundleCandidate,
} from '../src/index.js';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const SCHEMA_PATH = resolve(
  REPO_ROOT,
  'schemas/surface-bundle-signing-v1.schema.json',
);
const SPEC_PATH = resolve(
  REPO_ROOT,
  'specs/bundle/surface-bundle-signing-profile.md',
);

function validArtifact(): Record<string, unknown> {
  return {
    signedPayload: {
      profile: 'formspec-surface-bundle-signing-v1',
      publisher: { id: 'https://publisher.example/' },
      release: { id: '2026-07-28.1', sequence: 42 },
      manifest: {
        id: 'https://example.gov/apps/intake',
        $formspecApp: '2.4',
      },
      documents: {
        'https://example.gov/surfaces/intake': {
          $formspecSurface: '0.2',
        },
      },
    },
    signature: {
      format: 'COSE_Sign1',
      value: 'AQ',
    },
  };
}

describe('surface bundle signing schema', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const validate = ajv.compile(schema);

  it('accepts the closed profile shape', () => {
    expect(validate(validArtifact()), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each([
    ['JSON method selector', ['signature', 'methodUri'], METHOD_URI],
    ['raw public key', ['signature', 'rawPublicKey'], 'AQ'],
    ['unsigned signer name', ['signerName'], 'Replacement signer'],
    ['payload extension', ['signedPayload', 'signedAt'], '2026-07-28T00:00:00Z'],
  ])('rejects %s', (_label, path, value) => {
    const artifact = validArtifact();
    setPath(artifact, path as string[], value);
    expect(validate(artifact)).toBe(false);
  });
});

describe('profile parser and preimage', () => {
  it('rejects duplicate keys before JSON parsing', () => {
    const text = JSON.stringify(validArtifact()).replace(
      '"publisher":{"id":"https://publisher.example/"}',
      '"publisher":{"id":"https://publisher.example/","id":"https://attacker.example/"}',
    );
    expect(() =>
      parseSurfaceBundleCandidate(new TextEncoder().encode(text))
    ).toThrow(/duplicate object key/u);
  });

  it('pins domain, NUL separator, and RFC 8785 key order', () => {
    const payload = (validArtifact().signedPayload);
    const preimage = buildSurfaceBundlePreimage(payload);
    const separator = preimage.indexOf(0);
    expect(new TextDecoder().decode(preimage.slice(0, separator))).toBe(
      SURFACE_BUNDLE_SIGNING_DOMAIN,
    );
    expect(new TextDecoder().decode(preimage.slice(separator + 1))).toBe(
      '{"documents":{"https://example.gov/surfaces/intake":{"$formspecSurface":"0.2"}},"manifest":{"$formspecApp":"2.4","id":"https://example.gov/apps/intake"},"profile":"formspec-surface-bundle-signing-v1","publisher":{"id":"https://publisher.example/"},"release":{"id":"2026-07-28.1","sequence":42}}',
    );
  });

  it('rejects a lone Unicode surrogate before canonicalization', () => {
    const artifact = validArtifact();
    setPath(
      artifact,
      ['signedPayload', 'release', 'id'],
      String.fromCharCode(0xd800),
    );
    expect(() =>
      buildSurfaceBundlePreimage(artifact.signedPayload)
    ).toThrow(/lone Unicode surrogate/u);
  });
});

describe('normative specification pins', () => {
  const spec = readFileSync(SPEC_PATH, 'utf8');

  it.each([
    'formspec.surface-bundle.signed-payload.v1',
    'formspec.spike-v10.bundle-export.signed-payload.v1',
    'COSE_Sign1',
    'method_uri',
    'KeyRef.rawPublicKey',
    'verified',
    'admitted',
    'commitAdmitted',
    'signature-verification.json',
    'stage-4-signoff.authored-signature.json',
  ])('contains the normative pin %s', (pin) => {
    expect(spec).toContain(pin);
  });
});

const METHOD_URI = 'urn:formspec:sig-method:ed25519-cose-sign1@1';

function setPath(
  target: Record<string, unknown>,
  path: string[],
  value: unknown,
): void {
  const final = path.at(-1);
  if (!final) {
    throw new Error('path must not be empty');
  }
  let cursor: Record<string, unknown> = target;
  for (const segment of path.slice(0, -1)) {
    const next = cursor[segment];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      throw new Error(`path segment ${segment} is not an object`);
    }
    cursor = next as Record<string, unknown>;
  }
  cursor[final] = value;
}
