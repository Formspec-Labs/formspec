import type { StorybookConfig } from '@storybook/react-vite';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Connect, Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pkg = (name: string) => path.resolve(repoRoot, 'packages', name, 'src');

/**
 * Vite rewrites JSON imports under /examples/... to URLs like
 * `/examples/foo.json?import`. The dev static handler then serves raw
 * `application/json`, so the browser rejects them as ES modules ("Failed to fetch
 * dynamically imported module"). Serve validated JSON as `export default` JS.
 */
function examplesJsonAsEsmPlugin(root: string): Plugin {
    const examplesRoot = path.resolve(root, 'examples');
    const handler: Connect.NextHandleFunction = (req, res, next) => {
        const url = req.url;
        if (!url) return next();
        const q = url.indexOf('?');
        const pathname = q >= 0 ? url.slice(0, q) : url;
        const search = q >= 0 ? url.slice(q) : '';
        if (!pathname.endsWith('.json') || !pathname.startsWith('/examples/')) return next();
        if (!search.includes('import')) return next();
        const abs = path.resolve(root, pathname.slice(1));
        if (!abs.startsWith(examplesRoot)) return next();
        fs.readFile(abs, 'utf8', (err, content) => {
            if (err) return next();
            try {
                const parsed = JSON.parse(content) as unknown;
                const body = `export default ${JSON.stringify(parsed)};\n`;
                res.setHeader('Content-Type', 'text/javascript');
                res.setHeader('Cache-Control', 'no-cache');
                res.end(body);
            } catch {
                next();
            }
        });
    };
    return {
        name: 'formspec-examples-json-esm',
        configureServer(server) {
            const stack = server.middlewares.stack as { route: string; handle: Connect.NextHandleFunction }[];
            stack.unshift({ route: '', handle: handler });
        },
    };
}

const config: StorybookConfig = {
    stories: ['../stories/**/*.stories.@(ts|tsx)'],
    addons: ['@storybook/addon-vitest'],
    staticDirs: [
        { from: '../node_modules/@uswds/uswds/dist/img', to: '/img' },
        { from: '../node_modules/@uswds/uswds/packages/uswds-core/src/assets/fonts', to: '/fonts' },
    ],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    viteFinal: async (config) => {
        config.resolve = config.resolve || {};
        config.resolve.dedupe = [
            ...(config.resolve.dedupe ?? []),
            '@formspec-org/engine',
            '@formspec-org/layout',
            '@formspec-org/react',
            '@formspec-org/webcomponent',
        ];
        config.resolve.alias = [
            ...(Array.isArray(config.resolve.alias) ? config.resolve.alias : []),
            // Engine subpath exports — specific before general
            { find: '@formspec-org/engine/init-formspec-engine', replacement: `${pkg('formspec-engine')}/init-formspec-engine.ts` },
            { find: '@formspec-org/engine/render', replacement: `${pkg('formspec-engine')}/engine-render-entry.ts` },
            { find: '@formspec-org/engine/fel-runtime', replacement: `${pkg('formspec-engine')}/fel/fel-api-runtime.ts` },
            { find: '@formspec-org/engine/fel-tools', replacement: `${pkg('formspec-engine')}/fel/fel-api-tools.ts` },
            { find: '@formspec-org/engine', replacement: `${pkg('formspec-engine')}/index.ts` },
            // Layout
            { find: '@formspec-org/layout', replacement: `${pkg('formspec-layout')}/index.ts` },
            // React — subpath before base
            { find: '@formspec-org/react/hooks', replacement: `${pkg('formspec-react')}/hooks.ts` },
            { find: '@formspec-org/react', replacement: `${pkg('formspec-react')}/index.ts` },
            // Webcomponent — CSS subpaths before base
            { find: '@formspec-org/webcomponent/formspec-default.css', replacement: `${pkg('formspec-webcomponent')}/formspec-default.css` },
            { find: '@formspec-org/webcomponent/formspec-layout.css', replacement: `${pkg('formspec-webcomponent')}/formspec-layout.css` },
            { find: '@formspec-org/webcomponent', replacement: `${pkg('formspec-webcomponent')}/index.ts` },
            // Adapters — CSS subpath before base (dist artifact from build:css)
            {
                find: '@formspec-org/adapters/uswds-integration.css',
                replacement: `${pkg('formspec-adapters')}/../dist/uswds-integration.css`,
            },
            { find: '@formspec-org/adapters', replacement: `${pkg('formspec-adapters')}/index.ts` },
        ];

        // Allow importing from anywhere in the monorepo
        config.server = config.server || {};
        config.server.fs = config.server.fs || {};
        config.server.fs.allow = [repoRoot];

        // React 19 CJS interop — ensure default import works in ESM
        config.optimizeDeps = config.optimizeDeps || {};
        config.optimizeDeps.include = [
            ...(config.optimizeDeps.include || []),
            'react',
            'react-dom',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
        ];

        config.plugins = [examplesJsonAsEsmPlugin(repoRoot), ...(config.plugins ?? [])];

        return config;
    },
};

export default config;
