/** @filedesc node:test coverage for scripts/generate-ts-api-markdown.mjs package table paths */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { API_MARKDOWN_PACKAGES, STUDIO_ROOT } from '../generate-ts-api-markdown.mjs';

describe('API_MARKDOWN_PACKAGES', () => {
  it('points every package at a directory that exists in its owning repo', (t) => {
    const studioCheckedOut = existsSync(STUDIO_ROOT);
    for (const pkg of API_MARKDOWN_PACKAGES) {
      if (pkg.root === STUDIO_ROOT && !studioCheckedOut) {
        t.diagnostic(`skipped ${pkg.name}: formspec-studio not checked out at ${STUDIO_ROOT}`);
        continue;
      }
      const packageJson = resolve(pkg.root, pkg.dir, 'package.json');
      assert.ok(existsSync(packageJson), `${pkg.name}: no package at ${packageJson}`);
    }
  });

  it('documents the Forms MCP and studio-core from formspec-studio', () => {
    for (const dir of ['packages/formspec-mcp', 'packages/formspec-studio-core']) {
      const pkg = API_MARKDOWN_PACKAGES.find((entry) => entry.dir === dir);
      assert.ok(pkg, `${dir} missing from the package table`);
      assert.equal(pkg.root, STUDIO_ROOT, `${dir} lives in formspec-studio`);
    }
  });
});
