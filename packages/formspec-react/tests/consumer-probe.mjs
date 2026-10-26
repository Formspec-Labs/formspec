/** @filedesc Node consumer probe: loads @formspec-org/react by name via require or import and renders. */
// Shared by tests/cjs-smoke.test.ts (workspace) and scripts/test-packed.mjs (installed tarballs).
// Renders the markdown path only: it needs no engine WASM.
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

export const PROBES = {
    require: ['-e', `const { createElement } = require('react');
const { renderToString } = require('react-dom/server');
const m = require('@formspec-org/react');
const hooks = require('@formspec-org/react/hooks');
const sc = require('@formspec-org/react/semantic-controls');
if (!require.resolve('@formspec-org/react').endsWith('index.cjs')) throw new Error('require condition not used');
${RENDER}`],
    import: ['--input-type=module', '-e', `const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const m = await import('@formspec-org/react');
const hooks = await import('@formspec-org/react/hooks');
const sc = await import('@formspec-org/react/semantic-controls');
if (!import.meta.resolve('@formspec-org/react').endsWith('index.js')) throw new Error('import condition not used');
${RENDER}`],
};

export const EXPECTED = {
    html: '<div><strong>ok</strong> &lt;script&gt;x&lt;/script&gt;</div>',
    root: ['function', 'function', 'function'],
    hooks: 'function',
    sc: 'function',
};
