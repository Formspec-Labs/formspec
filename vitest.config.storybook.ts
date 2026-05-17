/** @filedesc Vitest browser-mode config for Storybook visual regression tests. */
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = (name: string) => path.resolve(__dirname, 'packages', name, 'src');

export default defineConfig({
    resolve: {
        dedupe: [
            '@formspec-org/engine',
            '@formspec-org/layout',
            '@formspec-org/react',
            '@formspec-org/webcomponent',
        ],
        alias: [
            // Engine subpath exports — specific before general
            { find: '@formspec-org/engine/init-formspec-engine', replacement: `${pkg('formspec-engine')}/init-formspec-engine.ts` },
            { find: '@formspec-org/engine/render', replacement: `${pkg('formspec-engine')}/engine-render-entry.ts` },
            { find: '@formspec-org/engine/fel-runtime', replacement: `${pkg('formspec-engine')}/fel/fel-api-runtime.ts` },
            { find: '@formspec-org/engine/fel-tools', replacement: `${pkg('formspec-engine')}/fel/fel-api-tools.ts` },
            { find: '@formspec-org/engine', replacement: `${pkg('formspec-engine')}/index.ts` },
            // Layout
            { find: '@formspec-org/layout', replacement: `${pkg('formspec-layout')}/index.ts` },
            // React
            { find: '@formspec-org/react/hooks', replacement: `${pkg('formspec-react')}/hooks.ts` },
            { find: '@formspec-org/react', replacement: `${pkg('formspec-react')}/index.ts` },
            // Webcomponent — CSS subpaths before base
            { find: '@formspec-org/webcomponent/formspec-default.css', replacement: `${pkg('formspec-webcomponent')}/formspec-default.css` },
            { find: '@formspec-org/webcomponent/formspec-layout.css', replacement: `${pkg('formspec-webcomponent')}/formspec-layout.css` },
            { find: '@formspec-org/webcomponent', replacement: `${pkg('formspec-webcomponent')}/index.ts` },
            // Adapters — CSS subpath before base (dist artifact from build:css)
            {
                find: '@formspec-org/adapters/uswds-integration.css',
                replacement: path.resolve(__dirname, 'packages/formspec-adapters/dist/uswds-integration.css'),
            },
            { find: '@formspec-org/adapters', replacement: `${pkg('formspec-adapters')}/index.ts` },
        ],
    },
    server: {
        fs: { allow: [__dirname] },
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
    plugins: [
        storybookTest({ configDir: '.storybook' }),
    ],
    test: {
        name: 'storybook',
        browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
            screenshotFailures: false,
        },
        setupFiles: ['./.storybook/vitest.setup.ts'],
        reporters: ['default', './tests/storybook/manifest-reporter.ts'],
        outputFile: {
            json: 'test-results/storybook-crawl/vitest-results.json',
        },
    },
});
