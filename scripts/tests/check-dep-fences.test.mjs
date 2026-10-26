/** @filedesc node:test coverage for the publish fence in scripts/check-dep-fences.mjs */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isRegistrySpec } from '../check-dep-fences.mjs';

describe('isRegistrySpec — a published runtime spec must resolve from the registry', () => {
  for (const spec of ['^0.1.1', '~2.1.0', '2.1.0', '>=1 <3', '1.x', '*', 'npm:@formspec-org/integrity-canonical@^0.1.1', 'npm:semver@7']) {
    it(`accepts ${spec}`, () => assert.equal(isRegistrySpec(spec), true));
  }
  for (const [kind, spec] of [
    ['file: path', 'file:../integrity-stack/packages/integrity-canonical'],
    ['link: path', 'link:../fel-core'],
    ['bare relative path', '../integrity-stack/packages/integrity-canonical'],
    ['bare absolute path', '/srv/packages/integrity-canonical'],
    ['home path', '~/packages/integrity-canonical'],
    ['git url', 'git+https://github.com/Formspec-Labs/integrity-stack.git#main'],
    ['git ssh', 'git@github.com:Formspec-Labs/integrity-stack.git'],
    ['github: shorthand', 'github:Formspec-Labs/integrity-stack'],
    ['owner/repo shorthand', 'Formspec-Labs/integrity-stack'],
    ['tarball url', 'https://registry.example/integrity-canonical-0.1.1.tgz'],
    ['tarball file', './integrity-canonical-0.1.1.tgz'],
    ['workspace protocol', 'workspace:*'],
    ['npm: alias to a non-range', 'npm:@formspec-org/integrity-canonical@github:Formspec-Labs/integrity-stack'],
  ]) {
    it(`rejects a ${kind}`, () => assert.equal(isRegistrySpec(spec), false));
  }
});
