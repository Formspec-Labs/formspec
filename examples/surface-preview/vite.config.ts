/** @filedesc Build the reusable static entry with a data directory or the stack's synthetic examples. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const assets = process.env.FORMSPEC_PREVIEW_ASSETS;
const examples = [
  ['passport', 'passport-renewal-governance/applicant.surface.bundle.json'],
  ['service-request', 'service-request-intake/surface.bundle.json'],
];

export default defineConfig({
  root: import.meta.dirname, base: './', publicDir: assets ? resolve(assets) : false,
  build: { target: 'esnext' },
  plugins: assets ? [] : [{
    name: 'synthetic-preview-inputs',
    async generateBundle() {
      const editions = [];
      for (const [scope, file] of examples) {
        const bundle = `${scope}.bundle.json`;
        const path = resolve(import.meta.dirname, '../../../tools/deployment-tools/examples/packages', file);
        this.emitFile({ type: 'asset', fileName: bundle, source: await readFile(path) });
        editions.push({ scope, bundle });
      }
      this.emitFile({ type: 'asset', fileName: 'preview.json', source: JSON.stringify({ editions }) });
    },
  }],
});
