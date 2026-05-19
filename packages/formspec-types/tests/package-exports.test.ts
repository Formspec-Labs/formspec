import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(here, '../package.json');

function readPackageJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(packageJsonPath, 'utf8')) as Record<string, unknown>;
}

describe('package export boundary', () => {
  it('publishes only the package root', () => {
    const pkg = readPackageJson();

    expect(pkg.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        default: './dist/index.js',
      },
    });
    expect(pkg.sideEffects).toBe(false);
  });
});
