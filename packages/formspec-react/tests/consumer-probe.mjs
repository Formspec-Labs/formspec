/** @filedesc Node consumer probe: loads @formspec-org/react by name via require or import and renders. */
// Shared by tests/cjs-smoke.test.ts (workspace) and scripts/test-packed.mjs (installed tarballs).
// Checks every subpath re-export is the root's own binding (one React context per
// format), then renders the root FormspecProvider around a `/hooks` hook, which
// loads the engine WASM, plus the sanitized-markdown path.
const BODY = `
const split = (sub) => Object.keys(sub).filter((n) => n in m && sub[n] !== m[n]);
await engine.initFormspecEngine();
const definition = { $formspec: '1.0', url: 'urn:probe', version: '1.0.0', title: 'Probe title',
  items: [{ key: 'a', type: 'field', dataType: 'string', label: 'A' }] };
function Title() { return createElement('h1', null, hooks.useForm().title); }
const html = renderToString(createElement(m.FormspecProvider, { definition },
  createElement(Title),
  createElement('div', { dangerouslySetInnerHTML: { __html: m.renderSanitizedMarkdown('**ok** <script>x</script>') } })));
const exact = JSON.stringify(engine.parseJsonNumber('1234567890123456789'));
console.log(JSON.stringify({ html, exact, split: [...split(hooks), ...split(sc)], sc: typeof sc.createSemanticControlRegistry }));`;

export const PROBES = {
    require: ['-e', `(async () => {
const { createElement } = require('react');
const { renderToString } = require('react-dom/server');
const engine = require('@formspec-org/engine');
const m = require('@formspec-org/react');
const hooks = require('@formspec-org/react/hooks');
const sc = require('@formspec-org/react/semantic-controls');
if (!require.resolve('@formspec-org/react').endsWith('index.cjs')) throw new Error('require condition not used');
${BODY}
})().catch((e) => { console.error(e); process.exit(1); });`],
    import: ['--input-type=module', '-e', `const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const engine = await import('@formspec-org/engine');
const m = await import('@formspec-org/react');
const hooks = await import('@formspec-org/react/hooks');
const sc = await import('@formspec-org/react/semantic-controls');
if (!import.meta.resolve('@formspec-org/react').endsWith('index.js')) throw new Error('import condition not used');
${BODY}`],
};

export const EXPECTED = {
    html: '<div class="formspec-theme-scope" style="display:contents"><h1>Probe title</h1>'
        + '<div><strong>ok</strong> &lt;script&gt;x&lt;/script&gt;</div></div>',
    exact: '1234567890123456789',
    split: [],
    sc: 'function',
};
