/** @filedesc A plain Node consumer can require() and import() the package by name and render with react-dom/server (fs-oc8z). */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load by package name, so resolution goes through the exports map's
// require/import conditions, not a dist path. Runs in a fresh Node process:
// vitest's own loader would mask what a CommonJS (CRA/Jest-style) consumer sees.
const RENDER = `
const html = renderToString(createElement('div', {
  dangerouslySetInnerHTML: { __html: m.renderSanitizedMarkdown('**ok** <script>x</script>') },
}));
console.log(JSON.stringify({
  html,
  root: ['FormspecForm', 'FormspecProvider', 'useForm'].map((n) => typeof m[n]),
  hooks: typeof hooks.useSignal,
  sc: typeof sc.createSemanticControlRegistry,
}));`;

const SCRIPTS = {
    require: `const { createElement } = require('react');
const { renderToString } = require('react-dom/server');
const m = require('@formspec-org/react');
const hooks = require('@formspec-org/react/hooks');
const sc = require('@formspec-org/react/semantic-controls');
if (!require.resolve('@formspec-org/react').endsWith('index.cjs')) throw new Error('require condition not used');
${RENDER}`,
    import: `const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const m = await import('@formspec-org/react');
const hooks = await import('@formspec-org/react/hooks');
const sc = await import('@formspec-org/react/semantic-controls');
if (!import.meta.resolve('@formspec-org/react').endsWith('index.js')) throw new Error('import condition not used');
${RENDER}`,
};

describe.each(Object.entries(SCRIPTS))('%s() consumer of the built package', (kind, script) => {
    it('resolves every entry by name and renders', () => {
        const args = kind === 'import' ? ['--input-type=module', '-e', script] : ['-e', script];
        const out = JSON.parse(execFileSync(process.execPath, args, { cwd: pkgDir, encoding: 'utf8' }));
        expect(out.html).toBe('<div><strong>ok</strong> &lt;script&gt;x&lt;/script&gt;</div>');
        expect(out.root).toEqual(['function', 'function', 'function']);
        expect(out.hooks).toBe('function');
        expect(out.sc).toBe('function');
    });
});
